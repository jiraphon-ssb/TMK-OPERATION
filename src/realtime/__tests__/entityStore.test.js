import { describe, it, expect, vi } from 'vitest';
import { createEntityStore, applyDomainEvent, loadSnapshot, getEntity } from '../entityStore.js';

const ev = (o) => ({ event_type: 'order.updated', ...o });

describe('entityStore — versioned patch (§11.1)', () => {
  it('version ต่อเนื่อง (current+1) → apply patch', () => {
    const s = createEntityStore();
    s.byId['o1'] = { id: 'o1', status: 'draft' }; s.versions['o1'] = 4;
    const r = applyDomainEvent(s, ev({ entity_id: 'o1', entity_version: 5, patch: { status: 'paid' } }));
    expect(r.status).toBe('applied');
    expect(getEntity(s, 'o1')).toEqual({ id: 'o1', status: 'paid' });
    expect(s.versions['o1']).toBe(5);
  });
  it('version เท่าเดิม → duplicate (ข้าม · idempotent)', () => {
    const s = createEntityStore(); s.versions['o1'] = 5;
    const r = applyDomainEvent(s, ev({ entity_id: 'o1', entity_version: 5, patch: { status: 'x' } }));
    expect(r.status).toBe('duplicate');
    expect(getEntity(s, 'o1')).toBeUndefined(); // ไม่ patch
  });
  it('version ต่ำกว่า → stale (event มาช้า)', () => {
    const s = createEntityStore(); s.versions['o1'] = 5;
    const r = applyDomainEvent(s, ev({ entity_id: 'o1', entity_version: 3, patch: {} }));
    expect(r.status).toBe('stale');
  });
  it('version ข้าม (>current+1) → gap → เรียก onGap (ไม่ patch มั่ว)', () => {
    const s = createEntityStore(); s.versions['o1'] = 5;
    const onGap = vi.fn();
    const r = applyDomainEvent(s, ev({ entity_id: 'o1', entity_version: 9, patch: { status: 'z' } }), { onGap });
    expect(r.status).toBe('gap');
    expect(onGap).toHaveBeenCalledWith('o1', 5);
    expect(getEntity(s, 'o1')).toBeUndefined();
  });
  it('entity ใหม่ (current=0) → apply ที่ version 1', () => {
    const s = createEntityStore();
    const r = applyDomainEvent(s, ev({ event_type: 'order.created', entity_id: 'n1', entity_version: 1, patch: { status: 'draft' } }));
    expect(r.status).toBe('applied');
    expect(getEntity(s, 'n1')).toEqual({ id: 'n1', status: 'draft' });
  });
  it('event .deleted → ลบ entity + bump version', () => {
    const s = createEntityStore(); s.byId['o1'] = { id: 'o1' }; s.versions['o1'] = 2;
    const r = applyDomainEvent(s, { event_type: 'order.deleted', entity_id: 'o1', entity_version: 3 });
    expect(r.status).toBe('deleted');
    expect(getEntity(s, 'o1')).toBeUndefined();
    expect(s.versions['o1']).toBe(3); // จำ version กัน event เก่า resurrect
  });
  it('invalid — ไม่มี id / version ไม่ใช่เลข', () => {
    const s = createEntityStore();
    expect(applyDomainEvent(s, ev({ entity_version: 1 })).status).toBe('invalid');
    expect(applyDomainEvent(s, ev({ entity_id: 'x', entity_version: 'NaN' })).status).toBe('invalid');
  });
  it('loadSnapshot — set byId + versions จาก row_version', () => {
    const s = createEntityStore();
    loadSnapshot(s, [{ id: 'a', row_version: 7, status: 'x' }, { id: 'b', row_version: 2 }]);
    expect(s.versions).toEqual({ a: 7, b: 2 });
    // หลัง snapshot: event version 8 apply ได้ (ต่อเนื่อง 7+1)
    expect(applyDomainEvent(s, ev({ entity_id: 'a', entity_version: 8, patch: { status: 'y' } })).status).toBe('applied');
  });
});
