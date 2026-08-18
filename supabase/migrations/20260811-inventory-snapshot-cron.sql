-- ============================================================
-- 20260811-inventory-snapshot-cron.sql
-- ตั้งเวลาให้ Edge Function inventory-snapshot บันทึก snapshot มูลค่า/จำนวนคลัง วันละ 1 ครั้ง
--   รอบสิ้นวัน 23:30 น. (ไทย) = 16:30 UTC  (ปลายวัน → สต็อกนิ่งแล้ว ก่อนขึ้นวันใหม่)
-- pg_cron ทำงานเป็น UTC เสมอ → ตั้งเวลา UTC (ไทย = UTC+7)
-- edge fn คำนวณ units/value จาก tmk_products เอง แล้ว upsert tmk_inventory_snapshots(id=วันนี้ตามเวลาไทย)
-- cron.schedule ชื่อซ้ำ = อัปเดตทับ (idempotent) — รันซ้ำได้ปลอดภัย
-- ============================================================
-- ⚠️ ก่อนรัน แทนที่ 2 ค่า (Find & Replace ทั้งไฟล์):
--     __PROJECT_REF__   → project ref ของ Supabase
--     __CRON_SECRET__   → ให้ตรงกับ secret CRON_SECRET (ตัวเดียวกับ daily-sale-report)
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- รอบสิ้นวัน 23:30 (ไทย) = 16:30 UTC
select cron.schedule(
  'inventory-snapshot-daily', '30 16 * * *',
  $$
  select net.http_post(
    url     := 'https://__PROJECT_REF__.supabase.co/functions/v1/inventory-snapshot',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','__CRON_SECRET__'),
    body    := '{}'::jsonb
  );
  $$
);

-- ---- คำสั่งช่วยดูแล (รันแยกเมื่อต้องการ) ----
-- ดู job ทั้งหมด:            select jobname, schedule from cron.job;
-- ดูประวัติการรัน 20 ล่าสุด:  select * from cron.job_run_details order by start_time desc limit 20;
-- ยกเลิก:                    select cron.unschedule('inventory-snapshot-daily');
