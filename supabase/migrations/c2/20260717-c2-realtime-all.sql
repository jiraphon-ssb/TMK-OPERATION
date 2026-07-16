-- ============================================================================
-- 20260717-c2-realtime-all.sql — REALTIME C2 รวมทุก migration (§7/§8/§17/§19)
-- ============================================================================
-- รวม 3 ส่วนไว้ไฟล์เดียว · แต่ละส่วน begin/commit แยก → รันทั้งไฟล์ หรือคอมเมนต์ข้ามทีละส่วนได้
--   [1A] outbox + broadcast trigger (§7/§8)
--   [1B] realtime.messages RLS / private channel (§19)  ← 🔴 เสี่ยงสุด
--   [1C] CRM summary table (§17)
--
-- 🔴 อ่านก่อนรัน (docs/implementation/REALTIME-C2-OPS-RUNBOOK.md):
--   • รัน "หลัง" FE C2 wired เท่านั้น (subscribe topic + private channel) — ไม่งั้น trigger ยิงเปล่า / RLS ทำ realtime เงียบ
--   • ⚠️ ตรวจ signature realtime.send() ของ Supabase project ปัจจุบันก่อน (param ต่างตามเวอร์ชัน)
--   • [1B] เปิด "Realtime Authorization" ใน Dashboard ก่อน + ทดสอบ staging ก่อน prod
--   • [1C] ตัดสินก่อน: นับเฉพาะ active? · dedupe มาร์เก็ตเพลส? · masked ตัดออก? (ให้ตรง logic saleCrm)
-- ทุกส่วน ADDITIVE + มี VERIFY + ROLLBACK ท้ายไฟล์
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ [1A] OUTBOX + BROADCAST (§7/§8)                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
begin;

-- §7.1 Transactional outbox (เก็บ domain event คู่ transaction · กัน event หายถ้า rollback)
create table if not exists public.tmk_domain_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  schema_version int not null default 1,
  entity_type text not null,
  entity_id text not null,
  topic text not null,
  entity_version bigint,
  changed_fields text[] not null default '{}',
  payload jsonb not null default '{}'::jsonb,
  actor_id uuid,
  idempotency_key text,
  occurred_at timestamptz not null default now(),
  published_at timestamptz,
  publish_attempts int not null default 0,
  last_publish_error text
);
create unique index if not exists tmk_domain_events_idem_uk
  on public.tmk_domain_events(idempotency_key) where idempotency_key is not null;
create index if not exists tmk_domain_events_unpublished_idx
  on public.tmk_domain_events(occurred_at) where published_at is null;
create index if not exists tmk_domain_events_topic_idx
  on public.tmk_domain_events(topic, occurred_at desc);

-- §8 helper: key ที่เปลี่ยนจริง (changed_fields) — dollar-tag เฉพาะ + language ท้าย (ทน parser)
create or replace function public.tmk_jsonb_changed_keys(a jsonb, b jsonb)
returns text[] as $ck$
  select coalesce(array_agg(k), '{}') from (
    select key k from jsonb_each(coalesce(b, '{}'::jsonb))
    where coalesce(a->>key, '') is distinct from coalesce(b->>key, '')
  ) t;
$ck$ language sql immutable;

-- §5.2 payload public = allowlist เฉพาะ field ที่ UI ใช้ (ห้ามส่ง cost/profit/PII)
create or replace function public.tmk_order_public_patch(o jsonb, n jsonb)
returns jsonb as $pp$
  select jsonb_build_object(
    'status',      n->>'status',
    'sales',       n->'sales',
    'qty',         n->'qty',
    'paid_amount', n->'paid_amount',
    'channel',     n->>'channel',
    'updated_at',  n->>'updated_at'
  );
$pp$ language sql immutable;

-- §8 trigger: broadcast domain event ต่อ scoped topic orders:month:<YYYY-MM>
create or replace function public.tmk_broadcast_order_event()
returns trigger as $bc$
declare
  v_topic text; v_event text;
  v_new jsonb := to_jsonb(new); v_old jsonb := to_jsonb(old);
begin
  -- §7.3 ข้ามถ้าเปลี่ยนแค่ housekeeping (updated_at/row_version)
  if tg_op = 'UPDATE'
     and (v_new - 'updated_at' - 'row_version') is not distinct from (v_old - 'updated_at' - 'row_version') then
    return new;
  end if;
  v_topic := 'orders:month:' || to_char(coalesce(new.order_date, old.order_date)::date, 'YYYY-MM');
  v_event := case tg_op
    when 'INSERT' then 'order.created'
    when 'DELETE' then 'order.deleted'
    else 'order.updated' end;
  -- ⚠️ ตรวจ signature ก่อน: realtime.send(payload jsonb, event text, topic text, private boolean)
  perform realtime.send(
    jsonb_build_object(
      'event_id', gen_random_uuid(), 'event_type', v_event, 'schema_version', 1,
      'entity_type', 'order', 'entity_id', coalesce(new.order_no, old.order_no),
      'entity_version', coalesce(new.row_version, old.row_version),
      'changed_fields', public.tmk_jsonb_changed_keys(v_old, v_new),
      'patch', public.tmk_order_public_patch(v_old, v_new),
      'occurred_at', now()
    ),
    v_event, v_topic, true
  );
  return coalesce(new, old);
