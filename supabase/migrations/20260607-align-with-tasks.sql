-- ============================================================
-- TMK Operation — Align Users & Campaigns to match Tasks (source of truth)
-- ============================================================
-- รัน 1 ครั้งใน Supabase Dashboard → SQL Editor
--
-- พบจากข้อมูลปัจจุบัน:
-- 1. Tasks มี responsible: "มัง" (24), "MKT" (17), "Admin" (2), "Graphic" (1)
-- 2. ceo@tmk.co มีชื่อ "CEO" → ไม่ match กับ task ที่ใช้ "มัง"
-- 3. 26/26 tasks มี camp = NULL → ไม่ link กับแคมเปญใดๆ
-- 4. Audit log ใช้ jiraphon.e@saisabuygroup.co เป็น primary user
--
-- การแก้:
-- A. เปลี่ยน ceo@tmk.co display name = "มัง" (match tasks)
-- B. Auto-link tasks → campaigns ด้วย keyword matching
-- C. Verify tmk_staff มีทุกชื่อที่ task อ้างถึง (มัง, MKT, Graphic, Admin)
-- ============================================================

-- ==================================================
-- A. เปลี่ยน ceo@tmk.co name ให้เป็น "มัง"
-- ==================================================
update public.tmk_user_roles
   set name = 'มัง', department = 'CEO'
 where email = 'ceo@tmk.co';

update public.tmk_staff
   set name = 'มัง'
 where email = 'ceo@tmk.co';

-- ==================================================
-- B. Auto-link tasks → campaigns by title keyword
-- ==================================================

-- c1 = "เปิดตัวลายใหม่ 1" — งานที่มี "ลายใหม่ 1" หรือ "ลายใหม่ (1)"
update public.tmk_tasks
   set camp = 'c1'
 where camp is null
   and (
     title ilike '%ลายใหม่ 1%'  or
     title ilike '%ลายใหม่ (1)%' or
     title ilike '%ลายใหม่1%'    or
     title ilike '%PO ลายใหม่%'  or
     title ilike '%Terser%'      or
     title ilike '%Teser%'       or
     title ilike '%กระตุ้นลายใหม่%' or
     title ilike '%เปิดตัวลายใหม่%' or
     title ilike '%แจ้งเตือนเปิดตัว%' or
     title ilike '%ใบงานผลิต%'   or
     title ilike '%คอนเฟิร์มขึ้นตัวอย่าง%' or
     title ilike '%ได้รับตัวอย่างลายใหม่%' or
     title ilike '%เทรนเซล เปิดตัว%'
   );

-- c2 = "โล๊ะสต็อก & เสื้อสีดำ" — งานเกี่ยวกับโล๊ะสต็อก/เสื้อดำ
update public.tmk_tasks
   set camp = 'c2'
 where camp is null
   and (
     title ilike '%โล๊ะสต็อก%' or
     title ilike '%เสื้อดำ%' or
     title ilike '%เสื้อสีดำ%' or
     title ilike '%เทรนเซล โปรโล๊ะ%'
   );

-- c3 = "ลายใหม่ 2"
update public.tmk_tasks
   set camp = 'c3'
 where camp is null
   and (
     title ilike '%ลายใหม่ 2%' or
     title ilike '%ลายใหม่ (2)%' or
     title ilike '%กราฟิกส่งงาน%'
   );

-- งานคอนเทนต์ (VDO) ทั่วไปที่ไม่ระบุแคมเปญ → c1 (แคมเปญหลักของเดือน)
update public.tmk_tasks
   set camp = 'c1'
 where camp is null
   and title ilike '%(VDO)%';

-- งาน VDO อื่นๆ (ไม่มีวงเล็บ) → c1
update public.tmk_tasks
   set camp = 'c1'
 where camp is null
   and title ilike '%VDO%';

-- POV งาน → c3 (ลายใหม่ 2)
update public.tmk_tasks
   set camp = 'c3'
 where camp is null
   and title ilike '%POV%';

-- ==================================================
-- C. Verify tmk_staff มีชื่อที่ task อ้างถึง (มัง, MKT, Graphic, Admin)
-- ==================================================
-- คนเหล่านี้ต้องมีใน tmk_staff เพื่อให้ Profile filter task ทำงาน
insert into public.tmk_staff (id, name, role, email, color, joined_at) values
('s-mung-task',    'มัง',     'Owner',    'ceo@tmk.co',     '#b07d33', '2024-01-15'),
('s-mkt-task',     'MKT',     'MKT',      'mkt@tmk.co',     '#4a8be0', '2024-03-01'),
('s-graphic-task', 'Graphic', 'Graphic',  'graphic@tmk.co', '#6b5ce0', '2024-04-15'),
('s-admin-task',   'Admin',   'Admin',    'admin@tmk.co',   '#2f9e6e', '2024-02-01')
on conflict (id) do update set
  name = excluded.name,
  role = excluded.role,
  email = excluded.email,
  color = excluded.color;

-- ==================================================
-- D. ตรวจสอบผลลัพธ์
-- ==================================================
select 'tasks with camp' as t, count(*) from public.tmk_tasks where camp is not null
union all
select 'tasks without camp', count(*) from public.tmk_tasks where camp is null;

-- แสดง task assignments แบบ summary
select c.id as camp_id, c.name as campaign, count(t.id) as task_count
from public.tmk_campaigns c
left join public.tmk_tasks t on t.camp = c.id
group by c.id, c.name
order by c.id;

-- แสดง responsible names ใน tasks vs staff
select 'tasks responsible names' as t,
  string_agg(distinct responsible, ', ') as names
from public.tmk_tasks
where responsible is not null and responsible != ''
limit 1;

select 'staff names' as t, string_agg(distinct name, ', ') as names
from public.tmk_staff;

-- แสดง users + duties
select email, name, role, department from public.tmk_user_roles order by department, email;
