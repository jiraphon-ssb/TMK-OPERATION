import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DIM_FIELDS, thisMonthRange, emptyF, activeFilterCount, loadF, saveF,
  isoToDate, dateToIso, fmtTh, fmtRange, baht, COLOR_HEX, PAY_HEX, tierTone,
} from '../saleDashboardHelpers.js';

// ---------- ตัวกรอง ----------
describe('DIM_FIELDS + emptyF + activeFilterCount', () => {
  it('emptyF มีทุกมิติเป็น array ว่าง + ช่วง from/to = เดือนนี้', () => {
    const f = emptyF();
    DIM_FIELDS.forEach(k => expect(f[k]).toEqual([]));
    expect(f.from).toMatch(/^\d{4}-\d{2}-01$/);      // ต้นเดือน
    expect(f.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(f.from.slice(0, 7)).toBe(f.to.slice(0, 7)); // เดือนเดียวกัน
  });

  it('thisMonthRange = 1 ของเดือน → วันนี้', () => {
    const r = thisMonthRange();
    const d = new Date();
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0');
    expect(r.from).toBe(`${y}-${m}-01`);
    expect(r.to).toBe(`${y}-${m}-${String(d.getDate()).padStart(2, '0')}`);
  });

  it('activeFilterCount นับผลรวมความยาวทุกมิติ (ข้าม from/to)', () => {
    expect(activeFilterCount(emptyF())).toBe(0);
    expect(activeFilterCount({ ...emptyF(), channel: ['LINE', 'FB'], size: ['M'] })).toBe(3);
  });

  it('activeFilterCount ทน field ที่ไม่มี/undefined', () => {
    expect(activeFilterCount({})).toBe(0);
  });
});

// ---------- persist (localStorage) ----------
describe('loadF / saveF', () => {
  beforeEach(() => {
    const store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    });
  });

  it('saveF เก็บเฉพาะ dims ที่มีค่า (ไม่เก็บ from/to)', () => {
    saveF({ ...emptyF(), channel: ['LINE'], size: [] });
    const raw = JSON.parse(localStorage.getItem('tmk-sale-f'));
    expect(raw).toEqual({ channel: ['LINE'] });
    expect(raw.from).toBeUndefined();
    expect(raw.size).toBeUndefined();
  });

  it('loadF คืน dims ที่บันทึกไว้ + ช่วงเวลา default เป็นเดือนนี้เสมอ', () => {
    saveF({ ...emptyF(), salesperson: ['bee'] });
    const f = loadF();
    expect(f.salesperson).toEqual(['bee']);
    expect(f.from).toMatch(/^\d{4}-\d{2}-01$/); // ไม่ persist ช่วง → เดือนนี้
  });

  it('loadF คืนค่าเริ่มต้นเมื่อไม่มีข้อมูล/JSON พัง', () => {
    expect(activeFilterCount(loadF())).toBe(0);          // ว่าง
    localStorage.setItem('tmk-sale-f', '{bad json');
    expect(activeFilterCount(loadF())).toBe(0);          // ทน parse error
  });
});

// ---------- format วันที่ ----------
describe('isoToDate / dateToIso (roundtrip local)', () => {
  it('isoToDate สร้าง Date ท้องถิ่นตรงวัน', () => {
    const d = isoToDate('2026-06-09');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);   // มิ.ย. = index 5
    expect(d.getDate()).toBe(9);
  });
  it('dateToIso pad เดือน/วันเป็น 2 หลัก', () => {
    expect(dateToIso(new Date(2026, 0, 3))).toBe('2026-01-03');
  });
  it('roundtrip iso → date → iso คงเดิม', () => {
    expect(dateToIso(isoToDate('2026-12-25'))).toBe('2026-12-25');
  });
  it('ค่าว่างคืน undefined/null', () => {
    expect(isoToDate('')).toBeUndefined();
    expect(dateToIso(null)).toBeNull();
  });
});

describe('fmtTh', () => {
  it('แปลง ISO → วันไทยย่อ', () => {
    expect(fmtTh('2026-06-01')).toBe('1 มิ.ย. 2026');
    expect(fmtTh('2026-01-15')).toBe('15 ม.ค. 2026');
    expect(fmtTh('2026-12-31')).toBe('31 ธ.ค. 2026');
  });
  it('ค่าว่างคืน ?', () => {
    expect(fmtTh('')).toBe('?');
  });
});

describe('fmtRange (กระชับตามความสัมพันธ์เดือน/ปี)', () => {
  it('เดือนเดียวกัน → "1–26 มิ.ย. 2026"', () => {
    expect(fmtRange('2026-06-01', '2026-06-26')).toBe('1–26 มิ.ย. 2026');
  });
  it('คนละเดือน ปีเดียวกัน → "1 มิ.ย. – 26 ก.ค. 2026"', () => {
    expect(fmtRange('2026-06-01', '2026-07-26')).toBe('1 มิ.ย. – 26 ก.ค. 2026');
  });
  it('คนละปี → ช่วงเต็มทั้งสองฝั่ง', () => {
    expect(fmtRange('2025-12-01', '2026-01-05')).toBe('1 ธ.ค. 2025 – 5 ม.ค. 2026');
  });
  it('ขาด from/to → ค่าว่าง', () => {
    expect(fmtRange('', '2026-06-01')).toBe('');
    expect(fmtRange('2026-06-01', null)).toBe('');
  });
});

// ---------- เงิน + ค่าคงที่สี ----------
describe('baht', () => {
  it('จำนวนเต็มไม่มีทศนิยมรก', () => {
    expect(baht(9743)).toBe('฿9,743');
  });
  it('มีเศษสตางค์เอามาครบ 2 หลัก', () => {
    expect(baht(696.5)).toBe('฿696.50');
    expect(baht(696.43)).toBe('฿696.43');
  });
  it('null/undefined/NaN → ฿0 (coerce 0)', () => {
    expect(baht(null)).toBe('฿0');
    expect(baht(undefined)).toBe('฿0');
    expect(baht(NaN)).toBe('฿0');
  });
});

describe('ค่าคงที่สี', () => {
  it('COLOR_HEX ครอบสีหลัก', () => {
    expect(COLOR_HEX['ขาว']).toBe('#dcdce0');
    expect(COLOR_HEX['ดำ']).toBe('#2a2a2e');
  });
  it('PAY_HEX โอน=เขียว COD=ส้ม', () => {
    expect(PAY_HEX['โอน']).toBe('#2f9e6e');
    expect(PAY_HEX['COD']).toBe('#e0772f');
    expect(PAY_HEX['เก็บปลายทาง']).toBe('#e0772f');
  });
  it('tierTone มีครบ 4 ระดับ', () => {
    expect(Object.keys(tierTone)).toEqual(['เพชร', 'ทอง', 'เงิน', 'ทองแดง']);
  });
});
