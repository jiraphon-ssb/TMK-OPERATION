/* ============================================================
   TMK Operation — Shared components, icons, formatters, charts
   ============================================================ */
import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import {
  ClipboardList, Rocket, Target, ShoppingCart, Package, Palette, Megaphone, Lightbulb, Flame, Star,
  Shirt, Box, CalendarDays, Clock, Users, User, Heart, Zap, Briefcase, Folder,
  FileText, Image as LImage, Camera, Video, Music, Mic, PenTool, Brush, Scissors, Truck,
  Store, ShoppingBag, Tag, Tags, Gift, CreditCard, DollarSign, TrendingUp, BarChart3, PieChart,
  Activity, Globe, MapPin, Mail, MessageCircle, MessageSquare, Phone, Send, Bell, Bookmark,
  Flag, Award, Trophy, Crown, Gem, Sparkles, Sun as LSun, Moon as LMoon, Cloud, Leaf,
  Coffee, Smile, ThumbsUp, Eye, Search as LSearch, Settings, Wrench, Hammer, Layers, LayoutGrid,
  List as LList, Kanban, CheckCircle2, Hash, Link as LLink, Lock, Key, Shield, Code, Terminal,
  Database, Server, Smartphone, Monitor, Printer, Headphones, Plane, Car, Home as LHome, Building2,
  Factory, Warehouse, Map as LMap, Compass, Book, GraduationCap, Pencil, Archive, Inbox, Calendar as LCalendar,
  Bug, Wand2, Beaker, Boxes, Sticker, Crosshair, Goal, Handshake, Wallet, Receipt,
} from 'lucide-react';

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
      img.onerror = () => { // HEIC ของ iPhone เบราว์เซอร์มักเปิดไม่ได้ — แยกข้อความให้ผู้ใช้แก้เองได้
        const heic = /hei[cf]/i.test(file.type || '') || /\.hei[cf]$/i.test(file.name || '');
        reject(new Error(heic
          ? 'รูปนี้เป็นไฟล์ HEIC ของ iPhone ที่เบราว์เซอร์เปิดไม่ได้ — ลองถ่ายใหม่ หรือตั้งกล้อง iPhone เป็น "Most Compatible" (ตั้งค่า > กล้อง > รูปแบบ)'
          : 'รูปเสียหรือเปิดไม่ได้ — ลองรูปอื่น'));
      };
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
export const N  = n => _fin(n) ? Math.round(n).toLocaleString('en-US') : '—'; // จำนวนนับ (ออเดอร์/ตัว) = จำนวนเต็ม
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
// มูลค่าต้นทุนของล็อต = จำนวนรวม × ต้นทุน/ตัว
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
  archive: 'M4 8v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8M2 4h20v4H2zM10 12h4',
  tag: 'M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.41l8.7 8.71a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42zM7.5 7.5h.01',
  checkCheck: 'M18 6 7 17l-5-5M22 10l-7.5 7.5L13 16',
  plus: 'M12 5v14M5 12h14',
  image: 'M4 4 L20 4 L20 20 L4 20 ZM4 16 L9 11 L13 15 L16 12 L20 16M9 9 m-1.3 0 a1.3 1.3 0 1 0 2.6 0 a1.3 1.3 0 1 0 -2.6 0',
  sun: 'M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8',
  chevR: 'M9 6l6 6-6 6',
  chevL: 'M15 6l-6 6 6 6',
  chevD: 'M6 9l6 6 6-6',
  star: 'M12 2.6l2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.9l-5.6 2.97 1.07-6.27L2.9 9.2l6.3-.9z',
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
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1M10 6l9-3v18l-9-3M19 9a3 3 0 0 1 0 6',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  store: 'M4 9h16M5 9l1-4h12l1 4M5 9v10h14V9M9 19v-5h6v5',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18',
  listChecks: 'M11 6h10M11 12h10M11 18h10M3 6l1.5 1.5L7 4M3 17l1.5 1.5L7 15',
  chat: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  smile: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
  reply: 'M9 17l-6-5 6-5M3 12h10a6 6 0 0 1 6 6v2',
  route: 'M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 13V9a3 3 0 0 1 3-3h6M18 11v4a3 3 0 0 1-3 3H9',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  clock: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v5l3 2',
  shield: 'M12 3 4 6v5c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z',
  trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6',
  dot: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM13 13h7v7h-7zM4 13h7v7H4z',
  zap: 'M13 2 4 14h7l-1 8 9-12h-7z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  pencil: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  filter: 'M3 5h18l-7 8v6l-4-2v-4z',
  calendarDays: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 9h18M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01',
  flame: 'M12 3s5 4 5 9a5 5 0 0 1-10 0c0-1.5.7-2.8 1.5-3.5C8.5 10 9 11 10 11c0-2.5 2-3 2-8',
  arrowR: 'M5 12h14M13 6l6 6-6 6',
  external: 'M14 4h6v6M20 4l-9 9M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 4v4h-4',
  check: 'M5 12l5 5L20 6',
  circle: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0',
  layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5',
  sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM19 4v3M21 5h-3',
  help: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01',
  lightbulb: 'M9 18h6M10 21h4M8.5 14a5 5 0 1 1 7 0c-.7.7-1.5 1.3-1.5 2.5h-4c0-1.2-.8-1.8-1.5-2.5',
  alertTriangle: 'M12 3 2 20h20zM12 9v5M12 17h.01',
  upload: 'M12 15V4M8 8l4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
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

