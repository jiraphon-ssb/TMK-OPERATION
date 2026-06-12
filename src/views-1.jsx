/* ============================================================
   TMK Operation — Views part 1: Home (cockpit) + Sales
   ============================================================ */
import { useState, useMemo } from 'react';
import { TMK } from './data.js';
import { B, Bk, Bc, P, N, Icon, paceStatus, useCountUp, Avatar, Ring, MiniArea, Bars, InfoTip, roasColor, acosColor, targetColor } from './components.jsx';
import { useUser } from './userContext.jsx';
import { getToday, THAI_MONTHS, THAI_MONTHS_FULL, todayISO } from './lib/dateUtils.js';
import { computeMonth, adCampaignInMonth, useData } from './dataContext.jsx';

const THAI_WEEKDAYS = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];

const D = TMK;
// ❌ ไม่ destructure constants เพราะ primitive snapshot จะค้างที่ 0
// ✅ ใช้ TMK.consts.X inline เพื่อให้อัปเดตจาก Supabase ทันที

/* ---------- Ad campaigns from Supabase (TMK.adCampaigns) ---------- */
// Will fall back to empty array if table not seeded
function getAdCampaigns() { return TMK.adCampaigns || []; }

/* ---------- Customer segments from Supabase (TMK.segments) ---------- */
function getSegments() { return TMK.segments || []; }

/* small KPI tile — clickable with optional onClick */
export function Kpi({ label, value, delta, deltaDir, deltaColor, icon, sub, accent, onClick, hint }) {
  return (
    <div className="card card-pad-sm" onClick={onClick}
      role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }) : undefined}
      style={{ display: 'flex', flexDirection: 'column', gap: 10, cursor: onClick ? 'pointer' : 'default', transition: 'box-shadow 0.15s' }}>
      <div className="row between">
        <span className="metric-label">{label}{hint ? <InfoTip text={hint} label={label} /> : null}</span>
        {icon && <span style={{ color: accent || 'var(--ink-3)' }}><Icon name={icon} /></span>}
      </div>
      <div className="metric-value">{value}</div>
      {(delta || sub) && (
        <div className="row" style={{ gap: 8 }}>
          {delta && (
            <span className="metric-delta" style={{ color: deltaColor || (deltaDir === 'down' ? 'var(--bad)' : 'var(--good)') }}>
              <Icon name={deltaDir === 'down' ? 'down' : 'up'} /> {delta}
            </span>
          )}
          {sub && <span className="cap">{sub}</span>}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   HOME — Executive cockpit
   ============================================================ */
// ความหมาย/สีต่อ action (สำหรับ log หน้าหลัก)
const LOG_META = {
  create: { l: 'สร้าง', c: 'var(--good)' }, update: { l: 'แก้ไข', c: 'var(--info)' },
  delete: { l: 'ลบ', c: 'var(--bad)' }, purge: { l: 'ลบถาวร', c: 'var(--bad)' },
  restore: { l: 'กู้คืน', c: 'var(--good)' }, move: { l: 'ย้ายสถานะ', c: 'var(--accent)' },
  sale: { l: 'ขาย/ตัดสต็อก', c: 'var(--accent)' }, adjust: { l: 'ปรับสต็อก', c: 'var(--info)' },
  receive: { l: 'รับเข้าสต็อก', c: 'var(--good)' }, reserve: { l: 'จองสต็อก', c: 'var(--accent)' },
  release: { l: 'ปล่อยจอง', c: 'var(--ink-3)' }, order: { l: 'ออเดอร์', c: 'var(--accent-2)' },
  export: { l: 'ส่งออก', c: 'var(--warn)' }, login: { l: 'เข้าระบบ', c: 'var(--good)' }, logout: { l: 'ออกระบบ', c: 'var(--ink-3)' },
};
const logMeta = (action) => LOG_META[action] || { l: action || 'อื่นๆ', c: 'var(--info)' };
const LOG_FILTERS = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'sales', label: 'ยอดขาย', match: a => a.entity === 'daily' || a.entity === 'monthly' || a.action === 'sale' },
  { id: 'order', label: 'ออเดอร์', match: a => a.entity === 'order' || a.action === 'order' },
  { id: 'stock', label: 'สต็อก/สินค้า', match: a => a.entity === 'product' || a.entity === 'po' || ['adjust', 'receive', 'reserve', 'release'].includes(a.action) },
  { id: 'task', label: 'งาน', match: a => a.entity === 'task' },
  { id: 'user', label: 'ผู้ใช้/ระบบ', match: a => a.entity === 'user' || a.action === 'login' || a.action === 'logout' },
];

