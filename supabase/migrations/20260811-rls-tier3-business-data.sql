-- ============================================================================
-- 20260811-rls-tier3-business-data.sql — RLS Tier 3: ล็อกการ "เขียน/ลบ" ตารางข้อมูลธุรกิจ
-- ============================================================================
-- ⚠️ ต้องรัน Tier 1 (20260716-enable-rls-tier1) + Tier 2 (20260716-rls-tier2-*) ก่อน
--
-- ปัญหาที่ปิด (audit 2026-08-11 · P0-2):
--   Tier 1/2 = "ล็อกอินแล้วเขียนได้ทุกอย่าง" (ยกเว้นตารางสิทธิ์ที่ Tier 2 ล็อก) →
--   พนักงาน role=viewer เปิด devtools ยิง REST เอง: แก้ยอด/ลบข้อมูลถาวร/ลบ audit log ได้
--
-- ทำอะไร (ปลอดภัยโดยการออกแบบ — ไม่แตะ "การอ่าน" เพื่อไม่ให้แดชบอร์ดทีมพัง):
--   §1 tmk_can_write() — helper: caller role ∈ (admin, editor) จาก JWT (SECURITY DEFINER)
--   §2 loop ทุกตาราง tmk_* (ยกเว้นตารางสิทธิ์ Tier 2 + audit log) :
--        อ่าน  = authenticated ทุกคน (policy _rls_read using true)  ← ไม่แตะ = ไม่พัง
--        เขียน/ลบ (insert/update/delete) = tmk_can_write() เท่านั้น   ← viewer โดนบล็อก
--   §3 tmk_audit_logs = insert ได้ · update/delete ห้ามทุกคน (immutable — log ต้องแก้ไม่ได้)
--
-- ผลกับ role:
--   viewer            → อ่านได้เหมือนเดิม · insert/update/DELETE ตรงผ่าน REST = 403
--   editor/admin      → อ่าน+เขียน+ลบได้ตามเดิม (UI ทำงานเหมือนเดิม)
--   service_role/RPC  → bypass (RPC ธุรกรรม SECURITY DEFINER เช่น void/restore ยังทำงาน)
--
-- หมายเหตุความปลอดภัยที่ "ยังไม่ทำในไฟล์นี้" (ตั้งใจ เพราะเสี่ยงทำแดชบอร์ดพัง — ทำแยกรอบ + ทดสอบ):
--   (ก) จำกัด "การอ่าน" ออเดอร์/ใบเสร็จให้ non-admin เห็นเฉพาะ salesperson=ตัวเอง (ให้ตรง roleAccess.js)
--   (ข) บังคับ delete=admin-only (แทน can_write) เพื่อกัน editor ลบเป็นกลุ่ม — เปิดใช้ได้ที่ §4 (คอมเมนต์)
--   → ต้องยืนยันก่อนว่า flow ไหนของ editor ลบตรงผ่าน REST (ไม่ใช่ soft-delete/RPC) จะได้ไม่พัง
--
-- Idempotent: รันซ้ำได้ · in-file VERIFY ท้ายไฟล์ · rollback block ล่างสุด
-- ============================================================================

begin;

-- ── §1 helper: caller เขียนได้ไหม (role ∈ admin/editor) ──────────────────────
create or replace function public.tmk_can_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tmk_user_roles
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role in ('admin', 'editor')
      and deleted_at is null
  );
$$;
revoke all on function public.tmk_can_write() from public;
grant execute on function public.tmk_can_write() to authenticated;

-- ── §2 ทุกตาราง tmk_* : อ่าน=ทุกคนที่ล็อกอิน · เขียน/ลบ=can_write ──────────────
--    ยกเว้น tmk_user_roles/tmk_staff (Tier 2 ล็อกเข้ม admin-only แล้ว) + tmk_audit_logs (§3)
do $$
declare r record;
begin
  for r in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename like 'tmk\_%'
      and tablename not in ('tmk_user_roles', 'tmk_staff', 'tmk_audit_logs')
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format('drop policy if exists tmk_authenticated_all on public.%I', r.tablename);
    execute format('drop policy if exists %I on public.%I', r.tablename || '_rls_read', r.tablename);
    execute format('drop policy if exists %I on public.%I', r.tablename || '_rls_write', r.tablename);
    -- อ่าน: ทุกคนที่ล็อกอิน (permissive OR กับ _rls_write → select ผ่านเสมอ)
    execute format(
      'create policy %I on public.%I as permissive for select to authenticated using (true)',
      r.tablename || '_rls_read', r.tablename);
    -- เขียน/ลบ: เฉพาะ can_write (viewer ทำ insert/update/delete ไม่ได้)
    execute format(
      'create policy %I on public.%I as permissive for all to authenticated using (public.tmk_can_write()) with check (public.tmk_can_write())',
      r.tablename || '_rls_write', r.tablename);
  end loop;
