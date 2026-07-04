-- ============================================================
-- PART 43 — แก้บั๊กหลังส่งยอดใบเสร็จจริง (ตรวจข้อมูล 16 ใบ)
-- ============================================================
-- 1) หลักฐานใบเสร็จ (PDF) อัปขึ้น Storage ไม่ได้ → file_url = NULL ทุกใบ
--    ราก: bucket tmk-images จำกัด mime แค่รูป (jpeg/png/webp) → PDF ถูกปฏิเสธเงียบ
--    + file_size_limit 5MB อาจไม่พอ PDF รวม 50-60 หน้า
-- 2) payment_type เขียนเป็น "โอน (scb)" ต่อธนาคาร → กราฟการชำระแตกเป็นหลายก้อน
--    ปรับให้ตรง convention เดิมของ import: "โอน" เฉยๆ (ธนาคารเก็บใน attrs)
-- รันใน Supabase SQL Editor ครั้งเดียว (idempotent)
-- ============================================================

-- 1. bucket tmk-images รับ PDF ได้ + ขยายเพดานเป็น 20MB (กัน PDF หลายหน้า)
update storage.buckets
  set allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'],
      file_size_limit = 20971520
  where id = 'tmk-images';

-- 2. normalize payment_type ของออเดอร์ที่มาจากใบเสร็จ (เก่า): "โอน (scb)" → "โอน"
update public.tmk_mp_orders
  set payment_type = 'โอน'
  where payment_type like 'โอน (%';