end;
$bc$ language plpgsql security definer set search_path = public;

drop trigger if exists tmk_mp_orders_broadcast on public.tmk_mp_orders;
create trigger tmk_mp_orders_broadcast
  after insert or update or delete on public.tmk_mp_orders
  for each row execute function public.tmk_broadcast_order_event();

commit;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ [1B] REALTIME AUTHORIZATION / PRIVATE CHANNEL RLS (§19)  🔴 เสี่ยงสุด      ║
-- ║ เปิด "Realtime Authorization" ใน Dashboard + staging ก่อน · FE ต้อง private:true ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- ⚠️ อย่ารัน `alter table realtime.messages enable row level security;` — ตารางนี้เป็นของ
--    role supabase_realtime_admin (เราไม่ใช่ owner → ERROR 42501) · RLS เปิดอัตโนมัติอยู่แล้ว
--    เมื่อเปิด "Realtime Authorization" ใน Dashboard → แค่ create policy ด้านล่างพอ

-- v1: policy กว้าง (พิสูจน์ว่า realtime ไม่พังก่อน แล้วค่อยแคบเป็น v2 ใน RUNBOOK)
drop policy if exists "tmk auth read scoped" on realtime.messages;
create policy "tmk auth read scoped" on realtime.messages
  for select to authenticated
  using ( true );

drop policy if exists "tmk auth send scoped" on realtime.messages;
create policy "tmk auth send scoped" on realtime.messages
  for insert to authenticated
  with check (
    realtime.topic() like 'orders:%'
    or realtime.topic() like 'sales:%'
    or realtime.topic() like 'user:' || auth.uid()::text
  );


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ [1C] CRM SUMMARY TABLE (§17)                                              ║
-- ║ ⚠️ ตัดสิน aggregate ก่อน: active only? dedupe มาร์เก็ตเพลส? masked ตัดออก? ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
begin;

create table if not exists public.tmk_customer_crm_summary (
  customer_code text primary key,
  order_count int not null default 0,
  total_sales numeric not null default 0,
  first_order_at timestamptz,
  last_order_at timestamptz,
  updated_at timestamptz not null default now()
);

-- refresh สรุปของ 1 customer (เรียกจาก trigger บน tmk_mp_orders · เฉพาะ status ≠ cancelled)
create or replace function public.tmk_refresh_crm_summary(p_code text)
returns void as $crm$
  insert into public.tmk_customer_crm_summary as s
    (customer_code, order_count, total_sales, first_order_at, last_order_at, updated_at)
  select o.customer_code, count(*), coalesce(sum(o.sales), 0), min(o.created_at), max(o.created_at), now()
  from public.tmk_mp_orders o
  where o.customer_code = p_code and coalesce(o.status, 'active') <> 'cancelled'
  group by o.customer_code
  on conflict (customer_code) do update set
    order_count = excluded.order_count, total_sales = excluded.total_sales,
    first_order_at = excluded.first_order_at, last_order_at = excluded.last_order_at, updated_at = now();
$crm$ language sql security definer set search_path = public;

commit;


-- ============================================================================
-- VERIFY (รันแยกหลังทั้ง 3 ส่วน · ทุกบรรทัดต้อง ✅)
-- ============================================================================
select 'outbox table' as check_item, count(*)::text as result, case when count(*)=1 then '✅' else '❌' end as status
  from information_schema.tables where table_schema='public' and table_name='tmk_domain_events'
union all
select 'broadcast trigger', count(*)::text, case when count(*)=1 then '✅' else '❌' end
  from pg_trigger where tgname='tmk_mp_orders_broadcast' and not tgisinternal
union all
select 'helper fns (=3)', count(*)::text, case when count(*)=3 then '✅' else '❌' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('tmk_jsonb_changed_keys','tmk_order_public_patch','tmk_broadcast_order_event')
union all
select 'realtime RLS policies (≥2)', count(*)::text, case when count(*)>=2 then '✅' else '❌' end
  from pg_policies where schemaname='realtime' and tablename='messages' and policyname like 'tmk auth%'
union all
select 'crm summary table', count(*)::text, case when count(*)=1 then '✅' else '❌' end
  from information_schema.tables where table_schema='public' and table_name='tmk_customer_crm_summary'
union all
select 'crm refresh fn', count(*)::text, case when count(*)=1 then '✅' else '❌' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='tmk_refresh_crm_summary';


-- ============================================================================
-- ROLLBACK (copy ไปรันแยกถ้าต้องถอย · ทั้งหมด additive → ปลอดภัย)
-- ============================================================================
-- -- [1B] ถอยก่อน (แก้ realtime เงียบเร็วสุด):
-- drop policy if exists "tmk auth read scoped" on realtime.messages;
-- drop policy if exists "tmk auth send scoped" on realtime.messages;
-- -- [1A]:
-- drop trigger if exists tmk_mp_orders_broadcast on public.tmk_mp_orders;
-- drop function if exists public.tmk_broadcast_order_event();
-- drop function if exists public.tmk_order_public_patch(jsonb, jsonb);
-- drop function if exists public.tmk_jsonb_changed_keys(jsonb, jsonb);
-- drop table if exists public.tmk_domain_events;
-- -- [1C]:
-- drop function if exists public.tmk_refresh_crm_summary(text);
-- drop table if exists public.tmk_customer_crm_summary;
