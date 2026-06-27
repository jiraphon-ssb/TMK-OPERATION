/* ============================================================
   saleData.js — ชั้นข้อมูล Sale: โหลดเฉพาะที่ต้องใช้ + แคชกลาง
   - ตัดคอลัมน์ที่ไม่ใช้ (เลิก select '*') → payload เบาลงมาก
   - โหลดเฉพาะ "หน้าต่างเวลา" ที่กำลังดู (server-side filter) → เข้าหน้าแรกไว
   - แคชข้ามหน้า: ครั้งแรกโหลดจริง ครั้งต่อไปใช้ของในแคช (สลับหน้าทันที)
   ============================================================ */
import { supabase } from './supabaseClient.js';

// คอลัมน์ที่ระบบใช้จริง (ตัด attrs/jsonb/คอลัมน์ที่ไม่ได้โชว์ออก)
export const ORDERS_SEL = 'order_no,marketplace_id,source,channel,salesperson,province,payment_type,customer_type,qty,qty_band,sales,cost,profit,mkt_commission,cod_amount,job_type,note,order_date,order_month,status,customer_code,customer_name,customer_social,cust_total_spent';
export const SKUS_SEL = 'order_no,channel,design,color,size,qty,line_sales,product_code,raw_sku_or_name,match_how,order_date';
export const CUST_SEL = 'customer_code,name,phone,social_name,province,district,postcode,address,owner,cadence,repurchase,lifetime_orders,lifetime_sales,lifetime_cancel,since,tags';

const cache = new Map();    // key -> { ts, data }
const inflight = new Map();
const TTL = 5 * 60 * 1000;  // 5 นาที

// ประเภทงาน: รวม "ส่ง" (ขายส่งตามจำนวน) เข้าเป็น "ปลีก" — เหลือ ปลีก / DFT / OEM
// (DFT มาจากหมายเหตุตอน import; ข้อมูลเก่าก่อน re-import จะยังไม่มี DFT แต่ "ส่ง" จะถูกยุบเป็น "ปลีก" ทันที)
export const normJobType = (jt) => (jt === 'ส่ง' ? 'ปลีก' : (jt || 'ปลีก'));
function normOrderRows(rows, table) {
  if (table !== 'tmk_mp_orders' || !Array.isArray(rows)) return rows;
  for (const r of rows) { if (r && r.job_type === 'ส่ง') r.job_type = 'ปลีก'; }
  return rows;
}

// ตัดคอลัมน์ note ออกจาก select (ใช้ fallback ถ้า DB ยังไม่มีคอลัมน์ note)
const stripNote = (sel) => sel.split(',').filter(c => c.trim() !== 'note').join(',');
const isMissingNote = (err) => err && (err.code === '42703' || /note/i.test(err.message || '')) && /exist/i.test(err.message || '');

const PAGINATE_MAX_PAGES = 100;   // เพดานกัน query หลุด = 100k แถว/ช่วงเวลา
async function paginate(buildQuery) {
  const out = []; let from = 0; let truncated = false;
  for (let i = 0; i < PAGINATE_MAX_PAGES; i++) {
    const { data, error } = await buildQuery().range(from, from + 999);
    if (error) return { error };
    out.push(...(data || [])); if (!data || data.length < 1000) break; from += 1000;
    // ครบเพดานแล้วแต่หน้าสุดท้ายยังเต็ม = ยังมีข้อมูลต่อ → เตือนว่าตัดข้อมูล
    if (i === PAGINATE_MAX_PAGES - 1 && data.length === 1000) {
      truncated = true;
      console.warn(`[saleData] paginate ชนเพดาน ${PAGINATE_MAX_PAGES * 1000} แถว — ข้อมูลถูกตัด (truncated)`);
    }
  }
  return { data: out, truncated };
}

// รัน select แบบ paginate + ถ้าพังเพราะยังไม่มีคอลัมน์ note → ลองใหม่โดยตัด note ออก
async function selectAll(table, sel, addFilters) {
  const build = (s) => () => addFilters(supabase.from(table).select(s));
  let r = await paginate(build(sel));
  if (r.error && isMissingNote(r.error) && sel.includes('note')) r = await paginate(build(stripNote(sel)));
  return r;
}

// โหลดทั้งตาราง (ใช้กับตารางเล็ก: customers/funnel/aliases/entries)
export async function cachedFetchAll(table, sel = '*', force = false) {
  const key = `${table}|${sel}`;
  const hit = cache.get(key);
  if (!force && hit && (Date.now() - hit.ts) < TTL) return { data: hit.data, cached: true, truncated: hit.truncated };
  if (!force && inflight.has(key)) return inflight.get(key);
  const run = (async () => {
    const r = await selectAll(table, sel, (q) => q);
    inflight.delete(key);
    if (r.error) return r;
    normOrderRows(r.data, table);
    cache.set(key, { ts: Date.now(), data: r.data, truncated: r.truncated });
    return r;
  })();
  inflight.set(key, run);
  return run;
}

// โหลดเฉพาะช่วงวันที่ (server-side) — ใช้กับ orders/skus ที่มีจำนวนมาก
export async function cachedFetchRange(table, sel, from, to, dateCol = 'order_date', force = false) {
  if (!from || !to) return cachedFetchAll(table, sel, force);
  const key = `${table}|${sel}|${from}|${to}`;
  const hit = cache.get(key);
  if (!force && hit && (Date.now() - hit.ts) < TTL) return { data: hit.data, cached: true, truncated: hit.truncated };
  if (!force && inflight.has(key)) return inflight.get(key);
  const run = (async () => {
    const r = await selectAll(table, sel, (q) => q.gte(dateCol, from).lte(dateCol, to));
    inflight.delete(key);
    if (r.error) return r;
    normOrderRows(r.data, table);
    cache.set(key, { ts: Date.now(), data: r.data, truncated: r.truncated });
    return r;
  })();
  inflight.set(key, run);
  return run;
}

// ขอบวันที่จริงในฐานข้อมูล (min/max) — สำหรับตัวเลือกวันที่ · เบามาก (2 แถว)
export async function getDateBounds(table = 'tmk_mp_orders', dateCol = 'order_date', force = false) {
  const key = `__bounds|${table}`;
  const hit = cache.get(key);
  if (!force && hit && (Date.now() - hit.ts) < TTL) return hit.data;
  const lo = await supabase.from(table).select(dateCol).not(dateCol, 'is', null).order(dateCol, { ascending: true }).limit(1);
  const hi = await supabase.from(table).select(dateCol).not(dateCol, 'is', null).order(dateCol, { ascending: false }).limit(1);
  const b = { min: lo.data?.[0]?.[dateCol] || null, max: hi.data?.[0]?.[dateCol] || null };
  cache.set(key, { ts: Date.now(), data: b });
  return b;
}

// ล้างแคช — หลังนำเข้า/บันทึก เพื่อให้รอบหน้าโหลดของใหม่
export function clearSaleCache() { cache.clear(); inflight.clear(); }

// ลบ cache เฉพาะ key ที่ขึ้นต้นด้วย prefix (invalidate ตารางเดียว ไม่กระทบตารางอื่น)
export function invalidateSaleCache(prefix) {
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
  for (const k of [...inflight.keys()]) if (k.startsWith(prefix)) inflight.delete(k);
}
