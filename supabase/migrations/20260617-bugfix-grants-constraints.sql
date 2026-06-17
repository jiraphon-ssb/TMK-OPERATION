-- ============================================================
-- TMK Operation — เก็บบั๊กจาก audit (grants + constraints) — 2026-06-17
-- ============================================================
-- ปลอดภัย/เพิ่มเฉพาะ (idempotent) — รันใน Supabase SQL Editor ได้เลย ไม่กระทบข้อมูลเดิม
--
-- BUG-17(b): tmk_presence ไม่เคย grant ให้ anon/authenticated (ต่างจากทุกตารางอื่น)
--   → บน project ที่ไม่มี default public-schema privilege การเขียน presence ได้ 42501
--     (App.jsx swallow เงียบ) ทำให้ "ทีมวันนี้" ไม่อัปเดต
-- BUG-17(c): tmk_orders.code เป็น public tracking key (?track=<code>) แต่มีแค่ index ธรรมดา
--   → import/insert มือสร้าง code ซ้ำได้ ทำ tracking (.maybeSingle) error
--
-- หมายเหตุ: บั๊ก fulfill-order race / lost-update (BUG-3/BUG-9) ไม่รวมในไฟล์นี้ —
--   ต้องแก้ทั้ง client (computeFulfillment ส่ง "delta" แทนค่าสัมบูรณ์) + RPC (หักฝั่ง server
--   พร้อม SELECT ... FOR UPDATE / decrement jsonb cell ที่ถูกต้อง) และต้องทดสอบกับ DB จริง
--   ก่อนใช้ เพราะเป็น path การเงินวิกฤต — ทำแยกเป็นงานเฉพาะ
-- ============================================================

-- BUG-17(b): grant + ปิด RLS ให้ tmk_presence เหมือน sibling ทุกตาราง (เฉพาะถ้ามีตารางแล้ว)
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='tmk_presence') then
    grant select, insert, update, delete on public.tmk_presence to anon, authenticated;
    alter table public.tmk_presence disable row level security;
  else
    raise notice 'tmk_presence ยังไม่มี — รัน 20260613-presence.sql ก่อน';
  end if;
end $$;

-- BUG-17(c): unique index บน tmk_orders.code (สร้างเฉพาะเมื่อไม่มี code ซ้ำ — กัน migration ล้ม)
do $$
declare dup int;
begin
  select count(*) into dup from (
    select code from public.tmk_orders where code is not null group by code having count(*) > 1
  ) d;
  if dup = 0 then
    create unique index if not exists tmk_orders_code_uidx on public.tmk_orders(code);
    drop index if exists public.tmk_orders_code_idx; -- เลิกใช้ index ธรรมดา (unique ครอบคลุมการค้นอยู่แล้ว)
  else
    raise notice 'tmk_orders มี % code ซ้ำ — de-duplicate ก่อน แล้วรันไฟล์นี้ใหม่ (ยังไม่สร้าง unique index)', dup;
  end if;
end $$;
