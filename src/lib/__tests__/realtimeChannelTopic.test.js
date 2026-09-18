// ============================================================
// ยามระดับซอร์ส — ชื่อ channel realtime ต้องไม่ซ้ำกันในแต่ละครั้งที่ต่อ
// ============================================================
// บั๊กจริง 18 ก.ย. 69 (เจอตอนเปิดแอปหลังล็อกอิน · เทสในเครื่องจับไม่ได้):
//   supabase.removeChannel() เป็น async — พอ React mount ซ้ำ (StrictMode/dev หรือ remount จริง)
//   รอบใหม่เรียก supabase.channel('tmk-realtime') ขณะตัวเก่ายัง "ถอนไม่เสร็จ"
//   → ได้ object เดิมที่ subscribe ไปแล้ว → .on() โยน
//     "cannot add postgres_changes callbacks after subscribe()"
//   เสี่ยงที่สุดคือได้ channel ที่ subscribe แล้วแต่ไม่มี binding = realtime ตายเงียบ
//   (หน้าจอไม่อัปเดตสด แต่ไม่มีอะไรฟ้อง)
//
// เป็นการ "ต่อสาย" ใน effect ที่ต้อง mock ทั้ง React + supabase ถึงจะเทสได้จริง
// จึงกันด้วยยามระดับซอร์สแทน — ถูกกว่าและตรงจุด
// ============================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const raw = readFileSync('src/dataContext.jsx', 'utf8');
// ตัดคอมเมนต์ออกก่อนสแกน — ไม่งั้นยามไปจับตัวอย่างโค้ดที่เขียนอธิบายไว้ในคอมเมนต์เอง
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('channel realtime ของ dataContext', () => {
  it('⛔ ห้ามตั้งชื่อ channel เป็นค่าคงที่ (ต้องมีเลขลำดับต่อท้าย)', () => {
    const calls = [...src.matchAll(/supabase\.channel\(([^)]*)\)/g)].map(m => m[1].trim());
    expect(calls.length, 'ไม่เจอ supabase.channel() — โครงเปลี่ยน ให้ทบทวนยามตัวนี้').toBeGreaterThan(0);
    for (const arg of calls) {
      expect(arg, `ชื่อ channel ต้องไม่ใช่ค่าคงที่: ${arg}`).not.toMatch(/^['"][^'"]*['"]$/);
      expect(arg, `ต้องมีเลขลำดับ (rtSeq) ต่อท้าย: ${arg}`).toContain('rtSeq');
    }
  });

  it('ตัวนับต้องเพิ่มก่อนสร้าง channel ทุกครั้ง', () => {
    expect(src).toMatch(/rtSeq \+= 1;\s*\n\s*const ch = supabase\.channel\(/);
  });

  it('⛔ async path ของ effect ต้องใช้ธง "ต่อรอบ" ไม่ใช่ mountedRef ที่ใช้ร่วมกันทุกรอบ', () => {
    // mountedRef เป็นของ provider — รอบใหม่ตั้งกลับเป็น true ทำให้ closure รอบเก่าผ่านด่านไปต่อ channel ซ้ำ
    expect(src).toMatch(/let cancelled = false;/);
    expect(src).toMatch(/const \{ data \} = await supabase\.auth\.getSession\(\);\s*\n\s*if \(cancelled\) return;/);
    expect(src).toMatch(/cancelled = true;/);           // cleanup ต้องปิดธง
  });

  it('connectRealtime ต้องไม่ต่อซ้ำเมื่อรอบนี้มี channel อยู่แล้ว', () => {
    expect(src).toMatch(/if \(usingPoll \|\| cancelled \|\| channel\) return;/);
  });
});
