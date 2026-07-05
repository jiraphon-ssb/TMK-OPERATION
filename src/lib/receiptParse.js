/* ============================================================
   receiptParse.js — อ่านใบเสร็จรับเงิน Shipnity (PDF ดิจิทัล) ด้วย pdf.js ล้วน
   ============================================================
   ไม่ใช้ AI/network — parser ออกแบบให้ "ทนใบต่างแบบ" (เป้า ~100 ผันแปร):
   - ตำแหน่งไม่ตายตัว: ทุก threshold คิดตามสัดส่วนหน้ากระดาษ (SC = กว้างจริง/612)
     + คอลัมน์ขวา derive จากตำแหน่ง label จริง ("เลขที่เอกสาร") ไม่ใช่ค่า hardcode
   - label หลายภาษา/หลายคำ (ไทย+อังกฤษ synonym ต่อ field) ผ่าน labelKey แบบ fuzzy
   - วันที่หลายรูป: DD/MM/YYYY (พ.ศ./ค.ศ.) · YYYY-MM-DD · "2 ก.ค. 2569" (เดือนไทยย่อ/เต็ม)
   - เลขไทย ๐-๙ → อารบิกทุกจุดตัวเลข · จุลภาคพันหลัก
   - ไฟล์สแกน/รูป (ไม่มี text layer) / ล็อครหัส → error ข้อความชัด ไม่เงียบ
   - ช่องทางติดต่อไม่รู้จัก → warning + เก็บโทเคน (เพิ่ม pattern จากใบจริงได้เรื่อยๆ)
   - deterministic: field ที่หาไม่เจอ → ใส่ชื่อลง warnings ไม่มีการเดา
   ข้อจริงจากไฟล์ Shipnity ที่รองรับ:
   - ตัวอักษรไทยแตกเป็นชิ้นย่อย → ต่อกลับตามบรรทัด (y±tol) + เว้นวรรคตามช่องว่าง x จริง
   - ฟอนต์ map วรรณยุกต์บางตัวเป็น \u0000 (เช่น "ที่" → "ที\0") → strip ก่อน match label
   - สระอำ decomposed (นิคหิต ํ + า) → ำ · ช่องว่างปลอมกลางคำ → ลบตามกติกาสระ/วรรณยุกต์
   - แต่ละรายการ = หลายบรรทัด y ซ้อน (รหัส/ชื่อ+ตัวเลข/วันที่ผลิต) → จับกลุ่มด้วย y ใกล้สุด
   - บางหน้ามีป้ายจัดส่ง (ผู้ส่ง/ผู้รับ) เหนือใบ → อ่านเฉพาะใต้หัว "ใบเสร็จรับเงิน"
   ใช้:  const receipts = await parseReceiptPdf(file)   // 1 ไฟล์ → หลายใบได้ (PDF รวมหลายหน้า)
   - แยกใบ: หน้าไหนมี "เลขที่เอกสาร" = เริ่มใบใหม่ · หน้าไม่มี = หน้าต่อ (รายการยาว)
   regression: node scripts/test-receipts.mjs [โฟลเดอร์ PDF]
   ============================================================ */
import { PROVINCES } from './provinces.js';

/* ---------- pdf.js loader (lazy — โหลดเมื่อใช้จริงเท่านั้น) ---------- */
let _pdfjs = null;
async function loadPdfjs() {
  if (_pdfjs) return _pdfjs;
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
  if (isBrowser) {
    const lib = await import('pdfjs-dist');
    try {
      const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
      lib.GlobalWorkerOptions.workerSrc = worker.default;
    } catch { /* worker โหลดไม่ได้ → pdf.js fallback main thread เอง */ }
    _pdfjs = lib;
  } else {
    // Node (unit test / scripts): ใช้ legacy build (ตัวปกติพึ่ง DOM API)
    _pdfjs = await import(/* @vite-ignore */ 'pdfjs-dist/legacy/build/pdf.mjs');
  }
  return _pdfjs;
}

/* ---------- helpers ---------- */
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/* ---------- Thai text normalize ---------- */
const thDigits = (s) => String(s || '').replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0E50)); // เลขไทย → อารบิก
const normThai = (s) => thDigits(s)
  .replace(/[\u0000-\u001f]/g, '')  // ฟอนต์ map วรรณยุกต์เป็น null → ตัดทิ้ง
  .replace(/ํา/g, 'ำ')                     // นิคหิต ํ + า → ำ
  .replace(/ /g, ' ')
  .replace(/\s+/g, ' ')
  // ช่องว่างปลอมกลางคำ (ฟอนต์ใบ Shipnity แทรก space item + บางชิ้น width=0):
  // (ก) space ก่อนสระบน-ล่าง/วรรณยุกต์ = ปลอมเสมอ (เครื่องหมายเกาะพยัญชนะก่อนหน้า)
  .replace(/\s+(?=[ัำ-ฺ็-๎])/g, '')
  // (ข) space หลังสระ/วรรณยุกต์ที่จบคำไม่ได้ (ั ิ ี ึ ื ุ ู ฺ เ แ โ ใ ไ ็ ่ ้ ๊ ๋) = ปลอม
  //     เว้น ์ กับ ำ ที่จบคำได้จริง ("ตน์ แก้ว" · "ทำ งาน") → คงช่องว่างจริงระหว่างชื่อ-นามสกุล
  .replace(/([ัิ-ฺเ-ไ็-๋])\s+(?=[ก-ฮเ-ไ])/g, '$1')
  .trim();
