-- ============================================================
-- 20260731-crm-targets-notes.sql — เป้ายอดขาย CRM ต่อเซลล์ + บันทึกประจำวัน CRM (PART 87.2)
-- ============================================================
-- เป้า CRM แยกตารางจาก tmk_targets เพราะ salePerf ทำ map ต่อ salesperson จาก fetchTargets —
-- แถวเป้า CRM ซ้ำชื่อเซลล์จะทับเป้าปกติ (และ sentinel prefix จะโผล่เป็น orphan ใน TargetsView)
-- รันใน Supabase SQL Editor ครั้งเดียว

-- เป้ายอดขาย CRM ต่อเซลล์ ต่อเดือน (แสดงในหน้า "ภาพรวม CRM" · กรอกใน ตั้งค่า › เป้า & คอม)
create table if not exists public.tmk_crm_targets (
  id text primary key,            -- "<salesperson>::<YYYY-MM>"
  salesperson text not null,
  month text not null,            -- 'YYYY-MM'
  sales_target numeric default 0, -- เป้ายอด CRM (บาท)
  updated_at timestamptz default now()
);
create index if not exists idx_crm_targets_month on public.tmk_crm_targets(month);

-- บันทึกประจำวัน CRM ต่อ (เซลล์, วัน) — เช่น "ลูกค้าสอบถามเสื้อสีเทา อสม. เข้ามาเยอะ"
create table if not exists public.tmk_crm_notes (
  id text primary key,            -- "<salesperson>::<YYYY-MM-DD>"
  salesperson text not null,
  date text not null,             -- 'YYYY-MM-DD'
  note text default '',
  updated_at timestamptz default now()
);
create index if not exists idx_crm_notes_date on public.tmk_crm_notes(date);

grant select, insert, update, delete on public.tmk_crm_targets to anon, authenticated;
grant select, insert, update, delete on public.tmk_crm_notes to anon, authenticated;
alter table public.tmk_crm_targets disable row level security;
alter table public.tmk_crm_notes disable row level security;
