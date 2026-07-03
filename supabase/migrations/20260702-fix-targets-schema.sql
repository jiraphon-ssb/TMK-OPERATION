-- ============================================================
-- FIX: tmk_targets สคีมาชนกัน — 2026-07-02
-- ============================================================
-- อาการ: log error "column tmk_targets.salesperson does not exist" ซ้ำ ๆ
-- ต้นเหตุ: ตาราง tmk_targets ถูกสร้างจากสคีมาเก่า (20260623-mp-foundation.sql
--   = scope_type/scope_id/year/month(int)/target_sales/target_qty) ไปแล้ว
--   พอ 20260701-targets.sql ใช้ "create table if not exists" เลยข้าม → คอลัมน์
--   ใหม่ (salesperson/sales_target/commission_rate/tiers/month text) ไม่ถูกสร้าง
-- แก้แบบไม่ลบข้อมูล: เพิ่มคอลัมน์ใหม่ + ย้าย month(int) เก่าไปเป็น legacy_month
--   + ปลด NOT NULL คอลัมน์เก่าเพื่อให้ upsert แบบใหม่ทำงานได้
-- idempotent — รันใน Supabase SQL Editor ได้เลย ซ้ำได้ ไม่พัง
-- ============================================================

create table if not exists public.tmk_targets (
  id text primary key
);

-- 1) ถ้ายังมี month แบบ integer (สคีมาเก่า) ให้ย้ายชื่อออกไปกันชนกับ month text
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='tmk_targets'
      and column_name='month' and data_type in ('integer','bigint','smallint')
  ) then
    alter table public.tmk_targets rename column month to legacy_month;
  end if;
end $$;

-- 2) เพิ่มคอลัมน์ตามสคีมาใหม่ (ที่โค้ดฝั่งเว็บใช้จริง)
alter table public.tmk_targets add column if not exists salesperson     text;
alter table public.tmk_targets add column if not exists month           text;
alter table public.tmk_targets add column if not exists sales_target    numeric default 0;
alter table public.tmk_targets add column if not exists commission_rate numeric default 0;
alter table public.tmk_targets add column if not exists tiers           jsonb;
alter table public.tmk_targets add column if not exists note            text;
alter table public.tmk_targets add column if not exists updated_at      timestamptz default now();

-- 3) ปลด NOT NULL คอลัมน์เก่า (ถ้ามี) เพื่อไม่ให้ upsert แบบใหม่ที่ไม่ส่งค่าพวกนี้พัง
do $$
declare col text;
begin
  foreach col in array array['scope_type','scope_id','year','legacy_month'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='tmk_targets' and column_name=col
    ) then
      execute format('alter table public.tmk_targets alter column %I drop not null', col);
    end if;
  end loop;
end $$;

create index if not exists idx_targets_month on public.tmk_targets(month);

grant select, insert, update, delete on public.tmk_targets to anon, authenticated;
alter table public.tmk_targets disable row level security;