// สำหรับ match label: ตัดช่องว่าง/สระบน-ล่าง/วรรณยุกต์ (ทน glyph แตก/หาย)
const labelKey = (s) => normThai(s).replace(/[ัำ-ฺ็-๎\s.]/g, '').toLowerCase();
const LK = (s) => labelKey(s);
const LKS = (labels) => (Array.isArray(labels) ? labels : [labels]).map(LK);

const num = (s) => {
  const t = thDigits(s ?? '').replace(/,/g, '').trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
};

/* ---------- Label synonyms (ไทย+อังกฤษ ต่อ field) — เทียบผ่าน labelKey ---------- */
const L = {
  title:    ['ใบเสร็จรับเงิน', 'receipt'],
  docNo:    ['เลขที่เอกสาร', 'เลขที่ใบเสร็จ', 'เลขที่บิล', 'doc no', 'document no', 'receipt no', 'no'],
  date:     ['วันที่', 'date'],
  payment:  ['เงื่อนไขการชำระเงิน', 'การชำระเงิน', 'ชำระโดย', 'payment terms', 'payment'],
  carrier:  ['การจัดส่ง', 'จัดส่งโดย', 'ขนส่ง', 'shipping', 'delivery'],
  discCode: ['รหัสส่วนลด', 'promo code', 'coupon'],
  custTax:  ['เลขประจำตัวผู้เสียภาษี', 'tax id'],
  note:     ['หมายเหตุ', 'note', 'remark'],
  checker:  ['ผู้ตรวจสอบ', 'checked by'],
  // แถวสรุปยอดฝั่งขวาล่าง — exact match ต่อแถว (กัน "ยอด" ชน "ยอดรวม")
  subtotal: ['ยอด', 'subtotal'],
  discount: ['ส่วนลด', 'discount'],
  shipFee:  ['ค่าส่ง', 'ค่าจัดส่ง', 'shipping fee', 'delivery fee'],
  vat:      ['ภาษีมูลค่าเพิ่ม', 'vat', 'tax'],
  total:    ['ยอดรวม', 'รวมทั้งสิ้น', 'รวมสุทธิ', 'ยอดสุทธิ', 'grand total', 'total'],
  // หัวตารางรายการ (กลุ่มละหลายคำ)
  hCode:    ['รหัสสินค้า', 'รหัส', 'sku', 'code'],
  hName:    ['ชื่อสินค้า', 'รายการ', 'สินค้า', 'item', 'description'],
  hQty:     ['จำนวน', 'qty', 'quantity'],
  hPrice:   ['ราคา', 'ราคาต่อหน่วย', 'price', 'unit price'],
  hDisc:    ['ส่วนลด', 'discount'],
  hAmt:     ['ยอด', 'รวม', 'amount', 'total'],
};

/* ---------- ต่อชิ้นข้อความในบรรทัด: เว้นวรรคเมื่อมีช่องว่าง x จริง ---------- */
function joinItems(items, sc = 1) {
  let out = '', prevEnd = null;
  for (const it of items) {
    if (prevEnd != null && it.x - prevEnd > 1.5 * sc) out += ' ';
    out += it.s;
    prevEnd = it.x + (it.w || 0);
  }
  return normThai(out);
}

/* ---------- อ่านหน้า → บรรทัด (จัดกลุ่มตาม y ±tol · เรียง x) — tol สเกลตามหน้ากระดาษ ---------- */
async function pageToRows(page, sc = 1) {
  const tc = await page.getTextContent();
  const rows = [];
  const tol = 2 * sc;
  for (const it of tc.items) {
    const s = it.str || '';
    if (!s.trim()) continue;
    const y = it.transform[5];
    const x = it.transform[4];
    let row = null;
    for (const r of rows) if (Math.abs(r.y - y) <= tol) { row = r; break; }
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push({ x, s, w: it.width || 0 });
  }
  rows.sort((a, b) => b.y - a.y); // บนลงล่าง
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
    r.text = joinItems(r.items, sc);
    r.key = labelKey(r.text);
  }
  return rows;
}

/* ---------- หา "ตำแหน่ง label" จริงบนหน้า (สะสมชิ้นจากซ้ายจนประกอบเป็น label) ----------
   คืน { x, row } ของ label แรกที่เจอ — ใช้ derive คอลัมน์ขวาแทนค่า hardcode */
function findLabel(rows, labels) {
  const lks = LKS(labels);
  for (const r of rows) {
    for (let i = 0; i < r.items.length; i++) {
      let acc = '';
      for (let j = i; j < r.items.length && j < i + 14; j++) {
        acc += r.items[j].s;
        const k = labelKey(acc);
        if (lks.includes(k)) return { x: r.items[i].x, row: r };
        if (!lks.some(lk => lk.startsWith(k))) break;
      }
    }
  }
  return null;
}

