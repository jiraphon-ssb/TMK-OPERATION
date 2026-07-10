#!/usr/bin/env node
/* ============================================================
   test-receipts.mjs — regression test ของ parser ใบเสร็จ (dev only · ไม่เข้า bundle)
   ============================================================
   ใช้:  node scripts/test-receipts.mjs [โฟลเดอร์ PDF]
   default โฟลเดอร์: ~/Downloads/เทส pdf
   - รัน parseReceiptPdf กับทุก .pdf ในโฟลเดอร์ → พิมพ์ผลต่อใบ
   - exit 1 ถ้ามีใบที่: อ่านไม่ได้ (error) หรือยอดรายการไม่ตรงยอดบนใบ
   - warning จังหวัด/ช่องทาง = ยอมรับได้ (ใบขายหน้าร้านไม่มีที่อยู่จริง)
   แตะ src/lib/receiptParse.js ทีไร ให้รันไฟล์นี้ก่อน commit เสมอ
   ============================================================ */
import { readFileSync, readdirSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { parseReceiptPdf, jobTypeFromNote, paymentKind } = await import(path.join(__dirname, '../src/lib/receiptParse.js'));

// ค่าคาดหวังต่อ fixture (ground truth) — ตรวจ "ค่าจริงทุกฟิลด์" ไม่ใช่แค่ยอด (แก้ตอนเพิ่ม fixture ใหม่)
let EXPECT = {};
try { EXPECT = JSON.parse(readFileSync(path.join(__dirname, 'receipt-expected.json'), 'utf8')); } catch { /* ไม่มีไฟล์ = ข้ามการตรวจฟิลด์ */ }
// เทียบ 1 ใบ กับค่าคาดหวัง → คืน array ข้อความ mismatch (ว่าง = ผ่าน)
function diffExpected(r, exp) {
  const out = [];
  const eq = (k, got, want) => { if (want !== undefined && String(got ?? '') !== String(want)) out.push(`${k}: ได้ ${JSON.stringify(got)} ≠ คาด ${JSON.stringify(want)}`); };
  eq('order_no', r.order_no, exp.order_no);
  eq('order_date', r.order_date, exp.order_date);
  eq('customer_name', r.customer_name, exp.customer_name);
  eq('customer_social', r.customer_social, exp.customer_social);
  eq('province', r.province, exp.province);
  eq('channel', r.channel_hint, exp.channel);
  eq('payment', paymentKind(r.payment_method, r.carrier), exp.payment);
  eq('total', r.total, exp.total);
  eq('lines', r.lines.length, exp.lines);
  eq('phone', r.customer_phone, exp.customer_phone);
  // ฟิลด์เสริม (ครบทุกอย่างบนใบ) — ตรวจเมื่อ expected ระบุ
  eq('order_time', r.order_time, exp.order_time);
  eq('promo_code', r.promo_code, exp.promo_code);
  eq('vat', r.vat, exp.vat);
  eq('customer_tax_id', r.customer_tax_id, exp.customer_tax_id);
  eq('note', r.note, exp.note);
  eq('carrier', r.carrier, exp.carrier);
  eq('address', r.customer_address, exp.customer_address);
  if (exp.l0) { const l0 = r.lines[0] || {}; eq('l0.code', l0.code, exp.l0.code); eq('l0.qty', l0.qty, exp.l0.qty); eq('l0.amount', l0.amount, exp.l0.amount); }
  // ตรวจ "ทุกบรรทัด" (จับอ่านข้ามรายการ/qty-amount ผิด) — opt-in ผ่าน lines_detail:[{code?,qty,amount}]
  if (Array.isArray(exp.lines_detail)) {
    eq('lines_detail.len', r.lines.length, exp.lines_detail.length);
    exp.lines_detail.forEach((el, i) => {
      const gl = r.lines[i] || {};
      if (el.code !== undefined) eq(`l${i}.code`, gl.code, el.code);
      eq(`l${i}.qty`, gl.qty, el.qty);
      eq(`l${i}.amount`, gl.amount, el.amount);
    });
  }
  // ธง: ต้อง"ติดธง" ให้ถูก (ชื่อวรรณยุกต์หาย / ลูกค้าปกปิด) — ยืนยันว่า parser เตือนถูก
  const lossy = r.warnings.some(w => w.includes('วรรณยุกต์'));
  if (exp.nameLossy && !lossy) out.push('nameLossy: คาดว่าต้องติดธง "ชื่อวรรณยุกต์หาย" แต่ไม่ติด');
  if (!exp.nameLossy && lossy) out.push('nameLossy: ติดธงชื่อหายเกินคาด (ไม่ควรติด)');
  if (exp.masked && !r.customer_masked) out.push('masked: คาดว่าต้องติดธง "ลูกค้าปกปิด" แต่ไม่ติด');
  return out;
}

const dir = process.argv[2] || path.join(homedir(), 'Downloads', 'เทส pdf');
let files;
try { files = readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf')).sort(); }
catch { console.error(`เปิดโฟลเดอร์ไม่ได้: ${dir}`); process.exit(2); }
if (!files.length) { console.error(`ไม่มีไฟล์ .pdf ใน ${dir}`); process.exit(2); }

let receipts = 0, hardFail = 0, sumFail = 0, softWarn = 0, fieldFail = 0, checked = 0;
for (const fn of files) {
  const buf = readFileSync(path.join(dir, fn));
  const shim = { name: fn, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  try {
    const rs = await parseReceiptPdf(shim);
    if (!rs.length) { console.log(`❌ ${fn}: ไม่พบใบเสร็จ`); hardFail += 1; continue; }
    // ไฟล์หลายใบ (bulk/หลายหน้า) — ตรวจ "แยกใบถูก" (จำนวน + เลขที่เอกสารครบ)
    if (EXPECT[fn]?._multi) {
      checked += 1;
      const got = rs.map(r => r.order_no);
      const problems = [];
      if (rs.length !== EXPECT[fn]._multi) problems.push(`จำนวนใบ: ได้ ${rs.length} ≠ คาด ${EXPECT[fn]._multi}`);
      if (EXPECT[fn].order_nos && JSON.stringify(got) !== JSON.stringify(EXPECT[fn].order_nos)) problems.push(`เลขที่: ได้ [${got}] ≠ คาด [${EXPECT[fn].order_nos}]`);
      console.log(`${problems.length ? '✗' : '📄'} ${fn} · ${rs.length} ใบ · ${got.join(', ')}`);
      if (problems.length) { fieldFail += 1; problems.forEach(m => console.log(`   ✗ ${m}`)); }
    }
    for (const r of rs) {
      receipts += 1;
      const sum = r.lines.reduce((s, l) => s + (l.amount || 0), 0);
      const sumBad = r.warnings.some(w => w.includes('ไม่ตรงยอด'));
      const hard = !r.order_no || !r.order_date || !r.lines.length || sumBad;
      const icon = hard ? '❌' : (r.warnings.length ? '⚠️' : '✅');
      if (hard) { sumBad ? (sumFail += 1) : (hardFail += 1); } else if (r.warnings.length) softWarn += 1;
      console.log(`${icon} ${fn} · ${r.order_no} · ${r.order_date} · ${r.customer_name} · จว=${r.province || '-'} · ch=${r.channel_hint || '-'} · pay=${paymentKind(r.payment_method, r.carrier) || '-'} · job=${jobTypeFromNote(r.note)} · ${r.lines.length} รายการ · sum=${sum} total=${r.total}${r.warnings.length ? ` · ⚠ ${r.warnings.join(' | ')}` : ''}`);
      // ตรวจค่าจริงทุกฟิลด์เทียบ ground truth (เฉพาะใบเดี่ยว ที่มีค่าคาดหวัง)
      if (rs.length === 1 && EXPECT[fn]) {
        checked += 1;
        const miss = diffExpected(r, EXPECT[fn]);
        if (miss.length) { fieldFail += 1; miss.forEach(m => console.log(`   ✗ ${m}`)); }
      }
    }
  } catch (e) {
    console.log(`💥 ${fn}: ${e.message}`);
    hardFail += 1;
  }
}
console.log(`\nสรุป: ${receipts} ใบ · พังจริง ${hardFail} · ยอดไม่ตรง ${sumFail} · เตือนเบา ${softWarn} · ตรวจฟิลด์ ${checked} ใบ · ฟิลด์ไม่ตรง ${fieldFail}`);
process.exit(hardFail + sumFail + fieldFail > 0 ? 1 : 0);
