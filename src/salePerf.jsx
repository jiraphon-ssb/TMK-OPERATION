/* ============================================================
   TMK Operation — "ประสิทธิภาพเซลล์" (Salesperson Performance)
   ============================================================
   รายเดือน + รายวัน ละเอียดต่อคน — แยกรายคน (แบบหน้าออเดอร์/ส่งยอด · roleAccess):
   แอดมินเห็นทั้งทีม · เซลล์ (editor/viewer) เห็นเฉพาะของตัวเอง (salesperson = ชื่อ/อีเมล)
   - แหล่งข้อมูลเดียวกับรายงานขาย: tmk_mp_orders (ตัด cancelled) + tmk_sales_funnel + targets + tmk_sale_receipts
   - เทียบเดือนก่อน (▲▼%) + Sparkline/Heatmap แนวโน้มรายวัน (Q&A เลือก)
   - realtime: ส่งใบ/กรอกคนทัก → หน้านี้ขยับสด (useSaleRealtime)
   ============================================================ */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Icon, N, useBeat, PersonAvatar, SourceBadge, InfoTip } from './components.jsx';
import { supabase } from './lib/supabaseClient.js';
import {
  cachedFetchRange, cachedFetchAll, ORDERS_SEL, SKUS_SEL, OVERRIDES_SEL, funnelTotal, funnelNewOld,
} from './lib/saleData.js';
import { makeSkuResolver, loadResolverMaps } from './lib/designResolve.js';
import { mergeOrderOverrides } from './lib/saleOverrides.js';
import { fetchTargets, commissionFor, commissionDisplay } from './lib/targets.js';
import { useUser } from './userContext.jsx';
import { isAdmin, myNamesOf, orderVisibleTo } from './lib/roleAccess.js';
import { fmtBaht } from './lib/money.js';
import { useRenderCount } from './realtime/useRenderCount.js';
import { buildPerf, NO_SELLER, curMonth, daysInMonth, dayOf, isCancelled, spOf, deltaPct } from './lib/salePerfAgg.js';
import { useSaleLiveReload } from './lib/useSaleLive.js';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { SideSheet } from './modals-core.jsx';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { MonthPicker } from './components/MonthPicker.jsx';
import { OrderCard, daySummary, DayTiles, isCodOrder, useOrderFinancials, finOf } from './orderCard.jsx';
import { CustomerDrawer, custFromOrders } from './customerDrawer.jsx';
import { usePersistedState } from './hooks/usePersistedState.js';
import { ComboChart, DonutChart, HBars, Sparkline, channelColor } from './charts.jsx';