/* ---------- หา "ค่า" หลัง label (label ... : value) — รับ synonym หลายคำ ----------
   labelMinX: มองเฉพาะชิ้นที่ x ≥ ค่านี้ (กัน colon/ข้อความคอลัมน์อื่นปนบรรทัดเดียว) */
function valueAfterLabel(rows, labels, { labelMinX = 0, sc = 1 } = {}) {
  const lks = LKS(labels);
  for (const r of rows) {
    const items = r.items.filter(i => i.x >= labelMinX);
    if (!items.length) continue;
    const key = labelKey(items.map(i => i.s).join(''));
    if (!lks.some(lk => key.includes(lk))) continue;
    const colon = items.findIndex(i => i.s.includes(':'));
    const parts = colon >= 0 ? items.slice(colon + 1) : [];
    return { text: joinItems(parts, sc), row: r };
  }
  return null;
}

/* ---------- วันที่หลายรูปแบบ → ISO · ปี > 2400 = พ.ศ. ----------
   รองรับ: DD/MM/YYYY(+เวลา) · YYYY-MM-DD · "2 ก.ค. 2569" / "2 กรกฎาคม 2569" · เลขไทย */
const TH_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_MONTHS_AB = ['มค', 'กพ', 'มีค', 'เมย', 'พค', 'มิย', 'กค', 'สค', 'กย', 'ตค', 'พย', 'ธค'];
function parseThaiDate(s) {
  const t = thDigits(s || '');
  const mk = (d, mo, y) => {
    if (y > 2400) y -= 543;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2200) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };
  let m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (m) return mk(+m[1], +m[2], +m[3]);
  m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return mk(+m[3], +m[2], +m[1]);
  // "2 ก.ค. 2569" / "2 กรกฎาคม 2569" — เทียบชื่อเดือน (ตัดจุด/ช่องว่าง)
  m = /(\d{1,2})\s*([ก-ฮ.]{2,12})\s*(\d{4})/.exec(t);
  if (m) {
    const token = m[2].replace(/[.\s]/g, '');
    let mo = TH_MONTHS_FULL.findIndex(x => token.startsWith(x.slice(0, 4)) || x.startsWith(token));
    if (mo < 0) mo = TH_MONTHS_AB.indexOf(token);
    if (mo >= 0) return mk(+m[1], mo + 1, +m[3]);
  }
  return null;
}

/* ---------- ช่องทางติดต่อ/ขาย: normalize โทเคนหลากรูปแบบ → CHANNELS ของแอป ----------
   ครอบคลุมรูปที่เจอจริง + เผื่ออนาคต (Shipnity ตั้งชื่อช่องได้เอง หลายภาษา/ตัวพิมพ์):
   facebook·FACEBOOK·fb·เฟส·messenger → Facebook · line·line_oa·LINE·ไลน์ → LINE
   ig·instagram·ไอจี → Instagram · phone·PHONE·โทร·เบอร์·มือถือ → Phone
   tiktok·ติ๊กต็อก → TikTok · shopee·ช้อปปี้ → Shopee · lazada·ลาซาด้า → Lazada
   หน้าร้าน·walk-in·POS → POS · ไม่รู้จัก → '' + warning เก็บโทเคน (เพิ่ม pattern ทีหลังได้) */
const CHANNEL_PATTERNS = [
  [/facebook|messenger|เฟส|เฟซ|\bfb\b/i, 'Facebook'],
  [/\bline|ไลน์/i, 'LINE'],                       // line_oa · lineoa · line-shop → LINE (ไม่ใช้ \b หลัง line เพราะ "_" กันไว้)
  [/instagram|insta|ไอจี|\big\b/i, 'Instagram'],
  [/tiktok|ติ๊?กต็?อก|ทิกทอก/i, 'TikTok'],
  [/shopee|ช้?อปปี|ช็อปปี/i, 'Shopee'],
  [/lazada|ลาซาด/i, 'Lazada'],
  [/phone|โทร|เบอร์|มือถือ|\btel\b/i, 'Phone'],
  [/หน้าร้าน|walk[- ]?in|\bpos\b|storefront/i, 'POS'],
];
function channelFromText(s) {
  const t = String(s || '');
  for (const [re, ch] of CHANNEL_PATTERNS) if (re.test(t)) return ch;
  return '';
}
// social handle ที่อ่านได้จริง — ตัด emoji/สัญลักษณ์ (เช่น "💜 นุช 🌹", "⭐ Mo ⭐") เหลือข้อความ
const cleanSocial = (s) => {
  const t = String(s || '').replace(/[^A-Za-zก-๙0-9@._/\- ]/gu, ' ').replace(/\s+/g, ' ').trim();
  return ((t.match(/[A-Za-zก-๙]/g) || []).length >= 2) ? t : '';
};

/* ---------- หา "จังหวัด" จากที่อยู่ (เทียบ list จริง 77 จังหวัด · เลือกชื่อที่ยาวสุดที่เจอ) ---------- */
function provinceFrom(address) {
  const a = normThai(address).replace(/\s/g, '');
  if (!a) return '';
  if (a.includes('กรุงเทพ')) return 'กรุงเทพมหานคร';   // ที่อยู่ กทม. มักเขียนสั้น ไม่มี "จ."/"มหานคร"
  let best = '';
  for (const p of PROVINCES) if (a.includes(p.th) && p.th.length > best.length) best = p.th;
  return best;
}

