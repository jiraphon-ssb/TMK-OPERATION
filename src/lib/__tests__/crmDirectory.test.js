import { describe, it, expect } from 'vitest';
import { num, pageList, dlt, CRM_SORT, STATUS_PRED, STATUS_OPTS, buildDirectory, TIERS } from '../crmDirectory.js';

describe('num', () => {
  it('coerce เป็นเลข · ไม่ใช่เลข → 0', () => {
    expect(num('12')).toBe(12);
    expect(num(3.5)).toBe(3.5);
    expect(num('abc')).toBe(0);
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num(NaN)).toBe(0);
  });
});

describe('pageList', () => {
  it('≤7 หน้า → ครบทุกเลข', () => {
    expect(pageList(1, 1)).toEqual([1]);
    expect(pageList(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it('หน้าเยอะ → ย่อด้วย …', () => {
    expect(pageList(1, 10)).toEqual([1, 2, '…', 10]);
    expect(pageList(5, 10)).toEqual([1, '…', 4, 5, 6, '…', 10]);
    expect(pageList(10, 10)).toEqual([1, '…', 9, 10]);
  });
});

describe('dlt (delta % เทียบเดือนก่อน)', () => {
  it('prev ว่าง/0 → null', () => {
    expect(dlt(100, 0)).toBeNull();
    expect(dlt(100, null)).toBeNull();
    expect(dlt(100, undefined)).toBeNull();
  });
  it('เท่ากัน (0%) → null', () => expect(dlt(100, 100)).toBeNull());
  it('เพิ่มขึ้น → +% · deltaUp true', () => expect(dlt(150, 100)).toEqual({ delta: '+50%', deltaUp: true }));
  it('ลดลง → -% · deltaUp false', () => expect(dlt(80, 100)).toEqual({ delta: '-20%', deltaUp: false }));
});

describe('CRM_SORT accessors', () => {
  it('name → lowercase · sales/count → 0 fallback · recency null → Infinity', () => {
    expect(CRM_SORT.name({ name: 'ABC' })).toBe('abc');
    expect(CRM_SORT.name({})).toBe('');
    expect(CRM_SORT.sales({ sales: 500 })).toBe(500);
    expect(CRM_SORT.sales({})).toBe(0);
    expect(CRM_SORT.count({ count: 3 })).toBe(3);
    expect(CRM_SORT.recency({ recency: 5 })).toBe(5);
    expect(CRM_SORT.recency({ recency: null })).toBe(Infinity);
    expect(CRM_SORT.recency({})).toBe(Infinity);
  });
});

describe('STATUS_PRED predicates', () => {
  it('ครบ 5 ป้าย', () => expect(STATUS_OPTS).toEqual(['ลูกค้าใหม่', 'ซื้อซ้ำ', 'เสี่ยงหลุด', 'มีเบอร์', 'คิวตามต่อ']));
  it('match ตามฟิลด์', () => {
    expect(STATUS_PRED['ลูกค้าใหม่']({ flag: 'ใหม่' })).toBe(true);
    expect(STATUS_PRED['ลูกค้าใหม่']({ flag: 'ขาประจำ' })).toBe(false);
    expect(STATUS_PRED['ซื้อซ้ำ']({ repeat: true })).toBe(true);
    expect(STATUS_PRED['เสี่ยงหลุด']({ flag: 'เสี่ยงหลุด' })).toBe(true);
    expect(STATUS_PRED['มีเบอร์']({ hasContact: true })).toBe(true);
    expect(STATUS_PRED['คิวตามต่อ']({ queue: true })).toBe(true);
  });
});

describe('buildDirectory', () => {
  const asOf = '2026-08-11';
  const order = (over) => ({ order_no: 'A1', customer_code: 'C1', customer_name: 'สมชาย', channel: 'LINE', salesperson: 'ฟ้า', province: 'กรุงเทพ', sales: 100, qty: 2, order_date: '2026-08-01', status: 'confirmed', ...over });

  it('รวมยอด/ครั้ง/จำนวน + first/last ต่อลูกค้า', () => {
    const rows = buildDirectory([], [
      order({ order_no: 'A1', sales: 100, qty: 2, order_date: '2026-08-01' }),
      order({ order_no: 'A2', sales: 250, qty: 3, order_date: '2026-08-05' }),
    ], asOf);
    expect(rows).toHaveLength(1);
    const c = rows[0];
    expect(c.key).toBe('C1');
    expect(c.sales).toBe(350);
    expect(c.count).toBe(2);
    expect(c.qty).toBe(5);
    expect(c.first).toBe('2026-08-01');
    expect(c.last).toBe('2026-08-05');
    expect(c.aov).toBe(175);
    expect(c.repeat).toBe(true);
  });

  it('ตัดใบยกเลิก — ยอดไม่นับ', () => {
    const rows = buildDirectory([], [
      order({ order_no: 'A1', sales: 100 }),
      order({ order_no: 'A2', sales: 999, status: 'cancelled' }),
    ], asOf);
    expect(rows[0].sales).toBe(100);
    expect(rows[0].count).toBe(1);
  });

  it('ลูกค้าปกปิด (masked) → ไม่ขึ้น CRM', () => {
    const rows = buildDirectory([], [
      order({ customer_code: '', customer_name: 'ณ******์' }),
    ], asOf);
    expect(rows).toHaveLength(0);
  });

  it('code ว่าง → จับด้วยชื่อ (คีย์ N)', () => {
    const rows = buildDirectory([], [
      order({ customer_code: '', customer_name: 'สมหญิง' }),
    ], asOf);
    expect(rows[0].key).toBe('Nสมหญิง');
    expect(rows[0].name).toBe('สมหญิง');
  });

  it('segment โทร/LINE + ยอดแยกช่องทาง', () => {
    const rows = buildDirectory([], [
      order({ order_no: 'L1', channel: 'LINE', sales: 100 }),
      order({ order_no: 'P1', channel: 'Phone', sales: 50 }),
    ], asOf);
    const c = rows[0];
    expect(c.segLine).toBe(true);
    expect(c.segPhone).toBe(true);
    expect(c.segCrm).toBe(true);
    expect(c.lineSales).toBe(100);
    expect(c.phoneSales).toBe(50);
    expect(c.mainChannel).toBeTruthy();
  });

  it('โปรไฟล์ผูกข้อมูลติดต่อ + contact_channel ทำให้เป็นสมาชิก CRM แม้ยังไม่มีออเดอร์ช่องนั้น', () => {
    const rows = buildDirectory(
      [{ customer_code: 'C9', name: 'ลูกค้าเก้า', phone: '0812345678', contact_channel: 'Phone', lifetime_sales: 0, lifetime_orders: 0 }],
      [],
      asOf,
    );
    const c = rows.find(r => r.key === 'C9');
    expect(c.contact).toBe('0812345678');
    expect(c.hasContact).toBe(true);
    expect(c.segPhone).toBe(true);
    expect(c.segCrm).toBe(true);
  });

  it('โปรไฟล์เก่าไม่มีออเดอร์สด → โชว์ยอดสะสมเดิม (lifetime)', () => {
    const rows = buildDirectory(
      [{ customer_code: 'CE1', name: 'เก่า', lifetime_sales: 5000, lifetime_orders: 4 }],
      [],
      asOf,
    );
    const c = rows.find(r => r.key === 'CE1');
    expect(c.sales).toBe(5000);
    expect(c.count).toBe(4);
  });

  it('เรียงยอดมาก → น้อย + ติด tier ที่ถูกต้อง', () => {
    const rows = buildDirectory([], [
      order({ order_no: 'B1', customer_code: 'C2', customer_name: 'น้อย', sales: 10 }),
      order({ order_no: 'A1', customer_code: 'C1', customer_name: 'มาก', sales: 900 }),
    ], asOf);
    expect(rows.map(r => r.key)).toEqual(['C1', 'C2']);
    rows.forEach(r => expect(TIERS).toContain(r.tier));
  });
});
