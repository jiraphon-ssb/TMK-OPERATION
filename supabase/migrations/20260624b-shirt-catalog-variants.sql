-- ============================================================
-- tmk_shirt_catalog: เพิ่ม variants — เก็บ "รหัสรายแบบที่แก้เอง" (override)
-- key = "สี|ไซซ์" → รหัสที่กำหนดเอง · ตัวที่ไม่แก้ยังสร้างจากสูตร base-โค้ดสี-ไซซ์
-- idempotent — รันใน Supabase SQL Editor
-- ============================================================
alter table public.tmk_shirt_catalog
  add column if not exists variants jsonb default '{}'::jsonb;
