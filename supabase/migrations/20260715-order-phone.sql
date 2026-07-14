-- ============================================================
-- PART 81 — เบอร์โทรลูกค้าเป็นคอลัมน์บนออเดอร์ + mirror เบอร์/โซเชียลใน override
-- ============================================================
-- เดิมเบอร์อยู่แค่ tmk_mp_customers (best-effort upsert — พลาด = หายจาก query)
-- + ฟอร์มแก้ออเดอร์แก้ contact ได้ → ต้องมีที่เก็บบนออเดอร์ + รอดข้าม reimport ผ่าน override

alter table tmk_mp_orders add column if not exists customer_phone text;
alter table tmk_order_overrides add column if not exists customer_phone text;
alter table tmk_order_overrides add column if not exists customer_social text;

-- backfill เบอร์จากโปรไฟล์ลูกค้า (customer_code ตรงกัน · เฉพาะออเดอร์ที่ยังว่าง)
update tmk_mp_orders o set customer_phone = c.phone
  from tmk_mp_customers c
  where o.customer_code = c.customer_code
    and coalesce(o.customer_phone, '') = ''
    and coalesce(c.phone, '') <> '';
