// Store กลางของแจ้งเตือน (PART 34) — singleton: list + prefs + realtime "ช่องเดียว"
// แก้ปัญหาเดิม: กระดิ่งกับ Center subscribe ตารางเดียวกัน 2 ที่ (เปลือง egress + state คนละชุด)
// ทุก component ใช้ useNotifications() ที่ subscribe store เดียวกัน → channel เดียว, cache เดียว
import { useSyncExternalStore } from 'react';
import { supabase } from './supabaseClient.js';

const EXT_COLS = 'id,kind,title,body,flow_id,task_id,actor,read,created_at,read_at,archived_at,snooze_until,severity,entity_type,action,url';
const BASE_SEL = 'id,kind,title,body,flow_id,task_id,actor,read,created_at';
const COL_ERR = /(read_at|archived_at|snooze_until|severity|entity_type|action|url|column|PGRST204|42703)/i;

// due เป็น alias ของ overdue (สวิตช์เดียวคุมทั้งใกล้ครบ+เลยกำหนด) — back-compat กับ key เดิม tmk-notif-*
const PREF_ALIAS = { due: 'overdue' };
const prefKey = (k) => PREF_ALIAS[k] || k;

let state = { list: [], prefs: {}, loaded: false, email: '', hasExt: true, hasPrefs: true };
const listeners = new Set();
let channel = null;
let inited = '';

function setState(patch) { state = { ...state, ...patch }; listeners.forEach(l => l()); }
function subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); }
function getSnapshot() { return state; }

// ---------- prefs (DB-backed + localStorage fallback) ----------
// อ่าน sync จาก cache — ใช้ได้ทั้งใน React และนอก React (engine/due-sweep)
export function prefOn(kind) {
  const k = prefKey(kind);
  if (state.hasPrefs && state.loaded) return state.prefs[k] !== false; // default เปิด
  try { return localStorage.getItem('tmk-notif-' + k) !== 'false'; } catch { return true; }
}

export async function setPref(kind, enabled) {
  const k = prefKey(kind);
  setState({ prefs: { ...state.prefs, [k]: enabled } }); // optimistic
  if (state.hasPrefs && supabase && state.email) {
    try {
      const { error } = await supabase.from('tmk_notif_prefs')
        .upsert({ user_email: state.email, kind: k, enabled, updated_at: new Date().toISOString() }, { onConflict: 'user_email,kind' });
      if (error && COL_ERR.test(error.message || error.code || '')) throw error;
      if (!error) return;
    } catch { setState({ hasPrefs: false }); }
  }
  try { localStorage.setItem('tmk-notif-' + k, enabled ? 'true' : 'false'); } catch { /* ignore */ }
}

async function loadPrefs(email) {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from('tmk_notif_prefs').select('kind,enabled').eq('user_email', email);
    if (error) { setState({ hasPrefs: false }); return; }
    const prefs = {}; (data || []).forEach(r => { prefs[r.kind] = r.enabled; });
    setState({ prefs });
  } catch { setState({ hasPrefs: false }); }
}

// ---------- list ----------
async function loadList(email) {
  if (!supabase || !email) return;
  let sel = state.hasExt ? EXT_COLS : BASE_SEL;
  let { data, error } = await supabase.from('tmk_notifications').select(sel).eq('user_email', email).order('created_at', { ascending: false }).limit(300);
  if (error && COL_ERR.test(error.message || error.code || '')) {
    setState({ hasExt: false });
    ({ data, error } = await supabase.from('tmk_notifications').select(BASE_SEL).eq('user_email', email).order('created_at', { ascending: false }).limit(300));
  }
  if (!error && Array.isArray(data)) setState({ list: data, loaded: true });
  else setState({ loaded: true });
}

// ---------- init / teardown (เรียกจาก App ครั้งเดียวต่อ email) ----------
export async function initNotifStore(email) {
  if (!email || inited === email) return;
  inited = email;
  if (channel) { try { supabase?.removeChannel(channel); } catch { /* ignore */ } channel = null; }
  setState({ email, loaded: false, list: [], prefs: {} });
  await Promise.all([loadList(email), loadPrefs(email)]);
  if (!supabase) return;
  try {
    channel = supabase.channel('notif:' + email)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tmk_notifications', filter: `user_email=eq.${email}` }, () => loadList(email))
      .subscribe();
  } catch { /* ignore */ }
}
export function teardownNotifStore() {
  if (channel) { try { supabase?.removeChannel(channel); } catch { /* ignore */ } channel = null; }
  inited = '';
  setState({ list: [], prefs: {}, loaded: false, email: '' });
}

// ---------- mutations (optimistic + DB graceful) ----------
const now = () => new Date().toISOString();
function patch(ids, fn) { setState({ list: state.list.map(n => ids.includes(n.id) ? fn(n) : n) }); }

async function dbUpdate(ids, full, base) {
  if (!supabase || !ids.length) return;
  try {
    const { error } = await supabase.from('tmk_notifications').update(full).in('id', ids);
    if (error && COL_ERR.test(error.message || error.code || '') && base) {
      await supabase.from('tmk_notifications').update(base).in('id', ids);
    }
  } catch { /* ignore */ }
}

export function markRead(ids, read = true) {
  if (!ids.length) return;
  patch(ids, n => ({ ...n, read, read_at: read ? now() : null }));
  dbUpdate(ids, { read, read_at: read ? now() : null }, { read });
}
export function archive(ids) {
  if (!ids.length) return;
  patch(ids, n => ({ ...n, archived_at: now(), read: true, read_at: n.read_at || now() }));
  dbUpdate(ids, { archived_at: now(), read: true, read_at: now() }, { read: true });
}
export function unarchive(ids) {
  if (!ids.length) return;
  patch(ids, n => ({ ...n, archived_at: null }));
  dbUpdate(ids, { archived_at: null }, null);
}
export function snooze(ids, until) {
  if (!ids.length) return;
  const iso = until instanceof Date ? until.toISOString() : until;
  patch(ids, n => ({ ...n, snooze_until: iso }));
  dbUpdate(ids, { snooze_until: iso }, null);
}
export function unsnooze(ids) { snooze(ids, null); }
export function remove(ids) {
  if (!ids.length) return;
  setState({ list: state.list.filter(n => !ids.includes(n.id)) });
  if (supabase) supabase.from('tmk_notifications').delete().in('id', ids).then(() => {}, () => {});
}

// ---------- selectors ----------
export const isSnoozed = (n) => !!n.snooze_until && new Date(n.snooze_until).getTime() > Date.now();

// ---------- hook ----------
// ส่งกลับ snapshot ดิบ + actions · การกรอง prefs/snooze ทำที่ component (useMemo) เพื่อคุม re-render
export function useNotifications() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    list: snap.list,
    prefs: snap.prefs,
    loaded: snap.loaded,
    email: snap.email,
    prefOn,
    actions: { markRead, archive, unarchive, snooze, unsnooze, remove, setPref },
  };
}