end $$;

-- ── §3 tmk_audit_logs: insert ได้ · update/delete ห้ามทุกคน (log ต้องแก้ไม่ได้) ──
alter table public.tmk_audit_logs enable row level security;
drop policy if exists tmk_authenticated_all on public.tmk_audit_logs;
drop policy if exists tmk_audit_logs_read on public.tmk_audit_logs;
drop policy if exists tmk_audit_logs_insert on public.tmk_audit_logs;
create policy tmk_audit_logs_read on public.tmk_audit_logs
  as permissive for select to authenticated using (true);
create policy tmk_audit_logs_insert on public.tmk_audit_logs
  as permissive for insert to authenticated with check (true);
-- ไม่มี policy update/delete → RLS default deny → ไม่มีใคร (นอกจาก service_role) แก้/ลบ log ได้

commit;

-- ── §4 (ตัวเลือก) บังคับ delete=admin-only แทน can_write — เปิดหลังทดสอบว่า editor ไม่ลบตรง REST ──
-- begin;
--   do $$
--   declare r record;
--   begin
--     for r in select tablename from pg_tables
--       where schemaname='public' and tablename like 'tmk\_%'
--         and tablename not in ('tmk_user_roles','tmk_staff','tmk_audit_logs')
--     loop
--       execute format('drop policy if exists %I on public.%I', r.tablename||'_rls_delete', r.tablename);
--       execute format('create policy %I on public.%I as restrictive for delete to authenticated using (public.tmk_is_admin())', r.tablename||'_rls_delete', r.tablename);
--     end loop;
--   end $$;
-- commit;

-- ── VERIFY (ทุกบรรทัดต้อง ✅) ─────────────────────────────────────────────────
select 'tmk_can_write() มีจริง (ต้อง = 1)' as check_item,
       count(*)::text as result,
       case when count(*) = 1 then '✅' else '❌' end as status
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'tmk_can_write' and p.prosecdef
union all
select 'ไม่เหลือ blanket tmk_authenticated_all บนตาราง tmk_* ใดๆ (ต้อง = 0)', count(*)::text,
       case when count(*) = 0 then '✅' else '❌' end
from pg_policies where schemaname = 'public' and policyname = 'tmk_authenticated_all'
union all
select 'ตารางธุรกิจมี policy _rls_write ครบ (ต้อง ≥ 20)', count(*)::text,
       case when count(*) >= 20 then '✅' else '⚠️ ตรวจดู' end
from pg_policies where schemaname = 'public' and policyname like '%\_rls_write'
union all
select 'tmk_audit_logs: ไม่มี policy update/delete (ต้อง = 0 → log แก้ไม่ได้)', count(*)::text,
       case when count(*) = 0 then '✅' else '❌' end
from pg_policies
where schemaname = 'public' and tablename = 'tmk_audit_logs' and cmd in ('UPDATE', 'DELETE');

-- ── ROLLBACK (ถอยกลับเป็น Tier 1 blanket ทุกตาราง — copy ไปรันแยก) ─────────────
-- begin;
--   do $$
--   declare r record;
--   begin
--     for r in select tablename from pg_tables
--       where schemaname='public' and tablename like 'tmk\_%'
--         and tablename not in ('tmk_user_roles','tmk_staff')
--     loop
--       execute format('drop policy if exists %I on public.%I', r.tablename||'_rls_read', r.tablename);
--       execute format('drop policy if exists %I on public.%I', r.tablename||'_rls_write', r.tablename);
--       execute format('drop policy if exists %I on public.%I', 'tmk_audit_logs_read', r.tablename);
--       execute format('drop policy if exists %I on public.%I', 'tmk_audit_logs_insert', r.tablename);
--       execute format('create policy tmk_authenticated_all on public.%I as permissive for all to authenticated using (true) with check (true)', r.tablename);
--     end loop;
--   end $$;
--   -- drop function if exists public.tmk_can_write();
-- commit;
