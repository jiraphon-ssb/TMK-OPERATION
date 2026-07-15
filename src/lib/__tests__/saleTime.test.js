import { describe, it, expect } from 'vitest';
import {
  presetRange, bucketKey, enumerateBuckets, autoGran,
  diffDays, addDays, inRange, weekStart, quarterOf,
} from '../saleTime.js';

// Characterization tests — ล็อก logic วันที่/ช่วงเวลาที่ใช้ทั่วรายงาน Sale
describe('diffDays / addDays', () => {
  it('diffDays นับผลต่างวัน', () => expect(diffDays('2026-07-01', '2026-07-10')).toBe(9));
  it('diffDays เท่ากัน = 0', () => expect(diffDays('2026-07-01', '2026-07-01')).toBe(0));
  it('addDays ข้ามเดือน', () => expect(addDays('2026-07-31', 1)).toBe('2026-08-01'));
  it('addDays ถอยหลัง', () => expect(addDays('2026-07-01', -1)).toBe('2026-06-30'));
});

describe('inRange', () => {
  it('อยู่ในช่วง = true', () => expect(inRange('2026-07-05', '2026-07-01', '2026-07-31')).toBe(true));
  it('นอกช่วง = false', () => expect(inRange('2026-08-01', '2026-07-01', '2026-07-31')).toBe(false));
  it('ไม่มีขอบ = true', () => expect(inRange('2026-07-05', null, null)).toBe(true));
  it('ค่าว่าง = falsy', () => expect(inRange('', '2026-07-01', null)).toBeFalsy());
});

describe('quarterOf', () => {
  it('ก.ค. = Q3', () => expect(quarterOf('2026-07-15')).toEqual({ year: 2026, q: 3 }));
  it('ม.ค. = Q1', () => expect(quarterOf('2026-01-01')).toEqual({ year: 2026, q: 1 }));
  it('ธ.ค. = Q4', () => expect(quarterOf('2026-12-31')).toEqual({ year: 2026, q: 4 }));
});

describe('bucketKey', () => {
  it('day = ตัวมันเอง', () => expect(bucketKey('2026-07-15', 'day')).toBe('2026-07-15'));
  it('month = YYYY-MM', () => expect(bucketKey('2026-07-15', 'month')).toBe('2026-07'));
  it('quarter = YYYY-Qn', () => expect(bucketKey('2026-07-15', 'quarter')).toBe('2026-Q3'));
  it('week idempotent + วันในสัปดาห์เดียวกัน bucket ตรงกัน', () => {
    const w = weekStart('2026-07-15');
    expect(weekStart(w)).toBe(w);
    // จันทร์ต้นสัปดาห์ + 6 วัน = ยังสัปดาห์เดียวกัน
    expect(bucketKey(w, 'week')).toBe(bucketKey(addDays(w, 6), 'week'));
  });
});

describe('enumerateBuckets', () => {
  it('day = ต่อเนื่องทุกวัน', () => {
    expect(enumerateBuckets('2026-07-01', '2026-07-03', 'day')).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
  });
  it('month = เดือนต่อเนื่อง (เติมช่องว่าง)', () => {
    expect(enumerateBuckets('2026-06-15', '2026-08-10', 'month')).toEqual(['2026-06', '2026-07', '2026-08']);
  });
});

describe('autoGran', () => {
  it('<=31 วัน → day', () => expect(autoGran('2026-07-01', '2026-07-31')).toBe('day'));
  it('32-120 วัน → week', () => expect(autoGran('2026-07-01', '2026-08-01')).toBe('week'));
  it('121-730 วัน → month', () => expect(autoGran('2026-01-01', '2026-05-01')).toBe('month'));
  it('>730 วัน → quarter', () => expect(autoGran('2024-01-01', '2026-01-01')).toBe('quarter'));
});

describe('presetRange', () => {
  const TODAY = '2026-07-15';
  it('today', () => expect(presetRange('today', TODAY)).toEqual({ from: '2026-07-15', to: '2026-07-15' }));
  it('d7 = 7 วันล่าสุด', () => expect(presetRange('d7', TODAY)).toEqual({ from: '2026-07-09', to: '2026-07-15' }));
  it('d30 = 30 วันล่าสุด', () => expect(presetRange('d30', TODAY)).toEqual({ from: '2026-06-16', to: '2026-07-15' }));
  it('month = ต้นเดือนถึงวันนี้', () => expect(presetRange('month', TODAY)).toEqual({ from: '2026-07-01', to: '2026-07-15' }));
  it('quarter = ต้นไตรมาสถึงวันนี้', () => expect(presetRange('quarter', TODAY)).toEqual({ from: '2026-07-01', to: '2026-07-15' }));
  it('ytd = ต้นปีถึงวันนี้', () => expect(presetRange('ytd', TODAY)).toEqual({ from: '2026-01-01', to: '2026-07-15' }));
  it('all = ขอบข้อมูล', () => expect(presetRange('all', TODAY, '2026-01-01', '2026-12-31')).toEqual({ from: '2026-01-01', to: '2026-12-31' }));
  it('clamp ต้นช่วงไม่ต่ำกว่า dataMin', () => expect(presetRange('d30', TODAY, '2026-07-10')).toEqual({ from: '2026-07-10', to: '2026-07-15' }));
  it('ไม่ clamp ปลายช่วงที่ dataMax', () => expect(presetRange('month', TODAY, null, '2026-07-10')).toEqual({ from: '2026-07-01', to: '2026-07-15' }));
  it('ไม่มี today (race) → ขอบข้อมูล', () => expect(presetRange('month', '', '2026-02-01', '2026-09-09')).toEqual({ from: '2026-02-01', to: '2026-09-09' }));
});
