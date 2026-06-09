-- ============================================================
-- TMK Operation — จองสต็อก (reservations) + snapshot มูลค่าคลังตามเวลา
-- ============================================================
-- reservations: รายการจองต่อสินค้า [{ id, customer, date, note, items:[{color,size,qty}] }]
--   พร้อมขาย (ATP) = สต็อกคงเหลือ − จองรวม
-- tmk_inventory_snapshots: บันทึกมูลค่า/จำนวนสต็อกรวมทั้งร้าน 1 แถวต่อวัน → กราฟแนวโน้ม
-- (แอปมี graceful fallback — ถ้ายังไม่รัน จองจะเตือน, กราฟมูลค่าคลังจะว่างจนกว่าจะมี snapshot)
-- รันใน Supabase SQL Editor
-- ============================================================

alter table public.tmk_products
  add column if not exists reservations jsonb not null default '[]'::jsonb;

comment on column public.tmk_products.reservations is
  'รายการจองสต็อก: [{ id, customer, date, note, items:[{color,size,qty}] }]; พร้อมขาย = สต็อก − จอง';

create table if not exists public.tmk_inventory_snapshots (
  id    text primary key,            -- = วันที่ 'YYYY-MM-DD' (1 แถว/วัน)
  date  date not null,
  units integer not null default 0,
  value numeric not null default 0,   -- มูลค่าต้นทุนคงคลังรวม
  updated_at timestamptz not null default now()
);

-- สิทธิ์เหมือนตารางอื่นในแอป (anon ใช้งานได้ + ปิด RLS)
grant select, insert, update, delete on public.tmk_inventory_snapshots to anon, authenticated;
alter table public.tmk_inventory_snapshots disable row level security;
