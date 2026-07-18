import { describe, it, expect } from 'vitest';
import { normalizeProvince, provinceFromPostcode, PROVINCE_TH_SHORT } from '../provinces.js';

/* feedback ทีมเซลล์: ที่อยู่ Shipnity เขียนจังหวัดย่อ (กทม/ปทุม/สุราษ) → "ไม่มีจังหวัด" ต้องแก้มือ
   fix = ชื่อย่อไทยเข้า index กลาง + fallback รหัสไปรษณีย์ → ครอบทั้งชื่อย่อและชื่อเต็ม */

describe('normalizeProvince — ชื่อย่อไทยที่คนเขียนจริง', () => {
  it('ชื่อย่อยอดฮิต → ชื่อเต็ม', () => {
    expect(normalizeProvince('กทม')).toBe('กรุงเทพมหานคร');
    expect(normalizeProvince('ปทุม')).toBe('ปทุมธานี');
    expect(normalizeProvince('สุราษ')).toBe('สุราษฎร์ธานี');
    expect(normalizeProvince('สุราษฎร์')).toBe('สุราษฎร์ธานี');
    expect(normalizeProvince('อยุธยา')).toBe('พระนครศรีอยุธยา');
    expect(normalizeProvince('โคราช')).toBe('นครราชสีมา');
    expect(normalizeProvince('อุบล')).toBe('อุบลราชธานี');
    expect(normalizeProvince('นครศรี')).toBe('นครศรีธรรมราช');
    expect(normalizeProvince('ประจวบ')).toBe('ประจวบคีรีขันธ์');
  });
  it('ชื่อเต็มยังทำงานเหมือนเดิม', () => {
    expect(normalizeProvince('ปทุมธานี')).toBe('ปทุมธานี');
    expect(normalizeProvince('จังหวัดเชียงใหม่')).toBe('เชียงใหม่');
    expect(normalizeProvince('กรุงเทพฯ')).toBe('กรุงเทพมหานคร');
  });
  it('ทุกชื่อย่อในลิสต์ resolve ได้', () => {
    for (const [s, full] of PROVINCE_TH_SHORT) expect(normalizeProvince(s)).toBe(full);
  });
});

describe('provinceFromPostcode — รหัสไปรษณีย์ → จังหวัด', () => {
  it('รหัสหลัก', () => {
    expect(provinceFromPostcode('12000')).toBe('ปทุมธานี');
    expect(provinceFromPostcode('13160')).toBe('พระนครศรีอยุธยา');
    expect(provinceFromPostcode('84000')).toBe('สุราษฎร์ธานี');
    expect(provinceFromPostcode('48000')).toBe('นครพนม');
    expect(provinceFromPostcode('50000')).toBe('เชียงใหม่');
    expect(provinceFromPostcode('90110')).toBe('สงขลา');
  });
  it('10xxx แยก กทม/สมุทรปราการ ถูก', () => {
    expect(provinceFromPostcode('10240')).toBe('กรุงเทพมหานคร');
    expect(provinceFromPostcode('10270')).toBe('สมุทรปราการ');
    expect(provinceFromPostcode('10540')).toBe('สมุทรปราการ');
  });
  it('ค่าที่ไม่ใช่ zip → null', () => {
    expect(provinceFromPostcode('123')).toBeNull();
    expect(provinceFromPostcode('99999')).toBeNull();
    expect(provinceFromPostcode('')).toBeNull();
  });
});
