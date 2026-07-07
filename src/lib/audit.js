/* ============================================================
   TMK Operation — Audit log helper
   ============================================================
   เขียนประวัติการใช้งานลง tmk_audit_logs
   - fire-and-forget: ห้ามทำให้ action หลักพัง (ลอง/แคทช์เงียบ)
   - details เป็น text not null → JSON.stringify เสมอ
   - PART 54: เขียนคอลัมน์ entity_type/entity_id/severity (+ flow_id) ระดับ SQL
     · graceful multi-column strip เมื่อยังไม่รัน migration 20260707
   ============================================================ */
import { supabase } from './supabaseClient.js';

/**
 * @param {object} p
 * @param {'create'|'update'|'delete'|'restore'|'purge'|'move'|'export'} p.action
 * @param {string} p.entityType  เช่น 'task','product','campaign','channel','duty','user','po','ad','segment','daily','monthly','settings'
 * @param {string} [p.entityName] ชื่อ/หัวข้อของรายการ
 * @param {string} [p.entityId]   id ของรายการ (machine · เก็บคอลัมน์ entity_id + details.entityId)
 * @param {'info'|'warn'|'urgent'} [p.severity]  ระดับความสำคัญ (default 'info' · delete/purge → 'warn')
 * @param {string} [p.summary]    ข้อความสรุปสำหรับแสดงผล
 * @param {Array<{label:string,value:string}>} [p.fields]  ค่าที่กรอก/บันทึก (แสดงรายละเอียด)
 * @param {Array<{label:string,from:string,to:string}>} [p.changes]  สิ่งที่เปลี่ยน ก่อน→หลัง (สำหรับการแก้ไข)
 * @param {object} [p.data]  ข้อมูลโครงสร้าง (machine-readable) สำหรับรายงาน เช่น sale lines — เก็บใน details.data
 * @param {string} [p.flowId]  ผูกกิจกรรมเข้ากับโครงการ (เก็บทั้งคอลัมน์ flow_id + details.flowId · graceful)
 */
export async function logAudit({ action, entityType, entityName = '', entityId = null, severity = null, summary = '', fields = null, changes = null, data = null, flowId = null }) {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const email = sess?.session?.user?.email || 'system';
    const sev = severity || (/(delete|purge)/i.test(action || '') ? 'warn' : 'info');
    const payload = { entityType, entityName, summary };
    if (entityId != null) payload.entityId = entityId;
    if (fields && fields.length) payload.fields = fields;
    if (changes && changes.length) payload.changes = changes;
    if (data) payload.data = data;
    if (flowId != null) payload.flowId = flowId;
    const base = { user_email: email, action, details: JSON.stringify(payload) };
    // เขียนคอลัมน์แยก (กรอง server-side เร็ว) · ถ้าคอลัมน์ยังไม่มี = retry แบบตัดคอลัมน์ใหม่ทิ้ง
    const full = {
      ...base,
      entity_type: entityType || null,
      entity_id: entityId != null ? String(entityId) : null,
      severity: sev,
      ...(flowId != null ? { flow_id: flowId } : {}),
    };
    const { error } = await supabase.from('tmk_audit_logs').insert(full);
    if (error && /(entity_type|entity_id|severity|flow_id|column)/i.test(error.message || '')) {
      // fallback ก่อนรัน migration: เขียนเฉพาะคอลัมน์เดิม (ข้อมูลครบใน details JSON อยู่แล้ว)
      await supabase.from('tmk_audit_logs').insert(base);
    }
  } catch (e) {
    console.warn('logAudit non-fatal:', e?.message);
  }
}

/**
 * สร้าง changes[] ({label,from,to}) เฉพาะฟิลด์ที่ค่าเปลี่ยน — ให้เติม log จุดต่างๆ ได้ถูกๆ
 * @param {object} before  ค่าก่อนแก้
 * @param {object} after   ค่าหลังแก้
 * @param {Array<[string,string]|{key:string,label:string,fmt?:Function}>} spec  [[key,label], ...] หรือ {key,label,fmt}
 * @returns {Array<{label:string,from:string,to:string}>}
 */
export function diffFields(before = {}, after = {}, spec = []) {
  const out = [];
  for (const s of spec) {
    const key = Array.isArray(s) ? s[0] : s.key;
    const label = Array.isArray(s) ? (s[1] || s[0]) : (s.label || s.key);
    const fmt = (!Array.isArray(s) && s.fmt) ? s.fmt : (v) => (v == null ? '' : String(v));
    const from = fmt(before?.[key]);
    const to = fmt(after?.[key]);
    if (from !== to) out.push({ label, from, to });
  }
  return out;
}
