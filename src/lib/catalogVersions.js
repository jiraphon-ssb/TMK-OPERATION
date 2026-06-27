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
