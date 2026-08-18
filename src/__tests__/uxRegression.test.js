/* ============================================================
   uxRegression.test.js — กันพฤติกรรม UX ที่เพิ่งแก้ "ย้อนกลับ" โดยไม่ตั้งใจ
   ============================================================
   เทสต์ชุดนี้สแกนซอร์สโดยตรง เพราะสิ่งที่ต้องกันคือ "การมีอยู่ของโค้ดบางแบบ"
   ซึ่ง unit test ปกติจับไม่ได้ (ไม่มีฟังก์ชันให้เรียก — มันคือการหน่วงที่ฝังอยู่ใน view)

   ทุกข้อในนี้เคยเป็นปัญหาจริงที่ผู้ใช้รู้สึกได้ ถ้าใครเผลอใส่กลับมา จะแดงทันที
   ============================================================ */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '__tests__') walk(p, out); }
    else if (/\.(jsx|js)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}
const FILES = walk(SRC);
const read = (f) => fs.readFileSync(f, 'utf8');
const rel = (f) => path.relative(SRC, f);

describe('UX regression guards', () => {
  it('ไม่มี skeleton หลอก (useBeat/useBeatOn) — ข้อมูลอยู่ใน memory แล้วต้องเข้าหน้าทันที', () => {
    const hits = FILES.filter(f => /\buseBeatOn?\s*\(/.test(read(f))).map(rel);
    expect(hits).toEqual([]);
  });

  it('ไม่มีจอโหลดขั้นต่ำแบบบังคับ (useMinSplash) — โชว์เท่าที่โหลดจริงเท่านั้น', () => {
    // ต้องแมตช์ "การเรียก/นิยาม" เท่านั้น — คอมเมนต์ที่อธิบายว่าถอดออกไปแล้วไม่นับ
    const hits = FILES.filter(f => /useMinSplash\s*\(/.test(read(f))).map(rel);
    expect(hits).toEqual([]);
  });

  it('ไม่ใช้กล่อง confirm ของเบราว์เซอร์ (ยกเว้น fallback ตอน ConfirmHost ยังไม่ mount)', () => {
    const hits = [];
    for (const f of FILES) {
      read(f).split('\n').forEach((line, i) => {
        if (!/window\.confirm\s*\(/.test(line)) return;
        if (/fallback/.test(line)) return;   // จุด fallback ที่ตั้งใจไว้ใน modals-core
        hits.push(`${rel(f)}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it('MultiSelect มีนิยามเดียวในแอป (เคยถูกก๊อป 6 ชุด แล้วสไตล์เพี้ยนกันจริง)', () => {
    const defs = FILES.filter(f => /^(export )?function MultiSelect\(/m.test(read(f))).map(rel);
    expect(defs).toEqual(['components/MultiSelect.jsx']);
  });

  it('DateRangePicker มีนิยามเดียวในแอป (สำเนาเก่าแสดงป้ายผิดตอนยังไม่เลือกช่วง)', () => {
    const defs = FILES.filter(f => /^(export )?function DateRangePicker\(/m.test(read(f))).map(rel);
    expect(defs).toEqual(['saleWidgets.jsx']);
  });

  it('DateRangePicker แสดง "ทุกช่วงเวลา" เมื่อยังไม่เลือกช่วง (ไม่ใช่ "กำหนดเอง")', () => {
    const src = read(path.join(SRC, 'saleWidgets.jsx'));
    expect(src).toMatch(/presetLabel \|\| \(from \|\| to \? 'กำหนดเอง' : 'ทุกช่วงเวลา'\)/);
  });

  it('saveRow อัปเดตจอทันที (patchRows) ก่อน refresh — ไม่ปล่อยให้จอค้างค่าเก่าหลังกดบันทึก', () => {
    const src = read(path.join(SRC, 'modals-core.jsx'));
    expect(src).toMatch(/\.upsert\(row\)\.select\(\)/);
    expect(src.indexOf('patchRows(table')).toBeGreaterThan(-1);
    // patchRows ต้องมาก่อน refresh (ไม่งั้นไม่ได้ประโยชน์เรื่อง \"เห็นผลทันที\")
    expect(src.indexOf('patchRows(table')).toBeLessThan(src.indexOf('refresh([table])'));
  });

  it('เนื้อหา section ถูก memo — เปิด/ปิด drawer หรือเมนู ไม่ทำให้ทั้งหน้าวาดใหม่', () => {
    const src = read(path.join(SRC, 'App.jsx'));
    expect(src).toMatch(/const SectionContent = memo\(/);
    expect(src).toMatch(/go=\{goStable\}/);   // ต้องส่งตัวที่ identity คงที่ ไม่งั้น memo ไม่มีผล
  });
});
