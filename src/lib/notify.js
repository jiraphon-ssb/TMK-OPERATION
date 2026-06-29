// แจ้งเตือนในแอป (PART 27) — insert เข้า tmk_notifications · graceful (ตารางยังไม่ migrate → เงียบ)
import { supabase } from './supabaseClient.js';
import { TMK } from '../data.js';

const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ส่งแจ้งเตือนหลายรายการ — ตัดของตัวเอง (ไม่เตือนคนทำเอง) · ไม่ throw ถ้าตารางยังไม่มี
export async function pushNotify(rows) {
  if (!supabase || !Array.isArray(rows) || !rows.length) return;
  const me = (typeof window !== 'undefined' && window.__userEmail) || '';
  const payload = rows
    .filter(r => r && r.user_email && r.user_email !== me)
    .map(r => ({ id: uid('ntf'), kind: 'mention', read: false, actor: me, ...r }));
  if (!payload.length) return;
  try { await supabase.from('tmk_notifications').insert(payload); } catch { /* ตารางยังไม่ migrate → เงียบ */ }
}

// ชื่อสมาชิก → email (เฉพาะคน/staff · บทบาทไม่มี email เดี่ยว → ข้าม)
export function emailOfName(name) {
  return (TMK.staff || []).find(s => s.name === name)?.email || '';
}
