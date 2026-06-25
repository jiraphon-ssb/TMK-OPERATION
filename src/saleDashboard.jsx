/* ============================================================
   saleDashboard.jsx — แดชบอร์ดยอดขายเต็มระบบ (หน้า Sale)
   P1: time picker + global filter + 12 KPI + เทรนด์(S1) + ลาย(S3) + drill
   ข้อมูล: fetch ครั้งเดียว → aggregate ฝั่ง client (saleAgg/saleTime)
   ============================================================ */
import { useState, useEffect, useMemo, useRef } from 'react';
import { N, Icon, Skel, useDelayedFlag } from './components.jsx';
import { MpImportModal, SideSheet } from './modals.jsx';
import { MetricCard, ComboChart, StackedBars, HBars, DonutChart, Heatmap, ParetoChart, channelColor, CAT_COLORS, Sparkline } from './charts.jsx';
import { compute, series, deltaKpi, movers, sizeRank, normColor, normSize, customerAgg, rfmTiers } from './lib/saleAgg.js';
import { bucketKey, bucketLabel, enumerateBuckets, autoGran, presetRange, PRESETS, prevPeriod } from './lib/saleTime.js';
import { CATALOG_TYPES } from './lib/catalogMeta.js';
import { PROVINCES, REGIONS, normalizeProvince, TH_BBOX } from './lib/provinces.js';
import { TH_PATHS } from './lib/thMapPaths.js';
import { entriesToOrders } from './lib/saleRecon.js';
import { cachedFetchAll, cachedFetchRange, getDateBounds, clearSaleCache, ORDERS_SEL, SKUS_SEL, CUST_SEL } from './lib/saleData.js';

