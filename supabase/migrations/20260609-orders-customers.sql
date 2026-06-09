-- ============================================================
-- TMK Operation — ลูกค้า + ออเดอร์ + ติดตามสถานะ (Phase 1)
-- ============================================================
-- tmk_customers: ฐานข้อมูลลูกค้า (ชื่อ/เบอร์/LINE/ที่อยู่)
-- tmk_orders: ออเดอร์ — รายการสินค้า + สถานะ pipeline + เลขแทร็ก + ประวัติสถานะ
--   สถานะ: pending(รอยืนยัน) printing(รอพิมพ์) checking(นับเช็ค) packing(แพ็ค)
--          shipping(รอขนส่ง) shipped(ส่งแล้ว) cancelled(ยกเลิก)
--   สร้างออเดอร์ → จองสต็อก; ส่งแล้ว → ตัดสต็อกจริง + คิดรายได้
--   ลูกค้าเปิดลิงก์ ?track=<code> ดูสถานะเองได้ (ไม่ต้องล็อกอิน)
-- รันใน Supabase SQL Editor
-- ============================================================

create table if not exists public.tmk_customers (
  id text primary key,
  code text,
  name text not null default '',
  phone text,
  line text,
  address text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_orders (
  id text primary key,
  code text not null,
  customer_id text,
  customer_name text not null default '',
  items jsonb not null default '[]'::jsonb,       -- [{ productId, name, color, size, qty, price, cost }]
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  total numeric not null default 0,
  status text not null default 'pending',
  channel text,
  tracking_no text,
  carrier text,
  note text,
  status_log jsonb not null default '[]'::jsonb,   -- [{ status, at, by }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tmk_orders_code_idx   on public.tmk_orders(code);
create index if not exists tmk_orders_status_idx on public.tmk_orders(status);
create index if not exists tmk_orders_cust_idx   on public.tmk_orders(customer_id);

-- สิทธิ์ + ปิด RLS (ให้เหมือนตารางอื่นในแอป)
grant select, insert, update, delete on public.tmk_customers to anon, authenticated;
grant select, insert, update, delete on public.tmk_orders    to anon, authenticated;
alter table public.tmk_customers disable row level security;
alter table public.tmk_orders    disable row level security;

-- updated_at trigger (ใช้ฟังก์ชันเดิม)
do $$ begin
  perform 1 from pg_proc where proname = 'tmk_touch_updated_at';
  if found then
    execute 'drop trigger if exists tmk_customers_touch_updated_at on public.tmk_customers';
    execute 'create trigger tmk_customers_touch_updated_at before update on public.tmk_customers for each row execute function public.tmk_touch_updated_at()';
    execute 'drop trigger if exists tmk_orders_touch_updated_at on public.tmk_orders';
    execute 'create trigger tmk_orders_touch_updated_at before update on public.tmk_orders for each row execute function public.tmk_touch_updated_at()';
  end if;
end $$;

-- Realtime (ให้บอร์ด Kanban อัปเดตสด)
do $$ begin
  alter table public.tmk_orders replica identity full;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tmk_orders') then
    alter publication supabase_realtime add table public.tmk_orders;
  end if;
  alter table public.tmk_customers replica identity full;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tmk_customers') then
    alter publication supabase_realtime add table public.tmk_customers;
  end if;
end $$;
