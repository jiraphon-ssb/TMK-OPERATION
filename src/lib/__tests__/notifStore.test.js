import { describe, it, expect } from 'vitest';
import { reduceNotifList } from '../notifStore.js';

// Phase 1 (realtime scale) — payload patch แทน reload ทั้ง list
const L = [{ id: 3, read: false }, { id: 2, read: true }, { id: 1, read: false }];

describe('reduceNotifList — realtime payload patch', () => {
  it('INSERT → prepend (บนสุด)', () => {
    const out = reduceNotifList(L, { eventType: 'INSERT', new: { id: 4, read: false } });
    expect(out.map(n => n.id)).toEqual([4, 3, 2, 1]);
  });
  it('INSERT ซ้ำ id เดิม → ไม่เพิ่ม (dedup) · คืน list เดิม (ref เดิม)', () => {
    const out = reduceNotifList(L, { eventType: 'INSERT', new: { id: 3 } });
    expect(out).toBe(L);
  });
  it('INSERT เกิน cap → ตัดท้าย', () => {
    const out = reduceNotifList(L, { eventType: 'INSERT', new: { id: 9 } }, 3);
    expect(out.map(n => n.id)).toEqual([9, 3, 2]);
  });
  it('UPDATE → patch by id (merge field) ไม่ขยับตำแหน่ง', () => {
    const out = reduceNotifList(L, { eventType: 'UPDATE', new: { id: 2, read: false } });
    expect(out.map(n => n.id)).toEqual([3, 2, 1]);
    expect(out.find(n => n.id === 2).read).toBe(false);
  });
  it('UPDATE id ที่ไม่มีใน list → ไม่แตะ (ref เดิม)', () => {
    expect(reduceNotifList(L, { eventType: 'UPDATE', new: { id: 99 } })).toBe(L);
  });
  it('DELETE → remove by old.id', () => {
    const out = reduceNotifList(L, { eventType: 'DELETE', old: { id: 2 } });
    expect(out.map(n => n.id)).toEqual([3, 1]);
  });
  it('DELETE id ที่ไม่มี → ref เดิม · type แปลก → ref เดิม · payload ว่าง → ref เดิม', () => {
    expect(reduceNotifList(L, { eventType: 'DELETE', old: { id: 99 } })).toBe(L);
    expect(reduceNotifList(L, { eventType: 'WHAT' })).toBe(L);
    expect(reduceNotifList(L, {})).toBe(L);
  });
  it('รองรับ payload.type (alias ของ eventType)', () => {
    const out = reduceNotifList(L, { type: 'DELETE', old: { id: 1 } });
    expect(out.map(n => n.id)).toEqual([3, 2]);
  });
});
