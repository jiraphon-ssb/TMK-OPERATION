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

// field bookkeeping/derived — เขียนของเราเสมอ ไม่นับเป็น conflict (updated_at เปลี่ยนทุกครั้งอยู่แล้ว · derived คำนวณจาก field อื่น)
const MERGE_IGNORE = new Set(['updated_at', 'row_version', 'qty_band', 'order_month', 'cod_amount']);

// เทียบค่าเท่ากันแบบทน array/scalar (จัดเรียง array ก่อนกัน order ต่าง)
function valEq(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sa = [...a].map(String).sort(), sb = [...b].map(String).sort();
    return sa.every((v, i) => v === sb[i]);
  }
  if (a == null && b == null) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}
// union array แบบคงลำดับ (ของเราก่อน แล้วเติมของเขาที่ยังไม่มี) — สำหรับ tags/watchers
function unionArr(mine, theirs) {
  const out = Array.isArray(mine) ? [...mine] : [];
  const seen = new Set(out.map(String));
  for (const v of (Array.isArray(theirs) ? theirs : [])) { if (!seen.has(String(v))) { out.push(v); seen.add(String(v)); } }
  return out;
}

/**
 * Phase 3.5 (§9.1): three-way field merge เมื่อ conflict
 *   base   = ค่าตอนเราโหลดมาแก้ (ก่อนแก้)
 *   mine   = patch ที่เราจะเขียน
 *   theirs = row ปัจจุบันใน DB (คนอื่นเพิ่งเขียน)
 * ตัดสินรายช่อง: เขาไม่แตะ/บังเอิญเท่ากัน → ของเรา · mergeable → union · critical ที่ชนจริง → ให้ user เลือก · อื่นๆ → LWW(ของเรา)
 * @returns {{autoPatch:object, conflicts:Array<{field,mine,theirs}>, hasConflict:boolean}}
 */
export function computeFieldMerge({ base, mine, theirs, changedFields } = {}) {
  base = base || {}; mine = mine || {}; theirs = theirs || {};
  const fields = changedFields || Object.keys(mine);
  const autoPatch = {};
  const conflicts = [];
  for (const f of fields) {
    if (MERGE_IGNORE.has(f)) { autoPatch[f] = mine[f]; continue; }
    const mv = mine[f], tv = theirs[f], bv = base[f];
    if (valEq(tv, bv) || valEq(mv, tv)) { autoPatch[f] = mv; continue; } // เขาไม่แตะช่องนี้ หรือ ตรงกันพอดี → ของเราสะอาด
    if (CONFLICT_POLICY.merge.includes(f)) { autoPatch[f] = unionArr(mv, tv); continue; } // set-union
    if (CONFLICT_POLICY.critical.includes(f)) { conflicts.push({ field: f, mine: mv, theirs: tv }); continue; }
    autoPatch[f] = mv; // non-critical ที่ชน → last-write-wins ของเรา (blueprint ยอมรับ)
  }
  return { autoPatch, conflicts, hasConflict: conflicts.length > 0 };
}

/**
 * Phase 3.5: update แบบ merge — ลอง guard ก่อน · ถ้า conflict ดึง theirs มา three-way merge
 *   - ช่องที่ auto-merge ได้ → เขียนทันที (เนียน ไม่รบกวน user)
 *   - critical ชนจริง → ถาม user รายช่อง (ผ่าน resolve · default window.__resolveConflict)
 *   - user ยกเลิก/ไม่มี host → reloaded:true (ทิ้ง ปลอดภัย)
 * @param {object} o { supabase, table, match, base, patch, expectedVersion, entity?, resolve?, apply? }
 *   apply(patch, expectedVersion) inject ได้ (order path มี schema-tolerant retry เอง)
 * @returns {{ok?:boolean, data?, merged?:boolean, auto?:boolean, reloaded?:boolean, conflict?:boolean, raced?:boolean, error?}}
 */
