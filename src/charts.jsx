/* ============================================================
   charts.jsx — ชุดคอมโพเนนต์กราฟ/การ์ดที่ใช้ซ้ำได้ทั้งระบบ
   ใช้ Chart.js (lazy-load → แยก chunk ไม่บวม main) + รองรับ dark/light
   ============================================================ */
import React, { useRef, useEffect, useState } from 'react';
import { B, N, Icon } from './components.jsx';

// อ่านสีธีมจาก CSS variable (canvas ใช้ var ตรงๆ ไม่ได้ ต้อง resolve เป็น hex/rgb)
function readTheme() {
  const s = getComputedStyle(document.documentElement);
  const g = (n, fb) => { const v = (s.getPropertyValue(n) || '').trim(); return v || fb; };
  return {
    ink: g('--ink', '#16181d'), ink3: g('--ink-3', '#8a909c'), ink4: g('--ink-4', '#aab', ''),
    line: g('--line', 'rgba(130,140,160,.18)'),
    accent: g('--accent', '#4c7dff'), accent2: g('--accent-2', '#7c5cff'),
    good: g('--good', '#1faf6b'), bad: g('--bad', '#e0514a'), warn: g('--warn', '#e39b2e'),
    surface: g('--surface', '#ffffff'),
  };
}
// จานสีหมวดหมู่ (categorical) — ช่องทาง/หมวด ใช้ชุดนี้ ให้สีคงที่สวยทั้ง 2 โหมด
export const CAT_COLORS = ['#4c7dff', '#e2603a', '#1faf6b', '#7c5cff', '#e39b2e', '#3aa0c9', '#d6477e', '#73a127', '#8a909c'];
export const channelColor = (name) => ({ Shopee: '#e2603a', Lazada: '#7c5cff', Facebook: '#4c7dff', LINE: '#1faf6b', Phone: '#3aa0c9', POS: '#e39b2e', Direct: '#8a909c', TikTok: '#d6477e' }[name]) || '#6b7280';

// ---- ฐานกราฟ Chart.js: lazy-load + รีเฟรชเมื่อ data/ธีมเปลี่ยน ----
function ChartBase({ make, deps = [], height = 200, ariaLabel = 'กราฟ', fallback = '' }) {
  const elRef = useRef(null);
  const chartRef = useRef(null);
  const [tick, setTick] = useState(0); // ธีมเปลี่ยน → รีเฟรช
  useEffect(() => {
    const obs = new MutationObserver(() => setTick(t => t + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => obs.disconnect();
  }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      const mod = await import('chart.js/auto');
      const Chart = mod.default;
      if (!alive || !elRef.current) return;
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
      const cfg = make(readTheme(), Chart);
      cfg.options = cfg.options || {};
      cfg.options.responsive = true; cfg.options.maintainAspectRatio = false;
      cfg.options.animation = { duration: 320 };
      chartRef.current = new Chart(elRef.current, cfg);
    })();
    return () => { alive = false; if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return <div style={{ position: 'relative', width: '100%', height }}><canvas ref={elRef} role="img" aria-label={ariaLabel}>{fallback}</canvas></div>;
}

// ---- โดนัท (สัดส่วน เช่น ช่องทาง) ----
export function DonutChart({ data, height = 190, ariaLabel = 'กราฟวงแหวน' }) {
  const items = (data || []).filter(d => (d.value || 0) > 0);
  return <ChartBase height={height} ariaLabel={ariaLabel} fallback={items.map(d => `${d.label} ${Math.round(d.value)}`).join(', ')}
    deps={[JSON.stringify(items)]}
    make={(t) => ({
      type: 'doughnut',
      data: { labels: items.map(d => d.label), datasets: [{ data: items.map(d => d.value), backgroundColor: items.map(d => d.color || '#6b7280'), borderWidth: 2, borderColor: t.surface, hoverOffset: 6 }] },
      options: { cutout: '62%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${B(c.raw)} (${Math.round(c.raw / c.dataset.data.reduce((a, b) => a + b, 0) * 100)}%)` } } } },
    })} />;
}

// ---- เส้น/พื้นที่ (เทรนด์ + เส้นคาดการณ์ประ) ----
export function AreaTrend({ labels, values, forecast = [], height = 190, color, ariaLabel = 'กราฟแนวโน้ม' }) {
  return <ChartBase height={height} ariaLabel={ariaLabel} fallback={(labels || []).map((l, i) => `${l} ${Math.round(values[i] || 0)}`).join(', ')}
    deps={[JSON.stringify(labels), JSON.stringify(values), JSON.stringify(forecast)]}
    make={(t) => {
      const c = color || t.accent2;
      const ds = [{ data: values, borderColor: c, backgroundColor: hexA(c, 0.14), fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: c, borderWidth: 2 }];
      if (forecast && forecast.some(v => v != null)) ds.push({ data: forecast, borderColor: c, borderDash: [5, 4], pointRadius: forecast.map(v => v != null ? 4 : 0), pointBackgroundColor: t.accent, borderWidth: 2, fill: false });
      return { type: 'line', data: { labels, datasets: ds }, options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => B(x.raw) } } }, scales: { y: { grid: { color: t.line }, ticks: { color: t.ink3, callback: (v) => '฿' + Math.round(v / 1000) + 'k' } }, x: { grid: { display: false }, ticks: { color: t.ink3 } } } } };
    }} />;
}

