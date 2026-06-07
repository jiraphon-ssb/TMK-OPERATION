-- ============================================================
-- TMK Operation — Daily per-channel detail (orders/ลูกค้า/แชท ต่อช่องทาง)
-- ============================================================
-- รัน 1 ครั้งใน Supabase SQL Editor (idempotent)
-- เดิม tmk_daily_sales เก็บแค่ "รายได้ต่อช่องทาง" + ad_spend รวม
-- → ออร์เดอร์/ลูกค้าใหม่-เก่า/แชท ที่กรอกในฟอร์มหายไป
-- เพิ่ม channels jsonb เก็บครบต่อช่องทาง: { id: { rev, ord, ad, inq, newC, oldC } }
-- ============================================================
alter table public.tmk_daily_sales add column if not exists channels jsonb not null default '{}'::jsonb;
