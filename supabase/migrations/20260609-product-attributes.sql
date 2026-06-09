-- ============================================================
-- TMK Operation — ข้อมูลสินค้าเสริม: หมวดหมู่ / ซัพพลายเออร์ / SKU / บาร์โค้ด
-- ============================================================
-- ใช้กับหน้าแคตตาล็อก: จัดกลุ่มสินค้าตามหมวด, ค้นหาด้วย SKU/บาร์โค้ด,
-- รายงานกำไรแยกตามหมวดหมู่, รู้ว่าสั่งจากผู้ผลิตไหน
-- (แอปมี graceful fallback อยู่แล้ว — ถ้ายังไม่รัน SQL นี้ การบันทึกจะเตือนและข้ามคอลัมน์เหล่านี้)
-- รันใน Supabase SQL Editor
-- ============================================================

alter table public.tmk_products add column if not exists category text;
alter table public.tmk_products add column if not exists supplier text;
alter table public.tmk_products add column if not exists sku text;
alter table public.tmk_products add column if not exists barcode text;

comment on column public.tmk_products.category is 'หมวดหมู่สินค้า (เช่น เสื้อยืด, โปโล, แขนยาว)';
comment on column public.tmk_products.supplier is 'ผู้ผลิต/ซัพพลายเออร์';
comment on column public.tmk_products.sku is 'รหัสสินค้า SKU';
comment on column public.tmk_products.barcode is 'บาร์โค้ด';

create index if not exists tmk_products_category_idx on public.tmk_products(category);
