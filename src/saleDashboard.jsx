/* ============================================================
   saleDashboard.jsx — แดชบอร์ดยอดขายเต็มระบบ (หน้า Sale)
   P1: time picker + global filter + 12 KPI + เทรนด์(S1) + ลาย(S3) + drill
   ข้อมูล: fetch ครั้งเดียว → aggregate ฝั่ง client (saleAgg/saleTime)
   ============================================================ */
import { useState, useEffect, useMemo } from 'react';
import { N, Icon, useDelayedFlag, SourceBadge, InfoTip } from './components.jsx';
import { SideSheet } from './modals-core.jsx';
import { MpImportModal } from './modals-import.jsx';
import { MetricCard, CountUp, GradientSparkline, channelColor, AreaTrend } from './charts.jsx';
import { ChannelLogo, channelTint } from './lib/channelLogos.jsx';
import { compute, series, deltaKpi, sizeRank, normColor } from './lib/saleAgg.js';
import { useRenderCount } from './realtime/useRenderCount.js';
import { bucketKey, bucketLabel, enumerateBuckets, autoGran, presetRange, PRESETS, prevPeriod, prevCalendarMonth, isFullCalendarMonth, diffDays } from './lib/saleTime.js';
import { todayISO } from './lib/dateUtils.js';
import { CATALOG_TYPES } from './lib/catalogMeta.js';
import { isChatOrder } from './lib/saleFields.js';
import { normalizeProvince } from './lib/provinces.js';
import { makeSkuResolver, loadResolverMaps } from './lib/designResolve.js';
import { CustomerDrawer, custFromOrders } from './customerDrawer.jsx';
import { supabase } from './lib/supabaseClient.js';
import { cachedFetchAll, cachedFetchRange, getDateBounds, clearSaleCache, ORDERS_SEL, SKUS_SEL, CUST_SEL, OVERRIDES_SEL, funnelTotal, funnelNewOld } from './lib/saleData.js';
// PART 97: ข้อมูลใหม่เข้ารายงานขาย — CRM (โทร/LINE + บันทึกประจำวัน + เป้า) + สถานะส่งยอด
import { fetchCrmTargets } from './lib/crmTargets.js';
import { mergeOrderOverrides, resolveSkuDesigns } from './lib/saleOverrides.js';
import { DIM_FIELDS, emptyF, activeFilterCount, loadF, saveF, baht } from './lib/saleDashboardHelpers.js';
import { useSaleLiveReload } from './lib/useSaleLive.js';
import { T } from './lib/tables.js';
// แถบควบคุม/หัวข้อ/skeleton + เนื้อแท็บ + แผงพื้นที่ + ลีดเดอร์บอร์ด + popup → แยกเป็นไฟล์ย่อย (โครง JSX เดิมทั้งดุ้น)
import { MultiSelect, DateRangePicker, SectionHead, DashboardSkeleton } from './saleDashboardChrome.jsx';
import { OverviewTab, OverviewChannels, VariantTab, CustomerTab, FunnelTab } from './saleDashboardTabs.jsx';
import { GeoPanel } from './saleDashboardGeo.jsx';
import { SalesLeaderboard } from './saleDashboardTeam.jsx';
import { DrillModal, DashDayDetail } from './saleDashboardModals.jsx';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';

// ตัวกรอง/ค่าเริ่มต้น/persist + format วันที่+เงิน + ค่าคงที่สี → ย้ายไป ./lib/saleDashboardHelpers.js