/* ============================================================
   parse 1 หน้า → ใบ (หรือหน้าต่อ)
   ============================================================ */
const BASE_W = 612;           // ความกว้างหน้าเทมเพลตอ้างอิง (pt) — SC = pageW/BASE_W
const DEF_RIGHT_COL = 300;    // fallback คอลัมน์ขวา (×SC) เมื่อหา label เลขที่เอกสารไม่เจอ

/* รหัสสินค้า เช่น JSK02-BK-S · JJK111-N-XL · JDRR111-BK-M · JDB111-Y-2XL (ตัวอักษร≥2 + เลข + -ส่วน) */
const CODE_RE = /^[A-Za-z]{2,}[0-9]{1,4}(-[A-Za-z0-9]{1,5}){1,3}$/;
const DATE_PAREN_RE = /^\(?\s*\d{1,2}\/\d{1,2}\/\d{4}\s*\)?$/; // บรรทัดวันที่ผลิต "(02/07/2026)" → ทิ้ง

function parseLineTable(rows, sc, rightCol) {
  // header ตาราง: มีหัวคอลัมน์ ≥4 จาก 6 กลุ่ม (แต่ละกลุ่มมี synonym)
  const HGROUPS = [L.hCode, L.hName, L.hQty, L.hPrice, L.hDisc, L.hAmt].map(LKS);
  const rowHits = (r) => HGROUPS.filter(g => g.some(lk => r.key.includes(lk))).length;
  const headerRow = rows.find(r => rowHits(r) >= 4);
  if (!headerRow) return { lines: [], found: false };

  // ตำแหน่งคอลัมน์จาก header จริง (ทนเทมเพลตขยับ/สเกล)
  const hItems = headerRow.items;
  const xOfHeader = (labels) => {
    const lks = LKS(labels);
    for (let i = 0; i < hItems.length; i++) {
      let acc = '';
      for (let j = i; j < hItems.length && j < i + 12; j++) {
        acc += hItems[j].s;
        const k = labelKey(acc);
        if (lks.includes(k)) return hItems[i].x;
        if (!lks.some(lk => lk.startsWith(k))) break;
      }
    }
    return null;
  };
  const xName = xOfHeader(L.hName) ?? (hItems[0].x + 85 * sc);
  const xQty  = xOfHeader(L.hQty) ?? (xName + 140 * sc);
  const numZoneX = xQty - 35 * sc; // คอลัมน์ตัวเลข (จำนวน/ราคา/ส่วนลด/ยอด) เริ่มที่นี่
  const nameMinX = xName - 15 * sc;

  // ขอบล่างของตาราง = แถวสรุปยอด/หมายเหตุ/ผู้ตรวจสอบ
  const SUM_KEYS = LKS([...L.subtotal, ...L.total, ...L.discount, ...L.shipFee, ...L.vat]);
  const isSummaryRow = (r) => {
    const right = r.items.filter(i => i.x >= rightCol && num(i.s) == null);
    const rk = labelKey(right.map(i => i.s).join(''));
    return SUM_KEYS.includes(rk);
  };
  const NOTE_KEYS = LKS(L.note), CHECKER_KEYS = LKS(L.checker);
  const bottomY = Math.max(
    ...rows.filter(r => isSummaryRow(r) || NOTE_KEYS.some(k => r.key.startsWith(k)) || CHECKER_KEYS.some(k => r.key.startsWith(k))).map(r => r.y),
    -Infinity,
  );
  const bodyRows = rows.filter(r => r.y < headerRow.y - 4 * sc && r.y > bottomY + 4 * sc);

  // แถวหลัก = มีตัวเลข ≥2 ในโซนขวา (ราคา/ยอด) · ที่เหลือ = เศษ (รหัส/ชื่อห่อ/วันที่)
  const mainRows = [], otherRows = [];
  for (const r of bodyRows) {
    const nums = r.items.filter(i => i.x >= numZoneX && num(i.s) != null);
    if (nums.length >= 2) { r._nums = nums; mainRows.push(r); }
    else otherRows.push(r);
  }
  if (!mainRows.length) return { lines: [], found: true };
  mainRows.sort((a, b) => b.y - a.y); // บน→ล่าง

  // จับเศษเข้ากับแถวหลักที่ y ใกล้สุด (รหัสอยู่บรรทัดเหนือ · ชื่อห่ออยู่เหนือ/ใต้ · วันที่ทิ้ง)
  const groups = mainRows.map(m => ({ main: m, extra: [] }));
  for (const r of otherRows) {
    const t = r.text.trim();
    if (!t || DATE_PAREN_RE.test(t) || num(t.replace(/,/g, '')) != null) continue; // ทิ้งวันที่/ตัวเลขล้วน(qty รวม)
    let bi = 0, bd = Infinity;
    for (let i = 0; i < mainRows.length; i++) { const d = Math.abs(mainRows[i].y - r.y); if (d < bd) { bd = d; bi = i; } }
    groups[bi].extra.push(r);
  }

  const lines = [];
  for (const g of groups) {
    const clusterRows = [g.main, ...g.extra].sort((a, b) => b.y - a.y); // บน→ล่าง (ลำดับอ่านชื่อที่ห่อ)
    // รหัส = token แรกที่ match CODE_RE (อยู่บรรทัดไหนก็ได้ในกลุ่ม)
    let code = '';
    for (const r of clusterRows) { for (const it of r.items) { const tok = String(it.s).replace(/\s/g, ''); if (CODE_RE.test(tok)) { code = tok; break; } } if (code) break; }
    // ชื่อ = ชิ้นในโซนชื่อ (nameMinX .. numZoneX) ที่ไม่ใช่รหัส/ตัวเลข/วันที่ · ต่อแบบ wrap-aware
    const nameFrags = [];
    for (const r of clusterRows) {
      const parts = r.items.filter(i => i.x >= nameMinX && i.x < numZoneX
        && num(i.s) == null && !CODE_RE.test(String(i.s).replace(/\s/g, '')) && !DATE_PAREN_RE.test(i.s.trim()));
      if (parts.length) nameFrags.push(joinItems(parts, sc));
    }
    let name = '';
    for (const p of nameFrags) { if (!name) { name = p; continue; } name += (/[-(/]$/.test(name) || /^[-)/]/.test(p)) ? p : ' ' + p; }
    // ตัวเลขจากแถวหลัก
    const vals = g.main._nums.map(i => num(i.s));
    let qty = null, price = null, disc = 0, amt = null;
    if (vals.length >= 4) [qty, price, disc, amt] = vals;
    else if (vals.length === 3) [qty, price, amt] = vals;
    else [qty, amt] = vals;
    lines.push({ code, name: normThai(name), qty: Math.max(0, Math.round(qty ?? 0)), unit_price: price ?? 0, discount: disc ?? 0, amount: amt ?? 0 });
  }
  return { lines: lines.filter(l => l.qty > 0 || l.amount > 0), found: true };
}

