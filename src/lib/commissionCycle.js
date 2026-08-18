/* ============================================================
   commissionCycle.js — คณิต "รอบตัดค่าคอม" (เช่น 26 ก.ค. – 25 ส.ค.) + รวมยอด/คอมต่อเซลล์
   ============================================================
   นิยาม (ตกลงกับ user 13 ส.ค. 2569 · ดู docs/COMMISSION-CYCLE-PLAN.md):
   - วันตัดรอบ (cutoffDay) = ค่าเดียวทั้งทีม 1–28 (ห้าม 29-31 กัน ก.พ. พัง) · default 26
   - รอบเรียกตาม "เดือนที่จบ/เดือนที่จ่ายเงิน": 26 ก.ค.–25 ส.ค. = "รอบ ส.ค." (endMonth = '2026-08')
   - cutoffDay = 1 → รอบ = เดือนปฏิทินพอดี (1 – สิ้นเดือน)
   - เรท/เทียร์ใช้ของเดือนที่จบรอบ (tmk_targets month = endMonth)
   - ยอดคิดคอม = ยอดขายทุกช่องทางของเซลล์ ตัดออเดอร์ยกเลิก (orders ต้อง merge override มาแล้ว)
   - สูตรคอม = commissionFor เดิม (tiers/flat) — ไม่เขียนสูตรใหม่ กันเลขไม่ตรง
   pure ล้วน (ยกเว้น import สูตรกลาง) — มีเทสครอบที่ __tests__/commissionCycle.test.js
   ============================================================ */
import { commissionFor } from './targets.js';
import { isCancelled, spOf, daysInMonth } from './salePerfAgg.js';

export const DEFAULT_CUTOFF_DAY = 26;
const pad = (n) => String(n).padStart(2, '0');

/** เลื่อนเดือน 'YYYY-MM' ไป d เดือน (d ติดลบได้ · ข้ามปีถูกต้อง) */
export function shiftMonth(ym, d) {
  const [y, m] = String(ym).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + d, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`;
}

/** ตีกรอบวันตัดให้ปลอดภัย: 1–28 เท่านั้น (นอกช่วง/ไม่ใช่เลข → default 26) */
export function normCutoffDay(v) {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 28 ? n : DEFAULT_CUTOFF_DAY;
}

/**
 * ช่วงวันที่ของรอบตัด endMonth ('YYYY-MM') ด้วยวันตัด cutoffDay
 * cutoffDay 26 + endMonth 2026-08 → { from: '2026-07-26', to: '2026-08-25' }
 * cutoffDay 1  → เดือนปฏิทินพอดี { from: '2026-08-01', to: '2026-08-31' }
 */
export function cycleOf(endMonth, cutoffDay = DEFAULT_CUTOFF_DAY) {
  const cut = normCutoffDay(cutoffDay);
  if (cut <= 1) return { from: `${endMonth}-01`, to: `${endMonth}-${pad(daysInMonth(endMonth))}`, endMonth };
  const startMonth = shiftMonth(endMonth, -1);
  return { from: `${startMonth}-${pad(cut)}`, to: `${endMonth}-${pad(cut - 1)}`, endMonth };
}

/** endMonth ของ "รอบปัจจุบัน" จากวันนี้: ถ้าวันนี้ >= วันตัด → รอบที่กำลังเดินจบเดือนหน้า */
export function currentCycleEndMonth(todayISO, cutoffDay = DEFAULT_CUTOFF_DAY) {
  const cut = normCutoffDay(cutoffDay);
  const ym = String(todayISO).slice(0, 7);
  const day = Number(String(todayISO).slice(8, 10)) || 1;
  return cut > 1 && day >= cut ? shiftMonth(ym, 1) : ym;
}

/** จำนวนวันทั้งรอบ + ผ่านมาแล้วกี่วัน (clamp 0..days) — โชว์หัว popup */
export function cycleProgress(cycle, todayISO) {
  const d = (iso) => Math.round(Date.parse(iso + 'T00:00:00Z') / 86400000);
  const days = d(cycle.to) - d(cycle.from) + 1;
  const passed = Math.min(Math.max(d(String(todayISO).slice(0, 10)) - d(cycle.from) + 1, 0), days);
  return { days, passed };
}

/**
 * รวมยอด/ออเดอร์ต่อเซลล์ในรอบ + คำนวณคอมด้วยเป้าเดือนที่จบรอบ
 * @param orders  ออเดอร์ในช่วงรอบ (merge override แล้ว · จะถูกตัดยกเลิกในนี้)
 * @param targetsMap  { salesperson: targetRow } ของ endMonth
 * @returns rows เรียงยอดมาก→น้อย: [{ name, sales, orders, comm, tgt }]
 */
export function buildCycleRows(orders, targetsMap = {}) {
  const by = {};
  for (const o of orders || []) {
    if (isCancelled(o)) continue;
    const name = spOf(o);
    const s = by[name] || (by[name] = { name, sales: 0, orders: 0 });
    s.sales += Number(o.sales) || 0;
    s.orders += 1;
  }
  return Object.values(by)
    .map((s) => { const tgt = targetsMap[s.name] || null; return { ...s, tgt, comm: tgt ? commissionFor(s.sales, tgt) : 0 }; })
    .sort((a, b) => b.sales - a.sales);
}

/** ป้ายเรทที่ใช้ (โชว์ในตาราง): tiers → "ขั้นบันได x%" (ขั้นที่ยอดถึง) · flat → "x%" · ไม่มีเป้า → null */
export function rateLabel(row) {
  const t = row?.tgt;
  if (!t) return null;
  if (Array.isArray(t.tiers) && t.tiers.length) {
    const sorted = [...t.tiers].filter(x => x && x.rate != null).sort((a, b) => (b.min || 0) - (a.min || 0));
    const hit = sorted.find(x => (Number(row.sales) || 0) >= (Number(x.min) || 0));
    return hit ? `ขั้นบันได ${Number(hit.rate)}%` : 'ยังไม่ถึงขั้นแรก';
  }
  return `${Number(t.commission_rate) || 0}%`;
}
