/* ============================================================
   TMK Operation — Views part 2: Planner + Catalog + System
   ============================================================ */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TMK } from './data.js';
import { B, P, N, Icon, Avatar, Ring, UserIcon, PageSkeleton, Skel, SkelTable, useDelayedFlag, useBeat, CardHead } from './components.jsx';
import { Modal, MpImportModal, SideSheet } from './modals.jsx';
import { DonutChart, AreaTrend, HBars, MetricCard, Gauge, channelColor } from './charts.jsx';
import { SaleDashboard } from './saleDashboard.jsx';
import { ImportExportHub, SalesAliasManager } from './saleImportHub.jsx';
import { SaleEntryView } from './saleEntry.jsx';
import { CrmView } from './saleCrm.jsx';
import { ShirtCatalogView } from './saleCatalog.jsx';
import { WhatsNewPage } from './WhatsNew.jsx';
import { GOLDEN_DESIGNS, resolveDesign, suggestDesign } from './lib/shirtCatalog.js';
import { makeSkuResolver, loadResolverMaps, skuOverrideKey } from './lib/designResolve.js';
import { buildMatchers, planRematch } from './lib/mpReport.js';
import { GOLDEN_CATALOG_GRID } from './lib/goldenGrid.js';
import { useData, computeMonth } from './dataContext.jsx';
import { usePersistedState } from './hooks/usePersistedState.js';
import { downloadCsv } from './lib/exportCsv.js';
import { useTableSort, SortHead, DensityToggle, ColumnToggle, SortableTable } from './components/DataTableParts.jsx';
import { supabase } from './lib/supabaseClient.js';
import { cachedFetchAll, cachedFetchRange, getDateBounds, clearSaleCache, ORDERS_SEL, SKUS_SEL } from './lib/saleData.js';
import { PRESETS, presetRange } from './lib/saleTime.js';
import { logAudit } from './lib/audit.js';
import { fetchTargets, saveTarget, commissionFor } from './lib/targets.js';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SearchInput } from '@/components/ui/search-input';
import { Progress } from '@/components/ui/progress';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Calendar } from '@/components/ui/calendar';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { th } from 'date-fns/locale';
const DD = TMK;

// a11y: ให้ clickable div กดด้วยคีย์บอร์ดได้ (Enter/Space → trigger onClick)
const onCardKey = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); e.currentTarget.click(); } }; // เฉพาะตอนโฟกัสที่การ์ดเอง ไม่ใช่ control ลูก (select/ปุ่ม) → กัน Space/Enter ของ select เด้งเปิด modal

// guard สิทธิ์ (ฝั่ง client) — กัน viewer แก้ผ่านหน้าตั้งค่า + จัดการผู้ใช้/สิทธิ์เฉพาะ admin
const guardEdit = () => { if (!window.__canEdit) { window.__toast?.('สิทธิ์ "ดูอย่างเดียว" — แก้ไขไม่ได้ (ติดต่อแอดมิน)', 'warn'); return false; } return true; };
const guardAdmin = () => { if (!window.__isAdmin) { window.__toast?.('เฉพาะแอดมินจัดการผู้ใช้และสิทธิ์ได้', 'warn'); return false; } return true; };

/* ====================  PLANNER  ==================== */
const stLabel = { done: 'เสร็จ', review: 'รอตรวจ', inprogress: 'กำลังทำ', todo: 'รอ' };
const stCls = { done: 'chip-good', review: 'chip-warn', inprogress: 'chip-accent', todo: '' };
const chipVar2 = (cls) => ({ 'chip-good': 'success', 'chip-warn': 'warning', 'chip-bad': 'danger', 'chip-accent': 'accent', '': 'secondary' }[cls || ''] || 'secondary');

