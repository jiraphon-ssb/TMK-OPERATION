/* ============================================================
   realtimePatch — แก้เฉพาะแถวที่เปลี่ยน แทนการดึงทั้งตารางใหม่ (pure · ไม่แตะ network/DOM)
   ============================================================
   ทำไมต้องมี (18 ก.ย. 69): Egress ทะลุโควตา 120% (6.02/5 GB) ทั้งที่ฐานข้อมูลมีแค่ 48 MB
   = ส่งข้อมูลชุดเดิมออกไปซ้ำ ๆ ~125 รอบ

   ต้นตอหลัก: dataContext รับ realtime event แล้วเรียก refreshTables → รัน QUERIES[k]()
   ซึ่งคือ `select` ทั้งตารางใหม่ ไม่ใช่ดึงเฉพาะแถวที่เปลี่ยน
   → คนหนึ่งลากการ์ดงาน 1 ใบ อีก 6 เครื่องดาวน์โหลด tmk_tasks ใหม่ทั้งตาราง
   (Realtime Messages 6,818 ข้อความ ≈ ~1,000 การเปลี่ยนแปลง × ~7 เครื่อง)

   payload ของ postgres_changes มีทั้งแถวอยู่แล้ว (payload.new) → ไม่ต้องยิง query ซ้ำเลย

   ⚠️ กติกาเหล็ก: patch ได้เฉพาะเมื่อ "มั่นใจ 100%" ว่าผลลัพธ์ตรงกับที่ query จะคืนมา
      กรณีอื่นคืน null → ผู้เรียกดึงทั้งตารางเหมือนเดิม (ข้อมูลผิดแย่กว่า egress เปลือง)
      สิ่งที่ต้องเลียนแบบให้ตรง: ตัวกรองของ query (is(deleted_at,null) / gte วันที่) + ลำดับ .order()
   ============================================================ */

/** เทียบค่าเดียวแบบ Postgres `ORDER BY col ASC` — ค่าว่างไปท้ายเสมอ (NULLS LAST เป็นดีฟอลต์ของ ASC) */
const cmpOne = (a, b) => {
  const na = a == null || a === '', nb = b == null || b === '';
  if (na && nb) return 0;
  if (na) return 1;            // ว่าง = ไปท้าย
  if (nb) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
};

/** สร้าง comparator หลายคีย์ให้ตรงกับ .order() ที่ต่อกันหลายชั้น */
const sortBy = (...cols) => (a, b) => {
  for (const c of cols) { const d = cmpOne(a?.[c], b?.[c]); if (d) return d; }
  return 0;
};

/* ============================================================
   PATCH_CFG — ต้องตรงกับ QUERIES ใน dataContext.jsx เป๊ะ
   ============================================================
   key        = ชื่อ key ใน rawRef (TABLE_KEY)
   softDelete = query มี .is('deleted_at', null) → แถวที่ถูกลบอ่อนต้องหายจากลิสต์
   sort       = ลำดับเดียวกับ .order() ของ query นั้น
   inWindow   = ตัวกรองเพิ่ม (เช่น .gte('date', …)) — คืน false = แถวนี้ไม่อยู่ในชุดที่ query ดึง

   ⛔ ที่ "จงใจไม่ใส่":
     tmk_settings      — query เป็น .maybeSingle() (object ไม่ใช่ array) · เปลี่ยนแทบไม่มี
     tmk_task_comments — ต้องรีเฟรช view tmk_task_comment_counts ด้วย (patch ฝั่งเดียวไม่พอ)
   ============================================================ */
