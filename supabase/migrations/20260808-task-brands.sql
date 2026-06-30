-- 20260808-task-brands.sql · PART 32 — แบรนด์ในแต่ละงาน (เลือกหลายแบรนด์จากแบรนด์ของโครงการ)
-- วางใน Supabase → SQL Editor → Run · idempotent
-- graceful: ก่อนรัน = เลือกแบรนด์ในงานได้แต่ไม่ persist (handleTaskSubmit retry ตัด brand_ids) · การ์ดไม่โชว์ชิปแบรนด์ของงาน

alter table public.tmk_tasks add column if not exists brand_ids text[] default '{}';
