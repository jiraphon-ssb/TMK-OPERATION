/* ============================================================
   flowsShared.js — ค่าคงที่ + helper ของโครงการ (แยกจาก views-flows.jsx)
   - ใช้ร่วม FlowsView / FlowCard / FlowSettingsPage / ShareFlowDialog / PublicFlowShare
   - ยกมาทั้งดุ้น ไม่แก้เนื้อใน
   ============================================================ */
import { TMK } from './data.js';
import { toast, confirm, canEdit, userEmail } from './lib/appBus.js';

export const confirmAsync = async (opts) => confirm(opts);

export const PALETTE = ['#6b5ce0', '#4a8be0', '#18a0ab', '#06c755', '#2f9e6e', '#c08a3e', '#ee6a3a', '#ec4899', '#cf4d5c', '#0a5aa0'];
export const NEW_ICONS = ['Rocket', 'Target', 'ShoppingCart', 'Package', 'Palette', 'Megaphone', 'Flame', 'Star', 'Shirt', 'Sparkles']; // ไอคอนเริ่มต้นตอนสร้างโครงการ (lucide)
export const GENERAL_ID = '__general__'; // config row ของ "งานทั่วไป" (scopeId='' กรองงาน flow ว่าง)
export const VIEWS = [['calendar', 'calendarDays', 'ปฏิทิน'], ['kanban', 'listChecks', 'Kanban'], ['timeline', 'route', 'ไทม์ไลน์'], ['list', 'menu', 'รายการ']];

export const guardEdit = () => { if (!canEdit()) { toast('สิทธิ์ "ดูอย่างเดียว" — แก้ไขไม่ได้', 'warn'); return false; } return true; };
export const isMissing = (err) => /relation .* does not exist|does not exist|schema cache|PGRST205|42P01/i.test(err?.message || err?.code || '');
export const defaultStatuses = () => (TMK.kanbanMeta || []).map(k => ({ id: k.id, label: k.label, color: '', done: k.id === 'done' }));
export const doneSetOf = (f) => new Set((f.statuses && f.statuses.length) ? f.statuses.filter(s => s.done).map(s => s.id) : ['done']);
// แบรนด์ของโครงการ (รองรับหลายแบรนด์ · fallback brandId เดี่ยว)
export const flowBrands = (flow) => {
  const ids = (flow.brandIds && flow.brandIds.length) ? flow.brandIds : (flow.brandId ? [flow.brandId] : []);
  return ids.map(id => (TMK.brands || []).find(b => b.id === id)).filter(Boolean);
};

// สร้าง object โครงการ "งานทั่วไป" จาก config row (ถ้ามี) — แก้ไขได้ แต่ลบ/archive ไม่ได้ · scopeId=''
export function buildGeneral() {
  const r = (TMK.flows || []).find(f => f.id === GENERAL_ID);
  return {
    id: GENERAL_ID, scopeId: '', isGeneral: true,
    name: r?.name || 'งานทั่วไป', color: r?.color || '#64748b', icon: r?.icon || 'Inbox',
    description: r?.description || 'งานที่ยังไม่ได้จัดเข้าโครงการ',
    brandId: r?.brandId || '', brandIds: r?.brandIds || (r?.brandId ? [r.brandId] : []),
    campaignIds: r?.campaignIds || [], statuses: r?.statuses || [],
    members: r?.members || [], visibility: 'shared', owner: r?.owner || '', defaultView: r?.defaultView || 'kanban', sortOrder: -1,
    coverUrl: r?.coverUrl || '', shareToken: '', shareEnabled: false, // งานทั่วไปไม่เปิดแชร์
  };
}
// โครงการที่ "มองเห็นได้" (ไม่นับ config row / archived / private ของคนอื่น) — ใช้ทั้ง view + sidebar
export function visibleFlows() {
  const me = userEmail();
  const general = buildGeneral();
  const real = (TMK.flows || []).filter(f => f.id !== GENERAL_ID && !f.archived && (f.visibility !== 'private' || f.owner === me)).map(f => ({ ...f, scopeId: f.id }));
  return [general, ...real];
}
