// แจ้งเตือนในแอป — engine ฝั่ง "ผู้ผลิต" (PART 34, ปรับใหม่)
// หน้าที่เดียว: resolve ผู้รับ → เขียน tmk_notifications (upsert กัน id ซ้ำ)
// การกรองเปิด/ปิด (prefs) ย้ายไปฝั่ง "ผู้รับ" แล้ว (notifStore.prefOn) → ผู้ผลิตไม่ต้องรู้ pref คนอื่น
// อ่าน/เก็บ/ลบ/snooze ย้ายไป notifStore.js · meta/นำทาง อยู่ notifRegistry.js
import { supabase } from './supabaseClient.js';
import { TMK } from '../data.js';

const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const BASE_COLS = ['id', 'user_email', 'kind', 'title', 'body', 'flow_id', 'task_id', 'actor', 'read', 'created_at'];
const COL_ERR = /(severity|entity_type|action|url|read_at|archived_at|snooze_until|column|PGRST204|42703)/i;

const me = () => (typeof window !== 'undefined' && window.__userEmail) || '';

// upsert + ignoreDuplicates (ON CONFLICT DO NOTHING) → stable id ซ้ำ = ข้ามเงียบ (กัน 409)
// คอลัมน์ใหม่ยังไม่ migrate → ตัดเหลือ base แล้ว upsert ใหม่ · ตารางหาย → เงียบ
async function _insert(rows) {
  if (!supabase || !Array.isArray(rows) || !rows.length) return;
  const opt = { onConflict: 'id', ignoreDuplicates: true };
  try {
    const { error } = await supabase.from('tmk_notifications').upsert(rows, opt);
    if (error && COL_ERR.test(error.message || error.code || '')) {
      const base = rows.map(r => { const o = {}; BASE_COLS.forEach(k => { if (r[k] !== undefined) o[k] = r[k]; }); return o; });
      await supabase.from('tmk_notifications').upsert(base, opt);
    }
  } catch { /* ตารางยังไม่ migrate → เงียบ */ }
}

// ชื่อ staff → email · ชื่อ duty/บทบาท → email ของทุกคนในบทบาทนั้น · email → คงไว้
export function emailsForAudience(names) {
  const out = new Set();
  const staff = TMK.staff || [], roles = TMK.roles || [], duties = TMK.duties || [];
  (Array.isArray(names) ? names : [names]).forEach(n => {
    if (!n || typeof n !== 'string') return;
    if (n.includes('@')) { out.add(n); return; }
    const s = staff.find(x => x.name === n); if (s?.email) out.add(s.email);
    if (duties.some(d => d.name === n)) roles.filter(r => r.dutyName === n && r.email).forEach(r => out.add(r.email));
    roles.filter(r => r.name === n && r.email).forEach(r => out.add(r.email));
  });
  return [...out];
}

// ชื่อสมาชิก → email (เฉพาะคน/staff) — back-compat
export function emailOfName(name) {
  return (TMK.staff || []).find(s => s.name === name)?.email || '';
}

// id แบบกำหนดได้ → กันแจ้งซ้ำ (เช่น 'due', taskId, dueISO)
export function stableNotifId(...parts) { return parts.filter(Boolean).join(':').slice(0, 200); }

// แจ้งเตือนรวม — recipients = email/ชื่อคน/ชื่อบทบาท (resolve → emails) · ตัดตัวเอง (เว้น selfOk)
export async function notify({ recipients, id, kind = 'mention', severity, title = '', body = '', flowId, taskId, entityType, action, url, actor, selfOk }) {
  const skip = selfOk ? null : me();
  const emails = [...new Set(emailsForAudience(recipients))].filter(e => e && e !== skip);
  if (!emails.length) return;
  const a = actor !== undefined ? actor : me();
  const multi = emails.length > 1;
  const rows = emails.map(em => ({
    id: id ? (multi ? `${id}:${em}` : id) : uid('ntf'),
    user_email: em, kind, read: false, actor: a,
    title, body, flow_id: flowId ?? null, task_id: taskId ?? null,
    ...(severity ? { severity } : {}), ...(entityType ? { entity_type: entityType } : {}),
    ...(action ? { action } : {}), ...(url ? { url } : {}),
  }));
  await _insert(rows);
}

// back-compat — รับ rows ตรงๆ (callers เดิม เช่น modals @แท็ก) · ตัดตัวเอง
export async function pushNotify(rows) {
  if (!Array.isArray(rows) || !rows.length) return;
  const m = me();
  const payload = rows.filter(r => r && r.user_email && r.user_email !== m)
    .map(r => ({ id: uid('ntf'), kind: 'mention', read: false, actor: m, ...r }));
  await _insert(payload);
}
