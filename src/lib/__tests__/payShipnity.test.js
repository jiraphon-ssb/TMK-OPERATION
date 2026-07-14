import { describe, it, expect } from 'vitest';
import { payShipnity } from '../mpReport.js';
import { paymentKind } from '../receiptParse.js';

describe('payShipnity — normalize การชำระ (PART 81)', () => {
  it('pay_later ทุกรูปแบบ → COD (เดิมท่อ import จัดเป็น "โอน")', () => {
    expect(payShipnity('pay_later')).toBe('COD');
    expect(payShipnity('PAY_LATER')).toBe('COD');
    expect(payShipnity('pay later')).toBe('COD');
  });
  it('จ่ายทีหลัง/cod/ปลายทาง → COD', () => {
    expect(payShipnity('จ่ายทีหลัง')).toBe('COD');
    expect(payShipnity('COD')).toBe('COD');
    expect(payShipnity('เก็บเงินปลายทาง')).toBe('COD');
  });
  it('shopee/lazada → มาร์เก็ตเพลส · ชื่อธนาคาร → โอน', () => {
    expect(payShipnity('Shopee')).toBe('มาร์เก็ตเพลส');
    expect(payShipnity('lazada')).toBe('มาร์เก็ตเพลส');
    expect(payShipnity('scb')).toBe('โอน');
  });
  it('idempotent — ค่า canonical ผ่านตัวเองได้ทุกตัว (Select ในฟอร์มเขียนค่าเหล่านี้ตรง)', () => {
    for (const v of ['โอน', 'COD', 'มาร์เก็ตเพลส', 'ไม่ระบุ']) expect(payShipnity(v)).toBe(v);
  });
  it('ว่าง/ขีด → ไม่ระบุ', () => {
    expect(payShipnity('')).toBe('ไม่ระบุ');
    expect(payShipnity('-')).toBe('ไม่ระบุ');
  });
});

describe('paymentKind — ฝั่งใบเสร็จ (สอดคล้อง payShipnity)', () => {
  it('pay_later/ปลายทาง/carrier มี COD → COD', () => {
    expect(paymentKind('pay_later', '')).toBe('COD');
    expect(paymentKind('', 'Kerry COD')).toBe('COD');
    expect(paymentKind('เก็บเงินปลายทาง', '')).toBe('COD');
  });
  it('ธนาคาร → โอน · ว่าง → "" (payShipnity แปลงเป็น ไม่ระบุ ตอนเขียน)', () => {
    expect(paymentKind('scb', '')).toBe('โอน');
    expect(paymentKind('', '')).toBe('');
  });
});
