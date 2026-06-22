/* ============================================================
   TMK Operation — Views part 2: Planner + Catalog + System
   ============================================================ */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TMK } from './data.js';
import { B, P, N, Icon, stockMeta, Avatar, Ring, MiniArea, Bars, UserIcon, SIZES, ORDER_STATUSES, barcodeSVGString, lotTotal, lotValue } from './components.jsx';
import { advanceOrderStatus, Modal, mutateProductReservations, MpImportModal } from './modals.jsx';
import { useData, computeMonth } from './dataContext.jsx';
import { supabase } from './lib/supabaseClient.js';
import { logAudit } from './lib/audit.js';
import { APP_VERSION } from './changelog.js';
import { getToday, parseTaskDate, todayISO, thaiDate, THAI_MONTHS as MONTHS_TH_SHORT, THAI_MONTHS_FULL as MONTHS_TH } from './lib/dateUtils.js';

const DD = TMK;

// a11y: ให้ clickable div กดด้วยคีย์บอร์ดได้ (Enter/Space → trigger onClick)
const onCardKey = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); e.currentTarget.click(); } }; // เฉพาะตอนโฟกัสที่การ์ดเอง ไม่ใช่ control ลูก (select/ปุ่ม) → กัน Space/Enter ของ select เด้งเปิด modal

// guard สิทธิ์ (ฝั่ง client) — กัน viewer แก้ผ่านหน้าตั้งค่า + จัดการผู้ใช้/สิทธิ์เฉพาะ admin
const guardEdit = () => { if (!window.__canEdit) { window.__toast?.('สิทธิ์ "ดูอย่างเดียว" — แก้ไขไม่ได้ (ติดต่อแอดมิน)', 'warn'); return false; } return true; };
const guardAdmin = () => { if (!window.__isAdmin) { window.__toast?.('เฉพาะแอดมินจัดการผู้ใช้และสิทธิ์ได้', 'warn'); return false; } return true; };

/* ====================  PLANNER  ==================== */
const stLabel = { done: 'เสร็จ', review: 'รอตรวจ', inprogress: 'กำลังทำ', todo: 'รอ' };
const stCls = { done: 'chip-good', review: 'chip-warn', inprogress: 'chip-accent', todo: '' };

