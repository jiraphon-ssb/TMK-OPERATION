-- ============================================================
-- TMK Operation — Final User List (11 emails) + headstock = มัง
-- ============================================================
-- รัน 1 ครั้งใน Supabase Dashboard → SQL Editor
--
-- รายการ user 11 emails:
--   ceo@tmk.co                 — CEO
--   headmkt@tmk.co             — Head MKT
--   headstock@tmk.co           — มัง (Head Stock + Owner) ← สำคัญ
--   admin@tmk.co               — Admin
--   admin2@tmk.co              — Admin
--   stock@tmk.co               — Stock
--   mkt@tmk.co                 — MKT
--   mkt2@tmk.co                — MKT
--   graphic@tmk.co             — Graphic
--   content@tmk.co             — Content
--   tmktestweb@workspace.co    — Test Admin
--
-- duties ใหม่ที่ต้องมี: CEO, Head MKT, Head Stock, Admin, Stock, MKT, Graphic, Content
-- ============================================================

-- ==================================================
-- 1. เพิ่ม duties ใหม่ (Head Stock, Content, Stock)
-- ==================================================
insert into public.tmk_duties (id, name, color, description, sort_order) values
('ceo',       'CEO',        '#b07d33', 'ผู้บริหารระดับสูง / เจ้าของแบรนด์',  1),
('headmkt',   'Head MKT',   '#0a5aa0', 'หัวหน้าทีมการตลาด',                  2),
('headstock', 'Head Stock', '#cf9026', 'หัวหน้าทีมสต็อก / Operations Lead',  3),
('admin',     'Admin',      '#2f9e6e', 'แอดมินหลังบ้าน',                     4),
('stock',     'Stock',      '#3b7ea1', 'ทีมสต็อก / Inventory',               5),
('mkt',       'MKT',        '#4a8be0', 'ทีมการตลาด / Performance',           6),
('graphic',   'Graphic',    '#6b5ce0', 'ทีมกราฟิก / Designer',               7),
('content',   'Content',    '#cf4d5c', 'ทีมคอนเทนต์ / Content Creator',      8)
on conflict (id) do update set
  name = excluded.name,
  color = excluded.color,
  description = excluded.description,
  sort_order = excluded.sort_order;

-- ==================================================
-- 2. Sync tmk_user_roles ให้ตรงรายการ 11 emails
-- ==================================================
delete from public.tmk_user_roles;

insert into public.tmk_user_roles (email, role, name, department, duty_id, color, created_by) values
('ceo@tmk.co',              'admin',  'CEO',         'CEO',        'ceo',       '#b07d33', 'system'),
('headmkt@tmk.co',          'admin',  'Head MKT',    'Head MKT',   'headmkt',   '#0a5aa0', 'system'),
('headstock@tmk.co',        'admin',  'มัง',         'Head Stock', 'headstock', '#cf9026', 'system'),  -- ← มัง
('admin@tmk.co',            'admin',  'Admin',       'Admin',      'admin',     '#2f9e6e', 'system'),
('admin2@tmk.co',           'editor', 'Admin 2',     'Admin',      'admin',     '#2f9e6e', 'system'),
('stock@tmk.co',            'editor', 'Stock',       'Stock',      'stock',     '#3b7ea1', 'system'),
('mkt@tmk.co',              'editor', 'MKT',         'MKT',        'mkt',       '#4a8be0', 'system'),
('mkt2@tmk.co',              'editor', 'MKT 2',      'MKT',        'mkt',       '#4a8be0', 'system'),
('graphic@tmk.co',          'editor', 'Graphic',     'Graphic',    'graphic',   '#6b5ce0', 'system'),
('content@tmk.co',          'editor', 'Content',     'Content',    'content',   '#cf4d5c', 'system'),
('tmktestweb@workspace.co', 'admin',  'TMK Test',    'Admin',      'admin',     '#cf9026', 'system');

-- ==================================================
-- 3. Sync tmk_staff ให้ตรงผู้ใช้ใหม่
-- เก็บ staff สำหรับชื่อที่ tasks อ้างถึง (มัง, MKT, Graphic, Admin)
-- ==================================================
delete from public.tmk_staff;

insert into public.tmk_staff (id, name, role, email, color, joined_at) values
('s-ceo',       'CEO',        'CEO',        'ceo@tmk.co',              '#b07d33', '2024-01-15'),
('s-headmkt',   'Head MKT',   'Head MKT',   'headmkt@tmk.co',          '#0a5aa0', '2024-02-01'),
('s-mung',      'มัง',        'Head Stock', 'headstock@tmk.co',        '#cf9026', '2024-01-01'),  -- ← มัง = headstock
('s-admin',     'Admin',      'Admin',      'admin@tmk.co',            '#2f9e6e', '2024-02-01'),
('s-admin2',    'Admin 2',    'Admin',      'admin2@tmk.co',           '#2f9e6e', '2024-03-15'),
('s-stock',     'Stock',      'Stock',      'stock@tmk.co',            '#3b7ea1', '2024-03-01'),
('s-mkt',       'MKT',        'MKT',        'mkt@tmk.co',              '#4a8be0', '2024-03-01'),
('s-mkt2',      'MKT 2',      'MKT',        'mkt2@tmk.co',             '#4a8be0', '2024-04-01'),
('s-graphic',   'Graphic',    'Graphic',    'graphic@tmk.co',          '#6b5ce0', '2024-04-15'),
('s-content',   'Content',    'Content',    'content@tmk.co',          '#cf4d5c', '2024-05-01'),
('s-test',      'TMK Test',   'Admin',      'tmktestweb@workspace.co', '#cf9026', '2024-06-01');

-- ==================================================
-- 4. ตรวจสอบผลลัพธ์
-- ==================================================

-- นับ records
select 'tmk_duties'        as t, count(*) from public.tmk_duties
union all select 'tmk_user_roles',     count(*) from public.tmk_user_roles
union all select 'tmk_staff',          count(*) from public.tmk_staff;

-- แสดง users + duties (เรียงตาม duty)
select u.email, u.name as user_name, u.role as access, d.name as duty
from public.tmk_user_roles u
left join public.tmk_duties d on d.id = u.duty_id
order by d.sort_order, u.email;

-- ตรวจ tasks ที่อ้างถึง "มัง" ว่า user ไหนเห็น
select 'tasks responsible = มัง' as info, count(*) as task_count
from public.tmk_tasks
where responsible ilike '%มัง%';

-- staff ที่ชื่อ "มัง" (สำหรับ task matching)
select email, name, role from public.tmk_staff where name = 'มัง';
