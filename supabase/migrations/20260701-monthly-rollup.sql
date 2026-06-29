-- ============================================================
-- Monthly rollup — สรุปยอดรายเดือน (เขียนตอน import) — PART 12 / T4
-- idempotent · UI-gate (disable RLS + grant) เหมือนตาราง tmk_* อื่น
-- วางทั้งก้อนนี้ใน Supabase → SQL Editor → Run ครั้งเดียว
-- โค้ดฝั่งเว็บ graceful: ยังไม่รัน → import ปกติ (ข้ามการเขียน rollup เงียบ) · dashboard ใช้ runtime compute เดิม
-- หมายเหตุ: rollup = "as-imported" (แก้ override/re-match ภายหลังไม่อัปเดต rollup) → รายงานละเอียดคือ source of truth
-- อย่าใช้ tmk_monthly_history ซ้ำ (คนละ grain — อันนั้น = เป้า/ภาพรวม Home แบบกรอกมือ)
-- ============================================================

create table if not exists public.tmk_monthly_rollup (
  id text primary key,                 -- 'YYYY-MM'
  month text not null,
  orders int default 0,
  qty int default 0,                   -- ตัว
  sales numeric default 0,
  profit numeric default 0,
  commission numeric default 0,
  by_channel jsonb,                    -- { channel: {orders,qty,sales} }
  updated_at timestamptz default now()
);

grant select, insert, update, delete on public.tmk_monthly_rollup to anon, authenticated;
alter table public.tmk_monthly_rollup disable row level security;
