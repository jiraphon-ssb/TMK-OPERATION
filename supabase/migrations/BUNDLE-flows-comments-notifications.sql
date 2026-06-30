-- ============================================================================
-- BUNDLE: ระบบโครงการ + คอมเมนต์ + แจ้งเตือน (PART 23–28) — รวม 10 migration ก้อนเดียว
-- วางทั้งไฟล์ใน Supabase → SQL Editor → Run · idempotent ทุกอัน (รันซ้ำได้ปลอดภัย)
-- ครอบคลุม: 20260710 · 20260712 · 20260715 · 20260718 · 20260720 · 20260729 · 20260730 · 20260731 · 20260801 · 20260802
-- ============================================================================


-- ========== 20260710-flows-brands.sql ==========
-- ============================================================
-- TMK — Multi-Flow (board หลายอัน) + แบรนด์
-- ============================================================
-- วางทั้งก้อนนี้ใน Supabase → SQL Editor → Run ครั้งเดียวจบ
-- idempotent (if not exists ทุกบรรทัด) · UI-gate (disable RLS + grant anon/authenticated) เหมือนตาราง tmk_* อื่น
-- *** ของระบบ "วางแผนงาน/โฟลว์" เท่านั้น — ไม่แตะตารางระบบ Sale/คลัง/CRM เดิม ***
-- graceful: โค้ดฝั่งเว็บทำงานได้แม้ยังไม่รัน (โฟลว์เหลือ "ทั่วไป" อันเดียว · แบรนด์โชว์ป้ายเตือน)
-- ============================================================

-- ========== แบรนด์ (จัดกลุ่ม/ป้ายกำกับโฟลว์ · เลียนแบบ tmk_channels) ==========
create table if not exists public.tmk_brands (
  id text primary key, name text not null, color text default '#6b5ce0',
  logo_url text default '', tagline text default '',
  sort_order integer not null default 0, deleted_at timestamptz, updated_at timestamptz default now()
);

-- ========== โฟลว์ (board วางแผนงาน หลายอัน · แต่ละอันตั้งค่าได้เอง) ==========
create table if not exists public.tmk_flows (
  id text primary key, name text not null, color text default '#6b5ce0', icon text default '',
  description text default '', brand_id text, campaign_ids text[] default '{}',
  statuses jsonb default '[]'::jsonb,                  -- [{id,label,color,done}] · ว่าง = ใช้ดีฟอลต์ 4 คอลัมน์
  members text[] default '{}', visibility text default 'shared',   -- 'shared' | 'private'
  owner text default '', default_view text default 'kanban',
  archived boolean default false,
  sort_order integer not null default 0, deleted_at timestamptz, updated_at timestamptz default now()
);

-- ========== ผูกงานเข้าโฟลว์ (งานเดิม flow_id = null → "โฟลว์ทั่วไป" ตอน read) ==========
alter table public.tmk_tasks add column if not exists flow_id text;

-- ========== สิทธิ์ (grant anon/authenticated) + ปิด RLS (UI-gate เหมือน tmk_* อื่น) ==========
grant select, insert, update, delete on
  public.tmk_brands, public.tmk_flows
  to anon, authenticated;

alter table public.tmk_brands disable row level security;
alter table public.tmk_flows  disable row level security;


-- ========== 20260712-task-tags.sql ==========
-- ============================================================
-- TMK — แท็กในงาน (task tags) · PART 16
-- ============================================================
-- วางใน Supabase → SQL Editor → Run · idempotent
-- graceful: โค้ดฝั่งเว็บทำงานได้แม้ยังไม่รัน (ช่องแท็กจะบันทึกไม่ได้จนกว่าจะรัน — ไม่พัง)
-- priority + date_end มีอยู่แล้วใน tmk_tasks (ไม่ต้องเพิ่ม)
-- ============================================================

alter table public.tmk_tasks add column if not exists tags text[] default '{}';


