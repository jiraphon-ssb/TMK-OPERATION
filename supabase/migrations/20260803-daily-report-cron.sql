-- ============================================================
-- 20260803-daily-report-cron.sql
-- ตั้งเวลาให้ Edge Function daily-sale-report ยิงสรุปยอดเข้า LINE วันละ 3 รอบ
--   รอบเที่ยง   12:00 น. (ไทย) = 05:00 UTC
--   รอบเย็น    17:00 น. (ไทย) = 10:00 UTC
--   รอบสิ้นวัน  22:00 น. (ไทย) = 15:00 UTC
-- pg_cron ทำงานเป็น UTC เสมอ → ตั้งเวลา UTC (ไทย = UTC+7)
-- cron.schedule ชื่อซ้ำ = อัปเดตทับ (idempotent) — รันซ้ำได้
-- ============================================================
-- ⚠️ ก่อนรัน แทนที่ 2 ค่า (Find & Replace ทั้งไฟล์):
--     __PROJECT_REF__   → project ref ของ Supabase
--     __CRON_SECRET__   → ให้ตรงกับ secret CRON_SECRET
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- รอบเที่ยง 12:00
select cron.schedule(
  'daily-sale-report-noon', '0 5 * * *',
  $$
  select net.http_post(
    url     := 'https://__PROJECT_REF__.supabase.co/functions/v1/daily-sale-report?slot=noon',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','__CRON_SECRET__'),
    body    := '{}'::jsonb
  );
  $$
);

-- รอบเย็น 17:00
select cron.schedule(
  'daily-sale-report-evening', '0 10 * * *',
  $$
  select net.http_post(
    url     := 'https://__PROJECT_REF__.supabase.co/functions/v1/daily-sale-report?slot=evening',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','__CRON_SECRET__'),
    body    := '{}'::jsonb
  );
  $$
);

-- รอบสิ้นวัน 22:00
select cron.schedule(
  'daily-sale-report-night', '0 15 * * *',
  $$
  select net.http_post(
    url     := 'https://__PROJECT_REF__.supabase.co/functions/v1/daily-sale-report?slot=night',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','__CRON_SECRET__'),
    body    := '{}'::jsonb
  );
  $$
);

-- ---- คำสั่งช่วยดูแล (รันแยกเมื่อต้องการ) ----
-- ดู job ทั้งหมด:            select jobname, schedule from cron.job;
-- ดูประวัติการรัน 20 ล่าสุด:  select * from cron.job_run_details order by start_time desc limit 20;
-- ยกเลิก:                    select cron.unschedule('daily-sale-report-noon');
--                            select cron.unschedule('daily-sale-report-evening');
--                            select cron.unschedule('daily-sale-report-night');
