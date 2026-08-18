-- ============================================================================
-- 20260811-rls-tier3b-owner-scope.sql — RLS Tier 3b: ลบ=admin เท่านั้น + เห็นเฉพาะของตัวเอง
-- ============================================================================
-- ⚠️ ต้องรัน Tier 1 → Tier 2 → Tier 3 (20260811-rls-tier3-business-data.sql) ก่อน
--
-- ปิดช่องที่ Tier 3 ยังเหลือ (audit P0-2 ส่วนที่ defer ไว้):
--   §2 ลบข้อมูล: Tier 3 ให้ non-viewer (editor) ลบได้ → เข้มเป็น "admin เท่านั้น"
--   §3 การอ่าน: ทุกคนที่ล็อกอินอ่านได้ทุกแถว → จำกัดตามเจ้าของ ให้ตรงกับดีไซน์ FE
--
-- ดีไซน์อ้างอิง (src/lib/roleAccess.js — เป็นความจริงของระบบ):
--   "admin เห็นทั้งทีม · คนอื่น (editor/viewer) เห็นเฉพาะของตัวเอง (salesperson = ชื่อ/อีเมลตัวเอง)"
--   canSeeTeam(user) = isAdmin(user)   ← ใบเสร็จ + คนทัก/funnel = admin เท่านั้นที่เห็นทั้งทีม
--
-- เทคนิค: ใช้ policy แบบ **restrictive** (AND กับ policy เดิม) → ไม่ต้องแก้/ลบ policy ของ Tier 3
--   (ถ้าใช้ permissive จะถูก OR กับ _rls_read/_rls_write เดิม = ไม่มีผล)
--
-- Idempotent: รันซ้ำได้ · in-file VERIFY ท้ายไฟล์ · rollback block ล่างสุด
-- ============================================================================

begin;

-- ── §1 helper: "ชื่อที่นับว่าเป็นของฉัน" (ตรงกับ myNamesOf() ฝั่ง FE) ──────────
--    FE: user.name = tmk_staff.name || tmk_user_roles.name · user.email = อีเมล JWT
--    → คืน array {อีเมล, ชื่อใน user_roles, ชื่อใน staff} เทียบกับ orders.salesperson ได้ครบทุกแบบ
create or replace function public.tmk_my_names()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array_remove(array(
    select lower(coalesce(auth.jwt() ->> 'email', ''))
    union
    select lower(r.name) from public.tmk_user_roles r
      where lower(r.email) = lower(coalesce(auth.jwt() ->> 'email', '')) and r.deleted_at is null
    union
    select lower(s.name) from public.tmk_staff s
      where lower(coalesce(s.email, '')) = lower(coalesce(auth.jwt() ->> 'email', '')) and s.deleted_at is null
  ), '');
$$;
revoke all on function public.tmk_my_names() from public;
grant execute on function public.tmk_my_names() to authenticated;

-- ── §2 ลบข้อมูล = admin เท่านั้น (ทุกตารางธุรกิจ) ────────────────────────────
--    restrictive → AND กับ _rls_write เดิม = ต้องเป็น can_write **และ** admin
--    ผล: editor แก้/เพิ่มได้เหมือนเดิม แต่ลบถาวรไม่ได้ (soft-delete ผ่าน UI ยังทำได้ = update)
do $$
declare r record;
begin
  for r in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename like 'tmk\_%'
      and tablename not in ('tmk_user_roles', 'tmk_staff', 'tmk_audit_logs', 'tmk_migrations')
  loop
    execute format('drop policy if exists %I on public.%I', r.tablename || '_rls_delete_admin', r.tablename);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (public.tmk_is_admin())',
      r.tablename || '_rls_delete_admin', r.tablename);
  end loop;
end $$;

-- ── §3 เห็นเฉพาะของตัวเอง — ใบเสร็จ + คนทัก (ตรงกับ canSeeTeam = admin) ───────
--    admin เห็นทุกแถว · คนอื่นเห็นเฉพาะแถวที่ salesperson/uploader เป็นตัวเอง
--    (แถวที่ไม่มีเจ้าของ = ว่าง → ให้เห็นได้ กันข้อมูลเก่าหาย)
alter table public.tmk_sale_receipts enable row level security;
drop policy if exists tmk_sale_receipts_owner_read on public.tmk_sale_receipts;
create policy tmk_sale_receipts_owner_read on public.tmk_sale_receipts
  as restrictive for select to authenticated
  using (
    public.tmk_is_admin()
    or lower(coalesce(salesperson, '')) = any (public.tmk_my_names())
    or lower(coalesce(uploader_email, '')) = any (public.tmk_my_names())
    or coalesce(salesperson, '') = ''
  );

alter table public.tmk_sales_funnel enable row level security;
drop policy if exists tmk_sales_funnel_owner_read on public.tmk_sales_funnel;
create policy tmk_sales_funnel_owner_read on public.tmk_sales_funnel
  as restrictive for select to authenticated
  using (
    public.tmk_is_admin()
    or lower(coalesce(salesperson, '')) = any (public.tmk_my_names())
    or coalesce(salesperson, '') = ''
  );

