/* ============================================================
   TMK Operation — Audit log helper
   ============================================================
   เขียนประวัติการใช้งานลง tmk_audit_logs
   - fire-and-forget: ห้ามทำให้ action หลักพัง (ลอง/แคทช์เงียบ)
   - details เป็น text not null → JSON.stringify เสมอ
   ============================================================ */
import { supabase } from './supabaseClient.js';

/**
 * @param {object} p
 * @param {'create'|'update'|'delete'|'restore'|'purge'|'move'|'export'} p.action
 * @param {string} p.entityType  เช่น 'task','product','campaign','channel','duty','user','po','ad','segment','daily','monthly','settings'
 * @param {string} [p.entityName] ชื่อ/หัวข้อของรายการ
 * @param {string} [p.summary]    ข้อความสรุปสำหรับแสดงผล
 * @param {Array<{label:string,value:string}>} [p.fields]  ค่าที่กรอก/บันทึก (แสดงรายละเอียด)
 * @param {Array<{label:string,from:string,to:string}>} [p.changes]  สิ่งที่เปลี่ยน ก่อน→หลัง (สำหรับการแก้ไข)
 * @param {object} [p.data]  ข้อมูลโครงสร้าง (machine-readable) สำหรับรายงาน เช่น sale lines — เก็บใน details.data
 */
export async function logAudit({ action, entityType, entityName = '', summary = '', fields = null, changes = null, data = null }) {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const email = sess?.session?.user?.email || 'system';
    const payload = { entityType, entityName, summary };
    if (fields && fields.length) payload.fields = fields;
    if (changes && changes.length) payload.changes = changes;
    if (data) payload.data = data;
    await supabase.from('tmk_audit_logs').insert({
      user_email: email,
      action,
      details: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn('logAudit non-fatal:', e?.message);
  }
}

// helper: เทียบ object เก่า/ใหม่ → รายการที่เปลี่ยน (ก่อน→หลัง)
export function diffFields(oldObj, newObj, labels) {
  const out = [];
  for (const [key, label] of Object.entries(labels)) {
    const a = oldObj ? oldObj[key] : undefined;
    const b = newObj ? newObj[key] : undefined;
    const sa = Array.isArray(a) ? a.join(', ') : (a == null ? '' : String(a));
    const sb = Array.isArray(b) ? b.join(', ') : (b == null ? '' : String(b));
    if (sa !== sb) out.push({ label, from: sa || '—', to: sb || '—' });
  }
  return out;
}
