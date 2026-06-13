-- ============================================================
-- Presence — ใครออนไลน์/ออฟไลน์ + เคลื่อนไหวล่าสุด (สำหรับการ์ด "ทีมวันนี้" หน้าหลัก)
-- ============================================================
-- เว็บจะ "heartbeat" (upsert แถวของตัวเอง) ทุก ~45 วิ ระหว่างเปิดแท็บอยู่
-- การ์ดทีมวันนี้อ่านตารางนี้ทุก 30 วิ → online = last_seen_at ภายใน ~2.5 นาที
-- 1 แถว/ผู้ใช้ (email เป็น primary key) — เบามาก ไม่โตตามเวลา
-- รันใน Supabase SQL Editor ครั้งเดียว (idempotent)
-- ============================================================

create table if not exists public.tmk_presence (
  email        text primary key,
  name         text,
  page         text default '',
  last_seen_at timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- เปิด realtime ให้ตารางนี้ (เผื่ออนาคต — ตอนนี้หน้าเว็บใช้ poll 30 วิ อยู่แล้ว)
-- ห่อ DO block กัน error ถ้าตารางถูก add เข้า publication ไปแล้ว
do $$
begin
  alter publication supabase_realtime add table public.tmk_presence;
exception when others then null;
end $$;
