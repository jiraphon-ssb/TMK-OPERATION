/* ============================================================================
   build-edge-fn.mjs — รวม (inline) สูตรกลาง _shared/saleFormulas.js เข้ากับ
   daily-sale-report/index.ts → ไฟล์เดียวพร้อมวางใน Supabase Dashboard
   ============================================================================
   ทำไม: Dashboard อัปโหลดเฉพาะโฟลเดอร์ของฟังก์ชัน → import "../_shared/..."
   หาไม่เจอ = "Module not found" ตอน deploy (Supabase CLI ไม่มีปัญหานี้ แต่โปรเจกต์นี้ deploy ผ่าน Dashboard)

   ใช้: npm run build:edge   → ได้ dist-edge/daily-sale-report.ts (copy ทั้งไฟล์ไปวางใน Dashboard)
   หมายเหตุ: แก้สูตรที่ _shared/saleFormulas.js ที่เดียวเสมอ แล้วรันสคริปต์นี้ใหม่
   ============================================================================ */
import fs from 'fs';
import path from 'path';

const FN = 'supabase/functions/daily-sale-report/index.ts';
const SHARED = 'supabase/functions/_shared/saleFormulas.js';
const OUT_DIR = 'dist-edge';
const OUT = path.join(OUT_DIR, 'daily-sale-report.ts');

const idx = fs.readFileSync(FN, 'utf8');
const shared = fs.readFileSync(SHARED, 'utf8');

const m = idx.match(/import\s*\{[^}]*\}\s*from\s*"\.\.\/_shared\/saleFormulas\.js";\n/s);
if (!m) { console.error(`❌ ไม่พบ import "../_shared/saleFormulas.js" ใน ${FN}`); process.exit(1); }

const imported = m[0];
const aliases = [...imported.matchAll(/(\w+)\s+as\s+(\w+)/g)].map(x => [x[1], x[2]]);
const inline = shared.replace(/^export\s+/gm, '');            // ตัด export (กลายเป็น top-level scope เดียวกัน)
const aliasLines = aliases.map(([a, b]) => `const ${b} = ${a};`).join('\n');

const banner = `/* ============================================================================
   daily-sale-report — ฉบับ "พร้อมวาง Supabase Dashboard" (สร้างอัตโนมัติ · อย่าแก้ไฟล์นี้)
   ============================================================================
   สร้างจาก: ${FN} + ${SHARED}
   สร้างใหม่ด้วย: npm run build:edge
   แก้สูตรที่ _shared/saleFormulas.js ที่เดียวเสมอ (FE ใช้ไฟล์เดียวกัน = เลขเว็บตรงรายงาน LINE)
   ============================================================================ */

// ───────── สูตรกลางจาก _shared/saleFormulas.js (inline) ─────────
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, banner + inline + '\n' + (aliasLines ? aliasLines + '\n' : '') + '\n// ───────── index.ts ─────────\n' + idx.replace(imported, ''));

const left = (fs.readFileSync(OUT, 'utf8').match(/^import .*_shared/gm) || []).length;
if (left) { console.error('❌ ยังมี import _shared เหลือ'); process.exit(1); }
console.log(`✅ ${OUT}  (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB · alias: ${aliases.map(a => a.join('→')).join(', ') || 'ไม่มี'})`);
console.log('   → เปิดไฟล์ copy ทั้งหมดไปวางใน Supabase Dashboard → Edge Functions → daily-sale-report');
