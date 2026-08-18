-- ============================================================================
-- 20260811-migrations-tracking.sql — ตารางติดตามว่ารัน migration ไฟล์ไหนไปแล้ว (audit P3-4 ข้อ ข)
-- ============================================================================
-- ปัญหาที่แก้: มี migration 80+ ไฟล์ แต่ไม่มีที่จดว่ารันอะไรไปแล้ว → ต้องจำเอง
--   → เผลอรันซ้ำ/ข้ามไฟล์ได้ (ข้อ ก แก้ไปแล้ว: ปลดชนวน `disable row level security` ในไฟล์เก่า)
--
-- ใช้ยังไง (ขั้นตอนเดียว หลังรัน migration ทุกครั้ง):
--   select public.tmk_migration_applied('20260811-rls-tier3-business-data.sql');
--   -- ใส่โน้ตด้วยก็ได้: select public.tmk_migration_applied('ไฟล์.sql', 'รันบน prod หลัง deploy FE');
--
-- ดูว่ารันอะไรไปแล้ว:
--   select filename, applied_at, applied_by, note from public.tmk_migrations order by applied_at desc;
--
-- Idempotent: รันซ้ำได้ · in-file VERIFY ท้ายไฟล์ · rollback block ล่างสุด
-- ============================================================================

begin;

create table if not exists public.tmk_migrations (
  filename    text primary key,                       -- ชื่อไฟล์ migration (ไม่ซ้ำ = กันบันทึกซ้ำ)
  applied_at  timestamptz not null default now(),
  applied_by  text,                                   -- อีเมลคนรัน (จาก JWT ถ้ามี · null = รันจาก SQL Editor ตรง)
  note        text
);

comment on table public.tmk_migrations is 'บันทึกว่ารัน migration ไฟล์ไหนไปแล้ว — เรียกผ่าน tmk_migration_applied()';

-- helper: บันทึก 1 ไฟล์ (upsert — รันซ้ำแค่อัปเดตเวลา/โน้ต ไม่ error)
create or replace function public.tmk_migration_applied(p_filename text, p_note text default null)
returns public.tmk_migrations
language sql
security definer
set search_path = public
as $$
  insert into public.tmk_migrations (filename, applied_by, note)
  values (p_filename, nullif(coalesce(auth.jwt() ->> 'email', ''), ''), p_note)
  on conflict (filename) do update
    set applied_at = now(),
        applied_by = excluded.applied_by,
        note = coalesce(excluded.note, public.tmk_migrations.note)
  returning *;
$$;

revoke all on function public.tmk_migration_applied(text, text) from public;
grant execute on function public.tmk_migration_applied(text, text) to authenticated;

-- RLS: อ่านได้ทุกคนที่ล็อกอิน · เขียนตรงได้เฉพาะ admin (ปกติเขียนผ่าน helper ข้างบน)
alter table public.tmk_migrations enable row level security;
drop policy if exists tmk_migrations_read on public.tmk_migrations;
drop policy if exists tmk_migrations_admin_write on public.tmk_migrations;
create policy tmk_migrations_read on public.tmk_migrations
  as permissive for select to authenticated using (true);
create policy tmk_migrations_admin_write on public.tmk_migrations
  as permissive for all to authenticated
  using (public.tmk_is_admin()) with check (public.tmk_is_admin());

commit;

-- ── บันทึกย้อนหลัง: migration ที่รู้แน่ว่ารันไปแล้ว (แก้/เพิ่มรายการเองได้) ──────
select public.tmk_migration_applied('20260716-enable-rls-tier1.sql', 'RLS Tier 1');
select public.tmk_migration_applied('20260716-rls-tier2-permission-tables.sql', 'RLS Tier 2 — user_roles/staff เขียน=admin');
select public.tmk_migration_applied('20260811-rls-tier3-business-data.sql', 'RLS Tier 3 — เขียน/ลบ=non-viewer · audit immutable');
select public.tmk_migration_applied('20260811-migrations-tracking.sql', 'ตารางติดตาม migration (ไฟล์นี้)');

-- ── VERIFY (ทุกบรรทัดต้อง ✅) ─────────────────────────────────────────────────
select 'ตาราง tmk_migrations มีจริง (ต้อง = 1)' as check_item, count(*)::text as result,
       case when count(*) = 1 then '✅' else '❌' end as status
from pg_tables where schemaname = 'public' and tablename = 'tmk_migrations'
union all
select 'ฟังก์ชัน tmk_migration_applied() มีจริง (ต้อง = 1)', count(*)::text,
       case when count(*) = 1 then '✅' else '❌' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'tmk_migration_applied'
union all
select 'บันทึกย้อนหลังเข้าแล้ว (ต้อง ≥ 4)', count(*)::text,
       case when count(*) >= 4 then '✅' else '❌' end
from public.tmk_migrations;

-- ── ROLLBACK (copy ไปรันแยก) ────────────────────────────────────────────────
-- begin;
--   drop function if exists public.tmk_migration_applied(text, text);
--   drop table if exists public.tmk_migrations;
-- commit;
