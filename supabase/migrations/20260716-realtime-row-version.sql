-- ============================================================================
-- 20260716-realtime-row-version.sql — REALTIME Phase 3.0: optimistic concurrency (row_version)
-- ============================================================================
-- blueprint §9: entity ที่หลายคนแก้ได้ต้องมี row_version → กัน "เขียนทับเงียบ" (silent overwrite)
-- ADDITIVE + idempotent: เพิ่มคอลัมน์ + trigger auto-bump — **ไม่เปลี่ยน behavior เดิม**
--   - อ่านเดิม: ไม่ได้ select row_version → ไม่กระทบ
--   - เขียนเดิม (ไม่มี guard): ยังทำงานปกติ · trigger แค่ +1 row_version ให้เพิ่ม (ไม่แตะ business data)
--   - เขียนใหม่ (มี guard `where row_version = expected`): version ไม่ตรง = 0 rows = conflict → FE จัดการ
-- ทำกับ 2 ตาราง OCC-critical: tmk_tasks (title/สถานะ/due) · tmk_mp_orders (สถานะ/ยอด/ชำระ)
-- ⚠️ ไม่มีการเปลี่ยนสูตร/ลบข้อมูล · รันทั้งไฟล์รวดเดียวได้ (transaction) · verify ท้ายไฟล์
-- FE พร้อม fallback: ก่อนรัน = helper ตรวจ 42703 แล้ว update แบบไม่ guard (ทำงานเหมือนเดิม)
-- ============================================================================

begin;

-- ── §1 เพิ่มคอลัมน์ row_version (default 1 · not null) ──────────────────────
alter table public.tmk_tasks     add column if not exists row_version bigint not null default 1;
alter table public.tmk_mp_orders add column if not exists row_version bigint not null default 1;

-- ── §2 trigger function: BEFORE UPDATE → +1 (เฉพาะเมื่อ business data เปลี่ยนจริง) ─
-- ข้าม bump ถ้า client เผลอส่ง row_version มาเอง = ค่าเดิม (กัน bump ซ้อน) · เทียบทั้งแถวยกเว้น row_version
create or replace function public.tmk_bump_row_version()
returns trigger
language plpgsql
as $$
begin
  -- ถ้าไม่มีอะไรเปลี่ยนนอกจาก row_version → ไม่ bump (housekeeping no-op ก็ไม่เพิ่ม)
  if (to_jsonb(new) - 'row_version') is distinct from (to_jsonb(old) - 'row_version') then
    new.row_version := old.row_version + 1;
  else
    new.row_version := old.row_version;
  end if;
  return new;
end;
$$;

-- ── §3 ผูก trigger (idempotent: drop ก่อน create) ──────────────────────────
drop trigger if exists tmk_tasks_bump_version     on public.tmk_tasks;
create trigger tmk_tasks_bump_version     before update on public.tmk_tasks     for each row execute function public.tmk_bump_row_version();
drop trigger if exists tmk_mp_orders_bump_version on public.tmk_mp_orders;
create trigger tmk_mp_orders_bump_version before update on public.tmk_mp_orders for each row execute function public.tmk_bump_row_version();

commit;

-- ── VERIFY (ผลลัพธ์สุดท้าย — ทุกบรรทัดต้อง ✅) ────────────────────────────────
select 'คอลัมน์ row_version (ต้อง = 2)' as check_item, count(*)::text as result,
       case when count(*) = 2 then '✅' else '❌' end as status
from information_schema.columns
where table_schema = 'public' and column_name = 'row_version'
  and table_name in ('tmk_tasks', 'tmk_mp_orders')
union all
select 'trigger auto-bump (ต้อง = 2)', count(*)::text,
       case when count(*) = 2 then '✅' else '❌' end
from pg_trigger where tgname in ('tmk_tasks_bump_version', 'tmk_mp_orders_bump_version') and not tgisinternal
union all
select 'ฟังก์ชัน tmk_bump_row_version (ต้อง = 1)', count(*)::text,
       case when count(*) = 1 then '✅' else '❌' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'tmk_bump_row_version';

-- ── ROLLBACK (ถ้าต้องถอย — copy ไปรันแยก · ปลอดภัย: แค่ลบคอลัมน์เสริม) ──────────
-- begin;
--   drop trigger if exists tmk_tasks_bump_version on public.tmk_tasks;
--   drop trigger if exists tmk_mp_orders_bump_version on public.tmk_mp_orders;
--   drop function if exists public.tmk_bump_row_version();
--   alter table public.tmk_tasks     drop column if exists row_version;
--   alter table public.tmk_mp_orders drop column if exists row_version;
-- commit;
