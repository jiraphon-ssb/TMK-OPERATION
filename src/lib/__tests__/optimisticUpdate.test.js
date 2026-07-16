import { describe, it, expect } from 'vitest';
import { versionedUpdate, classifyConflict, CONFLICT_POLICY, promptConflictResolution, computeFieldMerge, mergeVersionedUpdate } from '../optimisticUpdate.js';

// mock supabase แบบ sequential — maybeSingle() คืนผลตามลำดับ results · บันทึก patch/eq ที่ยิง
function seqSupabase(results) {
  let i = 0;
  const cap = { patches: [], eqsList: [] };
  const sb = {
    _cap: cap,
    from() {
      const eqs = [];
      const builder = {
        update(p) { cap.patches.push(p); return builder; },
        select() { return builder; },
        eq(c, v) { eqs.push([c, v]); return builder; },
        async maybeSingle() { cap.eqsList.push(eqs.slice()); return results[i++] || { data: null, error: null }; },
      };
      return builder;
    },
  };
  return sb;
}

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
    expect((await versionedUpdate({}, 't', {}, {})).ok).toBe(false); // match object ว่าง
  });

  it('match เป็น object (order_no+source) → guard หลายคอลัมน์', async () => {
    const sb = mockSupabase({ data: { order_no: 'A1' }, error: null });
    const r = await versionedUpdate(sb, 'tmk_mp_orders', { order_no: 'A1', source: 'mp' }, { status: 'cancelled' }, 3);
    expect(r).toEqual({ ok: true, data: { order_no: 'A1' } });
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

describe('promptConflictResolution — Phase 3.4 conflict UX', () => {
  it('ไม่มี __confirm (test/SSR) → reload (ปลอดภัย ไม่ทับ)', async () => {
    expect(await promptConflictResolution({ entity: 'ออเดอร์' })).toBe('reload');
  });
  it('user กด "เขียนทับ" (confirm=true) → overwrite', async () => {
    const confirm = async () => true;
    expect(await promptConflictResolution({ entity: 'งาน', confirm })).toBe('overwrite');
  });
  it('user กด "โหลดล่าสุด" (confirm=false) → reload', async () => {
    const confirm = async () => false;
    expect(await promptConflictResolution({ entity: 'งาน', confirm })).toBe('reload');
  });
  it('critical field → body เตือนแรง (มี ⚠️ + ชื่อ field ไทย)', async () => {
    let opts = null;
    const confirm = async (o) => { opts = o; return false; };
    await promptConflictResolution({ entity: 'ออเดอร์', changedFields: ['sales', 'note'], confirm });
    expect(opts.body).toContain('⚠️');
    expect(opts.body).toContain('ยอดขาย'); // sales → label ไทย
    expect(opts.danger).toBe(true);
    expect(opts.confirmText).toBe('เขียนทับ');
    expect(opts.cancelText).toBe('โหลดล่าสุด');
  });
  it('ไม่มี critical field → ไม่มีคำเตือน ⚠️', async () => {
    let opts = null;
    const confirm = async (o) => { opts = o; return false; };
    await promptConflictResolution({ entity: 'งาน', changedFields: ['note', 'color'], confirm });
    expect(opts.body).not.toContain('⚠️');
  });
});

describe('computeFieldMerge — three-way field merge (§9.1)', () => {
  it('เขาไม่แตะช่องที่เราแก้ → ของเราสะอาด (ไม่ conflict)', () => {
    const r = computeFieldMerge({ base: { sales: 100, note: 'a' }, mine: { note: 'b' }, theirs: { sales: 200, note: 'a' } });
    expect(r.hasConflict).toBe(false);
    expect(r.autoPatch).toEqual({ note: 'b' });
  });
  it('mergeable (tags) ทั้งคู่แก้ → union อัตโนมัติ', () => {
    const r = computeFieldMerge({ base: { tags: ['x'] }, mine: { tags: ['x', 'a'] }, theirs: { tags: ['x', 'b'] } });
    expect(r.hasConflict).toBe(false);
    expect(r.autoPatch.tags).toEqual(['x', 'a', 'b']);
  });
  it('critical (sales) ทั้งคู่แก้ต่างกัน → conflict (ให้ user เลือก)', () => {
    const r = computeFieldMerge({ base: { sales: 100 }, mine: { sales: 150 }, theirs: { sales: 200 } });
    expect(r.hasConflict).toBe(true);
    expect(r.conflicts).toEqual([{ field: 'sales', mine: 150, theirs: 200 }]);
    expect(r.autoPatch.sales).toBeUndefined(); // ยังไม่ตัดสิน
  });
  it('updated_at / derived → ของเราเสมอ ไม่นับ conflict', () => {
    const r = computeFieldMerge({ base: { updated_at: 't0', cod_amount: 0 }, mine: { updated_at: 't2', cod_amount: 50 }, theirs: { updated_at: 't1', cod_amount: 99 } });
    expect(r.hasConflict).toBe(false);
    expect(r.autoPatch).toEqual({ updated_at: 't2', cod_amount: 50 });
  });
  it('non-critical ชน → LWW ของเรา (ไม่ถาม)', () => {
    const r = computeFieldMerge({ base: { note: 'a' }, mine: { note: 'mine' }, theirs: { note: 'theirs' } });
    expect(r.hasConflict).toBe(false);
    expect(r.autoPatch.note).toBe('mine');
  });
});

describe('mergeVersionedUpdate — apply + merge orchestration', () => {
  it('ไม่ conflict ตั้งแต่แรก → คืนผลตรง (ไม่ merge)', async () => {
    const sb = seqSupabase([{ data: { id: 1, row_version: 2 }, error: null }]);
    const r = await mergeVersionedUpdate({ supabase: sb, table: 'tmk_mp_orders', match: { id: 1 }, base: {}, patch: { note: 'b' }, expectedVersion: 1 });
    expect(r.ok).toBe(true); expect(r.merged).toBeUndefined();
  });
  it('conflict + ช่องไม่ชน → auto-merge (ไม่เรียก resolve) เขียนด้วย version ของเขา', async () => {
    const sb = seqSupabase([
      { data: null, error: null },                                  // guarded update → conflict
      { data: { note: 'a', sales: 200, row_version: 5 }, error: null }, // fetch theirs
      { data: { note: 'b', row_version: 6 }, error: null },         // merged apply
    ]);
    let resolveCalled = false;
    const r = await mergeVersionedUpdate({
      supabase: sb, table: 'tmk_mp_orders', match: { id: 1 },
      base: { note: 'a', sales: 200 }, patch: { note: 'b' }, expectedVersion: 1,
      resolve: async () => { resolveCalled = true; return null; },
    });
    expect(r).toMatchObject({ ok: true, merged: true, auto: true });
    expect(resolveCalled).toBe(false); // ไม่ชน critical → ไม่ถาม
    expect(sb._cap.patches[1]).toEqual({ note: 'b' }); // merged patch
    expect(sb._cap.eqsList[2]).toEqual(expect.arrayContaining([['row_version', 5]])); // guard ด้วย version ล่าสุด
  });
  it('conflict + critical → เรียก resolve → เขียนค่าที่เลือก (theirs)', async () => {
    const sb = seqSupabase([
      { data: null, error: null },
      { data: { sales: 200, row_version: 5 }, error: null },
      { data: { sales: 200, row_version: 6 }, error: null },
    ]);
    const r = await mergeVersionedUpdate({
      supabase: sb, table: 'tmk_mp_orders', match: { id: 1 },
      base: { sales: 100 }, patch: { sales: 150 }, expectedVersion: 1,
      resolve: async ({ conflicts }) => { expect(conflicts[0].field).toBe('sales'); return { sales: 'theirs' }; },
    });
    expect(r).toMatchObject({ ok: true, merged: true, auto: false });
    expect(sb._cap.patches[1].sales).toBe(200); // เลือก theirs
  });
  it('conflict + critical + user ยกเลิก → reloaded', async () => {
    const sb = seqSupabase([
      { data: null, error: null },
      { data: { sales: 200, row_version: 5 }, error: null },
    ]);
    const r = await mergeVersionedUpdate({
      supabase: sb, table: 'tmk_mp_orders', match: { id: 1 },
      base: { sales: 100 }, patch: { sales: 150 }, expectedVersion: 1,
      resolve: async () => null,
    });
    expect(r).toEqual({ ok: false, reloaded: true });
  });
  it('ดึง theirs ไม่ได้ → คืน conflict (caller toast)', async () => {
    const sb = seqSupabase([
      { data: null, error: null },
      { data: null, error: { message: 'net' } },
    ]);
    const r = await mergeVersionedUpdate({
      supabase: sb, table: 'tmk_mp_orders', match: { id: 1 },
      base: {}, patch: { sales: 150 }, expectedVersion: 1, resolve: async () => null,
    });
    expect(r.ok).toBe(false); expect(r.conflict).toBe(true);
  });
});
