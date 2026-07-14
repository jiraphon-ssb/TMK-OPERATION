import { describe, it, expect } from 'vitest';
import { customerKeyOf } from '../receiptSubmit.js';

describe('customerKeyOf — ลำดับ phone → social(distinct) → name', () => {
  it('เบอร์ ≥9 หลัก → P<เบอร์> (normalize เอาเฉพาะตัวเลข)', () => {
    expect(customerKeyOf({ customer_phone: '08-1234-5678', customer_name: 'สมชาย' })).toBe('P0812345678');
  });
  it('masked (customer_masked) → "" (ไม่มีคีย์)', () => {
    expect(customerKeyOf({ customer_masked: true, customer_name: 'ก*****ข', customer_phone: '' })).toBe('');
  });
  it('masked (ชื่อมี **) → ""', () => {
    expect(customerKeyOf({ customer_name: 'สม**ย' })).toBe('');
  });
  it('ไม่มีเบอร์ + social ต่างจากชื่อ → S<social> (handle เฉพาะกว่าชื่อ)', () => {
    expect(customerKeyOf({ customer_name: 'สมชาย', customer_social: 'somchai_shop' })).toBe('Ssomchai_shop');
  });
  it('social = ชื่อ (parser fallback) → N<ชื่อ> (คงพฤติกรรมเดิม · ไม่ retro-split)', () => {
    expect(customerKeyOf({ customer_name: 'สมชาย', customer_social: 'สมชาย' })).toBe('Nสมชาย');
  });
  it('ไม่มีเบอร์ + ไม่มี social → N<ชื่อ>', () => {
    expect(customerKeyOf({ customer_name: 'สมหญิง' })).toBe('Nสมหญิง');
  });
  it('เบอร์ <9 หลัก → fallback social/ชื่อ', () => {
    expect(customerKeyOf({ customer_phone: '123', customer_name: 'a', customer_social: 'bshop' })).toBe('Sbshop');
  });
  it('ไม่มีอะไรเลย → ""', () => {
    expect(customerKeyOf({})).toBe('');
  });
});
