import { describe, it, expect } from 'vitest';
import { fmtBaht, hasSatang } from '../money.js';

describe('fmtBaht — decimal-aware money (โชว์ทศนิยมเฉพาะเมื่อมีเศษสตางค์)', () => {
  it('จำนวนเต็ม → ไม่มี .00', () => {
    expect(fmtBaht(9743)).toBe('฿9,743');
    expect(fmtBaht(0)).toBe('฿0');
    expect(fmtBaht(696)).toBe('฿696');
    expect(fmtBaht(1000000)).toBe('฿1,000,000');
  });
  it('มีเศษสตางค์ → เอามาครบ 2 หลัก', () => {
    expect(fmtBaht(696.43)).toBe('฿696.43');
    expect(fmtBaht(696.5)).toBe('฿696.50');   // เศษหลักเดียว → เติมเป็น 2 หลัก
    expect(fmtBaht(9743.1)).toBe('฿9,743.10');
    expect(fmtBaht(1234.99)).toBe('฿1,234.99');
  });
  it('ปัด ณ ทศนิยม 2 ตำแหน่ง', () => {
    expect(fmtBaht(10.005)).toBe('฿10.01');    // ปัดขึ้น
    expect(fmtBaht(10.004)).toBe('฿10');       // ปัดลง → กลายเป็นจำนวนเต็ม
  });
  it('ค่าติดลบ (เช่น ส่วนลด/ปรับปรุง) — ฿ นำหน้าเสมอ, เครื่องหมายอยู่หน้าเลข', () => {
    expect(fmtBaht(-250)).toBe('฿-250');
    expect(fmtBaht(-250.5)).toBe('฿-250.50');
  });
  it('null/undefined/NaN/Infinity → —', () => {
    expect(fmtBaht(null)).toBe('—');
    expect(fmtBaht(undefined)).toBe('—');
    expect(fmtBaht(NaN)).toBe('—');
    expect(fmtBaht(Infinity)).toBe('—');
  });
  it('รับ string ตัวเลขได้', () => {
    expect(fmtBaht('9743')).toBe('฿9,743');
    expect(fmtBaht('696.43')).toBe('฿696.43');
  });
});

describe('hasSatang', () => {
  it('true เมื่อมีเศษสตางค์', () => {
    expect(hasSatang(696.43)).toBe(true);
    expect(hasSatang(696.5)).toBe(true);
    expect(hasSatang(-1.01)).toBe(true);
  });
  it('false เมื่อลงตัวบาท', () => {
    expect(hasSatang(696)).toBe(false);
    expect(hasSatang(0)).toBe(false);
    expect(hasSatang(696.004)).toBe(false); // ปัดแล้วลงตัว
  });
});
