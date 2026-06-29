-- ============================================================
-- TMK — โฟลว์เลือกได้หลายแบรนด์ (multi-brand per flow) · PART 17
-- ============================================================
-- วางใน Supabase → SQL Editor → Run · idempotent
-- graceful: ก่อนรัน = ยังใช้แบรนด์เดี่ยว (brand_id) ได้ · หลายแบรนด์ซ่อนเงียบ
-- ============================================================

alter table public.tmk_flows add column if not exists brand_ids text[] default '{}';
