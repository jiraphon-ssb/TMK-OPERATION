-- ============================================================
-- TMK — ระบบ Log แบบสุด (Comprehensive Audit Trail) · PART 54
-- ============================================================
-- วางใน Supabase → SQL Editor → Run · idempotent
-- graceful: ก่อนรัน = logAudit retry ตัดคอลัมน์ใหม่ (เขียน details JSON เหมือนเดิม)
--           · LogView กรอง entity/severity แบบ fallback ilike details
-- ============================================================

alter table public.tmk_audit_logs add column if not exists entity_type text;
alter table public.tmk_audit_logs add column if not exists entity_id   text;
alter table public.tmk_audit_logs add column if not exists severity    text default 'info';  -- info | warn | urgent

-- ดัชนีเร่งการกรอง server-side (แทน ilike บน details JSON)
create index if not exists idx_audit_created  on public.tmk_audit_logs (created_at desc);
create index if not exists idx_audit_user     on public.tmk_audit_logs (user_email);
create index if not exists idx_audit_entity   on public.tmk_audit_logs (entity_type);
create index if not exists idx_audit_action   on public.tmk_audit_logs (action);
create index if not exists idx_audit_severity on public.tmk_audit_logs (severity);
