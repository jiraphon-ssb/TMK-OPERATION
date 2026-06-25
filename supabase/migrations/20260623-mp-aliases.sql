-- ============================================================
-- tmk_mp_aliases — ชื่อพ้อง (alias) ของลาย + สีที่ลงทะเบียนเพิ่ม
-- ใช้คู่กับ pipeline: design alias → รหัส catalog ; color → คำสีใหม่ที่ระบบควรรู้จัก
-- idempotent · UI-gate (ปิด RLS + grant) — รันใน Supabase SQL Editor ได้เลย
-- ============================================================
create table if not exists public.tmk_mp_aliases (
  id text primary key,                 -- kind + ':' + lower(term)
  kind text not null,                  -- 'design' | 'color'
  term text not null,                  -- คำที่เจอในไฟล์ (เช่น "ราษภักดี", "ดารารัตน์", "ส้มอิฐ")
  code text default '',                -- รหัส catalog ที่จะแมปไป (เฉพาะ kind='design')
  design text default '',              -- ชื่อลายมาตรฐานที่จะแสดง (เฉพาะ kind='design')
  note text default '',
  created_by text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists tmk_mp_aliases_kind_idx on public.tmk_mp_aliases(kind);

grant select, insert, update, delete on public.tmk_mp_aliases to anon, authenticated;
alter table public.tmk_mp_aliases disable row level security;
