// ============================================================
// fetchStockMoves — เลิกดึงสมุดเคลื่อนไหว "ทั้งเล่ม" ทุกครั้ง
// ============================================================
// tmk_stock_moves เป็น append-only ตามดีไซน์ (revoke update/delete) → โตขึ้นเรื่อย ๆ ไม่มีวันหด
// เดิม cachedFetchAll = ดึงทุกแถวตั้งแต่เปิดระบบ ทุกครั้งที่เปิดหน้าสต็อก
//
// กติกาที่ห้ามพัง: "คงเหลือ = หมุดนับล่าสุด + รับเข้าหลังหมุด − ขายหลังหมุด"
// → ชุดที่ได้ต้องมีหมุดนับล่าสุด + ทุกแถวหลังหมุด **ครบเป๊ะ** ไม่งั้นเลขสต็อกผิด
//
// วิธี: ดึงแถวล่าสุด N แถวก่อน
//   · ได้น้อยกว่า N  = นั่นคือทั้งตารางอยู่แล้ว → ไม่มีความเสี่ยงเลย (สถานะปัจจุบัน)
//   · ได้ครบ N       = ตารางใหญ่กว่านั้น → ยิงรอบสองแบบมีขอบเขต (moved_on >= วันหมุด) แล้วรวมกัน
//                      เพื่อกันเคสคีย์ย้อนหลัง (created_at เก่า แต่ moved_on หลังหมุด)
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = { recent: [], byDate: [], recentErr: null, byDateErr: null, calls: [] };

vi.mock('../supabaseClient.js', () => ({
  supabase: {
    from: (table) => {
      const q = { table, gte: null, limit: null };
      const api = {
        select: () => api,
        eq: () => api,
        gte: (_c, v) => { q.gte = v; return api; },
        order: () => api,
        limit: (n) => { q.limit = n; return api; },
        then: (res) => {
          state.calls.push({ ...q });
          // รอบแรก = มี .limit() · รอบสอง (ยืนยันความครบ) = ไม่มี limit
          if (q.limit == null) return res(state.byDateErr ? { data: null, error: state.byDateErr } : { data: state.byDate, error: null });
          return res(state.recentErr ? { data: null, error: state.recentErr } : { data: state.recent, error: null });
        },
      };
      return api;
    },
  },
  isSupabaseConfigured: true,
}));
vi.mock('../saleData.js', () => ({
  cachedFetchAll: async () => ({ data: [], error: null }),
  invalidateSaleCache: () => {},
  TTL_SHORT: 5 * 60 * 1000,
}));

const { fetchStockMoves, MOVES_RECENT_LIMIT, invalidateStockMoves } = await import('../stockData.js');

const mv = (id, kind, moved_on, created_at) => ({ id, kind, moved_on, created_at, sku_key: 'A|ดำ|M', qty: 1 });

beforeEach(() => {
  state.recent = []; state.byDate = []; state.recentErr = null; state.byDateErr = null; state.calls = [];
  invalidateStockMoves();   // cache เป็น module-level → ต้องล้างทุกเคส ไม่งั้นเคสก่อนหน้าค้างมา
});

describe('ตารางยังเล็ก (แถวน้อยกว่าเพดาน) — ต้องได้เท่าเดิมเป๊ะ ยิงแค่รอบเดียว', () => {
  it('คืนทุกแถว + ไม่ยิง query รอบสอง', async () => {
    state.recent = [mv('m2', 'in', '2026-09-10', '2026-09-10T03:00:00Z'), mv('m1', 'count', '2026-09-01', '2026-09-01T03:00:00Z')];
    const r = await fetchStockMoves();
    expect(r.rows.map(x => x.id).sort()).toEqual(['m1', 'm2']);
    expect(state.calls).toHaveLength(1);
    expect(r.truncated).toBe(false);
  });

  it('ตารางว่าง → rows = [] ไม่ throw', async () => {
    const r = await fetchStockMoves();
    expect(r.rows).toEqual([]);
    expect(state.calls).toHaveLength(1);
  });
});

