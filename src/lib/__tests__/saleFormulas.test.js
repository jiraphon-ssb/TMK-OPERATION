/* ============================================================
   saleFormulas.test.js — ยืนยันสูตร canonical "แหล่งเดียว" (P2-4)
   ============================================================
   ไฟล์ supabase/functions/_shared/saleFormulas.js = ตัวจริงที่ทั้ง FE (เว็บ)
   และ edge (daily-sale-report ส่ง LINE) import ร่วมกัน → เทสต์ที่นี่ครอบทั้งสองฝั่ง
   ============================================================ */
import { describe, it, expect } from 'vitest';
import {
  resolveJobType,
  ORDER_OV_KEY,
  mergeOrderOverrides,
  MARKETPLACE_CHANNELS,
  isLeadChannel,
  isMasked,
  crmCustomerKey,
  blankNoteData,
  normNoteData,
} from '../../../supabase/functions/_shared/saleFormulas.js';

describe('resolveJobType', () => {
  it('ยุบ "ส่ง" → "ปลีก"', () => {
    expect(resolveJobType('ส่ง', '')).toBe('ปลีก');
  });
  it('หมายเหตุมี DFT → promote เป็น DFT', () => {
    expect(resolveJobType('ปลีก', 'งาน DFT ด่วน')).toBe('DFT');
    expect(resolveJobType('', 'dft')).toBe('DFT');
  });
  it('เก็บเป็น DFT แต่หมายเหตุไม่มี DFT → demote เป็น ปลีก', () => {
    expect(resolveJobType('DFT', 'ลูกค้าปกติ')).toBe('ปลีก');
  });
  it('OEM ไม่แตะ', () => {
    expect(resolveJobType('OEM', '')).toBe('OEM');
    expect(resolveJobType('OEM', 'dft')).toBe('OEM');
  });
  it('ค่าว่าง/null → ปลีก', () => {
    expect(resolveJobType('', '')).toBe('ปลีก');
    expect(resolveJobType(null, null)).toBe('ปลีก');
  });
  it('DFT ต้องเป็น word-boundary (ไม่ match ในคำอื่น)', () => {
    expect(resolveJobType('ปลีก', 'abcdft')).toBe('ปลีก');
  });
});

describe('mergeOrderOverrides + ORDER_OV_KEY', () => {
  const base = [
    { source: 'shipnity', order_no: 'A1', sales: 100, qty: 1, channel: 'Facebook', salesperson: 'AA', job_type: 'ปลีก', note: '' },
    { source: 'mp', order_no: 'B2', sales: 200, qty: 2, channel: 'Shopee', salesperson: 'BB', job_type: 'ปลีก', note: '' },
  ];

  it('key = source:order_no', () => {
    expect(ORDER_OV_KEY(base[0])).toBe('shipnity:A1');
    expect(ORDER_OV_KEY({ order_no: 'X' })).toBe(':X');
  });
  it('ovMap ว่าง → คืน array เดิม (reference เดิม)', () => {
    expect(mergeOrderOverrides(base, {})).toBe(base);
    expect(mergeOrderOverrides(base, null)).toBe(base);
  });
  it('override ทับ sales/qty/channel/salesperson · แถวไม่มี override คง reference เดิม', () => {
    const ov = { [ORDER_OV_KEY(base[0])]: { sales: 999, qty: 5, channel: 'LINE', salesperson: 'ZZ' } };
    const [r0, r1] = mergeOrderOverrides(base, ov);
    expect(r0.sales).toBe(999);
    expect(r0.qty).toBe(5);
    expect(r0.channel).toBe('LINE');
    expect(r0.salesperson).toBe('ZZ');
    expect(r1).toBe(base[1]);
  });
  it('override note → re-derive job_type = DFT + เก็บ note ใหม่', () => {
    const ov = { [ORDER_OV_KEY(base[0])]: { note: 'ทำ DFT ให้ด้วย' } };
    const [r0] = mergeOrderOverrides(base, ov);
    expect(r0.job_type).toBe('DFT');
    expect(r0.note).toBe('ทำ DFT ให้ด้วย');
  });
  it('override sales=0 ชนะ (ค่าจริง 0 ไม่ใช่ค่าว่าง)', () => {
    const ov = { [ORDER_OV_KEY(base[0])]: { sales: 0 } };
    const [r0] = mergeOrderOverrides(base, ov);
    expect(r0.sales).toBe(0);
  });
  it("override channel='' → คงค่าเดิม (ว่าง = ไม่ทับ)", () => {
    const ov = { [ORDER_OV_KEY(base[0])]: { channel: '' } };
    const [r0] = mergeOrderOverrides(base, ov);
    expect(r0.channel).toBe('Facebook');
  });
});

