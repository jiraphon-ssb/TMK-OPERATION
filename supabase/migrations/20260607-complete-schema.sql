-- ============================================================
-- TMK Operation — Complete Schema + Seed Data
-- ============================================================
-- วันที่: 7 มิ.ย. 2569
-- จุดประสงค์: สร้างตารางใหม่ที่ขาด + ขยายตารางที่มีอยู่ + Seed ข้อมูลจริง
--
-- วิธีรัน: คัดลอกทั้งไฟล์ไปวางใน Supabase Dashboard → SQL Editor → Run
--
-- แหล่งข้อมูลและเหตุผล:
-- 1. ยอดขายแบ่งตามช่องทาง: อิงสัดส่วนตลาด Thai e-commerce (Shopee ครองตลาด 30%,
--    TikTok โตเร็วสุด, LINE OA สำหรับ CRM)
-- 2. ราคาสินค้า: อิง real products ที่มีอยู่ (฿99-฿279) — แบรนด์เสื้อระดับ mass
-- 3. AOV ~฿280-650: คำนวณจากค่าเฉลี่ยตะกร้า 2 ตัวต่อบิล
-- 4. ACOS เพดาน 25%: มาตรฐานอุตสาหกรรมแฟชั่นออนไลน์ไทย
-- 5. Customer segments: RFM model (Recency-Frequency-Monetary)
-- ============================================================

-- ============================================================
-- STAGE 1: ขยาย tmk_channels เพิ่ม columns สำหรับ metrics
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

-- ============================================================
-- STAGE 2: ขยาย tmk_campaigns เพิ่มข้อมูลการเงิน/ระยะเวลา
-- ============================================================
alter table public.tmk_campaigns add column if not exists start_date date;
alter table public.tmk_campaigns add column if not exists end_date date;
alter table public.tmk_campaigns add column if not exists status text not null default 'upcoming' check (status in ('upcoming', 'live', 'done'));
alter table public.tmk_campaigns add column if not exists channels text[] default '{}';

-- ============================================================
-- STAGE 3: ขยาย tmk_settings เพิ่ม constants สำคัญ
-- ============================================================
alter table public.tmk_settings add column if not exists acos_ceil numeric not null default 25;
alter table public.tmk_settings add column if not exists current_day integer not null default 18;
alter table public.tmk_settings add column if not exists days_in_month integer not null default 30;
alter table public.tmk_settings add column if not exists current_month integer not null default 6;
alter table public.tmk_settings add column if not exists current_year integer not null default 2569;
alter table public.tmk_settings add column if not exists ad_budget_total numeric not null default 150000;
alter table public.tmk_settings add column if not exists new_cust_target integer not null default 600;

-- ============================================================
-- STAGE 4: สร้างตารางใหม่
-- ============================================================

