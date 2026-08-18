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
      { order_no: 'A1', salesperson: 'แอน', sales: 3000, qty: 2, channel: 'facebook', source: 'shipnity', customer_type: 'ลูกค้าใหม่', order_date: '2026-03-05', status: 'confirmed' },
      { order_no: 'A2', salesperson: 'แอน', sales: 2000, qty: 1, channel: 'facebook', source: 'shipnity', customer_type: 'ลูกค้าเก่า', order_date: '2026-03-06', status: 'confirmed' },
      { order_no: 'X9', salesperson: 'แอน', sales: 9999, qty: 9, channel: 'facebook', source: 'shipnity', order_date: '2026-03-06', status: 'cancelled' }, // ต้องถูกตัด
      { order_no: 'B1', salesperson: 'บี', sales: 8000, qty: 4, channel: 'line', source: 'shipnity', customer_type: 'ลูกค้าใหม่', order_date: '2026-03-10', status: 'confirmed' },
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
    expect(an.chStats.facebook).toEqual({ orders: 2, sales: 5000, chat: 2 }); // chat = ตัวตั้ง %ปิดต่อช่องทาง
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
      { order_no: 'A1', salesperson: 'แอน', sales: 3000, qty: 1, channel: 'facebook', source: 'shipnity', order_date: '2026-03-05', status: 'confirmed' },
      { order_no: 'A2', salesperson: 'แอน', sales: 2000, qty: 1, channel: 'facebook', source: 'shipnity', order_date: '2026-03-06', status: 'confirmed' },
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
    expect(fbClose.over).toBe(false);        // ปิด ≤ ทัก → ปกติ
    expect(team.closeRate).toBe(20);
  });

  it('channelClose.over = true เมื่อปิดมากกว่าคนทัก (%ปิด > 100% เป็นไปไม่ได้ = คนทักไม่ครบ)', () => {
    const orders = Array.from({ length: 20 }, (_, i) => ({ order_no: 'P' + i, salesperson: 'แอน', sales: 100, qty: 1, channel: 'phone', source: 'shipnity', order_date: '2026-03-05', status: 'confirmed' }));
    const funnel = [{ salesperson: 'แอน', date: '2026-03-05', leads: { phone: { new: 1, old: 1 } } }]; // ทัก 2 · ปิด 20
    const { rows } = buildPerf(MONTH, orders, [], funnel, [], {}, []);
    const ph = rows[0].channelClose.find(c => c.ch === 'phone');
    expect(ph.orders).toBe(20);
    expect(ph.leads).toBe(2);
    expect(ph.over).toBe(true);              // 20 > 2 → คนทักไม่ครบ (UI โชว์ป้ายแทน 1000%)
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

  // P89: %ปิด = ออเดอร์ช่องแชท ÷ คนทัก — มาร์เก็ตเพลส (Shopee/Lazada/POS) ไม่นับตัวตั้ง → ไม่เกิน 100%
  it('closeRate นับเฉพาะออเดอร์ช่องแชท ไม่รวมมาร์เก็ตเพลส', () => {
    const orders = [
      { order_no: 'C1', salesperson: 'ฟ้า', sales: 500, qty: 1, channel: 'LINE', source: 'shipnity', order_date: '2026-03-05', status: 'confirmed' },
      { order_no: 'C2', salesperson: 'ฟ้า', sales: 500, qty: 1, channel: 'Phone', source: 'shipnity', order_date: '2026-03-06', status: 'confirmed' },
      { order_no: 'M1', salesperson: 'ฟ้า', sales: 900, qty: 1, channel: 'Shopee', order_date: '2026-03-06', status: 'confirmed' },
      { order_no: 'M2', salesperson: 'ฟ้า', sales: 900, qty: 1, channel: 'Lazada', order_date: '2026-03-07', status: 'confirmed' },
      { order_no: 'M3', salesperson: 'ฟ้า', sales: 900, qty: 1, channel: 'POS', order_date: '2026-03-07', status: 'confirmed' },
    ];
    const funnel = [{ date: '2026-03-05', salesperson: 'ฟ้า', leads: { LINE: { new: 3, old: 2 } } }]; // 5 คนทัก
    const { rows, team } = buildPerf('2026-03', orders, [], funnel, [], {}, []);
    const fa = rows.find(r => r.name === 'ฟ้า');
    expect(fa.orders).toBe(5);          // ออเดอร์ทั้งหมด 5
    expect(fa.chatOrders).toBe(2);      // แชท 2 (LINE+Phone)
    expect(fa.closeRate).toBe(40);      // 2/5 = 40% (ไม่ใช่ 5/5=100% หรือเกิน)
    expect(team.closeRate).toBe(40);
  });

  // C1: TikTok Shop จากไฟล์ import (source='tiktok' · เซลล์ '(TikTok)') channel เป็น 'TikTok'
  // = ช่องแชทตามชื่อ แต่ลูกค้าสั่งเองในแพลตฟอร์ม — ต้อง "ไม่" เข้าตัวตั้ง %ปิด (เดิมเข้า → ทีมสูงเกินจริง)
  // ส่วน TikTok DM ของจริง (ใบเสร็จ shipnity) ต้องนับตามเดิม
  it('C1: TikTok จาก import ไม่นับเป็นออเดอร์แชท · TikTok จากใบเสร็จ shipnity นับ', () => {
    const orders = [
      { order_no: 'T1', salesperson: '(TikTok)', sales: 900, qty: 1, channel: 'TikTok', source: 'tiktok', order_date: '2026-03-05', status: 'confirmed' },
      { order_no: 'T2', salesperson: 'ฟ้า', sales: 700, qty: 1, channel: 'TikTok', source: 'shipnity', order_date: '2026-03-05', status: 'confirmed' },
    ];
    const funnel = [{ date: '2026-03-05', salesperson: 'ฟ้า', leads: { TikTok: { new: 2, old: 0 } } }];
    const { rows, team } = buildPerf('2026-03', orders, [], funnel, [], {}, []);
    expect(rows.find(r => r.name === '(TikTok)').chatOrders).toBe(0); // import ไม่นับ
    expect(rows.find(r => r.name === 'ฟ้า').chatOrders).toBe(1);      // ใบเสร็จนับ
    expect(team.chatOrders).toBe(1);
    expect(team.closeRate).toBe(50); // 1 แชท ÷ 2 คนทัก (ไม่ใช่ 2÷2=100%)
  });

  // C2: ฟอร์มคนทักใช้ชื่อ 'อื่นๆ' · ออเดอร์ fallback ใช้ 'Direct' — เรื่องเดียวกันคนละชื่อ
  // ต้อง join กันในตาราง %ปิดรายช่องทาง (เดิมแตกเป็น 2 แถวพัง: Direct ไม่มี leads · อื่นๆ 0%)
  it("C2: leads 'อื่นๆ' รวมเข้ากับออเดอร์ 'Direct' ใน channelClose", () => {
    const orders = [
      { order_no: 'D1', salesperson: 'ฟ้า', sales: 500, qty: 1, channel: 'Direct', source: 'shipnity', order_date: '2026-03-05', status: 'confirmed' },
    ];
    const funnel = [{ date: '2026-03-05', salesperson: 'ฟ้า', leads: { 'อื่นๆ': { new: 2, old: 0 } } }];
    const { rows } = buildPerf('2026-03', orders, [], funnel, [], {}, []);
    const fa = rows.find(r => r.name === 'ฟ้า');
    const direct = fa.channelClose.find(c => c.ch === 'Direct');
    expect(direct).toBeTruthy();
    expect(direct.orders).toBe(1);
    expect(direct.leads).toBe(2);
    expect(direct.closeRate).toBe(50);
    expect(fa.channelClose.find(c => c.ch === 'อื่นๆ')).toBeUndefined(); // ไม่มีแถวแยกอีกแล้ว
  });

  // FIX: ตาราง "%ปิดต่อช่องทาง" เคยใช้ออเดอร์ทั้งหมด ทำให้แถว TikTok เอา TikTok Shop (import) มารวม
  // → โชว์ %ปิดสูงเกินจริง และไม่ตรงกับ closeRate รวมบนจอเดียวกัน
  it('channelClose นับเฉพาะออเดอร์แชท — ตรงกับ closeRate รวม', () => {
    const orders = [
      { order_no: 'T1', salesperson: 'ฟ้า', sales: 900, qty: 1, channel: 'TikTok', source: 'tiktok', order_date: '2026-03-05', status: 'confirmed' },
      { order_no: 'T2', salesperson: 'ฟ้า', sales: 900, qty: 1, channel: 'TikTok', source: 'tiktok', order_date: '2026-03-05', status: 'confirmed' },
      { order_no: 'T3', salesperson: 'ฟ้า', sales: 700, qty: 1, channel: 'TikTok', source: 'shipnity', order_date: '2026-03-05', status: 'confirmed' },
    ];
    const funnel = [{ date: '2026-03-05', salesperson: 'ฟ้า', leads: { TikTok: { new: 4, old: 0 } } }];
    const { rows } = buildPerf('2026-03', orders, [], funnel, [], {}, []);
    const fa = rows.find(r => r.name === 'ฟ้า');
    const tk = fa.channelClose.find(c => c.ch === 'TikTok');
    expect(tk.orders).toBe(1);        // เฉพาะใบเสร็จ (ไม่ใช่ 3)
    expect(tk.leads).toBe(4);
    expect(tk.closeRate).toBe(25);    // 1/4 — ไม่ใช่ 75%
    expect(fa.closeRate).toBe(25);    // ตรงกับตัวรวมบนจอเดียวกัน
  });
});
