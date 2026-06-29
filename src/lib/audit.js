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
 * @param {string} [p.flowId]  ผูกกิจกรรมเข้ากับโครงการ (เก็บทั้งคอลัมน์ flow_id + details.flowId · graceful)
 */
export async function logAudit({ action, entityType, entityName = '', summary = '', fields = null, changes = null, data = null, flowId = null }) {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const email = sess?.session?.user?.email || 'system';
    const payload = { entityType, entityName, summary };
    if (fields && fields.length) payload.fields = fields;
    if (changes && changes.length) payload.changes = changes;
    if (data) payload.data = data;
    if (flowId != null) payload.flowId = flowId;
    const base = { user_email: email, action, details: JSON.stringify(payload) };
    // เก็บ flow_id เป็นคอลัมน์แยกด้วย (per-flow filter เร็ว) · ถ้าคอลัมน์ยังไม่มี = retry แบบไม่มี
    const row = flowId != null ? { ...base, flow_id: flowId } : base;
    const { error } = await supabase.from('tmk_audit_logs').insert(row);
    if (error && flowId != null && /flow_id|column/i.test(error.message || '')) {
      await supabase.from('tmk_audit_logs').insert(base);
    }
  } catch (e) {
    console.warn('logAudit non-fatal:', e?.message);
  }
}
