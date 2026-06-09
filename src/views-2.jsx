/* ============================================================
   TMK Operation — Views part 2: Planner + Catalog + System
   ============================================================ */
import React, { useState, useEffect } from 'react';
import { TMK } from './data.js';
import { B, Bk, P, N, Icon, paceStatus, stockMeta, useCountUp, Avatar, Ring, MiniArea, Bars, Section, UserIcon } from './components.jsx';
import { useUser } from './userContext.jsx';
import { useData, computeMonth } from './dataContext.jsx';
import { supabase } from './lib/supabaseClient.js';
import { logAudit } from './lib/audit.js';
import { getToday, parseTaskDate, todayISO, thaiDate, THAI_MONTHS as MONTHS_TH_SHORT, THAI_MONTHS_FULL as MONTHS_TH } from './lib/dateUtils.js';

const DD = TMK;

// a11y: ให้ clickable div กดด้วยคีย์บอร์ดได้ (Enter/Space → trigger onClick)
const onCardKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } };

// guard สิทธิ์ (ฝั่ง client) — กัน viewer แก้ผ่านหน้าตั้งค่า + จัดการผู้ใช้/สิทธิ์เฉพาะ admin
const guardEdit = () => { if (!window.__canEdit) { window.__toast?.('สิทธิ์ "ดูอย่างเดียว" — แก้ไขไม่ได้ (ติดต่อแอดมิน)', 'warn'); return false; } return true; };
const guardAdmin = () => { if (!window.__isAdmin) { window.__toast?.('เฉพาะแอดมินจัดการผู้ใช้และสิทธิ์ได้', 'warn'); return false; } return true; };

/* ====================  PLANNER  ==================== */
const chHex = { shopee: '#ee4d2d', tiktok: '#00f2ea', lazada: '#0f1689', facebook: '#1877f2', line: '#06c755', crm: '#c08a3e' };
const stDot = { done: 'var(--good)', review: 'var(--warn)', inprogress: 'var(--info)', todo: 'var(--ink-4)' };
const stLabel = { done: 'เสร็จ', review: 'รอตรวจ', inprogress: 'กำลังทำ', todo: 'รอ' };
const stCls = { done: 'chip-good', review: 'chip-warn', inprogress: 'chip-accent', todo: '' };

function PlannerFilters({ filterCamp, setFilterCamp, filterStatus, setFilterStatus, search, setSearch }) {
  return (
    <div className="card card-pad-sm" style={{ marginBottom: 12 }}>
      <div className="row between wrap" style={{ gap: 8, marginBottom: 8 }}>
        <div className="row" style={{ gap: 6 }}>
          {['all','active','done'].map(s => <button key={s} className={'pick' + (filterStatus === s ? ' on' : '')} onClick={() => setFilterStatus(s)}>{s === 'all' ? 'ทั้งหมด' : s === 'active' ? 'กำลังทำ' : 'เสร็จแล้ว'}</button>)}
        </div>
        <div className="search" style={{ width: 180 }}><Icon name="search" /><input placeholder="ค้นหางาน..." value={search} onChange={e => setSearch(e.target.value)} /></div>
      </div>
      <div className="row wrap" style={{ gap: 5 }}>
        <button className={'pick' + (!filterCamp ? ' on' : '')} onClick={() => setFilterCamp(null)}>ทั้งหมด</button>
        {DD.campaigns.map(c => <button key={c.id} className={'pick' + (filterCamp === c.id ? ' on' : '')} onClick={() => setFilterCamp(filterCamp === c.id ? null : c.id)}><span className="dot-c" style={{ background: c.color }}></span>{c.name}</button>)}
      </div>
    </div>
  );
}