const DIM_FIELDS = ['channel', 'payment_type', 'customer_type', 'qty_band', 'salesperson', 'province', 'source', 'job_type', 'design', 'product_code', 'size', 'color', 'type'];
// ค่าเริ่มต้น = เดือนนี้เสมอ (1 ของเดือน → วันนี้)
const thisMonthRange = () => { const d = new Date(); const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0'); return { from: `${y}-${m}-01`, to: `${y}-${m}-${day}` }; };
const emptyF = () => { const o = { ...thisMonthRange() }; DIM_FIELDS.forEach(k => o[k] = []); return o; };
const activeFilterCount = (f) => DIM_FIELDS.reduce((n, k) => n + (f[k]?.length || 0), 0);

// persist เฉพาะตัวกรอง (dims) — ช่วงเวลา default เป็น "เดือนนี้" เสมอตอนเข้า
const FKEY = 'tmk-sale-f';
function loadF() { try { const s = JSON.parse(localStorage.getItem(FKEY)); const dims = {}; if (s) DIM_FIELDS.forEach(k => { if (s[k]?.length) dims[k] = s[k]; }); return { ...emptyF(), ...dims }; } catch { return emptyF(); } }
function saveF(f) { try { const dims = {}; DIM_FIELDS.forEach(k => { if (f[k]?.length) dims[k] = f[k]; }); localStorage.setItem(FKEY, JSON.stringify(dims)); } catch { /* ignore */ } }

// ---------- multiselect dropdown ----------
function MultiSelect({ label, icon, options, value, onChange }) {
  const [open, setOpen] = useState(false); const ref = useRef(null);
  useEffect(() => { const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const toggle = (v) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  const n = value.length;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className={'pick' + (n ? ' active' : '')} onClick={() => setOpen(o => !o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {icon && <Icon name={icon} />}{label}{n > 0 && <span className="badge badge-default" style={{ padding: '0 6px', fontSize: 11 }}>{n}</span>}
        <Icon name="down" />
      </button>
      {open && (
        <div className="card" style={{ position: 'absolute', zIndex: 40, top: '108%', left: 0, minWidth: 190, maxHeight: 280, overflow: 'auto', padding: 6, boxShadow: 'var(--sh-md)' }}>
          {n > 0 && <button className="btn btn-sm" style={{ width: '100%', marginBottom: 4, color: 'var(--bad)' }} onClick={() => onChange([])}>ล้าง {label}</button>}
          {options.length === 0 && <div className="cap" style={{ padding: 8, color: 'var(--ink-4)' }}>ไม่มีข้อมูล</div>}
          {options.map(o => (
            <label key={o} className="row" style={{ gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={value.includes(o)} onChange={() => toggle(o)} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const baht = (n) => '฿' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tierTone = { 'เพชร': '#7c5cff', 'ทอง': '#e39b2e', 'เงิน': '#3aa0c9', 'ทองแดง': '#8a909c' };

/* Skeleton ตรง layout แดชบอร์ด: แถบควบคุม + hero ใหญ่ + เกจ + กราฟ + การ์ดเมตริก */
function DashboardSkeleton() {
  const bar = (i) => `${28 + ((i * 41) % 64)}%`;
  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      <div className="card" style={{ padding: '12px 14px' }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {Array.from({ length: 7 }).map((_, i) => <Skel key={i} w={58} h={28} r={8} />)}
          <Skel w={130} h={28} r={8} style={{ marginLeft: 'auto' }} />
        </div>
      </div>
      <div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'stretch' }}>
        <div className="card" style={{ flex: '2 1 360px', minHeight: 196 }}>
          <Skel w={130} h={11} />
          <Skel w={240} h={38} r={10} style={{ margin: '14px 0 10px' }} />
          <Skel w="64%" h={9} style={{ marginBottom: 18 }} />
          <Skel w="100%" h={8} r={6} />
          <div className="row" style={{ gap: 18, marginTop: 20 }}>
            {Array.from({ length: 4 }).map((_, i) => <div key={i} style={{ flex: 1 }}><Skel w="58%" h={9} /><Skel w="82%" h={18} style={{ marginTop: 7 }} /></div>)}
          </div>
        </div>
        <div className="card" style={{ flex: '1 1 220px', minHeight: 196, display: 'flex', alignItems: 'center', gap: 16 }}>
          <Skel w={112} h={112} r="50%" />
          <div style={{ flex: 1 }}><Skel w="70%" h={11} /><Skel w="90%" h={22} style={{ marginTop: 9 }} /><Skel w="60%" h={11} style={{ marginTop: 13 }} /></div>
        </div>
      </div>
      <div className="card" style={{ minHeight: 270 }}>
        <Skel w={160} h={13} style={{ marginBottom: 20 }} />
        <div className="row" style={{ alignItems: 'flex-end', gap: 7, height: 200 }}>
          {Array.from({ length: 24 }).map((_, i) => <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'flex-end', height: '100%' }}><Skel w="100%" h={bar(i)} r={4} /></div>)}
        </div>
      </div>
      <div className="metric-grid">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="card"><Skel w="55%" h={10} /><Skel w="76%" h={22} style={{ marginTop: 11 }} /></div>)}
      </div>
    </div>
  );
}

export function SaleDashboard() {
  const [orders, setOrders] = useState(null);
  const [skus, setSkus] = useState([]);
  const [err, setErr] = useState('');
  const [, setLoadedAt] = useState('');
  const [f, setF] = useState(loadF);
  const [granSel, setGranSel] = useState('auto');
  const [compare] = useState(true); // เทียบช่วงก่อน (เดือนที่แล้ว) เปิดถาวร — ไม่มี toggle
  const [tab, setTab] = useState('overview');
  const [trendMetric, setTrendMetric] = useState('sales');
  const [designMetric, setDesignMetric] = useState('qty');
  const [topN, setTopN] = useState(12);
  const [drill, setDrill] = useState(null);
  const [custTier, setCustTier] = useState('all');
  const [geoMetric, setGeoMetric] = useState('sales');
  const [geoRegion, setGeoRegion] = useState('all');
  const [importOpen, setImportOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [funnel, setFunnel] = useState([]);
  const [cust, setCust] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [entries, setEntries] = useState([]);
  const [dbBounds, setDbBounds] = useState({ min: null, max: null });
  const [, setLoadingOrders] = useState(true);

  // ตารางเล็ก + ขอบวันที่ (โหลดครั้งเดียวตอนเข้า / หลังนำเข้า) — ไม่หนัก
  useEffect(() => { let alive = true; (async () => {
    const [bnd, cu, fn, sa, se] = await Promise.all([
      getDateBounds('tmk_mp_orders'),
      cachedFetchAll('tmk_mp_customers', CUST_SEL),
      cachedFetchAll('tmk_sales_funnel', '*'),
      cachedFetchAll('tmk_sales_aliases', 'handle,display_name'),
      cachedFetchAll('tmk_sale_entries', '*'),
    ]);
    if (!alive) return;
    setDbBounds(bnd || { min: null, max: null });
    setCust(cu.error ? [] : (cu.data || []));
    setFunnel(fn.error ? [] : (fn.data || []));
    setAliases(sa.error ? [] : (sa.data || []));
    setEntries(se.error ? [] : (se.data || []));
  })(); return () => { alive = false; }; }, [reloadKey]);
  useEffect(() => { saveF(f); }, [f]);

  const bounds = dbBounds;
  const range = { from: f.from || bounds.min, to: f.to || bounds.max };
  const eff = { ...f, from: range.from, to: range.to };
  const prevRange = (range.from && range.to) ? prevPeriod(range.from, range.to) : null;
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

  // ประมวลผล: normalize จังหวัด + รวมชื่อเซลล์ (handle→ชื่อจริง) + รวมยอดเซลล์
  const procOrders = useMemo(() => {
    if (!orders) return null;
    const spMap = new Map((aliases || []).filter(a => a.display_name).map(a => [a.handle, a.display_name]));
    const norm = orders.map(o => {
      const th = o.province ? normalizeProvince(o.province) : null;
      const sp = spMap.get(o.salesperson);
      return (th && th !== o.province) || sp ? { ...o, province: (th && th !== o.province) ? th : o.province, salesperson: sp || o.salesperson } : o;
    });
    return [...norm, ...entriesToOrders(entries || []).orders];
  }, [orders, aliases, entries]);
  // remap SKU ของ Shopee (order_no = marketplace_id) → เลขออเดอร์จริง + รวม SKU ยอดเซลล์
  const procSkus = useMemo(() => {
    if (!orders) return [];
    const ordNos = new Set(orders.map(x => x.order_no));
    const mid2ono = new Map(orders.filter(x => x.marketplace_id && x.marketplace_id !== '-').map(x => [x.marketplace_id, x.order_no]));
    const remap = (skus || []).map(s => (!ordNos.has(s.order_no) && mid2ono.has(s.order_no)) ? { ...s, order_no: mid2ono.get(s.order_no) } : s);
    return [...remap, ...entriesToOrders(entries || []).skus];
  }, [orders, skus, entries]);

  const A = useMemo(() => procOrders ? compute(procOrders, procSkus, eff) : null, [procOrders, procSkus, JSON.stringify(eff)]);
  const prevA = useMemo(() => (procOrders && compare && prevRange) ? compute(procOrders, procSkus, { ...f, ...prevRange }) : null, [procOrders, procSkus, JSON.stringify(f), JSON.stringify(prevRange), compare]);
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
      color: u(ps, 'color').sort(), type: CATALOG_TYPES,
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
  }, [procOrders, JSON.stringify(eff), gran, trendMetric, compare, JSON.stringify(prevRange)]);

  const showSkel = useDelayedFlag(!A, 120); // โผล่หลัง 120ms · อยู่อย่างน้อย 300ms · cache ไว → เด้งทันที
  if (err) return <div className="content-inner"><div className="card" style={{ padding: 24, color: 'var(--bad)' }}>โหลดข้อมูลไม่ได้: {err}</div></div>;
  if (showSkel) return <DashboardSkeleton />;
  if (!A) return null;
  if (orders && orders.length === 0 && !dbBounds.max) return <div className="content-inner"><div className="card" style={{ padding: 40, textAlign: 'center' }}>
    <div style={{ color: 'var(--ink-4)', marginBottom: 16 }}>ยังไม่มีข้อมูลขาย — นำเข้าไฟล์ Shipnity / Shopee / TikTok + catalog เพื่อเริ่มใช้งาน</div>
    <button className="btn btn-primary" onClick={() => setImportOpen(true)}><Icon name="external" /> นำเข้าไฟล์ขาย</button>
    {importOpen && <MpImportModal onClose={() => setImportOpen(false)} onDone={() => { clearSaleCache(); setReloadKey(k => k + 1); }} />}
  </div></div>;

  const k = A.kpi;
  // KPI เสริมจากข้อมูลที่มี: ซื้อซ้ำ% (ลูกค้าที่ซื้อ >1 ครั้ง) + ยอด/วัน เฉลี่ย
  const heroStats = (() => {
    const cc = {}; A._ords.forEach(o => { if (o.customer_code) cc[o.customer_code] = (cc[o.customer_code] || 0) + 1; });
    const vals = Object.values(cc); const repeatC = vals.filter(n => n > 1).length;
    const repeatRate = vals.length ? repeatC / vals.length : 0;
    const days = Math.max(1, Math.round((new Date(range.to) - new Date(range.from)) / 86400000) + 1);
    const activeDays = new Set(A._ords.map(o => o.order_date).filter(Boolean)).size || 1;
    // sparkline ต่อ metric (ราย bucket ตามมุมมองเวลา)
    const sg = series(A._ords, eff, gran); const bks = enumerateBuckets(range.from, range.to, gran);
    const sparkOf = (m) => bks.map(b => { const g = sg.get(b); return g ? g[m] : 0; });
    // โปรไฟล์ลูกค้า (Shipnity): ซื้อซ้ำ lifetime + ตามต่อได้ (มีเบอร์)
    const ltRepeat = cust.filter(c => (Number(c.lifetime_orders) || 0) >= 2).length;
    const ltRepeatRate = cust.length ? ltRepeat / cust.length : 0;
    const withPhone = cust.filter(c => c.phone && String(c.phone).length >= 9).length;
    return { repeatC, repeatRate, perDay: k.sales / days, perActiveDay: k.sales / activeDays, days, activeDays, sparkSales: sparkOf('sales'), sparkOrders: sparkOf('orders'), sparkQty: sparkOf('qty'), ltRepeatRate, withPhone, custN: cust.length };
  })();
  const metricFmt = trendMetric === 'sales' || trendMetric === 'profit' ? baht : N;
  const designItems = (designMetric === 'sales' ? [...A.byDesign].sort((a, b) => b.sales - a.sales) : A.byDesign).slice(0, topN);
  const setRange = (from, to) => setF(p => ({ ...p, from, to }));
  const nFilters = activeFilterCount(f);
  // cross-filter: คลิกกราฟ → สลับค่าในตัวกรองสากล (กรองทั้งหน้า)
  const toggleFilter = (dim, value) => setF(p => { const cur = p[dim] || []; return { ...p, [dim]: cur.includes(value) ? cur.filter(x => x !== value) : [...cur, value] }; });
  const DIM_LABEL = { channel: 'ช่องทาง', design: 'ลาย', type: 'หมวด', size: 'ไซซ์', color: 'สี', province: 'จังหวัด', salesperson: 'เซลล์', job_type: 'งาน', payment_type: 'ชำระ', customer_type: 'ลูกค้า', qty_band: 'ขนาด', product_code: 'รหัส', source: 'ที่มา' };
  const activeChips = DIM_FIELDS.flatMap(dim => (f[dim] || []).map(v => ({ dim, v })));

  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>

      {/* ===== แผงควบคุมรวม: เวลา + การกระทำ (บน) · ตัวกรอง (ล่าง) ===== */}
      <div className="card" style={{ padding: 0, overflow: 'visible' }}>
        {/* แถวบน: ช่วงเวลา + ปุ่มหลัก */}
        <div className="filter-compact row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '11px 14px' }}>
          <span className="row" style={{ gap: 6, color: 'var(--ink-3)', fontWeight: 600, fontSize: 13 }}><Icon name="calendarDays" /> ช่วงเวลา</span>
          <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
            {PRESETS.map(([id, lb]) => { const r = presetRange(id, bounds.max, bounds.min, bounds.max); const on = (id === 'all' && !f.from && !f.to) || (f.from === r.from && f.to === r.to && id !== 'all'); return <button key={id} className={'pick' + (on ? ' active' : '')} onClick={() => setRange(id === 'all' ? null : r.from, id === 'all' ? null : r.to)}>{lb}</button>; })}
          </div>
          <input type="date" className="input input-sm" style={{ width: 'auto' }} min={bounds.min} max={bounds.max} value={range.from || ''} onChange={e => setRange(e.target.value || bounds.min, range.to)} />
          <span className="cap" style={{ color: 'var(--ink-4)' }}>–</span>
          <input type="date" className="input input-sm" style={{ width: 'auto' }} min={bounds.min} max={bounds.max} value={range.to || ''} onChange={e => setRange(range.from, e.target.value || bounds.max)} />
        </div>
        {/* แถวล่าง: ตัวกรอง */}
        <div className="filter-compact" style={{ borderTop: '1px solid var(--line)', padding: '10px 14px' }}>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <Icon name="filter" />
            <MultiSelect label="ช่องทาง" icon="" options={opts.channel} value={f.channel} onChange={v => setF(p => ({ ...p, channel: v }))} />
            <MultiSelect label="ประเภทงาน" options={opts.job_type} value={f.job_type} onChange={v => setF(p => ({ ...p, job_type: v }))} />
            <MultiSelect label="การชำระ" options={opts.payment_type} value={f.payment_type} onChange={v => setF(p => ({ ...p, payment_type: v }))} />
            <MultiSelect label="ลูกค้า" options={opts.customer_type} value={f.customer_type} onChange={v => setF(p => ({ ...p, customer_type: v }))} />
            <MultiSelect label="ขนาดออเดอร์" options={opts.qty_band} value={f.qty_band} onChange={v => setF(p => ({ ...p, qty_band: v }))} />
            <MultiSelect label="ลาย" options={opts.design} value={f.design} onChange={v => setF(p => ({ ...p, design: v }))} />
            <MultiSelect label="หมวด" options={opts.type} value={f.type} onChange={v => setF(p => ({ ...p, type: v }))} />
            <MultiSelect label="ไซซ์" options={opts.size} value={f.size} onChange={v => setF(p => ({ ...p, size: v }))} />
            <MultiSelect label="สี" options={opts.color} value={f.color} onChange={v => setF(p => ({ ...p, color: v }))} />
            <MultiSelect label="จังหวัด" options={opts.province} value={f.province} onChange={v => setF(p => ({ ...p, province: v }))} />
            <MultiSelect label="เซลล์" options={opts.salesperson} value={f.salesperson} onChange={v => setF(p => ({ ...p, salesperson: v }))} />
            {nFilters > 0 && <button className="btn btn-sm" style={{ color: 'var(--bad)' }} onClick={() => setF(p => ({ ...emptyF(), from: p.from, to: p.to }))}><Icon name="x" /> ล้างตัวกรอง ({nFilters})</button>}
          </div>
          {activeChips.length > 0 && <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
            {activeChips.map(({ dim, v }) => <button key={dim + v} className="badge badge-outline" style={{ cursor: 'pointer', padding: '2px 8px' }} onClick={() => toggleFilter(dim, v)} title="คลิกเพื่อเอาออก"><span style={{ color: 'var(--ink-4)' }}>{DIM_LABEL[dim]}:</span> {v} <Icon name="x" /></button>)}
          </div>}
        </div>
      </div>

      {/* ===== Hero (executive) ===== */}
      {(() => {
        const unknownC = Math.max(0, k.orders - k.newC - k.oldC);
        const seg = (n) => k.orders ? (n / k.orders * 100) : 0;
        return <>
          <div className="card" style={{ padding: '22px 26px' }}>
            <div className="hero-exec" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 26 }}>
              {/* ซ้าย — ยอดขาย */}
              <div style={{ minWidth: 0 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>ยอดขายรวม · {range.from} – {range.to}{nFilters > 0 ? ' · กรองแล้ว' : ''}</div>
                <div className="row" style={{ gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span className="num" style={{ fontSize: 'clamp(30px,4.4vw,46px)', fontWeight: 700, letterSpacing: '-1.2px', lineHeight: 1 }}>{baht(k.sales)}</span>
                  {cmp
                    ? <span className="badge badge-outline" style={{ background: dk.sales.d >= 0 ? 'var(--good-soft)' : 'var(--bad-soft)', color: dk.sales.d >= 0 ? 'var(--good)' : 'var(--bad)', fontWeight: 700 }}>{dk.sales.d >= 0 ? '▲' : '▼'} {Math.abs(Math.round(dk.sales.d * 100))}%</span>
                    : <span className="badge badge-default" style={{ color: 'var(--ink-4)' }}>เทียบช่วงก่อนยังไม่มี</span>}
                </div>
                <div style={{ marginTop: 12 }}><Sparkline data={heroStats.sparkSales} w={260} h={40} color="var(--accent)" /></div>
                <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 10 }}>เฉลี่ย <b style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{baht(heroStats.perDay)}/วัน</b> · {N(heroStats.days)} วัน{cmp ? ` · เทียบ ${prevLabel} ${baht(dk.sales.prev)}` : ''}</div>
              </div>
              {/* ขวา — กำไร + คาดการณ์ */}
              <div className="hero-right" style={{ borderLeft: '1px solid var(--line)', paddingLeft: 26, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div className="eyebrow" style={{ marginBottom: 9 }}>กำไรสุทธิ</div>
                <div className="num" style={{ fontSize: 'clamp(24px,3vw,31px)', fontWeight: 700, letterSpacing: '-0.7px', color: 'var(--good)', lineHeight: 1 }}>{baht(k.profit)}</div>
                <div className="cap" style={{ color: 'var(--ink-4)', margin: '7px 0 16px' }}>{k.costOrders ? `มาร์จิ้นจริง ${Math.round(k.marginReal * 100)}% · บนยอดที่มีต้นทุน` : 'ยังไม่มีต้นทุนบันทึก'}</div>
                <div className="cap" style={{ color: 'var(--ink-3)', marginBottom: 4 }}>ประมาณการ 30 วัน</div>
                <div className="num" style={{ fontSize: 19, fontWeight: 700 }}>~{baht(heroStats.perDay * 30)}</div>
                <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 2 }}>จากเฉลี่ย {baht(heroStats.perDay)}/วัน</div>
              </div>
            </div>
          </div>

          {/* 4 KPI การ์ดหลัก (มี sparkline) — hierarchy: orders + sales เป็นหลัก */}
          <div className="kpi4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            <div className="metric-card kpi-card-primary">
              <div className="eyebrow">ออเดอร์</div>
              <div className="num" style={{ fontSize: 26, fontWeight: 700, margin: '4px 0 2px' }}>{N(k.orders)}</div>
              <Sparkline data={heroStats.sparkOrders} w={180} h={22} color="var(--accent)" fill={false} />
              <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 4 }}>เฉลี่ย {baht(k.aov)}/ออเดอร์{k.cancelled ? ` · ยกเลิก ${N(k.cancelled)}` : ''}</div>
            </div>
            <div className="metric-card kpi-card-info">
              <div className="eyebrow">ลูกค้า</div>
              <div className="num" style={{ fontSize: 26, fontWeight: 700, margin: '4px 0 4px' }}>{N(k.nCustomers)}</div>
              {heroStats.custN > 0
                ? <span className="badge badge-secondary" style={{ fontSize: 11 }}>ซื้อซ้ำ {Math.round(heroStats.ltRepeatRate * 100)}% สะสม</span>
                : <span className="badge badge-default" style={{ color: 'var(--ink-4)', fontSize: 11 }}>ซื้อซ้ำ {Math.round(heroStats.repeatRate * 100)}% ในช่วง</span>}
              <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 5 }}>{heroStats.withPhone ? `ตามต่อได้ ${N(heroStats.withPhone)} (มีเบอร์)` : 'ยังไม่มีโปรไฟล์ลูกค้า'}</div>
            </div>
            <div className="metric-card kpi-card-good">
              <div className="eyebrow">ชิ้นที่ขาย</div>
              <div className="num" style={{ fontSize: 26, fontWeight: 700, margin: '4px 0 2px' }}>{N(k.qty)}</div>
              <Sparkline data={heroStats.sparkQty} w={180} h={22} color="var(--good)" fill={false} />
              <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 4 }}>{baht(k.ppu)}/ชิ้น · {(k.orders ? k.qty / k.orders : 0).toFixed(2)} ตัว/ออเดอร์</div>
            </div>
            <div className="metric-card kpi-card-warn">
              <div className="eyebrow">ลูกค้าใหม่</div>
              <div className="num" style={{ fontSize: 26, fontWeight: 700, margin: '4px 0 6px' }}>{Math.round(k.newPct * 100)}%</div>
              <div style={{ display: 'flex', height: 7, borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
                <span style={{ width: seg(k.newC) + '%', background: 'var(--accent)' }} />
                <span style={{ width: seg(k.oldC) + '%', background: 'var(--accent-soft)' }} />
                <span style={{ width: seg(unknownC) + '%', background: 'var(--surface-3)' }} />
              </div>
              <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 5 }}>ใหม่ {N(k.newC)} · เก่า {N(k.oldC)}{unknownC ? ` · ไม่ทราบ ${N(unknownC)}` : ''}</div>
            </div>
          </div>

          <div className="insight-strip">
            <div className="insight-pill"><Icon name="target" /><span><b>{heroStats.withPhone ? `${N(heroStats.withPhone)} ลูกค้าตามต่อได้` : 'ยังไม่มีโปรไฟล์ลูกค้า'}</b><span className="cap" style={{ color: 'var(--ink-4)' }}>CRM follow-up</span></span></div>
            <div className="insight-pill"><Icon name="wallet" /><span><b>{Math.round(k.codPct * 100)}% COD</b><span className="cap" style={{ color: 'var(--ink-4)' }}>{N(k.codO)} ออเดอร์</span></span></div>
            <div className="insight-pill"><Icon name="grid" /><span><b>{Math.round(k.mpPct * 100)}% Marketplace</b><span className="cap" style={{ color: 'var(--ink-4)' }}>ของยอดขายรวม</span></span></div>
            <div className="insight-pill"><Icon name="shield" /><span><b>{baht(k.commission)} ค่าธรรมเนียม</b><span className="cap" style={{ color: 'var(--ink-4)' }}>{Math.round(k.commPct * 100)}% ของยอด</span></span></div>
          </div>

          {/* เจาะลึก: ตัวรอง */}
          <div>
            <div className="cap" style={{ color: 'var(--ink-4)', fontWeight: 600, margin: '2px 0 8px', letterSpacing: '.3px' }}>เจาะลึก</div>
            <div className="metric-grid">
              <MetricCard label="ออเดอร์ก้อนใหญ่" value={N(k.big)} sub={`${Math.round(k.bigPct * 100)}% (≥11 ชิ้น)`} />
              <MetricCard label="COD" value={`${Math.round(k.codPct * 100)}%`} sub={`${N(k.codO)} ออเดอร์`} />
              <MetricCard label="มาร์เก็ตเพลส" value={`${Math.round(k.mpPct * 100)}%`} sub="ของยอดขาย" />
              <MetricCard label="ค่าคอม+ค่าธรรมเนียม" value={baht(k.commission)} tone="var(--warn)" sub={`${Math.round(k.commPct * 100)}% ของยอด`} />
              <MetricCard label="ครอบคลุม" value={`${N(k.nChannels)} ช่อง`} icon="grid" sub={`${N(k.nDesigns)} ลาย · ${N(k.nProvinces)} จว.`} />
            </div>
          </div>
        </>;
      })()}

      {/* ===== แท็บ ===== */}
      <div className="dashboard-spacer" />
      <div className="tabs-list" style={{ margin: 0 }}>
        <button className={'tabs-trigger' + (tab === 'overview' ? ' active' : '')} onClick={() => setTab('overview')}>ภาพรวม</button>
        <button className={'tabs-trigger' + (tab === 'design' ? ' active' : '')} onClick={() => setTab('design')}>ลาย & สินค้า</button>
        <button className={'tabs-trigger' + (tab === 'variant' ? ' active' : '')} onClick={() => setTab('variant')}>สี & ไซซ์</button>
        <button className={'tabs-trigger' + (tab === 'channel' ? ' active' : '')} onClick={() => setTab('channel')}>ช่องทาง</button>
        <button className={'tabs-trigger' + (tab === 'finance' ? ' active' : '')} onClick={() => setTab('finance')}>การเงิน</button>
        <button className={'tabs-trigger' + (tab === 'customer' ? ' active' : '')} onClick={() => setTab('customer')}>ลูกค้า</button>
        <button className={'tabs-trigger' + (tab === 'geo' ? ' active' : '')} onClick={() => setTab('geo')}>พื้นที่ & ทีม</button>
        <button className={'tabs-trigger' + (tab === 'funnel' ? ' active' : '')} onClick={() => setTab('funnel')}>คนทัก & ปิดการขาย</button>
      </div>

      {/* ===== S1 เทรนด์ ===== */}
      {tab === 'overview' && trend && (<>
        <div className="card">
          <div className="card-header" style={{ flexWrap: 'wrap' }}>
            <div className="card-title">ยอดขายตามเวลา <span className="dim">(เลือกตัวชี้วัด · เทียบช่วงก่อน)</span></div>
            <div className="card-action row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="tabs-list" style={{ margin: 0 }}>{[['sales', 'ยอดขาย'], ['orders', 'ออเดอร์'], ['qty', 'ชิ้น'], ['profit', 'กำไร']].map(([id, lb]) => <button key={id} className={'tabs-trigger' + (trendMetric === id ? ' active' : '')} onClick={() => setTrendMetric(id)}>{lb}</button>)}</div>
              <span style={{ width: 1, height: 18, background: 'var(--line)' }} />
              <span className="cap" style={{ color: 'var(--ink-4)' }}>มุมมอง</span>
              <div className="tabs-list" style={{ margin: 0 }}>{[['auto', 'อัตโนมัติ'], ['day', 'วัน'], ['week', 'สัปดาห์'], ['month', 'เดือน'], ['quarter', 'ไตรมาส']].map(([id, lb]) => <button key={id} className={'tabs-trigger' + (granSel === id ? ' active' : '')} onClick={() => setGranSel(id)}>{lb}</button>)}</div>
            </div>
          </div>
          <ComboChart labels={trend.labels} bars={trend.bars} line={trend.line} cmpBars={trend.cmpBars} barLabel={trendMetric === 'sales' ? 'ยอดขาย' : trendMetric} lineLabel="ออเดอร์" barFmt={metricFmt} lineFmt={N} cmpLabel={prevLabel} height={250} />
          <div className="cap row" style={{ gap: 14, marginTop: 8, color: 'var(--ink-4)', justifyContent: 'center' }}>
            <span className="row" style={{ gap: 5 }}><span style={{ width: 12, height: 8, borderRadius: 2, background: 'var(--accent-2)' }} /> {trendMetric === 'sales' ? 'ยอดขาย' : trendMetric === 'orders' ? 'ออเดอร์' : trendMetric === 'qty' ? 'ชิ้น' : 'กำไร'} (แท่ง)</span>
            <span className="row" style={{ gap: 5 }}><span style={{ width: 12, height: 2, background: 'var(--accent)' }} /> จำนวนออเดอร์ (เส้น)</span>
            {cmp && <span className="row" style={{ gap: 5 }}><span style={{ width: 12, height: 8, borderRadius: 2, background: 'var(--ink-3)', opacity: .35 }} /> {prevLabel}</span>}
          </div>
        </div>

        {/* ===== ช่องทาง: โดนัท + legend ตัวเลข (รวมเป็นการ์ดเดียว ไม่ลอย) ===== */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>ช่องทางการขาย</div>
          <div className="row" style={{ gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: 180, height: 180, flexShrink: 0, margin: '0 auto' }}>
              <DonutChart data={A.byChannel.map(c => ({ label: c.key, value: c.sales, color: channelColor(c.key) }))} height={180} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <span className="num" style={{ fontSize: 17, fontWeight: 700 }}>{baht(k.sales)}</span>
                <span className="cap" style={{ color: 'var(--ink-4)' }}>{N(k.nChannels)} ช่องทาง</span>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 240 }}><ChannelBars items={A.byChannel} total={k.sales} prevItems={prevA?.byChannel} cmp={cmp} onClick={key => toggleFilter('channel', key)} /></div>
          </div>
        </div>
      </>)}

      {/* ===== S3 ลาย & สินค้า ===== */}
      {tab === 'design' && (<>
        <div className="card">
          <div className="card-header" style={{ flexWrap: 'wrap' }}>
            <div className="card-title">ลายขายดี · Top {topN}</div>
            <div className="card-action row" style={{ gap: 6 }}>
              <div className="tabs-list" style={{ margin: 0 }}>{[['qty', 'ชิ้น'], ['sales', 'ยอด']].map(([id, lb]) => <button key={id} className={'tabs-trigger' + (designMetric === id ? ' active' : '')} onClick={() => setDesignMetric(id)}>{lb}</button>)}</div>
              <div className="tabs-list" style={{ margin: 0 }}>{[10, 15, 25].map(n => <button key={n} className={'tabs-trigger' + (topN === n ? ' active' : '')} onClick={() => setTopN(n)}>{n}</button>)}</div>
            </div>
          </div>
          <DesignLeaderboard items={designItems} metric={designMetric} onClick={key => toggleFilter('design', key)} />
        </div>

        <div className="grid g2" style={{ alignItems: 'start' }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>หมวดสินค้า</div>
            <HBars data={A.byType.map(t => ({ label: t.key, value: t.qty }))} height={160} unit="ชิ้น" />
          </div>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Pareto ลาย (80/20)</div>
            <ParetoChart items={[...A.byDesign].slice(0, 12).map(d => ({ key: d.key, [designMetric]: d[designMetric] }))} valKey={designMetric} fmt={designMetric === 'sales' ? baht : N} height={200} />
          </div>
        </div>

        {prevA && (
          <div className="grid g2" style={{ alignItems: 'start' }}>
            <MoversCard title="ลายดาวรุ่ง" icon="up" tone="var(--good)" data={movers(A.byDesign, prevA.byDesign, 'qty').filter(m => m.cur > 0).slice(0, 6)} />
            <MoversCard title="ลายดาวร่วง" icon="down" tone="var(--bad)" data={movers(A.byDesign, prevA.byDesign, 'qty').filter(m => m.prev > 0).slice(-6).reverse()} />
          </div>
        )}
      </>)}

      {/* ===== ช่องทาง (matrix + ตาราง) ===== */}
      {tab === 'channel' && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>ช่องทาง × {gran === 'day' ? 'วัน' : gran === 'week' ? 'สัปดาห์' : gran === 'month' ? 'เดือน' : 'ไตรมาส'} (ยอดขาย)</div>
          <ChannelHeatmap orders={orders} eff={eff} gran={gran} range={range} channels={A.byChannel.map(c => c.key)} />
          <div className="table-wrap" style={{ marginTop: 14 }}><table className="table">
            <thead><tr><th>ช่องทาง</th><th style={{ textAlign: 'right' }}>ยอดขาย</th><th style={{ textAlign: 'right' }}>ออเดอร์</th><th style={{ textAlign: 'right' }}>ชิ้น</th><th style={{ textAlign: 'right' }}>AOV</th><th style={{ textAlign: 'right' }}>%share</th>{prevA && <th style={{ textAlign: 'right' }}>%Δ</th>}</tr></thead>
            <tbody>{A.byChannel.map(c => { const mv = prevA ? movers(A.byChannel, prevA.byChannel, 'sales').find(m => m.key === c.key) : null; return (
              <tr key={c.key} onClick={() => toggleFilter('channel', c.key)} style={{ cursor: 'pointer' }}>
                <td><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: channelColor(c.key), marginRight: 7 }} />{c.key}</td>
                <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{baht(c.sales)}</td>
                <td className="num" style={{ textAlign: 'right' }}>{N(c.orders)}</td>
                <td className="num" style={{ textAlign: 'right' }}>{N(c.qty)}</td>
                <td className="num" style={{ textAlign: 'right' }}>{baht(c.aov)}</td>
                <td className="num" style={{ textAlign: 'right' }}>{Math.round(c.share * 100)}%</td>
                {prevA && <td className="num" style={{ textAlign: 'right', color: mv && mv.d >= 0 ? 'var(--good)' : 'var(--bad)' }}>{mv ? (mv.d >= 0 ? '+' : '') + Math.round(mv.d * 100) + '%' : '—'}</td>}
              </tr>); })}</tbody>
          </table></div>
        </div>
      )}

      {/* ===== S4 สี & ไซซ์ ===== */}
      {tab === 'variant' && (<>
        <div className="grid g2" style={{ alignItems: 'start' }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>ไซซ์ขายดี (เรียง XS → 8XL)</div>
            <HBars data={[...A.bySize].sort((a, b) => sizeRank(a.key) - sizeRank(b.key)).map(s => ({ label: s.key, value: s.qty }))} height={Math.max(160, A.bySize.length * 26)} unit="ชิ้น" />
          </div>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>สียอดนิยม</div>
            <HBars data={A.byColor.slice(0, 10).map(c => ({ label: c.key, value: c.qty }))} height={Math.max(160, Math.min(10, A.byColor.length) * 26)} unit="ชิ้น" />
          </div>
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 6 }}>เมทริกซ์ สี × ไซซ์ (จำนวนชิ้น)</div>
          <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 12 }}>ใช้วางแผนผลิต/สต็อก — ช่องเข้ม = ขายดี{f.design.length === 1 ? ` · เฉพาะลาย ${f.design[0]}` : ''}</div>
          <VariantMatrix skus={A._skus} />
        </div>
      </>)}

      {/* ===== S5 การเงิน ===== */}
      {tab === 'finance' && (<>
        <div className="grid g2" style={{ alignItems: 'start' }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>ช่องทางการชำระเงิน</div>
            <div style={{ maxWidth: 230, margin: '0 auto' }}><DonutChart data={A.byPayment.map((p, i) => ({ label: p.key, value: p.sales, color: CAT_COLORS[i % CAT_COLORS.length] }))} height={180} /></div>
            <div className="table-wrap" style={{ marginTop: 10 }}><table className="table"><tbody>{A.byPayment.map(p => (
              <tr key={p.key}><td>{p.key}</td><td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{baht(p.sales)}</td><td className="num" style={{ textAlign: 'right', color: 'var(--ink-3)' }}>{N(p.orders)} ออเดอร์ · {Math.round(p.share * 100)}%</td></tr>
            ))}</tbody></table></div>
          </div>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>ค่าคอม + ค่าธรรมเนียม แยกช่องทาง</div>
            {(() => { const comm = {}; A._ords.forEach(o => { const c = o.channel; comm[c] = (comm[c] || 0) + (Number(o.mkt_commission) || 0); }); const arr = Object.entries(comm).map(([key, v]) => ({ label: key, value: Math.round(v) })).filter(x => x.value > 0).sort((a, b) => b.value - a.value); return arr.length ? <HBars data={arr} height={Math.max(140, arr.length * 34)} unit="฿" color="#e39b2e" /> : <div className="cap" style={{ color: 'var(--ink-4)', padding: 12 }}>ไม่มีข้อมูลค่าคอม (เฉพาะ Shopee)</div>; })()}
            <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 8 }}>รวมค่าคอม {baht(k.commission)} · {Math.round(k.commPct * 100)}% ของยอดขาย</div>
          </div>
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 4 }}>กำไรขั้นต้นตามช่องทาง</div>
          <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 12 }}>⚠️ เฉพาะช่องที่มีต้นทุนจริง — ช่องที่ไม่มีต้นทุน (เช่น TikTok) จะไม่แสดงกำไร</div>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>ช่องทาง</th><th style={{ textAlign: 'right' }}>ยอดขาย</th><th style={{ textAlign: 'right' }}>กำไรสุทธิ</th><th style={{ textAlign: 'right' }}>มาร์จิ้น</th></tr></thead>
            <tbody>{A.byChannel.map(c => { const hasCost = k.hasCostCh.has(c.key); return (
              <tr key={c.key}><td><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: channelColor(c.key), marginRight: 7 }} />{c.key}{!hasCost && <span className="badge badge-default" style={{ marginLeft: 6, fontSize: 10 }}>ไม่มีต้นทุน</span>}</td>
                <td className="num" style={{ textAlign: 'right' }}>{baht(c.sales)}</td>
                <td className="num" style={{ textAlign: 'right', fontWeight: 600, color: hasCost ? 'var(--good)' : 'var(--ink-4)' }}>{hasCost ? baht(c.profit) : '—'}</td>
                <td className="num" style={{ textAlign: 'right', color: 'var(--ink-3)' }}>{hasCost && c.sales > 0 ? Math.round(c.profit / c.sales * 100) + '%' : '—'}</td></tr>); })}</tbody>
          </table></div>
        </div>
      </>)}

      {/* ===== S6 ลูกค้า ===== */}
      {tab === 'customer' && (<>
        <div className="grid g2" style={{ alignItems: 'start' }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>ลูกค้าใหม่ vs เก่า ตามเวลา</div>
            {(() => { const bk = enumerateBuckets(range.from, range.to, gran); const nw = {}, od = {}; A._ords.forEach(o => { const b = bucketKey(o.order_date, gran); if (o.customer_type === 'ลูกค้าใหม่') nw[b] = (nw[b] || 0) + 1; else if (o.customer_type === 'ลูกค้าเก่า') od[b] = (od[b] || 0) + 1; }); return <StackedBars labels={bk.map(b => bucketLabel(b, gran).replace(/ \(.*/, ''))} datasets={[{ label: 'ลูกค้าใหม่', data: bk.map(b => nw[b] || 0), color: 'var(--info)' }, { label: 'ลูกค้าเก่า', data: bk.map(b => od[b] || 0), color: 'var(--good)' }]} fmt={N} height={210} />; })()}
            <div className="cap row" style={{ gap: 14, marginTop: 8, justifyContent: 'center', color: 'var(--ink-4)' }}><span className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: 'var(--info)' }} /> ใหม่ {N(k.newC)}</span><span className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: 'var(--good)' }} /> เก่า {N(k.oldC)}</span></div>
          </div>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>กระจายตามขนาดออเดอร์</div>
            <HBars data={[...A.byQtyBand].sort((a, b) => b.orders - a.orders).map(q => ({ label: q.key, value: q.orders }))} height={170} unit="ออเดอร์" color="#7c5cff" />
            <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 8 }}>ก้อนใหญ่ (≥11 ชิ้น) {N(k.big)} ออเดอร์ · {Math.round(k.bigPct * 100)}% (ประมาณว่าเป็นขายส่ง/OEM)</div>
          </div>
        </div>
        {(() => {
          const custs = customerAgg(A._ords); const { rows, summary } = rfmTiers(custs, range.to);
          const flagTone = (fl) => fl === 'เสี่ยงหลุด' ? 'var(--bad)' : fl === 'ใหม่' ? 'var(--accent)' : fl === 'ขาประจำ' ? 'var(--good)' : 'var(--ink-4)';
          const TIER_CHIP = { 'เพชร': 'tier-chip-diamond', 'ทอง': 'tier-chip-gold', 'เงิน': 'tier-chip-silver', 'ทองแดง': 'tier-chip-bronze' };
          const shown = (custTier === 'all' ? rows : rows.filter(r => r.tier === custTier)).slice(0, 40);
          return (<>
            <div className="card">
              <div className="card-header" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 0 }}>
                <div className="card-title">จัดระดับลูกค้าอัตโนมัติ (RFM)</div>
                <span className="card-description">{N(custs.length)} ลูกค้าที่มีรหัส · แบ่งตามยอดซื้อ + ความถี่ + ความสดใหม่</span>
              </div>
              <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 14 }}>คลิกการ์ดเพื่อกรองตารางด้านล่าง</div>
              <div className="metric-grid">
                {summary.map(t => (
                  <div key={t.key} className="metric-card" onClick={() => setCustTier(custTier === t.key ? 'all' : t.key)} style={{ cursor: 'pointer', outline: custTier === t.key ? `2px solid ${tierTone[t.key]}` : 'none' }}>
                    <div className="row between"><span className="cap row" style={{ gap: 6, fontWeight: 700, color: tierTone[t.key] }}><span style={{ width: 9, height: 9, borderRadius: 3, background: tierTone[t.key] }} />{t.key}</span><span className="cap" style={{ color: 'var(--ink-4)' }}>{Math.round(t.share * 100)}%</span></div>
                    <div className="num" style={{ fontSize: 22, fontWeight: 700, marginTop: 3 }}>{N(t.count)} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ink-4)' }}>คน</span></div>
                    <div className="cap" style={{ color: 'var(--ink-3)', marginTop: 2 }}>{baht(t.sales)} · {Math.round(t.sharePct * 100)}% ของยอด</div>
                    <div className="cap" style={{ color: 'var(--ink-4)' }}>เฉลี่ย {baht(t.avg)}/คน · {t.desc}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-header" style={{ flexWrap: 'wrap', gap: 8 }}>
                <div className="card-title">รายชื่อลูกค้า{custTier !== 'all' ? ` · ระดับ${custTier}` : ''}</div>
                <div className="card-action"><div className="tabs-list" style={{ margin: 0 }}>{['all', 'เพชร', 'ทอง', 'เงิน', 'ทองแดง'].map(t => <button key={t} className={'tabs-trigger' + (custTier === t ? ' active' : '')} onClick={() => setCustTier(t)}>{t === 'all' ? 'ทั้งหมด' : t}</button>)}</div></div>
              </div>
              {shown.length ? <div className="table-wrap" style={{ maxHeight: 460, overflow: 'auto' }}><table className="table">
                <thead><tr><th>ลูกค้า</th><th>ระดับ</th><th style={{ textAlign: 'right' }}>ยอดซื้อ</th><th style={{ textAlign: 'right' }}>ครั้ง</th><th style={{ textAlign: 'right' }}>เฉลี่ย/ครั้ง</th><th style={{ textAlign: 'right' }}>ช่อง</th><th style={{ textAlign: 'right' }}>ซื้อล่าสุด</th><th>สถานะ</th></tr></thead>
                <tbody>{shown.map((c, i) => (
                  <tr key={c.code}>
                    <td><span className="num" style={{ color: 'var(--ink-4)', marginRight: 8 }}>{i + 1}</span>{c.name}</td>
                    <td><span className={`tier-chip ${TIER_CHIP[c.tier] || ''}`}>{c.tier}</span></td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{baht(c.sales)}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{N(c.orders)}</td>
                    <td className="num" style={{ textAlign: 'right', color: 'var(--ink-3)' }}>{baht(c.aov)}</td>
                    <td className="num" style={{ textAlign: 'right', color: 'var(--ink-3)' }}>{N(c.channels)}</td>
                    <td className="num cap" style={{ textAlign: 'right', color: 'var(--ink-3)' }}>{c.last}{c.recency != null ? ` (${c.recency}ว.)` : ''}</td>
                    <td>{c.flag && <span className="badge badge-outline" style={{ fontSize: 10, color: flagTone(c.flag) }}>{c.flag}</span>}</td>
                  </tr>
                ))}</tbody>
              </table></div> : <div className="cap" style={{ color: 'var(--ink-4)', padding: 12 }}>ไม่มีลูกค้าในระดับนี้</div>}
              <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 8 }}>แสดง {N(shown.length)} จาก {N(custTier === 'all' ? rows.length : rows.filter(r => r.tier === custTier).length)} คน · เฉพาะออเดอร์ที่มีรหัสลูกค้า (~70%)</div>
            </div>
          </>);
        })()}
      </>)}

      {/* ===== S7+S8 พื้นที่ & ทีม ===== */}
      {tab === 'geo' && (<>
        <GeoPanel ords={A._ords} metric={geoMetric} setMetric={setGeoMetric} region={geoRegion} setRegion={setGeoRegion} selected={f.province} onFilter={toggleFilter} />
        <SalesTeam items={A.bySalesperson} prevItems={prevA?.bySalesperson} cmp={cmp} onFilter={toggleFilter} />
      </>)}

      {/* ===== S?: คนทัก & ปิดการขาย (funnel) ===== */}
      {tab === 'funnel' && (() => {
        const inR = (d) => (!range.from || d >= range.from) && (!range.to || d <= range.to);
        const fr = funnel.filter(r => inR(r.date) && (!f.salesperson.length || f.salesperson.includes(r.salesperson)));
        if (funnel.length === 0) return <div className="card" style={{ padding: 36, textAlign: 'center', color: 'var(--ink-4)' }}>ยังไม่มีข้อมูลคนทัก — ให้เซลล์กรอก "คนทักวันนี้" ที่หน้า <b>บันทึกขาย</b> ก่อน (ต้องรัน migration <code>tmk_sales_funnel</code> ด้วย)</div>;
        const sumK = (k) => fr.reduce((a, r) => a + (Number(r[k]) || 0), 0);
        const fbN = sumK('leads_fb_new'), fbO = sumK('leads_fb_old'), lnN = sumK('leads_line_new'), lnO = sumK('leads_line_old');
        const totalLeads = fbN + fbO + lnN + lnO, newLeads = fbN + lnN;
        // ปิดการขาย = ออเดอร์เฉพาะเซลล์ที่มีข้อมูลคนทัก (กัน %ปิด ผิดเพราะเทียบกับออเดอร์ทั้งระบบ)
        const funnelSps = new Set(fr.map(r => r.salesperson));
        const funnelOrds = (A._ords || []).filter(o => funnelSps.has(o.salesperson));
        const orders = funnelOrds.length;
        const close = totalLeads ? Math.round(orders / totalLeads * 100) : 0;
        const buckets = enumerateBuckets(range.from, range.to, gran);
        const leadBy = {}; fr.forEach(r => { const b = bucketKey(r.date, gran); leadBy[b] = (leadBy[b] || 0) + (Number(r.leads_fb_new) || 0) + (Number(r.leads_fb_old) || 0) + (Number(r.leads_line_new) || 0) + (Number(r.leads_line_old) || 0); });
        const ordBy = {}; funnelOrds.forEach(o => { const b = bucketKey(o.order_date, gran); ordBy[b] = (ordBy[b] || 0) + 1; });
        const labels = buckets.map(b => bucketLabel(b, gran).replace(/ \(.*/, ''));
        const bars = buckets.map(b => leadBy[b] || 0), line = buckets.map(b => ordBy[b] || 0);
        // ต่อเซลล์
        const bySp = {}; fr.forEach(r => { const g = bySp[r.salesperson] || (bySp[r.salesperson] = { leads: 0, newL: 0 }); g.leads += (Number(r.leads_fb_new) || 0) + (Number(r.leads_fb_old) || 0) + (Number(r.leads_line_new) || 0) + (Number(r.leads_line_old) || 0); g.newL += (Number(r.leads_fb_new) || 0) + (Number(r.leads_line_new) || 0); });
        const spRows = Object.entries(bySp).map(([sp, g]) => { const o = (A.bySalesperson.find(x => x.key === sp) || {}).orders || 0; return { sp, leads: g.leads, newL: g.newL, orders: o, close: g.leads ? Math.round(o / g.leads * 100) : 0 }; }).sort((a, b) => b.leads - a.leads);
        return (<>
          <div className="metric-grid">
            <MetricCard label="คนทักรวม" value={N(totalLeads)} icon="users" sub={`ใหม่ ${N(newLeads)} · เก่า ${N(totalLeads - newLeads)}`} />
            <MetricCard label="ปิดการขาย" value={N(orders)} icon="check" sub="ออเดอร์ในช่วงนี้" tone="var(--accent)" />
            <MetricCard label="%ปิดการขาย" value={`${close}%`} icon="target" tone={close >= 15 ? 'var(--good)' : close >= 8 ? 'var(--warn)' : 'var(--bad)'} sub="ออเดอร์ ÷ คนทัก" />
            <MetricCard label="FB vs LINE" value={`${totalLeads ? Math.round((fbN + fbO) / totalLeads * 100) : 0}/${totalLeads ? Math.round((lnN + lnO) / totalLeads * 100) : 0}`} sub={`FB ${N(fbN + fbO)} · LINE ${N(lnN + lnO)}`} />
          </div>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>คนทัก vs ปิดการขาย ตามเวลา <span className="dim">(แท่ง=คนทัก · เส้น=ออเดอร์)</span></div>
            <ComboChart labels={labels} bars={bars} line={line} barLabel="คนทัก" lineLabel="ออเดอร์" barFmt={N} lineFmt={N} height={240} />
          </div>
          <div className="grid g2" style={{ alignItems: 'start' }}>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>ช่องทางคนทัก</div>
              <div style={{ maxWidth: 220, margin: '0 auto' }}><DonutChart data={[{ label: 'FB ใหม่', value: fbN, color: 'var(--ch-facebook)' }, { label: 'FB เก่า', value: fbO, color: 'color-mix(in srgb, var(--ch-facebook) 55%, var(--surface))' }, { label: 'LINE ใหม่', value: lnN, color: 'var(--ch-line)' }, { label: 'LINE เก่า', value: lnO, color: 'color-mix(in srgb, var(--ch-line) 55%, var(--surface))' }]} height={180} /></div>
            </div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>ปิดการขายต่อเซลล์</div>
              <div className="table-wrap"><table className="table">
                <thead><tr><th>เซลล์</th><th style={{ textAlign: 'right' }}>คนทัก</th><th style={{ textAlign: 'right' }}>ใหม่</th><th style={{ textAlign: 'right' }}>ปิดได้</th><th style={{ textAlign: 'right' }}>%ปิด</th></tr></thead>
                <tbody>{spRows.map(r => <tr key={r.sp}><td>{r.sp}</td><td className="num" style={{ textAlign: 'right' }}>{N(r.leads)}</td><td className="num" style={{ textAlign: 'right', color: 'var(--accent)' }}>{N(r.newL)}</td><td className="num" style={{ textAlign: 'right' }}>{N(r.orders)}</td><td className="num" style={{ textAlign: 'right', fontWeight: 700, color: r.close >= 15 ? 'var(--good)' : r.close >= 8 ? 'var(--warn)' : 'var(--bad)' }}>{r.close}%</td></tr>)}</tbody>
              </table></div>
            </div>
          </div>
        </>);
      })()}

      {drill && <DrillModal drill={drill} orders={orders} skus={skus} eff={eff} onClose={() => setDrill(null)} />}
      {importOpen && <MpImportModal onClose={() => setImportOpen(false)} onDone={() => { clearSaleCache(); setReloadKey(k => k + 1); }} />}
    </div>
  );
}

