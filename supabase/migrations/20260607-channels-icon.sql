-- ============================================================
-- TMK Operation — เพิ่ม icon column ใน tmk_channels
-- ============================================================
-- รัน 1 ครั้งใน Supabase Dashboard → SQL Editor
-- เพื่อให้ระบบจัดการช่องทาง CRUD ทำงานได้
-- ============================================================

-- เพิ่ม icon column (เก็บ emoji หรือชื่อ icon)
alter table public.tmk_channels add column if not exists icon text default '';

-- Update icons ของ 6 ช่องทางเริ่มต้น (emoji หรือ logo letter)
update public.tmk_channels set icon = '🛒' where id = 'shopee';
update public.tmk_channels set icon = '♪'  where id = 'tiktok';
update public.tmk_channels set icon = '🛍' where id = 'lazada';
update public.tmk_channels set icon = 'f'  where id = 'facebook';
update public.tmk_channels set icon = '💬' where id = 'line';
update public.tmk_channels set icon = '👥' where id = 'crm';

-- ตรวจสอบผล
select id, name, icon, color, percentage as target, sort_order
from public.tmk_channels
order by sort_order;
