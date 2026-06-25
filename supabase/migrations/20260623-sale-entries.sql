-- ============================================================
-- tmk_sale_entries — เซลล์กรอกยอดขายเองในเว็บ (แทน Excel/Google Sheet)
-- แยกจาก tmk_mp_orders (กันนับซ้ำกับ import มาร์เก็ตเพลส) · เก็บ contact ลูกค้าใหม่ไว้ต่อยอด
-- idempotent · UI-gate (ปิด RLS + grant) — รันใน Supabase SQL Editor
-- ============================================================
create table if not exists public.tmk_sale_entries (
  id text primary key,                       -- gen: se-<rand>
  salesperson text not null default '',      -- ชื่อเซลล์
  order_date date not null,
  order_no text default '',                  -- เลขออเดอร์ (เชื่อม/กระทบยอดกับระบบได้)
  job_type text default '',                  -- DFT / ค้าปลีก / ส่ง / OEM ...
  payment_type text default '',              -- โอน / COD / มัดจำ ...
  customer_type text default '',             -- ใหม่ / เก่า
  customer_name text default '',             -- ชื่อลูกค้า (เน้นลูกค้าใหม่ → ต่อยอด)
  customer_contact text default '',          -- เบอร์/LINE/FB ไว้ติดตาม
  channel text default 'เซลล์',
  design text default '',                     -- ลาย (ถ้าเซลล์กรอก — optional)
  color text default '', size text default '',
  sales numeric default 0,
  qty numeric default 0,
  note text default '',
  created_by text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists tmk_sale_entries_date_idx on public.tmk_sale_entries(order_date);
create index if not exists tmk_sale_entries_sp_idx   on public.tmk_sale_entries(salesperson);
create index if not exists tmk_sale_entries_ord_idx  on public.tmk_sale_entries(order_no);
create index if not exists tmk_sale_entries_cust_idx on public.tmk_sale_entries(customer_type);

grant select, insert, update, delete on public.tmk_sale_entries to anon, authenticated;
alter table public.tmk_sale_entries disable row level security;
