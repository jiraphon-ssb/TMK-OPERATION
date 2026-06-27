-- ============================================================
-- Override Layer — ฆ่าการ reimport บ่อยๆ
-- หลักการ: frozen data (tmk_mp_skus/tmk_mp_orders ตอน import) = baseline แตะไม่ได้
--          override = ชั้นบนที่แก้ในเว็บ · แสดงผล = merge override ทับ frozen ตอน read
--          → reimport เขียนทับแค่ baseline ไม่แตะ override → ของที่แก้มืออยู่รอดเสมอ
-- idempotent · UI-gate (ปิด RLS + grant) — รันใน Supabase SQL Editor
-- ============================================================

-- 1) job_type ในแคตตาล็อก (ปลีก/OEM/DFT) — ใช้กับ filter + edit form + live-resolve
alter table public.tmk_shirt_catalog
  add column if not exists job_type text default 'ปลีก';

-- 2) override ระดับออเดอร์ (key = order_id "source:order_no" — เสถียรข้าม reimport)
create table if not exists public.tmk_order_overrides (
  order_id text primary key,            -- "<source>:<order_no>" เช่น "shopee:2406XXXX"
  job_type text,                        -- ปลีก / OEM / DFT
  customer_name text,
  customer_type text,                   -- ใหม่ / เก่า
  salesperson text,
  note text,
  updated_at timestamptz default now()
);

-- 3) override ระดับบรรทัด SKU (key = "order_no::norm(raw_sku_or_name)" — อิงเนื้อหา)
create table if not exists public.tmk_sku_overrides (
  key text primary key,                 -- "<order_no>::<normTerm(raw)>"
  order_no text,
  design text,                          -- ลายที่แก้มือ
  product_code text,                    -- รหัสที่แก้มือ
  updated_at timestamptz default now()
);

create index if not exists tmk_order_ov_sp_idx  on public.tmk_order_overrides(salesperson);
create index if not exists tmk_sku_ov_ord_idx   on public.tmk_sku_overrides(order_no);

-- grants + ปิด RLS เหมือนตาราง tmk_* อื่น (UI-gate, anon เข้าถึงได้)
grant select, insert, update, delete on public.tmk_order_overrides to anon, authenticated;
grant select, insert, update, delete on public.tmk_sku_overrides   to anon, authenticated;
alter table public.tmk_order_overrides disable row level security;
alter table public.tmk_sku_overrides   disable row level security;
