import { describe, it, expect } from 'vitest';
import { computeMonthPure } from '../computeMonthPure.js';

// Characterization tests — ล็อกพฤติกรรม computeMonth (operational truth / ยอดขายจริง = money-critical)
// ก่อน/หลัง extract จาก dataContext.jsx · ctx inject { dailyAll, monthly, channels, clv, today }

const TODAY = { yearBE: 2569, month: 7, day: 15 };
const CH = [
  { id: 'facebook', name: 'Facebook', hex: '#1877f2' },
  { id: 'shopee', name: 'Shopee', hex: '#ee4d2d' },
];
// helper สร้าง daily row (BE year)
const row = (day, ch, extra = {}) => ({ year: 2569, month: 3, day, adSpend: 0, replyMin: 0, note: '', dayName: '', ch, ...extra });
const c = (rev, ord = 0, ad = 0, newC = 0, oldC = 0, inq = 0) => ({ rev, ord, ad, inq, newC, oldC });

describe('computeMonthPure — เดือนอดีต (รวมจาก daily)', () => {
  const dailyAll = [
    row(5, { facebook: c(1000, 2, 100, 1, 0), shopee: c(500, 1, 0, 0, 1) }, { adSpend: 100, replyMin: 10 }),
    row(10, { facebook: c(2000, 3, 200, 2, 1) }, { adSpend: 200, replyMin: 20 }),
  ];
  const ctx = { dailyAll, monthly: [], channels: CH, clv: 0, today: TODAY };
  const md = computeMonthPure(2 /* มี.ค. */, 2569, ctx);

  it('flags + consts', () => {
    expect(md.isCurrent).toBe(false);
    expect(md.isFuture).toBe(false);
    expect(md.consts.DAYS).toBe(31);
    expect(md.consts.DAY).toBe(31); // อดีต → เต็มเดือน
    expect(md.enteredDays).toBe(2);
  });
  it('MTD/ORD/AD/AOV รวมจาก channels (daily)', () => {
    expect(md.computed.MTD).toBe(3500);       // 3000(fb) + 500(shopee)
    expect(md.computed.ORD).toBe(6);          // 5 + 1
    expect(md.computed.AD).toBe(300);         // adSpend 100 + 200
    expect(md.computed.NEW_C).toBe(3);        // 1 + 2
    expect(md.computed.OLD_C).toBe(2);        // shopee day5(1) + fb day10(1)
    expect(md.computed.AOV).toBeCloseTo(583.333, 2);
    expect(md.computed.RUN).toBe(3500);       // MTD/DAY*DAYS, DAY=DAYS
    expect(md.computed.ACOS_TOT).toBeCloseTo(8.571, 2);
  });
  it('channels aggregate ต่อช่อง', () => {
    const fb = md.channels.find(x => x.id === 'facebook');
    expect(fb.actual).toBe(3000); expect(fb.orders).toBe(5); expect(fb.ad).toBe(300);
    expect(fb.newCust).toBe(3); expect(fb.oldCust).toBe(1); expect(fb.inq).toBe(4);
    const sp = md.channels.find(x => x.id === 'shopee');
    expect(sp.actual).toBe(500); expect(sp.inq).toBe(1);
  });
  it('fb deep-dive', () => {
    expect(md.fb.revenue).toBe(3000);
    expect(md.fb.roas).toBe(10);           // 3000/300
    expect(md.fb.acos).toBe(10);           // 300/3000*100
    expect(md.fb.conv).toBe(125);          // 5/4*100
    expect(md.fb.cac).toBe(100);           // 300/3
    expect(md.fb.avgReplyMinutes).toBe(15); // avg(10,20)
  });
  it('dailyMonth + dailyBreakdown', () => {
    expect(md.dailyMonth).toEqual([{ d: 5, rev: 1500 }, { d: 10, rev: 2000 }]);
    // breakdown เรียงล่าสุดก่อน (day10, day5)
    expect(md.dailyBreakdown[0].d).toBe(10);
    expect(md.dailyBreakdown[0].channels[0]).toMatchObject({ id: 'facebook', rev: 2000, pct: 100 });
    const d5 = md.dailyBreakdown[1];
    expect(d5.total).toBe(1500);
    expect(d5.channels.find(x => x.id === 'shopee').pct).toBeCloseTo(33.333, 2);
  });
  it('custWeekly (ซื้อซ้ำรายสัปดาห์)', () => {
    // day5=สัปดาห์1, day10=สัปดาห์2
    expect(md.custWeekly).toEqual([
      { week: 1, newC: 1, oldC: 1, returningPct: 50 },
      { week: 2, newC: 2, oldC: 1, returningPct: (1 / 3) * 100 },
    ]);
  });
});

