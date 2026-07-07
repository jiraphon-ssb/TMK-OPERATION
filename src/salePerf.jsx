/* ============================================================
   TMK Operation — "ประสิทธิภาพเซลล์" (Salesperson Performance)
   ============================================================
   รายเดือน + รายวัน ละเอียดต่อคน — ทุกคนเห็นทุกคน (โปร่งใส/แข่งขัน · Q&A)
   - แหล่งข้อมูลเดียวกับรายงานขาย: tmk_mp_orders (ตัด cancelled) + tmk_sales_funnel + targets + tmk_sale_receipts
   - เทียบเดือนก่อน (▲▼%) + Sparkline/Heatmap แนวโน้มรายวัน (Q&A เลือก)
   - realtime: ส่งใบ/กรอกคนทัก → หน้านี้ขยับสด (useSaleRealtime)
   ============================================================ */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Icon, N, useBeat, PageSkeleton } from './components.jsx';
import { supabase } from './lib/supabaseClient.js';
import {
  cachedFetchRange, ORDERS_SEL, SKUS_SEL, funnelTotal, invalidateSaleCache,
} from './lib/saleData.js';
import { fetchTargets, commissionFor } from './lib/targets.js';
import { useSaleRealtime } from './lib/saleRealtime.js';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { SearchInput } from '@/components/ui/search-input';
import { SortableTable, ColumnToggle, CardTable } from './components/DataTableParts.jsx';
import { usePersistedState } from './hooks/usePersistedState.js';
import { downloadCsv } from './lib/exportCsv.js';
import { ComboChart, DonutChart, HBars, Sparkline, Gauge, channelColor } from './charts.jsx';