function parsePage(rows, pageNo, pageW) {
  const sc = (pageW > 0 ? pageW : BASE_W) / BASE_W; // สเกลตามหน้ากระดาษจริง (A4/A5/สลิป)

  // จำกัดโซนอ่านเฉพาะ "ใต้หัวใบเสร็จรับเงิน" — บางหน้ามีป้ายจัดส่ง (ผู้ส่ง/ผู้รับ) พิมพ์อยู่เหนือใบเสร็จ
  const titleRow = findLabel(rows, L.title)?.row || null;
  const body = titleRow ? rows.filter(r => r.y <= titleRow.y + 3 * sc) : rows;

  // คอลัมน์ขวา: derive จากตำแหน่ง label "เลขที่เอกสาร" จริง (fallback ค่าอ้างอิง ×SC)
  const docLabel = findLabel(body, L.docNo);
  const rightCol = docLabel ? Math.max(60 * sc, docLabel.x - 30 * sc) : DEF_RIGHT_COL * sc;

  const docNoHit = valueAfterLabel(body, L.docNo, { labelMinX: rightCol, sc });
  const { lines } = parseLineTable(body, sc, rightCol);
  if (!docNoHit || !normThai(docNoHit.text)) return { continuation: true, lines, page: pageNo };

  const warnings = [];
  const order_no = normThai(docNoHit.text).replace(/\s/g, '');
  if (!order_no) warnings.push('เลขที่เอกสาร');

  let order_date = parseThaiDate(valueAfterLabel(body, L.date, { labelMinX: rightCol, sc })?.text);
  if (!order_date) {
    // วันที่ว่างบนใบ (เซลล์ไม่กรอกใน Shipnity) → เติมวันที่อัปโหลด (วันนี้) + เตือนให้ตรวจ (แก้ได้ในตาราง)
    order_date = todayISO();
    warnings.push('ไม่มีวันที่บนใบ — ใช้วันที่อัปโหลด (แก้ได้)');
  } else {
    // วันที่ผิดปกติ (อนาคต/เก่าผิดสังเกต) → เตือนให้ตรวจ ไม่บล็อก
    const today = new Date(); today.setDate(today.getDate() + 1);
    if (order_date > today.toISOString().slice(0, 10)) warnings.push(`วันที่เป็นอนาคต (${order_date})`);
    else if (order_date < '2025-01-01') warnings.push(`วันที่เก่าผิดปกติ (${order_date})`);
  }

  const payment_method = normThai(valueAfterLabel(body, L.payment, { labelMinX: rightCol, sc })?.text || '');
  const carrier = normThai(valueAfterLabel(body, L.carrier, { labelMinX: rightCol, sc })?.text || '');

  /* ---- ลูกค้า (ฝั่งซ้าย) + ช่องทางติดต่อ ----
     ช่องทางอยู่คอลัมน์กลาง (โซน ~215-275 ×SC — ก่อนถึงคอลัมน์ขวา) ตามด้วย ":" + ค่า
     กัน false-match ชื่อลูกค้าที่บังเอิญมีคำช่องทาง ด้วยการล็อกโซนตำแหน่ง */
  let customer_name = '', customer_social = '', channel_hint = '', channel_token = '';
  const midMin = 150 * sc, midMax = Math.min(285 * sc, rightCol - 10 * sc);
  const hasLetters = (s) => (String(s).match(/[A-Za-zก-๙]/g) || []).length >= 2;
  // หาบรรทัดช่องทาง = แถวแรก (จากบน) ที่มีโทเคนช่องทางรูปแบบ "channel:" — ไม่ผูกโซน x (รองรับ layout ต่าง)
  // กันชนคำในชื่อลูกค้า: ต้องมี ":" ตามหลังโทเคนใกล้ๆ (Shipnity พิมพ์ "facebook:" / "line:")
  let custRow = null, chanIdx = -1;
  for (const r of body) {
    // ข้ามแถวเบอร์โทร (Tel:) / เลขภาษี / หมายเหตุ / ผู้ตรวจ — "Tel" แมตช์ channelFromText เป็น Phone ได้ (กัน false-match)
    // (Shipnity ไม่ปล่อย ":" เป็น text item เสมอ จึงไม่บังคับ ":" — ใช้ skip พวก label แทน)
    if (/^tel/i.test(r.text.trim())) continue;
    if (LKS([...L.custTax, ...L.note, ...L.checker]).some(k => r.key.startsWith(k))) continue;
    const idx = r.items.findIndex(i => channelFromText(i.s));
    if (idx < 0) continue;
    custRow = r; chanIdx = idx; break;
  }
  if (custRow) {
    const cx = custRow.items[chanIdx].x;
    // ตำแหน่ง label "เลขที่เอกสาร" ในแถวเดียวกัน (channel-first layout วางเลขที่เอกสารต่อท้ายแถวลูกค้า)
    // — ตัดค่าหลังโทเคนแค่ก่อนถึง docNo แทนใช้ rightCol ทั้งหน้า (rightCol อาจเฉือนชื่อลูกค้าที่อยู่กลางแถว)
    const docStartIdx = (() => {
      const lks = LKS(L.docNo).filter(k => k.length > 2); // ตัด synonym สั้น 'no' — กัน false-match ชื่อ/social ที่ขึ้นต้น "No.1" ฯลฯ
      for (let i = chanIdx + 1; i < custRow.items.length; i++) {
        let acc = '';
        for (let j = i; j < Math.min(custRow.items.length, i + 14); j++) {
          acc += custRow.items[j].s; const k = labelKey(acc).replace(/[:\d]/g, ''); // ":" ติดมากับ item "เอกสาร:" → ตัดออกก่อนเทียบ
          if (!k) continue;
          if (lks.includes(k)) return i;
          if (!lks.some(lk => lk.startsWith(k))) break;
        }
      }
      return -1;
    })();
    const afterEnd = docStartIdx > chanIdx ? docStartIdx : custRow.items.length;
    // ขอบขวาโซนชื่อ (ก่อน docNo) — ใช้กับ fragment ห่อบรรทัด · ไม่ล้ำเข้าคอลัมน์ขวา (docNo/วันที่ ฯลฯ)
    const nameRightX = docStartIdx > chanIdx ? custRow.items[docStartIdx].x - 10 * sc : Math.min(rightCol - 8 * sc, cx + 90 * sc);
    // ชื่อฝั่งซ้ายโทเคน (เคสปกติ "ชื่อ  facebook: social")
    const leftText = joinItems(custRow.items.slice(0, chanIdx).filter(i => i.x < cx && num(i.s) == null && !/[:;]/.test(i.s)), sc).replace(/[:;]\s*$/, '').trim();
    // ค่าหลังโทเคน (social · หรือชื่อ กรณี channel-first) — ตัดก่อน docNo บนแถวเดียวกัน
    let afterText = joinItems(custRow.items.slice(chanIdx + 1, afterEnd).filter(i => !/^[:;\s]+$/.test(i.s)), sc).replace(/^[:;]\s*/, '').trim();
    channel_hint = channelFromText(custRow.items[chanIdx].s) || channelFromText(custRow.text);
    if (hasLetters(leftText)) {
      customer_name = leftText;
      customer_social = cleanSocial(afterText) || cleanSocial(leftText);
    } else {
      // channel-first: ไม่มีชื่อฝั่งซ้าย → ชื่อ = ค่าหลังโทเคน (แฮนเดิลช่องทาง)
      customer_name = cleanSocial(afterText);
      customer_social = customer_name;
      // ชื่อห่อบรรทัด: ต่อ fragment แถวถัดไปในช่วง x เดียวกับค่า (ไม่ใช่ label/ตัวเลข/ช่องทาง)
      const bi = body.indexOf(custRow), nxt = body[bi + 1];
      if (nxt && customer_name) {
        const cont = joinItems(nxt.items.filter(i => i.x >= cx - 5 * sc && i.x < nameRightX && num(i.s) == null && !/[:;]/.test(i.s) && !channelFromText(i.s)), sc).trim();
        const isLabelRow = LKS([...L.docNo, ...L.title, ...L.custTax, ...L.date, ...L.payment, ...L.carrier, ...L.discCode, ...L.note, ...L.checker]).some(k => nxt.key.includes(k));
        if (cont && hasLetters(cont) && !isLabelRow) { customer_name += cont; customer_social = cleanSocial(customer_name); }
      }
    }
  }
  if (!custRow) {
    // มีแถวลูกค้าโครงเดียวกัน (ซ้าย + โทเคนกลาง + ":") แต่ช่องทาง "ไม่รู้จัก" → เตือน + เก็บโทเคนไว้เพิ่ม pattern
    const structRow = body.find(r => r.items.some(i => i.x < 120 * sc)
      && r.items.some(i => i.x >= midMin && i.x < midMax && /[A-Za-zก-๙_]{2,}/.test(i.s) && num(i.s) == null)
      && r.items.some(i => i.x >= midMin && i.s.includes(':')));
    if (structRow && !LKS([...L.custTax, ...L.note, ...L.checker]).some(k => structRow.key.includes(k)) && !/^tel/i.test(structRow.text)) {
      const tokIdx = structRow.items.findIndex(i => i.x >= midMin && i.x < midMax && /[A-Za-zก-๙_]{2,}/.test(i.s) && num(i.s) == null);
      channel_token = normThai(structRow.items[tokIdx]?.s || '');
      customer_name = joinItems(structRow.items.slice(0, tokIdx).filter(i => i.x < midMax - 40 * sc && !/[:;]/.test(i.s)), sc);
      if (channel_token) warnings.push(`ช่องทาง "${channel_token}" ยังไม่รู้จัก — เลือกช่องทางเอง`);
      custRow = structRow;
    }
    if (!customer_name) {
      // ไม่มีบรรทัดช่องทางเลย → ชื่อ = แถวซ้าย (x เล็ก) แรกใต้หัวกระดาษที่ไม่ใช่ label ระบบ
      const cand = body.find(r => r.items[0] && r.items[0].x < 60 * sc
        && !LKS(L.custTax).some(k => r.key.includes(k)) && !/^tel/i.test(r.text)
        && !LKS(L.note).some(k => r.key.startsWith(k)) && !LKS(L.checker).some(k => r.key.startsWith(k))
        && r.text.length > 2 && !/\d{3,}/.test(r.text));
      customer_name = cand ? joinItems(cand.items.filter(i => i.x < midMax - 40 * sc), sc) : '';
    }
  }
  if (!customer_name) warnings.push('ชื่อลูกค้า');
  // ขายหน้าร้าน (การจัดส่ง/ชำระเงิน = "ขายหน้าร้าน") → เดาช่องทาง POS ให้ (ยังแก้ได้ในตารางตรวจ)
  if (!channel_hint && /หน้าร้าน/.test(`${carrier} ${payment_method}`)) channel_hint = 'POS';

  /* ---- Tel + ที่อยู่ลูกค้า (ฝั่งซ้าย ระหว่างแถวภาษีลูกค้า → Tel) ---- */
  const telRow = body.find(r => r.items[0] && r.items[0].x < 120 * sc && /^tel/i.test(r.text.trim()));
  const customer_phone = telRow ? (thDigits(telRow.text).replace(/[^0-9]/g, '') || '') : '';

  let customer_address = '';
  const custTaxIdx = body.findIndex(r => r.items[0] && r.items[0].x < 60 * sc && LKS(L.custTax).some(k => r.key.includes(k)));
  if (custTaxIdx >= 0) {
    for (let i = custTaxIdx + 1; i < body.length; i++) {
      const r = body[i];
      const leftItems = r.items.filter(x => x.x < rightCol);
      if (!leftItems.length || leftItems[0].x >= 60 * sc) continue;
      const t = joinItems(leftItems, sc);
      if (/^tel/i.test(t)) break;
      customer_address += (customer_address ? ' ' : '') + t;
    }
  }
  const province = provinceFrom(customer_address);
  if (!province) warnings.push('จังหวัด');

  /* ---- หมายเหตุ (ฝั่งซ้ายล่าง — เก็บหลายบรรทัดจนชน label ถัดไป) ---- */
  const noteIdx = body.findIndex(r => r.items[0] && r.items[0].x < 120 * sc && LKS(L.note).some(k => r.key.startsWith(k)));
  let note = '';
  if (noteIdx >= 0) {
    const noteRow = body[noteIdx];
    const colon = noteRow.items.findIndex(i => i.s.includes(':'));
    note = joinItems((colon >= 0 ? noteRow.items.slice(colon + 1) : []).filter(i => i.x < rightCol), sc);
    for (let i = noteIdx + 1; i < body.length; i++) {
      const r = body[i];
      const left = r.items.filter(x => x.x < rightCol && x.x < midMax);
      if (!left.length || left[0].x >= 120 * sc) continue;
      const t = joinItems(left, sc);
      if (!t || LKS(L.checker).some(k => labelKey(t).startsWith(k))) break;
      note += (note ? ' ' : '') + t;
    }
  }

  /* ---- สรุปยอด (label ฝั่งขวา — อาจปนบรรทัดกับข้อความฝั่งซ้าย) — exact match กลุ่ม synonym ---- */
  const pickSum = (labels) => {
    const lks = LKS(labels);
    for (const r of body) {
      const right = r.items.filter(i => i.x >= rightCol);
      if (!right.length) continue;
      const labelPart = right.filter(i => num(i.s) == null);
      if (!lks.includes(labelKey(labelPart.map(i => i.s).join('')))) continue;
      const v = right.filter(i => num(i.s) != null).pop();
      if (v) return num(v.s);
    }
    return null;
  };
  const total = pickSum(L.total);
  const subtotal = pickSum(L.subtotal);
  const discount = pickSum(L.discount) ?? 0;
  const shipping = pickSum(L.shipFee) ?? 0;
  const vat = pickSum(L.vat) ?? 0;
  if (total == null) warnings.push('ยอดรวม');

  return {
    continuation: false, page: pageNo,
    order_no, order_date, customer_name, customer_phone, customer_social,
    customer_address, province, lines,
    subtotal, discount, shipping, vat, total: total ?? 0,
    payment_method, carrier, note, channel_hint, channel_token, warnings,
  };
}

