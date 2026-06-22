-- ============================================================
-- TMK Operation — ระบบขายครบวงจร: SQL รวมทุกอย่างไฟล์เดียว (รันครั้งเดียวจบ)
-- 2026-06-23 · idempotent ทั้งหมด (รันซ้ำได้ ไม่พัง) · UI-gate (ปิด RLS + grant)
-- ============================================================
-- ไฟล์นี้รวมเนื้อหาของ:
--   20260622-mp-report.sql · 20260622b-mp-customers.sql · 20260623-mp-foundation.sql
--   + ตารางสำหรับโมดูล returns / settlements / OEM / size-curve / alerts
-- รันใน Supabase SQL Editor ทีเดียว แล้วระบบขายทั้งหมดพร้อมใช้
-- ============================================================

-- ========== 1) ระดับออเดอร์ (master) ==========
create table if not exists public.tmk_mp_orders (
  id text primary key, order_no text not null, source text not null,
  channel text, marketplace_id text, order_month text, salesperson text, province text,
  payment_type text, customer_type text, cust_total_orders numeric default 0,
  qty_band text, qty numeric default 0, sales numeric default 0, cost numeric default 0,
  mkt_commission numeric default 0, mkt_net_income numeric default 0, profit numeric default 0,
  cod_amount numeric default 0, job_type text, import_batch text, updated_at timestamptz default now()
);
-- CRM (จาก 20260622b)
alter table public.tmk_mp_orders add column if not exists customer_code   text;
alter table public.tmk_mp_orders add column if not exists customer_name   text;
alter table public.tmk_mp_orders add column if not exists customer_social text;
alter table public.tmk_mp_orders add column if not exists cust_total_spent numeric default 0;
-- Foundation (จาก 20260623): day-grain + เก็บยกเลิก/คืน + reconciliation + attrs
alter table public.tmk_mp_orders add column if not exists order_date date;
alter table public.tmk_mp_orders add column if not exists status text default 'active';
alter table public.tmk_mp_orders add column if not exists return_amount numeric default 0;
alter table public.tmk_mp_orders add column if not exists refund_reason text;
alter table public.tmk_mp_orders add column if not exists settlement_status text;
alter table public.tmk_mp_orders add column if not exists settled_amount numeric;
alter table public.tmk_mp_orders add column if not exists attrs jsonb default '{}'::jsonb;
create index if not exists tmk_mp_orders_month_idx   on public.tmk_mp_orders(order_month);
create index if not exists tmk_mp_orders_channel_idx on public.tmk_mp_orders(channel);
create index if not exists tmk_mp_orders_batch_idx   on public.tmk_mp_orders(import_batch);
create index if not exists tmk_mp_orders_cust_idx    on public.tmk_mp_orders(customer_code);
create index if not exists tmk_mp_orders_date_idx    on public.tmk_mp_orders(order_date);
create index if not exists tmk_mp_orders_status_idx  on public.tmk_mp_orders(status);
create index if not exists tmk_mp_orders_jobtype_idx on public.tmk_mp_orders(job_type);

-- ========== 2) ระดับ SKU (sku_master) ==========
create table if not exists public.tmk_mp_skus (
  id text primary key, order_no text not null, source text not null, channel text,
  product_code text, design text, color text, size text, qty numeric default 0,
  line_sales numeric default 0, raw_sku_or_name text, match_how text, order_month text,
  import_batch text, updated_at timestamptz default now()
);
alter table public.tmk_mp_skus add column if not exists order_date date;
alter table public.tmk_mp_skus add column if not exists attrs jsonb default '{}'::jsonb;
create index if not exists tmk_mp_skus_order_idx   on public.tmk_mp_skus(order_no);
create index if not exists tmk_mp_skus_month_idx   on public.tmk_mp_skus(order_month);
create index if not exists tmk_mp_skus_design_idx  on public.tmk_mp_skus(design);
create index if not exists tmk_mp_skus_channel_idx on public.tmk_mp_skus(channel);

