import { describe, it, expect } from 'vitest';
import { versionedUpdate, classifyConflict, CONFLICT_POLICY } from '../optimisticUpdate.js';

// mock supabase — builder ที่บันทึก .eq() แล้วคืนผลตามที่ตั้ง
function mockSupabase(result, { failFirstWithColMissing = false } = {}) {
  let calls = 0;
  return {
    _lastEqs: null,
    from() {
      const eqs = [];
      const builder = {
        update() { return builder; },
        eq(col, val) { eqs.push([col, val]); return builder; },
        select() { return builder; },
        async maybeSingle() {
          calls += 1;
          this._eqs = eqs;
          if (failFirstWithColMissing && calls === 1) return { data: null, error: { code: '42703', message: 'column row_version does not exist' } };
          return result;
        },
      };
      return builder;
    },
  };
}

describe('versionedUpdate — optimistic concurrency (§9)', () => {
  it('สำเร็จ → ok:true + data', async () => {
    const sb = mockSupabase({ data: { id: 1, row_version: 6 }, error: null });
    const r = await versionedUpdate(sb, 'tmk_tasks', 1, { title: 'x' }, 5);
    expect(r).toEqual({ ok: true, data: { id: 1, row_version: 6 } });
  });

  it('version ไม่ตรง (0 rows) → conflict:true (ไม่ retry blind)', async () => {
    const sb = mockSupabase({ data: null, error: null });
    const r = await versionedUpdate(sb, 'tmk_tasks', 1, { title: 'x' }, 5);
    expect(r).toEqual({ ok: false, conflict: true });
  });

  it('ก่อนรัน migration (คอลัมน์ไม่มี · 42703) → retry ไม่ guard → ok:true unguarded', async () => {
    const sb = mockSupabase({ data: { id: 1 }, error: null }, { failFirstWithColMissing: true });
    const r = await versionedUpdate(sb, 'tmk_tasks', 1, { title: 'x' }, 5);
    expect(r).toEqual({ ok: true, data: { id: 1 }, unguarded: true });
  });

  it('ไม่ส่ง expectedVersion → update ปกติ (ไม่มี conflict)', async () => {
    const sb = mockSupabase({ data: null, error: null });
    const r = await versionedUpdate(sb, 'tmk_tasks', 1, { title: 'x' }); // expectedVersion undefined
    expect(r).toEqual({ ok: true, data: null }); // 0 rows แต่ไม่ guard → ไม่ถือเป็น conflict
  });

  it('error อื่น → ok:false + error', async () => {
    const sb = mockSupabase({ data: null, error: { code: '23505', message: 'dup' } });
    const r = await versionedUpdate(sb, 'tmk_tasks', 1, { title: 'x' }, 5);
    expect(r.ok).toBe(false); expect(r.error.code).toBe('23505');
  });

  it('bad args → ไม่ยิง', async () => {
    expect((await versionedUpdate(null, 't', 1, {})).ok).toBe(false);
    expect((await versionedUpdate({}, 't', null, {})).ok).toBe(false);
  });
});

describe('classifyConflict — conflict policy (§9.1)', () => {
  it('critical field (การเงิน/สถานะ) → hasCritical', () => {
    const r = classifyConflict(['status', 'paid_amount', 'tags']);
    expect(r.hasCritical).toBe(true);
    expect(r.critical).toEqual(['status', 'paid_amount']);
    expect(r.mergeable).toEqual(['tags']);
  });
  it('เฉพาะ mergeable → auto-merge ได้ (ไม่ critical)', () => {
    const r = classifyConflict(['tags', 'watchers', 'reactions']);
    expect(r.hasCritical).toBe(false);
    expect(r.mergeable).toHaveLength(3);
  });
  it('field อื่น → other', () => {
    expect(classifyConflict(['note', 'color']).other).toEqual(['note', 'color']);
  });
  it('ยอดขาย/สต็อก อยู่ใน critical (ห้าม LWW)', () => {
    expect(CONFLICT_POLICY.critical).toEqual(expect.arrayContaining(['sales', 'stock', 'total', 'price']));
  });
  it('ว่าง/undefined → ไม่ crash', () => {
    expect(classifyConflict()).toEqual({ hasCritical: false, critical: [], mergeable: [], other: [] });
  });
});
