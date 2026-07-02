-- ============================================================
-- แหล่งสีแถบ/ชิปงานในปฏิทิน-บอร์ด ต่อโครงการ (PART 37)
-- 'campaign' (ค่าเริ่มต้น) | 'brand' — โค้ด graceful ใช้ได้ก่อนรันไฟล์นี้
-- ============================================================
alter table public.tmk_flows add column if not exists bar_color_source text default 'campaign';