// ---------- ช่องทาง ranked bars (+%share +Δ ทำหน้าที่ legend ในตัว) ----------
function ChannelBars({ items, total, prevItems, cmp, onClick }) {
  const max = Math.max(1, ...items.map(c => c.sales));
  const pm = prevItems ? new Map(prevItems.map(x => [x.key, x.sales])) : null;
  return <div style={{ display: 'grid', gap: 10 }}>{items.map(c => {
    const d = cmp && pm ? (pm.get(c.key) > 0 ? (c.sales - pm.get(c.key)) / pm.get(c.key) : null) : null;
    return (
      <div key={c.key} onClick={() => onClick?.(c.key)} style={{ cursor: 'pointer' }}>
        <div className="row between" style={{ marginBottom: 4 }}>
          <span className="row" style={{ gap: 7, fontSize: 12.5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: channelColor(c.key) }} />{c.key}</span>
          <span className="cap row" style={{ gap: 7, color: 'var(--ink-3)' }}>{d != null && <span style={{ fontWeight: 700, color: d >= 0 ? 'var(--good)' : 'var(--bad)' }}>{d >= 0 ? '▲' : '▼'}{Math.abs(Math.round(d * 100))}%</span>}<span className="num" style={{ color: 'var(--ink)' }}>{baht(c.sales)}</span><span style={{ minWidth: 30, textAlign: 'right' }}>{Math.round(c.sales / total * 100)}%</span></span>
        </div>
        <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${c.sales / max * 100}%`, height: '100%', background: channelColor(c.key), borderRadius: 3 }} /></div>
      </div>
    );
  })}</div>;
}

// ---------- leaderboard ลาย ----------
function DesignLeaderboard({ items, metric, onClick }) {
  const max = Math.max(1, ...items.map(d => d[metric]));
  return <div style={{ display: 'grid', gap: 5 }}>{items.map((d, i) => (
    <div key={d.key} onClick={() => onClick?.(d.key)} className="row" style={{ gap: 10, cursor: 'pointer', padding: '3px 0' }}>
      <span className="num" style={{ width: 20, textAlign: 'center', color: 'var(--ink-4)', fontWeight: 700 }}>{i + 1}</span>
      <span style={{ flex: '0 0 110px', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.key}</span>
      <div style={{ flex: 1, height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${d[metric] / max * 100}%`, height: '100%', background: 'var(--accent-2)', borderRadius: 4 }} /></div>
      <span className="num cap" style={{ flex: '0 0 auto', minWidth: 70, textAlign: 'right', color: 'var(--ink)' }}>{metric === 'sales' ? baht(d.sales) : N(d.qty) + ' ชิ้น'}</span>
    </div>
  ))}</div>;
}