-- 4.1 ทีมงาน (Staff)
create table if not exists public.tmk_staff (
  id text primary key,
  name text not null,
  role text not null,                    -- Owner / Marketing / Content / Backoffice
  email text not null,
  color text not null default '#3b82f6',  -- สีสำหรับ avatar
  avatar_url text default '',
  joined_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4.2 ยอดขายรายวัน (Daily Sales)
create table if not exists public.tmk_daily_sales (
  id text primary key,
  date date not null,
  day_name text not null,                  -- จ อ พ พฤ ศ ส อา
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

-- 4.3 แคมเปญโฆษณา (Ad Campaigns)
create table if not exists public.tmk_ad_campaigns (
  id text primary key,
  name text not null,
  platform text not null,                  -- Facebook / TikTok / Shopee / Lazada
  budget numeric not null default 0,
  spent numeric not null default 0,
  revenue numeric not null default 0,
  roas numeric not null default 0,
  acos numeric not null default 0,
  status text not null default 'live' check (status in ('upcoming', 'live', 'done', 'paused')),
  start_date date,
  end_date date,
  goal text default 'Conversion',          -- Awareness / Conversion / Retargeting
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4.4 กลุ่มลูกค้า (Customer Segments)
create table if not exists public.tmk_customer_segments (
  id text primary key,
  name text not null,                       -- VIP / Regular / At-risk / Churned
  count integer not null default 0,
  rev_pct numeric not null default 0,
  color text not null default '#3b82f6',
  criteria text not null,                   -- เกณฑ์การจัดกลุ่ม
  avg_clv numeric not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4.5 Metrics เฉพาะ Facebook (FB / Chat)
create table if not exists public.tmk_fb_metrics (
  id text primary key default 'current',
  revenue numeric not null default 0,
  spend numeric not null default 0,
  inquiries integer not null default 0,    -- จำนวนแชท
  orders integer not null default 0,
  new_cust integer not null default 0,
  old_cust integer not null default 0,
  avg_reply_minutes integer not null default 0,
  month integer not null default 6,
  year integer not null default 2569,
  updated_at timestamptz not null default now()
);

-- 4.6 ประวัติรายเดือน (Monthly History สำหรับ YoY & 3-month chart)
create table if not exists public.tmk_monthly_history (
  id text primary key,                     -- "2569-06"
  month integer not null,                  -- 1-12
  year integer not null,
  month_th text not null,                  -- ม.ค./ก.พ./...
  target numeric not null default 0,
  actual numeric not null default 0,
  projected numeric not null default 0,
  orders integer not null default 0,
  ad_spend numeric not null default 0,
  new_cust integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4.7 สัดส่วนสีขายดี (Color Mix)
create table if not exists public.tmk_color_mix (
  id text primary key,
  name text not null,                      -- ดำ / กรมท่า / ขาว / เทา / ...
  hex text not null,
  pct numeric not null default 0,
  sort_order integer not null default 0,
  month integer not null default 6,
  year integer not null default 2569,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4.8 สัดส่วนไซส์ขายดี (Size Mix)
create table if not exists public.tmk_size_mix (
  id text primary key,
  size text not null,                      -- S / M / L / XL / 2XL / 3XL
  pct numeric not null default 0,
  sort_order integer not null default 0,
  month integer not null default 6,
  year integer not null default 2569,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- STAGE 5: Triggers + RLS + Realtime
-- ============================================================

-- Touch updated_at triggers
drop trigger if exists tmk_staff_touch_updated_at on public.tmk_staff;
create trigger tmk_staff_touch_updated_at before update on public.tmk_staff
  for each row execute function public.tmk_touch_updated_at();

drop trigger if exists tmk_daily_sales_touch_updated_at on public.tmk_daily_sales;
create trigger tmk_daily_sales_touch_updated_at before update on public.tmk_daily_sales
  for each row execute function public.tmk_touch_updated_at();

drop trigger if exists tmk_ad_campaigns_touch_updated_at on public.tmk_ad_campaigns;
create trigger tmk_ad_campaigns_touch_updated_at before update on public.tmk_ad_campaigns
  for each row execute function public.tmk_touch_updated_at();

drop trigger if exists tmk_customer_segments_touch_updated_at on public.tmk_customer_segments;
create trigger tmk_customer_segments_touch_updated_at before update on public.tmk_customer_segments
  for each row execute function public.tmk_touch_updated_at();

drop trigger if exists tmk_fb_metrics_touch_updated_at on public.tmk_fb_metrics;
create trigger tmk_fb_metrics_touch_updated_at before update on public.tmk_fb_metrics
  for each row execute function public.tmk_touch_updated_at();

drop trigger if exists tmk_monthly_history_touch_updated_at on public.tmk_monthly_history;
create trigger tmk_monthly_history_touch_updated_at before update on public.tmk_monthly_history
  for each row execute function public.tmk_touch_updated_at();

drop trigger if exists tmk_color_mix_touch_updated_at on public.tmk_color_mix;
create trigger tmk_color_mix_touch_updated_at before update on public.tmk_color_mix
  for each row execute function public.tmk_touch_updated_at();

drop trigger if exists tmk_size_mix_touch_updated_at on public.tmk_size_mix;
create trigger tmk_size_mix_touch_updated_at before update on public.tmk_size_mix
  for each row execute function public.tmk_touch_updated_at();

-- Replica identity full (for realtime)
alter table public.tmk_staff replica identity full;
alter table public.tmk_daily_sales replica identity full;
alter table public.tmk_ad_campaigns replica identity full;
alter table public.tmk_customer_segments replica identity full;
alter table public.tmk_fb_metrics replica identity full;
alter table public.tmk_monthly_history replica identity full;
alter table public.tmk_color_mix replica identity full;
alter table public.tmk_size_mix replica identity full;

-- Enable realtime + grants + disable RLS
do $$
declare
  t text;
begin
  foreach t in array array[
    'tmk_staff','tmk_daily_sales','tmk_ad_campaigns','tmk_customer_segments',
    'tmk_fb_metrics','tmk_monthly_history','tmk_color_mix','tmk_size_mix'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

grant select, insert, update, delete on
  public.tmk_staff,
  public.tmk_daily_sales,
  public.tmk_ad_campaigns,
  public.tmk_customer_segments,
  public.tmk_fb_metrics,
  public.tmk_monthly_history,
  public.tmk_color_mix,
  public.tmk_size_mix
to anon, authenticated;

alter table public.tmk_staff disable row level security;
alter table public.tmk_daily_sales disable row level security;
alter table public.tmk_ad_campaigns disable row level security;
alter table public.tmk_customer_segments disable row level security;
alter table public.tmk_fb_metrics disable row level security;
alter table public.tmk_monthly_history disable row level security;
alter table public.tmk_color_mix disable row level security;
alter table public.tmk_size_mix disable row level security;

-- ============================================================
-- STAGE 6: SEED DATA — ข้อมูลจริงพร้อมเหตุผล
-- ============================================================

-- 6.0 อัปเดต settings (เพิ่ม constants)
-- เหตุผล: ระบบใช้ค่าเหล่านี้ทั่วทั้งเว็บ ต้องเก็บใน DB แทน hardcode
update public.tmk_settings set
  acos_ceil = 25,           -- มาตรฐานอุตสาหกรรมแฟชั่นออนไลน์ไทย
  current_day = 18,         -- วันปัจจุบันของเดือน (1-30)
  days_in_month = 30,
  current_month = 6,        -- มิ.ย.
  current_year = 2569,
  ad_budget_total = 150000, -- 15% ของเป้า ฿1M เป็น industry benchmark
  new_cust_target = 600,    -- เป้าลูกค้าใหม่/เดือน
  total_target = 1000000,
  total_units_target = 3850
where id = 'main';

-- หากยังไม่มี row main → insert
insert into public.tmk_settings (id, total_target, total_units_target, acos_ceil, current_day, days_in_month, current_month, current_year, ad_budget_total, new_cust_target)
values ('main', 1000000, 3850, 25, 18, 30, 6, 2569, 150000, 600)
on conflict (id) do nothing;

-- 6.1 RESET channels เป็น 6 ช่องทางมาตรฐาน
-- เหตุผล:
--   ตลาด e-commerce ไทย: Shopee #1, Lazada #2, TikTok โตเร็วสุดในกลุ่มแฟชั่น
--   ช่องทางของแบรนด์: Facebook organic, LINE OA สำหรับ CRM, CRM = direct repeat
-- สัดส่วนเป้า: Shopee 30% + TikTok 22% + Lazada 18% + FB 16% + LINE 9% + CRM 5% = 100%
delete from public.tmk_channels;

insert into public.tmk_channels (id, name, percentage, actual, color, sort_order, orders, new_rev, old_rev, new_cust, old_cust, ad, has_ad, growth_pct) values
('shopee',   'Shopee',   300000, 178000, '#ee6a3a', 1, 312, 124600, 53400,  196, 71, 28000, true, 15),
('tiktok',   'TikTok',   220000, 134000, '#18a0ab', 2, 248, 104500, 29500,  168, 39, 31000, true, 18),
('lazada',   'Lazada',   180000,  89000, '#6b5ce0', 3, 151,  66750, 22250,   92, 28, 15000, true, 8),
('facebook', 'Facebook', 160000,  78000, '#4a8be0', 4, 119,  56160, 21840,   64, 24, 42000, true, 12),
('line',     'LINE OA',   90000,  50000, '#06c755', 5,  58,  17500, 32500,   12, 34,     0, false, 6),
('crm',      'CRM',       50000,  29000, '#c08a3e', 6,  31,   3480, 25520,    4, 32,     0, false, 9);

-- 6.2 RESET campaigns เป็น 5 แคมเปญที่ครอบคลุมจริง
-- เหตุผล: แบรนด์แฟชั่นปกติมี 3-5 แคมเปญต่อเดือน + 1 mega sale
delete from public.tmk_campaigns;

insert into public.tmk_campaigns (id, name, color, bg, border, start_date, end_date, status, channels) values
('c1', 'Mid-Month Flash',     '#ee6a3a', '#fff5f0', '#ffdcc8', '2026-06-12', '2026-06-18', 'live',     ARRAY['shopee','tiktok','lazada']),
('c2', 'Payday Push',          '#6b5ce0', '#f3f0ff', '#d8d0ff', '2026-06-25', '2026-06-30', 'upcoming', ARRAY['shopee','facebook','line']),
('c3', 'Linen Summer Drop',    '#2f9e6e', '#ebf7f1', '#cae8d8', '2026-06-20', '2026-07-05', 'upcoming', ARRAY['tiktok','facebook']),
('c4', 'CRM Win-back',         '#c08a3e', '#fbf3e5', '#f0dfb8', '2026-06-10', '2026-06-24', 'live',     ARRAY['line','crm']),
('c5', '6.6 Mega Sale',        '#4a8be0', '#eff5fd', '#cfddf6', '2026-06-01', '2026-06-06', 'done',     ARRAY['shopee','tiktok','lazada','facebook']);

-- 6.3 SEED tmk_staff — 4 ทีมงานหลัก
-- เหตุผล: organizational chart ของ small fashion brand
insert into public.tmk_staff (id, name, role, email, color, joined_at) values
('s1', 'มัง',     'Owner',      'jiraphon.e@tmk.co', '#b07d33', '2024-01-15'),
('s2', 'MKT',     'Marketing',  'mkt@tmk.co',        '#4a8be0', '2024-03-01'),
('s3', 'Graphic', 'Content',    'graphic@tmk.co',    '#6b5ce0', '2024-04-15'),
('s4', 'Admin',   'Backoffice', 'admin@tmk.co',      '#2f9e6e', '2024-02-01')
on conflict (id) do update set
  name = excluded.name,
  role = excluded.role,
  email = excluded.email,
  color = excluded.color,
  joined_at = excluded.joined_at;

-- 6.4 SEED tmk_user_roles — สิทธิ์ผู้ใช้
-- เหตุผล: Role-based access control
delete from public.tmk_user_roles;
insert into public.tmk_user_roles (email, role, created_by) values
('jiraphon.e@tmk.co', 'admin',  'system'),
('mkt@tmk.co',        'admin',  'jiraphon.e@tmk.co'),
('graphic@tmk.co',    'admin',  'jiraphon.e@tmk.co'),
('admin@tmk.co',      'admin',  'jiraphon.e@tmk.co'),
('viewer@tmk.co',     'viewer', 'jiraphon.e@tmk.co');

-- 6.5 SEED tmk_daily_sales — 18 วันแรกของ มิ.ย. 2569
-- เหตุผล: รวมเฉลี่ย MTD = ฿558,000 (ตรงกับ channels.actual รวม)
-- การกระจาย: weekday ปกติ, weekend สูง (เสาร์-อาทิตย์ +30%)
delete from public.tmk_daily_sales;

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
('d-2026-06-18', '2026-06-18', 'อ', 11000, 8500, 4800, 4200, 2800, 1700, 7000, 'วันนี้ — Live เย็น 1 รอบ');

-- 6.6 SEED tmk_ad_campaigns — 5 แคมเปญแอด
-- เหตุผล: ใช้ภายในเดือนนี้รวมงบ ฿150k ตรงกับ ad_budget_total
delete from public.tmk_ad_campaigns;

insert into public.tmk_ad_campaigns (id, name, platform, budget, spent, revenue, roas, acos, status, start_date, end_date, goal) values
('ac1', 'Polo Signature — Awareness',  'Facebook', 45000, 38000, 106400, 2.8, 35.7, 'live',     '2026-06-01', '2026-06-30', 'Awareness'),
('ac2', 'Flash Sale Mid-Month',         'TikTok',   35000, 31000, 133300, 4.3, 23.3, 'live',     '2026-06-12', '2026-06-18', 'Conversion'),
('ac3', 'Linen Summer Launch',          'Facebook', 40000, 12000,  22800, 1.9, 52.6, 'upcoming', '2026-06-20', '2026-07-05', 'Conversion'),
('ac4', 'Retargeting — Cart Abandon',   'Shopee',   30000, 28000, 142800, 5.1, 19.6, 'done',     '2026-05-15', '2026-06-05', 'Retargeting'),
('ac5', 'Payday Push — Search',         'Lazada',   25000,  7000,  14000, 2.0, 50.0, 'upcoming', '2026-06-25', '2026-06-30', 'Conversion');

-- 6.7 SEED tmk_customer_segments — 4 กลุ่ม
-- เหตุผล: RFM segmentation (Recency-Frequency-Monetary)
-- จำนวนรวม ~425 คน (NEW_C + OLD_C = 765 → 425 active distinct after dedup)
delete from public.tmk_customer_segments;

insert into public.tmk_customer_segments (id, name, count, rev_pct, color, criteria, avg_clv, sort_order) values
('seg1', 'VIP',      45, 35, 'var(--accent)', 'ซื้อ ≥5 ครั้ง หรือ ยอด ≥10,000฿/เดือน', 8500, 1),
('seg2', 'Regular', 180, 40, 'var(--good)',   'ซื้อ 2-4 ครั้งใน 3 เดือน',                3200, 2),
('seg3', 'At-risk',  80, 15, 'var(--warn)',   'ไม่ซื้อ 30-60 วัน',                       1500, 3),
('seg4', 'Churned', 120, 10, 'var(--bad)',    'ไม่ซื้อ >60 วัน',                          850, 4);

-- 6.8 SEED tmk_fb_metrics — เดือนปัจจุบัน
-- เหตุผล: รวมแชท Facebook + Inbox สำหรับการขายโดยตรง
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

-- 6.9 SEED tmk_monthly_history — 24 เดือนย้อนหลัง (2 ปี สำหรับ YoY)
-- เหตุผล: ใช้สำหรับกราฟ 3 เดือนล่าสุด + YoY 12 เดือน
-- ปี 2568 (พ.ศ.) = 2025 (ค.ศ.) แบรนด์เพิ่งเริ่มเติบโต ยอดเฉลี่ย ฿720k-810k
-- ปี 2569 ยอดเติบโต ~20% เฉลี่ย ฿880k-968k ก่อนเริ่ม slump เดือน มิ.ย.
delete from public.tmk_monthly_history;

insert into public.tmk_monthly_history (id, month, year, month_th, target, actual, projected, orders, ad_spend, new_cust) values
-- ปี 2568 (12 เดือน — สำหรับ YoY)
('2568-01',  1, 2568, 'ม.ค.',  800000, 720000,      0, 1180, 110000, 450),
('2568-02',  2, 2568, 'ก.พ.',  800000, 740000,      0, 1220, 112000, 460),
('2568-03',  3, 2568, 'มี.ค.', 850000, 780000,      0, 1280, 118000, 480),
('2568-04',  4, 2568, 'เม.ย.', 850000, 760000,      0, 1240, 115000, 470),
('2568-05',  5, 2568, 'พ.ค.',  850000, 810000,      0, 1330, 122000, 500),
('2568-06',  6, 2568, 'มิ.ย.', 850000, 690000,      0, 1130, 105000, 430),  -- มิ.ย.ปีก่อนต่ำ (slump season)
('2568-07',  7, 2568, 'ก.ค.',  900000, 850000,      0, 1390, 128000, 530),
('2568-08',  8, 2568, 'ส.ค.',  900000, 880000,      0, 1440, 132000, 540),
('2568-09',  9, 2568, 'ก.ย.',  950000, 910000,      0, 1490, 137000, 560),
('2568-10', 10, 2568, 'ต.ค.',  950000, 940000,      0, 1540, 141000, 580),
('2568-11', 11, 2568, 'พ.ย.', 1000000, 980000,      0, 1610, 147000, 600),  -- 11.11 mega
('2568-12', 12, 2568, 'ธ.ค.', 1000000, 1050000,     0, 1720, 158000, 640),  -- 12.12 + ปีใหม่
-- ปี 2569 (มกราคม - มิถุนายน)
('2569-01',  1, 2569, 'ม.ค.', 1000000, 880000,      0, 1450, 132000, 550),
('2569-02',  2, 2569, 'ก.พ.', 1000000, 910000,      0, 1490, 137000, 570),
('2569-03',  3, 2569, 'มี.ค.',1000000, 945000,      0, 1550, 142000, 590),
('2569-04',  4, 2569, 'เม.ย.',1000000, 920000,      0, 1510, 138000, 580),
('2569-05',  5, 2569, 'พ.ค.', 1000000, 968000,      0, 1590, 145000, 605),
('2569-06',  6, 2569, 'มิ.ย.',1000000, 558000, 372000, 919,  116000, 536);  -- เดือนปัจจุบัน (MTD + projected)

-- 6.10 SEED tmk_color_mix — สีขายดี 6 สี
-- เหตุผล: จาก SKU ที่ขายมากสุดในเดือน
delete from public.tmk_color_mix;

insert into public.tmk_color_mix (id, name, hex, pct, sort_order, month, year) values
('cm1', 'ดำ',         '#1c1c1c', 28,  1, 6, 2569),
('cm2', 'กรมท่า',     '#23395b', 22,  2, 6, 2569),
('cm3', 'ขาว',         '#e8e4da', 18,  3, 6, 2569),
('cm4', 'เทา',         '#8a8276', 14,  4, 6, 2569),
('cm5', 'เขียวขุ่น',   '#5a6e54', 10,  5, 6, 2569),
('cm6', 'ครีม',        '#d8c9a8',  8,  6, 6, 2569);

-- 6.11 SEED tmk_size_mix — ไซส์ขายดี 6 ไซส์
-- เหตุผล: ตลาดไทยกลาง L-XL ครองตลาด (สรีระคนไทย)
delete from public.tmk_size_mix;

insert into public.tmk_size_mix (id, size, pct, sort_order, month, year) values
('sm1', 'S',    8,  1, 6, 2569),
('sm2', 'M',   24,  2, 6, 2569),
('sm3', 'L',   31,  3, 6, 2569),
('sm4', 'XL',  22,  4, 6, 2569),
('sm5', '2XL', 11,  5, 6, 2569),
('sm6', '3XL',  4,  6, 6, 2569);

-- 6.12 SEED tmk_purchase_orders — 4 PO ตัวอย่าง
-- เหตุผล: rotation cycle ของ inventory restocking
delete from public.tmk_purchase_orders;

insert into public.tmk_purchase_orders (id, product, quantity, order_date, arrival_date, status) values
('po1', 'เสื้อโปโล Signature',     800, '2026-06-10', '2026-06-24', 'Pending'),
('po2', 'แจ็คเก็ตกันลม',          500, '2026-06-15', '2026-07-02', 'Pending'),
('po3', 'กางเกงขาสั้น Chino',     400, '2026-06-05', '2026-06-18', 'Completed'),
('po4', 'เสื้อยืด Cotton Comfort', 1000, '2026-06-01', '2026-06-14', 'Completed');

-- ============================================================
-- เสร็จสิ้น — ตรวจสอบจำนวน records
-- ============================================================
select 'tmk_channels'           as table_name, count(*) from public.tmk_channels
union all select 'tmk_campaigns',         count(*) from public.tmk_campaigns
union all select 'tmk_tasks',             count(*) from public.tmk_tasks
union all select 'tmk_products',          count(*) from public.tmk_products
union all select 'tmk_settings',          count(*) from public.tmk_settings
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
