/* ============================================================
   saleDashboardTabs.jsx — เนื้อหาแต่ละแท็บของรายงานขาย (saleDashboard.jsx)
   แยกมาจาก saleDashboard.jsx (ยกก้อน JSX มาทั้งดุ้น ไม่แก้เนื้อใน):
   OverviewTab · OverviewChannels · VariantTab · CustomerTab · FunnelTab
   + component ย่อยที่ใช้เฉพาะในแท็บ: MoversCard · ChannelHeatmap · VariantMatrix
   ค่าที่เคยเป็น closure ของหน้าแม่ (A/prevA/k/range/gran/…) ส่งลงมาทาง prop `ctx`
   ============================================================ */
import { useMemo } from 'react';
import { N, Icon } from './components.jsx';
import { MetricCard, ComboChart, StackedBars, HBars, DonutChart, Heatmap, channelColor, CAT_COLORS } from './charts.jsx';
import { movers, pareto, sizeRank, normColor, normSize, customerAgg, rfmTiers } from './lib/saleAgg.js';
import { bucketKey, bucketLabel, enumerateBuckets } from './lib/saleTime.js';
import { funnelPlatforms, funnelTotal, funnelNewOld } from './lib/saleData.js';
import { CRM_CHANNELS } from './lib/crmAgg.js';
import { normNoteData } from './lib/crmDailyNote.js';
import { VoiceFeed } from './saleWidgets.jsx';
import { baht, COLOR_HEX, PAY_HEX, tierTone } from './lib/saleDashboardHelpers.js';
import { SectionHead } from './saleDashboardChrome.jsx';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { CardTable } from './components/DataTableParts.jsx';
import { Toggle } from '@/components/ui/toggle';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';

