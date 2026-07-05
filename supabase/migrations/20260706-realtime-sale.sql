-- 20260706-realtime-sale.sql
-- เปิด Realtime (postgres_changes) ให้ตารางฝั่ง "ส่งยอด" — เพื่อให้ทีมเห็นสด
--   tmk_sale_receipts  : ใบเสร็จที่ส่ง → feed/หน้าประสิทธิภาพ อัปเดตให้เพื่อนเห็นทันที
--   tmk_sales_funnel   : คนทักวันนี้ → กดบันทึกแล้วคนอื่นเห็นแถบ "ทีมวันนี้" สด
-- ไม่เพิ่ม tmk_mp_orders/tmk_mp_skus (dashboard ใช้ cache 5 นาที + invalidate หลัง action — พอแล้ว ไม่เปลือง egress)
-- รันครั้งเดียวใน Supabase SQL editor. Idempotent (รันซ้ำได้ · ข้ามตารางที่ add แล้ว/ที่ยังไม่มี).
-- ถ้าไม่รัน migration นี้: หน้าส่งยอดยังทำงานปกติ (โหลดตอน mount/หลัง action ตัวเอง — ไม่พัง ไม่เห็นสดข้ามคน).

do $$
declare t text;
begin
  foreach t in array array['tmk_sale_receipts','tmk_sales_funnel']
  loop
    if exists (select 1 from information_schema.tables
               where table_schema='public' and table_name=t)
       and not exists (select 1 from pg_publication_tables
               where pubname='supabase_realtime' and schemaname='public' and tablename=t)
    then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
