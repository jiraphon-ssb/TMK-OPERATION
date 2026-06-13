/* ============================================================
   TMK Operation — Views part 2: Planner + Catalog + System
   ============================================================ */
import React, { useState, useEffect, useMemo } from 'react';
import { TMK } from './data.js';
import { B, P, N, Icon, stockMeta, Avatar, Ring, MiniArea, Bars, UserIcon, SIZES, ORDER_STATUSES, barcodeSVGString } from './components.jsx';
import { advanceOrderStatus, Modal } from './modals.jsx';
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
            <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
              {dayInfos.slice(0, 4).map((info, i) => <ChIcon key={i} info={info} size={16} />)}
              {dayInfos.length > 4 && <span style={{ fontSize: 8, color: 'var(--ink-3)', fontWeight: 700, display: 'grid', placeItems: 'center' }}>+{dayInfos.length - 4}</span>}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden', flex: 1, minHeight: 0 }}>
          {show.map(t => {
            const c = DD.campaigns.find(x => x.id === t.camp);
            return <span key={t.id} title={t.title + (c ? ` · ${c.name}` : '')} style={{ fontSize: 'var(--fs-micro)', fontWeight: 600, padding: '2px 5px', borderRadius: 4, background: (c?.color || '#888') + '22', color: c?.color || '#888', whiteSpace: 'normal', overflowWrap: 'anywhere', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.25, flexShrink: 0 }}>{t.title}</span>;
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
              <div className="cap" style={{ marginTop: 8 }}>ไม่มีงานในวันที่เลือก</div>
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
export function CatalogView({ sub }) {
  if (sub === 'campaigns') return <CampaignsView />;
  if (sub === 'po') return <POView />;
  if (sub === 'stock') return <StockView />;
  if (sub === 'report') return <SalesReportView />;
  if (sub === 'orders') return <OrdersView />;
  if (sub === 'customers') return <CustomersView />;
  return <ProductsView />;
}

function ProductsView() {
  const products = DD.products || [];
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('rank');   // rank | sold | stock | value | name
  const [filter, setFilter] = useState('all'); // all | lots | low | out
  const [cat, setCat] = useState('');           // '' = ทุกหมวด
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

  const ql = q.trim().toLowerCase();
  let list = products.filter(p => {
    if (ql && !`${p.name} ${p.sku || ''} ${p.barcode || ''} ${p.category || ''} ${p.supplier || ''}`.toLowerCase().includes(ql)) return false;
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

  const exportProductsCSV = () => {
    downloadCSV(`tmk-products-${todayISO()}.csv`, [{
      title: 'สินค้า', cols: ['ชื่อ', 'หมวดหมู่', 'SKU', 'บาร์โค้ด', 'ผู้ผลิต', 'ราคา', 'ขายแล้ว', 'รายได้', 'คงเหลือ', 'มูลค่าสต็อก', 'จุดสั่งซ้ำ'],
      rows: list.map(p => [p.name, p.category || '', p.sku || '', p.barcode || '', p.supplier || '', Math.round(p.price), p.units, Math.round(p.rev), p.onHand, Math.round(p.stockValue || 0), p.reorder]),
    }]);
    logAudit({ action: 'export', entityType: 'data', entityName: 'สินค้า', summary: 'ส่งออกรายการสินค้าเป็น CSV' });
    if (window.__toast) window.__toast('ส่งออก CSV เรียบร้อย', 'success');
  };

  const filters = [['all', 'ทั้งหมด'], ['lots', 'มีล็อต'], ['low', 'ใกล้หมด'], ['out', 'หมด']];
  const sorts = [['rank', 'ลำดับ'], ['sold', 'ขายดี'], ['stock', 'คงเหลือมาก'], ['value', 'มูลค่าสูง'], ['name', 'ชื่อ ก-ฮ']];

  return (
    <div className="content-inner rise">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3><span style={{ color: 'var(--accent)' }}><Icon name="bag" /></span> สินค้า {products.length > 0 && <span className="cap" style={{ fontWeight: 400 }}>({list.length}/{products.length})</span>}</h3>
          <div className="row" style={{ gap: 6 }}>
            {products.length > 0 && <button className="btn btn-sm btn-ghost" onClick={() => window.__openModal('label')} title="พิมพ์ป้ายราคา/บาร์โค้ด"><Icon name="bag" /> ป้าย</button>}
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
          </div>
        </>)}

        <div className="table-wrap"><table className="table">
          <thead><tr><th style={{ width: 34 }}>#</th><th>สินค้า</th><th style={{ textAlign: 'right' }}>ราคา</th><th style={{ textAlign: 'right' }}>ขายแล้ว</th><th style={{ textAlign: 'right' }}>รายได้</th><th style={{ textAlign: 'right' }}>คงเหลือ</th><th style={{ textAlign: 'right' }}>สถานะ</th></tr></thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }} className="cap">{products.length === 0 ? 'ยังไม่มีสินค้า — กด "เพิ่มสินค้า" เพื่อเริ่ม' : 'ไม่พบสินค้าที่ตรงกับเงื่อนไข'}</td></tr>
            )}
            {list.map((p, i) => {
              const sm = stockMeta(p.stock);
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
      const newRes = (p.reservations || []).filter(r => r.id !== rsvId);
      const { error } = await supabase.from('tmk_products').update({ reservations: newRes, updated_at: new Date().toISOString() }).eq('id', p.id);
      if (error) throw error;
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
            <div className="table-wrap" style={{ overflowX: 'auto' }}>
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
const _csvEsc = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
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
        setSales(sd.map(r => ({ productId: r.product_id, productName: r.product_name, category: r.category, price: Number(r.qty) ? Number(r.amount) / Number(r.qty) : 0, date: r.sale_date, day: r.sale_date, totalQty: Number(r.qty) || 0, totalAmount: Number(r.amount) || 0, totalCost: Number(r.cost) || 0, lines: Array.isArray(r.lines) ? r.lines : [] })));
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
    const rows = (sales || []).filter(s => inRange(s.day));
    const byProduct = {}, bySize = {}, byColor = {}, byCategory = {}, dailyMap = {};
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
    const aging = (DD.products || []).filter(p => (p.onHand || 0) > 0).map(p => {
      const sold = byProduct[p.id]?.qty || 0;
      const turnover = (p.onHand || 0) > 0 ? sold / p.onHand : 0;
      return { p, age: daysSince(p.oldestLotDate), onHand: p.onHand || 0, turnover };
    }).sort((a, b) => (b.age || 0) - (a.age || 0));
    return { prodById, hexByColor, rows, byProduct, totalQty, totalAmount, totalCost, totalProfit, margin,
             productRank, sizeRank, colorRank, catRank, maxSize, maxColor, dailyArr, monthlyArr, sellThrough, abc, abcCount, aging };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- DD.products เป็น mutable global → ใช้ version proxy
  }, [sales, range, version]);
  const { prodById, hexByColor, rows, totalQty, totalAmount, totalCost, totalProfit, margin,
          productRank, sizeRank, colorRank, catRank, maxSize, maxColor, dailyArr, monthlyArr, sellThrough, abc, abcCount, aging } = agg;
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
      { title: 'ยอดขายรายวัน', cols: ['วันที่', 'จำนวน', 'ยอดเงิน'], rows: dailyArr.map(d => [d.day, d.qty, Math.round(d.amount)]) },
      { title: 'ABC analysis', cols: ['กลุ่ม', 'สินค้า', 'ยอดเงิน', 'สะสม%'], rows: abc.map(p => [p.cls, p.name, Math.round(p.amount), p.cumPct.toFixed(1)]) },
      { title: 'อายุสต็อก/หมุนเวียน', cols: ['สินค้า', 'คงเหลือ', 'อายุ(วัน)', 'turnover'], rows: aging.map(({ p, age, onHand, turnover }) => [p.name, onHand, age == null ? '' : age, turnover.toFixed(2)]) },
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
            <div className="eyebrow" style={{ marginBottom: 14 }}>อายุสต็อก / การหมุนเวียน</div>
            {aging.length === 0 ? <div className="cap" style={{ color: 'var(--ink-4)' }}>ไม่มีสินค้าคงเหลือ</div> : (
              <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}><table className="table">
                <thead><tr><th>สินค้า</th><th style={{ textAlign: 'right' }}>เหลือ</th><th style={{ textAlign: 'right' }}>อายุ (วัน)</th><th style={{ textAlign: 'right' }}>turnover</th></tr></thead>
                <tbody>{aging.slice(0, 30).map(({ p, age, onHand, turnover }) => (
                  <tr key={p.id} onClick={() => window.__openModal('product', p)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{N(onHand)}</td>
                    <td className="num" style={{ textAlign: 'right', color: age != null && age > 90 ? 'var(--bad)' : age != null && age > 60 ? 'var(--warn)' : 'var(--ink)', fontWeight: age != null && age > 60 ? 700 : 400 }}>{age == null ? '—' : age}</td>
                    <td className="num" style={{ textAlign: 'right', color: turnover >= 1 ? 'var(--good)' : turnover > 0 ? 'var(--warn)' : 'var(--ink-4)' }}>{turnover ? turnover.toFixed(2) : '—'}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
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
                      <div className="cap" style={{ color: 'var(--ink-4)' }}>{(o.items || []).slice(0, 2).map(it => `${it.color} ${it.size}×${it.qty}`).join(', ')}{(o.items || []).length > 2 ? '…' : ''}{o.trackingNo ? ` · 📦${o.trackingNo}` : ''}</div>
                      <div className="row" style={{ gap: 4, marginTop: 6 }}>
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
  const customers = DD.customers || []; // 300 รายล่าสุดที่โหลดอยู่
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState(null); // ผลค้นหาจาก server (ครอบคลุมลูกค้านอกชุดล่าสุด)
  const [searching, setSearching] = useState(false);
  const [sort, setSort] = useState('spent'); // spent | orders | recent
  const [pageLimit, setPageLimit] = useState(50); // pagination ฝั่ง UI
  const ql = q.trim();

  // ค้นหาฝั่ง server (debounce 250ms) — กรณีลูกค้าจริงเกิน 300 ราย จะหาเจอนอกชุด
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading/clear flag ก่อน async fetch (จำเป็น)
    if (!ql) { setRemote(null); setSearching(false); return; }
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const { data } = await supabase.from('tmk_customers').select('*')
          .or(`name.ilike.%${ql}%,phone.ilike.%${ql}%,line.ilike.%${ql}%`)
          .limit(100);
        setRemote(data || []);
      } catch { setRemote([]); }
      finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(id);
  }, [ql]);

  // สร้างลิสต์: ถ้ามีคำค้น → รวม local+remote dedup; ไม่มีคำค้น → ใช้ local อย่างเดียว
  const baseList = useMemo(() => {
    if (!ql) return customers;
    const byId = new Map();
    [...customers, ...(remote || [])].forEach(c => byId.set(c.id, c));
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
          <h3><span style={{ color: 'var(--accent)' }}><Icon name="users" /></span> ลูกค้า {baseList.length > 0 && <span className="cap" style={{ fontWeight: 400 }}>({N(baseList.length)}{!ql && customers.length === 300 ? '+' : ''})</span>}</h3>
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
            <div className="table-wrap"><table className="table">
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
    { id: 'updates', label: 'อัปเดต', icon: 'sparkle' },
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
      {active === 'updates' && <UpdatesView />}
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
  const esc = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; }; // กัน CSV formula injection (Excel)
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
    year: m.year, month: m.month, target: m.target, actual: r2(m.actual), adSpend: r2(m.adSpend), orders: m.orders, newCust: m.newCust,
  }));
  // Audit log (200 แถวล่าสุดที่โหลดอยู่ — หน้า audit แยกมี pagination เต็มในอนาคต)
  const auditRows = (TMK.audit || []).map(a => ({
    ts: a.ts || '', user: a.user || '', action: a.action || '', entity: a.entityType || '', name: a.entityName || '', summary: a.summary || '',
  }));
  const sections = [
    ['ช่องทาง (Channels)', ['name', 'target', 'actual', 'orders', 'ad'], TMK.channels || []],
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
  const esc = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; }; // กัน CSV formula injection (Excel)
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
          <div><div className="sm" style={{ fontWeight: 600 }}>เวอร์ชัน</div><div className="cap">ดูรายละเอียดที่แท็บ "อัปเดต"</div></div>
          <span className="chip chip-accent">v2.0.0</span>
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
    { ver: '2.2.1', date: '13 มิ.ย. 2569', type: 'fix', items: [
      'แก้แจ้งเตือน PO ถึง/เลยกำหนด — เดิมเทียบวันที่ผิดรูปแบบทำให้เตือนคลาดเคลื่อน',
      'แก้การ์ด "ทีมวันนี้" — "เคลื่อนไหววันนี้" คลาดเวลาโซนเวลา (คนเข้าก่อน 7 โมงเช้าถูกนับเป็นเมื่อวาน)',
      'แก้บอร์ดออเดอร์ — ออเดอร์เก่าที่เพิ่งส่งวันนี้ไม่หายจากคอลัมน์ "ส่งแล้ว" อีก',
      'แก้ฟิลเตอร์ประวัติการใช้งาน "แก้ไข/สร้าง" ให้เห็นครบทุกประเภท (ขาย/ปรับสต็อก/จอง/ออเดอร์/รับเข้า/กู้คืน)',
      'แก้แจ้งเตือน "ยังไม่สรุปยอดเดือนก่อน" ที่เด้งหลอกทั้งที่กรอกรายวันครบแล้ว',
      'แก้จังหวะคัดลอกยอดเมื่อวาน — กันค่าที่กำลังโหลดมาทับค่าที่เพิ่งคัดลอก',
      'เสถียรขึ้น — กันจอขาวกรณีฐานข้อมูลยังไม่ถูกตั้งค่า + เก็บรายละเอียดสีข้อความแนวโน้มลูกค้า',
    ]},
    { ver: '2.2.0', date: '13 มิ.ย. 2569', type: 'feature', items: [
      'หน้าหลักมีการ์ด "ทีมวันนี้" — เห็นใครออนไลน์/ออฟไลน์แบบสด (จุดเขียว/เทา) · ใครเคลื่อนไหววันนี้ · งานค้างต่อคน + สรุปคนที่งานค้างมากสุด',
      'หน้าหลักมีการ์ด "แคมเปญ" — วงแหวนสรุป ทั้งหมด/กำลังรัน/เสี่ยง + แถบ "ต้องดูด่วน" ชี้แคมเปญที่ใกล้จบ/เลยกำหนด/ถูกพัก',
      'หน้าลูกค้า: เปลี่ยนกราฟแนวโน้มซื้อซ้ำเป็นกราฟ "ลูกค้าใหม่ vs เก่า รายสัปดาห์" — แท่งคู่เทียบกันต่อสัปดาห์ + เส้น %ซื้อซ้ำ ดูง่ายขึ้น',
      'จัดวางหน้าหลักใหม่ให้สมดุล — ซ้าย: โฟกัสวันนี้ · สรุปเมื่อวาน · แคมเปญ / ขวา: ทีมวันนี้ · อัพเดทล่าสุด',
      'ระบบ presence เบามาก (1 แถว/คน) — heartbeat ทุก ~45 วิ เฉพาะตอนเปิดแท็บ · อ่านแยกจากข้อมูลหลัก ไม่ทำให้แอปกระตุกตอนรีเฟรช',
    ]},
    { ver: '2.1.0', date: '12 มิ.ย. 2569', type: 'feature', items: [
      'ออดิทแดชบอร์ดเชิงลึก 4 มิติ (ความครบถ้วน/อ่านง่าย/กราฟ/โค้ด) แล้วแก้รวด 8 ชุด',
      'ภาพรวมยอดขาย: MoM กลางเดือนเทียบ "วันเดียวกัน" ของเดือนก่อน (เลิกแดงหลอกตา) · รวมเกณฑ์สี ROAS/ACOS/%เป้าให้ตรงกันทุกหน้า',
      'รายงาน CSV ครอบคลุมขึ้นมาก — เพิ่มยอดรายวันต่อช่องทาง · สรุปรายเดือน · ประวัติการใช้งาน เข้า Export ข้อมูลทั้งหมด · รายงานรายเดือนเลือกย้อนหลังได้ (เลือกเดือน/ปี)',
      'หน้าประวัติการใช้งานยกเครื่อง — pagination จริง (ดูทุกแถวได้, เดิมเห็นแค่ 200 ล่าสุด) + ค้นหา + กรองช่วงวันที่',
      'บอร์ดออเดอร์: ช่องค้นหา (รหัส/ลูกค้า/tracking) + คอลัมน์ "ส่งแล้ว" จำกัด 7 วันล่าสุด (กดดูทั้งหมดได้) — กันออเดอร์เก่าหายเมื่อทะลุ 500',
      'หน้าลูกค้า: ค้นหาฝั่ง server ครอบคลุมลูกค้าเก่ากว่า 300 ราย + เรียงตามยอดซื้อ/ออเดอร์/ล่าสุด + pagination',
      'กระดิ่งเตือนครอบคลุมขึ้น — ออเดอร์ค้างเกิน 2 วัน · PO ถึงกำหนด · ใช้งบโฆษณาเกินงบที่ตั้ง · pace ลูกค้าใหม่ช้ากว่าแผน (มี toggle แยก)',
      'เป้าลูกค้าใหม่ที่ตั้งไว้แล้ว ตอนนี้มี progress bar + %เป้า ในหน้า "ลูกค้า" (KPI ครบลูป)',
      'รองรับมือถือเต็มขั้น — กราฟทุกตัวรับ touch (ลากนิ้วดูค่ารายวันได้) · ป้ายแกน X เว้นช่วงไม่ทับกัน · หัวตารางและคอลัมน์แรก sticky ตอนเลื่อน · topbar บอก "หมวด · แท็บ" · segbar fade ขอบบอกว่าปัดได้',
      'ฟอร์มกรอกยอดสั้นลงเกือบครึ่ง — แถว "คนทัก/ลูกค้าใหม่-เก่า" ยุบเป็นปุ่ม + เปิดเองเฉพาะ FB/LINE หรือมีค่าเดิม',
      'กันยอดเพี้ยน — ล้อเมาส์ scroll ระหว่าง focus ที่ช่องเงินจะไม่เปลี่ยนค่าอีก',
      'รูปสินค้าไป Supabase Storage แทนการเก็บ base64 ในแถว DB (ลด payload ทุก reload จาก 30-75 MB ที่ 500 สินค้า เหลือ <200 ไบต์/แถว · browser cache รูปเอง)',
      'โหลดเร็วขึ้น — แยก bundle หน้าหนัก (Planner/แคตตาล็อก/ตั้งค่า/บันทึก/ทัวร์) เป็น chunk แยก · main bundle ลดจาก 906 kB เหลือ 730 kB',
      'ซิงค์เร็วขึ้น — เซฟ 1 ครั้ง refresh เฉพาะตารางที่เปลี่ยน (เลิก full reload 20 ตาราง × 2 รอบ) · ลูกค้า/รายวันจำกัดช่วงเวลา TTI ไม่โตตามอายุร้าน',
    ]},
    { ver: '2.0.0', date: '11 มิ.ย. 2569', type: 'feature', items: [
      'รื้อระบบนำทางใหม่ — แถบเมนูย่อย (ยอดขาย/แคตตาล็อก/วางแผน) เป็นแท็บแนวนอนเหมือนหน้าตั้งค่า · เลื่อนปัดได้บนมือถือ · พื้นที่แสดงผลกว้างขึ้น',
      'หน้าหลักใหม่ เน้นหลังบ้าน — "โฟกัสวันนี้" (สิ่งที่ต้องจัดการ) + "สรุปเมื่อวาน" (คัดลอกส่งไลน์ได้) + อัปเดต/ประวัติเป็นพระเอก (ไม่โชว์ยอด/เป้ากดดัน)',
      'ภาพรวมยอดขาย: ศูนย์เตือนยอดขาย (ค่าแอดเกินเพดาน/ยอดช้ากว่าแผน/ลืมกรอกยอด) · เปิดการ์ดกำไร-ขาดทุน (P&L) · กราฟรายวันมีเส้นเทียบเดือนก่อน + tooltip โผล่ที่ปลายแท่ง',
      'หน้าลูกค้าใหม่ — KPI ลูกค้าใหม่/เก่า · อัตราซื้อซ้ำ (Returning) · ต้นทุนหาลูกค้าใหม่ (CAC) + กราฟแนวโน้มลูกค้าซื้อซ้ำรายสัปดาห์ (จากจำนวนคนจริง)',
      'หน้าโฆษณา & แชท — แผง "เปรียบเทียบตามช่องทาง" เลือกช่องทางได้ (รายได้/ค่าแอด/ROAS/ACoS) ค่าเริ่มต้น Facebook + LINE',
      'ประวัติการใช้งานละเอียดสุด — เก็บทุกช่องทาง + ก่อน→หลังต่อตัวเลข (กรอกยอด/ตั้งเป้า/ย้อนหลัง/สลับโหมด/ลบ) ตรวจย้อนหลังได้ครบ',
      'มุมมองแอดมินใน Supabase — เพิ่ม view ภาษาไทยอ่านง่าย (ยอดรายวัน/เป้ารายเดือน/ประวัติ) + คำอธิบายทุกตาราง/คอลัมน์',
      'กันข้อมูลหาย — เซฟยอดรายวัน merge ช่องทางเดิมก่อนเขียน (ช่องที่ถูกลบจากรายการจะไม่สูญข้อมูลอดีต)',
      'รองรับมือถือทุกหน้า — สถิติในการ์ดไม่ตัดเป็นแถวยาว · ตัวเลขยาวพอดีการ์ด (ไม่ย่อ k/M) · chip เลือกเลื่อนแนวนอน · ไม่ล้นจอ',
      'ลดความรก — เอาหน้าโปรไฟล์ + ระบบช่วยเหลือออก · รวมการ์ดที่ซ้ำ (FB เจาะลึก) · การ์ดช่องทางสูงเท่ากันทุกใบ',
      'ผ่าน QA เชิงลึก (agent + ตรวจกับ Supabase จริง) — ไม่มี crash/NaN/ข้อมูลปลอม · เมตริกทุกตัวตรงกับฐานข้อมูลจริง',
    ]},
    { ver: '1.9.0', date: '10 มิ.ย. 2569', type: 'feature', items: [
      'หน้าใหม่ "บันทึก & ภาพรวมเดือน" — รวมบันทึกรายวัน + ภาพรวมเดือนในที่เดียว: ปฏิทินยอดขายรายวัน (คลิกกรอก/แก้) · รายการที่กรอก · เป้า&งบที่ตั้งไว้ (เป้า/งบต่อช่องทาง) · แคมเปญแอด · กลุ่มลูกค้า&ย้อนหลัง — เน้นข้อมูลดิบ ไม่โชว์ตัวเลขกดดัน',
      'ระบบออเดอร์ + ลูกค้า + ติดตามสถานะ: สร้างออเดอร์ → จองสต็อกอัตโนมัติ → "ส่งแล้ว" ตัดสต็อกจริง · บอร์ด Kanban เปลี่ยนสถานะ (ยืนยันก่อนตัดสต็อก/ยกเลิก) · ลิงก์ให้ลูกค้าติดตามสถานะเอง',
      'สต็อกแบบล็อต (ตาราง ไซส์ × สี) + รูปสินค้า + บาร์โค้ด/ป้ายสินค้า — สต็อกคิดจากผลรวมล็อตอัตโนมัติ',
      'แคมเปญแอดแยกรายเดือน + สถานะ (รอเริ่ม/กำลังรัน/หยุด/เสร็จสิ้น/ยกเลิก) แยกจากแคมเปญในปฏิทินวางแผน',
      'เงินโชว์ค่าจริง 2 ตำแหน่งสตางค์ทุกที่ (เลิกย่อ k/M, ตัด noise float) — กราฟใช้ป้ายย่อกันล้น ดูค่าเต็มตอนชี้',
      'กันยอดหาย: เดือนอดีตเลือกโหมด "รายเดือน/รายวัน" ชัดเจน + เตือนก่อนสลับ (ข้อมูลไม่ทับกัน)',
      'ผ่าน QA เชิงลึก: เช็คสิทธิ์บอร์ดออเดอร์ · กัน crash ล็อต legacy · เตือนสต็อกไม่พอตอนส่ง · กัน viewer เขียน DB · เก็บกวาด dead code',
    ]},
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
      'บันทึกยอดรายวันเก็บครบต่อช่องทาง: ออเดอร์ / ลูกค้าใหม่-เก่า / แชท (ไม่หายอีก)',
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
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const types = [['all','ทั้งหมด'],['create','สร้าง'],['update','แก้ไข'],['delete','ลบ'],['auth','เข้า/ออกระบบ']];

  useEffect(() => {
    let cancel = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag ก่อน async fetch (จำเป็น)
    setLoading(true);
    (async () => {
      let q = supabase.from('tmk_audit_logs').select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (dateFrom) q = q.gte('created_at', dateFrom);
      if (dateTo)   q = q.lte('created_at', dateTo + 'T23:59:59');
      if (search.trim()) q = q.ilike('details', `%${search.trim()}%`); // details เป็น text(JSON) — ค้นข้อความใน summary/entityName
      if (filter !== 'all') q = q.in('action', ACTION_GROUP[filter] || [filter]);
      const { data, count, error } = await q;
      if (cancel) return;
      if (error) { setRows([]); setTotal(0); }
      else { setRows(data || []); setTotal(count || 0); }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [page, filter, search, dateFrom, dateTo]);

  // แปลง raw row → format เดียวกับ TMK.audit (ใช้ helpers เดิม) — fallback หากแปลงไม่ได้
  const mapped = rows.map(r => {
    let d = {};
    try { d = typeof r.details === 'string' ? JSON.parse(r.details) : (r.details || {}); } catch { /* ignore */ }
    return {
      action: r.action || '',
      entity: d.entityType || '',
      user: r.user_email || 'system',
      summary: d.summary || '',
      changes: d.changes,
      fields: d.fields,
      time: new Date(r.created_at).toLocaleString('th-TH', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'short' }),
    };
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="content-inner rise">
      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h3><span style={{color:'var(--accent)'}}><Icon name="clock" /></span> ประวัติการใช้งาน <span className="cap" style={{ fontWeight: 500 }}>({N(total)})</span></h3>
          <div className="segbar" style={{ background: 'var(--surface-2)', flexWrap: 'wrap' }}>
            {types.map(t => <button key={t[0]} className={`seg ${filter===t[0]?'active':''}`} onClick={()=>{ setFilter(t[0]); setPage(0); }}>{t[1]}</button>)}
          </div>
        </div>
        {/* ค้นหา + กรองช่วงวันที่ */}
        <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input className="input" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="🔍 ค้นหา (สรุป/ชื่อ)" style={{ flex: '1 1 200px' }} />
          <input className="input" type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }} title="ตั้งแต่" style={{ flex: '0 0 auto' }} />
          <input className="input" type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }} title="ถึง" style={{ flex: '0 0 auto' }} />
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
                <div style={{ flex: 1, minWidth: 0 }}>
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
                <span className="cap" style={{ width: 96, textAlign: 'right', flexShrink: 0, alignSelf: 'flex-start' }}>{a.time}</span>
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
      const full = { ...payload, logo_url: editLogo, platform_fee_pct: Number(editFee) || 0 };
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
              <label className="row" style={{ gap: 8, cursor: 'pointer', alignItems: 'center' }}>
                <input type="checkbox" checked={newHasAd} onChange={e => setNewHasAd(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                <span className="sm">มีโฆษณา — เปิดช่องกรอกค่าแอด & แสดงในตารางโฆษณา</span>
              </label>
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
                    <label className="row" style={{ gap: 8, cursor: 'pointer', alignItems: 'center' }}>
                      <input type="checkbox" checked={editHasAd} onChange={e => setEditHasAd(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                      <span className="sm">มีโฆษณา — เปิดช่องกรอกค่าแอด & แสดงในตารางโฆษณา</span>
                    </label>
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

        <div className="card">
          <div className="card-head" style={{ marginBottom: 4 }}>
            <h3><span style={{ color: 'var(--accent)' }}><Icon name="userPlus" /></span> เพิ่มผู้ใช้ใหม่</h3>
          </div>
          <div className="cap" style={{ color: 'var(--ink-3)', marginBottom: 18 }}>กรอกข้อมูลเพื่อเพิ่มสมาชิกเข้าทีม</div>

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

            <button className="btn btn-primary" onClick={addUser}
              disabled={!newEmail.trim() || busy} style={{ width: '100%', justifyContent: 'center', padding: '11px', marginTop: 4, opacity: (newEmail.trim() && !busy) ? 1 : 0.5 }}>
              <Icon name="userPlus" /> {busy ? 'กำลังบันทึก...' : 'เพิ่มผู้ใช้'}
            </button>

            <div className="cap" style={{ display: 'flex', alignItems: 'flex-start', gap: 6, color: 'var(--ink-4)', lineHeight: 1.5 }}>
              <span style={{ color: 'var(--accent)', flexShrink: 0 }}><Icon name="sparkle" /></span>
              บันทึกลง Supabase อัตโนมัติ · ตั้งรหัสเข้าระบบให้ได้ภายหลังที่ปุ่มแก้ไข (ดินสอ)
            </div>
          </div>
        </div>
      </div>

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