// เงินบาท — ใช้ตัวกลาง fmtBaht (decimal-aware · ไม่ตัดทศนิยมยอดขาย/AOV/คอม) · 0 → ฿0 (ไม่ใช่ '—')
const fmtB = (n) => fmtBaht(Number(n) || 0);
const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const monthLabel = (ym) => { const [y, m] = ym.split('-'); return `${TH_MON[Number(m) - 1] || m} ${Number(y) + 543}`; };
const prevMonthOf = (ym) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const MEDAL = ['#e3b341', '#b8c0cc', '#cd8b5e'];   // ทอง/เงิน/ทองแดง
const closeTone = (v) => v == null ? 'var(--ink-4)' : v >= 15 ? 'var(--good)' : v >= 8 ? 'var(--warn)' : 'var(--bad)';
const dPill = (d) => d == null ? null : (
  <span className={`text-[11px] font-medium ${d >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{d >= 0 ? '▲' : '▼'} {Math.abs(Math.round(d))}%</span>
);
/* คนทัก = การ์ดย่อย (tiles: ทักรวม/ใหม่/เก่า/%ปิด) — อ่านง่าย · โชว์เสมอแม้ 0 + hint · compact สำหรับการ์ดเซลล์ */
function LeadPanel({ total = 0, nw = 0, old = 0, close = null, title = 'คนทัก', compact = false }) {
  const tiles = [
    ['ทักรวม', N(total), 'var(--ink)'],
    ['ใหม่', N(nw), 'var(--good)'],
    ['เก่า', N(old), 'var(--ink-3)'],
    ['%ปิด', close == null ? '—' : Math.round(close) + '%', closeTone(close)],
  ];
  const pad = compact ? 'py-1 px-0.5' : 'py-1.5 px-1';
  const vsz = compact ? 'text-[13px]' : 'text-base';
  return (
    <div>
      {title && <div className="text-[11px] text-muted-foreground mb-1">{title}</div>}
      <div className={`grid grid-cols-4 ${compact ? 'gap-1' : 'gap-2'}`}>
        {tiles.map(([l, v, c]) => (
          <div key={l} className={`rounded-lg border ${pad} text-center`} style={{ borderColor: 'var(--line)' }}>
            <div className="text-[10px] text-muted-foreground leading-tight">{l}</div>
            <div className={`num font-bold leading-tight ${vsz}`} style={{ color: c }}>{v}</div>
          </div>
        ))}
      </div>
      {!total && <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">ยังไม่กรอกคนทัก — กรอกในหน้าส่งยอด</div>}
    </div>
  );
}

/* Skeleton หน้าประสิทธิภาพเซลล์ — ตรงเลย์เอาต์จริง (การ์ดทีม/คนทัก/กราฟ/การ์ดเซลล์) · bodyOnly = ใต้ header จริง */
// shadcn <Skeleton> (shimmer .skel) — ให้ลุคตรงกับ skeleton หน้าอื่นทั้งแอป
const Sk = ({ className }) => <Skeleton className={className} />;
function PerfSkeleton({ bodyOnly = false }) {
  const body = (
    <div className="flex flex-col gap-4">
      {/* การ์ดทีมบน 3 ใบ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[0, 1, 2].map(i => <div key={i} className="rounded-xl border p-3 flex flex-col gap-2"><Sk className="h-3 w-16" /><Sk className="h-6 w-24" /></div>)}
      </div>
      {/* คนทัก panel (4 tiles) */}
      <div className="rounded-xl border p-3 flex flex-col gap-2">
        <Sk className="h-3 w-24" />
        <div className="grid grid-cols-4 gap-2">{[0, 1, 2, 3].map(i => <div key={i} className="rounded-lg border p-2 flex flex-col items-center gap-1.5"><Sk className="h-2.5 w-10" /><Sk className="h-4 w-8" /></div>)}</div>
      </div>
      {/* กราฟแนวโน้ม */}
      <div className="rounded-xl border p-4 flex flex-col gap-3"><Sk className="h-3 w-40" /><Sk className="h-[200px] w-full rounded-xl" /></div>
      {/* การ์ดเซลล์ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="rounded-2xl border p-4 flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5"><Sk className="size-9 rounded-full" /><div className="flex-1 flex flex-col gap-1.5"><Sk className="h-3 w-24" /><Sk className="h-2 w-16" /></div></div>
            <Sk className="h-7 w-32" /><Sk className="h-1.5 w-full rounded-full" />
            <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map(j => <div key={j} className="flex flex-col items-center gap-1.5"><Sk className="h-2.5 w-8" /><Sk className="h-3.5 w-10" /></div>)}</div>
            <div className="grid grid-cols-4 gap-1.5">{[0, 1, 2, 3].map(j => <Sk key={j} className="h-9 rounded-lg" />)}</div>
          </div>
        ))}
      </div>
    </div>
  );
  if (bodyOnly) return body;
  return (
    <div className="content-inner rise flex flex-col gap-4">
      <div className="rounded-xl border p-4 flex items-center gap-2 flex-wrap"><Sk className="h-5 w-32" /><Sk className="h-8 w-28 rounded-full" /><Sk className="h-8 w-40 rounded-full sm:ml-auto" /></div>
      {body}
    </div>
  );
}

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
/* ---- การ์ดเซลล์รายคน (โหมด default แท็บรายเดือน) — คลิกเปิด drawer เดิม ---- */
function SellerCard({ r, rank, share, onOpen, cmp }) {
  const noSeller = r.name === NO_SELLER;
  const medal = rank < 3 ? MEDAL[rank] : null;
  const cd = commissionDisplay(r); // decision เป้า/คอม (แยก test ได้ · lib/targets)
  return (
    <div onClick={onOpen}
      className="group relative rounded-2xl border bg-card p-4 flex flex-col gap-3.5 cursor-pointer overflow-hidden transition-all hover:shadow-lg hover:shadow-black/[0.04] hover:-translate-y-0.5"
      style={medal ? { borderColor: `color-mix(in srgb, ${medal} 45%, var(--line))` } : undefined}>
      {/* แถบสีอันดับด้านบน (เหรียญ 1-3) */}
      {medal && <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${medal}, color-mix(in srgb, ${medal} 30%, transparent))` }} />}
      {/* หัว: อันดับ + avatar + ชื่อ + Δ */}
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center size-6 rounded-lg text-[11px] font-extrabold shrink-0"
          style={medal ? { background: `color-mix(in srgb, ${medal} 16%, transparent)`, color: medal } : { background: 'var(--surface-2)', color: 'var(--ink-4)' }}>{rank + 1}</span>
        {noSeller
          ? <span className="grid place-items-center rounded-full size-9 shrink-0 ring-2 ring-card" style={{ background: 'var(--surface-3)', color: 'var(--ink-3)' }}><Icon name="external" className="size-4" /></span>
          : <PersonAvatar name={r.name} size={36} className="shrink-0 ring-2 ring-card" />}
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate leading-tight">{noSeller ? 'ไม่ระบุเซลล์' : r.name}</div>
          {noSeller && <div className="text-[10px] text-muted-foreground">มาร์เก็ตเพลส</div>}
        </div>
        {dPill(cmp ? cmp.sales : r.dSales)}
      </div>
      {/* ยอดขาย + ส่วนแบ่งทีม */}
      <div>
        <div className="num text-[26px] font-extrabold leading-none tracking-tight" style={{ color: 'var(--accent-2)' }}>{fmtB(r.sales)}</div>
        <div className="mt-2 h-1.5 rounded-full bg-muted/70 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: Math.min(100, share) + '%', background: 'linear-gradient(90deg, var(--accent), var(--accent-2))' }} /></div>
        <div className="text-[11px] text-muted-foreground mt-1">{Math.round(share)}% ของยอดทีม</div>
      </div>
      {/* สถิติ 3 ช่อง */}
      <div className="grid grid-cols-3 rounded-xl bg-muted/40 divide-x divide-border/60 text-center overflow-hidden">
        {[['ออเดอร์', N(r.orders), cmp?.orders], ['ตัว', N(r.qty), cmp?.qty], ['AOV', fmtB(r.aov), cmp?.aov]].map(([l, v, d]) => (
          <div key={l} className="py-1.5 px-1"><div className="text-[10px] text-muted-foreground">{l}</div><div className="num text-sm font-bold leading-tight">{v}</div>{d != null && <div className="mt-0.5 leading-none">{dPill(d)}</div>}</div>
        ))}
      </div>
      <LeadPanel compact title="" total={r.leads} nw={r.newOld?.new || 0} old={r.newOld?.old || 0} close={r.closeRate} />
      {cd.mode === 'target' ? (
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">เป้า {fmtB(r.target)}</span>
            <b className="num" style={{ color: r.sales >= r.target ? 'var(--good)' : undefined }}>{Math.round(r.pctTarget)}%{r.sales >= r.target ? ' 🎉' : ''}</b>
          </div>
          <Progress value={Math.min(100, r.pctTarget)} className="h-1.5" indicatorColor={r.sales >= r.target ? 'var(--good)' : 'var(--accent)'} />
          {r.comm > 0 && <div className="text-xs mt-1.5 text-muted-foreground">คอม <b className="num" style={{ color: 'var(--accent-2)' }}>{fmtB(r.comm)}</b> {cmp?.comm != null && dPill(cmp.comm)}</div>}
        </div>
      ) : cd.mode === 'commOnly' ? (
        /* ไม่มีเป้ายอด แต่ตั้ง % คอมไว้ → คิดคอมจากยอดขายทั้งหมด × เรต (ไม่มีแถบเป้า) */
        <div className="text-xs text-muted-foreground">
          คอม <b className="num" style={{ color: 'var(--accent-2)' }}>{fmtB(cd.comm)}</b>
          <span className="ml-1">· {cd.rateLabel}</span>
          {cmp?.comm != null && <> {dPill(cmp.comm)}</>}
        </div>
      ) : (!noSeller && window.__canEdit !== false && (
        <button type="button" className="text-xs text-muted-foreground hover:text-[var(--accent-2)] text-left w-fit transition-colors"
          onClick={(e) => { e.stopPropagation(); window.__goSection?.('settings', 'targets'); }}>+ ตั้งเป้า/คอม</button>
      ))}
      <div className="mt-auto pt-2.5 border-t border-border/50 flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">แนวโน้มรายวัน</span>
        <Sparkline data={r.daily.map(d => d.sales)} w={150} h={26} />
      </div>
    </div>
  );
}


/* ---- HERO C: แนวโน้มรายวัน — ยอด(แท่ง) + คนทัก(เส้น) ทับกัน ---- */
function TrendCard({ rows, dim, month, onOpenDay, prevSeries, prevLabel }) {
  const bars = Array.from({ length: dim }, (_, i) => rows.reduce((a, r) => a + (r.daily[i]?.sales || 0), 0));
  const line = Array.from({ length: dim }, (_, i) => rows.reduce((a, r) => a + (r.daily[i]?.leads || 0), 0));
  const hasLeads = line.some(v => v > 0);
  const hasCmp = prevSeries && prevSeries.some(v => v > 0);
  return (
    <Card className="p-4">
      <div className="text-sm font-semibold mb-1.5">แนวโน้มรายวัน · {monthLabel(month)} <span className="text-xs font-normal text-muted-foreground">— ยอดขาย (แท่ง){hasCmp ? ' · เดือนก่อน (แท่งจาง)' : ''}{hasLeads ? ' + คนทัก (เส้น)' : ''} · คลิกวันเพื่อดูออเดอร์</span></div>
      <ComboChart labels={Array.from({ length: dim }, (_, i) => String(i + 1))} bars={bars} line={hasLeads ? line : undefined} cmpBars={hasCmp ? prevSeries : undefined} cmpLabel={prevLabel || 'เดือนก่อน'} barLabel="ยอดขาย" lineLabel="คนทัก" barFmt={fmtB} height={160} onDayClick={onOpenDay ? (i) => onOpenDay(i + 1) : undefined} />
    </Card>
  );
}

