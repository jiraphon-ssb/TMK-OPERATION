/* ============================================================
   TMK Operation — Shared components, icons, formatters, charts
   ============================================================ */
import { useState, useEffect } from 'react';

/* ---------- Image upload helper ---------- */
// อ่านรูป + ย่อขนาด (canvas) → data URL เล็ก ป้องกันรูปใหญ่ทำให้บันทึกพัง/ช้า/เกิน quota
export function readImageCompressed(file, maxSize = 256, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type || '')) return reject(new Error('ไม่ใช่ไฟล์รูป'));
    if (file.size > 15 * 1024 * 1024) return reject(new Error('ไฟล์ใหญ่เกิน 15MB')); // กันอ่านไฟล์ยักษ์เข้าหน่วยความจำ
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width >= height && width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; }
        else if (height > width && height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; }
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch { reject(new Error('ย่อรูปไม่สำเร็จ')); } // ไม่ fallback เป็นไฟล์เต็ม (กันเก็บ data-URL ยักษ์)
      };
      img.onerror = () => reject(new Error('รูปเสียหรือเปิดไม่ได้')); // เช่น HEIC/ไฟล์เสีย — ไม่เก็บไฟล์ดิบ
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------- Formatters ---------- */
// formatters — คืน "—" เมื่อค่าไม่ใช่ตัวเลขจริง (กัน NaN/Infinity จากการหารด้วย 0)
const _fin = n => typeof n === 'number' && isFinite(n);
// เงิน — โชว์ค่าจริงเต็ม + สตางค์ 2 ตำแหน่งเสมอ (ไม่ย่อ k/M, ไม่ปัดเต็มบาท) เช่น ฿115,690.79 · ฿44,260.00
export const B  = n => _fin(n) ? '฿' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
export const Bk = B; // เลิกย่อ k/M — ใช้รูปแบบเต็มเหมือน B (ค่าจริงทุกที่)
export const P  = (n, d=1) => _fin(n) ? n.toFixed(d) + '%' : '—';
export const N  = n => _fin(n) ? Math.round(n).toLocaleString('en-US') : '—'; // จำนวนนับ (ออร์เดอร์/ชิ้น) = จำนวนเต็ม
// คอมแพกต์ k/M — ใช้เฉพาะ "ป้ายบนกราฟ" (กันล้นแท่งแคบ) ค่าเต็มดูได้ตอน hover
export const Bc = n => { if (!_fin(n)) return '—'; const a = Math.abs(n), s = n < 0 ? '-' : ''; return a >= 1e6 ? '฿' + s + (a / 1e6).toFixed(1) + 'M' : a >= 1000 ? '฿' + s + Math.round(a / 1000) + 'k' : '฿' + Math.round(a); };

/* ---------- InfoTip — ปุ่ม ⓘ กด/ชี้แล้วเด้งคำอธิบาย (ใช้ได้ทั้งเมาส์และแตะมือถือ) ---------- */
export function InfoTip({ text, label, align = 'left' }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <span style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}>
      <button type="button" title={text} aria-label={label ? `คำอธิบาย: ${label}` : 'คำอธิบาย'} aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(o => !o); }}
        style={{ border: 'none', background: 'none', padding: 0, marginLeft: 4, cursor: 'pointer', color: open ? 'var(--accent)' : 'var(--ink-4)', fontSize: '0.95em', lineHeight: 1, display: 'inline-flex' }}>ⓘ</button>
      {open && (
        <>
          <span onClick={(e) => { e.stopPropagation(); setOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 200 }}></span>
          <span role="tooltip" onClick={(e) => e.stopPropagation()}
            style={{ position: 'absolute', zIndex: 201, top: 'calc(100% + 6px)', [align === 'right' ? 'right' : 'left']: 0, width: 230, maxWidth: '72vw', background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)', padding: '9px 11px', borderRadius: 'var(--r-sm)', fontSize: 'var(--fs-cap)', fontWeight: 400, lineHeight: 1.55, textAlign: 'left', whiteSpace: 'normal', boxShadow: 'var(--sh-pop, 0 8px 28px rgba(0,0,0,.18))' }}>{text}</span>
        </>
      )}
    </span>
  );
}

