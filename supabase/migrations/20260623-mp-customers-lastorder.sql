-- ============================================================
-- tmk_mp_customers: เพิ่ม last_order (วันที่ออเดอร์ล่าสุดของลูกค้า)
-- ให้หน้า CRM โหลดเร็ว — ใช้ตารางลูกค้าเป็น directory + คิด RFM (recency) ได้เลย
-- ไม่ต้องสแกนออเดอร์ทั้งหมด · idempotent · รันใน Supabase SQL Editor
-- ============================================================
alter table public.tmk_mp_customers add column if not exists last_order date;
create index if not exists tmk_mp_customers_lastorder_idx on public.tmk_mp_customers(last_order);