-- ========== 3) ledger การนำเข้า (undo/rollback) ==========
create table if not exists public.tmk_mp_import_batches (
  id text primary key, source_files text, row_orders integer default 0, row_skus integer default 0,
  sales_total numeric default 0, qty_total integer default 0, channels text, month_span text,
  status text default 'active', created_at timestamptz default now(), created_by text
);
create index if not exists tmk_mp_import_batches_created_idx on public.tmk_mp_import_batches(created_at desc);

-- ========== 4) เป้า (targets) ==========
create table if not exists public.tmk_targets (
  id text primary key, scope_type text not null, scope_id text not null default '',
  year integer not null, month integer not null, target_sales numeric default 0,
  target_qty numeric default 0, note text, updated_at timestamptz default now()
);
create index if not exists tmk_targets_period_idx on public.tmk_targets(year, month);

-- ========== 5) saved views ==========
create table if not exists public.tmk_mp_views (
  id text primary key, name text not null, definition jsonb default '{}'::jsonb,
  is_shared boolean default true, owner text, updated_at timestamptz default now()
);

-- ========== 6) คืนสินค้า (returns/RMA) ==========
create table if not exists public.tmk_mp_returns (
  id text primary key, order_no text, source text, design text, color text, size text,
  qty numeric default 0, return_amount numeric default 0, reason text, return_type text,
  restock boolean default false, order_month text, created_at timestamptz default now()
);
create index if not exists tmk_mp_returns_order_idx on public.tmk_mp_returns(order_no);
create index if not exists tmk_mp_returns_month_idx on public.tmk_mp_returns(order_month);

-- ========== 7) settlement เงินเข้าจริง ==========
create table if not exists public.tmk_mp_settlements (
  id text primary key, order_no text, channel text, gmv numeric default 0,
  fee numeric default 0, net_income numeric default 0, status text, settled_at date,
  import_batch text, updated_at timestamptz default now()
);
create index if not exists tmk_mp_settlements_order_idx on public.tmk_mp_settlements(order_no);

-- ========== 8) งาน OEM/ราชการ + รายการ ==========
create table if not exists public.tmk_oem_jobs (
  id text primary key, customer text, agency text, quoted_price numeric default 0,
  moq numeric default 0, po_no text, stage text default 'สอบถาม', due_date date,
  invoice_no text, invoice_amount numeric default 0, paid_amount numeric default 0,
  payment_status text default 'unpaid', credit_term text, vat numeric default 0, wht numeric default 0,
  note text, sort_order numeric default 0, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.tmk_oem_lines (
  id text primary key, job_id text not null, design text, color text, size text,
  qty numeric default 0, unit_price numeric default 0
);
create index if not exists tmk_oem_lines_job_idx on public.tmk_oem_lines(job_id);

-- ========== 9) size curve (สะสมข้ามฤดู) + alerts ==========
create table if not exists public.tmk_mp_size_curve (
  id text primary key, design text, color text, month text,
  curve_json jsonb default '{}'::jsonb, broken_flags jsonb default '[]'::jsonb, updated_at timestamptz default now()
);
create table if not exists public.tmk_mp_alerts (
  id text primary key, kind text, severity text, title text, link text,
  dismissed boolean default false, created_at timestamptz default now()
);

-- ========== 10) สิทธิ์ + ปิด RLS ทุกตาราง (UI-gate) ==========
do $$
declare t text;
begin
  foreach t in array array[
    'tmk_mp_orders','tmk_mp_skus','tmk_mp_import_batches','tmk_targets','tmk_mp_views',
    'tmk_mp_returns','tmk_mp_settlements','tmk_oem_jobs','tmk_oem_lines','tmk_mp_size_curve','tmk_mp_alerts'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
    execute format('alter table public.%I disable row level security', t);
  end loop;
end $$;