function filterTasks(tasks, filterCamp, filterStatus, search) {
  return (tasks || []).filter(t => {
    if (filterCamp && t.camp !== filterCamp) return false;
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
  const [search, setSearch] = useState('');
  const fProps = { filterCamp, setFilterCamp, filterStatus, setFilterStatus, search, setSearch };
  const filtered = filterTasks(tasks, filterCamp, filterStatus, search);

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

function CalendarView({ tasks, filtered, fProps }) {
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
            <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
              {dayInfos.slice(0, 4).map((info, i) => <ChIcon key={i} info={info} size={16} />)}
              {dayInfos.length > 4 && <span style={{ fontSize: 8, color: 'var(--ink-3)', fontWeight: 700, display: 'grid', placeItems: 'center' }}>+{dayInfos.length - 4}</span>}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden', flex: 1, minHeight: 0 }}>
          {show.map(t => {
            const c = DD.campaigns.find(x => x.id === t.camp);
            return <span key={t.id} style={{ fontSize: 'var(--fs-micro)', fontWeight: 600, padding: '2px 5px', borderRadius: 4, background: (c?.color || '#888') + '22', color: c?.color || '#888', whiteSpace: 'normal', overflowWrap: 'anywhere', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.25, flexShrink: 0 }}>{t.title}</span>;
          })}
        </div>
        {more > 0 && <span style={{ fontSize: 'var(--fs-micro)', fontWeight: 'var(--fw-sem)', color: 'var(--accent-2)', textAlign: 'center', flexShrink: 0 }}>+{more} งาน</span>}
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
              <h3 style={{ minWidth: 150, textAlign: 'center' }}>{MONTHS_TH[ym.m]} {ym.y}</h3>
              <button className="icon-btn" onClick={() => shiftMonth(1)} title="เดือนถัดไป"><Icon name="chevR" /></button>
              <button className="btn btn-sm" onClick={goToday}>วันนี้</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5 }}>
            {DAY_LABELS.map(d => <div key={d} className="cap" style={{ textAlign: 'center', padding: '6px 0', fontWeight: 'var(--fw-sem)' }}>{d}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gridAutoRows: '156px', gap: 5 }}>
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
              <div className="cap" style={{ marginTop: 8 }}>ไม่มีงานในวันนี้</div>
            </div>
          ) : selTasks.map(t => {
            const c = DD.campaigns.find(x => x.id === t.camp);
            const stLabel = { done: 'เสร็จ', review: 'รอตรวจ', inprogress: 'กำลังทำ', todo: 'รอ' };
            const stCls = { done: 'chip-good', review: 'chip-warn', inprogress: 'chip-accent', todo: '' };
            return (
              <div key={t.id} role="button" tabIndex={0} onKeyDown={onCardKey} onClick={() => window.__openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] })} style={{ padding: '12px 14px', borderRadius: 'var(--r-sm)', background: 'var(--surface)', border: '1px solid var(--line)', marginBottom: 8, borderLeft: `3px solid ${c?.color || '#888'}`, cursor: 'pointer' }}>
                <div className="row between" style={{ marginBottom: 6 }}>
                  <div>
                    <div className="h3">{t.title}</div>
                    {t.detail && <div className="cap" style={{ marginTop: 1 }}>{t.detail}</div>}
                  </div>
                </div>
                <div className="row wrap" style={{ gap: 10, marginBottom: 8 }}>
                  <div><div className="cap">แคมเปญ</div><span className="chip" style={{ background: (c?.color || '#888') + '22', color: c?.color || '#888' }}>{c?.name || '-'}</span></div>
                  <div><div className="cap">ช่องทาง</div><TaskChannels channel={t.channel} size={16} /></div>
                  <div><div className="cap">สถานะ</div><span className={`chip ${stCls[t.status] || ''}`}>{stLabel[t.status]}</span></div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <span className="cap">ผู้รับผิดชอบ:</span>
                  {(t.responsible || []).map(r => { const s = DD.staff.find(x => x.name === r) || { color: '#888' }; return <span key={r} className="chip" style={{ background: s.color + '1c', color: s.color }}>{r}</span>; })}
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
  const onDrop = async (status) => {
    const id = dragId.current;
    dragId.current = null; setOver(null);
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
  return (
    <div className="content-inner rise">
      <PlannerFilters {...fProps} />
      <div className="grid g4" style={{ gap: 14, alignItems: 'start' }}>
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
  const parse = s => { const m = String(s || '').match(/^(\d+)/); return m ? +m[1] : 0; };
  const TODAY = getToday().day;
  const stMeta = { live: { l: 'กำลังดำเนินการ', cls: 'chip-good' }, upcoming: { l: 'กำลังจะมา', cls: 'chip-accent' }, done: { l: 'จบแล้ว', cls: '' } };

  // Campaign progress
  const campTasks = {};
  DD.tasks.forEach(t => { campTasks[t.camp] = campTasks[t.camp] || []; campTasks[t.camp].push(t); });

  // Stats
  // เทียบด้วยวันที่จริง (รองรับงานข้ามเดือน) — ไม่ใช่แค่เลขวัน
  const todayIso = todayISO();
  const dayDiff = (s) => { const iso = parseTaskDate(s); if (!iso) return null; return Math.round((new Date(iso + 'T00:00:00') - new Date(todayIso + 'T00:00:00')) / 86400000); };
  const todayTasks = filtered.filter(t => dayDiff(t.dateISO || t.date) === 0).length;
  const overdue = filtered.filter(t => { const d = dayDiff(t.dateISO || t.date); return d != null && d < 0 && t.status !== 'done'; }).length;

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
export function CatalogView({ sub }) {
  if (sub === 'campaigns') return <CampaignsView />;
  if (sub === 'po') return <POView />;
  return <ProductsView />;
}

function ProductsView() {
  return (
    <div className="content-inner rise">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3><span style={{color:'var(--accent)'}}><Icon name="bag" /></span> สินค้าขายดี</h3>
          <button className="btn btn-sm btn-primary" onClick={() => window.__openModal('product')}><Icon name="plus" /> เพิ่มสินค้า</button>
        </div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th style={{width:34}}>#</th><th>สินค้า</th><th style={{textAlign:'right'}}>ราคา</th><th style={{textAlign:'right'}}>ขายแล้ว</th><th style={{textAlign:'right'}}>รายได้</th><th style={{textAlign:'right'}}>คงเหลือ</th><th style={{textAlign:'right'}}>สถานะ</th></tr></thead>
          <tbody>
            {DD.products.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }} className="cap">ยังไม่มีสินค้า — กด "เพิ่มสินค้า" เพื่อเริ่ม</td></tr>
            )}
            {DD.products.map(p => {
              const sm = stockMeta(p.stock);
              return (
                <tr key={p.rank} onClick={() => window.__openModal('product', p)} style={{ cursor: 'pointer' }}>
                  <td className="num faint" style={{ fontWeight: 700 }}>{p.rank}</td>
                  <td><div style={{ fontWeight: 600 }}>{p.name}</div><div className="cap">{p.strategy}</div></td>
                  <td className="num" style={{ textAlign: 'right' }}>{B(p.price)}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{N(p.units)}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{B(p.rev)}</td>
                  <td className="num" style={{ textAlign: 'right', color: sm.c, fontWeight: 600 }}>{p.onHand}</td>
                  <td style={{ textAlign: 'right' }}><span className={`chip ${sm.cls}`}>{sm.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
      <div className="grid g2">
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 14 }}>สีขายดี</div>
          {DD.colorMix.length === 0 && <div className="cap" style={{ color: 'var(--ink-4)', padding: '8px 0' }}>ยังไม่มีข้อมูลสี</div>}
          {DD.colorMix.map(c => (
            <div key={c.name} className="row" style={{ gap: 10, marginBottom: 9 }}>
              <span style={{ width: 18, height: 18, borderRadius: 5, background: c.hex, border: '1px solid var(--line)', flexShrink: 0 }}></span>
              <span className="sm" style={{ flex: 1 }}>{c.name}</span>
              <div className="bar" style={{ width: 110 }}><span style={{ width: `${c.pct*3}%`, background: c.hex }}></span></div>
              <span className="num sm" style={{ width: 34, textAlign: 'right', fontWeight: 700 }}>{c.pct}%</span>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 14 }}>ไซส์ขายดี</div>
          {DD.sizeMix.length === 0 && <div className="cap" style={{ color: 'var(--ink-4)', padding: '8px 0' }}>ยังไม่มีข้อมูลไซส์</div>}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 180, paddingTop: 10 }}>
            {DD.sizeMix.map(s => (
              <div key={s.s} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                <span className="num cap" style={{ fontWeight: 700 }}>{s.pct}%</span>
                <div style={{ width: '100%', maxWidth: 38, height: `${(s.pct/31)*130}px`, background: 'var(--accent)', borderRadius: '6px 6px 0 0' }}></div>
                <span className="cap" style={{ fontWeight: 600 }}>{s.s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CampaignsView() {
  const { reload } = useData() || {};
  const stMeta = { live: { l: 'กำลังดำเนินการ', cls: 'chip-good' }, upcoming: { l: 'กำลังจะมา', cls: 'chip-accent' }, done: { l: 'จบแล้ว', cls: '' } };
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
        <div className="eyebrow">{campaigns.length} แคมเปญ · ลาก ↕️ เพื่อเรียงลำดับ</div>
        <button className="btn btn-primary" onClick={() => window.__openModal('campaign')}><Icon name="plus" /> สร้างแคมเปญ</button>
      </div>
      <div className="grid g2">
        {campaigns.map(c => {
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
                  <span title="ลากเพื่อเรียงลำดับ" style={{ color: 'var(--ink-4)', cursor: 'grab', flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="9" cy="6" r="1.5" fill="currentColor" /><circle cx="9" cy="12" r="1.5" fill="currentColor" /><circle cx="9" cy="18" r="1.5" fill="currentColor" />
                      <circle cx="15" cy="6" r="1.5" fill="currentColor" /><circle cx="15" cy="12" r="1.5" fill="currentColor" /><circle cx="15" cy="18" r="1.5" fill="currentColor" />
                    </svg>
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
          <thead><tr><th>สินค้า</th><th style={{textAlign:'right'}}>จำนวน</th><th>วันสั่ง</th><th>กำหนดเข้า</th><th style={{textAlign:'right'}}>สถานะ</th></tr></thead>
          <tbody>
            {DD.poTracker.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }} className="cap">ยังไม่มี PO — กด "เปิด PO ใหม่" เพื่อเริ่ม</td></tr>
            )}
            {DD.poTracker.map(po => (
              <tr key={po.id}>
                <td style={{ fontWeight: 600 }}>{po.product}</td>
                <td className="num" style={{ textAlign: 'right' }}>{N(po.quantity)} ตัว</td>
                <td className="num cap">{po.orderDate}</td>
                <td className="num cap">{po.arrivalDate}</td>
                <td style={{ textAlign: 'right' }}>
                  <span className={`chip ${po.status==='Completed'?'chip-good':'chip-warn'}`}>{po.status==='Completed'?'ของเข้าแล้ว':'กำลังผลิต'}</span>
                </td>
              </tr>
            ))}
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
    { id: 'updates', label: 'อัปเดต', icon: 'sparkle' },
  ].filter(t => (t.id === 'roles' ? _isAdmin : t.id === 'trash' ? _canEdit : true)); // สิทธิ์ผู้ใช้=admin, ถังขยะ=ผู้แก้ไขขึ้นไป
  // ใช้ sub prop โดยตรง — ถ้า sub ไม่ถูกต้อง fallback เป็น 'general' (กันหน้าว่าง)
  const active = TABS.some(t => t.id === sub) ? sub : 'general';
  const setActive = (id) => window.__goSection?.('settings', id);
  return (
    <div className="content-inner rise">
      <div className="segbar" style={{ marginBottom: 16, display: 'inline-flex', flexWrap: 'wrap' }}>
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
      {active === 'updates' && <UpdatesView />}
    </div>
  );
}

// Toggle pill ที่ persist ลง localStorage
function NotifToggle({ storeKey }) {
  const [on, setOn] = useState(() => { try { return localStorage.getItem(storeKey) !== 'false'; } catch { return true; } });
  const flip = () => setOn(v => { const nv = !v; try { localStorage.setItem(storeKey, nv ? 'true' : 'false'); } catch {} try { window.dispatchEvent(new Event('tmk-prefs')); } catch {} return nv; }); // แจ้ง App ให้รีเฟรชกระดิ่งทันที
  return (
    <button className={'chip ' + (on ? 'chip-good' : '')} onClick={flip} style={{ cursor: 'pointer', minWidth: 56, opacity: on ? 1 : 0.6 }}>
      {on ? 'เปิด' : 'ปิด'}
    </button>
  );
}

// Export ข้อมูลทั้งหมดเป็น CSV (multi-section, BOM สำหรับภาษาไทยใน Excel)
function exportAllCSV() {
  const esc = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; }; // กัน CSV formula injection (Excel)
  const sections = [
    ['ช่องทาง (Channels)', ['name', 'target', 'actual', 'orders', 'ad'], TMK.channels || []],
    ['สินค้า (Products)', ['name', 'price', 'units', 'onHand', 'reorder'], TMK.products || []],
    ['งาน (Tasks)', ['title', 'date', 'status', 'camp', 'channel'], TMK.tasks || []],
    ['แคมเปญ (Campaigns)', ['name', 'status', 'start', 'end'], TMK.campaigns || []],
    ['PO', ['product', 'quantity', 'orderDate', 'arrivalDate', 'status'], TMK.poTracker || []],
    ['แคมเปญแอด (Ad)', ['name', 'platform', 'budget', 'spent', 'status'], TMK.adCampaigns || []],
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

// รายงานรายเดือน (CSV) — สรุปต่อช่องทาง (เป้า/ยอด/ค่าแอด/ROAS) + ยอดรายวันของเดือนนั้น (สำหรับส่งผู้บริหาร)
function exportMonthlyReportCSV() {
  const esc = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; }; // กัน CSV formula injection (Excel)
  const t = getToday();
  const md = computeMonth(t.month - 1, t.yearBE);
  const monthTH = MONTHS_TH_SHORT[t.month - 1];
  let csv = `รายงานยอดขายเดือน ${monthTH} ${t.yearBE}\n\n`;
  // สรุปรวม
  csv += 'สรุปรวม\n';
  csv += `เป้าเดือน,${md.consts.TARGET}\nยอด MTD,${md.computed.MTD}\nออร์เดอร์,${md.computed.ORD}\nค่าแอดรวม,${md.computed.AD}\nลูกค้าใหม่,${md.computed.NEW_C}\n\n`;
  // ต่อช่องทาง
  csv += 'ช่องทาง,เป้า,ยอด MTD,%เป้า,ออร์เดอร์,ค่าแอด,ROAS\n';
  (md.channels || []).forEach(c => {
    const pct = c.target > 0 ? ((c.actual / c.target) * 100).toFixed(1) : '';
    const roas = c.ad > 0 ? (c.actual / c.ad).toFixed(2) : '';
    csv += [esc(c.name), c.target, c.actual, pct, c.orders, c.ad, roas].join(',') + '\n';
  });
  csv += '\n';
  // ยอดรายวันของเดือน (จาก dailyAll จริง)
  csv += 'ยอดรายวัน\nวันที่,รายได้รวม,ค่าแอด\n';
  const rows = (TMK.dailyAll || []).filter(r => r.year === t.yearBE && r.month === t.month).sort((a, b) => a.day - b.day);
  rows.forEach(r => {
    const rev = Object.values(r.ch || {}).reduce((s, c) => s + (c.rev || 0), 0);
    csv += [`${r.year - 543}-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`, rev, r.adSpend || 0].join(',') + '\n';
  });
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tmk-report-${t.yearBE}-${String(t.month).padStart(2, '0')}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
  logAudit({ action: 'export', entityType: 'data', entityName: `รายงาน ${monthTH} ${t.yearBE}`, summary: `ส่งออกรายงานรายเดือน ${monthTH} ${t.yearBE}` });
  if (window.__toast) window.__toast('ส่งออกรายงานเดือนนี้เรียบร้อย', 'success');
}

function GeneralSettings({ dark, setDark }) {
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
          <button className="btn btn-sm" onClick={() => setDark(d => !d)} style={{
            background: dark ? 'var(--accent)' : 'var(--surface-3)',
            color: dark ? '#fff' : 'var(--ink)',
            minWidth: 80,
          }}>
            <Icon name={dark ? 'moon' : 'sun'} />{dark ? 'เปิดอยู่' : 'ปิดอยู่'}
          </button>
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
        <div className="row between" style={{ padding: '12px 0' }}>
          <div><div className="sm" style={{ fontWeight: 600 }}>เตือนกรอกยอดขายวันนี้</div><div className="cap">เตือนเมื่อยังไม่ได้บันทึกยอดขายของวันนี้</div></div>
          <NotifToggle storeKey="tmk-notif-daily" />
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
        <div className="row between" style={{ padding: '12px 0' }}>
          <div><div className="sm" style={{ fontWeight: 600 }}>รายงานยอดขายเดือนนี้</div><div className="cap">สรุปต่อช่องทาง (เป้า/ยอด/ROAS) + ยอดรายวัน — สำหรับส่งผู้บริหาร</div></div>
          <button className="btn btn-sm btn-outline" onClick={exportMonthlyReportCSV}>
            <Icon name="external" /> รายงานเดือนนี้
          </button>
        </div>
      </div>

      {/* About */}
      <div className="card">
        <div className="card-head"><h3><Icon name="sparkle" /> เกี่ยวกับระบบ</h3></div>
        <div className="row between" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
          <div><div className="sm" style={{ fontWeight: 600 }}>เวอร์ชัน</div><div className="cap">ดูรายละเอียดที่แท็บ "อัปเดต"</div></div>
          <span className="chip chip-accent">v1.8.0</span>
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
function UpdatesView() {
  const updates = [
    { ver: '1.8.0', date: '9 มิ.ย. 2569', type: 'improvement', items: [
      'ความถูกต้องข้อมูล: ไม่ปัดเศษค่าจริง (ปัดเฉพาะตอนแสดงผล) · เดือนปัจจุบันคำนวณสดจากยอดรายวันเสมอ · กราฟ 3 เดือน/YoY ตามเดือนที่เลือก · ค่าธรรมเนียมแพลตฟอร์มจริงต่อช่องทาง (ไม่ใช่ 5% ตายตัว)',
      'แก้ย้อนหลัง/ล่วงหน้าได้ละเอียด: รายวัน (เลือกวันใดก็ได้/ลบได้/คัดลอกเมื่อวาน) · รายเดือนข้ามปี · เดือนอดีตที่กรอกย้อนหลังแสดงยอดจริง',
      'ความปลอดภัยการกรอก: เตือนเมื่อยอดผิดปกติ (พิมพ์ผิดหลัก) · กันกรอกยอดล่วงหน้า · กันเลขติดลบ · เห็นวันที่ยังไม่กรอกทั้งเดือน · เตือนกรอกยอดวันนี้',
      'สิทธิ์ผู้ใช้จริง: admin / แก้ไขได้ / ดูอย่างเดียว — viewer แก้ไม่ได้, จัดการผู้ใช้เฉพาะ admin',
      'เสถียรขึ้น: กันจอขาว (error boundary + กู้ session อัตโนมัติ) · เน็ตหลุด → รีเฟรชอัตโนมัติแทน realtime · modal เต็มจอบนมือถือ · กดบันทึกซ้ำไม่ได้',
      'ประวัติการใช้งานละเอียด (เก็บค่าที่กรอก + ก่อน→หลัง) · ออกรายงานยอดขายรายเดือน (CSV) · หน้าโหลดข้อมูล',
      'ผ่าน QA เชิงลึกหลายรอบ (ตรวจคำนวณ/ข้อมูล/อินพุตแปลกๆ/มือถือ) + cross-check กับ Supabase จริง',
    ]},
    { ver: '1.7.0', date: '8 มิ.ย. 2569', type: 'feature', items: [
      'ระบบเข้าสู่ระบบ: "จำการเข้าสู่ระบบ" (จำอีเมลไม่ต้องกรอกใหม่) + ออกจากระบบอัตโนมัติเมื่อไม่ได้ใช้งานครบ 7 วัน',
      'เพิ่ม "ลบงาน" ในฟอร์มงาน — ย้ายไปถังขยะ กู้คืน/ลบถาวรได้ (เดิมลบงานไม่ได้เลย)',
      'ปฏิทินปฏิบัติงาน: ชื่องานที่ยาวตัดขึ้นบรรทัดใหม่ (ไม่ถูกตัดด้วย …)',
      'บันทึกรายวัน: ปฏิทินเริ่มต้นที่ "วันอาทิตย์"',
      'แก้ Pace ให้ตรงกันทุกหน้า (หน้าบันทึกยอด = Dashboard)',
      'Empty state กราฟ "ยังไม่มีข้อมูล" สะอาดขึ้น + สีการ์ด ACOS ถูกต้อง (เขียวเมื่อต่ำกว่าเพดาน)',
      'ผ่าน QA Audit เชิงลึก (Validator + Simulator) — ทดสอบ CRUD + ถังขยะ ครบวงจรกับ Supabase จริง',
    ]},
    { ver: '1.6.0', date: '8 มิ.ย. 2569', type: 'improvement', items: [
      'รองรับมือถือ & แท็บเล็ตเต็มรูปแบบ — เมนูล่าง, เมนูลิ้นชัก, ปุ่มลัด (+), การ์ดเรียงอัตโนมัติ',
      'จัด UI ให้ขอบตรงกันทุกแถว (แถบเลือกเดือนเท่ากับการ์ดด้านล่าง)',
      'ช่องทางของงาน: ถ้าไม่ผูกแพลตฟอร์มจะแสดง "ไม่มี" (ไม่มีไอคอนหลอก) + เพิ่มปุ่ม "ไม่มี" ในฟอร์มงาน',
      'ทำความสะอาดระบบ: ลบไฟล์/โค้ดที่ไม่ใช้, รวมโค้ดซ้ำให้เป็นแหล่งเดียว',
      'กันบั๊ก: ค่าที่ไม่มีข้อมูลแสดง "—" (ไม่มี NaN), กันแครชทุกจุด',
    ]},
    { ver: '1.5.0', date: '8 มิ.ย. 2569', type: 'feature', items: [
      'ข้อมูลแยกตามเดือนทุกหน้า — เปลี่ยนไปเดือนอดีต/ปัจจุบัน/อนาคต ตัวเลขเปลี่ยนตามจริง',
      'บันทึกยอดรายวันเก็บครบต่อช่องทาง: ออร์เดอร์ / ลูกค้าใหม่-เก่า / แชท (ไม่หายอีก)',
      'เพิ่มการเก็บ "เวลาตอบแชทเฉลี่ย/วัน" → เฉลี่ยมาแสดงในการ์ด Facebook ของแต่ละเดือน',
      'ตั้งค่ารายเดือนแยกทุกเดือน (เป้า/งบ/เป้าต่อช่องทาง) + กรอกย้อนหลังไม่ทับค่าเดิม',
      'ย้ายปุ่มสร้างแคมเปญแอดไปที่ "ตั้งค่ารายเดือน" และ "สถานะ" + กรองแคมเปญตามเดือน',
      'ข้อมูลทั้งหมดดึงจาก Supabase จริง (ไม่มี mock) + ระบบถังขยะ/ประวัติ/แจ้งเตือนใช้งานได้จริง',
    ]},
    { ver: '1.4.0', date: '7 มิ.ย. 2569', type: 'feature', items: [
      'เพิ่มระบบ Onboarding Tour สำหรับผู้ใช้ใหม่',
      'เพิ่มระบบ Toast Notification หลังบันทึกข้อมูล',
      'เพิ่ม Help Center — คู่มือการใช้งานแบบละเอียด 3 ระดับ',
      'เพิ่มหน้าโปรไฟล์ — แก้ไขชื่อ/รูปโปรไฟล์ได้',
      'ปรับ UI สิทธิ์ผู้ใช้ — แก้ชื่อ/รูปลิงก์กับงานอัตโนมัติ',
    ]},
    { ver: '1.3.0', date: '5 มิ.ย. 2569', type: 'feature', items: [
      'เพิ่มระบบบันทึกยอดขาย 2 ขั้นตอน (กรอก → ตรวจสอบ)',
      'เพิ่มระบบ Month Navigator + Quarter View',
      'เพิ่ม Spotlight Search (⌘K)',
      'เพิ่มปุ่ม "+ เพิ่มงาน" ในทุก Kanban column',
    ]},
    { ver: '1.2.0', date: '3 มิ.ย. 2569', type: 'improvement', items: [
      'ปรับปรุงปฏิทิน — ช่องเท่ากัน, ไอคอนแพลตฟอร์ม, filter ทำงาน',
      'ปรับ Timeline เป็น vertical + filter controls',
      'ปรับ Kanban card style + drag-drop',
      'แก้ letter-spacing ทั้งระบบ',
    ]},
    { ver: '1.1.0', date: '1 มิ.ย. 2569', type: 'feature', items: [
      'เพิ่มหน้า Sales Dashboard ครบ 4 แท็บ',
      'เพิ่มระบบ Data Entry (รายวัน/รายเดือน/สถานะ)',
      'เพิ่ม Modal: เป้าหมายเดือน, แคมเปญแอด, กลุ่มลูกค้า, ย้อนหลัง',
      'Port ทั้งระบบจาก vanilla script เป็น Vite + React ES modules',
    ]},
    { ver: '1.0.0', date: '28 พ.ค. 2569', type: 'release', items: [
      'เปิดตัว TMK Operation',
      'หน้าหลัก Executive Dashboard',
      'ระบบจัดการงาน Planner (Calendar + Kanban)',
      'แคตตาล็อก (สินค้า + แคมเปญ + PO)',
      'ระบบ Login + Dark mode',
    ]},
  ];

  const typeLabel = { feature: { l: 'ฟีเจอร์ใหม่', cls: 'chip-good' }, improvement: { l: 'ปรับปรุง', cls: 'chip-accent' }, fix: { l: 'แก้ไข', cls: 'chip-warn' }, release: { l: 'เปิดตัว', cls: '' } };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ padding: 20, background: 'var(--accent-soft)', borderLeft: '4px solid var(--accent)' }}>
        <div className="row" style={{ gap: 10 }}>
          <Icon name="sparkle" />
          <div>
            <div className="h3">เวอร์ชันปัจจุบัน: {updates[0].ver}</div>
            <div className="cap">อัปเดตล่าสุด {updates[0].date}</div>
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', paddingLeft: 28 }}>
        {/* Vertical line */}
        <div style={{ position: 'absolute', left: 10, top: 0, bottom: 0, width: 2, background: 'var(--line)', borderRadius: 1 }}></div>

        {updates.map((u, ui) => {
          const t = typeLabel[u.type] || typeLabel.feature;
          return (
            <div key={u.ver} style={{ marginBottom: 24, position: 'relative' }}>
              <div style={{ position: 'absolute', left: -28, top: 4, width: 20, height: 20, borderRadius: '50%', background: ui === 0 ? 'var(--accent)' : 'var(--surface-3)', border: '2px solid var(--surface)', zIndex: 1, display: 'grid', placeItems: 'center' }}>
                {ui === 0 && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }}></span>}
              </div>
              <div className="card">
                <div className="row between" style={{ marginBottom: 10 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="h3">v{u.ver}</span>
                    <span className={`chip ${t.cls}`}>{t.l}</span>
                  </div>
                  <span className="cap">{u.date}</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {u.items.map((item, i) => (
                    <li key={i} className="sm" style={{ color: 'var(--ink-2)', lineHeight: 1.4 }}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ====================  PROFILE VIEW  ==================== */
export function ProfileView({ tasks }) {
  const { user } = useUser() || {};
  const { reload } = useData() || {};
  // hooks ต้องเรียกก่อน early return เสมอ (Rules of Hooks)
  const [name, setName] = useState(user?.name || '');
  const [tab, setTab] = useState('tasks');
  React.useEffect(() => {
    if (user?.name && user.name !== name) setName(user.name);
  }, [user?.name]);

  // Fallback if user context not ready
  if (!user) {
    return (
      <div className="content-inner rise">
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div className="cap" style={{ color: 'var(--ink-3)' }}>กำลังโหลดโปรไฟล์...</div>
        </div>
      </div>
    );
  }

  // Filter tasks — match user by:
  // 1. user.name (e.g. "มัง")
  // 2. user.department/duty (e.g. "MKT" — task says "MKT", user is MKT duty)
  // 3. email username (fallback)
  const myTasks = (tasks || DD.tasks || []).filter(t => {
    const resp = Array.isArray(t.responsible) ? t.responsible : String(t.responsible || '').split(',').map(s => s.trim());
    return resp.includes(user.name)
        || (user.department && resp.includes(user.department))
        || resp.includes(user.email.split('@')[0]);
  });
  const myDone = myTasks.filter(t => t.status === 'done').length;
  const myActive = myTasks.filter(t => t.status !== 'done').length;
  // Activity จาก audit log จริงที่ email ตรงกัน
  const myActivity = (DD.audit || []).filter(a => {
    return a.user === user.name || a.user === user.email.split('@')[0];
  });

  const saveProfile = async () => {
    if (!guardEdit()) return;
    try {
      // 1. Save to Supabase tmk_staff (ชื่อ + สี)
      const existingStaff = (DD.staff || []).find(s => s.email === user.email);
      const staffId = existingStaff?.id || ('s-' + user.email.replace(/[^a-z0-9]/gi, '').toLowerCase());
      const { error } = await supabase.from('tmk_staff').upsert({
        id: staffId,
        name: name.trim() || user.email.split('@')[0],
        role: existingStaff?.role || user.department || 'Staff',
        email: user.email,
        color: existingStaff?.color || user.color || '#3b82f6',
      });
      if (error) throw error;

      // 2. Sync ชื่อใน tmk_user_roles
      try {
        await supabase.from('tmk_user_roles').upsert({
          email: user.email,
          role: user.role,
          name: name.trim() || user.email.split('@')[0],
        });
      } catch (e) {
        console.warn('tmk_user_roles name sync failed (might be missing column):', e);
      }

      // 3. Cache to localStorage
      try {
        const saved = JSON.parse(localStorage.getItem('tmk-user') || '{}');
        localStorage.setItem('tmk-user', JSON.stringify({ ...saved, displayName: name }));
        window.dispatchEvent(new Event('tmk-user-change'));
      } catch {}

      logAudit({ action: 'update', entityType: 'user', entityName: name, summary: `แก้ไขโปรไฟล์ "${name}"` });

      // 4. Force reload data (in case realtime doesn't fire)
      if (reload) await reload();

      if (window.__toast) window.__toast('อัปเดตโปรไฟล์เรียบร้อย', 'success');
    } catch (err) {
      console.error(err);
      if (window.__toast) window.__toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    }
  };

  const roleLabel = user.role === 'admin' ? 'ผู้ดูแลระบบ' : user.role === 'editor' ? 'แก้ไขได้' : 'ดูอย่างเดียว';

  return (
    <div className="content-inner rise">
      {/* Profile Header */}
      <div className="card" style={{ padding: 24, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <UserIcon size={80} radius={20} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="row" style={{ gap: 10, marginBottom: 4 }}>
            <input className="input" value={name} onChange={e => setName(e.target.value)}
              style={{ fontSize: 'var(--fs-h2)', fontWeight: 700, border: 'none', background: 'transparent', padding: 0, borderBottom: '2px solid var(--line)', borderRadius: 0, maxWidth: 250 }} />
            <button className="btn btn-sm btn-primary" onClick={saveProfile}><Icon name="check" /> บันทึก</button>
          </div>
          <div className="cap" style={{ marginBottom: 8 }}>{user.email}</div>
          <div className="row" style={{ gap: 8 }}>
            <span className="chip chip-accent">{roleLabel}</span>
            {user.loginAt && (
              <span className="cap">เข้าใช้ครั้งล่าสุด {new Date(user.loginAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            )}
          </div>
        </div>
        <div className="grid g3" style={{ gap: 16, textAlign: 'center' }}>
          <div>
            <div className="num h1" style={{ color: 'var(--accent)' }}>{myTasks.length}</div>
            <div className="cap">งานทั้งหมด</div>
          </div>
          <div>
            <div className="num h1" style={{ color: 'var(--good)' }}>{myDone}</div>
            <div className="cap">เสร็จแล้ว</div>
          </div>
          <div>
            <div className="num h1" style={{ color: 'var(--warn)' }}>{myActive}</div>
            <div className="cap">กำลังทำ</div>
          </div>
        </div>
      </div>

      {/* Tab: My tasks / My activity */}
      <div className="segbar" style={{ marginBottom: 16, display: 'inline-flex' }}>
        <button className={'seg' + (tab === 'tasks' ? ' active' : '')} onClick={() => setTab('tasks')}><Icon name="listChecks" /> งานของฉัน ({myTasks.length})</button>
        <button className={'seg' + (tab === 'activity' ? ' active' : '')} onClick={() => setTab('activity')}><Icon name="clock" /> ประวัติของฉัน ({myActivity.length})</button>
      </div>

      {tab === 'tasks' && (
        <div className="card">
          {myTasks.length === 0 && <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--ink-4)' }}><div className="cap">ยังไม่มีงาน</div></div>}
          {myTasks.map(t => {
            const c = DD.campaigns.find(x => x.id === t.camp);
            const stMap = { todo: { l: 'รอทำ', c: 'var(--ink-3)' }, inprogress: { l: 'กำลังทำ', c: 'var(--info)' }, review: { l: 'รอตรวจ', c: 'var(--warn)' }, done: { l: 'เสร็จ', c: 'var(--good)' } };
            const st = stMap[t.status] || stMap.todo;
            return (
              <div key={t.id} role="button" tabIndex={0} onKeyDown={onCardKey} onClick={() => window.__openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] })}
                className="row" style={{ gap: 12, padding: '12px 14px', borderBottom: '1px solid var(--line-2)', cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: st.c, flexShrink: 0 }}></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="sm" style={{ fontWeight: 600, textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</div>
                  <div className="cap">{c?.name} · {t.date}</div>
                </div>
                <span className="cap" style={{ color: st.c, fontWeight: 600 }}>{st.l}</span>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'activity' && (
        <div className="card">
          {myActivity.length === 0 && <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--ink-4)' }}><div className="cap">ยังไม่มีประวัติ</div></div>}
          {myActivity.map((a, i) => {
            const m = actionMeta(a);
            return (
              <div key={i} className="row" style={{ gap: 12, padding: '12px 14px', borderBottom: '1px solid var(--line-2)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.c, flexShrink: 0 }}></span>
                <div style={{ flex: 1 }}>
                  <div className="sm" style={{ fontWeight: 600 }}>{m.l} · {ENTITY_TH[a.entity] || a.entity}</div>
                  <div className="cap">{a.summary}</div>
                </div>
                <span className="cap">{a.time}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ความหมายของแต่ละ action (ครอบคลุมทุกประเภท) — ใช้ร่วม AuditView + ProfileView
const ACTION_META = {
  create:  { l: 'สร้าง',      c: 'var(--good)',  g: 'create' },
  update:  { l: 'แก้ไข',      c: 'var(--info)',  g: 'update' },
  delete:  { l: 'ลบ',         c: 'var(--bad)',   g: 'delete' },
  purge:   { l: 'ลบถาวร',     c: 'var(--bad)',   g: 'delete' },
  restore: { l: 'กู้คืน',      c: 'var(--good)',  g: 'create' },
  move:    { l: 'ย้ายสถานะ',  c: 'var(--accent)',g: 'update' },
  export:  { l: 'ส่งออก',     c: 'var(--warn)',  g: 'update' },
  login:   { l: 'เข้าสู่ระบบ',  c: 'var(--good)',  g: 'auth' },
  logout:  { l: 'ออกจากระบบ',  c: 'var(--ink-3)', g: 'auth' },
};
const actionMeta = (a) => ACTION_META[a.action] || { l: a.action || 'อื่นๆ', c: 'var(--info)', g: a.type || 'update' };
const ENTITY_TH = { task:'งาน', product:'สินค้า', campaign:'แคมเปญ', channel:'ช่องทาง', duty:'หน้าที่', user:'ผู้ใช้', daily:'ยอดขายรายวัน', monthly:'รายเดือน', segment:'กลุ่มลูกค้า', adCampaign:'แคมเปญแอด', ad:'แคมเปญแอด', po:'PO / สต็อก', auth:'ระบบ', data:'ข้อมูล', settings:'ตั้งค่า', system:'ระบบ' };

function AuditView() {
  const [filter, setFilter] = useState('all');
  const types = [['all','ทั้งหมด'],['create','สร้าง'],['update','แก้ไข'],['delete','ลบ'],['auth','เข้า/ออกระบบ']];
  const list = filter === 'all' ? DD.audit : DD.audit.filter(a => actionMeta(a).g === filter);
  return (
    <div className="content-inner rise">
      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h3><span style={{color:'var(--accent)'}}><Icon name="clock" /></span> ประวัติการใช้งาน <span className="cap" style={{ fontWeight: 500 }}>({DD.audit.length})</span></h3>
          <div className="segbar" style={{ background: 'var(--surface-2)', flexWrap: 'wrap' }}>
            {types.map(t => <button key={t[0]} className={`seg ${filter===t[0]?'active':''}`} onClick={()=>setFilter(t[0])}>{t[1]}</button>)}
          </div>
        </div>
        <div>
          {list.length === 0 && <div className="cap" style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }}>ยังไม่มีประวัติ</div>}
          {list.map((a, i) => {
            const s = DD.staff.find(x => x.name === a.user) || { color: '#888' };
            const m = actionMeta(a);
            return (
              <div key={i} className="row" style={{ gap: 13, padding: '13px 4px', borderBottom: '1px solid var(--line-2)' }}>
                <Avatar name={a.user} color={s.color} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="sm"><strong>{a.user}</strong> · <span className="faint">{ENTITY_TH[a.entity] || a.entity}</span></div>
                  <div className="cap" style={{ marginTop: 2 }}>{a.summary}</div>
                  {/* สิ่งที่เปลี่ยน ก่อน→หลัง */}
                  {a.changes && a.changes.length > 0 && (
                    <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {a.changes.map((c, j) => (
                        <span key={j} className="chip" style={{ fontSize: 10, background: 'var(--surface-2)' }}>
                          {c.label}: <span style={{ color: 'var(--ink-4)', textDecoration: 'line-through' }}>{c.from}</span> → <span style={{ color: 'var(--accent-2)', fontWeight: 700 }}>{c.to}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {/* ค่าที่กรอก/บันทึก */}
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
                <span className="cap" style={{ width: 96, textAlign: 'right', flexShrink: 0, alignSelf: 'flex-start' }}>{a.time}</span>
              </div>
            );
          })}
        </div>
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
  const [editTarget, setEditTarget] = useState(0);
  const [editFee, setEditFee] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLogo, setNewLogo] = useState('');
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [newTarget, setNewTarget] = useState(0);

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
    setEditTarget(c.target || 0);
    setEditFee(c.platformFeePct || 0);
  };

  const saveEdit = async () => {
    if (!guardEdit()) return;
    setBusy(true);
    try {
      const payload = {
        name: editName.trim(),
        color: editColor,
        percentage: Number(editTarget) || 0,
      };
      // ลองรวม logo_url + platform_fee_pct ก่อน — fallback ตัดเฉพาะ column ที่ยังไม่มี
      try {
        const full = { ...payload, logo_url: editLogo, platform_fee_pct: Number(editFee) || 0 };
        const { error } = await supabase.from('tmk_channels').update(full).eq('id', editing);
        if (error && /(logo_url|platform_fee_pct)/.test(error.message)) {
          // มี column ไหนยังไม่มี → ตัดออกแล้วลองใหม่
          const retry = { ...payload };
          if (!/logo_url/.test(error.message)) retry.logo_url = editLogo;
          if (!/platform_fee_pct/.test(error.message)) retry.platform_fee_pct = Number(editFee) || 0;
          const r2 = await supabase.from('tmk_channels').update(retry).eq('id', editing);
          if (r2.error) throw r2.error;
          if (window.__toast) window.__toast('บางค่าไม่ได้บันทึก — ต้องรัน SQL migration (platform_fee_pct)', 'warn');
        } else if (error) throw error;
      } catch (err) {
        if (!/(logo_url|platform_fee_pct)/.test(err.message)) throw err;
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
        percentage: Number(newTarget) || 0,
        actual: 0,
        sort_order: maxOrder + 1,
      };
      let { error } = await supabase.from('tmk_channels').insert({ ...basePayload, logo_url: newLogo });
      if (error && /logo_url/.test(error.message)) {
        // fallback ถ้า column ไม่มี
        const res = await supabase.from('tmk_channels').insert(basePayload);
        if (res.error) throw res.error;
        if (window.__toast) window.__toast('รูปไม่ได้บันทึก — ต้องรัน SQL migration', 'warn');
      } else if (error) throw error;
      logAudit({ action: 'create', entityType: 'channel', entityName: name, summary: `เพิ่มช่องทาง "${name}"` });
      if (reload) await reload();
      setNewName(''); setNewLogo(''); setNewColor(PALETTE[0]); setNewTarget(0); setShowAdd(false);
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

        {showAdd && (
          <div style={{ padding: 16, background: 'var(--accent-soft)', borderRadius: 'var(--r-sm)', marginBottom: 12 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>เพิ่มช่องทางใหม่</div>
            <div className="col" style={{ gap: 10 }}>
              <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
                {/* Logo upload */}
                <div style={{ flexShrink: 0 }}>
                  <div className="cap" style={{ marginBottom: 4 }}>โลโก้ (PNG/SVG)</div>
                  <label style={{
                    display: 'grid', placeItems: 'center',
                    width: 80, height: 80, borderRadius: 12,
                    background: newLogo ? '#fff' : 'var(--surface)',
                    border: '2px dashed var(--line)',
                    cursor: 'pointer', position: 'relative', overflow: 'hidden',
                  }}>
                    {newLogo ? (
                      <img src={newLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      <div style={{ textAlign: 'center', color: 'var(--ink-3)' }}>
                        <div style={{ fontSize: 20 }}>📷</div>
                        <div className="cap" style={{ fontSize: 9 }}>คลิกอัปโหลด</div>
                      </div>
                    )}
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
                <div style={{ flex: 1 }}>
                  <div className="cap" style={{ marginBottom: 4 }}>ชื่อ *</div>
                  <input className="input" placeholder="เช่น Shopee, Instagram, TikTok" value={newName} onChange={e => setNewName(e.target.value)} />
                </div>
              </div>
              <div>
                <div className="cap" style={{ marginBottom: 4 }}>สีประจำช่องทาง</div>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  {PALETTE.map(c => (
                    <button key={c} onClick={() => setNewColor(c)} style={{
                      width: 30, height: 30, borderRadius: 8, background: c,
                      border: newColor === c ? '3px solid var(--ink)' : '3px solid transparent',
                      cursor: 'pointer', boxShadow: '0 0 0 1px var(--line)',
                    }}></button>
                  ))}
                </div>
              </div>
              <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-sm" onClick={() => setShowAdd(false)} disabled={busy}>ยกเลิก</button>
                <button className="btn btn-sm btn-primary" onClick={addChannel} disabled={!newName.trim() || busy}>
                  <Icon name="check" /> {busy ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {channels.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>
              <div className="cap">ยังไม่มีช่องทาง — กด "เพิ่มช่องทางใหม่" เพื่อเริ่ม</div>
            </div>
          )}
          {channels.map(c => {
            const isEditing = editing === c.id;
            const isOver = dragOver === c.id;

            if (isEditing) {
              return (
                <div key={c.id} style={{ padding: 14, background: 'var(--accent-soft)', borderRadius: 'var(--r-sm)', margin: '4px 0' }}>
                  <div className="eyebrow" style={{ marginBottom: 10 }}>แก้ไขช่องทาง</div>
                  <div className="col" style={{ gap: 10 }}>
                    <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
                      <div style={{ flexShrink: 0 }}>
                        <div className="cap" style={{ marginBottom: 4 }}>โลโก้</div>
                        <label style={{
                          display: 'grid', placeItems: 'center',
                          width: 80, height: 80, borderRadius: 12,
                          background: editLogo && editLogo.startsWith('data:') ? '#fff' : 'var(--surface)',
                          border: '2px dashed var(--line)',
                          cursor: 'pointer', overflow: 'hidden',
                        }}>
                          {editLogo && editLogo.startsWith('data:') ? (
                            <img src={editLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          ) : (
                            <div style={{ textAlign: 'center', color: 'var(--ink-3)' }}>
                              <div style={{ fontSize: 20 }}>📷</div>
                              <div className="cap" style={{ fontSize: 9 }}>คลิกอัปโหลด</div>
                            </div>
                          )}
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
                            try { setEditLogo(await readFileAsBase64(e.target.files?.[0])); }
                            catch (err) { if (window.__toast) window.__toast(String(err), 'error'); }
                          }} />
                        </label>
                        {editLogo && (
                          <button className="btn btn-sm" style={{ marginTop: 6, fontSize: 11, color: 'var(--bad)' }} onClick={() => setEditLogo('')}>
                            ลบรูป
                          </button>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="cap" style={{ marginBottom: 4 }}>ชื่อ</div>
                        <input className="input" value={editName} onChange={e => setEditName(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <div className="cap" style={{ marginBottom: 4 }}>สี</div>
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        {PALETTE.map(col => (
                          <button key={col} onClick={() => setEditColor(col)} style={{
                            width: 28, height: 28, borderRadius: 7, background: col,
                            border: editColor === col ? '3px solid var(--ink)' : '3px solid transparent',
                            cursor: 'pointer', boxShadow: '0 0 0 1px var(--line)',
                          }}></button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="cap" style={{ marginBottom: 4 }}>ค่าธรรมเนียมแพลตฟอร์ม (%) — ใช้คำนวณกำไร/มาร์จิ้นจริง</div>
                      <input className="input" type="number" min="0" max="100" step="0.01" style={{ maxWidth: 160 }}
                        value={editFee} onChange={e => setEditFee(e.target.value)} placeholder="0" />
                      <div className="cap" style={{ marginTop: 4, color: 'var(--ink-4)' }}>เช่น Shopee ~5–10%, ช่องทางตัวเอง (CRM) = 0</div>
                    </div>
                    <div className="row between">
                      <button className="btn btn-sm" style={{ color: 'var(--bad)' }} onClick={() => deleteChannel(c)} disabled={busy}>
                        <Icon name="trash" /> ลบ
                      </button>
                      <div className="row" style={{ gap: 8 }}>
                        <button className="btn btn-sm" onClick={() => setEditing(null)} disabled={busy}>ยกเลิก</button>
                        <button className="btn btn-sm btn-primary" onClick={saveEdit} disabled={!editName.trim() || busy}>
                          <Icon name="check" /> {busy ? 'บันทึก...' : 'บันทึก'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

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
                <span title="ลากเพื่อเรียงลำดับ" style={{ color: 'var(--ink-4)', flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="9" cy="6" r="1.5" fill="currentColor" /><circle cx="9" cy="12" r="1.5" fill="currentColor" /><circle cx="9" cy="18" r="1.5" fill="currentColor" />
                    <circle cx="15" cy="6" r="1.5" fill="currentColor" /><circle cx="15" cy="12" r="1.5" fill="currentColor" /><circle cx="15" cy="18" r="1.5" fill="currentColor" />
                  </svg>
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
      const { error } = await supabase.from('tmk_duties').insert({
        id,
        name,
        color: newColor,
        description: newDesc.trim(),
        sort_order: maxOrder + 1,
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

        {/* Add new duty form */}
        {showAdd && (
          <div style={{ padding: 16, background: 'var(--accent-soft)', borderRadius: 'var(--r-sm)', marginBottom: 12 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>เพิ่มหน้าที่ใหม่</div>
            <div className="col" style={{ gap: 10 }}>
              <div>
                <div className="cap" style={{ marginBottom: 4 }}>ชื่อหน้าที่ *</div>
                <input className="input" placeholder="เช่น Logistics, Customer Service" value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
              <div>
                <div className="cap" style={{ marginBottom: 4 }}>สีประจำหน้าที่</div>
                <div className="row" style={{ gap: 6 }}>
                  {PALETTE.map(c => (
                    <button key={c} onClick={() => setNewColor(c)} title={c} style={{
                      width: 32, height: 32, borderRadius: 8, background: c,
                      border: newColor === c ? '3px solid var(--ink)' : '3px solid transparent',
                      cursor: 'pointer', boxShadow: '0 0 0 1px var(--line)',
                    }}></button>
                  ))}
                </div>
              </div>
              <div>
                <div className="cap" style={{ marginBottom: 4 }}>คำอธิบาย</div>
                <input className="input" placeholder="เช่น ทีมจัดส่งสินค้า / แพ็คของ" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
              </div>
              <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-sm" onClick={() => setShowAdd(false)} disabled={busy}>ยกเลิก</button>
                <button className="btn btn-sm btn-primary" onClick={addDuty} disabled={!newName.trim() || busy}>
                  <Icon name="check" /> {busy ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Duties list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {duties.length === 0 && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink-3)' }}>
              <div className="cap">ยังไม่มีหน้าที่ — กด "เพิ่มหน้าที่ใหม่" เพื่อเริ่ม</div>
            </div>
          )}
          {duties.map(d => {
            const isEditing = editing === d.id;
            const count = userCount(d.id);

            if (isEditing) {
              return (
                <div key={d.id} style={{ padding: 14, background: 'var(--accent-soft)', borderRadius: 'var(--r-sm)', margin: '4px 0' }}>
                  <div className="eyebrow" style={{ marginBottom: 10 }}>แก้ไขหน้าที่</div>
                  <div className="col" style={{ gap: 10 }}>
                    <div>
                      <div className="cap" style={{ marginBottom: 4 }}>ชื่อ</div>
                      <input className="input" value={editName} onChange={e => setEditName(e.target.value)} />
                    </div>
                    <div>
                      <div className="cap" style={{ marginBottom: 4 }}>สี</div>
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        {PALETTE.map(c => (
                          <button key={c} onClick={() => setEditColor(c)} style={{
                            width: 28, height: 28, borderRadius: 7, background: c,
                            border: editColor === c ? '3px solid var(--ink)' : '3px solid transparent',
                            cursor: 'pointer', boxShadow: '0 0 0 1px var(--line)',
                          }}></button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="cap" style={{ marginBottom: 4 }}>คำอธิบาย</div>
                      <input className="input" value={editDesc} onChange={e => setEditDesc(e.target.value)} />
                    </div>
                    <div className="row between">
                      <button className="btn btn-sm" style={{ color: 'var(--bad)' }} onClick={() => deleteDuty(d)} disabled={busy}>
                        <Icon name="trash" /> ลบ {count > 0 && `(มี ${count} คน)`}
                      </button>
                      <div className="row" style={{ gap: 8 }}>
                        <button className="btn btn-sm" onClick={() => setEditing(null)} disabled={busy}>ยกเลิก</button>
                        <button className="btn btn-sm btn-primary" onClick={saveEdit} disabled={!editName.trim() || busy}>
                          <Icon name="check" /> {busy ? 'บันทึก...' : 'บันทึก'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

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
    admin: { l: 'ผู้ดูแลระบบ', cls: 'chip-accent' },
    editor: { l: 'แก้ไขได้', cls: 'chip-good' },
    viewer: { l: 'ดูอย่างเดียว', cls: '' }
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

  // New user form
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('editor');
  const [newDutyId, setNewDutyId] = useState(DUTIES[0]?.id || '');

  const startEdit = (u) => {
    setEditing(u.email);
    setEditName(u.name);
    setEditRole(u.role);
    setEditDutyId(u.dutyId || '');
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

  const cancelEdit = () => setEditing(null);

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
      setNewEmail(''); setNewName(''); setNewRole('editor'); setNewDutyId(DUTIES[0]?.id || '');
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

  return (
    <div className="content-inner rise">
      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', gap: 16, alignItems: 'start' }}>
        <div className="card">
          <div className="card-head"><h3><span style={{color:'var(--accent)'}}><Icon name="shield" /></span> สิทธิ์ผู้ใช้</h3></div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {users.map(u => {
              const isEditing = editing === u.email;
              const tasks = taskCount(u.name, u.department);
              const staffColor = DD.staff.find(s => s.name === u.name)?.color || 'var(--ink-3)';

              if (isEditing) {
                return (
                  <div key={u.email} style={{ padding: '16px 14px', borderBottom: '1px solid var(--line)', background: 'var(--accent-soft)', borderRadius: 'var(--r-sm)', margin: '0 -2px' }}>
                    <div className="eyebrow" style={{ marginBottom: 10 }}>แก้ไขโปรไฟล์</div>
                    {/* Avatar upload */}
                    <div className="row" style={{ gap: 14, marginBottom: 14 }}>
                      <UserIcon size={52} radius={14} />
                      <div style={{ flex: 1 }}>
                        <div className="cap" style={{ marginBottom: 4 }}>ชื่อที่แสดง (ลิงก์กับงาน)</div>
                        <input className="input" value={editName} onChange={e => setEditName(e.target.value)}
                          placeholder="ชื่อที่ใช้แสดงในระบบ" style={{ fontWeight: 600 }} />
                      </div>
                    </div>

                    <div className="cap" style={{ marginBottom: 4 }}>หน้าที่ (สำหรับมอบหมายงาน)</div>
                    {DUTIES.length === 0 ? (
                      <div className="cap" style={{ color: 'var(--warn)', marginBottom: 12 }}>
                        ยังไม่มีหน้าที่ — ไปสร้างที่แท็บ "หน้าที่" ก่อน
                      </div>
                    ) : (
                      <div className="chips-pick" style={{ marginBottom: 12 }}>
                        <button className={'pick' + (!editDutyId ? ' on' : '')} onClick={() => setEditDutyId('')}>
                          — ไม่ระบุ —
                        </button>
                        {DUTIES.map(d => (
                          <button key={d.id} className={'pick' + (editDutyId === d.id ? ' on' : '')} onClick={() => setEditDutyId(d.id)}>
                            <span className="dot-c" style={{ background: d.color }}></span>{d.name}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="cap" style={{ marginBottom: 4 }}>สิทธิ์การเข้าถึง</div>
                    <div className="segbar" style={{ marginBottom: 12 }}>
                      {Object.entries(roleMeta).map(([k, v]) => (
                        <button key={k} className={'seg' + (editRole === k ? ' active' : '')} onClick={() => setEditRole(k)}>{v.l}</button>
                      ))}
                    </div>

                    {tasks > 0 && (
                      <div className="cap" style={{ marginBottom: 10, color: 'var(--info)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Icon name="listChecks" /> เปลี่ยนชื่อจะอัปเดตอัตโนมัติใน {tasks} งานที่เกี่ยวข้อง
                      </div>
                    )}

                    <div className="row between">
                      <button className="btn btn-sm" style={{ color: 'var(--bad)' }} onClick={() => deleteUser(u.email)} disabled={busy}>
                        <Icon name="trash" /> ลบ
                      </button>
                      <div className="row" style={{ gap: 8 }}>
                        <button className="btn btn-sm" onClick={cancelEdit} disabled={busy}>ยกเลิก</button>
                        <button className="btn btn-sm btn-primary" onClick={saveEdit} disabled={!editName.trim() || busy}>
                          <Icon name="check" /> {busy ? 'กำลังบันทึก...' : 'บันทึก'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={u.email} className="row" style={{ gap: 12, padding: '12px 14px', borderBottom: '1px solid var(--line-2)' }}>
                  <UserIcon size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="sm" style={{ fontWeight: 600 }}>{u.name}</div>
                    <div className="cap">{u.email}</div>
                  </div>
                  {u.department && (
                    <span className="chip" style={{ background: (u.color || '#666') + '18', color: u.color || '#666', fontWeight: 600 }}>{u.department}</span>
                  )}
                  {tasks > 0 && (
                    <span className="cap" style={{ color: 'var(--ink-3)', flexShrink: 0 }}>{tasks} งาน</span>
                  )}
                  <span className={`chip ${roleMeta[u.role]?.cls || ''}`}>{roleMeta[u.role]?.l || u.role}</span>
                  <button className="btn btn-sm btn-ghost" onClick={() => startEdit(u)} title="แก้ไข">
                    <Icon name="pencil" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 14 }}>เพิ่มผู้ใช้ใหม่</div>
          <div className="col" style={{ gap: 12 }}>
            <div className="col" style={{ gap: 5 }}>
              <label className="cap" style={{ fontWeight: 600 }}>อีเมล *</label>
              <input className="input" placeholder="name@tmk.co" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
            </div>
            <div className="col" style={{ gap: 5 }}>
              <label className="cap" style={{ fontWeight: 600 }}>ชื่อที่แสดง</label>
              <input className="input" placeholder="เช่น คุณ A หรือชื่อทีม" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div className="col" style={{ gap: 5 }}>
              <label className="cap" style={{ fontWeight: 600 }}>หน้าที่</label>
              {DUTIES.length === 0 ? (
                <div className="cap" style={{ color: 'var(--warn)' }}>
                  ยังไม่มีหน้าที่ — สร้างที่แท็บ "หน้าที่" ก่อน
                </div>
              ) : (
                <div className="chips-pick">
                  {DUTIES.map(d => (
                    <button key={d.id} className={'pick' + (newDutyId === d.id ? ' on' : '')} onClick={() => setNewDutyId(d.id)}>
                      <span className="dot-c" style={{ background: d.color }}></span>{d.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="col" style={{ gap: 5 }}>
              <label className="cap" style={{ fontWeight: 600 }}>สิทธิ์การเข้าถึง</label>
              <div className="segbar">
                {Object.entries(roleMeta).map(([k, v]) => (
                  <button key={k} className={'seg' + (newRole === k ? ' active' : '')} onClick={() => setNewRole(k)}>{v.l}</button>
                ))}
              </div>
            </div>
            <button className="btn btn-primary" onClick={addUser}
              disabled={!newEmail.trim() || busy} style={{ width: '100%', opacity: (newEmail.trim() && !busy) ? 1 : 0.5 }}>
              <Icon name="userPlus" /> {busy ? 'กำลังบันทึก...' : 'เพิ่มผู้ใช้'}
            </button>
            <div className="cap" style={{ lineHeight: 1.5, marginTop: 4 }}>
              <strong>หน้าที่/แผนก</strong>: ใช้สำหรับมอบหมายงาน — แสดงเป็นผู้รับผิดชอบใน task, kanban, ปฏิทิน
            </div>
            <div className="cap" style={{ lineHeight: 1.5 }}>
              <strong>สิทธิ์</strong>: ผู้ดูแลจัดการทุกอย่าง · แก้ไขได้บันทึกข้อมูล · ดูอย่างเดียวเปิดดูได้แต่แก้ไม่ได้
            </div>
            <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--accent-soft)', borderRadius: 'var(--r-sm)', borderLeft: '3px solid var(--accent)' }}>
              <div className="cap" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                <Icon name="sparkle" /> บันทึกลง Supabase อัตโนมัติ — refresh แล้วข้อมูลยังอยู่
              </div>
            </div>
          </div>
        </div>
      </div>
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
  const load = async () => {
    setLoading(true);
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

  useEffect(() => { aliveRef.current = true; load(); return () => { aliveRef.current = false; }; }, []);

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
