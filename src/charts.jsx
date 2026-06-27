/* ============================================================
   charts.jsx — ชุดคอมโพเนนต์กราฟ/การ์ดที่ใช้ซ้ำได้ทั้งระบบ
   recharts 2 + CSS variables → รองรับ dark/light อัตโนมัติ
   ============================================================ */
import React from 'react';
import { B, N, Icon } from './components.jsx';
import {
  PieChart, Pie, Cell,
  BarChart, Bar,
  ComposedChart, Area, Line,
  XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

// จานสีหมวดหมู่ (categorical) — indigo-led ตรงกับ --chart-1..5
export const CAT_COLORS = ['#4f46e5', '#0ea5e9', '#14b8a6', '#f59e0b', '#8b5cf6', '#ec4899', '#84cc16', '#06b6d4', '#64748b'];
export const channelColor = (name) => ({ Shopee: '#ee6a3a', Lazada: '#6b5ce0', Facebook: '#4a8be0', LINE: '#06c755', Phone: '#3aa0c9', POS: '#e39b2e', Direct: '#8a909c', TikTok: '#18a0ab' }[name]) || '#6b7280';

// -------- shared style helpers --------
const TICK = { fill: 'var(--ink-3)', fontSize: 11 };
const AXP = { axisLine: false, tickLine: false };
const GRID = { strokeDasharray: '3 3', stroke: 'rgba(130,140,160,.18)' };
const KFMT = v => '฿' + Math.round(v / 1000) + 'k';
// formatter ให้ shadcn ChartTooltipContent: จุดสี + ชื่อชุด + ค่า (จัดรูปด้วย fmt) — รองรับ fmt ต่อชุดผ่าน map
const tipRow = (fmt) => (value, name, item) => (
  <>
    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: item?.color || item?.payload?.fill || 'var(--accent)' }} />
    <div className="flex flex-1 items-center justify-between gap-3 leading-none">
      <span className="text-muted-foreground">{name}</span>
      <span className="font-semibold tabular-nums text-foreground">{(typeof fmt === 'function' ? fmt : (fmt && fmt[item?.dataKey]) || B)(value)}</span>
    </div>
  </>
);
// config ขั้นต่ำให้ ChartContainer (label lookup) จาก [key,label] คู่ๆ
const mkCfg = (pairs) => Object.fromEntries(pairs.map(([k, label]) => [k, { label }]));
const CC_CLS = '!aspect-auto w-full';

