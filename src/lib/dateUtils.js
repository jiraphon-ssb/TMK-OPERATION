/* ============================================================
   TMK Operation — Date utilities (Thai ↔ ISO)
   ============================================================ */

export const THAI_MONTHS_ABBR = {
  'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4,
  'พ.ค.': 5, 'มิ.ย.': 6, 'ก.ค.': 7, 'ส.ค.': 8,
  'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12,
};

export const THAI_MONTHS_FULL = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                                  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

/**
 * Parse Thai date "18 มิ.ย." → ISO "2026-06-18"
 * @param {string} s — Thai date or already ISO
 * @param {number} year — default 2026 (Gregorian)
 * @returns {string|null} ISO YYYY-MM-DD or null if can't parse
 */
export function parseTaskDate(s, year = 2026) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // already ISO
  const m = String(s).match(/^(\d+)\s+(.+)$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monthKey = Object.keys(THAI_MONTHS_ABBR).find(k => m[2].includes(k));
  if (!monthKey) return null;
  const month = THAI_MONTHS_ABBR[monthKey];
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Format ISO "2026-06-18" → "18 มิ.ย."
 */
export function thaiDate(isoStr) {
  if (!isoStr) return '';
  const parts = String(isoStr).split('-');
  if (parts.length !== 3) return isoStr;
  const day = parseInt(parts[2], 10);
  const month = parseInt(parts[1], 10);
  const monthKey = Object.keys(THAI_MONTHS_ABBR).find(k => THAI_MONTHS_ABBR[k] === month);
  return `${day} ${monthKey || ''}`;
}

/**
 * Convert array or string to comma-joined string for DB storage
 */
export function arrJoin(x) {
  return Array.isArray(x) ? x.join(', ') : String(x || '');
}

/**
 * Today as ISO "YYYY-MM-DD"
 */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * วันที่จริงของเครื่อง — ใช้เป็น single source of truth ของ "วันนี้"
 * @returns {{ day:number, month:number, yearCE:number, yearBE:number, daysInMonth:number }}
 */
export function getToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1; // 1-12
  return {
    day: d.getDate(),
    month: m,
    yearCE: y,
    yearBE: y + 543,
    daysInMonth: new Date(y, m, 0).getDate(),
  };
}
