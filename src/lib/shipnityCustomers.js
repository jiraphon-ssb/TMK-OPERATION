/*
  shipnityCustomers.js — แยกโปรไฟล์ลูกค้าจากไฟล์ Shipnity (export rows)
  - 1 ลูกค้า = 1 แถว (เอาแถวล่าสุดของแต่ละ customer_code)
  - แยก CRM tags ที่ทีมเซลล์ติดไว้ → owner (เจ้าของ) / cadence (0D/5D) / repurchase (รอบซื้อซ้ำ)
  ใช้ได้ทั้ง browser (sheet_to_json) และ node test — รับ rows ตรงๆ (array of objects)
*/

// ---- helpers ----
const num = (v) => { const n = Number(String(v ?? '').replace(/[^0-9.-]/g, '')); return isFinite(n) ? n : 0; };
const str = (v) => (v == null ? '' : String(v).trim());
// เบอร์โทร: เก็บเฉพาะที่ครบ (≥9 หลัก) ไม่งั้นถือว่าว่าง (กัน "08" หลอกว่าโทรได้)
const cleanPhone = (v) => { const d = str(v).replace(/[^0-9]/g, ''); return d.length >= 9 ? d : ''; };
// dd/mm/yyyy hh:mm → yyyy-mm-dd
const toISO = (v) => {
  const s = str(v); const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

// เซลล์เจ้าของที่รู้จัก (จาก CRM tags จริง)
export const SALE_OWNERS = ['ฟ้า', 'เจน', 'ส้ม', 'นัท', 'อุ้ม', 'คิง', 'ปาย'];

// แยก 1 ชุด tag string (คั่นด้วย |) → { owner, cadence, repurchase, campaigns[], raw[] }
export function parseTags(tagStr) {
  const raw = str(tagStr).split('|').map(t => t.trim()).filter(Boolean);
  let owner = '', cadence = '', repurchase = 0;
  const campaigns = [];
  for (const t of raw) {
    const low = t.toLowerCase();
    // เจ้าของ
    if (!owner) { const o = SALE_OWNERS.find(o => t.includes(o)); if (o) owner = o; }
    // cadence: 0D / 0DAY / 0 day  → "0D" ; 5D / 5DAY / 5day → "5D"
    if (/(^|[^0-9])0\s*d(ay)?($|[^a-z])/i.test(low) || /0day/i.test(low)) cadence = cadence || '0D';
    if (/(^|[^0-9])5\s*d(ay)?($|[^a-z])/i.test(low) || /5day/i.test(low)) cadence = '5D';
    // repurchase N (เอาเลขมากสุด)
    const rm = low.match(/repurchase\s*(\d+)/i) || low.match(/\bre\s*(\d+)/i);
    if (rm) repurchase = Math.max(repurchase, Number(rm[1]) || 1);
    else if (/(repurchase|[-\s]re$|[-\s]re\b)/i.test(low)) repurchase = Math.max(repurchase, 1);
    // ที่ไม่ใช่ CRM cadence → ถือเป็น campaign/อื่นๆ (เช่น 72 พรรษา, สาดสี)
    if (!/crm|repurchase|^\s*\S*\s*\d\s*d/i.test(low) && !SALE_OWNERS.some(o => t === o)) {
      if (!/^\D*\d\s*d(ay)?\b/i.test(low)) campaigns.push(t);
    }
  }
  return { owner, cadence, repurchase, campaigns: [...new Set(campaigns)], raw };
}

// rows (จาก XLSX.utils.sheet_to_json) → { customers: [...], stats }
export function parseShipnityCustomers(rows, batch = '') {
  const COL = {
    code: 'รหัสลูกค้า (ลูกค้า)',
    name: 'ชื่อ',
    phone: 'เบอร์โทร',
    social: 'ชื่อโซเชียล (ลูกค้า)',
    social2: 'ชื่อในช่องทางติดต่อ',
    address: 'ที่อยู่',
    province: 'ชื่อจังหวัด (จังหวัด)',
    district: 'เขต (จังหวัด)',
    postcode: 'รหัสไปรษณีย์',
    contactCh: 'ช่องทางติดต่อ (ลูกค้า)',
    ltOrders: 'จำนวนออเดอร์สะสม (ลูกค้า)',
    ltSales: 'ยอดสั่งซื้อสะสม (ลูกค้า)',
    ltCancel: 'ยอดยกเลิกสะสม (ลูกค้า)',
    since: 'วันที่สร้าง (ลูกค้า)',
    tags: 'Tags (ลูกค้า)',
    createdAt: 'วันที่สร้าง', // วันที่ออเดอร์ (ไว้เลือกแถวล่าสุด)
  };
  const byCode = new Map();
  let noCode = 0;
  for (const r of rows) {
    const code = str(r[COL.code]);
    if (!code) { noCode++; continue; }
    const orderDate = toISO(r[COL.createdAt]);
    const prev = byCode.get(code);
    // เก็บแถวล่าสุด (ออเดอร์ใหม่สุด) เป็นตัวแทนโปรไฟล์
    if (prev && prev._d >= orderDate) continue;
    const t = parseTags(r[COL.tags]);
    byCode.set(code, {
      _d: orderDate,
      customer_code: code,
      name: str(r[COL.name]),
      phone: cleanPhone(r[COL.phone]),
      social_name: str(r[COL.social]) || str(r[COL.social2]),
      address: str(r[COL.address]).replace(/\s*\n\s*/g, ' '),
      province: str(r[COL.province]),
      district: str(r[COL.district]),
      postcode: str(r[COL.postcode]),
      contact_channel: str(r[COL.contactCh]).toLowerCase(),
      lifetime_orders: num(r[COL.ltOrders]),
      lifetime_sales: num(r[COL.ltSales]),
      lifetime_cancel: num(r[COL.ltCancel]),
      since: toISO(r[COL.since]) || null,
      owner: t.owner,
      cadence: t.cadence,
      repurchase: t.repurchase,
      tags: t.raw,
      note: t.campaigns.join(' · '),
      import_batch: batch,
    });
  }
  const customers = [...byCode.values()].map(({ _d, ...c }) => ({ ...c, last_order: _d || null }));
  const stats = {
    total: customers.length,
    withPhone: customers.filter(c => c.phone && c.phone.length >= 9).length,
    withTags: customers.filter(c => c.tags.length).length,
    withOwner: customers.filter(c => c.owner).length,
    repeat: customers.filter(c => c.lifetime_orders >= 2).length,
    noCode,
  };
  return { customers, stats };
}
