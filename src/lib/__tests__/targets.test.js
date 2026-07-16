import { describe, it, expect } from 'vitest';
import { commissionFor, targetsByPerson, targetId } from '../targets.js';

// Characterization tests — ล็อกพฤติกรรมสูตร "คอมมิชชั่น" (money-critical) ก่อน refactor
describe('commissionFor', () => {
  it('ไม่มี target → 0', () => {
    expect(commissionFor(1000, null)).toBe(0);
    expect(commissionFor(1000, undefined)).toBe(0);
    expect(commissionFor(1000, 0)).toBe(0);
  });
  it('flat commission_rate = sales × rate%', () => {
    expect(commissionFor(1000, { commission_rate: 5 })).toBe(50);
    expect(commissionFor(0, { commission_rate: 5 })).toBe(0);
    expect(commissionFor('2000', { commission_rate: 2.5 })).toBe(50);
  });
  it('tiers ว่าง → ตกไปใช้ flat rate', () => {
    expect(commissionFor(1000, { commission_rate: 5, tiers: [] })).toBe(50);
  });
  it('มี rate แต่ไม่มีเป้ายอด (sales_target=0) → คิดคอมจากยอดทั้งหมด × rate', () => {
    // สถานการณ์จริง: เซลล์ตั้ง 3% ไว้ ไม่ตั้งเป้ายอด → คอม = ยอดขายเดือน × 3%
    expect(commissionFor(9743, { sales_target: 0, commission_rate: 3 })).toBeCloseTo(292.29, 2);
  });
  it('tiers = เลือก tier สูงสุดที่ sales ถึง (min) แล้วคูณ rate ของ tier นั้น', () => {
    const t = { tiers: [{ min: 0, rate: 3 }, { min: 3000, rate: 5 }, { min: 10000, rate: 7 }] };
    expect(commissionFor(5000, t)).toBe(250);   // เข้า tier 3000 → 5%
    expect(commissionFor(3000, t)).toBe(150);   // ขอบพอดี → 5%
    expect(commissionFor(12000, t)).toBe(840);  // tier 10000 → 7%
    expect(commissionFor(0, t)).toBe(0);        // tier 0 → 3% ของ 0 = 0
  });
  it('ต่ำกว่า min ของทุก tier → 0', () => {
    expect(commissionFor(100, { tiers: [{ min: 1000, rate: 5 }] })).toBe(0);
  });
  it('ข้าม tier ที่ rate = null', () => {
    expect(commissionFor(1000, { tiers: [{ min: 0, rate: null }, { min: 0, rate: 4 }] })).toBe(40);
  });
});

describe('targetsByPerson / targetId', () => {
  it('targetId = salesperson::month', () => expect(targetId('A', '2026-07')).toBe('A::2026-07'));
  it('map salesperson → row', () => {
    const m = targetsByPerson([{ salesperson: 'A', x: 1 }, { salesperson: 'B', x: 2 }]);
    expect(m.get('A').x).toBe(1);
    expect(m.get('B').x).toBe(2);
    expect(m.size).toBe(2);
  });
  it('rows ว่าง/undefined → map ว่าง', () => {
    expect(targetsByPerson(null).size).toBe(0);
    expect(targetsByPerson([]).size).toBe(0);
  });
});
