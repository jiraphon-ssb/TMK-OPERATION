-- ============================================================================
-- 05-VERIFY-ONE-SHOT.sql — ตรวจทุกอย่างใน "คำสั่งเดียว" (แก้ปัญหา SQL Editor โชว์แค่ผลสุดท้าย)
-- ============================================================================
-- READ-ONLY 100% (SELECT เดียว · ไม่แตะ data/schema) — รันแล้ว copy ตารางผลทั้งก้อนส่งกลับมา
-- ใช้ได้ทั้ง "ก่อน" และ "หลัง" รัน 20260716-enable-rls-tier1.sql (ค่า A1/A2/B/F จะเปลี่ยนตาม)
-- ============================================================================
with rls as (
  select c.relname, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'tmk\_%' escape '\'
),
pol as (
  select tablename, count(*) as n
  from pg_policies
  where schemaname = 'public' and tablename like 'tmk\_%' escape '\'
  group by tablename
),
fn as (
  select p.proname, p.prosecdef, array_to_string(p.proconfig, ', ') as cfg
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'tmk\_%' escape '\'
),
pub as (
  select tablename from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public'
),
cols as (
  select table_name, string_agg(column_name, ', ' order by ordinal_position) as collist
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('tmk_mp_orders','tmk_order_overrides','tmk_sale_receipts','tmk_daily_sales','tmk_sales')
  group by table_name
)
select 'A1 · RLS เปิดแล้ว' as section,
       coalesce(string_agg(relname, ', ' order by relname), '(ไม่มีเลย)') as detail
from rls where relrowsecurity
union all
select 'A2 · RLS ยังปิด (หลังรัน 20260716 ต้องว่าง)',
       coalesce(string_agg(relname, ', ' order by relname), '(ไม่มี — ครบแล้ว ✅)')
from rls where not relrowsecurity
union all
select 'B · policies ต่อตาราง (ตาราง=จำนวน)',
       coalesce(string_agg(tablename || '=' || n, ', ' order by tablename), '(ยังไม่มี policy เลย)')
from pol
union all
select 'C1 · SECURITY DEFINER functions (ทุกตัวต้องมี search_path=public)',
       coalesce(string_agg(proname || ' → ' || coalesce(cfg, '⚠️ ไม่มี search_path'), ' · ' order by proname), '(ไม่มี)')
from fn where prosecdef
union all
select 'C2 · functions ปกติ (invoker)',
       coalesce(string_agg(proname, ', ' order by proname), '(ไม่มี)')
from fn where not prosecdef
union all
select 'D · realtime publication (ต้องมี tmk_audit_logs)',
       coalesce(string_agg(tablename, ', ' order by tablename), '(ว่าง)')
from pub
union all
select 'E · ตาราง tmk_* ทั้งหมด (' || (select count(*) from rls) || ' ตาราง)',
       (select string_agg(relname, ', ' order by relname) from rls)
union all
select 'E2 · ตาราง stock-crm ค้าง (MIG-1: ว่าง = drop รันไปแล้ว)',
       coalesce((select string_agg(relname, ', ' order by relname) from rls
                 where relname in ('tmk_purchase_orders','tmk_returns','tmk_stock_counts','tmk_locations','tmk_channel_events','tmk_suppliers')
                    or relname like 'tmk\_crm\_%' escape '\'),
                '(ไม่มี — drop รันไปแล้ว ✅)')
union all
select 'F · public RPCs (หลังรัน 20260716 ต้อง = tmk_public_flow_bundle, tmk_public_track)',
       coalesce((select string_agg(proname, ', ' order by proname) from fn
                 where proname in ('tmk_public_track','tmk_public_flow_bundle')),
                '(ยังไม่มี — ยังไม่ได้รัน 20260716)')
union all
select 'G · คอลัมน์ ' || table_name, collist from cols
order by section;