// ===== แท็บ "ภาพรวม" ส่วนบน — เทรนด์ + เจาะลึกยอดขาย + สัดส่วนธุรกิจ + 80/20 + ตารางรายวัน =====
export function OverviewTab({ ctx }) {
  const { A, prevA, cmp, trend, trendByChannel, trendMetric, setTrendMetric, granSel, setGranSel, trendSplit, setTrendSplit, metricFmt, prevLabel, toggleFilter, setDayPay } = ctx;
  return (<>
        <Card className="p-[22px]">
          <CardHeader className="flex-row items-center justify-between space-y-0 p-0 pb-4" style={{ flexWrap: 'wrap' }}>
            <CardTitle className="m-0 text-base font-semibold">ยอดขายตามเวลา <span className="dim">(เลือกตัวชี้วัด · เทียบช่วงก่อน)</span></CardTitle>
            <div className="card-action row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Tabs value={trendMetric} onValueChange={setTrendMetric}><TabsList>{[['sales', 'ยอดขาย'], ['orders', 'ออเดอร์'], ['qty', 'ตัว']].map(([id, lb]) => <TabsTrigger key={id} value={id}>{lb}</TabsTrigger>)}</TabsList></Tabs>
              <span style={{ width: 1, height: 18, background: 'var(--line)' }} />
              <span className="cap" style={{ color: 'var(--ink-4)' }}>มุมมอง</span>
              <Tabs value={granSel} onValueChange={setGranSel}><TabsList>{[['auto', 'อัตโนมัติ'], ['day', 'วัน'], ['week', 'สัปดาห์'], ['month', 'เดือน'], ['quarter', 'ไตรมาส']].map(([id, lb]) => <TabsTrigger key={id} value={id}>{lb}</TabsTrigger>)}</TabsList></Tabs>
              <span style={{ width: 1, height: 18, background: 'var(--line)' }} />
              <Toggle variant="outline" size="sm" pressed={trendSplit} onPressedChange={setTrendSplit} title="แบ่งแต่ละแท่งตามช่องทาง"><Icon name="grid" /> แยกช่องทาง</Toggle>
            </div>
          </CardHeader>
          {trendSplit
            ? <StackedBars labels={trendByChannel.labels} datasets={trendByChannel.datasets} fmt={metricFmt} height={250} />
            : <ComboChart labels={trend.labels} bars={trend.bars} line={trend.line} cmpBars={trend.cmpBars} breakdown={trendByChannel.datasets.length ? trend.labels.map((_, i) => trendByChannel.datasets.map(d => ({ name: d.label, value: d.data[i], color: d.color })).filter(c => c.value > 0)) : undefined} barLabel={trendMetric === 'sales' ? 'ยอดขาย' : trendMetric} lineLabel="ออเดอร์" barFmt={metricFmt} lineFmt={N} cmpLabel={prevLabel} height={250} />}
          <div className="cap row" style={{ gap: 14, marginTop: 8, color: 'var(--ink-4)', justifyContent: 'center', flexWrap: 'wrap' }}>
            {trendSplit
              ? trendByChannel.datasets.map(d => <span key={d.label} className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: d.color }} /> {d.label}</span>)
              : <>
                <span className="row" style={{ gap: 5 }}><span style={{ width: 12, height: 8, borderRadius: 2, background: 'var(--accent-2)' }} /> {trendMetric === 'sales' ? 'ยอดขาย' : trendMetric === 'orders' ? 'ออเดอร์' : 'ตัว'} (แท่ง)</span>
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

        {/* ===== สัดส่วนธุรกิจ (การชำระ · ประเภทงาน · หมวดสินค้า) — จากมิติที่ saleAgg คำนวณอยู่แล้ว ===== */}
        <SectionHead title="สัดส่วนธุรกิจ" sub="การชำระ · ประเภทงาน · หมวดสินค้า" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, alignItems: 'start' }}>
          {/* การชำระเงิน */}
          <Card className="p-[22px]">
            <CardTitle className="m-0 text-base font-semibold mb-[14px]">การชำระเงิน</CardTitle>
            {A.byPayment.filter(p => p.sales > 0).length === 0
              ? <div className="cap" style={{ color: 'var(--ink-4)', padding: '24px 0', textAlign: 'center' }}>ไม่มีข้อมูล</div>
              : <>
                <div style={{ maxWidth: 220, margin: '0 auto' }}><DonutChart data={A.byPayment.filter(p => p.sales > 0).map((p, i) => ({ label: p.key, value: p.sales, color: PAY_HEX[p.key] || CAT_COLORS[i % CAT_COLORS.length] }))} height={180} /></div>
                <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                  {A.byPayment.filter(p => p.sales > 0).map((p, i) => (
                    <div key={p.key} className="row between" style={{ cursor: 'pointer' }} onClick={() => toggleFilter('payment_type', p.key)} title={`กรอง ${p.key}`}>
                      <span className="row" style={{ gap: 6, fontSize: 13 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: PAY_HEX[p.key] || CAT_COLORS[i % CAT_COLORS.length] }} />{p.key}</span>
                      <span className="num cap" style={{ fontWeight: 600 }}>{baht(p.sales)} <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>{Math.round(p.share * 100)}%</span></span>
                    </div>
                  ))}
                </div>
              </>}
          </Card>
          {/* ประเภทงาน */}
          <Card className="p-[22px]">
            <CardTitle className="m-0 text-base font-semibold mb-[14px]">ประเภทงาน <span className="dim">· ตามยอดขาย</span></CardTitle>
            {A.byJobType.filter(j => j.sales > 0).length === 0
              ? <div className="cap" style={{ color: 'var(--ink-4)', padding: '24px 0', textAlign: 'center' }}>ไม่มีข้อมูล</div>
              : <HBars data={A.byJobType.filter(j => j.sales > 0).map(j => ({ label: j.key, value: j.sales }))} unit="บาท" height={Math.max(140, A.byJobType.filter(j => j.sales > 0).length * 46)} />}
          </Card>
          {/* หมวดสินค้า */}
          <Card className="p-[22px]">
            <CardTitle className="m-0 text-base font-semibold mb-[14px]">หมวดสินค้า <span className="dim">· ตามจำนวนตัว</span></CardTitle>
            {A.byType.filter(t => t.qty > 0).length === 0
              ? <div className="cap" style={{ color: 'var(--ink-4)', padding: '24px 0', textAlign: 'center' }}>ไม่มีข้อมูล</div>
              : <HBars data={A.byType.filter(t => t.qty > 0).slice(0, 10).map(t => ({ label: t.key, value: t.qty }))} unit="ตัว" height={Math.max(140, Math.min(10, A.byType.filter(t => t.qty > 0).length) * 34)} />}
          </Card>
        </div>

        {/* ===== กฎ 80/20 + ดาวรุ่ง/ดาวร่วง ===== */}
        <SectionHead title="ลายทำเงิน & แนวโน้ม" sub={cmp ? 'กฎ 80/20 · เทียบช่วงก่อน' : 'กฎ 80/20'} />
        <div style={{ display: 'grid', gridTemplateColumns: cmp ? '1.2fr 1fr 1fr' : '1fr', gap: 20, alignItems: 'start' }}>
          {/* Pareto 80/20 */}
          {(() => {
            const ranked = [...A.byDesign].filter(d => d.sales > 0).sort((a, b) => b.sales - a.sales);
            const par = pareto(ranked, 'sales');
            const idx80 = par.findIndex(x => x.cumPct >= 0.8);
            const n80 = idx80 < 0 ? par.length : idx80 + 1;
            return (
              <Card className="p-[22px]">
                <CardTitle className="m-0 text-base font-semibold mb-[4px]">กฎ 80/20 — ลายทำเงินหลัก</CardTitle>
                {par.length === 0
                  ? <div className="cap" style={{ color: 'var(--ink-4)', padding: '20px 0' }}>ยังไม่มีข้อมูลลาย</div>
                  : <>
                    <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 14 }}><b style={{ color: 'var(--accent)', fontSize: 20, fontWeight: 700 }}>{n80}</b> ลาย ทำ <b style={{ color: 'var(--ink)' }}>80%</b> ของยอด (จากทั้งหมด {N(par.length)} ลาย)</div>
                    <div style={{ display: 'grid', gap: 7 }}>
                      {par.slice(0, 8).map((d, i) => {
                        const inTop = i < n80;
                        return (
                          <div key={d.key} className="row" style={{ gap: 10, alignItems: 'center', cursor: 'pointer', opacity: inTop ? 1 : 0.55 }} onClick={() => toggleFilter('design', d.key)} title={`กรองลาย ${d.key}`}>
                            <span className="num" style={{ width: 18, textAlign: 'center', color: 'var(--ink-4)', fontWeight: 700 }}>{i + 1}</span>
                            <span style={{ flex: '0 0 108px', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.key}</span>
                            <div style={{ flex: 1, height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${Math.round(d.cumPct * 100)}%`, height: '100%', background: inTop ? 'var(--accent)' : 'var(--ink-4)', borderRadius: 4 }} /></div>
                            <span className="num cap" style={{ flex: '0 0 auto', minWidth: 46, textAlign: 'right', color: 'var(--ink-3)', fontWeight: 600 }}>{Math.round(d.cumPct * 100)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </>}
              </Card>
            );
          })()}
          {/* ดาวรุ่ง/ดาวร่วง — เฉพาะตอนเทียบช่วง */}
          {cmp && prevA && (() => {
            const mv = movers(A.byDesign, prevA.byDesign, 'sales').filter(m => m.prev > 0 && m.cur > 0);
            const risers = mv.slice(0, 5);
            const fallers = mv.slice(-5).reverse().filter(m => m.d < 0);
            return <>
              <MoversCard title="ดาวรุ่ง (ลาย)" icon="up" tone="var(--good)" data={risers} />
              <MoversCard title="ดาวร่วง (ลาย)" icon="down" tone="var(--bad)" data={fallers} />
            </>;
          })()}
        </div>

        {/* ===== ตารางรายวัน: ยอดรวม + แยกโอน/COD (คำขอทีม — ดูยอดแต่ละวันแยกการชำระ) ===== */}
        <Card className="p-[22px]">
          <CardTitle className="m-0 text-base font-semibold mb-[6px]">ยอดรายวัน แยกการชำระ <span className="dim">· โอน / COD</span></CardTitle>
          <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 12 }}>COD = เก็บเงินปลายทาง · อื่นๆ = มาร์เก็ตเพลส/ไม่ระบุ · เรียงวันล่าสุดก่อน</div>
          {(() => {
            // group ออเดอร์ (ผ่านตัวกรองแล้ว) ตามวัน → ยอดรวม/โอน/COD/อื่นๆ ต่อวัน
            const isCod = (o) => o.payment_type === 'COD' || (Number(o.cod_amount) || 0) > 0;
            const m = new Map();
            (A._ords || []).forEach(o => {
              const d = o.order_date; if (!d) return;
              const g = m.get(d) || { d, orders: 0, sales: 0, transfer: 0, cod: 0, other: 0 };
              const s = Number(o.sales) || 0;
              g.orders += 1; g.sales += s;
              if (isCod(o)) g.cod += s; else if (o.payment_type === 'โอน') g.transfer += s; else g.other += s;
              m.set(d, g);
            });
            const days = [...m.values()].sort((a, b) => b.d.localeCompare(a.d));
            const tot = days.reduce((a, g) => ({ orders: a.orders + g.orders, sales: a.sales + g.sales, transfer: a.transfer + g.transfer, cod: a.cod + g.cod, other: a.other + g.other }), { orders: 0, sales: 0, transfer: 0, cod: 0, other: 0 });
            const hasOther = tot.other > 0;
            if (!days.length) return <div className="cap" style={{ color: 'var(--ink-4)', padding: '20px 0', textAlign: 'center' }}>ไม่มีข้อมูลในช่วงนี้</div>;
            return (
              <CardTable style={{ maxHeight: 420, overflowY: 'auto' }}><Table>
                <TableHeader><TableRow>
                  <TableHead>วันที่</TableHead><TableHead style={{ textAlign: 'right' }}>ออเดอร์</TableHead>
                  <TableHead style={{ textAlign: 'right' }}>โอน</TableHead><TableHead style={{ textAlign: 'right' }}>COD</TableHead>
                  {hasOther && <TableHead style={{ textAlign: 'right' }}>อื่นๆ</TableHead>}
                  <TableHead style={{ textAlign: 'right' }}>ยอดรวม</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {days.map(g => (
                    <TableRow key={g.d} onClick={() => setDayPay(g.d)} style={{ cursor: 'pointer' }} title="คลิกดูออเดอร์ทั้งวัน">
                      <TableCell className="cell-title num">{bucketLabel(g.d, 'day')}</TableCell>
                      <TableCell className="num" style={{ textAlign: 'right' }}>{N(g.orders)}</TableCell>
                      <TableCell className="num" style={{ textAlign: 'right', color: g.transfer ? 'var(--good)' : 'var(--ink-4)' }}>{g.transfer ? baht(g.transfer) : '—'}</TableCell>
                      <TableCell className="num" style={{ textAlign: 'right', color: g.cod ? 'var(--warn)' : 'var(--ink-4)' }}>{g.cod ? baht(g.cod) : '—'}</TableCell>
                      {hasOther && <TableCell className="num" style={{ textAlign: 'right', color: g.other ? 'var(--ink-3)' : 'var(--ink-4)' }}>{g.other ? baht(g.other) : '—'}</TableCell>}
                      <TableCell className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{baht(g.sales)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow style={{ background: 'var(--surface-2)' }}>
                    <TableCell className="cell-title" style={{ fontWeight: 700 }}>รวม {N(days.length)} วัน</TableCell>
                    <TableCell className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{N(tot.orders)}</TableCell>
                    <TableCell className="num" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--good)' }}>{baht(tot.transfer)}</TableCell>
                    <TableCell className="num" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--warn)' }}>{baht(tot.cod)}</TableCell>
                    {hasOther && <TableCell className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{baht(tot.other)}</TableCell>}
                    <TableCell className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{baht(tot.sales)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table></CardTable>
            );
          })()}
        </Card>

  </>);
}

// ===== แท็บ "ภาพรวม" ส่วนล่าง — ช่องทางการขาย (heatmap + ตาราง) =====
export function OverviewChannels({ ctx }) {
  const { A, prevA, orders, eff, gran, range, toggleFilter } = ctx;
  return (<>
        <SectionHead title="ช่องทางการขาย" sub="matrix ช่องทาง × เวลา + ตารางสรุป" />
        <Card className="p-[22px]">
          <CardTitle className="m-0 text-base font-semibold mb-[12px]">ช่องทาง × {gran === 'day' ? 'วัน' : gran === 'week' ? 'สัปดาห์' : gran === 'month' ? 'เดือน' : 'ไตรมาส'} (ยอดขาย)</CardTitle>
          <ChannelHeatmap orders={orders} eff={eff} gran={gran} range={range} channels={A.byChannel.map(c => c.key)} />
          <CardTable style={{ marginTop: 14 }}><Table>
            <TableHeader><TableRow><TableHead>ช่องทาง</TableHead><TableHead style={{ textAlign: 'right' }}>ยอดขาย</TableHead><TableHead style={{ textAlign: 'right' }}>ออเดอร์</TableHead><TableHead style={{ textAlign: 'right' }}>ตัว</TableHead><TableHead style={{ textAlign: 'right' }}>AOV</TableHead><TableHead style={{ textAlign: 'right' }}>%share</TableHead>{prevA && <TableHead style={{ textAlign: 'right' }}>%Δ</TableHead>}</TableRow></TableHeader>
            <TableBody>{A.byChannel.map(c => { const mv = prevA ? movers(A.byChannel, prevA.byChannel, 'sales').find(m => m.key === c.key) : null; return (
              <TableRow key={c.key} onClick={() => toggleFilter('channel', c.key)} style={{ cursor: 'pointer' }}>
                <TableCell className="cell-title"><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: channelColor(c.key), marginRight: 7 }} />{c.key}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{baht(c.sales)}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right' }}>{N(c.orders)}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right' }}>{N(c.qty)}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right' }}>{baht(c.aov)}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right' }}>{Math.round(c.share * 100)}%</TableCell>
                {prevA && <TableCell className="num" style={{ textAlign: 'right', color: mv && mv.d >= 0 ? 'var(--good)' : 'var(--bad)' }}>{mv ? (mv.d >= 0 ? '+' : '') + Math.round(mv.d * 100) + '%' : '—'}</TableCell>}
              </TableRow>); })}</TableBody>
          </Table></CardTable>
        </Card>
  </>);
}

// ===== แท็บ "สินค้า & พื้นที่" ส่วนบน — ไซซ์/สี + เมทริกซ์ สี × ไซซ์ =====
export function VariantTab({ ctx }) {
  const { A, f } = ctx;
  return (<>
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
  </>);
}

// ===== แท็บ "ลูกค้า & CRM" =====
export function CustomerTab({ ctx }) {
  const { A, f, k, range, gran, curLabel, crmNotes, crmMonth, crmTargets, custTier, setCustTier, setCustDetail } = ctx;
  return (<>
        {/* PART 97: สรุป CRM — ยอดปิดผ่าน LINE/โทร + บันทึกประจำวัน + เป้า CRM */}
        {(() => {
          const spF = f.salesperson; const inSp = (sp) => !spF.length || spF.includes(sp);
          const crmOrds = (A._ords || []).filter(o => CRM_CHANNELS.includes(o.channel) && inSp(o.salesperson));
          const crmSales = crmOrds.reduce((s, o) => s + (Number(o.sales) || 0), 0);
          const lineSales = crmOrds.filter(o => o.channel === 'LINE').reduce((s, o) => s + (Number(o.sales) || 0), 0);
          const phoneSales = crmSales - lineSales;
          const crmBuyers = new Set(crmOrds.map(o => o.customer_code || o.customer_phone || o.customer_name).filter(Boolean)).size;
          const notes = (crmNotes || []).filter(nr => inSp(nr.salesperson)).map(nr => normNoteData(nr.data));
          const cA = notes.reduce((a, d) => { const c = d.calls; a.total += c.d0.total + c.d5.total + c.rep.total; a.answered += c.d0.answered + c.d5.answered + c.rep.answered; a.d0 += c.d0.total; a.d5 += c.d5.total; a.rep += c.rep.total; a.upO += d.upsellOrders; a.upB += d.upsellBaht; a.free += d.freebieOrders; a.bday += d.birthdayOrders; return a; }, { total: 0, answered: 0, d0: 0, d5: 0, rep: 0, upO: 0, upB: 0, free: 0, bday: 0 });
          const ansPct = cA.total ? Math.round(cA.answered / cA.total * 100) : 0;
          const hasNotes = cA.total || cA.upO || cA.free || cA.bday;
          const crmTgt = crmMonth ? (crmTargets || []).filter(t => inSp(t.salesperson)).reduce((s, t) => s + (Number(t.sales_target) || 0), 0) : 0;
          const crmPct = crmTgt ? Math.min(100, Math.round(crmSales / crmTgt * 100)) : 0;
          return (
            <Card className="p-[22px]">
              <CardHeader className="flex-row items-center justify-between space-y-0 p-0 pb-3" style={{ flexWrap: 'wrap', gap: 8 }}>
                <CardTitle className="m-0 text-base font-semibold">สรุป CRM (LINE / โทร)</CardTitle>
                <CardDescription>ยอดที่ปิดผ่าน LINE &amp; โทร · {curLabel}</CardDescription>
              </CardHeader>
              <div className="metric-grid">
                <MetricCard label="ยอด CRM รวม" value={baht(crmSales)} icon="chat" tone="var(--accent)" sub={`${N(crmOrds.length)} ออเดอร์ · ${N(crmBuyers)} ลูกค้า`} />
                <MetricCard label="ยอด LINE" value={baht(lineSales)} sub={crmSales ? `${Math.round(lineSales / crmSales * 100)}% ของ CRM` : '—'} />
                <MetricCard label="ยอดโทร" value={baht(phoneSales)} sub={crmSales ? `${Math.round(phoneSales / crmSales * 100)}% ของ CRM` : '—'} />
                {crmMonth
                  ? <div className="metric-card"><div className="cap" style={{ color: 'var(--ink-3)' }}>เป้า CRM เดือนนี้</div><div className="num" style={{ fontSize: 20, fontWeight: 700, marginTop: 3 }}>{crmTgt ? `${crmPct}%` : '—'}</div><div className="cap" style={{ color: 'var(--ink-4)' }}>{crmTgt ? `${baht(crmSales)} / ${baht(crmTgt)}` : 'ยังไม่ตั้งเป้า'}</div>{crmTgt ? <Progress value={crmPct} className="mt-1.5" indicatorColor={crmSales >= crmTgt ? 'var(--good)' : 'var(--accent)'} /> : null}</div>
                  : <MetricCard label="เป้า CRM" value="—" sub="เลือกช่วง=เดือนเดียวเพื่อดูเป้า" />}
              </div>
              {hasNotes ? (
                <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                  <Badge variant="outline" className="gap-1"><Icon name="phone" className="size-3" /> โทร {N(cA.total)} สาย · รับ {ansPct}%</Badge>
                  <Badge variant="outline">0DAY {N(cA.d0)} · 5DAY {N(cA.d5)} · ซื้อซ้ำ {N(cA.rep)}</Badge>
                  {(cA.upO || cA.upB) ? <Badge variant="outline">อัพเซลล์ {N(cA.upO)} ออเดอร์ · {baht(cA.upB)}</Badge> : null}
                  {cA.free ? <Badge variant="outline">แถม {N(cA.free)}</Badge> : null}
                  {cA.bday ? <Badge variant="outline">วันเกิด {N(cA.bday)}</Badge> : null}
                </div>
              ) : <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 12 }}>ยังไม่มีบันทึกประจำวัน CRM ในช่วงนี้ — กรอกได้ที่หน้า <b>ภาพรวม CRM</b></div>}
            </Card>
          );
        })()}
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
              {shown.length ? <CardTable style={{ maxHeight: 460, overflow: 'auto' }}><Table>
                <TableHeader><TableRow><TableHead>ลูกค้า</TableHead><TableHead>ระดับ</TableHead><TableHead style={{ textAlign: 'right' }}>ยอดซื้อ</TableHead><TableHead style={{ textAlign: 'right' }}>ครั้ง</TableHead><TableHead style={{ textAlign: 'right' }}>เฉลี่ย/ครั้ง</TableHead><TableHead style={{ textAlign: 'right' }}>ช่อง</TableHead><TableHead style={{ textAlign: 'right' }}>ซื้อล่าสุด</TableHead><TableHead>สถานะ</TableHead></TableRow></TableHeader>
                <TableBody>{shown.map((c, i) => (
                  <TableRow key={c.code} onClick={() => setCustDetail(c)} className="cursor-pointer">
                    <TableCell className="cell-title"><span className="num" style={{ color: 'var(--ink-4)', marginRight: 8 }}>{i + 1}</span>{c.name}</TableCell>
                    <TableCell><span className={`tier-chip ${TIER_CHIP[c.tier] || ''}`}>{c.tier}</span></TableCell>
                    <TableCell className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{baht(c.sales)}</TableCell>
                    <TableCell className="num" style={{ textAlign: 'right' }}>{N(c.orders)}</TableCell>
                    <TableCell className="num" style={{ textAlign: 'right', color: 'var(--ink-3)' }}>{baht(c.aov)}</TableCell>
                    <TableCell className="num" style={{ textAlign: 'right', color: 'var(--ink-3)' }}>{N(c.channels)}</TableCell>
                    <TableCell className="num cap" style={{ textAlign: 'right', color: 'var(--ink-3)' }}>{c.last}{c.recency != null ? ` (${c.recency}ว.)` : ''}</TableCell>
                    <TableCell><span className="row" style={{ gap: 6, justifyContent: 'space-between' }}>{c.flag ? <Badge variant="outline" style={{ fontSize: 10, color: flagTone(c.flag) }}>{c.flag}</Badge> : <span />}<Icon name="arrowR" /></span></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table></CardTable> : <div className="cap" style={{ color: 'var(--ink-4)', padding: 12 }}>ไม่มีลูกค้าในระดับนี้</div>}
              <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 8 }}>แสดง {N(shown.length)} จาก {N(custTier === 'all' ? rows.length : rows.filter(r => r.tier === custTier).length)} คน · เฉพาะออเดอร์ที่มีรหัสลูกค้า (~70%)</div>
            </Card>
          </>);
        })()}
  </>);
}

// ===== แท็บ "คนทัก & ปิดการขาย" (funnel) =====
export function FunnelTab({ ctx }) {
  const { A, f, funnel, range, gran } = ctx;
        const inR = (d) => (!range.from || d >= range.from) && (!range.to || d <= range.to);
        const fr = funnel.filter(r => inR(r.date) && (!f.salesperson.length || f.salesperson.includes(r.salesperson)));
        if (funnel.length === 0) return <Card className="p-9 text-center" style={{ color: 'var(--ink-4)' }}>ยังไม่มีข้อมูลคนทัก — ให้เซลล์กรอก "คนทักวันนี้" ที่หน้า <b>ส่งยอด &amp; ข้อมูล</b> ก่อน (ต้องรัน migration <code>tmk_sales_funnel</code> ด้วย)</Card>;
        // ทักรวมต่อแพลตฟอร์ม (jsonb leads · แถวเก่า fb/line map ให้อัตโนมัติผ่าน funnelPlatforms)
        const totalLeads = fr.reduce((a, r) => a + funnelTotal(r), 0);
        const platTotals = {}; fr.forEach(r => { for (const [p, n] of Object.entries(funnelPlatforms(r))) platTotals[p] = (platTotals[p] || 0) + n; });
        const platSorted = Object.entries(platTotals).sort((a, b) => b[1] - a[1]);
        // ปิดการขาย = ออเดอร์เฉพาะเซลล์ที่มีข้อมูลคนทัก (กัน %ปิด ผิดเพราะเทียบกับออเดอร์ทั้งระบบ)
        const funnelSps = new Set(fr.map(r => r.salesperson));
        const funnelOrds = (A._ords || []).filter(o => funnelSps.has(o.salesperson));
        const orders = funnelOrds.length;
        const close = totalLeads ? Math.round(orders / totalLeads * 100) : 0;
        const buckets = enumerateBuckets(range.from, range.to, gran);
        const leadBy = {}; fr.forEach(r => { const b = bucketKey(r.date, gran); leadBy[b] = (leadBy[b] || 0) + funnelTotal(r); });
        const ordBy = {}; funnelOrds.forEach(o => { const b = bucketKey(o.order_date, gran); ordBy[b] = (ordBy[b] || 0) + 1; });
        const labels = buckets.map(b => bucketLabel(b, gran).replace(/ \(.*/, ''));
        const bars = buckets.map(b => leadBy[b] || 0), line = buckets.map(b => ordBy[b] || 0);
        // ต่อเซลล์
        const bySp = {}; fr.forEach(r => { const g = bySp[r.salesperson] || (bySp[r.salesperson] = { leads: 0 }); g.leads += funnelTotal(r); });
        const spRows = Object.entries(bySp).map(([sp, g]) => { const o = (A.bySalesperson.find(x => x.key === sp) || {}).orders || 0; return { sp, leads: g.leads, orders: o, close: g.leads ? Math.round(o / g.leads * 100) : 0 }; }).sort((a, b) => b.leads - a.leads);
        const topPlat = platSorted[0];
        // PART 97: คนทักใหม่/เก่า (รวม + ต่อเวลา) + %ปิดต่อช่องทาง
        const noTot = fr.reduce((a, r) => { const x = funnelNewOld(r); a.n += x.new; a.o += x.old; return a; }, { n: 0, o: 0 });
        const noByB = {}; fr.forEach(r => { const b = bucketKey(r.date, gran); const x = funnelNewOld(r); const g = noByB[b] || (noByB[b] = { n: 0, o: 0 }); g.n += x.new; g.o += x.old; });
        const noNew = buckets.map(b => noByB[b]?.n || 0), noOld = buckets.map(b => noByB[b]?.o || 0);
        const closeByChan = platSorted.map(([p, leads]) => { const ord = funnelOrds.filter(o => o.channel === p).length; return { chan: p, leads, orders: ord, close: leads ? Math.round(ord / leads * 100) : 0 }; });
        return (<>
          <div className="metric-grid">
            <MetricCard label="คนทักรวม" value={N(totalLeads)} icon="users" sub={(noTot.n || noTot.o) ? `ใหม่ ${N(noTot.n)} · เก่า ${N(noTot.o)}` : (platSorted.slice(0, 3).map(([p, n]) => `${p} ${N(n)}`).join(' · ') || '—')} />
            <MetricCard label="ปิดการขาย" value={N(orders)} icon="check" sub="ออเดอร์ในช่วงนี้" tone="var(--accent)" />
            <MetricCard label="%ปิดการขาย" value={`${close}%`} icon="target" tone={close >= 15 ? 'var(--good)' : close >= 8 ? 'var(--warn)' : 'var(--bad)'} sub="ออเดอร์ ÷ คนทัก" />
            <MetricCard label="แพลตฟอร์มหลัก" value={topPlat ? topPlat[0] : '—'} sub={topPlat ? `${N(topPlat[1])} คน · ${Math.round(topPlat[1] / totalLeads * 100)}% ของทักรวม` : 'ยังไม่มีข้อมูล'} />
          </div>
          {/* เสียงลูกค้า — ยกขึ้นเด่น (บนสุดของแท็บ) · 2 กล่อง ถามหา/ติ + ฟีดรายวัน */}
          <VoiceFeed funnel={fr} title="เสียงลูกค้าในช่วงนี้" />
          <Card className="p-[22px]">
            <CardTitle className="m-0 text-base font-semibold mb-[12px]">คนทัก vs ปิดการขาย ตามเวลา <span className="dim">(แท่ง=คนทัก · เส้น=ออเดอร์)</span></CardTitle>
            <ComboChart labels={labels} bars={bars} line={line} barLabel="คนทัก" lineLabel="ออเดอร์" barFmt={N} lineFmt={N} height={240} />
          </Card>
          <div className="grid g2" style={{ alignItems: 'start' }}>
            <Card className="p-[22px]">
              <CardTitle className="m-0 text-base font-semibold mb-[12px]">คนทักใหม่ vs เก่า ตามเวลา</CardTitle>
              {(noTot.n || noTot.o)
                ? <><StackedBars labels={labels} datasets={[{ label: 'ทักใหม่', data: noNew, color: 'var(--info)' }, { label: 'ทักเก่า', data: noOld, color: 'var(--good)' }]} fmt={N} height={200} />
                    <div className="cap row" style={{ gap: 14, marginTop: 8, justifyContent: 'center', color: 'var(--ink-4)' }}><span className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: 'var(--info)' }} /> ใหม่ {N(noTot.n)}</span><span className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: 'var(--good)' }} /> เก่า {N(noTot.o)}</span></div></>
                : <div className="cap" style={{ color: 'var(--ink-4)', padding: 12 }}>ยังไม่ได้แยกใหม่/เก่า — ให้เซลล์กรอกช่อง "ทักใหม่/เก่า" ในหน้าคนทัก</div>}
            </Card>
            <Card className="p-[22px]">
              <CardTitle className="m-0 text-base font-semibold mb-[12px]">ช่องทางคนทัก</CardTitle>
              <div style={{ maxWidth: 220, margin: '0 auto' }}><DonutChart data={platSorted.map(([p, n]) => ({ label: p, value: n, color: channelColor(p) }))} height={180} /></div>
            </Card>
          </div>
          <div className="grid g2" style={{ alignItems: 'start' }}>
            <Card className="p-[22px]">
              <CardTitle className="m-0 text-base font-semibold mb-[12px]">%ปิดการขายต่อช่องทาง</CardTitle>
              <CardTable><Table>
                <TableHeader><TableRow><TableHead>ช่องทาง</TableHead><TableHead style={{ textAlign: 'right' }}>คนทัก</TableHead><TableHead style={{ textAlign: 'right' }}>ปิดได้</TableHead><TableHead style={{ textAlign: 'right' }}>%ปิด</TableHead></TableRow></TableHeader>
                <TableBody>{closeByChan.map(r => <TableRow key={r.chan}><TableCell className="cell-title"><span className="row" style={{ gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: channelColor(r.chan) }} />{r.chan}</span></TableCell><TableCell className="num" style={{ textAlign: 'right' }}>{N(r.leads)}</TableCell><TableCell className="num" style={{ textAlign: 'right' }}>{N(r.orders)}</TableCell><TableCell className="num" style={{ textAlign: 'right', fontWeight: 700, color: r.close >= 15 ? 'var(--good)' : r.close >= 8 ? 'var(--warn)' : 'var(--bad)' }}>{r.close}%</TableCell></TableRow>)}</TableBody>
              </Table></CardTable>
            </Card>
            <Card className="p-[22px]">
              <CardTitle className="m-0 text-base font-semibold mb-[12px]">ปิดการขายต่อเซลล์</CardTitle>
              <CardTable><Table>
                <TableHeader><TableRow><TableHead>เซลล์</TableHead><TableHead style={{ textAlign: 'right' }}>คนทัก</TableHead><TableHead style={{ textAlign: 'right' }}>ปิดได้</TableHead><TableHead style={{ textAlign: 'right' }}>%ปิด</TableHead></TableRow></TableHeader>
                <TableBody>{spRows.map(r => <TableRow key={r.sp}><TableCell className="cell-title">{r.sp}</TableCell><TableCell className="num" style={{ textAlign: 'right' }}>{N(r.leads)}</TableCell><TableCell className="num" style={{ textAlign: 'right' }}>{N(r.orders)}</TableCell><TableCell className="num" style={{ textAlign: 'right', fontWeight: 700, color: r.close >= 15 ? 'var(--good)' : r.close >= 8 ? 'var(--warn)' : 'var(--bad)' }}>{r.close}%</TableCell></TableRow>)}</TableBody>
              </Table></CardTable>
            </Card>
          </div>
        </>);
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
  // key ตามค่าจริง (range/channels เป็น object/array ใหม่ทุก render ของ parent)
  const rangeKey = JSON.stringify(range);
  const channelsKey = channels.join();
  const data = useMemo(() => {
    const buckets = enumerateBuckets(range.from, range.to, gran);
    const m = {}; channels.forEach(c => m[c] = {});
    orders.forEach(o => { if (o.status === 'cancelled') return; if (o.order_date < range.from || o.order_date > range.to) return; if (!channels.includes(o.channel)) return; const b = bucketKey(o.order_date, gran); m[o.channel][b] = (m[o.channel][b] || 0) + (Number(o.sales) || 0); });
    return { buckets, m };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- memo ตาม rangeKey/channelsKey (ค่าจริง) ไม่ใช่ตัว object/array ที่สร้างใหม่ทุก render
  }, [orders, rangeKey, gran, channelsKey]);
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
