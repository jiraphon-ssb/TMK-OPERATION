-- ============================================================
-- TMK Operation — ระบบขายครบวงจร เฟส 1: Foundation — 2026-06-23
-- ============================================================
-- รากของทั้งระบบ (ตาม blueprint §2, §7) — ทำตอนนี้กัน re-import/รื้อทีหลัง
-- ปลอดภัย/เพิ่มเฉพาะ (idempotent) — รันใน Supabase SQL Editor ได้เลย
-- (รัน 20260622-mp-report.sql + 20260622b ก่อน)
-- ============================================================

-- ---- M2 day-grain: วันที่ระดับวัน (ปลดล็อก cohort/forecast/pacing/anomaly) ----
alter table public.tmk_mp_orders add column if not exists order_date date;
alter table public.tmk_mp_skus   add column if not exists order_date date;
create index if not exists tmk_mp_orders_date_idx on public.tmk_mp_orders(order_date);

-- ---- M3 เก็บออเดอร์ยกเลิก/คืน (one-way door — แทนการทิ้ง) ----
alter table public.tmk_mp_orders add column if not exists status text default 'active';
alter table public.tmk_mp_orders add column if not exists return_amount numeric default 0;
alter table public.tmk_mp_orders add column if not exists refund_reason text;
create index if not exists tmk_mp_orders_status_idx on public.tmk_mp_orders(status);

-- ---- M4 reconciliation เงินเข้าจริง ----
alter table public.tmk_mp_orders add column if not exists settlement_status text;
alter table public.tmk_mp_orders add column if not exists settled_amount numeric;

-- ---- M1 JSONB attrs (escape hatch กัน "death by a thousand migrations") ----
alter table public.tmk_mp_orders add column if not exists attrs jsonb default '{}'::jsonb;
alter table public.tmk_mp_skus   add column if not exists attrs jsonb default '{}'::jsonb;

-- ---- ledger การนำเข้า (append-only) → undo/rollback + audit "เลขนี้มาจากไฟล์ไหน" ----
create table if not exists public.tmk_mp_import_batches (
  id            text primary key,        -- imp-<ts>
  source_files  text,                    -- ชื่อไฟล์ที่อัปโหลด (คั่นด้วย ,)
  row_orders    integer default 0,
  row_skus      integer default 0,
  sales_total   numeric default 0,
  qty_total     integer default 0,
  channels      text,                     -- ช่องทางที่พบ
  month_span    text,                     -- เดือนที่ครอบคลุม
  status        text default 'active',    -- active | superseded | rolled_back
  created_at    timestamptz default now(),
  created_by    text
);
create index if not exists tmk_mp_import_batches_created_idx on public.tmk_mp_import_batches(created_at desc);

-- ---- เป้า (scope generic: overall/channel/salesperson/design/job_type) ----
create table if not exists public.tmk_targets (
  id          text primary key,           -- scope_type:scope_id:year:month
  scope_type  text not null,              -- overall | channel | salesperson | design | job_type
  scope_id    text not null default '',
  year        integer not null,
  month       integer not null,           -- 1-12 (0 = ทั้งปี)
  target_sales numeric default 0,
  target_qty   numeric default 0,
  note        text,
  updated_at  timestamptz default now()
);
create index if not exists tmk_targets_period_idx on public.tmk_targets(year, month);

-- ---- saved views (มุมมองที่บันทึก) ----
create table if not exists public.tmk_mp_views (
  id          text primary key,
  name        text not null,
  definition  jsonb default '{}'::jsonb,  -- {range, lens, compare, tab, sort, v}
  is_shared   boolean default true,
  owner       text,
  updated_at  timestamptz default now()
);

-- ---- สิทธิ์ + ปิด RLS (เหมือน sibling ทุกตาราง — UI-gate) ----
grant select, insert, update, delete on public.tmk_mp_import_batches to anon, authenticated;
grant select, insert, update, delete on public.tmk_targets           to anon, authenticated;
grant select, insert, update, delete on public.tmk_mp_views          to anon, authenticated;
alter table public.tmk_mp_import_batches disable row level security;
alter table public.tmk_targets           disable row level security;
alter table public.tmk_mp_views          disable row level security;
