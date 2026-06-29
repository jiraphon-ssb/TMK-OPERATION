-- ============================================================
-- TMK — ผูกประวัติกิจกรรม (audit log) เข้ากับโฟลว์ · PART 18
-- ============================================================
-- วางใน Supabase → SQL Editor → Run · idempotent
-- graceful: ก่อนรัน = เก็บ flowId ใน details JSON แทน (per-flow filter ผ่าน ilike ได้)
-- ============================================================

alter table public.tmk_audit_logs add column if not exists flow_id text;
create index if not exists idx_audit_flow on public.tmk_audit_logs (flow_id);
