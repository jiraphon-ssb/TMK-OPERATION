// ============================================================
// cachedFetchRange — ถ้ามี "ทั้งตาราง" อยู่ใน cache แล้ว ช่วงย่อยต้องไม่ยิงเน็ตซ้ำ
// ============================================================
// วัดจริง 18 ก.ย. 69: เปิดหน้า CRM 1 ครั้ง → tmk_mp_orders ถูกดึง 3 รอบ
//   · CRM ขอ "ทั้งตาราง" (ยอดตลอดชีพ · tier · ซื้อซ้ำ)
//   · หน้าแรก/mergedMonth ขอ "เดือนนี้" และ "เดือนก่อน" ของตารางเดียวกัน ชุดคอลัมน์เดียวกัน
// ทั้งที่ชุดใหญ่ครอบชุดเล็กอยู่แล้ว → กรองเองฝั่ง client ได้ ไม่ต้องยิงซ้ำ
//
// ⚠️ เงื่อนไขที่ต้องครบถึงจะใช้ของใน cache ได้ (ไม่งั้นข้อมูลขาด):
//   · ชุดคอลัมน์ (sel) ตรงกันเป๊ะ
//   · ยังไม่หมดอายุตาม ttlFor
//   · ชุดใหญ่ต้องไม่ถูกตัด (truncated) — ถ้าชนเพดาน paginate แปลว่าไม่ครบ ห้ามใช้
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = [];
const rows = [
  { order_no: 'A', order_date: '2026-08-31', sales: 1 },
  { order_no: 'B', order_date: '2026-09-01', sales: 2 },
  { order_no: 'C', order_date: '2026-09-30', sales: 3 },
  { order_no: 'D', order_date: '2026-10-01', sales: 4 },
  { order_no: 'E', order_date: null, sales: 5 },        // ไม่มีวันที่ — gte/lte ฝั่ง DB จะไม่คืนแถวนี้
];

vi.mock('../../realtime/channelRegistry.js', () => ({ isRealtimeDown: () => false }));
vi.mock('../supabaseClient.js', () => ({
  supabase: {
    from: (table) => {
      const q = { table, gte: null, lte: null };
      const api = {
        select: () => api, eq: () => api, not: () => api, order: () => api, limit: () => api,
        gte: (_c, v) => { q.gte = v; return api; }, lte: (_c, v) => { q.lte = v; return api; },
        range: (a, b) => { q.page = [a, b]; return api; },
        then: (res) => {
          calls.push({ ...q });
          const inR = (r) => { const d = r.order_date; if (!d) return !q.gte && !q.lte; return (!q.gte || d >= q.gte) && (!q.lte || d <= q.lte); };
          return res({ data: rows.filter(inR), error: null });
        },
      };
      return api;
    },
  },
  isSupabaseConfigured: true,
}));

const { cachedFetchAll, cachedFetchRange, clearSaleCache } = await import('../saleData.js');
const SEL = 'order_no,order_date,sales';

beforeEach(() => { calls.length = 0; clearSaleCache(); });

describe('ช่วงย่อยใช้ของจาก cache ทั้งตาราง', () => {
  it('⛔ ดึงทั้งตารางแล้ว ขอช่วงย่อยต่อ ต้องไม่ยิงเน็ตอีก', async () => {
    await cachedFetchAll('tmk_mp_orders', SEL);
    const n = calls.length;
    const r = await cachedFetchRange('tmk_mp_orders', SEL, '2026-09-01', '2026-09-30', 'order_date');
    expect(calls.length).toBe(n);                       // ไม่มี request เพิ่ม
    expect(r.data.map(x => x.order_no)).toEqual(['B', 'C']);
  });

  it('⛔ แถวที่ไม่มีวันที่ ต้องไม่ติดมา (ให้ตรงกับที่ DB จะคืนเมื่อใช้ gte/lte)', async () => {
    await cachedFetchAll('tmk_mp_orders', SEL);
    const r = await cachedFetchRange('tmk_mp_orders', SEL, '2026-01-01', '2026-12-31', 'order_date');
    expect(r.data.map(x => x.order_no)).not.toContain('E');
  });

  it('ยังไม่มีชุดใหญ่ใน cache → ยิงเน็ตตามปกติ', async () => {
    const r = await cachedFetchRange('tmk_mp_orders', SEL, '2026-09-01', '2026-09-30', 'order_date');
    expect(calls.length).toBeGreaterThan(0);
    expect(r.data.map(x => x.order_no)).toEqual(['B', 'C']);
  });

  it('⛔ คนละชุดคอลัมน์ → ห้ามใช้ของใน cache (ข้อมูลจะขาดคอลัมน์)', async () => {
    await cachedFetchAll('tmk_mp_orders', SEL);
    const n = calls.length;
    await cachedFetchRange('tmk_mp_orders', 'order_no,order_date', '2026-09-01', '2026-09-30', 'order_date');
    expect(calls.length).toBeGreaterThan(n);
  });

  it('⛔ ชุดใหญ่ถูกตัด (truncated) → ห้ามใช้ ต้องยิงเน็ต', async () => {
    const { __setCacheForTest } = await import('../saleData.js');
    __setCacheForTest(`tmk_mp_orders|${SEL}`, { ts: Date.now(), data: rows, truncated: true });
    const n = calls.length;
    await cachedFetchRange('tmk_mp_orders', SEL, '2026-09-01', '2026-09-30', 'order_date');
    expect(calls.length).toBeGreaterThan(n);
  });

  it('force = true → ยิงใหม่เสมอ ไม่ใช้ของเก่า', async () => {
    await cachedFetchAll('tmk_mp_orders', SEL);
    const n = calls.length;
    await cachedFetchRange('tmk_mp_orders', SEL, '2026-09-01', '2026-09-30', 'order_date', true);
    expect(calls.length).toBeGreaterThan(n);
  });
});
