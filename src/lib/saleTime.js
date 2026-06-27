/* ============================================================
   saleTime.js — เครื่องมือจัดการเวลาแดชบอร์ด Sale (pure, เทสได้)
   ทำงานบนสตริงวันที่ 'YYYY-MM-DD' (order_date) ใช้ UTC ภายในกัน tz drift
   gran: 'day' | 'week' | 'month' | 'quarter'
   ============================================================ */

const MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const parseISO = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(Date.UTC(y, (m || 1) - 1, d || 1)); };
export const addDays = (s, n) => toISO(new Date(parseISO(s).getTime() + n * MS));
export const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / MS);

const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const thDay = (s) => { const d = parseISO(s); return `${d.getUTCDate()} ${TH_MON[d.getUTCMonth()]}`; };

// ---- ต้นสัปดาห์ ISO (จันทร์) ----
export function weekStart(s) { const d = parseISO(s); const dow = (d.getUTCDay() + 6) % 7; return toISO(new Date(d.getTime() - dow * MS)); }
// ---- เลข ISO week ----
export function isoWeek(s) {
  const d = parseISO(s); const day = (d.getUTCDay() + 6) % 7;
  const th = new Date(d.getTime() + (3 - day) * MS); // วันพฤหัสของสัปดาห์นั้น
  const y = th.getUTCFullYear(); const jan1 = new Date(Date.UTC(y, 0, 1));
  const wk = 1 + Math.round(((th - jan1) / MS - 3 + ((jan1.getUTCDay() + 6) % 7)) / 7);
  return { year: y, week: wk };
}
export function quarterOf(s) { const d = parseISO(s); return { year: d.getUTCFullYear(), q: Math.floor(d.getUTCMonth() / 3) + 1 }; }

// ---- คีย์ bucket (ใช้ group + sort) ----
export function bucketKey(s, gran) {
  if (gran === 'day') return s;
  if (gran === 'week') return weekStart(s);
  if (gran === 'month') return s.slice(0, 7);
  if (gran === 'quarter') { const { year, q } = quarterOf(s); return `${year}-Q${q}`; }
  return s;
}
// ---- ป้ายแสดงผล (อ่านง่าย ภาษาไทย) ----
export function bucketLabel(key, gran) {
  if (gran === 'day') return thDay(key);
  if (gran === 'week') { const { week } = isoWeek(key); const end = addDays(key, 6); return `W${week} (${thDay(key)}–${thDay(end)})`; }
  if (gran === 'month') { const [y, m] = key.split('-').map(Number); return `${TH_MON[m - 1]} ${y + 543 - 2500 > 0 ? y + 543 : y}`; }
  if (gran === 'quarter') return key.replace('-', '/');
  return key;
}

// ---- ลำดับ bucket ทั้งหมดในช่วง (เติมช่องว่าง = แกน x ต่อเนื่อง) ----
export function enumerateBuckets(from, to, gran) {
  const seen = new Set(), out = [];
  if (gran === 'day') { for (let s = from; diffDays(s, to) >= 0; s = addDays(s, 1)) out.push(s); return out; }
  if (gran === 'week') { for (let s = weekStart(from); diffDays(s, to) >= 0; s = addDays(s, 7)) out.push(s); return out; }
  for (let s = from; diffDays(s, to) >= 0; s = addDays(s, 1)) { const k = bucketKey(s, gran); if (!seen.has(k)) { seen.add(k); out.push(k); } }
  return out;
}

// ---- เลือก granularity อัตโนมัติให้พอดีจำนวนแท่ง ----
export function autoGran(from, to) {
  const days = diffDays(from, to) + 1;
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  if (days <= 730) return 'month';
  return 'quarter';
}

// ---- preset ช่วงเวลา (today = วันอ้างอิง 'YYYY-MM-DD', dataMin/dataMax = ขอบข้อมูล) ----
export function presetRange(id, today, dataMin, dataMax) {
  if (!today) return { from: dataMin || null, to: dataMax || null }; // กัน race: ขอบวันที่ยังไม่โหลด (bounds.max = null)
  const clamp = (f, t) => ({ from: dataMin && f < dataMin ? dataMin : f, to: dataMax && t > dataMax ? dataMax : t });
  switch (id) {
    case 'today': return clamp(today, today);
    case 'd7': return clamp(addDays(today, -6), today);
    case 'd30': return clamp(addDays(today, -29), today);
    case 'month': return clamp(today.slice(0, 7) + '-01', today);
    case 'quarter': { const { q, year } = quarterOf(today); return clamp(`${year}-${pad((q - 1) * 3 + 1)}-01`, today); }
    case 'ytd': return clamp(today.slice(0, 4) + '-01-01', today);
    case 'all': default: return { from: dataMin, to: dataMax };
  }
}
export const PRESETS = [['all', 'ทั้งหมด'], ['month', 'เดือนนี้'], ['quarter', 'ไตรมาสนี้'], ['d30', '30 วัน'], ['d7', '7 วัน'], ['today', 'วันนี้'], ['ytd', 'ตั้งแต่ต้นปี']];

// ---- ช่วงเปรียบเทียบ ----
export function prevPeriod(from, to) { const len = diffDays(from, to) + 1; return { from: addDays(from, -len), to: addDays(from, -1) }; }
export function prevYear(from, to) { return { from: addDays(from, -365), to: addDays(to, -365) }; }

// ---- เดือนปฏิทิน: เช็คว่าช่วง = เดือนเต็ม (วันที่ 1 ถึงวันสุดท้ายของเดือนเดียวกัน) ----
export function isFullCalendarMonth(from, to) {
  if (!from || !to) return false;
  const a = parseISO(from), b = parseISO(to);
  if (a.getUTCDate() !== 1) return false;
  if (a.getUTCFullYear() !== b.getUTCFullYear() || a.getUTCMonth() !== b.getUTCMonth()) return false;
  const lastDay = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 0)).getUTCDate();
  return b.getUTCDate() === lastDay;
}
// ---- เดือนปฏิทินก่อนหน้า (เต็มเดือน) — สำหรับเทียบ "ยอดเดือนนี้ vs เดือนก่อน" ----
export function prevCalendarMonth(from, to) {
  const a = parseISO(from);
  const py = a.getUTCMonth() === 0 ? a.getUTCFullYear() - 1 : a.getUTCFullYear();
  const pm = a.getUTCMonth() === 0 ? 11 : a.getUTCMonth() - 1;
  const first = new Date(Date.UTC(py, pm, 1));
  const last = new Date(Date.UTC(py, pm + 1, 0));
  return { from: toISO(first), to: toISO(last) };
}

// ---- กรองแถวตามช่วง (อิง field วันที่) ----
export const inRange = (s, from, to) => s && (!from || s >= from) && (!to || s <= to);