/* ---- โซโล่: แผงเจาะลึกคนเดียว (ช่องทาง/ลาย/ลูกค้าท็อป) + ปุ่มดูเต็ม ---- */
function DeepPanel({ r, onOpen }) {
  const donut = Object.entries(r.channels).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v, color: channelColor(k) }));
  const designs = Object.entries(r.designs).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ label: k, value: v }));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">เจาะลึก · {r.name === NO_SELLER ? 'ไม่ระบุเซลล์' : r.name}</span>
        <span className="text-xs text-muted-foreground">ขายจริง {N(r.daysActive)} วัน</span>
        <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={onOpen}>ดูรายละเอียดเต็ม <Icon name="chevR" className="size-3.5" /></Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {donut.length > 0 && <Card className="p-4"><div className="text-sm font-semibold mb-1">ช่องทาง</div><DonutChart data={donut} height={180} /></Card>}
        {designs.length > 0 && <Card className="p-4"><div className="text-sm font-semibold mb-1">ลายขายดี (ตัว)</div><HBars data={designs} height={180} unit=" ตัว" /></Card>}
      </div>
    </div>
  );
}

export function SalePerfView() {
  useRenderCount('salePerf'); // Phase 0 baseline (dev-only)
  const beat = useBeat(350);
  // แยกรายคน: admin เห็นทั้งทีม · เซลล์เห็นเฉพาะของตัวเอง — reactive useUser (ไม่ใช้ window.__isAdmin ที่ lag first render)
  const { user } = useUser();
  const canSeeAll = isAdmin(user);
  const mineSet = useMemo(() => new Set(myNamesOf(user)), [user]);
  const [month, setMonth] = useState(curMonth());
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ orders: [], skus: [], funnel: [], receipts: [], prevFull: null });
  const [maps, setMaps] = useState(null);   // resolver maps (catalog/alias/override/version) — ชื่อลาย resolve สด
  const [targets, setTargets] = useState({});
  const [detail, setDetail] = useState(null);   // เซลล์ที่เปิด drawer (รายเดือน)
  // เครื่องมือ: ค้นหา/ตัวกรอง/คอลัมน์/ความหนาแน่น (จำค่า localStorage)
  const [q, setQ] = useState('');
  const [channelF, setChannelF] = useState([]);
  const [onlyTargets, setOnlyTargets] = useState(false);
  const [hideNoSeller, setHideNoSeller] = usePersistedState('tmk-perf-hidenoseller', false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // เทียบเดือนก่อน = อัตโนมัติเสมอ · เดือนปัจจุบันเทียบช่วงเดียวกัน (MTD 1–วันนี้) · เดือนเก่า = เต็มเดือน
  const [prevTargets, setPrevTargets] = useState({});

  const load = useCallback(async (force = false) => {
    if (!force) setLoading(true);   // realtime refetch (force) = อัปเดตในที่ ไม่ต้องล้างเป็น skeleton (กันจอกระพริบ)
    try {
      const from = `${month}-01`, to = `${month}-${daysInMonth(month)}`;
      const pm = prevMonthOf(month), pFrom = `${pm}-01`, pTo = `${pm}-${daysInMonth(pm)}`;
      // กัน skeleton ค้าง: ถ้า fetch ค้าง (เน็ต/auth หลุด) → timeout 15 วิ → เข้า catch → เลิก skeleton โชว์ empty
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000));
      const base = [
        cachedFetchRange('tmk_mp_orders', ORDERS_SEL, from, to, 'order_date', force),
        cachedFetchRange('tmk_mp_skus', SKUS_SEL, from, to, 'order_date', force),
        supabase.from('tmk_sales_funnel').select('*').gte('date', from).lte('date', to),
        supabase.from('tmk_sale_receipts').select('order_no,salesperson,sales,qty,order_date,status,channel').eq('order_month', month),
        fetchTargets(month),
        // override ระดับออเดอร์ (แก้เซลล์/ยอดในเว็บ) — เดิมหน้านี้ "ลืม" merge → leaderboard ไม่ตรง dashboard/ออเดอร์
        cachedFetchAll('tmk_order_overrides', OVERRIDES_SEL),
      ];
      // เทียบเดือนก่อนอัตโนมัติ: ดึงเดือนก่อนแบบเต็ม (orders/skus/funnel/targets) เสมอ เพื่อคำนวณ delta ครบทุกค่า
      const cmp = [
        cachedFetchRange('tmk_mp_orders', ORDERS_SEL, pFrom, pTo, 'order_date', force),
        cachedFetchRange('tmk_mp_skus', SKUS_SEL, pFrom, pTo, 'order_date', force),
        supabase.from('tmk_sales_funnel').select('*').gte('date', pFrom).lte('date', pTo),
        fetchTargets(pm),
      ];
      const [ordersR, skusR, funnelR, receiptsR, tg, ovR, pOrdersR, pSkusR, pFunnelR, pTg] =
        await Promise.race([timeout, Promise.all([...base, ...cmp])]);
      const tmap = {}; (tg || []).forEach(t => { tmap[t.salesperson] = t; }); setTargets(tmap);
      const ptmap = {}; (pTg || []).forEach(t => { ptmap[t.salesperson] = t; }); setPrevTargets(ptmap);
      // map override (order_id = "source:order_no") แล้ว merge ทับ orders ปัจจุบัน + เดือนก่อน (เต็ม) — ให้ตรง dashboard
      const ovMap = {}; if (ovR && !ovR.error) (ovR.data || []).forEach(x => { ovMap[x.order_id] = x; });
      setData({
        orders: mergeOrderOverrides(ordersR.data || [], ovMap), skus: skusR.data || [],
        funnel: funnelR.data || [], receipts: receiptsR.data || [],
        prevFull: { orders: mergeOrderOverrides(pOrdersR?.data || [], ovMap), skus: pSkusR?.data || [], funnel: pFunnelR?.data || [] },
      });
    } catch { /* ปล่อยว่าง — empty state */ }
    finally { setLoading(false); }
  }, [month]);
  useEffect(() => { load(); }, [load]);
  // resolver maps (catalog/alias/override/version) — โหลดครั้งเดียว ไม่ผูกเดือน · ชื่อลาย resolve สดตามแคตตาล็อก
  useEffect(() => { let live = true; loadResolverMaps(supabase).then(m => { if (live) setMaps(m); }); return () => { live = false; }; }, []);
  useSaleLiveReload(['tmk_sale_receipts', 'tmk_sales_funnel', 'tmk_mp_orders', 'tmk_mp_skus', 'tmk_order_overrides'], () => load(true), { invalidate: ['tmk_mp_orders', 'tmk_mp_skus', 'tmk_order_overrides', 'tmk_sales_funnel'] });

  // ช่องทางทั้งหมด (ทำ option ตัวกรอง) — เซลล์เห็นเฉพาะช่องทางที่ตัวเองมียอด
  const channels = useMemo(() => [...new Set((data.orders || []).filter(o => canSeeAll || orderVisibleTo(o, user)).map(o => o.channel).filter(Boolean))].sort(), [data.orders, canSeeAll, user]);
  // ชื่อลาย resolve สด (catalog→alias→golden→frozen + as-of) — ตรงแดชบอร์ด/CRM · คง color/size เดิม
  const resolvedSkus = useMemo(() => {
    if (!maps) return data.skus;
    const R = makeSkuResolver(maps);
    return (data.skus || []).map(k => { const r = R(k); return { ...k, design: r.design || k.design, product_code: r.product_code || k.product_code }; });
  }, [data.skus, maps]);
  // กรองช่องทาง + scope "แยกรายคน" → orders/skus ที่กรองแล้ว (ใช้ทั้ง buildPerf + drill-down รายวันรายออเดอร์)
  // scope ที่ต้นทางตรงนี้ (ไม่ใช่ rowsView) — DayDetail/DaySellerDetail รับ ordersF/skusF ตรง → ไม่รั่วออเดอร์คนอื่นตอนเจาะรายวัน
  const { ordersF, skusF } = useMemo(() => {
    const chSet = channelF.length ? new Set(channelF) : null;
    let os = chSet ? data.orders.filter(o => chSet.has(o.channel)) : data.orders;
    if (!canSeeAll) os = os.filter(o => orderVisibleTo(o, user));      // predicate เดียวกับหน้าออเดอร์
    let ks = chSet ? resolvedSkus.filter(k => chSet.has(k.channel)) : resolvedSkus;
    if (!canSeeAll) { const keep = new Set(os.map(o => o.order_no)); ks = ks.filter(k => keep.has(k.order_no)); } // sku ไม่มี salesperson — join ผ่าน order_no
    return { ordersF: os, skusF: ks };
  }, [data.orders, resolvedSkus, channelF, canSeeAll, user]);
  // funnel/receipts มี field salesperson (ชื่อ staff) เหมือน orders → กรองด้วย mineSet
  const funnelF = useMemo(() => canSeeAll ? data.funnel : (data.funnel || []).filter(f => mineSet.has(f.salesperson)), [data.funnel, canSeeAll, mineSet]);
  const receiptsF = useMemo(() => canSeeAll ? data.receipts : (data.receipts || []).filter(r => mineSet.has(r.salesperson)), [data.receipts, canSeeAll, mineSet]);
  const prevOrdersF = useMemo(() => {
    const po = data.prevFull?.orders || [];
    return canSeeAll ? po : po.filter(o => orderVisibleTo(o, user));
  }, [data.prevFull, canSeeAll, user]);
  // prev = prevFull.orders (merge override แล้ว) → MoM delta ต่อเซลล์สะท้อน override ตรงกับ dashboard (เดิมใช้ prevOrders select แคบ merge ไม่ได้)
  const perf = useMemo(() => buildPerf(month, ordersF, skusF, funnelF, receiptsF, targets, prevOrdersF),
    [month, ordersF, skusF, funnelF, receiptsF, targets, prevOrdersF]);
  // โหมดเทียบเดือนก่อน: กรองช่องทาง + clamp วัน (MTD) แล้วรัน buildPerf รอบ 2
  const isCurMonth = month === curMonth();
  const daysPassed = isCurMonth ? Math.min(new Date().getDate(), daysInMonth(month)) : daysInMonth(month);
  const mtdClamp = isCurMonth;   // เดือนปัจจุบัน = เทียบช่วงเดียวกัน (1–วันนี้) เสมอ · เดือนเก่า = เต็มเดือน
  const perfPrev = useMemo(() => {
    if (!data.prevFull) return null;
    const pm = prevMonthOf(month);
    const chSet = channelF.length ? new Set(channelF) : null;
    const clampDay = mtdClamp ? daysPassed : Infinity;
    // scope เดือนก่อนด้วยกติกาเดียวกัน — delta/กราฟเทียบไม่รั่วยอดคนอื่น
    let po = data.prevFull.orders.filter(o => (!chSet || chSet.has(o.channel)) && dayOf(o.order_date) <= clampDay);
    if (!canSeeAll) po = po.filter(o => orderVisibleTo(o, user));
    let ps = data.prevFull.skus.filter(k => (!chSet || chSet.has(k.channel)) && dayOf(k.order_date) <= clampDay);
    if (!canSeeAll) { const keep = new Set(po.map(o => o.order_no)); ps = ps.filter(k => keep.has(k.order_no)); }
    let pf = data.prevFull.funnel.filter(f => dayOf(f.date) <= clampDay);
    if (!canSeeAll) pf = pf.filter(f => mineSet.has(f.salesperson));
    return buildPerf(pm, po, ps, pf, [], prevTargets, []);
  }, [data.prevFull, channelF, mtdClamp, daysPassed, month, prevTargets, canSeeAll, user, mineSet]);
  // delta ต่อเซลล์ (ยอด/ออเดอร์/ตัว/AOV/คอม/คนทัก/%ปิด) — เทียบ perf กับ perfPrev (match ด้วยชื่อ)
  const deltasByName = useMemo(() => {
    const m = new Map();
    if (!perfPrev) return m;
    const prevByName = new Map(perfPrev.rows.map(r => [r.name, r]));
    perf.rows.forEach(r => {
      const p = prevByName.get(r.name);
      m.set(r.name, {
        sales: deltaPct(r.sales, p?.sales || 0), orders: deltaPct(r.orders, p?.orders || 0),
        qty: deltaPct(r.qty, p?.qty || 0), aov: deltaPct(r.aov, p?.aov || 0),
        comm: deltaPct(r.comm, p?.comm || 0), leads: deltaPct(r.leads, p?.leads || 0),
        closeRate: deltaPct(r.closeRate || 0, p?.closeRate || 0),
      });
    });
    return m;
  }, [perf, perfPrev]);
  const [dayDrill, setDayDrill] = useState(null);   // { name, day } — เซลล์+วันที่เปิดดูออเดอร์รายตัว (drill-down รายวัน)
  const [dayAll, setDayAll] = useState(null);       // วันที่ (number) — คลิกจากกราฟ → ป๊อปอัพออเดอร์ทั้งวัน
  const [custDrill, setCustDrill] = useState(null); // กดชื่อลูกค้าบนการ์ดออเดอร์ → drawer ลูกค้า (PART 88)
  // กรอง rows ฝั่งแสดงผล (ค้นหา/เฉพาะมีเป้า/ซ่อนไม่ระบุเซลล์) + คำนวณทีมใหม่ + จัดอันดับตามยอด
  const ql = q.trim().toLowerCase();
  const rowsView = useMemo(() => perf.rows.filter(r =>
    (!ql || r.name.toLowerCase().includes(ql)) &&
    (!onlyTargets || r.target > 0) &&
    (!hideNoSeller || r.name !== NO_SELLER)
  ), [perf.rows, ql, onlyTargets, hideNoSeller]);
  const teamView = useMemo(() => {
    const t = rowsView.reduce((a, r) => ({ sales: a.sales + r.sales, orders: a.orders + r.orders, chatOrders: a.chatOrders + (r.chatOrders || 0), qty: a.qty + r.qty, leads: a.leads + r.leads, newC: a.newC + r.newC, newLeads: a.newLeads + (r.newOld?.new || 0), oldLeads: a.oldLeads + (r.newOld?.old || 0) }), { sales: 0, orders: 0, chatOrders: 0, qty: 0, leads: 0, newC: 0, newLeads: 0, oldLeads: 0 });
    t.closeRate = t.leads > 0 ? t.chatOrders / t.leads * 100 : null;  // ออเดอร์ช่องแชท ÷ คนทัก (ตัดมาร์เก็ตเพลส)
    t.aov = t.orders > 0 ? t.sales / t.orders : 0;
    t.dSales = perf.team.dSales;
    return t;
  }, [rowsView, perf.team.dSales]);
  const rankMap = useMemo(() => { const m = new Map(); [...rowsView].sort((a, b) => b.sales - a.sales).forEach((r, i) => m.set(r.name, i)); return m; }, [rowsView]);
  // แยกยอดโอน/COD ของทีม (จาก ordersF ของเซลล์ที่โชว์อยู่ · ตัดยกเลิก) — ให้การ์ดสรุปบนโชว์เหมือนป๊อปอัพรายวัน
  const teamPay = useMemo(() => {
    const names = new Set(rowsView.map(r => r.name));
    let transfer = 0, cod = 0;
    (ordersF || []).forEach(o => { if (isCancelled(o) || !names.has(spOf(o))) return; const s = Number(o.sales) || 0; if (isCodOrder(o)) cod += s; else if (o.payment_type === 'โอน') transfer += s; });
    return { transfer, cod };
  }, [ordersF, rowsView]);
  const openSp = perf.rows.find(r => r.name === detail) || null;

  const nFilters = channelF.length + (onlyTargets ? 1 : 0) + (hideNoSeller ? 1 : 0);
  const commTotal = useMemo(() => rowsView.reduce((s, r) => s + (r.comm || 0), 0), [rowsView]);
  // delta ทีมรวม (เทียบ teamView ที่แสดงจริง กับทีมเดือนก่อน)
  const teamCmp = useMemo(() => {
    if (!perfPrev) return null;
    const pt = perfPrev.team, prevComm = perfPrev.rows.reduce((s, r) => s + (r.comm || 0), 0);
    return {
      sales: deltaPct(teamView.sales, pt.sales), orders: deltaPct(teamView.orders, pt.orders),
      qty: deltaPct(teamView.qty, pt.qty), comm: deltaPct(commTotal, prevComm),
      leads: deltaPct(teamView.leads, pt.leads || 0), aov: deltaPct(teamView.aov, pt.orders > 0 ? pt.sales / pt.orders : 0),
    };
  }, [perfPrev, teamView, commTotal]);
  // adaptive: ทีมเล็ก (≤1 คนจริง) → โซโล่ (ไม่มีอันดับ/แชร์ · เน้นคนเดียว) · หลายคน → เทียบ/อันดับ
  const realSellers = useMemo(() => rowsView.filter(r => r.name !== NO_SELLER), [rowsView]);
  const soloMode = realSellers.length <= 1;
  const focus = realSellers[0] || rowsView[0] || null;
  // ยอดรวมทีมทั้งเดือน (โชว์ให้เซลล์เห็นตัวเลขรวมเดียว) — จาก data.orders ที่โหลดทั้งทีมไว้แล้ว (ตัดยกเลิก)
  const teamMonthTotal = useMemo(() => {
    const os = (data.orders || []).filter(o => !isCancelled(o));
    return { sales: os.reduce((s, o) => s + (Number(o.sales) || 0), 0), orders: os.length };
  }, [data.orders]);

  if (beat) return <PerfSkeleton />;

  const clearFilters = () => { setChannelF([]); setOnlyTargets(false); setHideNoSeller(false); };

  // ป๊อปอัพ drill รายวัน (ใช้ทั้งหน้ารายชื่อ + หน้าเซลล์เต็ม)
  const drillSheets = (
    <>
      {dayDrill && <SideSheet size="lg" icon="user" title={dayDrill.name === NO_SELLER ? 'ไม่ระบุเซลล์' : dayDrill.name} sub={`วันที่ ${dayDrill.day} ${monthLabel(month)}`} onClose={() => setDayDrill(null)}>
        <DaySellerDetail name={dayDrill.name} day={dayDrill.day} month={month} orders={ordersF} skus={skusF} funnel={funnelF} target={targets[dayDrill.name]} onOpenMonth={() => { const n = dayDrill.name; setDayDrill(null); setDetail(n); }} onPickCustomer={(o) => setCustDrill(custFromOrders(o, ordersF))} />
      </SideSheet>}
      {dayAll && <SideSheet size="lg" icon="calendarDays" title={`วันที่ ${dayAll} ${monthLabel(month)}`} sub="ออเดอร์ทั้งวัน" onClose={() => setDayAll(null)}>
        <DayDetail day={dayAll} month={month} orders={ordersF} skus={skusF} funnel={funnelF} onPickCustomer={(o) => setCustDrill(custFromOrders(o, ordersF))} />
      </SideSheet>}
      {custDrill && <CustomerDrawer cust={custDrill} ords={ordersF} skus={skusF} onClose={() => setCustDrill(null)} />}
    </>
  );

  // เปิดเซลล์ = แสดง "หน้าเต็ม" (ไม่ใช่ popup) — ปุ่มกลับไปหน้ารายชื่อ
  if (openSp) {
    return (
      <div className="content-inner rise flex flex-col gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-1" onClick={() => setDetail(null)}><Icon name="chevL" /> ประสิทธิภาพเซลล์</Button>
          <MonthPicker value={month} onChange={setMonth} max={curMonth()} className="h-8" />
        </div>
        <Card className="p-4 sm:p-5"><SpDetail sp={openSp} month={month} inline cmp={deltasByName.get(openSp.name)} onDay={(day) => setDayDrill({ name: openSp.name, day })} /></Card>
        {drillSheets}
      </div>
    );
  }

  return (
    <div className="content-inner rise flex flex-col gap-4">
      {/* หัว: เครื่องมือแถวเดียว + แถบสรุปทีม inline (เนื้อๆ · ตัวเลข 0 ซ่อนอัตโนมัติ) */}
      <Card className="p-4">
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold">ประสิทธิภาพเซลล์</span>
            <SourceBadge kind="analytics" />
            {!canSeeAll && <Badge variant="outline" className="gap-1 text-[11px] text-muted-foreground"><Icon name="user" className="size-3" />เฉพาะของฉัน</Badge>}
            {loading && perf.rows.length > 0 && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><span className="size-1.5 rounded-full bg-[var(--accent)] animate-pulse" />กำลังอัปเดต…</span>}
            <MonthPicker value={month} onChange={setMonth} max={curMonth()} className="h-8" />
            {canSeeAll && <SearchInput value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา" wrapperClassName="w-full sm:w-[180px] sm:ml-auto" className="h-8" />}
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className={'h-8 gap-1.5' + (nFilters ? ' border-[var(--accent)] text-[var(--accent-2)]' : '')}>
                <Icon name="filter" className="size-3.5" /> ตัวกรอง{nFilters > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{nFilters}</Badge>}
              </Button>
            </CollapsibleTrigger>
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
              {/* ตัวกรองระดับทีม — มีความหมายเฉพาะตอนเห็นหลายคน (admin) */}
              {canSeeAll && <Button variant="outline" size="sm" className={'h-8 rounded-full font-normal' + (onlyTargets ? ' border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-2)]' : '')} onClick={() => setOnlyTargets(v => !v)}>{onlyTargets ? '✓ ' : ''}เฉพาะที่มีเป้า</Button>}
              {canSeeAll && <Button variant="outline" size="sm" className={'h-8 rounded-full font-normal' + (hideNoSeller ? ' border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-2)]' : '')} onClick={() => setHideNoSeller(v => !v)}>{hideNoSeller ? '✓ ' : ''}ซ่อนไม่ระบุเซลล์</Button>}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {loading && !perf.rows.length ? <PerfSkeleton bodyOnly /> : !perf.rows.length ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">{canSeeAll ? 'ยังไม่มีข้อมูลยอดเดือนนี้ — ส่งใบเสร็จ/คีย์มือในหน้า "ส่งยอด & ข้อมูล" แล้วจะขึ้นที่นี่' : 'ยังไม่มียอดของคุณในเดือนนี้ — ส่งใบเสร็จ/คีย์มือในหน้า "ส่งยอด & ข้อมูล" แล้วจะขึ้นที่นี่'}</Card>
      ) : !rowsView.length ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">ไม่พบเซลล์ตามตัวกรอง · <button className="text-[var(--accent)] hover:underline" onClick={() => { setQ(''); clearFilters(); }}>ล้างตัวกรอง</button></Card>
      ) : !canSeeAll ? (
            /* เซลล์: หน้าเดียวจบ — รายละเอียดเต็มของตัวเอง + แถบยอดรวมทีม (ตัวเลขเดียว โปร่งใส) */
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border bg-card px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Icon name="users" className="size-3.5" />ยอดรวมทั้งทีมเดือนนี้</span>
                <span className="text-sm"><b className="num text-[var(--accent-2)]">{fmtB(teamMonthTotal.sales)}</b> <span className="text-muted-foreground">· {N(teamMonthTotal.orders)} ออเดอร์</span></span>
              </div>
              <Card className="p-4 sm:p-5">
                <SpDetail sp={focus} cmp={deltasByName.get(focus.name)} onDay={(day) => setDayDrill({ name: focus.name, day })} />
              </Card>
            </div>
      ) : (
            <div className="flex flex-col gap-4">
              {/* การ์ดสรุปทีมด้านบน — ยอดรวม/โอน/COD/ออเดอร์/ตัว/AOV (เคารพตัวกรอง+ค้นหา) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="rounded-xl border p-3">
                  <div className="text-[11px] text-muted-foreground">ยอดขายรวม <InfoTip text={canSeeAll ? 'ยอดขายรวมของทีม (เคารพตัวกรอง+ค้นหา) · จากยอดที่เซลล์กรอก/ใบเสร็จ · ตัดออเดอร์ที่ยกเลิกออกแล้ว' : 'ยอดขายของคุณ (เคารพตัวกรอง) · จากยอดที่กรอก/ใบเสร็จ · ตัดออเดอร์ที่ยกเลิกออกแล้ว'} /></div>
                  <div className="num text-xl font-bold leading-tight mt-0.5" style={{ color: 'var(--accent-2)' }}>{fmtB(teamView.sales)}</div>
                  {teamCmp && <div className="mt-1">{dPill(teamCmp.sales)}</div>}
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-[11px] text-muted-foreground">ยอดโอน <InfoTip text="ยอดขายที่ชำระด้วยการโอน" /></div>
                  <div className="num text-xl font-bold leading-tight mt-0.5" style={{ color: teamPay.transfer ? 'var(--good)' : 'var(--ink-3)' }}>{teamPay.transfer ? fmtB(teamPay.transfer) : '—'}</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-[11px] text-muted-foreground">ยอด COD <InfoTip text="ยอดขายที่เก็บเงินปลายทาง (COD)" /></div>
                  <div className="num text-xl font-bold leading-tight mt-0.5" style={{ color: teamPay.cod ? 'var(--warn)' : 'var(--ink-3)' }}>{teamPay.cod ? fmtB(teamPay.cod) : '—'}</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-[11px] text-muted-foreground">ออเดอร์ <InfoTip text="จำนวนออเดอร์รวมของทีมในช่วง (ตัดที่ยกเลิกออกแล้ว)" /></div>
                  <div className="num text-xl font-bold leading-tight mt-0.5">{N(teamView.orders)}</div>
                  {teamCmp && <div className="mt-1">{dPill(teamCmp.orders)}</div>}
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-[11px] text-muted-foreground">จำนวนตัว <InfoTip text="จำนวนชิ้นสินค้ารวมที่ขายได้" /></div>
                  <div className="num text-xl font-bold leading-tight mt-0.5">{N(teamView.qty)}</div>
                  {teamCmp && <div className="mt-1">{dPill(teamCmp.qty)}</div>}
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-[11px] text-muted-foreground">Basket/AOV <InfoTip text="ยอดขายรวม ÷ จำนวนออเดอร์ (Average Order Value) · เทียบเดือนก่อนที่แถบด้านล่าง" /></div>
                  <div className="num text-xl font-bold leading-tight mt-0.5">{fmtB(teamView.aov)}</div>
                  {teamCmp && <div className="mt-1">{dPill(teamCmp.aov)}</div>}
                </div>
              </div>
              <div className="rounded-xl border p-3"><LeadPanel title={canSeeAll ? 'คนทักทั้งทีม' : 'คนทักของฉัน'} total={teamView.leads} nw={teamView.newLeads} old={teamView.oldLeads} close={teamView.closeRate} /></div>
              <TrendCard rows={rowsView} dim={perf.dim} month={month} onOpenDay={setDayAll}
                prevSeries={perfPrev ? Array.from({ length: perf.dim }, (_, i) => perfPrev.rows.reduce((a, r) => a + (r.daily[i]?.sales || 0), 0)) : null}
                prevLabel={perfPrev ? monthLabel(prevMonthOf(month)) : null} />
              {soloMode ? (
                focus && <DeepPanel r={focus} onOpen={() => setDetail(focus.name)} />
              ) : (
            <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {rowsView.map(r => (
                <SellerCard key={r.name} r={r} rank={rankMap.get(r.name) ?? 99}
                  share={teamView.sales > 0 ? r.sales / teamView.sales * 100 : 0}
                  cmp={deltasByName.get(r.name)}
                  onOpen={() => setDetail(r.name)} />
              ))}
            </div>
            </>
            )}
            </div>
      )}

      {/* ป๊อปอัพ drill รายวัน (เซลล์+วัน / ทั้งวัน) — เปิดเซลล์เป็นหน้าเต็มแทน popup แล้ว */}
      {drillSheets}
    </div>
  );
}

