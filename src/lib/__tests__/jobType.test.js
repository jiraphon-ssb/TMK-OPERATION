import { describe, it, expect } from 'vitest';
import { resolveJobType, normJobType } from '../saleData.js';

// ล็อกกฎ job_type/DFT: หมายเหตุเป็นเจ้าของ DFT · "ส่ง"→"ปลีก" · OEM ไม่แตะ
describe('normJobType', () => {
  it('ยุบ "ส่ง" → "ปลีก"', () => expect(normJobType('ส่ง')).toBe('ปลีก'));
  it('ว่าง → "ปลีก"', () => expect(normJobType('')).toBe('ปลีก'));
  it('undefined → "ปลีก"', () => expect(normJobType(undefined)).toBe('ปลีก'));
  it('OEM คงไว้', () => expect(normJobType('OEM')).toBe('OEM'));
});

describe('resolveJobType (หมายเหตุคุม DFT)', () => {
  it('ปลีก + หมายเหตุมี DFT → DFT (promote)', () => expect(resolveJobType('ปลีก', 'งาน dft ด่วน')).toBe('DFT'));
  it('DFT + หมายเหตุไม่มี DFT → ปลีก (demote)', () => expect(resolveJobType('DFT', 'ลูกค้าประจำ')).toBe('ปลีก'));
  it('ส่ง + ไม่มีหมายเหตุ → ปลีก', () => expect(resolveJobType('ส่ง', '')).toBe('ปลีก'));
  it('OEM ไม่แตะแม้หมายเหตุมี dft', () => expect(resolveJobType('OEM', 'dft')).toBe('OEM'));
  it('word-boundary: "DFTX" ไม่นับเป็น DFT', () => expect(resolveJobType('ปลีก', 'DFTX code')).toBe('ปลีก'));
  it('DFT ตัวพิมพ์ใหญ่กลางข้อความ', () => expect(resolveJobType('ปลีก', 'ทำ DFT ให้')).toBe('DFT'));
});
