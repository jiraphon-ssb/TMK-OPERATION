import { describe, it, expect } from 'vitest';
import { createDiag } from '../diagnostics.js';

describe('realtime diagnostics (Phase 0 instrumentation)', () => {
  it('นับ active channels (open/close) ถูกต้อง', () => {
    const d = createDiag();
    d.channelOpen('orders:2026-07');
    d.channelOpen('notif:a@b.co');
    d.channelOpen('orders:2026-07'); // ซ้ำ topic เดิม → ไม่นับเพิ่ม (Set)
    expect(d.snapshot().activeChannels).toBe(2);
    d.channelClose('notif:a@b.co');
    expect(d.snapshot().activeChannels).toBe(1);
    expect(d.snapshot().channels).toEqual(['orders:2026-07']);
  });

  it('นับ event ต่อ table', () => {
    const d = createDiag();
    d.event('tmk_orders'); d.event('tmk_orders'); d.event('tmk_customers');
    expect(d.snapshot().eventsByTable).toEqual({ tmk_orders: 2, tmk_customers: 1 });
  });

  it('refetch นับ count + rows ต่อ table', () => {
    const d = createDiag();
    d.refetch('tmk_orders', 500);
    d.refetch('tmk_orders', 300);
    expect(d.snapshot().refetchByTable.tmk_orders).toEqual({ count: 2, rows: 800 });
  });

  it('query แยก DB hit กับ cache hit', () => {
    const d = createDiag();
    d.query('tmk_mp_orders', 1000, false); // DB hit
    d.query('tmk_mp_orders', 0, true);     // cache hit (ไม่นับ rows/count DB)
    expect(d.snapshot().queryByTable.tmk_mp_orders).toEqual({ count: 1, rows: 1000, cacheHits: 1 });
  });

  it('reconnect + render counters', () => {
    const d = createDiag();
    d.reconnect(); d.reconnect();
    d.render('saleDashboard'); d.render('saleDashboard'); d.render('orders');
    const s = d.snapshot();
    expect(s.reconnects).toBe(2);
    expect(s.rendersByScreen).toEqual({ saleDashboard: 2, orders: 1 });
  });

  it('enabled=false → ทุก method เป็น no-op (prod behavior)', () => {
    const d = createDiag({ enabled: false });
    d.channelOpen('x'); d.event('t'); d.refetch('t', 9); d.query('t', 9); d.reconnect(); d.render('s');
    const s = d.snapshot();
    expect(s.activeChannels).toBe(0);
    expect(s.eventsByTable).toEqual({});
    expect(s.reconnects).toBe(0);
  });

  it('bounded — ไม่สร้าง key เกิน maxKeys (กัน memory leak)', () => {
    const d = createDiag({ maxKeys: 3 });
    for (let i = 0; i < 100; i++) d.event('table_' + i);
    expect(Object.keys(d.snapshot().eventsByTable).length).toBe(3);
    // key เดิมยังนับเพิ่มได้แม้เต็ม
    d.event('table_0');
    expect(d.snapshot().eventsByTable.table_0).toBe(2);
  });

  it('reset ล้างทุก counter', () => {
    const d = createDiag();
    d.channelOpen('a'); d.event('t'); d.reconnect();
    d.reset();
    const s = d.snapshot();
    expect(s.activeChannels).toBe(0);
    expect(s.eventsByTable).toEqual({});
    expect(s.reconnects).toBe(0);
  });
});