/* ---- แท็บรายวัน: กราฟภาพรวมเดือน + สมุดบันทึกรายวัน (เฉพาะวันที่มียอด · คลิกเซลล์เปิดออเดอร์รายตัว) ---- */
/* ---- Drawer: เซลล์รายคน (กราฟรายวัน + ช่องทาง + ลายขายดี + ใบเสร็จ) ---- */
function SpDetail({ sp, onDay, cmp }) {
  const labels = sp.daily.map(d => String(d.day));
  const chEntries = Object.entries(sp.channels).sort((a, b) => b[1] - a[1]);
  const donut = chEntries.map(([k, v]) => ({ label: k, value: v, color: channelColor(k) }));
  const designs = Object.entries(sp.designs).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ label: k, value: v }));
  const deltaBadge = sp.dSales != null && <Badge variant="secondary" className={sp.dSales >= 0 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/15 text-red-600 dark:text-red-400'}>{sp.dSales >= 0 ? '▲' : '▼'} {Math.abs(Math.round(sp.dSales))}%</Badge>;
  const head = <span className="flex items-center gap-2"><PersonAvatar name={sp.name} size={30} />{sp.name}{deltaBadge}</span>;
  return (
    <>
      <div className="text-lg font-bold">{head}</div>
      <div className="flex flex-col gap-4 mt-3">
        {/* KPI ยอด/ออเดอร์/ตัว/AOV */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          {[
            ['ยอดขาย', fmtB(sp.sales), cmp?.sales, 'ยอดขายของเซลล์คนนี้ในช่วง (ตัดยกเลิกออกแล้ว) · แถบล่าง = เทียบเดือนก่อน'],
            ['ออเดอร์', N(sp.orders), cmp?.orders, 'จำนวนออเดอร์ที่เซลล์คนนี้ปิดได้ในช่วง'],
            ['ตัว', N(sp.qty), cmp?.qty, 'จำนวนชิ้นสินค้ารวมที่ขายได้'],
            ['AOV', fmtB(sp.aov), cmp?.aov, 'ยอดขาย ÷ จำนวนออเดอร์ (ค่าเฉลี่ยต่อออเดอร์)'],
          ].map(([l, v, d, tip]) => (
            <div key={l} className="rounded-lg border p-2"><div className="text-[11px] text-muted-foreground">{l} <InfoTip text={tip} /></div><div className="font-bold">{v}</div>{d != null && <div className="mt-0.5 leading-none">{dPill(d)}</div>}</div>
          ))}
        </div>
        <div className="text-xs text-muted-foreground -mt-1.5">ขายจริง {N(sp.daysActive)} วัน</div>
        <LeadPanel title="คนทัก" total={sp.leads} nw={sp.newOld?.new || 0} old={sp.newOld?.old || 0} close={sp.closeRate} />
        {/* เป้า — แถบกะทัดรัด (ต่อจาก KPI ทันที) */}
        {sp.target > 0 ? (
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-x-3 gap-y-0.5 flex-wrap text-sm mb-2">
              <span>เป้าเดือนนี้ <b>{fmtB(sp.target)}</b> · ทำได้ <b>{fmtB(sp.sales)}</b> <span className="font-semibold" style={{ color: sp.sales >= sp.target ? 'var(--good)' : 'var(--accent-2)' }}>({Math.round(sp.pctTarget)}%)</span></span>
              <span className="text-muted-foreground">คาดสิ้นเดือน {fmtB(sp.projected)}{sp.comm ? ` · คอม ${fmtB(sp.comm)}` : ''}</span>
            </div>
            <Progress value={Math.min(100, sp.pctTarget)} className="h-2" indicatorColor={sp.sales >= sp.target ? 'var(--good)' : 'var(--accent)'} />
          </div>
        ) : sp.comm > 0 ? (
          /* ไม่มีเป้ายอด แต่มี % คอม → คอม = ยอดขายทั้งเดือน × เรต */
          <div className="rounded-lg border p-3 text-sm flex items-center gap-x-3 gap-y-0.5 flex-wrap">
            <span>คอมเดือนนี้ <b className="text-[var(--accent-2)]">{fmtB(sp.comm)}</b></span>
            <span className="text-muted-foreground">· {sp.tgt && Array.isArray(sp.tgt.tiers) && sp.tgt.tiers.length ? 'ขั้นบันได' : `เรต ${Number(sp.tgt?.commission_rate) || 0}%`} จากยอด {fmtB(sp.sales)}</span>
          </div>
        ) : null}
        <div>
          <div className="text-sm font-semibold mb-1">ยอด &amp; คนทัก รายวัน <span className="text-xs font-normal text-muted-foreground">— คลิกวันเพื่อดูออเดอร์</span></div>
          <ComboChart labels={labels} bars={sp.daily.map(d => d.sales)} line={sp.daily.map(d => d.leads)} barLabel="ยอดขาย" lineLabel="คนทัก" barFmt={fmtB} height={200} onDayClick={onDay ? (i) => { const d = sp.daily[i]; if (d) onDay(d.day); } : undefined} />
        </div>
        {sp.channelClose.some(c => c.leads > 0) && (
          <div>
            <div className="text-sm font-semibold mb-1">%ปิดต่อช่องทาง</div>
            <div className="rounded-lg border overflow-hidden text-xs">
              <table className="w-full">
                <thead className="bg-muted/40 text-muted-foreground"><tr><th className="text-left px-2 py-1 font-medium">ช่องทาง</th><th className="text-right px-2 py-1 font-medium">ทัก</th><th className="text-right px-2 py-1 font-medium">ปิด</th><th className="text-right px-2 py-1 font-medium">%</th></tr></thead>
                <tbody>{sp.channelClose.filter(c => c.leads > 0).map(c => (
                  <tr key={c.ch} className="border-t"><td className="px-2 py-1"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full shrink-0" style={{ background: channelColor(c.ch) }} />{c.ch}</span></td><td className="px-2 py-1 text-right">{N(c.leads)}</td><td className="px-2 py-1 text-right">{N(c.orders)}</td><td className="px-2 py-1 text-right font-semibold" style={{ color: closeTone(c.closeRate) }}>{c.closeRate == null ? '—' : Math.round(c.closeRate) + '%'}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {donut.length > 0 && <div><div className="text-sm font-semibold mb-1">ช่องทาง</div><DonutChart data={donut} height={170} /></div>}
          {designs.length > 0 && <div><div className="text-sm font-semibold mb-1">ลายขายดี (ตัว)</div><HBars data={designs} height={170} unit=" ตัว" /></div>}
        </div>
      </div>
    </>
  );
}

/* การ์ดออเดอร์ + daySummary/DayTiles ย้ายไปเป็นของกลางใน orderCard.jsx (PART 88) — import ด้านบน */

/* ---- ป๊อปอัพ "ทั้งวัน" (คลิกจากกราฟรายวัน) — ออเดอร์ทุกใบของวันนั้นในขอบเขตที่กรอง ----
   สรุปวัน (10 ตัวชี้วัด: ยอดรวม/โอน/COD/ออเดอร์/ตัว/ลูกค้าใหม่/คนทัก/%ปิด/Basket/AVG) + แยกช่องทาง + การ์ดออเดอร์รายตัว */
function DayDetail({ day, orders, skus, funnel, onPickCustomer }) {
  const ords = (orders || []).filter(o => !isCancelled(o) && dayOf(o.order_date) === day)
    .sort((a, b) => (Number(b.sales) || 0) - (Number(a.sales) || 0));
  const dayFunnel = (funnel || []).filter(f => dayOf(f.date) === day);
  const finBy = useOrderFinancials(ords); // ส่วนลด/ค่าส่ง/VAT — batch ตอน popup เปิด (PART 88)
  const skuBy = new Map();
  (skus || []).forEach(k => { const arr = skuBy.get(k.order_no) || []; arr.push(k); skuBy.set(k.order_no, arr); });
  const sales = ords.reduce((s, o) => s + (Number(o.sales) || 0), 0);
  const sellers = new Set(ords.map(spOf));
  const multiSeller = sellers.size > 1;
  // แยกช่องทาง (ออเดอร์/ยอด/%)
  const chMap = new Map();
  ords.forEach(o => { const c = o.channel || 'ไม่ระบุ'; const m = chMap.get(c) || { orders: 0, sales: 0 }; m.orders += 1; m.sales += Number(o.sales) || 0; chMap.set(c, m); });
  const chans = [...chMap.entries()].sort((a, b) => b[1].sales - a[1].sales);

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* สรุปวัน — 10 ตัวชี้วัด */}
        <DayTiles s={daySummary(ords, dayFunnel)} />
        {/* แยกช่องทาง */}
        {chans.length > 0 && (
          <div>
            <div className="text-sm font-semibold mb-1">ช่องทางวันนี้</div>
            <div className="rounded-lg border overflow-hidden text-xs">
              <table className="w-full">
                <thead className="bg-muted/40 text-muted-foreground"><tr><th className="text-left px-2 py-1 font-medium">ช่องทาง</th><th className="text-right px-2 py-1 font-medium">ออเดอร์</th><th className="text-right px-2 py-1 font-medium">ยอด</th><th className="text-right px-2 py-1 font-medium">%</th></tr></thead>
                <tbody>{chans.map(([c, m]) => (
                  <tr key={c} className="border-t"><td className="px-2 py-1"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full shrink-0" style={{ background: channelColor(c) }} />{c}</span></td><td className="px-2 py-1 text-right">{N(m.orders)}</td><td className="px-2 py-1 text-right font-semibold">{fmtB(m.sales)}</td><td className="px-2 py-1 text-right text-muted-foreground">{sales ? Math.round(m.sales / sales * 100) : 0}%</td></tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
        {/* ออเดอร์รายตัว */}
        <div>
          <div className="text-sm font-semibold mb-1.5">ออเดอร์วันนี้ ({ords.length})</div>
          {ords.length === 0 ? (
            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">ไม่มีออเดอร์ในวันนี้</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {ords.map(o => <OrderCard key={o.order_no} o={o} lines={skuBy.get(o.order_no) || []} fin={finOf(finBy, o)} showSeller={multiSeller} onPickCustomer={onPickCustomer} />)}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ---- Drill-down รายวัน: ออเดอร์รายตัวของเซลล์ในวันนั้น (ตรวจสอบ/คิดคอม) ---- */
function DaySellerDetail({ name, day, orders, skus, funnel, target, onOpenMonth, onPickCustomer }) {
  // ออเดอร์ของเซลล์คนนี้ในวันนี้ (ตัดยกเลิก) เรียงยอดมาก→น้อย
  const ords = (orders || []).filter(o => !isCancelled(o) && spOf(o) === name && dayOf(o.order_date) === day)
    .sort((a, b) => (Number(b.sales) || 0) - (Number(a.sales) || 0));
  const finBy = useOrderFinancials(ords); // ส่วนลด/ค่าส่ง/VAT — batch ตอน popup เปิด (PART 88)
  // คนทักของเซลล์คนนี้ในวันนี้ (แยกใหม่/เก่า) — จากแถว funnel วันนั้น
  const dayFunnel = (funnel || []).filter(f => String(f.salesperson || '').trim() === name && dayOf(f.date) === day);
  const leadTot = dayFunnel.reduce((s, f) => s + funnelTotal(f), 0);
  const leadNO = dayFunnel.reduce((a, f) => { const x = funnelNewOld(f); return { new: a.new + x.new, old: a.old + x.old }; }, { new: 0, old: 0 });
  // index sku ต่อ order_no (line items ลาย/สี/ไซซ์/ยอด)
  const skuBy = new Map();
  (skus || []).forEach(k => { const arr = skuBy.get(k.order_no) || []; arr.push(k); skuBy.set(k.order_no, arr); });
  const sales = ords.reduce((s, o) => s + (Number(o.sales) || 0), 0);
  const comm = target ? commissionFor(sales, target) : 0;
  const tierMode = target && Array.isArray(target.tiers) && target.tiers.length;
  const rate = target && !tierMode ? Number(target.commission_rate) || 0 : null;

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* สรุปวัน — 10 ตัวชี้วัด (ชุดเดียวกับป๊อปอัพทั้งวัน) */}
        <DayTiles s={daySummary(ords, dayFunnel)} />
        <LeadPanel title="คนทักวันนี้ (แยกใหม่/เก่า)" total={leadTot} nw={leadNO.new} old={leadNO.old} close={ords.length && leadTot ? ords.length / leadTot * 100 : null} />
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
              {ords.map(o => <OrderCard key={o.order_no} o={o} lines={skuBy.get(o.order_no) || []} fin={finOf(finBy, o)} onPickCustomer={onPickCustomer} />)}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
