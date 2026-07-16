/* ============================================================
   saleData.js — ชั้นข้อมูล Sale: โหลดเฉพาะที่ต้องใช้ + แคชกลาง
   - ตัดคอลัมน์ที่ไม่ใช้ (เลิก select '*') → payload เบาลงมาก
   - โหลดเฉพาะ "หน้าต่างเวลา" ที่กำลังดู (server-side filter) → เข้าหน้าแรกไว
   - แคชข้ามหน้า: ครั้งแรกโหลดจริง ครั้งต่อไปใช้ของในแคช (สลับหน้าทันที)
   ============================================================ */
import { supabase } from './supabaseClient.js';
import { markSaleWrite } from './saleRealtime.js';
import { rtDiag } from '../realtime/diagnostics.js';

// คอลัมน์ที่ระบบใช้จริง (ตัด attrs/jsonb/คอลัมน์ที่ไม่ได้โชว์ออก)
export const ORDERS_SEL = 'order_no,marketplace_id,source,channel,salesperson,province,payment_type,customer_type,qty,qty_band,sales,mkt_commission,cod_amount,job_type,note,order_date,order_month,status,customer_code,customer_name,customer_social,customer_phone,cust_total_spent,row_version';
export const SKUS_SEL = 'id,order_no,channel,design,color,size,qty,line_sales,product_code,raw_sku_or_name,match_how,order_date';
export const CUST_SEL = 'customer_code,name,phone,social_name,province,district,postcode,address,owner,cadence,repurchase,lifetime_orders,lifetime_sales,lifetime_cancel,since,tags';
// override ระดับออเดอร์ (order_id = "source:order_no") — ใช้ร่วม dashboard/perf (กัน select drift)
export const OVERRIDES_SEL = 'order_id,job_type,customer_name,customer_type,salesperson,note,channel,payment_type,sales,qty,province,order_date,cod_amount,customer_phone,customer_social';

const cache = new Map();    // key -> { ts, data }
const inflight = new Map();
const TTL = 5 * 60 * 1000;  // 5 นาที

// ประเภทงาน: รวม "ส่ง" (ขายส่งตามจำนวน) เข้าเป็น "ปลีก" — เหลือ ปลีก / DFT / OEM
// (DFT มาจากหมายเหตุ; ยุบ "ส่ง"→"ปลีก" ทันที)
export const normJobType = (jt) => (jt === 'ส่ง' ? 'ปลีก' : (jt || 'ปลีก'));
// คำ "DFT" ในหมายเหตุ (word-boundary — ตรงกับ jobTypeFromNote/isDftNote ทั้งระบบ)
const DFT_RE = /\bdft\b/i;
// predicate เดียวของทั้งระบบ: หมายเหตุมีคำ "DFT" (word-boundary) — reuse โดย mpReport/receiptParse/views-2
export const isDftNote = (note) => DFT_RE.test(String(note || ''));
// resolve ประเภทงานตอน "อ่าน" — หมายเหตุเป็นเจ้าของ DFT (single source of truth):
//  (1) ยุบ "ส่ง"→"ปลีก"
//  (2) หมายเหตุมี "DFT" → DFT (promote · ครอบใบเก่า/parser จับ note ไม่ติด)
//  (3) หมายเหตุไม่มี "DFT" แต่ค่าเก็บเป็น DFT → กลับเป็น ปลีก (demote · ลบ DFT ในหมายเหตุ = ไม่ DFT)
//  OEM ไม่แตะ · ใช้ทั้ง normOrderRows (raw) และ "หลัง merge override"
export function resolveJobType(jobType, note) {
  const jt = jobType === 'ส่ง' ? 'ปลีก' : (jobType || 'ปลีก');
  const hasDft = DFT_RE.test(String(note || ''));
  if (jt === 'ปลีก' && hasDft) return 'DFT';
  if (jt === 'DFT' && !hasDft) return 'ปลีก';
  return jt;
}
// choke point เดียวของทุกหน้า Sale (orders/dashboard/perf โหลดผ่านที่นี่หมด)
function normOrderRows(rows, table) {
  if (table !== 'tmk_mp_orders' || !Array.isArray(rows)) return rows;
  for (const r of rows) { if (r) r.job_type = resolveJobType(r.job_type, r.note); }
  return rows;
}

// ตัดคอลัมน์ note ออกจาก select (ใช้ fallback ถ้า DB ยังไม่มีคอลัมน์ note)
// schema-tolerant: คอลัมน์ที่เพิ่มทีหลัง (migration อาจยังไม่รัน) → error 42703 = ตัดคอลัมน์ที่ระบบบอกว่าไม่มีออกแล้วลองใหม่
// ครอบ note (20260626) + customer_phone (20260715) + คอลัมน์อนาคต — จุดเดียวคุมทุก caller (dashboard/perf/orders)
const stripCol = (sel, col) => sel.split(',').filter(c => c.trim() !== col).join(',');
const missingColOf = (err, sel) => {
  if (!err || !(err.code === '42703' || /exist/i.test(err.message || ''))) return '';
  const cols = sel.split(',').map(c => c.trim());
  return cols.find(c => c && new RegExp(`\\b${c}\\b`).test(err.message || '')) || '';
};

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

