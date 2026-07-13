import { describe, it, expect } from 'vitest';
import { compute, geoBreakdown, regionBreakdown, normSize, normColor, sizeRank } from '../saleAgg.js';

const FULL_F = {
  from: '2026-07-01', to: '2026-07-31',
  channel: [], payment_type: [], customer_type: [], qty_band: [], salesperson: [],
  province: [], source: [], job_type: [], design: [], product_code: [], size: [], color: [], type: [],
};

const ORDERS = [
  { order_no: 'O1', channel: 'Facebook', salesperson: 'A', province: 'กรุงเทพมหานคร', customer_type: 'ลูกค้าใหม่', qty: 1, sales: 100, order_date: '2026-07-10', status: 'confirmed', customer_code: 'C1', payment_type: 'โอน', job_type: 'ปลีก' },
  { order_no: 'O2', channel: 'LINE', salesperson: 'B', province: 'เชียงใหม่', customer_type: 'ลูกค้าเก่า', qty: 2, sales: 200, order_date: '2026-07-12', status: 'confirmed', customer_code: 'C2', payment_type: 'COD', cod_amount: 200, job_type: 'ปลีก' },
  { order_no: 'O3', channel: 'Facebook', salesperson: 'A', province: 'กรุงเทพมหานคร', customer_type: 'ลูกค้าใหม่', qty: 1, sales: 999, order_date: '2026-07-15', status: 'cancelled', customer_code: 'C3', job_type: 'ปลีก' },
];
const SKUS = [
  { order_no: 'O1', design: 'มะลิ', color: 'ขาว', size: 'M', qty: 1, line_sales: 100, product_code: 'JKN111' },
  { order_no: 'O2', design: 'กุหลาบ', color: 'กรม', size: 'XL', qty: 2, line_sales: 200, product_code: 'JRP111' },
];

describe('normSize / normColor / sizeRank', () => {
  it('normSize ตัดคำ "ไซซ์" นำหน้า', () => expect(normSize('ไซซ์ XL')).toBe('XL'));
  it('normSize ว่าง → ไม่ระบุ', () => expect(normSize('')).toBe('ไม่ระบุ'));
  it('normColor alias กรม → กรมท่า', () => expect(normColor('กรม')).toBe('กรมท่า'));
  it('normColor ตัดไซซ์ที่ปนท้ายสี ("กรมท่า XL" → กรมท่า)', () => expect(normColor('กรมท่า XL')).toBe('กรมท่า'));
  it('sizeRank เรียงถูก (XS<S<XL)', () => {
    expect(sizeRank('XS')).toBe(0);
    expect(sizeRank('S')).toBe(1);
    expect(sizeRank('S')).toBeLessThan(sizeRank('XL'));
  });
});

describe('compute — KPI + มิติ', () => {
  const A = compute(ORDERS, SKUS, FULL_F);
  it('ยอด/ออเดอร์/จำนวน ไม่นับที่ยกเลิก', () => {
    expect(A.kpi.sales).toBe(300);
    expect(A.kpi.orders).toBe(2);
    expect(A.kpi.qty).toBe(3);
  });
  it('ลูกค้าใหม่/เก่า + %ใหม่', () => {
    expect(A.kpi.newC).toBe(1);
    expect(A.kpi.oldC).toBe(1);
    expect(A.kpi.newPct).toBeCloseTo(0.5);
  });
  it('COD + ยกเลิกในช่วง', () => {
    expect(A.kpi.codO).toBe(1);
    expect(A.kpi.cancelled).toBe(1);
  });
  it('byChannel เรียงยอดมากก่อน', () => {
    expect(A.byChannel.map(x => x.key)).toEqual(['LINE', 'Facebook']);
    expect(A.byChannel[0].sales).toBe(200);
  });
  it('bySalesperson 2 คน', () => expect(A.bySalesperson.map(x => x.key).sort()).toEqual(['A', 'B']));
  it('byColor ใช้ normColor (กรม → กรมท่า)', () => {
    expect(A.byColor.map(x => x.key).sort()).toEqual(['กรมท่า', 'ขาว']);
  });
});

describe('geoBreakdown / regionBreakdown — invariant', () => {
  const A = compute(ORDERS, SKUS, FULL_F);
  const bd = geoBreakdown(A._ords, A._skus);
  it('geoBreakdown แยก 2 จังหวัด', () => expect(bd.provinces.length).toBe(2));
  it('invariant: Σ regions.sales + noProvinceSales === total.sales', () => {
    const rb = regionBreakdown(bd);
    const sumReg = rb.regions.reduce((a, r) => a + r.sales, 0);
    expect(sumReg + bd.noProvinceSales).toBeCloseTo(bd.total.sales);
  });
});
