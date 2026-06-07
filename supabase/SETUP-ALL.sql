-- ============================================================
-- TMK Operation — Consolidated Setup (paste-once, idempotent)
-- ============================================================
-- ใช้สำหรับติดตั้ง Supabase ตั้งแต่ต้น หรือ sync schema/seed กับโปรเจกต์ที่มีอยู่แล้ว
-- วาง 1 ครั้งใน Supabase Dashboard → SQL Editor → Run
-- รัน 2-3 ครั้งซ้ำได้ — ไม่พังของเดิม
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
  status text not null default 'live' check (status in ('upcoming', 'live', 'done', 'paused')),
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
insert into public.tmk_settings (id, total_target, total_units_target, acos_ceil, current_day, days_in_month, current_month, current_year, ad_budget_total, new_cust_target)
values ('main', 1000000, 3850, 25, 18, 30, 6, 2569, 150000, 600)
on conflict (id) do update set
  total_target = excluded.total_target,
  total_units_target = excluded.total_units_target,
  acos_ceil = excluded.acos_ceil,
  current_day = excluded.current_day,
  days_in_month = excluded.days_in_month,
  current_month = excluded.current_month,
  current_year = excluded.current_year,
  ad_budget_total = excluded.ad_budget_total,
  new_cust_target = excluded.new_cust_target;

-- ============================================================
-- SECTION 10 — Seed: Channels (6) + icons + logos
-- ============================================================
insert into public.tmk_channels (id, name, percentage, actual, color, sort_order, orders, new_rev, old_rev, new_cust, old_cust, ad, has_ad, growth_pct, icon, logo_url) values
('shopee',   'Shopee',   300000, 178000, '#ee6a3a', 1, 312, 124600, 53400, 196, 71, 28000, true, 15, '🛒', ''),
('tiktok',   'TikTok',   220000, 134000, '#18a0ab', 2, 248, 104500, 29500, 168, 39, 31000, true, 18, '♪',  ''),
('lazada',   'Lazada',   180000,  89000, '#6b5ce0', 3, 151,  66750, 22250,  92, 28, 15000, true,  8, '🛍', ''),
('facebook', 'Facebook', 160000,  78000, '#4a8be0', 4, 119,  56160, 21840,  64, 24, 42000, true, 12, 'f',  ''),
('line',     'LINE OA',   90000,  50000, '#06c755', 5,  58,  17500, 32500,  12, 34,     0, false, 6, '💬', ''),
('crm',      'CRM',       50000,  29000, '#c08a3e', 6,  31,   3480, 25520,   4, 32,     0, false, 9, '👥', '')
on conflict (id) do update set
  name = excluded.name,
  percentage = excluded.percentage,
  actual = excluded.actual,
  color = excluded.color,
  sort_order = excluded.sort_order,
  orders = excluded.orders,
  new_rev = excluded.new_rev,
  old_rev = excluded.old_rev,
  new_cust = excluded.new_cust,
  old_cust = excluded.old_cust,
  ad = excluded.ad,
  has_ad = excluded.has_ad,
  growth_pct = excluded.growth_pct,
  icon = excluded.icon;

