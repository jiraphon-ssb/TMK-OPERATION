-- ============================================================
-- TMK Operation — เพิ่ม sort_order ใน tmk_campaigns
-- ============================================================
-- รัน 1 ครั้งใน Supabase Dashboard → SQL Editor
-- ทำให้สามารถเรียงลำดับ campaigns ได้ใน UI (drag-drop)
-- ============================================================

-- เพิ่ม column sort_order
alter table public.tmk_campaigns add column if not exists sort_order integer not null default 0;

-- ตั้งค่า default sort_order จาก start_date
-- (แคมเปญที่เริ่มก่อนจะอยู่ลำดับต้น)
update public.tmk_campaigns
   set sort_order = sub.rn
  from (
    select id, row_number() over (order by start_date nulls last, created_at) as rn
    from public.tmk_campaigns
  ) sub
 where public.tmk_campaigns.id = sub.id
   and public.tmk_campaigns.sort_order = 0;

-- ตรวจสอบผล
select id, name, sort_order, start_date from public.tmk_campaigns order by sort_order;
