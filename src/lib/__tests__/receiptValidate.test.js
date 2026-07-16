import { describe, it, expect } from 'vitest';
import { deriveReceiptRowStatus } from '../receiptValidate.js';

// แถวสมบูรณ์ (ควร "พร้อม" = ไม่มี problems)
const goodRow = () => ({
  _id: 'r0', order_no: 'SK1', customer_name: 'สมชาย', province: 'กรุงเทพ',
  channel: 'facebook', total: 100, subtotal: 100,
  lines: [{ code: 'JSK111', name: 'ลาย A', amount: 100, qty: 1 }],
  parsedRaw: { warnings: [], customer_name: 'สมชาย' },
});

describe('deriveReceiptRowStatus — re-validate สด (§บั๊กสถานะ)', () => {
  it('แถวสมบูรณ์ → ไม่มี problems (ขึ้น "พร้อม")', () => {
    const r = deriveReceiptRowStatus(goodRow(), {});
    expect(r.problems).toEqual([]);
    expect(r.hard).toBe(false);
  });

  it('เติมช่องทางแล้ว → "ช่องทาง?" หาย (recompute จากค่าปัจจุบัน)', () => {
    const base = { ...goodRow(), channel: '', parsedRaw: { warnings: ['ช่องทาง "x" ยังไม่รู้จัก — เลือกช่องทางเอง'] } };
    expect(deriveReceiptRowStatus(base, {}).problems.some(p => /ช่องทาง/.test(p))).toBe(true);
    const fixed = { ...base, channel: 'facebook' };
    expect(deriveReceiptRowStatus(fixed, {}).problems.some(p => /ช่องทาง/.test(p))).toBe(false);
  });

  it('เติมรหัสสินค้าแล้ว → "ไม่มีรหัส" หาย', () => {
    const noCode = { ...goodRow(), lines: [{ code: '', name: 'ลาย', amount: 100, qty: 1 }] };
    expect(deriveReceiptRowStatus(noCode, {}).problems.some(p => /รหัสสินค้า/.test(p))).toBe(true);
    const fixed = { ...noCode, lines: [{ code: 'JSK111', name: 'ลาย', amount: 100, qty: 1 }] };
    expect(deriveReceiptRowStatus(fixed, {}).problems.some(p => /รหัสสินค้า/.test(p))).toBe(false);
  });

  it('เติมจังหวัดแล้ว → "จังหวัด" หาย', () => {
    const noProv = { ...goodRow(), province: '' };
    expect(deriveReceiptRowStatus(noProv, {}).problems).toContain('จังหวัด');
    expect(deriveReceiptRowStatus({ ...noProv, province: 'ชลบุรี' }, {}).problems).not.toContain('จังหวัด');
  });

  it('ไม่มี order_no → hard + chip เลขที่เอกสาร', () => {
    const r = deriveReceiptRowStatus({ ...goodRow(), order_no: '' }, {});
    expect(r.hard).toBe(true);
    expect(r.problems).toContain('เลขที่เอกสาร');
  });

  it('เลขซ้ำในชุด → hard (จาก allRows)', () => {
    const a = { ...goodRow(), _id: 'r0', order_no: 'SK9' };
    const b = { ...goodRow(), _id: 'r1', order_no: 'SK9' };
    const r = deriveReceiptRowStatus(b, { allRows: [a, b] });
    expect(r.hard).toBe(true);
    expect(r.problems).toContain('เลขซ้ำในชุดนี้');
  });

  it('ส่งแล้ว (dupReceipts confirmed) → hard', () => {
    const dup = new Map([['SK1', { status: 'confirmed', salesperson: 'นิด' }]]);
    const r = deriveReceiptRowStatus(goodRow(), { dupReceipts: dup });
    expect(r.hard).toBe(true);
    expect(r.problems.some(p => /ส่งแล้วโดย นิด/.test(p))).toBe(true);
  });

  it('มีจาก import (dupOrders) → เตือน "ติ๊กเพื่อบันทึกทับ" แต่ไม่ hard', () => {
    const r = deriveReceiptRowStatus(goodRow(), { dupOrders: new Set(['SK1']) });
    expect(r.hard).toBe(false);
    expect(r.problems.some(p => /import/.test(p))).toBe(true);
  });

  it('ยอดรายการรวมไม่ตรง → เตือน · ตรงแล้ว → หาย', () => {
    const bad = { ...goodRow(), total: 100, subtotal: null, lines: [{ code: 'X', name: 'a', amount: 70, qty: 1 }] };
    expect(deriveReceiptRowStatus(bad, {}).problems.some(p => /ยอดรายการรวม/.test(p))).toBe(true);
    const good = { ...bad, lines: [{ code: 'X', name: 'a', amount: 100, qty: 1 }] };
    expect(deriveReceiptRowStatus(good, {}).problems.some(p => /ยอดรายการรวม/.test(p))).toBe(false);
  });

  it('soft "ชื่ออาจเพี้ยน" → คงไว้ · เมื่อแก้ชื่อ (ต่างจาก parsedRaw) → หาย', () => {
    const raw = { warnings: ['ชื่ออาจมีวรรณยุกต์/สระหาย (ฟอนต์ใบเสร็จ) — โปรดตรวจ'], customer_name: 'สมชาย' };
    const notEdited = { ...goodRow(), customer_name: 'สมชาย', parsedRaw: raw };
    expect(deriveReceiptRowStatus(notEdited, {}).problems.some(p => /วรรณยุกต์/.test(p))).toBe(true);
    const edited = { ...goodRow(), customer_name: 'สมชายแก้แล้ว', parsedRaw: raw };
    expect(deriveReceiptRowStatus(edited, {}).problems.some(p => /วรรณยุกต์/.test(p))).toBe(false);
  });

  it('ลูกค้าปกปิด (มาร์เก็ตเพลส) → คงไว้เสมอ (ข้อจำกัดข้อมูล)', () => {
    const raw = { warnings: ['ลูกค้าถูกปกปิด (มาร์เก็ตเพลส) — ชื่อ/เบอร์ไม่ครบ'] };
    const r = deriveReceiptRowStatus({ ...goodRow(), parsedRaw: raw }, {});
    expect(r.problems.some(p => /ปกปิด/.test(p))).toBe(true);
  });
});
