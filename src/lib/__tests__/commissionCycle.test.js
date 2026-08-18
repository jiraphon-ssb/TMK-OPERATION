import { describe, it, expect } from 'vitest';
import { cycleOf, currentCycleEndMonth, cycleProgress, buildCycleRows, rateLabel, shiftMonth, normCutoffDay, DEFAULT_CUTOFF_DAY } from '../commissionCycle.js';
import { commissionFor } from '../targets.js';

describe('commissionCycle — คณิตรอบตัด', () => {
  it('รอบปกติ: cutoff 26 + endMonth ส.ค. → 26 ก.ค. – 25 ส.ค.', () => {
    expect(cycleOf('2026-08', 26)).toEqual({ from: '2026-07-26', to: '2026-08-25', endMonth: '2026-08' });
  });

  it('รอบคร่อมปี: endMonth ม.ค. → เริ่ม 26 ธ.ค. ปีก่อน', () => {
    expect(cycleOf('2026-01', 26)).toEqual({ from: '2025-12-26', to: '2026-01-25', endMonth: '2026-01' });
  });

  it('เดือน ก.พ. (28 วัน): cutoff 26 ใช้ได้ — จบ 25 ก.พ. เริ่ม 26 ม.ค.', () => {
    expect(cycleOf('2026-02', 26)).toEqual({ from: '2026-01-26', to: '2026-02-25', endMonth: '2026-02' });
  });

  it('cutoff = 1 → เดือนปฏิทินพอดี (1 – สิ้นเดือน · ก.พ. ปีอธิกสุรทินถูก)', () => {
    expect(cycleOf('2026-08', 1)).toEqual({ from: '2026-08-01', to: '2026-08-31', endMonth: '2026-08' });
    expect(cycleOf('2028-02', 1).to).toBe('2028-02-29'); // 2028 = leap year
  });

  it('normCutoffDay: นอกช่วง/ขยะ → default 26 (กัน 29-31 ทำ ก.พ. พัง)', () => {
    expect(normCutoffDay(26)).toBe(26);
    expect(normCutoffDay(1)).toBe(1);
    expect(normCutoffDay(29)).toBe(DEFAULT_CUTOFF_DAY);
    expect(normCutoffDay(0)).toBe(DEFAULT_CUTOFF_DAY);
    expect(normCutoffDay('abc')).toBe(DEFAULT_CUTOFF_DAY);
  });

  it('currentCycleEndMonth: ก่อนวันตัด = รอบจบเดือนนี้ · ถึงวันตัด = รอบจบเดือนหน้า', () => {
    expect(currentCycleEndMonth('2026-08-13', 26)).toBe('2026-08'); // 13 ส.ค. อยู่ในรอบ 26 ก.ค.–25 ส.ค.
    expect(currentCycleEndMonth('2026-08-26', 26)).toBe('2026-09'); // 26 ส.ค. เริ่มรอบใหม่ → จบ ก.ย.
    expect(currentCycleEndMonth('2026-12-27', 26)).toBe('2027-01'); // คร่อมปี
    expect(currentCycleEndMonth('2026-08-13', 1)).toBe('2026-08');  // เดือนปฏิทิน
  });

  it('cycleProgress: นับวันทั้งรอบ + ผ่านมาแล้ว (clamp หัว-ท้าย)', () => {
    const c = cycleOf('2026-08', 26); // 26 ก.ค. – 25 ส.ค. = 31 วัน
    expect(cycleProgress(c, '2026-08-13')).toEqual({ days: 31, passed: 19 });
    expect(cycleProgress(c, '2026-07-01').passed).toBe(0);   // ก่อนรอบ
    expect(cycleProgress(c, '2026-09-09').passed).toBe(31);  // หลังรอบจบ = เต็ม
  });

  it('shiftMonth ข้ามปีถูกต้อง', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});

describe('commissionCycle — รวมยอด + คอมต่อเซลล์', () => {
  const orders = [
    { salesperson: 'TUKTA', sales: 1000, status: 'confirmed' },
    { salesperson: 'TUKTA', sales: 500, status: 'confirmed' },
    { salesperson: 'TUKTA', sales: 9999, status: 'cancelled' },   // ต้องถูกตัด
    { salesperson: 'PAI', sales: 700, status: 'confirmed' },
    { salesperson: '', sales: 300, status: 'confirmed' },          // ไม่ระบุเซลล์
  ];

  it('ตัดออเดอร์ยกเลิก + รวมต่อเซลล์ + เรียงยอดมาก→น้อย', () => {
    const rows = buildCycleRows(orders, {});
    expect(rows.map(r => [r.name, r.sales, r.orders])).toEqual([
      ['TUKTA', 1500, 2],
      ['PAI', 700, 1],
      ['ไม่ระบุเซลล์', 300, 1],
    ]);
  });

  it('คอม flat: ใช้สูตร commissionFor เดิมเป๊ะ', () => {
    const tgt = { sales_target: 10000, commission_rate: 3 };
    const rows = buildCycleRows(orders, { TUKTA: tgt });
    const tukta = rows.find(r => r.name === 'TUKTA');
    expect(tukta.comm).toBe(commissionFor(1500, tgt)); // 1500*3% = 45
    expect(tukta.comm).toBe(45);
    expect(rows.find(r => r.name === 'PAI').comm).toBe(0); // ไม่มีเป้า = 0
  });

  it('คอม tiers ขั้นบันได: หยิบขั้นที่ยอดถึง + rateLabel ตรงขั้น', () => {
    const tgt = { tiers: [{ min: 0, rate: 1 }, { min: 1000, rate: 2 }, { min: 5000, rate: 3 }] };
    const rows = buildCycleRows(orders, { TUKTA: tgt, PAI: tgt });
    const tukta = rows.find(r => r.name === 'TUKTA'); // 1500 → ขั้น min 1000 = 2%
    expect(tukta.comm).toBe(30);
    expect(rateLabel(tukta)).toBe('ขั้นบันได 2%');
    const pai = rows.find(r => r.name === 'PAI');     // 700 → ขั้น min 0 = 1%
    expect(pai.comm).toBe(7);
    expect(rateLabel(pai)).toBe('ขั้นบันได 1%');
  });

  it('rateLabel: flat โชว์ % · ไม่มีเป้า = null', () => {
    expect(rateLabel({ sales: 100, tgt: { commission_rate: 3 } })).toBe('3%');
    expect(rateLabel({ sales: 100, tgt: null })).toBe(null);
  });
});
