import { describe, it, expect, beforeEach, vi } from 'vitest';

// mock supabase — fake channel ที่ chainable + นับ removeChannel
const created = [];
const removed = [];
const fakeSupabase = {
  channel(name) {
    const ch = { name, _binds: [], on(_e, cfg, cb) { this._binds.push({ cfg, cb }); return this; }, subscribe() { return this; } };
    created.push(ch);
    return ch;
  },
  removeChannel(ch) { removed.push(ch.name); },
};
vi.mock('../../lib/supabaseClient.js', () => ({ supabase: fakeSupabase }));

const { subscribeChanges, activeChannelKeys, channelRefs } = await import('../channelRegistry.js');

describe('channelRegistry — dedup + refcount (Phase 2)', () => {
  beforeEach(() => { created.length = 0; removed.length = 0; });

  it('key เดียวกัน 2 subscriber → 1 channel · refs=2 · fan-out ทั้งคู่', () => {
    const a = []; const b = [];
    const u1 = subscribeChanges({ key: 'k1', bindings: [{ table: 't' }], onEvent: (p) => a.push(p) });
    const u2 = subscribeChanges({ key: 'k1', bindings: [{ table: 't' }], onEvent: (p) => b.push(p) });
    expect(created).toHaveLength(1);         // สร้าง channel ครั้งเดียว
    expect(channelRefs('k1')).toBe(2);
    // ยิง event เข้า binding → fan-out ทั้ง 2 handler
    created[0]._binds[0].cb({ eventType: 'INSERT' }, 't');
    expect(a).toHaveLength(1); expect(b).toHaveLength(1);
    u1(); u2();
  });

  it('unsubscribe ครบ → removeChannel + ลบออกจาก registry', () => {
    const u1 = subscribeChanges({ key: 'k2', bindings: [{ table: 't' }], onEvent: () => {} });
    const u2 = subscribeChanges({ key: 'k2', bindings: [{ table: 't' }], onEvent: () => {} });
    u1();
    expect(channelRefs('k2')).toBe(1); expect(removed).toHaveLength(0); // ยังมี subscriber
    u2();
    expect(channelRefs('k2')).toBe(0); expect(removed).toEqual(['k2']); // ตัวสุดท้ายออก → remove
    expect(activeChannelKeys()).not.toContain('k2');
  });

  it('unsubscribe ซ้ำ → refcount ไม่เพี้ยน (idempotent)', () => {
    const u = subscribeChanges({ key: 'k3', bindings: [{ table: 't' }], onEvent: () => {} });
    subscribeChanges({ key: 'k3', bindings: [{ table: 't' }], onEvent: () => {} });
    u(); u(); u(); // เรียกซ้ำหลายรอบ
    expect(channelRefs('k3')).toBe(1); // เหลือ subscriber ที่ 2 · ไม่ติดลบ
  });

  it('key ต่างกัน → คนละ channel', () => {
    subscribeChanges({ key: 'a', bindings: [{ table: 't' }], onEvent: () => {} });
    subscribeChanges({ key: 'b', bindings: [{ table: 't' }], onEvent: () => {} });
    expect(created).toHaveLength(2);
    expect(activeChannelKeys()).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('binding filter + event ส่งเข้า channel.on ถูก', () => {
    subscribeChanges({ key: 'f', bindings: [{ table: 'tmk_x', event: 'INSERT', filter: 'id=eq.1' }], onEvent: () => {} });
    const cfg = created[0]._binds[0].cfg;
    expect(cfg).toMatchObject({ event: 'INSERT', schema: 'public', table: 'tmk_x', filter: 'id=eq.1' });
  });

  it('onEvent ไม่ใช่ function / ไม่มี key → no-op unsubscribe', () => {
    expect(subscribeChanges({ key: 'x' })()).toBeUndefined();
    expect(subscribeChanges({ onEvent: () => {} })()).toBeUndefined();
    expect(created).toHaveLength(0);
  });
});
