-- ============================================================
-- TMK — คลัง/สต็อก + CRM (รวมทุก migration ของ 2 ระบบนี้เป็นไฟล์เดียว)
-- ============================================================
-- วางทั้งก้อนนี้ใน Supabase → SQL Editor → Run ครั้งเดียวจบ
-- รวมจาก: 20260702-ops-suite · 20260703-crm · 20260704-ops-advanced · 20260705-crm-advanced
-- idempotent (if not exists ทุกบรรทัด) · UI-gate (disable RLS + grant anon/authenticated) เหมือนตาราง tmk_* อื่น
-- *** ของระบบ "คลัง + CRM" เท่านั้น — ไม่แตะตารางระบบ Sale (tmk_mp_*/tmk_targets/tmk_monthly_rollup) ***
-- graceful: โค้ดฝั่งเว็บทำงานได้แม้ยังไม่รัน (ฟีเจอร์ที่ต้องตารางใหม่จะโชว์ป้ายเตือน)
-- ============================================================

-- ========== ระบบคลัง: ซัพพลายเออร์ + ตรวจนับ + ฟิลด์เสริมสินค้า ==========
create table if not exists public.tmk_suppliers (
  id text primary key, name text not null, contact text, phone text,
  lead_time_days int default 0, note text, deleted_at timestamptz, updated_at timestamptz default now()
);
create table if not exists public.tmk_stock_counts (
  id text primary key, count_date date, status text default 'open',
  lines jsonb default '[]'::jsonb, note text, created_by text, updated_at timestamptz default now()
);
alter table public.tmk_products add column if not exists supplier_id text;
alter table public.tmk_products add column if not exists reorder_qty int;
alter table public.tmk_products add column if not exists lead_time_days int;

-- ========== ระบบคลัง: รับคืน/RMA + ที่เก็บ + idempotency ตัดสต็อกจากยอดขาย ==========
create table if not exists public.tmk_returns (
  id text primary key, order_code text, customer_key text, customer_name text,
  lines jsonb default '[]'::jsonb, action text default 'restock', refund numeric default 0,
  status text default 'done', note text, created_by text, created_at timestamptz default now()
);
create table if not exists public.tmk_locations (
  id text primary key, name text not null, type text default 'warehouse', note text, updated_at timestamptz default now()
);
create table if not exists public.tmk_channel_events (
  id text primary key, channel text, order_no text, product_code text,
  qty numeric default 0, kind text default 'deduct', created_by text, created_at timestamptz default now()
);
create index if not exists idx_channel_events_order on public.tmk_channel_events(order_no);

-- ========== CRM: tags + งานติดตาม ==========
create table if not exists public.tmk_crm_tags (
  id text primary key, name text not null, color text default 'slate', updated_at timestamptz default now()
);
create table if not exists public.tmk_crm_customer_tags (
  id text primary key, customer_key text not null, tag_id text not null, updated_at timestamptz default now()
);
create index if not exists idx_crm_cust_tags_key on public.tmk_crm_customer_tags(customer_key);
create table if not exists public.tmk_crm_followups (
  id text primary key, customer_key text not null, customer_name text, title text not null,
  due_date date, status text default 'open', note text, created_by text, updated_at timestamptz default now()
);
create index if not exists idx_crm_followups_status on public.tmk_crm_followups(status, due_date);

-- ========== CRM: timeline + pipeline + รวมลูกค้าซ้ำ + แคมเปญ ==========
create table if not exists public.tmk_crm_activities (
  id text primary key, customer_key text not null, kind text default 'note', body text, at timestamptz default now(), by text
);
create index if not exists idx_crm_act_key on public.tmk_crm_activities(customer_key, at desc);
create table if not exists public.tmk_crm_deals (
  id text primary key, customer_key text, customer_name text, title text not null, value numeric default 0,
  stage text default 'lead', owner text, due_date date, note text, updated_at timestamptz default now()
);
create index if not exists idx_crm_deals_stage on public.tmk_crm_deals(stage);
create table if not exists public.tmk_crm_merge (
  id text primary key, from_key text not null, to_key text not null, updated_at timestamptz default now()
);
create table if not exists public.tmk_crm_campaigns (
  id text primary key, name text, channel text default 'line', segment text, message text,
  recipients int default 0, sent int default 0, status text default 'draft', created_by text, created_at timestamptz default now()
);

-- ========== สิทธิ์ (grant anon/authenticated) + ปิด RLS (UI-gate เหมือน tmk_* อื่น) ==========
grant select, insert, update, delete on
  public.tmk_suppliers, public.tmk_stock_counts, public.tmk_returns, public.tmk_locations, public.tmk_channel_events,
  public.tmk_crm_tags, public.tmk_crm_customer_tags, public.tmk_crm_followups,
  public.tmk_crm_activities, public.tmk_crm_deals, public.tmk_crm_merge, public.tmk_crm_campaigns
  to anon, authenticated;

alter table public.tmk_suppliers          disable row level security;
alter table public.tmk_stock_counts       disable row level security;
alter table public.tmk_returns            disable row level security;
alter table public.tmk_locations          disable row level security;
alter table public.tmk_channel_events     disable row level security;
alter table public.tmk_crm_tags           disable row level security;
alter table public.tmk_crm_customer_tags  disable row level security;
alter table public.tmk_crm_followups      disable row level security;
alter table public.tmk_crm_activities     disable row level security;
alter table public.tmk_crm_deals          disable row level security;
alter table public.tmk_crm_merge          disable row level security;
alter table public.tmk_crm_campaigns      disable row level security;