/* ---------- ColorPicker: เลือกสีอิสระ (presets + สีล่าสุด + เลือกอิสระ native + กรอก hex + คัดลอก) ---------- */
const DEFAULT_SWATCHES = ['#6b5ce0', '#4a8be0', '#18a0ab', '#06c755', '#2f9e6e', '#c08a3e', '#ee6a3a', '#ec4899', '#cf4d5c', '#0a5aa0', '#64748b', '#000000'];
const RECENT_COLORS_KEY = 'tmk-recent-colors';
const loadRecentColors = () => { try { return (JSON.parse(localStorage.getItem(RECENT_COLORS_KEY) || '[]') || []).filter(x => /^#[0-9a-fA-F]{6}$/.test(x)).slice(0, 8); } catch { return []; } };
export function ColorPicker({ value, onChange, presets = DEFAULT_SWATCHES, size = 'md' }) {
  const v = value || '#6b5ce0';
  const sw = size === 'sm' ? 'size-6' : 'size-7';
  const [hex, setHex] = useState(v);
  const [recent, setRecent] = useState(loadRecentColors);
  useEffect(() => { setHex(v); }, [v]);
  const recordRecent = (c) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(c)) return;
    setRecent(prev => { const next = [c.toLowerCase(), ...prev.filter(x => x.toLowerCase() !== c.toLowerCase())].slice(0, 8); try { localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(next)); } catch { /* ignore */ } return next; });
  };
  const pick = (c) => { onChange(c); recordRecent(c); };
  const commitHex = (raw) => {
    let s = String(raw || '').trim();
    if (s && s[0] !== '#') s = '#' + s;
    setHex(s);
    if (/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(s)) { onChange(s); if (s.length === 7) recordRecent(s); }
  };
  const copyHex = async () => { try { await navigator.clipboard.writeText(v); window.__toast?.('คัดลอกโค้ดสีแล้ว', 'success'); } catch { /* ignore */ } };
  const isOn = (c) => (v || '').toLowerCase() === c.toLowerCase();
  const recentShown = recent.filter(c => !presets.some(p => p.toLowerCase() === c.toLowerCase()));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map(c => (
          <button key={c} type="button" title={c} aria-label={`สี ${c}`}
            className={`${sw} rounded-full flex items-center justify-center transition-all ${isOn(c) ? 'ring-2 ring-offset-2 ring-ring' : 'hover:scale-110'}`}
            onClick={() => pick(c)} style={{ background: c }}>
            {isOn(c) && <Icon name="check" className="size-3.5 text-white" />}
          </button>
        ))}
        {/* เลือกอิสระ (native color input ซ่อนอยู่หลังวงสีรุ้ง) */}
        <label className={`${sw} rounded-full cursor-pointer relative overflow-hidden ring-1 ring-border flex items-center justify-center`} title="เลือกสีอิสระ"
          style={{ background: 'conic-gradient(from 0deg, #ef4444, #f59e0b, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)' }}>
          <Icon name="plus" className="size-3.5 text-white drop-shadow" />
          <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#6b5ce0'} onChange={e => pick(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
      </div>
      {recentShown.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground mr-0.5">ล่าสุด</span>
          {recentShown.map(c => (
            <button key={c} type="button" title={c} aria-label={`สีล่าสุด ${c}`} onClick={() => pick(c)}
              className={`size-5 rounded-full ring-1 ring-border transition-transform hover:scale-110 ${isOn(c) ? 'ring-2 ring-ring' : ''}`} style={{ background: c }} />
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="size-7 rounded-md border shrink-0" style={{ background: v }} />
        <input value={hex} onChange={e => commitHex(e.target.value)} placeholder="#6b5ce0" spellCheck={false}
          className="h-8 w-28 rounded-md border bg-background px-2 text-sm font-mono uppercase focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
        <button type="button" onClick={copyHex} title="คัดลอกโค้ดสี" aria-label="คัดลอกโค้ดสี"
          className="h-8 px-2 rounded-md border bg-background text-muted-foreground hover:text-foreground hover:bg-muted flex items-center"><Icon name="external" className="size-3.5" /></button>
      </div>
    </div>
  );
}

/* ---------- ไอคอนโครงการ (lucide) — เลือกได้เยอะ + รองรับอีโมจิเก่า (back-compat) ---------- */
const FLOW_ICON_MAP = {
  ClipboardList, Rocket, Target, ShoppingCart, Package, Palette, Megaphone, Lightbulb, Flame, Star,
  Shirt, Box, CalendarDays, Clock, Users, User, Heart, Zap, Briefcase, Folder,
  FileText, Image: LImage, Camera, Video, Music, Mic, PenTool, Brush, Scissors, Truck,
  Store, ShoppingBag, Tag, Tags, Gift, CreditCard, DollarSign, TrendingUp, BarChart3, PieChart,
  Activity, Globe, MapPin, Mail, MessageCircle, MessageSquare, Phone, Send, Bell, Bookmark,
  Flag, Award, Trophy, Crown, Gem, Sparkles, Sun: LSun, Moon: LMoon, Cloud, Leaf,
  Coffee, Smile, ThumbsUp, Eye, Search: LSearch, Settings, Wrench, Hammer, Layers, LayoutGrid,
  List: LList, Kanban, CheckCircle2, Hash, Link: LLink, Lock, Key, Shield, Code, Terminal,
  Database, Server, Smartphone, Monitor, Printer, Headphones, Plane, Car, Home: LHome, Building2,
  Factory, Warehouse, Map: LMap, Compass, Book, GraduationCap, Pencil, Archive, Inbox, Calendar: LCalendar,
  Bug, Wand2, Beaker, Boxes, Sticker, Crosshair, Goal, Handshake, Wallet, Receipt,
};
export const FLOW_ICON_NAMES = Object.keys(FLOW_ICON_MAP);
// แสดงไอคอนโครงการ: ชื่อ lucide → component · อีโมจิเก่า → text · ว่าง → default
export function FlowIcon({ icon, className = 'size-5', style }) {
  const C = FLOW_ICON_MAP[icon];
  if (C) return <C className={className} style={style} />;
  if (icon) return <span className={className} style={{ ...style, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontSize: '1em' }}>{icon}</span>;
  return <ClipboardList className={className} style={style} />;
}
// ตัวเลือกไอคอน — ค้นหาได้ + grid (lucide ~110 แบบ)
export function IconPicker({ value, onChange }) {
  const [q, setQ] = useState('');
  const names = FLOW_ICON_NAMES.filter(n => !q || n.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex flex-col gap-2">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาไอคอน… (พิมพ์อังกฤษ เช่น rocket, cart)" spellCheck={false}
        className="h-8 w-full rounded-md border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
      <div className="grid grid-cols-8 sm:grid-cols-10 gap-1 max-h-48 overflow-y-auto rounded-md border p-2">
        {names.map(n => { const C = FLOW_ICON_MAP[n]; return (
          <button key={n} type="button" title={n} onClick={() => onChange(n)}
            className={`size-9 rounded-md flex items-center justify-center transition-all ${value === n ? 'bg-primary text-primary-foreground ring-2 ring-ring' : 'hover:bg-muted text-foreground'}`}>
            <C className="size-5" />
          </button>
        ); })}
        {names.length === 0 && <span className="col-span-full text-xs text-muted-foreground text-center py-3">ไม่พบไอคอน</span>}
      </div>
    </div>
  );
}

/* ---------- หัวการ์ด: ไอคอนชิปมุมมน + ชื่อ + คำอธิบาย (ใช้ซ้ำทั้งแอป) ---------- */
export function CardHead({ icon, title, sub, right, className = '' }) {
  return (
    <div className={`row between ${className}`} style={{ alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <div className="row" style={{ gap: 10, alignItems: 'center', minWidth: 0 }}>
        {icon && <span className="grid size-9 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex-none"><Icon name={icon} /></span>}
        <div style={{ minWidth: 0 }}>
          <div className="text-base font-semibold" style={{ lineHeight: 1.25 }}>{title}</div>
          {sub && <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 2 }}>{sub}</div>}
        </div>
      </div>
      {right}
    </div>
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
  const initials = safe.length <= 2 ? safe.toUpperCase() : safe.slice(0, 2).toUpperCase();
  return <span className="avatar" style={{ background: color || 'var(--ink-3)', width: size, height: size, fontSize: size * 0.42 }}>{initials}</span>;
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


/* (เดิมมี PageLoading แบบวงกลมหมุน — เลิกใช้แล้ว เปลี่ยนเป็น Skeleton ทุกหน้า) */


/* ---- จอ splash โหลดแรก: เริ่มจับเวลาตอน "armed" (login เสร็จ) แสดงจนกว่าจะ "done"
   และอย่างน้อย minMs — รับประกันเห็นจอโหลด 5-6 วิ แม้ข้อมูลจะมาไว (cache อุ่น)
   armed = ผ่าน login แล้ว · done = โหลดข้อมูลหลักครั้งแรกเสร็จ/พลาด */
export function useMinSplash(armed, done, minMs = 5500) {
  const startRef = useRef(null);
  const [, tick] = useState(0);
  if (armed && startRef.current == null) startRef.current = Date.now();
  useEffect(() => {
    if (startRef.current == null || !done) return;
    const left = minMs - (Date.now() - startRef.current);
    if (left <= 0) return;
    const t = setTimeout(() => tick(x => x + 1), left);
    return () => clearTimeout(t);
  }, [armed, done, minMs]);
  if (startRef.current == null) return false;            // ยังไม่ arm (ยังไม่ login) → ไม่โชว์
  if (!done) return true;                                 // ข้อมูลยังไม่พร้อม → โชว์
  return Date.now() - startRef.current < minMs;           // พร้อมแล้วแต่ยังไม่ครบเวลาขั้นต่ำ
}

/* ---- คุมจังหวะ skeleton: โผล่หลัง active ค้างเกิน delayMs (กันกระพริบตอน cache มาไว)
   + เมื่อโผล่แล้วอยู่อย่างน้อย minMs (กัน skeleton วาบหายเร็วเกินจนตาไม่ทัน) ---- */
export function useDelayedFlag(active, delayMs = 120, minMs = 300) {
  const [on, setOn] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (active && !on) { // กำลังโหลด & ยังไม่โชว์ → ตั้งเวลาโผล่หลัง delay
      const t = setTimeout(() => { shownAt.current = Date.now(); setOn(true); }, delayMs);
      return () => clearTimeout(t);
    }
    if (!active && on) { // ข้อมูลมาแล้ว & กำลังโชว์ → อยู่ต่อจนครบ minMs
      const left = minMs - (Date.now() - shownAt.current);
      if (left <= 0) { setOn(false); return; }
      const t = setTimeout(() => setOn(false), left);
      return () => clearTimeout(t);
    }
  }, [active, on, delayMs, minMs]);
  return on;
}

/* ---- จังหวะ skeleton สั้นๆ ตอนเข้าหน้า (สำหรับหน้าที่ข้อมูลพร้อมอยู่แล้ว = ไม่มีโหลดจริง)
   เพื่อความสม่ำเสมอกับหน้า Sale — โชว์ ~350ms ตอน mount แล้วเข้าเนื้อหา ---- */
export function useBeat(ms = 350) {
  const [on, setOn] = useState(true);
  useEffect(() => { const t = setTimeout(() => setOn(false), ms); return () => clearTimeout(t); }, []);
  return on;
}

/* ---- เหมือน useBeat แต่ re-fire ทุกครั้งที่ dep เปลี่ยน (สลับหน้าย่อยในเซกชันเดียว) โดยไม่ remount ตัว dispatcher
   → leaf view mount ครั้งเดียวต่อ sub (ไม่เพิ่ม fetch/egress) ---- */
export function useBeatOn(dep, ms = 320) {
  const [on, setOn] = useState(true);
  useEffect(() => { setOn(true); const t = setTimeout(() => setOn(false), ms); return () => clearTimeout(t); }, [dep, ms]);
  return on;
}

/* ---- การ์ดกริดจำลอง (overview โครงการ / รายการการ์ด) ---- */
export function CardGridSkeleton({ cards = 6, header = true }) {
  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      {header && <div className="row between" style={{ marginBottom: 2 }}><Skel w={180} h={20} /><Skel w={120} h={34} r={10} /></div>}
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="card" style={{ padding: 0, overflow: 'hidden', opacity: Math.max(0.4, 1 - i * 0.06) }}>
            <Skel w="100%" h={80} r={0} />
            <div style={{ padding: 16, display: 'grid', gap: 10 }}>
              <Skel w="62%" h={15} />
              <Skel w="40%" h={11} />
              <Skel w="100%" h={8} r={4} style={{ marginTop: 4 }} />
              <div className="row" style={{ gap: 6, marginTop: 4 }}>{Array.from({ length: 3 }).map((_, j) => <Skel key={j} w={22} h={22} r={11} />)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- ฉลองทะลุเป้ายอดขาย (อลังการสุด · ยอดวิ่งนับ · ไม่พึ่ง dep · CSS confetti + portal) ---- */
const CONFETTI_COLORS = ['#f5a623', '#ffd86b', '#4f46e5', '#16a34a', '#ec4899', '#06b6d4', '#ef4444', '#8b5cf6'];
const CELEBRATE_HEADLINES = ['🎉 ทะลุเป้าแล้ว!', '🔥 ทุบเป้ากระจุย!', '🏆 ปังไม่ไหวแล้ว!', '🚀 พุ่งทะลุเป้า!', '🥳 โหดมากกก!'];
export function CelebrationOverlay({ amount = 0, target = 0, pct = 0, onClose }) {
  const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shown = useCountUp(amount, 1700); // ยอดวิ่งนับช้าๆ ให้เห็นพุ่งเข้าหาเป้า
  const headline = useRef(CELEBRATE_HEADLINES[Math.floor(Math.random() * CELEBRATE_HEADLINES.length)]).current;
  useEffect(() => {
    const t = setTimeout(() => onClose && onClose(), 8000);
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  if (typeof document === 'undefined') return null;
  const over = Math.max(0, amount - target);
  const fillPct = target > 0 ? Math.min((shown / target) * 100, 100) : 100;
  const livePct = target > 0 ? (shown / target) * 100 : 100;
  const crossed = target > 0 && shown >= target;
  const pieces = reduce ? [] : Array.from({ length: 130 });
  return createPortal(
    <div className="celebrate-overlay" role="dialog" aria-modal="true" aria-label="ฉลองทะลุเป้ายอดขาย" onClick={() => onClose && onClose()}>
      <div className="celebrate-confetti" aria-hidden="true">
        {pieces.map((_, i) => {
          const left = Math.random() * 100, dur = 2.6 + Math.random() * 2.6, delay = (i % 2 ? 0 : 1.2) + Math.random() * 0.9, size = 7 + Math.random() * 10;
          return <span key={i} style={{ left: left + '%', width: size, height: size * 0.6, background: CONFETTI_COLORS[i % CONFETTI_COLORS.length], animationDuration: dur + 's', animationDelay: delay + 's', borderRadius: i % 3 === 0 ? '50%' : '2px' }} />;
        })}
      </div>
      <div className={'celebrate-card' + (crossed ? ' celebrate-card-crossed' : '')} onClick={e => e.stopPropagation()}>
        <div className="celebrate-glow" aria-hidden="true" />
        <div className="celebrate-ribbon celebrate-ribbon-l" aria-hidden="true" />
        <div className="celebrate-ribbon celebrate-ribbon-r" aria-hidden="true" />
        <div className="celebrate-trophy"><Trophy size={50} strokeWidth={1.6} /></div>
        <div className="celebrate-spark celebrate-spark-l" aria-hidden="true"><Sparkles size={22} /></div>
        <div className="celebrate-spark celebrate-spark-r" aria-hidden="true"><Sparkles size={16} /></div>
        <div className="celebrate-title">{headline}</div>
        <div className={'celebrate-amount' + (crossed ? ' celebrate-amount-hot' : '')}>{B(shown)}</div>
        {/* แถบยอดวิ่งเข้าหาเป้า + จุดเป้า + ข้ามเป้าแฟลช */}
        {target > 0 && (
          <div className="celebrate-track" aria-hidden="true">
            <div className="celebrate-fill" style={{ width: fillPct + '%' }} />
            <div className="celebrate-target-mark" title="เป้า" />
          </div>
        )}
        <div className="celebrate-sub">{crossed ? `ทะลุเป้า ${B(over)} (+${P(target > 0 ? (over / target) * 100 : 0, 0)})` : `กำลังพุ่งเข้าเป้า… ${P(livePct, 0)}`}</div>
        <button className="celebrate-close" onClick={() => onClose && onClose()} autoFocus>เยี่ยมไปเลย! 🙌</button>
      </div>
    </div>,
    document.body
  );
}

/* ---- Skeleton primitives: บล็อก shimmer + ตารางจำลอง (ใช้ตอนดึงข้อมูลจริง) ---- */
export function Skel({ w = '100%', h = 14, r = 8, style }) {
  return <div className="skel" style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;
}
// ตารางจำลอง: หัวตาราง + แถว (จางลงเรื่อยๆ ให้รู้สึกว่ามีของอยู่)
export function SkelTable({ cols = 6, rows = 8 }) {
  const widths = ['46%', '70%', '60%', '80%', '54%', '66%', '50%', '74%'];
  return (
    <div style={{ display: 'grid', gap: 11 }}>
      <div className="row" style={{ gap: 14 }}>{Array.from({ length: cols }).map((_, i) => <div key={i} style={{ flex: 1 }}><Skel w={widths[i % widths.length]} h={11} /></div>)}</div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="row" style={{ gap: 14, opacity: Math.max(0.32, 1 - r * 0.075) }}>
          {Array.from({ length: cols }).map((_, i) => <div key={i} style={{ flex: 1 }}><Skel w={i === 0 ? '85%' : widths[(i + r) % widths.length]} h={13} /></div>)}
        </div>
      ))}
    </div>
  );
}

/* ---- Skeleton กลาง (ใช้ตอนยังไม่รู้ layout: lazy-chunk Suspense / หน้ารอง) — การ์ด KPI + ตาราง ---- */
export function PageSkeleton() {
  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="card" style={{ flex: '1 1 180px' }}><Skel w="55%" h={10} /><Skel w="72%" h={24} style={{ marginTop: 10 }} /></div>)}
      </div>
      <div className="card" style={{ minHeight: 240 }}><Skel w={160} h={13} style={{ marginBottom: 18 }} /><SkelTable cols={6} rows={6} /></div>
    </div>
  );
}

