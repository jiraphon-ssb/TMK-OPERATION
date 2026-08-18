/* ============================================================
   saleFormulas.js — สูตร canonical "แหล่งเดียว" ที่ FE (เว็บ) กับ edge (LINE) ใช้ร่วมกัน (P2-4)
   ============================================================
   เดิม daily-sale-report (Deno) ก๊อปโลจิกจาก FE 5 ก้อน → เสี่ยง drift (ตัวเลขเว็บ ≠ ที่ส่ง LINE)
   รวมมาที่เดียว · คัดลอกลอจิกจาก FE ตรงเป๊ะ (FE = ความจริง):
     - resolveJobType                     ← src/lib/saleData.js
     - ORDER_OV_KEY / mergeOrderOverrides ← src/lib/saleOverrides.js
     - MARKETPLACE_CHANNELS / isLeadChannel ← src/lib/saleFields.js
     - isMasked / crmCustomerKey          ← src/lib/crmAgg.js
     - blankNoteData / normNoteData       ← src/lib/crmDailyNote.js
   plain ESM ล้วน (ไม่มี TS syntax / Deno API) → import ได้ทั้งเว็บ (Vite/vitest) และ edge (Deno)
   ทั้งฝั่ง FE (re-export จากไฟล์เดิม) และ edge ต่างชี้มาที่ไฟล์นี้ → แก้ที่เดียว มีผลทั้งสองฝั่ง
   ============================================================ */

// ---- ประเภทงาน DFT (จาก saleData.js — หมายเหตุเป็นเจ้าของ) ----
// คำ "DFT" ในหมายเหตุ (word-boundary — ตรงกับ isDftNote/jobTypeFromNote ทั้งระบบ)
const DFT_RE = /\bdft\b/i;
// resolve ประเภทงานตอน "อ่าน" — หมายเหตุเป็นเจ้าของ DFT (single source of truth):
//  (1) ยุบ "ส่ง"→"ปลีก"
//  (2) หมายเหตุมี "DFT" → DFT (promote · ครอบใบเก่า/parser จับ note ไม่ติด)
//  (3) หมายเหตุไม่มี "DFT" แต่ค่าเก็บเป็น DFT → กลับเป็น ปลีก (demote)
//  OEM ไม่แตะ · ใช้ทั้งตอน raw และ "หลัง merge override"
export function resolveJobType(jobType, note) {
  const jt = jobType === 'ส่ง' ? 'ปลีก' : (jobType || 'ปลีก');
  const hasDft = DFT_RE.test(String(note || ''));
  if (jt === 'ปลีก' && hasDft) return 'DFT';
  if (jt === 'DFT' && !hasDft) return 'ปลีก';
  return jt;
}

// ---- override ระดับออเดอร์ (จาก saleOverrides.js) ----
// key override ระดับออเดอร์ — source + order_no (เสถียรข้าม reimport)
export const ORDER_OV_KEY = (o) => `${o.source || ''}:${o.order_no}`;

// override ชนะเมื่อมีค่าจริง (คอลัมน์ใหม่ · เก่าไม่มี = undefined/'' → ใช้ค่าไฟล์)
const _num = (a, b) => (a != null && a !== '' ? Number(a) : b);
const _str = (a, b) => (a != null && a !== '' ? a : b);

/* merge override ระดับออเดอร์ทับค่า frozen (job_type/ลูกค้า/เซลล์/ช่อง/ยอด/จำนวน/จังหวัด/วันที่/COD)
   note → re-derive job_type (DFT จากหมายเหตุ) · แนบ _ov ไว้อ้างต้นฉบับ */
export function mergeOrderOverrides(orders, ovMap) {
  if (!orders) return orders;
  if (!ovMap || !Object.keys(ovMap).length) return orders;
  return orders.map(o => {
    const ov = ovMap[ORDER_OV_KEY(o)]; if (!ov) return o;
    const note = ov.note != null && ov.note !== '' ? ov.note : o.note;
    return {
      ...o,
      job_type: resolveJobType(ov.job_type || o.job_type, note),
      customer_name: ov.customer_name || o.customer_name,
      customer_type: ov.customer_type || o.customer_type,
      salesperson: ov.salesperson || o.salesperson,
      channel: _str(ov.channel, o.channel),
      payment_type: _str(ov.payment_type, o.payment_type),
      sales: _num(ov.sales, o.sales),
      qty: _num(ov.qty, o.qty),
      province: _str(ov.province, o.province),
      order_date: _str(ov.order_date, o.order_date),
      cod_amount: _num(ov.cod_amount, o.cod_amount),
      customer_phone: _str(ov.customer_phone, o.customer_phone),
      customer_social: _str(ov.customer_social, o.customer_social),
      note,
      _ov: ov,
    };
  });
}

