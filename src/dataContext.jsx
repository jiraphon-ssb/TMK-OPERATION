/* ============================================================
   TMK Operation — Data Context (Supabase only — no mock)
   ============================================================
   - โหลดทั้งหมด 15 ตารางจาก Supabase ตอน mount
   - Mutate TMK object in-place เพื่อให้ views ที่ import { TMK } เห็นค่าจริง
   - Force re-render ผ่าน React state เมื่อ data มา
   - Realtime subscription: อัปเดตอัตโนมัติเมื่อ DB เปลี่ยน
   ============================================================ */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { TMK } from './data.js';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient.js';
import { getToday } from './lib/dateUtils.js';
import { computeMonthPure } from './lib/computeMonthPure.js';
import { mapToTMK } from './lib/mapToTMK.js';

const DataContext = createContext();





// Query map ต่อตาราง — แยกออกมาเพื่อใช้ซ้ำใน refreshTables (per-table refresh)
// จุดเดียวเปลี่ยน → ทั้ง loadAllTables และ refreshTables เห็นพร้อมกัน
const dailyFromDate = () => { const d = new Date(); d.setMonth(d.getMonth() - 13); return d.toISOString().slice(0, 10); };
const QUERIES = {
  settings:    () => supabase.from('tmk_settings').select('*').eq('id', 'main').maybeSingle(),
  channels:    () => supabase.from('tmk_channels').select('*').is('deleted_at', null).order('sort_order'),
  campaigns:   () => supabase.from('tmk_campaigns').select('*').is('deleted_at', null).order('sort_order', { nullsFirst: false }).order('start_date'),
  tasks:       () => supabase.from('tmk_tasks').select('*').is('deleted_at', null).order('date'),
  brands:      () => supabase.from('tmk_brands').select('*').is('deleted_at', null).order('sort_order'),
  flows:       () => supabase.from('tmk_flows').select('*').is('deleted_at', null).order('sort_order'),
  products:    () => supabase.from('tmk_products').select('id,name,price,actual_units,stock_on_hand,reorder_point,strategy,image_url,category,supplier,sku,barcode,lots,reservations').is('deleted_at', null).order('created_at'),
  audit:       () => supabase.from('tmk_audit_logs').select('id,user_email,action,details,created_at,flow_id,entity_type,entity_id,severity').order('created_at', { ascending: false }).limit(200),
  roles:       () => supabase.from('tmk_user_roles').select('*').is('deleted_at', null),
  staff:       () => supabase.from('tmk_staff').select('*').is('deleted_at', null).order('joined_at'),
  duties:      () => supabase.from('tmk_duties').select('*').is('deleted_at', null).order('sort_order'),
  // จำกัด 13 เดือนล่าสุด — เดือนเก่ากว่านั้น computeMonth fallback ไป tmk_monthly_history.actual
  daily:       () => supabase.from('tmk_daily_sales').select('date,day_name,channels,ad_spend,avg_reply_minutes,note,deleted_at,shopee,tiktok,lazada,facebook,line_oa,crm').gte('date', dailyFromDate()).order('date'),
  adCamps:     () => supabase.from('tmk_ad_campaigns').select('*').is('deleted_at', null).order('start_date'),
  segments:    () => supabase.from('tmk_customer_segments').select('*').is('deleted_at', null).order('sort_order'),
  fbMetrics:   () => supabase.from('tmk_fb_metrics').select('*').eq('id', 'current').maybeSingle(),
  monthly:     () => supabase.from('tmk_monthly_history').select('*').order('year').order('month'),
  colorMix:    () => supabase.from('tmk_color_mix').select('*').order('sort_order'),
  sizeMix:     () => supabase.from('tmk_size_mix').select('*').order('sort_order'),
  // จำกัด 300 รายล่าสุด — ค้นหาฝั่ง server ในหน้า CustomersView ครอบคลุมลูกค้านอกชุดนี้
  customers:   () => supabase.from('tmk_customers').select('*').order('created_at', { ascending: false }).limit(150),
  orders:      () => supabase.from('tmk_orders').select('id,code,customer_id,customer_name,items,subtotal,discount,total,status,channel,tracking_no,carrier,note,status_log,created_at').order('created_at', { ascending: false }).limit(200),
  customerTotals: () => supabase.from('tmk_customer_totals').select('customer_id,order_count,total_spent'),
  commentCounts: () => supabase.from('tmk_task_comment_counts').select('task_id,comment_count'),
};
// ตาราง Supabase → key ใน raw/QUERIES (สำหรับแมป realtime event)
const TABLE_KEY = {
  tmk_channels: 'channels', tmk_campaigns: 'campaigns', tmk_tasks: 'tasks', tmk_brands: 'brands', tmk_flows: 'flows', tmk_products: 'products',
  tmk_settings: 'settings', tmk_user_roles: 'roles', tmk_staff: 'staff', tmk_duties: 'duties',
  tmk_daily_sales: 'daily', tmk_ad_campaigns: 'adCamps', tmk_customer_segments: 'segments',
  tmk_fb_metrics: 'fbMetrics', tmk_monthly_history: 'monthly', tmk_color_mix: 'colorMix',
  tmk_size_mix: 'sizeMix', tmk_orders: 'orders', tmk_customers: 'customers',
};
// ตารางที่กระทบ derived (orderCount/totalSpent) → ต้อง refresh view ด้วย
const TOTALS_TRIGGERS = new Set(['orders']);
// ตารางที่ใช้เฉพาะหน้า Sales/แคตตาล็อก — ไม่โหลดตอนเปิดแอป · โหลดเมื่อกดเข้า section (ensureLoaded) · mapToTMK null-safe (raw.X || [])
// หมายเหตุ: audit ไม่ defer (หน้าหลักโชว์ "อัพเดทล่าสุด") · monthly ไม่ defer (เป็นเป้ายอด)
const DEFERRED = new Set(['adCamps', 'colorMix', 'sizeMix', 'fbMetrics']);

