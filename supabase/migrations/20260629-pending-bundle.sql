-- ============================================================
-- BUNDLE migration — รวม migration ที่ยังค้าง 3 ตัวไว้รันครั้งเดียว
-- จบ toast "บันทึกแล้ว — แต่ … ยังไม่เก็บ (รัน migration ก่อน)" ทั้งหมด
-- idempotent (if not exists ทุกบรรทัด) · UI-gate (disable RLS + grant) เหมือนตาราง tmk_* อื่น
-- วางทั้งก้อนนี้ใน Supabase → SQL Editor → Run ครั้งเดียว
-- (ครอบ 20260627-overrides + 20260628-shirt-class + คอลัมน์ images ใหม่)
-- ============================================================

-- ── 1) Override layer (ฆ่าการ reimport) — จาก 20260627-overrides.sql ──────────
alter table public.tmk_shirt_catalog
  add column if not exists job_type text default 'ปลีก';

create table if not exists public.tmk_order_overrides (
  order_id text primary key,            -- "<source>:<order_no>"
  job_type text,
  customer_name text,
  customer_type text,
  salesperson text,
  note text,
  updated_at timestamptz default now()
);

create table if not exists public.tmk_sku_overrides (
  key text primary key,                 -- "<order_no>::<normTerm(raw)>"
  order_no text,
  design text,
  product_code text,
  updated_at timestamptz default now()
);

create index if not exists tmk_order_ov_sp_idx  on public.tmk_order_overrides(salesperson);
create index if not exists tmk_sku_ov_ord_idx   on public.tmk_sku_overrides(order_no);

grant select, insert, update, delete on public.tmk_order_overrides to anon, authenticated;
grant select, insert, update, delete on public.tmk_sku_overrides   to anon, authenticated;
alter table public.tmk_order_overrides disable row level security;
alter table public.tmk_sku_overrides   disable row level security;

-- ── 2) กลุ่มเสื้อ (shirt_class) — จาก 20260628-shirt-class.sql ─────────────────
alter table public.tmk_shirt_catalog
  add column if not exists shirt_class text default 'เสื้อปกติ';

-- ── 3) หลายรูปต่อเสื้อ (images jsonb) — ใหม่ (PART 7) ─────────────────────────
-- เก็บ array ของ data-URL (รูปบีบอัดแล้ว); image เดิม = images[0] (รูปปก) ยังคงไว้เพื่อ backward-compat
alter table public.tmk_shirt_catalog
  add column if not exists images jsonb default '[]'::jsonb;
