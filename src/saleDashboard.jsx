/* ============================================================
   saleDashboard.jsx — แดชบอร์ดยอดขายเต็มระบบ (หน้า Sale)
   P1: time picker + global filter + 12 KPI + เทรนด์(S1) + ลาย(S3) + drill
   ข้อมูล: fetch ครั้งเดียว → aggregate ฝั่ง client (saleAgg/saleTime)
   ============================================================ */
import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { N, Icon, Skel, useDelayedFlag } from './components.jsx';
import { MpImportModal, SideSheet } from './modals.jsx';
import { MetricCard, CountUp, GradientSparkline, ComboChart, StackedBars, HBars, DonutChart, Heatmap, channelColor, CAT_COLORS, Sparkline, AreaTrend } from './charts.jsx';
import { ChannelLogo, channelTint } from './lib/channelLogos.jsx';
import { compute, series, deltaKpi, movers, sizeRank, normColor, normSize, customerAgg, rfmTiers, geoBreakdown, regionBreakdown } from './lib/saleAgg.js';
import { bucketKey, bucketLabel, enumerateBuckets, autoGran, presetRange, PRESETS, prevPeriod, prevCalendarMonth, isFullCalendarMonth, diffDays } from './lib/saleTime.js';
import { CATALOG_TYPES } from './lib/catalogMeta.js';
import { PROVINCES, REGIONS, normalizeProvince, TH_BBOX } from './lib/provinces.js';
import { TH_PATHS } from './lib/thMapPaths.js';
import { entriesToOrders } from './lib/saleRecon.js';
import { makeSkuResolver, loadResolverMaps } from './lib/designResolve.js';
import { fetchTargets, commissionFor } from './lib/targets.js';
import { supabase } from './lib/supabaseClient.js';
import { downloadCsv } from './lib/exportCsv.js';
import { cachedFetchAll, cachedFetchRange, getDateBounds, clearSaleCache, ORDERS_SEL, SKUS_SEL, CUST_SEL } from './lib/saleData.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { SortableTable } from './components/DataTableParts.jsx';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Toggle } from '@/components/ui/toggle';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { th } from 'date-fns/locale';

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
  const toggle = (v) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  const n = value.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={'rounded-full font-medium' + (n ? ' border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-2)]' : '')}>
          {icon && <Icon name={icon} />}{label}
          {n > 0 && <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[11px]">{n}</Badge>}
          <Icon name="down" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-auto">
        <DropdownMenuLabel className="flex items-center justify-between py-1">
          <span>{label}</span>
          {n > 0 && <button className="text-[12px] font-medium text-[var(--bad)] hover:underline" onClick={(e) => { e.preventDefault(); onChange([]); }}>ล้าง</button>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.length === 0 && <div className="px-2 py-2 text-[13px] text-[var(--ink-4)]">ไม่มีข้อมูล</div>}
        {options.map(o => (
          <DropdownMenuCheckboxItem key={o} checked={value.includes(o)} onSelect={(e) => { e.preventDefault(); toggle(o); }}>
            <span className="min-w-0 flex-1 truncate">{o}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------- date range picker (shadcn Calendar) ----------
const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const isoToDate = (s) => { if (!s) return undefined; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dateToIso = (dt) => dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}` : null;
const fmtTh = (s) => { if (!s) return '?'; const [y, m, d] = s.split('-').map(Number); return `${d} ${TH_MON[m - 1]} ${y}`; };
// ช่วงวันที่แบบกระชับ: เดือนเดียวกัน "1–26 มิ.ย. 2026" · ปีเดียวกัน "1 มิ.ย. – 26 ก.ค. 2026"
const fmtRange = (from, to) => {
  if (!from || !to) return '';
  const [fy, fm, fd] = from.split('-').map(Number), [ty, tm, td] = to.split('-').map(Number);
  if (fy === ty && fm === tm) return `${fd}–${td} ${TH_MON[fm - 1]} ${fy}`;
  if (fy === ty) return `${fd} ${TH_MON[fm - 1]} – ${td} ${TH_MON[tm - 1]} ${ty}`;
  return `${fmtTh(from)} – ${fmtTh(to)}`;
};
// ปุ่มช่วงเวลาเดียว: preset (ในป๊อปอัพ) + ปฏิทิน range — เลือกง่าย ไม่กินพื้นที่
function DateRangePicker({ from, to, min, max, onChange, presets = [], activePreset, onPickPreset }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState({ from: isoToDate(from), to: isoToDate(to) });
  const disabled = []; if (isoToDate(min)) disabled.push({ before: isoToDate(min) }); if (isoToDate(max)) disabled.push({ after: isoToDate(max) });
  const presetLabel = (presets.find(([id]) => id === activePreset) || [])[1];
  const main = presetLabel || 'กำหนดเอง';
  const sub = activePreset === 'all' ? '' : fmtRange(from, to);
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setSel({ from: isoToDate(from), to: isoToDate(to) }); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2 font-normal">
          <Icon name="calendarDays" /><span className="font-semibold text-[var(--ink)]">{main}</span>
          {sub && <span className="text-[var(--ink-4)]">· {sub}</span>}
          <Icon name="down" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex max-sm:flex-col">
          <div className="flex shrink-0 flex-col gap-0.5 border-b p-2 sm:min-w-[128px] sm:border-b-0 sm:border-r">
            <span className="px-2 pb-1 text-[11px] font-semibold text-[var(--ink-4)]">ช่วงเวลา</span>
            {presets.map(([id, lb]) => (
              <button key={id} onClick={() => { onPickPreset(id); setOpen(false); }}
                className={'rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ' + (id === activePreset ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent-2)]' : 'text-[var(--ink-2)] hover:bg-[var(--surface-2)]')}>{lb}</button>
            ))}
          </div>
          <Calendar mode="range" numberOfMonths={2} locale={th} defaultMonth={isoToDate(from) || isoToDate(max)} selected={sel}
            disabled={disabled.length ? disabled : undefined}
            onSelect={(r) => { setSel(r || { from: undefined, to: undefined }); if (r?.from && r?.to) { onChange(dateToIso(r.from), dateToIso(r.to)); setOpen(false); } }} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

// หัวข้อ section — สไตล์เดียวกับหัวข้อการ์ดกราฟ (ชื่อหนา + คำอธิบายจาง)
function SectionHead({ title, sub }) {
  return (
    <div className="row" style={{ alignItems: 'baseline', gap: 8, flexWrap: 'wrap', margin: '4px 0 -2px' }}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-.1px' }}>{title}</h3>
      {sub && <span className="cap" style={{ color: 'var(--ink-4)' }}>{sub}</span>}
    </div>
  );
}

const baht = (n) => '฿' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// สีจริงของชื่อสีไทย (ใช้กับแท่ง "ยอดขายแต่ละสี")
const COLOR_HEX = { 'ขาว': '#dcdce0', 'ดำ': '#2a2a2e', 'กรม': '#1f2d50', 'กรมท่า': '#1f2d50', 'ฟ้า': '#4a8be0', 'น้ำเงิน': '#1f3aa0', 'เขียว': '#2f9e6e', 'เหลือง': '#e8c23b', 'แดง': '#c0392b', 'ชมพู': '#e06aa0', 'ม่วง': '#7c5cff', 'ส้ม': '#e0772f', 'โอรส': '#e0772f', 'ครีม': '#e6dcc2' };
const tierTone = { 'เพชร': '#7c5cff', 'ทอง': '#e39b2e', 'เงิน': '#3aa0c9', 'ทองแดง': '#8a909c' };

/* Skeleton ตรง layout แดชบอร์ด: แถบควบคุม + hero ใหญ่ + เกจ + กราฟ + การ์ดเมตริก */
function DashboardSkeleton() {
  const bar = (i) => `${28 + ((i * 41) % 64)}%`;
  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      <Card className="p-3">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {Array.from({ length: 7 }).map((_, i) => <Skel key={i} w={58} h={28} r={8} />)}
          <Skel w={130} h={28} r={8} style={{ marginLeft: 'auto' }} />
        </div>
      </Card>
      <div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'stretch' }}>
        <Card className="p-[22px]" style={{ flex: '2 1 360px', minHeight: 196 }}>
          <Skel w={130} h={11} />
          <Skel w={240} h={38} r={10} style={{ margin: '14px 0 10px' }} />
          <Skel w="64%" h={9} style={{ marginBottom: 18 }} />
          <Skel w="100%" h={8} r={6} />
          <div className="row" style={{ gap: 18, marginTop: 20 }}>
            {Array.from({ length: 4 }).map((_, i) => <div key={i} style={{ flex: 1 }}><Skel w="58%" h={9} /><Skel w="82%" h={18} style={{ marginTop: 7 }} /></div>)}
          </div>
        </Card>
        <Card className="p-[22px]" style={{ flex: '1 1 220px', minHeight: 196, display: 'flex', alignItems: 'center', gap: 16 }}>
          <Skel w={112} h={112} r="50%" />
          <div style={{ flex: 1 }}><Skel w="70%" h={11} /><Skel w="90%" h={22} style={{ marginTop: 9 }} /><Skel w="60%" h={11} style={{ marginTop: 13 }} /></div>
        </Card>
      </div>
      <Card className="p-[22px]" style={{ minHeight: 270 }}>
        <Skel w={160} h={13} style={{ marginBottom: 20 }} />
        <div className="row" style={{ alignItems: 'flex-end', gap: 7, height: 200 }}>
          {Array.from({ length: 24 }).map((_, i) => <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'flex-end', height: '100%' }}><Skel w="100%" h={bar(i)} r={4} /></div>)}
        </div>
      </Card>
      <div className="metric-grid">
        {Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-[22px]"><Skel w="55%" h={10} /><Skel w="76%" h={22} style={{ marginTop: 11 }} /></Card>)}
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [granSel, setGranSel] = useState('auto');
  const [compare] = useState(true); // เทียบช่วงก่อน (เดือนที่แล้ว) เปิดถาวร — ไม่มี toggle
  const [tab, setTab] = useState('overview');
  const [trendMetric, setTrendMetric] = useState('sales');
  const [trendSplit, setTrendSplit] = useState(false);
  const [designMetric, setDesignMetric] = useState('qty');
  const [topN, setTopN] = useState(12);
  const [drill, setDrill] = useState(null);
  const [custDetail, setCustDetail] = useState(null);
  const [custTier, setCustTier] = useState('all');
  const [geoMetric, setGeoMetric] = useState('sales');
  const [geoRegion, setGeoRegion] = useState('all');
  const [importOpen, setImportOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [funnel, setFunnel] = useState([]);
  const [cust, setCust] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [entries, setEntries] = useState([]);
  const [resolverMaps, setResolverMaps] = useState(null);
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
  // โหลด map สำหรับ live-resolve ชื่อลาย/รหัส (catalog/alias/override) — รีโหลดหลังนำเข้า/แก้ catalog
  useEffect(() => { let alive = true; (async () => {
    const m = await loadResolverMaps(supabase);
    if (alive) setResolverMaps(m);
  })(); return () => { alive = false; }; }, [reloadKey]);
  const resolver = useMemo(() => makeSkuResolver(resolverMaps || {}), [resolverMaps]);
  useEffect(() => { saveF(f); }, [f]);

  const bounds = dbBounds;
  const range = { from: f.from || bounds.min, to: f.to || bounds.max };
  const eff = { ...f, from: range.from, to: range.to };
  // เทียบ: ถ้าช่วง = เดือนปฏิทินเต็ม → เทียบ "เดือนก่อนหน้า" (เต็มเดือน) ไม่งั้นเทียบช่วงยาวเท่ากัน
  const fullMonth = isFullCalendarMonth(range.from, range.to);
  const prevRange = (range.from && range.to) ? (fullMonth ? prevCalendarMonth(range.from, range.to) : prevPeriod(range.from, range.to)) : null;
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
    const remap = (skus || []).map(s => {
      const s1 = (!ordNos.has(s.order_no) && mid2ono.has(s.order_no)) ? { ...s, order_no: mid2ono.get(s.order_no) } : s;
      const r = resolver(s1);   // live-resolve: catalog/alias/override ทับค่า frozen ตอนแสดงผล
      return (r.design !== s1.design || r.product_code !== s1.product_code)
        ? { ...s1, design: r.design || s1.design, product_code: r.product_code || s1.product_code } : s1;
    });
    return [...remap, ...entriesToOrders(entries || []).skus];
  }, [orders, skus, entries, resolver]);

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

  // ย่อยรายวัน × ช่องทาง (stacked) — แต่ละแท่งแบ่งสีตามช่องทาง
  const trendByChannel = useMemo(() => {
    if (!A || !range.from) return { labels: [], datasets: [] };
    const bks = enumerateBuckets(range.from, range.to, gran);
    const channels = A.byChannel.map(c => c.key); // เรียงตามยอดมาก→น้อย
    const acc = {}; channels.forEach(ch => acc[ch] = {});
    const valOf = (o) => trendMetric === 'orders' ? 1 : trendMetric === 'qty' ? (Number(o.qty) || 0) : trendMetric === 'profit' ? (Number(o.profit) || 0) : (Number(o.sales) || 0);
    (A._ords || []).forEach(o => { if (!(o.channel in acc)) return; const b = bucketKey(o.order_date, gran); acc[o.channel][b] = (acc[o.channel][b] || 0) + valOf(o); });
    return {
      labels: bks.map(b => bucketLabel(b, gran).replace(/ \(.*/, '')),
      datasets: channels.map(ch => ({ label: ch, data: bks.map(b => acc[ch][b] || 0), color: channelColor(ch) })),
    };
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
  const metricFmt = trendMetric === 'sales' || trendMetric === 'profit' ? baht : N;
  const designItems = (designMetric === 'sales' ? [...A.byDesign].sort((a, b) => b.sales - a.sales) : A.byDesign).slice(0, topN);
  const setRange = (from, to) => setF(p => ({ ...p, from, to }));
  // preset ที่ active อยู่ (ตรงกับช่วงปัจจุบัน) — ให้ ToggleGroup รู้ค่าที่เลือก
  const activePreset = (() => { for (const [id] of PRESETS) { const r = presetRange(id, bounds.max, bounds.min, bounds.max); if (id === 'all' ? (!f.from && !f.to) : (f.from === r.from && f.to === r.to)) return id; } return ''; })();
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
    const sumK = (key) => fr.reduce((a, r) => a + (Number(r[key]) || 0), 0);
    const totalLeads = sumK('leads_fb_new') + sumK('leads_fb_old') + sumK('leads_line_new') + sumK('leads_line_old');
    const funnelSps = new Set(fr.map(r => r.salesperson));
    const orders = (A._ords || []).filter(o => funnelSps.has(o.salesperson)).length;
    return { totalLeads, orders, pct: totalLeads ? Math.round(orders / totalLeads * 100) : 0 };
  })();
  const basketQty = k.orders ? k.qty / k.orders : 0;

  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>

      {/* ===== แผงควบคุมรวม: แถวเดียว — ช่วงเวลา + ตัวกรอง (ยุบได้) ===== */}
      <Card className="overflow-visible" style={{ padding: 0 }}>
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <div className="filter-compact row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '11px 14px' }}>
            <DateRangePicker from={range.from} to={range.to} min={bounds.min} max={bounds.max} onChange={(a, b) => setRange(a, b)}
              presets={PRESETS} activePreset={activePreset}
              onPickPreset={(id) => { const r = presetRange(id, bounds.max, bounds.min, bounds.max); setRange(id === 'all' ? null : r.from, id === 'all' ? null : r.to); }} />
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

          {/* 4 KPI การ์ดหลัก (มี sparkline) — hierarchy: orders + sales เป็นหลัก */}
          <SectionHead title="ตัวชี้วัดหลัก" sub={`ช่วงที่เลือก · ${N(heroStats.days)} วัน`} />
          <div className="kpi4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            <div className="metric-card kpi-card-primary">
              <div className="eyebrow">ออเดอร์</div>
              <div className="num" style={{ fontSize: 26, fontWeight: 700, margin: '4px 0 2px' }}><CountUp value={k.orders} fmt={N} /></div>
              <GradientSparkline data={heroStats.sparkOrders} height={26} color="var(--accent)" />
              <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 4 }}>เฉลี่ย {baht(k.aov)}/ออเดอร์{k.cancelled ? ` · ยกเลิก ${N(k.cancelled)}` : ''}</div>
            </div>
            <div className="metric-card kpi-card-info">
              <div className="eyebrow">ลูกค้า</div>
              <div className="num" style={{ fontSize: 26, fontWeight: 700, margin: '4px 0 4px' }}><CountUp value={k.nCustomers} fmt={N} /></div>
              {heroStats.custN > 0
                ? <Badge variant="secondary" style={{ fontSize: 11 }}>ซื้อซ้ำ {Math.round(heroStats.ltRepeatRate * 100)}% สะสม</Badge>
                : <Badge variant="secondary" style={{ color: 'var(--ink-4)', fontSize: 11 }}>ซื้อซ้ำ {Math.round(heroStats.repeatRate * 100)}% ในช่วง</Badge>}
              <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 5 }}>{heroStats.withPhone ? `ตามต่อได้ ${N(heroStats.withPhone)} (มีเบอร์)` : 'ยังไม่มีโปรไฟล์ลูกค้า'}</div>
            </div>
            <div className="metric-card kpi-card-good">
              <div className="eyebrow">ตัวที่ขาย{k.skuFilterActive ? ' (เฉพาะลาย)' : ''}</div>
              <div className="num" style={{ fontSize: 26, fontWeight: 700, margin: '4px 0 2px' }}><CountUp value={k.skuFilterActive ? k.attrQty : k.qty} fmt={N} /></div>
              <GradientSparkline data={heroStats.sparkQty} height={26} color="var(--good)" />
              <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 4 }}>{k.skuFilterActive ? `${N(k.qty)} ตัวรวมทั้งออเดอร์` : `${baht(k.ppu)}/ตัว · ${(k.orders ? k.qty / k.orders : 0).toFixed(2)} ตัว/ออเดอร์`}</div>
            </div>
            <div className="metric-card kpi-card-warn">
              <div className="eyebrow">ลูกค้าใหม่</div>
              <div className="num" style={{ fontSize: 26, fontWeight: 700, margin: '4px 0 6px' }}><CountUp value={Math.round(k.newPct * 100)} fmt={(v) => `${Math.round(v)}%`} /></div>
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
            <SectionHead title="เจาะลึก" sub="ตัวเลขเสริมรายสัดส่วน" />
            <div className="metric-grid" style={{ marginTop: 10 }}>
              <MetricCard index={0} label="ออเดอร์ก้อนใหญ่" value={N(k.big)} sub={`${Math.round(k.bigPct * 100)}% (≥11 ตัว)`} />
              <MetricCard index={1} label="กำไร/ออเดอร์" value={baht(k.orders ? k.profit / k.orders : 0)} tone="var(--good)" sub={k.costOrders ? `มาร์จิ้นเชื่อได้ ${Math.round(k.marginReal * 100)}%${(k.hasCostCh && k.hasCostCh.size < k.nChannels) ? ' · บางช่องไม่มีต้นทุน' : ''}` : 'ยังไม่มีต้นทุน'} />
              <MetricCard index={2} label="%ปิดการขาย" value={funnelClose ? `${funnelClose.pct}%` : '—'} icon="target" tone={funnelClose ? (funnelClose.pct >= 15 ? 'var(--good)' : funnelClose.pct >= 8 ? 'var(--warn)' : 'var(--bad)') : undefined} sub={funnelClose ? `ปิด ${N(funnelClose.orders)}/${N(funnelClose.totalLeads)} คนทัก` : 'ยังไม่มีข้อมูลคนทัก'} />
              <MetricCard index={3} label="Basket Size" value={baht(k.aov)} sub="ยอดเฉลี่ย/ออเดอร์" />
              <MetricCard index={4} label="AVG ตัว/ออเดอร์" value={basketQty.toFixed(2)} sub={`${baht(k.ppu)}/ตัว`} />
            </div>
          </div>
        </>;
      })()}

      {/* ===== แท็บ ===== */}
      <div className="dashboard-spacer" />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
          <TabsTrigger value="variant">สี & ไซซ์</TabsTrigger>
          <TabsTrigger value="channel">ช่องทาง</TabsTrigger>
          <TabsTrigger value="customer">ลูกค้า</TabsTrigger>
          <TabsTrigger value="team">อันดับเซลล์</TabsTrigger>
          <TabsTrigger value="geo">พื้นที่</TabsTrigger>
          <TabsTrigger value="funnel">คนทัก & ปิดการขาย</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ===== S1 เทรนด์ ===== */}
      {tab === 'overview' && trend && (<>
        <Card className="p-[22px]">
          <CardHeader className="flex-row items-center justify-between space-y-0 p-0 pb-4" style={{ flexWrap: 'wrap' }}>
            <CardTitle className="m-0 text-base font-semibold">ยอดขายตามเวลา <span className="dim">(เลือกตัวชี้วัด · เทียบช่วงก่อน)</span></CardTitle>
            <div className="card-action row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Tabs value={trendMetric} onValueChange={setTrendMetric}><TabsList>{[['sales', 'ยอดขาย'], ['orders', 'ออเดอร์'], ['qty', 'ตัว'], ['profit', 'กำไร']].map(([id, lb]) => <TabsTrigger key={id} value={id}>{lb}</TabsTrigger>)}</TabsList></Tabs>
              <span style={{ width: 1, height: 18, background: 'var(--line)' }} />
              <span className="cap" style={{ color: 'var(--ink-4)' }}>มุมมอง</span>
              <Tabs value={granSel} onValueChange={setGranSel}><TabsList>{[['auto', 'อัตโนมัติ'], ['day', 'วัน'], ['week', 'สัปดาห์'], ['month', 'เดือน'], ['quarter', 'ไตรมาส']].map(([id, lb]) => <TabsTrigger key={id} value={id}>{lb}</TabsTrigger>)}</TabsList></Tabs>
              <span style={{ width: 1, height: 18, background: 'var(--line)' }} />
              <Toggle variant="outline" size="sm" pressed={trendSplit} onPressedChange={setTrendSplit} title="แบ่งแต่ละแท่งตามช่องทาง"><Icon name="grid" /> แยกช่องทาง</Toggle>
            </div>
          </CardHeader>
          {trendSplit
            ? <StackedBars labels={trendByChannel.labels} datasets={trendByChannel.datasets} fmt={metricFmt} height={250} />
            : <ComboChart labels={trend.labels} bars={trend.bars} line={trend.line} cmpBars={trend.cmpBars} barLabel={trendMetric === 'sales' ? 'ยอดขาย' : trendMetric} lineLabel="ออเดอร์" barFmt={metricFmt} lineFmt={N} cmpLabel={prevLabel} height={250} />}
          <div className="cap row" style={{ gap: 14, marginTop: 8, color: 'var(--ink-4)', justifyContent: 'center', flexWrap: 'wrap' }}>
            {trendSplit
              ? trendByChannel.datasets.map(d => <span key={d.label} className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: d.color }} /> {d.label}</span>)
              : <>
                <span className="row" style={{ gap: 5 }}><span style={{ width: 12, height: 8, borderRadius: 2, background: 'var(--accent-2)' }} /> {trendMetric === 'sales' ? 'ยอดขาย' : trendMetric === 'orders' ? 'ออเดอร์' : trendMetric === 'qty' ? 'ตัว' : 'กำไร'} (แท่ง)</span>
                <span className="row" style={{ gap: 5 }}><span style={{ width: 12, height: 2, background: 'var(--accent)' }} /> จำนวนออเดอร์ (เส้น)</span>
                {cmp && <span className="row" style={{ gap: 5 }}><span style={{ width: 12, height: 8, borderRadius: 2, background: 'var(--ink-3)', opacity: .35 }} /> {prevLabel}</span>}
              </>}
          </div>
        </Card>

        {/* ===== ภาพรวมสินค้า ===== */}
        <SectionHead title="เจาะลึกยอดขาย" sub="ลาย · สี" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, alignItems: 'start' }}>
          {/* ยอดขายแต่ละลาย */}
          <Card className="p-[22px]">
            <CardTitle className="m-0 text-base font-semibold mb-[14px]">ยอดขายแต่ละลาย <span className="dim">· Top 10</span></CardTitle>
            <HBars data={A.byDesign.slice(0, 10).map(d => ({ label: d.key, value: d.qty }))} unit="ตัว" height={310} />
          </Card>
          {/* ยอดขายแต่ละสี */}
          <Card className="p-[22px]">
            <CardTitle className="m-0 text-base font-semibold mb-[14px]">ยอดขายแต่ละสี <span className="dim">· Top 10</span></CardTitle>
            <HBars data={A.byColor.slice(0, 10).map(c => ({ label: c.key, value: c.qty, color: COLOR_HEX[c.key] || 'var(--accent-2)' }))} unit="ตัว" height={310} />
          </Card>
          {/* ลาย × สี ขายดี */}
          <Card className="p-[22px]">
            <CardTitle className="m-0 text-base font-semibold mb-[14px]">ลาย × สี ขายดี <span className="dim">· Top 10</span></CardTitle>
            {(() => {
              const m = {}; (A._skus || []).forEach(s => { if (!s.design) return; const k = `${s.design} · ${normColor(s.color)}`; m[k] = (m[k] || 0) + (Number(s.qty) || 0); });
              const top = Object.entries(m).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10);
              return <HBars data={top} unit="ตัว" height={310} />;
            })()}
          </Card>
        </div>

      </>)}

      {/* ===== ช่องทาง (matrix + ตาราง) ===== */}
      {tab === 'channel' && (
        <Card className="p-[22px]">
          <CardTitle className="m-0 text-base font-semibold mb-[12px]">ช่องทาง × {gran === 'day' ? 'วัน' : gran === 'week' ? 'สัปดาห์' : gran === 'month' ? 'เดือน' : 'ไตรมาส'} (ยอดขาย)</CardTitle>
          <ChannelHeatmap orders={orders} eff={eff} gran={gran} range={range} channels={A.byChannel.map(c => c.key)} />
          <div className="table-wrap" style={{ marginTop: 14 }}><Table>
            <TableHeader><TableRow><TableHead>ช่องทาง</TableHead><TableHead style={{ textAlign: 'right' }}>ยอดขาย</TableHead><TableHead style={{ textAlign: 'right' }}>ออเดอร์</TableHead><TableHead style={{ textAlign: 'right' }}>ตัว</TableHead><TableHead style={{ textAlign: 'right' }}>AOV</TableHead><TableHead style={{ textAlign: 'right' }}>%share</TableHead>{prevA && <TableHead style={{ textAlign: 'right' }}>%Δ</TableHead>}</TableRow></TableHeader>
            <TableBody>{A.byChannel.map(c => { const mv = prevA ? movers(A.byChannel, prevA.byChannel, 'sales').find(m => m.key === c.key) : null; return (
              <TableRow key={c.key} onClick={() => toggleFilter('channel', c.key)} style={{ cursor: 'pointer' }}>
                <TableCell><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: channelColor(c.key), marginRight: 7 }} />{c.key}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{baht(c.sales)}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right' }}>{N(c.orders)}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right' }}>{N(c.qty)}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right' }}>{baht(c.aov)}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right' }}>{Math.round(c.share * 100)}%</TableCell>
                {prevA && <TableCell className="num" style={{ textAlign: 'right', color: mv && mv.d >= 0 ? 'var(--good)' : 'var(--bad)' }}>{mv ? (mv.d >= 0 ? '+' : '') + Math.round(mv.d * 100) + '%' : '—'}</TableCell>}
              </TableRow>); })}</TableBody>
          </Table></div>
        </Card>
      )}

      {/* ===== S4 สี & ไซซ์ ===== */}
      {tab === 'variant' && (<>
        <div className="grid g2" style={{ alignItems: 'start' }}>
          <Card className="p-[22px]">
            <CardTitle className="m-0 text-base font-semibold mb-[12px]">ไซซ์ขายดี (เรียง XS → 8XL)</CardTitle>
            <HBars data={[...A.bySize].sort((a, b) => sizeRank(a.key) - sizeRank(b.key)).map(s => ({ label: s.key, value: s.qty }))} height={Math.max(160, A.bySize.length * 26)} unit="ตัว" />
          </Card>
          <Card className="p-[22px]">
            <CardTitle className="m-0 text-base font-semibold mb-[12px]">สียอดนิยม</CardTitle>
            <HBars data={A.byColor.slice(0, 10).map(c => ({ label: c.key, value: c.qty }))} height={Math.max(160, Math.min(10, A.byColor.length) * 26)} unit="ตัว" />
          </Card>
        </div>
        <Card className="p-[22px]">
          <CardTitle className="m-0 text-base font-semibold mb-[6px]">เมทริกซ์ สี × ไซซ์ (จำนวนตัว)</CardTitle>
          <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 12 }}>ใช้วางแผนผลิต/สต็อก — ช่องเข้ม = ขายดี{f.design.length === 1 ? ` · เฉพาะลาย ${f.design[0]}` : ''}</div>
          <VariantMatrix skus={A._skus} />
        </Card>
      </>)}

      {/* ===== S6 ลูกค้า ===== */}
      {tab === 'customer' && (<>
        <div className="grid g2" style={{ alignItems: 'start' }}>
          <Card className="p-[22px]">
            <CardTitle className="m-0 text-base font-semibold mb-[12px]">ลูกค้าใหม่ vs เก่า ตามเวลา</CardTitle>
            {(() => { const bk = enumerateBuckets(range.from, range.to, gran); const nw = {}, od = {}; A._ords.forEach(o => { const b = bucketKey(o.order_date, gran); if (o.customer_type === 'ลูกค้าใหม่') nw[b] = (nw[b] || 0) + 1; else if (o.customer_type === 'ลูกค้าเก่า') od[b] = (od[b] || 0) + 1; }); return <StackedBars labels={bk.map(b => bucketLabel(b, gran).replace(/ \(.*/, ''))} datasets={[{ label: 'ลูกค้าใหม่', data: bk.map(b => nw[b] || 0), color: 'var(--info)' }, { label: 'ลูกค้าเก่า', data: bk.map(b => od[b] || 0), color: 'var(--good)' }]} fmt={N} height={210} />; })()}
            <div className="cap row" style={{ gap: 14, marginTop: 8, justifyContent: 'center', color: 'var(--ink-4)' }}><span className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: 'var(--info)' }} /> ใหม่ {N(k.newC)}</span><span className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: 'var(--good)' }} /> เก่า {N(k.oldC)}</span></div>
          </Card>
          <Card className="p-[22px]">
            <CardTitle className="m-0 text-base font-semibold mb-[12px]">กระจายตามขนาดออเดอร์</CardTitle>
            <HBars data={[...A.byQtyBand].sort((a, b) => b.orders - a.orders).map(q => ({ label: q.key, value: q.orders }))} height={170} unit="ออเดอร์" color="#7c5cff" />
            <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 8 }}>ก้อนใหญ่ (≥11 ตัว) {N(k.big)} ออเดอร์ · {Math.round(k.bigPct * 100)}% (ประมาณว่าเป็นขายส่ง/OEM)</div>
          </Card>
        </div>
        {(() => {
          const custs = customerAgg(A._ords); const { rows, summary } = rfmTiers(custs, range.to);
          const flagTone = (fl) => fl === 'เสี่ยงหลุด' ? 'var(--bad)' : fl === 'ใหม่' ? 'var(--accent)' : fl === 'ขาประจำ' ? 'var(--good)' : 'var(--ink-4)';
          const TIER_CHIP = { 'เพชร': 'tier-chip-diamond', 'ทอง': 'tier-chip-gold', 'เงิน': 'tier-chip-silver', 'ทองแดง': 'tier-chip-bronze' };
          const shown = (custTier === 'all' ? rows : rows.filter(r => r.tier === custTier)).slice(0, 40);
          return (<>
            <Card className="p-[22px]">
              <CardHeader className="flex-row items-center justify-between space-y-0 p-0" style={{ flexWrap: 'wrap', gap: 8 }}>
                <CardTitle className="m-0 text-base font-semibold">จัดระดับลูกค้าอัตโนมัติ (RFM)</CardTitle>
                <CardDescription>{N(custs.length)} ลูกค้าที่มีรหัส · ต้องผ่านทั้ง 3 มิติ: ยอดซื้อ + ความถี่ + ความสดใหม่</CardDescription>
              </CardHeader>
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
            </Card>
            <Card className="p-[22px]">
              <CardHeader className="flex-row items-center justify-between space-y-0 p-0 pb-4" style={{ flexWrap: 'wrap', gap: 8 }}>
                <CardTitle className="m-0 text-base font-semibold">รายชื่อลูกค้า{custTier !== 'all' ? ` · ระดับ${custTier}` : ''}</CardTitle>
                <div className="card-action"><Tabs value={custTier} onValueChange={setCustTier}><TabsList>{['all', 'เพชร', 'ทอง', 'เงิน', 'ทองแดง'].map(t => <TabsTrigger key={t} value={t}>{t === 'all' ? 'ทั้งหมด' : t}</TabsTrigger>)}</TabsList></Tabs></div>
              </CardHeader>
              {shown.length ? <div className="table-wrap" style={{ maxHeight: 460, overflow: 'auto' }}><Table>
                <TableHeader><TableRow><TableHead>ลูกค้า</TableHead><TableHead>ระดับ</TableHead><TableHead style={{ textAlign: 'right' }}>ยอดซื้อ</TableHead><TableHead style={{ textAlign: 'right' }}>ครั้ง</TableHead><TableHead style={{ textAlign: 'right' }}>เฉลี่ย/ครั้ง</TableHead><TableHead style={{ textAlign: 'right' }}>ช่อง</TableHead><TableHead style={{ textAlign: 'right' }}>ซื้อล่าสุด</TableHead><TableHead>สถานะ</TableHead></TableRow></TableHeader>
                <TableBody>{shown.map((c, i) => (
                  <TableRow key={c.code} onClick={() => setCustDetail(c)} className="cursor-pointer">
                    <TableCell><span className="num" style={{ color: 'var(--ink-4)', marginRight: 8 }}>{i + 1}</span>{c.name}</TableCell>
                    <TableCell><span className={`tier-chip ${TIER_CHIP[c.tier] || ''}`}>{c.tier}</span></TableCell>
                    <TableCell className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{baht(c.sales)}</TableCell>
                    <TableCell className="num" style={{ textAlign: 'right' }}>{N(c.orders)}</TableCell>
                    <TableCell className="num" style={{ textAlign: 'right', color: 'var(--ink-3)' }}>{baht(c.aov)}</TableCell>
                    <TableCell className="num" style={{ textAlign: 'right', color: 'var(--ink-3)' }}>{N(c.channels)}</TableCell>
                    <TableCell className="num cap" style={{ textAlign: 'right', color: 'var(--ink-3)' }}>{c.last}{c.recency != null ? ` (${c.recency}ว.)` : ''}</TableCell>
                    <TableCell><span className="row" style={{ gap: 6, justifyContent: 'space-between' }}>{c.flag ? <Badge variant="outline" style={{ fontSize: 10, color: flagTone(c.flag) }}>{c.flag}</Badge> : <span />}<Icon name="arrowR" /></span></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table></div> : <div className="cap" style={{ color: 'var(--ink-4)', padding: 12 }}>ไม่มีลูกค้าในระดับนี้</div>}
              <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 8 }}>แสดง {N(shown.length)} จาก {N(custTier === 'all' ? rows.length : rows.filter(r => r.tier === custTier).length)} คน · เฉพาะออเดอร์ที่มีรหัสลูกค้า (~70%)</div>
            </Card>
          </>);
        })()}
      </>)}

      {/* ===== S7 พื้นที่ (drill จังหวัด→ลาย→สี + pivot + มุมมองประเทศ) ===== */}
      {tab === 'geo' && (
        <GeoPanel ords={A._ords} skus={A._skus} metric={geoMetric} setMetric={setGeoMetric} region={geoRegion} setRegion={setGeoRegion} selected={f.province} onFilter={toggleFilter} A={A} prevA={prevA} cmp={cmp} prevLabel={prevLabel} designSel={f.design} />
      )}

      {/* ===== D2 อันดับเซลล์ (ลีดเดอร์บอร์ด) ===== */}
      {tab === 'team' && (
        <SalesLeaderboard ords={A._ords} items={A.bySalesperson} prevItems={prevA?.bySalesperson} cmp={cmp} onFilter={toggleFilter} range={range} prevLabel={prevLabel} />
      )}

      {/* ===== S?: คนทัก & ปิดการขาย (funnel) ===== */}
      {tab === 'funnel' && (() => {
        const inR = (d) => (!range.from || d >= range.from) && (!range.to || d <= range.to);
        const fr = funnel.filter(r => inR(r.date) && (!f.salesperson.length || f.salesperson.includes(r.salesperson)));
        if (funnel.length === 0) return <Card className="p-9 text-center" style={{ color: 'var(--ink-4)' }}>ยังไม่มีข้อมูลคนทัก — ให้เซลล์กรอก "คนทักวันนี้" ที่หน้า <b>บันทึกขาย</b> ก่อน (ต้องรัน migration <code>tmk_sales_funnel</code> ด้วย)</Card>;
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
          <Card className="p-[22px]">
            <CardTitle className="m-0 text-base font-semibold mb-[12px]">คนทัก vs ปิดการขาย ตามเวลา <span className="dim">(แท่ง=คนทัก · เส้น=ออเดอร์)</span></CardTitle>
            <ComboChart labels={labels} bars={bars} line={line} barLabel="คนทัก" lineLabel="ออเดอร์" barFmt={N} lineFmt={N} height={240} />
          </Card>
          <div className="grid g2" style={{ alignItems: 'start' }}>
            <Card className="p-[22px]">
              <CardTitle className="m-0 text-base font-semibold mb-[12px]">ช่องทางคนทัก</CardTitle>
              <div style={{ maxWidth: 220, margin: '0 auto' }}><DonutChart data={[{ label: 'FB ใหม่', value: fbN, color: 'var(--ch-facebook)' }, { label: 'FB เก่า', value: fbO, color: 'color-mix(in srgb, var(--ch-facebook) 55%, var(--surface))' }, { label: 'LINE ใหม่', value: lnN, color: 'var(--ch-line)' }, { label: 'LINE เก่า', value: lnO, color: 'color-mix(in srgb, var(--ch-line) 55%, var(--surface))' }]} height={180} /></div>
            </Card>
            <Card className="p-[22px]">
              <CardTitle className="m-0 text-base font-semibold mb-[12px]">ปิดการขายต่อเซลล์</CardTitle>
              <div className="table-wrap"><Table>
                <TableHeader><TableRow><TableHead>เซลล์</TableHead><TableHead style={{ textAlign: 'right' }}>คนทัก</TableHead><TableHead style={{ textAlign: 'right' }}>ใหม่</TableHead><TableHead style={{ textAlign: 'right' }}>ปิดได้</TableHead><TableHead style={{ textAlign: 'right' }}>%ปิด</TableHead></TableRow></TableHeader>
                <TableBody>{spRows.map(r => <TableRow key={r.sp}><TableCell>{r.sp}</TableCell><TableCell className="num" style={{ textAlign: 'right' }}>{N(r.leads)}</TableCell><TableCell className="num" style={{ textAlign: 'right', color: 'var(--accent)' }}>{N(r.newL)}</TableCell><TableCell className="num" style={{ textAlign: 'right' }}>{N(r.orders)}</TableCell><TableCell className="num" style={{ textAlign: 'right', fontWeight: 700, color: r.close >= 15 ? 'var(--good)' : r.close >= 8 ? 'var(--warn)' : 'var(--bad)' }}>{r.close}%</TableCell></TableRow>)}</TableBody>
              </Table></div>
            </Card>
          </div>
        </>);
      })()}

      {drill && <DrillModal drill={drill} orders={orders} skus={skus} eff={eff} onClose={() => setDrill(null)} />}
      {custDetail && A && <CustomerDrawer cust={custDetail} ords={A._ords} skus={A._skus} onClose={() => setCustDetail(null)} />}
      {importOpen && <MpImportModal onClose={() => setImportOpen(false)} onDone={() => { clearSaleCache(); setReloadKey(k => k + 1); }} />}
    </div>
  );
}

// ---------- ช่องทาง ranked bars (+%share +Δ ทำหน้าที่ legend ในตัว) ----------

// ---------- leaderboard ลาย ----------
function DesignLeaderboard({ items, metric, onClick }) {
  const max = Math.max(1, ...items.map(d => d[metric]));
  return <div style={{ display: 'grid', gap: 5 }}>{items.map((d, i) => (
    <div key={d.key} onClick={() => onClick?.(d.key)} className="row" style={{ gap: 10, cursor: 'pointer', padding: '3px 0' }}>
      <span className="num" style={{ width: 20, textAlign: 'center', color: 'var(--ink-4)', fontWeight: 700 }}>{i + 1}</span>
      <span style={{ flex: '0 0 110px', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.key}</span>
      <div style={{ flex: 1, height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${d[metric] / max * 100}%`, height: '100%', background: 'var(--accent-2)', borderRadius: 4 }} /></div>
      <span className="num cap" style={{ flex: '0 0 auto', minWidth: 70, textAlign: 'right', color: 'var(--ink)' }}>{metric === 'sales' ? baht(d.sales) : N(d.qty) + ' ตัว'}</span>
    </div>
  ))}</div>;
}

