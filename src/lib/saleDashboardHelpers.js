/* ============================================================
   saleDashboardHelpers.js — helper บริสุทธิ์ของหน้า saleDashboard
   ย้ายออกจาก view (Wave 3): format วันที่/เงิน + ค่าคงที่สี + ตัวกรอง
   ทุกฟังก์ชัน pure (รับ arg → คืนค่า) · ไม่มี hook/state/props
   ============================================================ */
import { fmtBaht } from './money.js';

// ---------- ตัวกรอง (dims) ----------
export const DIM_FIELDS = ['channel', 'payment_type', 'customer_type', 'qty_band', 'salesperson', 'province', 'source', 'job_type', 'design', 'product_code', 'size', 'color', 'type'];
// ค่าเริ่มต้น = เดือนนี้เสมอ (1 ของเดือน → วันนี้)
export const thisMonthRange = () => { const d = new Date(); const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0'); return { from: `${y}-${m}-01`, to: `${y}-${m}-${day}` }; };
export const emptyF = () => { const o = { ...thisMonthRange() }; DIM_FIELDS.forEach(k => o[k] = []); return o; };
export const activeFilterCount = (f) => DIM_FIELDS.reduce((n, k) => n + (f[k]?.length || 0), 0);

// persist เฉพาะตัวกรอง (dims) — ช่วงเวลา default เป็น "เดือนนี้" เสมอตอนเข้า
const FKEY = 'tmk-sale-f';
export function loadF() { try { const s = JSON.parse(localStorage.getItem(FKEY)); const dims = {}; if (s) DIM_FIELDS.forEach(k => { if (s[k]?.length) dims[k] = s[k]; }); return { ...emptyF(), ...dims }; } catch { return emptyF(); } }
export function saveF(f) { try { const dims = {}; DIM_FIELDS.forEach(k => { if (f[k]?.length) dims[k] = f[k]; }); localStorage.setItem(FKEY, JSON.stringify(dims)); } catch { /* ignore */ } }

// ---------- format วันที่ (ISO ↔ Date ↔ ป้ายไทย) ----------
const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const isoToDate = (s) => { if (!s) return undefined; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const dateToIso = (dt) => dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}` : null;
export const fmtTh = (s) => { if (!s) return '?'; const [y, m, d] = s.split('-').map(Number); return `${d} ${TH_MON[m - 1]} ${y}`; };
// ช่วงวันที่แบบกระชับ: เดือนเดียวกัน "1–26 มิ.ย. 2026" · ปีเดียวกัน "1 มิ.ย. – 26 ก.ค. 2026"
export const fmtRange = (from, to) => {
  if (!from || !to) return '';
  const [fy, fm, fd] = from.split('-').map(Number), [ty, tm, td] = to.split('-').map(Number);
  if (fy === ty && fm === tm) return `${fd}–${td} ${TH_MON[fm - 1]} ${fy}`;
  if (fy === ty) return `${fd} ${TH_MON[fm - 1]} – ${td} ${TH_MON[tm - 1]} ${ty}`;
  return `${fmtTh(from)} – ${fmtTh(to)}`;
};

// ---------- เงิน + ค่าคงที่สี ----------
export const baht = (n) => fmtBaht(Number(n) || 0); // decimal-aware กลาง (lib/money.js)
// สีจริงของชื่อสีไทย (ใช้กับแท่ง "ยอดขายแต่ละสี")
export const COLOR_HEX = { 'ขาว': '#dcdce0', 'ดำ': '#2a2a2e', 'กรม': '#1f2d50', 'กรมท่า': '#1f2d50', 'ฟ้า': '#4a8be0', 'น้ำเงิน': '#1f3aa0', 'เขียว': '#2f9e6e', 'เหลือง': '#e8c23b', 'แดง': '#c0392b', 'ชมพู': '#e06aa0', 'ม่วง': '#7c5cff', 'ส้ม': '#e0772f', 'โอรส': '#e0772f', 'ครีม': '#e6dcc2' };
// สีตามวิธีชำระ (donut สัดส่วนธุรกิจ) — โอน=เขียว COD=ส้ม อื่นๆ=CAT_COLORS
export const PAY_HEX = { 'โอน': '#2f9e6e', 'COD': '#e0772f', 'เก็บปลายทาง': '#e0772f', 'มาร์เก็ตเพลส': '#7c5cff', 'บัตร': '#4a8be0' };
export const tierTone = { 'เพชร': '#7c5cff', 'ทอง': '#e39b2e', 'เงิน': '#3aa0c9', 'ทองแดง': '#8a909c' };
