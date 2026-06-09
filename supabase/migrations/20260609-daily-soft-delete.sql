-- ============================================================
-- TMK Operation — Soft-delete ยอดขายรายวัน (แก้/ลบวันที่กรอกผิด)
-- ============================================================
-- เพิ่มความสามารถ "ลบข้อมูลรายวัน" (ย้ายไปถังขยะ กู้คืนได้) จากฟอร์มบันทึกยอดขาย
-- การอ่านยอดรายวันจะกรองแถวที่ถูกลบออก (filter ฝั่ง client อยู่แล้ว — ปลอดภัยแม้ยังไม่รัน)
-- รันใน Supabase SQL Editor
-- ============================================================

alter table public.tmk_daily_sales
  add column if not exists deleted_at timestamptz;

create index if not exists tmk_daily_sales_deleted_idx
  on public.tmk_daily_sales(deleted_at);

comment on column public.tmk_daily_sales.deleted_at is
  'soft-delete: เวลาที่ลบ (null = ใช้งานอยู่); ลบ/กู้คืนผ่านถังขยะในแอป';
