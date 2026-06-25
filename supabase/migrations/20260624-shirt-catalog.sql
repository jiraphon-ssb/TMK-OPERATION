-- ============================================================
-- tmk_shirt_catalog — แคตตาล็อกเสื้อ/สินค้า แก้ไขได้เองในเว็บ (แทน static catalogMeta.js)
-- เซลล์ใช้อ้างอิงบ่อย: รหัส · ชื่อลาย · หมวด · ราคาปลีก/ส่ง/ต้นทุน · สี · ไซซ์ · สถานะ · รูป(ไม่บังคับ)
-- idempotent · UI-gate (ปิด RLS + grant) — รันใน Supabase SQL Editor
-- ============================================================
create table if not exists public.tmk_shirt_catalog (
  id text primary key,                         -- gen: sc-<rand>
  code text default '',                         -- รหัสสินค้า/SKU (เชื่อมกับ product_code ในออเดอร์ได้)
  name text default '',                         -- ชื่อลาย/ชื่อเสื้อ
  type text default '',                         -- หมวด: เสื้อโปโล/กระเป๋า/กล่องสุ่ม/ถุงเท้า/...
  price numeric default 0,                      -- ราคาขายปลีก
  price_wholesale numeric default 0,            -- ราคาส่ง (ปลีก/ส่ง/OEM)
  cost numeric default 0,                        -- ต้นทุน (ไว้คิดกำไร)
  colors text default '',                        -- สีที่มี (คั่นด้วย ,)
  sizes text default '',                         -- ไซซ์ที่มี (S,M,L,XL,...)
  status text default 'พร้อมขาย',                -- พร้อมขาย / พรีออเดอร์ / หมด / เลิกผลิต
  image text default '',                          -- รูป (data URL ย่อแล้ว) — ไม่บังคับ
  note text default '',                          -- รายละเอียด/เนื้อผ้า
  created_by text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists tmk_shirt_catalog_code_idx   on public.tmk_shirt_catalog(code);
create index if not exists tmk_shirt_catalog_type_idx   on public.tmk_shirt_catalog(type);
create index if not exists tmk_shirt_catalog_status_idx on public.tmk_shirt_catalog(status);

grant select, insert, update, delete on public.tmk_shirt_catalog to anon, authenticated;
alter table public.tmk_shirt_catalog disable row level security;