/* ============================================================
   public API
   ============================================================ */
export async function parseReceiptPdf(file) {
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  } catch (e) {
    const nm = e?.name || '';
    if (/password/i.test(nm + (e?.message || ''))) throw new Error('ไฟล์ล็อครหัสผ่าน — ปลดล็อคก่อนอัปโหลด');
    if (/invalid|corrupt/i.test(nm + (e?.message || ''))) throw new Error('ไฟล์ไม่ใช่ PDF ที่ถูกต้อง/ไฟล์เสีย');
    throw e;
  }
  const receipts = [];
  let textItemCount = 0;
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const pageW = page.getViewport({ scale: 1 }).width || BASE_W;
      const sc = pageW / BASE_W;
      const rows = await pageToRows(page, sc);
      textItemCount += rows.reduce((s, r) => s + r.items.length, 0);
      const isReceiptPage = findLabel(rows, L.title) || findLabel(rows, L.docNo);
      if (!isReceiptPage && !receipts.length) continue; // หน้าที่ไม่ใช่ใบเสร็จ (ก่อนเจอใบแรก) → ข้าม
      const parsed = parsePage(rows, p, pageW);
      if (parsed.continuation) {
        const prev = receipts[receipts.length - 1];
        if (prev && parsed.lines.length) prev.lines = [...prev.lines, ...parsed.lines];
        continue;
      }
      receipts.push(parsed);
    }
  } finally {
    try { doc.destroy(); } catch { /* ignore */ }
  }
  // ไฟล์สแกน/รูปภาพ (ไม่มี text layer) → บอกสาเหตุชัด ไม่ใช่ "ไม่พบใบเสร็จ" เฉยๆ
  if (!receipts.length && textItemCount < 5) {
    throw new Error('ไฟล์นี้เป็นสแกน/รูปภาพ (ไม่มีข้อความในไฟล์) — ต้องใช้ PDF ที่เซฟจาก Shipnity โดยตรง');
  }
  // ตรวจความสอดคล้อง sum(lines) vs ยอดบนใบ — ผ่านสูตรใดสูตรหนึ่ง = ok
  for (const r of receipts) {
    if (!r.lines.length) { r.warnings.push('รายการสินค้า'); continue; }
    const sum = r.lines.reduce((s, l) => s + (l.amount || 0), 0);
    const near = (a, b) => Math.abs(a - b) <= 0.01;
    const ok = (r.subtotal != null && near(sum, r.subtotal))
      || near(sum, r.total || 0)
      || near(sum - (r.discount || 0) + (r.shipping || 0) + (r.vat || 0), r.total || 0)
      || (r.subtotal != null && near(r.subtotal - (r.discount || 0) + (r.shipping || 0) + (r.vat || 0), r.total || 0));
    if (!ok) r.warnings.push(`ยอดรายการรวม ${sum.toFixed(2)} ไม่ตรงยอดบนใบ`);
  }
  return receipts;
}

