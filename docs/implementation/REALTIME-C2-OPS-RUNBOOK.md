# REALTIME C2 — Ops Runbook (ส่วนที่พี่ต้องทำเอง)

> ⚠️ **ลำดับสำคัญ (blueprint §33):** ห้ามรัน migration/เปิด RLS **ก่อน** FE (C2) wired + ทดสอบ · ห้ามลบ legacy path ก่อน rollout ผ่าน · SQL ด้านล่าง = **DRAFT ให้รีวิว** ยังไม่ต้องรันจนกว่าจะถึงเฟสนั้น. Claude รันแทนไม่ได้ (แตะ credential/prod ไม่ได้).

---

## Item 1 — Migration DRAFT (รันเมื่อ FE C2 wired เท่านั้น)

### 1A · Outbox + Broadcast (§7/§8) — `_C2.3-domain-events.sql`
> ⚠️ ตรวจ signature `realtime.send`/`realtime.broadcast_changes` ของ Supabase project ปัจจุบันก่อน (เวอร์ชันต่างกัน param ต่าง) · trigger นี้จะยิง broadcast ทุก order write — รันเมื่อมี client subscribe topic แล้วเท่านั้น (ไม่งั้นยิงเปล่า+DB load)

```sql
begin;
-- outbox (§7.1) — เก็บ domain event คู่กับ transaction (กัน event หายถ้า write rollback)
create table if not exists public.tmk_domain_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null, schema_version int not null default 1,
  entity_type text not null, entity_id text not null, topic text not null,
  entity_version bigint, changed_fields text[] not null default '{}',
  payload jsonb not null default '{}'::jsonb, actor_id uuid, idempotency_key text,
  occurred_at timestamptz not null default now(), published_at timestamptz,
  publish_attempts int not null default 0, last_publish_error text
);
create unique index if not exists tmk_domain_events_idem_uk on public.tmk_domain_events(idempotency_key) where idempotency_key is not null;
create index if not exists tmk_domain_events_unpublished_idx on public.tmk_domain_events(occurred_at) where published_at is null;
create index if not exists tmk_domain_events_topic_idx on public.tmk_domain_events(topic, occurred_at desc);

-- helper: field ที่เปลี่ยน (§8) — sanitized (ห้ามส่ง PII/ต้นทุน)
create or replace function public.tmk_jsonb_changed_keys(a jsonb, b jsonb)
returns text[] language sql immutable as $$
  select coalesce(array_agg(k), '{}') from (
    select key k from jsonb_each(coalesce(b,'{}'::jsonb))
    where coalesce(a->>key,'') is distinct from coalesce(b->>key,'')
  ) t;
$$;
-- payload public เฉพาะ field ที่ UI ใช้ (allowlist · ไม่มี cost/profit/PII เกินสิทธิ์)
create or replace function public.tmk_order_public_patch(o jsonb, n jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'status', n->>'status', 'sales', n->'sales', 'qty', n->'qty',
    'paid_amount', n->'paid_amount', 'channel', n->>'channel', 'updated_at', n->>'updated_at'
  );
$$;

-- trigger broadcast (§8) — scoped topic orders:month:<YYYY-MM> · เฉพาะ field สำคัญเปลี่ยน (§7.3)
create or replace function public.tmk_broadcast_order_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_topic text; v_event text; v_new jsonb := to_jsonb(new); v_old jsonb := to_jsonb(old);
begin
  -- ข้ามถ้าเปลี่ยนแค่ updated_at/row_version (housekeeping)
  if tg_op='UPDATE' and (v_new - 'updated_at' - 'row_version') is not distinct from (v_old - 'updated_at' - 'row_version') then
    return new;
  end if;
  v_topic := 'orders:month:' || to_char(coalesce(new.order_date, old.order_date)::date, 'YYYY-MM');
  v_event := case tg_op when 'INSERT' then 'order.created' when 'DELETE' then 'order.deleted' else 'order.updated' end;
  perform realtime.send(
    jsonb_build_object('event_id', gen_random_uuid(), 'event_type', v_event, 'schema_version', 1,
      'entity_type','order', 'entity_id', coalesce(new.order_no, old.order_no),
      'entity_version', coalesce(new.row_version, old.row_version),
      'changed_fields', public.tmk_jsonb_changed_keys(v_old, v_new),
      'patch', public.tmk_order_public_patch(v_old, v_new), 'occurred_at', now()),
    v_event, v_topic, true);  -- ⚠️ param order ตาม Supabase version — ตรวจก่อน
  return coalesce(new, old);
end; $$;
-- ผูก trigger (idempotent) — เปิดเมื่อ FE subscribe topic แล้ว
drop trigger if exists tmk_mp_orders_broadcast on public.tmk_mp_orders;
create trigger tmk_mp_orders_broadcast after insert or update or delete on public.tmk_mp_orders
  for each row execute function public.tmk_broadcast_order_event();
commit;

-- VERIFY
select 'outbox table' c, count(*)::text r from information_schema.tables where table_name='tmk_domain_events'
union all select 'broadcast trigger', count(*)::text from pg_trigger where tgname='tmk_mp_orders_broadcast' and not tgisinternal;

-- ROLLBACK (ถ้าต้องถอย)
-- begin;
--   drop trigger if exists tmk_mp_orders_broadcast on public.tmk_mp_orders;
--   drop function if exists public.tmk_broadcast_order_event();
--   drop function if exists public.tmk_order_public_patch(jsonb,jsonb);
--   drop function if exists public.tmk_jsonb_changed_keys(jsonb,jsonb);
--   drop table if exists public.tmk_domain_events;
-- commit;
```