// ---------- movers card ----------
function MoversCard({ title, icon, tone, data }) {
  return <Card className="p-[22px]">
    <CardTitle className="m-0 text-base font-semibold flex items-center gap-1.5 mb-[10px]"><span style={{ color: tone }}><Icon name={icon} /></span>{title}</CardTitle>
    {data.length === 0 ? <div className="cap" style={{ color: 'var(--ink-4)' }}>—</div> : <div style={{ display: 'grid', gap: 7 }}>{data.map(m => (
      <div key={m.key} className="row between"><span style={{ fontSize: 13 }}>{m.key}</span><span className="cap" style={{ fontWeight: 700, color: tone }}>{m.d >= 0 ? '+' : ''}{Math.round(m.d * 100)}% <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>({N(m.cur)})</span></span></div>
    ))}</div>}
  </Card>;
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

// ---------- แผงพื้นที่ (แผนที่ + drill จังหวัด→ลาย→สี + pivot + มุมมองประเทศ) ----------
function GeoPanel({ ords, skus, metric, setMetric, region, setRegion, selected, onFilter, A, prevA, cmp, prevLabel, designSel }) {
  const [hover, setHover] = useState(null);
  const [selProv, setSelProv] = useState(null);
  const bd = useMemo(() => geoBreakdown(ords, skus), [ords, skus]);
  const provByKey = useMemo(() => new Map(bd.provinces.map(p => [p.key, p])), [bd]);
  const rg = useMemo(() => regionBreakdown(bd), [bd]);

  const mv = (n) => metric === 'orders' ? n.orders : metric === 'qty' ? n.qty : n.sales;
  const fmtV = (v) => metric === 'sales' ? baht(v) : N(v) + (metric === 'orders' ? ' ออเดอร์' : ' ตัว');

  // จัดข้อมูลแผนที่/รายการจาก breakdown (คงพิกัด PROVINCES)
  let rows = PROVINCES.map(p => { const b = provByKey.get(p.th); return { ...p, sales: b ? b.sales : 0, orders: b ? b.orders : 0, qty: b ? b.qty : 0 }; });
  if (region !== 'all') rows = rows.filter(p => p.region === region);
  const valOf = (p) => metric === 'orders' ? p.orders : metric === 'qty' ? p.qty : p.sales;
  const sorted = rows.filter(p => valOf(p) > 0).sort((a, b) => valOf(b) - valOf(a));
  const total = sorted.reduce((a, p) => a + valOf(p), 0);
  const vals = sorted.map(valOf).sort((a, b) => a - b);
  const q = (pp) => vals.length ? vals[Math.floor((vals.length - 1) * pp)] : 0;
  const thr = [q(0.2), q(0.4), q(0.6), q(0.8)];
  const hv = hover ? rows.find(p => p.th === hover) : null;
  const grand = bd.total.sales || 0;
  const pct = (s) => grand ? Math.round(s / grand * 100) : 0;

  // scope: จังหวัด > ภาค > ประเทศ (ลายขายดี/สีขายดี ปรับตาม)
  const flattenColors = (designs) => {
    const m = new Map();
    (designs || []).forEach(d => d.colors.forEach(c => { const e = m.get(c.key) || { key: c.key, orders: 0, qty: 0, sales: 0 }; e.orders += c.orders; e.qty += c.qty; e.sales += c.sales; m.set(c.key, e); }));
    return [...m.values()];
  };
  const scope = selProv ? { kind: 'province', label: selProv, node: provByKey.get(selProv) }
    : region !== 'all' ? { kind: 'region', label: REGIONS[region], node: rg.regions.find(r => r.code === region) }
    : { kind: 'country', label: 'ทั้งประเทศ', node: null };
  const scopeDesigns = scope.kind === 'country' ? A.byDesign.filter(d => d.key !== 'ไม่ระบุลาย') : (scope.node?.designs ?? []);
  const scopeColors = scope.kind === 'country' ? A.byColor
    : scope.kind === 'region' ? (scope.node?.colors ?? [])
    : flattenColors(scope.node?.designs);
  const dTop = [...scopeDesigns].sort((a, b) => mv(b) - mv(a)).slice(0, 8);
  const cTop = [...scopeColors].sort((a, b) => mv(b) - mv(a)).slice(0, 8);
  const scopeSales = scope.kind === 'country' ? grand : (scope.node?.sales ?? 0);
  const scopeOrders = scope.kind === 'country' ? (A.kpi?.orders ?? 0) : (scope.node?.orders ?? 0);
  const scopeQty = scope.kind === 'country' ? (A.kpi?.qty ?? 0) : (scope.node?.qty ?? 0);
  const BarRow = ({ label, value, max, onClick }) => (
    <div onClick={onClick} className="row" style={{ gap: 10, alignItems: 'center', cursor: onClick ? 'pointer' : 'default', padding: '2px 0' }}>
      <span style={{ flex: '0 0 92px', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${max ? value / max * 100 : 0}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} /></div>
      <span className="num cap" style={{ flex: '0 0 auto', minWidth: 78, textAlign: 'right', color: 'var(--ink)' }}>{fmtV(value)}</span>
    </div>
  );

  return (
    <>
      {/* ===== Card บน: แผนที่ + รายการจังหวัด ===== */}
      <Card className="p-[22px]">
        <CardHeader className="flex-row items-start justify-between space-y-0 p-0 pb-4" style={{ flexWrap: 'wrap', gap: 14 }}>
          <div>
            <CardTitle className="m-0 text-base font-semibold mb-[6px]">กระจายตามจังหวัด <span className="dim">· แตะจังหวัดเพื่อดูลาย→สี</span></CardTitle>
            <div className="num" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.5px' }}>{N(sorted.length)}</div>
            <div className="cap" style={{ color: 'var(--ink-4)' }}>จังหวัดที่มียอด · {fmtV(total)} รวม</div>
          </div>
          <Tabs value={metric} onValueChange={setMetric}><TabsList>{[['sales', 'ยอดขาย'], ['orders', 'ออเดอร์'], ['qty', 'ตัว']].map(([id, lb]) => <TabsTrigger key={id} value={id}>{lb}</TabsTrigger>)}</TabsList></Tabs>
        </CardHeader>
        <ToggleGroup type="single" variant="pill" size="sm" value={region} onValueChange={(v) => v && setRegion(v)} className="mb-[14px]">
          <ToggleGroupItem value="all">ทั้งประเทศ</ToggleGroupItem>
          {Object.entries(REGIONS).map(([id, lb]) => <ToggleGroupItem key={id} value={id}>{lb}</ToggleGroupItem>)}
        </ToggleGroup>
        <div className="grid" style={{ gridTemplateColumns: 'minmax(240px, 1fr) 1.1fr', gap: 20, alignItems: 'start' }}>
          <div>
            <div style={{ position: 'relative' }}>
              <ThailandMap rows={rows} valOf={valOf} thr={thr} sel={selProv} hover={hover} onHover={setHover} onClick={(th) => setSelProv(th)} fmt={fmtV} />
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
              {sorted.slice(0, 20).map((p, i) => { const v = valOf(p); const on = selProv === p.th || hover === p.th; return (
                <div key={p.th} onClick={() => setSelProv(p.th)} onMouseEnter={() => setHover(p.th)} onMouseLeave={() => setHover(null)} className="row" style={{ gap: 10, cursor: 'pointer', alignItems: 'center', padding: '3px 5px', borderRadius: 6, background: on ? 'var(--surface-2, rgba(76,125,255,.1))' : 'transparent' }}>
                  <span className="num" style={{ width: 18, textAlign: 'center', color: 'var(--ink-4)', fontWeight: 700, fontSize: 12 }}>{i + 1}</span>
                  <span style={{ flex: '0 0 96px', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.th}</span>
                  <div style={{ flex: 1, height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${v / (valOf(sorted[0]) || 1) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} /></div>
                  <span className="num cap" style={{ flex: '0 0 auto', minWidth: 78, textAlign: 'right', color: 'var(--ink)' }}>{fmtV(v)}</span>
                  <span className="cap num" style={{ flex: '0 0 34px', textAlign: 'right', color: 'var(--ink-4)' }}>{Math.round(v / total * 100)}%</span>
                </div>
              ); })}
            </div>
            <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--line)' }}>{sorted.length > 20 ? `อีก ${N(sorted.length - 20)} จังหวัด = ${fmtV(sorted.slice(20).reduce((a, p) => a + valOf(p), 0))} · ` : ''}แตะหมุด/แถวเพื่อเจาะลึก{bd.noProvinceSales > 0 ? ` · POS/ไม่ระบุ ${baht(bd.noProvinceSales)} แยกออก` : ''}</div>
          </div>
        </div>
      </Card>

      {/* ===== Card 2: ขายดีในพื้นที่นี้ (ลาย/สี) + ตารางรวมทุกภาค ===== */}
      <Card className="p-[22px]">
        {/* แถบหัว: breadcrumb + ปุ่มย้อน + กรอง/ส่งออก */}
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            {scope.kind !== 'country' && (
              <button onClick={() => { if (scope.kind === 'province') setSelProv(null); else setRegion('all'); }} className="cap row" style={{ gap: 4, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 4 }}>
                <Icon name="arrowR" className="rotate-180" /> {scope.kind === 'province' ? (region !== 'all' ? `ดูทั้ง${REGIONS[region]}` : 'ดูทั้งประเทศ') : 'ดูทั้งประเทศ'}
              </button>
            )}
            <CardTitle className="m-0 text-base font-semibold cap-head" style={{ gap: 8 }}><Icon name={scope.kind === 'country' ? 'globe' : 'route'} /> ขายดี · {scope.label}</CardTitle>
            <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 4 }}>{N(scopeOrders)} ออเดอร์ · {N(scopeQty)} ตัว · {baht(scopeSales)}{scope.kind !== 'country' ? ` · ${pct(scopeSales)}% ของยอดรวม` : ''} · {N(scopeDesigns.length)} ลาย</div>
          </div>
          {scope.kind === 'province' && (
            <div className="row" style={{ gap: 8 }}>
              <Button variant={selected.includes(scope.label) ? 'default' : 'outline'} size="sm" className="h-8" onClick={() => onFilter('province', scope.label)}>{selected.includes(scope.label) ? '✓ กรองอยู่' : 'กรองทั้งหน้า'}</Button>
              <ExportBtn filename={`${scope.label}-ลายสี`} rows={(scope.node?.designs ?? []).flatMap(d => d.colors.map(c => ({ design: d.key, color: c.key, orders: c.orders, qty: c.qty, sales: c.sales })))} columns={[{ label: 'ลาย', key: 'design' }, { label: 'สี', key: 'color' }, { label: 'ออเดอร์', key: 'orders' }, { label: 'จำนวนตัว', key: 'qty' }, { label: 'ยอดขาย', key: 'sales' }]} />
            </div>
          )}
        </div>

        {/* ส่วน A — ลายขายดี / สีขายดี (ปรับตาม scope) */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 22 }}>
          <div>
            <div className="cap" style={{ color: 'var(--ink-3)', fontWeight: 600, marginBottom: 8 }}>ลายขายดี</div>
            <div style={{ display: 'grid', gap: 4 }}>
              {dTop.length ? dTop.map(d => <BarRow key={d.key} label={d.key} value={mv(d)} max={mv(dTop[0])} onClick={() => onFilter('design', d.key)} />)
                : <div className="cap" style={{ color: 'var(--ink-4)' }}>— ไม่มีข้อมูลลาย</div>}
            </div>
          </div>
          <div>
            <div className="cap" style={{ color: 'var(--ink-3)', fontWeight: 600, marginBottom: 8 }}>สีขายดี</div>
            <div style={{ display: 'grid', gap: 4 }}>
              {cTop.length ? cTop.map(c => <BarRow key={c.key} label={c.key} value={mv(c)} max={mv(cTop[0])} onClick={() => onFilter('color', c.key)} />)
                : <div className="cap" style={{ color: 'var(--ink-4)' }}>— ไม่มีข้อมูลสี</div>}
            </div>
          </div>
        </div>

        {/* ส่วน A2 — จังหวัด: drill ลาย→สี ลึกสุด */}
        {scope.kind === 'province' && (scope.node?.designs?.length ?? 0) > 0 && (
          <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflow: 'auto', paddingRight: 4, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            {scope.node.designs.map(d => (
              <Collapsible key={d.key} className="rounded-md border" style={{ borderColor: 'var(--line)' }}>
                <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--surface-2)] rounded-md">
                  <Icon name="chevD" className="-rotate-90 transition-transform group-data-[state=open]:rotate-0" />
                  <span style={{ flex: 1, fontWeight: 600, fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.key} <span className="dim" style={{ fontWeight: 400 }}>· {N(d.colors.length)} สี</span></span>
                  <span className="num cap" style={{ flex: '0 0 auto', minWidth: 56, textAlign: 'right', color: 'var(--ink-3)' }}>{N(d.qty)} ตัว</span>
                  <span className="num cap" style={{ flex: '0 0 auto', minWidth: 84, textAlign: 'right', fontWeight: 600 }}>{baht(d.sales)}</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div style={{ padding: '2px 12px 8px 32px', display: 'grid', gap: 5 }}>
                    {d.colors.map(c => { const cv = mv(c); const top = mv(d.colors[0]) || 1; return (
                      <div key={c.key} className="row" style={{ gap: 10, alignItems: 'center', fontSize: 12 }}>
                        <span style={{ flex: '0 0 90px', color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.key}</span>
                        <div style={{ flex: 1, height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${cv / top * 100}%`, height: '100%', background: 'var(--accent)', opacity: .8, borderRadius: 3 }} /></div>
                        <span className="num cap" style={{ flex: '0 0 auto', minWidth: 48, textAlign: 'right', color: 'var(--ink-4)' }}>{N(c.qty)} ตัว</span>
                        <span className="num cap" style={{ flex: '0 0 auto', minWidth: 78, textAlign: 'right' }}>{baht(c.sales)}</span>
                      </div>
                    ); })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        )}

        {/* ส่วน B — ตารางรวมทุกภาค (คลิกแถวเพื่อดูรายภาค) */}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <div className="cap" style={{ color: 'var(--ink-3)', fontWeight: 600, marginBottom: 8 }}>ทุกภาค <span className="dim" style={{ fontWeight: 400 }}>· แตะแถวเพื่อดูลาย/สีขายดีของภาค</span></div>
          <SortableTable initial={{ key: 'sales', dir: 'desc' }}
            columns={[
              { key: 'key', label: 'ภาค', accessor: r => r.key },
              { key: 'design', label: 'ลายเด่น', accessor: r => r.topDesign?.key || '' },
              { key: 'color', label: 'สีเด่น', accessor: r => r.topColor?.key || '' },
              { key: 'sales', label: 'ยอดขาย', align: 'right', accessor: r => r.sales },
              { key: 'qty', label: 'ตัว', align: 'right', accessor: r => r.qty },
              { key: 'share', label: '%', align: 'right', style: { minWidth: 56 }, accessor: r => r.sales },
            ]}
            rows={rg.regions}
            renderRow={r => { const on = region === r.code; return (
              <TableRow key={r.code} onClick={() => { setSelProv(null); setRegion(on ? 'all' : r.code); }} style={{ cursor: 'pointer', background: on ? 'var(--accent-soft)' : undefined }}>
                <TableCell style={{ fontWeight: 600 }}>{r.key}</TableCell>
                <TableCell style={{ fontSize: 12.5 }}>{r.topDesign?.key || '—'}</TableCell>
                <TableCell style={{ fontSize: 12.5 }}>{r.topColor?.key || '—'}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{baht(r.sales)}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right' }}>{N(r.qty)}</TableCell>
                <TableCell className="num cap" style={{ textAlign: 'right' }}>{pct(r.sales)}%</TableCell>
              </TableRow>
            ); }} />
          {!rg.regions.length && <div className="cap" style={{ color: 'var(--ink-4)', padding: 12, textAlign: 'center' }}>ไม่มีข้อมูลภาคในช่วงนี้</div>}
          {bd.noProvinceSales > 0 && <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 8 }}>ไม่ระบุจังหวัด (POS/มาร์เก็ตเพลส) · {baht(bd.noProvinceSales)} — แยกออกจากภาค</div>}
        </div>
      </Card>
    </>
  );
}

// ---------- ทีมขาย leaderboard ----------
const SALES_AUTO = (k) => /อัตโนมัติ|มาร์เก็ตเพลส|tiktok|\(.*\)/i.test(k);
const initial = (k) => { const s = String(k || '').replace(/[()]/g, '').trim(); return s ? s[0].toUpperCase() : '?'; };
// ปุ่มส่งออก CSV (ดาวน์โหลดไฟล์ฝั่งเบราว์เซอร์ — ไม่เขียนกลับ Sheet/DB)
function ExportBtn({ filename, rows, columns }) {
  return (
    <Button variant="outline" size="sm" className="h-8 gap-1.5 font-normal" disabled={!rows || !rows.length}
      onClick={() => downloadCsv(filename, rows, columns)} title="ส่งออกตามตัวกรองปัจจุบัน">
      <Icon name="external" /> CSV
    </Button>
  );
}

// ===== D2 — ลีดเดอร์บอร์ดเซลล์ (podium + คอลัมน์ครบ + run-rate) =====
function SalesLeaderboard({ ords, items, prevItems, cmp, onFilter, range, prevLabel }) {
  const [humanOnly, setHumanOnly] = useState(true);
  // เป้า/คอมต่อเซลล์ (PART 12/T3) — โชว์เฉพาะช่วงที่เป็น "เดือนปฏิทินเดียว" (เป้าตั้งรายเดือน)
  const monthOfRange = (range.from && range.to && range.from.slice(0, 7) === range.to.slice(0, 7)) ? range.from.slice(0, 7) : null;
  const [targets, setTargets] = useState({});
  useEffect(() => {
    let alive = true;
    if (!monthOfRange) { setTargets({}); return; }
    fetchTargets(monthOfRange).then(rows => {
      if (!alive) return;
      const m = {}; (rows || []).forEach(t => { m[t.salesperson] = t; }); setTargets(m);
    });
    return () => { alive = false; };
  }, [monthOfRange]);
  const anyTargets = Object.keys(targets).length > 0;
  // เสริมข้อมูลรายเซลล์จากออเดอร์: ลูกค้าใหม่ + ค่าคอม + จำนวนตัว
  const enrich = useMemo(() => {
    const m = {};
    (ords || []).forEach(o => {
      const g = m[o.salesperson] || (m[o.salesperson] = { newC: 0, comm: 0, qty: 0 });
      if (o.customer_type === 'ลูกค้าใหม่') g.newC += 1;
      g.comm += Number(o.mkt_commission) || 0;
      g.qty += Number(o.qty) || 0;
    });
    return m;
  }, [ords]);
  const pm = prevItems ? new Map(prevItems.map(x => [x.key, x.sales])) : null;
  let rows = [...(items || [])].map(s => ({ ...s, ...(enrich[s.key] || { newC: 0, comm: 0, qty: 0 }), auto: SALES_AUTO(s.key) })).sort((a, b) => b.sales - a.sales);
  if (humanOnly) rows = rows.filter(s => !s.auto);
  const total = rows.reduce((a, s) => a + s.sales, 0);
  const hasComm = rows.some(s => s.comm > 0);
  // run-rate: คาดการณ์สิ้นช่วงจากจำนวนวันที่ผ่านไป
  const today = new Date().toISOString().slice(0, 10);
  const dayspan = (a, b) => Math.max(1, Math.round((new Date(b) - new Date(a)) / 86400000) + 1);
  const totalDays = (range.from && range.to) ? dayspan(range.from, range.to) : 1;
  const elapsedDays = range.from ? dayspan(range.from, (range.to && today < range.to) ? today : range.to) : 1;
  const periodPct = Math.min(100, Math.round(elapsedDays / totalDays * 100));
  const medal = ['#e3b341', '#b8c0cc', '#cd8b5e'];
  const top3 = rows.slice(0, 3);
  return (
    <Card className="p-[22px]">
      <CardHeader className="flex-row items-center justify-between space-y-0 p-0 pb-3" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <CardTitle className="m-0 text-base font-semibold">อันดับเซลล์ <span className="dim">(ลีดเดอร์บอร์ด)</span></CardTitle>
          <CardDescription>{humanOnly ? `เฉพาะเซลล์คน ${N(rows.length)} คน · ${baht(total)}` : `ทุกช่องทาง ${N(rows.length)} · รวมมาร์เก็ตเพลส (อัตโนมัติ)`}</CardDescription>
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <ExportBtn filename={`อันดับเซลล์_${range.from || ''}_${range.to || ''}`} rows={rows} columns={[
            { label: 'อันดับ', map: (s) => rows.indexOf(s) + 1 },
            { label: 'เซลล์', map: (s) => s.auto ? s.key.replace(/[()]/g, '') : s.key },
            { label: 'ยอดขาย', key: 'sales' },
            { label: 'ออเดอร์', key: 'orders' },
            { label: 'จำนวนตัว', key: 'qty' },
            { label: 'AOV', map: (s) => Math.round(s.aov) },
            { label: 'ลูกค้าใหม่', key: 'newC' },
            { label: 'ค่าคอม', key: 'comm' },
            ...(anyTargets ? [
              { label: 'เป้า', map: (s) => Math.round(targets[s.key]?.sales_target || 0) },
              { label: '% เป้า', map: (s) => (targets[s.key]?.sales_target > 0 ? Math.round(s.sales / targets[s.key].sales_target * 100) : '') },
              { label: 'คอมคำนวณ', map: (s) => Math.round(commissionFor(s.sales, targets[s.key])) },
            ] : []),
          ]} />
          <Toggle variant="outline" size="sm" pressed={humanOnly} onPressedChange={setHumanOnly} title="ซ่อนยอดมาร์เก็ตเพลสอัตโนมัติ"><Icon name="users" /> เฉพาะเซลล์คน</Toggle>
        </div>
      </CardHeader>
      {/* โพเดียม Top 3 */}
      {top3.length >= 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, top3.length)}, 1fr)`, gap: 12, marginBottom: 16 }}>
          {top3.map((s, i) => {
            const name = s.auto ? s.key.replace(/[()]/g, '') : s.key;
            return (
              <div key={s.key} onClick={() => onFilter('salesperson', s.key)} style={{ cursor: 'pointer', padding: 14, borderRadius: 'var(--r-md)', border: `1px solid ${i === 0 ? medal[0] : 'var(--line)'}`, background: i === 0 ? `color-mix(in srgb, ${medal[0]} 8%, var(--surface))` : 'var(--surface)' }}>
                <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: s.auto ? 'var(--surface-2)' : 'var(--accent)', color: s.auto ? 'var(--ink-3)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>{s.auto ? <Icon name="refresh" /> : initial(name)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 5, alignItems: 'center' }}><span style={{ fontWeight: 800, fontSize: 13, color: medal[i] }}>#{i + 1}</span><Icon name="flame" size={14} style={{ color: medal[i] }} /></div>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                  </div>
                </div>
                <div className="num" style={{ fontWeight: 800, fontSize: 19, letterSpacing: '-.5px' }}>{baht(s.sales)}</div>
                <div className="cap" style={{ color: 'var(--ink-3)', marginTop: 2 }}>{N(s.orders)} ออเดอร์ · {baht(s.aov)}/ออเดอร์ · ใหม่ {N(s.newC)}</div>
              </div>
            );
          })}
        </div>
      )}
      {/* ตารางเต็ม */}
      <div className="table-wrap"><Table>
        <TableHeader><TableRow>
          <TableHead style={{ width: 32 }}>#</TableHead>
          <TableHead>เซลล์</TableHead>
          <TableHead style={{ textAlign: 'right' }}>ยอดขาย</TableHead>
          <TableHead style={{ textAlign: 'right' }}>ออเดอร์</TableHead>
          <TableHead style={{ textAlign: 'right' }}>ตัว</TableHead>
          <TableHead style={{ textAlign: 'right' }}>AOV</TableHead>
          <TableHead style={{ textAlign: 'right' }}>ลูกค้าใหม่</TableHead>
          {hasComm && <TableHead style={{ textAlign: 'right' }}>ค่าคอม</TableHead>}
          {anyTargets && <TableHead style={{ textAlign: 'right' }}>เป้า</TableHead>}
          {anyTargets && <TableHead style={{ minWidth: 120 }}>% เป้า</TableHead>}
          {anyTargets && <TableHead style={{ textAlign: 'right' }}>คอมคำนวณ</TableHead>}
          <TableHead style={{ minWidth: 130 }}>คาดสิ้นช่วง</TableHead>
          {cmp && <TableHead style={{ textAlign: 'right' }}>%Δ</TableHead>}
        </TableRow></TableHeader>
        <TableBody>{rows.map((s, i) => {
          const d = cmp && pm && pm.get(s.key) > 0 ? (s.sales - pm.get(s.key)) / pm.get(s.key) : null;
          const name = s.auto ? s.key.replace(/[()]/g, '') : s.key;
          const projected = elapsedDays ? s.sales / elapsedDays * totalDays : s.sales;
          const tgt = targets[s.key];
          const pctTarget = tgt && tgt.sales_target > 0 ? Math.min(100, Math.round(s.sales / tgt.sales_target * 100)) : null;
          const commCalc = tgt ? commissionFor(s.sales, tgt) : 0;
          return (
            <TableRow key={s.key} onClick={() => onFilter('salesperson', s.key)} style={{ cursor: 'pointer' }}>
              <TableCell className="num" style={{ fontWeight: 800, color: i < 3 ? medal[i] : 'var(--ink-4)' }}>{i + 1}</TableCell>
              <TableCell><span className="row" style={{ gap: 6, alignItems: 'center' }}>{name}{s.auto && <Badge variant="secondary" style={{ fontSize: 10 }}>อัตโนมัติ</Badge>}</span></TableCell>
              <TableCell className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{baht(s.sales)}</TableCell>
              <TableCell className="num" style={{ textAlign: 'right' }}>{N(s.orders)}</TableCell>
              <TableCell className="num" style={{ textAlign: 'right' }}>{N(s.qty)}</TableCell>
              <TableCell className="num" style={{ textAlign: 'right' }}>{baht(s.aov)}</TableCell>
              <TableCell className="num" style={{ textAlign: 'right' }}>{N(s.newC)}</TableCell>
              {hasComm && <TableCell className="num" style={{ textAlign: 'right' }}>{baht(s.comm)}</TableCell>}
              {anyTargets && <TableCell className="num" style={{ textAlign: 'right', color: 'var(--ink-3)' }}>{tgt && tgt.sales_target > 0 ? baht(tgt.sales_target) : '—'}</TableCell>}
              {anyTargets && <TableCell>{pctTarget == null ? <span className="dim">—</span> : (
                <div className="row" style={{ gap: 7, alignItems: 'center' }}>
                  <Progress value={pctTarget} indicatorColor={pctTarget >= 100 ? 'var(--good)' : 'var(--accent)'} style={{ flex: 1, minWidth: 50 }} />
                  <span className="cap num" style={{ flexShrink: 0, fontWeight: 700, color: pctTarget >= 100 ? 'var(--good)' : 'var(--ink-3)' }}>{pctTarget}%</span>
                </div>
              )}</TableCell>}
              {anyTargets && <TableCell className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{commCalc > 0 ? baht(commCalc) : '—'}</TableCell>}
              <TableCell>
                <div className="row" style={{ gap: 7, alignItems: 'center' }}>
                  <Progress value={periodPct} indicatorColor={s.auto ? 'var(--ink-4)' : 'var(--accent)'} style={{ flex: 1 }} />
                  <span className="cap num" style={{ flexShrink: 0, color: 'var(--ink-3)' }}>{baht(projected)}</span>
                </div>
              </TableCell>
              {cmp && <TableCell className="num" style={{ textAlign: 'right', fontWeight: 700, color: d == null ? 'var(--ink-4)' : d >= 0 ? 'var(--good)' : 'var(--bad)' }}>{d == null ? '—' : (d >= 0 ? '▲' : '▼') + Math.abs(Math.round(d * 100)) + '%'}</TableCell>}
            </TableRow>
          );
        })}</TableBody>
      </Table></div>
      <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 10 }}>"คาดสิ้นช่วง" = ประมาณการจากอัตราขายที่ผ่านมา {periodPct}% ของช่วง ({N(elapsedDays)}/{N(totalDays)} วัน) · คลิกแถวเพื่อกรองทั้งหน้า</div>
    </Card>
  );
}

// ---------- drill-down modal ----------
function DrillModal({ drill, orders, skus, eff, onClose }) {
  const { dim, value } = drill;
  const f2 = { ...eff, [dim]: [value] };
  const A = useMemo(() => compute(orders, skus, f2), [orders, skus, JSON.stringify(f2)]);
  const k = A.kpi;
  return <SideSheet size="lg" icon="grid" title={`${dim === 'channel' ? 'ช่องทาง' : dim === 'design' ? 'ลาย' : dim}: ${value}`} sub={`${baht(k.sales)} · ${N(k.orders)} ออเดอร์ · ${N(k.qty)} ตัว`} onClose={onClose} footer={<Button variant="outline" onClick={onClose}>ปิด</Button>}>
    <div className="metric-grid" style={{ marginBottom: 14 }}>
      <MetricCard label="ยอดขาย" value={baht(k.sales)} tone="var(--accent)" />
      <MetricCard label="ออเดอร์" value={N(k.orders)} />
      <MetricCard label="ตัว" value={N(k.qty)} />
      <MetricCard label="AOV" value={baht(k.aov)} />
    </div>
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <div><CardTitle className="m-0 text-base font-semibold mb-[10px]">ลายเด่น</CardTitle><HBars data={A.byDesign.slice(0, 8).map(d => ({ label: d.key, value: d.qty }))} height={180} unit="ตัว" /></div>
      <div><CardTitle className="m-0 text-base font-semibold mb-[10px]">สี & ไซซ์</CardTitle>
        <div className="cap" style={{ color: 'var(--ink-3)', marginBottom: 4 }}>สี</div><HBars data={A.byColor.slice(0, 6).map(c => ({ label: c.key, value: c.qty }))} height={120} unit="ตัว" />
      </div>
    </div>
  </SideSheet>;
}

// ---------- รายละเอียดลูกค้า (เปิดจากตาราง RFM) ----------
function CustomerDrawer({ cust, ords, skus, onClose }) {
  const TIER_CHIP = { 'เพชร': 'tier-chip-diamond', 'ทอง': 'tier-chip-gold', 'เงิน': 'tier-chip-silver', 'ทองแดง': 'tier-chip-bronze' };
  const flagTone = (fl) => fl === 'เสี่ยงหลุด' ? 'var(--bad)' : fl === 'ใหม่' ? 'var(--accent)' : fl === 'ขาประจำ' ? 'var(--good)' : 'var(--ink-4)';
  const { myOrds, designTop, colorTop, chTop, qtyTotal } = useMemo(() => {
    const mo = (ords || []).filter(o => o.customer_code === cust.code).sort((a, b) => (b.order_date || '').localeCompare(a.order_date || ''));
    const noSet = new Set(mo.map(o => o.order_no));
    const ms = (skus || []).filter(s => noSet.has(s.order_no));
    const agg = (rows, keyFn) => { const m = {}; rows.forEach(r => { const k = keyFn(r); if (!k) return; m[k] = (m[k] || 0) + (Number(r.qty) || 0); }); return Object.entries(m).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value); };
    const ch = {}; mo.forEach(o => { if (o.channel) ch[o.channel] = (ch[o.channel] || 0) + (Number(o.sales) || 0); });
    return {
      myOrds: mo,
      designTop: agg(ms, s => s.design).slice(0, 8),
      colorTop: agg(ms, s => normColor(s.color)).slice(0, 6),
      chTop: Object.entries(ch).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      qtyTotal: ms.reduce((a, s) => a + (Number(s.qty) || 0), 0) || mo.reduce((a, o) => a + (Number(o.qty) || 0), 0),
    };
  }, [cust.code, ords, skus]);
  return <SideSheet size="lg" icon="user" title={cust.name}
    sub={<span className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><span className={`tier-chip ${TIER_CHIP[cust.tier] || ''}`}>{cust.tier}</span><span style={{ color: 'var(--ink-4)' }}>รหัส {cust.code}</span>{cust.flag && <Badge variant="outline" style={{ fontSize: 10, color: flagTone(cust.flag) }}>{cust.flag}</Badge>}</span>}
    onClose={onClose} footer={<Button variant="outline" onClick={onClose}>ปิด</Button>}>
    <div className="metric-grid" style={{ marginBottom: 14 }}>
      <MetricCard label="ยอดซื้อรวม" value={baht(cust.sales)} tone="var(--accent)" />
      <MetricCard label="จำนวนครั้ง" value={N(cust.orders)} />
      <MetricCard label="เฉลี่ย/ครั้ง" value={baht(cust.aov)} />
      <MetricCard label="ตัวรวม" value={N(qtyTotal)} />
    </div>
    <div className="grid g2" style={{ alignItems: 'start', marginBottom: 14 }}>
      <Card className="p-[16px]">
        <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 8 }}>ความเคลื่อนไหว</div>
        <div style={{ display: 'grid', gap: 7, fontSize: 13.5 }}>
          <div className="row between"><span style={{ color: 'var(--ink-4)' }}>ซื้อครั้งแรก</span><span className="num">{cust.first || '—'}</span></div>
          <div className="row between"><span style={{ color: 'var(--ink-4)' }}>ซื้อล่าสุด</span><span className="num">{cust.last || '—'}{cust.recency != null ? ` (${cust.recency} ว.ก่อน)` : ''}</span></div>
          <div className="row between"><span style={{ color: 'var(--ink-4)' }}>ช่องทางที่ใช้</span><span className="num">{N(cust.channels)} ช่อง</span></div>
        </div>
      </Card>
      <Card className="p-[16px]">
        <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 8 }}>ยอดซื้อแยกช่องทาง</div>
        {chTop.length ? <HBars data={chTop.map(c => ({ label: c.label, value: c.value, color: channelColor(c.label) }))} height={Math.max(80, chTop.length * 30)} unit="฿" /> : <div className="cap" style={{ color: 'var(--ink-4)' }}>—</div>}
      </Card>
    </div>
    {designTop.length > 0 && <div className="grid g2" style={{ alignItems: 'start', marginBottom: 14 }}>
      <Card className="p-[16px]">
        <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 8 }}>ลายที่ซื้อบ่อย</div>
        <HBars data={designTop} height={Math.max(120, designTop.length * 30)} unit="ตัว" />
      </Card>
      <Card className="p-[16px]">
        <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 8 }}>สีที่ซื้อบ่อย</div>
        <HBars data={colorTop.map(c => ({ label: c.label, value: c.value, color: COLOR_HEX[c.label] || 'var(--accent-2)' }))} height={Math.max(120, colorTop.length * 30)} unit="ตัว" />
      </Card>
    </div>}
    <CardTitle className="m-0 text-base font-semibold mb-[10px]">ประวัติการสั่งซื้อ <span className="dim">· {N(myOrds.length)} ครั้ง</span></CardTitle>
    <div className="table-wrap" style={{ maxHeight: 320, overflow: 'auto' }}><Table>
      <TableHeader><TableRow><TableHead>วันที่</TableHead><TableHead>เลขออเดอร์</TableHead><TableHead>ช่องทาง</TableHead><TableHead style={{ textAlign: 'right' }}>ยอด</TableHead><TableHead style={{ textAlign: 'right' }}>ตัว</TableHead></TableRow></TableHeader>
      <TableBody>{myOrds.map((o, i) => (
        <TableRow key={o.order_no || i}>
          <TableCell className="num cap">{o.order_date || '—'}</TableCell>
          <TableCell className="num cap" style={{ color: 'var(--ink-3)' }}>{o.order_no || '—'}</TableCell>
          <TableCell><span className="row" style={{ gap: 6 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: channelColor(o.channel) }} />{o.channel || '—'}</span></TableCell>
          <TableCell className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{baht(Number(o.sales) || 0)}</TableCell>
          <TableCell className="num" style={{ textAlign: 'right', color: 'var(--ink-3)' }}>{N(Number(o.qty) || 0)}</TableCell>
        </TableRow>
      ))}</TableBody>
    </Table></div>
  </SideSheet>;
}
