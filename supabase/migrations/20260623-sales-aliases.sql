-- ============================================================
-- tmk_sales_aliases — รวมชื่อเซลล์: บัญชีคีย์ข้อมูล (handle) → ชื่อจริง/ชื่อเล่นที่ใช้รวม
-- เช่น jirarattukta → ฟ้า · paiy.pig1 → ปาย · Oum Juntakarn → อุ้ม
-- แอดมินตั้งเองในหน้า "ข้อมูล" · ใช้รวมยอด/ปิดการขายต่อเซลล์ให้ไม่แตกหลายชื่อ
-- idempotent · UI-gate · รันใน Supabase SQL Editor
-- ============================================================
create table if not exists public.tmk_sales_aliases (
  handle       text primary key,            -- ชื่อ/บัญชีดิบจาก tmk_mp_orders.salesperson
  display_name text not null default '',     -- ชื่อจริง/ชื่อเล่นที่ใช้รวม
  note         text default '',
  updated_at   timestamptz default now()
);
grant select, insert, update, delete on public.tmk_sales_aliases to anon, authenticated;
alter table public.tmk_sales_aliases disable row level security;