// โหลดทุกตารางพร้อมกัน (ครั้งแรก) — เรียก QUERIES ทั้งชุด
async function loadAllTables() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase ยังไม่ได้ตั้งค่า (.env)');
  }

  const mainKeys = Object.keys(QUERIES).filter(k => k !== 'customerTotals' && k !== 'commentCounts' && !DEFERRED.has(k));
  const tables = Object.fromEntries(mainKeys.map(k => [k, QUERIES[k]()]));

  const keys = Object.keys(tables);
  const results = await Promise.all(Object.values(tables));

  // ตรวจ errors — log ตารางไหนล้ม (อาจจะยังไม่ได้ run migration / สิทธิ์ RLS)
  const result = {};
  const failed = [];
  results.forEach((r, i) => {
    const key = keys[i];
    if (r.error) {
      console.warn(`⚠️ tmk_${key}: ${r.error.message}`);
      // ตารางใหม่ (โครงการ/แบรนด์) = optional → ยังไม่รัน migration ก็ degrade เงียบ ไม่ขึ้น toast เตือน
      if (key !== 'brands' && key !== 'flows') failed.push(key);
      result[key] = Array.isArray(r.data) ? [] : null;
    } else {
      result[key] = r.data;
    }
  });
  if (failed.length) result.__errors = failed; // ส่งต่อให้ load() แจ้งผู้ใช้ (กันตารางพังดูเหมือน "ไม่มีข้อมูล")

  // ยอดสะสมต่อลูกค้าจาก view (รวมทุกออเดอร์ ไม่ติด limit 500) — optional
  // ถ้ายัง migration ไม่รันก็เงียบ (ไม่เข้า __errors) และ mapToTMK fallback ไปรวมจาก orders ที่โหลดมา
  const ctRes = await QUERIES.customerTotals();
  if (!ctRes.error && Array.isArray(ctRes.data)) result.customerTotals = ctRes.data;

  // จำนวนคอมเมนต์ต่อ task (ป้าย 💬 บนการ์ด) — optional · ก่อนรัน migration view = เงียบ
  const ccRes = await QUERIES.commentCounts();
  if (!ccRes.error && Array.isArray(ccRes.data)) result.commentCounts = ccRes.data;

  return result;
}



