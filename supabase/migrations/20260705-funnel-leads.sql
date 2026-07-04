-- ============================================================
-- คนทักวันนี้: เก็บ "ทักรวมต่อแพลตฟอร์ม" เป็น jsonb (Facebook/LINE/Instagram/TikTok/Phone/อื่นๆ ...)
-- แทนคอลัมน์แยก fb/line ใหม่-เก่า 4 ช่องเดิม (คอลัมน์เก่าคงไว้ back-compat — แถวใหม่เขียนทั้งคู่)
-- รันใน Supabase SQL Editor ครั้งเดียว (idempotent)
-- ============================================================
alter table public.tmk_sales_funnel
  add column if not exists leads jsonb default '{}'::jsonb;