/* ---------- Lot / variant helpers (เสื้อพิมพ์ลาย: ล็อต = ตาราง ไซส์ × สี) ---------- */
// ไซส์มาตรฐาน เรียงลำดับ (XS → 10XL) — ใช้เป็นคอลัมน์ของตารางล็อต/สต็อก
export const SIZES = ['XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL','7XL','8XL','9XL','10XL'];
// สีเสื้อยอดนิยม สำหรับ quick-add (ตั้งชื่อ/แก้ได้ภายหลัง)
export const SHIRT_COLORS = [
  { name: 'ขาว', hex: '#ffffff' }, { name: 'ดำ', hex: '#1a1a1a' }, { name: 'กรม', hex: '#1f2d50' },
  { name: 'แดง', hex: '#c0392b' }, { name: 'เทา', hex: '#9aa0a6' }, { name: 'เขียว', hex: '#2f9e6e' },
  { name: 'เหลือง', hex: '#e8c23b' }, { name: 'ฟ้า', hex: '#4a8be0' }, { name: 'ชมพู', hex: '#e06aa0' },
  { name: 'ส้ม', hex: '#e0772f' }, { name: 'ม่วง', hex: '#6b5ce0' }, { name: 'น้ำตาล', hex: '#8a5a2f' },
];
// clamp จำนวน: ตัดลบ, ปัดจำนวนเต็ม, กัน NaN/Infinity, เพดาน 1e9
const _q = v => { const n = Math.round(Number(v) || 0); return n > 0 ? Math.min(n, 1e9) : 0; };

// ผลรวมจำนวนทุกช่องใน 1 ล็อต — รองรับ legacy lot (มี qty ไม่มี grid)
export function lotTotal(lot) {
  if (!lot) return 0;
  if (lot.grid && typeof lot.grid === 'object') {
    let t = 0;
    for (const c in lot.grid) { const row = lot.grid[c]; for (const s in row) t += _q(row[s]); }
    return t;
  }
  return _q(lot.qty); // legacy fallback
}
// มูลค่าต้นทุนของล็อต = จำนวนรวม × ต้นทุน/ชิ้น
export function lotValue(lot) { return lotTotal(lot) * (Number(lot?.cost) || 0); }

// รวมจำนวนต่อไซส์ ข้ามทุกล็อต → { [size]: qty }
export function sizeBreakdown(lots) {
  const out = {};
  (lots || []).forEach(l => { if (!l?.grid) return; for (const c in l.grid) { const row = l.grid[c]; for (const s in row) out[s] = (out[s] || 0) + _q(row[s]); } });
  return out;
}
// รวมจำนวนต่อสี (ตามชื่อสี) ข้ามทุกล็อต → { [colorName]: qty }
export function colorBreakdown(lots) {
  const out = {};
  (lots || []).forEach(l => {
    if (!l?.grid || !Array.isArray(l.colors)) return;
    l.colors.forEach(col => { const row = l.grid[col.id] || {}; let n = 0; for (const s in row) n += _q(row[s]); if (n) out[col.name] = (out[col.name] || 0) + n; });
  });
  return out;
}
// รวมทุกล็อตเป็นตารางเดียว { [colorName]: { [size]: qty } } — สำหรับ drill-down หน้าสต็อก
export function variantGrid(lots) {
  const out = {};
  (lots || []).forEach(l => {
    if (!l?.grid || !Array.isArray(l.colors)) return;
    l.colors.forEach(col => {
      const row = l.grid[col.id] || {};
      for (const s in row) { const q = _q(row[s]); if (!q) continue; (out[col.name] || (out[col.name] = {}))[s] = (out[col.name][s] || 0) + q; }
    });
  });
  return out;
}
// สรุปสต็อกของสินค้า 1 ตัว จากทุกล็อต
export function productStock(lots) {
  return {
    total: (lots || []).reduce((a, l) => a + lotTotal(l), 0),
    value: (lots || []).reduce((a, l) => a + lotValue(l), 0),
    sizeStock: sizeBreakdown(lots),
    colorStock: colorBreakdown(lots),
  };
}

/* ---------- Order status pipeline (ออเดอร์ + ติดตามสถานะ) ---------- */
// ลำดับสถานะ: สร้าง → พิมพ์ → นับเช็ค → แพ็ค → รอขนส่ง → ส่งแล้ว (+ ยกเลิก แยก)
export const ORDER_STATUSES = [
  { id: 'pending',  label: 'รอยืนยัน', color: 'var(--ink-3)' },
  { id: 'printing', label: 'รอพิมพ์',  color: 'var(--accent)' },
  { id: 'checking', label: 'นับเช็ค',  color: 'var(--info)' },
  { id: 'packing',  label: 'แพ็ค',     color: 'var(--accent-2)' },
  { id: 'shipping', label: 'รอขนส่ง',  color: 'var(--warn)' },
  { id: 'shipped',  label: 'ส่งแล้ว',  color: 'var(--good)' },
];
export const ORDER_CANCELLED = { id: 'cancelled', label: 'ยกเลิก', color: 'var(--bad)' };
export const orderStatusMeta = (id) => ORDER_STATUSES.find(s => s.id === id) || (id === 'cancelled' ? ORDER_CANCELLED : ORDER_STATUSES[0]);
export const orderStatusIndex = (id) => { const i = ORDER_STATUSES.findIndex(s => s.id === id); return i < 0 ? 0 : i; };