export function SaleDashboard() {
  useRenderCount('saleDashboard'); // Phase 0 baseline (dev-only)
  const [orders, setOrders] = useState(null);
  const [skus, setSkus] = useState([]);
  const [err, setErr] = useState('');
  const [, setLoadedAt] = useState('');
  const [f, setF] = useState(loadF);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [granSel, setGranSel] = useState('auto');
  const [compare] = useState(true); // เทียบช่วงก่อน (เดือนที่แล้ว) เปิดถาวร — ไม่มี toggle
  const [tab, setTab] = useState('overview');
  const [trendMetric, setTrendMetric] = useState('sales');
  const [trendSplit, setTrendSplit] = useState(false);
  const [drill, setDrill] = useState(null);
  const [custDetail, setCustDetail] = useState(null);
  const [dayPay, setDayPay] = useState(null); // วันที่ (ISO) — คลิกแถวตารางโอน/COD → popup ออเดอร์ทั้งวัน (PART 88)
  const [custTier, setCustTier] = useState('all');
  const [geoMetric, setGeoMetric] = useState('sales');
  const [geoRegion, setGeoRegion] = useState('all');
  const [importOpen, setImportOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [funnel, setFunnel] = useState([]);
  const [cust, setCust] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [orderOv, setOrderOv] = useState({});   // override ระดับออเดอร์ (แก้ในเว็บ: งาน/ลูกค้า/เซลล์/โน้ต) — ให้รายงานเห็นค่าที่แก้ด้วย
  const [resolverMaps, setResolverMaps] = useState(null);
  const [dbBounds, setDbBounds] = useState({ min: null, max: null });
  const [, setLoadingOrders] = useState(true);
  // PART 97: ข้อมูลใหม่เข้ารายงาน
  const [crmNotes, setCrmNotes] = useState([]);       // บันทึกประจำวัน CRM ในช่วง (data jsonb)
  const [crmTargets, setCrmTargets] = useState([]);   // เป้า CRM ของเดือน (เฉพาะช่วง=เดือนเดียว)

  // ตารางเล็ก + ขอบวันที่ (โหลดครั้งเดียวตอนเข้า / หลังนำเข้า) — ไม่หนัก
  useEffect(() => { let alive = true; (async () => {
    const [bnd, cu, fn, sa, ov] = await Promise.all([
      getDateBounds('tmk_mp_orders'),
      cachedFetchAll('tmk_mp_customers', CUST_SEL),
      cachedFetchAll('tmk_sales_funnel', '*'),
      cachedFetchAll('tmk_sales_aliases', 'handle,display_name'),
      cachedFetchAll('tmk_order_overrides', OVERRIDES_SEL),
    ]);
    if (!alive) return;
    setDbBounds(bnd || { min: null, max: null });
    setCust(cu.error ? [] : (cu.data || []));
    setFunnel(fn.error ? [] : (fn.data || []));
    setAliases(sa.error ? [] : (sa.data || []));
    const om = {}; if (!ov.error) (ov.data || []).forEach(x => { om[x.order_id] = x; });
    setOrderOv(om);
  })(); return () => { alive = false; }; }, [reloadKey]);
  // โหลด map สำหรับ live-resolve ชื่อลาย/รหัส (catalog/alias/override) — รีโหลดหลังนำเข้า/แก้ catalog
  useEffect(() => { let alive = true; (async () => {
    const m = await loadResolverMaps(supabase);
    if (alive) setResolverMaps(m);
  })(); return () => { alive = false; }; }, [reloadKey]);
  const resolver = useMemo(() => makeSkuResolver(resolverMaps || {}), [resolverMaps]);
  useEffect(() => { saveF(f); }, [f]);
  // realtime: ออเดอร์/ใบเสร็จ/คนทัก/แคตตาล็อก/override เปลี่ยนที่ไหน รายงานเด้งสด (ไม่ต้องรีเฟรช)
  // realtime: invalidate เฉพาะตาราง sale ที่ dashboard ใช้ (ไม่ clear ทั้ง Map — กันทิ้ง cache เดือน/หน้าอื่น + ลด egress)
  useSaleLiveReload([T.mpOrders, T.mpSkus, T.saleReceipts, T.salesFunnel, T.orderOverrides, T.mpCustomers], () => setReloadKey(k => k + 1), { invalidate: [T.mpOrders, T.mpSkus, T.mpCustomers, T.salesFunnel, T.orderOverrides] });

  const bounds = dbBounds;
  const range = { from: f.from || bounds.min, to: f.to || bounds.max };
  const eff = { ...f, from: range.from, to: range.to };
  // เทียบ: ถ้าช่วง = เดือนปฏิทินเต็ม → เทียบ "เดือนก่อนหน้า" (เต็มเดือน) ไม่งั้นเทียบช่วงยาวเท่ากัน
  const fullMonth = isFullCalendarMonth(range.from, range.to);
  const prevRange = (range.from && range.to) ? (fullMonth ? prevCalendarMonth(range.from, range.to) : prevPeriod(range.from, range.to)) : null;
  // key ตามค่าจริงของ filter/ช่วง (f/eff/prevRange เป็น object ใหม่ทุก render → ใช้ string เป็น dep แทน)
  const effKey = JSON.stringify(eff);
  const fKey = JSON.stringify(f);
  const prevRangeKey = JSON.stringify(prevRange);
  // ป้ายช่วงปัจจุบัน → ชื่อเดือนนี้ (ถ้าอยู่เดือนเดียว) ไม่งั้นเป็นช่วงวันที่
  const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const curLabel = (() => {
    if (!range.from || !range.to) return 'ช่วงนี้';
    const d1 = new Date(range.from), d2 = new Date(range.to);
    if (d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear()) return TH_MONTHS[d1.getMonth()];
    return `${d1.getDate()} ${TH_MONTHS[d1.getMonth()]}–${d2.getDate()} ${TH_MONTHS[d2.getMonth()]}`;
  })();
  // ป้ายช่วงก่อน → ชื่อเดือนที่แล้ว (ถ้าอยู่เดือนเดียว) ไม่งั้นเป็นช่วงวันที่
  const prevLabel = (() => {
    if (!prevRange) return 'ช่วงก่อน';
    const TH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const d1 = new Date(prevRange.from), d2 = new Date(prevRange.to);
    const yr = (d) => (d.getFullYear() !== new Date(range.from).getFullYear()) ? ` ${String(d.getFullYear()).slice(2)}` : '';
    if (d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear()) return TH[d1.getMonth()] + yr(d1);
    return `${d1.getDate()} ${TH[d1.getMonth()]}–${d2.getDate()} ${TH[d2.getMonth()]}`;
  })();
  const gran = granSel === 'auto' ? (range.from && range.to ? autoGran(range.from, range.to) : 'day') : granSel;

  // หน้าต่างเวลาที่ต้องโหลด = ครอบช่วงปัจจุบัน + ช่วงก่อน (ไว้เทียบ) → server-side filter
  const winFrom = (compare && prevRange?.from) ? prevRange.from : range.from;
  const winTo = range.to;
  // โหลด orders/skus เฉพาะหน้าต่างเวลา (เปลี่ยนช่วงแล้วโหลดใหม่ · แคชต่อช่วง)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดข้อมูล async (pattern ปกติ) · setLoadingOrders(true) = เปิดสถานะกำลังโหลดก่อนยิง query
  useEffect(() => { let alive = true; setLoadingOrders(true); (async () => {
    const [o, s] = await Promise.all([
      cachedFetchRange('tmk_mp_orders', ORDERS_SEL, winFrom, winTo),
      cachedFetchRange('tmk_mp_skus', SKUS_SEL, winFrom, winTo),
    ]);
    if (!alive) return;
    if (o.error) { setErr(o.error.message); setLoadingOrders(false); return; }
    setOrders(o.data || []); setSkus(s.error ? [] : (s.data || []));
    setLoadingOrders(false);
    setLoadedAt(new Date().toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
  })(); return () => { alive = false; }; }, [winFrom, winTo, reloadKey]);

  // PART 97: บันทึกประจำวัน CRM ในช่วง (data jsonb) — graceful ถ้าตาราง/คอลัมน์ยังไม่ migrate
  useEffect(() => { let alive = true; (async () => {
    if (!range.from || !range.to) { setCrmNotes([]); return; }
    let notes;
    try {
      let r = await supabase.from('tmk_crm_notes').select('salesperson,date,note,data').gte('date', range.from).lte('date', range.to);
      if (r.error && /column .*\bdata\b.* does not exist|schema cache/i.test(r.error.message || '')) r = await supabase.from('tmk_crm_notes').select('salesperson,date,note').gte('date', range.from).lte('date', range.to);
      notes = r.error ? [] : (r.data || []);
    } catch { notes = []; }
    if (alive) setCrmNotes(notes);
  })(); return () => { alive = false; }; }, [range.from, range.to, reloadKey]);
  // เป้า CRM — เฉพาะเมื่อช่วง = เดือนปฏิทินเดียว (เทียบเป้าได้)
  const crmMonth = fullMonth && range.from ? range.from.slice(0, 7) : null;
  useEffect(() => { let alive = true; (async () => {
    if (!crmMonth) { setCrmTargets([]); return; }
    const t = await fetchCrmTargets(crmMonth);
    if (alive) setCrmTargets(t);
  })(); return () => { alive = false; }; }, [crmMonth, reloadKey]);

  // ประมวลผล: apply override ที่แก้ในเว็บ (งาน/ลูกค้า/เซลล์/โน้ต — แพทเทิร์นเดียวกับหน้าออเดอร์)
  // + normalize จังหวัด + รวมชื่อเซลล์ (handle→ชื่อจริง) + รวมยอดเซลล์
  const procOrders = useMemo(() => {
    if (!orders) return null;
    const spMap = new Map((aliases || []).filter(a => a.display_name).map(a => [a.handle, a.display_name]));
    // merge override (helper กลาง — ตรงกับหน้าออเดอร์/ประสิทธิภาพเซลล์) → normalize จังหวัด + alias เซลล์
    return mergeOrderOverrides(orders, orderOv).map(o1 => {
      const th = o1.province ? normalizeProvince(o1.province) : null;
      const sp = spMap.get(o1.salesperson);
      return (th && th !== o1.province) || sp ? { ...o1, province: (th && th !== o1.province) ? th : o1.province, salesperson: sp || o1.salesperson } : o1;
    });
  }, [orders, aliases, orderOv]);
  // remap SKU ของ Shopee (order_no = marketplace_id) → เลขออเดอร์จริง แล้ว resolve ชื่อลายสด (helper กลาง)
  const procSkus = useMemo(() => {
    if (!orders) return [];
    const ordNos = new Set(orders.map(x => x.order_no));
    const mid2ono = new Map(orders.filter(x => x.marketplace_id && x.marketplace_id !== '-').map(x => [x.marketplace_id, x.order_no]));
    const remapped = (skus || []).map(s => (!ordNos.has(s.order_no) && mid2ono.has(s.order_no)) ? { ...s, order_no: mid2ono.get(s.order_no) } : s);
    return resolveSkuDesigns(remapped, resolver);
  }, [orders, skus, resolver]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- memo ตาม effKey (ค่าจริงของ eff) ไม่ใช่ object ที่สร้างใหม่ทุก render
  const A = useMemo(() => procOrders ? compute(procOrders, procSkus, eff) : null, [procOrders, procSkus, effKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- memo ตาม fKey/prevRangeKey (ค่าจริง) ไม่ใช่ object ที่สร้างใหม่ทุก render
  const prevA = useMemo(() => (procOrders && compare && prevRange) ? compute(procOrders, procSkus, { ...f, ...prevRange }) : null, [procOrders, procSkus, fKey, prevRangeKey, compare]);
  const dk = useMemo(() => A ? deltaKpi(A.kpi, prevA?.kpi) : null, [A, prevA]);
  const cmp = compare && prevA && prevA.kpi.orders > 0; // โชว์ %Δ เฉพาะเมื่อช่วงก่อนมีข้อมูลจริง

  // options สำหรับ filter dropdown (จากข้อมูลทั้งหมด)
  const opts = useMemo(() => {
    const po = procOrders || [], ps = procSkus || [];
    const u = (arr, k) => [...new Set(arr.map(r => r[k]).filter(Boolean))];
    return {
      channel: u(po, 'channel'), payment_type: u(po, 'payment_type'), customer_type: u(po, 'customer_type'),
      qty_band: u(po, 'qty_band'), salesperson: u(po, 'salesperson'), province: u(po, 'province').sort(),
      source: u(po, 'source'), job_type: u(po, 'job_type'),
      design: u(ps, 'design').sort(), size: [...new Set(ps.map(s => s.size).filter(Boolean))].sort((a, b) => sizeRank(a) - sizeRank(b)),
      color: [...new Set(ps.map(s => normColor(s.color)).filter(Boolean))].sort(), type: CATALOG_TYPES,
    };
  }, [procOrders, procSkus]);

  // trend series (เติมช่องว่าง + เทียบช่วงก่อน)
  const trend = useMemo(() => {
    if (!procOrders || !range.from) return null;
    const cur = series(procOrders, eff, gran); const buckets = enumerateBuckets(range.from, range.to, gran);
    const labels = buckets.map(b => bucketLabel(b, gran));
    const pick = (m, _k) => buckets.map(b => { const g = m.get(b); return g ? g[trendMetric] : 0; });
    const bars = pick(cur);
    let cmpBars = null;
    if (compare && prevRange) {
      const pv = series(procOrders, { ...f, ...prevRange }, gran); const pb = enumerateBuckets(prevRange.from, prevRange.to, gran);
      cmpBars = pb.map(b => { const g = pv.get(b); return g ? g[trendMetric] : 0; });
      while (cmpBars.length < bars.length) cmpBars.push(null); cmpBars = cmpBars.slice(0, bars.length);
    }
    const line = buckets.map(b => { const g = cur.get(b); return g ? g.orders : 0; });
    return { labels, bars, line, cmpBars };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- memo ตาม effKey/prevRangeKey (ค่าจริง) ไม่ใช่ object ที่สร้างใหม่ทุก render
  }, [procOrders, effKey, gran, trendMetric, compare, prevRangeKey]);

  // ย่อยรายวัน × ช่องทาง (stacked) — แต่ละแท่งแบ่งสีตามช่องทาง
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- คง useMemo ไว้ (วนออเดอร์ทั้งช่วง ×ช่องทาง = คำนวณหนัก) แม้ compiler จะ bail เพราะมองว่า gran/range อาจถูกแก้ทีหลัง
  const trendByChannel = useMemo(() => {
    if (!A || !range.from) return { labels: [], datasets: [] };
    const bks = enumerateBuckets(range.from, range.to, gran);
    const channels = A.byChannel.map(c => c.key); // เรียงตามยอดมาก→น้อย
    const acc = {}; channels.forEach(ch => acc[ch] = {});
    const valOf = (o) => trendMetric === 'orders' ? 1 : trendMetric === 'qty' ? (Number(o.qty) || 0) : (Number(o.sales) || 0);
    (A._ords || []).forEach(o => { if (!(o.channel in acc)) return; const b = bucketKey(o.order_date, gran); acc[o.channel][b] = (acc[o.channel][b] || 0) + valOf(o); });
    return {
      labels: bks.map(b => bucketLabel(b, gran).replace(/ \(.*/, '')),
      datasets: channels.map(ch => ({ label: ch, data: bks.map(b => acc[ch][b] || 0), color: channelColor(ch) })),
    };
    // eslint-disable-next-line react-hooks/preserve-manual-memoization -- deps ครบตามที่ใช้จริง (compiler เตือนว่า gran/range อาจถูกแก้ทีหลัง ซึ่งไม่เกิดขึ้นจริง — ทั้งคู่เป็น const ต่อ render)
  }, [A, gran, trendMetric, range.from, range.to]);

  const showSkel = useDelayedFlag(!A, 120); // โผล่หลัง 120ms · อยู่อย่างน้อย 300ms · cache ไว → เด้งทันที
  if (err) return <div className="content-inner"><Card className="p-6" style={{ color: 'var(--bad)' }}>โหลดข้อมูลไม่ได้: {err}</Card></div>;
  if (showSkel) return <DashboardSkeleton />;
  if (!A) return null;
  if (orders && orders.length === 0 && !dbBounds.max) return <div className="content-inner"><Card className="p-10 text-center">
    <div style={{ color: 'var(--ink-4)', marginBottom: 16 }}>ยังไม่มีข้อมูลขาย — นำเข้าไฟล์ Shipnity / Shopee / TikTok + catalog เพื่อเริ่มใช้งาน</div>
    <Button onClick={() => setImportOpen(true)}><Icon name="external" /> นำเข้าไฟล์ขาย</Button>
    {importOpen && <MpImportModal onClose={() => setImportOpen(false)} onDone={() => { clearSaleCache(); setReloadKey(k => k + 1); }} />}
  </Card></div>;

  const k = A.kpi;
  // KPI เสริมจากข้อมูลที่มี: ซื้อซ้ำ% (ลูกค้าที่ซื้อ >1 ครั้ง) + ยอด/วัน เฉลี่ย
  const heroStats = (() => {
    const cc = {}; A._ords.forEach(o => { if (o.customer_code) cc[o.customer_code] = (cc[o.customer_code] || 0) + 1; });
    const vals = Object.values(cc); const repeatC = vals.filter(n => n > 1).length;
    const repeatRate = vals.length ? repeatC / vals.length : 0;
    const days = Math.max(1, (range.from && range.to ? diffDays(range.from, range.to) + 1 : 1));
    const activeDays = new Set(A._ords.map(o => o.order_date).filter(Boolean)).size || 1;
    // sparkline ต่อ metric (ราย bucket ตามมุมมองเวลา)
    const sg = series(A._ords, eff, gran); const bks = enumerateBuckets(range.from, range.to, gran);
    const sparkOf = (m) => bks.map(b => { const g = sg.get(b); return g ? g[m] : 0; });
    // โปรไฟล์ลูกค้า (Shipnity): ซื้อซ้ำ lifetime + ตามต่อได้ (มีเบอร์)
    const ltRepeat = cust.filter(c => (Number(c.lifetime_orders) || 0) >= 2).length;
    const ltRepeatRate = cust.length ? ltRepeat / cust.length : 0;
    const withPhone = cust.filter(c => c.phone && String(c.phone).length >= 9).length;
    // เดือนขายดีสุด (วิว "ทั้งหมด") — สรุปยอดรายเดือนแล้วหายอดสูงสุด
    const mg = series(A._ords, eff, 'month');
    let bestMonth = null;
    for (const g of mg.values()) { if (!bestMonth || g.sales > bestMonth.sales) bestMonth = g; }
    const bestMonthLabel = bestMonth ? bucketLabel(bestMonth.key, 'month') : '';
    return { repeatC, repeatRate, perDay: k.sales / days, perActiveDay: k.sales / activeDays, days, activeDays, sparkSales: sparkOf('sales'), sparkOrders: sparkOf('orders'), sparkQty: sparkOf('qty'), ltRepeatRate, withPhone, custN: cust.length, bestMonth, bestMonthLabel };
  })();
  const metricFmt = trendMetric === 'sales' ? baht : N;
  const setRange = (from, to) => setF(p => ({ ...p, from, to }));
  // preset ที่ active อยู่ (ตรงกับช่วงปัจจุบัน) — ให้ ToggleGroup รู้ค่าที่เลือก
  const activePreset = (() => { for (const [id] of PRESETS) { const r = presetRange(id, todayISO(), bounds.min, bounds.max); if (id === 'all' ? (!f.from && !f.to) : (f.from === r.from && f.to === r.to)) return id; } return ''; })();
  const nFilters = activeFilterCount(f);
  // cross-filter: คลิกกราฟ → สลับค่าในตัวกรองสากล (กรองทั้งหน้า)
  const toggleFilter = (dim, value) => setF(p => { const cur = p[dim] || []; return { ...p, [dim]: cur.includes(value) ? cur.filter(x => x !== value) : [...cur, value] }; });
  const DIM_LABEL = { channel: 'ช่องทาง', design: 'ลาย', type: 'หมวด', size: 'ไซซ์', color: 'สี', province: 'จังหวัด', salesperson: 'เซลล์', job_type: 'งาน', payment_type: 'ชำระ', customer_type: 'ลูกค้า', qty_band: 'ขนาด', product_code: 'รหัส', source: 'ที่มา' };
  const activeChips = DIM_FIELDS.flatMap(dim => (f[dim] || []).map(v => ({ dim, v })));
  // %ปิดการขาย (จากข้อมูล funnel คนทัก) — null ถ้ายังไม่มีข้อมูล/ยังไม่ migration
  const funnelClose = (() => {
    const inR = (d) => (!range.from || d >= range.from) && (!range.to || d <= range.to);
    const fr = (funnel || []).filter(r => inR(r.date) && (!f.salesperson.length || f.salesperson.includes(r.salesperson)));
    if (!fr.length) return null;
    // นับคนทักรวมผ่าน funnelTotal → รองรับทั้ง 3 ฟอร์แมต (jsonb ใหม่/เก่า + legacy 4 คอลัมน์)
    // เดิมบวกเฉพาะ leads_fb_*/leads_line_* (legacy) → พลาดข้อมูลที่เก็บเป็น jsonb (ฟอร์แมตปัจจุบัน) = โชว์ 0%
    const totalLeads = fr.reduce((a, r) => a + funnelTotal(r), 0);
    const funnelSps = new Set(fr.map(r => r.salesperson));
    // %ปิด = ออเดอร์ช่องแชท (ตัดมาร์เก็ตเพลสที่ไม่มีการทัก) ÷ คนทัก → ไม่เกิน 100% ทั้งที่ขายมาร์เก็ตเพลสเยอะ
    const orders = (A._ords || []).filter(o => funnelSps.has(o.salesperson) && isChatOrder(o)).length;
    return { totalLeads, orders, pct: totalLeads ? Math.round(orders / totalLeads * 100) : 0 };
  })();
  const basketQty = k.orders ? k.qty / k.orders : 0;
  // PART 98.1: คนทักใหม่/เก่า ในช่วง (สำหรับการ์ด "คนทักรวม" — โชว์แถบย่อ ใหม่/เก่า/ไม่ระบุ)
  // นับ unknown ด้วย → n+o+u ตรงกับ funnelClose.totalLeads (funnelTotal) เสมอ ตัวเลข "เล่าเรื่องเดียวกัน"
  const funnelNO = (() => {
    const inR = (d) => (!range.from || d >= range.from) && (!range.to || d <= range.to);
    const fr = (funnel || []).filter(r => inR(r.date) && (!f.salesperson.length || f.salesperson.includes(r.salesperson)));
    return fr.reduce((a, r) => { const x = funnelNewOld(r); a.n += x.new; a.o += x.old; a.u += x.unknown; return a; }, { n: 0, o: 0, u: 0 });
  })();

  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>

      {/* ===== แผงควบคุมรวม: แถวเดียว — ช่วงเวลา + ตัวกรอง (ยุบได้) ===== */}
      <Card className="overflow-visible" style={{ padding: 0 }}>
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <div className="filter-compact row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '11px 14px' }}>
            <DateRangePicker from={range.from} to={range.to} min={bounds.min} max={(bounds.max && bounds.max > todayISO()) ? bounds.max : todayISO()} onChange={(a, b) => setRange(a, b)}
              presets={PRESETS} activePreset={activePreset}
              onPickPreset={(id) => { const r = presetRange(id, todayISO(), bounds.min, bounds.max); setRange(id === 'all' ? null : r.from, id === 'all' ? null : r.to); }} />
            <span className="h-5 w-px bg-[var(--line)]" />
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Icon name="filter" /> ตัวกรอง{nFilters > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{nFilters}</Badge>}
                <Icon name={filtersOpen ? 'up' : 'down'} />
              </Button>
            </CollapsibleTrigger>
            {activeChips.length > 0
              ? activeChips.map(({ dim, v }) => <Badge key={dim + v} variant="outline" onClick={() => toggleFilter(dim, v)} title="คลิกเพื่อเอาออก" style={{ cursor: 'pointer', padding: '2px 8px' }}><span style={{ color: 'var(--ink-4)' }}>{DIM_LABEL[dim]}:</span> {v} <Icon name="x" /></Badge>)
              : <span className="cap" style={{ color: 'var(--ink-4)' }}>ยังไม่ได้กรอง — แสดงทุกออเดอร์</span>}
            {nFilters > 0 && <Button variant="ghost" size="sm" className="text-[var(--bad)] ml-auto" onClick={() => setF(p => ({ ...emptyF(), from: p.from, to: p.to }))}><Icon name="x" /> ล้าง</Button>}
          </div>
          <CollapsibleContent>
            <div style={{ display: 'grid', gap: 10, padding: '0 14px 12px' }}>
              <div style={{ display: 'grid', gap: 10, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                {[
                  ['ออเดอร์', [['ช่องทาง', 'channel'], ['ประเภทงาน', 'job_type'], ['การชำระ', 'payment_type'], ['ขนาดออเดอร์', 'qty_band']]],
                  ['สินค้า', [['ลาย', 'design'], ['หมวด', 'type'], ['ไซซ์', 'size'], ['สี', 'color']]],
                  ['ลูกค้า & พื้นที่', [['ลูกค้า', 'customer_type'], ['จังหวัด', 'province'], ['เซลล์', 'salesperson']]],
                ].map(([grp, dims]) => (
                  <div key={grp} className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className="cap" style={{ color: 'var(--ink-4)', fontWeight: 600, width: 96, flexShrink: 0 }}>{grp}</span>
                    {dims.map(([label, dim]) => <MultiSelect key={dim} label={label} options={opts[dim]} value={f[dim]} onChange={v => setF(p => ({ ...p, [dim]: v }))} />)}
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* ===== Hero (executive) ===== */}
      {(() => {
        const unknownC = Math.max(0, k.orders - k.newC - k.oldC);
        const seg = (n) => k.orders ? (n / k.orders * 100) : 0;
        return <>
          {(() => {
            const up = cmp && dk.sales.d >= 0;
            const chans = (A.byChannel || []).filter(c => c.sales > 0); // ครบทุกช่อง เรียงตามยอดแล้ว
            return (
              <Card className="p-[22px]">
                <div className="hero-bento">
                  {/* ซ้าย — ยอดขายรวม (ละเอียด) */}
                  <div className="hero-total">
                    <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, letterSpacing: '-.2px', color: 'var(--ink)' }}>ยอดขายรวม</h3>
                      {cmp
                        ? <Badge variant="outline" className="gap-1 rounded-full font-semibold" style={{ background: up ? 'var(--good-soft)' : 'var(--bad-soft)', color: up ? 'var(--good)' : 'var(--bad)', borderColor: 'transparent' }}><Icon name={up ? 'up' : 'down'} size={12} />{up ? '+' : '−'}{Math.abs(Math.round(dk.sales.d * 100))}%</Badge>
                        : <Badge variant="secondary" className="rounded-full" style={{ color: 'var(--ink-4)' }}>ทั้งช่วงข้อมูล</Badge>}
                      {k.skuFilterActive && <Badge variant="outline" className="rounded-full font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'transparent' }}>ทั้งออเดอร์ที่มีลายนี้</Badge>}
                    </div>
                    <div className="num" style={{ fontSize: 'clamp(32px,3.8vw,50px)', fontWeight: 700, letterSpacing: '-1.6px', lineHeight: 1 }}><CountUp value={k.sales} fmt={baht} duration={1100} /></div>
                    {k.skuFilterActive && <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 6 }}>เฉพาะลายที่เลือก ≈ <b style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{baht(k.attrSales)}</b> · {N(k.attrQty)} ตัว</div>}
                    <div className="hero-chartwrap"><AreaTrend compact values={heroStats.sparkSales} height="100%" color="var(--accent)" valFmt={baht} ariaLabel="แนวโน้มยอดขายรายวัน" /></div>
                    {/* แถบบริบทล่าง — โครงเดียวกันทั้ง 2 มุมมอง (cmp = เทียบ 2 แถบ · ทั้งช่วง = เดือนขายดีสุด) */}
                    {cmp
                      ? (() => { const cmax = Math.max(k.sales, dk.sales.prev, 1); return (
                          <div style={{ marginTop: 12, display: 'grid', gap: 11 }}>
                            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                              <span className="cap" style={{ flex: '0 0 92px', color: 'var(--ink-3)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{curLabel}</span>
                              <Progress value={k.sales / cmax * 100} indicatorColor="var(--accent)" className="h-2.5 flex-1" />
                              <span className="num cap" style={{ flex: '0 0 auto', minWidth: 80, textAlign: 'right', fontWeight: 700 }}>{baht(k.sales)}</span>
                            </div>
                            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                              <span className="cap" style={{ flex: '0 0 92px', color: 'var(--ink-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prevLabel}</span>
                              <Progress value={dk.sales.prev / cmax * 100} indicatorColor="var(--ink-4)" className="h-2.5 flex-1" />
                              <span className="num cap" style={{ flex: '0 0 auto', minWidth: 80, textAlign: 'right', color: 'var(--ink-4)' }}>{baht(dk.sales.prev)}</span>
                            </div>
                          </div>
                        ); })()
                      : heroStats.bestMonth && (
                          <div className="row" style={{ marginTop: 12, gap: 8, alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: 'var(--accent-soft)' }}>
                            <Icon name="star" size={15} style={{ color: 'var(--accent)' }} />
                            <span className="cap" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>เดือนขายดีสุด</span>
                            <span className="cap" style={{ color: 'var(--ink)', fontWeight: 700 }}>{heroStats.bestMonthLabel}</span>
                            <span className="num cap" style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--accent)' }}>{baht(heroStats.bestMonth.sales)}</span>
                          </div>
                        )}
                    {/* footer — เหมือนกันทั้ง 2 มุมมอง (โต/ลด เฉพาะตอนเทียบ) */}
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                      {cmp && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13.5, color: 'var(--ink)' }}>{up ? 'โตขึ้นจากช่วงก่อน' : 'ลดลงจากช่วงก่อน'}<Icon name={up ? 'up' : 'down'} size={15} /></div>}
                      <div className="cap" style={{ color: 'var(--ink-4)', marginTop: cmp ? 3 : 0 }}>เฉลี่ย <b style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{baht(heroStats.perDay)}/วัน</b> · {N(heroStats.days)} วัน</div>
                    </div>
                  </div>
                  {/* ขวา — ช่องทางครบทุกช่อง (bento เล็กใหญ่ตามยอด) */}
                  <div className="hero-chgrid">
                    {chans.map((c, i) => {
                      const tint = channelTint(c.key);
                      const lead = i === 0, small = c.share < 0.08;
                      return (
                        <div key={c.key} className={'ch-card' + (lead ? ' lead' : '') + (small ? ' sm' : '')} onClick={() => toggleFilter('channel', c.key)} title={`กรองช่องทาง ${c.key}`}>
                          <span className="ch-logo" style={{ color: tint, background: `color-mix(in srgb, ${tint} 14%, var(--surface))` }}><ChannelLogo name={c.key} size={lead ? 22 : 18} /></span>
                          <div className="ch-meta">
                            <div className="ch-name">{c.key}</div>
                            <div className="num ch-val">{baht(c.sales)}</div>
                            <div className="ch-sub">{Math.round(c.share * 100)}% · {N(c.orders)} ออเดอร์</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            );
          })()}

          {/* ===== ตัวชี้วัดหลัก (พระเอก) — ยอดขาย=hero ด้านบน · แถวนี้ 4 การ์ดใหญ่: ออเดอร์ · ลูกค้าใหม่ · คนทัก · %ปิด (PART 98) ===== */}
          <SectionHead title="ตัวชี้วัดหลัก" sub={`ช่วงที่เลือก · ${N(heroStats.days)} วัน`} right={<SourceBadge kind="analytics" align="right" />} />
          <div className="kpi4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            <div className="metric-card kpi-card-primary">
              <div className="eyebrow">ออเดอร์ <InfoTip text="จำนวนออเดอร์ในช่วงที่เลือก (ตัดที่ยกเลิกออกแล้ว) · นับตามวันที่ออเดอร์" /></div>
              <div className="num" style={{ fontSize: 26, fontWeight: 700, margin: '4px 0 2px' }}><CountUp value={k.orders} fmt={N} /></div>
              <GradientSparkline data={heroStats.sparkOrders} height={26} color="var(--accent)" />
              <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 4 }}>เฉลี่ย {baht(k.aov)}/ออเดอร์{k.cancelled ? ` · ยกเลิก ${N(k.cancelled)}` : ''}</div>
            </div>
            <div className="metric-card kpi-card-warn">
              <div className="eyebrow">ลูกค้าใหม่ <InfoTip text="% ออเดอร์จากลูกค้าที่ซื้อครั้งแรก (ในช่วงที่เลือก) · แถบสี = ใหม่ / เก่า / ไม่ทราบ" /></div>
              <div className="num" style={{ fontSize: 26, fontWeight: 700, margin: '4px 0 6px' }}><CountUp value={Math.round(k.newPct * 100)} fmt={(v) => `${Math.round(v)}%`} /></div>
              <div style={{ display: 'flex', height: 7, borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
                <span style={{ width: seg(k.newC) + '%', background: 'var(--accent)' }} />
                <span style={{ width: seg(k.oldC) + '%', background: 'var(--accent-soft)' }} />
                <span style={{ width: seg(unknownC) + '%', background: 'var(--surface-3)' }} />
              </div>
              <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 5 }}>ใหม่ {N(k.newC)} · เก่า {N(k.oldC)}{unknownC ? ` · ไม่ทราบ ${N(unknownC)}` : ''}</div>
            </div>
            <div className="metric-card kpi-card-info">
              <div className="eyebrow">คนทักรวม <InfoTip text="จำนวนคนที่ทักเข้ามาในช่วง (จากที่เซลล์กรอกหน้าคนทัก) · แยกใหม่/เก่าได้ในแท็บ คนทัก & ปิดการขาย" /></div>
              <div className="num" style={{ fontSize: 26, fontWeight: 700, margin: '4px 0 6px' }}>{funnelClose ? <CountUp value={funnelClose.totalLeads} fmt={N} /> : '—'}</div>
              {(funnelNO.n || funnelNO.o || funnelNO.u) ? (() => { const t = funnelNO.n + funnelNO.o + funnelNO.u; const sg = (v) => t ? (v / t * 100) : 0; return (<>
                <div style={{ display: 'flex', height: 7, borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
                  <span style={{ width: sg(funnelNO.n) + '%', background: 'var(--info)' }} />
                  <span style={{ width: sg(funnelNO.o) + '%', background: 'var(--accent-soft)' }} />
                  {funnelNO.u ? <span style={{ width: sg(funnelNO.u) + '%', background: 'var(--ink-4)' }} /> : null}
                </div>
                <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 5 }}>ทักใหม่ {N(funnelNO.n)} · เก่า {N(funnelNO.o)}{funnelNO.u ? ` · ไม่ระบุ ${N(funnelNO.u)}` : ''}</div>
              </>); })() : <div className="cap row" style={{ gap: 5, color: 'var(--ink-4)' }}><Icon name="chat" size={13} />{funnelClose ? 'จากข้อมูลคนทักในช่วง' : 'ยังไม่มีข้อมูลคนทัก'}</div>}
            </div>
            <div className="metric-card kpi-card-good">
              <div className="eyebrow">%ปิดการขาย <InfoTip text="ออเดอร์ช่องแชท (FB/LINE/IG/TikTok/โทร) ÷ คนทัก · ตัดออเดอร์มาร์เก็ตเพลสที่ไม่มีการทัก" /></div>
              <div className="num" style={{ fontSize: 26, fontWeight: 700, margin: '4px 0 6px', color: funnelClose ? (funnelClose.pct >= 15 ? 'var(--good)' : funnelClose.pct >= 8 ? 'var(--warn)' : 'var(--bad)') : undefined }}>{funnelClose ? `${funnelClose.pct}%` : '—'}</div>
              {funnelClose
                ? <Progress value={Math.min(100, funnelClose.pct)} indicatorColor={funnelClose.pct >= 15 ? 'var(--good)' : funnelClose.pct >= 8 ? 'var(--warn)' : 'var(--bad)'} />
                : <div style={{ height: 7 }} />}
              <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 5 }}>{funnelClose ? `ปิด ${N(funnelClose.orders)}/${N(funnelClose.totalLeads)} คนทัก` : 'ยังไม่มีข้อมูลคนทัก'}</div>
            </div>
          </div>

          {/* ===== ตัวชี้วัดรอง — AOV · ตัวที่ขาย · ลูกค้า (PART 98.1: เอา CRM ออก · AOV แทน · ยอด CRM ดูในแท็บ ลูกค้า & CRM) ===== */}
          <div className="metric-grid" style={{ marginTop: 12 }}>
            <MetricCard index={0} label="ยอดเฉลี่ย/ออเดอร์ (AOV)" value={baht(k.aov)} icon="wallet" tone="var(--accent)" sub={`${basketQty.toFixed(2)} ตัว/ออเดอร์ · ${baht(k.ppu)}/ตัว`} />
            <MetricCard index={1} label={'ตัวที่ขาย' + (k.skuFilterActive ? ' (เฉพาะลาย)' : '')} value={N(k.skuFilterActive ? k.attrQty : k.qty)} icon="box" tone="var(--good)" sub={k.skuFilterActive ? `${N(k.qty)} ตัวรวมทั้งออเดอร์` : `${baht(k.ppu)}/ตัว`} />
            <MetricCard index={2} label="ลูกค้า" value={N(k.nCustomers)} icon="users" sub={heroStats.custN > 0 ? `ซื้อซ้ำ ${Math.round(heroStats.ltRepeatRate * 100)}% สะสม` : `ซื้อซ้ำ ${Math.round(heroStats.repeatRate * 100)}% ในช่วง`} />
          </div>

          {/* ===== ชิปย่อ — ตัวเลขเสริม (ซ่อนตัวที่ = 0/ไร้ค่า เช่น ค่าธรรมเนียม ฿0, Marketplace 0%) ===== */}
          <div className="insight-strip" style={{ marginTop: 12 }}>
            <div className="insight-pill"><Icon name="wallet" /><span><b>{Math.round(k.codPct * 100)}% COD</b><span className="cap" style={{ color: 'var(--ink-4)' }}>{N(k.codO)} ออเดอร์</span></span></div>
            {heroStats.withPhone > 0 && <div className="insight-pill"><Icon name="target" /><span><b>{N(heroStats.withPhone)} ลูกค้าตามต่อได้</b><span className="cap" style={{ color: 'var(--ink-4)' }}>CRM follow-up (มีเบอร์)</span></span></div>}
            {k.big > 0 && <div className="insight-pill"><Icon name="box" /><span><b>{N(k.big)} ออเดอร์ก้อนใหญ่</b><span className="cap" style={{ color: 'var(--ink-4)' }}>{Math.round(k.bigPct * 100)}% (≥11 ตัว)</span></span></div>}
          </div>
        </>;
      })()}

      {/* ===== แท็บ ===== */}
      <div className="dashboard-spacer" />
      <Tabs value={tab} onValueChange={setTab}>
        {/* PART 98: ยุบ 7→4 แท็บ · ช่องทาง→ภาพรวม · พื้นที่→สินค้า · อันดับเซลล์เอาออก (มีในหน้าประสิทธิภาพเซล) */}
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
          <TabsTrigger value="funnel">คนทัก & ปิดการขาย</TabsTrigger>
          <TabsTrigger value="customer">ลูกค้า & CRM</TabsTrigger>
          <TabsTrigger value="variant">สินค้า & พื้นที่</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ===== S1 เทรนด์ ===== */}
      {tab === 'overview' && trend && <OverviewTab ctx={{ A, prevA, cmp, trend, trendByChannel, trendMetric, setTrendMetric, granSel, setGranSel, trendSplit, setTrendSplit, metricFmt, prevLabel, toggleFilter, setDayPay }} />}

      {/* ===== ช่องทาง — ย้ายเข้า "ภาพรวม" (PART 98) ===== */}
      {tab === 'overview' && A && <OverviewChannels ctx={{ A, prevA, orders, eff, gran, range, toggleFilter }} />}

      {/* ===== S4 สินค้า (สี & ไซซ์) + พื้นที่ — PART 98 ===== */}
      {tab === 'variant' && <VariantTab ctx={{ A, f }} />}

      {/* ===== S6 ลูกค้า ===== */}
      {tab === 'customer' && <CustomerTab ctx={{ A, f, k, range, gran, curLabel, crmNotes, crmMonth, crmTargets, custTier, setCustTier, setCustDetail }} />}

      {/* ===== S7 พื้นที่ — ย้ายเข้า "สินค้า & พื้นที่" (PART 98) · drill จังหวัด→ลาย→สี + pivot + มุมมองประเทศ ===== */}
      {tab === 'variant' && A && (<>
        <SectionHead title="พื้นที่การขาย" sub="จังหวัด → ลาย → สี · แผนที่ + ตาราง" />
        <GeoPanel ords={A._ords} skus={A._skus} metric={geoMetric} setMetric={setGeoMetric} region={geoRegion} setRegion={setGeoRegion} selected={f.province} onFilter={toggleFilter} A={A} prevA={prevA} cmp={cmp} prevLabel={prevLabel} designSel={f.design} />
      </>)}

      {/* ===== D2 อันดับเซลล์ (ลีดเดอร์บอร์ด) ===== */}
      {tab === 'team' && (
        <SalesLeaderboard ords={A._ords} items={A.bySalesperson} prevItems={prevA?.bySalesperson} cmp={cmp} onFilter={toggleFilter} range={range} prevLabel={prevLabel} />
      )}

      {/* ===== S?: คนทัก & ปิดการขาย (funnel) ===== */}
      {tab === 'funnel' && <FunnelTab ctx={{ A, f, funnel, range, gran }} />}

      {drill && <DrillModal drill={drill} orders={orders} skus={skus} eff={eff} onClose={() => setDrill(null)} />}
      {custDetail && A && <CustomerDrawer cust={custDetail} ords={A._ords} skus={A._skus} onClose={() => setCustDetail(null)} />}
      {dayPay && A && <SideSheet size="lg" icon="calendarDays" title={bucketLabel(dayPay, 'day')} sub="ออเดอร์ทั้งวัน · คลิกจากตารางโอน/COD" onClose={() => setDayPay(null)}>
        <DashDayDetail dateISO={dayPay} ords={A._ords} skus={A._skus}
          funnelRows={(funnel || []).filter(r => r.date === dayPay && (!f.salesperson.length || f.salesperson.includes(r.salesperson)))}
          onPickCustomer={(o) => setCustDetail(custFromOrders(o, A._ords))} />
      </SideSheet>}
      {importOpen && <MpImportModal onClose={() => setImportOpen(false)} onDone={() => { clearSaleCache(); setReloadKey(k => k + 1); }} />}
    </div>
  );
}
