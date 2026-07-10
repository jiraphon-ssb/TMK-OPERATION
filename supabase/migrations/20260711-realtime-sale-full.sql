-- PART: Realtime สำหรับตารางฝั่ง Sale ที่เหลือ (ให้ทุกหน้าเห็นสดข้ามเครื่อง · ไม่ต้องรีเฟรช)
-- เพิ่มตารางเข้า publication supabase_realtime — idempotent (เช็คก่อน add · รันซ้ำได้)
-- ก่อนรัน = ช่องเปิดแต่เงียบ (ไม่มี event) → ไม่พัง · หลังรัน = แก้ที่เครื่องหนึ่งเด้งอีกเครื่อง ~1-2 วิ
-- REPLICA IDENTITY ไม่ต้องตั้ง FULL (client refetch ทั้งตาราง ไม่อ่าน payload.old)
do $$
declare t text;
begin
  foreach t in array array[
    'tmk_mp_orders', 'tmk_mp_skus', 'tmk_shirt_catalog',
    'tmk_mp_customers', 'tmk_order_overrides', 'tmk_mp_aliases'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
