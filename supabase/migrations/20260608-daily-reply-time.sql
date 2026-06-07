-- ============================================================
-- TMK Operation — Daily avg chat reply time (เวลาตอบแชทเฉลี่ย/วัน)
-- ============================================================
-- รัน 1 ครั้งใน Supabase SQL Editor (idempotent)
-- เก็บ "เวลาตอบแชทเฉลี่ย (นาที)" ที่กรอกในฟอร์มบันทึกยอดรายวัน
-- → dashboard จะเฉลี่ยมาแสดงในการ์ด Facebook ของแต่ละเดือน
-- ============================================================
alter table public.tmk_daily_sales add column if not exists avg_reply_minutes numeric not null default 0;