// ---- ช่องมาร์เก็ตเพลส / %ปิด (จาก saleFields.js) ----
// ช่องมาร์เก็ตเพลส/หน้าร้าน — ไม่มี "คนทัก" (ลูกค้าสั่งเองในแพลตฟอร์ม) → ไม่นับเข้าตัวตั้ง %ปิดการขาย
// ที่เหลือ (FB/LINE/IG/TikTok/โทร/Direct) = ช่องแชท ที่มีการทักก่อนปิดการขาย
export const MARKETPLACE_CHANNELS = ['Shopee', 'Lazada', 'POS'];
export const isLeadChannel = (ch) => !!ch && !MARKETPLACE_CHANNELS.includes(ch);

// ---- "ออเดอร์ช่องแชท" (ตัวตั้งของ %ปิดการขาย) — เช็คทั้ง channel และ source ----
// ⚠️ เช็ค channel อย่างเดียวไม่พอ: ออเดอร์ TikTok Shop ที่ import จากไฟล์มาร์เก็ตเพลส
//    ได้ channel='TikTok' (source='tiktok' · salesperson='(TikTok)') → isLeadChannel คืน true
//    ทั้งที่ลูกค้าสั่งเองในแพลตฟอร์ม ไม่มีการทัก → %ปิดรวมของทีมสูงเกินจริง
//    ส่วน TikTok "แชท" ของจริง (เซลล์ปิดใน DM แล้วส่งใบเสร็จ Shipnity) ได้ source='shipnity' → นับปกติ
//    ∴ ออเดอร์แชท = ช่องทางแชท และ มาจากใบเสร็จ Shipnity เท่านั้น (import mp: 'tiktok'/'shopee' ไม่นับ)
export const isChatOrder = (o) => !!o && isLeadChannel(o.channel) && String(o.source || '') === 'shipnity';

// ---- CRM customer key (จาก crmAgg.js) ----
// ลูกค้าปกปิด (Shopee mask "ณ******์") → '' ไม่คลัสเตอร์ · code ว่าง → จับด้วยชื่อ ('N'+ชื่อ)
export const isMasked = (v) => /\*{2,}/.test(String(v || ''));
export function crmCustomerKey(o) {
  if (isMasked(o.customer_name) || isMasked(o.customer_code)) return '';
  const c = String(o.customer_code || '').trim();
  if (c) return c;
  const n = String(o.customer_name || '').trim();
  return n ? 'N' + n.slice(0, 60) : '';
}

// ---- บันทึกประจำวัน CRM (จาก crmDailyNote.js) ----
const _n = (v) => Number(v) || 0;

/** โครงข้อมูลเปล่า — 3 กลุ่มโทร + อัพเซลล์ + แถม/วันเกิด + เสียงลูกค้า */
export function blankNoteData() {
  return {
    calls: {
      d0: { total: 0, answered: 0 },   // 0DAY (โทรวันปิดการขาย)
      d5: { total: 0, answered: 0 },   // 5DAY (ตามหลังปิด 5 วัน)
      rep: { total: 0, answered: 0 },  // Repurchase (ชวนซื้อซ้ำ)
    },
    upsellOrders: 0, upsellBaht: 0,
    freebieOrders: 0,   // ออเดอร์แถม
    birthdayOrders: 0,  // โปรวันเกิด
    ask: '', praise: '', complaint: '',  // ถาม / ชม / ติ
    extra: '',          // หมายเหตุเพิ่มเติม
  };
}

/** เติมช่องที่ขาดให้ครบโครง (data เก่า/บางส่วน → ไม่พัง) */
export function normNoteData(d) {
  const b = blankNoteData();
  if (!d || typeof d !== 'object') return b;
  const c = d.calls || {};
  return {
    calls: {
      d0: { total: _n(c.d0?.total), answered: _n(c.d0?.answered) },
      d5: { total: _n(c.d5?.total), answered: _n(c.d5?.answered) },
      rep: { total: _n(c.rep?.total), answered: _n(c.rep?.answered) },
    },
    upsellOrders: _n(d.upsellOrders), upsellBaht: _n(d.upsellBaht),
    freebieOrders: _n(d.freebieOrders), birthdayOrders: _n(d.birthdayOrders),
    ask: String(d.ask || ''), praise: String(d.praise || ''), complaint: String(d.complaint || ''),
    extra: String(d.extra || ''),
  };
}
