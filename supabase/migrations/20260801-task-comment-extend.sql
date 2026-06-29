-- 20260801-task-comment-extend.sql · PART 26 — คอมเมนต์งาน: เธรด + รีแอกชัน + ป้ายนับบนการ์ด
-- วางใน Supabase → SQL Editor → Run · idempotent · graceful (ก่อนรัน = ฟีเจอร์ใหม่ซ่อนเงียบ · คอมเมนต์พื้นฐานยังทำงาน)

-- ตอบกลับ/เธรด + รีแอกชัน emoji
alter table public.tmk_task_comments add column if not exists parent_id text;
alter table public.tmk_task_comments add column if not exists reactions jsonb default '[]'::jsonb;
create index if not exists idx_task_comments_parent on public.tmk_task_comments(parent_id);

-- จำนวนคอมเมนต์ต่อ task (ป้าย 💬 บนการ์ด) — view เบาๆ เหมือน tmk_customer_totals
create or replace view public.tmk_task_comment_counts as
  select task_id, count(*)::int as comment_count
  from public.tmk_task_comments
  group by task_id;
grant select on public.tmk_task_comment_counts to anon, authenticated;
