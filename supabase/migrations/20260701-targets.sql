-- ============================================================
-- เป้าขาย + คอมมิชชั่นต่อเซลล์ (รายคน รายเดือน) — PART 12 / T3
-- idempotent (if not exists) · UI-gate (disable RLS + grant) เหมือนตาราง tmk_* อื่น
-- วางทั้งก้อนนี้ใน Supabase → SQL Editor → Run ครั้งเดียว
-- โค้ดฝั่งเว็บ graceful: ยังไม่รัน → Leaderboard ไม่โชว์คอลัมน์เป้า/คอม (ไม่ error)
-- ============================================================

create table if not exists public.tmk_targets (
  id text primary key,                 -- "<salesperson>::<YYYY-MM>"
  salesperson text not null,           -- ชื่อที่โชว์ (หลัง alias) ให้ตรง bySalesperson.key
  month text not null,                 -- 'YYYY-MM'
  sales_target numeric default 0,      -- เป้ายอดขาย (บาท)
  commission_rate numeric default 0,   -- % คอมแบบ flat (เช่น 3 = 3%)
  tiers jsonb,                         -- ขั้นบันได [{min, rate}] (optional; ถ้ามีใช้แทน flat)
  note text,
  updated_at timestamptz default now()
);

create index if not exists idx_targets_month on public.tmk_targets(month);

grant select, insert, update, delete on public.tmk_targets to anon, authenticated;
alter table public.tmk_targets disable row level security;