// ---------- movers card ----------
function MoversCard({ title, icon, tone, data }) {
  return <div className="card">
    <div className="card-title row" style={{ gap: 6, marginBottom: 10, alignItems: 'center' }}><span style={{ color: tone }}><Icon name={icon} /></span>{title}</div>
    {data.length === 0 ? <div className="cap" style={{ color: 'var(--ink-4)' }}>—</div> : <div style={{ display: 'grid', gap: 7 }}>{data.map(m => (
      <div key={m.key} className="row between"><span style={{ fontSize: 13 }}>{m.key}</span><span className="cap" style={{ fontWeight: 700, color: tone }}>{m.d >= 0 ? '+' : ''}{Math.round(m.d * 100)}% <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>({N(m.cur)})</span></span></div>
    ))}</div>}
  </div>;
}

// ---------- channel × time heatmap ----------
function ChannelHeatmap({ orders, eff: _eff, gran, range, channels }) {
  const data = useMemo(() => {
    const buckets = enumerateBuckets(range.from, range.to, gran);
    const m = {}; channels.forEach(c => m[c] = {});
    orders.forEach(o => { if (o.status === 'cancelled') return; if (o.order_date < range.from || o.order_date > range.to) return; if (!channels.includes(o.channel)) return; const b = bucketKey(o.order_date, gran); m[o.channel][b] = (m[o.channel][b] || 0) + (Number(o.sales) || 0); });
    return { buckets, m };
  }, [orders, JSON.stringify(range), gran, channels.join()]);
  const cols = data.buckets.map(b => ({ key: b, label: bucketLabel(b, gran).replace(/ \(.*/, '') }));
  return <Heatmap rows={channels.map(c => ({ key: c, label: c }))} cols={cols} cell={(r, c) => data.m[r.key]?.[c.key] || 0} fmt={(v) => v >= 1000 ? Math.round(v / 1000) + 'k' : Math.round(v)} />;
}

// ---------- เมทริกซ์ สี × ไซซ์ ----------
function VariantMatrix({ skus }) {
  const { rows, cols, cell } = useMemo(() => {
    const colorQty = {}, sizeSet = new Set(), m = {};
    (skus || []).forEach(s => { const c = normColor(s.color), z = normSize(s.size); if (!c || !z || c === 'ไม่ระบุ') return; colorQty[c] = (colorQty[c] || 0) + (Number(s.qty) || 0); sizeSet.add(z); m[c] = m[c] || {}; m[c][z] = (m[c][z] || 0) + (Number(s.qty) || 0); });
    const topColors = Object.entries(colorQty).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([c]) => c);
    const cols = [...sizeSet].sort((a, b) => sizeRank(a) - sizeRank(b)).map(z => ({ key: z, label: z }));
    return { rows: topColors.map(c => ({ key: c, label: c })), cols, cell: (r, c) => m[r.key]?.[c.key] || 0 };
  }, [skus]);
  if (!rows.length) return <div className="cap" style={{ color: 'var(--ink-4)' }}>ไม่มีข้อมูล</div>;
  return <Heatmap rows={rows} cols={cols} cell={cell} color="#7c5cff" fmt={(v) => N(v)} />;
}

