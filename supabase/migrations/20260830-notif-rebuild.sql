-- 20260830-notif-rebuild.sql · PART 34 — รื้อระบบแจ้งเตือนใหม่ (Inbox + สัญญาณ + prefs ลง DB)
-- วางใน Supabase → SQL Editor → Run · idempotent · UI-gate (RLS ปิด + grant anon/authenticated)
-- graceful: ก่อนรัน = snooze ซ่อนเงียบ · prefs ตกไปใช้ localStorage เดิม · ที่เหลือทำงานปกติ

-- 1) snooze: เลื่อนเตือนทีหลัง (null = ไม่ได้ snooze)
alter table public.tmk_notifications add column if not exists snooze_until timestamptz;
create index if not exists idx_notif_snooze on public.tmk_notifications(user_email, snooze_until);

-- 2) ตั้งค่าเปิด/ปิดแจ้งเตือน "ต่อผู้ใช้ × ต่อชนิด" (sync ทุกเครื่อง) — แทน localStorage tmk-notif-*
create table if not exists public.tmk_notif_prefs (
  user_email text not null,
  kind       text not null,
  enabled    boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_email, kind)
);
grant select, insert, update, delete on public.tmk_notif_prefs to anon, authenticated;
alter table public.tmk_notif_prefs disable row level security;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tmk_notif_prefs') then
    alter publication supabase_realtime add table public.tmk_notif_prefs;
  end if;
end $$;

-- เผื่อยังไม่เคยรัน 20260802/20260805 — สร้างตารางหลัก + คอลัมน์ขยายให้ครบ idempotent
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
alter table public.tmk_notifications add column if not exists read_at     timestamptz;
alter table public.tmk_notifications add column if not exists archived_at timestamptz;
alter table public.tmk_notifications add column if not exists severity    text default 'info';
alter table public.tmk_notifications add column if not exists entity_type text;
alter table public.tmk_notifications add column if not exists action      text;
alter table public.tmk_notifications add column if not exists url         text;
create index if not exists idx_notif_user_active on public.tmk_notifications(user_email, archived_at, read, created_at desc);
grant select, insert, update, delete on public.tmk_notifications to anon, authenticated;
alter table public.tmk_notifications disable row level security;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tmk_notifications') then
    alter publication supabase_realtime add table public.tmk_notifications;
  end if;
end $$;