export function HomeView({ go }) {
  const { user } = useUser() || {};
  const userName = user?.name || 'มัง';
  const [filter, setFilter] = useState('all');

  // โฟกัสวันนี้ — สิ่งที่ต้องจัดการ (หลังบ้าน ไม่มียอด/เป้า) + งานวันนี้
  const todayD = getToday().day;
  const enteredToday = (D.dailyMonth || []).some(d => d.d === todayD);
  const dueTasks = (D.tasks || []).filter(t => t.status !== 'done' && t.dateISO && t.dateISO <= todayISO());
  const todayTasks = (D.tasks || []).filter(t => t.status === 'inprogress' || t.status === 'review' || t.dateISO === todayISO());
  const lowStock = (D.products || []).filter(p => p.stock === 'out' || p.stock === 'low');
  const pendingOrders = (D.orders || []).filter(o => o.status !== 'shipped' && o.status !== 'cancelled');
  const todos = [];
  if (!enteredToday) todos.push({ c: 'var(--bad)', t: 'ยังไม่บันทึกยอดขายวันนี้', d: 'กดเพื่อกรอกยอดรายวัน', act: () => go('sales', 'monthly') });
  if (dueTasks.length) todos.push({ c: 'var(--warn)', t: `งานครบกำหนด/ค้าง ${dueTasks.length} งาน`, d: dueTasks.slice(0, 2).map(t => t.title).join(', '), act: () => go('planner', 'kanban') });
  if (lowStock.length) todos.push({ c: 'var(--info)', t: `สินค้าใกล้/หมดสต็อก ${lowStock.length} รายการ`, d: lowStock.slice(0, 2).map(p => p.name).join(', '), act: () => go('catalog', 'stock') });
  if (pendingOrders.length) todos.push({ c: 'var(--accent-2)', t: `ออเดอร์รอจัดการ ${pendingOrders.length} รายการ`, d: 'จัดการบนบอร์ดออเดอร์', act: () => go('catalog', 'orders') });

  // สรุปเมื่อวาน — digest อ่านจบใน 10 วินาที (รองรับเมื่อวานข้ามเดือน)
  const digest = (() => {
    const td = getToday();
    let mdD, yd; // เดือนที่ "เมื่อวาน" อยู่ + เลขวันเมื่อวาน
    if (td.day > 1) { mdD = computeMonth(td.month - 1, td.yearBE); yd = td.day - 1; }
    else {
      const pm = td.month === 1 ? 12 : td.month - 1, py = td.month === 1 ? td.yearBE - 1 : td.yearBE;
      mdD = computeMonth(pm - 1, py); yd = new Date(py - 543, pm, 0).getDate();
    }
    const rows = mdD.dailyBreakdown || [];
    const yest = rows.find(x => x.d === yd) || null;
    const pool = rows.filter(x => x.d < yd).sort((a, b) => b.d - a.d).slice(0, 7);
    const avg7 = pool.length ? pool.reduce((a, x) => a + x.total, 0) / pool.length : 0;
    const top = yest && yest.channels.length ? [...yest.channels].sort((a, b) => b.rev - a.rev)[0] : null;
    const diff = yest && avg7 > 0 ? ((yest.total - avg7) / avg7) * 100 : null;
    return { yd, yest, avg7, top, diff, label: yest ? yest.label : `${yd} ${THAI_MONTHS[(td.day > 1 ? td.month : (td.month === 1 ? 12 : td.month - 1)) - 1]}` };
  })();
  const copyDigest = () => {
    if (!digest.yest) return;
    const t = `สรุปยอด TMK — เมื่อวาน (${digest.label}): ${B(digest.yest.total)}`
      + (digest.top ? ` · ช่องเด่น ${digest.top.name} ${B(digest.top.rev)} (${P(digest.top.pct, 0)})` : '')
      + (digest.diff != null ? ` · เทียบเฉลี่ย 7 วัน ${digest.diff >= 0 ? '+' : ''}${digest.diff.toFixed(0)}%` : '');
    try { navigator.clipboard.writeText(t); window.__toast && window.__toast('คัดลอกสรุปแล้ว — แปะส่งไลน์ได้เลย', 'success'); } catch { window.__toast && window.__toast('คัดลอกไม่สำเร็จ', 'error'); }
  };

  // อัพเดท/log — กรอง + จัดกลุ่มตามวัน
  const f = LOG_FILTERS.find(x => x.id === filter);
  const logs = (D.audit || []).filter(a => filter === 'all' || (f && f.match && f.match(a)));
  const todayCount = (D.audit || []).filter(a => String(a.ts || '').slice(0, 10) === todayISO()).length;
  const _yest = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
  const groups = [];
  logs.forEach(a => {
    const day = String(a.ts || '').slice(0, 10);
    const key = day === todayISO() ? 'วันนี้' : day === _yest ? 'เมื่อวาน' : (a.ts ? new Date(a.ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : 'ก่อนหน้า');
    let g = groups.find(x => x.key === key); if (!g) { g = { key, items: [] }; groups.push(g); }
    g.items.push(a);
  });

  return (
    <div className="content-inner rise">
      {/* greeting */}
      <div className="row between wrap" style={{ marginBottom: 20, gap: 12 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>{(() => { const td = getToday(); return `${THAI_WEEKDAYS[new Date().getDay()]} ${td.day} ${THAI_MONTHS_FULL[td.month - 1]} ${td.yearBE}`; })()}</div>
          <h1 className="display">{(() => { const h = new Date().getHours(); return h < 12 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : h < 21 ? 'สวัสดีตอนเย็น' : 'สวัสดีตอนดึก'; })()}, {userName} {'👋'}</h1>
        </div>
        <span className={`chip ${navigator.onLine ? 'chip-good' : 'chip-warn'}`}><span className="dot-c" style={{ background: navigator.onLine ? 'var(--good)' : 'var(--warn)' }}></span> {navigator.onLine ? 'ออนไลน์' : 'ออฟไลน์'}</span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1.5fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* โฟกัสวันนี้ */}
        <div className="card">
          <div className="card-head"><h3><span style={{ color: 'var(--accent)' }}><Icon name="listChecks" /></span> {'โฟกัสวันนี้'}</h3>
            <button className="btn btn-sm btn-ghost" onClick={() => go('planner', 'kanban')}>{'งานทั้งหมด'} <Icon name="arrowR" /></button></div>
          {todos.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: todayTasks.length ? 16 : 0 }}>
              {todos.map((td, i) => (
                <div key={i} className="row" onClick={td.act} style={{ gap: 10, padding: '10px 11px', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', borderLeft: `3px solid ${td.c}`, cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="sm" style={{ fontWeight: 600 }}>{td.t}</div>
                    {td.d && <div className="cap" style={{ marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{td.d}</div>}
                  </div>
                  <span style={{ flexShrink: 0, color: 'var(--ink-3)' }}><Icon name="arrowR" /></span>
                </div>
              ))}
            </div>
          ) : (
            <div className="cap" style={{ textAlign: 'center', padding: '18px 0', color: 'var(--good)', fontWeight: 600 }}>✅ ไม่มีอะไรค้าง — เคลียร์หมดแล้ว</div>
          )}
          {todayTasks.length > 0 && (<>
            <div className="cap" style={{ marginBottom: 8, fontWeight: 700, color: 'var(--ink-3)' }}>{'งานวันนี้'} ({todayTasks.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {todayTasks.slice(0, 6).map(t => {
                const stMap = { todo: { l: 'รอทำ', c: 'var(--ink-3)' }, inprogress: { l: 'กำลังทำ', c: 'var(--info)' }, review: { l: 'รอตรวจ', c: 'var(--warn)' }, done: { l: 'เสร็จ', c: 'var(--good)' } }[t.status] || { l: '—', c: 'var(--ink-3)' };
                return (
                  <div key={t.id} className="row" onClick={() => window.__openModal && window.__openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] })} style={{ gap: 10, padding: '8px 4px', cursor: 'pointer' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: stMap.c, flexShrink: 0 }}></span>
                    <span className="sm" style={{ flex: 1, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
                    <span className="cap" style={{ color: stMap.c, fontWeight: 600, flexShrink: 0 }}>{stMap.l}</span>
                  </div>
                );
              })}
            </div>
          </>)}
        </div>

        {/* สรุปเมื่อวาน — digest อัตโนมัติ */}
        <div className="card">
          <div className="card-head"><h3><span style={{ color: 'var(--accent)' }}><Icon name="up" /></span> {'สรุปเมื่อวาน'} <span className="cap" style={{ fontWeight: 400, color: 'var(--ink-4)' }}>({digest.label})</span></h3>
            {digest.yest && <button className="btn btn-sm btn-ghost" onClick={copyDigest} title="คัดลอกข้อความสรุป — แปะส่งไลน์ได้เลย">{'คัดลอก'}</button>}</div>
          {digest.yest ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
                <span className="num h1">{B(digest.yest.total)}</span>
                {digest.diff != null && <span className="cap" style={{ fontWeight: 700, color: digest.diff >= 0 ? 'var(--good)' : 'var(--bad)' }}>{digest.diff >= 0 ? '▲ +' : '▼ '}{digest.diff.toFixed(0)}% {'เทียบเฉลี่ย 7 วัน'}</span>}
              </div>
              {digest.top && (
                <div className="row" style={{ gap: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: digest.top.hex, flexShrink: 0 }}></span>
                  <span className="cap">{'ช่องเด่น'}: <strong>{digest.top.name}</strong> {B(digest.top.rev)} ({P(digest.top.pct, 0)} {'ของวัน'})</span>
                </div>
              )}
              <div className="cap" style={{ color: 'var(--ink-4)' }}>{'แตะ'} "{'คัดลอก'}" {'เพื่อส่งสรุปเข้าไลน์ทีมได้ทันที'}</div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '14px 0', color: 'var(--ink-4)' }}>
              <div className="cap" style={{ marginBottom: 8 }}>{'ยังไม่มีข้อมูลเมื่อวาน'} ({digest.label})</div>
              <button className="btn btn-sm" onClick={() => window.__openModal && window.__openModal('record', {})}>{'กรอกย้อนหลัง'}</button>
            </div>
          )}
        </div>
        </div>

        {/* อัพเดท / ความเคลื่อนไหว — พระเอก */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-head"><h3><span style={{ color: 'var(--accent)' }}><Icon name="clock" /></span> {'อัพเดทล่าสุด'} {todayCount > 0 && <span className="cap" style={{ fontWeight: 400, color: 'var(--ink-4)' }}>· วันนี้ {todayCount} รายการ</span>}</h3>
            <button className="btn btn-sm btn-ghost" onClick={() => go('settings', 'audit')}>{'ดูประวัติทั้งหมด'} <Icon name="arrowR" /></button></div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {LOG_FILTERS.map(x => <button key={x.id} className={`chip ${filter === x.id ? 'chip-accent' : ''}`} style={{ cursor: 'pointer', border: filter === x.id ? undefined : '1px solid var(--line)' }} onClick={() => setFilter(x.id)}>{x.label}</button>)}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: 560, display: 'flex', flexDirection: 'column' }}>
            {logs.length === 0 && <div className="cap" style={{ textAlign: 'center', padding: 28, color: 'var(--ink-4)' }}>ยังไม่มีความเคลื่อนไหวในหมวดนี้</div>}
            {groups.map(g => (
              <div key={g.key}>
                <div className="cap" style={{ fontWeight: 700, color: 'var(--ink-3)', padding: '8px 0 4px', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>{g.key}</div>
                {g.items.map((a, i) => {
                  const m = logMeta(a.action);
                  const s = (D.staff || []).find(x => x.name === a.user) || { color: 'var(--ink-3)' };
                  const tm = a.ts ? new Date(a.ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : a.time;
                  return (
                    <div key={i} className="row" style={{ gap: 11, padding: '8px 2px', alignItems: 'flex-start' }}>
                      <Avatar name={a.user} color={s.color} size={26} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* เข้า/ออกระบบ: ชื่อ+อีเมลซ้ำกับ summary → โชว์บรรทัดเดียวพอ */}
                        <div className="sm" style={{ lineHeight: 1.4 }}><strong>{a.user}</strong> <span style={{ color: m.c, fontWeight: 600 }}>{m.l}</span>{a.name && a.entity !== 'auth' ? <span className="muted"> {a.name}</span> : null}</div>
                        {a.entity !== 'auth' && <div className="cap" style={{ marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.summary}</div>}
                        {a.fields && a.fields.length > 0 && <div className="cap" style={{ marginTop: 2, color: 'var(--ink-4)' }}>{a.fields.slice(0, 3).map(fd => `${fd.label}: ${fd.value}`).join(' · ')}</div>}
                      </div>
                      <span className="cap" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{tm}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


/* ============================================================
   SALES — sub: overview / channels / ads / customers
   ============================================================ */

/* Shared date picker bar */
function SalesDateBar({ month, year, onPrev, onNext }) {
  return (
    <div className="row between" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <button className="btn btn-sm btn-ghost" onClick={onPrev} style={{ padding: '4px 8px' }}>
          <Icon name="chevR" className="flip-h" />
        </button>
        <span className="h3 num">{THAI_MONTHS[month]} {year}</span>
        <button className="btn btn-sm btn-ghost" onClick={onNext} style={{ padding: '4px 8px' }}>
          <Icon name="chevR" />
        </button>
      </div>
    </div>
  );
}

// กราฟแท่งซ้อน (stacked) แบ่งตามวัน — แต่ละแท่ง = 1 วัน, แบ่งสีตามช่องทาง (ยอด/% ต่อช่อง)
function DailyStackedChart({ days, prevDays, prevLabel, h = 240 }) {
  const [hi, setHi] = useState(null);
  if (!days || days.length === 0) return <div className="cap" style={{ textAlign: 'center', padding: 40, color: 'var(--ink-4)' }}>ยังไม่มีข้อมูลรายวัน</div>;
  const chrono = [...days].sort((a, b) => a.d - b.d); // เก่า → ใหม่ (ซ้าย → ขวา)
  // เส้นเทียบเดือนก่อน (วันเดียวกัน) — มีเฉพาะวันที่เดือนก่อนมีข้อมูล
  const prevOf = (d) => { const p = (prevDays || []).find(x => x.d === d); return p ? p.total : null; };
  const prevVals = chrono.map(d => prevOf(d.d));
  const hasPrev = prevVals.some(v => v != null && v > 0);
  const max = Math.max(...chrono.map(d => d.total), ...(hasPrev ? prevVals.filter(v => v != null) : [0]), 1);
  // legend เรียงตามลำดับช่องทางมาตรฐาน (ตาม TMK.channels ที่ sort แล้ว)
  const chOrder = (D.channels || []).map(c => c.id);
  const chMap = {}; chrono.forEach(d => d.channels.forEach(c => { chMap[c.id] = { name: c.name, hex: c.hex }; }));
  const legend = Object.entries(chMap).map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => { const ia = chOrder.indexOf(a.id), ib = chOrder.indexOf(b.id); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
  const yTicks = [max, max / 2, 0];
  const n = chrono.length;
  // จุดเส้นเดือนก่อน (พิกัด % แนวนอน / px แนวตั้ง)
  const prevPts = chrono.map((d, i) => { const v = prevVals[i]; return v == null ? null : { x: ((i + 0.5) / n) * 1000, y: (h - 16) - (v / max) * (h - 16) }; }).filter(Boolean);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 6 }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 9, color: 'var(--ink-4)', height: h, paddingBottom: 16, lineHeight: 1, whiteSpace: 'nowrap' }}>
          {yTicks.map((v, i) => <span key={i}>{Bc(v)}</span>)}
        </div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: Math.max(2, Math.min(6, Math.round(120 / n))), height: h, paddingBottom: 16 }}>
          {yTicks.map((v, i) => <div key={'g' + i} style={{ position: 'absolute', left: 0, right: 0, bottom: `calc(16px + ${(v / max) * (h - 16)}px)`, borderTop: '1px dashed var(--line)', opacity: 0.4 }} />)}
          {hasPrev && prevPts.length >= 2 && (
            <svg viewBox={`0 0 1000 ${h}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: h, pointerEvents: 'none', zIndex: 2 }}>
              <polyline points={prevPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeDasharray="5 4" opacity="0.65" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
          {/* lblStep: เว้นช่วงป้ายแกน X — มือถือ 31 วันป้ายจะทับ → โชว์ทุก ~step วัน + วันสุดท้าย */}
          {chrono.map((day, di) => {
            const barPct = (day.total / max) * 100; // ความสูงแท่ง (%) → ใช้ปักหมุด tooltip ที่ "ปลายแท่ง"
            const lblStep = Math.max(1, Math.ceil(n / 13));
            const showLabel = di % lblStep === 0 || di === n - 1;
            return (
            <div key={day.d}
                 onPointerEnter={() => setHi(di)} onPointerDown={() => setHi(di)}
                 onPointerLeave={() => setHi(null)}
                 style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', position: 'relative', cursor: 'default', touchAction: 'manipulation' }}>
              <div style={{ display: 'flex', flexDirection: 'column', height: `${barPct}%`, width: '100%', maxWidth: 30, margin: '0 auto', borderRadius: '4px 4px 0 0', overflow: 'hidden', opacity: hi == null || hi === di ? 1 : 0.45, transition: 'opacity .12s' }}>
                {day.channels.map(c => <div key={c.id} style={{ height: `${day.total > 0 ? (c.rev / day.total) * 100 : 0}%`, background: c.hex }} />)}
              </div>
              {showLabel && <div className="cap" style={{ position: 'absolute', bottom: -15, left: 0, right: 0, textAlign: 'center', fontSize: 9, color: 'var(--ink-4)' }}>{day.d}</div>}
              {/* tooltip โผล่ที่ "ปลายแท่ง" ของวันนั้นๆ (เหนือยอดแท่งพอดี) */}
              {hi === di && (
                <div style={{ position: 'absolute', bottom: `calc(${barPct}% + 8px)`, left: '50%', transform: `translateX(${di < n / 2 ? '-15%' : '-85%'})`, background: 'var(--ink)', color: 'var(--paper)', padding: '7px 10px', borderRadius: 8, fontSize: 11, whiteSpace: 'nowrap', zIndex: 20, textAlign: 'left', boxShadow: '0 6px 20px rgba(0,0,0,.25)', pointerEvents: 'none', lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 700, marginBottom: 3 }}>{day.label} · {B(day.total)}</div>
                  {day.channels.map(c => <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: c.hex, flexShrink: 0 }} />{c.name} {B(c.rev)} <span style={{ opacity: 0.7 }}>({P(c.pct, 0)})</span></div>)}
                  {prevVals[di] != null && (
                    <div style={{ marginTop: 3, paddingTop: 3, borderTop: '1px solid rgba(255,255,255,.25)', opacity: 0.85 }}>
                      {prevLabel || 'เดือนก่อน'} วันที่ {day.d}: {B(prevVals[di])}
                      {prevVals[di] > 0 && <span style={{ marginLeft: 5, color: day.total >= prevVals[di] ? 'var(--good)' : 'var(--bad)' }}>{day.total >= prevVals[di] ? '▲' : '▼'} {Math.abs(((day.total - prevVals[di]) / prevVals[di]) * 100).toFixed(0)}%</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 12 }}>
        {legend.map(c => <span key={c.id} className="cap" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: c.hex }} />{c.name}</span>)}
        {hasPrev && <span className="cap" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--ink-3)' }}><span style={{ width: 14, borderTop: '2px dashed var(--ink-3)' }} />{prevLabel || 'เดือนก่อน'} (วันเดียวกัน)</span>}
      </div>
    </div>
  );
}

export function SalesView({ sub }) {
  const _today = getToday();
  const [month, setMonth] = useState(_today.month - 1); // 0-indexed, เดือนจริง
  const [year, setYear] = useState(_today.yearBE);
  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };
  const prevMonthName = THAI_MONTHS[month === 0 ? 11 : month - 1];
  const dateProps = { month, year, onPrev: prev, onNext: next };
  const { version } = useData() || {};
  // ข้อมูลของ "เดือนที่เลือก" — memo (คำนวณใหม่เมื่อเปลี่ยนเดือน/ปี หรือข้อมูลรีโหลด) กันคำนวณซ้ำทุก render
  const md = useMemo(() => computeMonth(month, year), [month, year, version]);
  const prevMd = useMemo(() => computeMonth(month === 0 ? 11 : month - 1, month === 0 ? year - 1 : year), [month, year, version]);

  if (sub === 'channels') return <SalesChannels dateProps={dateProps} prevMonthName={prevMonthName} md={md} prevMd={prevMd} />;
  if (sub === 'ads') return <SalesAds dateProps={dateProps} prevMonthName={prevMonthName} md={md} />;
  if (sub === 'customers') return <SalesCustomers dateProps={dateProps} prevMonthName={prevMonthName} md={md} />;
  return <SalesOverview dateProps={dateProps} prevMonthName={prevMonthName} md={md} prevMd={prevMd} />;
}

function MomDelta({ current, previous, label }) {
  // Guard: ไม่มีข้อมูลเดือนก่อน → แสดง "—"
  if (!previous || previous === 0 || !isFinite(previous)) {
    return (
      <span className="cap" style={{ color: 'var(--ink-3)', fontWeight: 500 }}>
        — ยังไม่มีข้อมูล{label}
      </span>
    );
  }
  const delta = ((current - previous) / previous) * 100;
  if (!isFinite(delta) || isNaN(delta)) {
    return <span className="cap" style={{ color: 'var(--ink-3)' }}>—</span>;
  }
  const isUp = delta >= 0;
  return (
    <span className="cap" style={{ color: isUp ? 'var(--good)' : 'var(--bad)', fontWeight: 600 }}>
      {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{delta.toFixed(1)}% vs {label}
    </span>
  );
}

function SalesOverview({ dateProps, prevMonthName, md, prevMd }) {
  const C = md.computed, consts = md.consts, channels = md.channels, pnl = md.pnl;
  const prevC = prevMd.computed;
  const st = paceStatus(C.PACE_PCT);
  const pace = useCountUp(C.PACE_PCT);
  const ABBR = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  // สรุปเด่น: ช่องขายดีสุด · กำไรสุทธิ · สถานะงบแอด
  const topCh = [...channels].sort((a, b) => (b.actual || 0) - (a.actual || 0))[0];
  const adBudget = consts.AD_BUDGET || 0;
  const adStatus = adBudget <= 0 ? { txt: 'ยังไม่ตั้งงบ', c: 'var(--ink-3)' }
    : C.AD > adBudget ? { txt: `เกินงบ ${Bk(C.AD - adBudget)}`, c: 'var(--bad)' }
    : { txt: `ใช้ไป ${P((C.AD / adBudget) * 100, 0)} ของ ${Bk(adBudget)}`, c: (C.AD / adBudget) > 0.8 ? 'var(--warn)' : 'var(--good)' };
  // ศูนย์เตือนยอดขาย — รวมทุกสัญญาณที่ต้องจัดการ (เฉพาะเดือนปัจจุบัน)
  const alerts = [];
  if (md.isCurrent) {
    channels.forEach(ch => {
      if (ch.actual > 0 && ch.ad > 0) {
        const acos = (ch.ad / ch.actual) * 100;
        if (acos > consts.ACOS_CEIL) alerts.push({ c: 'var(--bad)', t: `${ch.name} ค่าแอดสูง ${P(acos, 0)} (เพดาน ${consts.ACOS_CEIL}%)`, d: `ROAS ${(ch.actual / ch.ad).toFixed(1)}x — เช็กที่ "โฆษณา & แชท"` });
      }
    });
    if (adBudget > 0 && C.AD > adBudget) alerts.push({ c: 'var(--bad)', t: `ค่าแอดเกินงบ ${B(C.AD - adBudget)}`, d: `ใช้ไป ${B(C.AD)} / งบ ${B(adBudget)}` });
    if (consts.TARGET > 0 && C.PACE_PCT < 90) {
      const perDay = Math.max(0, (consts.TARGET - C.MTD) / Math.max(1, consts.DAYS - consts.DAY));
      alerts.push({ c: 'var(--warn)', t: `ยอดช้ากว่าแผน (${P(C.PACE_PCT, 0)})`, d: `ต้องทำวันละ ${B(perDay)} · เหลือ ${consts.DAYS - consts.DAY} วัน` });
    }
    const _td = getToday();
    if (!(md.dailyMonth || []).some(dd => dd.d === _td.day)) alerts.push({ c: 'var(--accent)', t: 'ยังไม่กรอกยอดขายวันนี้', d: '', act: () => window.__openModal && window.__openModal('record', { date: todayISO() }) });
  }
  return (
    <div className="content-inner rise">
      <SalesDateBar {...dateProps} />

      <div className="grid" style={{ gridTemplateColumns: '1.6fr 1fr', marginBottom: 16 }}>
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 8 }}>{'ยอดขาย'} MTD {'·'} {'วันที่'} {consts.DAY}/{consts.DAYS}</div>
          <div className="num display">{B(C.MTD)}</div>
          {/* เดือนปัจจุบัน: เทียบ MTD กับ "วันที่เดียวกัน" ของเดือนก่อน — กันแดงหลอกตากลางเดือน */}
          {(() => {
            const isCurrent = md.isCurrent;
            const prevSameDay = isCurrent
              ? (prevMd.dailyBreakdown || []).filter(d => d.d <= consts.DAY).reduce((s, d) => s + (d.total || 0), 0)
              : prevC.MTD;
            const lbl = isCurrent ? `${prevMonthName} (${consts.DAY} วันแรก)` : prevMonthName;
            return <MomDelta current={C.MTD} previous={prevSameDay} label={lbl} />;
          })()}
          <div className="bar" style={{ marginTop: 14 }}>
            <span style={{ width: `${consts.TARGET > 0 ? Math.min((C.MTD/consts.TARGET)*100,100) : 0}%`, background: st.c }}></span>
          </div>
          <div className="row between" style={{ marginTop: 8 }}>
            <span className="cap">{'เป้า'} {consts.TARGET ? B(consts.TARGET) : '— ยังไม่ตั้ง'}</span>
            <span className="cap num">{consts.TARGET > 0 ? P((C.MTD/consts.TARGET)*100) : '—'} {'ของเป้า'}</span>
          </div>
          <div className="grid g4" style={{ marginTop: 18, gap: 12 }}>
            {(() => {
              const curAbbr = ABBR[dateProps.month];
              const yEntry = (md.yoy || []).find(e => e.m === curAbbr);
              const yoyPct = yEntry && yEntry.y25 > 0 ? ((yEntry.y26 - yEntry.y25) / yEntry.y25) * 100 : null;
              const yoyStr = yoyPct == null ? '—' : (yoyPct >= 0 ? '+' : '') + P(yoyPct, 0);
              const yoyColor = yoyPct == null ? 'var(--ink-3)' : yoyPct >= 0 ? 'var(--good)' : 'var(--bad)';
              return [['Run rate', C.RUN ? B(C.RUN) : '—', consts.TARGET && C.RUN >= consts.TARGET ? 'var(--good)' : 'var(--warn)'],
              ['ออร์เดอร์', N(C.ORD)], ['AOV', C.ORD ? B(C.AOV) : '—'], [`YoY ${curAbbr}`, yoyStr, yoyColor]];
            })().map((x,i)=>(
              <div key={i}>
                <div className="cap">{x[0]}</div>
                <div className="num h3" style={{ color: x[2] || 'var(--ink)' }}>{x[1]}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Ring pct={pace} size={120} stroke={11} color={st.c}>
            <div><div className="num h1" style={{ color: st.c }}>{P(pace,0)}</div><div className="cap" style={{ lineHeight: 1.1 }}>จังหวะทำยอด</div></div>
          </Ring>
          <div>
            <span className={`chip ${st.cls}`} style={{ marginBottom: 10 }}>{st.label}</span>
            <div className="cap" style={{ marginTop: 10 }}>MTD / {'เป้า'} pace</div>
            <div className="num sm" style={{ fontWeight: 600 }}>{B(C.MTD)} / {C.PACE_TGT ? B(C.PACE_TGT) : '—'}</div>
            <div className="cap" style={{ marginTop: 8 }}>{'ต้องเฉลี่ย/วัน'}</div>
            <div className="num sm" style={{ fontWeight: 600 }}>{(consts.TARGET > 0 && consts.DAYS - consts.DAY > 0) ? B(Math.max(0, Math.ceil((consts.TARGET-C.MTD)/(consts.DAYS-consts.DAY)))) : '—'}</div>
          </div>
        </div>
      </div>

      {/* ยอดขายรายวัน (เจาะลึกตามช่องทาง) — เต็มแถว เห็นทั้งเดือน */}
      <div className="card" style={{ marginBottom: 16, display: 'flex', flexDirection: 'column' }}>
        <div className="card-head"><h3>{'ยอดขายรายวัน'} <span className="cap" style={{ fontWeight: 400, color: 'var(--ink-4)' }}>(เจาะลึกตามช่องทาง)</span></h3>
          <span className="cap">{md.dailyBreakdown.length} {'วัน'}</span></div>
        <DailyStackedChart days={md.dailyBreakdown} prevDays={prevMd.dailyBreakdown} prevLabel={prevMonthName} h={300} />
      </div>

      {/* per-platform: เป้า · ผลงาน · คุมแอด */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3>{'เป้า · ผลงาน · คุมงบโฆษณา — รายแพลตฟอร์ม (เดือนนี้)'}</h3>
          <span className="cap">{'เพดาน ACOS'} {consts.ACOS_CEIL}%</span></div>
        <div className="table-wrap"><table className="table">
          <thead><tr>
            <th>{'ช่องทาง'}</th>
            <th style={{ textAlign: 'right' }}>{'เป้าเดือน'}</th>
            <th style={{ textAlign: 'right' }}>{'ยอด MTD'}</th>
            <th style={{ textAlign: 'right' }}>{'% เป้า'}</th>
            <th style={{ textAlign: 'right' }}>{'ค่าแอด'}</th>
            <th style={{ textAlign: 'right' }}>ROAS</th>
            <th style={{ textAlign: 'right' }}>{'% แอด'}</th>
          </tr></thead>
          <tbody>
            {channels.map(ch => {
              const tgtPct = ch.target > 0 ? (ch.actual / ch.target) * 100 : null;
              const roas = ch.ad > 0 ? ch.actual / ch.ad : null;
              const adPct = ch.actual > 0 ? (ch.ad / ch.actual) * 100 : null; // ACOS
              return (
                <tr key={ch.id}>
                  <td><span className="row" style={{ gap: 8, fontWeight: 600 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: ch.hex, flexShrink: 0 }}></span>{ch.name}</span></td>
                  <td className="num" style={{ textAlign: 'right', color: 'var(--ink-2)' }}>{ch.target > 0 ? Bk(ch.target) : '—'}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{Bk(ch.actual)}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 700, color: targetColor(tgtPct) }}>{tgtPct == null ? '—' : P(tgtPct, 0)}</td>
                  <td className="num" style={{ textAlign: 'right', color: 'var(--ink-2)' }}>{ch.ad > 0 ? Bk(ch.ad) : '—'}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 700, color: roasColor(roas) }}>{roas == null ? '—' : roas.toFixed(1) + 'x'}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 700, color: acosColor(adPct, consts.ACOS_CEIL) }}>{adPct == null ? '—' : P(adPct, 0)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            {(() => {
              const tT = channels.reduce((s, c) => s + (c.target || 0), 0);
              const tA = channels.reduce((s, c) => s + (c.actual || 0), 0);
              const tAd = channels.reduce((s, c) => s + (c.ad || 0), 0);
              const tgtPct = tT > 0 ? (tA / tT) * 100 : null;
              const roas = tAd > 0 ? tA / tAd : null;
              const adPct = tA > 0 ? (tAd / tA) * 100 : null;
              return (
                <tr style={{ borderTop: '2px solid var(--line)' }}>
                  <td style={{ fontWeight: 800 }}>{'รวม'}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 800 }}>{tT > 0 ? Bk(tT) : '—'}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 800 }}>{Bk(tA)}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 800 }}>{tgtPct == null ? '—' : P(tgtPct, 0)}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 800 }}>{tAd > 0 ? Bk(tAd) : '—'}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 800 }}>{roas == null ? '—' : roas.toFixed(1) + 'x'}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 800 }}>{adPct == null ? '—' : P(adPct, 0)}</td>
                </tr>
              );
            })()}
          </tfoot>
        </table></div>
      </div>

      {/* charts */}
      <div className="grid g2">
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 12 }}>3 {'เดือนล่าสุด'}</div>
          <Bars data={md.month3} h={170} valueKey="actual" />
          <div className="cap" style={{ marginTop: 8 }}>{ABBR[dateProps.month]} {'รวมคาดการณ์'} ({'โปร่ง'})</div>
        </div>
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 12 }}>{'เทียบปีก่อน'} (YoY)</div>
          <YoYChart data={md.yoy} year={dateProps.year} />
        </div>
      </div>

      {/* แถวล่าง: ศูนย์เตือน | สรุปเด่น | P&L */}
      <div className="grid" style={{ gridTemplateColumns: md.isCurrent ? '1.1fr 0.9fr 1.1fr' : '1fr 1fr', gap: 16, marginTop: 16, marginBottom: 16, alignItems: 'stretch' }}>
      {md.isCurrent && (
      <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="card-head"><h3>{'ศูนย์เตือนยอดขาย'} <InfoTip text="ระบบเช็กให้อัตโนมัติ: ค่าแอดเกินเพดาน ACOS · ใช้งบเกิน · ยอดช้ากว่าแผน · ยังไม่กรอกยอดวันนี้ — หายเองเมื่อจัดการแล้ว" label="ศูนย์เตือน" /></h3>
          {alerts.length > 0 ? <span className="chip chip-warn">{alerts.length} {'เรื่อง'}</span> : <span className="chip chip-good">{'เรียบร้อย'}</span>}</div>
        {alerts.length === 0 ? (
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '26px 0' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 34, height: 34, margin: '0 auto 9px', borderRadius: '50%', background: 'var(--good)', color: '#fff', display: 'grid', placeItems: 'center' }}><Icon name="check" /></div>
              <div className="sm" style={{ fontWeight: 700, color: 'var(--good)' }}>{'ไม่มีเรื่องต้องจัดการ — ทุกอย่างตามแผน'}</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alerts.map((al, i) => (
              <div key={i} className="row" onClick={al.act} style={{ gap: 11, padding: '10px 12px', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', cursor: al.act ? 'pointer' : 'default', alignItems: 'flex-start' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: al.c, flexShrink: 0, marginTop: 5 }}></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="sm" style={{ fontWeight: 700, lineHeight: 1.4 }}>{al.t}</div>
                  {al.d && <div className="cap" style={{ marginTop: 2 }}>{al.d}</div>}
                </div>
                {al.act && <span style={{ flexShrink: 0, color: 'var(--ink-3)', alignSelf: 'center' }}><Icon name="arrowR" /></span>}
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* สรุปเด่น — การ์ดเดียว 3 แถว อ่านไล่ลงจบ */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="cap" style={{ marginBottom: 5 }}>{'ช่องขายดีสุด'}</div>
          {topCh && topCh.actual > 0
            ? <div className="row" style={{ gap: 8, alignItems: 'baseline' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: topCh.hex, flexShrink: 0 }}></span><span className="num h3">{topCh.name}</span><span className="cap">{B(topCh.actual)} ({P(C.MTD > 0 ? (topCh.actual / C.MTD) * 100 : 0, 0)})</span></div>
            : <div className="num h3" style={{ color: 'var(--ink-3)' }}>—</div>}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', borderTop: '1px solid var(--line)' }}>
          <div className="cap" style={{ marginBottom: 5 }}>{pnl.cogsPct === 0 ? 'กำไรขั้นต้น' : 'กำไรสุทธิ'} <InfoTip text={pnl.cogsPct === 0 ? 'ยอดขาย − ค่าแอด − ค่าธรรมเนียม − ค่าใช้จ่ายอื่น (ยังไม่หักต้นทุนสินค้า)' : 'ยอดขาย − ต้นทุนสินค้า − ค่าแอด − ค่าธรรมเนียม − ค่าใช้จ่ายอื่น'} label="กำไร" /></div>
          <div className="num h3">{B(pnl.netProfit)} <span className="cap" style={{ fontWeight: 600, color: 'var(--ink-4)' }}>({P(pnl.netMargin, 0)})</span></div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', borderTop: '1px solid var(--line)' }}>
          <div className="cap" style={{ marginBottom: 5 }}>{'งบโฆษณา'}</div>
          <div className="num h3">{adStatus.txt}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>{'กำไร-ขาดทุน (P&L)'} <InfoTip text="กำไรสุทธิ = ยอดขาย − ต้นทุนสินค้า − ค่าแอด − ค่าธรรมเนียมแพลตฟอร์ม − ค่าใช้จ่ายอื่น · ตั้งต้นทุน% และค่าใช้จ่ายอื่นได้ที่หน้า 'ตั้งเป้ารายเดือน'" label="P&L" /></h3>
          <span className={`chip ${pnl.netProfit >= 0 ? 'chip-good' : 'chip-bad'}`}>{pnl.netProfit >= 0 ? 'กำไร' : 'ขาดทุน'} {P(pnl.netMargin, 1)}</span></div>
        {pnl.cogsPct === 0 && (
          <div className="cap" style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: '8px 10px', marginBottom: 12, color: 'var(--ink-3)' }}>
            ยังไม่ตั้ง <b>"ต้นทุนสินค้า %"</b> — ตั้งได้ที่ <b>"ตั้งเป้ารายเดือน"</b>
          </div>
        )}
        <div style={{ display: 'grid', gap: 5 }}>
          {[
            ['ยอดขาย', pnl.revenue, false],
            // แถวที่เป็น 0 ซ่อน — โชว์เฉพาะรายการที่มีจริง อ่านไล่ลงจบไว
            ...(pnl.cogs > 0 ? [[`− ต้นทุนสินค้า (${pnl.cogsPct}%)`, -pnl.cogs, false], ['= กำไรขั้นต้น', pnl.grossProfit, true]] : []),
            ...(pnl.ad > 0 ? [['− ค่าแอด', -pnl.ad, false]] : []),
            ...(pnl.platformFees > 0 ? [['− ค่าธรรมเนียมแพลตฟอร์ม', -pnl.platformFees, false]] : []),
            ...(pnl.otherExpense > 0 ? [['− ค่าใช้จ่ายอื่น', -pnl.otherExpense, false]] : []),
          ].map(([label, val, sub], i) => (
            <div key={i} className="row between" style={{ padding: sub ? '6px 0' : '3px 0', borderTop: sub ? '1px solid var(--line)' : 'none' }}>
              <span className={sub ? '' : 'cap'} style={{ fontWeight: sub ? 700 : 400, color: sub ? 'var(--ink)' : 'var(--ink-3)' }}>{label}</span>
              <span className="num sm" style={{ fontWeight: sub ? 700 : 600, color: val < 0 ? 'var(--bad)' : 'var(--ink-2)' }}>{val < 0 ? '−' : ''}{B(Math.abs(val))}</span>
            </div>
          ))}
          <div className="row between" style={{ padding: '9px 0 0', borderTop: '2px solid var(--line)', marginTop: 3 }}>
            <span style={{ fontWeight: 800 }}>กำไรสุทธิ</span>
            <span className="num h3" style={{ fontWeight: 800, color: pnl.netProfit >= 0 ? 'var(--good)' : 'var(--bad)' }}>{B(pnl.netProfit)} <span className="cap" style={{ fontWeight: 600, color: 'var(--ink-3)' }}>({P(pnl.netMargin, 1)})</span></span>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function YoYChart({ data: dataProp, year }) {
  const [hi, setHi] = useState(null);
  const data = dataProp || D.yoy;
  const cy = year || (new Date().getFullYear() + 543), py = cy - 1; // ปี พ.ศ. ตามที่เลือก (ไม่ฮาร์ดโค้ด)
  const w = 320, h = 150;
  // กันบั๊ก: ต้องมีอย่างน้อย 2 จุดถึงจะวาดเส้นได้ (ไม่งั้นหารด้วย 0 → NaN)
  if (!data || data.length < 2) {
    return (
      <div style={{ height: 150, display: 'grid', placeItems: 'center', alignContent: 'center', gap: 10, color: 'var(--ink-4)' }} className="cap">
        <span>ยังไม่มีข้อมูลเปรียบเทียบรายปี</span>
        <button className="btn btn-sm" onClick={() => window.__openModal && window.__openModal('historical')}>+ เพิ่มข้อมูลปีก่อน (กรอกย้อนหลัง)</button>
      </div>
    );
  }
  const all = data.flatMap(d => [d.y25, d.y26]);
  const max = Math.max(...all), min = Math.min(...all) * 0.9;
  const range = (max - min) || 1; // กันหารศูนย์เมื่อค่าเท่ากันหมด
  const X = (i) => (i / (data.length - 1)) * w;
  const Y = (v) => h - 20 - ((v - min) / range) * (h - 30);
  const lineP = (key) => data.map((d, i) => [X(i), Y(d[key])]);
  const path = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const onMove = (e) => { const r = e.currentTarget.getBoundingClientRect(); const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); setHi(Math.round(ratio * (data.length - 1))); };
  const yTicks = [max, (max + min) / 2, min];
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 6, fontFamily: 'var(--font)' }}>
        {/* แกน Y (เงิน) */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', color: 'var(--ink-4)', fontSize: 9, height: 150, paddingBottom: 18, lineHeight: 1, whiteSpace: 'nowrap' }}>
          {yTicks.map((v, i) => <span key={i}>{Bc(v)}</span>)}
        </div>
        <div style={{ position: 'relative', touchAction: 'pan-y' }}
             onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHi(null)}>
          <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: 150, display: 'block' }}>
            <path d={path(lineP('y25'))} fill="none" stroke="var(--ink-4)" strokeWidth="2" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            <path d={path(lineP('y26'))} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {data.map((d, i) => <text key={i} x={X(i)} y={h - 2} fontSize="9" fill="var(--ink-3)" textAnchor="middle">{d.m}</text>)}
            {hi != null && data[hi] && <line x1={X(hi)} y1="0" x2={X(hi)} y2={h - 14} stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" vectorEffect="non-scaling-stroke" />}
          </svg>
          {/* จุด (วาดด้วย HTML กันยืดเป็นวงรีจาก preserveAspectRatio=none) */}
          {[['y25', 'var(--ink-4)', 5], ['y26', 'var(--accent)', 6]].map(([k, col, sz]) => data.map((d, i) => (
            <span key={k + i} style={{ position: 'absolute', left: `${(i / (data.length - 1)) * 100}%`, top: `${(Y(d[k]) / h) * 100}%`, width: sz, height: sz, marginLeft: -sz / 2, marginTop: -sz / 2, borderRadius: '50%', background: col, pointerEvents: 'none' }} />
          )))}
          {hi != null && data[hi] && (
            <div style={{ position: 'absolute', left: `${(hi / Math.max(data.length - 1, 1)) * 100}%`, top: 0, transform: `translateX(${hi > data.length / 2 ? '-100%' : '0'})`, background: 'var(--ink)', color: 'var(--paper)', padding: '7px 11px', borderRadius: 8, fontSize: 12, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 5, textAlign: 'left', lineHeight: 1.45, boxShadow: '0 6px 20px rgba(0,0,0,.25)' }}>
              <div style={{ opacity: 0.75, fontWeight: 600, fontSize: 11 }}>{data[hi].m}</div>
              <div style={{ fontWeight: 700 }}>{cy} : {B(data[hi].y26)}</div>
              <div style={{ opacity: 0.55, fontWeight: 600 }}>{py} : {B(data[hi].y25)}</div>
            </div>
          )}
        </div>
      </div>
      <div className="row" style={{ gap: 14, marginTop: 6 }}>
        <span className="cap"><span style={{ display: 'inline-block', width: 14, height: 2, background: 'var(--accent)', verticalAlign: 'middle', marginRight: 5 }}></span>{cy}</span>
        <span className="cap"><span style={{ display: 'inline-block', width: 14, height: 2, background: 'var(--ink-4)', verticalAlign: 'middle', marginRight: 5 }}></span>{py}</span>
      </div>
    </div>
  );
}

function SalesChannels({ dateProps, md, prevMd }) {
  const consts = md.consts, channels = md.channels;
  const bigIds = ['facebook', 'line'];
  const big = channels.filter(c => bigIds.includes(c.id));
  const rest = channels.filter(c => !bigIds.includes(c.id));
  return (
    <div className="content-inner rise">
      <SalesDateBar {...dateProps} />
      {big.length > 0 && (
        <div className="grid g2" style={{ marginBottom: 16, alignItems: 'start' }}>
          {big.map(ch => <SocialChannelCard key={ch.id} ch={ch} md={md} consts={consts} prevMd={prevMd} />)}
        </div>
      )}
      <div className="grid g4">
        {rest.map(ch => <ChannelCard key={ch.id} ch={ch} md={md} consts={consts} prevMd={prevMd} />)}
      </div>
    </div>
  );
}

// การ์ดใหญ่ FB/LINE — เน้น "แชท → ปิดการขาย" (คนทัก → ปิดออเดอร์ → %ปิด) + ต้นทุน/มูลค่าต่อทัก
function SocialChannelCard({ ch, md, consts }) {
  const inq = ch.inq || 0, orders = ch.orders || 0;
  const conv = inq > 0 ? (orders / inq) * 100 : null;        // % ปิด = ปิดออเดอร์ ÷ คนทัก
  const roas = ch.ad > 0 ? ch.actual / ch.ad : null;
  const acos = (ch.ad > 0 && ch.actual > 0) ? (ch.ad / ch.actual) * 100 : null;
  const costPerInq = (ch.ad > 0 && inq > 0) ? ch.ad / inq : null;      // ต้นทุน/คนทัก
  const costPerOrd = (ch.ad > 0 && orders > 0) ? ch.ad / orders : null; // ต้นทุน/ออเดอร์
  const valPerInq = inq > 0 ? ch.actual / inq : null;                 // มูลค่า/คนทัก (ทัก 1 คน = ยอดเท่าไร)
  const reply = md.fb.avgReplyMinutes || 0;                           // เวลาตอบเฉลี่ย (รวมทั้งร้าน/วัน)
  const tgtPct = ch.target > 0 ? Math.min((ch.actual / ch.target) * 100, 100) : null;
  return (
    <div className="card" style={{ borderTop: `3px solid ${ch.hex}` }}>
      <div className="card-head"><h3><span style={{ width: 11, height: 11, borderRadius: 3, background: ch.hex, display: 'inline-block', marginRight: 7, verticalAlign: 'middle' }} />{ch.name} <span className="cap" style={{ fontWeight: 400, color: 'var(--ink-4)' }}>(แชท → ปิดการขาย)</span></h3>
        <span className="num h3" style={{ fontWeight: 800 }}>{B(ch.actual)}</span></div>
      {/* funnel: คนทัก → ปิดออเดอร์ → %ปิด */}
      <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ flex: 1, textAlign: 'center' }}><div className="num h1">{N(inq)}</div><div className="cap">คนทัก</div></div>
        <span style={{ width: 16, height: 16, display: 'inline-block', color: 'var(--ink-3)', flexShrink: 0 }}><Icon name="arrowR" /></span>
        <div style={{ flex: 1, textAlign: 'center' }}><div className="num h1" style={{ color: 'var(--good)' }}>{N(orders)}</div><div className="cap">ปิดออเดอร์</div></div>
        <div style={{ flex: 1, textAlign: 'center', borderLeft: '1px solid var(--line)' }}><div className="num h1" style={{ color: conv == null ? 'var(--ink-3)' : conv >= 20 ? 'var(--good)' : 'var(--warn)' }}>{conv == null ? '—' : P(conv, 0)}</div><div className="cap">% ปิด <InfoTip text="อัตราปิดการขาย = ปิดออเดอร์ ÷ คนทัก × 100" label="% ปิด" align="right" /></div></div>
      </div>
      <div className="statgrid" style={{ gap: 10, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
        <div><div className="cap">เวลาตอบเฉลี่ย</div><div className="num sm" style={{ fontWeight: 700, color: 'var(--info)' }}>{reply > 0 ? <>{reply} <span className="cap">นาที</span></> : '—'}</div></div>
        <div><div className="cap">ต้นทุน/คนทัก</div><div className="num sm" style={{ fontWeight: 700 }}>{costPerInq != null ? B(costPerInq) : '—'}</div></div>
        <div><div className="cap">ต้นทุน/ออเดอร์</div><div className="num sm" style={{ fontWeight: 700 }}>{costPerOrd != null ? B(costPerOrd) : '—'}</div></div>
        <div><div className="cap">มูลค่า/คนทัก <InfoTip text="ทัก 1 คน สร้างยอดขายเฉลี่ยเท่าไร = ยอดขาย ÷ คนทัก" label="มูลค่า/คนทัก" /></div><div className="num sm" style={{ fontWeight: 700, color: 'var(--good)' }}>{valPerInq != null ? B(valPerInq) : '—'}</div></div>
        <div><div className="cap">ลูกค้าใหม่/เก่า</div><div className="num sm" style={{ fontWeight: 700 }}>{N(ch.newCust)}<span style={{ color: 'var(--ink-4)' }}> / {N(ch.oldCust)}</span></div></div>
        <div><div className="cap">ค่าแอด</div><div className="num sm" style={{ fontWeight: 700 }}>{ch.ad > 0 ? B(ch.ad) : '—'}</div></div>
      </div>
      <div className="statgrid" style={{ gap: 10, marginTop: 10, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
        <div><div className="cap">ยอดขาย</div><div className="num sm" style={{ fontWeight: 700 }}>{B(ch.actual)}</div></div>
        <div><div className="cap">โฆษณาคืนกี่เท่า <InfoTip text="ROAS = ยอดขาย ÷ ค่าแอด (ยิ่งสูงยิ่งดี, ≥3 ดีมาก)" label="ROAS" align="right" /> (ROAS)</div><div className="num sm" style={{ fontWeight: 700, color: roasColor(roas) }}>{roas != null ? roas.toFixed(1) + 'x' : '—'}</div></div>
        <div><div className="cap">ค่าแอด%ยอด <InfoTip text="ACOS = ค่าแอด ÷ ยอดขาย × 100 (ยิ่งต่ำยิ่งคุ้ม)" label="ACOS" align="right" /> (ACOS)</div><div className="num sm" style={{ fontWeight: 700, color: acosColor(acos, consts.ACOS_CEIL) }}>{acos != null ? P(acos, 0) : '—'}</div></div>
      </div>
      <div className="row between" style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
        <span className="cap">เป้า <span className="num" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>{ch.target > 0 ? B(ch.target) : '—'}</span></span>
        <span className="cap">{ch.target <= 0 ? 'ยังไม่ตั้งเป้า' : ch.actual >= ch.target ? '✓ ถึงเป้าแล้ว' : <>ขาดอีก <span className="num" style={{ fontWeight: 700 }}>{B(ch.target - ch.actual)}</span> ({P(tgtPct, 0)})</>}</span>
      </div>
    </div>
  );
}

// การ์ดช่องทางทั่วไป (เดิม)
function ChannelCard({ ch, consts, prevMd }) {
  const roas = ch.ad > 0 ? ch.actual / ch.ad : null;
  const acos = (ch.ad > 0 && ch.actual > 0) ? (ch.ad / ch.actual) * 100 : null;
  const cogsPct = consts.cogsPct || 0;
  const profit = ch.actual - (ch.actual * cogsPct / 100) - ch.ad - (ch.actual * ((ch.platformFeePct || 0) / 100));
  const margin = ch.actual > 0 ? (profit / ch.actual) * 100 : 0;
  const _prevCh = (prevMd?.channels || []).find(c => c.id === ch.id);
  const growth = (_prevCh && _prevCh.actual > 0) ? Math.round(((ch.actual - _prevCh.actual) / _prevCh.actual) * 100) : null;
  const tgtPct = ch.target > 0 ? (ch.actual / ch.target) * 100 : null;
  return (
    <div className="card" style={{ borderTop: `3px solid ${ch.hex}` }}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <span className="row" style={{ gap: 8, fontWeight: 700 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: ch.hex }}></span>{ch.name}</span>
        {growth != null ? <span className="cap" style={{ color: growth >= 0 ? 'var(--good)' : 'var(--bad)', fontWeight: 600 }}>{growth >= 0 ? '▲ +' : '▼ '}{growth}%</span> : null}
      </div>
      <div className="num h1">{B(ch.actual)}</div>
      <div className="cap" style={{ margin: '4px 0 14px', color: 'var(--ink-3)' }}>
        {tgtPct != null ? <>ขายได้ <b className="num" style={{ color: tgtPct >= 100 ? 'var(--good)' : 'var(--ink-2)' }}>{P(tgtPct, 0)}</b> ของเป้า {B(ch.target)}</> : 'ยังไม่ตั้งเป้า'}
      </div>
      <div className="statgrid-2" style={{ gap: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
        <div><div className="cap">{'ออร์เดอร์'}</div><div className="num h3">{N(ch.orders)}</div></div>
        <div><div className="cap">เฉลี่ย/ออเดอร์</div><div className="num h3">{ch.orders > 0 ? B(ch.actual / ch.orders) : '—'}</div></div>
        <div><div className="cap">โฆษณาคืนกี่เท่า (ROAS)</div><div className="num h3" style={{ color: roasColor(roas) }}>{roas != null ? roas.toFixed(1) + 'x' : '—'}</div></div>
        <div><div className="cap">ค่าแอด%ยอด (ACOS)</div><div className="num h3" style={{ color: acosColor(acos, consts.ACOS_CEIL) }}>{acos != null ? P(acos, 0) : '—'}</div></div>
      </div>
      <div className="row between" style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
        <span className="cap">กำไร{cogsPct === 0 ? ' (ยังไม่หักทุน)' : ''} <InfoTip text={`กำไร = ยอดขาย − ต้นทุนสินค้า${cogsPct > 0 ? ` (${cogsPct}%)` : ' (ยังไม่ตั้ง)'} − ค่าแอด − ค่าธรรมเนียม${ch.platformFeePct > 0 ? ` (${ch.platformFeePct}%)` : ''}`} label="กำไร" /></span>
        <span className="num" style={{ fontWeight: 800, color: profit >= 0 ? 'var(--good)' : 'var(--bad)' }}>{B(profit)} <span className="cap" style={{ fontWeight: 600, color: 'var(--ink-4)' }}>({P(margin, 0)})</span></span>
      </div>
    </div>
  );
}

function SalesAds({ dateProps, md }) {
  const consts = md.consts, channels = md.channels;
  // KPI สรุป — เลือกช่องทางได้ (ค่าเริ่ม Facebook + LINE) — คุมเฉพาะ 4 การ์ดบนสุด
  const _defSel = ['facebook', 'line'].filter(id => channels.some(c => c.id === id));
  const [selCh, setSelCh] = useState(_defSel.length ? _defSel : channels.slice(0, 1).map(c => c.id));
  const toggleCh = (id) => setSelCh(p => p.includes(id) ? (p.length > 1 ? p.filter(x => x !== id) : p) : [...p, id]); // คงไว้อย่างน้อย 1
  const selChans = channels.filter(c => selCh.includes(c.id));
  const kRev = selChans.reduce((s, c) => s + (c.actual || 0), 0);
  const kAd = selChans.reduce((s, c) => s + (c.ad || 0), 0);
  const kRoas = kAd > 0 ? kRev / kAd : null;
  const kAcos = kRev > 0 ? (kAd / kRev) * 100 : null;
  const _chatSel = selCh.some(id => id === 'facebook' || id === 'line'); // ช่องแชท → ROAS ต้องดูคู่ funnel แชท
  const totalBudget = consts.AD_BUDGET || 0;
  const totalSpent = channels.filter(c => c.hasAd).reduce((s, c) => s + c.ad, 0);
  const remaining = totalBudget - totalSpent;
  const burnRate = consts.DAY > 0 ? totalSpent / consts.DAY : 0;
  const daysLeft = consts.DAYS - consts.DAY;
  const projectedSpend = totalSpent + (burnRate * daysLeft);
  const spentPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  const timePct = consts.DAYS > 0 ? (consts.DAY / consts.DAYS) * 100 : 0;
  const perDayLeft = (totalBudget > 0 && daysLeft > 0 && remaining > 0) ? remaining / daysLeft : 0;
  const overBudget = totalBudget > 0 && totalSpent > totalBudget;
  const projOver = totalBudget > 0 && !overBudget && projectedSpend > totalBudget;
  const fastPace = totalBudget > 0 && !overBudget && !projOver && spentPct > timePct + 5; // ใช้งบเร็วกว่าเวลา
  const barColor = spentPct > 100 ? 'var(--bad)' : spentPct > 80 ? 'var(--warn)' : 'var(--good)';
  const alertColor = (overBudget || projOver) ? 'var(--bad)' : fastPace ? 'var(--warn)' : 'var(--good)';

  return (
    <div className="content-inner rise">
      <SalesDateBar {...dateProps} />

      {/* Budget planner */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3><span style={{ color: 'var(--accent)' }}><Icon name="wallet" /></span> {'งบโฆษณา'}</h3>
          {totalBudget > 0 && <span className="cap" style={{ color: barColor, fontWeight: 700 }}>ใช้ไป {P(spentPct, 0)} ของงบ</span>}</div>
        <div className="grid g4" style={{ marginBottom: 12 }}>
          <div>
            <div className="cap">{'งบทั้งหมด'}</div>
            <div className="num h1">{totalBudget > 0 ? Bk(totalBudget) : '— ยังไม่ตั้งงบ'}</div>
            {totalBudget <= 0 && <span className="cap" style={{ color: 'var(--ink-4)' }}>ตั้งงบต่อช่องที่หน้า "ตั้งเป้ารายเดือน"</span>}
          </div>
          <div>
            <div className="cap">{'ใช้ไปแล้ว'}</div>
            <div className="num h1" style={{ color: 'var(--warn)' }}>{Bk(totalSpent)}</div>
            {totalBudget > 0 && <span className="cap" style={{ color: barColor, fontWeight: 600 }}>{P(spentPct, 0)} ของงบ</span>}
          </div>
          <div>
            <div className="cap">{'คงเหลือ'}</div>
            <div className="num h1" style={{ color: totalBudget <= 0 ? 'var(--ink-3)' : remaining > 0 ? 'var(--good)' : 'var(--bad)' }}>{totalBudget > 0 ? Bk(remaining) : '—'}</div>
            {totalBudget > 0 && perDayLeft > 0 && <span className="cap">{'ใช้ได้อีก'} {Bk(perDayLeft)}/{'วัน'} ({daysLeft} {'วัน'})</span>}
          </div>
          <div>
            <div className="cap">ใช้แอดเฉลี่ย/{'วัน'} (Burn rate) <InfoTip text="ใช้แอดเฉลี่ย/วัน (Burn rate) = ค่าแอดเฉลี่ยที่ใช้ต่อวันในเดือนนี้ (ค่าแอดรวม ÷ วันที่ผ่านไป)" label="ใช้แอดเฉลี่ย/วัน" /></div>
            <div className="num h1">{Bk(burnRate)}</div>
            <span className="cap" style={{ color: projOver ? 'var(--bad)' : 'var(--good)' }}>
              {'คาดใช้ทั้งเดือน'} {Bk(projectedSpend)}
            </span>
          </div>
        </div>
        <div className="bar"><span style={{ width: `${totalBudget > 0 ? Math.min(spentPct, 100) : 0}%`, background: barColor }}></span></div>
        <div className="row between" style={{ marginTop: 6 }}>
          <span className="cap">{totalBudget > 0 ? P(spentPct, 0) : '—'} {'ของงบ'}</span>
          <span className="cap">{consts.DAYS > 0 ? P(timePct, 0) : '—'} {'ของเวลา'}</span>
        </div>
        {totalBudget > 0 && (
          <div className="cap" style={{ marginTop: 10, padding: '8px 11px', borderRadius: 'var(--r-sm)', fontWeight: 600, background: 'var(--surface-2)', borderLeft: `3px solid ${alertColor}`, color: alertColor }}>
            {overBudget ? `🔴 ใช้เกินงบแล้ว ${Bk(totalSpent - totalBudget)} (เกินมา ${P(spentPct - 100, 0)})`
              : projOver ? `🟠 คาดว่าจะเกินงบ ${Bk(projectedSpend - totalBudget)} ภายในสิ้นเดือน — ควรชะลอการใช้`
              : fastPace ? `🟠 ใช้งบเร็วกว่าแผน — ใช้ไป ${P(spentPct, 0)} แต่เวลาผ่านแค่ ${P(timePct, 0)}`
              : `🟢 คุมงบดี — ใช้ไป ${P(spentPct, 0)} ตามจังหวะเวลา ${P(timePct, 0)}`}
          </div>
        )}
      </div>

      {/* แผงเปรียบเทียบตามช่องทาง — เลือกได้ มีผลเฉพาะแผงนี้ */}
      <div className="card" style={{ marginBottom: 16, background: 'var(--surface-2)', border: '1px dashed var(--line-2)' }}>
        <div className="row between" style={{ marginBottom: 12, gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ color: 'var(--accent)' }}><Icon name="filter" /></span> {'เปรียบเทียบตามช่องทาง'}</h3>
            <div className="cap" style={{ color: 'var(--ink-3)', marginTop: 3 }}>{'เลือกช่องทางที่อยากดู — ตัวเลข 4 ช่องด้านล่างจะคิดเฉพาะช่องที่เลือก (ไม่กระทบส่วนอื่น)'}</div>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={() => setSelCh(_defSel.length ? _defSel : channels.slice(0, 1).map(c => c.id))} title="กลับไป Facebook + LINE OA">{'คืนค่าเริ่มต้น'}</button>
        </div>
        {/* chips ติดสีช่องทาง — เลือก = สีเข้ม+ขอบสี / ไม่เลือก = จาง · เลื่อนแนวนอนบนมือถือ */}
        <div className="chiprow" style={{ marginBottom: 14, paddingBottom: 2 }}>
          {channels.map(c => {
            const on = selCh.includes(c.id);
            return (
              <button key={c.id} onClick={() => toggleCh(c.id)}
                style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 999, fontSize: 'var(--fs-sm)',
                  background: on ? c.hex + '22' : 'var(--surface)', color: on ? 'var(--ink)' : 'var(--ink-3)',
                  border: on ? `1.5px solid ${c.hex}` : '1px solid var(--line)', fontWeight: on ? 700 : 500, transition: 'all .12s' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.hex, opacity: on ? 1 : 0.3 }}></span>{c.name}
              </button>
            );
          })}
        </div>
        {/* 4 KPI (การ์ดขาวบนพื้นเทา — เห็นชัดว่าเป็นผลของช่องที่เลือก) */}
        <div className="grid g4" style={{ gap: 12 }}>
          <div className="card card-pad-sm">
            <div className="cap" style={{ marginBottom: 6 }}>{'รายได้'} (MTD)</div>
            <div className="num h1" style={{ color: 'var(--accent-2)' }}>{B(kRev)}</div>
            <div className="cap" style={{ marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selChans.map(c => c.name).join(' + ') || '—'}</div>
          </div>
          <div className="card card-pad-sm">
            <div className="cap" style={{ marginBottom: 6 }}>Ads Spent</div>
            <div className="num h1">{B(kAd)}</div>
            <div className="cap" style={{ marginTop: 4 }}>{'ค่าแอดของช่องที่เลือก'}</div>
          </div>
          <div className="card card-pad-sm">
            <div className="cap" style={{ marginBottom: 6 }}>ROAS <InfoTip text="โฆษณาคืนกี่เท่า = รายได้ ÷ ค่าแอด (ของช่องที่เลือก)" label="ROAS" /></div>
            <div className="num h1" style={{ color: roasColor(kRoas) }}>{kRoas != null ? kRoas.toFixed(2) : '—'}</div>
            {_chatSel && kRoas != null && kRoas < 2
              ? <div className="cap" style={{ marginTop: 4, color: 'var(--warn)', fontWeight: 600 }}>⚠️ {'ดูคู่แชท (คนทัก→ปิด)'}</div>
              : <div className="cap" style={{ marginTop: 4 }}>{'≥ 3 ดีมาก · ≥ 2 พอใช้'}</div>}
          </div>
          <div className="card card-pad-sm">
            <div className="cap" style={{ marginBottom: 6 }}>% {'ค่าแอด'} (ACoS) <InfoTip text="ค่าแอด ÷ รายได้ × 100 (ของช่องที่เลือก) — ยิ่งต่ำยิ่งคุ้ม" label="ACoS" /></div>
            <div className="num h1" style={{ color: acosColor(kAcos, consts.ACOS_CEIL) }}>{kAcos != null ? P(kAcos, 1) : '—'}</div>
            <div className="cap" style={{ marginTop: 4 }}>{'เกณฑ์ ≤'} {consts.ACOS_CEIL}%</div>
          </div>
        </div>
      </div>

      {/* Ad performance table */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3><span style={{color:'var(--accent)'}}><Icon name="zap" /></span> {'ประสิทธิภาพโฆษณา'}</h3></div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>{'ช่องทาง'}</th><th style={{textAlign:'right'}}>{'รายได้'}</th><th style={{textAlign:'right'}}>{'ค่าแอด'}</th><th style={{textAlign:'right'}}>{'งบ'}</th><th style={{textAlign:'right'}}>{'ใช้/งบ'}</th><th style={{textAlign:'right'}}>ROAS</th><th style={{textAlign:'right'}}>ACOS</th></tr></thead>
          <tbody>
            {channels.filter(c=>c.hasAd).length === 0 && (
              <tr><td colSpan={7} style={{ textAlign:'center', padding:18, color:'var(--ink-4)' }} className="cap">ยังไม่มีช่องทางที่เปิดโฆษณา</td></tr>
            )}
            {channels.filter(c=>c.hasAd).map(c => {
              const r = c.ad > 0 ? c.actual/c.ad : null;
              const a = c.actual > 0 ? (c.ad/c.actual)*100 : null;
              const bud = c.adBudget || 0;
              const usePct = bud > 0 ? (c.ad/bud)*100 : null;
              return (
                <tr key={c.id}>
                  <td><span className="row" style={{gap:8, fontWeight:600}}><span style={{width:9,height:9,borderRadius:3,background:c.hex}}></span>{c.name}</span></td>
                  <td className="num" style={{textAlign:'right', fontWeight:600}}>{Bk(c.actual)}</td>
                  <td className="num" style={{textAlign:'right', color:'var(--ink-2)'}}>{Bk(c.ad)}</td>
                  <td className="num" style={{textAlign:'right', color:'var(--ink-3)'}}>{bud > 0 ? Bk(bud) : '—'}</td>
                  <td className="num" style={{textAlign:'right', fontWeight:700, color: usePct==null?'var(--ink-3)':usePct>100?'var(--bad)':usePct>80?'var(--warn)':'var(--good)'}}>{usePct!=null ? P(usePct,0) : '—'}</td>
                  <td className="num" style={{textAlign:'right', fontWeight:700, color: r==null?'var(--ink-3)':r>=3?'var(--good)':r>=2?'var(--warn)':'var(--bad)'}}>{r!=null ? r.toFixed(1)+'x' : '—'}</td>
                  <td className="num" style={{textAlign:'right', fontWeight:700, color: a==null?'var(--ink-3)':a<=consts.ACOS_CEIL?'var(--good)':a<=40?'var(--warn)':'var(--bad)'}}>{a!=null ? P(a,0) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>

      {/* Ad campaigns table — ไว้ล่างสุด (ส่วนใหญ่ยังว่าง ไม่ควรคั่นข้อมูลหลัก) */}
      <div className="card">
        <div className="card-head"><h3><Icon name="megaphone" /> {'แคมเปญแอด'}</h3>
          <span className="cap">{'จัดการที่หน้า'} {'รายเดือน'}</span>
        </div>
        {getAdCampaigns().filter(c => adCampaignInMonth(c, dateProps.month, dateProps.year)).length === 0 ? (
          <div className="cap" style={{ textAlign: 'center', padding: '14px 0', color: 'var(--ink-4)' }}>ยังไม่มีแคมเปญแอดในเดือนนี้ — สร้างที่หน้า "ภาพรวมรายเดือน"</div>
        ) : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>{'ชื่อแคมเปญ'}</th><th>{'แพลตฟอร์ม'}</th><th style={{textAlign:'right'}}>{'งบ'}</th><th style={{textAlign:'right'}}>{'ใช้ไป'}</th><th style={{textAlign:'right'}}>ROAS</th><th>{'สถานะ'}</th></tr></thead>
          <tbody>
            {getAdCampaigns().filter(c => adCampaignInMonth(c, dateProps.month, dateProps.year)).map((c, i) => {
              const stMap = { live: { l: 'กำลังรัน', cls: 'chip-good' }, paused: { l: 'หยุดชั่วคราว', cls: 'chip-warn' }, upcoming: { l: 'รอเริ่ม', cls: 'chip-warn' }, done: { l: 'เสร็จสิ้น', cls: '' }, cancelled: { l: 'ยกเลิก', cls: 'chip-bad' } };
              const s = stMap[c.status] || stMap.done;
              return (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td><span className="cap">{c.platform}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}>{Bk(c.budget)}</td>
                  <td className="num" style={{ textAlign: 'right', color: 'var(--ink-2)' }}>{Bk(c.spent)}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 700, color: roasColor(c.roas) }}>{Number(c.roas || 0).toFixed(1)}x</td>
                  <td><span className={`chip ${s.cls}`}>{s.l}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        )}
      </div>
    </div>
  );
}

function SalesCustomers({ dateProps, md }) {
  const C = md.computed;
  // สัดส่วนลูกค้าใหม่คิดจาก "จำนวนคน" (ไม่ได้แยกรายได้ใหม่/เก่า)
  const custTot = C.NEW_C + C.OLD_C;
  const newPct = custTot > 0 ? (C.NEW_C / custTot) * 100 : 0;
  // เป้าลูกค้าใหม่ของเดือนที่เลือก (ตั้งใน MonthlyTargetModal — เก็บใน monthly_history.meta.newCustTarget)
  const _selRow = (D.monthly || []).find(m => m.month === dateProps.month + 1 && m.year === dateProps.year);
  const newCTarget = Number(_selRow?.meta?.newCustTarget || 0);
  const newCPct = newCTarget > 0 ? (C.NEW_C / newCTarget) * 100 : null;
  return (
    <div className="content-inner rise">
      <SalesDateBar {...dateProps} />

      {/* KPI ลูกค้า — ข้อมูลจริง (ระบบไม่เก็บรายได้แยกใหม่/เก่า → ใช้จำนวน + อัตราซื้อซ้ำ + CAC) */}
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="card card-pad-sm">
          <div className="cap" style={{ marginBottom: 6 }}>{'ลูกค้าใหม่'} (MTD)</div>
          <div className="num h1" style={{ color: 'var(--good)' }}>{N(C.NEW_C)}</div>
          {/* แสดงเป้า + progress ถ้าตั้งไว้ — ไม่ตั้งก็คงข้อความเดิม */}
          {newCTarget > 0 ? (
            <>
              <div className="cap" style={{ marginTop: 4 }}>เป้า {N(newCTarget)} · <span style={{ color: targetColor(newCPct), fontWeight: 600 }}>{P(newCPct, 0)}</span></div>
              <div className="bar" style={{ marginTop: 6 }}>
                <span style={{ width: `${Math.min(100, newCPct)}%`, background: targetColor(newCPct) }} />
              </div>
            </>
          ) : (
            <div className="cap" style={{ marginTop: 4 }}>{custTot > 0 ? P(newPct, 0) : '—'} {'ของลูกค้าทั้งหมด'}</div>
          )}
        </div>
        <div className="card card-pad-sm">
          <div className="cap" style={{ marginBottom: 6 }}>{'ลูกค้าเก่า'} (MTD)</div>
          <div className="num h1" style={{ color: 'var(--info)' }}>{N(C.OLD_C)}</div>
          <div className="cap" style={{ marginTop: 4 }}>{custTot > 0 ? P(100 - newPct, 0) : '—'} {'ของลูกค้าทั้งหมด'}</div>
        </div>
        <div className="card card-pad-sm">
          <div className="cap" style={{ marginBottom: 6 }}>{'อัตราซื้อซ้ำ'} (Returning) <InfoTip text="สัดส่วนลูกค้าเก่าต่อลูกค้าทั้งหมด (จำนวนคน) · เป้า ≥ 35%" label="Returning" /></div>
          <div className="num h1" style={{ color: custTot <= 0 ? 'var(--ink-4)' : (100 - newPct) >= 35 ? 'var(--good)' : 'var(--warn)' }}>{custTot > 0 ? P(100 - newPct, 0) : '—'}</div>
          <div className="cap" style={{ marginTop: 4 }}>{'เป้าหมาย ≥ 35%'}</div>
        </div>
        <div className="card card-pad-sm">
          <div className="cap" style={{ marginBottom: 6 }}>CAC <span style={{ color: 'var(--ink-4)' }}>(ต้นทุนลูกค้าใหม่)</span> <InfoTip text="ต้นทุนหาลูกค้าใหม่ = ค่าแอดรวม ÷ จำนวนลูกค้าใหม่" label="CAC" /></div>
          <div className="num h1" style={{ color: 'var(--accent)' }}>{C.CAC > 0 ? B(C.CAC) : '—'}</div>
          <div className="cap" style={{ marginTop: 4 }}>{'ค่าแอด ÷ ลูกค้าใหม่'}</div>
        </div>
      </div>

      {/* แนวโน้ม % ลูกค้าเก่า (ซื้อซ้ำ) รายสัปดาห์ + CLV */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>{'% ลูกค้าเก่า (ซื้อซ้ำ) — แนวโน้มรายสัปดาห์'} <InfoTip text="ลูกค้าเก่า ÷ ลูกค้าทั้งหมด ในแต่ละสัปดาห์ (จากจำนวนคนจริง — ระบบไม่เก็บรายได้แยกใหม่/เก่า)" label="แนวโน้ม" /></h3>
          <span className="cap">CLV {'เฉลี่ย'} <b style={{ color: 'var(--accent)' }}>{C.CLV ? B(C.CLV) : '—'}</b></span>
        </div>
        {(() => {
          // เฉพาะสัปดาห์ที่ "กรอกลูกค้าจริง" — กันสัปดาห์ที่มีแต่ยอดขาย (ลูกค้า 0) โชว์เป็น 0% หลอกตา
          const wk = (md.custWeekly || []).filter(w => (w.newC + w.oldC) > 0);
          if (!wk.length) return <div className="cap" style={{ textAlign: 'center', padding: 30, color: 'var(--ink-4)' }}>{'ยังไม่มีข้อมูลลูกค้ารายสัปดาห์ — กรอกลูกค้าใหม่/เก่าที่ "บันทึก & ภาพรวมเดือน"'}</div>;
          const vals = wk.map(w => w.returningPct);
          const up = vals[vals.length - 1] >= vals[0];
          return (<>
            <MiniArea data={vals} labels={wk.map(w => `สัปดาห์ ${w.week}`)} fmt={(v) => P(v, 0)} axisFmt={(v) => P(v, 0)} h={160} color="var(--info)" id="cust-returning" metricLabel="ลูกค้าเก่า" />
            <div className="cap" style={{ marginTop: 8, color: up ? 'var(--good)' : 'var(--ink-3)', fontWeight: 600 }}>
              {vals.length >= 2 ? (up ? '↗ ฐานลูกค้าซื้อซ้ำกำลังแข็งขึ้น' : '↘ สัดส่วนลูกค้าเก่าลดลง — ลองกระตุ้นลูกค้าเดิม') : 'มีข้อมูลสัปดาห์เดียว — รอข้อมูลเพิ่มเพื่อดูแนวโน้ม'}
            </div>
          </>);
        })()}
      </div>

      {/* Cohort table — ซ่อนจนกว่าจะมี tmk_cohort จริง (กันการ์ดว่างถาวร) */}
      {/* eslint-disable-next-line no-constant-binary-expression */}
      {false && (
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3>{'ตาราง'} Cohort Retention</h3></div>
        <div className="table-wrap"><table className="table">
          <thead>
            <tr>
              <th>{'เดือนเริ่มต้น'}</th>
              <th style={{ textAlign: 'right' }}>{'เดือนที่'} 1</th>
              <th style={{ textAlign: 'right' }}>{'เดือนที่'} 2</th>
              <th style={{ textAlign: 'right' }}>{'เดือนที่'} 3</th>
            </tr>
          </thead>
          <tbody>
            {([]).map((row, i) => (  /* Cohort table — empty until tmk_cohort table is added */
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{row.month}</td>
                <td className="num" style={{ textAlign: 'right' }}>
                  <span className="chip chip-good">{row.m1}%</span>
                </td>
                <td className="num" style={{ textAlign: 'right' }}>
                  {row.m2 !== null
                    ? <span className="chip" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>{row.m2}%</span>
                    : <span className="cap">—</span>}
                </td>
                <td className="num" style={{ textAlign: 'right' }}>
                  {row.m3 !== null
                    ? <span className="chip" style={{ background: 'var(--bad-soft)', color: 'var(--bad)' }}>{row.m3}%</span>
                    : <span className="cap">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      )}

      {/* New vs old by channel */}
      <div className="card">
        <div className="card-head"><h3>{'ลูกค้าใหม่'} vs {'เก่า แยกตามช่องทาง'}</h3></div>
        {md.channels.map(ch => {
          const t = ch.newCust + ch.oldCust, nP = t > 0 ? (ch.newCust/t)*100 : 0;
          return (
            <div key={ch.id} className="row" style={{ gap: 12, padding: '9px 0', borderBottom: '1px solid var(--line-2)' }}>
              <span className="sm" style={{ width: 78, fontWeight: 600, display:'flex', gap:7, alignItems:'center' }}><span style={{width:9,height:9,borderRadius:3,background:ch.hex}}></span>{ch.name}</span>
              {t > 0 ? (
                <div style={{ flex: 1, height: 13, borderRadius: 6, overflow: 'hidden', display: 'flex' }}>
                  <div style={{ width: `${nP}%`, background: 'var(--good)' }}></div>
                  <div style={{ width: `${100-nP}%`, background: 'var(--info)' }}></div>
                </div>
              ) : (
                <div style={{ flex: 1, height: 13, borderRadius: 6, border: '1px dashed var(--line)', background: 'transparent' }}></div>
              )}
              <span className="num cap" style={{ width: 70, textAlign: 'right', color: t > 0 ? 'var(--good)' : 'var(--ink-4)', fontWeight: 700 }}>{t > 0 ? `${ch.newCust} ใหม่` : '—'}</span>
              <span className="num cap" style={{ width: 56, textAlign: 'right', color: t > 0 ? 'var(--info)' : 'var(--ink-4)', fontWeight: 700 }}>{t > 0 ? `${ch.oldCust} เก่า` : ''}</span>
            </div>
          );
        })}
      </div>

      {/* กลุ่มลูกค้า (ตั้งค่าเอง) — ไว้ล่างสุด: เป็นส่วนเสริม ไม่ใช่ข้อมูลสด */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h3>{'กลุ่มลูกค้า'} <span className="cap" style={{ fontWeight: 400, color: 'var(--ink-4)' }}>(รวมทุกเดือน · ตั้งค่าเอง)</span></h3></div>
        {getSegments().length === 0 ? (
          <div className="cap" style={{ textAlign: 'center', padding: '12px 0', color: 'var(--ink-4)' }}>ยังไม่มีกลุ่มลูกค้า — ตั้งค่าที่หน้า "ภาพรวมรายเดือน" → กลุ่มลูกค้า</div>
        ) : (
          <div className="grid g4">
            {getSegments().map(seg => (
              <div key={seg.name} className="card card-pad-sm" style={{ borderLeft: `3px solid ${seg.color}` }}>
                <div className="row between" style={{ marginBottom: 6 }}>
                  <span className="sm" style={{ fontWeight: 700 }}>{seg.name}</span>
                  <span className="chip">{seg.revPct}% {'รายได้'}</span>
                </div>
                <div className="num h1">{seg.count} <span className="cap">{'คน'}</span></div>
                <div className="bar" style={{ marginTop: 8 }}>
                  <span style={{ width: `${seg.revPct}%`, background: seg.color }}></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
