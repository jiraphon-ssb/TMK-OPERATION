-- 20260715-fix-audit-log-realtime.sql  (Audit remediation · Phase 1 · RT-1)
-- ========================================================================
-- ปัญหา: src/views-log.jsx:222 subscribe postgres_changes (INSERT) บน tmk_audit_logs
--   แต่ตารางนี้ "ไม่เคยถูกเพิ่ม" เข้า publication supabase_realtime
--   (20260729-realtime-publication.sql เพิ่ม ~20 ตาราง แต่ไม่มี tmk_audit_logs)
--   → หน้า "บันทึกกิจกรรม" ไม่ได้รับ event สด (เงียบ · ต้องรีเฟรชเอง)
--   เทียบ: tmk_task_comments / tmk_notifications ถูก publish แล้ว → tmk_audit_logs เป็นตัวตกหล่น
--
-- วิธีแก้: เพิ่ม tmk_audit_logs เข้า publication · idempotent · guard (มีตารางจริง + ยังไม่อยู่)
--   ไม่ตั้ง REPLICA IDENTITY FULL (client refetch ทั้งตาราง ไม่อ่าน payload.old = idempotent, ไม่เพิ่ม WAL)
--   ถ้าไม่รัน: หน้า log ยังทำงาน (degrade เป็น reload/polling — ไม่พัง)
--
-- รันครั้งเดียวใน Supabase SQL editor. ห้ามรัน production จนกว่าจะได้รับคำสั่ง.
-- ========================================================================

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'tmk_audit_logs')
     and not exists (select 1 from pg_publication_tables
             where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tmk_audit_logs')
  then
    execute 'alter publication supabase_realtime add table public.tmk_audit_logs';
  end if;
end $$;

-- ── VERIFICATION (คาดหวัง: 1 แถว) ──
--   select * from pg_publication_tables
--   where pubname = 'supabase_realtime' and tablename = 'tmk_audit_logs';

-- ── ROLLBACK ──
--   alter publication supabase_realtime drop table public.tmk_audit_logs;
