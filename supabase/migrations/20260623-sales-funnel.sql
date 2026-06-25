-- ============================================================
-- tmk_sales_funnel — คนทักรายวันต่อเซลล์ (FB/Line ใหม่/เก่า) → คำนวณ %ปิดการขายเทียบยอดที่ขายได้
-- เซลล์กรอกวันละครั้ง · ออเดอร์/ยอด มาจาก tmk_sale_entries + tmk_mp_orders (ไม่เก็บซ้ำ)
-- idempotent · UI-gate · รันใน Supabase SQL Editor
-- ============================================================
create table if not exists public.tmk_sales_funnel (
  id text primary key,                  -- <date>:<salesperson>
  date date not null,
  salesperson text not null default '',
  leads_fb_new numeric default 0,
  leads_fb_old numeric default 0,
  leads_line_new numeric default 0,
  leads_line_old numeric default 0,
  note text default '',
  created_by text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists tmk_sales_funnel_date_idx on public.tmk_sales_funnel(date);
create index if not exists tmk_sales_funnel_sp_idx   on public.tmk_sales_funnel(salesperson);

grant select, insert, update, delete on public.tmk_sales_funnel to anon, authenticated;
alter table public.tmk_sales_funnel disable row level security;