describe('computeMonthPure — เดือนอดีต fallback รายเดือน (monthly.actual, ไม่มี daily)', () => {
  const monthly = [{ year: 2569, month: 3, target: 10000, actual: 9000, orders: 20, adSpend: 500, newCust: 8, projected: 0, messages: 0, meta: {} }];
  const md = computeMonthPure(2, 2569, { dailyAll: [], monthly, channels: CH, clv: 0, today: TODAY });
  it('ใช้ยอดรวมรายเดือนแทน', () => {
    expect(md.computed.MTD).toBe(9000);
    expect(md.computed.ORD).toBe(20);
    expect(md.computed.AD).toBe(500);
    expect(md.computed.NEW_C).toBe(8);
    expect(md.consts.TARGET).toBe(10000);
    expect(md.computed.PACE_TGT).toBe(10000); // 10000/31*31
    expect(md.computed.PACE_PCT).toBe(90);    // 9000/10000*100
    expect(md.computed.RUN).toBe(9000);
  });
  it('entryMode="daily" → ไม่ fallback (ใช้ daily แม้ว่าง)', () => {
    const m2 = [{ ...monthly[0], meta: { entryMode: 'daily' } }];
    const md2 = computeMonthPure(2, 2569, { dailyAll: [], monthly: m2, channels: CH, clv: 0, today: TODAY });
    expect(md2.computed.MTD).toBe(0); // daily ว่าง
  });
});

describe('computeMonthPure — เดือนปัจจุบัน (pace/projection)', () => {
  const dailyAll = [{ year: 2569, month: 7, day: 10, adSpend: 0, replyMin: 0, note: '', dayName: '', ch: { facebook: c(3000, 10) } }];
  const monthly = [{ year: 2569, month: 7, target: 31000, actual: 0, orders: 0, meta: {} }];
  const md = computeMonthPure(6 /* ก.ค. */, 2569, { dailyAll, monthly, channels: CH, clv: 0, today: TODAY });
  it('isCurrent + DAY=วันนี้ + pace/run สด', () => {
    expect(md.isCurrent).toBe(true);
    expect(md.consts.DAY).toBe(15);       // today.day
    expect(md.consts.DAYS).toBe(31);
    expect(md.computed.MTD).toBe(3000);   // สดจาก daily (ไม่ fallback แม้มี monthly)
    expect(md.computed.PACE_TGT).toBeCloseTo(31000 / 31 * 15, 4); // = 15000
    expect(md.computed.PACE_PCT).toBeCloseTo(3000 / 15000 * 100, 4); // 20
    expect(md.computed.RUN).toBeCloseTo(3000 / 15 * 31, 4); // 6200
  });
});

describe('computeMonthPure — เดือนอนาคต + ว่าง', () => {
  it('อนาคต → DAY=0, RUN=0, PACE=0', () => {
    const md = computeMonthPure(9 /* ต.ค. */, 2569, { dailyAll: [], monthly: [], channels: CH, clv: 0, today: TODAY });
    expect(md.isFuture).toBe(true);
    expect(md.consts.DAY).toBe(0);
    expect(md.computed.RUN).toBe(0);
    expect(md.computed.PACE_TGT).toBe(0);
  });
  it('ว่างทั้งหมด (อดีต) → ศูนย์', () => {
    const md = computeMonthPure(2, 2569, { dailyAll: [], monthly: [], channels: CH, clv: 0, today: TODAY });
    expect(md.computed.MTD).toBe(0);
    expect(md.computed.ORD).toBe(0);
    expect(md.custWeekly).toEqual([]);
    expect(md.enteredDays).toBe(0);
    expect(md.channels.every(x => x.actual === 0)).toBe(true);
  });
  it('CLV ส่งผ่าน ctx.clv', () => {
    const md = computeMonthPure(2, 2569, { dailyAll: [], monthly: [], channels: CH, clv: 1234, today: TODAY });
    expect(md.computed.CLV).toBe(1234);
  });
});
