-- ============================================================
-- TMK Operation — Soft Delete (ถังขยะ) + FB Messages column
-- ============================================================
-- รัน 1 ครั้งใน Supabase Dashboard → SQL Editor (idempotent — รันซ้ำได้)
--
-- 1. เพิ่ม deleted_at ให้ตารางที่มีปุ่มลบ → ลบแล้วเข้าถังขยะ กู้คืนได้
-- 2. เพิ่ม messages ใน monthly_history → กราฟจำนวนข้อความ FB ใช้ข้อมูลจริง
--    (แทนค่าประมาณเดิม orders * 0.55)
-- ============================================================

-- Soft delete columns
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

create index if not exists tmk_tasks_deleted_idx     on public.tmk_tasks(deleted_at);
create index if not exists tmk_products_deleted_idx  on public.tmk_products(deleted_at);
create index if not exists tmk_campaigns_deleted_idx on public.tmk_campaigns(deleted_at);

-- FB messages รายเดือน (ข้อมูลจริงสำหรับกราฟจำนวนข้อความ)
alter table public.tmk_monthly_history   add column if not exists messages integer not null default 0;