export const PATCH_CFG = {
  tmk_channels:        { key: 'channels',  softDelete: true,  sort: sortBy('sort_order') },
  tmk_campaigns:       { key: 'campaigns', softDelete: true,  sort: sortBy('sort_order', 'start_date') },
  tmk_tasks:           { key: 'tasks',     softDelete: true,  sort: sortBy('date') },
  tmk_brands:          { key: 'brands',    softDelete: true,  sort: sortBy('sort_order') },
  tmk_flows:           { key: 'flows',     softDelete: true,  sort: sortBy('sort_order') },
  tmk_user_roles:      { key: 'roles',     softDelete: true,  sort: null },              // query ไม่ .order()
  tmk_staff:           { key: 'staff',     softDelete: true,  sort: sortBy('joined_at') },
  tmk_duties:          { key: 'duties',    softDelete: true,  sort: sortBy('sort_order') },
  tmk_ad_campaigns:    { key: 'adCamps',   softDelete: true,  sort: sortBy('start_date') },
  tmk_monthly_history: { key: 'monthly',   softDelete: false, sort: sortBy('year', 'month') },
  /* daily: query คือ .gte('date', dailyFromDate()).order('date') — **ไม่มี** is(deleted_at,null)
     (หน้าเว็บกรอง deleted_at เองทีหลัง) → ห้ามตัดแถวที่ลบอ่อนออกที่นี่ */
  tmk_daily_sales:     { key: 'daily',     softDelete: false, sort: sortBy('date'),
    inWindow: (row, opts) => !!opts?.dailyFrom && String(row?.date || '') >= opts.dailyFrom },
};

const idOf = (r) => (r?.id == null ? '' : String(r.id));

/**
 * แก้ลิสต์แถวตาม realtime event หนึ่งครั้ง
 * @param {Array} rows   แถวปัจจุบันของตารางนั้นใน cache
 * @param {string} table ชื่อตารางจริง (tmk_*)
 * @param {{eventType?: string, new?: object, old?: object}} payload จาก postgres_changes
 * @param {{dailyFrom?: string}} opts ค่าที่ต้องใช้เลียนแบบตัวกรองของ query
 * @returns {Array|null} array ใหม่ (immutable) · **null = patch ไม่ได้ ให้ดึงทั้งตาราง**
 */
export function patchTableRows(rows, table, payload, opts = {}) {
  const cfg = PATCH_CFG[table];
  if (!cfg || !Array.isArray(rows)) return null;

  /* Supabase ตัด payload ทิ้งเมื่อแถวใหญ่เกินเพดาน (ดีฟอลต์ 1 MB) แล้วใส่ errors มาแทน
     → ของที่ได้ไม่ครบ ห้ามเอามา patch (ตารางที่มี jsonb ก้อนใหญ่อย่าง daily_sales ชนได้จริง) */
  if (payload?.errors) return null;

  const type = payload?.eventType;
  if (type !== 'INSERT' && type !== 'UPDATE' && type !== 'DELETE') return null;

  // ลบจริง — payload.old มีแค่ primary key เมื่อ replica identity เป็นดีฟอลต์ ซึ่งพอสำหรับตัดแถว
  if (type === 'DELETE') {
    const id = idOf(payload?.old);
    if (!id) return null;                       // ไม่รู้ว่าแถวไหน → ให้ดึงทั้งตาราง
    return rows.filter(r => idOf(r) !== id);
  }

  const row = payload?.new;
  const id = idOf(row);
  if (!id) return null;

  // แถวนี้ "ควรอยู่ในชุดที่ query คืนมา" หรือไม่ — ต้องตอบให้ตรงกับตัวกรองของ query
  if (cfg.inWindow) {
    if (!opts || opts.dailyFrom == null) return null;   // ไม่รู้ขอบเขต → ไม่เดา
    if (!cfg.inWindow(row, opts)) return rows.filter(r => idOf(r) !== id);
  }
  if (cfg.softDelete && row.deleted_at != null) return rows.filter(r => idOf(r) !== id);

  const i = rows.findIndex(r => idOf(r) === id);
  const next = rows.slice();
  // merge ของเดิม — กันคอลัมน์ที่ payload ไม่ได้ส่งมาหาย (เช่น field ที่ view เติมให้)
  if (i >= 0) next[i] = { ...next[i], ...row };
  else next.push(row);
  if (cfg.sort) next.sort(cfg.sort);
  return next;
}
