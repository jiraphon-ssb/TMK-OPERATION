-- 20260715-fix-secdef-search-path.sql  (Audit remediation · Phase 1 · SEC-1)
-- ========================================================================
-- ปัญหา (security): SECURITY DEFINER functions ต่อไปนี้ประกาศไว้ "ไม่มี" set search_path
--   → เสี่ยง search-path hijack บน RPC สิทธิ์สูง (ลบ/void/restore ออเดอร์-ใบเสร็จ, crm directory)
--   หลักฐาน: supabase/migrations/20260713-sale-rpc.sql (delete_orders/void/restore/crm_directory),
--            supabase/migrations/20260714-delete-cleanup.sql (delete_orders)
--   (definer functions อื่น เช่น 20260610/20260611/20260615 ตั้ง search_path ไว้ถูกแล้ว)
--
-- วิธีแก้: ALTER FUNCTION ... SET search_path = public  (แก้เฉพาะ config · ไม่แตะ body/logic)
--   idempotent (รันซ้ำได้) · guard ด้วย if-exists (ข้ามฟังก์ชันที่ยังไม่ deploy · ไม่ error)
--   ไม่กระทบ: business logic, ผลลัพธ์ฟังก์ชัน, permissions, realtime, soft-delete
--
-- รันครั้งเดียวใน Supabase SQL editor. ห้ามรัน production จนกว่าจะได้รับคำสั่ง.
-- ========================================================================

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'tmk_delete_orders')
  then execute 'alter function public.tmk_delete_orders(text[], text, text[]) set search_path = public'; end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'tmk_void_receipts')
  then execute 'alter function public.tmk_void_receipts(text[], text, text) set search_path = public'; end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'tmk_restore_receipts')
  then execute 'alter function public.tmk_restore_receipts(text[], jsonb) set search_path = public'; end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'tmk_crm_directory')
  then execute 'alter function public.tmk_crm_directory() set search_path = public'; end if;
end $$;

-- ── VERIFICATION (คาดหวัง: proconfig ทุกแถวมี {search_path=public}) ──
--   select p.proname, p.proconfig
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.prosecdef
--     and p.proname in ('tmk_delete_orders','tmk_void_receipts','tmk_restore_receipts','tmk_crm_directory')
--   order by p.proname;

-- ── ROLLBACK ──
--   alter function public.tmk_delete_orders(text[], text, text[]) reset search_path;
--   alter function public.tmk_void_receipts(text[], text, text)   reset search_path;
--   alter function public.tmk_restore_receipts(text[], jsonb)     reset search_path;
--   alter function public.tmk_crm_directory()                     reset search_path;