/* ============================================================
   shadcn-inspired JSX components (Phase 7)
   ============================================================ */
/* Accordion — wraps native <details>/<summary>, no JS needed for open/close */
export function Accordion({ children, className = '' }) {
  return <div className={`accordion ${className}`}>{children}</div>;
}
export function AccordionItem({ children, defaultOpen, className = '' }) {
  return <details className={`accordion-item ${className}`} open={defaultOpen}>{children}</details>;
}
export function AccordionTrigger({ children, className = '' }) {
  return <summary className={`accordion-trigger ${className}`}>{children}<svg className="accordion-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg></summary>;
}
export function AccordionContent({ children, className = '' }) {
  return <div className={`accordion-content ${className}`}>{children}</div>;
}

/* Dropdown — stateful open/close */
export function Dropdown({ trigger, children, align = 'left', className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div ref={ref} className={`dropdown ${className}`} style={{ position: 'relative', display: 'inline-block' }}>
      <div className="dropdown-trigger" onClick={() => setOpen(!open)}>{trigger}</div>
      {open && <div className={`dropdown-content${align === 'right' ? ' dropdown-content-right' : ''}`} style={{ position: 'absolute', zIndex: 60 }}>{children}</div>}
    </div>
  );
}
export function DropdownItem({ children, onClick, danger, className = '' }) {
  return <button className={`dropdown-item${danger ? ' danger' : ''} ${className}`} onClick={onClick}>{children}</button>;
}