// ---- แท่งแนวนอน (เช่น ลายขายดี) ----
export function HBars({ data, height = 240, unit = '', color, ariaLabel = 'กราฟแท่ง' }) {
  const items = data || [];
  return <ChartBase height={height} ariaLabel={ariaLabel} fallback={items.map(d => `${d.label} ${Math.round(d.value)}`).join(', ')}
    deps={[JSON.stringify(items), color || '']}
    make={(t) => ({
      type: 'bar',
      data: { labels: items.map(d => d.label), datasets: [{ data: items.map(d => d.value), backgroundColor: items.map(d => d.color || color || t.accent2), borderRadius: 5, barThickness: 'flex', maxBarThickness: 22 }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${Math.round(c.raw).toLocaleString()} ${unit}` } } }, scales: { x: { grid: { color: t.line }, ticks: { color: t.ink3 } }, y: { grid: { display: false }, ticks: { color: t.ink, font: { size: 12 } } } } },
    })} />;
}

// ---- แท่งแนวตั้งกลุ่ม (เช่น ลาย× ช่อง) — รับ datasets หลายชุด ----
export function GroupBars({ labels, datasets, height = 240, fmt, ariaLabel = 'กราฟแท่ง' }) {
  return <ChartBase height={height} ariaLabel={ariaLabel} fallback={(labels || []).join(', ')}
    deps={[JSON.stringify(labels), JSON.stringify(datasets)]}
    make={(t) => ({
      type: 'bar',
      data: { labels, datasets: (datasets || []).map((d, i) => ({ label: d.label, data: d.data, backgroundColor: d.color || CAT_COLORS[i % CAT_COLORS.length], borderRadius: 4, maxBarThickness: 26 })) },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${(fmt || B)(c.raw)}` } } }, scales: { x: { grid: { display: false }, ticks: { color: t.ink3 }, stacked: false }, y: { grid: { color: t.line }, ticks: { color: t.ink3 } } } },
    })} />;
}

// ---- เกจครึ่งวงกลม (เป้า/pacing) ----
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

// ---- การ์ดตัวเลขสรุป (KPI) พร้อม delta + ไอคอน ----
export function MetricCard({ label, value, delta, deltaUp, sub, tone, icon }) {
  return (
    <div className="metric-card">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="cap" style={{ color: 'var(--ink-3)' }}>{label}</div>
        {icon && <span style={{ color: tone || 'var(--ink-4)', opacity: 0.85 }}><Icon name={icon} /></span>}
      </div>
      <div className="num" style={{ fontSize: 23, fontWeight: 700, marginTop: 4, color: tone || 'var(--ink)' }}>{value}</div>
      <div className="row" style={{ gap: 6, marginTop: 3 }}>
        {delta != null && <span className="cap" style={{ fontWeight: 700, color: deltaUp ? 'var(--good)' : 'var(--bad)' }}>{deltaUp ? '▲' : '▼'}{delta}</span>}
        {sub && <span className="cap" style={{ color: 'var(--ink-4)' }}>{sub}</span>}
      </div>
    </div>
  );
}

