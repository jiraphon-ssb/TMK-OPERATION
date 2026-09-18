// ============================================================
// TTL ของ cache ฝั่ง Sale — ยืดได้เฉพาะตารางที่ realtime คอยล้าง cache ให้
// ============================================================
// Egress ทะลุโควตา (18 ก.ย. 69): ตารางใหญ่อย่าง tmk_mp_orders / tmk_mp_customers
// ต้องดึง "ทั้งตาราง" เพราะ CRM คิดยอดตลอดชีพ (tier · ซื้อซ้ำ · ควรติดต่อ) — ตัดช่วงวันที่ไม่ได้
// แต่ TTL 5 นาทีทำให้ทุกครั้งที่กลับมาที่แท็บหลัง 5 นาที = ดาวน์โหลดทั้งตารางใหม่
//
// กติกาที่ทำให้ยืด TTL ได้อย่างปลอดภัย:
//   · เขียนเองในเครื่อง  → invalidateSaleCache() ล้าง cache ทันที
//   · คนอื่นเขียน        → realtime event → useSaleLiveReload({invalidate}) ล้างให้
//   → TTL ทำหน้าที่แค่ "กันกรณีพลาด" · จะยืดได้ต่อเมื่อ realtime ยังต่ออยู่เท่านั้น
//     realtime หลุด = ไม่มีใครล้าง cache ให้ → ต้องกลับไปใช้ TTL สั้นทันที
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

let down = false;
vi.mock('../../realtime/channelRegistry.js', () => ({
  isRealtimeDown: () => down,
  subscribeChanges: () => () => {},
  onConnectionChange: () => () => {},
}));
vi.mock('../supabaseClient.js', () => ({ supabase: null, isSupabaseConfigured: false }));

const { ttlFor, TTL_SHORT, TTL_STABLE, REALTIME_BACKED } = await import('../saleData.js');

beforeEach(() => { down = false; });

describe('ttlFor', () => {
  it('ตารางใหญ่ที่ realtime ดูแลอยู่ → TTL ยาว', () => {
    for (const t of ['tmk_mp_orders', 'tmk_mp_customers', 'tmk_order_overrides', 'tmk_mp_skus']) {
      expect(ttlFor(t), t).toBe(TTL_STABLE);
    }
  });

  it('⛔ realtime หลุด → กลับไป TTL สั้นทุกตาราง (ไม่มีใครล้าง cache ให้แล้ว)', () => {
    down = true;
    expect(ttlFor('tmk_mp_orders')).toBe(TTL_SHORT);
    expect(ttlFor('tmk_mp_customers')).toBe(TTL_SHORT);
  });

  it('⛔ ตารางที่ไม่ได้ subscribe realtime → TTL สั้นเสมอ (สต็อก/แคตตาล็อก/ใบสั่งผลิต)', () => {
    for (const t of ['tmk_stock_moves', 'tmk_stock_counts', 'tmk_shirt_catalog', 'tmk_production_orders']) {
      expect(ttlFor(t), t).toBe(TTL_SHORT);
    }
  });

  it('ตารางที่ไม่รู้จัก → TTL สั้น (ค่าปลอดภัย)', () => {
    expect(ttlFor('tmk_อะไรก็ไม่รู้')).toBe(TTL_SHORT);
  });

  it('TTL ยาวต้องมากกว่าสั้นจริง และไม่ยาวเกินครึ่งชั่วโมง', () => {
    expect(TTL_STABLE).toBeGreaterThan(TTL_SHORT);
    expect(TTL_STABLE).toBeLessThanOrEqual(30 * 60 * 1000);
  });

  it('REALTIME_BACKED ต้องมีแค่ตารางที่ useSaleLiveReload subscribe จริง', () => {
    // ถ้าเพิ่มตารางเข้ามาโดยไม่ได้ subscribe = ข้อมูลค้างนานถึงครึ่งชั่วโมงโดยไม่มีใครล้างให้
    expect([...REALTIME_BACKED].sort()).toEqual([
      'tmk_mp_customers', 'tmk_mp_orders', 'tmk_mp_skus',
      'tmk_order_overrides', 'tmk_sale_receipts', 'tmk_sales_funnel',
    ]);
  });
});
