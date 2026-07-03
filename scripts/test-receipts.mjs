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

const dir = process.argv[2] || path.join(homedir(), 'Downloads', 'เทส pdf');
let files;
try { files = readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf')).sort(); }
catch { console.error(`เปิดโฟลเดอร์ไม่ได้: ${dir}`); process.exit(2); }
if (!files.length) { console.error(`ไม่มีไฟล์ .pdf ใน ${dir}`); process.exit(2); }

let receipts = 0, hardFail = 0, sumFail = 0, softWarn = 0;
for (const fn of files) {
  const buf = readFileSync(path.join(dir, fn));
  const shim = { name: fn, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  try {
    const rs = await parseReceiptPdf(shim);
    if (!rs.length) { console.log(`❌ ${fn}: ไม่พบใบเสร็จ`); hardFail += 1; continue; }
    for (const r of rs) {
      receipts += 1;
      const sum = r.lines.reduce((s, l) => s + (l.amount || 0), 0);
      const sumBad = r.warnings.some(w => w.includes('ไม่ตรงยอด'));
      const hard = !r.order_no || !r.order_date || !r.lines.length || sumBad;
      const icon = hard ? '❌' : (r.warnings.length ? '⚠️' : '✅');
      if (hard) { sumBad ? (sumFail += 1) : (hardFail += 1); } else if (r.warnings.length) softWarn += 1;
      console.log(`${icon} ${fn} · ${r.order_no} · ${r.order_date} · ${r.customer_name} · จว=${r.province || '-'} · ch=${r.channel_hint || '-'} · pay=${paymentKind(r.payment_method, r.carrier) || '-'} · job=${jobTypeFromNote(r.note)} · ${r.lines.length} รายการ · sum=${sum} total=${r.total}${r.warnings.length ? ` · ⚠ ${r.warnings.join(' | ')}` : ''}`);
    }
  } catch (e) {
    console.log(`💥 ${fn}: ${e.message}`);
    hardFail += 1;
  }
}
console.log(`\nสรุป: ${receipts} ใบ · พังจริง ${hardFail} · ยอดไม่ตรง ${sumFail} · เตือนเบา ${softWarn}`);
process.exit(hardFail + sumFail > 0 ? 1 : 0);
