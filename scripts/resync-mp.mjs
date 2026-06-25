#!/usr/bin/env node
/* แก้เฉพาะ "ลาย↔สี สลับ" ของ TikTok+Shopee แบบผ่าตัด (surgical):
   - ไม่แตะ tmk_mp_orders และไม่แตะ sku ของ shipnity เลย
   - อ่าน order_month/order_date เดิมจาก DB มาคงไว้ (แก้แค่ design/color/size/code)
   - ลบ sku เฉพาะ source in (tiktok,shopee) แล้ว insert ใหม่ที่ pipeline แก้แล้ว
   ค่าเริ่มต้น = DRY RUN. เขียนจริงใส่ --write */
import XLSX from 'xlsx';
import fs from 'fs';
import { buildSku } from '../src/lib/mpReport.js';
import { createClient } from '@supabase/supabase-js';

const WRITE = process.argv.includes('--write');
const D = '/Users/artist/Downloads/juntakarn_sales_report/input/';
const gridOf = (p) => { const wb = XLSX.readFile(p); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }); };
// .csv ต้องอ่านเป็น UTF-8 string ก่อน (readFile ทำ Thai เพี้ยน → catalog match ไม่ติด รหัสหาย)
const csvOf = (p) => { const wb = XLSX.read(fs.readFileSync(p, 'utf8'), { type: 'string' }); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }); };

let tiktok = gridOf(D + 'tiktok.xlsx');
if (tiktok.length > 2) tiktok = [tiktok[0], ...tiktok.slice(2)];
const shopee = gridOf(D + 'shopee.xlsx');
const catalog = csvOf(D + 'catalog.csv');

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(Boolean).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
// โหลด alias ชื่อพ้อง/สีใหม่ มาใช้กับ pipeline (มีผลกับการจับคู่)
const { data: aliasRows } = await sb.from('tmk_mp_aliases').select('kind,term,code,design');
const aliases = aliasRows || [];

// pipeline เฉพาะ tiktok+shopee (ไม่มี shipnity → shipnity branch ไม่ทำงาน)
const sku = buildSku({ shopee, tiktok }, catalog, { aliases }).filter(s => s.source === 'tiktok' || s.source === 'shopee');

// อ่านของเดิมใน DB (เก็บ order_month/order_date + นับ swap เดิม)
async function fetchAll(table, select, src) {
  const out = []; let from = 0; const size = 1000;
  for (;;) { const { data, error } = await sb.from(table).select(select).eq('source', src).range(from, from + size - 1); if (error) throw error; out.push(...data); if (data.length < size) break; from += size; }
  return out;
}
const COLORS = new Set(['ดำ','ขาว','กรม','กรมท่า','น้ำเงิน','ฟ้า','ชมพู','แดง','เหลือง','เขียว','ม่วง','ส้ม','เทา','น้ำตาล','ครีม','โอรส']);
const looksColor = (s) => { const t = String(s||'').replace(/^สี/,''); return COLORS.has(t) || (t.includes('-') && t.split(/[-/]/).every(x=>COLORS.has(x.replace(/^สี/,'')))); };

const oldTk = await fetchAll('tmk_mp_skus', 'order_no,design,color,order_month,order_date', 'tiktok');
const oldSp = await fetchAll('tmk_mp_skus', 'order_no,design,color,order_month,order_date', 'shopee');
const monthMap = {}, dateMap = {};
[...oldTk, ...oldSp].forEach(r => { const k = r.order_no; if (r.order_month && !monthMap[k]) monthMap[k] = r.order_month; if (r.order_date && !dateMap[k]) dateMap[k] = r.order_date; });
const overallTk = (() => { const m = oldTk.map(r=>r.order_month).filter(Boolean); return m.sort((a,b)=>m.filter(x=>x===b).length-m.filter(x=>x===a).length)[0]||''; })();
const overallSp = (() => { const m = oldSp.map(r=>r.order_month).filter(Boolean); return m.sort((a,b)=>m.filter(x=>x===b).length-m.filter(x=>x===a).length)[0]||''; })();

console.log('=== ของเดิมใน DB ===');
console.log(`  tiktok rows=${oldTk.length}  swap(design=สี)=${oldTk.filter(r=>r.design&&looksColor(r.design)).length}`);
console.log(`  shopee rows=${oldSp.length}  swap(design=สี)=${oldSp.filter(r=>r.design&&looksColor(r.design)).length}`);
console.log('=== ของใหม่ (pipeline แก้แล้ว) ===');
console.log(`  tiktok rows=${sku.filter(s=>s.source==='tiktok').length}  swap=${sku.filter(s=>s.source==='tiktok'&&s.design&&looksColor(s.design)).length}  matched=${sku.filter(s=>s.source==='tiktok'&&s.design).length}`);
console.log(`  shopee rows=${sku.filter(s=>s.source==='shopee').length}  swap=${sku.filter(s=>s.source==='shopee'&&s.design&&looksColor(s.design)).length}  matched=${sku.filter(s=>s.source==='shopee'&&s.design).length}`);

if (!WRITE) { console.log('\n*** DRY RUN — ไม่เขียน. รัน --write เพื่อบันทึก (แก้เฉพาะ tiktok+shopee sku) ***'); process.exit(0); }

const chunk = (arr, n) => { const o=[]; for (let i=0;i<arr.length;i+=n) o.push(arr.slice(i,i+n)); return o; };
const batch = 'fixswap-' + Date.now().toString(36);
const sRows = sku.map((s, i) => ({ id: `${s.source}:${s.order_no}:${i}`, ...s, order_month: monthMap[s.order_no] || (s.source==='tiktok'?overallTk:overallSp), order_date: dateMap[s.order_no] || null, import_batch: batch }));
// ลบเฉพาะ tiktok+shopee ทั้งหมด แล้ว insert ใหม่
for (const src of ['tiktok','shopee']) { const { error } = await sb.from('tmk_mp_skus').delete().eq('source', src); if (error) throw error; console.log(`ลบ sku ${src} เดิมแล้ว`); }
console.log(`เขียน skus ใหม่ ${sRows.length}…`);
for (const ch of chunk(sRows, 500)) { const { error } = await sb.from('tmk_mp_skus').insert(ch); if (error) throw error; }
console.log('✓ เสร็จ — แก้ลาย↔สี TikTok+Shopee แล้ว (Shipnity + orders ไม่ถูกแตะ). รีโหลดหน้าแคตตาล็อก');
