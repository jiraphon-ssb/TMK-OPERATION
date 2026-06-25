/* ============================================================
   TMK Operation — Views part 2: Planner + Catalog + System
   ============================================================ */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TMK } from './data.js';
import { B, P, N, Icon, Avatar, Ring, UserIcon, PageSkeleton, Skel, SkelTable, useDelayedFlag, useBeat } from './components.jsx';
import { Modal, MpImportModal, SideSheet } from './modals.jsx';
import { DonutChart, AreaTrend, HBars, MetricCard, Gauge, channelColor } from './charts.jsx';
import { SaleDashboard } from './saleDashboard.jsx';
import { ImportExportHub } from './saleImportHub.jsx';
import { SaleEntryView } from './saleEntry.jsx';
import { CrmView } from './saleCrm.jsx';
import { ShirtCatalogView } from './saleCatalog.jsx';
import { GOLDEN_DESIGNS, resolveDesign, suggestDesign } from './lib/shirtCatalog.js';
import { useData, computeMonth } from './dataContext.jsx';
import { supabase } from './lib/supabaseClient.js';
import { cachedFetchAll, cachedFetchRange, getDateBounds, ORDERS_SEL, SKUS_SEL } from './lib/saleData.js';
import { logAudit } from './lib/audit.js';
import { APP_VERSION } from './changelog.js';
import { getToday, parseTaskDate, todayISO, thaiDate, THAI_MONTHS as MONTHS_TH_SHORT, THAI_MONTHS_FULL as MONTHS_TH } from './lib/dateUtils.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch as ShadcnSwitch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox as ShadcnCheckbox } from '@/components/ui/checkbox';
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

