/* ============================================================
   saleData.js — ชั้นข้อมูล Sale: โหลดเฉพาะที่ต้องใช้ + แคชกลาง
   - ตัดคอลัมน์ที่ไม่ใช้ (เลิก select '*') → payload เบาลงมาก
   - โหลดเฉพาะ "หน้าต่างเวลา" ที่กำลังดู (server-side filter) → เข้าหน้าแรกไว
   - แคชข้ามหน้า: ครั้งแรกโหลดจริง ครั้งต่อไปใช้ของในแคช (สลับหน้าทันที)
   ============================================================ */
import { supabase } from './supabaseClient.js';

// คอลัมน์ที่ระบบใช้จริง (ตัด attrs/jsonb/คอลัมน์ที่ไม่ได้โชว์ออก)
export const ORDERS_SEL = 'order_no,marketplace_id,source,channel,salesperson,province,payment_type,customer_type,qty,qty_band,sales,cost,profit,mkt_commission,cod_amount,job_type,order_date,order_month,status,customer_code,customer_name,customer_social,cust_total_spent';
export const SKUS_SEL = 'order_no,channel,design,color,size,qty,line_sales,product_code,raw_sku_or_name,match_how,order_date';
export const CUST_SEL = 'customer_code,name,phone,social_name,province,district,postcode,address,owner,cadence,repurchase,lifetime_orders,lifetime_sales,lifetime_cancel,since,tags';

const cache = new Map();    // key -> { ts, data }
const inflight = new Map();
const TTL = 5 * 60 * 1000;  // 5 นาที

async function paginate(buildQuery) {
  const out = []; let from = 0;
  for (let i = 0; i < 100; i++) {
    const { data, error } = await buildQuery().range(from, from + 999);
    if (error) return { error };
    out.push(...(data || [])); if (!data || data.length < 1000) break; from += 1000;
  }
  return { data: out };
}

// โหลดทั้งตาราง (ใช้กับตารางเล็ก: customers/funnel/aliases/entries)
export async function cachedFetchAll(table, sel = '*', force = false) {
  const key = `${table}|${sel}`;
  const hit = cache.get(key);
  if (!force && hit && (Date.now() - hit.ts) < TTL) return { data: hit.data, cached: true };
  if (!force && inflight.has(key)) return inflight.get(key);
  const run = (async () => {
    const r = await paginate(() => supabase.from(table).select(sel));
    inflight.delete(key);
    if (r.error) return r;
    cache.set(key, { ts: Date.now(), data: r.data });
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
  if (!force && hit && (Date.now() - hit.ts) < TTL) return { data: hit.data, cached: true };
  if (!force && inflight.has(key)) return inflight.get(key);
  const run = (async () => {
    const r = await paginate(() => supabase.from(table).select(sel).gte(dateCol, from).lte(dateCol, to));
    inflight.delete(key);
    if (r.error) return r;
    cache.set(key, { ts: Date.now(), data: r.data });
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