const fmtB = (n) => '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 });
const NO_SELLER = 'ไม่ระบุเซลล์';
const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const curMonth = () => new Date().toISOString().slice(0, 7);
const monthOptions = (n = 12) => { const out = []; const d = new Date(); for (let i = 0; i < n; i++) { out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); d.setMonth(d.getMonth() - 1); } return out; };
const monthLabel = (ym) => { const [y, m] = ym.split('-'); return `${TH_MON[Number(m) - 1] || m} ${Number(y) + 543}`; };
const prevMonthOf = (ym) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const daysInMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const dayOf = (iso) => Number(String(iso || '').slice(8, 10)) || 0;
const isCancelled = (o) => String(o.status || '').toLowerCase() === 'cancelled';
const spOf = (o) => (o.salesperson && String(o.salesperson).trim()) || NO_SELLER;
const deltaPct = (cur, prev) => (prev > 0 ? (cur - prev) / prev * 100 : null);
const MEDAL = ['#e3b341', '#b8c0cc', '#cd8b5e'];   // ทอง/เงิน/ทองแดง
const initialOf = (name) => { const s = String(name || '').trim(); if (!s) return '?'; const p = s.split(/\s+/); return ((p[0][0] || '') + (p[1]?.[0] || '')).toUpperCase() || s[0].toUpperCase(); };
const closeTone = (v) => v == null ? 'var(--ink-4)' : v >= 15 ? 'var(--good)' : v >= 8 ? 'var(--warn)' : 'var(--bad)';
const dPill = (d) => d == null ? null : (
  <span className={`text-[11px] font-medium ${d >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{d >= 0 ? '▲' : '▼'} {Math.abs(Math.round(d))}%</span>
);

/* MultiSelect เล็ก (ช่องทาง) — DropdownMenu + checkbox (ว่าง = ทั้งหมด) */
function MultiSelect({ label, options, value, onChange }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  const n = value.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={'h-8 rounded-full font-normal gap-1' + (n ? ' border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-2)]' : '')}>
          {label}{n > 0 && <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[11px]">{n}</Badge>}<Icon name="down" className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-52 overflow-auto">
        <DropdownMenuLabel className="flex items-center justify-between py-1"><span>{label}</span>{n > 0 && <button className="text-[12px] font-medium text-[var(--bad)] hover:underline" onClick={e => { e.preventDefault(); onChange([]); }}>ล้าง</button>}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.length === 0 && <div className="px-2 py-2 text-[13px] text-[var(--ink-4)]">ไม่มีข้อมูล</div>}
        {options.map(o => <DropdownMenuCheckboxItem key={o} checked={value.includes(o)} onSelect={e => { e.preventDefault(); toggle(o); }}>{o || '(ไม่ระบุ)'}</DropdownMenuCheckboxItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---- aggregate ต่อเดือน ---- */
function buildPerf(month, orders, skus, funnel, receipts, targets, prevOrders) {
  const dim = daysInMonth(month);
  const isCur = month === curMonth();
  const daysPassed = isCur ? Math.min(new Date().getDate(), dim) : dim;
  // order_no → salesperson (สำหรับ join skus)
  const onToSp = new Map();
  const bySp = new Map();
  const ensure = (name) => {
    if (!bySp.has(name)) bySp.set(name, {
      name, sales: 0, orders: 0, qty: 0, newC: 0, leads: 0,
      channels: {}, designs: {}, daily: Array.from({ length: dim }, (_, i) => ({ day: i + 1, sales: 0, leads: 0, orders: 0 })),
      receipts: [],
    });
    return bySp.get(name);
  };
  orders.forEach(o => {
    if (isCancelled(o)) return;
    const name = spOf(o); const s = ensure(name);
    onToSp.set(o.order_no, name);
    const amt = Number(o.sales) || 0, q = Number(o.qty) || 0;
    s.sales += amt; s.orders += 1; s.qty += q;
    if (o.customer_type === 'ลูกค้าใหม่') s.newC += 1;
    if (o.channel) s.channels[o.channel] = (s.channels[o.channel] || 0) + amt;
    const d = dayOf(o.order_date); if (d >= 1 && d <= dim) { s.daily[d - 1].sales += amt; s.daily[d - 1].orders += 1; }
  });
  // skus → design tally ต่อเซลล์ (join ผ่าน order_no)
  (skus || []).forEach(k => {
    const name = onToSp.get(k.order_no); if (!name) return;
    const s = bySp.get(name); if (!s) return;
    const dz = (k.design && String(k.design).trim()) || 'ไม่ระบุลาย';
    s.designs[dz] = (s.designs[dz] || 0) + (Number(k.qty) || 0);
  });
  // funnel → leads ต่อเซลล์ + รายวัน
  (funnel || []).forEach(f => {
    const name = (f.salesperson && String(f.salesperson).trim()); if (!name) return;
    const s = ensure(name); const tot = funnelTotal(f);
    s.leads += tot;
    const d = dayOf(f.date); if (d >= 1 && d <= dim) s.daily[d - 1].leads += tot;
  });
  // receipts → รายการต่อเซลล์ (โชว์ใน drawer/รายวัน)
  (receipts || []).forEach(r => {
    const name = (r.salesperson && String(r.salesperson).trim()) || NO_SELLER;
    const s = ensure(name); if (r.status !== 'void') s.receipts.push(r);
  });
  // prev month sales ต่อเซลล์ (เทียบ)
  const prevSp = new Map();
  (prevOrders || []).forEach(o => { if (isCancelled(o)) return; const name = spOf(o); prevSp.set(name, (prevSp.get(name) || 0) + (Number(o.sales) || 0)); });

  const rows = [...bySp.values()].map(s => {
    const t = targets[s.name] || null;
    const target = Number(t?.sales_target) || 0;
    const closeRate = s.leads > 0 ? s.orders / s.leads * 100 : null;
    const projected = isCur && daysPassed > 0 ? s.sales / daysPassed * dim : s.sales;
    return {
      ...s,
      aov: s.orders ? s.sales / s.orders : 0,
      closeRate, target, pctTarget: target ? s.sales / target * 100 : null,
      comm: t ? commissionFor(s.sales, t) : 0,
      projected, dSales: deltaPct(s.sales, prevSp.get(s.name) || 0),
    };
  }).sort((a, b) => b.sales - a.sales);

  const team = rows.reduce((a, r) => ({
    sales: a.sales + r.sales, orders: a.orders + r.orders, qty: a.qty + r.qty,
    leads: a.leads + r.leads, newC: a.newC + r.newC,
  }), { sales: 0, orders: 0, qty: 0, leads: 0, newC: 0 });
  team.closeRate = team.leads > 0 ? team.orders / team.leads * 100 : null;
  const prevTeam = [...prevSp.values()].reduce((a, v) => a + v, 0);
  team.dSales = deltaPct(team.sales, prevTeam);
  return { rows, team, dim };
}

const PERF_COLS = [
  { key: 'rank', label: '#', sortable: false, always: true },
  { key: 'name', label: 'เซลล์', sortable: true, always: true },
  { key: 'sales', label: 'ยอดขาย', align: 'right', sortable: true, always: true },
  { key: 'orders', label: 'ออเดอร์', align: 'right', sortable: true },
  { key: 'qty', label: 'ตัว', align: 'right', sortable: true },
  { key: 'aov', label: 'AOV', align: 'right', sortable: true },
  { key: 'newC', label: 'ลูกค้าใหม่', align: 'right', sortable: true },
  { key: 'leads', label: 'คนทัก', align: 'right', sortable: true },
  { key: 'closeRate', label: '%ปิด', align: 'right', sortable: true, accessor: r => r.closeRate ?? -1 },
  { key: 'pctTarget', label: 'เป้า', align: 'right', sortable: true, accessor: r => r.pctTarget ?? -1 },
  { key: 'comm', label: 'คอม', align: 'right', sortable: true },
  { key: 'projected', label: 'คาดสิ้นเดือน', align: 'right', sortable: true },
  { key: '_trend', label: 'แนวโน้ม', align: 'left', sortable: false },
];

/* ---- การ์ดเซลล์รายคน (โหมด default แท็บรายเดือน) — คลิกเปิด drawer เดิม ---- */
function SellerCard({ r, rank, share, onOpen }) {
  const noSeller = r.name === NO_SELLER;
  return (
    <div onClick={onOpen}
      className="rounded-xl border bg-card p-4 flex flex-col gap-3 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5">
      <div className="flex items-center gap-2.5">
        <span className="font-bold text-sm w-5 text-center shrink-0" style={{ color: rank < 3 ? MEDAL[rank] : 'var(--ink-4)' }}>{rank + 1}</span>
        <span className="grid place-items-center rounded-full size-9 text-xs font-bold shrink-0" style={{ background: noSeller ? 'var(--surface-3)' : 'var(--accent-soft)', color: noSeller ? 'var(--ink-3)' : 'var(--accent-2)' }}>{noSeller ? <Icon name="external" className="size-4" /> : initialOf(r.name)}</span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate">{noSeller ? 'ไม่ระบุเซลล์' : r.name}</div>
          {noSeller && <div className="text-[10px] text-muted-foreground">มาร์เก็ตเพลส</div>}
        </div>
        {dPill(r.dSales)}
      </div>
      <div>
        <div className="num text-2xl font-bold leading-tight" style={{ color: 'var(--accent-2)' }}>{fmtB(r.sales)}</div>
        <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: Math.min(100, share) + '%', background: 'var(--accent)' }} /></div>
        <div className="text-[11px] text-muted-foreground mt-1">{Math.round(share)}% ของยอดทีม</div>
      </div>
      <div className="flex items-center gap-4 text-sm flex-wrap">
        <span className="whitespace-nowrap"><span className="text-muted-foreground text-xs">ออเดอร์</span> <b className="num">{N(r.orders)}</b></span>
        <span className="whitespace-nowrap"><span className="text-muted-foreground text-xs">ตัว</span> <b className="num">{N(r.qty)}</b></span>
        <span className="whitespace-nowrap"><span className="text-muted-foreground text-xs">AOV</span> <b className="num">{fmtB(r.aov)}</b></span>
      </div>
      {r.target > 0 ? (
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">เป้า {fmtB(r.target)}</span>
            <b className="num" style={{ color: r.sales >= r.target ? 'var(--good)' : undefined }}>{Math.round(r.pctTarget)}%</b>
          </div>
          <Progress value={Math.min(100, r.pctTarget)} className="h-1.5" indicatorColor={r.sales >= r.target ? 'var(--good)' : 'var(--accent)'} />
          {r.comm > 0 && <div className="text-xs mt-1.5">คอม <b className="num" style={{ color: 'var(--accent-2)' }}>{fmtB(r.comm)}</b></div>}
        </div>
      ) : (!noSeller && window.__canEdit !== false && (
        <button type="button" className="text-xs text-muted-foreground hover:text-[var(--accent-2)] text-left w-fit"
          onClick={(e) => { e.stopPropagation(); window.__goSection?.('settings', 'targets'); }}>ตั้งเป้า/คอม →</button>
      ))}
      <div className="mt-auto pt-2 border-t border-border/50"><Sparkline data={r.daily.map(d => d.sales)} w={220} h={30} /></div>
    </div>
  );
}

export function SalePerfView() {
  const beat = useBeat(350);
  const [month, setMonth] = useState(curMonth());
  const [tab, setTab] = useState('month');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ orders: [], skus: [], funnel: [], receipts: [], prevOrders: [] });
  const [targets, setTargets] = useState({});
  const [detail, setDetail] = useState(null);   // เซลล์ที่เปิด drawer (รายเดือน)
  const monthOpts = useMemo(() => monthOptions(12), []);
  // เครื่องมือ: ค้นหา/ตัวกรอง/คอลัมน์/ความหนาแน่น (จำค่า localStorage)
  const [q, setQ] = useState('');
  const [channelF, setChannelF] = useState([]);
  const [onlyTargets, setOnlyTargets] = useState(false);
  const [hideNoSeller, setHideNoSeller] = usePersistedState('tmk-perf-hidenoseller', false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // default = คอลัมน์เนื้อๆ (# เซลล์ ยอด ออเดอร์ เป้า คอม แนวโน้ม) · ที่เหลือเปิดเพิ่มได้จากปุ่ม "คอลัมน์" (key v2 ให้ default ใหม่มีผล)
  const [hiddenCols, setHiddenCols] = usePersistedState('tmk-perf-cols-v2', ['qty', 'aov', 'newC', 'leads', 'closeRate', 'projected']);
  const [viewMode, setViewMode] = usePersistedState('tmk-perf-view', 'cards');   // รายเดือน: การ์ดเซลล์ (default) | ตาราง

  const load = useCallback(async (force = false) => {
    if (!force) setLoading(true);   // realtime refetch (force) = อัปเดตในที่ ไม่ต้องล้างเป็น skeleton (กันจอกระพริบ)
    try {
      const from = `${month}-01`, to = `${month}-31`;
      const pm = prevMonthOf(month), pFrom = `${pm}-01`, pTo = `${pm}-31`;
      // กัน skeleton ค้าง: ถ้า fetch ค้าง (เน็ต/auth หลุด) → timeout 15 วิ → เข้า catch → เลิก skeleton โชว์ empty
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000));
      const [ordersR, skusR, funnelR, receiptsR, prevR, tg] = await Promise.race([timeout, Promise.all([
        cachedFetchRange('tmk_mp_orders', ORDERS_SEL, from, to, 'order_date', force),
        cachedFetchRange('tmk_mp_skus', SKUS_SEL, from, to, 'order_date', force),
        supabase.from('tmk_sales_funnel').select('*').gte('date', from).lte('date', to),
        supabase.from('tmk_sale_receipts').select('order_no,salesperson,sales,qty,order_date,status,confirmed,channel').eq('order_month', month),
        cachedFetchRange('tmk_mp_orders', 'salesperson,sales,status,order_date', pFrom, pTo, 'order_date', force),
        fetchTargets(month),
      ])]);
      const tmap = {}; (tg || []).forEach(t => { tmap[t.salesperson] = t; }); setTargets(tmap);
      setData({
        orders: ordersR.data || [], skus: skusR.data || [],
        funnel: funnelR.data || [], receipts: receiptsR.data || [], prevOrders: prevR.data || [],
      });
    } catch { /* ปล่อยว่าง — empty state */ }
    finally { setLoading(false); }
  }, [month]);
  useEffect(() => { load(); }, [load]);
  useSaleRealtime(['tmk_sale_receipts', 'tmk_sales_funnel'], () => { invalidateSaleCache('tmk_mp_orders'); invalidateSaleCache('tmk_mp_skus'); load(true); });

  // ช่องทางทั้งหมด (ทำ option ตัวกรอง)
  const channels = useMemo(() => [...new Set((data.orders || []).map(o => o.channel).filter(Boolean))].sort(), [data.orders]);
  // กรองช่องทาง → orders/skus ที่กรองแล้ว (ใช้ทั้ง buildPerf + drill-down รายวันรายออเดอร์)
  const { ordersF, skusF } = useMemo(() => {
    const chSet = channelF.length ? new Set(channelF) : null;
    return {
      ordersF: chSet ? data.orders.filter(o => chSet.has(o.channel)) : data.orders,
      skusF: chSet ? data.skus.filter(k => chSet.has(k.channel)) : data.skus,
    };
  }, [data.orders, data.skus, channelF]);
  const perf = useMemo(() => buildPerf(month, ordersF, skusF, data.funnel, data.receipts, targets, data.prevOrders),
    [month, ordersF, skusF, data.funnel, data.receipts, targets, data.prevOrders]);
  const [dayDrill, setDayDrill] = useState(null);   // { name, day } — เซลล์+วันที่เปิดดูออเดอร์รายตัว (drill-down รายวัน)
  // กรอง rows ฝั่งแสดงผล (ค้นหา/เฉพาะมีเป้า/ซ่อนไม่ระบุเซลล์) + คำนวณทีมใหม่ + จัดอันดับตามยอด
  const ql = q.trim().toLowerCase();
  const rowsView = useMemo(() => perf.rows.filter(r =>
    (!ql || r.name.toLowerCase().includes(ql)) &&
    (!onlyTargets || r.target > 0) &&
    (!hideNoSeller || r.name !== NO_SELLER)
  ), [perf.rows, ql, onlyTargets, hideNoSeller]);
  const teamView = useMemo(() => {
    const t = rowsView.reduce((a, r) => ({ sales: a.sales + r.sales, orders: a.orders + r.orders, qty: a.qty + r.qty, leads: a.leads + r.leads, newC: a.newC + r.newC }), { sales: 0, orders: 0, qty: 0, leads: 0, newC: 0 });
    t.closeRate = t.leads > 0 ? t.orders / t.leads * 100 : null;
    t.dSales = perf.team.dSales;
    return t;
  }, [rowsView, perf.team.dSales]);
  const rankMap = useMemo(() => { const m = new Map(); [...rowsView].sort((a, b) => b.sales - a.sales).forEach((r, i) => m.set(r.name, i)); return m; }, [rowsView]);
  const perfView = useMemo(() => ({ rows: rowsView, team: teamView, dim: perf.dim }), [rowsView, teamView, perf.dim]);
  const openSp = perf.rows.find(r => r.name === detail) || null;

  // คอลัมน์: ล็อก name/sales · toggle ที่เหลือ (จำค่า)
  const toggleCols = PERF_COLS.filter(c => !c.always);
  const visKeys = new Set(PERF_COLS.filter(c => c.always || !hiddenCols.includes(c.key)).map(c => c.key));
  const visibleColumns = PERF_COLS.filter(c => visKeys.has(c.key));
  const colVisibleSet = new Set(toggleCols.filter(c => !hiddenCols.includes(c.key)).map(c => c.key));
  const toggleCol = (k) => setHiddenCols(h => h.includes(k) ? h.filter(x => x !== k) : [...h, k]);
  const nFilters = channelF.length + (onlyTargets ? 1 : 0) + (hideNoSeller ? 1 : 0);
  const pad = 'py-2.5';
  const show = (k) => visKeys.has(k);
  const commTotal = useMemo(() => rowsView.reduce((s, r) => s + (r.comm || 0), 0), [rowsView]);

  if (beat) return <PageSkeleton />;

  const exportMonth = () => downloadCsv(`ประสิทธิภาพเซลล์-${month}`, rowsView, [
    { key: 'name', label: 'เซลล์' }, { key: 'sales', label: 'ยอดขาย' }, { key: 'orders', label: 'ออเดอร์' },
    { key: 'qty', label: 'จำนวนตัว' }, { label: 'AOV', map: r => Math.round(r.aov) }, { key: 'newC', label: 'ลูกค้าใหม่' },
    { key: 'leads', label: 'คนทัก' }, { label: '%ปิด', map: r => r.closeRate == null ? '' : Math.round(r.closeRate) },
    { label: 'เป้า', map: r => r.target }, { label: '%เป้า', map: r => r.pctTarget == null ? '' : Math.round(r.pctTarget) },
    { label: 'คอมมิชชัน', map: r => Math.round(r.comm) },
  ]);
  const clearFilters = () => { setChannelF([]); setOnlyTargets(false); setHideNoSeller(false); };

  return (
    <div className="content-inner rise flex flex-col gap-4">
      {/* หัว: เครื่องมือแถวเดียว + แถบสรุปทีม inline (เนื้อๆ · ตัวเลข 0 ซ่อนอัตโนมัติ) */}
      <Card className="p-4">
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold">ประสิทธิภาพเซลล์</span>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{monthOpts.map(m => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}</SelectContent>
            </Select>
            <SearchInput value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา" wrapperClassName="w-full sm:w-[180px] sm:ml-auto" className="h-8" />
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className={'h-8 gap-1.5' + (nFilters ? ' border-[var(--accent)] text-[var(--accent-2)]' : '')}>
                <Icon name="filter" className="size-3.5" /> ตัวกรอง{nFilters > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{nFilters}</Badge>}
              </Button>
            </CollapsibleTrigger>
            <div className="flex items-center h-8 rounded-md border overflow-hidden">
              <button type="button" title="มุมมองการ์ด" onClick={() => setViewMode('cards')} className={`grid place-items-center h-full px-2.5 transition-colors ${viewMode === 'cards' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}><Icon name="grid" className="size-3.5" /></button>
              <button type="button" title="มุมมองตาราง" onClick={() => setViewMode('table')} className={`grid place-items-center h-full px-2.5 transition-colors border-l ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}><Icon name="menu" className="size-3.5" /></button>
            </div>
            {viewMode === 'table' && <ColumnToggle columns={toggleCols} visible={colVisibleSet} onToggle={toggleCol} />}
            <Button variant="outline" size="sm" className="h-8" disabled={!rowsView.length} onClick={exportMonth}><Icon name="external" className="size-3.5" /> CSV</Button>
          </div>
          {nFilters > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              {channelF.map(c => <Badge key={c} variant="outline" className="cursor-pointer" onClick={() => setChannelF(channelF.filter(x => x !== c))}>ช่องทาง: {c} <Icon name="x" className="size-3" /></Badge>)}
              {onlyTargets && <Badge variant="outline" className="cursor-pointer" onClick={() => setOnlyTargets(false)}>เฉพาะมีเป้า <Icon name="x" className="size-3" /></Badge>}
              {hideNoSeller && <Badge variant="outline" className="cursor-pointer" onClick={() => setHideNoSeller(false)}>ซ่อนไม่ระบุเซลล์ <Icon name="x" className="size-3" /></Badge>}
              <Button variant="ghost" size="sm" className="h-7 text-[var(--bad)]" onClick={clearFilters}><Icon name="x" className="size-3" /> ล้าง</Button>
            </div>
          )}
          <CollapsibleContent>
            <div className="flex items-center gap-2 flex-wrap pt-3 mt-3 border-t">
              <MultiSelect label="ช่องทาง" options={channels} value={channelF} onChange={setChannelF} />
              <Button variant="outline" size="sm" className={'h-8 rounded-full font-normal' + (onlyTargets ? ' border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-2)]' : '')} onClick={() => setOnlyTargets(v => !v)}>{onlyTargets ? '✓ ' : ''}เฉพาะที่มีเป้า</Button>
              <Button variant="outline" size="sm" className={'h-8 rounded-full font-normal' + (hideNoSeller ? ' border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-2)]' : '')} onClick={() => setHideNoSeller(v => !v)}>{hideNoSeller ? '✓ ' : ''}ซ่อนไม่ระบุเซลล์</Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
        {/* แถบสรุปทีม */}
        <div className="mt-3.5 pt-3.5 border-t flex items-end gap-x-8 gap-y-3 flex-wrap">
          <div>
            <div className="text-[11px] text-muted-foreground font-medium">ยอดทีม · {monthLabel(month)}</div>
            <div className="num text-2xl font-bold leading-tight flex items-center gap-2" style={{ color: 'var(--accent-2)' }}>{fmtB(teamView.sales)} {dPill(teamView.dSales)}</div>
          </div>
          {[['ออเดอร์', N(teamView.orders)], ['จำนวนตัว', N(teamView.qty)], ['คอมรวม', commTotal ? fmtB(commTotal) : '—']].map(([l, v]) => (
            <div key={l}><div className="text-[11px] text-muted-foreground font-medium">{l}</div><div className="num text-lg font-bold leading-tight">{v}</div></div>
          ))}
          {teamView.leads > 0 && <>
            <div><div className="text-[11px] text-muted-foreground font-medium">คนทัก</div><div className="num text-lg font-bold leading-tight">{N(teamView.leads)}</div></div>
            <div><div className="text-[11px] text-muted-foreground font-medium">%ปิดทีม</div><div className="num text-lg font-bold leading-tight" style={{ color: closeTone(teamView.closeRate) }}>{teamView.closeRate == null ? '—' : Math.round(teamView.closeRate) + '%'}</div></div>
          </>}
          {teamView.newC > 0 && <div><div className="text-[11px] text-muted-foreground font-medium">ลูกค้าใหม่</div><div className="num text-lg font-bold leading-tight">{N(teamView.newC)}</div></div>}
        </div>
        {channelF.length > 0 && <div className="mt-2 text-[11px] text-muted-foreground">* กรองช่องทาง {channelF.join('/')} — %ปิดอิงคนทักทั้งหมด (คนทักไม่แยกช่องทาง)</div>}
      </Card>

      {loading ? <PageSkeleton /> : !perf.rows.length ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">ยังไม่มีข้อมูลยอดเดือนนี้ — ส่งใบเสร็จ/คีย์มือในหน้า "ส่งยอด &amp; ข้อมูล" แล้วจะขึ้นที่นี่</Card>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="month"><Icon name="sales" /> รายเดือน</TabsTrigger>
            <TabsTrigger value="day"><Icon name="checkCheck" /> รายวัน</TabsTrigger>
          </TabsList>

          {/* ---------- รายเดือน ---------- */}
          <TabsContent value="month">
            {!rowsView.length ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">ไม่พบเซลล์ตามตัวกรอง · <button className="text-[var(--accent)] hover:underline" onClick={() => { setQ(''); clearFilters(); }}>ล้างตัวกรอง</button></Card>
            ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {rowsView.map(r => (
                <SellerCard key={r.name} r={r} rank={rankMap.get(r.name) ?? 99}
                  share={teamView.sales > 0 ? r.sales / teamView.sales * 100 : 0}
                  onOpen={() => setDetail(r.name)} />
              ))}
            </div>
            ) : (
            <Card className="p-0 overflow-hidden">
              <SortableTable cards
                initial={{ key: 'sales', dir: 'desc' }}
                columns={visibleColumns}
                rows={rowsView}
                renderRow={(r) => {
                  const rank = rankMap.get(r.name) ?? 99;
                  const share = teamView.sales > 0 ? r.sales / teamView.sales * 100 : 0;
                  return (
                    <tr key={r.name} className={`border-t hover:bg-muted/40 cursor-pointer ${rank === 0 ? 'bg-amber-500/[0.06]' : ''}`} onClick={() => setDetail(r.name)}>
                      <td className={`px-3 ${pad} text-center`}><span className="font-bold" style={{ color: rank < 3 ? MEDAL[rank] : 'var(--ink-4)' }}>{rank + 1}</span></td>
                      <td className={`px-2 ${pad}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="grid place-items-center rounded-full size-7 text-[11px] font-bold shrink-0" style={{ background: r.name === NO_SELLER ? 'var(--surface-3)' : 'var(--accent-soft)', color: r.name === NO_SELLER ? 'var(--ink-3)' : 'var(--accent-2)' }}>{r.name === NO_SELLER ? <Icon name="external" className="size-3.5" /> : initialOf(r.name)}</span>
                          <span className="font-medium truncate">{r.name === NO_SELLER ? 'ไม่ระบุเซลล์' : r.name}{r.name === NO_SELLER && <span className="ml-1 text-[10px] text-muted-foreground">มาร์เก็ตเพลส</span>}</span>
                        </div>
                      </td>
                      <td className={`px-2 ${pad} text-right`}>
                        <div className="flex items-center justify-end gap-1.5">{fmtB(r.sales)} {dPill(r.dSales)}</div>
                        <div className="mt-1 ml-auto w-20 h-1 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: Math.min(100, share) + '%', background: 'var(--accent)' }} /></div>
                      </td>
                      {show('orders') && <td className={`px-2 ${pad} text-right`}>{N(r.orders)}</td>}
                      {show('qty') && <td className={`px-2 ${pad} text-right`}>{N(r.qty)}</td>}
                      {show('aov') && <td className={`px-2 ${pad} text-right`}>{fmtB(r.aov)}</td>}
                      {show('newC') && <td className={`px-2 ${pad} text-right`}>{N(r.newC)}</td>}
                      {show('leads') && <td className={`px-2 ${pad} text-right`}>{N(r.leads)}</td>}
                      {show('closeRate') && <td className={`px-2 ${pad} text-right`}>{r.closeRate == null ? <span className="text-muted-foreground">—</span> : <span className="inline-block rounded-full px-1.5 py-0.5 text-[11px] font-semibold" style={{ color: closeTone(r.closeRate), background: `color-mix(in srgb, ${closeTone(r.closeRate)} 12%, transparent)` }}>{Math.round(r.closeRate)}%</span>}</td>}
                      {show('pctTarget') && <td className={`px-2 ${pad} text-right min-w-[110px]`}>{r.target > 0 ? <div><div className="text-[11px]">{Math.round(r.pctTarget)}%</div><Progress value={Math.min(100, r.pctTarget)} className="h-1.5 mt-0.5" indicatorColor={r.sales >= r.target ? 'var(--good)' : 'var(--accent)'} /></div> : <span className="text-muted-foreground text-xs">—</span>}</td>}
                      {show('comm') && <td className={`px-2 ${pad} text-right`}>{r.comm ? fmtB(r.comm) : '—'}</td>}
                      {show('projected') && <td className={`px-2 ${pad} text-right text-muted-foreground`}>{fmtB(r.projected)}</td>}
                      {show('_trend') && <td className={`px-2 ${pad}`}><Sparkline data={r.daily.map(d => d.sales)} w={90} h={26} /></td>}
                    </tr>
                  );
                }}
              />
              {/* แถวทีมรวม */}
              <div className="flex items-center gap-4 px-3 py-2.5 border-t bg-muted/40 text-sm flex-wrap">
                <b>ทีมรวม ({rowsView.length} คน)</b>
                <span>ยอด <b>{fmtB(teamView.sales)}</b></span>
                <span>ออเดอร์ <b>{N(teamView.orders)}</b></span>
                <span>ตัว <b>{N(teamView.qty)}</b></span>
                <span>คอมรวม <b>{commTotal ? fmtB(commTotal) : '—'}</b></span>
                {teamView.leads > 0 && <span>คนทัก <b>{N(teamView.leads)}</b> · %ปิด <b>{teamView.closeRate == null ? '—' : Math.round(teamView.closeRate) + '%'}</b></span>}
              </div>
            </Card>
            )}
          </TabsContent>

          {/* ---------- รายวัน ---------- */}
          <TabsContent value="day">
            <DailyPanel perf={perfView} month={month} orders={ordersF} onOpenDay={(name, day) => setDayDrill({ name, day })} />
          </TabsContent>
        </Tabs>
      )}

      {/* Drawer เซลล์รายคน (รายเดือน) */}
      <Sheet open={!!openSp} onOpenChange={o => { if (!o) setDetail(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {openSp && <SpDetail sp={openSp} month={month} />}
        </SheetContent>
      </Sheet>

      {/* Drawer ออเดอร์รายตัวของเซลล์ในวันนั้น (drill-down รายวัน — ตรวจสอบ/คิดคอม) */}
      <Sheet open={!!dayDrill} onOpenChange={o => { if (!o) setDayDrill(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {dayDrill && <DaySellerDetail name={dayDrill.name} day={dayDrill.day} month={month} orders={ordersF} skus={skusF} target={targets[dayDrill.name]} onOpenMonth={() => { const n = dayDrill.name; setDayDrill(null); setDetail(n); }} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ---- แท็บรายวัน: กราฟภาพรวมเดือน + สมุดบันทึกรายวัน (เฉพาะวันที่มียอด · คลิกเซลล์เปิดออเดอร์รายตัว) ---- */
const TH_DAY = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
function DailyPanel({ perf, month, orders, onOpenDay }) {
  const dim = perf.dim;
  const names = new Set(perf.rows.map(r => r.name));
  // รวมยอดต่อวัน→ต่อเซลล์ จากออเดอร์จริง (เคารพตัวกรองของหน้า — เซลล์ที่ถูกค้นหา/กรองออกไม่นับ)
  const byDay = new Map();
  (orders || []).forEach(o => {
    if (isCancelled(o)) return;
    const name = spOf(o); if (!names.has(name)) return;
    const d = dayOf(o.order_date); if (d < 1 || d > dim) return;
    let day = byDay.get(d); if (!day) { day = { sales: 0, orders: 0, qty: 0, sellers: new Map() }; byDay.set(d, day); }
    const amt = Number(o.sales) || 0, q = Number(o.qty) || 0;
    day.sales += amt; day.orders += 1; day.qty += q;
    let s = day.sellers.get(name); if (!s) { s = { sales: 0, orders: 0, qty: 0 }; day.sellers.set(name, s); }
    s.sales += amt; s.orders += 1; s.qty += q;
  });
  const leadsOfDay = (d) => perf.rows.reduce((a, r) => a + (r.daily[d - 1]?.leads || 0), 0);
  const teamBars = Array.from({ length: dim }, (_, i) => perf.rows.reduce((a, r) => a + (r.daily[i]?.sales || 0), 0));
  const [yy, mm] = month.split('-').map(Number);
  const wd = (d) => TH_DAY[new Date(yy, mm - 1, d).getDay()];
  const todayD = month === curMonth() ? new Date().getDate() : 0;
  const days = [...byDay.entries()].sort((a, b) => b[0] - a[0]);   // วันล่าสุดขึ้นก่อน (กราฟด้านบนเป็นลำดับเวลาอยู่แล้ว)
  const best = Math.max(1, ...days.map(([, v]) => v.sales));

  return (
    <div className="flex flex-col gap-4">
      {/* ภาพรวมทั้งเดือน */}
      <Card className="p-4">
        <div className="text-sm font-semibold mb-1.5">ยอดทีมรายวัน · {monthLabel(month)}</div>
        <ComboChart labels={Array.from({ length: dim }, (_, i) => String(i + 1))} bars={teamBars} barLabel="ยอดขาย" barFmt={fmtB} height={150} />
      </Card>

      {/* สมุดบันทึกรายวัน — โชว์เฉพาะวันที่มียอด */}
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-muted/20 text-sm">
          <b>บันทึกรายวัน</b> <span className="text-xs text-muted-foreground">· {days.length} วันที่มียอด — คลิกเซลล์เพื่อดูออเดอร์รายตัว</span>
        </div>
        {!days.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">ยังไม่มียอดเดือนนี้</div>
        ) : days.map(([d, v]) => {
          const leads = leadsOfDay(d);
          return (
            <div key={d} className="border-b last:border-b-0">
              {/* หัววัน */}
              <div className="flex items-center gap-x-4 gap-y-1 px-4 py-2 bg-muted/30 flex-wrap">
                <div className="flex items-center gap-2 w-[130px] shrink-0">
                  <b className="text-sm">{d} {TH_MON[mm - 1]}</b>
                  <span className="text-[11px] text-muted-foreground">{wd(d)}</span>
                  {d === todayD && <Badge variant="secondary" className="px-1.5 py-0 text-[10px] bg-[var(--accent-soft)] text-[var(--accent-2)]">วันนี้</Badge>}
                </div>
                <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden hidden sm:block">
                  <div className="h-full rounded-full" style={{ width: (v.sales / best * 100) + '%', background: 'var(--accent)' }} />
                </div>
                <span className="num text-sm font-bold">{fmtB(v.sales)}</span>
                <span className="text-xs text-muted-foreground">{N(v.orders)} ออเดอร์ · {N(v.qty)} ตัว{leads > 0 ? ` · คนทัก ${N(leads)}` : ''}</span>
              </div>
              {/* เซลล์ในวันนั้น — คลิกเปิดออเดอร์รายตัว */}
              {[...v.sellers.entries()].sort((a, b) => b[1].sales - a[1].sales).map(([name, s]) => (
                <div key={name} onClick={() => onOpenDay(name, d)} className="flex items-center gap-3 pl-6 pr-4 py-2 hover:bg-muted/40 cursor-pointer transition-colors">
                  <span className="grid place-items-center rounded-full size-6 text-[10px] font-bold shrink-0" style={{ background: name === NO_SELLER ? 'var(--surface-3)' : 'var(--accent-soft)', color: name === NO_SELLER ? 'var(--ink-3)' : 'var(--accent-2)' }}>{name === NO_SELLER ? '?' : initialOf(name)}</span>
                  <span className="text-sm font-medium flex-1 truncate">{name === NO_SELLER ? 'ไม่ระบุเซลล์' : name}</span>
                  <span className="num text-sm font-semibold">{fmtB(s.sales)}</span>
                  <span className="text-xs text-muted-foreground w-[120px] text-right hidden sm:inline">{N(s.orders)} ออเดอร์ · {N(s.qty)} ตัว</span>
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-[var(--accent-2)] font-medium shrink-0">ดูออเดอร์ <Icon name="chevR" className="size-3.5" /></span>
                </div>
              ))}
            </div>
          );
        })}
      </Card>
    </div>
  );
}

/* ---- Drawer: เซลล์รายคน (กราฟรายวัน + ช่องทาง + ลายขายดี + ใบเสร็จ) ---- */
function SpDetail({ sp, month }) {
  const labels = sp.daily.map(d => String(d.day));
  const chEntries = Object.entries(sp.channels).sort((a, b) => b[1] - a[1]);
  const donut = chEntries.map(([k, v]) => ({ label: k, value: v, color: channelColor(k) }));
  const designs = Object.entries(sp.designs).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ label: k, value: v }));
  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">{sp.name}
          {sp.dSales != null && <Badge variant="secondary" className={sp.dSales >= 0 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/15 text-red-600 dark:text-red-400'}>{sp.dSales >= 0 ? '▲' : '▼'} {Math.abs(Math.round(sp.dSales))}%</Badge>}
        </SheetTitle>
      </SheetHeader>
      <div className="flex flex-col gap-4 mt-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[['ยอดขาย', fmtB(sp.sales)], ['ออเดอร์', N(sp.orders)], ['ตัว', N(sp.qty)], ['AOV', fmtB(sp.aov)], ['คนทัก', N(sp.leads)], ['%ปิด', sp.closeRate == null ? '—' : Math.round(sp.closeRate) + '%']].map(([l, v]) => (
            <div key={l} className="rounded-lg border p-2"><div className="text-[11px] text-muted-foreground">{l}</div><div className="font-bold">{v}</div></div>
          ))}
        </div>
        {sp.target > 0 && (
          <div className="flex items-center gap-4 rounded-lg border p-3">
            <div className="shrink-0" style={{ width: 120 }}><Gauge value={sp.pctTarget} max={100} label="ของเป้า" sub={Math.round(sp.pctTarget) + '%'} height={110} /></div>
            <div className="text-sm min-w-0">
              <div>เป้าเดือนนี้ <b>{fmtB(sp.target)}</b></div>
              <div className="text-muted-foreground mt-0.5">ทำได้ {fmtB(sp.sales)}{sp.comm ? ` · คอม ${fmtB(sp.comm)}` : ''}</div>
              <div className="text-muted-foreground">คาดสิ้นเดือน {fmtB(sp.projected)}</div>
            </div>
          </div>
        )}
        <div>
          <div className="text-sm font-semibold mb-1">ยอด &amp; คนทัก รายวัน</div>
          <ComboChart labels={labels} bars={sp.daily.map(d => d.sales)} line={sp.daily.map(d => d.leads)} barLabel="ยอดขาย" lineLabel="คนทัก" barFmt={fmtB} height={200} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {donut.length > 0 && <div><div className="text-sm font-semibold mb-1">ช่องทาง</div><DonutChart data={donut} height={170} /></div>}
          {designs.length > 0 && <div><div className="text-sm font-semibold mb-1">ลายขายดี (ตัว)</div><HBars data={designs} height={170} unit=" ตัว" /></div>}
        </div>
        {sp.receipts.length > 0 && (
          <div>
            <div className="text-sm font-semibold mb-1">ใบเสร็จเดือนนี้ ({sp.receipts.length})</div>
            <CardTable className="rounded-lg border overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground sticky top-0"><tr><th className="text-left px-2 py-1">เลขที่</th><th className="text-left px-2 py-1">วันที่</th><th className="text-left px-2 py-1">ลูกค้า</th><th className="text-right px-2 py-1">ยอด</th></tr></thead>
                <tbody>{sp.receipts.slice().sort((a, b) => String(b.order_date).localeCompare(String(a.order_date))).map(r => (
                  <tr key={r.order_no} className="border-t"><td className="px-2 py-1 font-mono cell-title">{r.order_no}</td><td className="px-2 py-1">{String(r.order_date || '').slice(8, 10)}/{String(r.order_date || '').slice(5, 7)}</td><td className="px-2 py-1">{r.confirmed?.customer_name || '—'}</td><td className="px-2 py-1 text-right">{fmtB(r.sales)}</td></tr>
                ))}</tbody>
              </table>
            </CardTable>
          </div>
        )}
      </div>
    </>
  );
}

/* ---- Drill-down รายวัน: ออเดอร์รายตัวของเซลล์ในวันนั้น (ตรวจสอบ/คิดคอม) ---- */
function DaySellerDetail({ name, day, month, orders, skus, target, onOpenMonth }) {
  // ออเดอร์ของเซลล์คนนี้ในวันนี้ (ตัดยกเลิก) เรียงยอดมาก→น้อย
  const ords = (orders || []).filter(o => !isCancelled(o) && spOf(o) === name && dayOf(o.order_date) === day)
    .sort((a, b) => (Number(b.sales) || 0) - (Number(a.sales) || 0));
  // index sku ต่อ order_no (line items ลาย/สี/ไซซ์/ยอด)
  const skuBy = new Map();
  (skus || []).forEach(k => { const arr = skuBy.get(k.order_no) || []; arr.push(k); skuBy.set(k.order_no, arr); });
  const sales = ords.reduce((s, o) => s + (Number(o.sales) || 0), 0);
  const qty = ords.reduce((s, o) => s + (Number(o.qty) || 0), 0);
  const newC = ords.filter(o => o.customer_type === 'ลูกค้าใหม่').length;
  const comm = target ? commissionFor(sales, target) : 0;
  const tierMode = target && Array.isArray(target.tiers) && target.tiers.length;
  const rate = target && !tierMode ? Number(target.commission_rate) || 0 : null;
  const jobColor = { DFT: 'var(--info)', OEM: 'var(--accent-2)' };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2 flex-wrap">
          <span className="grid place-items-center rounded-full size-8 text-xs font-bold shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent-2)' }}>{initialOf(name)}</span>
          {name === NO_SELLER ? 'ไม่ระบุเซลล์' : name}
          <Badge variant="secondary">วันที่ {day} {monthLabel(month)}</Badge>
        </SheetTitle>
      </SheetHeader>

      <div className="flex flex-col gap-4 mt-3">
        {/* สรุปวัน */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          {[['ยอดวันนี้', fmtB(sales)], ['ออเดอร์', N(ords.length)], ['จำนวนตัว', N(qty)], ['ลูกค้าใหม่', N(newC)]].map(([l, v]) => (
            <div key={l} className="rounded-lg border p-2"><div className="text-[11px] text-muted-foreground">{l}</div><div className="font-bold">{v}</div></div>
          ))}
        </div>
        {/* คอมของวัน (ประมาณ) — คิดจากยอดวันนี้ × เรต · หมายเหตุ: คอมจริงคิดจากยอดรวมทั้งเดือน */}
        {target && (
          <div className="rounded-lg border p-3 text-sm flex items-center gap-3 flex-wrap" style={{ background: 'color-mix(in srgb, var(--accent) 5%, transparent)' }}>
            <div><div className="text-[11px] text-muted-foreground">คอมประมาณ (จากยอดวันนี้)</div><div className="font-bold text-[var(--accent-2)]">{fmtB(comm)}</div></div>
            <div className="text-xs text-muted-foreground">{tierMode ? 'เรตขั้นบันได — ตามยอดสะสม' : `เรต ${rate}%`} · เป้าเดือน {fmtB(Number(target.sales_target) || 0)}</div>
            {onOpenMonth && <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={onOpenMonth}>สรุปเดือน <Icon name="chevR" className="size-3.5" /></Button>}
          </div>
        )}

        {/* รายการออเดอร์รายตัว + line items */}
        <div>
          <div className="text-sm font-semibold mb-1.5">ออเดอร์วันนี้ ({ords.length})</div>
          {ords.length === 0 ? (
            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">ไม่มีออเดอร์ของเซลล์คนนี้ในวันนี้</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {ords.map(o => {
                const lines = skuBy.get(o.order_no) || [];
                const isCod = /cod|ปลายทาง/i.test(String(o.payment_type || ''));
                return (
                  <div key={o.order_no} className="rounded-lg border overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 flex-wrap">
                      <span className="font-mono text-xs font-bold">{o.order_no}</span>
                      {o.channel && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: channelColor(o.channel) + '22', color: channelColor(o.channel) }}>{o.channel}</span>}
                      <span className="text-sm truncate max-w-[160px]">{o.customer_name || '—'}</span>
                      {o.customer_type === 'ลูกค้าใหม่' && <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] px-1.5 py-0">ใหม่</Badge>}
                      {o.job_type && o.job_type !== 'ปลีก' && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: (jobColor[o.job_type] || 'var(--ink-3)') + '1a', color: jobColor[o.job_type] || 'var(--ink-3)' }}>{o.job_type}</span>}
                      <span className="ml-auto font-bold whitespace-nowrap">{fmtB(o.sales)}</span>
                    </div>
                    {lines.length > 0 && (
                      <table className="w-full text-xs">
                        <tbody>
                          {lines.map((k, i) => (
                            <tr key={k.id || i} className="border-t border-border/50">
                              <td className="px-3 py-1.5">{(k.design && String(k.design).trim()) || k.product_code || 'ไม่ระบุลาย'}</td>
                              <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{[k.color, k.size].filter(Boolean).join(' · ') || '—'}</td>
                              <td className="px-2 py-1.5 text-right whitespace-nowrap">×{N(k.qty)}</td>
                              <td className="px-3 py-1.5 text-right whitespace-nowrap">{k.line_sales != null ? fmtB(k.line_sales) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border/50 text-[11px] text-muted-foreground flex-wrap">
                      <span>จำนวน {N(o.qty)} ตัว</span>
                      <span>ชำระ: {isCod ? `COD ${fmtB(o.cod_amount || o.sales)}` : (o.payment_type || 'โอน')}</span>
                      {o.province && <span>· {o.province}</span>}
                      {o.note && <span className="truncate max-w-[200px]">· {o.note}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