// ---- มินิบาร์แนวตั้ง (sparkbars เช่น ไซซ์) — เบา ไม่ต้องใช้ chart lib ----
export function MiniBars({ data, color, height = 44 }) {
  const max = Math.max(1, ...(data || []).map(d => d.value));
  return (
    <div>
      <div className="row" style={{ gap: 5, alignItems: 'flex-end', height }}>
        {(data || []).map((d, i) => <div key={i} title={`${d.label} ${N(d.value)}`} style={{ flex: 1, height: `${Math.max(5, (d.value / max) * 100)}%`, background: color || 'var(--accent)', borderRadius: '3px 3px 0 0', opacity: 1 - i * 0.07 }} />)}
      </div>
      <div className="row between" style={{ marginTop: 5 }}>{(data || []).map((d, i) => <span key={i} className="cap" style={{ fontSize: 10, flex: 1, textAlign: 'center' }}>{d.label}</span>)}</div>
    </div>
  );
}

function hexA(hex, a) {
  const h = String(hex).replace('#', '');
  if (h.length !== 6) return `rgba(120,120,140,${a})`;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ---- คอมโบ: แท่ง(ยอด) + เส้น(ออเดอร์) สองแกน + เส้นเทียบช่วงก่อน(ประ) ----
export function ComboChart({ labels, bars, line, cmpBars, barLabel = 'ยอดขาย', lineLabel = 'ออเดอร์', barFmt, lineFmt, cmpLabel = 'ช่วงก่อน', height = 230, ariaLabel = 'กราฟยอดขายตามเวลา' }) {
  return <ChartBase height={height} ariaLabel={ariaLabel} fallback={(labels || []).join(', ')}
    deps={[JSON.stringify(labels), JSON.stringify(bars), JSON.stringify(line), JSON.stringify(cmpBars)]}
    make={(t) => {
      const ds = [{ type: 'bar', label: barLabel, data: bars, backgroundColor: hexA(t.accent2, 0.85), borderRadius: 4, maxBarThickness: 34, order: 2, yAxisID: 'y' }];
      if (cmpBars && cmpBars.some(v => v != null)) ds.push({ type: 'bar', label: cmpLabel, data: cmpBars, backgroundColor: hexA(t.ink3, 0.28), borderRadius: 4, maxBarThickness: 34, order: 3, yAxisID: 'y' });
      if (line) ds.push({ type: 'line', label: lineLabel, data: line, borderColor: t.accent, backgroundColor: t.accent, tension: 0.35, pointRadius: 2, borderWidth: 2, order: 1, yAxisID: 'y1' });
      return { data: { labels, datasets: ds }, options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.dataset.yAxisID === 'y1' ? (lineFmt || ((v) => v))(c.raw) : (barFmt || B)(c.raw)}` } } }, scales: { y: { position: 'left', grid: { color: t.line }, ticks: { color: t.ink3, callback: (v) => '฿' + Math.round(v / 1000) + 'k' } }, y1: { position: 'right', grid: { display: false }, ticks: { color: t.ink3 } }, x: { grid: { display: false }, ticks: { color: t.ink3, maxRotation: 45, autoSkip: true, maxTicksLimit: 14 } } } } };
    }} />;
}

// ---- แท่งซ้อน (channel × เวลา) — datasets หลายชุด stacked ----
export function StackedBars({ labels, datasets, height = 230, fmt, ariaLabel = 'กราฟแท่งซ้อน' }) {
  return <ChartBase height={height} ariaLabel={ariaLabel} fallback={(labels || []).join(', ')}
    deps={[JSON.stringify(labels), JSON.stringify(datasets)]}
    make={(t) => ({
      type: 'bar',
      data: { labels, datasets: (datasets || []).map((d, i) => ({ label: d.label, data: d.data, backgroundColor: d.color || CAT_COLORS[i % CAT_COLORS.length], borderRadius: 2, maxBarThickness: 40 })) },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${(fmt || B)(c.raw)}` } } }, scales: { x: { stacked: true, grid: { display: false }, ticks: { color: t.ink3, maxRotation: 45, autoSkip: true, maxTicksLimit: 14 } }, y: { stacked: true, grid: { color: t.line }, ticks: { color: t.ink3, callback: (v) => '฿' + Math.round(v / 1000) + 'k' } } } },
    })} />;
}