/* อ่านหลายไฟล์ (multi-select) → ใบทั้งหมด + error ต่อไฟล์ · onProgress(done,total) */
export async function parseReceiptFiles(files, onProgress) {
  const out = []; const errors = [];
  let done = 0;
  for (const f of files) {
    try {
      const rs = await parseReceiptPdf(f);
      if (!rs.length) errors.push({ file: f.name, error: 'ไม่พบใบเสร็จในไฟล์ (ไม่เจอหัว "ใบเสร็จรับเงิน"/เลขที่เอกสาร)' });
      rs.forEach(r => out.push({ ...r, fileName: f.name, file: f }));
    } catch (e) {
      errors.push({ file: f.name, error: e?.message || 'อ่านไฟล์ไม่สำเร็จ' });
    }
    done += 1; onProgress?.(done, files.length);
  }
  return { receipts: out, errors };
}

/* derive ประเภทงานจากหมายเหตุ (กติกา: พิมพ์ "DFT" ในหมายเหตุ) */
export const jobTypeFromNote = (note) => (/dft/i.test(String(note || '')) ? 'DFT' : 'ปลีก');
/* การชำระ: cod/ปลายทาง/pay_later หรือขนส่งมี COD → COD · ที่เหลือมีค่า = โอน (ชื่อธนาคาร เช่น scb) */
export const paymentKind = (method, carrier) => (/cod|ปลายทาง|เก็บเงินปลายทาง|pay[_ ]?later/i.test(`${method || ''} ${carrier || ''}`) ? 'COD' : (String(method || '').trim() ? 'โอน' : ''));
