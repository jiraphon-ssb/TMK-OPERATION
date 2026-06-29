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
