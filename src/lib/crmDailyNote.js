/* ============================================================
   crmDailyNote.js — บันทึกประจำวัน CRM แบบมีช่อง (PART 91) · ฟังก์ชันบริสุทธิ์
   ============================================================
   - data = สิ่งที่เซลล์กรอก (ระบบไม่รู้): จำนวนสาย 0DAY/5DAY/Repurchase, อัพเซลล์,
     ออเดอร์แถม, โปรวันเกิด, เสียงลูกค้า ถาม/ชม/ติ
   - auto = สิ่งที่ระบบคิดสดจากออเดอร์จริง (ยอด/ออเดอร์/ลูกค้าเก่า-ใหม่/ปิด Repurchase)
   - buildCrmDailyReport() = ประกอบข้อความรายงานส่ง LINE (format กลางทั้งทีม)
   ============================================================ */

// blankNoteData + normNoteData = สูตร canonical ร่วมกับ edge (daily-sale-report)
//   → นิยามอยู่ที่ _shared/saleFormulas.js (แหล่งเดียว กัน drift) แล้ว re-export ต่อ (P2-4)
import { blankNoteData, normNoteData } from '../../supabase/functions/_shared/saleFormulas.js';
export { blankNoteData, normNoteData };

const n = (v) => Number(v) || 0;
const baht = (v) => n(v).toLocaleString('th-TH', { maximumFractionDigits: 2 });

/** true ถ้ายังไม่กรอกอะไรเลย (ทุกช่องว่าง/ศูนย์) — ใช้ตัดสินใจลบแถวเมื่อเคลียร์ */
export function isNoteDataEmpty(d) {
  const x = normNoteData(d);
  const c = x.calls;
  const zeros = [c.d0.total, c.d0.answered, c.d5.total, c.d5.answered, c.rep.total, c.rep.answered,
    x.upsellOrders, x.upsellBaht, x.freebieOrders, x.birthdayOrders].every(v => v === 0);
  const texts = !x.ask.trim() && !x.praise.trim() && !x.complaint.trim() && !x.extra.trim();
  return zeros && texts;
}

const missed = (g) => Math.max(0, n(g.total) - n(g.answered));

/** จำนวนสายรวมทั้ง 3 กลุ่ม */
export function totalCalls(d) {
  const c = normNoteData(d).calls;
  return n(c.d0.total) + n(c.d5.total) + n(c.rep.total);
}

/** วันที่แบบไทยย่อ "3/8/69" (D/M/ปีพ.ศ. 2 หลัก) จาก 'YYYY-MM-DD' (ค.ศ.) */
export function crmDateThai(dateISO) {
  const [y, m, dd] = String(dateISO || '').split('-');
  if (!y) return String(dateISO || '');
  const be = (Number(y) + 543) % 100;
  return `${Number(dd)}/${Number(m)}/${String(be).padStart(2, '0')}`;
}

/** สรุปข้อความสั้น 1 บรรทัด → เก็บลงคอลัมน์ note (ตารางรวมทุกคน/reader เก่าอ่านได้) */
export function noteSummaryText(d) {
  const x = normNoteData(d);
  const parts = [];
  const tc = totalCalls(x);
  if (tc > 0) parts.push(`โทร ${tc} สาย`);
  if (x.upsellOrders || x.upsellBaht) parts.push(`อัพเซลล์ ${x.upsellOrders} ออเดอร์ ฿${baht(x.upsellBaht)}`);
  if (x.freebieOrders) parts.push(`แถม ${x.freebieOrders}`);
  if (x.birthdayOrders) parts.push(`วันเกิด ${x.birthdayOrders}`);
  if (x.ask.trim()) parts.push(`ถาม: ${x.ask.trim()}`);
  if (x.praise.trim()) parts.push(`ชม: ${x.praise.trim()}`);
  if (x.complaint.trim()) parts.push(`ติ: ${x.complaint.trim()}`);
  if (x.extra.trim()) parts.push(x.extra.trim());
  return parts.join(' · ');
}

