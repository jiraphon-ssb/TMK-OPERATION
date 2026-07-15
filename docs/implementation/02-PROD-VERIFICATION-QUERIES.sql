-- ============================================================================
-- 02-PROD-VERIFICATION-QUERIES.sql  (Audit remediation · RLS-1 / MIG-1 / verify Phase 1)
-- ============================================================================
-- READ-ONLY ทั้งหมด (SELECT ล้วน · ไม่แก้ data/schema/policy) — ปลอดภัยรันบน production
-- วิธีใช้: รันทีละบล็อกใน Supabase SQL editor แล้ว copy ผลแต่ละบล็อกส่งกลับมา
--          (ตั้งชื่อผลตามหมายเลขบล็อก เช่น "ผล A", "ผล B" …)
-- เป้าหมาย: ยืนยัน (1) RLS ต่อ role ครบจริง (2) migration ไหน deploy แล้ว
--          (3) Phase 1 (search_path + audit_logs publication) ติดจริง
-- ============================================================================

-- ── A. RLS เปิด/ปิด ต่อตาราง tmk_* (สำคัญสุด — ต้อง rowsecurity=true ทุกตารางที่มีข้อมูลจริง) ──
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'tmk_%'
order by c.relname;

-- ── B. RLS policies ทั้งหมดต่อตาราง tmk_* (ดูว่าแต่ละตารางมี policy ต่อ role/คำสั่งอะไรบ้าง) ──
select tablename, policyname, permissive, roles, cmd,
       pg_get_expr(polqual, polrelid)      as using_expr,
       pg_get_expr(polwithcheck, polrelid) as withcheck_expr
from pg_policies pp
join pg_policy pol on pol.polname = pp.policyname
join pg_class c on c.oid = pol.polrelid and c.relname = pp.tablename
where schemaname = 'public' and tablename like 'tmk_%'
order by tablename, policyname;
-- (ถ้าบล็อก B error ให้ใช้ตัวย่อแทน:)
-- select tablename, policyname, cmd, roles, qual, with_check
-- from pg_policies where schemaname='public' and tablename like 'tmk_%' order by 1,2;

-- ── C. ยืนยัน SEC-1: SECURITY DEFINER functions + search_path (คาดหวัง proconfig มี search_path=public) ──
select p.proname,
       p.prosecdef            as security_definer,
       p.proconfig            as config,   -- ต้องเห็น {search_path=public}
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'tmk_%'
order by p.prosecdef desc, p.proname;

-- ── D. ยืนยัน RT-1 + realtime publication (คาดหวังเห็น tmk_audit_logs + ตารางที่ subscribe) ──
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;

-- ── E. ตาราง tmk_* ที่มีจริงบน prod (เทียบ future/unverified migrations + ยืนยัน drop-stock-crm) ──
--     คาดหวัง: ตาราง task/notif ใหม่ "มี"; ตาราง stock-crm ที่ถูก drop "ไม่มี" (tmk_purchase_orders, tmk_returns, tmk_stock_counts, tmk_locations, tmk_channel_events, tmk_suppliers, tmk_crm_*)
select table_name
from information_schema.tables
where table_schema = 'public' and table_name like 'tmk_%'
order by table_name;

-- ── F. Migration ledger (ถ้ามี — โปรเจกต์รัน SQL มือ อาจไม่มีตารางนี้ · error = ไม่มี ledger) ──
select version, name, executed_at
from supabase_migrations.schema_migrations
order by version;
-- ถ้า error "relation does not exist" = ไม่มี ledger → ยืนยัน deploy ด้วยผล A-E แทน

-- ── G. คอลัมน์สำคัญของตารางยอดขาย (ยืนยัน schema-tolerant migrations ติดจริง: customer_phone ฯลฯ) ──
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('tmk_mp_orders','tmk_order_overrides','tmk_sale_receipts','tmk_daily_sales','tmk_sales')
order by table_name, ordinal_position;

-- ── H. นับแถวคร่าวๆ ต่อตารางหลัก (ดูว่าตารางไหนมีข้อมูลจริง — ใช้จัดลำดับความสำคัญ RLS) ──
select 'tmk_mp_orders'  as t, count(*) from public.tmk_mp_orders   union all
select 'tmk_sale_receipts', count(*)  from public.tmk_sale_receipts union all
select 'tmk_daily_sales', count(*)    from public.tmk_daily_sales   union all
select 'tmk_sales', count(*)          from public.tmk_sales         union all
select 'tmk_mp_customers', count(*)   from public.tmk_mp_customers  union all
select 'tmk_user_roles', count(*)     from public.tmk_user_roles    union all
select 'tmk_audit_logs', count(*)     from public.tmk_audit_logs;
-- (ถ้าตารางใดไม่มี ให้ลบบรรทัดนั้นแล้วรันใหม่)