-- ========== 20260715-flow-brands-multi.sql ==========
-- ============================================================
-- TMK — โฟลว์เลือกได้หลายแบรนด์ (multi-brand per flow) · PART 17
-- ============================================================
-- วางใน Supabase → SQL Editor → Run · idempotent
-- graceful: ก่อนรัน = ยังใช้แบรนด์เดี่ยว (brand_id) ได้ · หลายแบรนด์ซ่อนเงียบ
-- ============================================================

alter table public.tmk_flows add column if not exists brand_ids text[] default '{}';


-- ========== 20260718-audit-flow.sql ==========
-- ============================================================
-- TMK — ผูกประวัติกิจกรรม (audit log) เข้ากับโฟลว์ · PART 18
-- ============================================================
-- วางใน Supabase → SQL Editor → Run · idempotent
-- graceful: ก่อนรัน = เก็บ flowId ใน details JSON แทน (per-flow filter ผ่าน ilike ได้)
-- ============================================================

alter table public.tmk_audit_logs add column if not exists flow_id text;
create index if not exists idx_audit_flow on public.tmk_audit_logs (flow_id);


-- ========== 20260720-flow-cover-share.sql ==========
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


-- ========== 20260729-realtime-publication.sql ==========
-- 20260729-realtime-publication.sql
-- เปิด Realtime (postgres_changes) ให้ตาราง tmk_* ทุกตัวที่หน้าเว็บ subscribe
-- ปัญหาเดิม: client subscribe ~20 ตาราง แต่ publication `supabase_realtime` มีแค่
--   tmk_orders/tmk_customers/tmk_sales/tmk_presence (จาก migration เก่า) → event ตารางอื่นไม่เคยยิง
--   → แอปตกไปใช้ polling 120 วิ → ผู้ใช้รู้สึกว่า "ต้องรีเฟรชเอง".
-- รันครั้งเดียวใน Supabase SQL editor. Idempotent (รันซ้ำได้ · ข้ามตารางที่ add แล้ว/ที่ยังไม่มี).
-- หมายเหตุ: ไม่ตั้ง REPLICA IDENTITY FULL — client refetch ทั้งตารางเมื่อมี event (ไม่อ่าน payload.old)
--   จึงไม่ต้องเพิ่ม WAL/egress จาก replica identity.
-- ถ้าไม่รัน migration นี้: แอปยังทำงานปกติ (degrade เป็น polling เหมือนเดิม — ไม่พัง).

do $$
declare t text;
begin
  foreach t in array array[
    'tmk_channels','tmk_campaigns','tmk_tasks','tmk_brands','tmk_flows','tmk_products','tmk_settings',
    'tmk_user_roles','tmk_staff','tmk_duties','tmk_daily_sales','tmk_ad_campaigns',
    'tmk_customer_segments','tmk_fb_metrics','tmk_monthly_history',
    'tmk_color_mix','tmk_size_mix','tmk_purchase_orders',
    'tmk_orders','tmk_customers'
  ]
  loop
    -- เพิ่มเฉพาะตารางที่ "มีจริง" และ "ยังไม่อยู่ใน publication"
    if exists (select 1 from information_schema.tables
               where table_schema='public' and table_name=t)
       and not exists (select 1 from pg_publication_tables
               where pubname='supabase_realtime' and schemaname='public' and tablename=t)
    then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- ========== 20260730-task-extend.sql ==========
-- 20260730-task-extend.sql · PART 24 — ต่อยอดงานในโครงการ
-- เพิ่ม: เช็คลิสต์/งานย่อย (subtasks) + ลำดับการ์ดในคอลัมน์ (sort_order)
-- วางใน Supabase → SQL Editor → Run · idempotent
-- graceful: เว็บทำงานได้แม้ยังไม่รัน (เช็คลิสต์/ลากจัดลำดับจะยังไม่บันทึก แต่ไม่พัง — save retry ตัด field เอง)

alter table public.tmk_tasks add column if not exists subtasks jsonb default '[]'::jsonb;
alter table public.tmk_tasks add column if not exists sort_order integer default 0;


-- ========== 20260731-task-comments.sql ==========
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


-- ========== 20260801-task-comment-extend.sql ==========
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


-- ========== 20260802-notifications.sql ==========
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

