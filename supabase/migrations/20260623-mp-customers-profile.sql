-- ============================================================
-- tmk_mp_customers — โปรไฟล์ลูกค้าจากไฟล์ Shipnity (เบอร์/ที่อยู่/LTV/CRM tags/เจ้าของ)
-- เติมข้อมูลให้หน้า CRM + customer detail: กดดูลูกค้าแล้วโทรตามต่อได้ทันที
-- จับคู่กับ tmk_mp_orders ด้วย customer_code · idempotent · UI-gate · รันใน Supabase SQL Editor
-- หมายเหตุ: คนละตัวกับ tmk_customers (โมดูล orders เดิม) — อย่าสับสน
-- ============================================================
create table if not exists public.tmk_mp_customers (
  customer_code   text primary key,        -- รหัสลูกค้า (ลูกค้า) เช่น CE7073
  name            text default '',          -- ชื่อจริง
  phone           text default '',          -- เบอร์โทร (ขุมทอง — ไว้ตามต่อ)
  social_name     text default '',          -- ชื่อโซเชียล / ชื่อในช่องทางติดต่อ
  address         text default '',          -- ที่อยู่เต็ม
  province        text default '',          -- ชื่อจังหวัด
  district        text default '',          -- เขต/อำเภอ
  postcode        text default '',          -- รหัสไปรษณีย์
  contact_channel text default '',          -- ช่องทางติดต่อหลัก (facebook/line/shopee/phone)
  lifetime_orders numeric default 0,        -- จำนวนออเดอร์สะสม
  lifetime_sales  numeric default 0,        -- ยอดสั่งซื้อสะสม (LTV)
  lifetime_cancel numeric default 0,        -- ยอดยกเลิกสะสม
  since           date,                     -- วันที่เป็นลูกค้าครั้งแรก
  owner           text default '',          -- เซลล์เจ้าของลูกค้า (แยกจาก CRM tag): ฟ้า/เจน/ส้ม/นัท/อุ้ม
  cadence         text default '',          -- รอบตามต่อจาก tag: 0D = วันแรก, 5D = วันที่5
  repurchase      int default 0,            -- ซื้อซ้ำรอบที่เท่าไหร่ (จาก tag Repurchase N)
  tags            text[] default '{}',      -- CRM tags ดิบทั้งหมด
  note            text default '',          -- หมายเหตุ
  import_batch    text default '',
  updated_at      timestamptz default now()
);
create index if not exists tmk_mp_customers_owner_idx    on public.tmk_mp_customers(owner);
create index if not exists tmk_mp_customers_cadence_idx  on public.tmk_mp_customers(cadence);
create index if not exists tmk_mp_customers_province_idx on public.tmk_mp_customers(province);

grant select, insert, update, delete on public.tmk_mp_customers to anon, authenticated;
alter table public.tmk_mp_customers disable row level security;