export async function mergeVersionedUpdate({ supabase, table, match, base, patch, expectedVersion, entity, resolve, apply }) {
  const applyFn = apply || ((p, ev) => versionedUpdate(supabase, table, match, p, ev));
  const r = await applyFn(patch, expectedVersion);
  if (!r || !r.conflict) return r; // ok / unguarded / error → คืนตามเดิม
  // conflict → ดึงแถวปัจจุบัน (theirs)
  const filter = (match && typeof match === 'object') ? match : { id: match };
  let q = supabase.from(table).select('*');
  for (const [c, v] of Object.entries(filter)) q = q.eq(c, v);
  const { data: theirs, error: fErr } = await q.maybeSingle();
  if (fErr || !theirs) return { ok: false, conflict: true, error: fErr }; // ดึงไม่ได้ → ปล่อยเป็น conflict (caller toast)
  const { autoPatch, conflicts } = computeFieldMerge({ base, mine: patch, theirs, changedFields: Object.keys(patch) });
  const finalPatch = { ...autoPatch };
  if (conflicts.length) {
    const ask = resolve || (typeof window !== 'undefined' ? window.__resolveConflict : null);
    const picks = ask ? await ask({ entity: entity || 'ข้อมูลนี้', conflicts }) : null;
    if (!picks) return { ok: false, reloaded: true }; // user เลือกโหลดล่าสุด / ไม่มี host
    for (const c of conflicts) finalPatch[c.field] = picks[c.field] === 'theirs' ? c.theirs : c.mine;
  }
  const r2 = await applyFn(finalPatch, theirs.row_version); // เขียนทับด้วย version ล่าสุด
  if (r2 && r2.conflict) return { ok: false, conflict: true, raced: true }; // มีคนที่ 3 แทรก
  return r2 && r2.ok ? { ok: true, data: r2.data, merged: true, auto: conflicts.length === 0 } : r2;
}

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

// label ไทยของ field สำคัญ (ใช้ในกล่องเตือน conflict)
const FIELD_TH = {
  status: 'สถานะ', sales: 'ยอดขาย', paid_amount: 'ยอดชำระ', total: 'ยอดรวม',
  title: 'ชื่อ', description: 'รายละเอียด', due_date: 'กำหนดส่ง', customer_owner: 'เจ้าของลูกค้า',
  stock: 'สต็อก', price: 'ราคา', qty: 'จำนวน', customer_name: 'ชื่อลูกค้า',
};
/** ชื่อ field เป็นไทย (fallback = ชื่อ column) — reuse ใน conflict UI */
export function fieldLabelTH(f) { return FIELD_TH[f] || f; }

/**
 * Phase 3.4 (§9.1): ถาม user เมื่อ conflict — แทน toast+refresh เงียบ ให้ user เลือกเอง
 *   'reload'    = ทิ้งที่แก้ โหลดของล่าสุด (ค่า default ที่ปลอดภัย)
 *   'overwrite' = เขียนทับด้วยค่าที่ user กรอก (ตั้งใจทับของคนอื่น)
 * มี guard: ถ้าเป็น critical field เตือนแรงกว่า · ถ้าไม่มี __confirm (เช่น test/SSR) → reload
 * @param {{entity?:string, changedFields?:string[], confirm?:Function}} opts
 *   confirm inject ได้เพื่อเทส (default = window.__confirm)
 * @returns {Promise<'reload'|'overwrite'>}
 */
export async function promptConflictResolution({ entity = 'ข้อมูลนี้', changedFields, confirm } = {}) {
  const ask = confirm || (typeof window !== 'undefined' ? window.__confirm : null);
  if (!ask) return 'reload'; // ไม่มีกล่องยืนยัน → เลือกทางปลอดภัย (ไม่ทับ)
  const cls = classifyConflict(changedFields);
  const warn = cls.hasCritical
    ? `\n\n⚠️ ที่คุณแก้มีค่าสำคัญ (${cls.critical.map(f => FIELD_TH[f] || f).join(', ')}) — ถ้าเขียนทับ ค่าที่คนอื่นเพิ่งบันทึกจะหาย`
    : '';
  const ok = await ask({
    title: `${entity}ถูกแก้โดยคนอื่น`,
    body: `มีคนแก้${entity}นี้ระหว่างที่คุณกำลังแก้อยู่${warn}\n\n• "โหลดล่าสุด" = ทิ้งที่คุณแก้ แล้วดูของใหม่ (แนะนำ)\n• "เขียนทับ" = ใช้ค่าที่คุณกรอก (ทับของคนอื่น)`,
    confirmText: 'เขียนทับ',
    cancelText: 'โหลดล่าสุด',
    danger: true,
  });
  return ok ? 'overwrite' : 'reload';
}
