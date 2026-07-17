-- ============================================================================
-- 20260718-fix-lost-mark-colors.sql — แก้สีวรรณยุกต์หายใน tmk_mp_skus (ฟา→ฟ้า ฯลฯ)
-- ============================================================================
-- สาเหตุ: ฟอนต์ใบเสร็จ Shipnity map วรรณยุกต์/สระบนเป็น \0 → parser strip → สีเพี้ยน
--   เช่น "ฟ้า"→"ฟา", "ม่วง"→"มวง", "ส้ม"→"สม" แล้วถูกเก็บลง tmk_mp_skus.color
-- FE แก้แล้ว (cleanColor กู้ตอนเขียน + normColor merge ตอน aggregate) → ข้อมูลใหม่ไม่เพี้ยน
--   และกราฟ/เมทริกซ์รวมค่าเก่าให้แล้ว — ไฟล์นี้ = ล้าง "ค่าดิบเก่า" ใน DB ให้สะอาด
--   (มีผลกับ drawer รายบรรทัด/CSV export ที่โชว์ค่าดิบ)
-- ปลอดภัย: UPDATE เฉพาะค่าที่ตรง exact match ในลิสต์คำเพี้ยนที่รู้จัก · รันซ้ำได้ (idempotent)
-- ============================================================================

begin;

-- ดูก่อนว่ามีกี่แถว (รันแยกได้ก่อนตัดสินใจ)
-- select color, count(*) from public.tmk_mp_skus
--   where color in ('ฟา','มวง','สม','ดา','กรมทา','นาเงน','นำเงน','เขยว','เหลอง','ครม','ชมพ','เงน','ฟาออน','เทาออน','นาตาล','นำตาล','บานเยน')
--   group by color;

update public.tmk_mp_skus set color = 'ฟ้า'      where color = 'ฟา';
update public.tmk_mp_skus set color = 'ม่วง'     where color = 'มวง';
update public.tmk_mp_skus set color = 'ส้ม'      where color = 'สม';
update public.tmk_mp_skus set color = 'ดำ'       where color = 'ดา';
update public.tmk_mp_skus set color = 'กรมท่า'   where color in ('กรมทา', 'กรม');
update public.tmk_mp_skus set color = 'น้ำเงิน'   where color in ('นาเงน', 'นำเงน', 'นาเงิน', 'นำเงิน');
update public.tmk_mp_skus set color = 'เขียว'     where color = 'เขยว';
update public.tmk_mp_skus set color = 'เหลือง'    where color = 'เหลอง';
update public.tmk_mp_skus set color = 'ครีม'      where color = 'ครม';
update public.tmk_mp_skus set color = 'ชมพู'      where color = 'ชมพ';
update public.tmk_mp_skus set color = 'เงิน'      where color = 'เงน';
update public.tmk_mp_skus set color = 'ฟ้าอ่อน'   where color in ('ฟาออน', 'ฟาอ่อน', 'ฟ้าออน');
update public.tmk_mp_skus set color = 'เทาอ่อน'   where color = 'เทาออน';
update public.tmk_mp_skus set color = 'น้ำตาล'    where color in ('นาตาล', 'นำตาล');
update public.tmk_mp_skus set color = 'บานเย็น'   where color = 'บานเยน';

commit;

-- ── VERIFY (ต้อง = 0 ทุกค่า = ไม่เหลือสีเพี้ยน) ──────────────────────────────
select 'สีเพี้ยนคงเหลือ (ต้อง = 0)' as check_item, count(*)::text as result,
       case when count(*) = 0 then '✅' else '❌' end as status
from public.tmk_mp_skus
where color in ('ฟา','มวง','สม','ดา','กรมทา','กรม','นาเงน','นำเงน','เขยว','เหลอง','ครม','ชมพ','เงน','ฟาออน','เทาออน','นาตาล','นำตาล','บานเยน');