// แคมเปญแอดอยู่ในเดือนที่เลือกหรือไม่ (ช่วงวันที่ทับซ้อนเดือน) — ไม่มีวันที่ = แสดงทุกเดือน
export function adCampaignInMonth(c, monthIdx0, yearBE) {
  if (!c.startDate && !c.endDate) return true;
  const yearCE = yearBE - 543;
  const mStart = new Date(yearCE, monthIdx0, 1);
  const mEnd = new Date(yearCE, monthIdx0 + 1, 0, 23, 59, 59);
  const s = c.startDate ? new Date(c.startDate) : mStart;
  const e = c.endDate ? new Date(c.endDate) : mEnd;
  return s <= mEnd && e >= mStart;
}
// คำนวณข้อมูลของ "เดือนที่เลือก" จาก TMK.dailyAll + TMK.monthly + TMK.channels
// ใช้ใน SalesView เพื่อให้เปลี่ยนเดือนแล้วข้อมูลเปลี่ยนตาม (อดีต/ปัจจุบัน/อนาคต)
export function computeMonth(monthIdx0, yearBE) {
  return computeMonthPure(monthIdx0, yearBE, {
    dailyAll: TMK.dailyAll, monthly: TMK.monthly, channels: TMK.channels,
    clv: TMK.computed.CLV, today: getToday(),
  });
}

// Mutate TMK in-place — views ที่ import TMK จะเห็นค่าใหม่
function mutateTMK(mapped) {
  // Replace nested objects
  Object.assign(TMK.consts, mapped.consts);
  Object.assign(TMK.computed, mapped.computed);
  Object.assign(TMK.fb, mapped.fb);
  // Replace arrays (length = 0 + push)
  ['channels','campaigns','tasks','brands','flows','products','dailyMonth','dailyLog','month3','yoy','monthly','dailyAll',
   'colorMix','sizeMix','staff','audit','roles','duties','orders','customers',
   'adCampaigns','segments'].forEach(key => {
    if (!TMK[key]) TMK[key] = [];
    TMK[key].length = 0;
    TMK[key].push(...(mapped[key] || []));
  });
}

// บันทึก snapshot มูลค่า/จำนวนคลังรวมของวันนี้ (1 แถว/วัน) → กราฟแนวโน้มในรายงาน
// เขียนเฉพาะเมื่อค่าเปลี่ยน (กันเขียนซ้ำตอน re-render/อ่านเฉยๆ) · fire-and-forget · ตารางไม่มีก็เงียบ
let _lastSnap = { day: null, value: null };
function recordInventorySnapshot() {
  try {
    const products = TMK.products || [];
    if (!products.length) return;
    const units = products.reduce((a, p) => a + (p.onHand || 0), 0);
    const value = Math.round(products.reduce((a, p) => a + (p.stockValue || 0), 0));
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (_lastSnap.day === day && _lastSnap.value === value) return;
    _lastSnap = { day, value };
    supabase.from('tmk_inventory_snapshots').upsert({ id: day, date: day, units, value, updated_at: new Date().toISOString() }).then(() => {}, () => {});
  } catch { /* non-fatal */ }
}

