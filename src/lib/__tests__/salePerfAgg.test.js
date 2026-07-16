import { describe, it, expect } from 'vitest';
import { buildPerf, spOf, isCancelled, dayOf, deltaPct, daysInMonth, NO_SELLER } from '../salePerfAgg.js';

// Characterization tests — ล็อกพฤติกรรม buildPerf (leaderboard aggregation) ก่อน/หลัง extract จาก salePerf.jsx
// funnel jsonb ใช้รูปแบบ leads = { platform: { new, old } } (ตรงกับ funnelTotal/Breakdown/NewOld ใน saleData.js)

describe('helpers', () => {
  it('spOf: trim ชื่อเซลล์ · ว่าง → NO_SELLER', () => {
    expect(spOf({ salesperson: ' แอน ' })).toBe('แอน');
    expect(spOf({ salesperson: '' })).toBe(NO_SELLER);
    expect(spOf({})).toBe(NO_SELLER);
  });
  it('isCancelled: case-insensitive', () => {
    expect(isCancelled({ status: 'Cancelled' })).toBe(true);
    expect(isCancelled({ status: 'confirmed' })).toBe(false);
    expect(isCancelled({})).toBe(false);
  });
  it('dayOf: อ่านวันจาก ISO (ตำแหน่ง 8-10)', () => {
    expect(dayOf('2026-07-15')).toBe(15);
    expect(dayOf('2026-07-01')).toBe(1);
    expect(dayOf('')).toBe(0);
    expect(dayOf(null)).toBe(0);
  });
  it('deltaPct: prev=0 → null · ปกติ %', () => {
    expect(deltaPct(150, 100)).toBe(50);
    expect(deltaPct(100, 0)).toBe(null);
    expect(deltaPct(50, 100)).toBe(-50);
  });
  it('daysInMonth', () => {
    expect(daysInMonth('2026-07')).toBe(31);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2024-02')).toBe(29);
  });
});