/* Alert — simple wrapper */
export function Alert({ variant = 'default', title, description, action, children, className = '' }) {
  return (
    <div className={`alert${variant === 'destructive' ? ' alert-destructive' : ''} ${className}`}>
      {title && <div className="alert-title">{title}</div>}
      {description && <div className="alert-description">{description}</div>}
      {children}
      {action && <div className="alert-action">{action}</div>}
    </div>
  );
}

/* Popover — stateful */
export function Popover({ trigger, children, position = 'top', className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const posClass = position === 'top' ? 'popover-content-top' : position === 'right' ? 'popover-content-right' : '';
  return (
    <div ref={ref} className={`popover ${className}`}>
      <div className="popover-trigger" onClick={() => setOpen(!open)}>{trigger}</div>
      {open && <div className={`popover-content ${posClass}`}><div className="popover-arrow" />{children}</div>}
    </div>
  );
}

/* Tooltip — CSS-hover based (pure CSS, no state) */
export function Tooltip({ label, children, position = 'top' }) {
  const posClass = position === 'top' ? 'tooltip-content-top' : position === 'bottom' ? 'tooltip-content-bottom' : position === 'right' ? 'tooltip-content-right' : 'tooltip-content-left';
  return (
    <span className="tooltip">
      {children}
      <span className={`tooltip-content ${posClass}`}>
        {label}
        <span className="tooltip-arrow" />
      </span>
    </span>
  );
}

/* Checkbox — styled native input */
export function Checkbox({ checked, onChange, label, disabled, indeterminate, className = '' }) {
  const inputRef = useRef(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);
  const inner = <input ref={inputRef} type="checkbox" className={`checkbox ${className}`} checked={checked} onChange={onChange} disabled={disabled} />;
  if (label) return <label className="checkbox-label">{inner}{label}</label>;
  return inner;
}

/* ===== shadcn-style Sidebar ===== */
const SidebarContext = createContext({ open: true, setOpen: () => {} });

export function SidebarProvider({ children, defaultOpen = true, open: controlledOpen, onOpenChange, className = '' }) {
  const controlled = controlledOpen !== undefined;
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = controlled ? controlledOpen : open;
  const toggle = () => { const v = !isOpen; if (!controlled) setOpen(v); onOpenChange?.(v); };
  return (
    <SidebarContext.Provider value={{ open: isOpen, toggle }}>
      <div className={`sidebar-provider ${className}`} data-state={isOpen ? 'expanded' : 'collapsed'}>
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function useSidebar() { return useContext(SidebarContext); }

export function Sidebar({ children, collapsible = 'icon', side = 'left', variant = 'sidebar', className = '' }) {
  const { open } = useSidebar();
  return (
    <aside
      className={`sidebar ${className}`}
      data-state={open ? 'expanded' : 'collapsed'}
      data-collapsible={collapsible}
      data-side={side}
      data-variant={variant}
    >
      {children}
    </aside>
  );
}

export function SidebarHeader({ children, className = '' }) {
  return <div className={`sidebar-header ${className}`}>{children}</div>;
}

export function SidebarContent({ children, className = '' }) {
  return <div className={`sidebar-content ${className}`}>{children}</div>;
}

export function SidebarGroup({ label, children, className = '' }) {
  return (
    <div className={`sidebar-group ${className}`}>
      {label && <div className="sidebar-group-label">{label}</div>}
      {children}
    </div>
  );
}

export function SidebarMenu({ children, className = '' }) {
  return <div className={`sidebar-menu ${className}`}>{children}</div>;
}

export function SidebarMenuItem({ icon, label, isActive, badge, onClick, children, className = '' }) {
  return (
    <div className={`sidebar-menu-item ${className}`}>
      <button className={`sidebar-menu-button${isActive ? ' active' : ''}`} onClick={onClick}>
        <Icon name={icon} />
        <span className="label">{label}</span>
        {badge != null && <span className="sidebar-menu-badge">{badge}</span>}
      </button>
      {children}
    </div>
  );
}

export function SidebarFooter({ children, className = '' }) {
  return <div className={`sidebar-footer ${className}`}>{children}</div>;
}

export function SidebarTrigger({ className = '' }) {
  const { toggle } = useSidebar();
  return (
    <button className={`sidebar-trigger ${className}`} onClick={toggle} aria-label="Toggle sidebar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>
    </button>
  );
}

export function SidebarInset({ children, className = '' }) {
  return <div className={`sidebar-inset ${className}`}>{children}</div>;
}
