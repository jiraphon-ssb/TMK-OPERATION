/* ============================================================
   TMK Operation — Shared components, icons, formatters, charts
   ============================================================ */
import React, { useState, useEffect } from 'react';

/* ---------- Image upload helper ---------- */
// อ่านรูป + ย่อขนาด (canvas) → data URL เล็ก ป้องกันรูปใหญ่ทำให้บันทึกพัง/ช้า/เกิน quota
export function readImageCompressed(file, maxSize = 256, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width >= height && width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; }
        else if (height > width && height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; }
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (err) { resolve(e.target.result); } // fallback: ใช้ไฟล์เดิม
      };
      img.onerror = () => resolve(e.target.result);
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------- Formatters ---------- */
// formatters — คืน "—" เมื่อค่าไม่ใช่ตัวเลขจริง (กัน NaN/Infinity จากการหารด้วย 0)
const _fin = n => typeof n === 'number' && isFinite(n);
export const B  = n => _fin(n) ? '฿' + Math.round(n).toLocaleString('en-US') : '—';
export const Bk = n => !_fin(n) ? '—' : n >= 1e6 ? '฿' + (n/1e6).toFixed(2) + 'M' : n >= 1000 ? '฿' + Math.round(n/1000) + 'k' : '฿' + Math.round(n);
export const P  = (n, d=1) => _fin(n) ? n.toFixed(d) + '%' : '—';
export const N  = n => _fin(n) ? Math.round(n).toLocaleString('en-US') : '—';

/* ---------- Icons (lucide-style, 24 grid, currentColor stroke) ---------- */
export const ICONS = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5',
  sales: 'M3 3v18h18M7 14l3-4 3 3 5-7',
  planner: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 9h18M8 3v4M16 3v4',
  catalog: 'M3.5 8 12 3l8.5 5v8L12 21l-8.5-5zM3.5 8 12 13l8.5-5M12 13v8',
  system: 'M12 3 4 6v5c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6zM9.5 12l1.8 1.8 3.4-3.6',
  search: 'M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M21 21l-4.3-4.3',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  plus: 'M12 5v14M5 12h14',
  sun: 'M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8',
  chevR: 'M9 6l6 6-6 6',
  chevD: 'M6 9l6 6 6-6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  x: 'M6 6l12 12M18 6 6 18',
  target: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  up: 'M7 17 17 7M9 7h8v8',
  down: 'M7 7l10 10M17 9v8H9',
  wallet: 'M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M3 7h17M16 12h5v4h-5a2 2 0 0 1 0-4',
  bag: 'M6 8h12l1 12H5zM9 8V6a3 3 0 0 1 6 0v2',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 19v-1a4 4 0 0 0-3-3.8M16 4.2a4 4 0 0 1 0 7.6',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  userPlus: 'M15 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M19 8v6M22 11h-6',
  userCheck: 'M15 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M17 11l2 2 4-4',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1M10 6l9-3v18l-9-3M19 9a3 3 0 0 1 0 6',
  listChecks: 'M11 6h10M11 12h10M11 18h10M3 6l1.5 1.5L7 4M3 17l1.5 1.5L7 15',
  route: 'M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 13V9a3 3 0 0 1 3-3h6M18 11v4a3 3 0 0 1-3 3H9',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  clock: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v5l3 2',
  shield: 'M12 3 4 6v5c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z',
  trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6',
  dot: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM13 13h7v7h-7zM4 13h7v7H4z',
  message: 'M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5',
  zap: 'M13 2 4 14h7l-1 8 9-12h-7z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  pencil: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  filter: 'M3 5h18l-7 8v6l-4-2v-4z',
  calendarDays: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 9h18M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01',
  flame: 'M12 3s5 4 5 9a5 5 0 0 1-10 0c0-1.5.7-2.8 1.5-3.5C8.5 10 9 11 10 11c0-2.5 2-3 2-8',
  arrowR: 'M5 12h14M13 6l6 6-6 6',
  external: 'M14 4h6v6M20 4l-9 9M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 4v4h-4',
  check: 'M5 12l5 5L20 6',
  layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5',
  sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM19 4v3M21 5h-3',
};