describe('buildPerf', () => {
  const MONTH = '2026-03'; // เดือนอดีต (ไม่ใช่ current) → projected = sales จริง, daysPassed = dim
  const targets = {
    แอน: { sales_target: 10000, commission_rate: 5 },
  };

  it('aggregate ยอด/ออเดอร์/ตัว/ลูกค้าใหม่ ต่อเซลล์ · ตัด cancelled', () => {
    const orders = [
      { order_no: 'A1', salesperson: 'แอน', sales: 3000, qty: 2, channel: 'facebook', customer_type: 'ลูกค้าใหม่', order_date: '2026-03-05', status: 'confirmed' },
      { order_no: 'A2', salesperson: 'แอน', sales: 2000, qty: 1, channel: 'facebook', customer_type: 'ลูกค้าเก่า', order_date: '2026-03-06', status: 'confirmed' },
      { order_no: 'X9', salesperson: 'แอน', sales: 9999, qty: 9, channel: 'facebook', order_date: '2026-03-06', status: 'cancelled' }, // ต้องถูกตัด
      { order_no: 'B1', salesperson: 'บี', sales: 8000, qty: 4, channel: 'line', customer_type: 'ลูกค้าใหม่', order_date: '2026-03-10', status: 'confirmed' },
    ];
    const { rows, team, dim } = buildPerf(MONTH, orders, [], [], [], targets, []);
    expect(dim).toBe(31);
    // เรียงตามยอด → บี(8000) ก่อน แอน(5000)
    expect(rows.map(r => r.name)).toEqual(['บี', 'แอน']);
    const an = rows.find(r => r.name === 'แอน');
    expect(an.sales).toBe(5000);
    expect(an.orders).toBe(2);
    expect(an.qty).toBe(3);
    expect(an.newC).toBe(1);
    expect(an.aov).toBe(2500);
    expect(an.channels.facebook).toBe(5000);
    expect(an.chStats.facebook).toEqual({ orders: 2, sales: 5000 });
    // team รวม (ไม่นับ cancelled)
    expect(team.sales).toBe(13000);
    expect(team.orders).toBe(3);
    expect(team.qty).toBe(7);
    expect(team.newC).toBe(2);
  });

  it('target/commission/pctTarget · เดือนอดีต projected = sales', () => {
    const orders = [
      { order_no: 'A1', salesperson: 'แอน', sales: 4000, qty: 1, channel: 'facebook', order_date: '2026-03-05', status: 'confirmed' },
    ];
    const { rows } = buildPerf(MONTH, orders, [], [], [], targets, []);
    const an = rows[0];
    expect(an.target).toBe(10000);
    expect(an.pctTarget).toBe(40);
    expect(an.comm).toBe(200);       // 4000 × 5%
    expect(an.projected).toBe(4000); // เดือนอดีต → ไม่ประมาณการ
    expect(an.pace).toBe('risk');    // sales < target และ projected < target
  });

  it('funnel → leads/closeRate/leadsByPlat/newOld + channelClose จับคู่ช่องทาง', () => {
    const orders = [
      { order_no: 'A1', salesperson: 'แอน', sales: 3000, qty: 1, channel: 'facebook', order_date: '2026-03-05', status: 'confirmed' },
      { order_no: 'A2', salesperson: 'แอน', sales: 2000, qty: 1, channel: 'facebook', order_date: '2026-03-06', status: 'confirmed' },
    ];
    const funnel = [
      { salesperson: 'แอน', date: '2026-03-05', leads: { facebook: { new: 6, old: 4 } } }, // total 10
    ];
    const { rows, team } = buildPerf(MONTH, orders, [], funnel, [], {}, []);
    const an = rows[0];
    expect(an.leads).toBe(10);
    expect(an.closeRate).toBe(20);           // 2 orders / 10 leads
    expect(an.leadsByPlat.facebook).toBe(10);
    expect(an.newOld).toEqual({ new: 6, old: 4 });
    const fbClose = an.channelClose.find(c => c.ch === 'facebook');
    expect(fbClose.orders).toBe(2);
    expect(fbClose.leads).toBe(10);
    expect(fbClose.closeRate).toBe(20);
    expect(team.closeRate).toBe(20);
  });

  it('skus → design tally (join order_no) · funnel-only seller ถูกสร้าง', () => {
    const orders = [
      { order_no: 'A1', salesperson: 'แอน', sales: 3000, qty: 2, order_date: '2026-03-05', status: 'confirmed' },
    ];
    const skus = [
      { order_no: 'A1', design: 'ลายเสือ', qty: 2 },
      { order_no: 'ZZ', design: 'ลายผี', qty: 5 }, // ไม่มี order → ข้าม
    ];
    const funnel = [
      { salesperson: 'ซี', date: '2026-03-05', leads: { line: { new: 3, old: 0 } } }, // ซี ไม่มี order
    ];
    const { rows } = buildPerf(MONTH, orders, skus, funnel, [], {}, []);
    const an = rows.find(r => r.name === 'แอน');
    expect(an.designs['ลายเสือ']).toBe(2);
    const c = rows.find(r => r.name === 'ซี');
    expect(c).toBeTruthy();      // funnel-only seller ยังโผล่
    expect(c.sales).toBe(0);
    expect(c.leads).toBe(3);
  });

  it('receipts: ตัด void · เทียบเดือนก่อน dSales', () => {
    const orders = [
      { order_no: 'A1', salesperson: 'แอน', sales: 6000, qty: 1, order_date: '2026-03-05', status: 'confirmed' },
    ];
    const receipts = [
      { order_no: 'A1', salesperson: 'แอน', status: 'confirmed' },
      { order_no: 'A2', salesperson: 'แอน', status: 'void' }, // ตัด
    ];
    const prevOrders = [
      { order_no: 'P1', salesperson: 'แอน', sales: 3000, status: 'confirmed' },
    ];
    const { rows, team } = buildPerf(MONTH, orders, [], [], receipts, {}, prevOrders);
    const an = rows[0];
    expect(an.receipts.length).toBe(1);
    expect(an.dSales).toBe(100);   // 6000 vs 3000 = +100%
    expect(team.dSales).toBe(100);
  });

  it('ว่างทั้งหมด → rows ว่าง · team ศูนย์', () => {
    const { rows, team } = buildPerf(MONTH, [], [], [], [], {}, []);
    expect(rows).toEqual([]);
    expect(team.sales).toBe(0);
    expect(team.closeRate).toBe(null);
    expect(team.dSales).toBe(null);
  });
});
