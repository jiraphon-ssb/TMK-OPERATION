-- ============================================================
-- TMK Operation — รายงานรวมยอดขายข้ามช่องทาง (marketplace multi-channel) — 2026-06-22
-- ============================================================
-- เก็บผลการ "รวมไฟล์ขาย" (Shipnity spine + Shopee/TikTok เสริม) ที่ประมวลผลในเว็บแล้ว
-- 2 ตาราง: ระดับออเดอร์ (master) + ระดับ SKU (sku_master)
-- ปลอดภัย/เพิ่มเฉพาะ (idempotent) — รันใน Supabase SQL Editor ได้เลย ไม่กระทบตารางเดิม
-- โมเดลสิทธิ์: เหมือนทุกตารางในระบบ (UI-gate, ปิด RLS, grant anon/authenticated)
--
-- กันนับซ้ำข้ามเดือน:
--   * orders: PK = source:order_no → upsert ทับ (อัปโหลดเดือนเดิมซ้ำ = แทนที่ ไม่บวก)
--   * skus  : PK = source:order_no:line_index (deterministic) + แอปลบ sku ของ order_no
--             ที่จะนำเข้าก่อน insert ใหม่ (กันบรรทัดเก่าค้างเมื่อจำนวนบรรทัดเปลี่ยน)
-- ============================================================

-- ---- ระดับออเดอร์ (1 แถว = 1 ออเดอร์) ----
create table if not exists public.tmk_mp_orders (
  id                text primary key,          -- source:order_no
  order_no          text not null,
  source            text not null,             -- shipnity | tiktok
  channel           text,                      -- Shopee/Lazada/Facebook/LINE/Phone/POS/Direct/TikTok
  marketplace_id    text,
  order_month       text,                      -- YYYY-MM
  salesperson       text,
  province          text,
  payment_type      text,
  customer_type     text,                      -- ลูกค้าใหม่/เก่า/ไม่ทราบ (TikTok)
  cust_total_orders numeric default 0,
  qty_band          text,
  qty               numeric default 0,
  sales             numeric default 0,
  cost              numeric default 0,
  mkt_commission    numeric default 0,
  mkt_net_income    numeric default 0,
  profit            numeric default 0,
  cod_amount        numeric default 0,
  job_type          text,                      -- เผื่ออนาคต (ปลีก/ส่ง/OEM)
  import_batch      text,
  updated_at        timestamptz default now()
);
create index if not exists tmk_mp_orders_month_idx   on public.tmk_mp_orders(order_month);
create index if not exists tmk_mp_orders_channel_idx on public.tmk_mp_orders(channel);
create index if not exists tmk_mp_orders_batch_idx   on public.tmk_mp_orders(import_batch);

-- ---- ระดับ SKU (1 แถว = 1 รายการสินค้าในออเดอร์) ----
create table if not exists public.tmk_mp_skus (
  id               text primary key,           -- source:order_no:line_index
  order_no         text not null,
  source           text not null,              -- shopee | shipnity | tiktok
  channel          text,
  product_code     text,                       -- รหัสในแคตตาล็อก (อาจว่างถ้าจับได้แค่ลาย)
  design           text,                       -- ลาย (design_key) — รวมหลาย LOT
  color            text,
  size             text,
  qty              numeric default 0,
  line_sales       numeric default 0,          -- เป๊ะ (Shopee/TikTok) / เฉลี่ยตามชิ้น (Shipnity-direct)
  raw_sku_or_name  text,
  match_how        text,                       -- code/name/label/paren/listing
  order_month      text,
  import_batch     text,
  updated_at       timestamptz default now()
);
create index if not exists tmk_mp_skus_order_idx  on public.tmk_mp_skus(order_no);
create index if not exists tmk_mp_skus_month_idx  on public.tmk_mp_skus(order_month);
create index if not exists tmk_mp_skus_design_idx on public.tmk_mp_skus(design);
create index if not exists tmk_mp_skus_channel_idx on public.tmk_mp_skus(channel);

-- ---- สิทธิ์ + ปิด RLS (เหมือน sibling ทุกตาราง — UI-gate) ----
grant select, insert, update, delete on public.tmk_mp_orders to anon, authenticated;
grant select, insert, update, delete on public.tmk_mp_skus   to anon, authenticated;
alter table public.tmk_mp_orders disable row level security;
alter table public.tmk_mp_skus   disable row level security;
