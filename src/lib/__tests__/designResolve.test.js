import { describe, it, expect } from 'vitest';
import { makeSkuResolver, progressiveBase, baseCode, skuOverrideKey } from '../designResolve.js';
import { GOLDEN_DESIGNS } from '../shirtCatalog.js';

describe('baseCode / progressiveBase', () => {
  it('baseCode ตัดสี/ไซซ์', () => expect(baseCode('JKN111-S-XS')).toBe('JKN111'));
  it('progressiveBase ถอด segment ท้ายจนเจอ (กัน JRP-111 → JRP)', () => {
    const has = c => c === 'JRP-111';
    expect(progressiveBase('JRP-111-WH-XS', has)).toBe('JRP-111');
  });
  it('progressiveBase ไม่เจอ → ""', () => expect(progressiveBase('ZZZ-9', () => false)).toBe(''));
});

describe('makeSkuResolver (ladder + fallback)', () => {
  it('1) override รายบรรทัดชนะทุกอย่าง', () => {
    const key = skuOverrideKey('O1', 'ข้อความดิบ');
    const R = makeSkuResolver({ skuOverrides: { [key]: { design: 'พิเศษ', product_code: 'ZZZ' } } });
    const r = R({ order_no: 'O1', raw_sku_or_name: 'ข้อความดิบ', product_code: 'JKN111', design: 'frozen' });
    expect(r.source).toBe('override');
    expect(r.design).toBe('พิเศษ');
    expect(r.product_code).toBe('ZZZ');
  });
  it('2) catalog สด ผ่าน product_code (progressive)', () => {
    const R = makeSkuResolver({ catalogByCode: { JKN111: { code: 'JKN111', name: 'มะลิ' } } });
    const r = R({ product_code: 'JKN111-S-XL', design: 'frozen' });
    expect(r.source).toBe('catalog');
    expect(r.design).toBe('มะลิ');
  });
  it('3) alias สด ผ่านข้อความ raw', () => {
    const R = makeSkuResolver({ aliasMap: { เสื้อกก: { design: 'ลายกก', code: 'AAA' } } });
    const r = R({ raw_sku_or_name: 'เสื้อ กก', product_code: '', design: 'frozen' });
    expect(r.source).toBe('alias');
    expect(r.design).toBe('ลายกก');
  });
  it('4) golden by code — ลายจริงจาก GOLDEN_DESIGNS', () => {
    const g0 = GOLDEN_DESIGNS[0];
    const R = makeSkuResolver({});
    const r = R({ product_code: g0.code, design: 'frozen' });
    expect(r.source).toBe('golden');
    expect(r.design).toBe(g0.name);
  });
  it('5) frozen fallback เมื่อไม่ match อะไรเลย', () => {
    const R = makeSkuResolver({});
    const r = R({ product_code: 'NO-SUCH-CODE-XYZ', design: 'ชื่อ frozen' });
    expect(r.source).toBe('frozen');
    expect(r.design).toBe('ชื่อ frozen');
  });
});
