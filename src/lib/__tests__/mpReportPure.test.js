import { describe, it, expect } from 'vitest';
import { qtyBand, deriveColorSize, isDftNote } from '../mpReport.js';

// Characterization tests — ตัวจัดหมวด/แยกสี-ไซซ์ (pure) ที่ใช้ทั่วรายงาน + import
describe('qtyBand', () => {
  it('ขอบเขตแต่ละช่วง', () => {
    expect(qtyBand(0)).toBe('1 ตัว');
    expect(qtyBand(1)).toBe('1 ตัว');
    expect(qtyBand(2)).toBe('2-3');
    expect(qtyBand(3)).toBe('2-3');
    expect(qtyBand(4)).toBe('4-10');
    expect(qtyBand(10)).toBe('4-10');
    expect(qtyBand(11)).toBe('11-50');
    expect(qtyBand(50)).toBe('11-50');
    expect(qtyBand(51)).toBe('51+');
    expect(qtyBand(999)).toBe('51+');
  });
  it('ค่าไม่ใช่ตัวเลข → 1 ตัว', () => expect(qtyBand('x')).toBe('1 ตัว'));
});

describe('isDftNote', () => {
  it('มีคำ DFT (case-insensitive, word-boundary) = true', () => {
    expect(isDftNote('งาน DFT ด่วน')).toBe(true);
    expect(isDftNote('dft')).toBe(true);
    expect(isDftNote('Dft lot 3')).toBe(true);
  });
  it('ไม่มี DFT = false', () => {
    expect(isDftNote('ปกติ')).toBe(false);
    expect(isDftNote('')).toBe(false);
    expect(isDftNote(null)).toBe(false);
    expect(isDftNote('dftx')).toBe(false); // ไม่ใช่ word-boundary
  });
});

describe('deriveColorSize', () => {
  it('แยกไซซ์จากวงเล็บท้ายชื่อ', () => {
    expect(deriveColorSize('เสื้อ (ดำ-XL)', '').size).toBe('XL');
    expect(deriveColorSize('เสื้อ (ดำ-XL)', '').color).toBeTruthy();
  });
  it('แยกไซซ์จาก suffix รหัส เมื่อไม่มีวงเล็บ', () => {
    expect(deriveColorSize('', 'JRP111-BK-XL').size).toBe('XL');
  });
  it('ไม่มีข้อมูล → ว่างทั้งคู่', () => {
    expect(deriveColorSize('', '')).toEqual({ color: '', size: '' });
  });
});