// ---------- แผนที่ไทย choropleth (สีไล่ 5 ขั้น + hover) ----------
const GEO_BUCKETS = [0.16, 0.34, 0.52, 0.72, 0.95]; // opacity ของ var(--accent) แต่ละขั้น
function bucketIdx(v, thr) { let i = 0; for (const t of thr) if (v >= t) i++; return i; }
function ThailandMap({ rows, valOf, thr, sel, hover, onHover, onClick, fmt: _fmt }) {
  const W = 300, H = 500, pad = 12;
  const { latMin, latMax, lngMin, lngMax } = TH_BBOX;
  const px = (lng) => pad + (lng - lngMin) / (lngMax - lngMin) * (W - 2 * pad);
  const py = (lat) => pad + (latMax - lat) / (latMax - latMin) * (H - 2 * pad);
  const byTh = {}; rows.forEach(p => byTh[p.th] = p);
  const dOf = (ring) => 'M' + ring.map(c => `${px(c[0]).toFixed(1)} ${py(c[1]).toFixed(1)}`).join('L') + 'Z';
  const top = [...rows].filter(r => valOf(r) > 0).sort((a, b) => valOf(b) - valOf(a)).slice(0, 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: 480, display: 'block', margin: '0 auto' }} role="img" aria-label="แผนที่ระบายสียอดขายตามจังหวัด" onMouseLeave={() => onHover(null)}>
      {Object.entries(TH_PATHS).map(([th, ring]) => {
        const p = byTh[th]; const v = p ? valOf(p) : 0; const on = sel === th || hover === th;
        return <path key={th} d={dOf(ring)} fill={v > 0 ? 'var(--accent)' : 'var(--ink-4)'} fillOpacity={v > 0 ? GEO_BUCKETS[bucketIdx(v, thr)] : 0.06} stroke={on ? 'var(--accent-2)' : 'var(--surface)'} strokeWidth={on ? 2 : 0.5} style={{ cursor: 'pointer', transition: 'fill-opacity .12s' }} onClick={() => onClick(th)} onMouseEnter={() => onHover(th)} />;
      })}
      {top.map(p => <text key={'t' + p.th} x={px(p.lng)} y={py(p.lat)} textAnchor="middle" style={{ fontSize: 8.5, fontWeight: 700, fill: 'var(--ink)', pointerEvents: 'none', paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 2.6 }}>{p.th}</text>)}
    </svg>
  );
}

