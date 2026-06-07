-- ============================================================
-- TMK Operation — กู้คืน task ที่ขาดจาก Audit Log
-- ============================================================
-- กู้คืน 2 tasks ที่ขาด — ของเดิม 23 รายการคงไว้
--
-- กลยุทธ์: ON CONFLICT DO NOTHING + camp = NULL
--   - tasks ที่ ID ตรงกับ DB เดิม → คงไว้
--   - tasks ที่ ID ไม่มี → เพิ่มเข้ามาใหม่
--   - camp = NULL เพื่อไม่ให้ติด FK constraint
--     (ไปเลือก campaign ในแอปได้ทีหลัง)
-- ============================================================

-- ตรวจสอบก่อน
select count(*) as before_count from public.tmk_tasks;

-- เพิ่ม 2 tasks ที่หาย

-- 1. Terser ลายใหม่ (1)
insert into public.tmk_tasks (id, date, camp, title, detail, responsible, channel, status, priority, reminder_days)
values (
  't-25-0bd70975-f1aa-4aa6-a494-bedc9476406e',
  '2026-06-05',
  NULL,
  'Terser ลายใหม่ (1)',
  '',
  'มัง',
  'Line Broadcast, FB Post, TikTok Shop',
  'todo',
  'medium',
  1
)
on conflict (id) do nothing;

-- 2. กราฟิกส่งงาน ลายใหม่ (2)
insert into public.tmk_tasks (id, date, camp, title, detail, responsible, channel, status, priority, reminder_days)
values (
  't-26-2cc5424c-4ad8-4013-851c-acb291c1dd95',
  '2026-06-06',
  NULL,
  'กราฟิกส่งงาน ลายใหม่ (2)',
  '',
  'Graphic',
  'หลังบ้าน',
  'todo',
  'medium',
  1
)
on conflict (id) do nothing;

-- ตรวจสอบหลัง
select count(*) as after_count from public.tmk_tasks;
