-- ============================================================
-- 20260806-funnel-voice.sql — เสียงลูกค้า (ถาม/ชม/ติ) ต่อ วัน+เซลล์ ในหน้า "คนทัก" (PART 94)
-- ============================================================
-- เก็บใน tmk_sales_funnel.voice jsonb = { ask, praise, complaint } · แยกอิสระจากบันทึกประจำวัน CRM
-- โค้ดฝั่งเว็บ graceful: ยังไม่รัน → คนทักยังบันทึกได้ (ข้ามช่องเสียงลูกค้า + เตือน)
-- idempotent — รันซ้ำได้
alter table public.tmk_sales_funnel add column if not exists voice jsonb;