// รัน select แบบ paginate + ถ้าพังเพราะคอลัมน์ยังไม่ migrate → ตัดคอลัมน์นั้นออกแล้วลองใหม่ (วนจนกว่าจะผ่าน/ไม่ใช่ error คอลัมน์)
async function selectAll(table, sel, addFilters) {
  const build = (s) => () => addFilters(supabase.from(table).select(s));
  let s = sel;
  let r = await paginate(build(s));
  for (let i = 0; r.error && i < 3; i++) {
    const col = missingColOf(r.error, s);
    if (!col) break;
    s = stripCol(s, col);
    r = await paginate(build(s));
  }
  return r;
}

// โหลดทั้งตาราง (ใช้กับตารางเล็ก: customers/funnel/aliases/entries)
export async function cachedFetchAll(table, sel = '*', force = false) {
  const key = `${table}|${sel}`;
  const hit = cache.get(key);
  if (!force && hit && (Date.now() - hit.ts) < TTL) { rtDiag.query(table, 0, true); return { data: hit.data, cached: true, truncated: hit.truncated }; }
  if (!force && inflight.has(key)) return inflight.get(key);
  const run = (async () => {
    const r = await selectAll(table, sel, (q) => q);
    inflight.delete(key);
    if (r.error) return r;
    normOrderRows(r.data, table);
    rtDiag.query(table, r.data?.length || 0, false); // Phase 0 baseline: นับ DB query + rows (dev-only)
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
// mark=true (ดีฟอลต์) = "เซฟเอง" → ข้าม echo ของตารางนี้ (กัน realtime โหลดซ้ำ 2×)
// mark=false = เรียกจาก realtime RECEIVE handler (react ต่อ event คนอื่น) → ห้าม mark ไม่งั้นจะ "หูหนวก" ต่อ event ตัวถัดไป 900ms
export function invalidateSaleCache(prefix, { mark = true } = {}) {
  if (mark) markSaleWrite(prefix);
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
  for (const k of [...inflight.keys()]) if (k.startsWith(prefix)) inflight.delete(k);
}

/* ---------- คนทัก (funnel) — helper กลาง ----------
   3 รูปแบบที่รองรับ (back-compat):
   (ก) ใหม่สุด: jsonb `leads` = {Facebook: {new:5, old:3}, LINE: {new:2, old:0}} (แยกใหม่/เก่า)
   (ข) เดิม:    jsonb `leads` = {Facebook: 12, LINE: 8}                        (ทักรวมต่อแพลตฟอร์ม)
   (ค) legacy:  4 คอลัมน์ leads_fb_new/old + leads_line_new/old
   → funnelPlatforms คืน "รวมต่อแพลตฟอร์ม" (ทั้ง 3 รูป) · funnelBreakdown คืน {plat:{new,old}} · funnelNewOld คืน {new,old} รวม */
export function funnelBreakdown(r) {
  const j = r?.leads;
  const out = {};
  if (j && typeof j === 'object' && Object.keys(j).length) {
    for (const [k, v] of Object.entries(j)) {
      if (v && typeof v === 'object') {            // (ก) {new,old}
        const nw = Number(v.new) || 0, od = Number(v.old) || 0;
        if (nw + od > 0) out[k] = { new: nw, old: od };
      } else {                                      // (ข) number แบน — ไม่รู้ใหม่/เก่า
        const n = Number(v) || 0;
        if (n > 0) out[k] = { new: 0, old: 0, unknown: n };
      }
    }
    return out;
  }
  const fbN = Number(r?.leads_fb_new) || 0, fbO = Number(r?.leads_fb_old) || 0;   // (ค) legacy
  const lnN = Number(r?.leads_line_new) || 0, lnO = Number(r?.leads_line_old) || 0;
  if (fbN + fbO > 0) out.Facebook = { new: fbN, old: fbO };
  if (lnN + lnO > 0) out.LINE = { new: lnN, old: lnO };
  return out;
}
const platTotal = (v) => (Number(v?.new) || 0) + (Number(v?.old) || 0) + (Number(v?.unknown) || 0);
export function funnelPlatforms(r) {
  const bd = funnelBreakdown(r);
  const out = {};
  for (const [k, v] of Object.entries(bd)) { const n = platTotal(v); if (n > 0) out[k] = n; }
  return out;
}
export function funnelNewOld(r) {
  const bd = funnelBreakdown(r);
  let nw = 0, od = 0;
  for (const v of Object.values(bd)) { nw += Number(v.new) || 0; od += Number(v.old) || 0; }
  return { new: nw, old: od };
}
export const funnelTotal = (r) => Object.values(funnelPlatforms(r)).reduce((a, v) => a + v, 0);
