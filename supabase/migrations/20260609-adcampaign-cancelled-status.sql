-- ============================================================
-- TMK Operation — เพิ่มสถานะ 'cancelled' (ยกเลิก) ให้แคมเปญแอด
-- ============================================================
-- เดิม tmk_ad_campaigns.status รับได้แค่ ('upcoming','live','done','paused')
-- เพิ่ม 'cancelled' เพื่อให้ทำเครื่องหมาย "ยกเลิก" แคมเปญได้
-- (ต้องรันก่อนถึงจะบันทึกสถานะ "ยกเลิก" ได้ — ไม่งั้น upsert จะ error)
-- รันใน Supabase SQL Editor
-- ============================================================

alter table public.tmk_ad_campaigns
  drop constraint if exists tmk_ad_campaigns_status_check;

alter table public.tmk_ad_campaigns
  add constraint tmk_ad_campaigns_status_check
  check (status in ('upcoming', 'live', 'paused', 'done', 'cancelled'));
