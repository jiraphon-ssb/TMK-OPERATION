-- ============================================================
-- TMK Operation — กู้คืน "เปิดตัวลายใหม่ 1" (c1) ที่ลบไปขณะทดสอบ
-- ============================================================
-- ผลกระทบ: 21 tasks ที่เคยอยู่ใน c1 ถูกตั้ง camp = NULL ระหว่างลบ
-- จะ:
--   1. กู้แคมเปญ c1 กลับมา
--   2. Re-link 21 tasks กลับเข้า c1 โดยใช้ keyword matching จาก title
-- ============================================================

-- 1. กู้แคมเปญ c1
insert into public.tmk_campaigns (id, name, color, bg, border, sort_order, start_date, end_date, status, channels)
values (
  'c1',
  'เปิดตัวลายใหม่ 1',
  '#0a5aa0',
  '#eff5fd',
  '#cfddf6',
  1,
  '2026-06-12',
  '2026-06-18',
  'live',
  ARRAY['shopee','tiktok','lazada']
)
on conflict (id) do update set
  name = excluded.name,
  color = excluded.color,
  bg = excluded.bg,
  border = excluded.border,
  sort_order = excluded.sort_order,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  status = excluded.status,
  channels = excluded.channels;

-- 2. Re-link tasks ที่ camp = NULL กลับเข้า c1 ด้วย keyword matching
-- (ทำเฉพาะ task ที่ camp ยังเป็น NULL — ไม่ทับ task ที่ link แคมเปญอื่นอยู่)

-- งานที่มี "ลายใหม่ 1" หรือ "(VDO)" ใน title → c1
update public.tmk_tasks
   set camp = 'c1'
 where camp is null
   and (
     title ilike '%ลายใหม่ 1%'   or
     title ilike '%ลายใหม่ (1)%' or
     title ilike '%PO ลายใหม่%'  or
     title ilike '%Terser%'      or
     title ilike '%Teser%'       or
     title ilike '%กระตุ้นลายใหม่%'  or
     title ilike '%เปิดตัวลายใหม่%'  or
     title ilike '%แจ้งเตือนเปิดตัว%' or
     title ilike '%ใบงานผลิต%'   or
     title ilike '%คอนเฟิร์มขึ้นตัวอย่าง%' or
     title ilike '%ได้รับตัวอย่างลายใหม่%' or
     title ilike '%เทรนเซล เปิดตัว%'
   );

-- งาน VDO และ POV ทั่วไป → c1 (default campaign)
update public.tmk_tasks
   set camp = 'c1'
 where camp is null
   and (
     title ilike '%(VDO)%' or
     title ilike '%VDO%'   or
     title ilike '%POV%'
   );

-- ลายใหม่ 2 → c3
update public.tmk_tasks
   set camp = 'c3'
 where camp is null
   and (
     title ilike '%ลายใหม่ 2%'  or
     title ilike '%ลายใหม่ (2)%' or
     title ilike '%กราฟิกส่งงาน%'
   );

-- ==================================================
-- ตรวจสอบผลลัพธ์
-- ==================================================
select 'restored c1' as t, exists(select 1 from public.tmk_campaigns where id = 'c1') as ok;

-- นับ tasks ต่อแคมเปญ
select c.id, c.name, count(t.id) as task_count
from public.tmk_campaigns c
left join public.tmk_tasks t on t.camp = c.id
group by c.id, c.name
order by c.sort_order;

-- เหลือ task ที่ยังไม่ link
select count(*) as unlinked_tasks from public.tmk_tasks where camp is null;
