/* ============================================================
   TMK Operation — Audit log helper
   ============================================================
   เขียนประวัติการใช้งานลง tmk_audit_logs
   - fire-and-forget: ห้ามทำให้ action หลักพัง (ลอง/แคทช์เงียบ)
   - details เป็น text not null → JSON.stringify เสมอ
   ============================================================ */
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from '../userContext.jsx';

/**
 * @param {object} p
 * @param {'create'|'update'|'delete'|'restore'|'purge'|'move'|'export'} p.action
 * @param {string} p.entityType  เช่น 'task','product','campaign','channel','duty','user','po','ad','segment','daily','monthly','settings'
 * @param {string} [p.entityName] ชื่อ/หัวข้อของรายการ
 * @param {string} [p.summary]    ข้อความสรุปสำหรับแสดงผล
 */
export async function logAudit({ action, entityType, entityName = '', summary = '' }) {
  try {
    const email = getCurrentUser()?.email || 'system';
    await supabase.from('tmk_audit_logs').insert({
      user_email: email,
      action,
      details: JSON.stringify({ entityType, entityName, summary }),
    });
  } catch (e) {
    console.warn('logAudit non-fatal:', e?.message);
  }
}