-- ============================================================
-- SECTION 11 — Seed: Campaigns (5, ชื่อจริงตามที่ user ใช้)
-- ============================================================
insert into public.tmk_campaigns (id, name, color, bg, border, sort_order, start_date, end_date, status, channels) values
('c1', 'เปิดตัวลายใหม่ 1',     '#0a5aa0', '#eff5fd', '#cfddf6', 1, '2026-06-12', '2026-06-18', 'live',     ARRAY['shopee','tiktok','lazada']),
('c2', 'โล๊ะสต็อก & เสื้อสีดำ', '#1c1c1c', '#f3f4f6', '#d1d5db', 2, '2026-06-25', '2026-06-30', 'upcoming', ARRAY['shopee','facebook','line']),
('c3', 'ลายใหม่ 2',             '#2f9e6e', '#ebf7f1', '#cae8d8', 3, '2026-06-20', '2026-07-05', 'upcoming', ARRAY['tiktok','facebook']),
('c4', 'CRM Win-back',          '#c08a3e', '#fbf3e5', '#f0dfb8', 4, '2026-06-10', '2026-06-24', 'live',     ARRAY['line','crm']),
('c5', '6.6 Mega Sale',         '#4a8be0', '#eff5fd', '#cfddf6', 5, '2026-06-01', '2026-06-06', 'done',     ARRAY['shopee','tiktok','lazada','facebook'])
on conflict (id) do update set
  name = excluded.name,
  color = excluded.color,
  bg = excluded.bg,
  border = excluded.border,
  sort_order = excluded.sort_order,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  status = excluded.status,
  channels = excluded.channels;

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
-- SECTION 13 — Seed: Staff (11 canonical)
-- ============================================================
insert into public.tmk_staff (id, name, role, email, color, joined_at) values
('s-ceo',     'มัง',      'CEO',        'ceo@tmk.co',              '#b07d33', '2024-01-15'),
('s-headmkt', 'Head MKT', 'Head MKT',   'headmkt@tmk.co',          '#0a5aa0', '2024-02-01'),
('s-mung',    'มัง',      'Head Stock', 'headstock@tmk.co',        '#cf9026', '2024-01-01'),
('s-admin',   'Admin',    'Admin',      'admin@tmk.co',            '#2f9e6e', '2024-02-01'),
('s-admin2',  'Admin 2',  'Admin',      'admin2@tmk.co',           '#2f9e6e', '2024-03-15'),
('s-stock',   'Stock',    'Stock',      'stock@tmk.co',            '#3b7ea1', '2024-03-01'),
('s-mkt',     'MKT',      'MKT',        'mkt@tmk.co',              '#4a8be0', '2024-03-01'),
('s-mkt2',    'MKT 2',    'MKT',        'mkt2@tmk.co',             '#4a8be0', '2024-04-01'),
('s-graphic', 'Graphic',  'Graphic',    'graphic@tmk.co',          '#6b5ce0', '2024-04-15'),
('s-content', 'Content',  'Content',    'content@tmk.co',          '#cf4d5c', '2024-05-01'),
('s-test',    'TMK Test', 'Admin',      'tmktestweb@workspace.co', '#cf9026', '2024-06-01')
on conflict (id) do update set
  name = excluded.name,
  role = excluded.role,
  email = excluded.email,
  color = excluded.color,
  joined_at = excluded.joined_at;

-- ============================================================
-- SECTION 14 — Seed: User Roles (11)
-- ============================================================
insert into public.tmk_user_roles (email, role, name, department, duty_id, color, created_by) values
('ceo@tmk.co',              'admin',  'มัง',     'CEO',        'ceo',       '#b07d33', 'system'),
('headmkt@tmk.co',          'admin',  'Head MKT', 'Head MKT',   'headmkt',   '#0a5aa0', 'system'),
('headstock@tmk.co',        'admin',  'มัง',     'Head Stock', 'headstock', '#cf9026', 'system'),
('admin@tmk.co',            'admin',  'Admin',    'Admin',      'admin',     '#2f9e6e', 'system'),
('admin2@tmk.co',           'editor', 'Admin 2',  'Admin',      'admin',     '#2f9e6e', 'system'),
('stock@tmk.co',            'editor', 'Stock',    'Stock',      'stock',     '#3b7ea1', 'system'),
('mkt@tmk.co',              'editor', 'MKT',      'MKT',        'mkt',       '#4a8be0', 'system'),
('mkt2@tmk.co',             'editor', 'MKT 2',    'MKT',        'mkt',       '#4a8be0', 'system'),
('graphic@tmk.co',          'editor', 'Graphic',  'Graphic',    'graphic',   '#6b5ce0', 'system'),
('content@tmk.co',          'editor', 'Content',  'Content',    'content',   '#cf4d5c', 'system'),
('tmktestweb@workspace.co', 'admin',  'TMK Test', 'Admin',      'admin',     '#cf9026', 'system')
on conflict (email) do update set
  role = excluded.role,
  name = excluded.name,
  department = excluded.department,
  duty_id = excluded.duty_id,
  color = excluded.color;

