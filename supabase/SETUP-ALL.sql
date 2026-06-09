-- ============================================================
-- TMK Operation — Consolidated Setup (paste-once, idempotent)
-- ============================================================
-- ใช้สำหรับติดตั้ง Supabase ตั้งแต่ต้น หรือ sync schema กับโปรเจกต์ที่มีอยู่แล้ว
-- วาง 1 ครั้งใน Supabase Dashboard → SQL Editor → Run · รันซ้ำได้ ไม่พังของเดิม
--
-- ⚠️ ไฟล์นี้สร้างแค่ "โครงสร้าง + config จริง" เท่านั้น — ไม่มีข้อมูลธุรกิจปลอม
--    seed ที่ใส่: ตาราง/คอลัมน์/trigger/RLS + ช่องทาง(นิยาม,ตัวเลข=0) + หน้าที่ + ทีมงาน + settings(ว่าง)
--    ไม่ seed: ยอดขาย, ออร์เดอร์, สินค้า, แคมเปญ, กลุ่มลูกค้า, ข้อมูลรายเดือน, PO ฯลฯ
--    → ข้อมูลธุรกิจทั้งหมดมาจากการกรอกจริงในแอป
-- ============================================================

-- ============================================================
-- SECTION 1 — Helper function สำหรับ touch updated_at
-- ============================================================
create or replace function public.tmk_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- SECTION 2 — Base tables (10)
-- ============================================================
create table if not exists public.tmk_campaigns (
  id text primary key,
  name text not null,
  color text not null default '#3b82f6',
  bg text not null default '#eff6ff',
  border text not null default '#bfdbfe',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_channels (
  id text primary key,
  name text not null,
  percentage numeric not null default 0,
  actual numeric not null default 0,
  color text not null default '#3b82f6',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_products (
  id text primary key,
  name text not null,
  price numeric not null default 0,
  target_units integer not null default 0,
  actual_units integer not null default 0,
  stock_on_hand integer not null default 0,
  reserved_units integer not null default 0,
  reorder_point integer not null default 0,
  strategy text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_tasks (
  id text primary key,
  date date not null,
  date_end date,
  camp text references public.tmk_campaigns(id) on delete set null,
  title text not null,
  detail text not null default '',
  responsible text not null default '',
  channel text not null default '',
  status text not null default 'todo' check (status in ('todo', 'inprogress', 'review', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  reminder_days integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_task_checklist (
  id text primary key,
  task_id text not null references public.tmk_tasks(id) on delete cascade,
  text text not null,
  completed boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_task_comments (
  id text primary key,
  task_id text not null references public.tmk_tasks(id) on delete cascade,
  text text not null,
  author text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_task_attachments (
  id text primary key,
  task_id text not null references public.tmk_tasks(id) on delete cascade,
  label text not null default '',
  url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_purchase_orders (
  id text primary key,
  product text not null,
  quantity integer not null default 0,
  order_date date not null,
  arrival_date date not null,
  status text not null default 'Pending' check (status in ('Pending', 'Completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_settings (
  id text primary key default 'main',
  total_target numeric not null default 0,
  total_units_target integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_user_roles (
  email text primary key,
  role text not null default 'viewer',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  action text not null,
  details text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- SECTION 3 — Extended tables (8 new)
-- ============================================================
create table if not exists public.tmk_staff (
  id text primary key,
  name text not null,
  role text not null,
  email text not null,
  color text not null default '#3b82f6',
  avatar_url text default '',
  joined_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_daily_sales (
  id text primary key,
  date date not null,
  day_name text not null,
  shopee numeric not null default 0,
  tiktok numeric not null default 0,
  lazada numeric not null default 0,
  facebook numeric not null default 0,
  line_oa numeric not null default 0,
  crm numeric not null default 0,
  ad_spend numeric not null default 0,
  note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_ad_campaigns (
  id text primary key,
  name text not null,
  platform text not null,
  budget numeric not null default 0,
  spent numeric not null default 0,
  revenue numeric not null default 0,
  roas numeric not null default 0,
  acos numeric not null default 0,
  status text not null default 'live' check (status in ('upcoming', 'live', 'done', 'paused', 'cancelled')),
  start_date date,
  end_date date,
  goal text default 'Conversion',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_customer_segments (
  id text primary key,
  name text not null,
  count integer not null default 0,
  rev_pct numeric not null default 0,
  color text not null default '#3b82f6',
  criteria text not null,
  avg_clv numeric not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_fb_metrics (
  id text primary key default 'current',
  revenue numeric not null default 0,
  spend numeric not null default 0,
  inquiries integer not null default 0,
  orders integer not null default 0,
  new_cust integer not null default 0,
  old_cust integer not null default 0,
  avg_reply_minutes integer not null default 0,
  month integer not null default 6,
  year integer not null default 2569,
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_monthly_history (
  id text primary key,
  month integer not null,
  year integer not null,
  month_th text not null,
  target numeric not null default 0,
  actual numeric not null default 0,
  projected numeric not null default 0,
  orders integer not null default 0,
  ad_spend numeric not null default 0,
  new_cust integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_color_mix (
  id text primary key,
  name text not null,
  hex text not null,
  pct numeric not null default 0,
  sort_order integer not null default 0,
  month integer not null default 6,
  year integer not null default 2569,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_size_mix (
  id text primary key,
  size text not null,
  pct numeric not null default 0,
  sort_order integer not null default 0,
  month integer not null default 6,
  year integer not null default 2569,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_duties (
  id text primary key,
  name text not null unique,
  color text not null default '#3b82f6',
  description text default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- SECTION 4 — ALTER existing tables (add columns, drop/add constraints)
-- ============================================================
alter table public.tmk_channels add column if not exists orders integer not null default 0;
alter table public.tmk_channels add column if not exists new_rev numeric not null default 0;
alter table public.tmk_channels add column if not exists old_rev numeric not null default 0;
alter table public.tmk_channels add column if not exists new_cust integer not null default 0;
alter table public.tmk_channels add column if not exists old_cust integer not null default 0;
alter table public.tmk_channels add column if not exists ad numeric not null default 0;
alter table public.tmk_channels add column if not exists has_ad boolean not null default false;
alter table public.tmk_channels add column if not exists growth_pct numeric not null default 0;
alter table public.tmk_channels add column if not exists sort_order integer not null default 0;
alter table public.tmk_channels add column if not exists icon text default '';
alter table public.tmk_channels add column if not exists logo_url text default '';

alter table public.tmk_campaigns add column if not exists start_date date;
alter table public.tmk_campaigns add column if not exists end_date date;
alter table public.tmk_campaigns add column if not exists status text not null default 'upcoming' check (status in ('upcoming', 'live', 'done'));
alter table public.tmk_campaigns add column if not exists channels text[] default '{}';
alter table public.tmk_campaigns add column if not exists sort_order integer not null default 0;

alter table public.tmk_settings add column if not exists acos_ceil numeric not null default 25;
alter table public.tmk_settings add column if not exists current_day integer not null default 18;
alter table public.tmk_settings add column if not exists days_in_month integer not null default 30;
alter table public.tmk_settings add column if not exists current_month integer not null default 6;
alter table public.tmk_settings add column if not exists current_year integer not null default 2569;
alter table public.tmk_settings add column if not exists ad_budget_total numeric not null default 150000;
alter table public.tmk_settings add column if not exists new_cust_target integer not null default 600;

alter table public.tmk_user_roles add column if not exists department text default '';
alter table public.tmk_user_roles add column if not exists name text default '';
alter table public.tmk_user_roles add column if not exists color text default '#3b82f6';
alter table public.tmk_user_roles add column if not exists duty_id text references public.tmk_duties(id) on delete set null;
alter table public.tmk_user_roles drop constraint if exists tmk_user_roles_role_check;
alter table public.tmk_user_roles add constraint tmk_user_roles_role_check check (role in ('admin', 'editor', 'viewer'));

-- Soft delete (ถังขยะ) — ลบแล้วเข้าถังขยะ กู้คืนได้
alter table public.tmk_tasks             add column if not exists deleted_at timestamptz;
alter table public.tmk_products          add column if not exists deleted_at timestamptz;
alter table public.tmk_campaigns         add column if not exists deleted_at timestamptz;
alter table public.tmk_channels          add column if not exists deleted_at timestamptz;
alter table public.tmk_duties            add column if not exists deleted_at timestamptz;
alter table public.tmk_purchase_orders   add column if not exists deleted_at timestamptz;
alter table public.tmk_ad_campaigns      add column if not exists deleted_at timestamptz;
alter table public.tmk_customer_segments add column if not exists deleted_at timestamptz;
alter table public.tmk_user_roles        add column if not exists deleted_at timestamptz;
alter table public.tmk_staff             add column if not exists deleted_at timestamptz;

-- FB messages รายเดือน (ข้อมูลจริงสำหรับกราฟจำนวนข้อความ)
alter table public.tmk_monthly_history   add column if not exists messages integer not null default 0;

-- ค่าตั้งค่ารายเดือน (เป้า/งบ/เป้าต่อช่อง ฯลฯ) เก็บแยกแต่ละเดือน
alter table public.tmk_monthly_history   add column if not exists meta jsonb not null default '{}'::jsonb;

-- รายละเอียดต่อช่องทางรายวัน (orders/ลูกค้า/แชท): { id: { rev, ord, ad, inq, newC, oldC } }
alter table public.tmk_daily_sales       add column if not exists channels jsonb not null default '{}'::jsonb;
-- เวลาตอบแชทเฉลี่ย/วัน (นาที)
alter table public.tmk_daily_sales       add column if not exists avg_reply_minutes numeric not null default 0;
-- soft-delete รายวัน (ลบ→ถังขยะ กู้คืนได้)
alter table public.tmk_daily_sales       add column if not exists deleted_at timestamptz;
create index if not exists tmk_daily_sales_deleted_idx on public.tmk_daily_sales(deleted_at);
-- ค่าธรรมเนียมแพลตฟอร์มจริงต่อช่องทาง (%) — ใช้คำนวณกำไรสุทธิแทน 5% ตายตัว
alter table public.tmk_channels          add column if not exists platform_fee_pct numeric not null default 0;

-- รูปสินค้า + ล็อต (batch) ต่อสินค้า — มีล็อต → สต็อก = ผลรวม qty ของทุกล็อต
alter table public.tmk_products          add column if not exists image_url text;
alter table public.tmk_products          add column if not exists lots jsonb not null default '[]'::jsonb;
-- ข้อมูลสินค้าเสริม: หมวดหมู่ / ซัพพลายเออร์ / SKU / บาร์โค้ด
alter table public.tmk_products          add column if not exists category text;
alter table public.tmk_products          add column if not exists supplier text;
alter table public.tmk_products          add column if not exists sku text;
alter table public.tmk_products          add column if not exists barcode text;
-- จองสต็อก (reservations) ต่อสินค้า — พร้อมขาย = สต็อก − จอง
alter table public.tmk_products          add column if not exists reservations jsonb not null default '[]'::jsonb;

-- snapshot มูลค่า/จำนวนคลังรวมต่อวัน (กราฟแนวโน้มในรายงาน)
create table if not exists public.tmk_inventory_snapshots (
  id text primary key, date date not null, units integer not null default 0,
  value numeric not null default 0, updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.tmk_inventory_snapshots to anon, authenticated;
alter table public.tmk_inventory_snapshots disable row level security;

-- ============================================================
-- SECTION 5 — Indexes
-- ============================================================
create index if not exists tmk_tasks_date_idx on public.tmk_tasks(date);
create index if not exists tmk_tasks_camp_idx on public.tmk_tasks(camp);
create index if not exists tmk_task_checklist_task_id_idx on public.tmk_task_checklist(task_id);
create index if not exists tmk_task_comments_task_id_idx on public.tmk_task_comments(task_id);
create index if not exists tmk_task_attachments_task_id_idx on public.tmk_task_attachments(task_id);
create index if not exists tmk_purchase_orders_arrival_date_idx on public.tmk_purchase_orders(arrival_date);
create index if not exists tmk_user_roles_role_idx on public.tmk_user_roles(role);
create index if not exists tmk_tasks_deleted_idx     on public.tmk_tasks(deleted_at);
create index if not exists tmk_products_deleted_idx  on public.tmk_products(deleted_at);
create index if not exists tmk_campaigns_deleted_idx on public.tmk_campaigns(deleted_at);

-- ============================================================
-- SECTION 6 — Triggers (drop+create = idempotent)
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'tmk_campaigns','tmk_channels','tmk_products','tmk_tasks','tmk_task_checklist',
    'tmk_task_comments','tmk_task_attachments','tmk_purchase_orders','tmk_user_roles',
    'tmk_staff','tmk_daily_sales','tmk_ad_campaigns','tmk_customer_segments',
    'tmk_fb_metrics','tmk_monthly_history','tmk_color_mix','tmk_size_mix','tmk_duties'
  ]
  loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', t, t);
    execute format('create trigger %I_touch_updated_at before update on public.%I for each row execute function public.tmk_touch_updated_at()', t, t);
  end loop;
end $$;

-- ============================================================
-- SECTION 7 — Replica identity + Realtime publication
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'tmk_campaigns','tmk_channels','tmk_products','tmk_tasks','tmk_task_checklist',
    'tmk_task_comments','tmk_task_attachments','tmk_purchase_orders','tmk_settings',
    'tmk_user_roles','tmk_audit_logs','tmk_staff','tmk_daily_sales','tmk_ad_campaigns',
    'tmk_customer_segments','tmk_fb_metrics','tmk_monthly_history','tmk_color_mix',
    'tmk_size_mix','tmk_duties'
  ]
  loop
    execute format('alter table public.%I replica identity full', t);
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ============================================================
-- SECTION 8 — Grants + Disable RLS
-- ============================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'tmk_campaigns','tmk_channels','tmk_products','tmk_tasks','tmk_task_checklist',
    'tmk_task_comments','tmk_task_attachments','tmk_purchase_orders','tmk_settings',
    'tmk_user_roles','tmk_audit_logs','tmk_staff','tmk_daily_sales','tmk_ad_campaigns',
    'tmk_customer_segments','tmk_fb_metrics','tmk_monthly_history','tmk_color_mix',
    'tmk_size_mix','tmk_duties'
  ]
  loop
    execute format('alter table public.%I disable row level security', t);
  end loop;
end $$;

-- ============================================================
-- SECTION 9 — Seed: Settings
-- ============================================================
-- เริ่มจากค่าว่าง (0) — เป้า/งบ ตั้งจริงในแอป (เก็บรายเดือนใน tmk_monthly_history)
insert into public.tmk_settings (id, total_target, total_units_target, acos_ceil, ad_budget_total, new_cust_target)
values ('main', 0, 0, 25, 0, 0)
on conflict (id) do nothing;

-- ============================================================
-- SECTION 10 — Seed: Channels (8 ช่องทาง — เฉพาะนิยาม, ตัวเลข = 0)
-- ตัวเลขยอดขาย/ออร์เดอร์/ค่าแอด ไม่ seed (มาจากการกรอกจริง)
-- on conflict do nothing — ไม่ทับช่องทางที่แก้ไว้แล้ว
-- ============================================================
insert into public.tmk_channels (id, name, percentage, actual, color, sort_order, has_ad, icon, logo_url) values
('shopee',   'Shopee',   0, 0, '#ee6a3a', 1, true,  '🛒', ''),
('tiktok',   'TikTok',   0, 0, '#18a0ab', 2, true,  '♪',  ''),
('lazada',   'Lazada',   0, 0, '#6b5ce0', 3, true,  '🛍', ''),
('facebook', 'Facebook', 0, 0, '#4a8be0', 4, true,  'f',  ''),
('line',     'LINE OA',  0, 0, '#06c755', 5, false, '💬', ''),
('crm',      'CRM',      0, 0, '#c08a3e', 6, false, '👥', '')
on conflict (id) do nothing;

-- ============================================================
-- SECTION 12 — Seed: Duties (8 canonical roles)
-- ============================================================
insert into public.tmk_duties (id, name, color, description, sort_order) values
('ceo',       'CEO',        '#b07d33', 'ผู้บริหารระดับสูง / เจ้าของแบรนด์',  1),
('headmkt',   'Head MKT',   '#0a5aa0', 'หัวหน้าทีมการตลาด',                  2),
('headstock', 'Head Stock', '#cf9026', 'หัวหน้าทีมสต็อก / Operations Lead',  3),
('admin',     'Admin',      '#2f9e6e', 'แอดมินหลังบ้าน',                     4),
('stock',     'Stock',      '#3b7ea1', 'ทีมสต็อก / Inventory',               5),
('mkt',       'MKT',        '#4a8be0', 'ทีมการตลาด / Performance',           6),
('graphic',   'Graphic',    '#6b5ce0', 'ทีมกราฟิก / Designer',               7),
('content',   'Content',    '#cf4d5c', 'ทีมคอนเทนต์ / Content Creator',      8)
on conflict (id) do update set
  name = excluded.name,
  color = excluded.color,
  description = excluded.description,
  sort_order = excluded.sort_order;

-- ============================================================
-- DONE — ตรวจสอบจำนวน rows
-- ============================================================
-- ============================================================
-- ลูกค้า + ออเดอร์ + ติดตามสถานะ (idempotent — รวมจาก 20260609-orders-customers.sql)
-- ============================================================
create table if not exists public.tmk_customers (
  id text primary key, code text, name text not null default '',
  phone text, line text, address text, note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.tmk_orders (
  id text primary key, code text not null, customer_id text, customer_name text not null default '',
  items jsonb not null default '[]'::jsonb, subtotal numeric not null default 0, discount numeric not null default 0,
  total numeric not null default 0, status text not null default 'pending', channel text,
  tracking_no text, carrier text, note text, status_log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists tmk_orders_code_idx   on public.tmk_orders(code);
create index if not exists tmk_orders_status_idx on public.tmk_orders(status);
create index if not exists tmk_orders_cust_idx   on public.tmk_orders(customer_id);
grant select, insert, update, delete on public.tmk_customers to anon, authenticated;
grant select, insert, update, delete on public.tmk_orders    to anon, authenticated;
alter table public.tmk_customers disable row level security;
alter table public.tmk_orders    disable row level security;
do $$ begin
  perform 1 from pg_proc where proname = 'tmk_touch_updated_at';
  if found then
    execute 'drop trigger if exists tmk_customers_touch_updated_at on public.tmk_customers';
    execute 'create trigger tmk_customers_touch_updated_at before update on public.tmk_customers for each row execute function public.tmk_touch_updated_at()';
    execute 'drop trigger if exists tmk_orders_touch_updated_at on public.tmk_orders';
    execute 'create trigger tmk_orders_touch_updated_at before update on public.tmk_orders for each row execute function public.tmk_touch_updated_at()';
  end if;
end $$;
do $$ begin
  alter table public.tmk_orders replica identity full;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tmk_orders') then
    alter publication supabase_realtime add table public.tmk_orders;
  end if;
  alter table public.tmk_customers replica identity full;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tmk_customers') then
    alter publication supabase_realtime add table public.tmk_customers;
  end if;
end $$;

-- ============================================================
-- VERIFY — นับแถวแต่ละตาราง
-- ============================================================
select 'tmk_channels'           as table_name, count(*) from public.tmk_channels
union all select 'tmk_campaigns',         count(*) from public.tmk_campaigns
union all select 'tmk_tasks',             count(*) from public.tmk_tasks
union all select 'tmk_products',          count(*) from public.tmk_products
union all select 'tmk_settings',          count(*) from public.tmk_settings
union all select 'tmk_duties',            count(*) from public.tmk_duties
union all select 'tmk_user_roles',        count(*) from public.tmk_user_roles
union all select 'tmk_staff',             count(*) from public.tmk_staff
union all select 'tmk_daily_sales',       count(*) from public.tmk_daily_sales
union all select 'tmk_ad_campaigns',      count(*) from public.tmk_ad_campaigns
union all select 'tmk_customer_segments', count(*) from public.tmk_customer_segments
union all select 'tmk_fb_metrics',        count(*) from public.tmk_fb_metrics
union all select 'tmk_monthly_history',   count(*) from public.tmk_monthly_history
union all select 'tmk_color_mix',         count(*) from public.tmk_color_mix
union all select 'tmk_size_mix',          count(*) from public.tmk_size_mix
union all select 'tmk_purchase_orders',   count(*) from public.tmk_purchase_orders
union all select 'tmk_orders',            count(*) from public.tmk_orders
union all select 'tmk_customers',         count(*) from public.tmk_customers;
