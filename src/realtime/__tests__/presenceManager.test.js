import { describe, it, expect, vi } from 'vitest';
import { createPresenceManager } from '../presenceManager.js';

// fake channel แบบ supabase — บันทึก track/subscribe · presenceState ตั้งค่าได้
function fakeChannel() {
  const ch = {
    _state: {}, _syncCb: null, tracks: [], untracked: false, unsubscribed: false,
    on(_type, _filter, cb) { ch._syncCb = cb; return ch; },
    subscribe(cb) { ch._subCb = cb; return ch; },
    track(s) { ch.tracks.push(s); return ch; },
    untrack() { ch.untracked = true; },
    unsubscribe() { ch.unsubscribed = true; },
    presenceState() { return ch._state; },
    _fireSubscribed() { ch._subCb?.('SUBSCRIBED'); },
    _fireSync(state) { ch._state = state; ch._syncCb?.(); },
  };
  return ch;
}

describe('presenceManager — §18 Supabase Presence', () => {
  it('join → track ตอน SUBSCRIBED (ไม่เขียน DB)', () => {
    const ch = fakeChannel();
    let t = 1000;
    const pm = createPresenceManager({ channelFactory: () => ch, now: () => t });
    pm.join('presence:team:a', { user_id: 'u1', section: 'orders' });
    expect(ch.tracks.length).toBe(0); // ยังไม่ subscribe
    ch._fireSubscribed();
    expect(ch.tracks.length).toBe(1);
    expect(ch.tracks[0].section).toBe('orders');
    expect(ch.tracks[0].online_at).toBeTruthy();
  });

  it('updateSection — เปลี่ยน section + พ้น throttle → track ใหม่', () => {
    const ch = fakeChannel();
    let t = 1000;
    const pm = createPresenceManager({ channelFactory: () => ch, now: () => t, throttleMs: 4000 });
    pm.join('p', { user_id: 'u1', section: 'orders' });
    ch._fireSubscribed(); // track@1000
    t = 6000;             // พ้น throttle
    expect(pm.updateSection('crm')).toBe(true);
    expect(ch.tracks[1].section).toBe('crm');
  });

  it('updateSection — section เดิม → ข้าม', () => {
    const ch = fakeChannel();
    const pm = createPresenceManager({ channelFactory: () => ch, now: () => 9999 });
    pm.join('p', { user_id: 'u1', section: 'orders' });
    ch._fireSubscribed();
    expect(pm.updateSection('orders')).toBe(false);
  });

  it('updateSection — ยังไม่พ้น throttle → ข้าม (กัน track ถี่)', () => {
    const ch = fakeChannel();
    let t = 1000;
    const pm = createPresenceManager({ channelFactory: () => ch, now: () => t, throttleMs: 4000 });
    pm.join('p', { user_id: 'u1', section: 'orders' });
    ch._fireSubscribed(); // track@1000
    t = 2000;             // ยังไม่พ้น 4000
    expect(pm.updateSection('crm')).toBe(false);
    expect(ch.tracks.length).toBe(1);
  });

  it('getOnline / onSync — parse presenceState → array', () => {
    const ch = fakeChannel();
    const pm = createPresenceManager({ channelFactory: () => ch, now: () => 1 });
    const seen = vi.fn();
    pm.join('p', { user_id: 'u1' });
    pm.onSync(seen);
    ch._fireSync({ u1: [{ user_id: 'u1', section: 'orders' }], u2: [{ user_id: 'u2', section: 'crm' }] });
    expect(pm.getOnline()).toHaveLength(2);
    expect(seen).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ user_id: 'u2' })]));
  });

  it('leave → untrack + unsubscribe + เคลียร์', () => {
    const ch = fakeChannel();
    const pm = createPresenceManager({ channelFactory: () => ch, now: () => 1 });
    pm.join('p', { user_id: 'u1' });
    ch._fireSubscribed();
    pm.leave();
    expect(ch.untracked).toBe(true);
    expect(ch.unsubscribed).toBe(true);
    expect(pm.getOnline()).toEqual([]);
  });
});