### 1B · Realtime Authorization RLS (§19) — ⚠️ เสี่ยงสุด
> เปิด **หลัง** FE ใช้ private channel + ทดสอบใน staging · RLS ผิด = client รับ event ไม่ได้ (realtime เงียบ). เริ่มจาก policy กว้าง (authenticated ทั้งหมด) แล้วค่อยแคบตาม team/role.

```sql
-- ต้องเปิด "Realtime Authorization" ใน Dashboard ก่อน (ดู Item 2)
-- index บนตารางที่ policy ใช้ (กัน policy query ช้า)
alter table realtime.messages enable row level security;  -- ปกติเปิดอยู่แล้ว
create policy "auth read scoped" on realtime.messages for select to authenticated
  using ( true );   -- ⚠️ v1: กว้าง · v2 แคบ: public.tmk_can_access_realtime_topic(auth.uid(), realtime.topic())
create policy "auth send scoped" on realtime.messages for insert to authenticated
  with check ( realtime.topic() like 'orders:%' or realtime.topic() like 'user:'||auth.uid()::text );
-- ROLLBACK: drop policy ทั้ง 2 → กลับ public channel เดิม
```

### 1C · CRM summary (§17/§24.5) — `_C2.4-crm-summary.sql`
> รันเมื่อ saleCrm อ่านจาก summary แทน `cachedFetchAll('tmk_mp_orders')` · มี reconciliation ตรวจกับ source

```sql
begin;
create table if not exists public.tmk_customer_crm_summary (
  customer_code text primary key,
  order_count int not null default 0, total_sales numeric not null default 0,
  first_order_at timestamptz, last_order_at timestamptz, updated_at timestamptz not null default now()
);
-- refresh 1 customer (เรียกจาก trigger บน tmk_mp_orders · เฉพาะ status active · ตัด masked)
create or replace function public.tmk_refresh_crm_summary(p_code text)
returns void language sql security definer set search_path = public as $$
  insert into public.tmk_customer_crm_summary as s (customer_code, order_count, total_sales, first_order_at, last_order_at, updated_at)
  select o.customer_code, count(*), coalesce(sum(o.sales),0), min(o.created_at), max(o.created_at), now()
  from public.tmk_mp_orders o
  where o.customer_code = p_code and coalesce(o.status,'active') <> 'cancelled'
  group by o.customer_code
  on conflict (customer_code) do update set
    order_count=excluded.order_count, total_sales=excluded.total_sales,
    first_order_at=excluded.first_order_at, last_order_at=excluded.last_order_at, updated_at=now();
$$;
-- reconciliation (cron/manual): rebuild ทั้งตาราง — ตรวจ mismatch กับ source
-- select count(*) from tmk_customer_crm_summary s join (...) src using(customer_code) where s.total_sales <> src.total_sales;
commit;
-- ROLLBACK: drop function + table
```