export function Icon({ name, className }) {
  const d = ICONS[name] || ICONS.dot;
  return (
    <svg className={`ico ${className || ''}`} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split('M').filter(Boolean).map((seg, i) => <path key={i} d={'M' + seg} />)}
    </svg>
  );
}

/* ---------- Status helpers ---------- */
export function paceStatus(p) {
  if (p >= 95) return { c: 'var(--good)', cls: 'chip-good', label: 'ทันเป้า' };
  if (p >= 80) return { c: 'var(--warn)', cls: 'chip-warn', label: 'ตามเป้าช้า' };
  return { c: 'var(--bad)', cls: 'chip-bad', label: 'หลุดเป้า' };
}
export const stockMeta = s => s === 'out' ? { c: 'var(--bad)', cls: 'chip-bad', label: 'หมดสต็อก' }
  : s === 'low' ? { c: 'var(--warn)', cls: 'chip-warn', label: 'ใกล้หมด' }
  : { c: 'var(--good)', cls: 'chip-good', label: 'ปกติ' };

/* ---------- useCountUp ---------- */
export function useCountUp(target, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf, start;
    const step = t => {
      if (!start) start = t;
      const p = Math.min((t - start) / ms, 1);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/* ---------- Avatar ---------- */
export function Avatar({ name, color, size = 28 }) {
  const safe = String(name || '?');
  const initials = safe.length <= 2 ? safe : safe.slice(0, 2);
  return <span className="avatar" style={{ background: color, width: size, height: size, fontSize: size * 0.42 }}>{initials}</span>;
}

/* ---------- User icon (แทนรูปโปรไฟล์) ---------- */
export function UserIcon({ size = 34, radius }) {
  const s = Math.round(size * 0.56);
  return (
    <span style={{ width: size, height: size, borderRadius: radius ?? (size >= 56 ? 18 : '50%'), background: 'var(--surface-3)', color: 'var(--ink-3)', display: 'inline-grid', placeItems: 'center', flexShrink: 0 }}>
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" />
      </svg>
    </span>
  );
}

/* ---------- ProgressRing ---------- */
export function Ring({ pct, size = 76, stroke = 8, color = 'var(--accent)', track = 'var(--surface-3)', children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const safePct = (typeof pct === 'number' && isFinite(pct)) ? pct : 0; // กัน NaN
  const off = c - (Math.min(safePct, 100) / 100) * c;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s var(--ease)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  );
}

/* ---------- MiniArea (sparkline-style area chart) ---------- */
export function MiniArea({ data, w = 320, h = 90, color = 'var(--accent)', fill = true, id, labels, fmt = Bk }) {
  const gid = 'ga-' + (id || color.replace(/[^a-z]/gi, ''));
  const [hover, setHover] = useState(null); // hovered index
  const safeData = Array.isArray(data) ? data.filter(v => typeof v === 'number' && isFinite(v)) : [];

  // ถ้าไม่มีข้อมูล → empty state แบบ HTML (ไม่ยืด/ไม่บิดเบี้ยวเหมือน SVG text)
  if (safeData.length === 0) {
    return (
      <div style={{ height: h, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--ink-4)' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.55 }}>
          <path d="M3 3v16a2 2 0 0 0 2 2h16" />
          <path d="M7 13l3-3 3 2 4-5" strokeDasharray="3 3" />
        </svg>
        <span style={{ fontSize: 11, fontWeight: 500 }}>ยังไม่มีข้อมูล</span>
      </div>
    );
  }
  // ถ้ามีจุดเดียว → ใช้ค่าซ้ำเพื่อให้ line ลากได้
  const points = safeData.length === 1 ? [safeData[0], safeData[0]] : safeData;

  const max = Math.max(...points), min = Math.min(...points);
  const range = max - min || 1;
  const pts = points.map((v, i) => [ (i / (points.length - 1)) * w, h - 6 - ((v - min) / range) * (h - 16) ]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  // area path: ต้องเริ่มด้วย M เสมอ — guard เผื่อ line ว่าง
  const area = line ? line + ` L${w} ${h} L0 ${h} Z` : '';
  const n = points.length;
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover(Math.round(ratio * (n - 1)));
  };
  const hv = hover != null && hover >= 0 && hover < n ? hover : null;
  return (
    <div style={{ position: 'relative', width: '100%', height: h }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h, display: 'block' }}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient></defs>
        {fill && area && <path d={area} fill={`url(#${gid})`} />}
        {line && <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
        {hv != null && <line x1={pts[hv][0]} y1="0" x2={pts[hv][0]} y2={h} stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" vectorEffect="non-scaling-stroke" />}
      </svg>
      {hv != null && (
        <>
          <span style={{ position: 'absolute', left: `${(hv / Math.max(n - 1, 1)) * 100}%`, top: pts[hv][1], width: 8, height: 8, marginLeft: -4, marginTop: -4, borderRadius: '50%', background: color, border: '2px solid var(--surface)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: `${(hv / Math.max(n - 1, 1)) * 100}%`, top: 0, transform: `translateX(${hv > n / 2 ? '-100%' : '0'})`, background: 'var(--ink)', color: '#fff', padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 5, fontFamily: 'var(--font)' }}>
            {labels && labels[hv] ? <span style={{ opacity: 0.8, marginRight: 6 }}>{labels[hv]}</span> : null}{fmt(safeData[hv])}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Bars (vertical) ---------- */
export function Bars({ data, h = 150, color = 'var(--accent)', labelKey = 'm', valueKey = 'rev', fmt = Bk }) {
  // กัน NaN/Infinity: ถ้าข้อมูลว่างหรือทุกค่าเป็น 0 → max = 1 (บาร์สูง 0 ไม่พัง)
  const _rawMax = data.length ? Math.max(...data.map(d => (Number(d[valueKey]) || 0) + (Number(d.proj) || 0))) : 0;
  const max = _rawMax > 0 ? _rawMax : 1;
  const safeH = (v) => { const x = ((Number(v) || 0) / max) * (h - 28); return isFinite(x) && x > 0 ? x : 0; };
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: h, paddingTop: 8 }}>
      {data.map((d, i) => {
        const main = safeH(d[valueKey]);
        const proj = safeH(d.proj);
        return (
          <div key={i} title={`${d[labelKey]}: ${fmt(d[valueKey] || 0)}${d.proj ? ' (+คาดการณ์ ' + fmt(d.proj) + ')' : ''}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end', cursor: 'default' }}>
            <div className="num cap" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{fmt(d[valueKey] + (d.proj || 0))}</div>
            <div style={{ width: '100%', maxWidth: 46, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: h - 44 }}>
              {proj > 0 && <div style={{ height: proj, background: color, opacity: 0.28, borderRadius: '6px 6px 0 0' }} />}
              <div style={{ height: main, background: color, borderRadius: proj > 0 ? 0 : '6px 6px 0 0' }} />
            </div>
            <div className="cap" style={{ color: 'var(--ink-3)' }}>{d[labelKey]}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Section wrapper ---------- */
export function Section({ eyebrow, title, action, children, style }) {
  return (
    <section style={{ marginBottom: 22, ...style }}>
      {(eyebrow || title || action) && (
        <div className="row between" style={{ marginBottom: 14, alignItems: 'flex-end' }}>
          <div>
            {eyebrow && <div className="eyebrow" style={{ marginBottom: 5 }}>{eyebrow}</div>}
            {title && <h2 className="h2">{title}</h2>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