export function DataProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0); // bump on reload → forces re-render
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false); // กันโหลดซ้อน (window.__reload + realtime ยิงพร้อมกัน)
  const pendingRef = useRef(false);            // จอง "full reload" (มาจาก load ซ้อนเท่านั้น)
  const pendingTablesRef = useRef(new Set());  // จอง per-table refresh ที่เข้ามาระหว่าง in-flight → ระบายเฉพาะตารางนั้น (ไม่ full load)
  const lastRefreshAtRef = useRef({});         // เวลาที่ตารางถูก refresh จาก "การเซฟของเครื่องนี้" — ให้ realtime ข้าม echo ตัวเอง
  const rawRef = useRef(null); // baseline ของทุกตาราง — ใช้สำหรับ per-table refresh (ไม่ต้องโหลดใหม่ทั้งชุด)

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      setError('Supabase ยังไม่ได้ตั้งค่า');
      return;
    }
    if (inFlightRef.current) { pendingRef.current = true; return; } // กำลังโหลดอยู่ → จองโหลดอีกรอบหลังเสร็จ
    inFlightRef.current = true;
    try {
      setLoading(true);
      const raw = await loadAllTables();
      if (!mountedRef.current) return;
      rawRef.current = raw; // เก็บ baseline สำหรับ refreshTables (per-table refresh ที่จะใช้แทน full reload)
      const mapped = mapToTMK(raw);
      mutateTMK(mapped);
      if (window.__canEdit !== false) recordInventorySnapshot(); // บันทึกมูลค่าคลังของวันนี้ (ถ้าเปลี่ยน) — ข้ามถ้าเป็น viewer (กัน viewer เขียน DB)
      setError(null);
      setVersion(v => v + 1);
      if (raw.__errors?.length) window.__toast?.(`บางตารางโหลดไม่สำเร็จ: ${raw.__errors.join(', ')} — อาจต้องรัน migration หรือสิทธิ์ไม่พอ`, 'warn');
      console.log('✅ Loaded from Supabase:', {
        channels: TMK.channels.length,
        campaigns: TMK.campaigns.length,
        tasks: TMK.tasks.length,
        products: TMK.products.length,
        daily: TMK.dailyMonth.length,
        target: TMK.consts.TARGET,
        MTD: TMK.computed.MTD,
      });
    } catch (e) {
      console.error('❌ Load failed:', e);
      if (mountedRef.current) setError(e.message);
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
      if (pendingRef.current && mountedRef.current) { pendingRef.current = false; pendingTablesRef.current.clear(); load(); } // มีคำขอค้าง → โหลดอีกรอบให้ได้ข้อมูลล่าสุด
      else if (pendingTablesRef.current.size && mountedRef.current) { const ts = [...pendingTablesRef.current]; pendingTablesRef.current.clear(); refreshTablesRef.current?.(ts, { fromRealtime: true }); } // per-table ค้างระหว่าง full load → ระบายเฉพาะตารางนั้น (กันพลาดการเปลี่ยนแปลงระหว่างโหลด)
    }
  }, []);

  // Per-table refresh — ตารางไหนเปลี่ยน fetch ใหม่เฉพาะตารางนั้น แล้วยัดกลับเข้า raw cache + map ใหม่ + bump version
  // ลด bandwidth/render churn เมื่อใครเซฟอะไรก็ตาม (ไม่ต้องดาวน์โหลด 20 ตารางใหม่ทุกครั้ง)
  // — ไม่มี baseline หรือ list มี customers/orders ที่ตัวรวม view ต้องอัปเดต → fallback ไป full load
  const refreshTables = useCallback(async (tableNames, opts = {}) => {
    const keys = [...new Set((tableNames || []).map(t => TABLE_KEY[t]).filter(k => k && QUERIES[k]))];
    const needCounts = (tableNames || []).includes('tmk_task_comments'); // คอมเมนต์เปลี่ยน → รีเฟรชจำนวน 💬 บนการ์ด
    if (!rawRef.current || (!keys.length && !needCounts)) { return load(); }
    if (inFlightRef.current) { (tableNames || []).forEach(t => pendingTablesRef.current.add(t)); return; } // กำลังโหลด → จองเฉพาะตารางที่ขอ (ระบายด้วย per-table refresh ไม่ใช่ full load)
    inFlightRef.current = true;
    // จดเวลาเฉพาะการเซฟของเครื่องนี้ (ไม่ใช่ flush จาก realtime) → ให้ handler ข้าม echo event ของตัวเอง 1 ครั้ง
    if (!opts.fromRealtime) { const now = Date.now(); (tableNames || []).forEach(t => { lastRefreshAtRef.current[t] = now; }); }
    try {
      const results = await Promise.all(keys.map(k => QUERIES[k]()));
      if (!mountedRef.current) return;
      results.forEach((r, i) => {
        if (!r.error) rawRef.current[keys[i]] = r.data;
      });
      // ถ้าตารางที่เปลี่ยนกระทบ derived view (เช่น orders → tmk_customer_totals) → refresh view ด้วย
      if (keys.some(k => TOTALS_TRIGGERS.has(k))) {
        const ct = await QUERIES.customerTotals();
        if (!ct.error && Array.isArray(ct.data)) rawRef.current.customerTotals = ct.data;
      }
      if (needCounts) {
        const cc = await QUERIES.commentCounts();
        if (!cc.error && Array.isArray(cc.data)) rawRef.current.commentCounts = cc.data;
      }
      const mapped = mapToTMK(rawRef.current);
      mutateTMK(mapped);
      setVersion(v => v + 1);
    } catch (e) {
      console.warn('per-table refresh failed, fallback to full load:', e?.message);
      await load();
    } finally {
      inFlightRef.current = false;
      if (pendingRef.current && mountedRef.current) { pendingRef.current = false; pendingTablesRef.current.clear(); load(); } // มี full reload ค้าง → โหลดเต็ม (ครอบทุกตาราง)
      else if (pendingTablesRef.current.size && mountedRef.current) { const ts = [...pendingTablesRef.current]; pendingTablesRef.current.clear(); refreshTables(ts, { fromRealtime: true }); } // per-table ค้าง → ระบายเฉพาะตารางนั้น (เดิม fallback เป็น full load 20 ตาราง)
    }
  }, [load]);
  const refreshTablesRef = useRef(null); refreshTablesRef.current = refreshTables; // ให้ load() (นิยามก่อนหน้า) เรียกระบายคิว per-table ได้

  // โหลดตาราง deferred ตอนกดเข้า section ที่ใช้ (ครั้งเดียว/แคช) → ลด egress ตอนเปิดแอป
  const deferredLoadedRef = useRef(new Set());
  const ensureLoaded = useCallback(async (wantKeys) => {
    if (!rawRef.current) return; // ยังโหลดครั้งแรกไม่เสร็จ — section จะเรียกซ้ำเมื่อ version ขยับ
    const keys = (wantKeys || []).filter(k => QUERIES[k] && !deferredLoadedRef.current.has(k));
    if (!keys.length) return;
    keys.forEach(k => deferredLoadedRef.current.add(k)); // mark ก่อน กัน race โหลดซ้ำ
    // fetch เฉพาะที่ยังไม่มีใน rawRef (realtime/refreshTables อาจโหลดให้แล้ว → ไม่ดึงซ้ำ/ไม่ทับของใหม่)
    const toFetch = keys.filter(k => rawRef.current[k] === undefined);
    if (!toFetch.length) return;
    try {
      const results = await Promise.all(toFetch.map(k => QUERIES[k]()));
      if (!mountedRef.current) return;
      let any = false;
      results.forEach((r, i) => { if (!r.error) { rawRef.current[toFetch[i]] = r.data; any = true; } else { deferredLoadedRef.current.delete(toFetch[i]); } });
      if (any) { mutateTMK(mapToTMK(rawRef.current)); setVersion(v => v + 1); }
    } catch { toFetch.forEach(k => deferredLoadedRef.current.delete(k)); }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();

    // Realtime subscription — ถ้าต่อ WS ไม่ได้ (เน็ตหลุด/ปิด realtime) → degrade เป็น polling (ไม่ retry รัวจน console รก)
    let timer = null, pollTimer = null, connectTimeout = null, usingPoll = false;
    const onVis = () => { // กลับมาที่แท็บ (โหมด poll) → ดึงตารางหลัก + ลองต่อ realtime ใหม่ (เน็ตอาจกลับมาแล้ว)
      if (document.visibilityState !== 'visible' || !mountedRef.current) return;
      refreshTables(POLL_TABLES, { fromRealtime: true });
      retryRealtime();
    };
    // ตารางที่เปลี่ยนบ่อยระหว่างทำงาน — poll fallback ดึงเฉพาะกลุ่มนี้ (ลด egress; ตารางตั้งค่าที่นิ่งจะรีเฟรชตอนสลับแท็บ/โหลดใหม่)
    const POLL_TABLES = ['tmk_daily_sales', 'tmk_orders', 'tmk_customers', 'tmk_tasks', 'tmk_products', 'tmk_channels', 'tmk_campaigns', 'tmk_ad_campaigns', 'tmk_flows', 'tmk_task_comments'];
    const startPolling = () => {
      if (usingPoll || !mountedRef.current) return;
      usingPoll = true;
      teardownChannel(); // เอาเฉพาะ channel ของ data-context ออก (อย่า disconnect ทั้ง socket — กระดิ่งแจ้งเตือน + แผงคอมเมนต์มี channel ของตัวเองที่ยังต้องใช้)
      pollTimer = setInterval(() => { if (document.visibilityState === 'visible') refreshTables(POLL_TABLES, { fromRealtime: true }); }, 120000); // ดึงเฉพาะตารางที่เปลี่ยนบ่อย ทุก 120 วิ
      document.addEventListener('visibilitychange', onVis); // + ตอนกลับมาที่แท็บ (ดึงตารางหลัก + ลองต่อ realtime ใหม่)
      console.info('ℹ️ Realtime ใช้ไม่ได้ — สลับเป็นรีเฟรชอัตโนมัติ (120 วิ เฉพาะตารางหลัก · กลับมาที่แท็บ = ดึง+ลองต่อ realtime ใหม่); การบันทึกในเครื่องนี้รีเฟรชทันทีอยู่แล้ว');
    };
    const pendingTables = new Set(); // ตารางที่เปลี่ยน — flush ทีเดียวด้วย refreshTables
    const channelTables = [
      'tmk_channels','tmk_campaigns','tmk_tasks','tmk_brands','tmk_flows','tmk_products','tmk_settings',
      'tmk_user_roles','tmk_staff','tmk_duties','tmk_daily_sales','tmk_ad_campaigns',
      'tmk_customer_segments','tmk_fb_metrics','tmk_monthly_history',
      'tmk_color_mix','tmk_size_mix',
      'tmk_orders','tmk_customers', // บอร์ดออเดอร์/ลูกค้าอัปเดตสดข้ามอุปกรณ์
      'tmk_task_comments', // เปลี่ยน → รีเฟรชจำนวน 💬 บนการ์ด (needCounts ใน refreshTables · ไม่ full load)
      // ไม่ subscribe tmk_audit_logs — การเขียน log ไม่ควร trigger reload เต็ม (ลด reload ซ้ำตอนเซฟ)
    ];
    // ต่อ realtime แบบทนทาน: WS blip/หลับเครื่อง (CLOSED/TIMED_OUT) → ลองต่อใหม่ backoff ก่อน · เฉพาะ error จริง → poll
    let channel = null, reconnectAttempts = 0, reconnectTimer = null;
    const MAX_RECONNECT = 3;
    // สำคัญ: null "ก่อน" removeChannel — unsubscribe ยิง status CLOSED กลับเข้า callback แบบ synchronous
    // ถ้า null ทีหลัง callback จะเรียก teardown ซ้ำเป็นลูกโซ่ = Maximum call stack size exceeded
    const teardownChannel = () => {
      if (!channel) return;
      const ch = channel; channel = null;
      try { supabase.removeChannel(ch); } catch { /* ignore */ }
    };
    const connectRealtime = () => {
      if (!supabase) { startPolling(); return; }
      if (usingPoll || !mountedRef.current) return;
      const ch = supabase.channel('tmk-realtime');
      channel = ch;
      channelTables.forEach(t => {
        ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => {
          // ข้าม echo ของการเซฟจากเครื่องนี้เอง "1 ครั้ง" — เราเพิ่ง refresh ตารางนี้ไปแล้ว (<800ms) ไม่ต้องดึงซ้ำ
          // ปลอดภัยเพราะ event มาตามลำดับ commit: event แรกหลังเซฟเรา = ของเราเอง (ข้อมูลอยู่ใน fetch แล้ว)
          // ลบ stamp หลังข้าม → event ถัดไป (ของคนอื่น) ประมวลผลปกติ ไม่มีช่องพลาดข้อมูล
          if (Date.now() - (lastRefreshAtRef.current[t] || 0) < 800) { delete lastRefreshAtRef.current[t]; return; }
          pendingTables.add(t);
          clearTimeout(timer);
          timer = setTimeout(() => {
            const ts = [...pendingTables]; pendingTables.clear();
            refreshTables(ts, { fromRealtime: true }); // ดึงเฉพาะตารางที่เปลี่ยน (flush จาก realtime — ไม่ stamp กัน echo กินต่อกันเป็นลูกโซ่)
          }, 300);
        });
      });
      ch.subscribe((status) => {
        if (channel !== ch) return; // event จาก channel เก่าที่ถูก teardown ไปแล้ว (CLOSED ตอน unsubscribe) — เมิน กันลูป
        if (status === 'SUBSCRIBED') { clearTimeout(connectTimeout); reconnectAttempts = 0; }
        else if (status === 'CHANNEL_ERROR') { clearTimeout(connectTimeout); teardownChannel(); startPolling(); }
        else if (status === 'CLOSED' || status === 'TIMED_OUT') {
          clearTimeout(connectTimeout); teardownChannel();
          if (mountedRef.current && !usingPoll && reconnectAttempts < MAX_RECONNECT) {
            reconnectAttempts += 1;
            reconnectTimer = setTimeout(connectRealtime, 1000 * reconnectAttempts); // backoff 1/2/3 วิ
          } else { startPolling(); }
        }
      });
      connectTimeout = setTimeout(() => { if (channel === ch) { teardownChannel(); startPolling(); } }, 8000); // WS ค้าง → fallback (เฉพาะ channel ปัจจุบัน)
    };
    // กลับจากโหมด poll → realtime เมื่อเน็ตกลับมา (เดิม: หลุดเกิน 3 ครั้ง = poll ถาวรจนรีเฟรชหน้า)
    const retryRealtime = () => {
      if (!usingPoll || !mountedRef.current) return;
      usingPoll = false;
      clearInterval(pollTimer); pollTimer = null;
      document.removeEventListener('visibilitychange', onVis);
      reconnectAttempts = 0;
      connectRealtime(); // ต่อไม่สำเร็จ → status handler จะ startPolling กลับให้เอง (interval+listener ตั้งใหม่)
    };
    connectRealtime();

    return () => {
      mountedRef.current = false;
      clearTimeout(timer); clearTimeout(connectTimeout); clearTimeout(reconnectTimer); clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', onVis);
      teardownChannel();
    };
  }, [load, refreshTables]);

  return (
    <DataContext.Provider value={{ loading, error, version, reload: load, refresh: refreshTables, ensureLoaded }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  return useContext(DataContext);
}