// ดรอปดาวน์ฟิลเตอร์ — ใช้กับตัวเลือกเยอะ (แคมเปญ/หน้าที่) ให้แถบสะอาด ไม่กองพิลล์ · shadcn DropdownMenu
// multi-select: value = array ของ id · เลือกได้หลายตัว (เมนูไม่ปิดตอนเลือก)
function FilterDropdown({ label, icon, options, value, onChange }) {
  const sel = Array.isArray(value) ? value : (value ? [value] : []);
  const active = sel.length > 0;
  const selOpts = options.filter(o => sel.includes(o.id));
  const trigText = sel.length === 0 ? label : sel.length === 1 ? (selOpts[0]?.name || label) : `${label} (${sel.length})`;
  const toggle = (id) => onChange(sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={'rounded-full font-medium' + (active ? ' border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-2)]' : '')}>
          {sel.length === 1 ? <span className="dot-c" style={{ background: selOpts[0]?.color }} /> : <Icon name={icon} />}
          <span className="max-w-[140px] truncate">{trigText}</span>
          <Icon name="down" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-52 overflow-auto">
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onChange([]); }}>
          <span className="flex-1">ทั้งหมด</span>{sel.length === 0 && <Icon name="check" />}
        </DropdownMenuItem>
        {options.map(o => (
          <DropdownMenuItem key={o.id} onSelect={(e) => { e.preventDefault(); toggle(o.id); }}>
            <span className="dot-c" style={{ background: o.color }} />
            <span className="min-w-0 flex-1 truncate">{o.name}</span>
            {sel.includes(o.id) && <Icon name="check" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PlannerFilters({ filterCamp, setFilterCamp, filterStatus, setFilterStatus, filterResp, setFilterResp, search, setSearch, respOptions }) {
  const respColor = (name) => (DD.duties.find(d => d.name === name)?.color) || (DD.staff.find(s => s.name === name)?.color) || 'var(--ink-3)';
  const anyActive = filterStatus !== 'all' || (filterCamp?.length) || (filterResp?.length) || search;
  const clearAll = () => { setFilterStatus('all'); setFilterCamp([]); setFilterResp([]); setSearch(''); };
  const campOpts = (DD.campaigns || []).map(c => ({ id: c.id, name: c.name, color: c.color }));
  const respOpts = respOptions.map(r => ({ id: r, name: r, color: respColor(r) }));
  return (
    <Card className="p-3" style={{ marginBottom: 12 }}>
      <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
        {/* สถานะ — segmented control (shadcn ToggleGroup) */}
        <ToggleGroup type="single" value={filterStatus} onValueChange={(v) => v && setFilterStatus(v)} className="gap-0.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)] p-1">
          {[['all','ทั้งหมด'],['active','กำลังทำ'],['done','เสร็จแล้ว']].map(([s, l]) => (
            <ToggleGroupItem key={s} value={s} size="sm" className="rounded-full px-3.5 text-[var(--ink-3)] hover:text-[var(--ink)] data-[state=on]:bg-[var(--ink)] data-[state=on]:text-white">{l}</ToggleGroupItem>
          ))}
        </ToggleGroup>
        {/* แคมเปญ + หน้าที่ — dropdown */}
        <FilterDropdown label="แคมเปญ" icon="megaphone" options={campOpts} value={filterCamp} onChange={setFilterCamp} />
        {respOpts.length > 0 && <FilterDropdown label="หน้าที่" icon="shield" options={respOpts} value={filterResp} onChange={setFilterResp} />}
        <div style={{ flex: 1 }} />
        {anyActive && <Button variant="ghost" size="sm" onClick={clearAll} title="ล้างตัวกรองทั้งหมด"><Icon name="x" /> ล้าง</Button>}
        <SearchInput placeholder="ค้นหางาน..." value={search} onChange={e => setSearch(e.target.value)} wrapperClassName="w-[180px]" />
      </div>
    </Card>
  );
}

function filterTasks(tasks, filterCamp, filterStatus, search, filterResp) {
  return (tasks || []).filter(t => {
    if (filterCamp?.length && !filterCamp.includes(t.camp)) return false;
    if (filterResp?.length && !(t.responsible || []).some(r => filterResp.includes(r))) return false;
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
            {Array.from({ length: n }).map((_, i) => <Card key={i} className="p-3" style={{ marginBottom: 10 }}><Skel w="85%" h={12} /><Skel w="60%" h={9} style={{ marginTop: 9 }} /><div className="row" style={{ gap: 6, marginTop: 11 }}><Skel w={42} h={16} r={10} /><Skel w={42} h={16} r={10} /></div></Card>)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlannerView({ sub, tasks, setTasks }) {
  const [filterCamp, setFilterCamp] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterResp, setFilterResp] = useState([]);
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
        <Card className="p-[22px]">
          <CardHeader className="flex-row items-center justify-between space-y-0 p-0 pb-4 flex-wrap gap-[10px]">
            <div className="row" style={{ gap: 8 }}>
              <button className="icon-btn" onClick={() => shiftMonth(-1)} title="เดือนก่อน"><span style={{ transform: 'rotate(180deg)', display: 'grid' }}><Icon name="chevR" /></span></button>
              <h3 style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>{MONTHS_TH[ym.m]} {ym.y}</h3>
              <button className="icon-btn" onClick={() => shiftMonth(1)} title="เดือนถัดไป"><Icon name="chevR" /></button>
              <Button variant="outline" size="sm" onClick={goToday}>วันนี้</Button>
            </div>
          </CardHeader>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5 }}>
            {DAY_LABELS.map(d => <div key={d} className="cap" style={{ textAlign: 'center', padding: '6px 0', fontWeight: 'var(--fw-sem)' }}>{d}</div>)}
          </div>
          <div className="cal-month-grid">
            {cells.map((d, i) => <DayCell key={i} d={d} />)}
          </div>
        </Card>

        <Card className="p-[22px]">
          <div className="eyebrow" style={{ marginBottom: 4 }}>{sel} {MONTHS_TH_SHORT[ym.m]} {ym.y}</div>
          <div className="row between" style={{ marginBottom: 14 }}>
            <h3>{selTasks.length} งาน</h3>
            <Button size="sm" onClick={() => window.__openModal('task', { date: `${greg}-${String(ym.m + 1).padStart(2, '0')}-${String(sel).padStart(2, '0')}` })}><Icon name="plus" /> เพิ่ม</Button>
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
                  <div style={{ minWidth: 0 }}><div className="cap">แคมเปญ</div><Badge variant="outline" style={{ background: `color-mix(in srgb, ${c?.color || '#888'} 16%, transparent)`, color: `color-mix(in srgb, ${c?.color || '#888'} 72%, var(--ink))`, maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'bottom' }}>{c?.name || '-'}</Badge></div>
                  <div><div className="cap">ช่องทาง</div><TaskChannels channel={t.channel} size={16} /></div>
                  <div><div className="cap">สถานะ</div><Badge variant={chipVar2(stCls[t.status] || '')} style={{ whiteSpace: 'nowrap' }}>{stLabel[t.status]}</Badge></div>
                </div>
                <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
                  <span className="cap" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>ผู้รับผิดชอบ:</span>
                  {(t.responsible || []).map(r => { const s = DD.staff.find(x => x.name === r) || { color: '#888' }; return <Badge key={r} variant="outline" style={{ background: `color-mix(in srgb, ${s.color} 16%, transparent)`, color: `color-mix(in srgb, ${s.color} 72%, var(--ink))`, whiteSpace: 'nowrap' }}>{r}</Badge>; })}
                </div>
              </div>
            );
          })}
        </Card>
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
                <Badge variant="secondary">{list.length}</Badge>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {list.map(t => {
                  const c = DD.campaigns.find(x => x.id === t.camp) || { name: '', color: '#888' };
                  return (
                    <Card key={t.id} draggable role="button" tabIndex={0} onKeyDown={onCardKey}
                      onDragStart={() => { dragId.current = t.id; }}
                      onDragEnd={() => { dragId.current = null; setOver(null); }}
                      onClick={() => window.__openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] })}
                      className="p-3" style={{ borderRadius: 'var(--r)', cursor: 'grab', boxShadow: 'var(--sh-sm)', padding: '12px 14px', borderLeft: `3px solid ${c.color}` }}>
                      <div className="row between" style={{ marginBottom: 4 }}>
                        <div>
                          <div className="sm" style={{ fontWeight: 600, lineHeight: 1.35 }}>{t.title}</div>
                          {t.detail && <div className="cap" style={{ marginTop: 2 }}>{t.detail}</div>}
                        </div>
                      </div>
                      <div className="row wrap" style={{ gap: 6 }}>
                        <Badge variant="outline" style={{ background: c.color+'22', color: c.color }}>{c.name}</Badge>
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
                    </Card>
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
            <Card key={c.id} className="p-3" style={{ display: 'flex', alignItems: 'center', gap: 14, borderLeft: `3px solid ${c.color}`, cursor: 'pointer' }} onClick={() => fProps.setFilterCamp(fProps.filterCamp === c.id ? null : c.id)}>
              <Ring pct={pct} size={48} stroke={5} color={c.color}><span className="num" style={{ fontSize: 'var(--fs-micro)', fontWeight: 700 }}>{pct}%</span></Ring>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="sm" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                <div className="cap">{done}/{tasks.length} งาน · {c.start}–{c.end}</div>
              </div>
              <Badge variant={chipVar2(st.cls || '')}>{st.l}</Badge>
            </Card>
          );
        })}
      </div>

      {/* Vertical Timeline */}
      <Card className="p-[22px]">
        <div className="row between" style={{ marginBottom: 12 }}>
          <span></span>
          <Button size="sm" onClick={() => window.__openModal('task')}><Icon name="plus" /> เพิ่มงาน</Button>
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
                    {isToday && <Badge variant="secondary" style={{ marginLeft: 8 }}>วันนี้</Badge>}
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
                          {isOverdue && <Badge variant="danger">เกินกำหนด</Badge>}
                        </div>
                        <div className="row wrap" style={{ gap: 8 }}>
                          <Badge variant="outline" style={{ background: (c?.color || '#888') + '22', color: c?.color || '#888' }}>{c?.name || '-'}</Badge>
                          <TaskChannels channel={t.channel} size={16} />
                          <Badge variant={chipVar2(stCls[t.status] || '')}>{stLabel[t.status]}</Badge>
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
      </Card>
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
const Sec = ({ title, icon, tone, items, empty, action, onDetail, searchable }) => {
  const [open, setOpen] = useState(items.length > 0);
  const [q, setQ] = useState('');
  const shown = q.trim()
    ? items.filter(d => `${d.key} ${d.sample || ''} ${(d.channels || []).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()))
    : items;
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button type="button" className="row between" style={{ width: '100%', padding: '12px 14px', borderBottom: open ? '1px solid var(--line)' : 'none', background: 'var(--surface-2, var(--surface))', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
            <span className="row" style={{ gap: 8, fontWeight: 700, minWidth: 0 }}>
              <span style={{ color: 'var(--ink-4)', display: 'inline-flex', transition: 'transform .15s', transform: open ? 'none' : 'rotate(-90deg)' }}><Icon name="chevD" /></span>
              <span style={{ color: tone }}><Icon name={icon} /></span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
            </span>
            <Badge variant={items.length ? 'warning' : 'success'} className="flex-none">{items.length ? `${N(items.length)} รายการ` : 'ปกติ'}</Badge>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {items.length === 0
            ? <div className="row" style={{ gap: 8, padding: '16px 14px', color: 'var(--good)', fontSize: 13 }}><Icon name="check" /> {empty}</div>
            : <>
              {searchable && items.length > 12 && (
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
                  <SearchInput value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาลาย / สี / ช่องทาง…" className="h-8" />
                </div>
              )}
              {shown.length === 0
                ? <div style={{ padding: '16px 14px', color: 'var(--ink-4)', fontSize: 13 }}>ไม่พบรายการที่ตรงกับ “{q}”</div>
                : <div style={{ maxHeight: 360, overflow: 'auto' }}><Table style={{ width: '100%' }}><TableBody>
                  {shown.map((d, i) => (
                    <TableRow key={i} style={{ borderTop: i ? '1px solid var(--line)' : 'none' }}>
                      <TableCell style={{ padding: '8px 14px' }}><b>{d.key}</b>{d.sample && d.sample !== d.key ? <div className="cap" style={{ color: 'var(--ink-4)' }}>{String(d.sample).slice(0, 38)}</div> : null}</TableCell>
                      <TableCell className="num" style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{N(d.count)} แถว · {N(d.qty)} ตัว</TableCell>
                      <TableCell className="cap" style={{ padding: '8px 10px', color: 'var(--ink-3)' }}>{d.channels.join(', ')}</TableCell>
                      <TableCell style={{ padding: '6px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Button variant="outline" size="sm" onClick={() => onDetail({ title, icon, tone, item: d })}><Icon name="search" /> ดู</Button>
                        {action && <Button variant="outline" size="sm" style={{ marginLeft: 6 }} onClick={() => action(d.key)}><Icon name="plus" /> {action.label}</Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody></Table></div>}
            </>}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

// Combobox เลือกชื่อลายมาตรฐาน (shadcn Popover + Command/cmdk) — เลื่อนได้แม้อยู่ใน SideSheet
function DesignCombobox({ value, code, onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open}
          className="w-full justify-between font-normal" style={{ color: value ? 'var(--ink-1)' : 'var(--ink-4)' }}>
          <span className="truncate">{value ? <>{value}{code ? <span className="dim"> · {code}</span> : null}</> : 'พิมพ์/เลือกชื่อลาย เช่น ราษฎร์ภักดี'}</span>
          <Icon name="chevD" className="opacity-60 flex-none" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 w-[var(--radix-popover-trigger-width)]" style={{ minWidth: 280 }}>
        <Command>
          <CommandInput placeholder="ค้นหาชื่อลาย / รหัส / ประเภท…" />
          <CommandList>
            <CommandEmpty>ไม่พบลายที่ตรงกัน</CommandEmpty>
            <CommandGroup>
              {GOLDEN_DESIGNS.map(d => {
                const sel = d.name === value;
                return (
                  <CommandItem key={d.code + d.name} value={`${d.name} ${d.code} ${d.type}`}
                    onSelect={() => { onPick({ name: d.name, code: d.code }); setOpen(false); }}>
                    <span className="row between w-full" style={{ gap: 8, minWidth: 0 }}>
                      <span className="row" style={{ gap: 8, minWidth: 0, alignItems: 'center' }}>
                        <span style={{ width: 16, color: 'var(--accent)', flex: 'none' }}>{sel && <Icon name="check" />}</span>
                        <span className="truncate" style={{ fontWeight: sel ? 600 : 400 }}>{d.name}</span>
                      </span>
                      <span className="cap flex-none" style={{ color: 'var(--ink-4)' }}>{d.code} · {d.type}</span>
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function HealthHub() {
  const [skus, setSkus] = useState(null);
  const [aliases, setAliases] = useState([]);
  const [noTable, setNoTable] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState(null); // { kind, term, code, design }
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [aliasQ, setAliasQ] = useState('');
  const [rematch, setRematch] = useState(null); // null | ผลจาก planRematch
  const [rmBusy, setRmBusy] = useState(false);
  const [rmProg, setRmProg] = useState(0);

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
  const delAlias = async (a) => {
    const { error } = await supabase.from('tmk_mp_aliases').delete().eq('id', a.id);
    if (error) { window.__toast && window.__toast('ลบไม่สำเร็จ', 'error'); return; }
    load();
    // เลิกทำ = เขียน alias กลับ (มีข้อมูลแถวครบ)
    const undo = async () => {
      const { id, kind, term, code, design } = a;
      const { error: e2 } = await supabase.from('tmk_mp_aliases').upsert({ id, kind, term, code: code || '', design: design || '', updated_at: new Date().toISOString() }, { onConflict: 'id' });
      window.__toast && window.__toast(e2 ? 'กู้คืนไม่สำเร็จ' : 'กู้คืน alias แล้ว', e2 ? 'error' : 'success');
      load();
    };
    window.__toast && window.__toast(`ลบ alias "${a.term}" แล้ว`, 'success', 6000, { label: 'เลิกทำ', onClick: undo });
  };

  // 2C — จับคู่ลายใหม่บนข้อมูลเดิม (ไม่ต้อง reimport): รัน buildMatchers ตาม alias/แคตตาล็อกปัจจุบัน
  const scanRematch = () => {
    const M = buildMatchers(GOLDEN_CATALOG_GRID, aliases);
    const plan = planRematch(skus || [], M);
    setRematch(plan);
    if (!plan.changes.length) window.__toast && window.__toast('ข้อมูลจับคู่เป็นปัจจุบันแล้ว — ไม่มีอะไรต้องอัปเดต', 'success');
  };
  const applyRematch = async () => {
    if (!rematch || !rematch.changes.length) return;
    setRmBusy(true); setRmProg(0);
    let ok = 0, fail = 0; const ch = rematch.changes;
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i];
      let q = supabase.from('tmk_mp_skus').update({ design: c.design, product_code: c.product_code, match_how: c.match_how })
        .eq('source', c.source).eq('raw_sku_or_name', c.raw);
      q = c.oldCode ? q.eq('product_code', c.oldCode) : q.or('product_code.is.null,product_code.eq.');
      const { error } = await q;
      if (error) fail++; else ok++;
      setRmProg(Math.round((i + 1) / ch.length * 100));
    }
    setRmBusy(false);
    const total = rematch.filled + rematch.fixed;
    logAudit({ action: 'update', entityType: 'data', entityName: 're-match', summary: `จับคู่ลายใหม่ ${total} แถว (เติม ${rematch.filled} · แก้ ${rematch.fixed})` });
    clearSaleCache();
    window.__toast && window.__toast(fail ? `อัปเดต ${ok} กลุ่มสำเร็จ · ${fail} กลุ่มล้มเหลว` : `อัปเดตการจับคู่สำเร็จ ${ok} กลุ่ม (${total} แถว)`, fail ? 'warn' : 'success');
    setRematch(null); load();
  };

  if (skus === null && !err) return <PageSkeleton />;
  if (err) return <div className="content-inner"><Card className="p-5" style={{ color: 'var(--bad)' }}>โหลดข้อมูลไม่ได้: {err}</Card></div>;

  const matchPct = A.total ? Math.round(A.matched / A.total * 100) : 0;

  return (
    <div className="content-inner" style={{ display: 'grid', gap: 14 }}>
      {noTable && <Card className="p-3" style={{ color: 'var(--warn)', borderLeft: '3px solid var(--warn)' }}><Icon name="alertTriangle" /> ยังไม่ได้สร้างตาราง <code>tmk_mp_aliases</code> — รันไฟล์ <code>supabase/migrations/20260623-mp-aliases.sql</code> ใน Supabase ก่อน จึงจะตั้ง alias ได้ (ส่วนอื่นยังดูได้ปกติ)</Card>}

      <ImportExportHub />

      <Card className="p-4">
        <CardHead icon="refresh" title={<>จับคู่ลายใหม่จากข้อมูลเดิม <span className="dim">(ไม่ต้องนำเข้าไฟล์ซ้ำ)</span></>}
          sub={<>ตั้ง alias หรือแก้แคตตาล็อกแล้ว กดปุ่มนี้เพื่อรันการจับคู่ลายใหม่บนออเดอร์เก่าทั้งหมด แล้ว<b>บันทึกถาวร</b> — ไม่ต้องอัปไฟล์</>} />
        <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant="outline" onClick={scanRematch} disabled={rmBusy || !skus}><Icon name="search" /> ตรวจการจับคู่ใหม่</Button>
          {rematch && (rematch.changes.length
            ? <Badge variant="secondary">พบ {N(rematch.filled + rematch.fixed)} แถว (เติมที่ว่าง {N(rematch.filled)} · แก้ที่ผิด {N(rematch.fixed)})</Badge>
            : <span className="cap row" style={{ color: 'var(--good)', gap: 4 }}><Icon name="check" /> จับคู่เป็นปัจจุบันแล้ว</span>)}
        </div>
        {rematch && rematch.changes.length > 0 && <>
          <div className="table-wrap" style={{ maxHeight: 240, overflow: 'auto', marginTop: 10 }}><Table>
            <TableHeader><TableRow><TableHead>ข้อความในไฟล์</TableHead><TableHead>ลายใหม่</TableHead><TableHead>รหัส</TableHead><TableHead style={{ textAlign: 'right' }}>แถว</TableHead></TableRow></TableHeader>
            <TableBody>{rematch.changes.slice(0, 60).map((c, i) => (
              <TableRow key={i}>
                <TableCell className="num" style={{ maxWidth: 240, whiteSpace: 'normal', wordBreak: 'break-word' }}>{c.raw || '—'}</TableCell>
                <TableCell>{c.design} {c.filled ? <Badge variant="success" className="ml-1">เติม</Badge> : <Badge variant="secondary" className="ml-1">แก้</Badge>}</TableCell>
                <TableCell className="num">{c.product_code || '—'}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right' }}>{N(c.rows)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table></div>
          {rematch.changes.length > 60 && <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 4 }}>…และอีก {N(rematch.changes.length - 60)} กลุ่ม</div>}
          <div className="row" style={{ gap: 10, marginTop: 12, alignItems: 'center' }}>
            <Button onClick={applyRematch} disabled={rmBusy}><Icon name="check" /> {rmBusy ? `กำลังอัปเดต… ${rmProg}%` : `ใช้การจับคู่ใหม่ (${N(rematch.changes.length)} กลุ่ม)`}</Button>
            <Button variant="ghost" onClick={() => setRematch(null)} disabled={rmBusy}>ยกเลิก</Button>
          </div>
        </>}
      </Card>

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
            <Button variant="outline" onClick={() => setForm(null)}>ยกเลิก</Button>
            <Button disabled={busy || !form.term.trim()} onClick={saveAlias}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก alias'}</Button>
          </>}>
          <div className="field"><label>คำที่เจอในไฟล์</label><Input value={form.term} onChange={e => setForm({ ...form, term: e.target.value })} placeholder={form.kind === 'color' ? 'เช่น ส้มอิฐ' : 'เช่น ราษภักดี'} autoFocus /></div>
          {form.kind === 'design' && <>
            <div className="field"><label>ชื่อลายมาตรฐาน (เลือกจากแคตตาล็อก {GOLDEN_DESIGNS.length} ลาย)</label>
              <DesignCombobox value={form.design} code={form.code} onPick={({ name, code }) => setForm({ ...form, design: name, code: code || form.code })} />
            </div>
            <div className="field"><label>รหัส catalog (เติมให้อัตโนมัติเมื่อเลือกลาย)</label><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="เช่น JRP111" /></div>
            {(() => { const exact = resolveDesign(form.term); const g = exact || suggestDesign(form.term); return g && g.name !== form.design ? <div className="cap" style={{ color: 'var(--accent)' }}><Icon name="lightbulb" /> {exact ? 'แนะนำ' : 'ใกล้เคียง (สะกดต่าง?)'}: {g.name} ({g.code}) — <Button variant="outline" size="sm" style={{ padding: '1px 8px' }} onClick={() => setForm({ ...form, design: g.name, code: g.code })}>ใช้</Button></div> : null; })()}
          </>}
          <div className="cap" style={{ color: 'var(--ink-4)' }}>* มีผลกับการนำเข้าครั้งถัดไป — ตั้งแล้วนำเข้าไฟล์ใหม่/รี-ซิงก์เพื่อใช้</div>
        </SideSheet>
      )}

      {detail && (
        <SideSheet size="md" icon={detail.icon} title={detail.title} sub={detail.item.key} onClose={() => setDetail(null)} footer={<Button variant="outline" onClick={() => setDetail(null)}>ปิด</Button>}>
          <div className="metric-grid">
            <MetricCard label="จำนวนแถว" value={N(detail.item.count)} tone={detail.tone} />
            <MetricCard label="จำนวนตัว" value={N(detail.item.qty)} />
          </div>
          <Card className="p-3" style={{ boxShadow: 'none' }}>
            <CardTitle className="m-0 text-base font-semibold mb-2" style={{ fontSize: 14 }}>ตัวอย่างที่เจอ</CardTitle>
            <div style={{ wordBreak: 'break-word' }}>{detail.item.sample || detail.item.key}</div>
          </Card>
          <div>
            <CardTitle className="m-0 text-base font-semibold mb-2" style={{ fontSize: 14 }}>ช่องทางที่พบ</CardTitle>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {(detail.item.channels || []).length ? detail.item.channels.map(c => <Badge key={c} variant="secondary">{c}</Badge>) : <span className="cap" style={{ color: 'var(--ink-4)' }}>ไม่ระบุช่องทาง</span>}
            </div>
          </div>
          <div className="cap" style={{ color: 'var(--ink-4)' }}>ถ้าเป็นคำสะกดต่างหรือสีใหม่ ให้ตั้ง alias แล้วนำเข้าไฟล์ใหม่อีกครั้งเพื่อให้รายงานจับคู่ถูกต้อง</div>
        </SideSheet>
      )}

      <SalesAliasManager />

      <Sec title="ลายที่ยังไม่มีรหัส (ลายใหม่/สะกดต่าง)" icon="sparkle" tone="var(--warn)" items={A.newDesigns} empty="ทุกลายมีรหัส catalog ครบ" searchable action={Object.assign((k) => openAlias('design', k), { label: 'ผูก catalog' })} onDetail={setDetail} />
      <Sec title="สีที่ระบบยังไม่รู้จัก (กันสลับ)" icon="shield" tone="var(--bad)" items={A.newColors} empty="ไม่มีสีแปลกใหม่" searchable action={Object.assign((k) => openAlias('color', k), { label: 'เพิ่มเป็นสี' })} onDetail={setDetail} />
      <Sec title="จับคู่ลายไม่ได้เลย" icon="search" tone="var(--ink-3)" items={A.unmatched} empty="จับคู่ได้ทุกแถว" searchable onDetail={setDetail} />

      <Card className="p-4" style={{ overflow: 'hidden' }}>
        <CardHead icon="listChecks" title="Alias ที่ตั้งไว้" sub="คำที่สะกดต่าง / สีใหม่ ที่แมปเข้ารหัสแล้ว — มีผลรอบนำเข้าถัดไป"
          right={<div className="row" style={{ gap: 8 }}>
            <Badge variant="secondary">{N(aliases.length)} รายการ</Badge>
            <Button variant="outline" size="sm" onClick={() => openAlias('design', '')}><Icon name="plus" /> เพิ่มเอง</Button>
          </div>} />
        {aliases.length > 12 && (
          <div style={{ marginBottom: 10 }}>
            <SearchInput value={aliasQ} onChange={e => setAliasQ(e.target.value)} placeholder="ค้นหา alias…" className="h-8" />
          </div>
        )}
        {(() => {
          const shownAliases = aliasQ.trim()
            ? aliases.filter(a => `${a.term} ${a.design || ''} ${a.code || ''}`.toLowerCase().includes(aliasQ.trim().toLowerCase()))
            : aliases;
          if (aliases.length === 0) return <div className="row" style={{ gap: 8, padding: '6px 2px', color: 'var(--ink-4)', fontSize: 13 }}><Icon name="sparkle" /> ยังไม่มี alias — ผูกลาย/เพิ่มสีจากส่วนด้านบนได้</div>;
          if (shownAliases.length === 0) return <div style={{ padding: '6px 2px', color: 'var(--ink-4)', fontSize: 13 }}>ไม่พบ alias ที่ตรงกับ “{aliasQ}”</div>;
          return <div className="table-wrap" style={{ borderRadius: 10, border: '1px solid var(--line)', maxHeight: 360, overflow: 'auto' }}><Table style={{ width: '100%' }}><TableBody>{shownAliases.map(a => (
            <TableRow key={a.id} style={{ borderTop: '1px solid var(--line)' }}>
              <TableCell style={{ padding: '8px 14px' }}><Badge variant={a.kind === 'color' ? 'outline' : 'secondary'} style={{ marginRight: 8 }}>{a.kind === 'color' ? 'สี' : 'ลาย'}</Badge><b>{a.term}</b>{a.kind === 'design' && <span className="cap" style={{ color: 'var(--ink-3)' }}> → {a.design || '—'} {a.code ? `(${a.code})` : ''}</span>}</TableCell>
              <TableCell style={{ padding: '6px 12px', textAlign: 'right' }}><Button variant="outline" size="sm" style={{ color: 'var(--bad)' }} onClick={() => delAlias(a)}><Icon name="trash" /></Button></TableCell>
            </TableRow>
          ))}</TableBody></Table></div>;
        })()}
      </Card>
    </div>
  );
}

// ศูนย์ข้อมูล — หน้าเดียว: นำเข้า (บนสุด) → สุขภาพ → รวมชื่อเซลล์ → anomaly → alias
function DataHub() {
  return <HealthHub />;
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
// รายการเลขหน้าแบบมี … (ย่อเมื่อหน้าเยอะ): 1 … 4 5 6 … 32
function _pageList(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out = [1];
  const lo = Math.max(2, cur - 1), hi = Math.min(total - 1, cur + 1);
  if (lo > 2) out.push('…');
  for (let p = lo; p <= hi; p++) out.push(p);
  if (hi < total - 1) out.push('…');
  out.push(total);
  return out;
}

function OrdersSkeleton() {
  return (
    <div className="content-inner rise">
      <Card className="p-[22px] mb-4">
        <div className="row between" style={{ marginBottom: 12 }}><Skel w={190} h={15} /><Skel w={170} h={11} /></div>
        <Skel w="100%" h={36} r={9} style={{ marginBottom: 12 }} />
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{Array.from({ length: 11 }).map((_, i) => <Skel key={i} w={i % 3 === 0 ? 72 : 52} h={26} r={8} />)}</div>
      </Card>
      <Card className="p-[22px]"><SkelTable cols={8} rows={10} /></Card>
    </div>
  );
}

// ---------- date range picker (preset sidebar + ปฏิทิน range 2 เดือน) — เหมือนหน้ารายงานขาย ----------
const _TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const _isoToDate = (s) => { if (!s) return undefined; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const _dateToIso = (dt) => dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}` : null;
const _fmtTh = (s) => { if (!s) return '?'; const [y, m, d] = s.split('-').map(Number); return `${d} ${_TH_MON[m - 1]} ${y}`; };
const _fmtRange = (from, to) => {
  if (!from || !to) return '';
  const [fy, fm, fd] = from.split('-').map(Number), [ty, tm, td] = to.split('-').map(Number);
  if (fy === ty && fm === tm) return `${fd}–${td} ${_TH_MON[fm - 1]} ${fy}`;
  if (fy === ty) return `${fd} ${_TH_MON[fm - 1]} – ${td} ${_TH_MON[tm - 1]} ${ty}`;
  return `${_fmtTh(from)} – ${_fmtTh(to)}`;
};
function OrderDatePicker({ from, to, min, max, onChange, presets = [], activePreset, onPickPreset }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState({ from: _isoToDate(from), to: _isoToDate(to) });
  const disabled = []; if (_isoToDate(min)) disabled.push({ before: _isoToDate(min) }); if (_isoToDate(max)) disabled.push({ after: _isoToDate(max) });
  const presetLabel = (presets.find(([id]) => id === activePreset) || [])[1];
  const main = presetLabel || 'กำหนดเอง';
  const sub = activePreset === 'all' ? '' : _fmtRange(from, to);
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setSel({ from: _isoToDate(from), to: _isoToDate(to) }); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-8 gap-1.5 rounded-full px-3 text-[13px] font-normal">
          <Icon name="calendarDays" /><span className="font-semibold text-[var(--ink)]">{main}</span>
          {sub && <span className="text-[var(--ink-4)]">· {sub}</span>}
          <Icon name="down" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex max-sm:flex-col">
          <div className="flex shrink-0 flex-col gap-0.5 border-b p-2 sm:min-w-[128px] sm:border-b-0 sm:border-r">
            <span className="px-2 pb-1 text-[11px] font-semibold text-[var(--ink-4)]">ช่วงเวลา</span>
            {presets.map(([id, lb]) => (
              <button key={id} onClick={() => { onPickPreset(id); setOpen(false); }}
                className={'rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ' + (id === activePreset ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent-2)]' : 'text-[var(--ink-2)] hover:bg-[var(--surface-2)]')}>{lb}</button>
            ))}
          </div>
          <Calendar mode="range" numberOfMonths={2} locale={th} defaultMonth={_isoToDate(from) || _isoToDate(max)} selected={sel}
            disabled={disabled.length ? disabled : undefined}
            onSelect={(r) => { setSel(r || { from: undefined, to: undefined }); if (r?.from && r?.to) { onChange(_dateToIso(r.from), _dateToIso(r.to)); setOpen(false); } }} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------- multiselect dropdown (checkbox) — แบบเดียวกับหน้ารายงานขาย ----------
function MultiSelect({ label, options, value, onChange }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  const n = value.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={'rounded-full font-medium' + (n ? ' border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-2)]' : '')}>
          {label}
          {n > 0 && <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[11px]">{n}</Badge>}
          <Icon name="down" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-auto">
        <DropdownMenuLabel className="flex items-center justify-between py-1">
          <span>{label}</span>
          {n > 0 && <button className="text-[12px] font-medium text-[var(--bad)] hover:underline" onClick={(e) => { e.preventDefault(); onChange([]); }}>ล้าง</button>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.length === 0 && <div className="px-2 py-2 text-[13px] text-[var(--ink-4)]">ไม่มีข้อมูล</div>}
        {options.map(o => (
          <DropdownMenuCheckboxItem key={o} checked={value.includes(o)} onSelect={(e) => { e.preventDefault(); toggle(o); }}>
            <span className="min-w-0 flex-1 truncate">{o || '(ไม่ระบุ)'}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// คอลัมน์ตารางออเดอร์ (สำหรับ ColumnToggle) — ออเดอร์/ยอดขาย ล็อกไว้เสมอ
const ORDERS_COLS = [
  { key: 'order_no', label: 'ออเดอร์', locked: true },
  { key: 'date', label: 'วันที่' },
  { key: 'channel', label: 'ช่องทาง' },
  { key: 'customer', label: 'ลูกค้า' },
  { key: 'designs', label: 'ลายเสื้อ' },
  { key: 'job', label: 'งาน' },
  { key: 'status', label: 'สถานะ' },
  { key: 'note', label: 'หมายเหตุ' },
  { key: 'qty', label: 'ตัว' },
  { key: 'sales', label: 'ยอดขาย', locked: true },
];
// accessor สำหรับ useTableSort (ตัวเลข vs ข้อความ — null ไปท้าย)
const ORDERS_SORT = {
  order_no: (o) => o.order_no || '',
  date: (o) => o.order_date || o.order_month || '',
  channel: (o) => o.channel || '',
  customer: (o) => o.customer_name || o.customer_code || '',
  qty: (o) => Number(o.qty) || 0,
  sales: (o) => Number(o.sales) || 0,
};

function MpOrdersView() {
  const [orders, setOrders] = useState(null);
  const [rawSkus, setRawSkus] = useState([]);          // SKU ดิบจาก DB (frozen) — resolve ตอนแสดงผล
  const [resolverMaps, setResolverMaps] = useState(null);  // catalog/alias/override สด (null = ยังไม่โหลด)
  const [orderOv, setOrderOv] = useState({});          // override ระดับออเดอร์ (job_type/ลูกค้า/เซลล์) keyed by source:order_no
  const [err, setErr] = useState('');
  const [bounds, setBounds] = useState({ min: null, max: null });
  const [range, setRange] = useState({ from: null, to: null }); // null = ยังไม่ตั้ง (รอขอบวันที่)
  const [channelF, setChannelF] = useState([]);
  const [jobF, setJobF] = useState([]);
  const [sellerF, setSellerF] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const PER_PAGE = 50;
  const [page, setPage] = useState(1);
  const [density, setDensity] = usePersistedState('tmk-orders-density', 'cozy');
  const [hiddenCols, setHiddenCols] = usePersistedState('tmk-orders-hiddenCols', []);
  const colVisible = useMemo(() => new Set(ORDERS_COLS.map(c => c.key).filter(k => !hiddenCols.includes(k))), [hiddenCols]);
  const toggleCol = (k) => setHiddenCols(hc => hc.includes(k) ? hc.filter(x => x !== k) : [...hc, k]);

  // ขอบวันที่ของข้อมูล + ตั้งช่วงเริ่มต้น = เดือนล่าสุด (โหลดเฉพาะช่วง → เร็ว)
  useEffect(() => { (async () => {
    const b = await getDateBounds('tmk_mp_orders');
    setBounds({ min: b.min, max: b.max });
    if (b.max) { const r = presetRange('month', b.max, b.min, b.max); setRange({ from: r.from, to: r.to }); }
  })(); }, []);

  // โหลดออเดอร์ตามช่วงวันที่ที่เลือก (server-side, มีแคช) — เปลี่ยนช่วงค่อยโหลดเฉพาะส่วน
  useEffect(() => {
    if (!range.from || !range.to) return; // รอขอบวันที่
    let cancel = false;
    (async () => {
      setOrders(null); setErr('');
      const o = await cachedFetchRange('tmk_mp_orders', ORDERS_SEL, range.from, range.to);
      if (cancel) return;
      if (o.error) { setErr(o.error.message || ''); setOrders([]); return; }
      const s = await cachedFetchRange('tmk_mp_skus', SKUS_SEL, range.from, range.to);
      if (cancel) return;
      setRawSkus(s.error ? [] : s.data || []);
      setOrders((o.data || []).filter(x => x.status !== 'cancelled').sort((a, b) => (b.order_date || '').localeCompare(a.order_date || '')));
    })();
    return () => { cancel = true; };
  }, [range.from, range.to]);

  // โหลด map สด (catalog/alias/override + override ระดับออเดอร์) → live-resolve + apply override (กับดัก reimport)
  const reloadOverrides = async () => {
    const m = await loadResolverMaps(supabase); setResolverMaps(m);
    try { const r = await supabase.from('tmk_order_overrides').select('*'); const map = {}; if (!r.error) (r.data || []).forEach(x => { map[x.order_id] = x; }); setOrderOv(map); } catch { setOrderOv({}); }
  };
  useEffect(() => { let cancel = false; (async () => { const m = await loadResolverMaps(supabase); if (cancel) return; setResolverMaps(m); try { const r = await supabase.from('tmk_order_overrides').select('*'); if (cancel) return; const map = {}; if (!r.error) (r.data || []).forEach(x => { map[x.order_id] = x; }); setOrderOv(map); } catch { /* ตารางยังไม่มี */ } })(); return () => { cancel = true; }; }, []);
  const orderOvKey = (o) => `${o.source || ''}:${o.order_no}`;

  // resolver จาก map สด — เปลี่ยน catalog/alias/override แล้ว recompute (ไม่ต้อง reimport)
  const resolver = useMemo(() => makeSkuResolver(resolverMaps || {}), [resolverMaps]);
  // ออเดอร์ที่ merge override ระดับออเดอร์ทับค่า frozen (job_type/ลูกค้า/เซลล์ ที่แก้ในเว็บ) ตอนแสดงผล
  const ordersM = useMemo(() => {
    if (!orders) return orders;
    if (!orderOv || !Object.keys(orderOv).length) return orders;
    return orders.map(o => {
      const ov = orderOv[orderOvKey(o)]; if (!ov) return o;
      return { ...o,
        job_type: ov.job_type || o.job_type,
        customer_name: ov.customer_name || o.customer_name,
        customer_type: ov.customer_type || o.customer_type,
        salesperson: ov.salesperson || o.salesperson,
        note: ov.note != null && ov.note !== '' ? ov.note : o.note,
        _ov: ov };
    });
  }, [orders, orderOv]);
  // SKU แยกตามออเดอร์ — แทนชื่อลาย/รหัสด้วยค่าที่ resolve สด (คง raw_sku_or_name ไว้)
  const skusByOrder = useMemo(() => {
    const byO = {};
    rawSkus.forEach(x => {
      const r = resolver(x);
      const s2 = { ...x, design: r.design || x.design, product_code: r.product_code || x.product_code, _resolveSrc: r.source };
      (byO[s2.order_no] = byO[s2.order_no] || []).push(s2);
    });
    return byO;
  }, [rawSkus, resolver]);
  // active preset (ให้ปฏิทินไฮไลต์) + ตัวจัดการเลือก preset/ช่วงเอง
  const activePreset = useMemo(() => { if (!bounds.max) return ''; for (const [id] of PRESETS) { const r = presetRange(id, bounds.max, bounds.min, bounds.max); if (range.from === r.from && range.to === r.to) return id; } return ''; }, [range.from, range.to, bounds.min, bounds.max]);
  const pickPreset = (id) => { const r = presetRange(id, bounds.max, bounds.min, bounds.max); setRange({ from: r.from, to: r.to }); };
  const channels = useMemo(() => [...new Set((ordersM || []).map(o => o.channel).filter(Boolean))], [ordersM]);
  const sellers = useMemo(() => [...new Set((ordersM || []).map(o => o.salesperson).filter(Boolean))].sort(), [ordersM]);
  // ตัวกรองแบบ multi-select (ว่าง = แสดงทั้งหมด) — แพทเทิร์นเดียวกับหน้ารายงานขาย
  const nFilters = jobF.length + channelF.length + sellerF.length;
  const activeChips = [
    ...jobF.map(v => ({ dim: 'งาน', v, clear: () => setJobF(jobF.filter(x => x !== v)) })),
    ...channelF.map(v => ({ dim: 'ช่องทาง', v, clear: () => setChannelF(channelF.filter(x => x !== v)) })),
    ...sellerF.map(v => ({ dim: 'เซลล์', v, clear: () => setSellerF(sellerF.filter(x => x !== v)) })),
  ];
  const clearFilters = () => { setJobF([]); setChannelF([]); setSellerF([]); };
  const ql = q.trim().toLowerCase();
  const filtered = (ordersM || []).filter(o =>
    (channelF.length === 0 || channelF.includes(o.channel)) &&
    (jobF.length === 0 || jobF.includes(o.job_type || 'ปลีก')) &&
    (sellerF.length === 0 || sellerF.includes(o.salesperson || '')) &&
    (!ql || `${o.order_no} ${o.marketplace_id || ''} ${o.customer_name || ''} ${o.customer_code || ''} ${o.customer_social || ''} ${o.province || ''} ${o.salesperson || ''}`.toLowerCase().includes(ql) || (skusByOrder[o.order_no] || []).some(s => `${s.design || ''} ${s.color || ''} ${s.raw_sku_or_name || ''}`.toLowerCase().includes(ql)))
  );
  const tot = filtered.reduce((a, x) => a + (Number(x.sales) || 0), 0);
  const totQty = filtered.reduce((a, x) => a + (Number(x.qty) || 0), 0);
  const byCh = {}; filtered.forEach(o => { byCh[o.channel] = (byCh[o.channel] || 0) + (Number(o.sales) || 0); });
  const _donutData = Object.entries(byCh).map(([k, v]) => ({ label: k, value: v, color: channelColor(k) })).sort((a, b) => b.value - a.value);

  // เรียงตามคอลัมน์ (เริ่มต้น = วันที่ล่าสุดก่อน เหมือนเดิม)
  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(filtered, { key: 'date', dir: 'desc', accessors: ORDERS_SORT });

  // แบ่งหน้า — รีเซ็ตกลับหน้า 1 เมื่อเปลี่ยนช่วงวันที่/ตัวกรอง/คำค้น/การเรียง
  useEffect(() => { setPage(1); }, [range.from, range.to, jobF, channelF, sellerF, q, sortKey, sortDir]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const pageClamped = Math.min(page, totalPages);
  const pageRows = sorted.slice((pageClamped - 1) * PER_PAGE, pageClamped * PER_PAGE);

  const showSkel = useDelayedFlag(orders === null, 120); // โผล่หลัง 120ms · อยู่อย่างน้อย 300ms · cache ไว → เด้งทันที
  if (showSkel) return <OrdersSkeleton />;
  if (orders === null) return null;
  // ไม่มีข้อมูลเลยทั้งระบบ (ไม่มีเดือนใดเลย) → แนะนำนำเข้า · ถ้าแค่เดือนนี้ว่าง ยังให้เลือกเดือนอื่นได้
  if (err || (orders.length === 0 && !bounds.max)) return (
    <div className="content-inner rise"><Card className="p-[22px]"><div className="cap" style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }}>
      {/relation .* does not exist|tmk_mp_/i.test(err) ? 'ยังไม่ได้สร้างตาราง — รัน migration ก่อน' : 'ยังไม่มีออเดอร์จากไฟล์ — ไปที่ "ข้อมูล → นำเข้าไฟล์มาร์เก็ตเพลส" เพื่อนำเข้า'}
    </div></Card></div>
  );

  const buildDesigns = (sk) => { const dmap = {}; sk.forEach(s => { const d = s.design || '(จับคู่ไม่ได้)'; if (!dmap[d]) dmap[d] = { design: d, codes: new Set(), qty: 0, sales: 0 }; const g = dmap[d]; if (s.product_code) g.codes.add(s.product_code); g.qty += Number(s.qty) || 0; g.sales += Number(s.line_sales) || 0; }); return Object.values(dmap).sort((a, b) => b.qty - a.qty); };
  const jobChip = (j) => ({ 'ปลีก': '', 'DFT': 'chip-accent', 'OEM': 'chip-warn' }[j] || '');
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
      <Card className="p-[22px] mb-4">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 p-0 pb-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-[18px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="listChecks" /></span>
            <div className="min-w-0">
              <h3 className="m-0 text-base font-bold leading-tight" style={{ color: 'var(--ink)' }}>ออเดอร์จากไฟล์นำเข้า</h3>
              <p className="m-0 mt-0.5 text-xs" style={{ color: 'var(--ink-4)' }}>รายละเอียดออเดอร์ทุกช่องทางจากไฟล์นำเข้า</p>
            </div>
          </div>
          <div className="flex items-stretch overflow-hidden rounded-xl border" style={{ borderColor: 'var(--line)', background: 'var(--surface-2, transparent)' }}>
            {[['ออเดอร์', N(filtered.length)], ['ยอดขาย', B(tot)], ['ตัว', N(totQty)]].map(([label, val], i) => (
              <div key={label} className="px-4 py-1.5 text-center" style={i > 0 ? { borderLeft: '1px solid var(--line)' } : undefined}>
                <div className="text-[15px] font-bold leading-tight tabular-nums" style={{ color: 'var(--ink)' }}>{val}</div>
                <div className="mt-0.5 text-[11px]" style={{ color: 'var(--ink-4)' }}>{label}</div>
              </div>
            ))}
          </div>
        </CardHeader>
        <SearchInput value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา ออเดอร์ / ชื่อลูกค้า / รหัสลูกค้า / เบอร์/โซเชียล / จังหวัด / ลาย" wrapperClassName="mb-3" />
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <OrderDatePicker from={range.from} to={range.to} min={bounds.min} max={bounds.max}
              onChange={(a, b) => setRange({ from: a, to: b })} presets={PRESETS} activePreset={activePreset} onPickPreset={pickPreset} />
            <span className="h-5 w-px bg-[var(--line)]" />
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 rounded-full">
                <Icon name="filter" /> ตัวกรอง{nFilters > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{nFilters}</Badge>}
                <Icon name={filtersOpen ? 'up' : 'down'} />
              </Button>
            </CollapsibleTrigger>
            {activeChips.length > 0
              ? activeChips.map(({ dim, v, clear }) => <Badge key={dim + v} variant="outline" onClick={clear} title="คลิกเพื่อเอาออก" style={{ cursor: 'pointer', padding: '2px 8px' }}><span style={{ color: 'var(--ink-4)' }}>{dim}:</span> {v || '(ไม่ระบุ)'} <Icon name="x" /></Badge>)
              : <span className="cap" style={{ color: 'var(--ink-4)' }}>ยังไม่ได้กรอง — แสดงทุกออเดอร์</span>}
            {nFilters > 0 && <Button variant="ghost" size="sm" className="text-[var(--bad)] ml-auto" onClick={clearFilters}><Icon name="x" /> ล้าง</Button>}
          </div>
          <CollapsibleContent>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingTop: 12, marginTop: 10, borderTop: '1px solid var(--line)' }}>
              <span className="cap" style={{ color: 'var(--ink-4)', fontWeight: 600, width: 64, flexShrink: 0 }}>ตัวกรอง</span>
              <MultiSelect label="งาน" options={['ปลีก', 'DFT', 'OEM']} value={jobF} onChange={setJobF} />
              <MultiSelect label="ช่องทาง" options={channels} value={channelF} onChange={setChannelF} />
              {sellers.length > 0 && <MultiSelect label="เซลล์" options={sellers} value={sellerF} onChange={setSellerF} />}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Card className="p-[22px]">
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 font-normal mr-auto" disabled={!sorted.length}
            onClick={() => downloadCsv(`ออเดอร์_${sorted.length}รายการ`, sorted, [
              { label: 'ออเดอร์', key: 'order_no' },
              { label: 'วันที่', map: (o) => o.order_date || o.order_month || '' },
              { label: 'ช่องทาง', key: 'channel' },
              { label: 'ลูกค้า', map: (o) => o.customer_name || o.customer_code || '' },
              { label: 'จังหวัด', key: 'province' },
              { label: 'ลายเสื้อ', map: (o) => buildDesigns(skusByOrder[o.order_no] || []).map(d => d.design).join(' | ') },
              { label: 'งาน', map: (o) => o.job_type || 'ปลีก' },
              { label: 'สถานะ', map: (o) => statusLabel(o.status) },
              { label: 'หมายเหตุ', key: 'note' },
              { label: 'เซลล์', key: 'salesperson' },
              { label: 'ตัว', key: 'qty' },
              { label: 'ยอดขาย', key: 'sales' },
            ])} title="ส่งออกออเดอร์ตามตัวกรองปัจจุบัน">
            <Icon name="external" /> CSV
          </Button>
          <ColumnToggle columns={ORDERS_COLS} visible={colVisible} onToggle={toggleCol} />
          <DensityToggle value={density} onChange={setDensity} />
        </div>
        <div className={'table-wrap table-sticky-first ' + density}><Table>
          <TableHeader><TableRow>
            <SortHead field="order_no" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>ออเดอร์</SortHead>
            {colVisible.has('date') && <SortHead field="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>วันที่</SortHead>}
            {colVisible.has('channel') && <SortHead field="channel" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>ช่องทาง</SortHead>}
            {colVisible.has('customer') && <SortHead field="customer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>ลูกค้า</SortHead>}
            {colVisible.has('designs') && <TableHead>ลายเสื้อ</TableHead>}
            {colVisible.has('job') && <TableHead>งาน</TableHead>}
            {colVisible.has('status') && <TableHead>สถานะ</TableHead>}
            {colVisible.has('note') && <TableHead>หมายเหตุ</TableHead>}
            {colVisible.has('qty') && <SortHead field="qty" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">ตัว</SortHead>}
            <SortHead field="sales" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">ยอดขาย</SortHead>
          </TableRow></TableHeader>
          <TableBody>{pageRows.map(o => { const designs = buildDesigns(skusByOrder[o.order_no] || []);
            return (
              <TableRow key={o.order_no} className={`mp-order-row ${openId === o.order_no ? 'is-open' : ''}`} onClick={() => setOpenId(o.order_no)} style={{ cursor: 'pointer' }}>
                <TableCell><span style={{ fontWeight: 600 }}>{o.order_no}</span></TableCell>
                {colVisible.has('date') && <TableCell className="cap" style={{ whiteSpace: 'nowrap' }}>{o.order_date || o.order_month}</TableCell>}
                {colVisible.has('channel') && <TableCell><span className="order-channel-chip"><span className="order-channel-dot" style={{ background: channelColor(o.channel) }} />{o.channel}</span></TableCell>}
                {colVisible.has('customer') && <TableCell>{o.customer_name || o.customer_code || '—'}{o.province && <div className="cap">{o.province}</div>}{!o.customer_name && !o.customer_code && <Badge variant="warning" className="rounded-full text-[10px] font-medium">ไม่มีลูกค้า</Badge>}</TableCell>}
                {colVisible.has('designs') && <TableCell>{designs.length === 0 ? <span className="cap" style={{ color: 'var(--ink-4)' }}>—</span> : <span style={{ fontWeight: 600 }}>{designs.slice(0, 2).map(d => d.design).join(', ')}{designs.length > 2 ? ` +${designs.length - 2}` : ''}</span>}</TableCell>}
                {colVisible.has('job') && <TableCell>{(o.job_type && o.job_type !== 'ปลีก') ? <span className={'chip ' + jobChip(o.job_type)}>{o.job_type}</span> : <span className="cap">ปลีก</span>}</TableCell>}
                {colVisible.has('status') && <TableCell>{o.status && o.status !== 'completed' ? <span className={'chip ' + statusChip(o.status)}>{statusLabel(o.status)}</span> : <span className="cap" style={{ color: 'var(--ink-4)' }}>—</span>}</TableCell>}
                {colVisible.has('note') && <TableCell>{o.note ? <span className="block max-w-[160px] truncate text-[13px]" title={o.note}>{o.note}</span> : <span className="cap" style={{ color: 'var(--ink-4)' }}>—</span>}</TableCell>}
                {colVisible.has('qty') && <TableCell className="num" style={{ textAlign: 'right' }}>{N(o.qty)}</TableCell>}
                <TableCell className="num" style={{ textAlign: 'right', fontWeight: 700 }}><span className="row" style={{ gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>{B(o.sales)}<Icon name="arrowR" /></span></TableCell>
              </TableRow>
          ); })}</TableBody>
        </Table></div>
        {filtered.length > PER_PAGE && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="cap" style={{ color: 'var(--ink-4)' }}>แสดง {N((pageClamped - 1) * PER_PAGE + 1)}–{N(Math.min(pageClamped * PER_PAGE, filtered.length))} จาก {N(filtered.length)} ออเดอร์</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="gap-1" disabled={pageClamped <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}><Icon name="left" /> ก่อนหน้า</Button>
              {_pageList(pageClamped, totalPages).map((p, i) => p === '…'
                ? <span key={'e' + i} className="px-1.5 text-[var(--ink-4)]">…</span>
                : <Button key={p} variant={p === pageClamped ? 'default' : 'outline'} size="sm" className="min-w-9 px-0" onClick={() => setPage(p)}>{p}</Button>)}
              <Button variant="outline" size="sm" className="gap-1" disabled={pageClamped >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>ถัดไป <Icon name="right" /></Button>
            </div>
          </div>
        )}
      </Card>

      {openId && (() => {
        const o = (ordersM || []).find(x => x.order_no === openId);
        if (!o) return null;
        return <OrderDrawer order={o} sk={skusByOrder[o.order_no] || []} buildDesigns={buildDesigns} onClose={() => setOpenId(null)} onSaved={reloadOverrides} />;
      })()}
    </div>
  );
}

function DrawerField({ label, children }) {
  return <div><span className="cap">{label}</span><b>{children}</b></div>;
}
function DrawerGroup({ icon, title, children }) {
  return (
    <div className="rounded-xl border p-3.5" style={{ borderColor: 'var(--line)', background: 'var(--surface-2, transparent)' }}>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-[14px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name={icon} /></span>
        <span className="text-[13px] font-bold" style={{ color: 'var(--ink)' }}>{title}</span>
      </div>
      <div className="kv-grid">{children}</div>
    </div>
  );
}
const JOB_TYPES_DRAWER = ['ปลีก', 'OEM', 'DFT'];
function OrderDrawer({ order: o, sk, buildDesigns, onClose, onSaved }) {
  const designs = buildDesigns(sk);
  const jt = o.job_type || 'ปลีก';
  const jtCls = { DFT: 'chip-accent', OEM: 'chip-warn' }[jt] || '';
  const hasOv = !!o._ov;                                   // ออเดอร์นี้เคยแก้มือไหม
  const [edit, setEdit] = useState(null);                  // null | { job_type, customer_name, salesperson }
  const [busy, setBusy] = useState(false);
  const [lineEdit, setLineEdit] = useState(null);          // index ของบรรทัดที่กำลังแก้ลาย
  const [linePick, setLinePick] = useState({ design: '', code: '' });
  const ovId = `${o.source || ''}:${o.order_no}`;
  const startEdit = () => setEdit({ job_type: jt, customer_name: o.customer_name || '', salesperson: o.salesperson || '' });
  const saveOrder = async () => {
    setBusy(true);
    const row = { order_id: ovId, job_type: edit.job_type, customer_name: edit.customer_name.trim(), salesperson: edit.salesperson.trim(), updated_at: new Date().toISOString() };
    const { error } = await supabase.from('tmk_order_overrides').upsert(row, { onConflict: 'order_id' });
    setBusy(false);
    if (error) { window.__toast && window.__toast(/relation|does not exist|schema cache/i.test(error.message) ? 'ต้องรัน migration tmk_order_overrides ก่อน' : 'บันทึกไม่สำเร็จ: ' + error.message, 'error'); return; }
    logAudit({ action: 'update', entityType: 'order', entityName: o.order_no, summary: `แก้ออเดอร์ ${o.order_no} (งาน=${edit.job_type})` });
    window.__toast && window.__toast('บันทึกการแก้ไขออเดอร์แล้ว — รอดข้าม reimport', 'success');
    setEdit(null); onSaved && onSaved();
  };
  const revertOrder = async () => {
    setBusy(true);
    const { error } = await supabase.from('tmk_order_overrides').delete().eq('order_id', ovId);
    setBusy(false);
    if (error) { window.__toast && window.__toast('คืนค่าไม่สำเร็จ', 'error'); return; }
    window.__toast && window.__toast('คืนค่าออเดอร์เป็นค่าจากไฟล์แล้ว', 'success');
    setEdit(null); onSaved && onSaved();
  };
  const saveLine = async (s) => {
    setBusy(true);
    const row = { key: skuOverrideKey(o.order_no, s.raw_sku_or_name), order_no: o.order_no, design: linePick.design.trim(), product_code: (linePick.code || '').trim(), updated_at: new Date().toISOString() };
    const { error } = await supabase.from('tmk_sku_overrides').upsert(row, { onConflict: 'key' });
    setBusy(false);
    if (error) { window.__toast && window.__toast(/relation|does not exist|schema cache/i.test(error.message) ? 'ต้องรัน migration tmk_sku_overrides ก่อน' : 'บันทึกไม่สำเร็จ: ' + error.message, 'error'); return; }
    logAudit({ action: 'update', entityType: 'data', entityName: o.order_no, summary: `แก้ลายบรรทัด "${s.raw_sku_or_name}" → ${linePick.design}` });
    window.__toast && window.__toast('แก้ลายบรรทัดนี้แล้ว — มีผลทันที ไม่ต้อง reimport', 'success');
    setLineEdit(null); onSaved && onSaved();
  };
  const stMap = { completed: 'สำเร็จ', delivered: 'ส่งแล้ว', cancelled: 'ยกเลิก', pending: 'รอดำเนินการ', processing: 'กำลังทำ', shipped: 'จัดส่งแล้ว' };
  const money = [{ label: 'ยอดขาย', val: B(o.sales) }];
  if (o.cost > 0) money.push({ label: 'ต้นทุน', val: B(o.cost) });
  if (o.mkt_commission > 0) money.push({ label: 'ค่าธรรมเนียม', val: '−' + B(o.mkt_commission) });
  if (o.profit > 0) money.push({ label: 'กำไรสุทธิ', val: B(o.profit), color: 'var(--good)' });
  if (o.cod_amount > 0) money.push({ label: 'ยอด COD', val: B(o.cod_amount) });
  return <SideSheet size="lg" icon="listChecks" title={`ออเดอร์ ${o.order_no}`}
    sub={<span className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><span className="order-channel-chip"><span className="order-channel-dot" style={{ background: channelColor(o.channel) }} />{o.channel}</span><span style={{ color: 'var(--ink-4)' }}>{o.order_date || o.order_month}</span><b style={{ color: 'var(--ink)' }}>{B(o.sales)}</b></span>}
    onClose={onClose} footer={<Button variant="outline" onClick={onClose}>ปิด</Button>}>
    <div className="quality-row items-center" style={{ marginBottom: 14 }}>
      {sk.length === 0 && <Badge variant="warning" className="rounded-full text-[10px] font-medium">ไม่มี SKU</Badge>}
      {designs.some(d => d.design === '(จับคู่ไม่ได้)') && <Badge variant="warning" className="rounded-full text-[10px] font-medium">มีลายจับคู่ไม่ได้</Badge>}
      {o.profit > 0 && <Badge variant="success" className="rounded-full text-[10px] font-medium">มีต้นทุน/กำไร</Badge>}
      {o.customer_code && <Badge variant="success" className="rounded-full text-[10px] font-medium">มีรหัสลูกค้า</Badge>}
      {hasOv && <Badge variant="outline" className="rounded-full text-[10px] font-medium" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}><Icon name="pencil" /> แก้มือ</Badge>}
      <span className="ml-auto">{!edit && <Button variant="outline" size="sm" className="gap-1" onClick={startEdit}><Icon name="pencil" /> แก้ไขออเดอร์</Button>}</span>
    </div>

    {edit && (
      <div className="mb-4 rounded-xl border p-3.5" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
        <div className="cap cap-head mb-2.5" style={{ fontWeight: 700, color: 'var(--accent)' }}><Icon name="pencil" /> แก้ไขออเดอร์ (บันทึกเป็น override — รอดข้าม reimport)</div>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div className="field"><label>ประเภทงาน</label>
            <Select value={edit.job_type} onValueChange={v => setEdit({ ...edit, job_type: v })}>
              <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>{JOB_TYPES_DRAWER.map(j => <SelectItem key={j} value={j}>{j}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="field"><label>ชื่อลูกค้า</label><Input value={edit.customer_name} onChange={e => setEdit({ ...edit, customer_name: e.target.value })} placeholder="ชื่อลูกค้า" /></div>
          <div className="field"><label>เซลล์</label><Input value={edit.salesperson} onChange={e => setEdit({ ...edit, salesperson: e.target.value })} placeholder="ชื่อเซลล์" /></div>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button onClick={saveOrder} disabled={busy}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
          <Button variant="ghost" onClick={() => setEdit(null)} disabled={busy}>ยกเลิก</Button>
          {hasOv && <Button variant="ghost" className="ml-auto" style={{ color: 'var(--bad)' }} onClick={revertOrder} disabled={busy}><Icon name="refresh" /> คืนค่าจากไฟล์</Button>}
        </div>
      </div>
    )}

    <div className="mb-4 flex items-stretch overflow-hidden rounded-xl border" style={{ borderColor: 'var(--line)' }}>
      {money.map((c, i) => (
        <div key={c.label} className="flex-1 px-3 py-2.5 text-center" style={i > 0 ? { borderLeft: '1px solid var(--line)' } : undefined}>
          <div className="text-[15px] font-bold leading-tight tabular-nums" style={{ color: c.color || 'var(--ink)' }}>{c.val}</div>
          <div className="mt-0.5 text-[11px]" style={{ color: 'var(--ink-4)' }}>{c.label}</div>
        </div>
      ))}
    </div>

    {o.note && (
      <div className="mb-4 flex gap-2.5 rounded-xl border p-3" style={{ borderColor: 'var(--line)', background: 'var(--warn-soft)' }}>
        <span className="mt-0.5 shrink-0 [&_svg]:size-[15px]" style={{ color: 'var(--warn)' }}><Icon name="lightbulb" /></span>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold" style={{ color: 'var(--warn)' }}>หมายเหตุ</div>
          <div className="text-sm" style={{ color: 'var(--ink)' }}>{o.note}</div>
        </div>
      </div>
    )}

    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
      <DrawerGroup icon="listChecks" title="ข้อมูลออเดอร์">
        <DrawerField label="เลขออเดอร์">{o.order_no}</DrawerField>
        {o.marketplace_id && o.marketplace_id !== '-' && <DrawerField label="ID มาร์เก็ตเพลส">{o.marketplace_id}</DrawerField>}
        <DrawerField label="วันที่">{o.order_date || o.order_month}</DrawerField>
        <div><span className="cap">ช่องทาง</span><b><span className="row" style={{ gap: 6, alignItems: 'center' }}><span style={{ width: 8, height: 8, borderRadius: 3, background: channelColor(o.channel), flex: 'none' }} />{o.channel}</span></b></div>
        <div><span className="cap">ประเภทงาน</span><b>{jt === 'ปลีก' ? 'ปลีก' : <span className={'chip ' + jtCls}>{jt}</span>}</b></div>
        {o.status && o.status !== 'completed' && o.status !== 'active' && <div><span className="cap">สถานะ</span><b><span className="chip">{stMap[o.status] || o.status}</span></b></div>}
        <DrawerField label="การชำระ">{o.payment_type || '—'}</DrawerField>
      </DrawerGroup>
      <DrawerGroup icon="user" title="ลูกค้า">
        <DrawerField label="ลูกค้า">{o.customer_name || '—'}</DrawerField>
        {o.customer_code && <DrawerField label="รหัสลูกค้า">{o.customer_code}</DrawerField>}
        {o.customer_social && <DrawerField label="โซเชียล">{o.customer_social}</DrawerField>}
        <DrawerField label="สถานะลูกค้า">{o.customer_type || '—'}</DrawerField>
        {o.cust_total_orders > 0 && <DrawerField label="ออเดอร์สะสม">{N(o.cust_total_orders)} ครั้ง</DrawerField>}
        {o.province && <DrawerField label="จังหวัด">{o.province}</DrawerField>}
        <DrawerField label="เซลล์">{o.salesperson || '—'}</DrawerField>
      </DrawerGroup>
    </div>
    {designs.length > 0 && <>
      <div className="cap cap-head" style={{ margin: '16px 0 6px', fontWeight: 600, color: 'var(--accent)' }}><Icon name="bag" /> ลายเสื้อในออเดอร์นี้ ({N(designs.length)} ลาย)</div>
      <div style={{ display: 'grid', gap: 6, marginBottom: 4 }}>{designs.map((d, i) => (
        <div key={i} className="row between" style={{ gap: 8, padding: '7px 11px', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', border: '1px solid var(--line)', flexWrap: 'wrap' }}>
          <span style={{ minWidth: 0 }}><b style={{ color: d.design === '(จับคู่ไม่ได้)' ? 'var(--bad)' : 'var(--ink)' }}>{d.design}</b>{d.codes.size > 0 && <Badge variant="outline" style={{ marginLeft: 8 }}>รหัส {[...d.codes].join(', ')}</Badge>}</span>
          <span className="num cap"><b style={{ color: 'var(--ink)' }}>{N(d.qty)}</b> ตัว · {B(d.sales)}</span>
        </div>
      ))}</div>
    </>}
    {sk.length > 0 && <>
      <div className="cap" style={{ margin: '16px 0 6px', fontWeight: 600, color: 'var(--ink-3)' }}>รายการสินค้า ({N(sk.length)} รายการ · {N(sk.reduce((a, x) => a + (Number(x.qty) || 0), 0))} ตัว)</div>
      <div className="table-wrap"><Table>
        <TableHeader><TableRow><TableHead>ลาย</TableHead><TableHead>รหัส</TableHead><TableHead>สี</TableHead><TableHead>ไซซ์</TableHead><TableHead style={{ textAlign: 'right' }}>จำนวน</TableHead><TableHead style={{ textAlign: 'right' }}>ยอด</TableHead><TableHead>จับคู่</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>{sk.map((s, i) => [
          <TableRow key={i}>
            <TableCell style={{ fontWeight: 600 }}>{s.design || <span style={{ color: 'var(--bad)' }}>จับคู่ไม่ได้</span>}{s._resolveSrc === 'override' && <Badge variant="outline" className="ml-1.5 text-[10px]" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>แก้มือ</Badge>}{s.raw_sku_or_name && s.raw_sku_or_name !== s.design && <div className="cap" style={{ color: 'var(--ink-4)' }}>{s.raw_sku_or_name}</div>}</TableCell>
            <TableCell className="cap">{s.product_code || '—'}</TableCell>
            <TableCell className="cap">{s.color || '—'}</TableCell>
            <TableCell className="cap">{s.size || '—'}</TableCell>
            <TableCell className="num" style={{ textAlign: 'right' }}>{N(s.qty)}</TableCell>
            <TableCell className="num" style={{ textAlign: 'right' }}>{B(s.line_sales)}</TableCell>
            <TableCell><span className="cap" style={{ color: s.match_how ? 'var(--ink-3)' : 'var(--bad)' }}>{s.match_how || '—'}</span></TableCell>
            <TableCell style={{ textAlign: 'right' }}>{lineEdit !== i && <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={() => { setLineEdit(i); setLinePick({ design: s.design || '', code: s.product_code || '' }); }} title="แก้ลายบรรทัดนี้"><Icon name="pencil" /></Button>}</TableCell>
          </TableRow>,
          lineEdit === i && <TableRow key={i + '-edit'}>
            <TableCell colSpan={8} style={{ background: 'var(--surface-2)' }}>
              <div className="cap cap-head mb-2" style={{ fontWeight: 700, color: 'var(--accent)' }}><Icon name="pencil" /> แก้ลายของ "{s.raw_sku_or_name || s.design}" (override รายบรรทัด)</div>
              <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 240 }}><DesignCombobox value={linePick.design} code={linePick.code} onPick={({ name, code }) => setLinePick({ design: name, code: code || linePick.code })} /></div>
                <Input value={linePick.code} onChange={e => setLinePick({ ...linePick, code: e.target.value })} placeholder="รหัส (เช่น JRP111)" style={{ maxWidth: 160 }} />
                <Button size="sm" onClick={() => saveLine(s)} disabled={busy || !linePick.design.trim()}><Icon name="check" /> บันทึก</Button>
                <Button size="sm" variant="ghost" onClick={() => setLineEdit(null)} disabled={busy}>ยกเลิก</Button>
              </div>
            </TableCell>
          </TableRow>,
        ])}</TableBody>
      </Table></div>
    </>}
  </SideSheet>;
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
      if (window.__toast) window.__toast('ย้ายแคมเปญไปถังขยะแล้ว', 'success', 6000, {
        label: 'เลิกทำ',
        onClick: async () => {
          try {
            await supabase.from('tmk_campaigns').update({ deleted_at: null }).eq('id', c.id);
            if (reload) await reload();
            window.__toast?.('กู้คืนแคมเปญแล้ว', 'success');
          } catch (e) { window.__toast?.('กู้คืนไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
        },
      });
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

          // ความคืบหน้างาน — นับงานที่เสร็จ / ทั้งหมด ของแคมเปญนี้
          const linked = (DD.tasks || []).filter(t => t.camp === c.id);
          const total = linked.length;
          const done = linked.filter(t => t.status === 'done').length;
          const pct = total ? Math.round((done / total) * 100) : 0;

          // สถานะเวลา — นับถอยหลังจากวันเริ่ม/วันจบ เทียบวันนี้
          const today = todayISO();
          const diffDays = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
          let time;
          if (c.endISO && today > c.endISO) {
            time = { label: 'จบแล้ว', tone: 'done' };
          } else if (c.startISO && today < c.startISO) {
            const d = diffDays(today, c.startISO);
            time = { label: d <= 1 ? 'เริ่มพรุ่งนี้' : `เริ่มในอีก ${d} วัน`, tone: 'upcoming' };
          } else if (c.endISO) {
            const d = diffDays(today, c.endISO);
            time = d === 0 ? { label: 'วันสุดท้าย', tone: 'urgent' } : { label: `เหลืออีก ${d} วัน`, tone: d <= 3 ? 'urgent' : 'live' };
          } else {
            time = { label: 'กำลังดำเนินการ', tone: 'live' };
          }
          const timeCls = time.tone === 'upcoming' ? 'bg-primary/10 text-primary'
            : time.tone === 'urgent' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            : time.tone === 'live' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'bg-muted text-muted-foreground';

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
              <CardContent className="p-4 flex-1 flex flex-col gap-3">
                {/* หัวการ์ด: handle + ชื่อเต็ม + ป้ายสถานะ */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex gap-2 min-w-0 flex-1">
                    <div className="hidden sm:flex shrink-0 text-muted-foreground/40 mt-0.5" title="ลากเพื่อเรียงลำดับ">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="9" cy="6" r="1.5" fill="currentColor" /><circle cx="9" cy="12" r="1.5" fill="currentColor" /><circle cx="9" cy="18" r="1.5" fill="currentColor" />
                        <circle cx="15" cy="6" r="1.5" fill="currentColor" /><circle cx="15" cy="12" r="1.5" fill="currentColor" /><circle cx="15" cy="18" r="1.5" fill="currentColor" />
                      </svg>
                    </div>
                    {/* สำหรับมือถือ */}
                    <div className="flex sm:hidden flex-col gap-1 shrink-0 mt-0.5" onClick={e => e.stopPropagation()}>
                      <button className="text-muted-foreground disabled:opacity-30 p-0.5 text-[10px] leading-none" disabled={idx === 0 || busy} onClick={() => reorderCampaign(c.id, campaigns[idx - 1].id)}>▲</button>
                      <button className="text-muted-foreground disabled:opacity-30 p-0.5 text-[10px] leading-none" disabled={idx === campaigns.length - 1 || busy} onClick={() => reorderCampaign(c.id, campaigns[idx + 1].id)}>▼</button>
                    </div>
                    <h3 className="font-bold text-[15px] leading-snug line-clamp-2 hover:underline cursor-pointer min-w-0 flex-1" title={c.name} onClick={() => window.__openModal('campaign', { ...c, channels: c.channels || [] })}>
                      {c.name}
                    </h3>
                  </div>
                  <Badge variant="outline" className={`shrink-0 ${statusMeta.cls === 'chip-good' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : statusMeta.cls === 'chip-accent' ? 'bg-primary/10 text-primary border-primary/20' : statusMeta.cls === 'chip-warn' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : ''}`}>
                    {statusMeta.l}
                  </Badge>
                </div>

                {/* ช่วงเวลา + นับถอยหลัง */}
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-muted-foreground tabular-nums">{c.start} – {c.end}</span>
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium ${timeCls}`}>
                    <Icon name="clock" className="size-3" />{time.label}
                  </span>
                </div>

                {/* ความคืบหน้างาน */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground"><Icon name="listChecks" className="size-3.5" />ความคืบหน้างาน</span>
                    <span className="font-semibold tabular-nums">{total ? <>{done}/{total} <span className="text-muted-foreground font-normal">({pct}%)</span></> : <span className="text-muted-foreground font-normal">ยังไม่มีงาน</span>}</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>

                {/* ฐานการ์ด: ช่องทาง + ปุ่มแก้/ลบ */}
                <div className="mt-auto flex items-center justify-between gap-2 pt-3 border-t border-border/50">
                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    {(c.channels || []).length === 0
                      ? <span className="text-[11px] text-muted-foreground/60">ไม่มีช่องทาง</span>
                      : (c.channels || []).map(id => {
                          const ch = DD.channels.find(x => x.id === id);
                          return ch ? <span key={id} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><span className="size-2.5 rounded-full" style={{ background: ch.hex }} />{ch.name}</span> : null;
                        })}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); window.__openModal('campaign', { ...c, channels: c.channels || [] }); }} title="แก้ไขแคมเปญ">
                      <Icon name="pencil" className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); deleteCampaign(c); }} disabled={busy} title="ลบแคมเปญ">
                      <Icon name="trash" className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
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
    { id: 'targets', label: 'เป้า & คอม', icon: 'target' },
    { id: 'roles', label: 'สิทธิ์ผู้ใช้', icon: 'users' },
    { id: 'audit', label: 'ประวัติการใช้งาน', icon: 'clock' },
    { id: 'trash', label: 'ถังขยะ', icon: 'trash' },
    { id: 'updates', label: 'มีอะไรใหม่', icon: 'sparkle' },
  ].filter(t => (t.id === 'roles' ? _isAdmin : (t.id === 'trash' || t.id === 'targets') ? _canEdit : true)); // สิทธิ์ผู้ใช้=admin, ถังขยะ/เป้า=ผู้แก้ไขขึ้นไป
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
        <TabsContent value="targets" className="m-0 border-0 p-0 focus-visible:outline-none focus-visible:ring-0">
          {_canEdit && <TargetsView />}
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
        <TabsContent value="updates" className="m-0 border-0 p-0 focus-visible:outline-none focus-visible:ring-0">
          <WhatsNewPage />
        </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// ===== เป้าขาย + คอมมิชชั่นต่อเซลล์ (PART 12 / T3) =====
// graceful: ตาราง tmk_targets ยังไม่ migrate → Save แจ้งให้รัน migration (ไม่พัง)
function TargetsView() {
  const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const [month, setMonth] = useState(thisMonth);
  const [people, setPeople] = useState([]);     // ชื่อเซลล์ (display name หลัง alias)
  const [rows, setRows] = useState({});          // name -> { sales_target, commission_rate }
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [addName, setAddName] = useState('');

  const load = async () => {
    setLoading(true);
    let names = [];
    try {
      const { data } = await supabase.from('tmk_sales_aliases').select('display_name');
      names = [...new Set((data || []).map(r => r.display_name).filter(Boolean))];
    } catch { /* ตาราง alias ยังไม่มี → รายชื่อว่าง เพิ่มเองได้ */ }
    const targets = await fetchTargets(month);
    const map = {};
    targets.forEach(t => {
      map[t.salesperson] = { sales_target: t.sales_target ?? 0, commission_rate: t.commission_rate ?? 0 };
      if (!names.includes(t.salesperson)) names.push(t.salesperson); // เซลล์ที่เคยตั้งเป้าแต่ไม่อยู่ใน alias
    });
    names.sort((a, b) => a.localeCompare(b, 'th'));
    setPeople(names);
    setRows(map);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [month]);

  const setField = (name, field, val) => setRows(p => ({ ...p, [name]: { ...(p[name] || {}), [field]: val } }));

  const saveRow = async (name) => {
    setSavingKey(name);
    const r = rows[name] || {};
    const { error } = await saveTarget({ salesperson: name, month, sales_target: r.sales_target, commission_rate: r.commission_rate });
    setSavingKey(null);
    if (error) {
      const miss = /relation .* does not exist|tmk_targets|schema cache/i.test(error.message || '');
      window.__toast?.(miss ? 'ต้องรัน migration 20260701-targets.sql ใน Supabase ก่อน' : 'บันทึกไม่สำเร็จ: ' + error.message, 'error');
      return;
    }
    logAudit({ action: 'update', entityType: 'target', entityName: name, summary: `ตั้งเป้า/คอม ${name} เดือน ${month}` });
    window.__toast?.(`บันทึกเป้า ${name} แล้ว`, 'success');
  };

  const addPerson = () => {
    const n = addName.trim();
    if (!n) return;
    if (!people.includes(n)) setPeople(p => [...p, n].sort((a, b) => a.localeCompare(b, 'th')));
    setAddName('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Icon name="target" className="size-5" /> เป้าขาย & คอมมิชชั่นต่อเซลล์</CardTitle>
        <CardDescription>ตั้งเป้ายอดขาย (บาท) และอัตราคอม (%) รายคน รายเดือน → โชว์ความคืบหน้า + คอมคำนวณในหน้า “ยอดขาย → เซลล์”</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">เดือน</Label>
            <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-[160px]" />
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">เพิ่มเซลล์เอง (ถ้าไม่อยู่ในรายชื่อ)</Label>
              <Input value={addName} onChange={e => setAddName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addPerson(); }} placeholder="ชื่อเซลล์" className="w-[200px]" />
            </div>
            <Button variant="outline" size="sm" onClick={addPerson}><Icon name="plus" className="size-4" /> เพิ่ม</Button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">กำลังโหลด…</p>
        ) : people.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            ยังไม่มีรายชื่อเซลล์ — ตั้งชื่อย่อ→ชื่อจริงที่ “นำเข้า → จับคู่ชื่อเซลล์” ก่อน หรือเพิ่มเซลล์เองด้านบน
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>เซลล์</TableHead>
                <TableHead className="text-right">เป้ายอดขาย (บาท)</TableHead>
                <TableHead className="text-right">คอม (%)</TableHead>
                <TableHead className="text-right w-[110px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map(name => {
                const r = rows[name] || {};
                return (
                  <TableRow key={name}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell className="text-right">
                      <Input type="number" inputMode="numeric" value={r.sales_target ?? ''} onChange={e => setField(name, 'sales_target', e.target.value)} className="w-[140px] ml-auto text-right" placeholder="0" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input type="number" inputMode="decimal" step="0.1" value={r.commission_rate ?? ''} onChange={e => setField(name, 'commission_rate', e.target.value)} className="w-[90px] ml-auto text-right" placeholder="0" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="secondary" disabled={savingKey === name} onClick={() => saveRow(name)}>
                        {savingKey === name ? 'กำลังบันทึก…' : 'บันทึก'}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
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
      if (window.__toast) window.__toast('ย้ายช่องทางไปถังขยะแล้ว', 'success', 6000, {
        label: 'เลิกทำ',
        onClick: async () => {
          try {
            await supabase.from('tmk_channels').update({ deleted_at: null }).eq('id', c.id);
            if (reload) await reload();
            window.__toast?.('กู้คืนช่องทางแล้ว', 'success');
          } catch (e) { window.__toast?.('กู้คืนไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
        },
      });
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
      if (window.__toast) window.__toast('ย้ายหน้าที่ไปถังขยะแล้ว', 'success', 6000, {
        label: 'เลิกทำ',
        onClick: async () => {
          try {
            await supabase.from('tmk_duties').update({ deleted_at: null }).eq('id', duty.id);
            if (reload) await reload();
            window.__toast?.('กู้คืนหน้าที่แล้ว', 'success');
          } catch (e) { window.__toast?.('กู้คืนไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
        },
      });
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
      if (window.__toast) window.__toast('ย้ายผู้ใช้ไปถังขยะแล้ว', 'success', 6000, {
        label: 'เลิกทำ',
        onClick: async () => {
          if (!guardAdmin()) return;
          try {
            await supabase.from('tmk_user_roles').update({ deleted_at: null }).eq('email', email);
            await supabase.from('tmk_staff').update({ deleted_at: null }).eq('email', email);
            if (reload) await reload();
            window.__toast?.('กู้คืนผู้ใช้แล้ว', 'success');
          } catch (e) { window.__toast?.('กู้คืนไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
        },
      });
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
        TRASH_TABLES.map(t => {
          // ดึงเฉพาะคอลัมน์ที่ list ใช้จริง (key + ชื่อ + deleted_at) — ตัด jsonb หนัก (lots/items/status_log…) ออกจาก egress
          const sel = [...new Set([t.key, t.nameCol, 'deleted_at'])].join(',');
          return supabase.from(t.table).select(sel).not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
        })
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
