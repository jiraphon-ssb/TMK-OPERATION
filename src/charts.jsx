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
