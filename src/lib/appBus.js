/* ============================================================
   appBus.js — ศูนย์กลาง app-level services + state (แทน window.__* global bus · P2-2)
   - providers (App / ui-confirm / ui-conflict-merge / views-flows) register impl ที่นี่ผ่าน registerServices/setAppState
   - consumers import ฟังก์ชันตรง (มี type/test ได้ · ไล่ที่มาง่าย) แทนแตะ window
   - window.__* = facade back-compat: syncFacade() มิเรอร์ค่าลง window ทุกครั้งที่ register/setState
     → โค้ดเดิมที่ยังอ่าน window.__* ทำงานได้เหมือนเดิม → migrate call site ทีละไฟล์ได้โดยไม่พัง
   ============================================================ */

// service impl ที่ provider ลงทะเบียน (เรียกผ่าน consumer functions ด้านล่าง)
let impl = {};
// state ค่าที่ provider เซ็ต (อ่านผ่าน getter ด้านล่าง)
let state = {
  // undefined = ยังไม่รู้สิทธิ์ (roles ยังโหลดไม่เสร็จ) → canEdit() คืน true ชั่วคราว
  // ⚠️ ไม่ใช่ "read-only ปลอดภัย" — จงใจให้ตรงกับสำนวนเดิม `window.__canEdit !== false` เพื่อไม่ให้ UI
  //    กระพริบเป็นโหมดอ่านอย่างเดียวตอนเปิดแอปทุกครั้ง · ด่านจริงที่กันการเขียนคือ RLS ฝั่ง DB
  canEdit: undefined,
  isAdmin: false,
  userEmail: '',
  userName: '',
  lockedSections: [],
  activeFlow: undefined,
  flags: {},
};

const SERVICE_KEYS = ['toast', 'confirm', 'openModal', 'goSection', 'refresh', 'patchRows', 'reload', 'ensureLoaded', 'resolveConflict', 'createFlow', 'setFlow'];

// มิเรอร์ appBus → window.__* (ให้โค้ดเดิมที่ยังอ่าน window.__* ทำงานต่อได้ · จุดเดียวคุมทั้งหมด)
function syncFacade() {
  if (typeof window === 'undefined') return;
  for (const k of SERVICE_KEYS) { if (impl[k]) window['__' + k] = impl[k]; else delete window['__' + k]; } // ลบ facade เมื่อ provider unregister (คง cleanup เดิม)
  window.__canEdit = state.canEdit;
  window.__isAdmin = state.isAdmin;
  window.__userEmail = state.userEmail;
  window.__userName = state.userName;
  window.__lockedSections = state.lockedSections;
  window.__activeFlow = state.activeFlow;
  window.__flags = state.flags;
}

/* ---------- provider API ---------- */
export function registerServices(map) { impl = { ...impl, ...map }; syncFacade(); }
export function setAppState(patch) { state = { ...state, ...patch }; syncFacade(); }

/* ---------- consumer API (service calls · safe no-op ถ้ายังไม่ register) ---------- */
export const toast = (...a) => impl.toast?.(...a);
export const confirm = (...a) => (impl.confirm ? impl.confirm(...a) : Promise.resolve(false));
export const openModal = (...a) => impl.openModal?.(...a);
export const goSection = (...a) => impl.goSection?.(...a);
export const refresh = (...a) => impl.refresh?.(...a);
// optimistic patch — ยัดแถวที่เพิ่งเซฟเข้า cache ทันที (refresh ตามมา reconcile)
export const patchRows = (...a) => impl.patchRows?.(...a);
export const reload = (...a) => impl.reload?.(...a);
export const ensureLoaded = (...a) => impl.ensureLoaded?.(...a);
export const resolveConflict = (...a) => impl.resolveConflict?.(...a);
export const createFlow = (...a) => impl.createFlow?.(...a);
export const setFlow = (...a) => impl.setFlow?.(...a);

/* ---------- consumer API (state getters) ---------- */
export const canEdit = () => state.canEdit !== false; // ตรงกับสำนวนเดิม window.__canEdit !== false
export const isAdmin = () => state.isAdmin === true;
export const userEmail = () => state.userEmail || '';
export const userName = () => state.userName || '';
export const lockedSections = () => state.lockedSections || [];
export const activeFlow = () => state.activeFlow;
export const flags = () => state.flags || {};

// รวมเป็น namespace เผื่อ import แบบ `import { bus } from ...` (bus.toast(...))
export const bus = {
  toast, confirm, openModal, goSection, refresh, patchRows, reload, ensureLoaded, resolveConflict, createFlow, setFlow,
  canEdit, isAdmin, userEmail, userName, lockedSections, activeFlow, flags,
};
