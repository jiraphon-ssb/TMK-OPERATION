-- ============================================================
-- TMK Operation — "ส่งยอด" ใบเสร็จ Shipnity (PDF parser · ไม่ใช้ AI) — 2026-07-03
-- ============================================================
-- Log การส่งใบเสร็จรับเงินของเซลล์ + กันส่งซ้ำ + หลักฐาน/ประวัติการแก้
--   * เซลล์อัปโหลดใบเสร็จ (PDF จาก Shipnity) → เว็บอ่านด้วย pdf.js → ยืนยัน →
--     เขียนออเดอร์ลง tmk_mp_orders/tmk_mp_skus (ตารางเดิม) โดย salesperson = คนอัปโหลด
--   * order_no UNIQUE = กุญแจกันซ้ำ (ใครส่งก่อนได้ · คนหลังเห็นว่าใครส่งแล้ว)
--   * ไม่ลบแถว (audit trail) — ยกเลิก = status 'void' · delete ใช้เฉพาะเคสแก้เลขที่เอกสาร (ย้าย id)
-- ปลอดภัย/เพิ่มเฉพาะ (idempotent) — รันใน Supabase SQL Editor ได้เลย ไม่กระทบตารางเดิม
-- โมเดลสิทธิ์: เหมือนทุกตารางในระบบ (UI-gate, ปิด RLS, grant anon/authenticated)
-- ============================================================

create table if not exists public.tmk_sale_receipts (
  id             text primary key,                       -- 'shipnity:' || order_no (คีย์เดียวกับ tmk_mp_orders.id)
  order_no       text not null unique,                   -- เลขที่เอกสารบนใบเสร็จ (กันซ้ำ)
  uploader_email text not null default '',               -- อีเมลคนอัปโหลด (login)
  salesperson    text not null default '',               -- ชื่อเซลล์ ณ เวลาส่ง (display name)
  channel        text default '',                        -- ช่องทางขายที่เลือกตอนยืนยัน
  order_date     date,                                   -- วันที่บนใบเสร็จ
  order_month    text default '',                        -- 'YYYY-MM' (ไว้กรอง/รวมรายเดือน)
  qty            integer not null default 0,             -- จำนวนตัวรวม
  sales          numeric not null default 0,             -- ยอดรวมสุทธิ
  parsed         jsonb,                                  -- ผล parser ดิบ (audit — ไม่แตะหลังบันทึกครั้งแรก)
  confirmed      jsonb,                                  -- payload ล่าสุดหลังผู้ใช้ตรวจ/แก้
  history        jsonb not null default '[]'::jsonb,     -- ประวัติการแก้ [{at, by, changes:{field:[old,new]}}]
  file_url       text default '',                        -- หลักฐาน PDF ใน Storage (tmk-images/receipts/)
  file_page      integer,                                -- กรณี PDF รวมหลายใบ: ใบนี้อยู่หน้าไหน
  source_tool    text default 'pdfjs',                   -- เครื่องมือที่อ่าน (เผื่ออนาคตมีหลายตัว)
  status         text not null default 'confirmed' check (status in ('confirmed','void')),
  void_by        text default '',
  void_reason    text default '',
  void_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_sale_receipts_uploader on public.tmk_sale_receipts (uploader_email, order_month);
create index if not exists idx_sale_receipts_month    on public.tmk_sale_receipts (order_month);

alter table public.tmk_sale_receipts disable row level security;
grant select, insert, update, delete on public.tmk_sale_receipts to anon, authenticated;
