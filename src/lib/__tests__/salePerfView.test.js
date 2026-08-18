import { describe, it, expect } from 'vitest';
import { fmtB, TH_MON, monthLabel, prevMonthOf, MEDAL, closeTone, pickVoice } from '../salePerfView.js';

describe('salePerfView helpers', () => {
  describe('monthLabel', () => {
    it('แปลง YYYY-MM → เดือนไทย + พ.ศ.', () => {
      expect(monthLabel('2026-08')).toBe('ส.ค. 2569'); // 2026 + 543
      expect(monthLabel('2026-01')).toBe('ม.ค. 2569');
      expect(monthLabel('2025-12')).toBe('ธ.ค. 2568');
    });
    it('เดือนนอกช่วง (00) → คืนสตริงเดือนดิบ', () => {
      expect(monthLabel('2026-00')).toBe('00 2569');
    });
  });

  describe('prevMonthOf', () => {
    it('เดือนก่อนหน้าในปีเดียวกัน', () => {
      expect(prevMonthOf('2026-08')).toBe('2026-07');
      expect(prevMonthOf('2026-12')).toBe('2026-11');
    });
    it('ข้ามปี: มกราคม → ธันวาคมปีก่อน', () => {
      expect(prevMonthOf('2026-01')).toBe('2025-12');
    });
    it('เติม 0 ให้เดือนเลขเดียว', () => {
      expect(prevMonthOf('2026-10')).toBe('2026-09');
    });
  });

  describe('closeTone', () => {
    it('null → สีเทา (ไม่มีข้อมูล)', () => {
      expect(closeTone(null)).toBe('var(--ink-4)');
      expect(closeTone(undefined)).toBe('var(--ink-4)');
    });
    it('>= 15 → good (รวมขอบ)', () => {
      expect(closeTone(15)).toBe('var(--good)');
      expect(closeTone(30)).toBe('var(--good)');
    });
    it('8..15 → warn (รวมขอบล่าง)', () => {
      expect(closeTone(8)).toBe('var(--warn)');
      expect(closeTone(14.9)).toBe('var(--warn)');
    });
    it('< 8 → bad', () => {
      expect(closeTone(7.9)).toBe('var(--bad)');
      expect(closeTone(0)).toBe('var(--bad)');
    });
  });

  describe('pickVoice', () => {
    it('คืน voice แรกที่มีเนื้อหา (ask/praise/complaint)', () => {
      const rows = [
        { voice: null },
        { voice: {} },
        { voice: { ask: '', praise: '', complaint: '' } },
        { voice: { praise: 'ชอบลายนี้' } },
        { voice: { ask: 'มีไซซ์ไหม' } },
      ];
      expect(pickVoice(rows)).toEqual({ praise: 'ชอบลายนี้' });
    });
    it('ไม่มีแถวที่มีเนื้อหา → null', () => {
      expect(pickVoice([{ voice: null }, { voice: {} }])).toBeNull();
      expect(pickVoice([])).toBeNull();
      expect(pickVoice(null)).toBeNull();
      expect(pickVoice(undefined)).toBeNull();
    });
    it('จับ complaint เดี่ยวได้', () => {
      expect(pickVoice([{ voice: { complaint: 'ส่งช้า' } }])).toEqual({ complaint: 'ส่งช้า' });
    });
  });

  describe('fmtB', () => {
    it('คืนสตริงเสมอ', () => {
      expect(typeof fmtB(1234)).toBe('string');
    });
    it('ค่าที่ไม่ใช่ตัวเลข → เท่ากับ 0 (Number(n) || 0)', () => {
      const zero = fmtB(0);
      expect(fmtB(null)).toBe(zero);
      expect(fmtB(undefined)).toBe(zero);
      expect(fmtB('abc')).toBe(zero);
      expect(fmtB(NaN)).toBe(zero);
    });
  });

  describe('const tables', () => {
    it('TH_MON มี 12 เดือน', () => {
      expect(TH_MON).toHaveLength(12);
      expect(TH_MON[0]).toBe('ม.ค.');
      expect(TH_MON[11]).toBe('ธ.ค.');
    });
    it('MEDAL มี 3 สี (ทอง/เงิน/ทองแดง)', () => {
      expect(MEDAL).toHaveLength(3);
      MEDAL.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
    });
  });
});