describe('isLeadChannel / MARKETPLACE_CHANNELS', () => {
  it('มาร์เก็ตเพลส (Shopee/Lazada/POS) → ไม่ใช่ช่องคนทัก', () => {
    expect(MARKETPLACE_CHANNELS).toEqual(['Shopee', 'Lazada', 'POS']);
    for (const ch of MARKETPLACE_CHANNELS) expect(isLeadChannel(ch)).toBe(false);
  });
  it('ช่องแชท (Facebook/LINE/Phone) → เป็นช่องคนทัก', () => {
    expect(isLeadChannel('Facebook')).toBe(true);
    expect(isLeadChannel('LINE')).toBe(true);
    expect(isLeadChannel('Phone')).toBe(true);
  });
  it('ว่าง/undefined → false', () => {
    expect(isLeadChannel('')).toBe(false);
    expect(isLeadChannel(undefined)).toBe(false);
  });
});

describe('crmCustomerKey / isMasked', () => {
  it('isMasked = มี * ติดกัน 2 ตัวขึ้นไป', () => {
    expect(isMasked('ณ******์')).toBe(true);
    expect(isMasked('C**')).toBe(true);
    expect(isMasked('ปกติ')).toBe(false);
    expect(isMasked('')).toBe(false);
  });
  it('ลูกค้าปกปิด (mask ชื่อ/รหัส) → ""', () => {
    expect(crmCustomerKey({ customer_name: 'ณ******์', customer_code: '' })).toBe('');
    expect(crmCustomerKey({ customer_name: 'ก', customer_code: 'C**' })).toBe('');
  });
  it('มี customer_code → ใช้ code', () => {
    expect(crmCustomerKey({ customer_code: 'CUST01', customer_name: 'สมชาย' })).toBe('CUST01');
  });
  it('ไม่มี code แต่มีชื่อ → "N"+ชื่อ', () => {
    expect(crmCustomerKey({ customer_code: '', customer_name: 'สมหญิง' })).toBe('Nสมหญิง');
  });
  it('ไม่มีทั้ง code/ชื่อ → ""', () => {
    expect(crmCustomerKey({})).toBe('');
  });
});

describe('normNoteData / blankNoteData', () => {
  it('data ว่าง → โครงเปล่า (เท่ากับ blankNoteData)', () => {
    expect(normNoteData(undefined)).toEqual(blankNoteData());
    expect(normNoteData(null)).toEqual(blankNoteData());
    expect(normNoteData('ข้อความเก่า')).toEqual(blankNoteData());
  });
  it('เติมช่องที่ขาด + coerce ตัวเลข (string → number)', () => {
    const r = normNoteData({ calls: { d0: { total: '3', answered: 2 } }, upsellBaht: '150', ask: 'ถามไซซ์' });
    expect(r.calls.d0).toEqual({ total: 3, answered: 2 });
    expect(r.calls.d5).toEqual({ total: 0, answered: 0 });
    expect(r.calls.rep).toEqual({ total: 0, answered: 0 });
    expect(r.upsellBaht).toBe(150);
    expect(r.ask).toBe('ถามไซซ์');
    expect(r.praise).toBe('');
    expect(r.complaint).toBe('');
    expect(r.extra).toBe('');
  });
});
