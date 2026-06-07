-- ============================================================
-- TMK Operation — Final User List (11 emails) + headstock = มัง
-- ============================================================
-- รัน 1 ครั้งใน Supabase Dashboard → SQL Editor
--
-- ลำดับการรัน:
-- 1. ลบ user_roles ก่อน (เพื่อปลด FK duty_id)
-- 2. ลบ duties ทั้งหมด
-- 3. ลบ staff
-- 4. Insert duties ใหม่ทั้ง 8 รายการ
-- 5. Insert staff 11 รายการ
-- 6. Insert user_roles 11 รายการ (link duty_id)
-- ============================================================

-- ==================================================
-- 1-3. ลบข้อมูลเก่า (ไม่กระทบ tasks เพราะ tasks.responsible เป็น text)
-- ==================================================
delete from public.tmk_user_roles;
delete from public.tmk_staff;
delete from public.tmk_duties;

-- ==================================================
-- 4. Insert duties ใหม่ทั้ง 8 รายการ
-- ==================================================
insert into public.tmk_duties (id, name, color, description, sort_order) values
('ceo',       'CEO',        '#b07d33', 'ผู้บริหารระดับสูง / เจ้าของแบรนด์',  1),
('headmkt',   'Head MKT',   '#0a5aa0', 'หัวหน้าทีมการตลาด',                  2),
('headstock', 'Head Stock', '#cf9026', 'หัวหน้าทีมสต็อก / Operations Lead',  3),
('admin',     'Admin',      '#2f9e6e', 'แอดมินหลังบ้าน',                     4),
('stock',     'Stock',      '#3b7ea1', 'ทีมสต็อก / Inventory',               5),
('mkt',       'MKT',        '#4a8be0', 'ทีมการตลาด / Performance',           6),
('graphic',   'Graphic',    '#6b5ce0', 'ทีมกราฟิก / Designer',               7),
('content',   'Content',    '#cf4d5c', 'ทีมคอนเทนต์ / Content Creator',      8);

-- ==================================================
-- 5. Insert tmk_staff 11 รายการ
-- ==================================================
insert into public.tmk_staff (id, name, role, email, color, joined_at) values
('s-ceo',     'CEO',      'CEO',        'ceo@tmk.co',              '#b07d33', '2024-01-15'),
('s-headmkt', 'Head MKT', 'Head MKT',   'headmkt@tmk.co',          '#0a5aa0', '2024-02-01'),
('s-mung',    'มัง',      'Head Stock', 'headstock@tmk.co',        '#cf9026', '2024-01-01'),
('s-admin',   'Admin',    'Admin',      'admin@tmk.co',            '#2f9e6e', '2024-02-01'),
('s-admin2',  'Admin 2',  'Admin',      'admin2@tmk.co',           '#2f9e6e', '2024-03-15'),
('s-stock',   'Stock',    'Stock',      'stock@tmk.co',            '#3b7ea1', '2024-03-01'),
('s-mkt',     'MKT',      'MKT',        'mkt@tmk.co',              '#4a8be0', '2024-03-01'),
('s-mkt2',    'MKT 2',    'MKT',        'mkt2@tmk.co',             '#4a8be0', '2024-04-01'),
('s-graphic', 'Graphic',  'Graphic',    'graphic@tmk.co',          '#6b5ce0', '2024-04-15'),
('s-content', 'Content',  'Content',    'content@tmk.co',          '#cf4d5c', '2024-05-01'),
('s-test',    'TMK Test', 'Admin',      'tmktestweb@workspace.co', '#cf9026', '2024-06-01');

-- ==================================================
-- 6. Insert tmk_user_roles 11 รายการ (link duty_id)
-- ==================================================
insert into public.tmk_user_roles (email, role, name, department, duty_id, color, created_by) values
('ceo@tmk.co',              'admin',  'CEO',      'CEO',        'ceo',       '#b07d33', 'system'),
('headmkt@tmk.co',          'admin',  'Head MKT', 'Head MKT',   'headmkt',   '#0a5aa0', 'system'),
('headstock@tmk.co',        'admin',  'มัง',     'Head Stock', 'headstock', '#cf9026', 'system'),
('admin@tmk.co',            'admin',  'Admin',    'Admin',      'admin',     '#2f9e6e', 'system'),
('admin2@tmk.co',           'editor', 'Admin 2',  'Admin',      'admin',     '#2f9e6e', 'system'),
('stock@tmk.co',            'editor', 'Stock',    'Stock',      'stock',     '#3b7ea1', 'system'),
('mkt@tmk.co',              'editor', 'MKT',      'MKT',        'mkt',       '#4a8be0', 'system'),
('mkt2@tmk.co',             'editor', 'MKT 2',    'MKT',        'mkt',       '#4a8be0', 'system'),
('graphic@tmk.co',          'editor', 'Graphic',  'Graphic',    'graphic',   '#6b5ce0', 'system'),
('content@tmk.co',          'editor', 'Content',  'Content',    'content',   '#cf4d5c', 'system'),
('tmktestweb@workspace.co', 'admin',  'TMK Test', 'Admin',      'admin',     '#cf9026', 'system');

-- ==================================================
-- 7. ตรวจสอบผลลัพธ์
-- ==================================================
select 'tmk_duties' as t, count(*) from public.tmk_duties
union all select 'tmk_staff', count(*) from public.tmk_staff
union all select 'tmk_user_roles', count(*) from public.tmk_user_roles;

-- แสดง users + duties (เรียงตาม duty)
select u.email, u.name as user_name, u.role as access, d.name as duty
from public.tmk_user_roles u
left join public.tmk_duties d on d.id = u.duty_id
order by d.sort_order, u.email;

-- ตรวจ "มัง" linkage
select 'มัง user_roles' as info, email, name, duty_id from public.tmk_user_roles where name = 'มัง'
union all
select 'มัง staff', email, name, role from public.tmk_staff where name = 'มัง';

-- ตรวจ tasks ที่อ้างถึง "มัง"
select 'tasks responsible = มัง' as info, count(*) as task_count
from public.tmk_tasks
where responsible ilike '%มัง%';
