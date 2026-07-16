import { describe, it, expect } from 'vitest';
import { flag, allFlags, FLAG_DEFAULTS } from '../featureFlags.js';

describe('featureFlags — §26 rollout flags', () => {
  it('default OFF ทุก flag (ไม่เปลี่ยน behavior)', () => {
    expect(flag('realtime_v2_enabled', { override: {}, env: () => undefined })).toBe(false);
    expect(Object.values(FLAG_DEFAULTS).every(v => v === false)).toBe(true);
  });
  it('override (window.__flags) ชนะทุกอย่าง', () => {
    expect(flag('presence_v2', { override: { presence_v2: true }, env: () => false })).toBe(true);
    expect(flag('presence_v2', { override: { presence_v2: false }, env: () => true })).toBe(false);
  });
  it('env เปิดเมื่อไม่มี override', () => {
    expect(flag('realtime_v2_orders', { override: {}, env: () => true })).toBe(true);
    expect(flag('realtime_v2_orders', { override: {}, env: () => undefined })).toBe(false); // fallback default
  });
  it('flag ที่ไม่รู้จัก → false', () => {
    expect(flag('does_not_exist', { override: {}, env: () => undefined })).toBe(false);
  });
  it('allFlags snapshot ครบทุกคีย์', () => {
    const snap = allFlags({ override: { presence_v2: true }, env: () => undefined });
    expect(Object.keys(snap).sort()).toEqual(Object.keys(FLAG_DEFAULTS).sort());
    expect(snap.presence_v2).toBe(true);
    expect(snap.realtime_v2_enabled).toBe(false);
  });
});
