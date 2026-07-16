-- ============================================================================
-- 20260716-rls-tier2-permission-tables.sql — RLS Tier 2: ล็อกตารางสิทธิ์ให้เขียนได้เฉพาะ admin
-- ============================================================================
-- ⚠️ ต้องรัน 20260716-enable-rls-tier1.sql ก่อน (ไฟล์นี้ต่อยอด: แทน policy authenticated-all
--    บน tmk_user_roles / tmk_staff ด้วย policy แยก อ่าน=ทุกคนที่ล็อกอิน · เขียน=admin เท่านั้น)
--
-- ปัญหาที่ปิด (privilege escalation):
--   Tier 1 = "ต้องล็อกอิน" แต่ user ที่ล็อกอินแล้ว (role ไหนก็ได้) ยัง UPDATE tmk_user_roles
--   ตรงผ่าน REST เพื่อยกตัวเองเป็น admin ได้ · Tier 2 บล็อกการเขียน 2 ตารางนี้ให้เหลือแค่ admin
--
-- ทำอะไร:
--   §1 tmk_is_admin() — helper เช็ค caller เป็น admin (SECURITY DEFINER → bypass RLS
--      กัน recursion: policy บน tmk_user_roles ที่ query tmk_user_roles เองจะ loop ไม่จบ)
--   §2 tmk_user_roles: policy อ่าน (authenticated=true) + policy เขียน (INSERT/UPDATE/DELETE = admin)
--   §3 tmk_staff: เหมือน §2
--
-- ผลกับ role:
--   anon                         → ตามเดิม (RLS Tier 1 บล็อกอยู่แล้ว · เข้าไม่ได้)
--   authenticated (ไม่ใช่ admin)  → อ่าน roles/staff ได้ (แอปต้องใช้ resolve user + ทีม) · เขียนไม่ได้ (403)
--   authenticated (admin)         → อ่าน+เขียนได้ครบ (แท็บผู้ใช้/สิทธิ์ทำงานเหมือนเดิม)
--   service_role / postgres       → bypass ตามปกติ (ตั้ง admin คนแรก/กู้คืนทำผ่าน SQL Editor ได้)
--
-- FE: ไม่ต้องแก้ — ทุกจุดเขียน tmk_user_roles/tmk_staff อยู่ใน views-settings-tabs.jsx
--     ที่ guardAdmin() คุมใน UI อยู่แล้ว · Tier 2 = ด่าน DB ชั้นสอง (defense in depth)
-- Idempotent: รันซ้ำได้ · in-file VERIFY ท้ายไฟล์ · rollback block ล่างสุด
-- ============================================================================

begin;

-- ── §1 helper: caller เป็น admin หรือไม่ (bypass RLS ผ่าน SECURITY DEFINER) ──
create or replace function public.tmk_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tmk_user_roles
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role = 'admin'
      and deleted_at is null
  );
$$;
revoke all on function public.tmk_is_admin() from public;
grant execute on function public.tmk_is_admin() to authenticated;

-- ── §2 tmk_user_roles: อ่าน=authenticated · เขียน=admin ─────────────────────
alter table public.tmk_user_roles enable row level security;
drop policy if exists tmk_authenticated_all on public.tmk_user_roles; -- ถอด blanket ของ Tier 1
drop policy if exists tmk_user_roles_select on public.tmk_user_roles;
drop policy if exists tmk_user_roles_admin_write on public.tmk_user_roles;

create policy tmk_user_roles_select on public.tmk_user_roles
  as permissive for select to authenticated
  using (true);
create policy tmk_user_roles_admin_write on public.tmk_user_roles
  as permissive for all to authenticated
  using (public.tmk_is_admin())
  with check (public.tmk_is_admin());

-- ── §3 tmk_staff: อ่าน=authenticated · เขียน=admin ──────────────────────────
alter table public.tmk_staff enable row level security;
drop policy if exists tmk_authenticated_all on public.tmk_staff;
drop policy if exists tmk_staff_select on public.tmk_staff;
drop policy if exists tmk_staff_admin_write on public.tmk_staff;

create policy tmk_staff_select on public.tmk_staff
  as permissive for select to authenticated
  using (true);
create policy tmk_staff_admin_write on public.tmk_staff
  as permissive for all to authenticated
  using (public.tmk_is_admin())
  with check (public.tmk_is_admin());

commit;

-- ── VERIFY (ผลลัพธ์สุดท้ายของไฟล์ — ทุกบรรทัดต้อง ✅) ─────────────────────────
select 'tmk_is_admin() มีจริง (ต้อง = 1)' as check_item,
       count(*)::text as result,
       case when count(*) = 1 then '✅' else '❌' end as status
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'tmk_is_admin' and p.prosecdef
union all
select 'tmk_user_roles: policy อ่าน+เขียน (ต้อง = 2)', count(*)::text,
       case when count(*) = 2 then '✅' else '❌' end
from pg_policies where schemaname = 'public' and tablename = 'tmk_user_roles'
union all
select 'tmk_staff: policy อ่าน+เขียน (ต้อง = 2)', count(*)::text,
       case when count(*) = 2 then '✅' else '❌' end
from pg_policies where schemaname = 'public' and tablename = 'tmk_staff'
union all
select 'ไม่เหลือ blanket tmk_authenticated_all บน 2 ตารางนี้ (ต้อง = 0)', count(*)::text,
       case when count(*) = 0 then '✅' else '❌' end
from pg_policies
where schemaname = 'public' and policyname = 'tmk_authenticated_all'
  and tablename in ('tmk_user_roles', 'tmk_staff');

-- ── ROLLBACK (ถ้าต้องถอยกลับเป็น Tier 1 blanket — copy ไปรันแยก) ─────────────
-- begin;
--   drop policy if exists tmk_user_roles_select on public.tmk_user_roles;
--   drop policy if exists tmk_user_roles_admin_write on public.tmk_user_roles;
--   drop policy if exists tmk_staff_select on public.tmk_staff;
--   drop policy if exists tmk_staff_admin_write on public.tmk_staff;
--   create policy tmk_authenticated_all on public.tmk_user_roles
--     as permissive for all to authenticated using (true) with check (true);
--   create policy tmk_authenticated_all on public.tmk_staff
--     as permissive for all to authenticated using (true) with check (true);
--   -- drop function if exists public.tmk_is_admin();  -- (เหลือไว้ได้ ใช้ต่อ Tier 2 ตารางอื่น)
-- commit;
