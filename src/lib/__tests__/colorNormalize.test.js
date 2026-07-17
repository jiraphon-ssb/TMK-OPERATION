import { describe, it, expect } from 'vitest';
import { restoreColorMarks, COLOR_LOST_MARK_MAP } from '../shirtCatalog.js';
import { cleanColor, deriveColorSize } from '../mpReport.js';
import { normColor } from '../saleAgg.js';

/* บั๊ก: ฟอนต์ใบเสร็จ Shipnity map วรรณยุกต์เป็น \0 → parser strip → "ฟ้า" กลายเป็น "ฟา"
   ไหลเข้าเมทริกซ์/กราฟเป็นสีแยก · fix = กู้จากคำศัพท์สีปิด ทั้งฝั่งเขียน (cleanColor) + อ่าน (normColor) */

describe('restoreColorMarks — กู้วรรณยุกต์หายจากคำศัพท์สีปิด', () => {
  it('วรรณยุกต์หาย → กู้เป็นสีถูก', () => {
    expect(restoreColorMarks('ฟา')).toBe('ฟ้า');
    expect(restoreColorMarks('มวง')).toBe('ม่วง');
    expect(restoreColorMarks('สม')).toBe('ส้ม');
    expect(restoreColorMarks('กรมทา')).toBe('กรมท่า');
  });
  it('นิคหิตหาย (ำ→า): ดา→ดำ · นาเงิน→น้ำเงิน', () => {
    expect(restoreColorMarks('ดา')).toBe('ดำ');
    expect(restoreColorMarks('นาเงน')).toBe('น้ำเงิน');
    expect(restoreColorMarks('นำเงน')).toBe('น้ำเงิน');
  });
  it('สีผสม "ดำ-ฟา" → กู้รายส่วน', () => {
    expect(restoreColorMarks('ดำ-ฟา')).toBe('ดำ-ฟ้า');
    expect(restoreColorMarks('ขาว/มวง')).toBe('ขาว/ม่วง');
  });
  it('สีถูกอยู่แล้ว / คำที่ไม่ใช่สี → ไม่แตะ', () => {
    expect(restoreColorMarks('ฟ้า')).toBe('ฟ้า');
    expect(restoreColorMarks('ขาว')).toBe('ขาว');
    expect(restoreColorMarks('จันทกานต์')).toBe('จันทกานต์');
    expect(restoreColorMarks('')).toBe('');
  });
  it('key ที่ยาวกว่า (ฟ้าอ่อน) ไม่โดน ฟ้า กิน', () => {
    expect(restoreColorMarks('ฟาออน')).toBe('ฟ้าอ่อน');
    expect(restoreColorMarks('เทาออน')).toBe('เทาอ่อน');
  });
  it('map ไม่มี key ที่เป็นสีถูกเอง (กัน canonical โดน remap)', () => {
    for (const k of Object.keys(COLOR_LOST_MARK_MAP)) {
      expect(COLOR_LOST_MARK_MAP[k]).not.toBe(k);
    }
  });
});

describe('cleanColor — ฝั่งเขียน (derive ใบเสร็จ/import)', () => {
  it('สีฟา → ฟ้า (ตัดคำนำ "สี" + กู้วรรณยุกต์)', () => {
    expect(cleanColor('สีฟา')).toBe('ฟ้า');
    expect(cleanColor('ฟา')).toBe('ฟ้า');
    expect(cleanColor('มวง')).toBe('ม่วง');
  });
  it('deriveColorSize จากวงเล็บชื่อที่วรรณยุกต์หาย', () => {
    expect(deriveColorSize('ดารารัตน์ (ฟา-L)', '')).toEqual({ color: 'ฟ้า', size: 'L' });
    expect(deriveColorSize('จันทกานต์ (มวง-XL)', '')).toEqual({ color: 'ม่วง', size: 'XL' });
  });
});

describe('normColor — ฝั่งอ่าน (aggregate · ครอบข้อมูลเก่าใน DB)', () => {
  it('"ฟา" ใน DB → นับรวมกับ "ฟ้า" ในเมทริกซ์/กราฟ', () => {
    expect(normColor('ฟา')).toBe('ฟ้า');
    expect(normColor('ฟ้า')).toBe('ฟ้า');
  });
  it('ตัดไซซ์ท้ายก่อนกู้: "ฟา XL" → ฟ้า', () => {
    expect(normColor('ฟา XL')).toBe('ฟ้า');
    expect(normColor('มวง-2XL')).toBe('ม่วง');
  });
  it('พฤติกรรมเดิมคงอยู่: กรม→กรมท่า · ว่าง→ไม่ระบุ', () => {
    expect(normColor('กรม')).toBe('กรมท่า');
    expect(normColor('')).toBe('ไม่ระบุ');
  });
});
