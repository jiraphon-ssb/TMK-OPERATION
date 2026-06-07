-- ============================================================
-- TMK Operation — Per-month settings (เก็บเป้า/งบ/ฯลฯ แยกรายเดือน)
-- ============================================================
-- รัน 1 ครั้งใน Supabase SQL Editor (idempotent)
-- เก็บค่าตั้งค่ารายเดือนใน tmk_monthly_history:
--   target (มีอยู่แล้ว) = เป้ายอดรวมของเดือนนั้น
--   meta (jsonb ใหม่)   = { adBudget, channelTargets:{id:val}, adChannels:{id:val},
--                           newCustTarget, acosCeil }
-- ============================================================
alter table public.tmk_monthly_history add column if not exists meta jsonb not null default '{}'::jsonb;
