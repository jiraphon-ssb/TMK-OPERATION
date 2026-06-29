-- 20260802-notifications.sql · PART 27 — แจ้งเตือนในแอป (ถูกแท็ก @ / ถูกมอบหมายงาน)
-- วางใน Supabase → SQL Editor → Run · idempotent · UI-gate (disable RLS + grant anon/authenticated)
-- graceful: ก่อนรัน = กระดิ่งยังโชว์เตือนแบบคำนวณ client (ครบกำหนด/ออเดอร์/สต็อก) ตามเดิม · ส่วน @แท็ก/มอบหมาย ซ่อนเงียบ

create table if not exists public.tmk_notifications (
  id text primary key,
  user_email text not null,          -- ผู้รับการแจ้งเตือน
  kind text not null default 'mention',  -- mention | assign
  title text not null default '',
  body text default '',
  flow_id text,
  task_id text,
  actor text default '',             -- คนที่ทำให้เกิด (email)
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_user on public.tmk_notifications(user_email, read, created_at desc);

grant select, insert, update, delete on public.tmk_notifications to anon, authenticated;
alter table public.tmk_notifications disable row level security;

-- realtime (เด้งเตือนสดไม่ต้องรีเฟรช)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tmk_notifications') then
    alter publication supabase_realtime add table public.tmk_notifications;
  end if;
end $$;
