-- ============================================================
-- Versioned golden catalog — เก็บประวัติชื่อ/ราคา/หมวด ทุกครั้งที่ save แคตตาล็อก
-- "เริ่ม" เฟสแรก: เก็บ snapshot + ดูประวัติในฟอร์ม (ยังไม่ wire as-of-date pinning)
-- idempotent (if not exists ทุกบรรทัด) · UI-gate (disable RLS + grant) เหมือนตาราง tmk_* อื่น
-- วางทั้งก้อนนี้ใน Supabase → SQL Editor → Run ครั้งเดียว
-- โค้ดฝั่งเว็บ graceful: ยังไม่รัน migration นี้ → save ปกติ, ประวัติว่าง (ไม่ error)
-- ============================================================

create table if not exists public.tmk_catalog_versions (
  id text primary key,
  catalog_id text not null,             -- อ้างถึง tmk_shirt_catalog.id (ไม่มี FK — soft link)
  code text,
  name text,
  price numeric,
  price_wholesale numeric,
  type text,
  shirt_class text,
  job_type text,
  snapshot jsonb,                       -- ทั้งแถวตอน save (machine-readable, เผื่อ as-of-date เฟสถัดไป)
  changed_by text,
  changed_at timestamptz default now()
);

create index if not exists idx_catalog_versions_cid
  on public.tmk_catalog_versions(catalog_id, changed_at desc);

grant select, insert on public.tmk_catalog_versions to anon, authenticated;
alter table public.tmk_catalog_versions disable row level security;
