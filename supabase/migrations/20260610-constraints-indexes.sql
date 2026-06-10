-- ============================================================
-- เพิ่ม unique constraint + index (จาก hard test) — รันใน Supabase SQL Editor
-- idempotent — รันซ้ำได้ปลอดภัย (ไม่มีเดือนซ้ำอยู่แล้ว)
-- ============================================================

-- กันแถวเดือนซ้ำ (month, year) ใน tmk_monthly_history
-- (โค้ด upsert ใช้ id = 'YYYY-MM' เป็น PK อยู่แล้ว ตัวนี้กัน insert มือ/path อื่นสร้างซ้ำ)
create unique index if not exists tmk_monthly_history_month_year_idx
  on public.tmk_monthly_history(month, year);

-- index หมวดหมู่สินค้า — ค้น/กรองตามหมวดเร็วขึ้น
create index if not exists tmk_products_category_idx
  on public.tmk_products(category);
