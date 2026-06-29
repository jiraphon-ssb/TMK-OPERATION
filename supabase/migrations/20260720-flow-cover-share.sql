-- ============================================================
-- TMK — โฟลว์: รูปปก (cover) + แชร์ลิงก์อ่านอย่างเดียว · PART 19
-- ============================================================
-- วางใน Supabase → SQL Editor → Run · idempotent · ไม่แตะตาราง Sale
-- graceful: ก่อนรัน = ฟีเจอร์ cover/share ซ่อนเงียบ (UI ไม่พัง)
-- ============================================================

-- รูปปกการ์ดโฟลว์ (data URL ย่อแล้ว หรือ URL) — ไม่มี = ใช้แถบสีโฟลว์แทน
alter table public.tmk_flows add column if not exists cover_url text;

-- แชร์ลิงก์ให้คนนอกดู (อ่านอย่างเดียว) — token สุ่ม + สวิตช์เปิด/ปิด (revoke ได้)
alter table public.tmk_flows add column if not exists share_token text;
alter table public.tmk_flows add column if not exists share_enabled boolean default false;

create index if not exists idx_flows_share on public.tmk_flows (share_token) where share_enabled;