-- ============================================================
-- SECTION 15 — Seed: Daily Sales (18 วัน มิ.ย. 2569)
-- ============================================================
insert into public.tmk_daily_sales (id, date, day_name, shopee, tiktok, lazada, facebook, line_oa, crm, ad_spend, note) values
('d-2026-06-01', '2026-06-01', 'จ',  9000,  7000, 4000, 3500, 2500, 1500, 6500, '6.6 Mega Sale Day 1'),
('d-2026-06-02', '2026-06-02', 'อ',  9500,  7200, 4100, 3600, 2600, 1500, 6800, '6.6 Day 2'),
('d-2026-06-03', '2026-06-03', 'พ', 10500,  8000, 4500, 3900, 2800, 1600, 7200, '6.6 Day 3 ยอดพีค'),
('d-2026-06-04', '2026-06-04', 'พฤ', 9800,  7500, 4300, 3700, 2700, 1500, 6900, '6.6 Day 4'),
('d-2026-06-05', '2026-06-05', 'ศ',  9200,  7100, 4100, 3500, 2600, 1500, 6600, '6.6 Day 5'),
('d-2026-06-06', '2026-06-06', 'ส', 11500,  8800, 5100, 4400, 3100, 1900, 7600, '6.6 Day 6 สุดท้าย'),
('d-2026-06-07', '2026-06-07', 'อา', 10800, 8300, 4800, 4200, 2900, 1800, 7100, 'หลังจบ 6.6'),
('d-2026-06-08', '2026-06-08', 'จ',  8500,  6800, 3900, 3400, 2500, 1400, 6200, ''),
('d-2026-06-09', '2026-06-09', 'อ',  8800,  7000, 4000, 3500, 2600, 1500, 6400, 'ประชุมทีม weekly'),
('d-2026-06-10', '2026-06-10', 'พ',  9200,  7300, 4100, 3700, 2700, 1500, 6700, 'CRM Win-back เริ่ม'),
('d-2026-06-11', '2026-06-11', 'พฤ', 8900,  7100, 4000, 3500, 2600, 1500, 6300, 'เช็คสต็อก'),
('d-2026-06-12', '2026-06-12', 'ศ',  8900,  7100, 3900, 3500, 2600, 1300, 6200, 'Flash Sale เริ่ม'),
('d-2026-06-13', '2026-06-13', 'พฤ',10200, 7900, 4400, 4100, 2700, 1700, 6500, 'ปล่อย LE drop'),
('d-2026-06-14', '2026-06-14', 'ศ',  9800, 7400, 4200, 3900, 2700, 1900, 6800, ''),
('d-2026-06-15', '2026-06-15', 'ส', 12800, 9600, 5700, 4900, 3100, 1900, 7400, 'เสาร์ flash mid'),
('d-2026-06-16', '2026-06-16', 'อา',14000,10500, 6200, 5400, 3600, 2300, 7800, 'ยอดพีคของเดือน'),
('d-2026-06-17', '2026-06-17', 'จ',  9200, 7800, 4100, 3600, 2900, 1400, 6100, ''),
('d-2026-06-18', '2026-06-18', 'อ', 11000, 8500, 4800, 4200, 2800, 1700, 7000, 'วันนี้ — Live เย็น 1 รอบ')
on conflict (id) do nothing;

-- ============================================================
-- SECTION 16 — Seed: Ad Campaigns (5)
-- ============================================================
insert into public.tmk_ad_campaigns (id, name, platform, budget, spent, revenue, roas, acos, status, start_date, end_date, goal) values
('ac1', 'Polo Signature — Awareness', 'Facebook', 45000, 38000, 106400, 2.8, 35.7, 'live',     '2026-06-01', '2026-06-30', 'Awareness'),
('ac2', 'Flash Sale Mid-Month',        'TikTok',   35000, 31000, 133300, 4.3, 23.3, 'live',     '2026-06-12', '2026-06-18', 'Conversion'),
('ac3', 'Linen Summer Launch',         'Facebook', 40000, 12000,  22800, 1.9, 52.6, 'upcoming', '2026-06-20', '2026-07-05', 'Conversion'),
('ac4', 'Retargeting — Cart Abandon',  'Shopee',   30000, 28000, 142800, 5.1, 19.6, 'done',     '2026-05-15', '2026-06-05', 'Retargeting'),
('ac5', 'Payday Push — Search',        'Lazada',   25000,  7000,  14000, 2.0, 50.0, 'upcoming', '2026-06-25', '2026-06-30', 'Conversion')
on conflict (id) do nothing;

