/* ============================================================
   crmTargets.js — เป้ายอดขาย CRM ต่อเซลล์ + บันทึกประจำวัน CRM (PART 87.2)
   ============================================================
   - แยกตารางจาก tmk_targets: salePerf ทำ tmap[salesperson] จาก fetchTargets —
     แถวเป้า CRM ชื่อซ้ำจะทับเป้าปกติ · ตารางใหม่ tmk_crm_targets / tmk_crm_notes
   - graceful: ตารางยังไม่ migrate → fetch คืน [] · save โยน error ให้ caller โชว์ toast
     (ตรวจ relation-missing ที่ caller — ข้อความชี้ไป 20260731-crm-targets-notes.sql)
   ============================================================ */
import { supabase } from './supabaseClient.js';
import { logAudit } from './audit.js';

export const crmTargetId = (salesperson, month) => `${salesperson}::${month}`;
export const crmNoteId = (salesperson, dateISO) => `${salesperson}::${dateISO}`;

/** เป้า CRM ทุกเซลล์ของเดือน → [] ถ้าตารางยังไม่มี/error */
export async function fetchCrmTargets(month) {
  if (!month) return [];
  try {
    const { data, error } = await supabase
      .from('tmk_crm_targets')
      .select('id,salesperson,month,sales_target')
      .eq('month', month);
    if (error) return [];
    return data || [];
  } catch { return []; }
}

/** upsert เป้า CRM 1 แถว — คืน result ให้ caller เช็ค error (relation-missing → toast บอกรัน migration) */
export async function saveCrmTarget({ salesperson, month, sales_target = 0 }) {
  const row = {
    id: crmTargetId(salesperson, month),
    salesperson, month,
    sales_target: Number(sales_target) || 0,
    updated_at: new Date().toISOString(),
  };
  return supabase.from('tmk_crm_targets').upsert(row, { onConflict: 'id' });
}

/** โน้ตประจำวันทุกเซลล์ของวันเดียว (ใช้ได้ทั้ง scope เดี่ยว/รวมทุกคน) → [] ถ้า error */
export async function fetchCrmNotes(dateISO) {
  if (!dateISO) return [];
  try {
    const { data, error } = await supabase
      .from('tmk_crm_notes')
      .select('id,salesperson,date,note,updated_at')
      .eq('date', dateISO);
    if (error) return [];
    return data || [];
  } catch { return []; }
}

/** บันทึกโน้ตประจำวัน — โน้ตว่าง = ลบแถวทิ้ง (ตารางไม่รก) · คืน result ให้ caller toast */
export async function saveCrmNote({ salesperson, date, note = '' }) {
  const text = String(note || '').trim();
  if (!text) {
    const res = await supabase.from('tmk_crm_notes').delete().eq('id', crmNoteId(salesperson, date));
    if (!res.error) logAudit({ action: 'delete', entityType: 'crm_note', entityName: salesperson, summary: `ลบบันทึกประจำวัน CRM ${salesperson} วันที่ ${date}` });
    return res;
  }
  const row = { id: crmNoteId(salesperson, date), salesperson, date, note: text, updated_at: new Date().toISOString() };
  const res = await supabase.from('tmk_crm_notes').upsert(row, { onConflict: 'id' });
  if (!res.error) logAudit({ action: 'update', entityType: 'crm_note', entityName: salesperson, summary: `บันทึกประจำวัน CRM ${salesperson} วันที่ ${date}`, fields: [{ label: 'โน้ต', value: text.slice(0, 200) }] });
  return res;
}
