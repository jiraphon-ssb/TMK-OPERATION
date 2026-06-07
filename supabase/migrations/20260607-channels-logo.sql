-- ============================================================
-- TMK Operation — เพิ่ม logo_url column ใน tmk_channels
-- ============================================================
-- รัน 1 ครั้งใน Supabase Dashboard → SQL Editor
-- ============================================================

-- เพิ่ม column logo_url (เก็บ base64 data URL หรือ HTTP URL)
alter table public.tmk_channels add column if not exists logo_url text default '';

-- ตรวจสอบ
select id, name, icon, logo_url, color from public.tmk_channels order by sort_order;
