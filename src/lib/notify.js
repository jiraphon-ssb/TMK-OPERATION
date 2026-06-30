// แจ้งเตือนในแอป (PART 27/29) — engine กลาง · graceful (ตาราง/คอลัมน์ยังไม่ migrate → เงียบ/degrade)
import { supabase } from './supabaseClient.js';
import { TMK } from '../data.js';

const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const BASE_COLS = ['id', 'user_email', 'kind', 'title', 'body', 'flow_id', 'task_id', 'actor', 'read', 'created_at'];

const me = () => (typeof window !== 'undefined' && window.__userEmail) || '';

// insert แบบ graceful: คอลัมน์ใหม่ยังไม่ migrate (42703/PGRST204) → ตัดเหลือ base แล้วลองใหม่ ·
// duplicate key (stable id) → เงียบ (กันแจ้งซ้ำ) · ตารางหาย → เงียบ
// upsert + ignoreDuplicates (ON CONFLICT DO NOTHING) → stable id ซ้ำ = ข้ามเงียบ (กัน 409)
async function _insert(rows) {
  if (!supabase || !Array.isArray(rows) || !rows.length) return;
  const opt = { onConflict: 'id', ignoreDuplicates: true };
  try {
    const { error } = await supabase.from('tmk_notifications').upsert(rows, opt);
    if (error && /(severity|entity_type|action|url|read_at|archived_at|column|PGRST204)/i.test(error.message || error.code || '')) {
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

// preference per-ชนิด (localStorage · รูปแบบเดียวกับ flag เดิม tmk-notif-*) · ดีฟอลต์เปิด
const PREF_ALIAS = { due: 'overdue' }; // ใกล้ครบ + เลยกำหนด = สวิตช์เดียว
export function notifPrefOn(kind) {
  if (typeof localStorage === 'undefined') return true;
  const k = PREF_ALIAS[kind] || kind;
  try { return localStorage.getItem('tmk-notif-' + k) !== 'false'; } catch { return true; }
}

// แจ้งเตือนรวม — recipients = email/ชื่อคน/ชื่อบทบาท (resolve → emails) · ตัดตัวเอง (เว้น selfOk) · graceful
export async function notify({ recipients, id, kind = 'mention', severity, title = '', body = '', flowId, taskId, entityType, action, url, actor, selfOk }) {
  if (!notifPrefOn(kind)) return; // ผู้ลงมือปิดชนิดนี้ → ไม่ยิง
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

// update แบบ graceful: คอลัมน์ใหม่หาย → ลองใหม่ด้วย base
async function _update(ids, full, base) {
  if (!supabase || !ids || !ids.length) return;
  try {
    const { error } = await supabase.from('tmk_notifications').update(full).in('id', ids);
    if (error && /(read_at|archived_at|column|PGRST204)/i.test(error.message || error.code || '')) {
      await supabase.from('tmk_notifications').update(base).in('id', ids);
    }
  } catch { /* เงียบ */ }
}
export async function setNotifRead(ids, read = true) {
  await _update(ids, { read, read_at: read ? new Date().toISOString() : null }, { read });
}
export async function archiveNotif(ids) { // เก็บเข้าคลัง (+อ่านแล้ว) · ถ้าไม่มี archived_at → อย่างน้อย mark read
  await _update(ids, { archived_at: new Date().toISOString(), read: true, read_at: new Date().toISOString() }, { read: true });
}
export async function unarchiveNotif(ids) { await _update(ids, { archived_at: null }, {}); }
export async function deleteNotif(ids) {
  if (!supabase || !ids || !ids.length) return;
  try { await supabase.from('tmk_notifications').delete().in('id', ids); } catch { /* เงียบ */ }
}

// back-compat — รับ rows ตรงๆ (callers เดิม) · ตัดตัวเอง · graceful + รองรับ field ใหม่
export async function pushNotify(rows) {
  if (!Array.isArray(rows) || !rows.length) return;
  const m = me();
  const payload = rows.filter(r => r && r.user_email && r.user_email !== m)
    .map(r => ({ id: uid('ntf'), kind: 'mention', read: false, actor: m, ...r }));
  await _insert(payload);
}