-- ============================================================
-- SECTION 17 — Seed: Customer Segments (4)
-- ============================================================
insert into public.tmk_customer_segments (id, name, count, rev_pct, color, criteria, avg_clv, sort_order) values
('seg1', 'VIP',      45, 35, 'var(--accent)', 'ซื้อ ≥5 ครั้ง หรือ ยอด ≥10,000฿/เดือน', 8500, 1),
('seg2', 'Regular', 180, 40, 'var(--good)',   'ซื้อ 2-4 ครั้งใน 3 เดือน',                3200, 2),
('seg3', 'At-risk',  80, 15, 'var(--warn)',   'ไม่ซื้อ 30-60 วัน',                       1500, 3),
('seg4', 'Churned', 120, 10, 'var(--bad)',    'ไม่ซื้อ >60 วัน',                          850, 4)
on conflict (id) do nothing;

-- ============================================================
-- SECTION 18 — Seed: FB Metrics
-- ============================================================
insert into public.tmk_fb_metrics (id, revenue, spend, inquiries, orders, new_cust, old_cust, avg_reply_minutes, month, year) values
('current', 78000, 42000, 420, 119, 78, 41, 8, 6, 2569)
on conflict (id) do update set
  revenue = excluded.revenue,
  spend = excluded.spend,
  inquiries = excluded.inquiries,
  orders = excluded.orders,
  new_cust = excluded.new_cust,
  old_cust = excluded.old_cust,
  avg_reply_minutes = excluded.avg_reply_minutes,
  month = excluded.month,
  year = excluded.year;

-- ============================================================
-- SECTION 19 — Seed: Monthly History (18 เดือน: 12 ของ 2568 + 6 ของ 2569)
-- ============================================================
insert into public.tmk_monthly_history (id, month, year, month_th, target, actual, projected, orders, ad_spend, new_cust) values
('2568-01',  1, 2568, 'ม.ค.',   800000,  720000,      0, 1180, 110000, 450),
('2568-02',  2, 2568, 'ก.พ.',   800000,  740000,      0, 1220, 112000, 460),
('2568-03',  3, 2568, 'มี.ค.',  850000,  780000,      0, 1280, 118000, 480),
('2568-04',  4, 2568, 'เม.ย.',  850000,  760000,      0, 1240, 115000, 470),
('2568-05',  5, 2568, 'พ.ค.',   850000,  810000,      0, 1330, 122000, 500),
('2568-06',  6, 2568, 'มิ.ย.',  850000,  690000,      0, 1130, 105000, 430),
('2568-07',  7, 2568, 'ก.ค.',   900000,  850000,      0, 1390, 128000, 530),
('2568-08',  8, 2568, 'ส.ค.',   900000,  880000,      0, 1440, 132000, 540),
('2568-09',  9, 2568, 'ก.ย.',   950000,  910000,      0, 1490, 137000, 560),
('2568-10', 10, 2568, 'ต.ค.',   950000,  940000,      0, 1540, 141000, 580),
('2568-11', 11, 2568, 'พ.ย.',  1000000,  980000,      0, 1610, 147000, 600),
('2568-12', 12, 2568, 'ธ.ค.',  1000000, 1050000,      0, 1720, 158000, 640),
('2569-01',  1, 2569, 'ม.ค.',  1000000,  880000,      0, 1450, 132000, 550),
('2569-02',  2, 2569, 'ก.พ.',  1000000,  910000,      0, 1490, 137000, 570),
('2569-03',  3, 2569, 'มี.ค.', 1000000,  945000,      0, 1550, 142000, 590),
('2569-04',  4, 2569, 'เม.ย.', 1000000,  920000,      0, 1510, 138000, 580),
('2569-05',  5, 2569, 'พ.ค.',  1000000,  968000,      0, 1590, 145000, 605),
('2569-06',  6, 2569, 'มิ.ย.', 1000000,  558000, 372000,  919, 116000, 536)
on conflict (id) do update set
  target = excluded.target,
  actual = excluded.actual,
  projected = excluded.projected,
  orders = excluded.orders,
  ad_spend = excluded.ad_spend,
  new_cust = excluded.new_cust;

