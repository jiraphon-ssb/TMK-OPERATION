/* ============================================================
   receiptValidate.js — re-validate สถานะแถวใบเสร็จ (หน้า "ส่งยอด") หลังผู้ใช้แก้/เติมข้อมูล
   ============================================================
   บั๊กเดิม: onFiles คำนวณ problems/hard ครั้งเดียวจาก parser warnings แล้ว freeze →
     แก้รหัส/ช่องทาง/จังหวัดแล้ว chip เตือนค้าง ไม่ขึ้น "พร้อม"
   fix: pure fn คำนวณ status สดจาก "ค่าปัจจุบันของแถว" — เรียกทั้งตอน parse และหลังทุกการแก้
   - structural (recompute สดจาก field): order_no/ชื่อ/จังหวัด/ยอด/รายการ/ไม่มีรหัส/ยอดรายการไม่ตรง/ช่องทาง
   - soft parser-warning ที่ recompute ไม่ได้ (ชื่อเพี้ยน/วันที่/ปกปิด): carry จาก parsedRaw แต่ drop เมื่อแก้ field นั้นแล้ว
   - dup: ซ้ำในชุด (allRows) · ส่งแล้ว/import ซ้ำ (dupReceipts/dupOrders)
   pure → unit-test ได้
   ============================================================ */

const near = (a, b) => Math.abs(a - b) <= 0.01;

// soft parser-warning ที่ recompute จาก field ไม่ได้ → carry ต่อ แต่ทิ้งเมื่อแก้ field ที่เกี่ยว
const SOFT_CARRY = [
  { re: /วรรณยุกต์|สระหาย|ฟอนต์/, field: 'customer_name' }, // "ชื่ออาจเพี้ยน" → ทิ้งเมื่อแก้ชื่อ
  { re: /ไม่มีวันที่|วันที่เป็นอนาคต|วันที่เก่า/, field: 'order_date' }, // วันที่ผิดปกติ → ทิ้งเมื่อแก้วันที่
  { re: /ปกปิด|มาร์เก็ตเพลส/, field: null },                 // ลูกค้าปกปิด → คงไว้ (ข้อจำกัดข้อมูล ไม่ใช่สิ่งที่แก้ได้)
];

/**
 * คำนวณ { problems, hard } ของแถวใบเสร็จจากค่าปัจจุบัน
 * @param {object} row  แถว review (มี parsedRaw = ค่าตอน parse · lines · channel · total ฯลฯ)
 * @param {{allRows?:Array, dupReceipts?:Map, dupOrders?:Set}} ctx
 * @returns {{problems:string[], hard:boolean}}
 */
export function deriveReceiptRowStatus(row, ctx = {}) {
  const { allRows = [], dupReceipts = new Map(), dupOrders = new Set() } = ctx;
  const raw = row.parsedRaw || {};
  const problems = [];
  let hard = false;

  // ── เลขที่เอกสาร + ซ้ำ ──
  if (!String(row.order_no || '').trim()) {
    problems.push('เลขที่เอกสาร'); hard = true;
  } else {
    const dupInBatch = allRows.some(o => o && o._id !== row._id && o.order_no === row.order_no);
    if (dupInBatch) { problems.push('เลขซ้ำในชุดนี้'); hard = true; }
    const dup = dupReceipts.get(row.order_no);
    if (dup && dup.status === 'confirmed') { problems.push(`ส่งแล้วโดย ${dup.salesperson || dup.uploader_email || ''}`); hard = true; }
    else if (!dup && dupOrders.has(row.order_no)) { problems.push('มีอยู่แล้วจากไฟล์ import — ติ๊กเพื่อบันทึกทับ'); }
  }

  // ── field structural (recompute สด) ──
  if (!String(row.customer_name || '').trim()) problems.push('ชื่อลูกค้า');
  if (!String(row.province || '').trim()) problems.push('จังหวัด');
  if (row.total == null) problems.push('ยอดรวม');

  const lines = row.lines || [];
  if (!lines.length) problems.push('รายการสินค้า');
  else {
    if (lines.some(l => (l.amount || 0) > 0 && !String(l.code || '').trim())) problems.push('บางรายการไม่มีรหัสสินค้า — ตรวจการจับคู่ลาย');
    const sum = lines.reduce((s, l) => s + (l.amount || 0), 0);
    const ok = (row.subtotal != null && near(sum, row.subtotal))
      || near(sum, row.total || 0)
      || near(sum - (row.discount || 0) + (row.shipping || 0) + (row.vat || 0), row.total || 0)
      || (row.subtotal != null && near(row.subtotal - (row.discount || 0) + (row.shipping || 0) + (row.vat || 0), row.total || 0));
    if (!ok && row.total != null) problems.push(`ยอดรายการรวม ${sum.toFixed(2)} ไม่ตรงยอดบนใบ`);
  }

  // ── ช่องทาง (carry เตือน "ยังไม่รู้จัก" แต่ทิ้งเมื่อเลือกช่องทางแล้ว) ──
  if (!String(row.channel || '').trim()) {
    const chWarn = (raw.warnings || []).find(w => /ช่องทาง/.test(w));
    if (chWarn) problems.push(chWarn);
  }

  // ── soft parser-warnings ──
  for (const w of (raw.warnings || [])) {
    for (const s of SOFT_CARRY) {
      if (!s.re.test(w)) continue;
      const edited = s.field && String(row[s.field] || '') !== String(raw[s.field] || '');
      if (!edited && !problems.includes(w)) problems.push(w);
    }
  }

  return { problems, hard };
}
