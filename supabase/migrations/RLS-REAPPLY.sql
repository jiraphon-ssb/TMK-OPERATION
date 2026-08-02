-- ============================================================
-- RLS-REAPPLY.sql — เปิด RLS + policy กลับให้ทุกตาราง tmk_ (idempotent · รันซ้ำได้เสมอ)
-- ============================================================
-- ปัญหา (P89 audit): migration เก่าหลายไฟล์ลงท้ายด้วย `disable row level security`
-- ถ้าเผลอรันไฟล์เก่าซ้ำหลังเปิด RLS (20260716-tier1) → RLS ถูกปิดเงียบ ๆ ตารางนั้น
-- → anon key (ที่อยู่ใน bundle) อ่าน/เขียนได้ทันที
--
-- **กติกา: ทุกครั้งที่รัน migration เก่าใน SQL Editor ให้รันไฟล์นี้ตามปิดท้ายเสมอ**
-- ปลอดภัย 100% ต่อทุกตาราง tmk_ ที่มีอยู่ (loop ครอบตารางใหม่ให้อัตโนมัติ)
-- คง permission tier-2 (admin-only write บน tmk_user_roles/tmk_staff) ไว้ ไม่ทับ

do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'tmk\_%' escape '\'
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    -- policy authenticated-all: สร้างเฉพาะตารางที่ยังไม่มี policy tier-2 (permission tables)
    -- และยังไม่มี tmk_authenticated_all อยู่ → กันทับ policy admin-only ของ tmk_user_roles/tmk_staff
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = r.relname
        and policyname in ('tmk_authenticated_all', 'tmk_admin_write', 'tmk_read_all')
    ) then
      execute format(
        'create policy tmk_authenticated_all on public.%I as permissive for all to authenticated using (true) with check (true)',
        r.relname
      );
    end if;
  end loop;
end $$;

-- ตรวจผล: ตาราง tmk_ ที่ RLS ยังปิดอยู่ (ควรว่าง)
-- select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
--   where n.nspname='public' and c.relkind='r' and relname like 'tmk\_%' escape '\' and not c.relrowsecurity;