commit;

-- ============================================================================
-- §4 (ตัวเลือก · ยังไม่เปิด) — จำกัดการอ่าน "ออเดอร์" ให้เห็นเฉพาะของตัวเองด้วย
-- ============================================================================
-- ⚠️ อ่านก่อนเปิด: FE กรองรายคนอยู่แล้วใน "หน้าออเดอร์" + "ประสิทธิภาพเซล" (orderVisibleTo)
--    แต่ "รายงานขาย" (saleDashboard) ตั้งใจโชว์ยอด**ทั้งทีม**ให้ทุกคนดู
--    → ถ้าเปิดข้อนี้ เซลล์ที่ไม่ใช่แอดมินจะเห็น "รายงานขาย" เป็นยอดของตัวเองเท่านั้น
--      (ยอดขายรวม/ลูกค้าใหม่/อันดับ = เฉพาะตัวเอง · ไม่ใช่ทั้งทีม)
--    เปิดก็ต่อเมื่อธุรกิจต้องการแบบนั้นจริง — copy บล็อกนี้ไปรันแยกเมื่อพร้อม
--
-- begin;
--   alter table public.tmk_mp_orders enable row level security;
--   drop policy if exists tmk_mp_orders_owner_read on public.tmk_mp_orders;
--   create policy tmk_mp_orders_owner_read on public.tmk_mp_orders
--     as restrictive for select to authenticated
--     using (
--       public.tmk_is_admin()
--       or lower(coalesce(salesperson, '')) = any (public.tmk_my_names())
--       or coalesce(salesperson, '') = ''      -- มาร์เก็ตเพลส/ไม่มีเจ้าของ = เห็นได้
--     );
--   -- รายการสินค้าใต้ออเดอร์ (skus) ต้องล็อกตามด้วย ไม่งั้นอ่านอ้อมได้
--   alter table public.tmk_mp_skus enable row level security;
--   drop policy if exists tmk_mp_skus_owner_read on public.tmk_mp_skus;
--   create policy tmk_mp_skus_owner_read on public.tmk_mp_skus
--     as restrictive for select to authenticated
--     using (
--       public.tmk_is_admin()
--       or exists (select 1 from public.tmk_mp_orders o
--                  where o.order_no = tmk_mp_skus.order_no
--                    and (lower(coalesce(o.salesperson,'')) = any (public.tmk_my_names())
--                         or coalesce(o.salesperson,'') = ''))
--     );
-- commit;

-- ── VERIFY (ทุกบรรทัดต้อง ✅) ─────────────────────────────────────────────────
select 'tmk_my_names() มีจริง (ต้อง = 1)' as check_item, count(*)::text as result,
       case when count(*) = 1 then '✅' else '❌' end as status
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'tmk_my_names' and p.prosecdef
union all
select 'policy ลบ=admin ครอบตารางธุรกิจ (ต้อง ≥ 20)', count(*)::text,
       case when count(*) >= 20 then '✅' else '⚠️ ตรวจดู' end
from pg_policies where schemaname = 'public' and policyname like '%\_rls_delete_admin' and permissive = 'RESTRICTIVE'
union all
select 'ใบเสร็จ: owner-read restrictive (ต้อง = 1)', count(*)::text,
       case when count(*) = 1 then '✅' else '❌' end
from pg_policies where schemaname = 'public' and tablename = 'tmk_sale_receipts'
  and policyname = 'tmk_sale_receipts_owner_read' and permissive = 'RESTRICTIVE'
union all
select 'คนทัก(funnel): owner-read restrictive (ต้อง = 1)', count(*)::text,
       case when count(*) = 1 then '✅' else '❌' end
from pg_policies where schemaname = 'public' and tablename = 'tmk_sales_funnel'
  and policyname = 'tmk_sales_funnel_owner_read' and permissive = 'RESTRICTIVE'
union all
select 'ชื่อของฉันที่ระบบเห็น (ควรมี ≥ 1 = อีเมลคุณ)', array_length(public.tmk_my_names(), 1)::text,
       case when coalesce(array_length(public.tmk_my_names(), 1), 0) >= 1 then '✅' else '⚠️ รันจาก SQL Editor จะว่าง (ไม่มี JWT) = ปกติ' end;

-- ── ROLLBACK (copy ไปรันแยก) ────────────────────────────────────────────────
-- begin;
--   drop policy if exists tmk_sale_receipts_owner_read on public.tmk_sale_receipts;
--   drop policy if exists tmk_sales_funnel_owner_read on public.tmk_sales_funnel;
--   drop policy if exists tmk_mp_orders_owner_read on public.tmk_mp_orders;
--   drop policy if exists tmk_mp_skus_owner_read on public.tmk_mp_skus;
--   do $$
--   declare r record;
--   begin
--     for r in select tablename from pg_tables where schemaname='public' and tablename like 'tmk\_%'
--     loop execute format('drop policy if exists %I on public.%I', r.tablename||'_rls_delete_admin', r.tablename); end loop;
--   end $$;
--   -- drop function if exists public.tmk_my_names();
-- commit;