/* ---------- Code128 barcode (สำหรับป้ายสินค้า) ---------- */
// ตาราง pattern มาตรฐาน Code128 (107 ค่า: 0–105 + STOP), แต่ละค่า = ความกว้างแท่ง/ช่อง 6 หลัก (STOP=7)
const CODE128 = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];
// คืน array ความกว้าง module (แท่ง,ช่อง,แท่ง,...) เริ่มด้วยแท่ง — Code Set B (ASCII 32–126); คืน null ถ้าว่าง
export function code128B(text) {
  const s = String(text || '').replace(/[^\x20-\x7E]/g, '');
  if (!s) return null;
  const codes = [104]; // START B
  let sum = 104;
  for (let i = 0; i < s.length; i++) { const v = s.charCodeAt(i) - 32; codes.push(v); sum += v * (i + 1); }
  codes.push(sum % 103); // checksum
  codes.push(106);        // STOP
  const widths = [];
  codes.forEach(code => { for (const ch of CODE128[code]) widths.push(Number(ch)); });
  return widths;
}
// สร้าง SVG string (สำหรับหน้าต่างพิมพ์)
export function barcodeSVGString(value, { height = 46, module = 1.5, color = '#000', quiet = 10 } = {}) {
  const widths = code128B(value);
  if (!widths) return '';
  const totalM = widths.reduce((a, b) => a + b, 0) + quiet * 2;
  const w = totalM * module;
  let x = quiet, rects = '';
  widths.forEach((wd, i) => { if (i % 2 === 0) rects += `<rect x="${(x * module).toFixed(2)}" y="0" width="${(wd * module).toFixed(2)}" height="${height}"/>`; x += wd; });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}" height="${height}" viewBox="0 0 ${w.toFixed(1)} ${height}" fill="${color}">${rects}</svg>`;
}
// React component (พรีวิวในแอป)
export function Barcode({ value, height = 46, module = 1.5, color = 'var(--ink)' }) {
  const widths = code128B(value);
  if (!widths) return <span className="cap" style={{ color: 'var(--ink-4)' }}>—</span>;
  const quiet = 10;
  const totalM = widths.reduce((a, b) => a + b, 0) + quiet * 2;
  const w = totalM * module;
  let x = quiet; const bars = [];
  widths.forEach((wd, i) => { if (i % 2 === 0) bars.push(<rect key={i} x={(x * module).toFixed(2)} y={0} width={(wd * module).toFixed(2)} height={height} fill={color} />); x += wd; });
  return <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} style={{ maxWidth: '100%' }}>{bars}</svg>;
}

