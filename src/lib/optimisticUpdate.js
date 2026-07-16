/* ============================================================
   optimisticUpdate.js — Phase 3 (realtime scale §9): optimistic concurrency control
   ============================================================
   กัน "เขียนทับเงียบ" เมื่อหลายคนแก้ record เดียวกัน (blueprint §9)
   - versionedUpdate: update แบบ guard `where row_version = expected` → 0 rows = conflict (ไม่ retry แบบ blind)
   - graceful: ก่อนรัน migration 20260716-realtime-row-version (คอลัมน์ยังไม่มี · error 42703)
     → retry แบบไม่ guard = ทำงานเหมือนเดิม (behavior-preserving ทั้งก่อน/หลัง migration)
   - conflict policy §9.1: merge อัตโนมัติ (tags/watchers) · critical ต้องให้ user เลือก (ยอด/สถานะ/การเงิน)
   - **ยังไม่ wire write path** — เป็น foundation ให้ Phase 3.1 ค่อยผูกทีละจุด (มี test ก่อน)
   ============================================================ */

const COL_MISSING = /(row_version|42703|column .* does not exist)/i;

/**
 * update แบบ optimistic-concurrency (row_version guard)
 * @param {string|number|object} match - คีย์ระบุแถว: scalar → { id: scalar } · object → คอลัมน์คีย์เอง (เช่น { order_no, source })
 * @returns {{ok:boolean, data?, conflict?:boolean, unguarded?:boolean, error?}}
 *   ok:true = สำเร็จ · conflict:true = version ไม่ตรง (คนอื่นแก้ก่อน) · unguarded:true = fallback ก่อน migration
 */
export async function versionedUpdate(supabase, table, match, patch, expectedVersion) {
  const filter = (match && typeof match === 'object') ? match : (match != null ? { id: match } : null);
  if (!supabase || !table || !filter || !Object.keys(filter).length) return { ok: false, error: 'bad-args' };
  const run = (guard) => {
    let q = supabase.from(table).update(patch);
    for (const [col, val] of Object.entries(filter)) q = q.eq(col, val);
    if (guard && expectedVersion != null) q = q.eq('row_version', expectedVersion);
    return q.select().maybeSingle();
  };
  let { data, error } = await run(true);
  if (error && COL_MISSING.test(error.message || error.code || '')) {
    // ก่อนรัน migration: ไม่มีคอลัมน์ row_version → retry ไม่ guard (ทำงานเหมือนเดิม)
    ({ data, error } = await run(false));
    if (error) return { ok: false, error };
    return { ok: true, data, unguarded: true };
  }
  if (error) return { ok: false, error };
  if (!data && expectedVersion != null) return { ok: false, conflict: true }; // 0 rows = version mismatch
  return { ok: true, data };
}

// นโยบาย conflict (§9.1) — field ไหน merge เองได้ / ต้องให้ user ตัดสิน / last-write-wins ได้
export const CONFLICT_POLICY = {
  merge: ['tags', 'watchers', 'brand_ids', 'reactions', 'member_ids', 'campaign_ids'], // auto-merge (set union)
  critical: ['status', 'sales', 'paid_amount', 'total', 'title', 'description', 'due_date', 'customer_owner', 'stock', 'price'], // ต้องให้ user เลือก
};

/**
 * จัดประเภท field ที่ชนกัน → บอก FE ว่า auto-merge ได้ หรือต้องถาม user
 * @returns {{hasCritical:boolean, critical:string[], mergeable:string[], other:string[]}}
 */
export function classifyConflict(changedFields) {
  const critical = [], mergeable = [], other = [];
  for (const f of changedFields || []) {
    if (CONFLICT_POLICY.critical.includes(f)) critical.push(f);
    else if (CONFLICT_POLICY.merge.includes(f)) mergeable.push(f);
    else other.push(f);
  }
  return { hasCritical: critical.length > 0, critical, mergeable, other };
}
