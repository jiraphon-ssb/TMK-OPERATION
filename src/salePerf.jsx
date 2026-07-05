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
import { SortableTable } from './components/DataTableParts.jsx';
import { downloadCsv } from './lib/exportCsv.js';
import { MetricCard, ComboChart, DonutChart, HBars, Heatmap, Sparkline, channelColor } from './charts.jsx';

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

export function SalePerfView() {
  const beat = useBeat(350);
  const [month, setMonth] = useState(curMonth());
  const [tab, setTab] = useState('month');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ orders: [], skus: [], funnel: [], receipts: [], prevOrders: [] });
  const [targets, setTargets] = useState({});
  const [detail, setDetail] = useState(null);   // เซลล์ที่เปิด drawer
  const [dayNo, setDayNo] = useState(() => Math.min(new Date().getDate(), 28));
  const monthOpts = useMemo(() => monthOptions(12), []);

  const load = useCallback(async (force = false) => {
    if (!force) setLoading(true);   // realtime refetch (force) = อัปเดตในที่ ไม่ต้องล้างเป็น skeleton (กันจอกระพริบ)
    try {
      const from = `${month}-01`, to = `${month}-31`;
      const pm = prevMonthOf(month), pFrom = `${pm}-01`, pTo = `${pm}-31`;
      const [ordersR, skusR, funnelR, receiptsR, prevR, tg] = await Promise.all([
        cachedFetchRange('tmk_mp_orders', ORDERS_SEL, from, to, 'order_date', force),
        cachedFetchRange('tmk_mp_skus', SKUS_SEL, from, to, 'order_date', force),
        supabase.from('tmk_sales_funnel').select('*').gte('date', from).lte('date', to),
        supabase.from('tmk_sale_receipts').select('order_no,salesperson,sales,qty,order_date,status,confirmed,channel').eq('order_month', month),
        cachedFetchRange('tmk_mp_orders', 'salesperson,sales,status,order_date', pFrom, pTo, 'order_date', force),
        fetchTargets(month),
      ]);
      const tmap = {}; (tg || []).forEach(t => { tmap[t.salesperson] = t; }); setTargets(tmap);
      setData({
        orders: ordersR.data || [], skus: skusR.data || [],
        funnel: funnelR.data || [], receipts: receiptsR.data || [], prevOrders: prevR.data || [],
      });
    } catch { /* ปล่อยว่าง — empty state */ }
    finally { setLoading(false); }
  }, [month]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const dim = daysInMonth(month); setDayNo(d => Math.min(d, dim)); }, [month]);   // กันเลือกวันเกินจำนวนวันของเดือน (สลับไปเดือนสั้น)
  useSaleRealtime(['tmk_sale_receipts', 'tmk_sales_funnel'], () => { invalidateSaleCache('tmk_mp_orders'); invalidateSaleCache('tmk_mp_skus'); load(true); });

  const perf = useMemo(() => buildPerf(month, data.orders, data.skus, data.funnel, data.receipts, targets, data.prevOrders), [month, data, targets]);
  const openSp = perf.rows.find(r => r.name === detail) || null;

  if (beat) return <PageSkeleton />;

  const dPill = (d) => d == null ? null : (
    <span className={`text-[11px] font-medium ${d >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{d >= 0 ? '▲' : '▼'} {Math.abs(Math.round(d))}%</span>
  );

  const exportMonth = () => downloadCsv(`ประสิทธิภาพเซลล์-${month}`, perf.rows, [
    { key: 'name', label: 'เซลล์' }, { key: 'sales', label: 'ยอดขาย' }, { key: 'orders', label: 'ออเดอร์' },
    { key: 'qty', label: 'จำนวนตัว' }, { label: 'AOV', map: r => Math.round(r.aov) }, { key: 'newC', label: 'ลูกค้าใหม่' },
    { key: 'leads', label: 'คนทัก' }, { label: '%ปิด', map: r => r.closeRate == null ? '' : Math.round(r.closeRate) },
    { label: 'เป้า', map: r => r.target }, { label: '%เป้า', map: r => r.pctTarget == null ? '' : Math.round(r.pctTarget) },
    { label: 'คอมมิชชัน', map: r => Math.round(r.comm) },
  ]);

  return (
    <div className="content-inner rise flex flex-col gap-4">
      {/* หัว + สรุปทีม */}
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold">ประสิทธิภาพเซลล์</span>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{monthOpts.map(m => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" className="h-8" disabled={!perf.rows.length} onClick={exportMonth}><Icon name="external" className="size-3.5" /> CSV</Button>
        </div>
        <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
          <MetricCard label="ยอดทีม" value={fmtB(perf.team.sales)} sub={perf.team.dSales != null ? `${perf.team.dSales >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(perf.team.dSales))}% vs เดือนก่อน` : ''} animate={false} />
          <MetricCard label="ออเดอร์" value={N(perf.team.orders)} animate={false} />
          <MetricCard label="จำนวนตัว" value={N(perf.team.qty)} animate={false} />
          <MetricCard label="คนทักรวม" value={N(perf.team.leads)} animate={false} />
          <MetricCard label="%ปิดทีม" value={perf.team.closeRate == null ? '—' : Math.round(perf.team.closeRate) + '%'} animate={false} />
          <MetricCard label="ลูกค้าใหม่" value={N(perf.team.newC)} animate={false} />
        </div>
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
            <Card className="p-0 overflow-hidden">
              <SortableTable
                initial={{ key: 'sales', dir: 'desc' }}
                columns={[
                  { key: 'name', label: 'เซลล์', sortable: true },
                  { key: 'sales', label: 'ยอดขาย', align: 'right', sortable: true },
                  { key: 'orders', label: 'ออเดอร์', align: 'right', sortable: true },
                  { key: 'qty', label: 'ตัว', align: 'right', sortable: true },
                  { key: 'aov', label: 'AOV', align: 'right', sortable: true },
                  { key: 'newC', label: 'ลูกค้าใหม่', align: 'right', sortable: true },
                  { key: 'leads', label: 'คนทัก', align: 'right', sortable: true },
                  { key: 'closeRate', label: '%ปิด', align: 'right', sortable: true, accessor: r => r.closeRate ?? -1 },
                  { key: 'pctTarget', label: 'เป้า', align: 'right', sortable: true, accessor: r => r.pctTarget ?? -1 },
                  { key: 'comm', label: 'คอม', align: 'right', sortable: true },
                  { key: '_trend', label: 'แนวโน้ม', align: 'left', sortable: false },
                ]}
                rows={perf.rows}
                renderRow={(r) => (
                  <tr key={r.name} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => setDetail(r.name)}>
                    <td className="px-3 py-2 font-medium">{r.name}{r.name === NO_SELLER && <span className="ml-1 text-[10px] text-muted-foreground">(มาร์เก็ตเพลส)</span>}</td>
                    <td className="px-2 py-2 text-right"><div className="flex items-center justify-end gap-1.5">{fmtB(r.sales)} {dPill(r.dSales)}</div></td>
                    <td className="px-2 py-2 text-right">{N(r.orders)}</td>
                    <td className="px-2 py-2 text-right">{N(r.qty)}</td>
                    <td className="px-2 py-2 text-right">{fmtB(r.aov)}</td>
                    <td className="px-2 py-2 text-right">{N(r.newC)}</td>
                    <td className="px-2 py-2 text-right">{N(r.leads)}</td>
                    <td className="px-2 py-2 text-right">{r.closeRate == null ? '—' : Math.round(r.closeRate) + '%'}</td>
                    <td className="px-2 py-2 text-right min-w-[110px]">
                      {r.target > 0
                        ? <div><div className="text-[11px]">{Math.round(r.pctTarget)}%</div><Progress value={Math.min(100, r.pctTarget)} className="h-1.5 mt-0.5" indicatorColor={r.sales >= r.target ? 'var(--good)' : 'var(--accent)'} /></div>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-2 py-2 text-right">{r.comm ? fmtB(r.comm) : '—'}</td>
                    <td className="px-2 py-2"><Sparkline data={r.daily.map(d => d.sales)} w={90} h={26} /></td>
                  </tr>
                )}
              />
              {/* แถวทีมรวม */}
              <div className="flex items-center gap-4 px-3 py-2 border-t bg-muted/30 text-sm flex-wrap">
                <b>ทีมรวม</b>
                <span>ยอด <b>{fmtB(perf.team.sales)}</b></span>
                <span>ออเดอร์ <b>{N(perf.team.orders)}</b></span>
                <span>ตัว <b>{N(perf.team.qty)}</b></span>
                <span>คนทัก <b>{N(perf.team.leads)}</b></span>
                <span>%ปิด <b>{perf.team.closeRate == null ? '—' : Math.round(perf.team.closeRate) + '%'}</b></span>
              </div>
            </Card>
          </TabsContent>

          {/* ---------- รายวัน ---------- */}
          <TabsContent value="day">
            <DailyPanel perf={perf} month={month} dayNo={dayNo} setDayNo={setDayNo} onOpenSp={setDetail} />
          </TabsContent>
        </Tabs>
      )}

      {/* Drawer เซลล์รายคน */}
      <Sheet open={!!openSp} onOpenChange={o => { if (!o) setDetail(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {openSp && <SpDetail sp={openSp} month={month} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ---- แท็บรายวัน: Heatmap วัน×เซลล์ + ตารางวันที่เลือก ---- */
function DailyPanel({ perf, month, dayNo, setDayNo, onOpenSp }) {
  const dim = perf.dim;
  const days = Array.from({ length: dim }, (_, i) => i + 1);
  const salesByDay = (sp, day) => sp.daily[day - 1]?.sales || 0;
  const cellFn = (spName, day) => { const sp = perf.rows.find(r => r.name === spName); return sp ? salesByDay(sp, day) : 0; };
  const dayRows = perf.rows.map(sp => {
    const d = sp.daily[dayNo - 1] || { sales: 0, orders: 0, leads: 0 };
    const recs = sp.receipts.filter(r => dayOf(r.order_date) === dayNo);
    const qty = recs.reduce((s, r) => s + (Number(r.qty) || 0), 0);
    return { name: sp.name, sales: d.sales, orders: d.orders, leads: d.leads, qty, recs, closeRate: d.leads > 0 ? d.orders / d.leads * 100 : null };
  }).filter(r => r.sales > 0 || r.orders > 0 || r.leads > 0).sort((a, b) => b.sales - a.sales);
  const dayTotal = dayRows.reduce((a, r) => ({ sales: a.sales + r.sales, orders: a.orders + r.orders, leads: a.leads + r.leads, qty: a.qty + r.qty }), { sales: 0, orders: 0, leads: 0, qty: 0 });

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-3 overflow-x-auto">
        <div className="text-sm font-semibold mb-2">ยอดรายวัน (วัน × เซลล์) — คลิกคอลัมน์เพื่อดูรายละเอียดวันนั้น</div>
        <Heatmap rows={perf.rows.map(r => r.name)} cols={days} cell={cellFn} fmt={(v) => v ? fmtB(v) : ''} />
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-xs text-muted-foreground">เลือกวัน:</span>
          <Select value={String(dayNo)} onValueChange={v => setDayNo(Number(v))}>
            <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{days.map(d => <SelectItem key={d} value={String(d)}>{d} {TH_MON[Number(month.slice(5, 7)) - 1]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="px-3 py-2 border-b bg-muted/20 flex items-center gap-4 flex-wrap text-xs">
          <b className="text-sm">วันที่ {dayNo} {monthLabel(month)}</b>
          <span>ยอด <b>{fmtB(dayTotal.sales)}</b></span>
          <span>ออเดอร์ <b>{N(dayTotal.orders)}</b></span>
          <span>ตัว <b>{N(dayTotal.qty)}</b></span>
          <span>คนทัก <b>{N(dayTotal.leads)}</b></span>
        </div>
        {!dayRows.length ? <div className="p-6 text-center text-sm text-muted-foreground">ไม่มีความเคลื่อนไหววันนี้</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/40">
                <tr><th className="text-left px-3 py-2">เซลล์</th><th className="text-right px-2 py-2">ยอด</th><th className="text-right px-2 py-2">ออเดอร์</th><th className="text-right px-2 py-2">ตัว</th><th className="text-right px-2 py-2">คนทัก</th><th className="text-right px-2 py-2">%ปิด</th><th className="text-left px-2 py-2">ใบเสร็จ</th></tr>
              </thead>
              <tbody>
                {dayRows.map(r => (
                  <tr key={r.name} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => onOpenSp(r.name)}>
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-2 py-2 text-right">{fmtB(r.sales)}</td>
                    <td className="px-2 py-2 text-right">{N(r.orders)}</td>
                    <td className="px-2 py-2 text-right">{N(r.qty)}</td>
                    <td className="px-2 py-2 text-right">{N(r.leads)}</td>
                    <td className="px-2 py-2 text-right">{r.closeRate == null ? '—' : Math.round(r.closeRate) + '%'}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground truncate max-w-[220px]">{r.recs.map(x => x.order_no).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
          <div><div className="flex justify-between text-xs text-muted-foreground mb-1"><span>เป้า {fmtB(sp.target)}</span><span>{Math.round(sp.pctTarget)}%{sp.comm ? ` · คอม ${fmtB(sp.comm)}` : ''} · คาดสิ้นเดือน {fmtB(sp.projected)}</span></div>
            <Progress value={Math.min(100, sp.pctTarget)} indicatorColor={sp.sales >= sp.target ? 'var(--good)' : 'var(--accent)'} /></div>
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
            <div className="rounded-lg border overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground sticky top-0"><tr><th className="text-left px-2 py-1">เลขที่</th><th className="text-left px-2 py-1">วันที่</th><th className="text-left px-2 py-1">ลูกค้า</th><th className="text-right px-2 py-1">ยอด</th></tr></thead>
                <tbody>{sp.receipts.slice().sort((a, b) => String(b.order_date).localeCompare(String(a.order_date))).map(r => (
                  <tr key={r.order_no} className="border-t"><td className="px-2 py-1 font-mono">{r.order_no}</td><td className="px-2 py-1">{String(r.order_date || '').slice(8, 10)}/{String(r.order_date || '').slice(5, 7)}</td><td className="px-2 py-1">{r.confirmed?.customer_name || '—'}</td><td className="px-2 py-1 text-right">{fmtB(r.sales)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
