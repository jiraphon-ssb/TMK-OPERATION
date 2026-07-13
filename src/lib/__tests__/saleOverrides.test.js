import { describe, it, expect } from 'vitest';
import { mergeOrderOverrides, ORDER_OV_KEY, resolveSkuDesigns } from '../saleOverrides.js';

describe('ORDER_OV_KEY', () => {
  it('source:order_no', () => expect(ORDER_OV_KEY({ source: 'shipnity', order_no: 'K1' })).toBe('shipnity:K1'));
  it('source ว่าง → ":K1"', () => expect(ORDER_OV_KEY({ order_no: 'K1' })).toBe(':K1'));
});

describe('mergeOrderOverrides', () => {
  const orders = [{ source: 'shipnity', order_no: 'K1', salesperson: 'A', sales: 100, qty: 1, job_type: 'ปลีก', note: '', channel: 'Facebook', payment_type: 'โอน', province: 'x', order_date: '2026-07-01', cod_amount: 0, customer_name: 'ชื่อ' }];
  it('ovMap ว่าง → array เดิม (อ้างอิงเดิม)', () => expect(mergeOrderOverrides(orders, {})).toBe(orders));
  it('override เซลล์/ยอด ชนะ · ช่องที่ไม่แก้คงค่าไฟล์', () => {
    const m = mergeOrderOverrides(orders, { 'shipnity:K1': { salesperson: 'B', sales: 250 } });
    expect(m[0].salesperson).toBe('B');
    expect(m[0].sales).toBe(250);
    expect(m[0].qty).toBe(1);
  });
  it('override ค่าว่าง ("") → fallback ค่าไฟล์', () => {
    const m = mergeOrderOverrides(orders, { 'shipnity:K1': { sales: '', channel: '' } });
    expect(m[0].sales).toBe(100);
    expect(m[0].channel).toBe('Facebook');
  });
  it('DFT re-derive จากหมายเหตุ override', () => {
    const m = mergeOrderOverrides(orders, { 'shipnity:K1': { note: 'งาน dft' } });
    expect(m[0].job_type).toBe('DFT');
  });
  it('ออเดอร์ที่ไม่มี override → object เดิม (อ้างอิงเดิม)', () => {
    const m = mergeOrderOverrides(orders, { 'shipnity:OTHER': { sales: 9 } });
    expect(m[0]).toBe(orders[0]);
  });
});

describe('resolveSkuDesigns', () => {
  const resolver = (x) => x.product_code === 'OV'
    ? { design: 'พิเศษ', product_code: 'JSK01-WH-XL', source: 'override' }
    : { design: 'มะลิ', product_code: x.product_code, source: 'catalog' };
  it('map design/product_code + คง color/size', () => {
    const out = resolveSkuDesigns([{ order_no: 'K1', product_code: 'JKN111', design: 'frozen', color: 'ขาว', size: 'M' }], resolver);
    expect(out[0].design).toBe('มะลิ');
    expect(out[0]._resolveSrc).toBe('catalog');
    expect(out[0].color).toBe('ขาว');
  });
  it('deriveColorSize เฉพาะ source=override', () => {
    const derive = () => ({ color: 'กรมท่า', size: 'XL' });
    const out = resolveSkuDesigns([{ order_no: 'K1', product_code: 'OV', color: '', size: '' }], resolver, { deriveColorSize: derive });
    expect(out[0].color).toBe('กรมท่า');
    expect(out[0].size).toBe('XL');
  });
});
