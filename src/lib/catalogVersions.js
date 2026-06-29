/* ============================================================
   TMK Operation — Versioned golden catalog helper
   ============================================================
   เก็บ snapshot ของแคตตาล็อกทุกครั้งที่ save → tmk_catalog_versions
   - fire-and-forget: ห้ามทำให้ save หลักพัง (try/catch เงียบ)
   - ถ้าตารางยัง migrate ไม่ผ่าน (relation ไม่มี) → เงียบ ไม่กระทบ save
   - "เริ่ม" เฟสแรก: เก็บประวัติ + ดูในฟอร์ม · ยังไม่ wire as-of-date pinning
   ============================================================ */
import { supabase } from './supabaseClient.js';

const vid = () => 'cv-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/**
 * บันทึก snapshot 1 เวอร์ชันของแถวแคตตาล็อกหลัง upsert สำเร็จ
 * @param {object} row  แถว catalog ที่เพิ่ง save (มี id/code/name/price/...)
 */
export async function logCatalogVersion(row) {
  if (!row || !row.id) return;
  try {
    const { data: sess } = await supabase.auth.getSession();
    const email = sess?.session?.user?.email || 'system';
    await supabase.from('tmk_catalog_versions').insert({
      id: vid(),
      catalog_id: row.id,
      code: row.code || '',
      name: row.name || '',
      price: Number(row.price) || 0,
      price_wholesale: Number(row.price_wholesale) || 0,
      type: row.type || '',
      shirt_class: row.shirt_class || '',
      job_type: row.job_type || '',
      snapshot: row,
      changed_by: email,
    });
  } catch (e) {
    console.warn('logCatalogVersion non-fatal:', e?.message);
  }
}

/**
 * ดึงประวัติเวอร์ชันของแคตตาล็อกหนึ่งรายการ (ล่าสุดก่อน)
 * @param {string} catalogId
 * @param {number} [limit=20]
 * @returns {Promise<Array>} แถวประวัติ หรือ [] ถ้าตารางยังไม่มี/error
 */
/**
 * ดึงเวอร์ชันทั้งหมด (ทุกรายการ) สำหรับ build index as-of-date → [] ถ้าตารางยังไม่มี/error
 * เบา: select เฉพาะ code/name/price/changed_at (ไม่ดึง snapshot jsonb หนัก)
 */
export async function fetchAllVersions(limit = 20000) {
  try {
    const { data, error } = await supabase
      .from('tmk_catalog_versions')
      .select('code,name,price,price_wholesale,changed_at')
      .order('code', { ascending: true })
      .order('changed_at', { ascending: true })
      .limit(limit);
    if (error) return [];
    return data || [];
  } catch { return []; }
}

/**
 * จัดกลุ่มเวอร์ชันตาม code (uppercase) → { byCode: Map<CODE, versionsAsc[]>, empty }
 * versionsAsc เรียงจากเก่า→ใหม่ (ใช้หา "เวอร์ชันที่ effective ณ วันที่")
 */
export function buildVersionIndex(rows) {
  const byCode = new Map();
  for (const r of (rows || [])) {
    const c = (r.code || '').toString().trim().toUpperCase();
    if (!c) continue;
    if (!byCode.has(c)) byCode.set(c, []);
    byCode.get(c).push(r);
  }
  // rows มาเรียง changed_at asc แล้วจาก query แต่ group แล้วยังคงลำดับ
  return { byCode, empty: byCode.size === 0 };
}

/**
 * หา catalog state (name/price) ที่ effective ณ วัน order
 * = snapshot ล่าสุดที่ changed_at (เทียบ date-prefix กัน TZ) <= isoDate
 * คืน { name, price, price_wholesale } หรือ null ถ้า order เก่ากว่า snapshot แรก (→ caller fallback catalog ปัจจุบัน)
 */
export function asOfCatalog(index, code, isoDate) {
  if (!index || index.empty || !code || !isoDate) return null;
  const c = code.toString().trim().toUpperCase();
  const versions = index.byCode.get(c);
  if (!versions || !versions.length) return null;
  const day = isoDate.toString().slice(0, 10);
  let hit = null;
  for (const v of versions) {                 // เรียง asc → ตัวสุดท้ายที่ <= day คือ effective
    const vd = (v.changed_at || '').toString().slice(0, 10);
    if (vd && vd <= day) hit = v; else break;
  }
  return hit ? { name: hit.name || '', price: hit.price, price_wholesale: hit.price_wholesale } : null;
}

export async function fetchCatalogVersions(catalogId, limit = 20) {
  if (!catalogId) return [];
  try {
    const { data, error } = await supabase
      .from('tmk_catalog_versions')
      .select('id,catalog_id,code,name,price,type,shirt_class,job_type,changed_by,changed_at')
      .eq('catalog_id', catalogId)
      .order('changed_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}