/** ประกอบรายงานส่ง LINE (format กลางฉบับเต็ม — รวมโครงจันทกานต์ + FAH ครบทุกส่วน)
 *  auto = { crmSales, line, phone, orders, qty, buyers, oldCust, newCust, repurchaseOrders, repurchaseBaht } (ระบบคิดสด) */
export function buildCrmDailyReport({ seller, dateISO, auto = {}, data }) {
  const x = normNoteData(data);
  const c = x.calls;
  const ansTotal = n(c.d0.answered) + n(c.d5.answered) + n(c.rep.answered);
  const missTotal = missed(c.d0) + missed(c.d5) + missed(c.rep);
  const voice = (v) => (String(v || '').trim() || '-');
  const L = [];
  L.push(`${seller || ''} CRM : ${crmDateThai(dateISO)}`);
  L.push('');
  L.push('📞 0DAY');
  L.push(`โทรทั้งหมด = ${n(c.d0.total)} สาย`);
  L.push(`รับสาย = ${n(c.d0.answered)} สาย`);
  L.push(`ไม่รับสาย = ${missed(c.d0)} สาย`);
  L.push(`✅ อัพเซลล์ได้ = ${n(x.upsellOrders)} ออเดอร์`);
  L.push(`ยอดขายอัพเซลล์ ✅ = ${baht(x.upsellBaht)} บาท`);
  L.push('—————————');
  L.push('📞 5DAY');
  L.push(`โทรทั้งหมด = ${n(c.d5.total)} สาย`);
  L.push(`รับสาย = ${n(c.d5.answered)} สาย`);
  L.push(`ไม่รับสาย = ${missed(c.d5)} สาย`);
  L.push('—————————');
  L.push('📞 Repurchase');
  L.push(`โทรทั้งหมด = ${n(c.rep.total)} สาย`);
  L.push(`รับสาย = ${n(c.rep.answered)} สาย`);
  L.push(`ไม่รับสาย = ${missed(c.rep)} สาย`);
  L.push('');
  L.push('ปิดการขาย Repurchase');
  L.push(`✅ = ${n(auto.repurchaseOrders)} ออเดอร์ ฿${baht(auto.repurchaseBaht)} บาท`);
  // เสียงลูกค้า — แสดงเสมอ (ครบแบบ FAH · ว่าง = "-")
  L.push('—————————');
  L.push('💬 เสียงลูกค้า');
  L.push(`ลูกค้าถามหา: ${voice(x.ask)}`);
  L.push(`ลูกค้าชม: ${voice(x.praise)}`);
  L.push(`ลูกค้าติ: ${voice(x.complaint)}`);
  if (x.extra.trim()) L.push(`หมายเหตุ: ${x.extra.trim()}`);
  // ออเดอร์แถม / โปรวันเกิด — แสดงเสมอ
  L.push('—————————');
  L.push(`🎁 ออเดอร์แถม = ${n(x.freebieOrders)} ออเดอร์`);
  L.push(`🎂 โปรวันเกิด = ${n(x.birthdayOrders)} ออเดอร์`);
  L.push('_____________________');
  L.push(`☎️ รวมจำนวนสาย = ${totalCalls(x)} สาย (รับ ${ansTotal} / ไม่รับ ${missTotal})`);
  L.push(`✅ จำนวนออเดอร์ = ${n(auto.orders)} ออเดอร์ (${n(auto.qty)} ตัว)`);
  L.push(`👥 ลูกค้าที่ซื้อ = ${n(auto.buyers)} คน`);
  L.push(`💖 ลูกค้าเก่า = ${n(auto.oldCust)} คน`);
  L.push(`🤍 ลูกค้าใหม่ = ${n(auto.newCust)} คน`);
  L.push('');
  L.push('💰 ยอดขาย CRM');
  L.push(`LINE = ฿${baht(auto.line)} · โทร = ฿${baht(auto.phone)}`);
  L.push(`ยอดรวมทั้งหมด = ฿${baht(auto.crmSales)} บาท`);
  return L.join('\n');
}
