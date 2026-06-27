-- กลุ่มเสื้อ (shirt_class) — แกนจัดประเภทเสื้ออิสระจาก type/job_type/status
-- ค่า: 'เสื้อปกติ' | 'เสื้อลายพิเศษ' | 'เสื้อตราหน่วยงาน' (ผู้ใช้นิยาม/จัดเอง)
-- รันใน Supabase SQL editor (anon ทำ DDL ไม่ได้). โค้ดมี graceful fallback ถ้ายังไม่รัน.
alter table public.tmk_shirt_catalog
  add column if not exists shirt_class text default 'เสื้อปกติ';