// ---- Pareto: แท่ง(ค่า) + เส้นสะสม%(80/20) ----
export function ParetoChart({ items, valKey = 'sales', height = 230, fmt, ariaLabel = 'กราฟพาเรโต' }) {
  const it = items || [];
  return <ChartBase height={height} ariaLabel={ariaLabel} fallback={it.map(x => x.key).join(', ')}
    deps={[JSON.stringify(it), valKey]}
    make={(t) => {
      const total = it.reduce((a, x) => a + x[valKey], 0); let cum = 0; const cumPct = it.map(x => { cum += x[valKey]; return total ? Math.round(cum / total * 100) : 0; });
      return { data: { labels: it.map(x => x.key), datasets: [{ type: 'bar', data: it.map(x => x[valKey]), backgroundColor: hexA(t.accent2, 0.85), borderRadius: 4, maxBarThickness: 30, order: 2, yAxisID: 'y' }, { type: 'line', data: cumPct, borderColor: t.warn, backgroundColor: t.warn, pointRadius: 2, borderWidth: 2, tension: 0.3, order: 1, yAxisID: 'y1' }] }, options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => c.dataset.yAxisID === 'y1' ? `สะสม ${c.raw}%` : (fmt || B)(c.raw) } } }, scales: { y: { grid: { color: t.line }, ticks: { color: t.ink3 } }, y1: { position: 'right', min: 0, max: 100, grid: { display: false }, ticks: { color: t.ink3, callback: (v) => v + '%' } }, x: { grid: { display: false }, ticks: { color: t.ink, font: { size: 11 }, maxRotation: 45 } } } } };
    }} />;
}

// ---- Heatmap (matrix) — HTML grid, ความเข้ม = ค่าเทียบ max (เบา ไม่ใช้ chart lib) ----
export function Heatmap({ rows, cols, cell, fmt = (v) => N(v), color = '#4c7dff', height: _height }) {
  const all = []; (rows || []).forEach(r => (cols || []).forEach(c => all.push(cell(r, c) || 0)));
  const max = Math.max(1, ...all);
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `minmax(64px,auto) repeat(${(cols || []).length}, minmax(38px,1fr))`, gap: 3, minWidth: 'max-content' }}>
        <div />
        {(cols || []).map((c, i) => <div key={i} className="cap" style={{ fontSize: 10, textAlign: 'center', color: 'var(--ink-3)', padding: '2px 0', whiteSpace: 'nowrap' }}>{c.label ?? c}</div>)}
        {(rows || []).map((r, ri) => (
          <React.Fragment key={ri}>
            <div className="cap" style={{ fontSize: 11, color: 'var(--ink)', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', paddingRight: 6 }}>{r.label ?? r}</div>
            {(cols || []).map((c, ci) => { const v = cell(r, c) || 0; const a = v / max; return <div key={ci} title={`${r.label ?? r} · ${c.label ?? c}: ${fmt(v)}`} style={{ aspectRatio: '1.4', minHeight: 26, borderRadius: 4, background: v ? hexA(color, 0.12 + a * 0.78) : 'var(--surface-2, rgba(130,140,160,.06))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: a > 0.55 ? '#fff' : 'var(--ink-3)', fontWeight: a > 0.55 ? 600 : 400 }}>{v ? fmt(v) : ''}</div>; })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// เส้นเทรนด์จิ๋วใน hero/KPI card — SVG ล้วน เบา ไม่พึ่ง Chart.js
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