// ดรอปดาวน์ฟิลเตอร์ — ใช้กับตัวเลือกเยอะ (แคมเปญ/หน้าที่) ให้แถบสะอาด ไม่กองพิลล์
function FilterDropdown({ label, icon, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const sel = options.find(o => o.id === value);
  return (
    <div className="filt-dd" ref={ref}>
      <button className={'filt-dd-btn' + (value ? ' on' : '')} onClick={() => setOpen(o => !o)}>
        {sel ? <span className="dot-c" style={{ background: sel.color }} /> : <Icon name={icon} />}
        <span className="filt-dd-cur">{sel ? sel.name : label}</span>
        <Icon name="down" />
      </button>
      {open && (
        <div className="filt-dd-menu">
          <button className={'filt-dd-item' + (!value ? ' on' : '')} onClick={() => { onChange(null); setOpen(false); }}>
            <span style={{ flex: 1 }}>ทั้งหมด</span>{!value && <Icon name="check" />}
          </button>
          {options.map(o => (
            <button key={o.id} className={'filt-dd-item' + (value === o.id ? ' on' : '')} onClick={() => { onChange(value === o.id ? null : o.id); setOpen(false); }}>
              <span className="dot-c" style={{ background: o.color }} /><span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>{value === o.id && <Icon name="check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PlannerFilters({ filterCamp, setFilterCamp, filterStatus, setFilterStatus, filterResp, setFilterResp, search, setSearch, respOptions }) {
  const respColor = (name) => (DD.duties.find(d => d.name === name)?.color) || (DD.staff.find(s => s.name === name)?.color) || 'var(--ink-3)';
  const anyActive = filterStatus !== 'all' || filterCamp || filterResp || search;
  const clearAll = () => { setFilterStatus('all'); setFilterCamp(null); setFilterResp(null); setSearch(''); };
  const campOpts = (DD.campaigns || []).map(c => ({ id: c.id, name: c.name, color: c.color }));
  const respOpts = respOptions.map(r => ({ id: r, name: r, color: respColor(r) }));
  return (
    <div className="card card-pad-sm filterbar" style={{ marginBottom: 12 }}>
      <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
        {/* สถานะ — segmented control */}
        <div className="filt-seg">
          {[['all','ทั้งหมด'],['active','กำลังทำ'],['done','เสร็จแล้ว']].map(([s, l]) => (
            <button key={s} className={'filt-seg-btn' + (filterStatus === s ? ' on' : '')} onClick={() => setFilterStatus(s)}>{l}</button>
          ))}
        </div>
        {/* แคมเปญ + หน้าที่ — dropdown */}
        <FilterDropdown label="แคมเปญ" icon="megaphone" options={campOpts} value={filterCamp} onChange={setFilterCamp} />
        {respOpts.length > 0 && <FilterDropdown label="หน้าที่" icon="shield" options={respOpts} value={filterResp} onChange={setFilterResp} />}
        <div style={{ flex: 1 }} />
        {anyActive && <button className="btn btn-sm btn-ghost" onClick={clearAll} title="ล้างตัวกรองทั้งหมด"><Icon name="x" /> ล้าง</button>}
        <div className="search" style={{ width: 170 }}><Icon name="search" /><input placeholder="ค้นหางาน..." value={search} onChange={e => setSearch(e.target.value)} /></div>
      </div>
    </div>
  );
}

function filterTasks(tasks, filterCamp, filterStatus, search, filterResp) {
  return (tasks || []).filter(t => {
    if (filterCamp && t.camp !== filterCamp) return false;
    if (filterResp && !(t.responsible || []).includes(filterResp)) return false;
    if (filterStatus === 'active' && t.status === 'done') return false;
    if (filterStatus === 'done' && t.status !== 'done') return false;
    if (search) {
      const ql = String(search).toLowerCase();
      const title = String(t.title || '').toLowerCase();
      if (!title.includes(ql)) return false;
    }
    return true;
  });
}

export function PlannerView({ sub, tasks, setTasks }) {
  const [filterCamp, setFilterCamp] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterResp, setFilterResp] = useState(null);
  const [search, setSearch] = useState('');
  // ตัวเลือก "หน้าที่" — ดึงจากผู้รับผิดชอบจริงในงาน (ครอบคลุมทั้งชื่อหน้าที่/คน)
  const respOptions = useMemo(() => [...new Set((tasks || []).flatMap(t => t.responsible || []))].filter(Boolean).sort(), [tasks]);
  const fProps = { filterCamp, setFilterCamp, filterStatus, setFilterStatus, filterResp, setFilterResp, search, setSearch, respOptions };
  const filtered = filterTasks(tasks, filterCamp, filterStatus, search, filterResp);

  if (sub === 'kanban') return <KanbanBoard tasks={tasks} setTasks={setTasks} filtered={filtered} fProps={fProps} />;
  if (sub === 'timeline') return <TimelineView filtered={filtered} fProps={fProps} />;
  return <CalendarView tasks={tasks} filtered={filtered} fProps={fProps} />;
}

/* ---- Calendar (month navigation + week view) — ชื่อเดือนใช้ร่วมจาก lib/dateUtils ---- */
const DAY_LABELS = ['อา','จ','อ','พ','พฤ','ศ','ส'];

/* ---- Channel → platform icon (ใช้ร่วม Calendar / Kanban / Timeline) ---- */
const CHANNEL_ALIASES = {
  shopee: ['shopee'],
  tiktok: ['tiktok', 'tt'],
  lazada: ['lazada', 'laz'],
  facebook: ['facebook', 'fb post', 'fb'],
  line: ['line broadcast', 'line oa', 'line/fb', 'line'],
  crm: ['crm'],
};
function chInfo(ch) {
  if (!ch) return null;
  const text = String(ch).toLowerCase();
  let matched = null;
  for (const c of (DD.channels || [])) {
    const cId = String(c.id || '').toLowerCase();
    const cName = String(c.name || '').toLowerCase();
    const aliases = CHANNEL_ALIASES[cId] || [cId, cName];
    if (aliases.some(a => a && text.includes(a))) { matched = c; break; }
  }
  if (matched && matched.logoUrl) {
    return { color: matched.hex || '#888', bg: matched.hex || '#888', logoUrl: matched.logoUrl,
      icon: (s) => <img src={matched.logoUrl} alt="" style={{ width: s, height: s, objectFit: 'contain' }} /> };
  }
  const l = text;
  if (l.includes('shopee')) return { color: '#ee4d2d', bg: '#ee4d2d', icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24"><path fill="#fff" d="M12 2C9.2 2 7.3 4.1 7.1 6.6c-.1.6.4 1 .9 1h8c.5 0 1-.4.9-1C16.7 4.1 14.8 2 12 2zm-6.9 7c-.5 0-1 .4-1 1l1.2 10c.1.8.7 1.4 1.5 1.4h10.4c.8 0 1.4-.6 1.5-1.4l1.2-10c0-.6-.4-1-1-1H5.1z"/></svg> };
  if (l.includes('tiktok')) return { color: '#000', bg: '#00f2ea', icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24"><path fill="#000" d="M16.6 5.8A4.3 4.3 0 0 1 13.4 2h-3v13.4a2.6 2.6 0 1 1-1.8-2.4V9.6a6 6 0 1 0 5.2 6V9.4a7.3 7.3 0 0 0 4.2 1.3V7.3a4.3 4.3 0 0 1-1.4-1.5z"/></svg> };
  if (l.includes('lazada')) return { color: '#0f1689', bg: '#0f1689', icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24"><path fill="#fff" d="M3 5h18v14H3V5zm2 2v10h14V7H5zm3 2h8v2H8V9zm0 4h5v2H8v-2z"/></svg> };
  if (l.includes('fb') || l.includes('facebook')) return { color: '#1877f2', bg: '#1877f2', icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24"><path fill="#fff" d="M22 12c0-5.5-4.5-10-10-10S2 6.5 2 12c0 5 3.7 9.1 8.4 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7C18.3 21.1 22 17 22 12z"/></svg> };
  if (l.includes('line')) return { color: '#06c755', bg: '#06c755', icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24"><path fill="#fff" d="M22 10.6c0-4.7-4.5-8.6-10-8.6S2 5.9 2 10.6c0 4.2 3.7 7.8 8.7 8.5.3.1.8.2.9.5.1.3.1.6 0 .9l-.1.8c0 .3-.2 1 .9.6 1-.5 5.6-3.3 7.6-5.6 1.4-1.5 2-3.1 2-4.7z"/></svg> };
  if (l.includes('crm')) return { color: '#c08a3e', bg: '#c08a3e', icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24"><path fill="#fff" d="M16 11c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3zm-8 0c1.7 0 3-1.3 3-3S9.7 5 8 5 5 6.3 5 8s1.3 3 3 3zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5c0-2.3-4.7-3.5-7-3.5zm8 0c-.3 0-.6 0-1 .1 1.2.9 2 2 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z"/></svg> };
  if (l.includes('ทุก')) return { color: '#b07d33', bg: '#b07d33', icon: (s) => <svg width={s} height={s} viewBox="0 0 24 24"><path fill="#fff" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg> };
  // ไม่ตรงกับช่องทางจริงใน Supabase → ไม่มีไอคอน (แสดงเป็น "ไม่มี")
  return null;
}
const tokenizeCh = (chVal) => (Array.isArray(chVal) ? chVal : String(chVal || '').split(',')).map(s => s.trim()).filter(Boolean);
function matchedChannelsFor(chVal) {
  const seen = new Set(); const out = [];
  tokenizeCh(chVal).forEach(tok => {
    const info = chInfo(tok);
    if (!info) return;
    const key = info.logoUrl || info.bg || tok;
    if (seen.has(key)) return;
    seen.add(key); out.push({ info, label: tok });
  });
  return out;
}
function ChIcon({ info, size = 16 }) {
  return info.logoUrl
    ? <img src={info.logoUrl} alt="" style={{ width: size, height: size, borderRadius: 4, objectFit: 'contain', flexShrink: 0 }} />
    : <span style={{ width: size - 1, height: size - 1, borderRadius: 4, background: info.bg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{info.icon(Math.round(size * 0.6))}</span>;
}
// แสดงไอคอนช่องทางของงาน (fallback เป็นข้อความถ้า map ไม่ได้)
function TaskChannels({ channel, size = 16 }) {
  const m = matchedChannelsFor(channel);
  if (!m.length) return <span className="cap" style={{ color: 'var(--ink-4)' }}>ไม่มี</span>;
  return <span className="row" style={{ gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>{m.map((x, i) => <span key={i} title={x.label} style={{ display: 'inline-flex' }}><ChIcon info={x.info} size={size} /></span>)}</span>;
}

function CalendarView({ filtered, fProps }) {
  const T = getToday();                       // วันจริง
  const curY = T.yearBE, curM = T.month - 1;  // เดือนปัจจุบัน (0-indexed)
  const [ym, setYm] = useState({ y: curY, m: curM });
  const [sel, setSel] = useState(T.day);

  const greg = ym.y - 543;
  const daysInMonth = new Date(greg, ym.m + 1, 0).getDate();
  const firstWeekday = new Date(greg, ym.m, 1).getDay(); // Sun-first (0=Sun)
  const isCurrentMonth = ym.y === curY && ym.m === curM;
  const todayDay = isCurrentMonth ? T.day : -1;

  // จับคู่งานด้วยวันที่เต็มของ "เดือนที่เลือก" (ym) — ใช้ได้ทุกเดือน ไม่ใช่แค่เดือนปัจจุบัน
  const byDay = {};
  filtered.forEach(t => {
    const iso = t.dateISO || parseTaskDate(t.date);
    if (!iso) return;
    const [yy, mm, dd] = iso.split('-').map(Number);
    if ((yy + 543) === ym.y && (mm - 1) === ym.m) (byDay[dd] = byDay[dd] || []).push(t);
  });

  const shiftMonth = (delta) => {
    let m = ym.m + delta, y = ym.y;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    setYm({ y, m }); setSel(1);
  };
  const goToday = () => { setYm({ y: curY, m: curM }); setSel(T.day); };

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selTasks = byDay[sel] || [];

  const DayCell = ({ d }) => {
    if (!d) return <div style={{ borderRadius: 'var(--r-sm)' }}></div>;
    const ts = byDay[d] || [];
    const isSel = d === sel, isToday = d === todayDay;
    const show = ts.slice(0, 3);
    const more = ts.length - 3;
    // ไอคอนแพลตฟอร์มของวันนี้ — แตกครบทุกช่องทางจากทุกงาน + dedup
    const seen = new Set(); const dayInfos = [];
    ts.forEach(t => matchedChannelsFor(t.channel).forEach(({ info, label }) => {
      const key = info.logoUrl || info.bg || label;
      if (seen.has(key)) return; seen.add(key); dayInfos.push(info);
    }));
    return (
      <button onClick={() => setSel(d)} style={{
        border: isSel ? '2px solid var(--accent)' : isToday ? '1px solid var(--accent-ring)' : '1px solid var(--line)',
        background: isSel ? 'var(--accent-soft)' : 'var(--surface)',
        borderRadius: 'var(--r-sm)', padding: '6px', display: 'flex', flexDirection: 'column',
        gap: 2, textAlign: 'left', alignItems: 'stretch', height: '100%',
        boxShadow: isSel ? '0 0 0 2px var(--accent-ring)' : 'none',
        transition: 'all 0.15s var(--ease)', overflow: 'hidden',
      }}>
        <div className="row between" style={{ gap: 4, marginBottom: 1, flexShrink: 0 }}>
          <span className="num sm" style={{
            fontWeight: isToday || isSel ? 700 : 500,
            color: isToday ? 'var(--accent-2)' : isSel ? 'var(--accent-2)' : 'var(--ink)',
            fontSize: 'var(--fs-sm)',
          }}>{d}</span>
          {dayInfos.length > 0 && (
            <div className="cal-day-icons" style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
              {dayInfos.slice(0, 4).map((info, i) => <ChIcon key={i} info={info} size={16} />)}
              {dayInfos.length > 4 && <span style={{ fontSize: 8, color: 'var(--ink-3)', fontWeight: 700, display: 'grid', placeItems: 'center' }}>+{dayInfos.length - 4}</span>}
            </div>
          )}
        </div>
        <div className="cal-cell-titles" style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden', flex: 1, minHeight: 0 }}>
          {show.map(t => {
            const c = DD.campaigns.find(x => x.id === t.camp);
            return <span key={t.id} title={t.title + (c ? ` · ${c.name}` : '')} style={{ fontSize: 'var(--fs-micro)', fontWeight: 600, padding: '2px 5px', borderRadius: 4, background: `color-mix(in srgb, ${c?.color || '#888'} 16%, transparent)`, color: `color-mix(in srgb, ${c?.color || '#888'} 72%, var(--ink))`, whiteSpace: 'normal', overflowWrap: 'anywhere', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.25, flexShrink: 0 }}>{t.title}</span>;
          })}
        </div>
        {/* มือถือ: โชว์เป็นจุดสีแทน title (แตะดูรายละเอียดข้างล่าง) */}
        <div className="cal-cell-dots">
          {ts.slice(0, 8).map(t => { const cc = DD.campaigns.find(x => x.id === t.camp); return <span key={t.id} style={{ width: 6, height: 6, borderRadius: '50%', background: cc?.color || 'var(--ink-3)', flexShrink: 0 }} />; })}
        </div>
        {more > 0 && <span className="cal-more-desktop" style={{ fontSize: 'var(--fs-micro)', fontWeight: 'var(--fw-sem)', color: 'var(--accent-2)', textAlign: 'center', flexShrink: 0 }}>+{more} งาน</span>}
      </button>
    );
  };

  return (
    <div className="content-inner rise">
      <PlannerFilters {...fProps} />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 240px', gap: 14, alignItems: 'start' }}>
        <div className="card">
          <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div className="row" style={{ gap: 8 }}>
              <button className="icon-btn" onClick={() => shiftMonth(-1)} title="เดือนก่อน"><span style={{ transform: 'rotate(180deg)', display: 'grid' }}><Icon name="chevR" /></span></button>
              <h3 style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>{MONTHS_TH[ym.m]} {ym.y}</h3>
              <button className="icon-btn" onClick={() => shiftMonth(1)} title="เดือนถัดไป"><Icon name="chevR" /></button>
              <button className="btn btn-sm" onClick={goToday}>วันนี้</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5 }}>
            {DAY_LABELS.map(d => <div key={d} className="cap" style={{ textAlign: 'center', padding: '6px 0', fontWeight: 'var(--fw-sem)' }}>{d}</div>)}
          </div>
          <div className="cal-month-grid">
            {cells.map((d, i) => <DayCell key={i} d={d} />)}
          </div>
        </div>

        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 4 }}>{sel} {MONTHS_TH_SHORT[ym.m]} {ym.y}</div>
          <div className="row between" style={{ marginBottom: 14 }}>
            <h3>{selTasks.length} งาน</h3>
            <button className="btn btn-sm btn-primary" onClick={() => window.__openModal('task', { date: `${greg}-${String(ym.m + 1).padStart(2, '0')}-${String(sel).padStart(2, '0')}` })}><Icon name="plus" /> เพิ่ม</button>
          </div>
          {selTasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--ink-4)' }}>
              <span style={{ display: 'inline-block', width: 36, height: 36 }}><Icon name="calendarDays" /></span>
              <div className="cap" style={{ marginTop: 8 }}>ไม่มีงานในวันที่เลือก</div>
            </div>
          ) : selTasks.map(t => {
            const c = DD.campaigns.find(x => x.id === t.camp);
            const stLabel = { done: 'เสร็จ', review: 'รอตรวจ', inprogress: 'กำลังทำ', todo: 'รอ' };
            const stCls = { done: 'chip-good', review: 'chip-warn', inprogress: 'chip-accent', todo: '' };
            return (
              <div key={t.id} role="button" tabIndex={0} onKeyDown={onCardKey} onClick={() => window.__openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] })} style={{ padding: '12px 14px', borderRadius: 'var(--r-sm)', background: 'var(--surface)', border: '1px solid var(--line)', marginBottom: 8, borderLeft: `3px solid ${c?.color || '#888'}`, cursor: 'pointer' }}>
                <div style={{ marginBottom: 6, minWidth: 0 }}>
                  <div className="h3" style={{ wordBreak: 'break-word' }}>{t.title}</div>
                  {t.detail && <div className="cap" style={{ marginTop: 1, wordBreak: 'break-word' }}>{t.detail}</div>}
                </div>
                <div className="row wrap" style={{ gap: 10, marginBottom: 8 }}>
                  <div style={{ minWidth: 0 }}><div className="cap">แคมเปญ</div><span className="chip" style={{ background: `color-mix(in srgb, ${c?.color || '#888'} 16%, transparent)`, color: `color-mix(in srgb, ${c?.color || '#888'} 72%, var(--ink))`, maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'bottom' }}>{c?.name || '-'}</span></div>
                  <div><div className="cap">ช่องทาง</div><TaskChannels channel={t.channel} size={16} /></div>
                  <div><div className="cap">สถานะ</div><span className={`chip ${stCls[t.status] || ''}`} style={{ whiteSpace: 'nowrap' }}>{stLabel[t.status]}</span></div>
                </div>
                <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
                  <span className="cap" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>ผู้รับผิดชอบ:</span>
                  {(t.responsible || []).map(r => { const s = DD.staff.find(x => x.name === r) || { color: '#888' }; return <span key={r} className="chip" style={{ background: `color-mix(in srgb, ${s.color} 16%, transparent)`, color: `color-mix(in srgb, ${s.color} 72%, var(--ink))`, whiteSpace: 'nowrap' }}>{r}</span>; })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---- Kanban with drag & drop ---- */
function KanbanBoard({ tasks, setTasks, filtered, fProps }) {
  const [over, setOver] = React.useState(null);
  const dragId = React.useRef(null);
  // ย้ายสถานะงาน — ใช้ทั้ง drag (desktop) และ select (มือถือ ที่ลากไม่ได้)
  const moveTask = async (id, status) => {
    if (!id) return;
    if (!window.__canEdit) { window.__toast?.('สิทธิ์ "ดูอย่างเดียว" — ย้ายงานไม่ได้', 'warn'); return; }
    const prev = tasks.find(t => t.id === id)?.status;
    if (prev === status) return;
    const task = tasks.find(t => t.id === id);
    setTasks(ts => ts.map(t => t.id === id ? { ...t, status } : t));
    try {
      const { error } = await supabase.from('tmk_tasks').update({ status }).eq('id', id);
      if (error) throw error;
      const stLabel = (DD.kanbanMeta.find(k => k.id === status) || {}).label || status;
      logAudit({ action: 'move', entityType: 'task', entityName: task?.title || id, summary: `ย้ายงาน "${task?.title || ''}" → ${stLabel}` });
      window.__reload?.(); // sync TMK.tasks (notif/profile/export) ไม่ต้องรอ realtime
    } catch (err) {
      setTasks(ts => ts.map(t => t.id === id ? { ...t, status: prev } : t));
      if (window.__toast) window.__toast('ย้ายไม่สำเร็จ: ' + err.message, 'error');
    }
  };
  const onDrop = (status) => { const id = dragId.current; dragId.current = null; setOver(null); moveTask(id, status); };
  return (
    <div className="content-inner rise">
      <PlannerFilters {...fProps} />
      <div className="grid g4 planner-kanban" style={{ gap: 14, alignItems: 'start' }}>
        {DD.kanbanMeta.map(col => {
          const list = filtered.filter(t => t.status === col.id);
          const tone = { todo: 'var(--ink-3)', inprogress: 'var(--info)', review: 'var(--warn)', done: 'var(--good)' }[col.id];
          return (
            <div key={col.id}
              onDragOver={e => { e.preventDefault(); if (over !== col.id) setOver(col.id); }}
              onDragLeave={() => setOver(o => o === col.id ? null : o)}
              onDrop={() => onDrop(col.id)}
              style={{ background: over === col.id ? 'var(--accent-soft)' : 'var(--surface-2)', borderRadius: 'var(--r-lg)', padding: 12, minHeight: 200, transition: 'background 0.15s', border: over===col.id?'1.5px dashed var(--accent)':'1.5px dashed transparent' }}>
              <div className="row between" style={{ padding: '2px 4px 12px' }}>
                <span className="row" style={{ gap: 8, fontWeight: 700, fontSize: 'var(--fs-sm)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: tone }}></span>{col.label}</span>
                <span className="chip">{list.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {list.map(t => {
                  const c = DD.campaigns.find(x => x.id === t.camp) || { name: '', color: '#888' };
                  return (
                    <div key={t.id} draggable role="button" tabIndex={0} onKeyDown={onCardKey}
                      onDragStart={() => { dragId.current = t.id; }}
                      onDragEnd={() => { dragId.current = null; setOver(null); }}
                      onClick={() => window.__openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] })}
                      className="card card-pad-sm" style={{ borderRadius: 'var(--r)', cursor: 'grab', boxShadow: 'var(--sh-sm)', padding: '12px 14px', borderLeft: `3px solid ${c.color}` }}>
                      <div className="row between" style={{ marginBottom: 4 }}>
                        <div>
                          <div className="sm" style={{ fontWeight: 600, lineHeight: 1.35 }}>{t.title}</div>
                          {t.detail && <div className="cap" style={{ marginTop: 2 }}>{t.detail}</div>}
                        </div>
                      </div>
                      <div className="row wrap" style={{ gap: 6 }}>
                        <span className="chip" style={{ background: c.color+'22', color: c.color }}>{c.name}</span>
                        <TaskChannels channel={t.channel} size={16} />
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span className="cap">{t.date}</span>
                          {(t.responsible || []).slice(0,2).map(r => { const s = DD.staff.find(x=>x.name===r)||{color:'#888'}; return <Avatar key={r} name={r} color={s.color} size={20} />; })}
                        </div>
                      </div>
                      {/* มือถือลากไม่ได้ → select ย้ายสถานะ (คอนโทรลเล็ก กว้างตามเนื้อหา ไม่เต็มแถว · select ไม่ทำ iOS ซูม) */}
                      <select className="mobile-only" value={t.status} aria-label="ย้ายสถานะงาน"
                        onClick={e => e.stopPropagation()}
                        onChange={e => { e.stopPropagation(); moveTask(t.id, e.target.value); }}
                        style={{ marginTop: 7, maxWidth: '100%', padding: '3px 6px', fontSize: 'var(--fs-cap)', height: 'auto', color: 'var(--ink-3)', fontFamily: 'var(--font)', border: '1px solid var(--line)', borderRadius: 'var(--r-xs)', background: 'transparent', cursor: 'pointer' }}>
                        {DD.kanbanMeta.map(k => <option key={k.id} value={k.id}>ย้ายไป {k.label}</option>)}
                      </select>
                    </div>
                  );
                })}
                {list.length === 0 && <div className="cap" style={{ textAlign: 'center', padding: '16px 0', opacity: 0.6 }}>ลากการ์ดมาที่นี่</div>}
                <button onClick={() => window.__openModal('task', { status: col.id })} style={{
                  width: '100%', padding: '10px', border: '1.5px dashed var(--line)', borderRadius: 'var(--r-sm)',
                  background: 'transparent', cursor: 'pointer', color: 'var(--ink-3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontSize: 'var(--fs-sm)', fontFamily: 'var(--font)', marginTop: 4,
                }}>
                  <Icon name="plus" /> เพิ่มงาน
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Smart Planner Timeline (vertical) ---- */
function TimelineView({ filtered, fProps }) {
  const stMeta = { live: { l: 'กำลังดำเนินการ', cls: 'chip-good' }, upcoming: { l: 'กำลังจะมา', cls: 'chip-accent' }, paused: { l: 'หยุดชั่วคราว', cls: 'chip-warn' }, cancelled: { l: 'ยกเลิก', cls: '' }, done: { l: 'จบแล้ว', cls: '' } };

  // Campaign progress
  const campTasks = {};
  DD.tasks.forEach(t => { campTasks[t.camp] = campTasks[t.camp] || []; campTasks[t.camp].push(t); });

  // Stats
  // เทียบด้วยวันที่จริง (รองรับงานข้ามเดือน) — ไม่ใช่แค่เลขวัน
  const todayIso = todayISO();
  const dayDiff = (s) => { const iso = parseTaskDate(s); if (!iso) return null; return Math.round((new Date(iso + 'T00:00:00') - new Date(todayIso + 'T00:00:00')) / 86400000); };

  // Group filtered tasks by FULL ISO date (กันงานคนละเดือน/คนละปีวันเดียวกันมารวมกัน)
  const byDate = {};
  filtered.forEach(t => { const k = t.dateISO || parseTaskDate(t.date) || t.date || '—'; (byDate[k] = byDate[k] || []).push(t); });
  const dateKeys = Object.keys(byDate).sort((a, b) => { const ia = parseTaskDate(a) || a, ib = parseTaskDate(b) || b; return ia < ib ? -1 : ia > ib ? 1 : 0; });

  return (
    <div className="content-inner rise">
      <PlannerFilters {...fProps} />

      {/* Campaign progress cards */}
      <div className="grid g3" style={{ marginBottom: 14, gap: 10 }}>
        {DD.campaigns.filter(c => !fProps.filterCamp || c.id === fProps.filterCamp).map(c => {
          const tasks = campTasks[c.id] || [];
          const done = tasks.filter(t => t.status === 'done').length;
          const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
          const st = stMeta[c.status] || stMeta.done; // กัน status แปลก → จอขาว
          return (
            <div key={c.id} className="card card-pad-sm" style={{ display: 'flex', alignItems: 'center', gap: 14, borderLeft: `3px solid ${c.color}`, cursor: 'pointer' }} onClick={() => fProps.setFilterCamp(fProps.filterCamp === c.id ? null : c.id)}>
              <Ring pct={pct} size={48} stroke={5} color={c.color}><span className="num" style={{ fontSize: 'var(--fs-micro)', fontWeight: 700 }}>{pct}%</span></Ring>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="sm" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                <div className="cap">{done}/{tasks.length} งาน · {c.start}–{c.end}</div>
              </div>
              <span className={`chip ${st.cls}`}>{st.l}</span>
            </div>
          );
        })}
      </div>

      {/* Vertical Timeline */}
      <div className="card">
        <div className="row between" style={{ marginBottom: 12 }}>
          <span></span>
          <button className="btn btn-sm btn-primary" onClick={() => window.__openModal('task')}><Icon name="plus" /> เพิ่มงาน</button>
        </div>
        {dateKeys.length === 0 && <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--ink-3)' }}><Icon name="search" /><div className="cap" style={{ marginTop: 6 }}>ไม่พบงานตามเงื่อนไข</div></div>}
        <div style={{ position: 'relative', paddingLeft: 32 }}>
          {/* Vertical line */}
          {dateKeys.length > 0 && <div style={{ position: 'absolute', left: 14, top: 8, bottom: 8, width: 2, background: 'var(--line)', borderRadius: 1 }}></div>}

          {dateKeys.map((dateKey, di) => {
            const tasks = byDate[dateKey];
            const diff = dayDiff(dateKey);
            const isToday = diff === 0;
            const isPast = diff != null && diff < 0;
            const iso = parseTaskDate(dateKey);
            const beYear = iso ? Number(iso.slice(0, 4)) + 543 : '';
            return (
              <div key={dateKey} style={{ marginBottom: di < dateKeys.length - 1 ? 20 : 0 }}>
                {/* Date node */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, marginLeft: -32 }}>
                  <div style={{ width: 28, display: 'flex', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                    <div style={{ width: isToday ? 14 : 10, height: isToday ? 14 : 10, borderRadius: '50%', background: isToday ? 'var(--accent)' : isPast ? 'var(--good)' : 'var(--ink-4)', border: isToday ? '2px solid var(--accent-ring)' : 'none' }}></div>
                  </div>
                  <div>
                    <span className="num" style={{ fontSize: 'var(--fs-h3)', fontWeight: 700, color: isToday ? 'var(--accent-2)' : 'var(--ink)' }}>{thaiDate(dateKey) || dateKey}</span>
                    {isToday && <span className="chip chip-accent" style={{ marginLeft: 8 }}>วันนี้</span>}
                    {beYear && <span className="cap" style={{ marginLeft: 8 }}>{beYear}</span>}
                  </div>
                </div>
                {/* Task cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {tasks.map(t => {
                    const c = DD.campaigns.find(x => x.id === t.camp);
                    const isDone = t.status === 'done';
                    const isOverdue = isPast && !isDone;
                    return (
                      <div key={t.id} role="button" tabIndex={0} onKeyDown={onCardKey} onClick={() => window.__openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] })} style={{ padding: '12px 14px', borderRadius: 'var(--r-sm)', background: 'var(--surface)', border: '1px solid var(--line)', borderLeft: `3px solid ${c?.color || '#888'}`, cursor: 'pointer' }}>
                        <div className="row between" style={{ marginBottom: 6 }}>
                          <div>
                            <div className="h3" style={{ textDecoration: isDone ? 'line-through' : 'none', color: isDone ? 'var(--ink-3)' : 'var(--ink)' }}>{t.title}</div>
                            {t.detail && <div className="cap" style={{ marginTop: 1 }}>{t.detail}</div>}
                          </div>
                          {isOverdue && <span className="chip chip-bad">เกินกำหนด</span>}
                        </div>
                        <div className="row wrap" style={{ gap: 8 }}>
                          <span className="chip" style={{ background: (c?.color || '#888') + '22', color: c?.color || '#888' }}>{c?.name || '-'}</span>
                          <TaskChannels channel={t.channel} size={16} />
                          <span className={`chip ${stCls[t.status] || ''}`}>{stLabel[t.status]}</span>
                          <div style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                            {(t.responsible || []).map(r => { const s = DD.staff.find(x => x.name === r) || { color: '#888' }; return <Avatar key={r} name={r} color={s.color} size={22} />; })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ====================  CATALOG  ==================== */
/* ====================  รายงานรวมข้ามช่อง (marketplace multi-channel)  ==================== */
function MpReportView() {
  const [orders, setOrders] = useState(null); // null = loading
  const [skus, setSkus] = useState([]);
  const [err, setErr] = useState('');
  const [month, setMonth] = useState('all');
  const [lens, setLens] = useState('all'); // all | ปลีก | ส่ง | OEM (M1.3)
  const [compare, setCompare] = useState('none'); // none | mom | yoy
  const [chMode, setChMode] = useState('sales'); // sales | profit (M0.5 toggle)
  const [tab, setTab] = useState('overview'); // overview | customers | sales
  const [importOpen, setImportOpen] = useState(false);
  const [targets, setTargets] = useState([]);
  const [batches, setBatches] = useState([]);
  const [drill, setDrill] = useState(null); // { dim, value, label } (M1.5)
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setOrders(null); setErr('');
      const o = await supabase.from('tmk_mp_orders').select('*').order('order_month', { ascending: false }).limit(50000);
      if (cancel) return;
      if (o.error) { setErr(o.error.message || ''); setOrders([]); return; }
      const s = await supabase.from('tmk_mp_skus').select('order_no,source,channel,design,color,size,qty,line_sales,order_month').limit(120000);
      if (cancel) return;
      setOrders(o.data || []); setSkus(s.error ? [] : (s.data || []));
      const t = await supabase.from('tmk_targets').select('*'); if (!cancel && !t.error) setTargets(t.data || []);
      const b = await supabase.from('tmk_mp_import_batches').select('*').order('created_at', { ascending: false }).limit(100); if (!cancel && !b.error) setBatches(b.data || []);
    })();
    return () => { cancel = true; };
  }, [reloadKey]);

  const months = useMemo(() => [...new Set((orders || []).map(o => o.order_month).filter(Boolean))].sort().reverse(), [orders]);
  const activeOrders = useMemo(() => (orders || []).filter(o => o.status !== 'cancelled'), [orders]);
  // M1.3 lens: กรองตามประเภทงาน (ปลีก/ส่ง/OEM) ทั้งระบบ
  const lensOrders = useMemo(() => activeOrders.filter(o => lens === 'all' || (o.job_type || 'ปลีก') === lens), [activeOrders, lens]);
  const lensOrderNos = useMemo(() => lens === 'all' ? null : new Set(lensOrders.map(o => o.order_no)), [lensOrders, lens]);
  const jobTypes = useMemo(() => [...new Set(activeOrders.map(o => o.job_type).filter(Boolean))], [activeOrders]);
  const fo = useMemo(() => lensOrders.filter(o => month === 'all' || o.order_month === month), [lensOrders, month]);
  const fs = useMemo(() => (skus || []).filter(s => (month === 'all' || s.order_month === month) && (!lensOrderNos || lensOrderNos.has(s.order_no))), [skus, month, lensOrderNos]);
  // M0.2 เทียบงวด: KPI ของเดือนเทียบ (เดือนก่อน / ปีก่อน)
  const prevMonthKey = (mk) => { const [y, m] = String(mk).split('-').map(Number); if (!y) return ''; const d = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; return d; };
  const yoyMonthKey = (mk) => { const [y, m] = String(mk).split('-').map(Number); return y ? `${y - 1}-${String(m).padStart(2, '0')}` : ''; };
  const kpisFor = (mk) => { const r = lensOrders.filter(o => o.order_month === mk); const s = r.reduce((a, x) => a + (Number(x.sales) || 0), 0); return { orders: r.length, sales: s, qty: r.reduce((a, x) => a + (Number(x.qty) || 0), 0), profit: r.reduce((a, x) => a + (Number(x.profit) || 0), 0), aov: r.length ? s / r.length : 0 }; };
  const cmpKey = compare === 'mom' ? prevMonthKey(month) : compare === 'yoy' ? yoyMonthKey(month) : '';
  const cmpKpis = (compare !== 'none' && month !== 'all' && cmpKey) ? kpisFor(cmpKey) : null;

  const agg = useMemo(() => {
    const sum = (arr, k) => arr.reduce((a, x) => a + (Number(x[k]) || 0), 0);
    const grp = (arr, key, val) => { const o = {}; arr.forEach(x => { const k = x[key] || 'ไม่ระบุ'; if (!o[k]) o[k] = { name: k, count: 0, value: 0, qty: 0 }; o[k].count++; o[k].value += Number(x[val]) || 0; o[k].qty += Number(x.qty) || 0; }); return Object.values(o); };
    const sales = sum(fo, 'sales');
    return {
      orders: fo.length, sales, qty: sum(fo, 'qty'), profit: sum(fo, 'profit'), aov: fo.length ? sales / fo.length : 0,
      byChannel: grp(fo, 'channel', 'sales').sort((a, b) => b.value - a.value),
      byPay: grp(fo, 'payment_type', 'sales').sort((a, b) => b.value - a.value),
      byCust: grp(fo, 'customer_type', 'sales').sort((a, b) => b.value - a.value),
      bySales: grp(fo, 'salesperson', 'sales').sort((a, b) => b.value - a.value),
      byProv: grp(fo, 'province', 'sales').sort((a, b) => b.value - a.value).filter(x => x.name !== 'ไม่ระบุ' && x.name !== ''),
      byMonth: grp(orders || [], 'order_month', 'sales').sort((a, b) => String(a.name).localeCompare(String(b.name))),
      byDesign: grp(fs, 'design', 'line_sales').filter(x => x.name && x.name !== 'ไม่ระบุ').sort((a, b) => b.qty - a.qty),
      bySize: grp(fs, 'size', 'line_sales').filter(x => x.name && x.name !== 'ไม่ระบุ'),
      byColor: grp(fs, 'color', 'line_sales').filter(x => x.name && x.name !== 'ไม่ระบุ').sort((a, b) => b.qty - a.qty),
      // M0.5 กำไรสุทธิต่อช่อง (หลังค่าธรรมเนียม)
      byChannelFull: (() => {
        const o = {};
        fo.forEach(x => { const k = x.channel || 'ไม่ระบุ'; if (!o[k]) o[k] = { name: k, count: 0, sales: 0, cost: 0, fee: 0, net: 0, profit: 0, qty: 0 }; const c = o[k]; c.count++; c.sales += Number(x.sales) || 0; c.cost += Number(x.cost) || 0; c.fee += Number(x.mkt_commission) || 0; c.net += Number(x.mkt_net_income) || 0; c.profit += Number(x.profit) || 0; c.qty += Number(x.qty) || 0; });
        return Object.values(o);
      })(),
      cust: (() => {
        const map = {};
        fo.forEach(o => {
          const k = o.customer_code; if (!k) return;
          if (!map[k]) map[k] = { code: k, name: o.customer_name || o.customer_social || k, social: o.customer_social || '', orders: 0, spend: 0, qty: 0, lifeOrders: 0, lifeSpent: 0, channels: new Set(), lastDate: '', firstDate: '' };
          const c = map[k]; c.orders++; c.spend += Number(o.sales) || 0; c.qty += Number(o.qty) || 0;
          c.lifeOrders = Math.max(c.lifeOrders, Number(o.cust_total_orders) || 0);
          c.lifeSpent = Math.max(c.lifeSpent, Number(o.cust_total_spent) || 0);
          if (o.channel) c.channels.add(o.channel);
          const od = o.order_date || o.order_month || '';
          if (od && (!c.lastDate || od > c.lastDate)) c.lastDate = od;
          if (od && (!c.firstDate || od < c.firstDate)) c.firstDate = od;
        });
        return Object.values(map);
      })(),
    };
  }, [fo, fs, orders]);

  const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL'];
  const sizeRank = SIZE_ORDER.map(s => agg.bySize.find(x => x.name === s)).filter(Boolean);
  const maxSize = Math.max(1, ...sizeRank.map(x => x.qty));
  const maxColor = Math.max(1, ...agg.byColor.slice(0, 10).map(x => x.qty));
  const monthlyArr = agg.byMonth.map(m => ({ m: m.name, rev: m.value }));
  // M0.3 colorway matrix (ลาย×สี) — top designs × top colors, qty heatmap
  const matrix = useMemo(() => {
    const dQ = {}, cQ = {}, cell = {};
    fs.forEach(s => { if (!s.design || !s.color) return; const q = Number(s.qty) || 0; dQ[s.design] = (dQ[s.design] || 0) + q; cQ[s.color] = (cQ[s.color] || 0) + q; cell[s.design + '||' + s.color] = (cell[s.design + '||' + s.color] || 0) + q; });
    const topD = Object.entries(dQ).sort((a, b) => b[1] - a[1]).slice(0, 10).map(x => x[0]);
    const topC = Object.entries(cQ).sort((a, b) => b[1] - a[1]).slice(0, 8).map(x => x[0]);
    const max = Math.max(1, ...topD.flatMap(d => topC.map(c => cell[d + '||' + c] || 0)));
    return { topD, topC, cell, max, dQ, cQ };
  }, [fs]);
  // CRM
  const custs = agg.cust;
  const repeatCust = custs.filter(c => c.lifeOrders >= 2).length;
  const newCount = agg.byCust.find(x => x.name === 'ลูกค้าใหม่')?.count || 0;
  const oldCount = agg.byCust.find(x => x.name === 'ลูกค้าเก่า')?.count || 0;
  const topSpend = [...custs].sort((a, b) => b.spend - a.spend);
  const topLoyal = [...custs].sort((a, b) => b.lifeOrders - a.lifeOrders || b.lifeSpent - a.lifeSpent);
  // M1.1 RFM/segment + LTV + win-back
  const maxDate = custs.reduce((a, c) => (c.lastDate > a ? c.lastDate : a), '');
  const dayDiff = (a, b) => { if (!a || !b) return null; const da = new Date(a.length > 7 ? a : a + '-01'), db = new Date(b.length > 7 ? b : b + '-01'); return Math.round((db - da) / 86400000); };
  const segOf = (c) => {
    const r = dayDiff(c.lastDate, maxDate), f = c.lifeOrders || c.orders;
    if (f >= 5 && (r == null || r <= 45)) return 'แชมป์';
    if (f >= 5) return 'เคยภักดี (ห่างไป)';
    if (f >= 2 && r != null && r > 60) return 'กำลังจะหาย';
    if (f >= 2) return 'ลูกค้าประจำ';
    if (r != null && r <= 30) return 'ลูกค้าใหม่';
    return 'ทั่วไป';
  };
  const SEG_TONE = { 'แชมป์': 'var(--good)', 'ลูกค้าประจำ': 'var(--accent-2)', 'ลูกค้าใหม่': 'var(--accent)', 'กำลังจะหาย': 'var(--warn)', 'เคยภักดี (ห่างไป)': 'var(--bad)', 'ทั่วไป': 'var(--ink-3)' };
  const custSeg = custs.map(c => ({ ...c, seg: segOf(c) }));
  const segGroups = Object.values(custSeg.reduce((o, c) => { (o[c.seg] = o[c.seg] || { name: c.seg, count: 0, spend: 0 }); o[c.seg].count++; o[c.seg].spend += c.lifeSpent || c.spend; return o; }, {})).sort((a, b) => b.count - a.count);
  const ltv = custs.length ? custs.reduce((a, c) => a + (c.lifeSpent || 0), 0) / custs.length : 0;
  const winBack = custSeg.filter(c => (c.seg === 'กำลังจะหาย' || c.seg === 'เคยภักดี (ห่างไป)') && (c.lifeSpent > 0 || c.spend > 0)).sort((a, b) => (b.lifeSpent || b.spend) - (a.lifeSpent || a.spend));
  // M1.4 เป้า + pacing
  const targetFor = (st, sid) => { if (month === 'all') return null; const [y, m] = month.split('-').map(Number); return targets.find(t => t.scope_type === st && (t.scope_id || '') === (sid || '') && t.year === y && t.month === m); };
  const saveTarget = async (st, sid, val) => {
    if (month === 'all') { window.__toast?.('เลือกเดือนก่อนตั้งเป้า', 'warn'); return; }
    const [y, m] = month.split('-').map(Number); const id = `${st}:${sid}:${y}:${m}`; const tv = Math.max(0, Number(val) || 0);
    const { error } = await supabase.from('tmk_targets').upsert({ id, scope_type: st, scope_id: sid, year: y, month: m, target_sales: tv, updated_at: new Date().toISOString() });
    if (error) { window.__toast?.('บันทึกเป้าไม่สำเร็จ — รัน migration foundation ก่อน', 'error'); return; }
    window.__toast?.('บันทึกเป้าแล้ว', 'success');
    setTargets(prev => [...prev.filter(t => t.id !== id), { id, scope_type: st, scope_id: sid, year: y, month: m, target_sales: tv }]);
  };
  const _today = new Date();
  const curMonthKey = `${_today.getFullYear()}-${String(_today.getMonth() + 1).padStart(2, '0')}`;
  const isCurMonth = month !== 'all' && month === curMonthKey;
  const daysInMonth = month !== 'all' ? new Date(Number(month.split('-')[0]), Number(month.split('-')[1]), 0).getDate() : 30;
  const daysElapsed = isCurMonth ? _today.getDate() : daysInMonth;
  const projectedSales = isCurMonth && daysElapsed > 0 ? agg.sales / daysElapsed * daysInMonth : agg.sales;
  const overallTarget = targetFor('overall', '')?.target_sales || 0;
  // M0.6 ย้อนกลับการนำเข้า
  const rollbackBatch = async (b) => {
    if (!window.confirm(`ย้อนกลับการนำเข้าชุดนี้?\nจะลบ ${N(b.row_orders || 0)} ออเดอร์ + ${N(b.row_skus || 0)} SKU (${b.month_span || ''})`)) return;
    const e1 = (await supabase.from('tmk_mp_skus').delete().eq('import_batch', b.id)).error;
    const e2 = (await supabase.from('tmk_mp_orders').delete().eq('import_batch', b.id)).error;
    if (e1 || e2) { window.__toast?.('ย้อนกลับไม่สำเร็จ', 'error'); return; }
    await supabase.from('tmk_mp_import_batches').update({ status: 'rolled_back' }).eq('id', b.id);
    window.__toast?.('ย้อนกลับเรียบร้อย', 'success'); setReloadKey(k => k + 1);
  };

  const importBtn = <button className="btn btn-sm btn-primary" onClick={() => setImportOpen(true)}><Icon name="external" /> นำเข้าไฟล์ขาย</button>;

  if (orders === null) return <div className="content-inner rise"><div className="card"><div className="cap" style={{ textAlign: 'center', padding: 28, color: 'var(--ink-4)' }}>กำลังโหลดรายงาน…</div></div></div>;

  return (
    <div className="content-inner rise">
      {importOpen && <MpImportModal onClose={() => setImportOpen(false)} onDone={() => setReloadKey(k => k + 1)} />}
      {drill && (() => {
        const isSku = ['design', 'color', 'size'].includes(drill.dim);
        const rows = isSku ? fs.filter(s => String(s[drill.dim] || '') === drill.value) : fo.filter(o => String(o[drill.dim] || '') === drill.value);
        const tot = rows.reduce((a, x) => a + (Number(isSku ? x.line_sales : x.sales) || 0), 0);
        return (
          <Modal wide icon="grid" title={`รายละเอียด: ${drill.label}`} sub={`${N(rows.length)} รายการ · ${B(tot)}`} onClose={() => setDrill(null)} footer={<button className="btn" onClick={() => setDrill(null)}>ปิด</button>}>
            <div className="table-wrap" style={{ maxHeight: 440, overflow: 'auto' }}><table className="table">
              {isSku
                ? <><thead><tr><th>ออเดอร์</th><th>ช่องทาง</th><th>ลาย</th><th>สี</th><th>ไซซ์</th><th style={{ textAlign: 'right' }}>จำนวน</th><th style={{ textAlign: 'right' }}>ยอด</th></tr></thead>
                  <tbody>{rows.slice(0, 300).map((s, i) => <tr key={i}><td className="cap">{s.order_no}</td><td className="cap">{s.channel}</td><td>{s.design}</td><td className="cap">{s.color}</td><td className="cap">{s.size}</td><td className="num" style={{ textAlign: 'right' }}>{N(s.qty)}</td><td className="num" style={{ textAlign: 'right' }}>{B(s.line_sales)}</td></tr>)}</tbody></>
                : <><thead><tr><th>ออเดอร์</th><th>วันที่</th><th>ช่องทาง</th><th>ลูกค้า</th><th style={{ textAlign: 'right' }}>ชิ้น</th><th style={{ textAlign: 'right' }}>ยอด</th></tr></thead>
                  <tbody>{rows.slice(0, 300).map((o, i) => <tr key={i}><td className="cap">{o.order_no}</td><td className="cap" style={{ whiteSpace: 'nowrap' }}>{o.order_date || o.order_month}</td><td className="cap">{o.channel}</td><td className="cap">{o.customer_name || o.customer_code || '—'}</td><td className="num" style={{ textAlign: 'right' }}>{N(o.qty)}</td><td className="num" style={{ textAlign: 'right' }}>{B(o.sales)}</td></tr>)}</tbody></>}
            </table></div>
            {rows.length > 300 && <div className="cap" style={{ marginTop: 6, color: 'var(--ink-4)' }}>แสดง 300 จาก {N(rows.length)} รายการ</div>}
          </Modal>
        );
      })()}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3><span style={{ color: 'var(--accent)' }}><Icon name="sales" /></span> รายงานรวมข้ามช่องทาง</h3>
          <div className="row" style={{ gap: 6 }}>{importBtn}</div>
        </div>
        {err
          ? <div style={{ textAlign: 'center', padding: 20 }}>
              <div className="cap" style={{ color: 'var(--bad)', marginBottom: 8 }}>{/relation .* does not exist|tmk_mp_/i.test(err) ? 'ยังไม่ได้สร้างตาราง — รัน migration 20260622-mp-report.sql ใน Supabase ก่อน' : 'โหลดไม่สำเร็จ: ' + err}</div>
            </div>
          : orders.length === 0
            ? <div style={{ textAlign: 'center', padding: 24 }}>
                <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 10 }}>ยังไม่มีข้อมูล — อัปโหลดไฟล์ขาย Shipnity (ฐาน) + แคตตาล็อก เพื่อเริ่ม</div>
                {importBtn}
              </div>
            : (<>
                {jobTypes.length > 1 && (
                  <div className="segbar" style={{ marginBottom: 10 }}>
                    <button className={'seg' + (lens === 'all' ? ' active' : '')} onClick={() => setLens('all')}>ทั้งหมด</button>
                    {['ปลีก', 'ส่ง', 'OEM'].filter(j => jobTypes.includes(j)).map(j => <button key={j} className={'seg' + (lens === j ? ' active' : '')} onClick={() => setLens(j)}>{j === 'OEM' ? 'OEM/ราชการ' : j}</button>)}
                  </div>
                )}
                <div className="row" style={{ gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button className={'pick' + (month === 'all' ? ' on' : '')} onClick={() => setMonth('all')}>ทุกเดือน</button>
                  {months.map(m => <button key={m} className={'pick' + (month === m ? ' on' : '')} onClick={() => setMonth(m)}>{m}</button>)}
                  {month !== 'all' && <span className="cap" style={{ marginLeft: 6 }}>เทียบ:</span>}
                  {month !== 'all' && <div className="segbar">{[['none', 'ปิด'], ['mom', 'เดือนก่อน'], ['yoy', 'ปีก่อน']].map(([id, l]) => <button key={id} className={'seg' + (compare === id ? ' active' : '')} onClick={() => setCompare(id)}>{l}</button>)}</div>}
                </div>
                {cmpKpis && <div className="cap" style={{ marginBottom: 8, color: 'var(--ink-4)' }}>เทียบกับ {cmpKey}{cmpKpis.orders === 0 ? ' (ไม่มีข้อมูลงวดนั้น)' : ''}</div>}
                <div className="row" style={{ gap: 26, flexWrap: 'wrap' }}>
                  <div><div className="cap">ออเดอร์</div><div className="num kpi-value">{N(agg.orders)} <DeltaPill cur={agg.orders} prev={cmpKpis?.orders} /></div></div>
                  <div><div className="cap">ยอดขายรวม</div><div className="num kpi-value">{B(agg.sales)} <DeltaPill cur={agg.sales} prev={cmpKpis?.sales} /></div></div>
                  <div><div className="cap">จำนวนชิ้น</div><div className="num kpi-value">{N(agg.qty)} <DeltaPill cur={agg.qty} prev={cmpKpis?.qty} /></div></div>
                  <div><div className="cap">กำไรสุทธิ</div><div className="num kpi-value" style={{ color: 'var(--good)' }}>{B(agg.profit)} <DeltaPill cur={agg.profit} prev={cmpKpis?.profit} /></div></div>
                  <div><div className="cap">เฉลี่ย/ออเดอร์</div><div className="num kpi-value">{B(agg.aov)} <DeltaPill cur={agg.aov} prev={cmpKpis?.aov} /></div></div>
                </div>
              </>)}
      </div>

      {orders.length > 0 && !err && (
        <div className="segbar" style={{ marginBottom: 16 }}>
          <button className={'seg' + (tab === 'overview' ? ' active' : '')} onClick={() => setTab('overview')}>ภาพรวม</button>
          <button className={'seg' + (tab === 'customers' ? ' active' : '')} onClick={() => setTab('customers')}>ลูกค้า (CRM)</button>
          <button className={'seg' + (tab === 'sales' ? ' active' : '')} onClick={() => setTab('sales')}>เซลล์ & เป้า</button>
          {batches.length > 0 && <button className={'seg' + (tab === 'history' ? ' active' : '')} onClick={() => setTab('history')}>ประวัตินำเข้า</button>}
        </div>
      )}

      {orders.length > 0 && !err && tab === 'overview' && (<>
        {monthlyArr.length > 1 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>ยอดขายรายเดือน</div>
            <Bars data={monthlyArr} h={140} color="var(--accent-2)" labelKey="m" valueKey="rev" fmt={B} />
          </div>
        )}

        {(() => {
          const chs = [...agg.byChannelFull].sort((a, b) => chMode === 'profit' ? (b.profit - a.profit) : (b.sales - a.sales));
          const maxV = Math.max(1, ...chs.map(c => chMode === 'profit' ? Math.max(0, c.profit) : c.sales));
          const hasFee = chs.some(c => c.fee > 0 || c.cost > 0);
          return (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="row between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <div className="eyebrow">ยอดขาย & กำไรสุทธิแยกช่องทาง</div>
                {hasFee && <div className="segbar"><button className={'seg' + (chMode === 'sales' ? ' active' : '')} onClick={() => setChMode('sales')}>เรียงยอดขาย</button><button className={'seg' + (chMode === 'profit' ? ' active' : '')} onClick={() => setChMode('profit')}>เรียงกำไรจริง</button></div>}
              </div>
              <div className="table-wrap"><table className="table">
                <thead><tr><th>ช่องทาง</th><th style={{ textAlign: 'right' }}>ออเดอร์</th><th style={{ textAlign: 'right' }}>ยอดขาย</th>{hasFee && <th style={{ textAlign: 'right' }}>ค่าธรรมเนียม</th>}{hasFee && <th style={{ textAlign: 'right' }}>กำไรจริง</th>}{hasFee && <th style={{ textAlign: 'right' }}>มาร์จิ้น</th>}<th style={{ minWidth: 90 }}>สัดส่วน</th></tr></thead>
                <tbody>{chs.map(c => { const v = chMode === 'profit' ? c.profit : c.sales; const share = agg.sales > 0 ? (c.sales / agg.sales) * 100 : 0; const margin = c.sales > 0 ? (c.profit / c.sales) * 100 : 0; return (
                  <tr key={c.name} onClick={() => setDrill({ dim: 'channel', value: c.name, label: `ช่องทาง ${c.name}` })} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{N(c.count)}</td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{B(c.sales)}</td>
                    {hasFee && <td className="num" style={{ textAlign: 'right', color: 'var(--ink-3)' }}>{c.fee > 0 ? '−' + B(c.fee) : '—'}</td>}
                    {hasFee && <td className="num" style={{ textAlign: 'right', fontWeight: 700, color: c.profit >= 0 ? 'var(--good)' : 'var(--bad)' }}>{c.cost > 0 || c.fee > 0 ? B(c.profit) : '—'}</td>}
                    {hasFee && <td className="num" style={{ textAlign: 'right', color: margin >= 30 ? 'var(--good)' : margin >= 15 ? 'var(--warn)' : 'var(--bad)' }}>{c.cost > 0 ? P(margin, 0) : '—'}</td>}
                    <td><div className="row" style={{ gap: 8, alignItems: 'center' }}><div className="bar" style={{ flex: 1 }}><span style={{ width: `${(Math.max(0, v) / maxV) * 100}%`, background: chMode === 'profit' ? 'var(--good)' : 'var(--accent)' }} /></div><span className="num cap" style={{ width: 34, textAlign: 'right' }}>{P(share, 0)}</span></div></td>
                  </tr>
                ); })}</tbody>
              </table></div>
              {hasFee && <div className="cap" style={{ marginTop: 8, color: 'var(--ink-4)' }}>POS/โทร/หน้าร้าน ไม่มีค่าธรรมเนียม → กำไรจริงมักดีกว่ามาร์เก็ตเพลส แม้ยอดขายน้อยกว่า</div>}
            </div>
          );
        })()}

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>ลายขายดี (Top 15)</div>
          {agg.byDesign.length === 0 ? <div className="cap" style={{ color: 'var(--ink-4)' }}>ยังไม่มีข้อมูล SKU</div> : (
            <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}><table className="table">
              <thead><tr><th style={{ width: 34 }}>#</th><th>ลาย</th><th style={{ textAlign: 'right' }}>ชิ้น</th><th style={{ textAlign: 'right' }}>ยอดขาย</th></tr></thead>
              <tbody>{agg.byDesign.slice(0, 15).map((d, i) => (
                <tr key={d.name} onClick={() => setDrill({ dim: 'design', value: d.name, label: `ลาย ${d.name}` })} style={{ cursor: 'pointer' }}><td className="num faint" style={{ fontWeight: 700 }}>{i + 1}</td><td style={{ fontWeight: 600 }}>{d.name}</td><td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{N(d.qty)}</td><td className="num" style={{ textAlign: 'right' }}>{B(d.value)}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </div>

        <div className="grid g2" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 14 }}>ไซซ์ขายดี</div>
            {sizeRank.map(s => (
              <div key={s.name} className="row" style={{ gap: 10, marginBottom: 9 }}>
                <span className="sm" style={{ width: 42, fontWeight: 700 }}>{s.name}</span>
                <div className="bar" style={{ flex: 1 }}><span style={{ width: `${(s.qty / maxSize) * 100}%`, background: 'var(--accent)' }} /></div>
                <span className="num sm" style={{ width: 50, textAlign: 'right', fontWeight: 700 }}>{N(s.qty)}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 14 }}>สีขายดี (Top 10)</div>
            {agg.byColor.slice(0, 10).map(c => (
              <div key={c.name} className="row" style={{ gap: 10, marginBottom: 9 }}>
                <span className="sm" style={{ flex: '0 0 70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                <div className="bar" style={{ flex: 1 }}><span style={{ width: `${(c.qty / maxColor) * 100}%`, background: 'var(--accent-2)' }} /></div>
                <span className="num sm" style={{ width: 50, textAlign: 'right', fontWeight: 700 }}>{N(c.qty)}</span>
              </div>
            ))}
          </div>
        </div>

        {matrix.topD.length > 0 && matrix.topC.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 14 }}>ลาย × สี — จำนวนขาย (เข้ม = ขายเยอะ)</div>
            <div className="table-wrap table-sticky-first"><table className="table">
              <thead><tr><th>ลาย \ สี</th>{matrix.topC.map(c => <th key={c} style={{ textAlign: 'center', fontWeight: 600 }}>{c}</th>)}</tr></thead>
              <tbody>{matrix.topD.map(d => (
                <tr key={d}>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{d}</td>
                  {matrix.topC.map(c => { const v = matrix.cell[d + '||' + c] || 0; const a = v / matrix.max; return (
                    <td key={c} className="num" style={{ textAlign: 'center', background: v ? `color-mix(in srgb, var(--accent) ${Math.round(a * 78 + 6)}%, transparent)` : 'transparent', color: a > 0.55 ? '#fff' : 'var(--ink)', fontWeight: v ? 600 : 400 }}>{v || '·'}</td>
                  ); })}
                </tr>
              ))}</tbody>
            </table></div>
            <div className="cap" style={{ marginTop: 8, color: 'var(--ink-4)' }}>10 ลาย × 8 สี ที่ขายดีสุด — เห็นว่าแต่ละลายนิยมสีไหน (ใช้วางแผนตัด/สั่งผลิตตามสี)</div>
          </div>
        )}

        <div className="grid g2" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 14 }}>ยอดขายตามเซลล์</div>
            <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}><table className="table">
              <thead><tr><th>เซลล์</th><th style={{ textAlign: 'right' }}>ออเดอร์</th><th style={{ textAlign: 'right' }}>ยอดขาย</th></tr></thead>
              <tbody>{agg.bySales.map(s => <tr key={s.name}><td>{s.name}</td><td className="num" style={{ textAlign: 'right' }}>{N(s.count)}</td><td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{B(s.value)}</td></tr>)}</tbody>
            </table></div>
          </div>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 14 }}>จังหวัด (Top 10)</div>
            <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}><table className="table">
              <thead><tr><th>จังหวัด</th><th style={{ textAlign: 'right' }}>ออเดอร์</th><th style={{ textAlign: 'right' }}>ยอดขาย</th></tr></thead>
              <tbody>{agg.byProv.slice(0, 10).map(s => <tr key={s.name}><td>{s.name}</td><td className="num" style={{ textAlign: 'right' }}>{N(s.count)}</td><td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{B(s.value)}</td></tr>)}</tbody>
            </table></div>
          </div>
        </div>

        <div className="grid g2" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 14 }}>การชำระเงิน</div>
            {agg.byPay.map(p => <div key={p.name} className="row between" style={{ marginBottom: 8 }}><span>{p.name}</span><span className="num"><b>{N(p.count)}</b> ออเดอร์ · {B(p.value)}</span></div>)}
          </div>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 14 }}>ลูกค้าใหม่ / เก่า</div>
            {agg.byCust.map(p => <div key={p.name} className="row between" style={{ marginBottom: 8 }}><span>{p.name}</span><span className="num"><b>{N(p.count)}</b> ออเดอร์ · {B(p.value)}</span></div>)}
          </div>
        </div>
      </>)}

      {orders.length > 0 && !err && tab === 'customers' && (<>
        {custs.length === 0
          ? <div className="card"><div className="cap" style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }}>ไม่มีข้อมูลลูกค้าในช่วงนี้ (ออเดอร์ TikTok ไม่มีตัวตนลูกค้า · ถ้าเพิ่งอัปเดตให้รัน migration 20260622b แล้วนำเข้าใหม่)</div></div>
          : (<>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 14 }}>ภาพรวมลูกค้า ({rangeLabelMonth(month)})</div>
              <div className="row" style={{ gap: 26, flexWrap: 'wrap' }}>
                <div><div className="cap">ลูกค้า (ไม่ซ้ำ)</div><div className="num kpi-value">{N(custs.length)}</div></div>
                <div><div className="cap">ลูกค้าใหม่</div><div className="num kpi-value" style={{ color: 'var(--good)' }}>{N(newCount)}</div></div>
                <div><div className="cap">ลูกค้าเก่า</div><div className="num kpi-value">{N(oldCount)}</div></div>
                <div><div className="cap">ลูกค้าประจำ (ซื้อ ≥2 ครั้ง)</div><div className="num kpi-value" style={{ color: 'var(--accent-2)' }}>{N(repeatCust)}</div></div>
                <div><div className="cap">ยอด/ลูกค้า</div><div className="num kpi-value">{B(custs.length ? agg.sales / custs.length : 0)}</div></div>
                <div><div className="cap">มูลค่าลูกค้าเฉลี่ย (LTV)</div><div className="num kpi-value" style={{ color: 'var(--good)' }}>{B(ltv)}</div></div>
              </div>
            </div>

            <div className="grid g2" style={{ marginBottom: 16 }}>
              <div className="card">
                <div className="eyebrow" style={{ marginBottom: 14 }}>กลุ่มลูกค้า (RFM)</div>
                {segGroups.map(s => { const share = custs.length ? (s.count / custs.length) * 100 : 0; return (
                  <div key={s.name} className="row" style={{ gap: 10, marginBottom: 9, alignItems: 'center' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: SEG_TONE[s.name] || 'var(--ink-3)', flexShrink: 0 }} />
                    <span className="sm" style={{ flex: '0 0 130px', fontWeight: 600 }}>{s.name}</span>
                    <div className="bar" style={{ flex: 1 }}><span style={{ width: `${share}%`, background: SEG_TONE[s.name] || 'var(--ink-3)' }} /></div>
                    <span className="num sm" style={{ width: 90, textAlign: 'right', fontWeight: 700 }}>{N(s.count)} <span className="cap" style={{ fontWeight: 400 }}>คน</span></span>
                  </div>
                ); })}
                {maxDate.length <= 7 && <div className="cap" style={{ marginTop: 6, color: 'var(--ink-4)' }}>* recency แม่นขึ้นเมื่อมีวันที่ระดับวัน (รัน migration foundation + นำเข้าใหม่)</div>}
              </div>
              <div className="card">
                <div className="row between" style={{ marginBottom: 14 }}>
                  <div className="eyebrow">ควรตามกลับ (win-back)</div>
                  <span className="chip chip-warn">{N(winBack.length)} ราย</span>
                </div>
                {winBack.length === 0 ? <div className="cap" style={{ color: 'var(--ink-4)' }}>ยังไม่มีลูกค้าที่เข้าเกณฑ์ตามกลับ</div> : (
                  <div className="table-wrap" style={{ maxHeight: 240, overflowY: 'auto' }}><table className="table">
                    <thead><tr><th>ลูกค้า</th><th>กลุ่ม</th><th style={{ textAlign: 'right' }}>ยอดสะสม</th></tr></thead>
                    <tbody>{winBack.slice(0, 20).map(c => (
                      <tr key={c.code}><td style={{ fontWeight: 600 }}>{c.name}{c.social && <div className="cap">{c.social}</div>}</td><td><span className="chip" style={{ color: SEG_TONE[c.seg] }}>{c.seg}</span></td><td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{B(c.lifeSpent || c.spend)}</td></tr>
                    ))}</tbody>
                  </table></div>
                )}
              </div>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 14 }}>ลูกค้าใช้จ่ายสูงสุด — ช่วงนี้ (Top 20)</div>
              <div className="table-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}><table className="table">
                <thead><tr><th style={{ width: 34 }}>#</th><th>ลูกค้า</th><th style={{ textAlign: 'right' }}>ออเดอร์</th><th style={{ textAlign: 'right' }}>ชิ้น</th><th style={{ textAlign: 'right' }}>ยอดซื้อ</th><th>ช่องทาง</th></tr></thead>
                <tbody>{topSpend.slice(0, 20).map((c, i) => (
                  <tr key={c.code} onClick={() => setDrill({ dim: 'customer_code', value: c.code, label: c.name })} style={{ cursor: 'pointer' }}>
                    <td className="num faint" style={{ fontWeight: 700 }}>{i + 1}</td>
                    <td><div style={{ fontWeight: 600 }}>{c.name}</div>{c.lifeOrders >= 2 && <span className="chip chip-accent" style={{ marginTop: 2 }}>ประจำ · สะสม {N(c.lifeOrders)} ออเดอร์</span>}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{N(c.orders)}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{N(c.qty)}</td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{B(c.spend)}</td>
                    <td className="cap">{[...c.channels].join(', ')}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            </div>

            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 14 }}>ลูกค้าประจำ — ซื้อบ่อยสุด (ยอดสะสมตลอดอายุ, Top 20)</div>
              <div className="table-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}><table className="table">
                <thead><tr><th style={{ width: 34 }}>#</th><th>ลูกค้า</th><th style={{ textAlign: 'right' }}>ออเดอร์สะสม</th><th style={{ textAlign: 'right' }}>ยอดสะสม</th><th style={{ textAlign: 'right' }}>ซื้อช่วงนี้</th></tr></thead>
                <tbody>{topLoyal.slice(0, 20).map((c, i) => (
                  <tr key={c.code}>
                    <td className="num faint" style={{ fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 700, color: c.lifeOrders >= 5 ? 'var(--good)' : 'var(--ink)' }}>{N(c.lifeOrders)}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{c.lifeSpent > 0 ? B(c.lifeSpent) : '—'}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{B(c.spend)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            </div>
          </>)}
      </>)}

      {orders.length > 0 && !err && tab === 'sales' && (<>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="row between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div className="eyebrow">เป้ายอดขาย {month === 'all' ? '' : `(${month})`}</div>
          </div>
          {month === 'all'
            ? <div className="cap" style={{ color: 'var(--ink-4)' }}>เลือก "เดือน" ด้านบนเพื่อตั้งเป้า + ดู pacing</div>
            : (() => {
                const attain = overallTarget > 0 ? (agg.sales / overallTarget) * 100 : null;
                const paceTarget = overallTarget > 0 ? overallTarget * (daysElapsed / daysInMonth) : 0;
                const onPace = paceTarget > 0 ? agg.sales >= paceTarget : true;
                return (<>
                  <div className="field-row" style={{ marginBottom: 12 }}>
                    <div className="field" style={{ marginBottom: 0 }}><label>เป้ายอดขายเดือนนี้ (฿)</label>
                      <input type="number" min="0" inputMode="decimal" className="input num" defaultValue={overallTarget || ''} placeholder="ใส่เป้า แล้ว Enter" onKeyDown={e => { if (e.key === 'Enter') saveTarget('overall', '', e.target.value); }} onBlur={e => { if ((Number(e.target.value) || 0) !== overallTarget) saveTarget('overall', '', e.target.value); }} />
                    </div>
                  </div>
                  {overallTarget > 0 ? (<>
                    <div className="row between" style={{ marginBottom: 6 }}>
                      <span className="cap">ทำได้ <b style={{ color: 'var(--ink)' }}>{B(agg.sales)}</b> / เป้า {B(overallTarget)}</span>
                      <span style={{ fontWeight: 700, color: attain >= 100 ? 'var(--good)' : attain >= 70 ? 'var(--warn)' : 'var(--bad)' }}>{P(attain, 0)}</span>
                    </div>
                    <div className="bar" style={{ height: 14, position: 'relative' }}>
                      <span style={{ width: `${Math.min(100, attain)}%`, background: attain >= 100 ? 'var(--good)' : 'var(--accent)' }} />
                      {paceTarget > 0 && isCurMonth && <span style={{ position: 'absolute', left: `${Math.min(100, (paceTarget / overallTarget) * 100)}%`, top: -3, bottom: -3, width: 2, background: 'var(--ink)', borderRadius: 1 }} title="ควรอยู่ตรงนี้ตามวัน" />}
                    </div>
                    <div className="cap" style={{ marginTop: 8, color: 'var(--ink-3)' }}>
                      {isCurMonth ? <>คาดสิ้นเดือน <b style={{ color: projectedSales >= overallTarget ? 'var(--good)' : 'var(--bad)' }}>{B(projectedSales)}</b> ({P(overallTarget > 0 ? projectedSales / overallTarget * 100 : 0, 0)} ของเป้า) · {onPace ? 'ตามจังหวะ ✓' : 'ช้ากว่าจังหวะ — ต้องเร่ง'}</> : <>เดือนนี้จบแล้ว — {attain >= 100 ? 'ถึงเป้า ✓' : `ขาดอีก ${B(Math.max(0, overallTarget - agg.sales))}`}</>}
                    </div>
                  </>) : <div className="cap" style={{ color: 'var(--ink-4)' }}>ยังไม่ได้ตั้งเป้าเดือนนี้</div>}
                </>);
              })()}
        </div>

        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 14 }}>ยอดขายตามเซลล์ (leaderboard)</div>
          <div className="table-wrap"><table className="table">
            <thead><tr><th style={{ width: 34 }}>#</th><th>เซลล์</th><th style={{ textAlign: 'right' }}>ออเดอร์</th><th style={{ textAlign: 'right' }}>ยอดขาย</th><th style={{ textAlign: 'right' }}>เฉลี่ย/ออเดอร์</th><th style={{ minWidth: 90 }}>สัดส่วน</th></tr></thead>
            <tbody>{agg.bySales.map((s, i) => { const share = agg.sales > 0 ? (s.value / agg.sales) * 100 : 0; return (
              <tr key={s.name} onClick={() => setDrill({ dim: 'salesperson', value: s.name, label: `เซลล์ ${s.name}` })} style={{ cursor: 'pointer' }}>
                <td className="num faint" style={{ fontWeight: 700 }}>{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{s.name}</td>
                <td className="num" style={{ textAlign: 'right' }}>{N(s.count)}</td>
                <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{B(s.value)}</td>
                <td className="num" style={{ textAlign: 'right' }}>{B(s.count ? s.value / s.count : 0)}</td>
                <td><div className="row" style={{ gap: 8, alignItems: 'center' }}><div className="bar" style={{ flex: 1 }}><span style={{ width: `${share}%`, background: 'var(--accent-2)' }} /></div><span className="num cap" style={{ width: 34, textAlign: 'right' }}>{P(share, 0)}</span></div></td>
              </tr>
            ); })}</tbody>
          </table></div>
        </div>
      </>)}

      {orders.length > 0 && !err && tab === 'history' && (
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 14 }}>ประวัติการนำเข้า (ย้อนกลับได้)</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {batches.map(b => (
              <div key={b.id} style={{ padding: '10px 12px', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', border: '1px solid var(--line)', opacity: b.status === 'rolled_back' ? 0.5 : 1 }}>
                <div className="row between" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ minWidth: 0 }}><b>{b.month_span || '—'}</b> <span className="cap">· {thaiDate(String(b.created_at).slice(0, 10)) || String(b.created_at).slice(0, 10)}</span>{b.status === 'rolled_back' && <span className="chip chip-bad" style={{ marginLeft: 6 }}>ย้อนกลับแล้ว</span>}</span>
                  {b.status !== 'rolled_back' && <button className="btn btn-sm btn-ghost" onClick={() => rollbackBatch(b)}><Icon name="trash" /> ย้อนกลับ</button>}
                </div>
                <div className="cap" style={{ marginTop: 4, color: 'var(--ink-3)' }}>{N(b.row_orders || 0)} ออเดอร์ · {N(b.row_skus || 0)} SKU · {B(b.sales_total || 0)} · {b.channels || ''}</div>
                {b.source_files && <div className="cap" style={{ color: 'var(--ink-4)', wordBreak: 'break-all' }}>{b.source_files}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ป้ายเดือนสำหรับหัวการ์ด CRM
function rangeLabelMonth(m) { return m === 'all' ? 'ทุกเดือน' : m; }
// M0.2 delta pill เทียบงวด
function DeltaPill({ cur, prev }) {
  if (prev == null) return null;
  if (!prev) return cur > 0 ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--good)' }}>ใหม่</span> : null;
  const d = ((cur - prev) / prev) * 100, up = d >= 0;
  return <span style={{ fontSize: 11, fontWeight: 700, color: up ? 'var(--good)' : 'var(--bad)' }}>{up ? '▲' : '▼'}{Math.abs(d).toFixed(0)}%</span>;
}

function ReportHub() {
  const [mode, setMode] = useState('mp'); // mp = รวมข้ามช่อง · internal = กรอกมือ
  return (<>
    <div className="content-inner" style={{ paddingBottom: 0 }}>
      <div className="segbar" style={{ marginBottom: 0 }}>
        <button className={'seg' + (mode === 'mp' ? ' active' : '')} onClick={() => setMode('mp')}>รายงานรวมข้ามช่อง</button>
        <button className={'seg' + (mode === 'internal' ? ' active' : '')} onClick={() => setMode('internal')}>รายงานภายใน (กรอกมือ)</button>
      </div>
    </div>
    {mode === 'mp' ? <MpReportView /> : <SalesReportView />}
  </>);
}

export function CatalogView({ sub }) {
  if (sub === 'campaigns') return <CampaignsView />;
  if (sub === 'po') return <POView />;
  if (sub === 'stock') return <StockView />;
  if (sub === 'report') return <ReportHub />;
  if (sub === 'orders') return <OrdersView />;
  if (sub === 'customers') return <CustomersView />;
  return <ProductsView />;
}

// ดึง "ลาย" (design) จาก strategy ที่เก็บรูป "ลาย: X" (มาจากนำเข้า CSV/Excel) — ใช้จัดกลุ่มโดยไม่ต้องเพิ่มคอลัมน์ DB
function productDesign(p) { const m = /ลาย\s*[:：]\s*([^·|,]+)/.exec(p?.strategy || ''); return m ? m[1].trim() : ''; }

function ProductsView() {
  const products = DD.products || [];
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('rank');   // rank | sold | stock | value | name
  const [filter, setFilter] = useState('all'); // all | lots | low | out
  const [cat, setCat] = useState('');           // '' = ทุกหมวด
  const [groupDesign, setGroupDesign] = useState(false); // จัดกลุ่มตามลาย
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
  const hasAnyDesign = products.some(p => productDesign(p));

  const ql = q.trim().toLowerCase();
  let list = products.filter(p => {
    if (ql && !`${p.name} ${p.sku || ''} ${p.barcode || ''} ${p.category || ''} ${p.supplier || ''} ${productDesign(p)}`.toLowerCase().includes(ql)) return false;
    if (cat && p.category !== cat) return false;
    if (filter === 'lots' && !p.hasLots) return false;
    if (filter === 'low' && p.stock !== 'low') return false;
    if (filter === 'out' && p.stock !== 'out') return false;
    return true;
  });
  const sorters = {
    rank: (a, b) => a.rank - b.rank,
    sold: (a, b) => b.units - a.units,
    stock: (a, b) => b.onHand - a.onHand,
    value: (a, b) => (b.stockValue || 0) - (a.stockValue || 0),
    name: (a, b) => String(a.name).localeCompare(String(b.name), 'th'),
  };
  list = [...list].sort(sorters[sort] || sorters.rank);

  // B1: จัดกลุ่มตามลาย (design) — รวมหลายล็อต/สีของลายเดียวกัน
  const showGroups = groupDesign && hasAnyDesign;
  const designGroups = showGroups ? (() => {
    const map = new Map();
    list.forEach(p => { const d = productDesign(p) || '— ไม่ระบุลาย —'; if (!map.has(d)) map.set(d, []); map.get(d).push(p); });
    return [...map.entries()].map(([design, items]) => ({
      design, items,
      noDesign: design === '— ไม่ระบุลาย —',
      count: items.length,
      onHand: items.reduce((a, p) => a + (p.onHand || 0), 0),
      value: items.reduce((a, p) => a + (p.stockValue || 0), 0),
      sold: items.reduce((a, p) => a + (p.units || 0), 0),
    })).sort((a, b) => (a.noDesign - b.noDesign) || (b.value - a.value));
  })() : [];

  const exportProductsCSV = () => {
    downloadCSV(`tmk-products-${todayISO()}.csv`, [{
      title: 'สินค้า', cols: ['ชื่อ', 'หมวดหมู่', 'SKU', 'บาร์โค้ด', 'ผู้ผลิต', 'ราคา', 'ต้นทุนเฉลี่ย', 'กำไร/ตัว', 'มาร์จิ้น%', 'ขายแล้ว', 'รายได้', 'คงเหลือ', 'มูลค่าสต็อก', 'จุดสั่งซ้ำ'],
      rows: list.map(p => { const avgCost = (p.onHand > 0 && p.stockValue > 0) ? p.stockValue / p.onHand : null; const up = avgCost != null ? p.price - avgCost : null; const mp = up != null && p.price > 0 ? (up / p.price) * 100 : null; return [p.name, p.category || '', p.sku || '', p.barcode || '', p.supplier || '', Math.round(p.price), avgCost == null ? '' : Math.round(avgCost), up == null ? '' : Math.round(up), mp == null ? '' : mp.toFixed(1), p.units, Math.round(p.rev), p.onHand, Math.round(p.stockValue || 0), p.reorder]; }),
    }]);
    logAudit({ action: 'export', entityType: 'data', entityName: 'สินค้า', summary: 'ส่งออกรายการสินค้าเป็น CSV' });
    if (window.__toast) window.__toast('ส่งออก CSV เรียบร้อย', 'success');
  };

  const filters = [['all', 'ทั้งหมด'], ['lots', 'มีล็อต'], ['low', 'ใกล้หมด'], ['out', 'หมด']];
  const sorts = [['rank', 'ลำดับ'], ['sold', 'ขายดี'], ['stock', 'คงเหลือมาก'], ['value', 'มูลค่าสูง'], ['name', 'ชื่อ ก-ฮ']];

  const renderRow = (p, i) => {
    const sm = stockMeta(p.stock);
    // กำไร/ตัว จากต้นทุนเฉลี่ยถ่วงน้ำหนักของสต็อกคงเหลือ (stockValue ÷ คงเหลือ) — เฉพาะสินค้าที่มีล็อต/ต้นทุน
    const avgCost = (p.onHand > 0 && p.stockValue > 0) ? p.stockValue / p.onHand : null;
    const unitProfit = avgCost != null ? p.price - avgCost : null;
    const marginPct = unitProfit != null && p.price > 0 ? (unitProfit / p.price) * 100 : null;
    return (
      <tr key={p.id} onClick={() => window.__openModal('product', p)} style={{ cursor: 'pointer' }}>
        <td className="num faint" style={{ fontWeight: 700 }}>{i + 1}</td>
        <td>
          <div className="row" style={{ gap: 10 }}>
            <span style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0, overflow: 'hidden', background: 'var(--surface-2)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center' }}>
              {p.image
                ? <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ color: 'var(--ink-4)' }}><Icon name="bag" /></span>}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{p.name}{p.category && <span className="chip" style={{ marginLeft: 6, fontWeight: 400 }}>{p.category}</span>}</div>
              <div className="cap">{p.hasLots ? `${p.lots.length} ล็อต · รวม ${N(p.lotTotal)} ตัว · มูลค่า ${B(p.stockValue)}${p.strategy ? ' · ' + p.strategy : ''}` : (p.sku ? `SKU ${p.sku}${p.strategy ? ' · ' + p.strategy : ''}` : p.strategy)}</div>
            </div>
          </div>
        </td>
        <td className="num" style={{ textAlign: 'right' }}>{B(p.price)}</td>
        <td className="num" style={{ textAlign: 'right' }}>{unitProfit == null ? <span style={{ color: 'var(--ink-4)' }}>—</span> : <span style={{ color: unitProfit >= 0 ? 'var(--good)' : 'var(--bad)', fontWeight: 600 }}>{B(unitProfit)}<span className="cap" style={{ fontWeight: 400, marginLeft: 4 }}>{P(marginPct, 0)}</span></span>}</td>
        <td className="num" style={{ textAlign: 'right' }}>{N(p.units)}</td>
        <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{B(p.rev)}</td>
        <td className="num" style={{ textAlign: 'right', color: sm.c, fontWeight: 600 }}>{p.onHand}</td>
        <td style={{ textAlign: 'right' }}><span className={`chip ${sm.cls}`}>{sm.label}</span></td>
      </tr>
    );
  };

  return (
    <div className="content-inner rise">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3><span style={{ color: 'var(--accent)' }}><Icon name="bag" /></span> สินค้า {products.length > 0 && <span className="cap" style={{ fontWeight: 400 }}>({list.length}/{products.length})</span>}</h3>
          <div className="row" style={{ gap: 6 }}>
            {products.length > 0 && <button className="btn btn-sm btn-ghost" onClick={() => window.__openModal('label')} title="พิมพ์ป้ายราคา/บาร์โค้ด"><Icon name="bag" /> ป้าย</button>}
            <button className="btn btn-sm btn-ghost" onClick={() => window.__openModal('import-products')} title="นำเข้าสินค้าจากไฟล์ CSV หรือ Excel"><Icon name="external" /> นำเข้า</button>
            <button className="btn btn-sm btn-ghost" disabled={!list.length} onClick={exportProductsCSV} title="ส่งออก CSV"><Icon name="external" /> CSV</button>
            <button className="btn btn-sm btn-primary" onClick={() => window.__openModal('product')}><Icon name="plus" /> เพิ่มสินค้า</button>
          </div>
        </div>

        {products.length > 0 && (<>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <input className="input" style={{ flex: '1 1 220px' }} value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 ค้นหา ชื่อ / SKU / บาร์โค้ด / หมวด" />
            <select className="input" style={{ flex: '0 0 auto', width: 'auto' }} value={sort} onChange={e => setSort(e.target.value)}>{sorts.map(([id, l]) => <option key={id} value={id}>เรียง: {l}</option>)}</select>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <div className="chips-pick">{filters.map(([id, l]) => <button key={id} className={'pick' + (filter === id ? ' on' : '')} onClick={() => setFilter(id)}>{l}</button>)}</div>
            {categories.length > 0 && <div className="chips-pick">
              <button className={'pick' + (cat === '' ? ' on' : '')} onClick={() => setCat('')}>ทุกหมวด</button>
              {categories.map(c => <button key={c} className={'pick' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>)}
            </div>}
            {hasAnyDesign && <div className="chips-pick"><button className={'pick' + (groupDesign ? ' on' : '')} onClick={() => setGroupDesign(v => !v)} title="รวมหลายล็อต/สีของลายเดียวกัน"><Icon name="layers" /> จัดกลุ่มตามลาย</button></div>}
          </div>
        </>)}

        <div className="table-wrap"><table className="table">
          <thead><tr><th style={{ width: 34 }}>#</th><th>สินค้า</th><th style={{ textAlign: 'right' }}>ราคา</th><th style={{ textAlign: 'right' }}>กำไร/ตัว</th><th style={{ textAlign: 'right' }}>ขายแล้ว</th><th style={{ textAlign: 'right' }}>รายได้</th><th style={{ textAlign: 'right' }}>คงเหลือ</th><th style={{ textAlign: 'right' }}>สถานะ</th></tr></thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }} className="cap">{products.length === 0 ? 'ยังไม่มีสินค้า — กด "เพิ่มสินค้า" เพื่อเริ่ม' : 'ไม่พบสินค้าที่ตรงกับเงื่อนไข'}</td></tr>
            )}
            {showGroups
              ? designGroups.map(g => (
                  <React.Fragment key={g.design}>
                    <tr>
                      <td colSpan={8} style={{ background: 'var(--surface-2)', borderTop: '2px solid var(--line)' }}>
                        <div className="row between" style={{ flexWrap: 'wrap', gap: 6 }}>
                          <span style={{ fontWeight: 700 }}><span style={{ color: g.noDesign ? 'var(--ink-4)' : 'var(--accent)' }}><Icon name="layers" /></span> {g.noDesign ? <span style={{ color: 'var(--ink-4)', fontWeight: 600 }}>{g.design}</span> : g.design} <span className="cap" style={{ fontWeight: 400 }}>· {N(g.count)} รายการ</span></span>
                          <span className="cap" style={{ fontWeight: 400 }}>คงเหลือ <b style={{ color: 'var(--ink)' }}>{N(g.onHand)}</b> · มูลค่า <b style={{ color: 'var(--ink)' }}>{B(g.value)}</b> · ขายแล้ว <b style={{ color: 'var(--ink)' }}>{N(g.sold)}</b></span>
                        </div>
                      </td>
                    </tr>
                    {g.items.map((p, i) => renderRow(p, i))}
                  </React.Fragment>
                ))
              : list.map((p, i) => renderRow(p, i))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

/* ====================  STOCK / INVENTORY VIEW  ==================== */
// ภาพรวมสต็อกแยก ไซส์ × สี ของทุกสินค้า (รวมจากล็อต) + มูลค่าต้นทุนคงคลัง + ไฮไลต์ใกล้หมด/หมด
function StockView() {
  const products = DD.products || [];
  const [openId, setOpenId] = useState(null);
  // คอลัมน์ไซส์ = เฉพาะไซส์ที่มีของจริงอย่างน้อย 1 ตัว (ทั้งร้าน)
  const activeSizes = SIZES.filter(s => products.some(p => (p.sizeStock?.[s] || 0) > 0));
  const shopUnits = products.reduce((a, p) => a + (p.onHand || 0), 0);
  const shopValue = products.reduce((a, p) => a + (p.stockValue || 0), 0);
  const shopReserved = products.reduce((a, p) => a + (p.reservedTotal || 0), 0);
  const lotCount = products.filter(p => p.hasLots).length;
  // ใกล้หมด/หมด: หมด (out) ก่อน แล้วใกล้หมด (low) — ใช้สถานะที่คิด reorder แล้ว
  const alerts = products.filter(p => p.stock === 'out' || p.stock === 'low').sort((a, b) => (a.stock === 'out' ? 0 : 1) - (b.stock === 'out' ? 0 : 1));
  // รายการจองทั้งหมด (flatten ทุกสินค้า)
  const allReservations = products.flatMap(p => (p.reservations || []).map(r => ({ ...r, product: p })));

  // จำนวนแนะนำสำหรับ PO = ทำให้กลับเหนือจุดสั่งซ้ำ (อย่างน้อย = reorder)
  const suggestPO = (p) => Math.max(p.reorder || 0, (p.reorder || 0) * 2 - (p.onHand || 0), 1);
  const orderPO = (p) => window.__openModal('po', { product: p.name, quantity: suggestPO(p) });

  const releaseReservation = async (p, rsvId, alsoSell) => {
    if (!guardEdit()) return;
    try {
      const { ok, error } = await mutateProductReservations(p.id, (cur) => cur.filter(r => r.id !== rsvId));
      if (!ok) throw error || new Error('ปล่อยจองไม่สำเร็จ');
      logAudit({ action: 'release', entityType: 'product', entityName: p.name, summary: `ปล่อยจองสต็อก "${p.name}"` });
      if (window.__reload) await window.__reload();
      if (window.__toast) window.__toast(alsoSell ? 'ปล่อยจองแล้ว — บันทึกการขายต่อได้เลย' : 'ปล่อยจองเรียบร้อย', 'success');
      if (alsoSell) window.__openModal('sell', p);
    } catch (err) { if (window.__toast) window.__toast('ปล่อยจองไม่สำเร็จ: ' + err.message, 'error'); }
  };

  return (
    <div className="content-inner rise">
      <div className="card">
        <div className="card-head">
          <h3><span style={{ color: 'var(--accent)' }}><Icon name="grid" /></span> สต็อก / คลังสินค้า</h3>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {lotCount > 0 && <button className="btn btn-sm btn-primary" onClick={() => window.__openModal('sell')}><Icon name="wallet" /> บันทึกการขาย</button>}
            {lotCount > 0 && <button className="btn btn-sm btn-ghost" onClick={() => window.__openModal('quickfind')}><Icon name="search" /> ขายเร็ว/สแกน</button>}
            {lotCount > 0 && <button className="btn btn-sm btn-ghost" onClick={() => window.__openModal('reserve')}><Icon name="clock" /> จองสต็อก</button>}
            {lotCount > 0 && <button className="btn btn-sm btn-ghost" onClick={() => window.__openModal('adjust')}><Icon name="box" /> ปรับสต็อก</button>}
            <button className="btn btn-sm btn-ghost" onClick={() => window.__openModal('product')}><Icon name="plus" /> เพิ่มสินค้า</button>
          </div>
        </div>

        {/* แจ้งเตือน ต้องสั่งผลิต / ใกล้หมด → สั่ง PO ได้เลย */}
        {alerts.length > 0 && (
          <div style={{ border: '1px solid var(--warn-soft)', background: 'var(--warn-soft)', borderRadius: 'var(--r-sm)', padding: '10px 12px', marginBottom: 14 }}>
            <div className="row" style={{ gap: 8, marginBottom: 8 }}><span style={{ color: 'var(--warn)' }}><Icon name="bell" /></span><b>ต้องสั่งผลิต / ใกล้หมด ({alerts.length})</b></div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {alerts.map(p => { const sm = stockMeta(p.stock); return (
                <span key={p.id} className="chip" style={{ background: 'var(--surface)', border: `1px solid ${sm.c}`, color: 'var(--ink)', gap: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: sm.c, display: 'inline-block', marginRight: 3 }}></span>
                  <span style={{ cursor: 'pointer' }} onClick={() => window.__openModal('product', p)}>{p.name} <span className="cap">เหลือ {p.onHand}</span></span>
                  <button className="btn btn-sm" style={{ padding: '1px 6px', marginLeft: 4 }} title={`สร้าง PO สั่งผลิต ~${suggestPO(p)} ตัว`} onClick={() => orderPO(p)}><Icon name="box" /> สั่ง</button>
                </span>
              ); })}
            </div>
          </div>
        )}

        {/* สรุปทั้งร้าน */}
        <div className="row" style={{ gap: 28, flexWrap: 'wrap', marginBottom: 16 }}>
          <div><div className="cap">รวมสต็อกทั้งร้าน</div><div className="num kpi-value">{N(shopUnits)} <span className="cap" style={{ fontWeight: 400 }}>ตัว</span></div></div>
          <div><div className="cap">มูลค่าต้นทุนคงคลัง</div><div className="num kpi-value">{B(shopValue)}</div></div>
          {shopReserved > 0 && <div><div className="cap">จองรวม / พร้อมขาย</div><div className="num kpi-value">{N(shopReserved)} <span className="cap" style={{ fontWeight: 400 }}>/ {N(shopUnits - shopReserved)}</span></div></div>}
          <div><div className="cap">สินค้าที่มีล็อต</div><div className="num kpi-value">{lotCount}/{products.length}</div></div>
        </div>

        {/* รายการจอง */}
        {allReservations.length > 0 && (
          <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '10px 12px', marginBottom: 16 }}>
            <div className="row" style={{ gap: 8, marginBottom: 8 }}><span style={{ color: 'var(--accent)' }}><Icon name="clock" /></span><b>รายการจอง ({allReservations.length})</b></div>
            <div className="table-wrap"><table className="table">
              <tbody>
                {allReservations.map(r => (
                  <tr key={r.id}>
                    <td><span style={{ fontWeight: 600 }}>{r.product.name}</span>{r.customer && <span className="cap"> · {r.customer}</span>}<div className="cap">{(r.items || []).map(it => `${it.color} ${it.size}×${it.qty}`).join(', ')}{r.note ? ' · ' + r.note : ''}</div></td>
                    <td className="cap" style={{ whiteSpace: 'nowrap' }}>{thaiDate(r.date) || r.date}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => releaseReservation(r.product, r.id, true)} title="ปล่อยจอง + บันทึกขาย"><Icon name="wallet" /> ขาย</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => releaseReservation(r.product, r.id, false)} style={{ color: 'var(--bad)' }} title="ปล่อยจอง (ยกเลิก)"><Icon name="x" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        )}

        {products.length === 0
          ? <div className="cap" style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }}>ยังไม่มีสินค้า — ไปหน้า "สินค้า" เพื่อเพิ่ม + ใส่ล็อต (ไซส์ × สี)</div>
          : (
            <div className="table-wrap table-sticky-first" style={{ overflowX: 'auto' }}>
              <table className="table" style={{ minWidth: 'max-content' }}>
                <thead><tr>
                  <th>สินค้า</th>
                  {activeSizes.map(s => <th key={s} style={{ textAlign: 'center', minWidth: 44 }}>{s}</th>)}
                  <th style={{ textAlign: 'right' }}>รวม</th>
                  <th style={{ textAlign: 'right' }}>มูลค่า</th>
                  <th style={{ textAlign: 'right' }}>สถานะ</th>
                  <th style={{ textAlign: 'right' }}></th>
                </tr></thead>
                <tbody>
                  {products.map(p => {
                    const sm = stockMeta(p.stock);
                    const isOpen = openId === p.id;
                    return (
                      <React.Fragment key={p.id}>
                        <tr onClick={() => setOpenId(isOpen ? null : p.id)} style={{ cursor: 'pointer' }}>
                          <td>
                            <div className="row" style={{ gap: 10 }}>
                              <span style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: 'var(--ink-4)', flexShrink: 0 }}><Icon name="chevR" /></span>
                              <span onClick={(e) => { e.stopPropagation(); window.__openModal('product', p); }} title="แก้ไขสินค้า" style={{ width: 32, height: 32, borderRadius: 7, flexShrink: 0, overflow: 'hidden', background: 'var(--surface-2)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center' }}>
                                {p.image ? <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: 'var(--ink-4)' }}><Icon name="bag" /></span>}
                              </span>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 600 }}>{p.name}</div>
                                <div className="cap">{p.hasLots ? `${p.lots.length} ล็อต` : 'ไม่มีล็อต'}</div>
                              </div>
                            </div>
                          </td>
                          {activeSizes.map(s => { const q = p.sizeStock?.[s] || 0; return <td key={s} className="num" style={{ textAlign: 'center', color: q ? 'var(--ink)' : 'var(--ink-4)' }}>{q ? N(q) : '—'}</td>; })}
                          <td className="num" style={{ textAlign: 'right', fontWeight: 700, color: sm.c }}>{N(p.onHand)}{p.reservedTotal > 0 && <div className="cap" style={{ fontWeight: 400, color: 'var(--accent)' }}>จอง {N(p.reservedTotal)} · ว่าง {N(p.available)}</div>}</td>
                          <td className="num" style={{ textAlign: 'right' }}>{p.stockValue ? B(p.stockValue) : '—'}</td>
                          <td style={{ textAlign: 'right' }}><span className={`chip ${sm.cls}`}>{sm.label}</span></td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button className="icon-btn" title="ประวัติเข้า-ออก" onClick={(e) => { e.stopPropagation(); window.__openModal('ledger', p); }}><Icon name="route" /></button>
                            {p.hasLots && p.onHand > 0 && <button className="btn btn-sm btn-ghost" title="บันทึกการขาย / ตัดสต็อก" onClick={(e) => { e.stopPropagation(); window.__openModal('sell', p); }}><Icon name="wallet" /> ขาย</button>}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr><td colSpan={activeSizes.length + 5} style={{ background: 'var(--surface-2)', padding: 12 }}>
                            <ProductVariantMatrix p={p} />
                          </td></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        {activeSizes.length === 0 && products.length > 0 && <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 10 }}>ยังไม่มีข้อมูลไซส์ในล็อต — เปิดสินค้าแล้วเพิ่มล็อต (ไซส์ × สี) เพื่อดูภาพรวมที่นี่</div>}
      </div>
    </div>
  );
}

// ตารางสี × ไซส์ ของสินค้า 1 ตัว (รวมทุกล็อต) — อ่านอย่างเดียว สำหรับ drill-down หน้าสต็อก
function ProductVariantMatrix({ p }) {
  const variants = p.variants || {};
  const colorNames = Object.keys(variants);
  const sizes = SIZES.filter(s => (p.sizeStock?.[s] || 0) > 0);
  if (!colorNames.length || !sizes.length) return <div className="cap" style={{ color: 'var(--ink-4)' }}>ไม่มีข้อมูลล็อต (ไซส์ × สี) — สินค้านี้กรอกสต็อกรวมแบบไม่แยกไซส์/สี</div>;
  // ดึง hex ของแต่ละสีจากล็อต (variants เก็บแค่ชื่อ+จำนวน)
  const hexByName = {};
  (p.lots || []).forEach(l => (l.colors || []).forEach(c => { if (c?.name && !hexByName[c.name]) hexByName[c.name] = c.hex; }));
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table" style={{ margin: 0, minWidth: 'max-content', background: 'var(--surface)' }}>
        <thead><tr>
          <th style={{ textAlign: 'left' }}>สี \ ไซส์</th>
          {sizes.map(s => <th key={s} style={{ textAlign: 'center', minWidth: 44 }}>{s}</th>)}
          <th style={{ textAlign: 'center' }}>รวม</th>
        </tr></thead>
        <tbody>
          {colorNames.map(name => {
            const row = variants[name] || {};
            const rt = sizes.reduce((a, s) => a + (row[s] || 0), 0);
            return (
              <tr key={name}>
                <td><span className="row" style={{ gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: hexByName[name] || '#ccc', border: '1px solid var(--line)', display: 'inline-block', flexShrink: 0 }}></span>{name}</span></td>
                {sizes.map(s => { const q = row[s] || 0; const col = q === 0 ? 'var(--ink-4)' : q <= 2 ? 'var(--warn)' : 'var(--good)'; return <td key={s} className="num" style={{ textAlign: 'center', color: col, fontWeight: q > 0 && q <= 2 ? 700 : 400 }}>{q ? N(q) : '—'}</td>; })}
                <td className="num" style={{ textAlign: 'center', fontWeight: 700 }}>{N(rt)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot><tr style={{ fontWeight: 700 }}>
          <td>รวมต่อไซส์</td>
          {sizes.map(s => <td key={s} className="num" style={{ textAlign: 'center' }}>{N(p.sizeStock?.[s] || 0)}</td>)}
          <td className="num" style={{ textAlign: 'center', fontWeight: 800, color: 'var(--accent-2)' }}>{N(p.onHand)}</td>
        </tr></tfoot>
      </table>
    </div>
  );
}

/* ---------- CSV download helper (Blob + UTF-8 BOM, กัน formula-injection) ---------- */
// กัน CSV formula-injection (Excel) แต่ "ยกเว้นเลขล้วน" — เลขติดลบ (-1234.56) ต้องคงเป็นตัวเลข ไม่งั้น SUM ใน Excel ข้าม
const _csvEsc = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
function downloadCSV(filename, blocks) {
  let csv = '';
  blocks.forEach(({ title, cols, rows }) => {
    if (title) csv += title + '\n';
    if (cols) csv += cols.map(_csvEsc).join(',') + '\n';
    (rows || []).forEach(r => { csv += r.map(_csvEsc).join(',') + '\n'; });
    csv += '\n';
  });
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
}

/* ====================  SALES REPORT VIEW  ==================== */
// รายงานการขาย — สรุปจากประวัติการขาย (tmk_audit_logs action='sale') อ่านอย่างเดียว
// ⚠️ ไม่แตะ หน้าหลัก / ยอดขาย (Sales) / วางแผน (Planner) — อ่าน audit log มาสรุปเท่านั้น
function SalesReportView() {
  const { version } = useData() || {};
  const [sales, setSales] = useState(null); // null = กำลังโหลด
  const [range, setRange] = useState('month'); // month | d90 | all
  const [snaps, setSnaps] = useState([]); // snapshot มูลค่าคลังตามเวลา

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data, error } = await supabase.from('tmk_inventory_snapshots')
        .select('date,units,value').order('date', { ascending: true }).limit(120);
      if (!cancel && !error) setSnaps(data || []);
    })();
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      // อ่านจากตารางการขายจริงก่อน (tmk_sales)
      const { data: sd, error: se } = await supabase.from('tmk_sales')
        .select('*').order('sale_date', { ascending: false }).limit(5000);
      if (cancel) return;
      if (!se && Array.isArray(sd) && sd.length) {
        setSales(sd.map(r => ({ productId: r.product_id, productName: r.product_name, category: r.category, channel: r.channel || '', price: Number(r.qty) ? Number(r.amount) / Number(r.qty) : 0, date: r.sale_date, day: r.sale_date, totalQty: Number(r.qty) || 0, totalAmount: Number(r.amount) || 0, totalCost: Number(r.cost) || 0, lines: Array.isArray(r.lines) ? r.lines : [] })));
        return;
      }
      // fallback: ข้อมูลเก่าที่เก็บใน audit log (action='sale') / ตาราง tmk_sales ยังไม่มี
      const { data, error } = await supabase.from('tmk_audit_logs')
        .select('created_at,details').eq('action', 'sale')
        .order('created_at', { ascending: false }).limit(2000);
      if (cancel) return;
      if (error) { setSales([]); return; }
      const parsed = (data || []).map(r => {
        let d = {};
        try { d = typeof r.details === 'string' ? JSON.parse(r.details) : (r.details || {}); } catch { /* ข้าม log ผิดรูป */ }
        const s = d.data;
        if (!s || !Array.isArray(s.lines)) return null; // log เก่าที่ไม่มี structured → ข้าม
        return { ...s, day: s.date || String(r.created_at).slice(0, 10) };
      }).filter(Boolean);
      setSales(parsed);
    })();
    return () => { cancel = true; };
  }, []);

  const ranges = [['month', 'เดือนนี้'], ['d90', '90 วัน'], ['all', 'ทั้งหมด']];
  const rangeLabel = (ranges.find(r => r[0] === range) || [])[1] || '';
  const curYM = todayISO().slice(0, 7);
  const cutoff90 = (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10); })();
  const inRange = (day) => range === 'all' ? true : !day ? false : range === 'month' ? day.slice(0, 7) === curYM : day >= cutoff90;

  // Pipeline aggregation — memo เพื่อเลี่ยงรัน forEach 5000 บิล + sort หลายรอบทุก render
  // dep: sales (lazy fetch), range (เปลี่ยนช่วง), version (catalog อัปเดต)
  const agg = useMemo(() => {
    const prodById = {}; (DD.products || []).forEach(p => { prodById[p.id] = p; });
    const hexByColor = {}; (DD.products || []).forEach(p => (p.lots || []).forEach(l => (l.colors || []).forEach(c => { if (c?.name && !(c.name in hexByColor)) hexByColor[c.name] = c.hex; })));
    // A1: lookup ช่องทาง (จับคู่ข้อความอิสระใน tmk_sales.channel กับช่องทางมาตรฐาน เพื่อใช้สี/ชื่อ)
    const chLookup = {}; (DD.channels || []).forEach(c => { if (c?.name) chLookup[c.name.trim().toLowerCase()] = { name: c.name, hex: c.hex }; if (c?.id) chLookup[String(c.id).trim().toLowerCase()] = { name: c.name, hex: c.hex }; });
    const rows = (sales || []).filter(s => inRange(s.day));
    const byProduct = {}, bySize = {}, byColor = {}, byCategory = {}, byChannel = {}, dailyMap = {};
    let totalQty = 0, totalAmount = 0, totalCost = 0;
    rows.forEach(s => {
      const pid = s.productId || s.productName;
      const sq = Number(s.totalQty) || s.lines.reduce((a, l) => a + (Number(l.qty) || 0), 0);
      const sa = Number(s.totalAmount) || sq * (Number(s.price) || 0);
      const sc = Number(s.totalCost) || 0;
      const bp = byProduct[pid] || (byProduct[pid] = { id: s.productId, name: s.productName, qty: 0, amount: 0, cost: 0 });
      bp.qty += sq; bp.amount += sa; bp.cost += sc;
      totalQty += sq; totalAmount += sa; totalCost += sc;
      const cat = (s.category || prodById[pid]?.category || 'ไม่ระบุหมวด');
      const bc = byCategory[cat] || (byCategory[cat] = { name: cat, qty: 0, amount: 0, cost: 0 });
      bc.qty += sq; bc.amount += sa; bc.cost += sc;
      // A1: สะสมตามช่องทาง — จับคู่ชื่อช่องมาตรฐาน, ที่ไม่ตรง/ว่าง รวมเป็นกลุ่มเดียว
      const chRaw = String(s.channel || '').trim();
      const chMatch = chRaw ? chLookup[chRaw.toLowerCase()] : null;
      const chKey = chMatch ? chMatch.name : (chRaw || '__none__');
      const ch = byChannel[chKey] || (byChannel[chKey] = { key: chKey, name: chMatch ? chMatch.name : (chRaw || 'ขายตรง / ไม่ระบุช่องทาง'), hex: chMatch?.hex || (chRaw ? 'var(--ink-3)' : 'var(--ink-4)'), known: !!chMatch, none: !chRaw, qty: 0, amount: 0, cost: 0 });
      ch.qty += sq; ch.amount += sa; ch.cost += sc;
      const dm = dailyMap[s.day] || (dailyMap[s.day] = { qty: 0, amount: 0 });
      dm.qty += sq; dm.amount += sa;
      s.lines.forEach(l => { const q = Number(l.qty) || 0; if (l.size) bySize[l.size] = (bySize[l.size] || 0) + q; if (l.color) byColor[l.color] = (byColor[l.color] || 0) + q; });
    });
    const totalProfit = totalAmount - totalCost;
    const margin = totalAmount > 0 ? (totalProfit / totalAmount) * 100 : 0;
    const productRank = Object.values(byProduct).sort((a, b) => b.qty - a.qty);
    const sizeRank = SIZES.filter(s => bySize[s] > 0).map(s => ({ label: s, qty: bySize[s] }));
    const colorRank = Object.entries(byColor).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty);
    const catRank = Object.values(byCategory).sort((a, b) => b.amount - a.amount);
    const channelRank = Object.values(byChannel).sort((a, b) => b.amount - a.amount);
    const maxChannelAmt = Math.max(1, ...channelRank.map(x => x.amount));
    const channelKnownCount = channelRank.filter(c => !c.none).length;
    const maxSize = Math.max(1, ...sizeRank.map(x => x.qty));
    const maxColor = Math.max(1, ...colorRank.map(x => x.qty));
    const dailyArr = Object.keys(dailyMap).sort().map(day => ({ day, ...dailyMap[day] }));
    // กราฟรายเดือน 8 เดือนล่าสุด
    const monthMap = {};
    (sales || []).forEach(s => { const ym = (s.day || '').slice(0, 7); if (ym) monthMap[ym] = (monthMap[ym] || 0) + (Number(s.totalAmount) || 0); });
    const monthlyArr = Object.keys(monthMap).sort().slice(-8).map(ym => {
      const [y, m] = ym.split('-').map(Number);
      return { m: `${MONTHS_TH_SHORT[m - 1] || m} ${String((y + 543) % 100).padStart(2, '0')}`, rev: monthMap[ym] };
    });
    const sellThrough = (DD.products || []).filter(p => (p.onHand || 0) > 0).map(p => {
      const sold = byProduct[p.id]?.qty || 0;
      const base = sold + (p.onHand || 0);
      return { p, sold, onHand: p.onHand || 0, pct: base > 0 ? (sold / base) * 100 : 0 };
    }).sort((a, b) => a.pct - b.pct);
    const abcSorted = productRank.filter(p => p.amount > 0).slice().sort((a, b) => b.amount - a.amount);
    const abcTotal = abcSorted.reduce((a, p) => a + p.amount, 0) || 1;
    let _cum = 0;
    const abc = abcSorted.map(p => { _cum += p.amount; const cumPct = (_cum / abcTotal) * 100; return { ...p, cumPct, cls: cumPct <= 80 ? 'A' : cumPct <= 95 ? 'B' : 'C' }; });
    const abcCount = { A: abc.filter(x => x.cls === 'A').length, B: abc.filter(x => x.cls === 'B').length, C: abc.filter(x => x.cls === 'C').length };
    const _todayStr = todayISO();
    const daysSince = (iso) => { if (!iso) return null; const a = new Date(iso + 'T00:00:00'), b = new Date(_todayStr + 'T00:00:00'); return Math.max(0, Math.round((b - a) / 86400000)); };
    // rank3: จำนวนวันในช่วงที่เลือก → ใช้หาร velocity (ขาย/วัน). 'all' = นับจากวันที่มีบิลแรกถึงวันนี้
    // 'month' ใส่พื้นขั้นต่ำ 7 วัน กัน velocity พุ่งช่วงต้นเดือน (วันที่ 1–6) แล้วเตือน "ต้องสั่งด่วน" หลอก
    const rangeDays = range === 'd90' ? 90
      : range === 'month' ? Math.max(7, Number(_todayStr.slice(8, 10)))
      : (() => { const ds = Object.keys(dailyMap).sort(); if (!ds.length) return 1; const a = new Date(ds[0] + 'T00:00:00'), b = new Date(_todayStr + 'T00:00:00'); return Math.max(1, Math.round((b - a) / 86400000) + 1); })();
    const aging = (DD.products || []).filter(p => (p.onHand || 0) > 0).map(p => {
      const sold = byProduct[p.id]?.qty || 0;
      const onHand = p.onHand || 0;
      const turnover = onHand > 0 ? sold / onHand : 0;
      const velocity = sold / rangeDays; // ตัว/วัน ในช่วงที่เลือก
      const daysLeft = velocity > 0 ? onHand / velocity : null; // ขายหมดในกี่วัน (null = ไม่มีการขายในช่วงนี้)
      const urgent = daysLeft != null && daysLeft <= 30; // ใกล้หมดก่อน lead time ผลิต
      return { p, age: daysSince(p.oldestLotDate), onHand, turnover, velocity, daysLeft, urgent };
    }).sort((a, b) => {
      // เรียง: ต้องสั่งด่วนขึ้นก่อน (daysLeft น้อยสุด) → แล้วค่อยเรียงตามอายุ
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
      if (a.urgent && b.urgent) return (a.daysLeft || 0) - (b.daysLeft || 0);
      return (b.age || 0) - (a.age || 0);
    });
    const urgentCount = aging.filter(a => a.urgent).length;
    // rank5: Dead stock — แบ่งมูลค่าต้นทุนที่จม "ต่อล็อต" ตามอายุของล็อตนั้น (ไม่ยัดทั้งก้อนไปที่ล็อตเก่าสุด)
    const ageBuckets = [
      { label: '0–30 วัน', min: 0, max: 30, count: 0, value: 0, tone: 'var(--good)' },
      { label: '31–90 วัน', min: 31, max: 90, count: 0, value: 0, tone: 'var(--ink)' },
      { label: '91–180 วัน', min: 91, max: 180, count: 0, value: 0, tone: 'var(--warn)' },
      { label: '180+ วัน', min: 181, max: Infinity, count: 0, value: 0, tone: 'var(--bad)' },
    ];
    let stuckValue = 0, unknownValue = 0, unknownCount = 0; // 91+ วัน / ล็อตไม่มีวันที่
    (DD.products || []).filter(p => (p.onHand || 0) > 0).forEach(p => {
      const lots = Array.isArray(p.lots) ? p.lots : [];
      if (!lots.length) return; // ไม่มีล็อต = ไม่มีต้นทุน → ไม่นับมูลค่าจม
      lots.forEach(l => {
        if (lotTotal(l) <= 0) return; // ล็อตที่ขายหมดแล้ว ไม่มีของจม
        const val = lotValue(l);
        const age = daysSince(l.date);
        if (age == null) { unknownValue += val; unknownCount++; return; }
        const b = ageBuckets.find(x => age >= x.min && age <= x.max) || ageBuckets[3];
        b.count++; b.value += val;
        if (age >= 91) stuckValue += val;
      });
    });
    const deadStock = (DD.products || []).filter(p => (p.onHand || 0) > 0 && (byProduct[p.id]?.qty || 0) === 0)
      .map(p => ({ p, onHand: p.onHand || 0, value: p.stockValue || 0, age: daysSince(p.oldestLotDate) }))
      .sort((a, b) => (b.value - a.value) || ((b.age || 0) - (a.age || 0)));
    const deadValue = deadStock.reduce((a, d) => a + d.value, 0);
    const totalStockCost = ageBuckets.reduce((a, b) => a + b.value, 0) + unknownValue;
    return { prodById, hexByColor, rows, byProduct, totalQty, totalAmount, totalCost, totalProfit, margin,
             productRank, sizeRank, colorRank, catRank, channelRank, maxChannelAmt, channelKnownCount, maxSize, maxColor, dailyArr, monthlyArr, sellThrough, abc, abcCount, aging, urgentCount, ageBuckets, stuckValue, unknownValue, unknownCount, deadStock, deadValue, totalStockCost };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- DD.products เป็น mutable global → ใช้ version proxy
  }, [sales, range, version]);
  const { prodById, hexByColor, rows, totalQty, totalAmount, totalCost, totalProfit, margin,
          productRank, sizeRank, colorRank, catRank, channelRank, maxChannelAmt, channelKnownCount, maxSize, maxColor, dailyArr, monthlyArr, sellThrough, abc, abcCount, aging, urgentCount, ageBuckets, stuckValue, unknownValue, unknownCount, deadStock, deadValue, totalStockCost } = agg;
  const dailyLabel = (day) => { const [, m, d] = day.split('-'); return `${Number(d)}/${Number(m)}`; };
  // กราฟมูลค่าคลังตามเวลา
  const snapVals = (snaps || []).map(s => Number(s.value) || 0);
  const snapLabels = (snaps || []).map(s => { const [, m, d] = String(s.date).split('-'); return `${Number(d)}/${Number(m)}`; });
  const abcChip = { A: 'chip-good', B: 'chip-accent', C: '' };

  const exportCSV = () => {
    const blocks = [
      { title: `รายงานการขาย (${rangeLabel})`, cols: ['สรุป', 'ค่า'], rows: [
        ['รวมขาย (ตัว)', totalQty], ['ยอดเงิน', Math.round(totalAmount)], ['ต้นทุน', Math.round(totalCost)],
        ['กำไร', Math.round(totalProfit)], ['มาร์จิ้น %', margin.toFixed(1)], ['จำนวนบิล', rows.length],
      ] },
      { title: 'สินค้าขายดี', cols: ['อันดับ', 'สินค้า', 'หมวดหมู่', 'ขายแล้ว', 'ยอดเงิน', 'ต้นทุน', 'กำไร'], rows: productRank.map((p, i) => [i + 1, p.name, prodById[p.id]?.category || '', p.qty, Math.round(p.amount), Math.round(p.cost), Math.round(p.amount - p.cost)]) },
      { title: 'ไซส์ขายดี', cols: ['ไซส์', 'จำนวน'], rows: sizeRank.map(s => [s.label, s.qty]) },
      { title: 'สีขายดี', cols: ['สี', 'จำนวน'], rows: colorRank.map(c => [c.name, c.qty]) },
      { title: 'กำไรตามหมวดหมู่', cols: ['หมวดหมู่', 'ขายแล้ว', 'ยอดเงิน', 'กำไร'], rows: catRank.map(c => [c.name, c.qty, Math.round(c.amount), Math.round(c.amount - c.cost)]) },
      { title: 'ยอดขายแยกช่องทาง', cols: ['ช่องทาง', 'ขายแล้ว', 'ยอดเงิน', 'สัดส่วน%', 'กำไร'], rows: channelRank.map(c => [c.name, c.qty, Math.round(c.amount), totalAmount > 0 ? ((c.amount / totalAmount) * 100).toFixed(1) : '0', Math.round(c.amount - c.cost)]) },
      { title: 'ยอดขายรายวัน', cols: ['วันที่', 'จำนวน', 'ยอดเงิน'], rows: dailyArr.map(d => [d.day, d.qty, Math.round(d.amount)]) },
      { title: 'ABC analysis', cols: ['กลุ่ม', 'สินค้า', 'ยอดเงิน', 'สะสม%'], rows: abc.map(p => [p.cls, p.name, Math.round(p.amount), p.cumPct.toFixed(1)]) },
      { title: 'อายุสต็อก/ความเร็วขาย', cols: ['สินค้า', 'คงเหลือ', 'ขาย/วัน', 'พออีก(วัน)', 'อายุ(วัน)', 'turnover', 'ต้องสั่งด่วน'], rows: aging.map(({ p, age, onHand, turnover, velocity, daysLeft, urgent }) => [p.name, onHand, velocity > 0 ? velocity.toFixed(2) : '0', daysLeft == null ? '' : Math.round(daysLeft), age == null ? '' : age, turnover.toFixed(2), urgent ? 'ใช่' : '']) },
      { title: 'มูลค่าจมตามอายุสต็อก', cols: ['ช่วงอายุ', 'จำนวนล็อต', 'มูลค่าต้นทุน'], rows: [...ageBuckets.map(b => [b.label, b.count, Math.round(b.value)]), ...(unknownCount > 0 ? [['ไม่ทราบอายุ', unknownCount, Math.round(unknownValue)]] : [])] },
      { title: 'สินค้าค้าง (ขาย 0 แต่มีสต็อก)', cols: ['สินค้า', 'คงเหลือ', 'อายุ(วัน)', 'มูลค่าจม'], rows: deadStock.map(({ p, onHand, value, age }) => [p.name, onHand, age == null ? '' : age, Math.round(value)]) },
      { title: 'มูลค่าคลังตามเวลา', cols: ['วันที่', 'จำนวน', 'มูลค่า'], rows: (snaps || []).map(s => [s.date, s.units, Math.round(Number(s.value) || 0)]) },
      { title: 'ประวัติการขาย', cols: ['วันที่', 'สินค้า', 'รายการ', 'จำนวน', 'ยอดเงิน', 'กำไร'], rows: rows.map(s => [s.day, s.productName, s.lines.map(l => `${l.color} ${l.size}x${l.qty}`).join('; '), Number(s.totalQty) || 0, Math.round(Number(s.totalAmount) || 0), Math.round((Number(s.totalAmount) || 0) - (Number(s.totalCost) || 0))]) },
    ];
    downloadCSV(`tmk-sales-report-${todayISO()}.csv`, blocks);
    logAudit({ action: 'export', entityType: 'data', entityName: 'รายงานการขาย', summary: `ส่งออกรายงานการขาย (${rangeLabel}) เป็น CSV` });
    if (window.__toast) window.__toast('ส่งออก CSV เรียบร้อย', 'success');
  };

  const KPI = ({ label, value, color }) => <div><div className="cap">{label}</div><div className="num kpi-value" style={{ color }}>{value}</div></div>;

  return (
    <div className="content-inner rise">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3><span style={{ color: 'var(--accent)' }}><Icon name="sales" /></span> รายงานการขาย</h3>
          <div className="row" style={{ gap: 6 }}>
            <div className="segbar">{ranges.map(([id, l]) => <button key={id} className={'seg' + (range === id ? ' active' : '')} onClick={() => setRange(id)}>{l}</button>)}</div>
            <button className="btn btn-sm btn-ghost" disabled={!rows.length} onClick={exportCSV} title="ส่งออกรายงานเป็น CSV"><Icon name="external" /> CSV</button>
          </div>
        </div>
        {sales === null
          ? <div className="cap" style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }}>กำลังโหลดประวัติการขาย…</div>
          : rows.length === 0
            ? <div style={{ textAlign: 'center', padding: 24 }}>
                <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 8 }}>ยังไม่มีประวัติการขายในช่วงนี้</div>
                <button className="btn btn-sm" onClick={() => window.__goSection?.('catalog', 'stock')}><Icon name="grid" /> ไปหน้าสต็อก/คลัง เพื่อบันทึกการขาย</button>
              </div>
            : (
              <div className="row" style={{ gap: 26, flexWrap: 'wrap' }}>
                <KPI label="รวมขาย" value={<>{N(totalQty)} <span className="cap" style={{ fontWeight: 400 }}>ตัว</span></>} />
                <KPI label="ยอดเงิน" value={B(totalAmount)} />
                <KPI label="ต้นทุน" value={B(totalCost)} color="var(--ink-3)" />
                <KPI label="กำไร" value={B(totalProfit)} color={totalProfit >= 0 ? 'var(--good)' : 'var(--bad)'} />
                <KPI label="มาร์จิ้น" value={P(margin)} color={totalProfit >= 0 ? 'var(--good)' : 'var(--bad)'} />
                <KPI label="จำนวนบิล" value={N(rows.length)} />
              </div>
            )}
      </div>

      {/* กราฟมูลค่าคลังตามเวลา (ไม่ขึ้นกับยอดขาย — โชว์เมื่อมี snapshot) */}
      {snaps.length > 1 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="row between" style={{ marginBottom: 10 }}>
            <div className="eyebrow">มูลค่าคลังตามเวลา</div>
            <div className="cap">ล่าสุด <b style={{ color: 'var(--ink)' }}>{B(snapVals[snapVals.length - 1])}</b></div>
          </div>
          <MiniArea data={snapVals} labels={snapLabels} h={120} color="var(--good)" id="rep-invval" fmt={B} metricLabel="มูลค่าคลัง" />
        </div>
      )}

      {sales !== null && rows.length > 0 && (<>
        {/* กราฟยอดขายรายวัน + รายเดือน */}
        <div className="grid g2" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 10 }}>ยอดขายรายวัน ({rangeLabel})</div>
            <MiniArea data={dailyArr.map(d => d.amount)} labels={dailyArr.map(d => dailyLabel(d.day))} h={120} color="var(--accent)" id="rep-daily" fmt={B} metricLabel="ยอดขาย" />
          </div>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 10 }}>ยอดขายรายเดือน (8 เดือนล่าสุด)</div>
            {monthlyArr.length ? <Bars data={monthlyArr} h={140} color="var(--accent-2)" labelKey="m" valueKey="rev" fmt={B} /> : <div className="cap" style={{ color: 'var(--ink-4)', padding: '30px 0', textAlign: 'center' }}>ยังไม่มีข้อมูล</div>}
          </div>
        </div>

        {/* A1: ยอดขายแยกช่องทาง */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="row between" style={{ marginBottom: 14 }}>
            <div className="eyebrow">ยอดขายแยกช่องทาง</div>
            <div className="cap">{channelKnownCount > 0 ? `${channelKnownCount} ช่องทาง` : 'ยังไม่ได้ระบุช่องทาง'}</div>
          </div>
          {channelKnownCount === 0 ? (
            <div className="cap" style={{ color: 'var(--ink-4)' }}>ออเดอร์ยังไม่ได้ระบุช่องทาง — เลือก/พิมพ์ช่องทางตอนเปิดออเดอร์ จะเห็นยอดแยก Shopee / Lazada / Facebook / LINE / TikTok / หน้าร้าน ฯลฯ</div>
          ) : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>ช่องทาง</th><th style={{ textAlign: 'right' }}>ขาย</th><th style={{ textAlign: 'right' }}>ยอดเงิน</th><th style={{ minWidth: 130 }}>สัดส่วน</th><th style={{ textAlign: 'right' }}>กำไร</th></tr></thead>
              <tbody>{channelRank.map(c => { const share = totalAmount > 0 ? (c.amount / totalAmount) * 100 : 0; const pf = c.amount - c.cost; return (
                <tr key={c.key}>
                  <td><div className="row" style={{ gap: 8, alignItems: 'center' }}><span style={{ width: 11, height: 11, borderRadius: 3, background: c.hex, border: '1px solid var(--line)', flexShrink: 0 }} /><span style={{ fontWeight: 600, color: c.none ? 'var(--ink-4)' : 'var(--ink)' }}>{c.name}</span></div></td>
                  <td className="num" style={{ textAlign: 'right' }}>{N(c.qty)}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{B(c.amount)}</td>
                  <td><div className="row" style={{ gap: 8, alignItems: 'center' }}><div className="bar" style={{ flex: 1 }}><span style={{ width: `${(c.amount / maxChannelAmt) * 100}%`, background: c.hex }} /></div><span className="num cap" style={{ width: 36, textAlign: 'right' }}>{P(share, 0)}</span></div></td>
                  <td className="num" style={{ textAlign: 'right', color: pf >= 0 ? 'var(--good)' : 'var(--bad)' }}>{c.cost > 0 ? B(pf) : '—'}</td>
                </tr>
              ); })}</tbody>
            </table></div>
          )}
        </div>

        {/* สินค้าขายดี + กำไร */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>สินค้าขายดี</div>
          <div className="table-wrap"><table className="table">
            <thead><tr><th style={{ width: 34 }}>#</th><th>สินค้า</th><th style={{ textAlign: 'right' }}>ขายแล้ว</th><th style={{ textAlign: 'right' }}>ยอดเงิน</th><th style={{ textAlign: 'right' }}>กำไร</th></tr></thead>
            <tbody>
              {productRank.map((p, i) => { const prod = prodById[p.id]; const profit = p.amount - p.cost; return (
                <tr key={p.id || p.name} onClick={() => prod && window.__openModal('product', prod)} style={{ cursor: prod ? 'pointer' : 'default' }}>
                  <td className="num faint" style={{ fontWeight: 700 }}>{i + 1}</td>
                  <td><div className="row" style={{ gap: 10 }}>
                    <span style={{ width: 30, height: 30, borderRadius: 7, flexShrink: 0, overflow: 'hidden', background: 'var(--surface-2)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center' }}>{prod?.image ? <img src={prod.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: 'var(--ink-4)' }}><Icon name="bag" /></span>}</span>
                    <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>{p.name}</div>{prod?.category && <div className="cap">{prod.category}</div>}</div>
                  </div></td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{N(p.qty)}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{B(p.amount)}</td>
                  <td className="num" style={{ textAlign: 'right', color: profit >= 0 ? 'var(--good)' : 'var(--bad)', fontWeight: 600 }}>{p.cost > 0 ? B(profit) : '—'}</td>
                </tr>
              ); })}
            </tbody>
          </table></div>
        </div>

        {/* ไซส์ + สี ขายดี */}
        <div className="grid g2" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 14 }}>ไซส์ขายดี</div>
            {sizeRank.map(s => (
              <div key={s.label} className="row" style={{ gap: 10, marginBottom: 9 }}>
                <span className="sm" style={{ width: 42, fontWeight: 700 }}>{s.label}</span>
                <div className="bar" style={{ flex: 1 }}><span style={{ width: `${(s.qty / maxSize) * 100}%`, background: 'var(--accent)' }}></span></div>
                <span className="num sm" style={{ width: 46, textAlign: 'right', fontWeight: 700 }}>{N(s.qty)}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 14 }}>สีขายดี</div>
            {colorRank.map(c => (
              <div key={c.name} className="row" style={{ gap: 10, marginBottom: 9 }}>
                <span style={{ width: 16, height: 16, borderRadius: 4, background: hexByColor[c.name] || '#ccc', border: '1px solid var(--line)', flexShrink: 0 }}></span>
                <span className="sm" style={{ flex: '0 0 64px' }}>{c.name}</span>
                <div className="bar" style={{ flex: 1 }}><span style={{ width: `${(c.qty / maxColor) * 100}%`, background: 'var(--accent)' }}></span></div>
                <span className="num sm" style={{ width: 46, textAlign: 'right', fontWeight: 700 }}>{N(c.qty)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* กำไรตามหมวดหมู่ + สินค้าค้าง/ขายช้า */}
        <div className="grid g2" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 14 }}>กำไรตามหมวดหมู่</div>
            {catRank.length === 0 ? <div className="cap" style={{ color: 'var(--ink-4)' }}>—</div> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>หมวดหมู่</th><th style={{ textAlign: 'right' }}>ขาย</th><th style={{ textAlign: 'right' }}>ยอดเงิน</th><th style={{ textAlign: 'right' }}>กำไร</th></tr></thead>
                <tbody>{catRank.map(c => { const pf = c.amount - c.cost; return (
                  <tr key={c.name}><td>{c.name}</td><td className="num" style={{ textAlign: 'right' }}>{N(c.qty)}</td><td className="num" style={{ textAlign: 'right' }}>{B(c.amount)}</td><td className="num" style={{ textAlign: 'right', color: pf >= 0 ? 'var(--good)' : 'var(--bad)' }}>{c.cost > 0 ? B(pf) : '—'}</td></tr>
                ); })}</tbody>
              </table></div>
            )}
          </div>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 14 }}>สินค้าค้าง / ขายช้า <span className="cap" style={{ fontWeight: 400 }}>(sell-through)</span></div>
            {sellThrough.length === 0 ? <div className="cap" style={{ color: 'var(--ink-4)' }}>ไม่มีสินค้าคงเหลือ</div> : (
              <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}><table className="table">
                <thead><tr><th>สินค้า</th><th style={{ textAlign: 'right' }}>ขาย</th><th style={{ textAlign: 'right' }}>เหลือ</th><th style={{ textAlign: 'right' }}>sell-through</th></tr></thead>
                <tbody>{sellThrough.slice(0, 30).map(({ p, sold, onHand, pct }) => (
                  <tr key={p.id} onClick={() => window.__openModal('product', p)} style={{ cursor: 'pointer' }}>
                    <td><span style={{ fontWeight: 600 }}>{p.name}</span>{sold === 0 && <span className="chip chip-bad" style={{ marginLeft: 6 }}>ค้าง</span>}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{N(sold)}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{N(onHand)}</td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 700, color: pct >= 50 ? 'var(--good)' : pct > 0 ? 'var(--warn)' : 'var(--bad)' }}>{P(pct, 0)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        </div>

        {/* ABC analysis + อายุสต็อก/หมุนเวียน */}
        <div className="grid g2" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="row between" style={{ marginBottom: 14 }}>
              <div className="eyebrow">ABC analysis <span className="cap" style={{ fontWeight: 400 }}>(80/20)</span></div>
              <div className="cap">A:{abcCount.A} · B:{abcCount.B} · C:{abcCount.C}</div>
            </div>
            {abc.length === 0 ? <div className="cap" style={{ color: 'var(--ink-4)' }}>ยังไม่มียอดขาย</div> : (
              <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}><table className="table">
                <thead><tr><th>กลุ่ม</th><th>สินค้า</th><th style={{ textAlign: 'right' }}>ยอดเงิน</th><th style={{ textAlign: 'right' }}>สะสม%</th></tr></thead>
                <tbody>{abc.map(p => (
                  <tr key={p.id || p.name}>
                    <td><span className={`chip ${abcChip[p.cls]}`} style={{ fontWeight: 700 }}>{p.cls}</span></td>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{B(p.amount)}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{P(p.cumPct, 0)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
          <div className="card">
            <div className="row between" style={{ marginBottom: 14 }}>
              <div className="eyebrow">อายุสต็อก / ความเร็วขาย</div>
              {urgentCount > 0 && <span className="chip chip-bad" style={{ fontWeight: 700 }}>ต้องสั่งด่วน {N(urgentCount)}</span>}
            </div>
            {aging.length === 0 ? <div className="cap" style={{ color: 'var(--ink-4)' }}>ไม่มีสินค้าคงเหลือ</div> : (
              <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}><table className="table">
                <thead><tr><th>สินค้า</th><th style={{ textAlign: 'right' }}>เหลือ</th><th style={{ textAlign: 'right' }}>ขาย/วัน</th><th style={{ textAlign: 'right' }}>พออีก</th><th style={{ textAlign: 'right' }}>อายุ</th></tr></thead>
                <tbody>{aging.slice(0, 30).map(({ p, age, onHand, velocity, daysLeft, urgent }) => (
                  <tr key={p.id} onClick={() => window.__openModal('product', p)} style={{ cursor: 'pointer' }}>
                    <td><span style={{ fontWeight: 600 }}>{p.name}</span>{urgent && <span className="chip chip-bad" style={{ marginLeft: 6 }}>สั่งด่วน</span>}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{N(onHand)}</td>
                    <td className="num" style={{ textAlign: 'right', color: velocity > 0 ? 'var(--ink)' : 'var(--ink-4)' }}>{velocity > 0 ? velocity.toFixed(velocity < 1 ? 2 : 1) : '—'}</td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: daysLeft != null && daysLeft <= 30 ? 700 : 400, color: daysLeft == null ? 'var(--ink-4)' : daysLeft <= 14 ? 'var(--bad)' : daysLeft <= 30 ? 'var(--warn)' : 'var(--good)' }}>{daysLeft == null ? '—' : daysLeft >= 999 ? '999+' : `${Math.round(daysLeft)} วัน`}</td>
                    <td className="num" style={{ textAlign: 'right', color: age != null && age > 90 ? 'var(--bad)' : age != null && age > 60 ? 'var(--warn)' : 'var(--ink-3)' }}>{age == null ? '—' : `${age}d`}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        </div>

        {/* rank5: Dead stock / มูลค่าจมตามอายุ */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="row between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div className="eyebrow">สินค้าค้าง / มูลค่าจมตามอายุสต็อก</div>
            <div className="cap">ต้นทุนในคลังรวม <b style={{ color: 'var(--ink)' }}>{B(totalStockCost)}</b> · เสี่ยงจม (91+ วัน) <b style={{ color: stuckValue > 0 ? 'var(--bad)' : 'var(--ink-3)' }}>{B(stuckValue)}</b>{unknownValue > 0 && <> · ไม่ทราบอายุ <b style={{ color: 'var(--ink-3)' }}>{B(unknownValue)}</b></>}</div>
          </div>
          <div className="grid g4" style={{ gap: 10, marginBottom: deadStock.length ? 14 : 0 }}>
            {ageBuckets.map(b => (
              <div key={b.label} style={{ padding: '10px 12px', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                <div className="cap" style={{ color: 'var(--ink-3)' }}>{b.label}</div>
                <div className="num" style={{ fontSize: 17, fontWeight: 700, color: b.tone }}>{B(b.value)}</div>
                <div className="cap" style={{ color: 'var(--ink-4)' }}>{N(b.count)} ล็อต</div>
              </div>
            ))}
          </div>
          {deadStock.length > 0 && (<>
            <div className="row between" style={{ marginBottom: 8 }}>
              <div className="cap" style={{ color: 'var(--ink-3)' }}>ขายไม่ออกในช่วงนี้ (ขาย 0) — มูลค่าจม {B(deadValue)}</div>
              <span className="chip chip-bad">{N(deadStock.length)} รายการ</span>
            </div>
            <div className="table-wrap" style={{ maxHeight: 240, overflowY: 'auto' }}><table className="table">
              <thead><tr><th>สินค้า</th><th style={{ textAlign: 'right' }}>คงเหลือ</th><th style={{ textAlign: 'right' }}>อายุ</th><th style={{ textAlign: 'right' }}>มูลค่าจม</th></tr></thead>
              <tbody>{deadStock.slice(0, 30).map(({ p, onHand, value, age }) => (
                <tr key={p.id} onClick={() => window.__openModal('product', p)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 600 }}>{p.name}{p.category && <span className="chip" style={{ marginLeft: 6, fontWeight: 400 }}>{p.category}</span>}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{N(onHand)}</td>
                  <td className="num" style={{ textAlign: 'right', color: age != null && age > 90 ? 'var(--bad)' : 'var(--ink-3)' }}>{age == null ? '—' : `${age}d`}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--bad)' }}>{B(value)}</td>
                </tr>
              ))}</tbody>
            </table></div>
            {deadStock.length > 30 && <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 8 }}>แสดง 30 รายการมูลค่าจมสูงสุด จากทั้งหมด {N(deadStock.length)} รายการ</div>}
          </>)}
        </div>

        {/* ประวัติการขายล่าสุด */}
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 14 }}>ประวัติการขายล่าสุด</div>
          <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}><table className="table">
            <thead><tr><th>วันที่</th><th>สินค้า</th><th>รายการ</th><th style={{ textAlign: 'right' }}>จำนวน</th><th style={{ textAlign: 'right' }}>ยอดเงิน</th></tr></thead>
            <tbody>
              {rows.slice(0, 50).map((s, i) => (
                <tr key={i}>
                  <td className="cap" style={{ whiteSpace: 'nowrap' }}>{thaiDate(s.day) || s.day}</td>
                  <td style={{ fontWeight: 600 }}>{s.productName}</td>
                  <td className="cap">{s.lines.map(l => `${l.color} ${l.size}×${l.qty}`).join(', ')}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{N(Number(s.totalQty) || 0)}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{B(Number(s.totalAmount) || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {rows.length > 50 && <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 8 }}>แสดง 50 รายการล่าสุด จากทั้งหมด {N(rows.length)} บิล</div>}
        </div>
      </>)}
    </div>
  );
}

/* ====================  ORDERS (Kanban) + CUSTOMERS  ==================== */
// พิมพ์ใบเสร็จ/ใบส่งของ (iframe print + บาร์โค้ดโค้ดออเดอร์)
function printReceipt(order) {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = (order.items || []).map(it => `<tr><td>${esc(it.name)} · ${esc(it.color)} ${esc(it.size)}</td><td style="text-align:center">${it.qty}</td><td style="text-align:right">${B(it.price)}</td><td style="text-align:right">${B((it.qty || 0) * (it.price || 0))}</td></tr>`).join('');
  const bc = barcodeSVGString(order.code, { height: 38, module: 1.3 });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(order.code)}</title><style>
    *{font-family:'Sarabun','Noto Sans Thai',system-ui,sans-serif;box-sizing:border-box}
    body{margin:0;padding:14px;max-width:340px} h2{margin:0;font-size:18px;text-align:center}
    .sub{text-align:center;font-size:11px;color:#555;margin-bottom:8px}
    table{width:100%;border-collapse:collapse;font-size:12px;margin:8px 0} td,th{padding:3px 2px;border-bottom:1px solid #eee;text-align:left}
    .tot{display:flex;justify-content:space-between;font-size:13px;margin-top:3px} .tot.big{font-weight:800;font-size:16px;border-top:1px solid #333;padding-top:4px;margin-top:4px}
    .cust{font-size:12px;margin:6px 0} .bc{text-align:center;margin-top:10px} .bc svg{max-width:100%}
    @media print{@page{margin:6mm}}
  </style></head><body>
    <h2>TMK — ใบเสร็จ / ใบส่งของ</h2><div class="sub">${esc(order.code)} · ${new Date(order.createdAt || Date.now()).toLocaleDateString('th-TH')}</div>
    <div class="cust"><b>ลูกค้า:</b> ${esc(order.customerName || '-')}</div>
    <table><thead><tr><th>รายการ</th><th style="text-align:center">จำนวน</th><th style="text-align:right">ราคา</th><th style="text-align:right">รวม</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="tot"><span>รวม</span><span>${B(order.subtotal)}</span></div>
    ${order.discount ? `<div class="tot"><span>ส่วนลด</span><span>-${B(order.discount)}</span></div>` : ''}
    <div class="tot big"><span>ยอดสุทธิ</span><span>${B(order.total)}</span></div>
    ${order.note ? `<div class="cust" style="margin-top:8px;color:#555">โน้ต: ${esc(order.note)}</div>` : ''}
    <div class="bc">${bc}<div style="font-family:monospace;font-size:10px">${esc(order.code)}</div></div>
  </body></html>`;
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document; doc.open(); doc.write(html); doc.close();
  setTimeout(() => { try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch { /* ignore */ } setTimeout(() => iframe.remove(), 1500); }, 350);
}

function OrdersView() {
  const orders = DD.orders || [];
  const [dragId, setDragId] = useState(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [showShippedAll, setShowShippedAll] = useState(false); // โชว์ "ส่งแล้ว" เก่ากว่า 7 วันหรือไม่
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();

  // จำกัด "ส่งแล้ว" ให้เหลือ 7 วันล่าสุด — กันคอลัมน์ยาวหลายร้อยใบ + ออเดอร์ active หายเมื่อทะลุ 500
  const cutoff = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const matchSearch = (o) => !ql || `${o.code || ''} ${o.customerName || ''} ${o.trackingNo || ''}`.toLowerCase().includes(ql);
  // วันที่ส่งจริงจาก status log (ไม่มี field shippedDate) — fallback เป็นวันที่สร้างถ้าไม่มี log
  const shipDate = (o) => ((o.statusLog || []).filter(x => x.status === 'shipped').map(x => x.at).sort().pop() || o.createdAt || '');
  const isRecentShipped = (o) => shipDate(o).slice(0, 10) >= cutoff;
  const visible = orders.filter(o =>
    o.status !== 'cancelled' &&
    matchSearch(o) &&
    (o.status !== 'shipped' || showShippedAll || isRecentShipped(o))
  );
  const active = visible;
  const shippedHidden = orders.filter(o => o.status === 'shipped' && !isRecentShipped(o) && matchSearch(o)).length;
  const cancelled = orders.filter(o => o.status === 'cancelled' && matchSearch(o));
  const copyTrack = (o) => { try { navigator.clipboard.writeText(`${location.origin}${location.pathname}?track=${o.code}`); window.__toast?.('คัดลอกลิงก์ติดตามแล้ว — ส่งให้ลูกค้าได้เลย', 'success'); } catch { window.__toast?.('คัดลอกไม่ได้', 'error'); } };
  // เปลี่ยนสถานะออเดอร์ — เช็คสิทธิ์ + ยืนยันก่อน action ที่กู้ไม่ได้ (ส่งแล้ว=ตัดสต็อก, ยกเลิก=คืนจอง)
  const changeStatus = (o, status) => {
    if (!o || o.status === status) return;
    if (!guardEdit()) return;
    // กันสต็อกหาย: ออเดอร์ที่ "ส่งแล้ว" ตัดสต็อกไปแล้ว — ย้อนสถานะกลับไม่ได้ (ระบบไม่คืนสต็อกอัตโนมัติ)
    if (o.status === 'shipped') { window.alert(`ออเดอร์ ${o.code} "ส่งแล้ว" — เปลี่ยนสถานะไม่ได้\nสต็อกถูกตัดไปแล้ว ถ้าต้องการคืนสต็อกให้ใช้ "ปรับสต็อก" ที่สินค้า`); return; }
    if (status === 'shipped' && !window.confirm(`ยืนยัน "ส่งแล้ว" ออเดอร์ ${o.code}?\nระบบจะตัดสต็อกจริงตามออเดอร์นี้ (กู้คืนไม่ได้)`)) return;
    if (status === 'cancelled' && !window.confirm(`ยกเลิกออเดอร์ ${o.code}?\nระบบจะปล่อยสต็อกที่จองคืน`)) return;
    advanceOrderStatus(o, status);
  };
  const onDrop = (status) => { const o = orders.find(x => x.id === dragId); setDragId(null); changeStatus(o, status); };

  return (
    <div className="content-inner rise">
      <div className="row between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ margin: 0 }}><span style={{ color: 'var(--accent)' }}><Icon name="listChecks" /></span> ออเดอร์ {active.length > 0 && <span className="cap" style={{ fontWeight: 400 }}>({active.length})</span>}</h3>
        <button className="btn btn-sm btn-primary" onClick={() => window.__openModal('order')}><Icon name="plus" /> สร้างออเดอร์</button>
      </div>
      {orders.length > 0 && (
        <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 ค้นหา รหัสออเดอร์ / ลูกค้า / tracking" style={{ flex: '1 1 220px' }} />
          {shippedHidden > 0 && (
            <button className="btn btn-sm" onClick={() => setShowShippedAll(s => !s)} style={{ flex: '0 0 auto' }}>
              <Icon name="eye" /> {showShippedAll ? 'ซ่อน' : 'ดู'}ส่งแล้วทั้งหมด ({shippedHidden})
            </button>
          )}
        </div>
      )}
      {orders.length === 0
        ? <div className="card"><div className="cap" style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }}>ยังไม่มีออเดอร์ — กด "สร้างออเดอร์" เพื่อเริ่ม (จองสต็อกอัตโนมัติ + ลูกค้าติดตามสถานะได้)</div></div>
        : (
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
            {ORDER_STATUSES.map(col => {
              const list = active.filter(o => o.status === col.id);
              return (
                <div key={col.id} onDragOver={e => e.preventDefault()} onDrop={() => onDrop(col.id)} style={{ flex: '0 0 240px', minWidth: 240, background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: 8 }}>
                  <div className="row between" style={{ marginBottom: 8, padding: '2px 4px' }}><span style={{ fontWeight: 700, color: col.color }}>{col.label}</span><span className="cap">{list.length}</span></div>
                  {list.map(o => (
                    <div key={o.id} draggable onDragStart={() => setDragId(o.id)} onDragEnd={() => setDragId(null)} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-xs)', padding: '8px 10px', marginBottom: 7, cursor: 'grab', borderLeft: `3px solid ${col.color}` }}>
                      <div className="row between"><span style={{ fontWeight: 700, fontSize: 'var(--fs-sm)', cursor: 'pointer' }} onClick={() => window.__openModal('order', o)}>{o.code}</span><span className="num" style={{ fontWeight: 700 }}>{B(o.total)}</span></div>
                      <div className="cap" style={{ margin: '2px 0' }}>{o.customerName || '-'} · {N(o.qty)} ตัว</div>
                      <div className="cap" style={{ color: 'var(--ink-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(o.items || []).slice(0, 2).map(it => `${it.color} ${it.size}×${it.qty}`).join(', ')}{(o.items || []).length > 2 ? '…' : ''}{o.trackingNo ? ` · 📦${o.trackingNo}` : ''}</div>
                      <div className="row" style={{ gap: 4, marginTop: 6, alignItems: 'stretch' }}>
                        <select className="input" style={{ flex: 1, padding: '3px 4px', fontSize: 'var(--fs-cap)', height: 'auto' }} value={o.status} onChange={e => changeStatus(o, e.target.value)} title="เปลี่ยนสถานะ">
                          {ORDER_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                          <option value="cancelled">ยกเลิก</option>
                        </select>
                        <button className="btn btn-sm btn-ghost" style={{ padding: '2px 7px' }} onClick={() => copyTrack(o)} title="คัดลอกลิงก์ติดตามให้ลูกค้า"><Icon name="route" /></button>
                        <button className="btn btn-sm btn-ghost" style={{ padding: '2px 7px' }} onClick={() => printReceipt(o)} title="พิมพ์ใบเสร็จ/ใบส่งของ"><Icon name="external" /></button>
                      </div>
                    </div>
                  ))}
                  {list.length === 0 && <div className="cap" style={{ textAlign: 'center', color: 'var(--ink-5,var(--ink-4))', padding: '14px 0' }}>ลากการ์ดมาที่นี่</div>}
                </div>
              );
            })}
          </div>
        )}
      {cancelled.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="row between" style={{ cursor: 'pointer' }} onClick={() => setShowCancelled(s => !s)}><span className="eyebrow">ยกเลิก ({cancelled.length})</span><Icon name={showCancelled ? 'chevD' : 'chevR'} /></div>
          {showCancelled && cancelled.map(o => (
            <div key={o.id} className="row between" style={{ padding: '6px 0', borderTop: '1px solid var(--line)' }}>
              <span className="cap"><b>{o.code}</b> · {o.customerName} · {N(o.qty)} ตัว</span><span className="cap">{B(o.total)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomersView() {
  const customers = DD.customers || []; // 150 รายล่าสุดที่โหลดอยู่ (เกินกว่านั้นใช้ค้นหา)
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState(null); // ผลค้นหาจาก server (ครอบคลุมลูกค้านอกชุดล่าสุด)
  const [searching, setSearching] = useState(false);
  const [sort, setSort] = useState('spent'); // spent | orders | recent
  const [pageLimit, setPageLimit] = useState(50); // pagination ฝั่ง UI
  const ql = q.trim();

  // ค้นหาฝั่ง server (debounce 250ms) — กรณีลูกค้าจริงเกิน 150 ราย จะหาเจอนอกชุด
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading/clear flag ก่อน async fetch (จำเป็น)
    if (!ql) { setRemote(null); setSearching(false); return; }
    setSearching(true);
    let alive = true; // กันผลค้นหาเก่ามาทับผลใหม่ (out-of-order async)
    const id = setTimeout(async () => {
      try {
        // sanitize: comma/วงเล็บ ทำ grammar ของ PostgREST .or() พัง → 400 (เคยคืน [] เงียบ). ตัดทิ้งก่อน interpolate
        const safe = ql.replace(/[,()]/g, ' ').trim();
        if (!safe) { if (alive) setRemote([]); return; }
        const { data, error } = await supabase.from('tmk_customers')
          .select('id,code,name,phone,line,address,note,created_at')
          .or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,line.ilike.%${safe}%`)
          .limit(100);
        if (error) { if (alive) setRemote([]); return; } // อย่ากลืน 400 เป็น "ไม่พบ" เงียบ
        const rows = data || [];
        // enrich ยอดสะสมจาก view เดียวกับ dataContext → ลูกค้านอกชุดล่าสุดจะได้ยอดจริง ไม่ใช่ ฿0/0 ออเดอร์ + normalize createdAt (กัน sort recent พัง)
        const totals = {};
        if (rows.length) {
          const { data: ct } = await supabase.from('tmk_customer_totals')
            .select('customer_id,order_count,total_spent').in('customer_id', rows.map(r => r.id));
          (ct || []).forEach(t => { if (t.customer_id) totals[t.customer_id] = { orderCount: Number(t.order_count || 0), totalSpent: Number(t.total_spent || 0) }; });
        }
        const enriched = rows.map(c => ({ ...c, createdAt: c.created_at, orderCount: totals[c.id]?.orderCount || 0, totalSpent: totals[c.id]?.totalSpent || 0 }));
        if (alive) setRemote(enriched);
      } catch { if (alive) setRemote([]); }
      finally { if (alive) setSearching(false); }
    }, 250);
    return () => { alive = false; clearTimeout(id); };
  }, [ql]);

  // สร้างลิสต์: ถ้ามีคำค้น → รวม local+remote dedup; ไม่มีคำค้น → ใช้ local อย่างเดียว
  const baseList = useMemo(() => {
    if (!ql) return customers;
    const byId = new Map();
    // remote ก่อน, local ทับทีหลัง → ลูกค้าที่อยู่ในชุด local (มียอดซื้อ/ออเดอร์จริง) ชนะ
    // กัน remote raw row (ไม่มี totalSpent/orderCount) มาทับให้โชว์ ฿0
    [...(remote || []), ...customers].forEach(c => byId.set(c.id, c));
    const qLower = ql.toLowerCase();
    return [...byId.values()].filter(c => `${c.name || ''} ${c.phone || ''} ${c.line || ''}`.toLowerCase().includes(qLower));
  }, [customers, remote, ql]);
  const sorters = {
    spent:  (a, b) => (b.totalSpent || 0) - (a.totalSpent || 0),
    orders: (a, b) => (b.orderCount || 0) - (a.orderCount || 0),
    recent: (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
  };
  const sorted = useMemo(() => [...baseList].sort(sorters[sort]), [baseList, sort]);
  const shown = sorted.slice(0, pageLimit);

  return (
    <div className="content-inner rise">
      <div className="card">
        <div className="card-head">
          <h3><span style={{ color: 'var(--accent)' }}><Icon name="users" /></span> ลูกค้า {baseList.length > 0 && <span className="cap" style={{ fontWeight: 400 }}>({N(baseList.length)}{!ql && customers.length >= 150 ? '+' : ''})</span>}</h3>
          <button className="btn btn-sm btn-primary" onClick={() => window.__openModal('customer')}><Icon name="userPlus" /> เพิ่มลูกค้า</button>
        </div>
        {(customers.length > 0 || ql) && (
          <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <input className="input" value={q} onChange={e => { setQ(e.target.value); setPageLimit(50); }} placeholder="🔍 ค้นหา ชื่อ / เบอร์ / LINE" style={{ flex: '1 1 200px' }} />
            <select className="input" value={sort} onChange={e => setSort(e.target.value)} style={{ flex: '0 0 auto', minWidth: 120 }}>
              <option value="spent">ยอดซื้อสูง</option>
              <option value="orders">ออเดอร์เยอะ</option>
              <option value="recent">เพิ่มล่าสุด</option>
            </select>
            {searching && <span className="cap" style={{ color: 'var(--ink-4)', alignSelf: 'center' }}>กำลังค้นหา…</span>}
          </div>
        )}
        {baseList.length === 0
          ? <div className="cap" style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }}>{ql ? `ไม่พบลูกค้า "${ql}"` : 'ยังไม่มีลูกค้า — เพิ่มเอง หรือระบบสร้างให้ตอนทำออเดอร์'}</div>
          : <>
            <div className="table-wrap table-sticky-first"><table className="table">
              <thead><tr><th>ลูกค้า</th><th>ติดต่อ</th><th style={{ textAlign: 'right' }}>ออเดอร์</th><th style={{ textAlign: 'right' }}>ยอดซื้อรวม</th></tr></thead>
              <tbody>{shown.map(c => (
                <tr key={c.id} onClick={() => window.__openModal('customer', c)} style={{ cursor: 'pointer' }}>
                  <td><div style={{ fontWeight: 600 }}>{c.name}</div>{c.address && <div className="cap">{c.address}</div>}</td>
                  <td className="cap">{[c.phone, c.line && ('LINE ' + c.line)].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{N(c.orderCount || 0)}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{B(c.totalSpent || 0)}</td>
                </tr>
              ))}</tbody>
            </table></div>
            {sorted.length > pageLimit && (
              <div className="row" style={{ justifyContent: 'center', padding: '12px 0' }}>
                <button className="btn btn-sm" onClick={() => setPageLimit(l => l + 50)}>แสดงเพิ่ม ({N(sorted.length - pageLimit)} คน)</button>
              </div>
            )}
          </>}
      </div>
    </div>
  );
}

function CampaignsView() {
  const { reload } = useData() || {};
  const stMeta = { live: { l: 'กำลังดำเนินการ', cls: 'chip-good' }, upcoming: { l: 'กำลังจะมา', cls: 'chip-accent' }, paused: { l: 'หยุดชั่วคราว', cls: 'chip-warn' }, cancelled: { l: 'ยกเลิก', cls: '' }, done: { l: 'จบแล้ว', cls: '' } };
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const campaigns = DD.campaigns || [];

  // ลบแคมเปญ — ตรวจว่ามี task ผูกอยู่ก่อน
  const deleteCampaign = async (c) => {
    if (!guardEdit()) return;
    const linkedTasks = (DD.tasks || []).filter(t => t.camp === c.id).length;
    const msg = linkedTasks > 0
      ? `แคมเปญ "${c.name}" มี ${linkedTasks} งานผูกอยู่ — ลบจะปลด link ไปไม่มีแคมเปญ ยืนยัน?`
      : `ลบแคมเปญ "${c.name}"?`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      // ปลด link tasks (set camp = NULL) ก่อน
      if (linkedTasks > 0) {
        await supabase.from('tmk_tasks').update({ camp: null }).eq('camp', c.id);
      }
      // ลบ campaign → ถังขยะ (soft delete)
      const { error } = await supabase.from('tmk_campaigns').update({ deleted_at: new Date().toISOString() }).eq('id', c.id);
      if (error) throw error;
      logAudit({ action: 'delete', entityType: 'campaign', entityName: c.name, summary: `ลบแคมเปญ "${c.name}"` });
      if (reload) await reload();
      if (window.__toast) window.__toast('ย้ายแคมเปญไปถังขยะแล้ว', 'success');
    } catch (err) {
      if (window.__toast) window.__toast('ลบไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  // เลื่อนแคมเปญ — บันทึก sort_order ไป Supabase
  const reorderCampaign = async (fromId, toId) => {
    if (!guardEdit()) return;
    if (fromId === toId) return;
    const fromIdx = campaigns.findIndex(c => c.id === fromId);
    const toIdx = campaigns.findIndex(c => c.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;

    const reordered = [...campaigns];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    setBusy(true);
    try {
      // อัปเดต sort_order ทุกแคมเปญตาม index ใหม่
      const updates = reordered.map((c, i) =>
        supabase.from('tmk_campaigns').update({ sort_order: i + 1 }).eq('id', c.id)
      );
      const results = await Promise.all(updates);
      const failed = results.find(r => r.error);
      if (failed) {
        // ถ้า column sort_order ไม่มี → แจ้ง user ให้รัน migration
        if (/sort_order/i.test(failed.error.message)) {
          if (window.__toast) window.__toast('ต้อง alter table เพิ่ม sort_order ก่อน — รัน SQL migration ใหม่', 'warn');
        } else throw failed.error;
      } else if (window.__toast) window.__toast('เรียงลำดับใหม่เรียบร้อย', 'success');
      if (reload) await reload();
    } catch (err) {
      if (window.__toast) window.__toast('เลื่อนไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="content-inner rise">
      <div className="row between" style={{ marginBottom: 16 }}>
        <div className="eyebrow">{campaigns.length} แคมเปญ · เรียงลำดับได้ (ลากบนคอม / ปุ่ม ▲▼ บนมือถือ)</div>
        <button className="btn btn-primary" onClick={() => window.__openModal('campaign')}><Icon name="plus" /> สร้างแคมเปญ</button>
      </div>
      <div className="grid g2">
        {campaigns.map((c, idx) => {
          const isOver = dragOver === c.id;
          return (
            <div key={c.id}
              draggable
              onDragStart={() => setDragId(c.id)}
              onDragEnd={() => { setDragId(null); setDragOver(null); }}
              onDragOver={(e) => { e.preventDefault(); if (dragId && dragId !== c.id) setDragOver(c.id); }}
              onDragLeave={() => setDragOver(o => o === c.id ? null : o)}
              onDrop={() => { if (dragId) reorderCampaign(dragId, c.id); setDragId(null); setDragOver(null); }}
              className="card"
              style={{
                borderLeft: `4px solid ${c.color}`,
                cursor: busy ? 'wait' : 'move',
                transition: 'all 0.15s',
                transform: isOver ? 'scale(1.02)' : 'scale(1)',
                boxShadow: isOver ? '0 4px 16px rgba(10,90,160,0.2)' : 'var(--sh-sm)',
                background: isOver ? 'var(--accent-soft)' : undefined,
                opacity: dragId === c.id ? 0.4 : 1,
              }}>
              <div className="row between" style={{ marginBottom: 12 }}>
                <div className="row" style={{ gap: 8, flex: 1, minWidth: 0 }}>
                  <span className="desktop-only" title="ลากเพื่อเรียงลำดับ" style={{ color: 'var(--ink-4)', cursor: 'grab', flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="9" cy="6" r="1.5" fill="currentColor" /><circle cx="9" cy="12" r="1.5" fill="currentColor" /><circle cx="9" cy="18" r="1.5" fill="currentColor" />
                      <circle cx="15" cy="6" r="1.5" fill="currentColor" /><circle cx="15" cy="12" r="1.5" fill="currentColor" /><circle cx="15" cy="18" r="1.5" fill="currentColor" />
                    </svg>
                  </span>
                  {/* มือถือลากไม่ได้ → stepper ▲▼ แนวตั้ง (กะทัดรัด ไม่กินความกว้างชื่อ) */}
                  <span className="mobile-only reorder-stepper" style={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button disabled={idx === 0 || busy} onClick={() => reorderCampaign(c.id, campaigns[idx - 1].id)} aria-label="เลื่อนขึ้น">▲</button>
                    <button disabled={idx === campaigns.length - 1 || busy} onClick={() => reorderCampaign(c.id, campaigns[idx + 1].id)} aria-label="เลื่อนลง">▼</button>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ cursor: 'pointer' }} onClick={() => window.__openModal('campaign', { ...c, channels: c.channels || [] })}>{c.name}</h3>
                    <div className="cap num" style={{ marginTop: 3 }}>{c.start} – {c.end}</div>
                  </div>
                </div>
                <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                  <span className={`chip ${(stMeta[c.status] || stMeta.done).cls}`}>{(stMeta[c.status] || stMeta.done).l}</span>
                  <button className="btn btn-sm btn-ghost" title="แก้ไข" onClick={(e) => { e.stopPropagation(); window.__openModal('campaign', { ...c, channels: c.channels || [] }); }}>
                    <Icon name="pencil" />
                  </button>
                  <button className="btn btn-sm btn-ghost" title="ลบ" onClick={(e) => { e.stopPropagation(); deleteCampaign(c); }} disabled={busy} style={{ color: 'var(--bad)' }}>
                    <Icon name="trash" />
                  </button>
                </div>
              </div>
              <div className="row between">
                <div className="row" style={{ gap: 6 }}>
                  {(c.channels || []).map(id => { const ch = DD.channels.find(x=>x.id===id); return ch ? <span key={id} style={{ width: 10, height: 10, borderRadius: 3, background: ch.hex }} title={ch.name}></span> : null; })}
                </div>
                <span className="cap row" style={{ gap: 5 }}><Icon name="listChecks" /> {c.tasks} งาน</span>
              </div>
            </div>
          );
        })}
        {campaigns.length === 0 && (
          <div style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>
            <div className="cap">ยังไม่มีแคมเปญ — กด "+ สร้างแคมเปญ" เพื่อเริ่ม</div>
          </div>
        )}
      </div>
    </div>
  );
}

function POView() {
  return (
    <div className="content-inner rise">
      <div className="card">
        <div className="card-head">
          <h3><span style={{color:'var(--accent)'}}><Icon name="box" /></span> ใบสั่งผลิต & PO โรงงาน</h3>
          <button className="btn btn-sm btn-primary" onClick={() => window.__openModal('po')}><Icon name="plus" /> เปิด PO ใหม่</button>
        </div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>สินค้า</th><th style={{textAlign:'right'}}>จำนวน</th><th>วันสั่ง</th><th>กำหนดเข้า</th><th style={{textAlign:'right'}}>สถานะ</th><th style={{textAlign:'right'}}></th></tr></thead>
          <tbody>
            {DD.poTracker.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }} className="cap">ยังไม่มี PO — กด "เปิด PO ใหม่" เพื่อเริ่ม</td></tr>
            )}
            {DD.poTracker.map(po => {
              const matched = (DD.products || []).some(p => p.name === po.product);
              return (
              <tr key={po.id}>
                <td style={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => window.__openModal('po', po)}>{po.product}</td>
                <td className="num" style={{ textAlign: 'right' }}>{N(po.quantity)} ตัว</td>
                <td className="num cap">{po.orderDate}</td>
                <td className="num cap">{po.arrivalDate}</td>
                <td style={{ textAlign: 'right' }}>
                  <span className={`chip ${po.status==='Completed'?'chip-good':'chip-warn'}`}>{po.status==='Completed'?'ของเข้าแล้ว':'กำลังผลิต'}</span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  {po.status !== 'Completed' && matched && <button className="btn btn-sm btn-ghost" title="รับเข้าสต็อก (สร้างล็อต)" onClick={() => window.__openModal('receive', po)}><Icon name="box" /> รับเข้า</button>}
                  {po.status !== 'Completed' && !matched && <span className="cap" style={{ color: 'var(--ink-4)' }} title="ชื่อ PO ไม่ตรงกับสินค้าในแคตตาล็อก">— ไม่พบสินค้า —</span>}
                </td>
              </tr>
            ); })}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

/* ====================  SETTINGS (replaces System)  ==================== */
export function SettingsView({ sub, dark, setDark }) {
  const _isAdmin = window.__isAdmin === true;
  const _canEdit = window.__canEdit !== false;
  const TABS = [
    { id: 'general', label: 'ทั่วไป', icon: 'system' },
    { id: 'channels', label: 'ช่องทาง', icon: 'layers' },
    { id: 'campaigns', label: 'แคมเปญ', icon: 'megaphone' },
    { id: 'duties', label: 'หน้าที่', icon: 'shield' },
    { id: 'roles', label: 'สิทธิ์ผู้ใช้', icon: 'users' },
    { id: 'audit', label: 'ประวัติการใช้งาน', icon: 'clock' },
    { id: 'trash', label: 'ถังขยะ', icon: 'trash' },
  ].filter(t => (t.id === 'roles' ? _isAdmin : t.id === 'trash' ? _canEdit : true)); // สิทธิ์ผู้ใช้=admin, ถังขยะ=ผู้แก้ไขขึ้นไป
  // ใช้ sub prop โดยตรง — ถ้า sub ไม่ถูกต้อง fallback เป็น 'general' (กันหน้าว่าง)
  const active = TABS.some(t => t.id === sub) ? sub : 'general';
  const setActive = (id) => window.__goSection?.('settings', id);
  return (
    <div className="content-inner rise">
      <div className="segbar" style={{ marginBottom: 16, display: 'inline-flex', maxWidth: '100%' }}>
        {TABS.map(t => (
          <button key={t.id} className={'seg' + (active === t.id ? ' active' : '')}
            onClick={() => setActive(t.id)}>
            <Icon name={t.icon} />{t.label}
          </button>
        ))}
      </div>
      {active === 'general' && <GeneralSettings dark={dark} setDark={setDark} />}
      {active === 'channels' && <ChannelsView />}
      {active === 'campaigns' && <CampaignsView />}
      {active === 'duties' && <DutiesView />}
      {active === 'roles' && _isAdmin && <RolesView />}
      {active === 'audit' && <AuditView />}
      {active === 'trash' && _canEdit && <TrashView />}
    </div>
  );
}

// Toggle pill ที่ persist ลง localStorage
// Toggle switch มาตรฐาน (เลื่อน/กด เปิด-ปิด)
function Switch({ on, onClick, label, color }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick}
      className={'switch' + (on ? ' on' : '')} style={color ? { '--sw-on': color } : undefined} />
  );
}

function NotifToggle({ storeKey }) {
  const [on, setOn] = useState(() => { try { return localStorage.getItem(storeKey) !== 'false'; } catch { return true; } });
  const flip = () => setOn(v => { const nv = !v; try { localStorage.setItem(storeKey, nv ? 'true' : 'false'); } catch { /* ignore */ } try { window.dispatchEvent(new Event('tmk-prefs')); } catch { /* ignore */ } return nv; }); // แจ้ง App ให้รีเฟรชกระดิ่งทันที
  return <Switch on={on} onClick={flip} label="เปิด/ปิดการแจ้งเตือน" />;
}

// Export ข้อมูลทั้งหมดเป็น CSV (multi-section, BOM สำหรับภาษาไทยใน Excel)
function exportAllCSV() {
  const esc = _csvEsc; // ใช้ helper เดียว (numeric-aware: ไม่ทำเลขลบเป็น text)
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  // ขยายข้อมูลรายวันต่อช่องทาง (dataset ที่มีค่าที่สุด — เก็บไว้ใน TMK.dailyAll ครบทุกเดือน)
  const dailyRows = [];
  (TMK.dailyAll || []).forEach(d => {
    const dateStr = `${d.year - 543}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
    Object.entries(d.ch || {}).forEach(([chId, c]) => {
      // คนทัก = ลูกค้าใหม่ + เก่า (derive ให้ตรงกับ dashboard — ไม่ใช้ค่า inq ดิบที่เก็บไว้ก่อนเปลี่ยนนิยาม)
      dailyRows.push({ date: dateStr, channel: chId, rev: r2(c.rev || 0), ord: c.ord || 0, ad: r2(c.ad || 0), inq: (c.newC || 0) + (c.oldC || 0), newC: c.newC || 0, oldC: c.oldC || 0 });
    });
  });
  // สรุปรายเดือนทั้งปี (เป้า vs จริง vs แอด vs ลูกค้าใหม่)
  const monthlyRows = (TMK.monthly || []).map(m => ({
    year: m.year - 543, month: m.month, target: m.target, actual: r2(m.actual), adSpend: r2(m.adSpend), orders: m.orders, newCust: m.newCust,
  })); // m.year เก็บเป็น พ.ศ. — แปลงเป็น ค.ศ. ให้ตรงกับ section Daily×Channel (กันไฟล์เดียวปนปีต่างกัน 543)
  // Audit log (200 แถวล่าสุดที่โหลดอยู่ — หน้า audit แยกมี pagination เต็มในอนาคต)
  const auditRows = (TMK.audit || []).map(a => ({
    ts: a.ts || '', user: a.user || '', action: a.action || '', entity: a.entityType || '', name: a.entityName || '', summary: a.summary || '',
  }));
  const sections = [
    ['ช่องทาง — เดือนปัจจุบัน (Channels — current month)', ['name', 'target', 'actual', 'orders', 'ad'], TMK.channels || []],
    ['สินค้า (Products)', ['name', 'price', 'units', 'onHand', 'stockValue', 'reorder'], TMK.products || []],
    ['งาน (Tasks)', ['title', 'date', 'status', 'camp', 'channel'], TMK.tasks || []],
    ['แคมเปญ (Campaigns)', ['name', 'status', 'start', 'end'], TMK.campaigns || []],
    ['PO', ['product', 'quantity', 'orderDate', 'arrivalDate', 'status'], TMK.poTracker || []],
    ['แคมเปญแอด (Ad)', ['name', 'platform', 'budget', 'spent', 'status'], TMK.adCampaigns || []],
    ['ยอดรายวันต่อช่องทาง (Daily × Channel)', ['date', 'channel', 'rev', 'ord', 'ad', 'inq', 'newC', 'oldC'], dailyRows],
    ['สรุปรายเดือน (Monthly Summary)', ['year', 'month', 'target', 'actual', 'adSpend', 'orders', 'newCust'], monthlyRows],
    ['ประวัติการใช้งาน (Audit Log)', ['ts', 'user', 'action', 'entity', 'name', 'summary'], auditRows],
  ];
  let csv = '';
  sections.forEach(([title, cols, rows]) => {
    csv += title + '\n' + cols.join(',') + '\n';
    rows.forEach(r => { csv += cols.map(c => esc(Array.isArray(r[c]) ? r[c].join(' ') : r[c])).join(',') + '\n'; });
    csv += '\n';
  });
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  a.download = `tmk-export-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
  logAudit({ action: 'export', entityType: 'data', entityName: 'CSV', summary: 'ส่งออกข้อมูลทั้งหมดเป็น CSV' });
  if (window.__toast) window.__toast('ส่งออก CSV เรียบร้อย', 'success');
}

// รายงานรายเดือน (CSV) — สรุปต่อช่องทาง (เป้า/ยอด/ค่าแอด/ROAS) + ยอดรายวันต่อช่องทาง (สำหรับส่งผู้บริหาร)
// pickMonth: 1-12 (ค่า default = เดือนปัจจุบัน), pickYearBE: ปี พ.ศ.
function exportMonthlyReportCSV(pickMonth, pickYearBE) {
  const esc = _csvEsc; // ใช้ helper เดียว (numeric-aware: ไม่ทำเลขลบเป็น text)
  const t = getToday();
  const month = pickMonth || t.month;
  const yearBE = pickYearBE || t.yearBE;
  const md = computeMonth(month - 1, yearBE);
  const monthTH = MONTHS_TH_SHORT[month - 1];
  const channelNameById = Object.fromEntries((TMK.channels || []).map(c => [c.id, c.name]));
  let csv = `รายงานยอดขายเดือน ${monthTH} ${yearBE}\n\n`;
  // สรุปรวม
  csv += 'สรุปรวม\n';
  csv += `เป้าเดือน,${md.consts.TARGET}\nยอด,${md.computed.MTD}\nออเดอร์,${md.computed.ORD}\nค่าแอดรวม,${md.computed.AD}\nลูกค้าใหม่,${md.computed.NEW_C}\n\n`;
  // ต่อช่องทาง
  csv += 'ช่องทาง,เป้า,ยอด,%เป้า,ออเดอร์,ค่าแอด,ROAS\n';
  (md.channels || []).forEach(c => {
    const pct = c.target > 0 ? ((c.actual / c.target) * 100).toFixed(1) : '';
    const roas = c.ad > 0 ? (c.actual / c.ad).toFixed(2) : '';
    csv += [esc(c.name), c.target, c.actual, pct, c.orders, c.ad, roas].join(',') + '\n';
  });
  csv += '\n';
  // ยอดรายวัน × ช่องทาง (breakdown เต็ม — เพิ่มจาก v1 ที่มีแค่รายได้รวม+ค่าแอด)
  csv += 'ยอดรายวันต่อช่องทาง\nวันที่,ช่องทาง,รายได้,ออเดอร์,ค่าแอด,คนทัก,ลูกค้าใหม่,ลูกค้าเก่า\n';
  const rows = (TMK.dailyAll || []).filter(r => r.year === yearBE && r.month === month).sort((a, b) => a.day - b.day);
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100; // ปัด 2 ตำแหน่งสตางค์
  rows.forEach(r => {
    const dateStr = `${r.year - 543}-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`;
    Object.entries(r.ch || {}).forEach(([chId, c]) => {
      csv += [dateStr, esc(channelNameById[chId] || chId), r2(c.rev || 0), c.ord || 0, r2(c.ad || 0), (c.newC || 0) + (c.oldC || 0), c.newC || 0, c.oldC || 0].join(',') + '\n';
    });
  });
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tmk-report-${yearBE}-${String(month).padStart(2, '0')}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
  logAudit({ action: 'export', entityType: 'data', entityName: `รายงาน ${monthTH} ${yearBE}`, summary: `ส่งออกรายงานรายเดือน ${monthTH} ${yearBE}` });
  if (window.__toast) window.__toast(`ส่งออกรายงาน ${monthTH} ${yearBE} เรียบร้อย`, 'success');
}

function GeneralSettings({ dark, setDark }) {
  // เลือกเดือน-ปีสำหรับรายงาน (default = เดือนปัจจุบัน, ย้อนหลังได้ 5 ปี)
  const _t = getToday();
  const [reportMonth, setReportMonth] = useState(_t.month);
  const [reportYear, setReportYear] = useState(_t.yearBE);
  const yearOptions = [0, 1, 2, 3, 4, 5].map(d => _t.yearBE - d);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Appearance */}
      <div className="card">
        <div className="card-head"><h3><Icon name={dark ? 'moon' : 'sun'} /> ธีมและการแสดงผล</h3></div>
        <div className="row between" style={{ padding: '12px 0' }}>
          <div>
            <div className="sm" style={{ fontWeight: 600 }}>โหมดมืด</div>
            <div className="cap">เปลี่ยนธีมสีของระบบ</div>
          </div>
          <Switch on={dark} onClick={() => setDark(d => !d)} label="โหมดมืด" color="var(--accent)" />
        </div>
      </div>

      {/* Notification settings */}
      <div className="card">
        <div className="card-head"><h3><Icon name="bell" /> การแจ้งเตือน</h3></div>
        <div className="row between" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
          <div><div className="sm" style={{ fontWeight: 600 }}>แจ้งเตือนงาน &amp; สรุปเดือน</div><div className="cap">เตือนงานวันนี้/เกินกำหนด/ใกล้ถึง และเตือนสรุปยอดเดือนที่แล้ว</div></div>
          <NotifToggle storeKey="tmk-notif-overdue" />
        </div>
        <div className="row between" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
          <div><div className="sm" style={{ fontWeight: 600 }}>แจ้งเตือนสต็อกใกล้หมด</div><div className="cap">เตือนเมื่อสินค้าเหลือน้อยกว่าจุดสั่งผลิต</div></div>
          <NotifToggle storeKey="tmk-notif-stock" />
        </div>
        <div className="row between" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
          <div><div className="sm" style={{ fontWeight: 600 }}>เตือนกรอกยอดขายวันนี้</div><div className="cap">เตือนเมื่อยังไม่ได้บันทึกยอดขายของวันนี้</div></div>
          <NotifToggle storeKey="tmk-notif-daily" />
        </div>
        <div className="row between" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
          <div><div className="sm" style={{ fontWeight: 600 }}>เตือนยอดขาย &amp; ค่าแอด</div><div className="cap">เตือนเมื่อ ACOS เกินเพดาน, ใช้งบแอดเกินที่ตั้ง, ยอดช้ากว่าแผน หรือ pace ลูกค้าใหม่ช้า</div></div>
          <NotifToggle storeKey="tmk-notif-sales" />
        </div>
        <div className="row between" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
          <div><div className="sm" style={{ fontWeight: 600 }}>เตือนออเดอร์ค้าง</div><div className="cap">เตือนเมื่อออเดอร์สถานะ "รอ/กำลังเตรียม" นานเกิน 2 วัน (กันลืมส่ง)</div></div>
          <NotifToggle storeKey="tmk-notif-orders" />
        </div>
        <div className="row between" style={{ padding: '12px 0' }}>
          <div><div className="sm" style={{ fontWeight: 600 }}>เตือน PO ถึงกำหนด</div><div className="cap">เตือนเมื่อ PO ถึงวันรับเข้าหรือเลยกำหนดแล้วยังไม่ได้รับเข้า</div></div>
          <NotifToggle storeKey="tmk-notif-po" />
        </div>
      </div>

      {/* Data */}
      <div className="card">
        <div className="card-head"><h3><Icon name="layers" /> ข้อมูลและการซิงค์</h3></div>
        <div className="row between" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
          <div><div className="sm" style={{ fontWeight: 600 }}>ซิงค์ข้อมูลอัตโนมัติ</div><div className="cap">ซิงค์อัตโนมัติผ่าน Supabase Realtime</div></div>
          <span className="chip chip-good">เปิด</span>
        </div>
        <div className="row between" style={{ padding: '12px 0' }}>
          <div><div className="sm" style={{ fontWeight: 600 }}>Export ข้อมูล</div><div className="cap">ดาวน์โหลดข้อมูลทั้งหมดเป็น CSV (รองรับภาษาไทยใน Excel)</div></div>
          <button className="btn btn-sm btn-outline" onClick={exportAllCSV}>
            <Icon name="external" /> Export
          </button>
        </div>
        <div style={{ padding: '12px 0' }}>
          <div className="row between" style={{ marginBottom: 10 }}>
            <div>
              <div className="sm" style={{ fontWeight: 600 }}>รายงานยอดขายรายเดือน</div>
              <div className="cap">สรุปต่อช่องทาง (เป้า/ยอด/ROAS) + ยอดรายวันต่อช่องทาง — เลือกเดือนย้อนหลังได้</div>
            </div>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <select className="input" value={reportMonth} onChange={e => setReportMonth(+e.target.value)} style={{ minWidth: 110, flex: '0 0 auto' }}>
              {MONTHS_TH_SHORT.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
            <select className="input" value={reportYear} onChange={e => setReportYear(+e.target.value)} style={{ minWidth: 90, flex: '0 0 auto' }}>
              {yearOptions.map(y => <option key={y} value={y}>{y}{y === _t.yearBE ? ' (ปีนี้)' : ''}</option>)}
            </select>
            <button className="btn btn-sm btn-primary" onClick={() => exportMonthlyReportCSV(reportMonth, reportYear)} style={{ flex: '0 0 auto' }}>
              <Icon name="external" /> ดาวน์โหลด CSV
            </button>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="card">
        <div className="card-head"><h3><Icon name="sparkle" /> เกี่ยวกับระบบ</h3></div>
        <div className="row between" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
          <div><div className="sm" style={{ fontWeight: 600 }}>เวอร์ชัน</div><div className="cap">ดูอัปเดตที่ป้าย "มีอะไรใหม่" มุมขวาล่าง</div></div>
          <span className="chip chip-accent">v{APP_VERSION}</span>
        </div>
        <div className="row between" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
          <div><div className="sm" style={{ fontWeight: 600 }}>แหล่งข้อมูล</div><div className="cap">ทุกหน้าดึงข้อมูลจริงจาก Supabase แบบเรียลไทม์ ไม่มีข้อมูลจำลอง</div></div>
          <span className="chip chip-good">Supabase</span>
        </div>
        <div className="row between" style={{ padding: '12px 0' }}>
          <div><div className="sm" style={{ fontWeight: 600 }}>ข้อมูลแยกตามเดือน</div><div className="cap">ทุกหน้าที่มีตัวเลือกเดือนแสดงข้อมูลของเดือนที่เลือก (อดีต/ปัจจุบัน/อนาคต)</div></div>
          <span className="chip chip-good">เปิด</span>
        </div>
      </div>
    </div>
  );
}

/* ---- Updates / Changelog ---- */
// ความหมายของแต่ละ action (ครอบคลุมทุกประเภท) — ใช้ร่วม AuditView + ProfileView
const ACTION_META = {
  create:  { l: 'สร้าง',      c: 'var(--good)',  g: 'create' },
  update:  { l: 'แก้ไข',      c: 'var(--info)',  g: 'update' },
  delete:  { l: 'ลบ',         c: 'var(--bad)',   g: 'delete' },
  purge:   { l: 'ลบถาวร',     c: 'var(--bad)',   g: 'delete' },
  restore: { l: 'กู้คืน',      c: 'var(--good)',  g: 'create' },
  move:    { l: 'ย้ายสถานะ',  c: 'var(--accent)',g: 'update' },
  sale:    { l: 'ขาย/ตัดสต็อก', c: 'var(--accent)', g: 'update' },
  adjust:  { l: 'ปรับสต็อก',   c: 'var(--info)',  g: 'update' },
  receive: { l: 'รับเข้าสต็อก', c: 'var(--good)',  g: 'create' },
  reserve: { l: 'จองสต็อก',    c: 'var(--accent)', g: 'update' },
  release: { l: 'ปล่อยจอง',    c: 'var(--ink-3)', g: 'update' },
  order:   { l: 'ออเดอร์',     c: 'var(--accent-2)', g: 'update' },
  export:  { l: 'ส่งออก',     c: 'var(--warn)',  g: 'update' },
  login:   { l: 'เข้าสู่ระบบ',  c: 'var(--good)',  g: 'auth' },
  logout:  { l: 'ออกจากระบบ',  c: 'var(--ink-3)', g: 'auth' },
};
const actionMeta = (a) => ACTION_META[a.action] || { l: a.action || 'อื่นๆ', c: 'var(--info)', g: a.type || 'update' };
// กลุ่มฟิลเตอร์ประวัติ → action keys (derive จาก ACTION_META ให้ครบทุก action เสมอ — เลี่ยง hardcode ตกหล่น)
const ACTION_GROUP = Object.entries(ACTION_META).reduce((acc, [k, v]) => { (acc[v.g] = acc[v.g] || []).push(k); return acc; }, {});
const ENTITY_TH = { task:'งาน', product:'สินค้า', campaign:'แคมเปญ', channel:'ช่องทาง', duty:'หน้าที่', user:'ผู้ใช้', daily:'ยอดขายรายวัน', monthly:'รายเดือน', segment:'กลุ่มลูกค้า', adCampaign:'แคมเปญแอด', ad:'แคมเปญแอด', po:'PO / สต็อก', auth:'ระบบ', data:'ข้อมูล', settings:'ตั้งค่า', system:'ระบบ' };

function AuditView() {
  // Server-side pagination — เลิกพึ่ง TMK.audit ที่ cap 200 แถว, ดึงจริงจาก DB พร้อม count
  const PAGE = 50;
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');         // ค่าที่พิมพ์ (responsive)
  const [searchQ, setSearchQ] = useState('');        // ค่าที่ debounce แล้ว → ใช้ยิง query (กันยิงทุก keystroke)
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const types = [['all','ทั้งหมด'],['create','สร้าง'],['update','แก้ไข'],['delete','ลบ'],['auth','เข้า/ออกระบบ']];

  // debounce ช่องค้นหา 300ms — เลิกยิง query ทุก keystroke (เดิม 6 ตัวอักษร = 6 query)
  useEffect(() => { const id = setTimeout(() => setSearchQ(search), 300); return () => clearTimeout(id); }, [search]);

  useEffect(() => {
    let cancel = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag ก่อน async fetch (จำเป็น)
    setLoading(true);
    (async () => {
      let q = supabase.from('tmk_audit_logs').select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      // ระบุโซนเวลาไทย (+07:00) — กันขอบวันเพี้ยน (bare date = UTC ทำให้ตกหล่นช่วงเช้ามืด/ล้ำวันถัดไป)
      if (dateFrom) q = q.gte('created_at', dateFrom + 'T00:00:00+07:00');
      if (dateTo)   q = q.lte('created_at', dateTo + 'T23:59:59+07:00');
      if (searchQ.trim()) q = q.ilike('details', `%${searchQ.trim()}%`); // details เป็น text(JSON) — ค้นข้อความใน summary/entityName
      if (filter !== 'all') q = q.in('action', ACTION_GROUP[filter] || [filter]);
      const { data, count, error } = await q;
      if (cancel) return;
      if (error) { setRows([]); setTotal(0); }
      else { setRows(data || []); setTotal(count || 0); }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [page, filter, searchQ, dateFrom, dateTo]);

  // แปลง raw row → format เดียวกับ TMK.audit (ใช้ helpers เดิม) — fallback หากแปลงไม่ได้
  const mapped = rows.map(r => {
    let d = {};
    try { d = typeof r.details === 'string' ? JSON.parse(r.details) : (r.details || {}); } catch { /* ignore */ }
    return {
      action: r.action || '',
      entity: d.entityType || '',
      user: r.user_email || 'system',
      summary: d.summary || '',
      changes: Array.isArray(d.changes) ? d.changes : null, // guard: log ผิดรูป (string) จะทำ .map() throw → ErrorBoundary จอขาวทั้งแอป
      fields: Array.isArray(d.fields) ? d.fields : null,
      time: new Date(r.created_at).toLocaleString('th-TH', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'short' }),
    };
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE));

  // ปุ่มลัดช่วงวันที่ (คำนวณ pure จาก today — ไม่ใช้ Date.now ใน render)
  const _ad = todayISO();
  const _adShift = (n) => { const [y, m, d] = _ad.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
  const datePresets = [
    { label: 'วันนี้', from: _ad, to: _ad },
    { label: '7 วัน', from: _adShift(-6), to: _ad },
    { label: '30 วัน', from: _adShift(-29), to: _ad },
    { label: 'เดือนนี้', from: `${_ad.slice(0, 7)}-01`, to: _ad },
  ];
  const setRange = (from, to) => { setDateFrom(from); setDateTo(to); setPage(0); };
  const activePreset = datePresets.find(p => p.from === dateFrom && p.to === dateTo)?.label;

  return (
    <div className="content-inner rise">
      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h3><span style={{color:'var(--accent)'}}><Icon name="clock" /></span> ประวัติการใช้งาน <span className="cap" style={{ fontWeight: 500 }}>({N(total)})</span></h3>
          <div className="segbar" style={{ background: 'var(--surface-2)', flexWrap: 'wrap' }}>
            {types.map(t => <button key={t[0]} className={`seg ${filter===t[0]?'active':''}`} onClick={()=>{ setFilter(t[0]); setPage(0); }}>{t[1]}</button>)}
          </div>
        </div>
        {/* ค้นหา + ช่วงวันที่ + ปุ่มลัด */}
        <div className="row wrap" style={{ gap: 10, marginBottom: 14, alignItems: 'center' }}>
          <div className="search" style={{ flex: '1 1 230px', minWidth: 180 }}>
            <Icon name="search" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="ค้นหา (สรุป / ชื่อ)" />
          </div>
          <div className="audit-range">
            <input type="date" value={dateFrom} onChange={e => setRange(e.target.value, dateTo)} title="ตั้งแต่" />
            <span className="audit-range-sep">→</span>
            <input type="date" value={dateTo} onChange={e => setRange(dateFrom, e.target.value)} title="ถึง" />
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {datePresets.map(p => <button key={p.label} className={`audit-preset ${activePreset === p.label ? 'on' : ''}`} onClick={() => setRange(p.from, p.to)}>{p.label}</button>)}
            {(dateFrom || dateTo) && <button className="audit-preset audit-preset-clear" onClick={() => setRange('', '')}>ล้าง ✕</button>}
          </div>
        </div>
        <div>
          {loading && <div className="cap" style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }}>กำลังโหลด…</div>}
          {!loading && mapped.length === 0 && <div className="cap" style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }}>ไม่พบประวัติตามเงื่อนไข</div>}
          {!loading && mapped.map((a, i) => {
            const s = DD.staff.find(x => x.name === a.user || x.email === a.user) || { color: '#888' };
            const m = actionMeta(a);
            return (
              <div key={i} className="row" style={{ gap: 13, padding: '13px 4px', borderBottom: '1px solid var(--line-2)' }}>
                <Avatar name={a.user} color={s.color} size={34} />
                <div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                  <div className="sm"><strong>{a.user}</strong> · <span className="faint">{ENTITY_TH[a.entity] || a.entity}</span></div>
                  <div className="cap" style={{ marginTop: 2 }}>{a.summary}</div>
                  {a.changes && a.changes.length > 0 && (
                    <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {a.changes.map((c, j) => (
                        <span key={j} className="chip" style={{ fontSize: 10, background: 'var(--surface-2)' }}>
                          {c.label}: <span style={{ color: 'var(--ink-4)', textDecoration: 'line-through' }}>{c.from}</span> → <span style={{ color: 'var(--accent-2)', fontWeight: 700 }}>{c.to}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {a.fields && a.fields.length > 0 && (
                    <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {a.fields.map((fld, j) => (
                        <span key={j} className="chip" style={{ fontSize: 10, background: 'var(--surface-2)' }}>
                          {fld.label}: <span style={{ fontWeight: 700 }}>{fld.value}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="chip" style={{ background: m.c+'1c', color: m.c, flexShrink: 0, alignSelf: 'flex-start' }}>{m.l}</span>
                <span className="cap" style={{ width: 78, textAlign: 'right', flexShrink: 0, alignSelf: 'flex-start' }}>{a.time}</span>
              </div>
            );
          })}
        </div>
        {/* Pagination */}
        {total > PAGE && (
          <div className="row" style={{ gap: 8, justifyContent: 'center', padding: '14px 0 4px' }}>
            <button className="btn btn-sm" disabled={page <= 0 || loading} onClick={() => setPage(p => Math.max(0, p - 1))}>← ก่อนหน้า</button>
            <span className="cap" style={{ alignSelf: 'center' }}>หน้า {page + 1} / {totalPages}</span>
            <button className="btn btn-sm" disabled={page >= totalPages - 1 || loading} onClick={() => setPage(p => p + 1)}>ถัดไป →</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ====================  CHANNELS VIEW (ช่องทางการขาย)  ==================== */
function ChannelsView() {
  const { reload } = useData() || {};
  const PALETTE = ['#ee6a3a', '#18a0ab', '#6b5ce0', '#4a8be0', '#06c755', '#c08a3e', '#ec4899', '#2f9e6e', '#cf4d5c', '#0a5aa0'];

  const channels = (TMK.channels || []);

  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [editLogo, setEditLogo] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editFee, setEditFee] = useState(0);
  const [editHasAd, setEditHasAd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLogo, setNewLogo] = useState('');
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [newHasAd, setNewHasAd] = useState(false);

  // Helper: read file → base64
  const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
    if (!file) return reject('no file');
    if (file.size > 500 * 1024) return reject('ไฟล์ใหญ่เกิน 500KB');
    const r = new FileReader();
    r.onload = ev => resolve(ev.target.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  const startEdit = (c) => {
    setEditing(c.id);
    setEditName(c.name);
    setEditLogo(c.logoUrl || c.icon || '');
    setEditColor(c.hex || c.color || PALETTE[0]);
    setEditFee(c.platformFeePct || 0);
    setEditHasAd(!!c.hasAd);
  };

  const saveEdit = async () => {
    if (!guardEdit()) return;
    setBusy(true);
    try {
      const payload = {
        name: editName.trim(),
        color: editColor,
        has_ad: !!editHasAd, // เปิด/ปิดช่องค่าโฆษณาของช่องทางนี้
      };
      // ลอง update รวม logo_url + platform_fee_pct; ถ้า column ยังไม่มี (ยังไม่รัน migration) → บันทึกฟิลด์หลักแทน
      const full = { ...payload, logo_url: editLogo, platform_fee_pct: Math.min(100, Math.max(0, Number(editFee) || 0)) }; // clamp 0–100 (พิมพ์/วางเกินช่วงทำ P&L เพี้ยน)
      const { error } = await supabase.from('tmk_channels').update(full).eq('id', editing);
      if (error) {
        if (/column .* does not exist/i.test(error.message)) {
          // migration ยังไม่รัน → บันทึกเฉพาะ name/color/has_ad
          const { error: e2 } = await supabase.from('tmk_channels').update(payload).eq('id', editing);
          if (e2) throw e2; // ล้มเหลวจริง → ไป outer catch (ไม่ขึ้น "สำเร็จ")
          if (window.__toast) window.__toast('บันทึกแล้ว — แต่โลโก้/ค่าธรรมเนียมต้องรัน SQL migration ก่อน', 'warn');
        } else {
          throw error; // error อื่น → ไป outer catch (แสดง "บันทึกไม่สำเร็จ")
        }
      }
      logAudit({ action: 'update', entityType: 'channel', entityName: editName.trim(), summary: `แก้ไขช่องทาง "${editName.trim()}"` });
      if (reload) await reload();
      setEditing(null);
      if (window.__toast) window.__toast('อัปเดตช่องทางเรียบร้อย', 'success');
    } catch (err) {
      if (window.__toast) window.__toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const deleteChannel = async (c) => {
    if (!guardEdit()) return;
    // กันยอดหาย: ถ้าช่องทางมีประวัติยอดขาย การลบจะทำให้ยอดเก่าหายจากรายงาน → บล็อก
    const hasHistory = (TMK.dailyAll || []).some(r => { const cc = r.ch?.[c.id]; return cc && ((cc.rev || 0) > 0 || (cc.ord || 0) > 0); });
    if (hasHistory) { if (window.__toast) window.__toast(`ลบ "${c.name}" ไม่ได้ — มีประวัติยอดขายอยู่ (ยอดเก่าจะหายจากรายงาน) ถ้าไม่ใช้แล้วให้เปลี่ยนชื่อ/ลดลำดับแทน`, 'error'); return; }
    if (!confirm(`ลบช่องทาง "${c.name}"?`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('tmk_channels').update({ deleted_at: new Date().toISOString() }).eq('id', c.id);
      if (error) throw error;
      logAudit({ action: 'delete', entityType: 'channel', entityName: c.name, summary: `ลบช่องทาง "${c.name}"` });
      if (reload) await reload();
      setEditing(null);
      if (window.__toast) window.__toast('ย้ายช่องทางไปถังขยะแล้ว', 'success');
    } catch (err) {
      if (window.__toast) window.__toast('ลบไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const addChannel = async () => {
    if (!guardEdit()) return;
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      // Generate ID from name (lowercase, alphanumeric)
      const baseId = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || ('ch-' + Date.now());
      let id = baseId;
      let counter = 1;
      while (channels.find(c => c.id === id)) {
        id = `${baseId}_${counter++}`;
      }
      const maxOrder = Math.max(0, ...channels.map(c => c.sortOrder || 0));
      const basePayload = {
        id,
        name,
        color: newColor,
        actual: 0,
        sort_order: maxOrder + 1,
      };
      let { error } = await supabase.from('tmk_channels').insert({ ...basePayload, logo_url: newLogo, has_ad: !!newHasAd });
      if (error && /(logo_url|has_ad)/.test(error.message)) {
        // fallback ถ้า column ไหนยังไม่มี → ตัดเฉพาะตัวที่ขาดแล้วลองใหม่
        const retry = { ...basePayload };
        if (!/logo_url/.test(error.message)) retry.logo_url = newLogo;
        if (!/has_ad/.test(error.message)) retry.has_ad = !!newHasAd;
        const res = await supabase.from('tmk_channels').insert(retry);
        if (res.error) throw res.error;
        if (window.__toast) window.__toast('บางค่าไม่ได้บันทึก — ต้องรัน SQL migration', 'warn');
      } else if (error) throw error;
      logAudit({ action: 'create', entityType: 'channel', entityName: name, summary: `เพิ่มช่องทาง "${name}"` });
      if (reload) await reload();
      setNewName(''); setNewLogo(''); setNewColor(PALETTE[0]); setNewHasAd(false); setShowAdd(false);
      if (window.__toast) window.__toast('เพิ่มช่องทางเรียบร้อย', 'success');
    } catch (err) {
      if (window.__toast) window.__toast('เพิ่มไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const reorderChannel = async (fromId, toId) => {
    if (!guardEdit()) return;
    if (fromId === toId) return;
    const fromIdx = channels.findIndex(c => c.id === fromId);
    const toIdx = channels.findIndex(c => c.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const reordered = [...channels];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setBusy(true);
    try {
      const updates = reordered.map((c, i) =>
        supabase.from('tmk_channels').update({ sort_order: i + 1 }).eq('id', c.id)
      );
      const results = await Promise.all(updates);
      const failed = results.find(r => r.error);
      if (failed) throw failed.error;
      if (reload) await reload();
      if (window.__toast) window.__toast('เรียงลำดับใหม่เรียบร้อย', 'success');
    } catch (err) {
      if (window.__toast) window.__toast('เลื่อนไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ padding: 20, background: 'var(--accent-soft)', borderLeft: '4px solid var(--accent)' }}>
        <div className="row" style={{ gap: 10 }}>
          <Icon name="layers" />
          <div>
            <div className="h3" style={{ marginBottom: 4 }}>ช่องทางการขาย</div>
            <div className="sm" style={{ color: 'var(--ink-2)' }}>
              จัดการรายการช่องทางที่ใช้บันทึกยอดขาย — เพิ่ม/ลบ/แก้ไอคอน/สี/เป้าหมาย และจัดเรียงลำดับได้ ข้อมูลเก็บใน Supabase
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3><Icon name="layers" /> ช่องทางทั้งหมด ({channels.length})</h3>
          <button className="btn btn-sm btn-primary" onClick={() => setShowAdd(true)}>
            <Icon name="plus" /> เพิ่มช่องทางใหม่
          </button>
        </div>

        {showAdd && (() => {
          const closeAdd = () => { setShowAdd(false); setNewName(''); setNewLogo(''); setNewColor(PALETTE[0]); setNewHasAd(false); };
          return (
            <Modal
              icon="layers"
              title="เพิ่มช่องทางใหม่"
              sub="ช่องทางที่ใช้บันทึกยอดขายและค่าโฆษณา"
              onClose={closeAdd}
              confirmOnClose={!!(newName.trim() || newLogo)}
              footer={<>
                <button className="btn btn-sm" onClick={closeAdd} disabled={busy}>ยกเลิก</button>
                <button className="btn btn-sm btn-primary" onClick={addChannel} disabled={!newName.trim() || busy}>
                  <Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก'}
                </button>
              </>}
            >
              {/* พรีวิวสด */}
              <div className="duty-preview">
                {newLogo
                  ? <img className="duty-preview-logo" src={newLogo} alt="" />
                  : <span className="duty-dot" style={{ background: newColor }} />}
                <span className={'duty-preview-name' + (newName.trim() ? '' : ' duty-preview-muted')}>{newName.trim() || 'ชื่อช่องทาง'}</span>
                {newHasAd && <span className="duty-preview-badge">มีโฆษณา</span>}
              </div>
              <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
                <div style={{ flexShrink: 0 }}>
                  <div className="cap" style={{ marginBottom: 6 }}>โลโก้ (PNG/SVG)</div>
                  <label className="logo-drop" style={newLogo ? { background: '#fff' } : null}>
                    {newLogo
                      ? <img src={newLogo} alt="" />
                      : <span className="logo-drop-hint"><Icon name="image" /><span className="cap" style={{ fontSize: 10 }}>คลิกอัปโหลด</span></span>}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
                      try { setNewLogo(await readFileAsBase64(e.target.files?.[0])); }
                      catch (err) { if (window.__toast) window.__toast(String(err), 'error'); }
                    }} />
                  </label>
                  {newLogo && (
                    <button className="btn btn-sm" style={{ marginTop: 6, fontSize: 11, color: 'var(--bad)' }} onClick={() => setNewLogo('')}>
                      ลบรูป
                    </button>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cap" style={{ marginBottom: 6 }}>ชื่อ *</div>
                  <input className="input" autoFocus placeholder="เช่น Shopee, Instagram, TikTok" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newName.trim() && !busy) addChannel(); }} />
                </div>
              </div>
              <div>
                <div className="cap" style={{ marginBottom: 6 }}>สีประจำช่องทาง</div>
                <div className="swatch-row">
                  {PALETTE.map(c => (
                    <button key={c} className={'swatch' + (newColor === c ? ' on' : '')} onClick={() => setNewColor(c)} title={c} style={{ '--sw': c }} aria-label={`เลือกสี ${c}`} aria-pressed={newColor === c}>
                      {newColor === c && <Icon name="check" />}
                    </button>
                  ))}
                </div>
              </div>
              <label className="row" style={{ gap: 9, cursor: 'pointer', alignItems: 'center' }}>
                <input type="checkbox" checked={newHasAd} onChange={e => setNewHasAd(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }} />
                <span className="sm">มีโฆษณา — เปิดช่องกรอกค่าแอด &amp; แสดงในตารางโฆษณา</span>
              </label>
            </Modal>
          );
        })()}

        {/* แก้ไขช่องทาง — popup */}
        {editing && (() => {
          const c = channels.find(x => x.id === editing);
          if (!c) return null;
          const hasLogo = editLogo && editLogo.startsWith('data:');
          return (
            <Modal
              icon="layers"
              title="แก้ไขช่องทาง"
              sub={c.name}
              onClose={() => setEditing(null)}
              confirmOnClose={editName !== c.name || editLogo !== (c.logoUrl || c.icon || '') || editColor !== (c.hex || c.color || PALETTE[0]) || String(editFee) !== String(c.platformFeePct || 0) || editHasAd !== !!c.hasAd}
              footer={
                <div className="row" style={{ width: '100%', justifyContent: 'space-between' }}>
                  <button className="btn btn-sm" style={{ color: 'var(--bad)' }} onClick={() => deleteChannel(c)} disabled={busy}><Icon name="trash" /> ลบ</button>
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn btn-sm" onClick={() => setEditing(null)} disabled={busy}>ยกเลิก</button>
                    <button className="btn btn-sm btn-primary" onClick={saveEdit} disabled={!editName.trim() || busy}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
                  </div>
                </div>
              }
            >
              {/* พรีวิวสด */}
              <div className="duty-preview">
                {hasLogo
                  ? <img className="duty-preview-logo" src={editLogo} alt="" />
                  : <span className="duty-dot" style={{ background: editColor }} />}
                <span className={'duty-preview-name' + (editName.trim() ? '' : ' duty-preview-muted')}>{editName.trim() || 'ชื่อช่องทาง'}</span>
                {editHasAd && <span className="duty-preview-badge">มีโฆษณา</span>}
              </div>
              <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
                <div style={{ flexShrink: 0 }}>
                  <div className="cap" style={{ marginBottom: 6 }}>โลโก้</div>
                  <label className="logo-drop" style={hasLogo ? { background: '#fff' } : null}>
                    {hasLogo
                      ? <img src={editLogo} alt="" />
                      : <span className="logo-drop-hint"><Icon name="image" /><span className="cap" style={{ fontSize: 10 }}>คลิกอัปโหลด</span></span>}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
                      try { setEditLogo(await readFileAsBase64(e.target.files?.[0])); }
                      catch (err) { if (window.__toast) window.__toast(String(err), 'error'); }
                    }} />
                  </label>
                  {editLogo && (
                    <button className="btn btn-sm" style={{ marginTop: 6, fontSize: 11, color: 'var(--bad)' }} onClick={() => setEditLogo('')}>ลบรูป</button>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cap" style={{ marginBottom: 6 }}>ชื่อ</div>
                  <input className="input" value={editName} onChange={e => setEditName(e.target.value)} />
                </div>
              </div>
              <div>
                <div className="cap" style={{ marginBottom: 6 }}>สีประจำช่องทาง</div>
                <div className="swatch-row">
                  {PALETTE.map(col => (
                    <button key={col} className={'swatch' + (editColor === col ? ' on' : '')} onClick={() => setEditColor(col)} title={col} style={{ '--sw': col }} aria-label={`เลือกสี ${col}`} aria-pressed={editColor === col}>
                      {editColor === col && <Icon name="check" />}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="cap" style={{ marginBottom: 6 }}>ค่าธรรมเนียมแพลตฟอร์ม (%) — ใช้คำนวณกำไร/มาร์จิ้นจริง</div>
                <input className="input" type="number" min="0" max="100" step="0.01" style={{ maxWidth: 160 }} value={editFee} onChange={e => setEditFee(e.target.value)} placeholder="0" />
                <div className="cap" style={{ marginTop: 4, color: 'var(--ink-4)' }}>เช่น Shopee ~5–10%, ช่องทางตัวเอง (CRM) = 0</div>
              </div>
              <label className="row" style={{ gap: 9, cursor: 'pointer', alignItems: 'center' }}>
                <input type="checkbox" checked={editHasAd} onChange={e => setEditHasAd(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }} />
                <span className="sm">มีโฆษณา — เปิดช่องกรอกค่าแอด &amp; แสดงในตารางโฆษณา</span>
              </label>
            </Modal>
          );
        })()}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {channels.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>
              <div className="cap">ยังไม่มีช่องทาง — กด "เพิ่มช่องทางใหม่" เพื่อเริ่ม</div>
            </div>
          )}
          {channels.map((c, idx) => {
            const isOver = dragOver === c.id;

            return (
              <div key={c.id}
                draggable
                onDragStart={() => setDragId(c.id)}
                onDragEnd={() => { setDragId(null); setDragOver(null); }}
                onDragOver={(e) => { e.preventDefault(); if (dragId && dragId !== c.id) setDragOver(c.id); }}
                onDragLeave={() => setDragOver(o => o === c.id ? null : o)}
                onDrop={() => { if (dragId) reorderChannel(dragId, c.id); setDragId(null); setDragOver(null); }}
                className="row" style={{
                  gap: 12, padding: '14px 12px',
                  borderBottom: '1px solid var(--line-2)',
                  cursor: 'move',
                  background: isOver ? 'var(--accent-soft)' : 'transparent',
                  opacity: dragId === c.id ? 0.4 : 1,
                  transition: 'all 0.15s',
                }}>
                <span className="desktop-only" title="ลากเพื่อเรียงลำดับ" style={{ color: 'var(--ink-4)', flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="9" cy="6" r="1.5" fill="currentColor" /><circle cx="9" cy="12" r="1.5" fill="currentColor" /><circle cx="9" cy="18" r="1.5" fill="currentColor" />
                    <circle cx="15" cy="6" r="1.5" fill="currentColor" /><circle cx="15" cy="12" r="1.5" fill="currentColor" /><circle cx="15" cy="18" r="1.5" fill="currentColor" />
                  </svg>
                </span>
                {/* มือถือลากไม่ได้ → stepper ▲▼ แนวตั้ง */}
                <span className="mobile-only reorder-stepper" style={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button disabled={idx === 0 || busy} onClick={() => reorderChannel(c.id, channels[idx - 1].id)} aria-label="เลื่อนขึ้น">▲</button>
                  <button disabled={idx === channels.length - 1 || busy} onClick={() => reorderChannel(c.id, channels[idx + 1].id)} aria-label="เลื่อนลง">▼</button>
                </span>
                {c.logoUrl ? (
                  <img src={c.logoUrl} alt={c.name} style={{
                    width: 42, height: 42, borderRadius: 10,
                    objectFit: 'contain', flexShrink: 0,
                  }} />
                ) : (
                  <span style={{
                    width: 42, height: 42, borderRadius: 10,
                    background: (c.hex || c.color || '#666') + '18',
                    color: c.hex || c.color || '#666',
                    display: 'grid', placeItems: 'center',
                    fontSize: 20, fontWeight: 700, flexShrink: 0,
                  }}>{c.icon || c.name?.[0] || '?'}</span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="sm" style={{ fontWeight: 700, fontSize: 'var(--fs-base)' }}>{c.name}</div>
                </div>
                <button className="btn btn-sm btn-ghost" onClick={() => startEdit(c)} title="แก้ไข">
                  <Icon name="pencil" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ====================  DUTIES VIEW (หน้าที่/ตำแหน่ง)  ==================== */
function DutiesView() {
  const { reload } = useData() || {};
  const PALETTE = ['#b07d33', '#0a5aa0', '#2f9e6e', '#4a8be0', '#6b5ce0', '#c08a3e', '#ee6a3a', '#cf4d5c'];
  const [editing, setEditing] = useState(null); // duty id
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [busy, setBusy] = useState(false);

  // New duty form
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [newDesc, setNewDesc] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const duties = TMK.duties || [];

  // นับผู้ใช้ในแต่ละหน้าที่
  const userCount = (dutyId) => (TMK.roles || []).filter(r => r.dutyId === dutyId).length;

  const startEdit = (d) => {
    setEditing(d.id);
    setEditName(d.name);
    setEditColor(d.color);
    setEditDesc(d.description || '');
  };

  const saveEdit = async () => {
    if (!guardEdit()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('tmk_duties').update({
        name: editName.trim(),
        color: editColor,
        description: editDesc.trim(),
      }).eq('id', editing);
      if (error) throw error;
      logAudit({ action: 'update', entityType: 'duty', entityName: editName.trim(), summary: `แก้ไขหน้าที่ "${editName.trim()}"` });
      if (reload) await reload();
      setEditing(null);
      if (window.__toast) window.__toast('อัปเดตหน้าที่เรียบร้อย', 'success');
    } catch (err) {
      if (window.__toast) window.__toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const deleteDuty = async (duty) => {
    if (!guardEdit()) return;
    const count = userCount(duty.id);
    if (count > 0) {
      if (window.__toast) window.__toast(`ลบไม่ได้ — ยังมีผู้ใช้ ${count} คนใช้หน้าที่นี้`, 'warn');
      return;
    }
    if (!confirm(`ลบหน้าที่ "${duty.name}"?`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('tmk_duties').update({ deleted_at: new Date().toISOString() }).eq('id', duty.id);
      if (error) throw error;
      logAudit({ action: 'delete', entityType: 'duty', entityName: duty.name, summary: `ลบหน้าที่ "${duty.name}"` });
      if (reload) await reload();
      setEditing(null);
      if (window.__toast) window.__toast('ย้ายหน้าที่ไปถังขยะแล้ว', 'success');
    } catch (err) {
      if (window.__toast) window.__toast('ลบไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const addDuty = async () => {
    if (!guardEdit()) return;
    const name = newName.trim();
    if (!name) return;
    if (duties.find(d => d.name === name)) {
      if (window.__toast) window.__toast('หน้าที่นี้มีอยู่แล้ว', 'warn');
      return;
    }
    setBusy(true);
    try {
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || ('d-' + Date.now());
      const maxOrder = Math.max(0, ...duties.map(d => d.sortOrder || 0));
      // upsert + deleted_at:null → ถ้าชื่อนี้เคยถูกลบ (soft-delete) จะกู้กลับมาแทนที่จะชน PK
      const { error } = await supabase.from('tmk_duties').upsert({
        id,
        name,
        color: newColor,
        description: newDesc.trim(),
        sort_order: maxOrder + 1,
        deleted_at: null,
      });
      if (error) throw error;
      logAudit({ action: 'create', entityType: 'duty', entityName: name, summary: `เพิ่มหน้าที่ "${name}"` });
      if (reload) await reload();
      setNewName(''); setNewColor(PALETTE[0]); setNewDesc(''); setShowAdd(false);
      if (window.__toast) window.__toast('เพิ่มหน้าที่เรียบร้อย', 'success');
    } catch (err) {
      if (window.__toast) window.__toast('เพิ่มไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ padding: 20, background: 'var(--accent-soft)', borderLeft: '4px solid var(--accent)' }}>
        <div className="row" style={{ gap: 10 }}>
          <Icon name="sparkle" />
          <div>
            <div className="h3" style={{ marginBottom: 4 }}>หน้าที่ / ตำแหน่ง</div>
            <div className="sm" style={{ color: 'var(--ink-2)' }}>
              จัดการรายการหน้าที่ที่ใช้มอบหมายงาน — แต่ละผู้ใช้จะมี 1 หน้าที่ และในการสร้าง task คุณเลือก "ผู้รับผิดชอบ" จากหน้าที่เหล่านี้
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3><Icon name="shield" /> หน้าที่ทั้งหมด ({duties.length})</h3>
          <button className="btn btn-sm btn-primary" onClick={() => setShowAdd(true)}>
            <Icon name="plus" /> เพิ่มหน้าที่ใหม่
          </button>
        </div>

        {/* Add new duty — popup modal */}
        {showAdd && (() => {
          const closeAdd = () => { setShowAdd(false); setNewName(''); setNewColor(PALETTE[0]); setNewDesc(''); };
          return (
            <Modal
              icon="shield"
              title="เพิ่มหน้าที่ใหม่"
              sub="ใช้มอบหมายงานและจัดกลุ่มผู้รับผิดชอบ"
              onClose={closeAdd}
              confirmOnClose={!!(newName.trim() || newDesc.trim())}
              footer={<>
                <button className="btn btn-sm" onClick={closeAdd} disabled={busy}>ยกเลิก</button>
                <button className="btn btn-sm btn-primary" onClick={addDuty} disabled={!newName.trim() || busy}>
                  <Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก'}
                </button>
              </>}
            >
              {/* พรีวิวสด */}
              <div className="duty-preview">
                <span className="duty-dot" style={{ background: newColor }} />
                <span className={'duty-preview-name' + (newName.trim() ? '' : ' duty-preview-muted')}>{newName.trim() || 'ชื่อหน้าที่'}</span>
                {newDesc.trim() && <span className="duty-preview-desc">· {newDesc.trim()}</span>}
              </div>
              <div>
                <div className="cap" style={{ marginBottom: 6 }}>ชื่อหน้าที่ *</div>
                <input className="input" autoFocus placeholder="เช่น Logistics, Customer Service" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newName.trim() && !busy) addDuty(); }} />
              </div>
              <div>
                <div className="cap" style={{ marginBottom: 6 }}>สีประจำหน้าที่</div>
                <div className="swatch-row">
                  {PALETTE.map(c => (
                    <button key={c} className={'swatch' + (newColor === c ? ' on' : '')} onClick={() => setNewColor(c)} title={c} style={{ '--sw': c }} aria-label={`เลือกสี ${c}`} aria-pressed={newColor === c}>
                      {newColor === c && <Icon name="check" />}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="cap" style={{ marginBottom: 6 }}>คำอธิบาย</div>
                <input className="input" placeholder="เช่น ทีมจัดส่งสินค้า / แพ็คของ" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
              </div>
            </Modal>
          );
        })()}

        {/* แก้ไขหน้าที่ — popup */}
        {editing && (() => {
          const d = duties.find(x => x.id === editing);
          if (!d) return null;
          const count = userCount(d.id);
          return (
            <Modal
              icon="shield"
              title="แก้ไขหน้าที่"
              sub={d.name}
              onClose={() => setEditing(null)}
              confirmOnClose={editName !== d.name || editColor !== d.color || editDesc !== (d.description || '')}
              footer={
                <div className="row" style={{ width: '100%', justifyContent: 'space-between' }}>
                  <button className="btn btn-sm" style={{ color: 'var(--bad)' }} onClick={() => deleteDuty(d)} disabled={busy}><Icon name="trash" /> ลบ {count > 0 && `(มี ${count} คน)`}</button>
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn btn-sm" onClick={() => setEditing(null)} disabled={busy}>ยกเลิก</button>
                    <button className="btn btn-sm btn-primary" onClick={saveEdit} disabled={!editName.trim() || busy}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
                  </div>
                </div>
              }
            >
              {/* พรีวิวสด */}
              <div className="duty-preview">
                <span className="duty-dot" style={{ background: editColor }} />
                <span className={'duty-preview-name' + (editName.trim() ? '' : ' duty-preview-muted')}>{editName.trim() || 'ชื่อหน้าที่'}</span>
                {editDesc.trim() && <span className="duty-preview-desc">· {editDesc.trim()}</span>}
              </div>
              <div>
                <div className="cap" style={{ marginBottom: 6 }}>ชื่อหน้าที่ *</div>
                <input className="input" value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div>
                <div className="cap" style={{ marginBottom: 6 }}>สีประจำหน้าที่</div>
                <div className="swatch-row">
                  {PALETTE.map(c => (
                    <button key={c} className={'swatch' + (editColor === c ? ' on' : '')} onClick={() => setEditColor(c)} title={c} style={{ '--sw': c }} aria-label={`เลือกสี ${c}`} aria-pressed={editColor === c}>
                      {editColor === c && <Icon name="check" />}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="cap" style={{ marginBottom: 6 }}>คำอธิบาย</div>
                <input className="input" value={editDesc} onChange={e => setEditDesc(e.target.value)} />
              </div>
            </Modal>
          );
        })()}

        {/* Duties list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {duties.length === 0 && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink-3)' }}>
              <div className="cap">ยังไม่มีหน้าที่ — กด "เพิ่มหน้าที่ใหม่" เพื่อเริ่ม</div>
            </div>
          )}
          {duties.map(d => {
            const count = userCount(d.id);

            return (
              <div key={d.id} className="row" style={{ gap: 12, padding: '14px 12px', borderBottom: '1px solid var(--line-2)' }}>
                <span style={{ width: 14, height: 14, borderRadius: 4, background: d.color, flexShrink: 0 }}></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="sm" style={{ fontWeight: 700 }}>{d.name}</div>
                  {d.description && <div className="cap">{d.description}</div>}
                </div>
                <span className="chip" style={{ background: d.color + '18', color: d.color, fontWeight: 600 }}>
                  {count} คน
                </span>
                <button className="btn btn-sm btn-ghost" onClick={() => startEdit(d)} title="แก้ไข">
                  <Icon name="pencil" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RolesView() {
  const { reload } = useData() || {};
  const roleMeta = {
    admin: { l: 'ผู้ดูแลระบบ', cls: 'chip-accent', icon: 'shield', d: 'จัดการได้ทุกอย่าง รวมถึงสิทธิ์ผู้ใช้' },
    editor: { l: 'แก้ไขได้', cls: 'chip-good', icon: 'pencil', d: 'บันทึกยอดขาย จัดการงาน แก้ไขข้อมูล' },
    viewer: { l: 'ดูอย่างเดียว', cls: '', icon: 'eye', d: 'เปิดดูข้อมูลได้ แต่แก้ไขไม่ได้' }
  };
  // หน้าที่ — ดึงจาก tmk_duties (Supabase) — เพิ่ม/แก้/ลบได้ใน tab "หน้าที่"
  const DUTIES = TMK.duties || [];

  // ใช้ TMK.roles + TMK.staff โดยตรง (re-render เมื่อ Supabase อัปเดต)
  const users = (TMK.roles || []).map(r => {
    const s = (TMK.staff || []).find(st => st.email === r.email);
    return {
      ...r,
      department: r.department || s?.role || '',
      color: r.color || s?.color || '#3b82f6',
      avatar: r.avatarUrl || s?.avatarUrl || '',
    };
  });

  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('viewer');
  const [editDutyId, setEditDutyId] = useState('');
  const [busy, setBusy] = useState(false);
  // ตั้ง/รีเซ็ตรหัสผ่านเข้าระบบ (แอดมินเท่านั้น)
  const [pwInput, setPwInput] = useState('');
  const [pwShow, setPwShow] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  // New user form
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('editor');
  const [newDutyId, setNewDutyId] = useState(DUTIES[0]?.id || '');

  const startEdit = (u) => {
    setEditing(u.email);
    setEditName(u.name);
    setEditRole(u.role);
    setEditDutyId(u.dutyId || '');
    setPwInput(''); setPwShow(false);
  };

  // สุ่มรหัสผ่านชั่วคราวให้แอดมินส่งต่อ
  const genPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let s = '';
    const arr = new Uint32Array(12);
    (window.crypto || window.msCrypto).getRandomValues(arr);
    for (let i = 0; i < 12; i++) s += chars[arr[i] % chars.length];
    setPwInput(s); setPwShow(true);
  };

  // ตั้ง/รีเซ็ตรหัสผ่านเข้าระบบของ user (ผ่าน RPC tmk_admin_set_password — enforce admin ที่ DB)
  const resetPassword = async (email) => {
    if (!guardAdmin()) return;
    if (pwInput.length < 6) { if (window.__toast) window.__toast('รหัสผ่านอย่างน้อย 6 ตัวอักษร', 'error'); return; }
    setPwBusy(true);
    try {
      const { data, error } = await supabase.rpc('tmk_admin_set_password', { p_email: email, p_password: pwInput });
      if (error) throw error;
      if (!data?.ok) {
        const m = { forbidden: 'เฉพาะแอดมินเท่านั้น', too_short: 'รหัสผ่านอย่างน้อย 6 ตัวอักษร', not_found: 'ยังไม่มีบัญชีเข้าระบบของอีเมลนี้ — สร้างใน Supabase Dashboard ก่อน' }[data?.error] || ('ตั้งรหัสไม่สำเร็จ' + (data?.error ? ': ' + data.error : ''));
        if (window.__toast) window.__toast(m, 'error');
        return;
      }
      logAudit({ action: 'update', entityType: 'user', entityName: email, summary: `รีเซ็ตรหัสผ่าน ${email}` }); // ไม่ log ตัวรหัส
      if (window.__toast) window.__toast(`ตั้งรหัสผ่านให้ ${email} แล้ว — ส่งรหัสนี้ให้ผู้ใช้`, 'success');
      setPwInput(''); setPwShow(false);
    } catch (err) {
      if (window.__toast) window.__toast('ตั้งรหัสไม่สำเร็จ: ' + (err.message || ''), 'error');
    } finally {
      setPwBusy(false);
    }
  };

  // Save edit ลง Supabase จริง — defensive: ลอง column ใหม่ก่อน → fallback
  const saveEdit = async () => {
    if (!guardAdmin()) return;
    setBusy(true);
    try {
      const duty = DUTIES.find(d => d.id === editDutyId);

      // === 1. Update tmk_user_roles ===
      // ลองรวม duty_id ก่อน (ถ้า migration duties-system รันแล้ว)
      let { error: e1 } = await supabase.from('tmk_user_roles').upsert({
        email: editing,
        role: editRole,
        name: editName,
        department: duty?.name || '',
        duty_id: editDutyId || null,
      });
      // ถ้า column ไม่มี (duty_id หรืออื่น) → ลองแบบไม่มี
      if (e1 && /column .* does not exist/i.test(e1.message)) {
        console.warn('Falling back: duty_id column missing', e1.message);
        const { error: e1b } = await supabase.from('tmk_user_roles').upsert({
          email: editing,
          role: editRole,
        });
        if (e1b) throw e1b;
      } else if (e1) throw e1;

      // === 2. Update tmk_staff (รูป + ชื่อ + สี) ===
      const existingStaff = (TMK.staff || []).find(s => s.email === editing);
      const staffId = existingStaff?.id || ('s-' + editing.replace(/[^a-z0-9]/gi, '').toLowerCase());
      const { error: e2 } = await supabase.from('tmk_staff').upsert({
        id: staffId,
        name: editName,
        role: duty?.name || existingStaff?.role || 'Staff',
        email: editing,
        color: duty?.color || existingStaff?.color || '#3b82f6',
      });
      if (e2) {
        // log แต่ไม่ throw — let user_roles save succeed
        console.error('tmk_staff upsert failed:', e2);
        if (window.__toast) window.__toast('บันทึกรูป/ชื่อใน staff ไม่สำเร็จ: ' + e2.message, 'warn');
      }

      logAudit({ action: 'update', entityType: 'user', entityName: editing, summary: `แก้ไขผู้ใช้ ${editName} (${editing})` });

      // === 3. Force reload data (in case realtime doesn't fire) ===
      if (reload) await reload();

      setEditing(null);
      if (window.__toast) window.__toast('อัปเดตผู้ใช้เรียบร้อย', 'success');
    } catch (err) {
      console.error(err);
      if (window.__toast) window.__toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const cancelEdit = () => { setEditing(null); setPwInput(''); setPwShow(false); };

  // Delete user ลบจาก Supabase
  const deleteUser = async (email) => {
    if (!guardAdmin()) return;
    if (!confirm(`ลบผู้ใช้ ${email}?`)) return;
    setBusy(true);
    try {
      const ts = new Date().toISOString();
      const { error: er1 } = await supabase.from('tmk_user_roles').update({ deleted_at: ts }).eq('email', email);
      if (er1) throw er1;
      await supabase.from('tmk_staff').update({ deleted_at: ts }).eq('email', email);
      logAudit({ action: 'delete', entityType: 'user', entityName: email, summary: `ลบผู้ใช้ ${email}` });
      if (reload) await reload();
      setEditing(null);
      if (window.__toast) window.__toast('ย้ายผู้ใช้ไปถังขยะแล้ว', 'success');
    } catch (err) {
      if (window.__toast) window.__toast('ลบไม่สำเร็จ: ' + err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // Add user ลง Supabase จริง
  const addUser = async () => {
    if (!guardAdmin()) return;
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if (window.__toast) window.__toast('รูปแบบอีเมลไม่ถูกต้อง', 'error'); return; }
    if (users.find(u => u.email === email)) {
      if (window.__toast) window.__toast('อีเมลนี้มีอยู่แล้ว', 'warn');
      return;
    }
    setBusy(true);
    try {
      const name = newName.trim() || email.split('@')[0];
      const duty = DUTIES.find(d => d.id === newDutyId);
      const dutyColor = duty?.color || '#3b82f6';

      // 1. Upsert tmk_user_roles (+ deleted_at:null → กู้คืนถ้าเคยลบ แทน error PK)
      const { error: e1 } = await supabase.from('tmk_user_roles').upsert({
        email,
        role: newRole,
        name,
        department: duty?.name || '',
        duty_id: newDutyId || null,
        color: dutyColor,
        created_by: 'system',
        deleted_at: null,
      });
      if (e1) throw e1;

      // 2. Upsert tmk_staff (+ deleted_at:null)
      const staffId = 's-' + email.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const { error: e2 } = await supabase.from('tmk_staff').upsert({
        id: staffId,
        name,
        role: duty?.name || 'Staff',
        email,
        color: dutyColor,
        deleted_at: null,
      });
      if (e2) throw e2;

      logAudit({ action: 'create', entityType: 'user', entityName: email, summary: `เพิ่มผู้ใช้ ${name} (${email})` });
      setNewEmail(''); setNewName(''); setNewRole('editor'); setNewDutyId(DUTIES[0]?.id || ''); setShowAdd(false);
      if (reload) await reload();
      if (window.__toast) window.__toast('เพิ่มผู้ใช้เรียบร้อย', 'success');
    } catch (err) {
      console.error(err);
      if (window.__toast) window.__toast('เพิ่มไม่สำเร็จ: ' + err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // นับ tasks ที่ user รับผิดชอบ — match by name หรือ duty
  const taskCount = (name, dutyName) => (TMK.tasks || []).filter(t => {
    const resp = Array.isArray(t.responsible) ? t.responsible : String(t.responsible || '').split(',').map(s => s.trim());
    return resp.includes(name) || (dutyName && resp.includes(dutyName));
  }).length;

  const closeAdd = () => { setShowAdd(false); setNewEmail(''); setNewName(''); setNewRole('editor'); setNewDutyId(DUTIES[0]?.id || ''); };

  return (
    <div className="content-inner rise">
      <div className="card">
          <div className="card-head">
            <h3><span style={{color:'var(--accent)'}}><Icon name="shield" /></span> สิทธิ์ผู้ใช้ <span className="cap" style={{ fontWeight: 500 }}>({users.length})</span></h3>
            <button className="btn btn-sm btn-primary" onClick={() => setShowAdd(true)}><Icon name="userPlus" /> เพิ่มผู้ใช้ใหม่</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {users.map(u => {
              const tasks = taskCount(u.name, u.department);
              return (
                <div key={u.email} className="row" style={{ gap: 12, padding: '12px 14px', borderBottom: '1px solid var(--line-2)', flexWrap: 'wrap' }}>
                  <UserIcon size={34} />
                  <div style={{ flex: '1 1 150px', minWidth: 0 }}>
                    <div className="sm" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                    <div className="cap" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                  </div>
                  {/* meta + แก้ไข — กลุ่มเดียว: จอแคบจะ wrap ลงบรรทัดใหม่ทั้งกลุ่ม (ปุ่มแก้ไขไม่หลุดจอ) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>
                    {u.department && (
                      <span className="chip" style={{ background: (u.color || '#666') + '18', color: u.color || '#666', fontWeight: 600 }}>{u.department}</span>
                    )}
                    {tasks > 0 && (
                      <span className="cap" style={{ color: 'var(--ink-3)', flexShrink: 0 }}>{tasks} งาน</span>
                    )}
                    <span className={`chip ${roleMeta[u.role]?.cls || ''}`}>{roleMeta[u.role]?.l || u.role}</span>
                    <button className="btn btn-sm btn-ghost" onClick={() => startEdit(u)} title="แก้ไข" style={{ flexShrink: 0 }}>
                      <Icon name="pencil" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
      </div>

      {/* เพิ่มผู้ใช้ใหม่ — popup */}
      {showAdd && (
        <Modal icon="userPlus" title="เพิ่มผู้ใช้ใหม่" sub="กรอกข้อมูลเพื่อเพิ่มสมาชิกเข้าทีม" onClose={closeAdd}
          confirmOnClose={!!(newEmail.trim() || newName.trim())}
          footer={
            <div className="row" style={{ width: '100%', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-sm" onClick={closeAdd} disabled={busy}>ยกเลิก</button>
              <button className="btn btn-sm btn-primary" onClick={addUser} disabled={!newEmail.trim() || busy}><Icon name="userPlus" /> {busy ? 'กำลังบันทึก…' : 'เพิ่มผู้ใช้'}</button>
            </div>
          }>
          <div className="col" style={{ gap: 16 }}>
            {/* อีเมล */}
            <div className="col" style={{ gap: 6 }}>
              <label className="sm" style={{ fontWeight: 600 }}>อีเมล <span style={{ color: 'var(--bad)' }}>*</span></label>
              <input className="input" type="email" placeholder="name@tmk.co" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
              <div className="cap" style={{ color: 'var(--ink-4)' }}>ใช้สำหรับเข้าสู่ระบบ</div>
            </div>

            {/* ชื่อ */}
            <div className="col" style={{ gap: 6 }}>
              <label className="sm" style={{ fontWeight: 600 }}>ชื่อที่แสดง</label>
              <input className="input" placeholder="เช่น คุณ A หรือชื่อทีม" value={newName} onChange={e => setNewName(e.target.value)} />
              <div className="cap" style={{ color: 'var(--ink-4)' }}>เว้นว่างได้ — ระบบจะใช้ชื่อหน้าอีเมลแทน</div>
            </div>

            {/* หน้าที่ */}
            <div className="col" style={{ gap: 6 }}>
              <label className="sm" style={{ fontWeight: 600 }}>หน้าที่ / แผนก</label>
              {DUTIES.length === 0 ? (
                <div className="cap" style={{ color: 'var(--warn)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="flame" /> ยังไม่มีหน้าที่ — สร้างที่แท็บ "หน้าที่" ก่อน
                </div>
              ) : (
                <>
                  <div className="chips-pick">
                    <button className={'pick' + (!newDutyId ? ' on' : '')} onClick={() => setNewDutyId('')}>— ไม่ระบุ —</button>
                    {DUTIES.map(d => (
                      <button key={d.id} className={'pick' + (newDutyId === d.id ? ' on' : '')} onClick={() => setNewDutyId(d.id)}>
                        <span className="dot-c" style={{ background: d.color }}></span>{d.name}
                      </button>
                    ))}
                  </div>
                  <div className="cap" style={{ color: 'var(--ink-4)' }}>ใช้มอบหมายงานใน task · kanban · ปฏิทิน</div>
                </>
              )}
            </div>

            {/* สิทธิ์ — การ์ดเลือกพร้อมคำอธิบายในตัว */}
            <div className="col" style={{ gap: 8 }}>
              <label className="sm" style={{ fontWeight: 600 }}>สิทธิ์การเข้าถึง</label>
              {Object.entries(roleMeta).map(([k, v]) => {
                const on = newRole === k;
                return (
                  <button key={k} type="button" onClick={() => setNewRole(k)}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 'var(--r-sm)', cursor: 'pointer', transition: 'all 0.12s',
                      border: on ? '1.5px solid var(--accent)' : '1px solid var(--line)', background: on ? 'var(--accent-soft)' : 'var(--surface)' }}>
                    <span style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1, display: 'grid', placeItems: 'center', fontSize: 11,
                      border: on ? 'none' : '2px solid var(--line)', background: on ? 'var(--accent)' : 'transparent', color: '#fff' }}>{on && <Icon name="check" />}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="sm" style={{ fontWeight: 600, color: on ? 'var(--accent)' : 'var(--ink)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Icon name={v.icon} /> {v.l}
                      </div>
                      <div className="cap" style={{ color: 'var(--ink-3)', marginTop: 1 }}>{v.d}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="cap" style={{ display: 'flex', alignItems: 'flex-start', gap: 6, color: 'var(--ink-4)', lineHeight: 1.5 }}>
              <span style={{ color: 'var(--accent)', flexShrink: 0 }}><Icon name="sparkle" /></span>
              บันทึกลง Supabase อัตโนมัติ · ตั้งรหัสเข้าระบบให้ได้ภายหลังที่ปุ่มแก้ไข (ดินสอ)
            </div>
          </div>
        </Modal>
      )}

      {/* แก้ไขผู้ใช้ — popup */}
      {editing && (() => {
        const u = users.find(x => x.email === editing);
        if (!u) return null;
        const tasks = taskCount(u.name, u.department);
        return (
          <Modal icon="pencil" title="แก้ไขผู้ใช้" sub={u.email} onClose={cancelEdit}
            footer={
              <div className="row" style={{ width: '100%', justifyContent: 'space-between' }}>
                <button className="btn btn-sm" style={{ color: 'var(--bad)' }} onClick={() => deleteUser(u.email)} disabled={busy}><Icon name="trash" /> ลบ</button>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-sm" onClick={cancelEdit} disabled={busy}>ยกเลิก</button>
                  <button className="btn btn-sm btn-primary" onClick={saveEdit} disabled={!editName.trim() || busy}><Icon name="check" /> {busy ? 'กำลังบันทึก...' : 'บันทึก'}</button>
                </div>
              </div>
            }>
            <div className="col" style={{ gap: 16 }}>
              {/* ชื่อ */}
              <div className="row" style={{ gap: 14, alignItems: 'flex-end' }}>
                <UserIcon size={52} radius={14} />
                <div className="col" style={{ gap: 6, flex: 1 }}>
                  <label className="sm" style={{ fontWeight: 600 }}>ชื่อที่แสดง <span className="cap" style={{ color: 'var(--ink-4)', fontWeight: 400 }}>(ลิงก์กับงาน)</span></label>
                  <input className="input" value={editName} onChange={e => setEditName(e.target.value)} placeholder="ชื่อที่ใช้แสดงในระบบ" style={{ fontWeight: 600 }} />
                </div>
              </div>

              {/* หน้าที่ */}
              <div className="col" style={{ gap: 6 }}>
                <label className="sm" style={{ fontWeight: 600 }}>หน้าที่ / แผนก</label>
                {DUTIES.length === 0 ? (
                  <div className="cap" style={{ color: 'var(--warn)' }}>ยังไม่มีหน้าที่ — สร้างที่แท็บ "หน้าที่" ก่อน</div>
                ) : (
                  <div className="chips-pick">
                    <button className={'pick' + (!editDutyId ? ' on' : '')} onClick={() => setEditDutyId('')}>— ไม่ระบุ —</button>
                    {DUTIES.map(d => (
                      <button key={d.id} className={'pick' + (editDutyId === d.id ? ' on' : '')} onClick={() => setEditDutyId(d.id)}>
                        <span className="dot-c" style={{ background: d.color }}></span>{d.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* สิทธิ์ — การ์ดเลือกพร้อมคำอธิบาย */}
              <div className="col" style={{ gap: 8 }}>
                <label className="sm" style={{ fontWeight: 600 }}>สิทธิ์การเข้าถึง</label>
                {Object.entries(roleMeta).map(([k, v]) => {
                  const on = editRole === k;
                  return (
                    <button key={k} type="button" onClick={() => setEditRole(k)}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 'var(--r-sm)', cursor: 'pointer', transition: 'all 0.12s',
                        border: on ? '1.5px solid var(--accent)' : '1px solid var(--line)', background: on ? 'var(--accent-soft)' : 'var(--surface)' }}>
                      <span style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1, display: 'grid', placeItems: 'center', fontSize: 11,
                        border: on ? 'none' : '2px solid var(--line)', background: on ? 'var(--accent)' : 'transparent', color: '#fff' }}>{on && <Icon name="check" />}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="sm" style={{ fontWeight: 600, color: on ? 'var(--accent)' : 'var(--ink)', display: 'flex', alignItems: 'center', gap: 5 }}><Icon name={v.icon} /> {v.l}</div>
                        <div className="cap" style={{ color: 'var(--ink-3)', marginTop: 1 }}>{v.d}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {tasks > 0 && (
                <div className="cap" style={{ color: 'var(--info)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="listChecks" /> เปลี่ยนชื่อจะอัปเดตอัตโนมัติใน {tasks} งานที่เกี่ยวข้อง
                </div>
              )}

              {/* รหัสผ่านเข้าระบบ */}
              <div className="col" style={{ gap: 6, borderTop: '1px dashed var(--line)', paddingTop: 14 }}>
                <label className="sm" style={{ fontWeight: 600 }}>รหัสผ่านเข้าระบบ</label>
                <div className="row" style={{ gap: 6 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input className="input" type={pwShow ? 'text' : 'password'} value={pwInput} onChange={e => setPwInput(e.target.value)} placeholder="ตั้งรหัสใหม่ (อย่างน้อย 6 ตัว)" autoComplete="new-password" style={{ width: '100%', paddingRight: 36 }} />
                    <button type="button" onClick={() => setPwShow(v => !v)} title={pwShow ? 'ซ่อน' : 'แสดง'} style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: pwShow ? 'var(--accent)' : 'var(--ink-3)', width: 28, height: 28, display: 'grid', placeItems: 'center', padding: 0 }}><Icon name="eye" /></button>
                  </div>
                  <button className="btn btn-sm" type="button" onClick={genPassword} title="สุ่มรหัส" disabled={pwBusy}><Icon name="sparkle" /></button>
                  <button className="btn btn-sm btn-primary" type="button" onClick={() => resetPassword(u.email)} disabled={pwBusy || pwInput.length < 6}>{pwBusy ? 'กำลังตั้ง...' : 'ตั้งรหัส'}</button>
                </div>
                <div className="cap" style={{ color: 'var(--ink-4)' }}>บัญชีใหม่ต้องสร้างใน Supabase Dashboard ก่อน แล้วตั้ง/รีเซ็ตรหัสที่นี่ได้</div>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

const TRASH_TABLES = [
  { table: 'tmk_tasks',             type: 'งาน',        nameCol: 'title',   key: 'id' },
  { table: 'tmk_campaigns',         type: 'แคมเปญ',     nameCol: 'name',    key: 'id' },
  { table: 'tmk_channels',          type: 'ช่องทาง',    nameCol: 'name',    key: 'id' },
  { table: 'tmk_products',          type: 'สินค้า',      nameCol: 'name',    key: 'id' },
  { table: 'tmk_duties',            type: 'หน้าที่',     nameCol: 'name',    key: 'id' },
  { table: 'tmk_purchase_orders',   type: 'PO',         nameCol: 'product', key: 'id' },
  { table: 'tmk_ad_campaigns',      type: 'แคมเปญแอด',  nameCol: 'name',    key: 'id' },
  { table: 'tmk_customer_segments', type: 'กลุ่มลูกค้า', nameCol: 'name',    key: 'id' },
  { table: 'tmk_user_roles',        type: 'ผู้ใช้',      nameCol: 'name',    key: 'email' },
  { table: 'tmk_daily_sales',       type: 'ยอดรายวัน',   nameCol: 'date',    key: 'id' },
];

function TrashView() {
  const { reload } = useData() || {};
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const aliveRef = React.useRef(true);
  // ไม่ setLoading(true) ตอนต้น: ครั้งแรก state เริ่มเป็น true อยู่แล้ว / ตอน refetch (restore/purge) ปล่อยรายการเดิมค้างไว้ไม่ให้กระพริบ (มี busy คุมปุ่มแล้ว)
  const load = async () => {
    try {
      const results = await Promise.all(
        TRASH_TABLES.map(t =>
          supabase.from(t.table).select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false })
        )
      );
      if (!aliveRef.current) return; // กัน setState หลัง unmount
      const all = [];
      results.forEach((r, i) => {
        if (r.error || !r.data) return;
        const meta = TRASH_TABLES[i];
        r.data.forEach(row => all.push({
          meta,
          id: row[meta.key],
          name: row[meta.nameCol] || row[meta.key] || '(ไม่มีชื่อ)',
          deletedAt: row.deleted_at,
        }));
      });
      all.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
      setItems(all);
    } catch (e) {
      console.error('Trash load failed:', e);
    } finally { if (aliveRef.current) setLoading(false); }
  };

  useEffect(() => {
    aliveRef.current = true;
    (async () => { await load(); })(); // setState เกิดหลัง await ภายใน load → ไม่ใช่ synchronous ใน effect
    return () => { aliveRef.current = false; };
  }, []);

  const restore = async (it) => {
    if (!guardEdit()) return;
    if ((it.meta.table === 'tmk_user_roles' || it.meta.table === 'tmk_staff') && !guardAdmin()) return; // ผู้ใช้/สิทธิ์ = admin
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from(it.meta.table).update({ deleted_at: null }).eq(it.meta.key, it.id);
      if (error) throw error;
      // user: กู้ tmk_staff ด้วย
      if (it.meta.table === 'tmk_user_roles') {
        await supabase.from('tmk_staff').update({ deleted_at: null }).eq('email', it.id);
      }
      logAudit({ action: 'restore', entityType: it.meta.type, entityName: it.name, summary: `กู้คืน${it.meta.type} "${it.name}"` });
      if (window.__toast) window.__toast(`กู้คืน "${it.name}" แล้ว`, 'success');
      await load();
      if (reload) await reload();
    } catch (err) {
      if (window.__toast) window.__toast('กู้คืนไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const purge = async (it) => {
    if (!guardEdit()) return;
    if ((it.meta.table === 'tmk_user_roles' || it.meta.table === 'tmk_staff') && !guardAdmin()) return; // ผู้ใช้/สิทธิ์ = admin
    if (busy) return;
    if (!confirm(`ลบถาวร "${it.name}"?\nลบแล้วกู้คืนไม่ได้อีก`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from(it.meta.table).delete().eq(it.meta.key, it.id);
      if (error) throw error;
      if (it.meta.table === 'tmk_user_roles') {
        const { error: e2 } = await supabase.from('tmk_staff').delete().eq('email', it.id);
        if (e2) throw e2;
      }
      logAudit({ action: 'purge', entityType: it.meta.type, entityName: it.name, summary: `ลบถาวร${it.meta.type} "${it.name}"` });
      if (window.__toast) window.__toast(`ลบถาวร "${it.name}" แล้ว`, 'success');
      await load();
    } catch (err) {
      if (window.__toast) window.__toast('ลบถาวรไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const fmtDate = (s) => { try { return new Date(s).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

  if (!loading && items.length === 0) {
    return (
      <div className="content-inner rise">
        <div className="card" style={{ textAlign: 'center', padding: '56px 20px' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-4)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 64, height: 64 }}>
            <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" />
          </svg>
          <h3 style={{ marginTop: 12 }}>ถังขยะว่างเปล่า</h3>
          <div className="cap" style={{ marginTop: 6 }}>รายการที่ลบจะถูกเก็บไว้ที่นี่ · กู้คืนได้ตลอด</div>
        </div>
      </div>
    );
  }

  return (
    <div className="content-inner rise">
      <div className="card">
        <div className="card-head">
          <h3><span style={{ color: 'var(--bad)' }}><Icon name="trash" /></span> ถังขยะ ({items.length})</h3>
          <span className="cap">กู้คืนได้ · หรือลบถาวร</span>
        </div>
        <div style={{ marginBottom: 10, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', borderLeft: '3px solid var(--warn)' }}>
          <span className="cap">หมายเหตุ: กู้คืนแคมเปญแล้ว งานที่เคยผูกจะไม่กลับมาผูกอัตโนมัติ (ต้องเลือกแคมเปญใหม่ในแต่ละงาน)</span>
        </div>
        <div>
          {loading ? (
            <div className="cap" style={{ padding: 20, textAlign: 'center' }}>กำลังโหลด…</div>
          ) : items.map((it, i) => (
            <div key={it.meta.table + it.id + i} className="row" style={{ gap: 12, padding: '12px 4px', borderBottom: '1px solid var(--line-2)' }}>
              <span className="chip" style={{ flexShrink: 0 }}>{it.meta.type}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="sm" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
                <div className="cap">ลบเมื่อ {fmtDate(it.deletedAt)}</div>
              </div>
              <button className="btn btn-sm" disabled={busy} onClick={() => restore(it)} style={{ flexShrink: 0 }}>
                <Icon name="refresh" /> กู้คืน
              </button>
              <button className="btn btn-sm" disabled={busy} onClick={() => purge(it)} style={{ flexShrink: 0, color: 'var(--bad)' }}>
                <Icon name="trash" /> ลบถาวร
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
