-- 20260805-notifications-plus.sql · PART 29 — ระบบแจ้งเตือนครบวงจร (ขยาย tmk_notifications)
-- วางใน Supabase → SQL Editor → Run · idempotent · UI-gate (RLS ปิด + grant anon/authenticated อยู่แล้วจาก 20260802)
-- graceful: ก่อนรัน = engine retry ตัดคอลัมน์ใหม่ออก · UI degrade (อ่าน=คอลัมน์ read เดิม · ซ่อนเก็บเข้าคลัง)

alter table public.tmk_notifications add column if not exists read_at     timestamptz;  -- อ่านเมื่อไร
alter table public.tmk_notifications add column if not exists archived_at timestamptz;  -- เก็บเข้าคลังเมื่อไร (null = ใช้งาน)
alter table public.tmk_notifications add column if not exists severity    text default 'info';   -- info | success | warn | urgent → สี/ไอคอน
alter table public.tmk_notifications add column if not exists entity_type text;  -- จับคู่ audit (task/flow/comment/...) → ไอคอน/กรอง
alter table public.tmk_notifications add column if not exists action      text;  -- create/update/move/... (ออปชัน)
alter table public.tmk_notifications add column if not exists url         text;  -- เส้นทางคลิกไป (เผื่อ event ที่ไม่ใช่ flow/task)

create index if not exists idx_notif_user_active on public.tmk_notifications(user_email, archived_at, read, created_at desc);

-- เผื่อยังไม่ได้รัน 20260802 (กันพลาด) — สร้างตาราง + grant + realtime ให้ครบ idempotent
create table if not exists public.tmk_notifications (
  id text primary key,
  user_email text not null,
  kind text not null default 'mention',
  title text not null default '',
  body text default '',
  flow_id text,
  task_id text,
  actor text default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.tmk_notifications to anon, authenticated;
alter table public.tmk_notifications disable row level security;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tmk_notifications') then
    alter publication supabase_realtime add table public.tmk_notifications;
  end if;
end $$;
