/* ============================================================
   applyTMK.js — apply ข้อมูลที่ map แล้ว ลง target TMK แบบ in-place (ARCH-1)
   ============================================================
   แยก logic การ mutate ออกจาก singleton TMK ใน dataContext → pure + testable
   - **รักษา reference เดิม**: view ที่ `import { TMK }` ตรง ยังอ่านค่าใหม่ได้หลัง apply
     (ไม่ reassign object/array — mutate ในที่ · version bump = trigger re-render)
   - consts/computed/fb = merge (Object.assign) · arrays = replace (length=0 + push)
   - behavior-preserving: ยกโค้ดเดิมจาก dataContext.mutateTMK มาตรงๆ แค่ parameterize target
   ============================================================ */

// คีย์ array ทั้งหมดใน TMK ที่ต้อง replace ทุกครั้งที่ apply (ลำดับ = ตามเดิม)
export const TMK_ARRAY_KEYS = [
  'channels', 'campaigns', 'tasks', 'brands', 'flows', 'products', 'dailyMonth', 'dailyLog',
  'month3', 'yoy', 'monthly', 'dailyAll', 'colorMix', 'sizeMix', 'staff', 'audit', 'roles',
  'duties', 'orders', 'customers', 'adCampaigns', 'segments',
];

/**
 * apply `mapped` ลง `target` แบบ in-place (mutate · รักษา reference)
 * @param {object} target - TMK singleton (หรือ object รูปเดียวกันใน test)
 * @param {object} mapped - ผลจาก mapToTMK(raw)
 * @returns {object} target (คืนตัวเดิม — chain ได้)
 */
export function applyMapped(target, mapped) {
  // merge nested objects (คง reference ของ target.consts/computed/fb)
  Object.assign(target.consts, mapped.consts);
  Object.assign(target.computed, mapped.computed);
  Object.assign(target.fb, mapped.fb);
  // replace arrays (length=0 + push — คง reference ของ array เดิม)
  for (const key of TMK_ARRAY_KEYS) {
    if (!target[key]) target[key] = [];
    target[key].length = 0;
    target[key].push(...(mapped[key] || []));
  }
  return target;
}
