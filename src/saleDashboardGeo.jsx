/* ============================================================
   saleDashboardGeo.jsx — แผงพื้นที่การขาย (แผนที่ไทย + drill จังหวัด→ลาย→สี)
   แยกมาจาก saleDashboard.jsx (ยกมาทั้งดุ้น ไม่แก้เนื้อใน): ThailandMap · GeoPanel
   ============================================================ */
import { useState, useMemo } from 'react';
import { N, Icon } from './components.jsx';
import { geoBreakdown, regionBreakdown } from './lib/saleAgg.js';
import { PROVINCES, REGIONS, TH_BBOX } from './lib/provinces.js';
import { TH_PATHS } from './lib/thMapPaths.js';
import { baht } from './lib/saleDashboardHelpers.js';
import { ExportBtn } from './saleDashboardChrome.jsx';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TableRow, TableCell } from '@/components/ui/table';
import { SortableTable } from './components/DataTableParts.jsx';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';

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
export function GeoPanel({ ords, skus, metric, setMetric, region, setRegion, selected, onFilter, A }) {
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
                  <span className="inline-flex shrink-0 items-center justify-center -rotate-90 transition-transform group-data-[state=open]:rotate-0"><Icon name="chevD" /></span>
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
          <SortableTable cards initial={{ key: 'sales', dir: 'desc' }}
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
