-- ============================================================
-- TMK Operation — Sync Users + Fix Campaigns + Department Field
-- ============================================================
-- รัน 1 ครั้งใน Supabase Dashboard → SQL Editor
--
-- ทำอะไรบ้าง:
-- 1. เพิ่ม column `department` ใน tmk_user_roles (Admin/MKT/Graphic/Head MKT/etc.)
-- 2. ปลด CHECK constraint role ให้รองรับ 'editor' ด้วย
-- 3. Sync tmk_user_roles ให้ตรงรายการ 8 emails ที่ user ส่ง
-- 4. Sync tmk_staff ให้ตรงกับผู้ใช้ใหม่ (ใช้สำหรับ avatar + ผู้รับผิดชอบงาน)
-- 5. คืนชื่อแคมเปญที่ user ตั้งไว้ (เปิดตัวลายใหม่ ฯลฯ)
-- ============================================================

-- 1. เพิ่ม column department
alter table public.tmk_user_roles add column if not exists department text default '';
alter table public.tmk_user_roles add column if not exists name text default '';
alter table public.tmk_user_roles add column if not exists color text default '#3b82f6';

-- 2. ปลด CHECK constraint แล้วเพิ่มใหม่
alter table public.tmk_user_roles drop constraint if exists tmk_user_roles_role_check;
alter table public.tmk_user_roles add constraint tmk_user_roles_role_check
  check (role in ('admin', 'editor', 'viewer'));

-- 3. Sync user_roles ให้ตรงรายการ 8 emails
delete from public.tmk_user_roles;

insert into public.tmk_user_roles (email, role, name, department, color, created_by) values
('ceo@tmk.co',              'admin',  'CEO',        'CEO',      '#b07d33', 'system'),
('headmkt@tmk.co',          'admin',  'Head MKT',   'Head MKT', '#0a5aa0', 'system'),
('admin@tmk.co',            'admin',  'Admin',      'Admin',    '#2f9e6e', 'system'),
('admin2@tmk.co',           'editor', 'Admin 2',    'Admin',    '#2f9e6e', 'system'),
('mkt@tmk.co',              'editor', 'MKT',        'MKT',      '#4a8be0', 'system'),
('mkt2@tmk.co',             'editor', 'MKT 2',      'MKT',      '#4a8be0', 'system'),
('graphic@tmk.co',          'editor', 'Graphic',    'Graphic',  '#6b5ce0', 'system'),
('tmktestweb@workspace.co', 'admin',  'TMK Test',   'Admin',    '#cf9026', 'system');

-- 4. Sync tmk_staff ให้ตรงผู้ใช้ใหม่ (เก็บมัง/owner ไว้ด้วยสำหรับ historical tasks)
delete from public.tmk_staff;

insert into public.tmk_staff (id, name, role, email, color, joined_at) values
('s-ceo',     'CEO',      'Owner',    'ceo@tmk.co',              '#b07d33', '2024-01-15'),
('s-headmkt', 'Head MKT', 'Head MKT', 'headmkt@tmk.co',          '#0a5aa0', '2024-02-01'),
('s-admin',   'Admin',    'Admin',    'admin@tmk.co',            '#2f9e6e', '2024-02-01'),
('s-admin2',  'Admin 2',  'Admin',    'admin2@tmk.co',           '#2f9e6e', '2024-03-15'),
('s-mkt',     'MKT',      'MKT',      'mkt@tmk.co',              '#4a8be0', '2024-03-01'),
('s-mkt2',    'MKT 2',    'MKT',      'mkt2@tmk.co',             '#4a8be0', '2024-04-01'),
('s-graphic', 'Graphic',  'Graphic',  'graphic@tmk.co',          '#6b5ce0', '2024-04-15'),
('s-test',    'TMK Test', 'Admin',    'tmktestweb@workspace.co', '#cf9026', '2024-06-01'),
-- เก็บ "มัง" ไว้สำหรับ historical tasks ที่ responsible = "มัง"
('s-mung',    'มัง',      'Owner',    'jiraphon.e@tmk.co',       '#b07d33', '2024-01-15');

-- 5. คืนชื่อแคมเปญที่ user ตั้งไว้ (จาก audit log latest renames)
-- เหตุผล: complete-schema.sql เคยทับด้วยชื่อ Mid-Month Flash etc.
-- audit log แสดงว่า user เคย rename เป็นชื่อไทย
update public.tmk_campaigns set name = 'เปิดตัวลายใหม่ 1', color = '#0a5aa0', bg = '#eff5fd', border = '#cfddf6' where id = 'c1';
update public.tmk_campaigns set name = 'โล๊ะสต็อก & เสื้อสีดำ', color = '#1c1c1c', bg = '#f3f4f6', border = '#d1d5db' where id = 'c2';
update public.tmk_campaigns set name = 'ลายใหม่ 2', color = '#2f9e6e', bg = '#ebf7f1', border = '#cae8d8' where id = 'c3';
update public.tmk_campaigns set name = 'CRM Win-back', color = '#c08a3e', bg = '#fbf3e5', border = '#f0dfb8' where id = 'c4';
update public.tmk_campaigns set name = '6.6 Mega Sale', color = '#4a8be0', bg = '#eff5fd', border = '#cfddf6' where id = 'c5';

-- ============================================================
-- ตรวจสอบผลลัพธ์
-- ============================================================
select 'tmk_user_roles' as t, count(*) from public.tmk_user_roles
union all select 'tmk_staff', count(*) from public.tmk_staff
union all select 'tmk_campaigns', count(*) from public.tmk_campaigns;

select email, role, department, name from public.tmk_user_roles order by department, email;
select id, name from public.tmk_campaigns order by id;
