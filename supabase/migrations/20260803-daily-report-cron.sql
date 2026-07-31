-- ============================================================
-- 20260803-daily-report-cron.sql
-- ตั้งเวลาให้ Edge Function daily-sale-report ยิงสรุปยอดเข้า LINE วันละ 2 รอบ
--   รอบเที่ยง 12:00 น. (ไทย) = 05:00 UTC
--   รอบเย็น  18:00 น. (ไทย) = 11:00 UTC
-- pg_cron ทำงานเป็น UTC เสมอ → ตั้งเวลา UTC (ไทย = UTC+7)
-- ============================================================
-- ⚠️ ก่อนรัน migration นี้ ต้องแทนที่ 2 ค่านี้ก่อน (Find & Replace ทั้งไฟล์):
--     __PROJECT_REF__   → project ref ของ Supabase (เช่น abcdefgh — ดูจาก URL โปรเจกต์)
--     __CRON_SECRET__   → สตริงลับที่ตั้งไว้ (ต้องตรงกับ `supabase secrets set CRON_SECRET=...`)
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- cron.schedule(name, schedule, command) — ถ้าชื่อซ้ำจะอัปเดตทับ (idempotent)

-- รอบเที่ยง
select cron.schedule(
  'daily-sale-report-noon',
  '0 5 * * *',
  $$
  select net.http_post(
    url     := 'https://__PROJECT_REF__.supabase.co/functions/v1/daily-sale-report?slot=noon',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','__CRON_SECRET__'),
    body    := '{}'::jsonb
  );
  $$
);

-- รอบเย็น
select cron.schedule(
  'daily-sale-report-evening',
  '0 11 * * *',
  $$
  select net.http_post(
    url     := 'https://__PROJECT_REF__.supabase.co/functions/v1/daily-sale-report?slot=evening',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','__CRON_SECRET__'),
    body    := '{}'::jsonb
  );
  $$
);

-- ---- คำสั่งช่วยดูแล (รันแยกเมื่อต้องการ) ----
-- ดู job ทั้งหมด:            select * from cron.job;
-- ดูประวัติการรัน 20 ล่าสุด:  select * from cron.job_run_details order by start_time desc limit 20;
-- ยกเลิก:                    select cron.unschedule('daily-sale-report-noon');
--                            select cron.unschedule('daily-sale-report-evening');