// ---------- แผงพื้นที่ (แผนที่ + รายการ + region + hover state) ----------
function GeoPanel({ ords, metric, setMetric, region, setRegion, selected, onFilter }) {
  const [hover, setHover] = useState(null);
  const agg = {}; ords.forEach(o => { const th = normalizeProvince(o.province); if (!th) return; const g = agg[th] || (agg[th] = { sales: 0, orders: 0, qty: 0 }); g.sales += Number(o.sales) || 0; g.orders += 1; g.qty += Number(o.qty) || 0; });
  let rows = PROVINCES.map(p => ({ ...p, ...(agg[p.th] || { sales: 0, orders: 0, qty: 0 }) }));
  if (region !== 'all') rows = rows.filter(p => p.region === region);
  const valOf = (p) => metric === 'orders' ? p.orders : metric === 'qty' ? p.qty : p.sales;
  const fmtV = (v) => metric === 'sales' ? baht(v) : N(v) + (metric === 'orders' ? ' ออเดอร์' : ' ชิ้น');
  const sorted = rows.filter(p => valOf(p) > 0).sort((a, b) => valOf(b) - valOf(a));
  const total = sorted.reduce((a, p) => a + valOf(p), 0);
  const vals = sorted.map(valOf).sort((a, b) => a - b);
  const q = (pp) => vals.length ? vals[Math.floor((vals.length - 1) * pp)] : 0;
  const thr = [q(0.2), q(0.4), q(0.6), q(0.8)];
  const unmatched = ords.filter(o => !normalizeProvince(o.province)).reduce((a, o) => a + (Number(o.sales) || 0), 0);
  const hv = hover ? rows.find(p => p.th === hover) : null;
  return (
    <div className="card">
      <div className="card-header" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div className="card-title" style={{ marginBottom: 6 }}>กระจายตามจังหวัด</div>
          <div className="num" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.5px' }}>{N(sorted.length)}</div>
          <div className="cap" style={{ color: 'var(--ink-4)' }}>จังหวัดที่มียอด · {fmtV(total)} รวม</div>
        </div>
        <div className="tabs-list" style={{ margin: 0 }}>{[['sales', 'ยอดขาย'], ['orders', 'ออเดอร์'], ['qty', 'ชิ้น']].map(([id, lb]) => <button key={id} className={'tabs-trigger' + (metric === id ? ' active' : '')} onClick={() => setMetric(id)}>{lb}</button>)}</div>
      </div>
      <div className="row" style={{ gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
        <button className={'pick' + (region === 'all' ? ' active' : '')} onClick={() => setRegion('all')}>ทั้งประเทศ</button>
        {Object.entries(REGIONS).map(([id, lb]) => <button key={id} className={'pick' + (region === id ? ' active' : '')} onClick={() => setRegion(id)}>{lb}</button>)}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(240px, 1fr) 1.1fr', gap: 20, alignItems: 'start' }}>
        <div>
          <div style={{ position: 'relative' }}>
            <ThailandMap rows={rows} valOf={valOf} thr={thr} sel={selected.length === 1 ? selected[0] : null} hover={hover} onHover={setHover} onClick={(th) => onFilter('province', th)} fmt={fmtV} />
            {hv && <div style={{ position: 'absolute', top: 6, left: 6, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '6px 10px', boxShadow: 'var(--sh-sm, 0 2px 8px rgba(0,0,0,.1))', pointerEvents: 'none' }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{hv.th}</div>
              <div className="cap" style={{ color: 'var(--ink-3)' }}>{valOf(hv) > 0 ? `${fmtV(valOf(hv))} · ${Math.round(valOf(hv) / total * 100)}%` : 'ไม่มียอด'}</div>
            </div>}
          </div>
          <div className="row" style={{ gap: 8, justifyContent: 'center', marginTop: 6, alignItems: 'center' }}>
            <span className="cap" style={{ color: 'var(--ink-4)' }}>น้อย</span>
            {GEO_BUCKETS.map((op, i) => <span key={i} style={{ width: 22, height: 10, borderRadius: 2, background: 'var(--accent)', opacity: op }} />)}
            <span className="cap" style={{ color: 'var(--ink-4)' }}>มาก</span>
          </div>
        </div>
        <div>
          <div style={{ display: 'grid', gap: 7, maxHeight: 440, overflow: 'auto', paddingRight: 4 }}>
            {sorted.slice(0, 20).map((p, i) => { const v = valOf(p); const on = selected.includes(p.th) || hover === p.th; return (
              <div key={p.th} onClick={() => onFilter('province', p.th)} onMouseEnter={() => setHover(p.th)} onMouseLeave={() => setHover(null)} className="row" style={{ gap: 10, cursor: 'pointer', alignItems: 'center', padding: '3px 5px', borderRadius: 6, background: on ? 'var(--surface-2, rgba(76,125,255,.1))' : 'transparent' }}>
                <span className="num" style={{ width: 18, textAlign: 'center', color: 'var(--ink-4)', fontWeight: 700, fontSize: 12 }}>{i + 1}</span>
                <span style={{ flex: '0 0 96px', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.th}</span>
                <div style={{ flex: 1, height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${v / (valOf(sorted[0]) || 1) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} /></div>
                <span className="num cap" style={{ flex: '0 0 auto', minWidth: 78, textAlign: 'right', color: 'var(--ink)' }}>{fmtV(v)}</span>
                <span className="cap num" style={{ flex: '0 0 34px', textAlign: 'right', color: 'var(--ink-4)' }}>{Math.round(v / total * 100)}%</span>
              </div>
            ); })}
          </div>
          <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--line)' }}>{sorted.length > 20 ? `อีก ${N(sorted.length - 20)} จังหวัด = ${fmtV(sorted.slice(20).reduce((a, p) => a + valOf(p), 0))} · ` : ''}แตะหมุด/แถวเพื่อกรอง{unmatched > 0 ? ` · POS/ไม่ระบุ ${baht(unmatched)} แยกออก` : ''}</div>
        </div>
      </div>
    </div>
  );
}

// ---------- ทีมขาย leaderboard ----------
const SALES_AUTO = (k) => /อัตโนมัติ|มาร์เก็ตเพลส|tiktok|\(.*\)/i.test(k);
const initial = (k) => { const s = String(k || '').replace(/[()]/g, '').trim(); return s ? s[0].toUpperCase() : '?'; };
function SalesTeam({ items, prevItems, cmp, onFilter }) {
  const rows = [...(items || [])].sort((a, b) => b.sales - a.sales);
  const total = rows.reduce((a, s) => a + s.sales, 0);
  const max = Math.max(1, ...rows.map(s => s.sales));
  const pm = prevItems ? new Map(prevItems.map(x => [x.key, x.sales])) : null;
  const human = rows.filter(s => !SALES_AUTO(s.key));
  const humanSales = human.reduce((a, s) => a + s.sales, 0);
  const medal = ['#e3b341', '#b8c0cc', '#cd8b5e'];
  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 2 }}>
        <div className="card-title">ทีมขาย <span className="dim">(ลีดเดอร์บอร์ด)</span></div>
        <span className="card-description">เซลล์จริง {N(human.length)} คน · {baht(humanSales)} · ที่เหลือมาจากมาร์เก็ตเพลส (อัตโนมัติ)</span>
      </div>
      <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 12 }}>คลิกแถวเพื่อกรองทั้งหน้า</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map((s, i) => {
          const auto = SALES_AUTO(s.key); const d = cmp && pm && pm.get(s.key) > 0 ? (s.sales - pm.get(s.key)) / pm.get(s.key) : null;
          const name = auto ? s.key.replace(/[()]/g, '') : s.key;
          return (
            <div key={s.key} onClick={() => onFilter('salesperson', s.key)} className="row" style={{ gap: 12, cursor: 'pointer', alignItems: 'center', padding: '8px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)', background: 'var(--surface)' }}>
              <span className="num" style={{ width: 22, textAlign: 'center', fontWeight: 800, fontSize: 13, color: i < 3 ? medal[i] : 'var(--ink-4)' }}>{i + 1}</span>
              <span style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: auto ? 'var(--surface-2)' : 'var(--accent)', color: auto ? 'var(--ink-3)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>{auto ? <Icon name="refresh" /> : initial(name)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  {auto && <span className="badge badge-default" style={{ fontSize: 10 }}>อัตโนมัติ</span>}
                  <span className="cap" style={{ marginLeft: 'auto', color: 'var(--ink-4)' }}>{Math.round(s.sales / total * 100)}%</span>
                </div>
                <div style={{ height: 7, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${s.sales / max * 100}%`, height: '100%', background: auto ? 'var(--ink-4)' : 'var(--accent)', borderRadius: 4 }} /></div>
              </div>
              <div style={{ flex: '0 0 auto', textAlign: 'right', minWidth: 96 }}>
                <div className="num" style={{ fontWeight: 700, fontSize: 14 }}>{baht(s.sales)}</div>
                <div className="cap" style={{ color: 'var(--ink-3)' }}>{N(s.orders)} ออเดอร์ · {baht(s.aov)}/ออเดอร์</div>
              </div>
              {cmp && <span className="cap num" style={{ flex: '0 0 50px', textAlign: 'right', fontWeight: 700, color: d == null ? 'var(--ink-4)' : d >= 0 ? 'var(--good)' : 'var(--bad)' }}>{d == null ? '—' : (d >= 0 ? '▲' : '▼') + Math.abs(Math.round(d * 100)) + '%'}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- drill-down modal ----------
function DrillModal({ drill, orders, skus, eff, onClose }) {
  const { dim, value } = drill;
  const f2 = { ...eff, [dim]: [value] };
  const A = useMemo(() => compute(orders, skus, f2), [orders, skus, JSON.stringify(f2)]);
  const k = A.kpi;
  return <SideSheet size="lg" icon="grid" title={`${dim === 'channel' ? 'ช่องทาง' : dim === 'design' ? 'ลาย' : dim}: ${value}`} sub={`${baht(k.sales)} · ${N(k.orders)} ออเดอร์ · ${N(k.qty)} ชิ้น`} onClose={onClose} footer={<button className="btn" onClick={onClose}>ปิด</button>}>
    <div className="metric-grid" style={{ marginBottom: 14 }}>
      <MetricCard label="ยอดขาย" value={baht(k.sales)} tone="var(--accent)" />
      <MetricCard label="ออเดอร์" value={N(k.orders)} />
      <MetricCard label="ชิ้น" value={N(k.qty)} />
      <MetricCard label="AOV" value={baht(k.aov)} />
    </div>
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <div><div className="card-title" style={{ marginBottom: 10 }}>ลายเด่น</div><HBars data={A.byDesign.slice(0, 8).map(d => ({ label: d.key, value: d.qty }))} height={180} unit="ชิ้น" /></div>
      <div><div className="card-title" style={{ marginBottom: 10 }}>สี & ไซซ์</div>
        <div className="cap" style={{ color: 'var(--ink-3)', marginBottom: 4 }}>สี</div><HBars data={A.byColor.slice(0, 6).map(c => ({ label: c.key, value: c.qty }))} height={120} unit="ชิ้น" />
      </div>
    </div>
  </SideSheet>;
}
