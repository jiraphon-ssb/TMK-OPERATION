import { describe, it, expect } from 'vitest';
import { blankNoteData, normNoteData, isNoteDataEmpty, totalCalls, crmDateThai, noteSummaryText, buildCrmDailyReport } from '../crmDailyNote.js';

describe('crmDailyNote — โครงข้อมูล', () => {
  it('blank เป็นศูนย์/ว่างทั้งหมด และนับว่า empty', () => {
    const b = blankNoteData();
    expect(isNoteDataEmpty(b)).toBe(true);
    expect(totalCalls(b)).toBe(0);
  });
  it('normNoteData เติมช่องที่ขาดให้ครบ + แปลงเลข', () => {
    const x = normNoteData({ calls: { d0: { total: '5' } }, upsellBaht: '120', ask: ' หา ' });
    expect(x.calls.d0.total).toBe(5);
    expect(x.calls.d0.answered).toBe(0);
    expect(x.calls.d5).toEqual({ total: 0, answered: 0 });
    expect(x.upsellBaht).toBe(120);
    expect(x.ask).toBe(' หา ');
  });
  it('totalCalls รวมทั้ง 3 กลุ่ม', () => {
    expect(totalCalls({ calls: { d0: { total: 12 }, d5: { total: 3 }, rep: { total: 15 } } })).toBe(30);
  });
  it('isNoteDataEmpty=false เมื่อมีค่าใดค่าหนึ่ง', () => {
    expect(isNoteDataEmpty({ calls: { rep: { total: 1 } } })).toBe(false);
    expect(isNoteDataEmpty({ ask: 'x' })).toBe(false);
  });
});

describe('crmDateThai', () => {
  it('แปลง ค.ศ. → พ.ศ. 2 หลัก D/M/YY', () => {
    expect(crmDateThai('2026-08-03')).toBe('3/8/69');
    expect(crmDateThai('2026-12-25')).toBe('25/12/69');
  });
});

describe('noteSummaryText', () => {
  it('สรุปเฉพาะช่องที่มีค่า', () => {
    const s = noteSummaryText({ calls: { d0: { total: 5, answered: 3 } }, upsellOrders: 2, upsellBaht: 100, ask: 'หากระเป๋า' });
    expect(s).toContain('โทร 5 สาย');
    expect(s).toContain('อัพเซลล์ 2 ออเดอร์');
    expect(s).toContain('ถาม: หากระเป๋า');
  });
  it('ว่างทั้งหมด → คืนสตริงว่าง', () => {
    expect(noteSummaryText(blankNoteData())).toBe('');
  });
  it('extra (หมายเหตุเพิ่มเติม) เข้าสรุป + ทำให้ไม่ empty', () => {
    expect(isNoteDataEmpty({ extra: 'อสม.เข้าเยอะ' })).toBe(false);
    expect(noteSummaryText({ extra: 'อสม.เข้าเยอะ' })).toContain('อสม.เข้าเยอะ');
  });
});

describe('buildCrmDailyReport', () => {
  const auto = { crmSales: 6108, line: 0, phone: 6108, orders: 11, qty: 22, buyers: 11, oldCust: 11, newCust: 0, repurchaseOrders: 11, repurchaseBaht: 6108 };
  it('ประกอบรายงานครบทุกส่วน + ไม่รับ = โทร-รับ + สรุปสาย/ตัว/ลูกค้า/ยอดแยกช่อง', () => {
    const data = { calls: { d0: { total: 12, answered: 8 }, d5: { total: 0, answered: 0 }, rep: { total: 15, answered: 11 } }, upsellOrders: 2, upsellBaht: 300 };
    const r = buildCrmDailyReport({ seller: 'จันทกานต์', dateISO: '2026-08-03', auto, data });
    expect(r).toContain('จันทกานต์ CRM : 3/8/69');
    expect(r).toContain('ไม่รับสาย = 4 สาย');   // 0DAY 12-8 และ Repurchase 15-11
    expect(r).toContain('✅ อัพเซลล์ได้ = 2 ออเดอร์');
    expect(r).toContain('ปิดการขาย Repurchase');
    expect(r).toContain('✅ = 11 ออเดอร์ ฿6,108 บาท');
    expect(r).toContain('รวมจำนวนสาย = 27 สาย (รับ 19 / ไม่รับ 8)'); // ans 8+0+11=19 · miss 4+0+4=8
    expect(r).toContain('จำนวนออเดอร์ = 11 ออเดอร์ (22 ตัว)');
    expect(r).toContain('ลูกค้าที่ซื้อ = 11 คน');
    expect(r).toContain('ลูกค้าเก่า = 11 คน');
    expect(r).toContain('ลูกค้าใหม่ = 0 คน');
    expect(r).toContain('LINE = ฿0 · โทร = ฿6,108');
    expect(r).toContain('ยอดรวมทั้งหมด = ฿6,108 บาท');
  });
  it('เสียงลูกค้า/แถม/วันเกิด แสดงเสมอ (ว่าง = "-" · มีค่า = ค่านั้น)', () => {
    const empty = buildCrmDailyReport({ seller: 'FAH', dateISO: '2026-08-04', auto, data: blankNoteData() });
    expect(empty).toContain('ลูกค้าถามหา: -');
    expect(empty).toContain('🎁 ออเดอร์แถม = 0 ออเดอร์');
    expect(empty).toContain('🎂 โปรวันเกิด = 0 ออเดอร์');
    const filled = buildCrmDailyReport({ seller: 'FAH', dateISO: '2026-08-04', auto, data: { ask: 'เสื้อมีกระเป๋า', freebieOrders: 1 } });
    expect(filled).toContain('ลูกค้าถามหา: เสื้อมีกระเป๋า');
    expect(filled).toContain('🎁 ออเดอร์แถม = 1 ออเดอร์');
  });
});