describe('ตารางใหญ่จนชนเพดาน — ต้องยิงรอบสองแบบมีขอบเขต แล้วรวมให้ครบ', () => {
  const fill = (n) => Array.from({ length: n }, (_, i) => mv(`r${i}`, 'in', '2026-09-20', `2026-09-20T00:00:${String(i % 60).padStart(2, '0')}Z`));

  it('⛔ แถวที่คีย์ย้อนหลัง (created_at เก่าจนตกขอบ แต่ moved_on หลังหมุด) ต้องไม่หาย', async () => {
    const recent = fill(MOVES_RECENT_LIMIT - 1);
    recent.push(mv('anchor', 'count', '2026-09-15', '2026-09-19T00:00:00Z'));
    state.recent = recent;
    // แถวนี้ moved_on หลังหมุด แต่ created_at เก่ากว่าทุกแถวในหน้าต่าง → รอบสองต้องดึงมาให้
    state.byDate = [mv('backdated', 'in', '2026-09-16', '2026-08-01T00:00:00Z')];

    const r = await fetchStockMoves();
    expect(state.calls).toHaveLength(2);
    expect(state.calls[1].gte).toBe('2026-09-15');          // ขอบเขต = วันของหมุดนับล่าสุด
    expect(r.rows.map(x => x.id)).toContain('backdated');
    expect(r.truncated).toBe(true);
  });

  it('รวมแล้วต้องไม่มี id ซ้ำ (สองรอบทับกันได้)', async () => {
    const recent = fill(MOVES_RECENT_LIMIT - 1);
    recent.push(mv('anchor', 'count', '2026-09-15', '2026-09-19T00:00:00Z'));
    state.recent = recent;
    state.byDate = [recent[0], mv('extra', 'in', '2026-09-16', '2026-08-01T00:00:00Z')];

    const r = await fetchStockMoves();
    const ids = r.rows.map(x => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('⛔ ชนเพดานแต่ไม่เจอหมุดนับเลยในหน้าต่าง → ต้องถอยไปดึงทั้งตาราง (ห้ามเดา)', async () => {
    state.recent = fill(MOVES_RECENT_LIMIT);            // ไม่มี kind='count' สักแถว
    state.byDate = [mv('old-anchor', 'count', '2020-01-01', '2020-01-01T00:00:00Z')];
    const r = await fetchStockMoves();
    expect(state.calls).toHaveLength(2);
    expect(state.calls[1].gte).toBeNull();               // ไม่ใส่ .gte เลย = ดึงทั้งตาราง
    expect(r.rows.map(x => x.id)).toContain('old-anchor');
  });
});

describe('error', () => {
  it('รอบแรกพัง → คืน error ไม่ throw', async () => {
    state.recentErr = { message: 'permission denied', code: '42501' };
    const r = await fetchStockMoves();
    expect(r.rows).toEqual([]);
    expect(r.error).toBeTruthy();
  });

  it('⛔ รอบสองพัง → ต้องคืน error ไม่ใช่ส่งชุดที่ขาดไปให้คิดคงเหลือ', async () => {
    const recent = Array.from({ length: MOVES_RECENT_LIMIT - 1 }, (_, i) => mv(`r${i}`, 'in', '2026-09-20', `2026-09-20T00:00:${i % 60}Z`));
    recent.push(mv('anchor', 'count', '2026-09-15', '2026-09-19T00:00:00Z'));
    state.recent = recent;
    state.byDateErr = { message: 'timeout' };
    const r = await fetchStockMoves();
    expect(r.error).toBeTruthy();
    expect(r.rows).toEqual([]);
  });
});

describe('cache — ห้ามดึงใหม่ทุกครั้งที่เปิดหน้า', () => {
  it('เรียกซ้ำภายใน TTL → ไม่ยิง query เพิ่ม', async () => {
    state.recent = [mv('m1', 'count', '2026-09-01', '2026-09-01T03:00:00Z')];
    await fetchStockMoves();
    const after1 = state.calls.length;
    const r2 = await fetchStockMoves();
    expect(state.calls).toHaveLength(after1);
    expect(r2.rows.map(x => x.id)).toEqual(['m1']);
  });

  it('force = true → ยิงใหม่ (ใช้หลังเซฟ)', async () => {
    state.recent = [mv('m1', 'count', '2026-09-01', '2026-09-01T03:00:00Z')];
    await fetchStockMoves();
    const after1 = state.calls.length;
    await fetchStockMoves(true);
    expect(state.calls.length).toBeGreaterThan(after1);
  });

  it('⛔ อ่านพลาด ห้ามจำลง cache (ไม่งั้นค้าง error 5 นาที)', async () => {
    state.recentErr = { message: 'timeout' };
    await fetchStockMoves(true);
    const after1 = state.calls.length;
    state.recentErr = null;
    state.recent = [mv('m9', 'count', '2026-09-01', '2026-09-01T03:00:00Z')];
    const r = await fetchStockMoves();
    expect(state.calls.length).toBeGreaterThan(after1);
    expect(r.rows.map(x => x.id)).toEqual(['m9']);
  });
});
