/* ============================================================
   salePerfView — helper/const บริสุทธิ์ของหน้า "ประสิทธิภาพเซลล์"
   ============================================================
   ย้ายออกจาก salePerf.jsx (Wave 3: แยก logic ออกจาก view)
   เฉพาะฟังก์ชัน/ค่าคงที่ระดับ module ที่ pure (ไม่มี hook/state/JSX)
   ============================================================ */
import { fmtBaht } from './money.js';

// เงินบาท — ใช้ตัวกลาง fmtBaht (decimal-aware · ไม่ตัดทศนิยมยอดขาย/AOV/คอม) · 0 → ฿0 (ไม่ใช่ '—')
export const fmtB = (n) => fmtBaht(Number(n) || 0);

export const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const monthLabel = (ym) => { const [y, m] = ym.split('-'); return `${TH_MON[Number(m) - 1] || m} ${Number(y) + 543}`; };
export const prevMonthOf = (ym) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

export const MEDAL = ['#e3b341', '#b8c0cc', '#cd8b5e'];   // ทอง/เงิน/ทองแดง

export const closeTone = (v) => v == null ? 'var(--ink-4)' : v >= 15 ? 'var(--good)' : v >= 8 ? 'var(--warn)' : 'var(--bad)';

// รวม voice จากแถว funnel (เผื่อมีหลายแถว/เซลล์) → object เดียว
export const pickVoice = (rows) => (rows || []).map(f => f.voice).find(v => v && (v.ask || v.praise || v.complaint)) || null;