/* Skeleton วางแผน: แถบกรอง + บอร์ดคอลัมน์ (การ์ดงาน) */
function PlannerSkeleton() {
  const counts = [3, 2, 3, 1];
  return (
    <div className="content-inner rise">
      <div className="row" style={{ gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>{Array.from({ length: 5 }).map((_, i) => <Skel key={i} w={i % 2 ? 90 : 64} h={28} r={8} />)}</div>
      <div className="row" style={{ gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {counts.map((n, c) => (
          <div key={c} style={{ flex: '1 1 160px', minWidth: 150 }}>
            <div className="row" style={{ gap: 8, marginBottom: 12 }}><Skel w="45%" h={12} /><Skel w={22} h={16} r={8} /></div>
            {Array.from({ length: n }).map((_, i) => <div key={i} className="card" style={{ marginBottom: 10, padding: 12 }}><Skel w="85%" h={12} /><Skel w="60%" h={9} style={{ marginTop: 9 }} /><div className="row" style={{ gap: 6, marginTop: 11 }}><Skel w={42} h={16} r={10} /><Skel w={42} h={16} r={10} /></div></div>)}
          </div>
        ))}
      </div>
    </div>
  );
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
  const beat = useBeat(350); // จังหวะ skeleton สั้นๆ ตอนเข้าหน้า ให้เหมือนหน้า Sale
  if (beat) return <PlannerSkeleton />;

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
                  <div style={{ minWidth: 0 }}><div className="cap">แคมเปญ</div><span className="badge badge-outline" style={{ background: `color-mix(in srgb, ${c?.color || '#888'} 16%, transparent)`, color: `color-mix(in srgb, ${c?.color || '#888'} 72%, var(--ink))`, maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'bottom' }}>{c?.name || '-'}</span></div>
                  <div><div className="cap">ช่องทาง</div><TaskChannels channel={t.channel} size={16} /></div>
                  <div><div className="cap">สถานะ</div><span className={`chip ${stCls[t.status] || ''}`} style={{ whiteSpace: 'nowrap' }}>{stLabel[t.status]}</span></div>
                </div>
                <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
                  <span className="cap" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>ผู้รับผิดชอบ:</span>
                  {(t.responsible || []).map(r => { const s = DD.staff.find(x => x.name === r) || { color: '#888' }; return <span key={r} className="badge badge-outline" style={{ background: `color-mix(in srgb, ${s.color} 16%, transparent)`, color: `color-mix(in srgb, ${s.color} 72%, var(--ink))`, whiteSpace: 'nowrap' }}>{r}</span>; })}
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
                <span className="badge badge-default">{list.length}</span>
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
                        <span className="badge badge-outline" style={{ background: c.color+'22', color: c.color }}>{c.name}</span>
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
                    {isToday && <span className="badge badge-secondary" style={{ marginLeft: 8 }}>วันนี้</span>}
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
                          <span className="badge badge-outline" style={{ background: (c?.color || '#888') + '22', color: c?.color || '#888' }}>{c?.name || '-'}</span>
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
// ดึงทุกแถว — PostgREST จำกัด ~1000 แถว/request → ต้องวนดึงเป็นหน้าๆ (กันรายงานเห็นไม่ครบ)
async function fetchAllRows(table, select, { eq, order, asc = true, pageSize = 1000 } = {}) {
  const out = []; let from = 0;
  for (let i = 0; i < 200; i++) {
    let q = supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (eq) for (const k in eq) q = q.eq(k, eq[k]);
    if (order) q = q.order(order, { ascending: asc, nullsFirst: false });
    const { data, error } = await q;
    if (error) return { error };
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { data: out };
}

/* ====================  รายงานรวมข้ามช่อง (marketplace multi-channel)  ==================== */
// eslint-disable-next-line no-unused-vars
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
      const o = await fetchAllRows('tmk_mp_orders', '*', { order: 'order_month', asc: false });
      if (cancel) return;
      if (o.error) { setErr(o.error.message || ''); setOrders([]); return; }
      const s = await fetchAllRows('tmk_mp_skus', 'order_no,source,channel,design,color,size,qty,line_sales,order_month');
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
  // M2.2 อัตรายกเลิก (ใช้ออเดอร์ status=cancelled ที่เก็บไว้)
  const cancelledCount = useMemo(() => (orders || []).filter(o => o.status === 'cancelled' && (month === 'all' || o.order_month === month) && (lens === 'all' || (o.job_type || 'ปลีก') === lens)).length, [orders, month, lens]);
  const cancelRate = (agg.orders + cancelledCount) > 0 ? (cancelledCount / (agg.orders + cancelledCount)) * 100 : 0;
  // M2.3 forecast: คาดเดือนหน้า = เฉลี่ย 3 เดือนล่าสุด (trailing) — ใช้ตอนดู "ทุกเดือน"
  const forecastNext = (() => { const a = agg.byMonth.map(m => m.value); if (a.length < 2) return 0; const last3 = a.slice(-3); return last3.reduce((x, y) => x + y, 0) / last3.length; })();
  // M1.2 cohort retention: group ลูกค้าตามเดือนแรกที่ซื้อ → % กลับมาเดือนถัดๆ
  const cohort = useMemo(() => {
    const firstMonth = {}, activity = {};
    (orders || []).filter(o => o.status !== 'cancelled' && o.customer_code).forEach(o => {
      const k = o.customer_code, m = o.order_month; if (!m) return;
      if (!firstMonth[k] || m < firstMonth[k]) firstMonth[k] = m;
      (activity[k] = activity[k] || new Set()).add(m);
    });
    const allMonths = [...new Set(Object.values(firstMonth))].sort();
    const monthIdx = Object.fromEntries(allMonths.map((m, i) => [m, i]));
    const cohorts = {};
    Object.keys(firstMonth).forEach(k => { const fm = firstMonth[k]; (cohorts[fm] = cohorts[fm] || { size: 0, ret: {} }); cohorts[fm].size++; (activity[k] || new Set()).forEach(m => { const off = monthIdx[m] - monthIdx[fm]; if (off >= 0) cohorts[fm].ret[off] = (cohorts[fm].ret[off] || 0) + 1; }); });
    return { allMonths, cohorts, maxOff: allMonths.length };
  }, [orders]);
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
  const SEG_HEX = { 'แชมป์': '#1faf6b', 'ลูกค้าประจำ': '#7c5cff', 'ลูกค้าใหม่': '#4c7dff', 'กำลังจะหาย': '#e39b2e', 'เคยภักดี (ห่างไป)': '#e0514a', 'ทั่วไป': '#8a909c' };
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
  // M2.5 ส่งออกรายงาน (ตามที่กรอง lens/เดือนอยู่)
  const exportReport = () => {
    const tag = `${month === 'all' ? 'ทุกเดือน' : month}${lens !== 'all' ? ' · ' + lens : ''}`;
    const blocks = [
      { title: `รายงานรวมข้ามช่อง (${tag})`, cols: ['สรุป', 'ค่า'], rows: [['ออเดอร์', agg.orders], ['ยอดขาย', Math.round(agg.sales)], ['จำนวนชิ้น', agg.qty], ['กำไรสุทธิ', Math.round(agg.profit)], ['เฉลี่ย/ออเดอร์', Math.round(agg.aov)]] },
      { title: 'แยกช่องทาง', cols: ['ช่องทาง', 'ออเดอร์', 'ยอดขาย', 'ค่าธรรมเนียม', 'กำไร'], rows: agg.byChannelFull.map(c => [c.name, c.count, Math.round(c.sales), Math.round(c.fee), Math.round(c.profit)]) },
      { title: 'ลายขายดี', cols: ['ลาย', 'ชิ้น', 'ยอดขาย'], rows: agg.byDesign.map(d => [d.name, d.qty, Math.round(d.value)]) },
      { title: 'ไซซ์', cols: ['ไซซ์', 'ชิ้น'], rows: agg.bySize.map(s => [s.name, s.qty]) },
      { title: 'สี', cols: ['สี', 'ชิ้น'], rows: agg.byColor.map(s => [s.name, s.qty]) },
      { title: 'เซลล์', cols: ['เซลล์', 'ออเดอร์', 'ยอดขาย'], rows: agg.bySales.map(s => [s.name, s.count, Math.round(s.value)]) },
      { title: 'จังหวัด', cols: ['จังหวัด', 'ออเดอร์', 'ยอดขาย'], rows: agg.byProv.map(s => [s.name, s.count, Math.round(s.value)]) },
    ];
    downloadCSV(`tmk-mp-report-${todayISO()}.csv`, blocks);
    window.__toast?.('ส่งออก CSV เรียบร้อย', 'success');
  };

  const importBtn = <button className="btn btn-sm btn-primary" onClick={() => setImportOpen(true)}><Icon name="external" /> นำเข้าไฟล์ขาย</button>;

  if (orders === null) return <PageSkeleton />;

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
          <div className="row" style={{ gap: 6 }}>{orders.length > 0 && !err && <button className="btn btn-sm btn-ghost" onClick={exportReport}><Icon name="external" /> CSV</button>}{importBtn}</div>
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
                  <div className="tabs-list" style={{ marginBottom: 10 }}>
                    <button className={'tabs-trigger' + (lens === 'all' ? ' active' : '')} onClick={() => setLens('all')}>ทั้งหมด</button>
                    {['ปลีก', 'ส่ง', 'OEM'].filter(j => jobTypes.includes(j)).map(j => <button key={j} className={'tabs-trigger' + (lens === j ? ' active' : '')} onClick={() => setLens(j)}>{j === 'OEM' ? 'OEM/ราชการ' : j}</button>)}
                  </div>
                )}
                <div className="row" style={{ gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button className={'pick' + (month === 'all' ? ' on' : '')} onClick={() => setMonth('all')}>ทุกเดือน</button>
                  {months.map(m => <button key={m} className={'pick' + (month === m ? ' on' : '')} onClick={() => setMonth(m)}>{m}</button>)}
                  {month !== 'all' && <span className="cap" style={{ marginLeft: 6 }}>เทียบ:</span>}
                  {month !== 'all' && <div className="tabs-list">{[['none', 'ปิด'], ['mom', 'เดือนก่อน'], ['yoy', 'ปีก่อน']].map(([id, l]) => <button key={id} className={'tabs-trigger' + (compare === id ? ' active' : '')} onClick={() => setCompare(id)}>{l}</button>)}</div>}
                </div>
                {cmpKpis && <div className="cap" style={{ marginBottom: 8, color: 'var(--ink-4)' }}>เทียบกับ {cmpKey}{cmpKpis.orders === 0 ? ' (ไม่มีข้อมูลงวดนั้น)' : ''}</div>}
                <div className="metric-grid">
                  <MetricCard label="ยอดขายรวม" value={B(agg.sales)} icon="sales" tone="var(--accent)" {...deltaProps(agg.sales, cmpKpis?.sales)} sub={`${N(agg.qty)} ชิ้น`} />
                  <MetricCard label="กำไรสุทธิ" value={B(agg.profit)} tone="var(--good)" {...deltaProps(agg.profit, cmpKpis?.profit)} sub={agg.sales > 0 ? `มาร์จิ้น ${Math.round(agg.profit / agg.sales * 100)}%` : ''} />
                  <MetricCard label="ออเดอร์" value={N(agg.orders)} icon="listChecks" {...deltaProps(agg.orders, cmpKpis?.orders)} sub={cancelledCount ? `ยกเลิก ${N(cancelledCount)}` : ''} />
                  <MetricCard label="เฉลี่ย/ออเดอร์" value={B(agg.aov)} {...deltaProps(agg.aov, cmpKpis?.aov)} sub={`${N(custs.length)} ลูกค้า`} />
                </div>
              </>)}
      </div>

      {orders.length > 0 && !err && (
        <div className="tabs-list" style={{ marginBottom: 16 }}>
          <button className={'tabs-trigger' + (tab === 'overview' ? ' active' : '')} onClick={() => setTab('overview')}>ภาพรวม</button>
          <button className={'tabs-trigger' + (tab === 'customers' ? ' active' : '')} onClick={() => setTab('customers')}>ลูกค้า (CRM)</button>
          <button className={'tabs-trigger' + (tab === 'sales' ? ' active' : '')} onClick={() => setTab('sales')}>เซลล์ & เป้า</button>
          {batches.length > 0 && <button className={'tabs-trigger' + (tab === 'history' ? ' active' : '')} onClick={() => setTab('history')}>ประวัตินำเข้า</button>}
        </div>
      )}

      {orders.length > 0 && !err && tab === 'overview' && (<>
        {(() => {
          const ins = [];
          if (cmpKpis && cmpKpis.sales > 0) { const d = ((agg.sales - cmpKpis.sales) / cmpKpis.sales) * 100; ins.push({ tone: d >= 0 ? 'var(--good)' : 'var(--bad)', icon: d >= 0 ? 'up' : 'down', text: `ยอดขายเดือนนี้ ${d >= 0 ? 'โต' : 'ลด'} ${Math.abs(d).toFixed(0)}% เทียบ ${cmpKey}`, act: null }); }
          if (agg.byDesign[0]) ins.push({ tone: 'var(--accent)', icon: 'bag', text: `ลายขายดีสุด: ${agg.byDesign[0].name} (${N(agg.byDesign[0].qty)} ชิ้น)`, act: () => setDrill({ dim: 'design', value: agg.byDesign[0].name, label: `ลาย ${agg.byDesign[0].name}` }) });
          const bestMargin = agg.byChannelFull.filter(c => c.cost > 0 && c.sales > 0).map(c => ({ name: c.name, m: c.profit / c.sales * 100 })).sort((a, b) => b.m - a.m)[0];
          if (bestMargin) ins.push({ tone: 'var(--good)', icon: 'sales', text: `ช่องกำไรดีสุด: ${bestMargin.name} (มาร์จิ้น ${bestMargin.m.toFixed(0)}%)`, act: null });
          if (winBack.length > 0) ins.push({ tone: 'var(--warn)', icon: 'users', text: `ลูกค้าควรตามกลับ ${N(winBack.length)} ราย`, act: () => setTab('customers') });
          if (cancelRate > 5) ins.push({ tone: 'var(--bad)', icon: 'warn', text: `อัตรายกเลิก ${cancelRate.toFixed(0)}% (${N(cancelledCount)} ออเดอร์) — ตรวจสอบ`, act: null });
          if (month !== 'all' && overallTarget > 0 && isCurMonth && agg.sales < overallTarget * (daysElapsed / daysInMonth)) ins.push({ tone: 'var(--bad)', icon: 'sales', text: `ยอดช้ากว่าเป้า — คาดสิ้นเดือน ${B(projectedSales)} / เป้า ${B(overallTarget)}`, act: () => setTab('sales') });
          if (!ins.length) return null;
          return (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>สิ่งที่ควรดู</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {ins.slice(0, 5).map((x, i) => (
                  <div key={i} onClick={x.act || undefined} className="row" style={{ gap: 10, alignItems: 'center', padding: '9px 12px', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', borderLeft: `3px solid ${x.tone}`, cursor: x.act ? 'pointer' : 'default' }}>
                    <span style={{ color: x.tone, flexShrink: 0 }}><Icon name={x.icon} /></span>
                    <span style={{ fontWeight: 500, flex: 1 }}>{x.text}</span>
                    {x.act && <span style={{ color: 'var(--ink-4)' }}><Icon name="arrowR" /></span>}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
        {monthlyArr.length > 1 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="row between" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
              <div className="eyebrow">ยอดขายรายเดือน</div>
              {forecastNext > 0 && <span className="cap">คาดเดือนหน้า ~<b style={{ color: 'var(--accent-2)' }}>{B(forecastNext)}</b> (เฉลี่ย 3 เดือนล่าสุด)</span>}
            </div>
            {(() => { const labels = [...monthlyArr.map(m => m.m), forecastNext > 0 ? 'คาด' : null].filter(Boolean); const values = [...monthlyArr.map(m => m.rev), forecastNext > 0 ? null : undefined].filter(v => v !== undefined); const fc = monthlyArr.map(() => null); if (forecastNext > 0) { fc[monthlyArr.length - 1] = monthlyArr[monthlyArr.length - 1].rev; fc.push(forecastNext); } return <AreaTrend labels={labels} values={values} forecast={forecastNext > 0 ? fc : []} height={170} ariaLabel="ยอดขายรายเดือน" />; })()}
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
                {hasFee && <div className="tabs-list"><button className={'tabs-trigger' + (chMode === 'sales' ? ' active' : '')} onClick={() => setChMode('sales')}>เรียงยอดขาย</button><button className={'tabs-trigger' + (chMode === 'profit' ? ' active' : '')} onClick={() => setChMode('profit')}>เรียงกำไรจริง</button></div>}
              </div>
              <div className="grid g2" style={{ gap: 16, marginBottom: 12, alignItems: 'center' }}>
                <div style={{ maxWidth: 260, margin: '0 auto', width: '100%' }}><DonutChart data={chs.map(c => ({ label: c.name, value: c.sales, color: channelColor(c.name) }))} height={190} ariaLabel="สัดส่วนยอดขายแยกช่องทาง" /></div>
                <div style={{ display: 'grid', gap: 6 }}>{chs.slice(0, 7).map(c => { const share = agg.sales > 0 ? (c.sales / agg.sales) * 100 : 0; return (
                  <div key={c.name} className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: channelColor(c.name), flexShrink: 0 }} />
                    <span className="sm" style={{ flex: 1, fontWeight: 600 }}>{c.name}</span>
                    <span className="num sm" style={{ fontWeight: 700 }}>{B(c.sales)}</span>
                    <span className="num cap" style={{ width: 34, textAlign: 'right' }}>{P(share, 0)}</span>
                  </div>
                ); })}</div>
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
          {agg.byDesign.length === 0 ? <div className="cap" style={{ color: 'var(--ink-4)' }}>ยังไม่มีข้อมูล SKU</div> : (<>
            <HBars data={agg.byDesign.slice(0, 8).map(d => ({ label: d.name, value: d.qty }))} height={232} unit="ชิ้น" ariaLabel="ลายขายดี" />
            <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto', marginTop: 12 }}><table className="table">
              <thead><tr><th style={{ width: 34 }}>#</th><th>ลาย</th><th style={{ textAlign: 'right' }}>ชิ้น</th><th style={{ textAlign: 'right' }}>ยอดขาย</th></tr></thead>
              <tbody>{agg.byDesign.slice(0, 15).map((d, i) => (
                <tr key={d.name} onClick={() => setDrill({ dim: 'design', value: d.name, label: `ลาย ${d.name}` })} style={{ cursor: 'pointer' }}><td className="num faint" style={{ fontWeight: 700 }}>{i + 1}</td><td style={{ fontWeight: 600 }}>{d.name}</td><td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{N(d.qty)}</td><td className="num" style={{ textAlign: 'right' }}>{B(d.value)}</td></tr>
              ))}</tbody>
            </table></div>
          </>)}
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
            <div className="row between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 6 }}>
              <div className="eyebrow">จังหวัด (Top 10)</div>
              {agg.byProv.length > 0 && <span className="cap">5 จังหวัดแรก = {P(agg.sales > 0 ? agg.byProv.slice(0, 5).reduce((a, x) => a + x.value, 0) / agg.sales * 100 : 0, 0)} ของยอด</span>}
            </div>
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
                {segGroups.length > 1 && <div style={{ maxWidth: 200, margin: '0 auto 12px' }}><DonutChart data={segGroups.map(s => ({ label: s.name, value: s.count, color: SEG_HEX[s.name] || '#8a909c' }))} height={160} ariaLabel="กลุ่มลูกค้า RFM" /></div>}
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
                      <tr key={c.code}><td style={{ fontWeight: 600 }}>{c.name}{c.social && <div className="cap">{c.social}</div>}</td><td><span className="badge badge-outline" style={{ color: SEG_TONE[c.seg] }}>{c.seg}</span></td><td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{B(c.lifeSpent || c.spend)}</td></tr>
                    ))}</tbody>
                  </table></div>
                )}
              </div>
            </div>

            {cohort.allMonths.length > 1 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="eyebrow" style={{ marginBottom: 14 }}>การกลับมาซื้อ (cohort retention) — % ลูกค้าที่กลับมาในเดือนถัดๆ</div>
                <div className="table-wrap table-sticky-first"><table className="table">
                  <thead><tr><th>เริ่มซื้อเดือน</th><th style={{ textAlign: 'right' }}>ลูกค้า</th>{cohort.allMonths.map((_, off) => <th key={off} style={{ textAlign: 'center' }}>+{off}</th>)}</tr></thead>
                  <tbody>{cohort.allMonths.map((cm, ci) => { const c = cohort.cohorts[cm] || { size: 0, ret: {} }; return (
                    <tr key={cm}>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{cm}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{N(c.size)}</td>
                      {cohort.allMonths.map((_, off) => { if (ci + off >= cohort.allMonths.length) return <td key={off} />; const pct = c.size ? ((c.ret[off] || 0) / c.size) * 100 : 0; const a = pct / 100; return (
                        <td key={off} className="num" style={{ textAlign: 'center', background: pct ? `color-mix(in srgb, var(--good) ${Math.round(a * 75 + 6)}%, transparent)` : 'transparent', color: a > 0.55 ? '#fff' : 'var(--ink)' }}>{pct ? P(pct, 0) : '·'}</td>
                      ); })}
                    </tr>
                  ); })}</tbody>
                </table></div>
                <div className="cap" style={{ marginTop: 8, color: 'var(--ink-4)' }}>+0 = เดือนแรก (100%) · +1 = กลับมาซื้อเดือนถัดไป ฯลฯ — ยิ่งเข้มยิ่งรักษาลูกค้าได้ดี</div>
              </div>
            )}

            <div className="card" style={{ marginBottom: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 14 }}>ลูกค้าใช้จ่ายสูงสุด — ช่วงนี้ (Top 20)</div>
              <div className="table-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}><table className="table">
                <thead><tr><th style={{ width: 34 }}>#</th><th>ลูกค้า</th><th style={{ textAlign: 'right' }}>ออเดอร์</th><th style={{ textAlign: 'right' }}>ชิ้น</th><th style={{ textAlign: 'right' }}>ยอดซื้อ</th><th>ช่องทาง</th></tr></thead>
                <tbody>{topSpend.slice(0, 20).map((c, i) => (
                  <tr key={c.code} onClick={() => setDrill({ dim: 'customer_code', value: c.code, label: c.name })} style={{ cursor: 'pointer' }}>
                    <td className="num faint" style={{ fontWeight: 700 }}>{i + 1}</td>
                    <td><div style={{ fontWeight: 600 }}>{c.name}</div>{c.lifeOrders >= 2 && <span className="badge badge-secondary" style={{ marginTop: 2 }}>ประจำ · สะสม {N(c.lifeOrders)} ออเดอร์</span>}</td>
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
                    <div style={{ maxWidth: 240, margin: '0 auto 8px' }}><Gauge value={agg.sales} max={overallTarget} sub={`${B(agg.sales)} / ${B(overallTarget)}`} height={150} /></div>
                    <div className="bar" style={{ height: 12, position: 'relative' }}>
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
// M0.2 delta props สำหรับ MetricCard
function deltaProps(cur, prev) {
  if (prev == null || !prev) return {};
  const d = ((cur - prev) / prev) * 100;
  return { delta: `${Math.abs(d).toFixed(0)}%`, deltaUp: d >= 0 };
}
// M0.2 delta pill เทียบงวด
// eslint-disable-next-line no-unused-vars
function DeltaPill({ cur, prev }) {
  if (prev == null) return null;
  if (!prev) return cur > 0 ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--good)' }}>ใหม่</span> : null;
  const d = ((cur - prev) / prev) * 100, up = d >= 0;
  return <span style={{ fontSize: 11, fontWeight: 700, color: up ? 'var(--good)' : 'var(--bad)' }}>{up ? '▲' : '▼'}{Math.abs(d).toFixed(0)}%</span>;
}

function ReportHub() {
  return <SaleDashboard />;
}

/* ==================== สุขภาพข้อมูล (Import Health) + จัดการ Alias ชื่อพ้อง ==================== */
const flagOfAttrs = (a) => { if (!a) return ''; if (typeof a === 'string') { try { return JSON.parse(a).flag || ''; } catch { return ''; } } return a.flag || ''; };
function groupAnoms(rows, keyf) {
  const o = {};
  rows.forEach(r => { const k = keyf(r); if (!k) return; (o[k] = o[k] || { key: k, count: 0, qty: 0, channels: new Set(), sample: '' }); o[k].count++; o[k].qty += Number(r.qty) || 0; if (r.channel) o[k].channels.add(r.channel); if (!o[k].sample) o[k].sample = r.raw_sku_or_name || ''; });
  return Object.values(o).map(v => ({ ...v, channels: [...v.channels] })).sort((a, b) => b.count - a.count);
}
const Sec = ({ title, icon, tone, items, empty, action, onDetail }) => (
  <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
    <div className="row between" style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)', background: 'var(--surface-2, var(--surface))' }}>
      <span className="row" style={{ gap: 8, fontWeight: 700 }}><span style={{ color: tone }}><Icon name={icon} /></span> {title}</span>
      <span className="badge badge-outline" style={{ background: items.length ? 'var(--warn-bg, rgba(227,155,46,.14))' : 'var(--good-bg, rgba(31,175,107,.14))', color: items.length ? 'var(--warn)' : 'var(--good)' }}>{items.length ? `${N(items.length)} รายการ` : 'ปกติ'}</span>
    </div>
    {items.length === 0
      ? <div style={{ padding: '14px', color: 'var(--ink-4)', fontSize: 13 }}>{empty}</div>
      : <div style={{ maxHeight: 320, overflow: 'auto' }}><table className="table" style={{ width: '100%' }}><tbody>
        {items.map((d, i) => (
          <tr key={i} style={{ borderTop: i ? '1px solid var(--line)' : 'none' }}>
            <td style={{ padding: '8px 14px' }}><b>{d.key}</b>{d.sample && d.sample !== d.key ? <div className="cap" style={{ color: 'var(--ink-4)' }}>{String(d.sample).slice(0, 38)}</div> : null}</td>
            <td className="num" style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{N(d.count)} แถว · {N(d.qty)} ชิ้น</td>
            <td className="cap" style={{ padding: '8px 10px', color: 'var(--ink-3)' }}>{d.channels.join(', ')}</td>
            <td style={{ padding: '6px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
              <button className="btn btn-sm" onClick={() => onDetail({ title, icon, tone, item: d })}><Icon name="search" /> ดู</button>
              {action && <button className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => action(d.key)}><Icon name="plus" /> {action.label}</button>}
            </td>
          </tr>
        ))}
      </tbody></table></div>}
  </div>
);

function HealthHub() {
  const [skus, setSkus] = useState(null);
  const [aliases, setAliases] = useState([]);
  const [noTable, setNoTable] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState(null); // { kind, term, code, design }
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const s = await fetchAllRows('tmk_mp_skus', 'source,channel,design,color,product_code,qty,raw_sku_or_name,attrs,match_how');
    if (s.error) { setErr(s.error.message); return; }
    setSkus(s.data);
    const a = await supabase.from('tmk_mp_aliases').select('*').order('created_at', { ascending: false });
    if (a.error) { setNoTable(true); setAliases([]); } else { setNoTable(false); setAliases(a.data || []); }
  };
  useEffect(() => { load(); }, []);

  const A = useMemo(() => {
    const rows = skus || [];
    const newDesigns = groupAnoms(rows.filter(r => r.design && !String(r.product_code || '').trim()), r => r.design);
    const newColors = groupAnoms(rows.filter(r => flagOfAttrs(r.attrs) === 'color_new'), r => r.color);
    const unmatched = groupAnoms(rows.filter(r => !r.design), r => `${r.channel || '?'} · ${r.color || '—'}`);
    const matched = rows.filter(r => r.design).length;
    const withCode = rows.filter(r => String(r.product_code || '').trim()).length;
    return { newDesigns, newColors, unmatched, total: rows.length, matched, withCode };
  }, [skus]);

  // เปิดฟอร์ม alias — ถ้าเป็นลาย ลองให้ resolver แนะนำลาย golden + รหัสให้อัตโนมัติ
  const openAlias = (kind, term) => {
    if (kind === 'design') { const g = resolveDesign(term); setForm({ kind, term: term || '', code: g ? g.code : '', design: g ? g.name : '' }); }
    else setForm({ kind, term: term || '', code: '', design: '' });
  };
  const saveAlias = async () => {
    if (!form || !form.term.trim()) return;
    setBusy(true);
    const term = form.term.trim();
    const id = `${form.kind}:${term.toLowerCase()}`;
    const row = { id, kind: form.kind, term, code: (form.code || '').trim(), design: (form.design || '').trim(), updated_at: new Date().toISOString() };
    const { error } = await supabase.from('tmk_mp_aliases').upsert(row, { onConflict: 'id' });
    setBusy(false);
    if (error) { window.__toast && window.__toast(noTable ? 'ต้องรัน migration tmk_mp_aliases ก่อน' : 'บันทึกไม่สำเร็จ: ' + error.message, 'error'); return; }
    window.__toast && window.__toast('ตั้ง alias แล้ว — จะมีผลรอบนำเข้าถัดไป', 'success');
    logAudit({ action: 'create', entityType: 'data', entityName: 'alias', summary: `ตั้ง alias ${form.kind} "${term}"${row.code ? ' → ' + row.code : ''}` });
    setForm(null); load();
  };
  const delAlias = async (id) => { const { error } = await supabase.from('tmk_mp_aliases').delete().eq('id', id); if (error) { window.__toast && window.__toast('ลบไม่สำเร็จ', 'error'); return; } load(); };

  if (skus === null && !err) return <PageSkeleton />;
  if (err) return <div className="content-inner"><div className="card" style={{ padding: 20, color: 'var(--bad)' }}>โหลดข้อมูลไม่ได้: {err}</div></div>;

  const matchPct = A.total ? Math.round(A.matched / A.total * 100) : 0;

  return (
    <div className="content-inner" style={{ display: 'grid', gap: 14 }}>
      {noTable && <div className="card" style={{ padding: '12px 14px', color: 'var(--warn)', borderLeft: '3px solid var(--warn)' }}>⚠️ ยังไม่ได้สร้างตาราง <code>tmk_mp_aliases</code> — รันไฟล์ <code>supabase/migrations/20260623-mp-aliases.sql</code> ใน Supabase ก่อน จึงจะตั้ง alias ได้ (ส่วนอื่นยังดูได้ปกติ)</div>}

      <div className="metric-grid">
        <MetricCard label="SKU ทั้งหมด" value={N(A.total)} icon="box" />
        <MetricCard label="จับคู่ลายได้" value={`${matchPct}%`} sub={`${N(A.matched)} แถว`} icon="check" tone={matchPct >= 98 ? 'var(--good)' : 'var(--warn)'} />
        <MetricCard label="มีรหัสลาย" value={N(A.withCode)} sub={`${A.total ? Math.round(A.withCode / A.total * 100) : 0}%`} icon="bag" />
        <MetricCard label="ต้องตรวจ" value={N(A.newDesigns.length + A.newColors.length + A.unmatched.length)} sub="ลายใหม่+สีใหม่+จับคู่ไม่ได้" icon="shield" tone={(A.newDesigns.length + A.newColors.length + A.unmatched.length) ? 'var(--warn)' : 'var(--good)'} />
      </div>

      {form && (
        <SideSheet size="md" icon={form.kind === 'color' ? 'sparkle' : 'shield'}
          title={form.kind === 'color' ? 'เพิ่มสีที่ระบบรู้จัก' : 'ผูกลายเข้ากับ catalog'}
          sub={form.kind === 'color' ? 'ลงทะเบียนคำสีใหม่ กันระบบเข้าใจผิดว่าเป็นลาย' : 'แมปชื่อที่สะกดต่าง/ลายใหม่ ไปยังรหัส catalog'}
          onClose={() => setForm(null)}
          footer={<>
            <button className="btn" onClick={() => setForm(null)}>ยกเลิก</button>
            <button className="btn btn-primary" disabled={busy || !form.term.trim()} onClick={saveAlias}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก alias'}</button>
          </>}>
          <div className="field"><label>คำที่เจอในไฟล์</label><input className="input" value={form.term} onChange={e => setForm({ ...form, term: e.target.value })} placeholder={form.kind === 'color' ? 'เช่น ส้มอิฐ' : 'เช่น ราษภักดี'} autoFocus /></div>
          {form.kind === 'design' && <>
            <div className="field"><label>ชื่อลายมาตรฐาน (เลือกจากแคตตาล็อก 47 ลาย)</label>
              <input className="input" list="golden-designs" value={form.design} onChange={e => { const v = e.target.value; const g = GOLDEN_DESIGNS.find(d => d.name === v); setForm({ ...form, design: v, code: g ? g.code : form.code }); }} placeholder="พิมพ์/เลือกชื่อลาย เช่น ราษฎร์ภักดี" />
              <datalist id="golden-designs">{GOLDEN_DESIGNS.map(d => <option key={d.code + d.name} value={d.name}>{d.code} · {d.type}</option>)}</datalist>
            </div>
            <div className="field"><label>รหัส catalog (เติมให้อัตโนมัติเมื่อเลือกลาย)</label><input className="input" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="เช่น JRP111" /></div>
            {(() => { const exact = resolveDesign(form.term); const g = exact || suggestDesign(form.term); return g && g.name !== form.design ? <div className="cap" style={{ color: 'var(--accent)' }}>💡 {exact ? 'แนะนำ' : 'ใกล้เคียง (สะกดต่าง?)'}: {g.name} ({g.code}) — <button className="btn btn-sm" style={{ padding: '1px 8px' }} onClick={() => setForm({ ...form, design: g.name, code: g.code })}>ใช้</button></div> : null; })()}
          </>}
          <div className="cap" style={{ color: 'var(--ink-4)' }}>* มีผลกับการนำเข้าครั้งถัดไป — ตั้งแล้วนำเข้าไฟล์ใหม่/รี-ซิงก์เพื่อใช้</div>
        </SideSheet>
      )}

      {detail && (
        <SideSheet size="md" icon={detail.icon} title={detail.title} sub={detail.item.key} onClose={() => setDetail(null)} footer={<button className="btn" onClick={() => setDetail(null)}>ปิด</button>}>
          <div className="metric-grid">
            <MetricCard label="จำนวนแถว" value={N(detail.item.count)} tone={detail.tone} />
            <MetricCard label="จำนวนชิ้น" value={N(detail.item.qty)} />
          </div>
          <div className="card" style={{ padding: 14, boxShadow: 'none' }}>
            <div className="card-title" style={{ fontSize: 14, marginBottom: 8 }}>ตัวอย่างที่เจอ</div>
            <div style={{ wordBreak: 'break-word' }}>{detail.item.sample || detail.item.key}</div>
          </div>
          <div>
            <div className="card-title" style={{ fontSize: 14, marginBottom: 8 }}>ช่องทางที่พบ</div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {(detail.item.channels || []).length ? detail.item.channels.map(c => <span key={c} className="badge badge-default">{c}</span>) : <span className="cap" style={{ color: 'var(--ink-4)' }}>ไม่ระบุช่องทาง</span>}
            </div>
          </div>
          <div className="cap" style={{ color: 'var(--ink-4)' }}>ถ้าเป็นคำสะกดต่างหรือสีใหม่ ให้ตั้ง alias แล้วนำเข้าไฟล์ใหม่อีกครั้งเพื่อให้รายงานจับคู่ถูกต้อง</div>
        </SideSheet>
      )}

      <Sec title="ลายที่ยังไม่มีรหัส (ลายใหม่/สะกดต่าง)" icon="sparkle" tone="var(--warn)" items={A.newDesigns} empty="ทุกลายมีรหัส catalog ครบ ✓" action={Object.assign((k) => openAlias('design', k), { label: 'ผูก catalog' })} onDetail={setDetail} />
      <Sec title="สีที่ระบบยังไม่รู้จัก (กันสลับ)" icon="shield" tone="var(--bad)" items={A.newColors} empty="ไม่มีสีแปลกใหม่ ✓" action={Object.assign((k) => openAlias('color', k), { label: 'เพิ่มเป็นสี' })} onDetail={setDetail} />
      <Sec title="จับคู่ลายไม่ได้เลย" icon="search" tone="var(--ink-3)" items={A.unmatched} empty="จับคู่ได้ทุกแถว ✓" onDetail={setDetail} />

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="row between" style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
          <span className="row" style={{ gap: 8, fontWeight: 700 }}><Icon name="listChecks" /> Alias ที่ตั้งไว้</span>
          <button className="btn btn-sm" onClick={() => openAlias('design', '')}><Icon name="plus" /> เพิ่มเอง</button>
        </div>
        {aliases.length === 0
          ? <div style={{ padding: 14, color: 'var(--ink-4)', fontSize: 13 }}>ยังไม่มี alias — ผูกลาย/เพิ่มสีจากส่วนด้านบนได้</div>
          : <table className="table" style={{ width: '100%' }}><tbody>{aliases.map(a => (
            <tr key={a.id} style={{ borderTop: '1px solid var(--line)' }}>
              <td style={{ padding: '8px 14px' }}><span className="badge badge-default" style={{ marginRight: 8 }}>{a.kind === 'color' ? 'สี' : 'ลาย'}</span><b>{a.term}</b>{a.kind === 'design' && <span className="cap" style={{ color: 'var(--ink-3)' }}> → {a.design || '—'} {a.code ? `(${a.code})` : ''}</span>}</td>
              <td style={{ padding: '6px 12px', textAlign: 'right' }}><button className="btn btn-sm" style={{ color: 'var(--bad)' }} onClick={() => delAlias(a.id)}><Icon name="trash" /></button></td>
            </tr>
          ))}</tbody></table>}
      </div>
    </div>
  );
}

// รวม "นำเข้า/ส่งออก" + "สุขภาพข้อมูล" เป็นหน้าเดียว (workflow เดียวกัน: อัปโหลด→ตรวจ→ตั้ง alias→อัปโหลดใหม่)
function DataHub({ initial = 'io' }) {
  const [tab, setTab] = useState(initial === 'health' ? 'health' : 'io');
  return (
    <>
      <div className="content-inner" style={{ paddingBottom: 0 }}>
        <div className="tabs-list" style={{ margin: 0 }}>
          <button className={'tabs-trigger' + (tab === 'io' ? ' active' : '')} onClick={() => setTab('io')}>นำเข้า / ส่งออก</button>
          <button className={'tabs-trigger' + (tab === 'health' ? ' active' : '')} onClick={() => setTab('health')}>สุขภาพข้อมูล + ชื่อพ้อง</button>
        </div>
      </div>
      {tab === 'io' ? <ImportExportHub /> : <HealthHub />}
    </>
  );
}

export function CatalogView({ sub }) {
  if (sub === 'orders') return <OrdersHub />;
  if (sub === 'entry') return <SaleEntryView />;
  if (sub === 'shirts') return <ShirtCatalogView />;
  if (sub === 'crm') return <CrmView />;
  if (sub === 'health') return <DataHub initial="health" />;
  if (sub === 'io') return <DataHub initial="io" />;
  return <ReportHub />; // เน้น sale: หน้าอื่น (สินค้า/ลูกค้า/สต็อก/PO) ถูกตัดออก → รายงานขาย
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

/* ====================  ออเดอร์จากไฟล์นำเข้า (รายละเอียด)  ==================== */
/* Skeleton ตรง layout ออเดอร์: การ์ดหัว (ค้นหา + ชิปกรอง) + ตาราง 8 คอลัมน์ */
function OrdersSkeleton() {
  return (
    <div className="content-inner rise">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row between" style={{ marginBottom: 12 }}><Skel w={190} h={15} /><Skel w={170} h={11} /></div>
        <Skel w="100%" h={36} r={9} style={{ marginBottom: 12 }} />
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{Array.from({ length: 11 }).map((_, i) => <Skel key={i} w={i % 3 === 0 ? 72 : 52} h={26} r={8} />)}</div>
      </div>
      <div className="card"><SkelTable cols={8} rows={10} /></div>
    </div>
  );
}

function MpOrdersView() {
  const [orders, setOrders] = useState(null);
  const [skusByOrder, setSkusByOrder] = useState({});
  const [err, setErr] = useState('');
  const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const [month, setMonth] = useState(thisMonth());   // default = เดือนนี้ (โหลดเฉพาะเดือน → เร็ว)
  const [months, setMonths] = useState([]);
  const [channel, setChannel] = useState('all');
  const [job, setJob] = useState('all');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [limit, setLimit] = useState(120);

  // รายชื่อเดือนที่มีข้อมูล (จากขอบวันที่ — เบามาก)
  useEffect(() => { (async () => {
    const b = await getDateBounds('tmk_mp_orders');
    if (!b.min || !b.max) return;
    const out = []; let y = +b.max.slice(0, 4), m = +b.max.slice(5, 7);
    const minY = +b.min.slice(0, 4), minM = +b.min.slice(5, 7);
    while (y > minY || (y === minY && m >= minM)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m--; if (m < 1) { m = 12; y--; } }
    setMonths(out);
  })(); }, []);

  // โหลดออเดอร์ตามเดือนที่เลือก (server-side) — เปลี่ยนเดือนค่อยโหลดเฉพาะส่วน · มีแคช
  useEffect(() => {
    let cancel = false;
    (async () => {
      setOrders(null); setErr('');
      const lastDay = (ym) => { const [y, mm] = ym.split('-').map(Number); return new Date(y, mm, 0).getDate(); };
      const from = month === 'all' ? null : `${month}-01`, to = month === 'all' ? null : `${month}-${String(lastDay(month)).padStart(2, '0')}`;
      const o = month === 'all' ? await cachedFetchAll('tmk_mp_orders', ORDERS_SEL) : await cachedFetchRange('tmk_mp_orders', ORDERS_SEL, from, to);
      if (cancel) return;
      if (o.error) { setErr(o.error.message || ''); setOrders([]); return; }
      const s = month === 'all' ? await cachedFetchAll('tmk_mp_skus', SKUS_SEL) : await cachedFetchRange('tmk_mp_skus', SKUS_SEL, from, to);
      if (cancel) return;
      const byO = {}; (s.error ? [] : s.data || []).forEach(x => { (byO[x.order_no] = byO[x.order_no] || []).push(x); });
      setSkusByOrder(byO);
      setOrders((o.data || []).filter(x => x.status !== 'cancelled').sort((a, b) => (b.order_date || '').localeCompare(a.order_date || '')));
    })();
    return () => { cancel = true; };
  }, [month]);
  const channels = useMemo(() => [...new Set((orders || []).map(o => o.channel).filter(Boolean))], [orders]);
  const ql = q.trim().toLowerCase();
  const filtered = (orders || []).filter(o =>
    (month === 'all' || o.order_month === month) &&
    (channel === 'all' || o.channel === channel) &&
    (job === 'all' || (o.job_type || 'ปลีก') === job) &&
    (!ql || `${o.order_no} ${o.marketplace_id || ''} ${o.customer_name || ''} ${o.customer_code || ''} ${o.customer_social || ''} ${o.province || ''} ${o.salesperson || ''}`.toLowerCase().includes(ql) || (skusByOrder[o.order_no] || []).some(s => `${s.design || ''} ${s.color || ''} ${s.raw_sku_or_name || ''}`.toLowerCase().includes(ql)))
  );
  const tot = filtered.reduce((a, x) => a + (Number(x.sales) || 0), 0);
  const totQty = filtered.reduce((a, x) => a + (Number(x.qty) || 0), 0);
  const byCh = {}; filtered.forEach(o => { byCh[o.channel] = (byCh[o.channel] || 0) + (Number(o.sales) || 0); });
  const _donutData = Object.entries(byCh).map(([k, v]) => ({ label: k, value: v, color: channelColor(k) })).sort((a, b) => b.value - a.value);

  const showSkel = useDelayedFlag(orders === null, 120); // โผล่หลัง 120ms · อยู่อย่างน้อย 300ms · cache ไว → เด้งทันที
  if (showSkel) return <OrdersSkeleton />;
  if (orders === null) return null;
  // ไม่มีข้อมูลเลยทั้งระบบ (ไม่มีเดือนใดเลย) → แนะนำนำเข้า · ถ้าแค่เดือนนี้ว่าง ยังให้เลือกเดือนอื่นได้
  if (err || (orders.length === 0 && months.length === 0)) return (
    <div className="content-inner rise"><div className="card"><div className="cap" style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }}>
      {/relation .* does not exist|tmk_mp_/i.test(err) ? 'ยังไม่ได้สร้างตาราง — รัน migration ก่อน' : 'ยังไม่มีออเดอร์จากไฟล์ — ไปที่ "ข้อมูล → นำเข้าไฟล์มาร์เก็ตเพลส" เพื่อนำเข้า'}
    </div></div></div>
  );

  const jobChip = (j) => ({ 'ปลีก': '', 'ส่ง': 'chip-accent', 'OEM': 'chip-warn' }[j] || '');
  const statusChip = (s) => {
    if (!s || s === 'completed' || s === 'delivered') return 'chip-delivered';
    if (s === 'cancelled') return 'chip-cancelled';
    if (s === 'pending' || s === 'processing') return 'chip-pending';
    if (s === 'shipped') return 'chip-shipped';
    return '';
  };
  const statusLabel = (s) => ({ 'completed': 'สำเร็จ', 'delivered': 'ส่งแล้ว', 'cancelled': 'ยกเลิก', 'pending': 'รอดำเนินการ', 'processing': 'กำลังทำ', 'shipped': 'จัดส่งแล้ว' }[s] || s || '');
  return (
    <div className="content-inner rise">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head" style={{ marginBottom: 10 }}>
          <h3><span style={{ color: 'var(--accent)' }}><Icon name="listChecks" /></span> ออเดอร์จากไฟล์นำเข้า</h3>
          <span className="cap"><b style={{ color: 'var(--ink)' }}>{N(filtered.length)}</b> ออเดอร์ · {B(tot)} · {N(totQty)} ชิ้น</span>
        </div>
        <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 ค้นหา ออเดอร์ / ชื่อลูกค้า / รหัสลูกค้า / เบอร์/โซเชียล / จังหวัด / ลาย" style={{ marginBottom: 10 }} />
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <div className="chips-pick"><button className={'pick' + (month === 'all' ? ' on' : '')} onClick={() => setMonth('all')}>ทุกเดือน</button>{months.map(m => <button key={m} className={'pick' + (month === m ? ' on' : '')} onClick={() => setMonth(m)}>{m}</button>)}</div>
          <div className="chips-pick"><button className={'pick' + (job === 'all' ? ' on' : '')} onClick={() => setJob('all')}>ทุกงาน</button>{['ปลีก', 'ส่ง', 'OEM'].map(j => <button key={j} className={'pick' + (job === j ? ' on' : '')} onClick={() => setJob(j)}>{j}</button>)}</div>
          <div className="chips-pick"><button className={'pick' + (channel === 'all' ? ' on' : '')} onClick={() => setChannel('all')}>ทุกช่อง</button>{channels.map(c => <button key={c} className={'pick' + (channel === c ? ' on' : '')} onClick={() => setChannel(c)}>{c}</button>)}</div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap table-sticky-first"><table className="table">
          <thead><tr><th>ออเดอร์</th><th>วันที่</th><th>ช่องทาง</th><th>ลูกค้า</th><th>ลายเสื้อ</th><th>งาน</th><th>สถานะ</th><th style={{ textAlign: 'right' }}>ชิ้น</th><th style={{ textAlign: 'right' }}>ยอดขาย</th></tr></thead>
          <tbody>{filtered.slice(0, limit).map(o => { const sk = skusByOrder[o.order_no] || []; const open = openId === o.order_no;
            const dmap = {}; sk.forEach(s => { const d = s.design || '(จับคู่ไม่ได้)'; if (!dmap[d]) dmap[d] = { design: d, codes: new Set(), qty: 0, sales: 0 }; const g = dmap[d]; if (s.product_code) g.codes.add(s.product_code); g.qty += Number(s.qty) || 0; g.sales += Number(s.line_sales) || 0; }); const designs = Object.values(dmap).sort((a, b) => b.qty - a.qty);
            return (
            <React.Fragment key={o.order_no}>
              <tr className={`mp-order-row ${open ? 'is-open' : ''}`} onClick={() => setOpenId(open ? null : o.order_no)} style={{ cursor: 'pointer' }}>
                <td><span style={{ fontWeight: 600 }}>{o.order_no}</span></td>
                <td className="cap" style={{ whiteSpace: 'nowrap' }}>{o.order_date || o.order_month}</td>
                <td><span className="order-channel-chip"><span className="order-channel-dot" style={{ background: channelColor(o.channel) }} />{o.channel}</span></td>
                <td>{o.customer_name || o.customer_code || '—'}{o.province && <div className="cap">{o.province}</div>}{!o.customer_name && !o.customer_code && <span className="quality-badge warn">ไม่มีลูกค้า</span>}</td>
                <td>{designs.length === 0 ? <span className="cap" style={{ color: 'var(--ink-4)' }}>—</span> : <span style={{ fontWeight: 600 }}>{designs.slice(0, 2).map(d => d.design).join(', ')}{designs.length > 2 ? ` +${designs.length - 2}` : ''}</span>}</td>
                <td>{(o.job_type && o.job_type !== 'ปลีก') ? <span className={'chip ' + jobChip(o.job_type)}>{o.job_type}</span> : <span className="cap">ปลีก</span>}</td>
                <td>{o.status && o.status !== 'completed' ? <span className={'chip ' + statusChip(o.status)}>{statusLabel(o.status)}</span> : <span className="cap" style={{ color: 'var(--ink-4)' }}>—</span>}</td>
                <td className="num" style={{ textAlign: 'right' }}>{N(o.qty)}</td>
                <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{B(o.sales)}</td>
              </tr>
              {open && (
                <tr><td colSpan={9} style={{ background: 'var(--surface-2)', padding: '12px 14px' }}>
                  <div className="cap" style={{ marginBottom: 8, fontWeight: 600, color: 'var(--ink-3)' }}>ข้อมูลออเดอร์</div>
                  <div className="quality-row" style={{ marginBottom: 10 }}>
                    {sk.length === 0 && <span className="quality-badge warn">ไม่มี SKU</span>}
                    {designs.some(d => d.design === '(จับคู่ไม่ได้)') && <span className="quality-badge warn">มีลายจับคู่ไม่ได้</span>}
                    {o.profit > 0 && <span className="quality-badge good">มีต้นทุน/กำไร</span>}
                    {o.customer_code && <span className="quality-badge good">มีรหัสลูกค้า</span>}
                  </div>
                  <div className="kv-grid">
                    <div><span className="cap">เลขออเดอร์</span><b>{o.order_no}</b></div>
                    {o.marketplace_id && o.marketplace_id !== '-' && <div><span className="cap">ID มาร์เก็ตเพลส</span><b>{o.marketplace_id}</b></div>}
                    <div><span className="cap">วันที่</span><b>{o.order_date || o.order_month}</b></div>
                    <div><span className="cap">ช่องทาง</span><b>{o.channel}</b></div>
                    <div><span className="cap">ประเภทงาน</span><b>{o.job_type || 'ปลีก'}</b></div>
                    <div><span className="cap">การชำระ</span><b>{o.payment_type || '—'}</b></div>
                    {o.cod_amount > 0 && <div><span className="cap">ยอด COD</span><b>{B(o.cod_amount)}</b></div>}
                    <div><span className="cap">เซลล์</span><b>{o.salesperson || '—'}</b></div>
                    <div><span className="cap">ลูกค้า</span><b>{o.customer_name || '—'}</b></div>
                    {o.customer_code && <div><span className="cap">รหัสลูกค้า</span><b>{o.customer_code}</b></div>}
                    {o.customer_social && <div><span className="cap">โซเชียล</span><b>{o.customer_social}</b></div>}
                    <div><span className="cap">สถานะลูกค้า</span><b>{o.customer_type || '—'}</b></div>
                    {o.cust_total_orders > 0 && <div><span className="cap">ออเดอร์สะสม</span><b>{N(o.cust_total_orders)} ครั้ง</b></div>}
                    {o.province && <div><span className="cap">จังหวัด</span><b>{o.province}</b></div>}
                    <div><span className="cap">ยอดขาย</span><b>{B(o.sales)}</b></div>
                    {o.cost > 0 && <div><span className="cap">ต้นทุน</span><b>{B(o.cost)}</b></div>}
                    {o.mkt_commission > 0 && <div><span className="cap">ค่าธรรมเนียม</span><b>−{B(o.mkt_commission)}</b></div>}
                    {o.profit > 0 && <div><span className="cap">กำไรสุทธิ</span><b style={{ color: 'var(--good)' }}>{B(o.profit)}</b></div>}
                  </div>
                  {designs.length > 0 && <>
                    <div className="cap" style={{ margin: '12px 0 6px', fontWeight: 600, color: 'var(--accent)' }}><Icon name="bag" /> ลายเสื้อในออเดอร์นี้ ({N(designs.length)} ลาย)</div>
                    <div style={{ display: 'grid', gap: 6, marginBottom: 4 }}>{designs.map((d, i) => (
                      <div key={i} className="row between" style={{ gap: 8, padding: '7px 11px', borderRadius: 'var(--r-sm)', background: 'var(--surface)', border: '1px solid var(--line)', flexWrap: 'wrap' }}>
                        <span style={{ minWidth: 0 }}><b style={{ color: d.design === '(จับคู่ไม่ได้)' ? 'var(--bad)' : 'var(--ink)' }}>{d.design}</b>{d.codes.size > 0 && <span className="badge badge-default" style={{ marginLeft: 8 }}>รหัส {[...d.codes].join(', ')}</span>}</span>
                        <span className="num cap"><b style={{ color: 'var(--ink)' }}>{N(d.qty)}</b> ชิ้น · {B(d.sales)}</span>
                      </div>
                    ))}</div>
                  </>}
                  {sk.length > 0 && <>
                    <div className="cap" style={{ margin: '12px 0 6px', fontWeight: 600, color: 'var(--ink-3)' }}>รายการสินค้า ({N(sk.length)} รายการ · {N(sk.reduce((a, x) => a + (Number(x.qty) || 0), 0))} ชิ้น)</div>
                    <table className="table" style={{ background: 'var(--surface)' }}>
                      <thead><tr><th>ลาย</th><th>รหัส</th><th>สี</th><th>ไซซ์</th><th style={{ textAlign: 'right' }}>จำนวน</th><th style={{ textAlign: 'right' }}>ยอด</th><th>จับคู่</th></tr></thead>
                      <tbody>{sk.map((s, i) => <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{s.design || <span style={{ color: 'var(--bad)' }}>จับคู่ไม่ได้</span>}{s.raw_sku_or_name && s.raw_sku_or_name !== s.design && <div className="cap" style={{ color: 'var(--ink-4)' }}>{s.raw_sku_or_name}</div>}</td>
                        <td className="cap">{s.product_code || '—'}</td>
                        <td className="cap">{s.color || '—'}</td>
                        <td className="cap">{s.size || '—'}</td>
                        <td className="num" style={{ textAlign: 'right' }}>{N(s.qty)}</td>
                        <td className="num" style={{ textAlign: 'right' }}>{B(s.line_sales)}</td>
                        <td><span className="cap" style={{ color: s.match_how ? 'var(--ink-3)' : 'var(--bad)' }}>{s.match_how || '—'}</span></td>
                      </tr>)}</tbody>
                    </table>
                  </>}
                </td></tr>
              )}
            </React.Fragment>
          ); })}</tbody>
        </table></div>
        {filtered.length > limit && <div style={{ textAlign: 'center', marginTop: 12 }}><button className="btn btn-sm" onClick={() => setLimit(l => l + 200)}>โหลดเพิ่ม (เหลือ {N(filtered.length - limit)})</button></div>}
      </div>
    </div>
  );
}

function OrdersHub() {
  return <MpOrdersView />;
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
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="text-sm text-muted-foreground font-medium">
          {campaigns.length} แคมเปญ · เรียงลำดับได้ (ลากบนคอม / ปุ่ม ▲▼ บนมือถือ)
        </div>
        <Button onClick={() => window.__openModal('campaign')}>
          <Icon name="plus" className="size-4 mr-2" /> สร้างแคมเปญ
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {campaigns.length === 0 && (
          <div className="col-span-full py-16 text-center text-muted-foreground border-2 border-dashed rounded-lg bg-muted/10">
            <p className="text-sm">ยังไม่มีแคมเปญ — กด "+ สร้างแคมเปญ" เพื่อเริ่ม</p>
          </div>
        )}
        {campaigns.map((c, idx) => {
          const isOver = dragOver === c.id;
          const statusMeta = stMeta[c.status] || stMeta.done;
          
          return (
            <Card key={c.id}
              draggable
              onDragStart={() => setDragId(c.id)}
              onDragEnd={() => { setDragId(null); setDragOver(null); }}
              onDragOver={(e) => { e.preventDefault(); if (dragId && dragId !== c.id) setDragOver(c.id); }}
              onDragLeave={() => setDragOver(o => o === c.id ? null : o)}
              onDrop={() => { if (dragId) reorderCampaign(dragId, c.id); setDragId(null); setDragOver(null); }}
              className="flex flex-col transition-all overflow-hidden"
              style={{
                borderLeftWidth: '4px',
                borderLeftColor: c.color || 'var(--border)',
                cursor: busy ? 'wait' : 'grab',
                transform: isOver ? 'scale(1.02)' : 'scale(1)',
                boxShadow: isOver ? '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' : undefined,
                background: isOver ? 'hsl(var(--accent)/0.1)' : undefined,
                opacity: dragId === c.id ? 0.4 : 1,
              }}>
              <CardContent className="p-4 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex gap-2 min-w-0 flex-1">
                    <div className="hidden sm:flex shrink-0 text-muted-foreground/50 mt-1" title="ลากเพื่อเรียงลำดับ">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="9" cy="6" r="1.5" fill="currentColor" /><circle cx="9" cy="12" r="1.5" fill="currentColor" /><circle cx="9" cy="18" r="1.5" fill="currentColor" />
                        <circle cx="15" cy="6" r="1.5" fill="currentColor" /><circle cx="15" cy="12" r="1.5" fill="currentColor" /><circle cx="15" cy="18" r="1.5" fill="currentColor" />
                      </svg>
                    </div>
                    {/* สำหรับมือถือ */}
                    <div className="flex sm:hidden flex-col gap-1 shrink-0 px-1 mt-1" onClick={e => e.stopPropagation()}>
                      <button className="text-muted-foreground disabled:opacity-30 p-1 text-[10px]" disabled={idx === 0 || busy} onClick={() => reorderCampaign(c.id, campaigns[idx - 1].id)}>▲</button>
                      <button className="text-muted-foreground disabled:opacity-30 p-1 text-[10px]" disabled={idx === campaigns.length - 1 || busy} onClick={() => reorderCampaign(c.id, campaigns[idx + 1].id)}>▼</button>
                    </div>
                    
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-base truncate hover:underline cursor-pointer" onClick={() => window.__openModal('campaign', { ...c, channels: c.channels || [] })}>
                        {c.name}
                      </h3>
                      <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                        {c.start} – {c.end}
                      </div>
                    </div>
                  </div>
                  
                  <Badge variant="outline" className={`shrink-0 ${statusMeta.cls === 'chip-good' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : statusMeta.cls === 'chip-accent' ? 'bg-primary/10 text-primary border-primary/20' : statusMeta.cls === 'chip-warn' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : ''}`}>
                    {statusMeta.l}
                  </Badge>
                </div>
                
                <div className="mt-auto flex items-center justify-between pt-3 border-t border-border/50">
                  <div className="flex gap-1.5 flex-wrap">
                    {(c.channels || []).map(id => { 
                      const ch = DD.channels.find(x=>x.id===id); 
                      return ch ? <div key={id} className="size-3 rounded-sm" style={{ background: ch.hex }} title={ch.name}></div> : null; 
                    })}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon name="listChecks" className="size-3.5" />
                    <span>{c.tasks} งาน</span>
                  </div>
                </div>
              </CardContent>
              <div className="absolute top-2 right-2 flex opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); window.__openModal('campaign', { ...c, channels: c.channels || [] }); }}>
                  <Icon name="pencil" className="size-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); deleteCampaign(c); }} disabled={busy}>
                  <Icon name="trash" className="size-3" />
                </Button>
              </div>
              
              {/* always show buttons on mobile */}
              <div className="flex sm:hidden absolute top-2 right-2">
                 <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={(e) => { e.stopPropagation(); window.__openModal('campaign', { ...c, channels: c.channels || [] }); }}>
                  <Icon name="pencil" className="size-3" />
                </Button>
                 <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); deleteCampaign(c); }} disabled={busy}>
                  <Icon name="trash" className="size-3" />
                </Button>
              </div>
            </Card>
          );
        })}
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
    <div className="p-4 md:p-8 max-w-[1200px] mx-auto w-full rise">
      <div className="mb-6 space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">การตั้งค่า</h2>
        <p className="text-muted-foreground">จัดการระบบผู้ใช้งาน ช่องทางขาย และการแสดงผล</p>
      </div>
      <div className="h-[1px] w-full bg-border mb-8" />
      
      <Tabs value={active} onValueChange={setActive} className="flex flex-col lg:flex-row gap-8 w-full">
        <aside className="lg:w-1/4 xl:w-1/5 shrink-0">
          <TabsList className="flex flex-col h-auto bg-transparent p-0 space-y-1 w-full items-start">
            {TABS.map(t => (
              <TabsTrigger 
                key={t.id} 
                value={t.id} 
                className="w-full justify-start gap-3 px-4 py-2.5 text-sm hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:shadow-none data-[state=active]:font-medium transition-colors"
              >
                <Icon name={t.icon} className="size-4" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </aside>

        <div className="flex-1 min-w-0">
        <TabsContent value="general" className="m-0 border-0 p-0 focus-visible:outline-none focus-visible:ring-0">
          <GeneralSettings dark={dark} setDark={setDark} />
        </TabsContent>
        <TabsContent value="channels" className="m-0 border-0 p-0 focus-visible:outline-none focus-visible:ring-0">
          <ChannelsView />
        </TabsContent>
        <TabsContent value="campaigns" className="m-0 border-0 p-0 focus-visible:outline-none focus-visible:ring-0">
          <CampaignsView />
        </TabsContent>
        <TabsContent value="duties" className="m-0 border-0 p-0 focus-visible:outline-none focus-visible:ring-0">
          <DutiesView />
        </TabsContent>
        <TabsContent value="roles" className="m-0 border-0 p-0 focus-visible:outline-none focus-visible:ring-0">
          {_isAdmin && <RolesView />}
        </TabsContent>
        <TabsContent value="audit" className="m-0 border-0 p-0 focus-visible:outline-none focus-visible:ring-0">
          <AuditView />
        </TabsContent>
        <TabsContent value="trash" className="m-0 border-0 p-0 focus-visible:outline-none focus-visible:ring-0">
          {_canEdit && <TrashView />}
        </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function NotifToggle({ storeKey, label }) {
  const [on, setOn] = useState(() => { try { return localStorage.getItem(storeKey) !== 'false'; } catch { return true; } });
  const flip = (checked) => {
    setOn(checked);
    try { localStorage.setItem(storeKey, checked ? 'true' : 'false'); } catch { /* ignore */ }
    try { window.dispatchEvent(new Event('tmk-prefs')); } catch { /* ignore */ }
  };
  return <ShadcnSwitch checked={on} onCheckedChange={flip} aria-label={label || "เปิด/ปิดการแจ้งเตือน"} />;
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
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      {/* Appearance */}
      <Card>
        <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon name={dark ? 'moon' : 'sun'} className="size-5 text-muted-foreground" /> ธีมและการแสดงผล
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm">โหมดมืด</div>
              <div className="text-sm text-muted-foreground mt-1">เปลี่ยนธีมสีของระบบ</div>
            </div>
            <ShadcnSwitch checked={dark} onCheckedChange={setDark} aria-label="โหมดมืด" />
          </div>
        </CardContent>
      </Card>

      {/* Notification settings */}
      <Card>
        <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon name="bell" className="size-5 text-muted-foreground" /> การแจ้งเตือน
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 divide-y divide-border/50">
          <div className="flex items-center justify-between py-4">
            <div>
              <div className="font-semibold text-sm">แจ้งเตือนงาน &amp; สรุปเดือน</div>
              <div className="text-sm text-muted-foreground mt-1">เตือนงานวันนี้/เกินกำหนด/ใกล้ถึง และเตือนสรุปยอดเดือนที่แล้ว</div>
            </div>
            <NotifToggle storeKey="tmk-notif-overdue" label="เปิด/ปิดแจ้งเตือนงาน" />
          </div>
          <div className="flex items-center justify-between py-4">
            <div>
              <div className="font-semibold text-sm">แจ้งเตือนสต็อกใกล้หมด</div>
              <div className="text-sm text-muted-foreground mt-1">เตือนเมื่อสินค้าเหลือน้อยกว่าจุดสั่งผลิต</div>
            </div>
            <NotifToggle storeKey="tmk-notif-stock" label="เปิด/ปิดแจ้งเตือนสต็อก" />
          </div>
          <div className="flex items-center justify-between py-4">
            <div>
              <div className="font-semibold text-sm">เตือนกรอกยอดขายวันนี้</div>
              <div className="text-sm text-muted-foreground mt-1">เตือนเมื่อยังไม่ได้บันทึกยอดขายของวันนี้</div>
            </div>
            <NotifToggle storeKey="tmk-notif-daily" label="เปิด/ปิดเตือนกรอกยอดขาย" />
          </div>
          <div className="flex items-center justify-between py-4">
            <div>
              <div className="font-semibold text-sm">เตือนยอดขาย &amp; ค่าแอด</div>
              <div className="text-sm text-muted-foreground mt-1">เตือนเมื่อ ACOS เกินเพดาน, ใช้งบแอดเกินที่ตั้ง, ยอดช้ากว่าแผน หรือ pace ลูกค้าใหม่ช้า</div>
            </div>
            <NotifToggle storeKey="tmk-notif-sales" label="เปิด/ปิดเตือนยอดขาย" />
          </div>
          <div className="flex items-center justify-between py-4">
            <div>
              <div className="font-semibold text-sm">เตือนออเดอร์ค้าง</div>
              <div className="text-sm text-muted-foreground mt-1">เตือนเมื่อออเดอร์สถานะ "รอ/กำลังเตรียม" นานเกิน 2 วัน (กันลืมส่ง)</div>
            </div>
            <NotifToggle storeKey="tmk-notif-orders" label="เปิด/ปิดเตือนออเดอร์" />
          </div>
          <div className="flex items-center justify-between py-4">
            <div>
              <div className="font-semibold text-sm">เตือน PO ถึงกำหนด</div>
              <div className="text-sm text-muted-foreground mt-1">เตือนเมื่อ PO ถึงวันรับเข้าหรือเลยกำหนดแล้วยังไม่ได้รับเข้า</div>
            </div>
            <NotifToggle storeKey="tmk-notif-po" label="เปิด/ปิดเตือน PO" />
          </div>
        </CardContent>
      </Card>

      {/* Data */}
      <Card>
        <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon name="layers" className="size-5 text-muted-foreground" /> ข้อมูลและการซิงค์
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 divide-y divide-border/50">
          <div className="flex items-center justify-between py-4">
            <div>
              <div className="font-semibold text-sm">ซิงค์ข้อมูลอัตโนมัติ</div>
              <div className="text-sm text-muted-foreground mt-1">ซิงค์อัตโนมัติผ่าน Supabase Realtime</div>
            </div>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">เปิด</Badge>
          </div>
          <div className="flex items-center justify-between py-4">
            <div>
              <div className="font-semibold text-sm">Export ข้อมูล</div>
              <div className="text-sm text-muted-foreground mt-1">ดาวน์โหลดข้อมูลทั้งหมดเป็น CSV (รองรับภาษาไทยใน Excel)</div>
            </div>
            <Button variant="outline" size="sm" onClick={exportAllCSV}>
              <Icon name="external" className="mr-2 size-4" /> Export
            </Button>
          </div>
          <div className="py-4">
            <div className="mb-4">
              <div className="font-semibold text-sm">รายงานยอดขายรายเดือน</div>
              <div className="text-sm text-muted-foreground mt-1">สรุปต่อช่องทาง (เป้า/ยอด/ROAS) + ยอดรายวันต่อช่องทาง — เลือกเดือนย้อนหลังได้</div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Select value={String(reportMonth)} onValueChange={(val) => setReportMonth(Number(val))}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="เลือกเดือน" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS_TH_SHORT.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              
              <Select value={String(reportYear)} onValueChange={(val) => setReportYear(Number(val))}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="เลือกปี" />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}{y === _t.yearBE ? ' (ปีนี้)' : ''}</SelectItem>)}
                </SelectContent>
              </Select>
              
              <Button onClick={() => exportMonthlyReportCSV(reportMonth, reportYear)}>
                <Icon name="external" className="mr-2 size-4" /> ดาวน์โหลด CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon name="sparkle" className="size-5 text-muted-foreground" /> เกี่ยวกับระบบ
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 divide-y divide-border/50">
          <div className="flex items-center justify-between py-4">
            <div>
              <div className="font-semibold text-sm">เวอร์ชัน</div>
              <div className="text-sm text-muted-foreground mt-1">ดูอัปเดตที่ป้าย "มีอะไรใหม่" มุมขวาล่าง</div>
            </div>
            <Badge variant="secondary">v{APP_VERSION}</Badge>
          </div>
          <div className="flex items-center justify-between py-4">
            <div>
              <div className="font-semibold text-sm">แหล่งข้อมูล</div>
              <div className="text-sm text-muted-foreground mt-1">ทุกหน้าดึงข้อมูลจริงจาก Supabase แบบเรียลไทม์ ไม่มีข้อมูลจำลอง</div>
            </div>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Supabase</Badge>
          </div>
          <div className="flex items-center justify-between py-4">
            <div>
              <div className="font-semibold text-sm">ข้อมูลแยกตามเดือน</div>
              <div className="text-sm text-muted-foreground mt-1">ทุกหน้าที่มีตัวเลือกเดือนแสดงข้อมูลของเดือนที่เลือก (อดีต/ปัจจุบัน/อนาคต)</div>
            </div>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">เปิด</Badge>
          </div>
        </CardContent>
      </Card>
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
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border/50 bg-muted/20">
          <CardTitle className="text-lg flex items-center gap-2 whitespace-nowrap">
            <Icon name="clock" className="size-5 text-primary" /> ประวัติการใช้งาน <span className="text-sm text-muted-foreground font-normal">({N(total)})</span>
          </CardTitle>
          <div className="flex flex-wrap gap-1 p-1 bg-muted/50 rounded-lg">
            {types.map(t => (
              <button 
                key={t[0]} 
                onClick={() => { setFilter(t[0]); setPage(0); }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filter === t[0] ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'}`}
              >
                {t[1]}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* ค้นหา + ช่วงวันที่ + ปุ่มลัด */}
          <div className="flex flex-col md:flex-row gap-4 p-4 border-b border-border/50 bg-background/50">
            <div className="relative flex-1 min-w-[200px]">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input className="pl-9 bg-background" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="ค้นหา (สรุป / ชื่อ)" />
            </div>
            
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-background border rounded-md p-1 h-10">
                <Input type="date" className="h-8 border-0 bg-transparent py-0 px-2 w-[130px] shadow-none focus-visible:ring-0 text-sm" value={dateFrom} onChange={e => setRange(e.target.value, dateTo)} title="ตั้งแต่" />
                <span className="text-muted-foreground text-sm">→</span>
                <Input type="date" className="h-8 border-0 bg-transparent py-0 px-2 w-[130px] shadow-none focus-visible:ring-0 text-sm" value={dateTo} onChange={e => setRange(dateFrom, e.target.value)} title="ถึง" />
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {datePresets.map(p => (
                <Button 
                  key={p.label} 
                  variant={activePreset === p.label ? 'secondary' : 'outline'} 
                  size="sm"
                  onClick={() => setRange(p.from, p.to)}
                >
                  {p.label}
                </Button>
              ))}
              {(dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setRange('', '')}>ล้าง ✕</Button>
              )}
            </div>
          </div>
          
          <div className="flex flex-col divide-y divide-border/50">
            {loading && (
              <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <Icon name="loader" className="size-6 animate-spin opacity-50" />
                <p className="text-sm">กำลังโหลด…</p>
              </div>
            )}
            
            {!loading && mapped.length === 0 && (
              <div className="py-16 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed m-4 rounded-lg bg-muted/10">
                <Icon name="clock" className="size-8 opacity-20 mb-3" />
                <p className="text-sm">ไม่พบประวัติตามเงื่อนไข</p>
              </div>
            )}
            
            {!loading && mapped.map((a, i) => {
              const s = DD.staff.find(x => x.name === a.user || x.email === a.user) || { color: '#888' };
              const m = actionMeta(a);
              
              return (
                <div key={i} className="flex gap-4 p-4 hover:bg-muted/20 transition-colors">
                  <div className="shrink-0 mt-1">
                    <Avatar name={a.user} color={s.color} size={36} />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground text-sm">{a.user}</span>
                      <span className="text-muted-foreground text-xs font-medium">· {ENTITY_TH[a.entity] || a.entity}</span>
                    </div>
                    <div className="text-sm text-foreground/90">{a.summary}</div>
                    
                    {a.changes && a.changes.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {a.changes.map((c, j) => (
                          <Badge key={j} variant="secondary" className="text-xs font-normal bg-muted/50 text-foreground">
                            <span className="opacity-70 mr-1">{c.label}:</span> 
                            <span className="line-through opacity-50 mr-1">{c.from}</span> 
                            <span className="text-muted-foreground text-[10px] mx-0.5">→</span> 
                            <span className="text-primary font-semibold ml-1">{c.to}</span>
                          </Badge>
                        ))}
                      </div>
                    )}
                    
                    {a.fields && a.fields.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {a.fields.map((fld, j) => (
                          <Badge key={j} variant="secondary" className="text-xs font-normal bg-muted/50 text-foreground">
                            <span className="opacity-70 mr-1">{fld.label}:</span> 
                            <span className="font-semibold text-foreground/90">{fld.value}</span>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Badge variant="outline" className="font-medium shrink-0" style={{ background: m.c+'15', color: m.c, borderColor: m.c+'30' }}>
                      {m.l}
                    </Badge>
                    <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{a.time}</span>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Pagination */}
          {total > PAGE && (
            <div className="flex items-center justify-center gap-4 p-4 border-t border-border/50 bg-muted/10">
              <Button variant="outline" size="sm" disabled={page <= 0 || loading} onClick={() => setPage(p => Math.max(0, p - 1))}>
                <Icon name="arrowLeft" className="size-4 mr-2" /> ก่อนหน้า
              </Button>
              <span className="text-sm text-muted-foreground font-medium tabular-nums">
                หน้า {page + 1} <span className="opacity-50">/</span> {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1 || loading} onClick={() => setPage(p => p + 1)}>
                ถัดไป <Icon name="arrowRight" className="size-4 ml-2" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
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
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <Card className="bg-primary/5 border-l-4 border-l-primary shadow-none">
        <CardContent className="p-5 flex gap-4 items-start">
          <Icon name="layers" className="size-6 text-primary mt-1" />
          <div>
            <h3 className="text-lg font-bold mb-1 text-foreground">ช่องทางการขาย</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              จัดการรายการช่องทางที่ใช้บันทึกยอดขาย — เพิ่ม/ลบ/แก้ไอคอน/สี/เป้าหมาย และจัดเรียงลำดับได้ ข้อมูลเก็บใน Supabase
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50 bg-muted/20">
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon name="layers" className="size-5 text-muted-foreground" /> ช่องทางทั้งหมด ({channels.length})
          </CardTitle>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Icon name="plus" className="size-4 mr-2" /> เพิ่มช่องทางใหม่
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex flex-col">
            {channels.length === 0 && (
              <div className="p-10 text-center text-muted-foreground">
                <p className="text-sm">ยังไม่มีช่องทาง — กด "เพิ่มช่องทางใหม่" เพื่อเริ่ม</p>
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
                  className="flex items-center gap-3 p-4 border-b border-border/50 cursor-move transition-colors"
                  style={{
                    background: isOver ? 'hsl(var(--accent)/0.1)' : 'transparent',
                    opacity: dragId === c.id ? 0.4 : 1,
                  }}>
                  <div className="hidden sm:flex shrink-0 text-muted-foreground/50" title="ลากเพื่อเรียงลำดับ">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="9" cy="6" r="1.5" fill="currentColor" /><circle cx="9" cy="12" r="1.5" fill="currentColor" /><circle cx="9" cy="18" r="1.5" fill="currentColor" />
                      <circle cx="15" cy="6" r="1.5" fill="currentColor" /><circle cx="15" cy="12" r="1.5" fill="currentColor" /><circle cx="15" cy="18" r="1.5" fill="currentColor" />
                    </svg>
                  </div>
                  {/* สำหรับมือถือ */}
                  <div className="flex sm:hidden flex-col gap-1 shrink-0 px-1" onClick={e => e.stopPropagation()}>
                    <button className="text-muted-foreground disabled:opacity-30 p-1" disabled={idx === 0 || busy} onClick={() => reorderChannel(c.id, channels[idx - 1].id)}>▲</button>
                    <button className="text-muted-foreground disabled:opacity-30 p-1" disabled={idx === channels.length - 1 || busy} onClick={() => reorderChannel(c.id, channels[idx + 1].id)}>▼</button>
                  </div>
                  
                  {c.logoUrl ? (
                    <img src={c.logoUrl} alt={c.name} className="w-10 h-10 rounded-lg object-contain shrink-0 border" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold shrink-0" 
                      style={{ background: (c.hex || c.color || '#666') + '18', color: c.hex || c.color || '#666' }}>
                      {c.icon || c.name?.[0] || '?'}
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-foreground text-base truncate">{c.name}</div>
                  </div>
                  
                  <Button variant="ghost" size="icon" onClick={() => startEdit(c)} title="แก้ไข">
                    <Icon name="pencil" className="size-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* เพิ่มช่องทางใหม่ Dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => {
        if (!open) {
          setShowAdd(false); setNewName(''); setNewLogo(''); setNewColor(PALETTE[0]); setNewHasAd(false);
        }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="layers" className="size-5" /> เพิ่มช่องทางใหม่
            </DialogTitle>
            <DialogDescription>
              ช่องทางที่ใช้บันทึกยอดขายและค่าโฆษณา
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-6 py-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
              {newLogo ? (
                <img src={newLogo} alt="" className="size-10 rounded object-contain bg-white" />
              ) : (
                <div className="size-10 rounded flex items-center justify-center shrink-0" style={{ background: newColor }}></div>
              )}
              <div className="font-semibold text-lg flex-1 truncate">{newName.trim() || 'ชื่อช่องทาง'}</div>
              {newHasAd && <Badge variant="secondary">มีโฆษณา</Badge>}
            </div>

            <div className="grid gap-2">
              <Label>ชื่อช่องทาง <span className="text-destructive">*</span></Label>
              <Input placeholder="เช่น Shopee, Instagram, TikTok" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newName.trim() && !busy) addChannel(); }} />
            </div>

            <div className="grid gap-2">
              <Label>โลโก้ (PNG/SVG)</Label>
              <div className="flex items-start gap-4">
                <label className="flex flex-col items-center justify-center w-20 h-20 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 overflow-hidden relative" style={newLogo ? { background: '#fff' } : {}}>
                  {newLogo ? (
                    <img src={newLogo} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <div className="flex flex-col items-center justify-center pt-5 pb-6 text-muted-foreground">
                      <Icon name="image" className="size-6 mb-1 opacity-50" />
                      <span className="text-[10px] uppercase font-semibold">Upload</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={async e => {
                    try { setNewLogo(await readFileAsBase64(e.target.files?.[0])); }
                    catch (err) { if (window.__toast) window.__toast(String(err), 'error'); }
                  }} />
                </label>
                {newLogo && (
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setNewLogo('')}>ลบรูป</Button>
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>สีประจำช่องทาง</Label>
              <div className="flex flex-wrap gap-2">
                {PALETTE.map(c => (
                  <button key={c} type="button" className={`size-8 rounded-full flex items-center justify-center transition-all ${newColor === c ? 'ring-2 ring-offset-2 ring-ring' : 'hover:scale-110'}`} 
                    onClick={() => setNewColor(c)} style={{ background: c }}>
                    {newColor === c && <Icon name="check" className="size-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <ShadcnCheckbox id="newHasAd" checked={newHasAd} onCheckedChange={setNewHasAd} />
              <Label htmlFor="newHasAd" className="font-normal text-muted-foreground">มีโฆษณา — เปิดช่องกรอกค่าแอด &amp; แสดงในตารางโฆษณา</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} disabled={busy}>ยกเลิก</Button>
            <Button onClick={addChannel} disabled={!newName.trim() || busy}>
              {busy ? <Icon name="loader" className="mr-2 size-4 animate-spin" /> : <Icon name="check" className="mr-2 size-4" />}
              {busy ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* แก้ไขช่องทาง Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-[425px]">
          {editing && (() => {
            const c = channels.find(x => x.id === editing);
            if (!c) return null;
            const hasLogo = editLogo && editLogo.startsWith('data:');
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Icon name="layers" className="size-5" /> แก้ไขช่องทาง: {c.name}
                  </DialogTitle>
                </DialogHeader>
                
                <div className="grid gap-6 py-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                    {hasLogo ? (
                      <img src={editLogo} alt="" className="size-10 rounded object-contain bg-white" />
                    ) : (
                      <div className="size-10 rounded flex items-center justify-center shrink-0" style={{ background: editColor }}></div>
                    )}
                    <div className="font-semibold text-lg flex-1 truncate">{editName.trim() || 'ชื่อช่องทาง'}</div>
                    {editHasAd && <Badge variant="secondary">มีโฆษณา</Badge>}
                  </div>

                  <div className="grid gap-2">
                    <Label>ชื่อช่องทาง <span className="text-destructive">*</span></Label>
                    <Input value={editName} onChange={e => setEditName(e.target.value)} />
                  </div>

                  <div className="grid gap-2">
                    <Label>โลโก้ (PNG/SVG)</Label>
                    <div className="flex items-start gap-4">
                      <label className="flex flex-col items-center justify-center w-20 h-20 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 overflow-hidden relative" style={hasLogo ? { background: '#fff' } : {}}>
                        {hasLogo ? (
                          <img src={editLogo} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <div className="flex flex-col items-center justify-center pt-5 pb-6 text-muted-foreground">
                            <Icon name="image" className="size-6 mb-1 opacity-50" />
                            <span className="text-[10px] uppercase font-semibold">Upload</span>
                          </div>
                        )}
                        <input type="file" accept="image/*" className="hidden" onChange={async e => {
                          try { setEditLogo(await readFileAsBase64(e.target.files?.[0])); }
                          catch (err) { if (window.__toast) window.__toast(String(err), 'error'); }
                        }} />
                      </label>
                      {editLogo && (
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setEditLogo('')}>ลบรูป</Button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>สีประจำช่องทาง</Label>
                    <div className="flex flex-wrap gap-2">
                      {PALETTE.map(col => (
                        <button key={col} type="button" className={`size-8 rounded-full flex items-center justify-center transition-all ${editColor === col ? 'ring-2 ring-offset-2 ring-ring' : 'hover:scale-110'}`} 
                          onClick={() => setEditColor(col)} style={{ background: col }}>
                          {editColor === col && <Icon name="check" className="size-4 text-white" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>ค่าธรรมเนียมแพลตฟอร์ม (%)</Label>
                    <Input type="number" min="0" max="100" step="0.01" value={editFee} onChange={e => setEditFee(e.target.value)} placeholder="0" className="w-1/2" />
                    <p className="text-xs text-muted-foreground mt-1">เช่น Shopee ~5–10%, ช่องทางตัวเอง (CRM) = 0</p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <ShadcnCheckbox id="editHasAd" checked={editHasAd} onCheckedChange={setEditHasAd} />
                    <Label htmlFor="editHasAd" className="font-normal text-muted-foreground">มีโฆษณา — เปิดช่องกรอกค่าแอด &amp; แสดงในตารางโฆษณา</Label>
                  </div>
                </div>

                <DialogFooter className="flex-row sm:justify-between">
                  <Button variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteChannel(c)} disabled={busy}>
                    <Icon name="trash" className="mr-2 size-4" /> ลบ
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>ยกเลิก</Button>
                    <Button onClick={saveEdit} disabled={!editName.trim() || busy}>
                      {busy ? <Icon name="loader" className="mr-2 size-4 animate-spin" /> : <Icon name="check" className="mr-2 size-4" />}
                      {busy ? 'กำลังบันทึก…' : 'บันทึก'}
                    </Button>
                  </div>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
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
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <Card className="bg-primary/5 border-l-4 border-l-primary shadow-none">
        <CardContent className="p-5 flex gap-4 items-start">
          <Icon name="sparkle" className="size-6 text-primary mt-1" />
          <div>
            <h3 className="text-lg font-bold mb-1 text-foreground">หน้าที่ / ตำแหน่ง</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              จัดการรายการหน้าที่ที่ใช้มอบหมายงาน — แต่ละผู้ใช้จะมี 1 หน้าที่ และในการสร้าง task คุณเลือก "ผู้รับผิดชอบ" จากหน้าที่เหล่านี้
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50 bg-muted/20">
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon name="shield" className="size-5 text-muted-foreground" /> หน้าที่ทั้งหมด ({duties.length})
          </CardTitle>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Icon name="plus" className="size-4 mr-2" /> เพิ่มหน้าที่ใหม่
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex flex-col">
            {duties.length === 0 && (
              <div className="p-10 text-center text-muted-foreground">
                <p className="text-sm">ยังไม่มีหน้าที่ — กด "เพิ่มหน้าที่ใหม่" เพื่อเริ่ม</p>
              </div>
            )}
            {duties.map(d => {
              const count = userCount(d.id);

              return (
                <div key={d.id} className="flex items-center gap-3 p-4 border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <div className="size-4 rounded-sm shrink-0" style={{ background: d.color }}></div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-foreground text-sm">{d.name}</div>
                    {d.description && <div className="text-xs text-muted-foreground mt-0.5 truncate">{d.description}</div>}
                  </div>
                  <Badge variant="outline" className="font-semibold" style={{ background: d.color + '10', color: d.color, borderColor: d.color + '30' }}>
                    {count} คน
                  </Badge>
                  <Button variant="ghost" size="icon" onClick={() => startEdit(d)} title="แก้ไข">
                    <Icon name="pencil" className="size-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* เพิ่มหน้าที่ใหม่ Dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => {
        if (!open) {
          setShowAdd(false); setNewName(''); setNewColor(PALETTE[0]); setNewDesc('');
        }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="shield" className="size-5" /> เพิ่มหน้าที่ใหม่
            </DialogTitle>
            <DialogDescription>
              ใช้มอบหมายงานและจัดกลุ่มผู้รับผิดชอบ
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-6 py-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
              <div className="size-4 rounded-full shrink-0" style={{ background: newColor }}></div>
              <div className="font-semibold text-lg truncate flex-1">
                {newName.trim() || 'ชื่อหน้าที่'}
                {newDesc.trim() && <span className="text-sm font-normal text-muted-foreground ml-2">· {newDesc.trim()}</span>}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>ชื่อหน้าที่ <span className="text-destructive">*</span></Label>
              <Input autoFocus placeholder="เช่น Logistics, Customer Service" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newName.trim() && !busy) addDuty(); }} />
            </div>

            <div className="grid gap-2">
              <Label>สีประจำหน้าที่</Label>
              <div className="flex flex-wrap gap-2">
                {PALETTE.map(c => (
                  <button key={c} type="button" className={`size-8 rounded-full flex items-center justify-center transition-all ${newColor === c ? 'ring-2 ring-offset-2 ring-ring' : 'hover:scale-110'}`} 
                    onClick={() => setNewColor(c)} style={{ background: c }}>
                    {newColor === c && <Icon name="check" className="size-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>คำอธิบาย</Label>
              <Input placeholder="เช่น ทีมจัดส่งสินค้า / แพ็คของ" value={newDesc} onChange={e => setNewDesc(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newName.trim() && !busy) addDuty(); }} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} disabled={busy}>ยกเลิก</Button>
            <Button onClick={addDuty} disabled={!newName.trim() || busy}>
              {busy ? <Icon name="loader" className="mr-2 size-4 animate-spin" /> : <Icon name="check" className="mr-2 size-4" />}
              {busy ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* แก้ไขหน้าที่ Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-[425px]">
          {editing && (() => {
            const d = duties.find(x => x.id === editing);
            if (!d) return null;
            const count = userCount(d.id);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Icon name="shield" className="size-5" /> แก้ไขหน้าที่: {d.name}
                  </DialogTitle>
                </DialogHeader>
                
                <div className="grid gap-6 py-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                    <div className="size-4 rounded-full shrink-0" style={{ background: editColor }}></div>
                    <div className="font-semibold text-lg truncate flex-1">
                      {editName.trim() || 'ชื่อหน้าที่'}
                      {editDesc.trim() && <span className="text-sm font-normal text-muted-foreground ml-2">· {editDesc.trim()}</span>}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>ชื่อหน้าที่ <span className="text-destructive">*</span></Label>
                    <Input value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && editName.trim() && !busy) saveEdit(); }} />
                  </div>

                  <div className="grid gap-2">
                    <Label>สีประจำหน้าที่</Label>
                    <div className="flex flex-wrap gap-2">
                      {PALETTE.map(c => (
                        <button key={c} type="button" className={`size-8 rounded-full flex items-center justify-center transition-all ${editColor === c ? 'ring-2 ring-offset-2 ring-ring' : 'hover:scale-110'}`} 
                          onClick={() => setEditColor(c)} style={{ background: c }}>
                          {editColor === c && <Icon name="check" className="size-4 text-white" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>คำอธิบาย</Label>
                    <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && editName.trim() && !busy) saveEdit(); }} />
                  </div>
                </div>

                <DialogFooter className="flex-row sm:justify-between">
                  <Button variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteDuty(d)} disabled={busy}>
                    <Icon name="trash" className="mr-2 size-4" /> ลบ {count > 0 && `(${count} คน)`}
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>ยกเลิก</Button>
                    <Button onClick={saveEdit} disabled={!editName.trim() || busy}>
                      {busy ? <Icon name="loader" className="mr-2 size-4 animate-spin" /> : <Icon name="check" className="mr-2 size-4" />}
                      {busy ? 'กำลังบันทึก…' : 'บันทึก'}
                    </Button>
                  </div>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
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
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50 bg-muted/20">
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon name="shield" className="size-5 text-primary" /> สิทธิ์ผู้ใช้ ({users.length})
          </CardTitle>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Icon name="userPlus" className="size-4 mr-2" /> เพิ่มผู้ใช้ใหม่
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          <div className="flex flex-col">
            {users.map(u => {
              const tasks = taskCount(u.name, u.department);
              const meta = roleMeta[u.role] || { l: u.role, cls: '' };
              
              return (
                <div key={u.email} className="flex flex-wrap items-center gap-4 p-4 border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <Avatar name={u.name} color={u.color || '#888'} size={40} />
                  <div className="flex-1 min-w-[150px]">
                    <div className="font-bold text-foreground text-sm truncate">{u.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">{u.email}</div>
                  </div>
                  
                  <div className="flex items-center justify-end gap-3 flex-wrap ml-auto">
                    {u.department && (
                      <Badge variant="outline" className="font-semibold" style={{ background: (u.color || '#666') + '10', color: u.color || '#666', borderColor: (u.color || '#666') + '30' }}>
                        {u.department}
                      </Badge>
                    )}
                    {tasks > 0 && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{tasks} งาน</span>
                    )}
                    <Badge variant="outline" className={`whitespace-nowrap ${meta.cls === 'chip-good' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : meta.cls === 'chip-accent' ? 'bg-primary/10 text-primary border-primary/20' : ''}`}>
                      {meta.l}
                    </Badge>
                    <Button variant="ghost" size="icon" onClick={() => startEdit(u)} title="แก้ไข" className="shrink-0">
                      <Icon name="pencil" className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* เพิ่มผู้ใช้ใหม่ Dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) closeAdd(); }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="userPlus" className="size-5" /> เพิ่มผู้ใช้ใหม่
            </DialogTitle>
            <DialogDescription>
              กรอกข้อมูลเพื่อเพิ่มสมาชิกเข้าทีม บันทึกลง Supabase อัตโนมัติ
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-6 py-4 max-h-[70vh] overflow-y-auto px-1">
            <div className="grid gap-2">
              <Label>อีเมล <span className="text-destructive">*</span></Label>
              <Input type="email" placeholder="name@tmk.co" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
              <p className="text-xs text-muted-foreground">ใช้สำหรับเข้าสู่ระบบ</p>
            </div>

            <div className="grid gap-2">
              <Label>ชื่อที่แสดง</Label>
              <Input placeholder="เช่น คุณ A หรือชื่อทีม" value={newName} onChange={e => setNewName(e.target.value)} />
              <p className="text-xs text-muted-foreground">เว้นว่างได้ — ระบบจะใช้ชื่อหน้าอีเมลแทน</p>
            </div>

            <div className="grid gap-2">
              <Label>หน้าที่ / แผนก</Label>
              {DUTIES.length === 0 ? (
                <div className="text-sm text-amber-600 flex items-center gap-2 bg-amber-50 p-2 rounded">
                  <Icon name="flame" className="size-4" /> ยังไม่มีหน้าที่ — สร้างที่แท็บ "หน้าที่" ก่อน
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${!newDutyId ? 'bg-primary text-primary-foreground border-primary font-medium' : 'bg-background hover:bg-muted'}`} onClick={() => setNewDutyId('')}>
                      — ไม่ระบุ —
                    </button>
                    {DUTIES.map(d => (
                      <button key={d.id} type="button" className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-colors ${newDutyId === d.id ? 'bg-primary/10 border-primary font-medium' : 'bg-background hover:bg-muted'}`} onClick={() => setNewDutyId(d.id)}>
                        <span className="size-2 rounded-full" style={{ background: d.color }}></span>
                        {d.name}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">ใช้มอบหมายงานใน task · kanban · ปฏิทิน</p>
                </>
              )}
            </div>

            <div className="grid gap-3">
              <Label>สิทธิ์การเข้าถึง</Label>
              <div className="grid gap-2">
                {Object.entries(roleMeta).map(([k, v]) => {
                  const on = newRole === k;
                  return (
                    <button key={k} type="button" onClick={() => setNewRole(k)}
                      className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${on ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card hover:border-primary/50'}`}>
                      <div className={`mt-0.5 size-4 rounded-full border flex items-center justify-center shrink-0 ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}>
                        {on && <Icon name="check" className="size-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold flex items-center gap-2 ${on ? 'text-primary' : 'text-foreground'}`}>
                          <Icon name={v.icon} className="size-4" /> {v.l}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{v.d}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeAdd} disabled={busy}>ยกเลิก</Button>
            <Button onClick={addUser} disabled={!newEmail.trim() || busy}>
              {busy ? <Icon name="loader" className="mr-2 size-4 animate-spin" /> : <Icon name="userPlus" className="mr-2 size-4" />}
              {busy ? 'กำลังบันทึก…' : 'เพิ่มผู้ใช้'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* แก้ไขผู้ใช้ Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) cancelEdit(); }}>
        <DialogContent className="sm:max-w-[425px]">
          {editing && (() => {
            const u = users.find(x => x.email === editing);
            if (!u) return null;
            const tasks = taskCount(u.name, u.department);
            
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Icon name="pencil" className="size-5" /> แก้ไขผู้ใช้
                  </DialogTitle>
                  <DialogDescription className="truncate">
                    {u.email}
                  </DialogDescription>
                </DialogHeader>
                
                <div className="grid gap-6 py-4 max-h-[70vh] overflow-y-auto px-1">
                  <div className="flex gap-4 items-end">
                    <Avatar name={u.name} color={u.color || '#888'} size={52} />
                    <div className="grid gap-2 flex-1">
                      <Label>ชื่อที่แสดง <span className="text-xs font-normal text-muted-foreground">(ลิงก์กับงาน)</span></Label>
                      <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="ชื่อที่ใช้แสดงในระบบ" className="font-semibold" />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>หน้าที่ / แผนก</Label>
                    {DUTIES.length === 0 ? (
                      <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded">ยังไม่มีหน้าที่ — สร้างที่แท็บ "หน้าที่" ก่อน</div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${!editDutyId ? 'bg-primary text-primary-foreground border-primary font-medium' : 'bg-background hover:bg-muted'}`} onClick={() => setEditDutyId('')}>
                          — ไม่ระบุ —
                        </button>
                        {DUTIES.map(d => (
                          <button key={d.id} type="button" className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-colors ${editDutyId === d.id ? 'bg-primary/10 border-primary font-medium' : 'bg-background hover:bg-muted'}`} onClick={() => setEditDutyId(d.id)}>
                            <span className="size-2 rounded-full" style={{ background: d.color }}></span>
                            {d.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3">
                    <Label>สิทธิ์การเข้าถึง</Label>
                    <div className="grid gap-2">
                      {Object.entries(roleMeta).map(([k, v]) => {
                        const on = editRole === k;
                        return (
                          <button key={k} type="button" onClick={() => setEditRole(k)}
                            className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${on ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card hover:border-primary/50'}`}>
                            <div className={`mt-0.5 size-4 rounded-full border flex items-center justify-center shrink-0 ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}>
                              {on && <Icon name="check" className="size-3" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={`text-sm font-semibold flex items-center gap-2 ${on ? 'text-primary' : 'text-foreground'}`}>
                                <Icon name={v.icon} className="size-4" /> {v.l}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">{v.d}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {tasks > 0 && (
                    <div className="text-xs text-primary flex items-center gap-2 bg-primary/10 p-2 rounded">
                      <Icon name="listChecks" className="size-4 shrink-0" /> เปลี่ยนชื่อจะอัปเดตอัตโนมัติใน {tasks} งานที่เกี่ยวข้อง
                    </div>
                  )}

                  <div className="grid gap-3 pt-4 border-t border-dashed">
                    <Label>รหัสผ่านเข้าระบบ</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input type={pwShow ? 'text' : 'password'} value={pwInput} onChange={e => setPwInput(e.target.value)} placeholder="ตั้งรหัสใหม่ (อย่างน้อย 6 ตัว)" autoComplete="new-password" className="pr-10" />
                        <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full w-10 text-muted-foreground hover:text-foreground" onClick={() => setPwShow(!pwShow)}>
                          <Icon name="eye" className="size-4" />
                        </Button>
                      </div>
                      <Button type="button" variant="outline" size="icon" onClick={genPassword} disabled={pwBusy} title="สุ่มรหัส">
                        <Icon name="sparkle" className="size-4 text-primary" />
                      </Button>
                      <Button type="button" onClick={() => resetPassword(u.email)} disabled={pwBusy || pwInput.length < 6}>
                        {pwBusy ? 'กำลังตั้ง...' : 'ตั้งรหัส'}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">บัญชีใหม่ต้องสร้างใน Supabase Dashboard ก่อน แล้วตั้ง/รีเซ็ตรหัสที่นี่ได้</p>
                  </div>
                </div>

                <DialogFooter className="flex-row sm:justify-between pt-2">
                  <Button variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteUser(u.email)} disabled={busy}>
                    <Icon name="trash" className="mr-2 size-4" /> ลบ
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={cancelEdit} disabled={busy}>ยกเลิก</Button>
                    <Button onClick={saveEdit} disabled={!editName.trim() || busy}>
                      {busy ? <Icon name="loader" className="mr-2 size-4 animate-spin" /> : <Icon name="check" className="mr-2 size-4" />}
                      {busy ? 'กำลังบันทึก...' : 'บันทึก'}
                    </Button>
                  </div>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
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
      <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
        <Card className="border-dashed bg-muted/10">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Icon name="trash" className="size-16 opacity-20 mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">ถังขยะว่างเปล่า</h3>
            <p className="text-sm text-muted-foreground">รายการที่ลบจะถูกเก็บไว้ที่นี่ · กู้คืนได้ตลอด</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between pb-4 border-b border-border/50 bg-muted/20">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Icon name="trash" className="size-5 text-destructive" /> ถังขยะ <span className="text-sm text-muted-foreground font-normal">({items.length})</span>
            </CardTitle>
            <CardDescription className="mt-1.5">กู้คืนได้ · หรือลบถาวร</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="bg-amber-500/10 border-l-4 border-amber-500 p-3 m-4 rounded-r-md">
            <p className="text-sm text-amber-700 font-medium">หมายเหตุ: กู้คืนแคมเปญแล้ว งานที่เคยผูกจะไม่กลับมาผูกอัตโนมัติ (ต้องเลือกแคมเปญใหม่ในแต่ละงาน)</p>
          </div>

          <div className="flex flex-col divide-y divide-border/50">
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <Icon name="loader" className="size-6 animate-spin opacity-50" />
                <p className="text-sm">กำลังโหลด…</p>
              </div>
            ) : items.map((it, i) => (
              <div key={it.meta.table + it.id + i} className="flex flex-wrap sm:flex-nowrap items-center gap-4 p-4 hover:bg-muted/20 transition-colors">
                <Badge variant="outline" className="bg-muted shrink-0 text-xs py-1">
                  {it.meta.type}
                </Badge>
                
                <div className="flex-1 min-w-[200px]">
                  <div className="font-semibold text-sm truncate text-foreground">{it.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">ลบเมื่อ {fmtDate(it.deletedAt)}</div>
                </div>
                
                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end mt-2 sm:mt-0">
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => restore(it)}>
                    <Icon name="refreshCcw" className="size-4 mr-2" /> กู้คืน
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" disabled={busy} onClick={() => purge(it)}>
                    <Icon name="trash" className="size-4 mr-2" /> ลบถาวร
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
