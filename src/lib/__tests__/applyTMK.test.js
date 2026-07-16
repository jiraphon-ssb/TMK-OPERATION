import { describe, it, expect } from 'vitest';
import { applyMapped, TMK_ARRAY_KEYS } from '../applyTMK.js';

// Characterization tests (ARCH-1) — ล็อกพฤติกรรม mutateTMK เดิมก่อนลด coupling
// หัวใจ: apply แบบ in-place ต้อง "รักษา reference" ของ object/array เดิม (view import TMK ตรงต้องเห็นค่าใหม่)

function makeTarget() {
  const t = { consts: { TARGET: 0 }, computed: { MTD: 0 }, fb: { x: 1 } };
  for (const k of TMK_ARRAY_KEYS) t[k] = [];
  return t;
}

describe('applyMapped — in-place apply (รักษา reference)', () => {
  it('merge consts/computed/fb (Object.assign · คง reference เดิม)', () => {
    const t = makeTarget();
    const constsRef = t.consts, computedRef = t.computed, fbRef = t.fb;
    applyMapped(t, { consts: { TARGET: 500 }, computed: { MTD: 1234.5 }, fb: { y: 2 } });
    expect(t.consts.TARGET).toBe(500);
    expect(t.computed.MTD).toBe(1234.5);
    expect(t.fb).toEqual({ x: 1, y: 2 }); // merge ไม่ทับทั้งก้อน (x เดิมคงอยู่)
    // reference เดิมต้องไม่เปลี่ยน (view ที่ถือ ref เก่าเห็นค่าใหม่)
    expect(t.consts).toBe(constsRef);
    expect(t.computed).toBe(computedRef);
    expect(t.fb).toBe(fbRef);
  });

  it('replace arrays (length=0 + push · คง reference ของ array เดิม)', () => {
    const t = makeTarget();
    const chRef = t.channels;
    t.channels.push({ id: 'old' }); // ของเดิมก่อน apply
    applyMapped(t, { channels: [{ id: 'a' }, { id: 'b' }] });
    expect(t.channels).toEqual([{ id: 'a' }, { id: 'b' }]); // ของเก่าถูกล้าง แทนด้วยของใหม่
    expect(t.channels).toBe(chRef); // ← สำคัญ: reference เดิม (ไม่ reassign)
  });

  it('mapped ไม่มี key นั้น → array กลายเป็นว่าง (ไม่ error)', () => {
    const t = makeTarget();
    t.orders.push({ id: 1 });
    applyMapped(t, { channels: [{ id: 'a' }] }); // ไม่มี orders
    expect(t.orders).toEqual([]);
    expect(t.channels).toEqual([{ id: 'a' }]);
  });

  it('target ไม่มี array key มาก่อน → สร้าง []', () => {
    const t = { consts: {}, computed: {}, fb: {} }; // ไม่มี array keys เลย
    applyMapped(t, { channels: [{ id: 'a' }] });
    expect(t.channels).toEqual([{ id: 'a' }]);
    expect(Array.isArray(t.tasks)).toBe(true);
    expect(t.tasks).toEqual([]);
  });

  it('apply ซ้ำหลายรอบ → สะท้อนรอบล่าสุดเสมอ (idempotent ต่อ input เดียวกัน)', () => {
    const t = makeTarget();
    applyMapped(t, { channels: [{ id: 'a' }], consts: { TARGET: 100 } });
    applyMapped(t, { channels: [{ id: 'x' }, { id: 'y' }], consts: { TARGET: 200 } });
    expect(t.channels).toEqual([{ id: 'x' }, { id: 'y' }]);
    expect(t.consts.TARGET).toBe(200);
  });

  it('คืน target ตัวเดิม (chain ได้)', () => {
    const t = makeTarget();
    expect(applyMapped(t, {})).toBe(t);
  });

  it('ครอบคลุม array keys ครบ 22 ตัว (กัน key ตกหล่นตอน refactor)', () => {
    expect(TMK_ARRAY_KEYS).toHaveLength(22);
    expect(TMK_ARRAY_KEYS).toContain('orders');
    expect(TMK_ARRAY_KEYS).toContain('customers');
    expect(new Set(TMK_ARRAY_KEYS).size).toBe(TMK_ARRAY_KEYS.length); // ไม่ซ้ำ
  });
});
