-- 20260730-task-extend.sql · PART 24 — ต่อยอดงานในโครงการ
-- เพิ่ม: เช็คลิสต์/งานย่อย (subtasks) + ลำดับการ์ดในคอลัมน์ (sort_order)
-- วางใน Supabase → SQL Editor → Run · idempotent
-- graceful: เว็บทำงานได้แม้ยังไม่รัน (เช็คลิสต์/ลากจัดลำดับจะยังไม่บันทึก แต่ไม่พัง — save retry ตัด field เอง)

alter table public.tmk_tasks add column if not exists subtasks jsonb default '[]'::jsonb;
alter table public.tmk_tasks add column if not exists sort_order integer default 0;
