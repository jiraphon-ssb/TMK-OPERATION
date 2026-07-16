import { describe, it, expect } from 'vitest';
import { mergeOrderOverrides, ORDER_OV_KEY, resolveSkuDesigns, applyOrderRowPatch, removeOrderRow } from '../saleOverrides.js';

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

describe('applyOrderRowPatch / removeOrderRow — REALTIME C2 (patch == refetch)', () => {
  const rawOrders = [
    { source: 'shipnity', order_no: 'A1', sales: 100, qty: 1, note: '', channel: 'facebook' },
    { source: 'shipnity', order_no: 'A2', sales: 200, qty: 2, note: '', channel: 'tiktok' },
    { source: 'mp', order_no: 'A3', sales: 300, qty: 3, note: '', channel: 'shopee' },
  ];
  const ovMap = { 'shipnity:A2': { sales: 250, salesperson: 'นิด' } }; // A2 มี override

  it('UPDATE 1 แถว → เท่ากับ refetch+remerge ทั้งตาราง (per-order independent)', () => {
    const patchedRaw = { ...rawOrders[1], qty: 9 }; // แก้ A2
    const fullRefetch = mergeOrderOverrides(
      rawOrders.map(o => ORDER_OV_KEY(o) === 'shipnity:A2' ? patchedRaw : o), ovMap,
    );
    const patched = applyOrderRowPatch(mergeOrderOverrides(rawOrders, ovMap), patchedRaw, ovMap);
    expect(patched).toEqual(fullRefetch); // พิสูจน์: patch == refetch
  });

  it('UPDATE คง override (A2 sales=250 จาก ov ไม่ใช่ raw)', () => {
    const patched = applyOrderRowPatch(mergeOrderOverrides(rawOrders, ovMap), { ...rawOrders[1], qty: 9 }, ovMap);
    const a2 = patched.find(o => o.order_no === 'A2');
    expect(a2.sales).toBe(250); // override ชนะ
    expect(a2.qty).toBe(9);     // raw ใหม่
  });

  it('UPDATE แถวอื่นคง ref เดิม (patch เฉพาะแถวที่เปลี่ยน)', () => {
    const merged = mergeOrderOverrides(rawOrders, ovMap);
    const patched = applyOrderRowPatch(merged, { ...rawOrders[0], sales: 111 }, ovMap);
    expect(patched[1]).toBe(merged[1]); // A2 ref เดิม (ไม่ถูกแตะ)
    expect(patched[2]).toBe(merged[2]); // A3 ref เดิม
  });

  it('INSERT row ใหม่ → prepend', () => {
    const merged = mergeOrderOverrides(rawOrders, ovMap);
    const patched = applyOrderRowPatch(merged, { source: 'mp', order_no: 'NEW', sales: 500 }, ovMap);
    expect(patched.length).toBe(4);
    expect(patched[0].order_no).toBe('NEW');
  });

  it('DELETE → remove by key', () => {
    const merged = mergeOrderOverrides(rawOrders, ovMap);
    const out = removeOrderRow(merged, 'shipnity:A2');
    expect(out.map(o => o.order_no)).toEqual(['A1', 'A3']);
  });
});