/* ---------- Icons (lucide-style, 24 grid, currentColor stroke) ---------- */
export const ICONS = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5',
  sales: 'M3 3v18h18M7 14l3-4 3 3 5-7',
  planner: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 9h18M8 3v4M16 3v4',
  catalog: 'M3.5 8 12 3l8.5 5v8L12 21l-8.5-5zM3.5 8 12 13l8.5-5M12 13v8',
  system: 'M12 3 4 6v5c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6zM9.5 12l1.8 1.8 3.4-3.6',
  search: 'M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M21 21l-4.3-4.3',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  plus: 'M12 5v14M5 12h14',
  sun: 'M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8',
  chevR: 'M9 6l6 6-6 6',
  chevD: 'M6 9l6 6 6-6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  x: 'M6 6l12 12M18 6 6 18',
  target: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  up: 'M7 17 17 7M9 7h8v8',
  down: 'M7 7l10 10M17 9v8H9',
  wallet: 'M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M3 7h17M16 12h5v4h-5a2 2 0 0 1 0-4',
  bag: 'M6 8h12l1 12H5zM9 8V6a3 3 0 0 1 6 0v2',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 19v-1a4 4 0 0 0-3-3.8M16 4.2a4 4 0 0 1 0 7.6',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  userPlus: 'M15 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M19 8v6M22 11h-6',
  userCheck: 'M15 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M17 11l2 2 4-4',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1M10 6l9-3v18l-9-3M19 9a3 3 0 0 1 0 6',
  listChecks: 'M11 6h10M11 12h10M11 18h10M3 6l1.5 1.5L7 4M3 17l1.5 1.5L7 15',
  route: 'M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 13V9a3 3 0 0 1 3-3h6M18 11v4a3 3 0 0 1-3 3H9',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  clock: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v5l3 2',
  shield: 'M12 3 4 6v5c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z',
  trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6',
  dot: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM13 13h7v7h-7zM4 13h7v7H4z',
  message: 'M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5',
  zap: 'M13 2 4 14h7l-1 8 9-12h-7z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  pencil: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  filter: 'M3 5h18l-7 8v6l-4-2v-4z',
  calendarDays: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 9h18M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01',
  flame: 'M12 3s5 4 5 9a5 5 0 0 1-10 0c0-1.5.7-2.8 1.5-3.5C8.5 10 9 11 10 11c0-2.5 2-3 2-8',
  arrowR: 'M5 12h14M13 6l6 6-6 6',
  external: 'M14 4h6v6M20 4l-9 9M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 4v4h-4',
  check: 'M5 12l5 5L20 6',
  layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5',
  sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM19 4v3M21 5h-3',
};

export function Icon({ name, className }) {
  const d = ICONS[name] || ICONS.dot;
  return (
    <svg className={`ico ${className || ''}`} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split('M').filter(Boolean).map((seg, i) => <path key={i} d={'M' + seg} />)}
    </svg>
  );
}

/* ---------- Status helpers ---------- */
export function paceStatus(p) {
  if (p >= 95) return { c: 'var(--good)', cls: 'chip-good', label: 'ทันเป้า' };
  if (p >= 80) return { c: 'var(--warn)', cls: 'chip-warn', label: 'ตามเป้าช้า' };
  return { c: 'var(--bad)', cls: 'chip-bad', label: 'หลุดเป้า' };
}
export const stockMeta = s => s === 'out' ? { c: 'var(--bad)', cls: 'chip-bad', label: 'หมดสต็อก' }
  : s === 'low' ? { c: 'var(--warn)', cls: 'chip-warn', label: 'ใกล้หมด' }
  : { c: 'var(--good)', cls: 'chip-good', label: 'ปกติ' };

/* ---------- Threshold colors (เกณฑ์เดียวกันทุกหน้า — เลิกฝัง ternary inline) ---------- */
// ROAS: ≥3 ดี / ≥2 เฝ้าระวัง / น้อยกว่า แย่
export const roasColor = r => r == null ? 'var(--ink-3)' : r >= 3 ? 'var(--good)' : r >= 2 ? 'var(--warn)' : 'var(--bad)';
// ACOS: ≤เพดาน ดี / ≤40% เฝ้าระวัง / เกิน แย่ (เพดาน default 25%)
export const acosColor = (a, ceil = 25) => a == null ? 'var(--ink-3)' : a <= ceil ? 'var(--good)' : a <= 40 ? 'var(--warn)' : 'var(--bad)';
// %เป้า: ใช้เกณฑ์เดียวกับ paceStatus เพื่อให้สีในตาราง/วงแหวน/การ์ดตรงกัน
export const targetColor = p => p == null ? 'var(--ink-3)' : p >= 95 ? 'var(--good)' : p >= 80 ? 'var(--warn)' : 'var(--bad)';

