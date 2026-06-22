-- ============================================================
-- TMK Operation — mp-report โมดูล CRM: เพิ่มฟิลด์ตัวตนลูกค้า — 2026-06-22
-- ============================================================
-- เพิ่มคอลัมน์ลูกค้าใน tmk_mp_orders (จากไฟล์ Shipnity) เพื่อทำรายงานเจาะลึกลูกค้า
-- ปลอดภัย/เพิ่มเฉพาะ (idempotent) — รันใน Supabase SQL Editor ได้เลย
-- (รัน 20260622-mp-report.sql ก่อน)
-- ============================================================
alter table public.tmk_mp_orders add column if not exists customer_code   text;
alter table public.tmk_mp_orders add column if not exists customer_name   text;
alter table public.tmk_mp_orders add column if not exists customer_social text;
alter table public.tmk_mp_orders add column if not exists cust_total_spent numeric default 0;
create index if not exists tmk_mp_orders_cust_idx on public.tmk_mp_orders(customer_code);
