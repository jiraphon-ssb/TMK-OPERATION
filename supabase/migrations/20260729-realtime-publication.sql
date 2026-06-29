-- 20260729-realtime-publication.sql
-- เปิด Realtime (postgres_changes) ให้ตาราง tmk_* ทุกตัวที่หน้าเว็บ subscribe
-- ปัญหาเดิม: client subscribe ~20 ตาราง แต่ publication `supabase_realtime` มีแค่
--   tmk_orders/tmk_customers/tmk_sales/tmk_presence (จาก migration เก่า) → event ตารางอื่นไม่เคยยิง
--   → แอปตกไปใช้ polling 120 วิ → ผู้ใช้รู้สึกว่า "ต้องรีเฟรชเอง".
-- รันครั้งเดียวใน Supabase SQL editor. Idempotent (รันซ้ำได้ · ข้ามตารางที่ add แล้ว/ที่ยังไม่มี).
-- หมายเหตุ: ไม่ตั้ง REPLICA IDENTITY FULL — client refetch ทั้งตารางเมื่อมี event (ไม่อ่าน payload.old)
--   จึงไม่ต้องเพิ่ม WAL/egress จาก replica identity.
-- ถ้าไม่รัน migration นี้: แอปยังทำงานปกติ (degrade เป็น polling เหมือนเดิม — ไม่พัง).

do $$
declare t text;
begin
  foreach t in array array[
    'tmk_channels','tmk_campaigns','tmk_tasks','tmk_brands','tmk_flows','tmk_products','tmk_settings',
    'tmk_user_roles','tmk_staff','tmk_duties','tmk_daily_sales','tmk_ad_campaigns',
    'tmk_customer_segments','tmk_fb_metrics','tmk_monthly_history',
    'tmk_color_mix','tmk_size_mix','tmk_purchase_orders',
    'tmk_orders','tmk_customers'
  ]
  loop
    -- เพิ่มเฉพาะตารางที่ "มีจริง" และ "ยังไม่อยู่ใน publication"
    if exists (select 1 from information_schema.tables
               where table_schema='public' and table_name=t)
       and not exists (select 1 from pg_publication_tables
               where pubname='supabase_realtime' and schemaname='public' and tablename=t)
    then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
