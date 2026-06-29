-- 20260731-task-comments.sql · PART 24/25 — คอมเมนต์/พูดคุยในงาน
-- หมายเหตุ: ตาราง tmk_task_comments มีอยู่แล้วใน SETUP-ALL.sql (คอลัมน์ text/author) →
--   create-if-not-exists ด้านล่างจะไม่สร้างซ้ำ (no-op) · โค้ดเว็บใช้ text/author ตรงกับของจริง.
-- งานหลักของไฟล์นี้: ให้ grant/RLS + เปิด realtime ให้ตารางนี้. วางใน Supabase → SQL Editor → Run · idempotent.

create table if not exists public.tmk_task_comments (
  id text primary key,
  task_id text not null,
  text text not null,
  author text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_task_comments_task on public.tmk_task_comments(task_id, created_at);

grant select, insert, update, delete on public.tmk_task_comments to anon, authenticated;
alter table public.tmk_task_comments disable row level security;

-- realtime (ให้คอมเมนต์โผล่สดข้ามอุปกรณ์) · idempotent
do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public' and tablename='tmk_task_comments') then
    alter publication supabase_realtime add table public.tmk_task_comments;
  end if;
end $$;