// hex → rgba (used by Heatmap for alpha-varying cell backgrounds)
function hexA(hex, a) {
  const h = String(hex).replace('#', '');
  if (h.length !== 6) return `rgba(120,120,140,${a})`;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

// ---- โดนัท (สัดส่วน เช่น ช่องทาย) ----
export function DonutChart({ data, height = 190, ariaLabel = 'กราฟวงแหวน', tooltip = true }) {
  const items = (data || []).filter(d => (d.value || 0) > 0);
  const total = items.reduce((a, d) => a + d.value, 0);
  const cfg = mkCfg(items.map(d => [d.label, d.label]));
  return (
    <ChartContainer config={cfg} className={CC_CLS} style={{ height }}>
      <PieChart aria-label={ariaLabel}>
        {tooltip && <ChartTooltip wrapperStyle={{ zIndex: 50 }} allowEscapeViewBox={{ x: true, y: true }} content={<ChartTooltipContent nameKey="label" formatter={tipRow(v => `${B(v)} (${Math.round(v / (total || 1) * 100)}%)`)} />} />}
        <Pie data={items} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="82%" paddingAngle={2} stroke="none">
          {items.map((d, i) => <Cell key={i} fill={d.color || CAT_COLORS[i % CAT_COLORS.length]} />)}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}

// ---- เส้น/พื้นที่ (เทรนด์ + เส้นคาดการณ์ประ) · compact=มินิไม่มีแกน (ใช้ใน hero) ----
export function AreaTrend({ labels, values, forecast = [], height = 190, color, ariaLabel = 'กราฟแนวโน้ม', compact = false, valFmt }) {
  const c = color || '#4338ca';
  const hasForecast = forecast && forecast.some(v => v != null);
  const chartData = (labels && labels.length ? labels : values.map((_, i) => i + 1)).map((label, i) => ({
    label,
    actual: values[i] ?? null,
    forecast: hasForecast ? (forecast[i] ?? null) : undefined,
  }));
  return (
    <ChartContainer config={mkCfg([['actual', 'ยอดขาย'], ['forecast', 'คาดการณ์']])} className={CC_CLS} style={{ height }}>
      <ComposedChart data={chartData} margin={compact ? { top: 4, right: 4, bottom: 0, left: 4 } : { top: 4, right: 8, bottom: 0, left: 0 }} aria-label={ariaLabel}>
        {!compact && <CartesianGrid {...GRID} vertical={false} />}
        {!compact && <XAxis dataKey="label" tick={TICK} {...AXP} />}
        {!compact && <YAxis tickFormatter={KFMT} tick={TICK} {...AXP} width={52} />}
        <ChartTooltip cursor={{ stroke: 'var(--line)' }} content={<ChartTooltipContent hideLabel={compact} formatter={tipRow(valFmt || B)} />} />
        <Area type="monotone" dataKey="actual" name="ยอดขาย" stroke={c} fill={c} fillOpacity={0.14} strokeWidth={2} dot={compact ? false : { r: 3, fill: c }} activeDot={{ r: 3.5 }} connectNulls />
        {hasForecast && <Line type="monotone" dataKey="forecast" name="คาดการณ์" stroke={c} strokeDasharray="5 4" strokeWidth={2} dot={{ r: 4, fill: '#4f46e5' }} connectNulls />}
      </ComposedChart>
    </ChartContainer>
  );
}

// ---- แท่งแนวนอน (เช่น ลายขายดี) ----
export function HBars({ data, height = 240, unit = '', color, ariaLabel = 'กราฟแท่ง' }) {
  const items = data || [];
  return (
    <ChartContainer config={mkCfg([['value', unit || 'ค่า']])} className={CC_CLS} style={{ height }}>
      <BarChart data={items} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} aria-label={ariaLabel}>
        <CartesianGrid {...GRID} horizontal={false} />
        <XAxis type="number" tick={TICK} {...AXP} />
        <YAxis dataKey="label" type="category" width={90} tick={{ fill: 'var(--ink)', fontSize: 12 }} {...AXP} />
        <ChartTooltip content={<ChartTooltipContent hideLabel formatter={tipRow(v => `${Math.round(v).toLocaleString()}${unit ? ' ' + unit : ''}`)} />} />
        <Bar dataKey="value" name={unit || 'ค่า'} radius={[0, 5, 5, 0]} maxBarSize={22}>
          {items.map((d, i) => <Cell key={i} fill={d.color || color || '#4338ca'} />)}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

// ---- แท่งแนวตั้งกลุ่ม (เช่น ลาย × ช่อง) ----
export function GroupBars({ labels, datasets, height = 240, fmt, ariaLabel = 'กราฟแท่ง' }) {
  const ds = datasets || [];
  const chartData = (labels || []).map((label, i) => {
    const row = { label };
    ds.forEach((d, j) => { row[`d${j}`] = d.data[i]; });
    return row;
  });
  return (
    <ChartContainer config={mkCfg(ds.map((d, i) => [`d${i}`, d.label]))} className={CC_CLS} style={{ height }}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} aria-label={ariaLabel}>
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey="label" tick={TICK} {...AXP} />
        <YAxis tick={TICK} {...AXP} width={48} />
        <ChartTooltip content={<ChartTooltipContent formatter={tipRow(fmt || B)} />} />
        {ds.map((d, i) => (
          <Bar key={i} dataKey={`d${i}`} name={d.label} fill={d.color || CAT_COLORS[i % CAT_COLORS.length]} radius={4} maxBarSize={26} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

// ---- เกจครึ่งวงกลม (เป้า/pacing) — SVG ล้วน ----
export function Gauge({ value, max, label, sub, height = 150 }) {
  const pct = max > 0 ? Math.min(1.15, value / max) : 0;
  const ang = -Math.PI + Math.min(1, pct) * Math.PI;
  const cx = 100, cy = 96, r = 78;
  const x = cx + r * Math.cos(ang), y = cy + r * Math.sin(ang);
  const big = pct >= 1;
  const tone = pct >= 1 ? 'var(--good)' : pct >= 0.7 ? 'var(--warn)' : 'var(--bad)';
  const arc = (a) => `${cx + r * Math.cos(-Math.PI + a * Math.PI)} ${cy + r * Math.sin(-Math.PI + a * Math.PI)}`;
  return (
    <div style={{ textAlign: 'center' }}>
      <svg viewBox="0 0 200 116" width="100%" height={height} role="img" aria-label={`${label} ${Math.round(pct * 100)}%`}>
        <path d={`M ${arc(0)} A ${r} ${r} 0 0 1 ${arc(1)}`} fill="none" stroke="var(--line)" strokeWidth="13" strokeLinecap="round" />
        <path d={`M ${arc(0)} A ${r} ${r} 0 ${big ? 1 : 0} 1 ${x} ${y}`} fill="none" stroke={tone} strokeWidth="13" strokeLinecap="round" />
        <text x="100" y="84" textAnchor="middle" style={{ fontSize: 26, fontWeight: 700, fill: 'var(--ink)' }}>{Math.round(pct * 100)}%</text>
        <text x="100" y="104" textAnchor="middle" style={{ fontSize: 11, fill: 'var(--ink-3)' }}>{sub || ''}</text>
      </svg>
      {label && <div className="cap" style={{ marginTop: 2 }}>{label}</div>}
    </div>
  );
}

// ---- เลขนับวิ่ง (count-up) ด้วย requestAnimationFrame · ease-out · เคารพ prefers-reduced-motion ----
export function useCountUp(target, { duration = 900, decimals = 0 } = {}) {
  const end = Number(target) || 0;
  const [val, setVal] = React.useState(end);
  const fromRef = React.useRef(end);
  React.useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = fromRef.current;
    if (reduce || from === end || duration <= 0) { fromRef.current = end; setVal(end); return; }
    let raf, start = null;
    const m = Math.pow(10, decimals);
    const step = (ts) => {
      if (start == null) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setVal(Math.round((from + (end - from) * e) * m) / m);
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = end;
    };
    raf = requestAnimationFrame(step);
    return () => raf && cancelAnimationFrame(raf);
  }, [end, duration, decimals]);
  return val;
}

// ---- ตัวเลขนับวิ่งพร้อม formatter (countTo=ตัวเลขดิบ, fmt=ฟังก์ชันจัดรูป) ----
export function CountUp({ value, fmt = N, duration = 900, decimals = 0 }) {
  const v = useCountUp(value, { duration, decimals });
  return <>{(fmt || N)(v)}</>;
}

// ---- การ์ดตัวเลขสรุป (KPI) พร้อม delta + ไอคอน · countTo=นับวิ่ง, index=ลำดับ stagger ----
export function MetricCard({ label, value, countTo, fmt, decimals, delta, deltaUp, sub, tone, icon, index, animate = true }) {
  return (
    <div className={'metric-card' + (animate ? ' metric-anim' : '')} style={index != null ? { '--i': index } : undefined}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="cap" style={{ color: 'var(--ink-3)' }}>{label}</div>
        {icon && <span style={{ color: tone || 'var(--ink-4)', opacity: 0.85 }}><Icon name={icon} /></span>}
      </div>
      <div className="num" style={{ fontSize: 23, fontWeight: 700, marginTop: 4, color: tone || 'var(--ink)' }}>
        {countTo != null ? <CountUp value={countTo} fmt={fmt} decimals={decimals} /> : value}
      </div>
      <div className="row" style={{ gap: 6, marginTop: 3 }}>
        {delta != null && <span className="cap" style={{ fontWeight: 700, color: deltaUp ? 'var(--good)' : 'var(--bad)', display: 'inline-flex', alignItems: 'center', gap: 2 }}><Icon name={deltaUp ? 'up' : 'down'} size={12} />{delta}</span>}
        {sub && <span className="cap" style={{ color: 'var(--ink-4)' }}>{sub}</span>}
      </div>
    </div>
  );
}

// ---- มินิบาร์แนวตั้ง (sparkbars เช่น ไซซ์) — HTML flex ----
export function MiniBars({ data, color, height = 44 }) {
  const max = Math.max(1, ...(data || []).map(d => d.value));
  return (
    <div>
      <div className="row" style={{ gap: 5, alignItems: 'flex-end', height }}>
        {(data || []).map((d, i) => (
          <div key={i} title={`${d.label} ${N(d.value)}`} style={{ flex: 1, height: `${Math.max(5, (d.value / max) * 100)}%`, background: color || 'var(--accent)', borderRadius: '3px 3px 0 0', opacity: 1 - i * 0.07 }} />
        ))}
      </div>
      <div className="row between" style={{ marginTop: 5 }}>
        {(data || []).map((d, i) => <span key={i} className="cap" style={{ fontSize: 10, flex: 1, textAlign: 'center' }}>{d.label}</span>)}
      </div>
    </div>
  );
}

// ---- คอมโบ: แท่ง(ยอด) + เส้น(ออเดอร์) สองแกน + เส้นเทียบช่วงก่อน ----
export function ComboChart({ labels, bars, line, cmpBars, barLabel = 'ยอดขาย', lineLabel = 'ออเดอร์', barFmt, lineFmt, cmpLabel = 'ช่วงก่อน', height = 230, ariaLabel = 'กราฟยอดขายตามเวลา' }) {
  const hasCmp = cmpBars && cmpBars.some(v => v != null);
  const hasLine = line != null;
  const chartData = (labels || []).map((label, i) => ({
    label,
    bars: bars[i] ?? null,
    line: hasLine ? (line[i] ?? null) : undefined,
    cmpBars: hasCmp ? (cmpBars[i] ?? null) : undefined,
  }));
  const comboFmt = { bars: barFmt || B, cmpBars: barFmt || B, line: lineFmt || (v => v) };
  return (
    <ChartContainer config={mkCfg([['bars', barLabel], ['line', lineLabel], ['cmpBars', cmpLabel]])} className={CC_CLS} style={{ height }}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 40, bottom: 0, left: 0 }} aria-label={ariaLabel}>
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey="label" tick={TICK} {...AXP} interval="preserveStartEnd" />
        <YAxis yAxisId="y" tickFormatter={KFMT} tick={TICK} {...AXP} width={52} />
        {hasLine && <YAxis yAxisId="y1" orientation="right" tick={TICK} {...AXP} width={32} />}
        <ChartTooltip content={<ChartTooltipContent formatter={tipRow(comboFmt)} />} />
        <Bar yAxisId="y" dataKey="bars" name={barLabel} fill="#4338ca" fillOpacity={0.85} radius={4} maxBarSize={34} />
        {hasCmp && <Bar yAxisId="y" dataKey="cmpBars" name={cmpLabel} fill="rgba(130,140,160,.28)" radius={4} maxBarSize={34} />}
        {hasLine && <Line type="monotone" yAxisId="y1" dataKey="line" name={lineLabel} stroke="#4f46e5" strokeWidth={2} dot={{ r: 2 }} connectNulls />}
      </ComposedChart>
    </ChartContainer>
  );
}

// ---- แท่งซ้อน (channel × เวลา) ----
export function StackedBars({ labels, datasets, height = 230, fmt, ariaLabel = 'กราฟแท่งซ้อน' }) {
  const ds = datasets || [];
  const chartData = (labels || []).map((label, i) => {
    const row = { label };
    ds.forEach((d, j) => { row[`d${j}`] = d.data[i]; });
    return row;
  });
  return (
    <ChartContainer config={mkCfg(ds.map((d, i) => [`d${i}`, d.label]))} className={CC_CLS} style={{ height }}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} aria-label={ariaLabel}>
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey="label" tick={TICK} {...AXP} interval="preserveStartEnd" />
        <YAxis tickFormatter={KFMT} tick={TICK} {...AXP} width={52} />
        <ChartTooltip content={<ChartTooltipContent formatter={tipRow(fmt || B)} />} />
        {ds.map((d, i) => (
          <Bar key={i} dataKey={`d${i}`} name={d.label} stackId="a" fill={d.color || CAT_COLORS[i % CAT_COLORS.length]} radius={i === ds.length - 1 ? [2, 2, 0, 0] : 0} maxBarSize={40} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

// ---- Pareto: แท่ง(ค่า) + เส้นสะสม%(80/20) ----
export function ParetoChart({ items, valKey = 'sales', height = 230, fmt, ariaLabel = 'กราฟพาเรโต' }) {
  const it = items || [];
  const total = it.reduce((a, x) => a + (x[valKey] || 0), 0);
  let cum = 0;
  const chartData = it.map(x => {
    cum += (x[valKey] || 0);
    return { key: x.key, value: x[valKey] || 0, cumPct: total ? Math.round(cum / total * 100) : 0 };
  });
  const parFmt = { value: fmt || B, cumPct: v => `สะสม ${v}%` };
  return (
    <ChartContainer config={mkCfg([['value', 'ยอดขาย'], ['cumPct', 'สะสม %']])} className={CC_CLS} style={{ height }}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 40, bottom: 30, left: 0 }} aria-label={ariaLabel}>
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey="key" tick={{ fill: 'var(--ink)', fontSize: 11 }} {...AXP} interval={0} angle={-30} textAnchor="end" height={50} />
        <YAxis yAxisId="y" tick={TICK} {...AXP} width={52} />
        <YAxis yAxisId="y1" orientation="right" domain={[0, 100]} tickFormatter={v => v + '%'} tick={TICK} {...AXP} width={36} />
        <ChartTooltip content={<ChartTooltipContent formatter={tipRow(parFmt)} />} />
        <Bar yAxisId="y" dataKey="value" name="ยอดขาย" fill="#4338ca" fillOpacity={0.85} radius={4} maxBarSize={30} />
        <Line type="monotone" yAxisId="y1" dataKey="cumPct" name="สะสม %" stroke="#e39b2e" strokeWidth={2} dot={{ r: 2 }} />
      </ComposedChart>
    </ChartContainer>
  );
}

// ---- Heatmap (matrix) — HTML grid ----
export function Heatmap({ rows, cols, cell, fmt = (v) => N(v), color = '#4f46e5', height: _height }) {
  const all = [];
  (rows || []).forEach(r => (cols || []).forEach(c => all.push(cell(r, c) || 0)));
  const max = Math.max(1, ...all);
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `minmax(64px,auto) repeat(${(cols || []).length}, minmax(38px,1fr))`, gap: 3, minWidth: 'max-content' }}>
        <div />
        {(cols || []).map((c, i) => (
          <div key={i} className="cap" style={{ fontSize: 10, textAlign: 'center', color: 'var(--ink-3)', padding: '2px 0', whiteSpace: 'nowrap' }}>{c.label ?? c}</div>
        ))}
        {(rows || []).map((r, ri) => (
          <React.Fragment key={ri}>
            <div className="cap" style={{ fontSize: 11, color: 'var(--ink)', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', paddingRight: 6 }}>{r.label ?? r}</div>
            {(cols || []).map((c, ci) => {
              const v = cell(r, c) || 0;
              const a = v / max;
              return (
                <div key={ci} title={`${r.label ?? r} · ${c.label ?? c}: ${fmt(v)}`} style={{ aspectRatio: '1.4', minHeight: 26, borderRadius: 4, background: v ? hexA(color, 0.12 + a * 0.78) : 'var(--surface-2, rgba(130,140,160,.06))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: a > 0.55 ? '#fff' : 'var(--ink-3)', fontWeight: a > 0.55 ? 600 : 400 }}>
                  {v ? fmt(v) : ''}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ---- Sparkline — SVG ล้วน ----
export function Sparkline({ data = [], w = 120, h = 30, color = 'var(--accent)', fill = true, strokeW = 1.7 }) {
  const v = (data || []).map(n => Number(n) || 0);
  if (v.length < 2) return <svg width={w} height={h} aria-hidden="true" />;
  const min = Math.min(...v), max = Math.max(...v), span = (max - min) || 1;
  const x = i => (i / (v.length - 1)) * (w - 4) + 2;
  const y = n => h - 3 - ((n - min) / span) * (h - 6);
  const pts = v.map((n, i) => `${x(i).toFixed(1)},${y(n).toFixed(1)}`).join(' ');
  const last = v.length - 1;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
      {fill && <polygon points={`2,${h} ${pts} ${w - 2},${h}`} fill={color} opacity="0.09" />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth={strokeW} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(last)} cy={y(v[last])} r="2.4" fill={color} />
    </svg>
  );
}

// ---- Sparkline แบบ recharts gradient-fill (เฟี้ยวกว่า · ใช้ใน KPI hero / ตารางลาย) ----
let _gradSeq = 0;
export function GradientSparkline({ data = [], height = 36, color = '#4f46e5', strokeW = 2, ariaLabel = 'กราฟย่อแนวโน้ม' }) {
  const v = (data || []).map(n => Number(n) || 0);
  const gid = React.useMemo(() => `spark-grad-${_gradSeq++}`, []);
  if (v.length < 2) return <div style={{ height }} aria-hidden="true" />;
  const chartData = v.map((n, i) => ({ i, value: n }));
  return (
    <ChartContainer config={mkCfg([['value', 'ค่า']])} className={CC_CLS} style={{ height }}>
      <ComposedChart data={chartData} margin={{ top: 2, right: 1, bottom: 1, left: 1 }} aria-label={ariaLabel}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.32} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={strokeW} fill={`url(#${gid})`} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ChartContainer>
  );
}