/* ---------- useCountUp ---------- */
export function useCountUp(target, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf, start;
    const step = t => {
      if (!start) start = t;
      const p = Math.min((t - start) / ms, 1);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/* ---------- Avatar ---------- */
export function Avatar({ name, color, size = 28 }) {
  const safe = String(name || '?');
  const initials = safe.length <= 2 ? safe : safe.slice(0, 2);
  return <span className="avatar" style={{ background: color, width: size, height: size, fontSize: size * 0.42 }}>{initials}</span>;
}

/* ---------- User icon (แทนรูปโปรไฟล์) ---------- */
export function UserIcon({ size = 34, radius }) {
  const s = Math.round(size * 0.56);
  return (
    <span style={{ width: size, height: size, borderRadius: radius ?? (size >= 56 ? 18 : '50%'), background: 'var(--surface-3)', color: 'var(--ink-3)', display: 'inline-grid', placeItems: 'center', flexShrink: 0 }}>
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" />
      </svg>
    </span>
  );
}

/* ---------- ProgressRing ---------- */
export function Ring({ pct, size = 76, stroke = 8, color = 'var(--accent)', track = 'var(--surface-3)', children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const safePct = (typeof pct === 'number' && isFinite(pct)) ? pct : 0; // กัน NaN
  const off = c - (Math.min(safePct, 100) / 100) * c;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s var(--ease)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  );
}

/* ---------- MiniArea (area chart + แกน Y เงิน/ค่า + แกน X วัน/เดือน) ---------- */
export function MiniArea({ data, w = 320, h = 90, color = 'var(--accent)', fill = true, id, labels, fmt = Bk, axisFmt = Bc, metricLabel = '' }) {
  const gid = 'ga-' + (id || color.replace(/[^a-z]/gi, ''));
  const [hover, setHover] = useState(null); // hovered index
  const safeData = Array.isArray(data) ? data.filter(v => typeof v === 'number' && isFinite(v)) : [];

  // ไม่มีข้อมูล → empty state
  if (safeData.length === 0) {
    return (
      <div style={{ height: h, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--ink-4)' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.55 }}>
          <path d="M3 3v16a2 2 0 0 0 2 2h16" />
          <path d="M7 13l3-3 3 2 4-5" strokeDasharray="3 3" />
        </svg>
        <span style={{ fontSize: 11, fontWeight: 500 }}>ยังไม่มีข้อมูล</span>
      </div>
    );
  }
  const points = safeData.length === 1 ? [safeData[0], safeData[0]] : safeData;
  const n = points.length;
  const yMax = Math.max(...points, 1);                  // baseline 0 → yMax (กราฟเงินเริ่มจาก 0)
  const PT = 4, PB = 3;                                  // pad บน/ล่างใน svg
  const yOf = (v) => (h - PB) - (v / yMax) * (h - PT - PB);
  const pts = points.map((v, i) => [(i / (n - 1)) * w, yOf(v)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = line ? line + ` L${w} ${h} L0 ${h} Z` : '';
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover(Math.round(ratio * (n - 1)));
  };
  const hv = hover != null && hover >= 0 && hover < n ? hover : null;

  const yTicks = [yMax, yMax / 2, 0];                    // แกน Y: บน/กลาง/ล่าง
  const xLabels = (labels && labels.length === n) ? labels : points.map((_, i) => String(i + 1));
  const step = Math.max(1, Math.ceil(n / 13));           // แกน X: เลือกป้ายไม่เกิน ~13 (กันแน่น)
  const xTicks = xLabels.map((lb, i) => ({ i, lb })).filter(t => t.i % step === 0 || t.i === n - 1);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gridTemplateRows: `${h}px auto`, columnGap: 6, rowGap: 3, fontSize: 9, fontFamily: 'var(--font)' }}>
      {/* แกน Y (ค่าเงิน/จำนวน) */}
      <div style={{ gridColumn: 1, gridRow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', color: 'var(--ink-4)', whiteSpace: 'nowrap', lineHeight: 1 }}>
        {yTicks.map((v, i) => <span key={i}>{axisFmt(v)}</span>)}
      </div>
      {/* พื้นที่กราฟ + เส้นกริด */}
      <div style={{ gridColumn: 2, gridRow: 1, position: 'relative', height: h, touchAction: 'pan-y' }}
           onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
        {yTicks.map((v, i) => <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: `${(yOf(v) / h) * 100}%`, borderTop: '1px dashed var(--line)', opacity: 0.45 }} />)}
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h, display: 'block', position: 'relative' }}>
          <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient></defs>
          {fill && area && <path d={area} fill={`url(#${gid})`} />}
          {line && <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          {hv != null && <line x1={pts[hv][0]} y1="0" x2={pts[hv][0]} y2={h} stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" vectorEffect="non-scaling-stroke" />}
        </svg>
        {hv != null && (
          <>
            <span style={{ position: 'absolute', left: `${(hv / Math.max(n - 1, 1)) * 100}%`, top: `${(pts[hv][1] / h) * 100}%`, width: 8, height: 8, marginLeft: -4, marginTop: -4, borderRadius: '50%', background: color, border: '2px solid var(--surface)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', left: `${(hv / Math.max(n - 1, 1)) * 100}%`, top: 0, transform: `translateX(${hv > n / 2 ? '-100%' : '0'})`, background: 'var(--ink)', color: 'var(--paper)', padding: '7px 11px', borderRadius: 8, fontSize: 12, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 5, textAlign: 'left', lineHeight: 1.45, boxShadow: '0 6px 20px rgba(0,0,0,.25)' }}>
              {labels && labels[hv] ? <div style={{ opacity: 0.75, fontWeight: 600, fontSize: 11 }}>{labels[hv]}</div> : null}
              <div style={{ fontWeight: 700 }}>{metricLabel ? metricLabel + ' : ' : ''}{fmt(safeData[hv])}</div>
            </div>
          </>
        )}
      </div>
      {/* แกน X (วัน/เดือน) */}
      <div style={{ gridColumn: 2, gridRow: 2, position: 'relative', height: 13, color: 'var(--ink-4)' }}>
        {xTicks.map(t => <span key={t.i} style={{ position: 'absolute', left: `${(t.i / Math.max(n - 1, 1)) * 100}%`, transform: t.i === n - 1 ? 'translateX(-100%)' : t.i === 0 ? 'none' : 'translateX(-50%)', whiteSpace: 'nowrap' }}>{t.lb}</span>)}
      </div>
    </div>
  );
}

/* ---------- Bars (vertical) ---------- */
export function Bars({ data, h = 150, color = 'var(--accent)', labelKey = 'm', valueKey = 'rev', fmt = Bk }) {
  // กัน NaN/Infinity: ถ้าข้อมูลว่างหรือทุกค่าเป็น 0 → max = 1 (บาร์สูง 0 ไม่พัง)
  const _rawMax = data.length ? Math.max(...data.map(d => (Number(d[valueKey]) || 0) + (Number(d.proj) || 0))) : 0;
  const max = _rawMax > 0 ? _rawMax : 1;
  const safeH = (v) => { const x = ((Number(v) || 0) / max) * (h - 28); return isFinite(x) && x > 0 ? x : 0; };
  const [hi, setHi] = useState(null);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 6, height: h, fontFamily: 'var(--font)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', color: 'var(--ink-4)', fontSize: 9, paddingTop: 8, paddingBottom: 22, lineHeight: 1, whiteSpace: 'nowrap' }}>
        {[max, max / 2, 0].map((v, i) => <span key={i}>{Bc(v)}</span>)}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: h, paddingTop: 8 }}>
      {data.map((d, i) => {
        const main = safeH(d[valueKey]);
        const proj = safeH(d.proj);
        const aVal = Number(d[valueKey]) || 0, pVal = Number(d.proj) || 0;
        return (
          <div key={i}
               onPointerEnter={() => setHi(i)} onPointerDown={() => setHi(i)}
               onPointerLeave={() => setHi(null)}
               style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end', cursor: 'default', touchAction: 'manipulation' }}>
            {hi === i && (
              <div style={{ position: 'absolute', bottom: 'calc(100% - 14px)', left: '50%', transform: 'translateX(-50%)', background: 'var(--ink)', color: 'var(--paper)', padding: '7px 11px', borderRadius: 8, fontSize: 12, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10, textAlign: 'left', lineHeight: 1.45, boxShadow: '0 6px 20px rgba(0,0,0,.25)' }}>
                <div style={{ opacity: 0.75, fontWeight: 600, fontSize: 11 }}>{d[labelKey]}</div>
                <div style={{ fontWeight: 700 }}>ทำได้ : {fmt(aVal)}</div>
                {pVal > 0 && <div style={{ opacity: 0.55, fontWeight: 600 }}>คาดการณ์ : {fmt(pVal)}</div>}
              </div>
            )}
            <div style={{ width: '100%', maxWidth: 46, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: h - 28 }}>
              {proj > 0 && <div style={{ height: proj, background: color, opacity: 0.28, borderRadius: '6px 6px 0 0' }} />}
              <div style={{ height: main, background: color, borderRadius: proj > 0 ? 0 : '6px 6px 0 0' }} />
            </div>
            <div className="cap" style={{ color: 'var(--ink-3)' }}>{d[labelKey]}</div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

/* ---------- Section wrapper ---------- */
export function Section({ eyebrow, title, action, children, style }) {
  return (
    <section style={{ marginBottom: 22, ...style }}>
      {(eyebrow || title || action) && (
        <div className="row between" style={{ marginBottom: 14, alignItems: 'flex-end' }}>
          <div>
            {eyebrow && <div className="eyebrow" style={{ marginBottom: 5 }}>{eyebrow}</div>}
            {title && <h2 className="h2">{title}</h2>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