**⚠️ ตัดสินก่อนรัน 1C:** นับเฉพาะ status active? · dedupe มาร์เก็ตเพลส? · masked customer_code ตัดออก? (ต้องตรงกับ logic saleCrm เดิม — ผมช่วยเทียบตอน wire)

---

## Item 2 — เปิด Realtime Authorization + private channels (Supabase Dashboard)
1. Dashboard → Project → **Realtime** → เปิด **"Realtime Authorization"** (private channels)
2. FE (ตอน C2 wire) เปลี่ยน `supabase.channel(topic)` → `supabase.channel(topic, { config: { private: true } })`
3. รัน 1B (realtime.messages RLS) — เริ่ม policy กว้างใน staging → curl/2-tab เทสว่ารับ event ได้ → ค่อยแคบ
4. ตรวจ **Realtime Reports** (Dashboard) ว่า messages ไหลถูก topic

## Item 3 — ทดสอบ 2 users (staging · ก่อน rollout)
- **Conflict (§27.4-D · มีของพร้อมแล้ว):** 2 tab เปิด order เดียว · tab A แก้ยอด+save · tab B แก้ยอด+save → ต้องเห็น **conflict merge dialog** (field-level · ไม่ทับเงียบ) · ยืนยัน DB row_version +1 ครั้งเดียว
- **Presence:** เปิด presence_v2 flag · 2 user เข้าคนละหน้า → เห็น online + section ของกันและกัน · ปิด tab → หายภายใน ~ONLINE window
- **Scoped event:** user A เปิด orders เดือน 2026-07 · user B แก้ order เดือน 2026-06 → **A ไม่ควรได้ event** (คนละ topic) · วัดด้วย `window.__rtDiag.snapshot()` (event count ต่อ topic)

## Item 4 — Load test 200 conn / 50 writes/นาที (§27)
- Tool: **k6** (`k6 run`) หรือ artillery · target = Supabase Realtime WS endpoint (`wss://<ref>.supabase.co/realtime/v1`)
- Scenario A: ramp 25 users/นาที → 200 concurrent · 3 channels/user · 60 นาที · Pass: connect ≥99.9% · P95 subscribe <3s · memory นิ่ง
- Scenario B: 50 writes/นาที (order/task/CRM mix) · Pass: P95 event <1.5s · no full refetch · duplicate-safe
- วัดผ่าน **Supabase Realtime Reports** (connection/messages/sec) + `rtDiag` (client) + DB CPU
- ตรวจ **plan limits** (concurrent connections / messages-per-sec / channels-per-connection) ของ plan ปัจจุบันก่อน — อาจต้องอัป plan

## Item 5 — คุม rollout ด้วย featureFlags (§26 · flag พร้อมแล้ว)
- flag: `src/realtime/featureFlags.js` · เปิดผ่าน env `VITE_FLAG_realtime_v2_enabled=true` (deploy) หรือ `window.__flags` (ทดสอบเฉพาะเครื่อง)
- ลำดับ: **admin 5 คน → 5% → 20% → 50% → 100%** · แต่ละขั้นดู error rate / event latency / duplicate / query reduction / DB CPU / support incidents (§29 dashboard)
- **Rollback:** ปิด flag → กลับ legacy path ทันที (ไม่ต้อง rollback schema) · schema (outbox/summary) ทิ้งไว้ได้ (additive)

---

## สรุปลำดับปลอดภัย (อย่าข้าม)
1. FE C2 wire (entity store→dataContext · scoped sub) หลัง flag OFF → build+vitest เขียว → deploy
2. รัน 1A outbox+broadcast (staging) → เปิด flag เฉพาะ admin → 2-user เทส (Item 3)
3. Item 2 (Realtime Auth) + 1B RLS (staging) → เทสรับ event
4. 1C CRM summary → wire saleCrm อ่าน summary → reconciliation ผ่าน
5. Load test (Item 4) ผ่าน → rollout % (Item 5)
6. Phase 6: ลบ legacy (global channel/reloadKey/heartbeat) **เมื่อ metrics ยืนยันเท่านั้น**