-- ============================================================
-- SECTION 20 — Seed: Color & Size Mix
-- ============================================================
insert into public.tmk_color_mix (id, name, hex, pct, sort_order, month, year) values
('cm1', 'ดำ',         '#1c1c1c', 28, 1, 6, 2569),
('cm2', 'กรมท่า',     '#23395b', 22, 2, 6, 2569),
('cm3', 'ขาว',         '#e8e4da', 18, 3, 6, 2569),
('cm4', 'เทา',         '#8a8276', 14, 4, 6, 2569),
('cm5', 'เขียวขุ่น',   '#5a6e54', 10, 5, 6, 2569),
('cm6', 'ครีม',        '#d8c9a8',  8, 6, 6, 2569)
on conflict (id) do nothing;

insert into public.tmk_size_mix (id, size, pct, sort_order, month, year) values
('sm1', 'S',    8, 1, 6, 2569),
('sm2', 'M',   24, 2, 6, 2569),
('sm3', 'L',   31, 3, 6, 2569),
('sm4', 'XL',  22, 4, 6, 2569),
('sm5', '2XL', 11, 5, 6, 2569),
('sm6', '3XL',  4, 6, 6, 2569)
on conflict (id) do nothing;

-- ============================================================
-- SECTION 20.5 — Seed: Products (ชื่อต้องตรงกับ PO ด้านล่าง)
-- จำเป็น: ถ้าไม่มีสินค้า → เปิด PO / ดูแคตตาล็อกไม่ได้
-- ============================================================
insert into public.tmk_products (id, name, price, target_units, actual_units, stock_on_hand, reserved_units, reorder_point, strategy) values
('p1', 'เสื้อโปโล Signature',     590, 1200, 740, 480, 60, 300, 'สินค้าเรือธง — ดันต่อเนื่องทุกช่องทาง'),
('p2', 'แจ็คเก็ตกันลม',          890,  500, 210, 150, 20, 120, 'สินค้าหน้าหนาว — สต็อกตามฤดู'),
('p3', 'กางเกงขาสั้น Chino',     450,  900, 560, 320, 40, 200, 'ขายคู่กับเสื้อโปโล เพิ่ม AOV'),
('p4', 'เสื้อยืด Cotton Comfort', 290, 1800, 1240, 760, 80, 400, 'ตัวทำยอด ปริมาณสูง มาร์จิ้นปานกลาง'),
('p5', 'เสื้อเชิ้ตลินิน',         690,  600, 280, 95, 15, 150, 'ลายใหม่ — โปรโมตช่วงเปิดตัว')
on conflict (id) do nothing;

-- ============================================================
-- SECTION 21 — Seed: Purchase Orders
-- ============================================================
insert into public.tmk_purchase_orders (id, product, quantity, order_date, arrival_date, status) values
('po1', 'เสื้อโปโล Signature',     800, '2026-06-10', '2026-06-24', 'Pending'),
('po2', 'แจ็คเก็ตกันลม',          500, '2026-06-15', '2026-07-02', 'Pending'),
('po3', 'กางเกงขาสั้น Chino',     400, '2026-06-05', '2026-06-18', 'Completed'),
('po4', 'เสื้อยืด Cotton Comfort', 1000, '2026-06-01', '2026-06-14', 'Completed')
on conflict (id) do nothing;

-- ============================================================
-- DONE — ตรวจสอบจำนวน rows
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
union all select 'tmk_purchase_orders',   count(*) from public.tmk_purchase_orders;
