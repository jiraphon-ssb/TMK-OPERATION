-- ============================================================
-- TMK Operation — กู้คืน task ที่ขาดจาก Audit Log
-- ============================================================
-- กู้คืน 2 tasks ที่หายไป (DB เดิมมี 23, audit log มี 23)
--
-- กลยุทธ์: ON CONFLICT DO NOTHING
--   - tasks ที่ ID ตรงกับ DB เดิม → คงไว้ (ไม่เขียนทับงานล่าสุด)
--   - tasks ที่ ID ไม่มี → เพิ่มเข้ามาใหม่
--
-- กรอง garbage แล้ว: 'เทส', 'kjbk', '่ า'
-- ไม่แตะ campaigns เพราะ user ได้ rename ไปแล้วทีหลัง
-- ============================================================

-- ตรวจสอบก่อน: นับ task ปัจจุบัน
select count(*) as before_count from public.tmk_tasks;

-- เพิ่ม task ที่ขาดจาก audit log (2 รายการ)

-- Terser ลายใหม่ (1)
insert into public.tmk_tasks (id, date, camp, title, detail, responsible, channel, status, priority, reminder_days)
values (
  't-25-0bd70975-f1aa-4aa6-a494-bedc9476406e',
  '2026-06-05',
  'c-1-59e5e599-7b7b-4329-8ef5-4476938cb91d',
  'Terser ลายใหม่ (1)',
  '',
  'มัง',
  'Line Broadcast, FB Post, TikTok Shop',
  'todo',
  'medium',
  1
)
on conflict (id) do nothing;

-- กราฟิกส่งงาน ลายใหม่ (2)
insert into public.tmk_tasks (id, date, camp, title, detail, responsible, channel, status, priority, reminder_days)
values (
  't-26-2cc5424c-4ad8-4013-851c-acb291c1dd95',
  '2026-06-06',
  'c-1-59e5e599-7b7b-4329-8ef5-4476938cb91d',
  'กราฟิกส่งงาน ลายใหม่ (2)',
  '',
  'Graphic',
  'หลังบ้าน',
  'todo',
  'medium',
  1
)
on conflict (id) do nothing;


-- ตรวจสอบหลังบันทึก
select count(*) as after_count from public.tmk_tasks;
select date, status, responsible, title from public.tmk_tasks order by date, id;
