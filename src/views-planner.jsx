import React, { useState, useMemo } from 'react';
import { Icon, Avatar, Ring, Skel, useBeat } from './components.jsx';
import { CardTable } from './components/DataTableParts.jsx';
import { supabase } from './lib/supabaseClient.js';
import { versionedUpdate } from './lib/optimisticUpdate.js';
import { PRESETS, presetRange } from './lib/saleTime.js';
import { logAudit } from './lib/audit.js';
import { notify } from './lib/notify.js';
import { getToday, parseTaskDate, todayISO, thaiDate, THAI_MONTHS as MONTHS_TH_SHORT, THAI_MONTHS_FULL as MONTHS_TH } from './lib/dateUtils.js';
import { colorForTask, colorSourceOf } from './lib/taskColor.js';
import { TaskCard, ChIcon, matchedChannelsFor, tokenizeCh, PriorityTag } from './taskCard.jsx';
import { Card, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox as ShadcnCheckbox } from '@/components/ui/checkbox';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SearchInput } from '@/components/ui/search-input';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { DateRangePicker, DD, chipVar2, _isoToDate, _dateToIso } from './saleWidgets.jsx';


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
          {/* ไอคอน slot กว้างคงที่ — กันปุ่มขยับ/layout shift ตอนเลือก (dot) ↔ ไม่เลือก (icon) → dropdown เด้งสมูท */}
          <span className="inline-flex w-4 items-center justify-center shrink-0">
            {sel.length === 1 ? <span className="dot-c" style={{ background: selOpts[0]?.color }} /> : <Icon name={icon} />}
          </span>
          <span className="max-w-[140px] truncate">{trigText}</span>
          <Icon name="down" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="max-h-72 w-52 overflow-auto">
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

function PlannerFilters({ filterCamp, setFilterCamp, filterStatus, setFilterStatus, filterResp, setFilterResp, search, setSearch, respOptions, campScope,
  filterPriority, setFilterPriority, filterTags, setFilterTags, tagOptions, filterChannel, setFilterChannel,
  filterDateFrom, setFilterDateFrom, filterDateTo, setFilterDateTo, datePreset, setDatePreset }) {
  const [open, setOpen] = React.useState(false);
  const respColor = (name) => (DD.duties.find(d => d.name === name)?.color) || (DD.staff.find(s => s.name === name)?.color) || 'var(--ink-3)';
  const dateActive = !!(filterDateFrom || filterDateTo);
  // campScope = null (ไม่มีโครงการ = หน้ารวม) → ทุกแคมเปญ · array (ในโครงการ) → เฉพาะที่ติ๊ก/ใช้จริง (ไม่โชว์อันที่ไม่เกี่ยว)
  const campOpts = (DD.campaigns || []).filter(c => campScope == null || campScope.includes(c.id)).map(c => ({ id: c.id, name: c.name, color: c.color }));
  const respOpts = respOptions.map(r => ({ id: r, name: r, color: respColor(r) }));
  const prioOpts = [{ id: 'high', name: 'สูง', color: '#cf4d5c' }, { id: 'medium', name: 'กลาง', color: '#c08a3e' }, { id: 'low', name: 'ต่ำ', color: '#64748b' }];
  const tagOpts = (tagOptions || []).map(tg => ({ id: tg, name: tg, color: 'var(--ink-3)' }));
  const chanOpts = (DD.channels || []).map(c => ({ id: c.name, name: c.name, color: c.hex }));
  const stOpts = [{ id: 'active', name: 'กำลังทำ', color: 'var(--info)' }, { id: 'done', name: 'เสร็จแล้ว', color: 'var(--good)' }];
  // จำนวนตัวกรองที่เปิดอยู่ (ไม่นับวันที่/ค้นหา — โชว์แยก) + มีอะไรกรองไหม
  const nFilters = (filterStatus !== 'all' ? 1 : 0) + (filterCamp?.length || 0) + (filterResp?.length || 0) + (filterPriority?.length || 0) + (filterTags?.length || 0) + (filterChannel?.length || 0);
  const anyActive = nFilters > 0 || dateActive || search;
  const clearAll = () => {
    setFilterStatus('all'); setFilterCamp([]); setFilterResp([]); setSearch('');
    setFilterPriority?.([]); setFilterTags?.([]); setFilterChannel?.([]);
    setFilterDateFrom?.(''); setFilterDateTo?.(''); setDatePreset?.('all');
  };
  // ปุ่มช่วงวันที่ (แบบหน้ายอดขาย): preset → presetRange · เลือกเอง → กำหนดเอง
  const pickPreset = (id) => { const r = presetRange(id, todayISO()); setDatePreset?.(id); setFilterDateFrom?.(r.from || ''); setFilterDateTo?.(r.to || ''); };
  const pickRange = (f, t) => { setDatePreset?.(''); setFilterDateFrom?.(f || ''); setFilterDateTo?.(t || ''); };
  // ชิปตัวกรองที่เลือก (ถอดได้) — รวมสถานะ/แคมเปญ/หน้าที่/ความสำคัญ/แท็ก/ช่องทาง
  const chips = [];
  if (filterStatus !== 'all') chips.push({ k: 'st', label: (stOpts.find(o => o.id === filterStatus)?.name) || filterStatus, color: stOpts.find(o => o.id === filterStatus)?.color, remove: () => setFilterStatus('all') });
  (filterCamp || []).forEach(id => { const o = campOpts.find(x => x.id === id); chips.push({ k: 'c' + id, label: o?.name || id, color: o?.color, remove: () => setFilterCamp(filterCamp.filter(x => x !== id)) }); });
  (filterResp || []).forEach(id => { const o = respOpts.find(x => x.id === id); chips.push({ k: 'r' + id, label: id, color: o?.color, remove: () => setFilterResp(filterResp.filter(x => x !== id)) }); });
  (filterPriority || []).forEach(id => { const o = prioOpts.find(x => x.id === id); chips.push({ k: 'p' + id, label: o?.name || id, color: o?.color, remove: () => setFilterPriority(filterPriority.filter(x => x !== id)) }); });
  (filterTags || []).forEach(id => chips.push({ k: 't' + id, label: '#' + id, remove: () => setFilterTags(filterTags.filter(x => x !== id)) }));
  (filterChannel || []).forEach(id => { const o = chanOpts.find(x => x.id === id); chips.push({ k: 'ch' + id, label: id, color: o?.color, remove: () => setFilterChannel(filterChannel.filter(x => x !== id)) }); });
  return (
    <Card className="p-3" style={{ marginBottom: 12 }}>
      {/* แถวบน: ช่วงวันที่ · ตัวกรอง · ชิป · ล้าง · ค้นหา(ขวา) */}
      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker from={filterDateFrom} to={filterDateTo} onChange={pickRange} presets={PRESETS} activePreset={dateActive ? datePreset : 'all'} onPickPreset={pickPreset} />
        <span className="h-6 w-px bg-[var(--line)] mx-0.5 hidden sm:block" />
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(o => !o)} title="ตัวกรอง">
          <Icon name="filter" /> ตัวกรอง {nFilters > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{nFilters}</Badge>} <Icon name={open ? 'up' : 'down'} className="size-3.5 opacity-60" />
        </Button>
        {chips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            {chips.map(ch => (
              <Badge key={ch.k} variant="secondary" className="gap-1 pl-2 pr-1 font-normal">
                {ch.color && <span className="size-2 rounded-full shrink-0" style={{ background: ch.color }} />}
                <span className="truncate max-w-[120px]">{ch.label}</span>
                <button onClick={ch.remove} className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10" aria-label="เอาออก"><Icon name="x" className="size-3" /></button>
              </Badge>
            ))}
          </div>
        ) : <span className="text-xs text-muted-foreground hidden md:inline">ยังไม่ได้กรอง — แสดงทุกงาน</span>}
        {anyActive && <Button variant="ghost" size="sm" onClick={clearAll} title="ล้างตัวกรองทั้งหมด"><Icon name="x" /> ล้าง</Button>}
        <div className="flex-1" />
        <SearchInput placeholder="ค้นหา" value={search} onChange={e => setSearch(e.target.value)} wrapperClassName="w-full sm:w-[200px] shrink-0" />
      </div>
      {/* พาเนลตัวกรอง (กางออก) — สถานะ + แคมเปญ/หน้าที่/ความสำคัญ/แท็ก/ช่องทาง */}
      {open && (
        <div className="mt-3 pt-3 border-t border-[var(--line)] flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground w-16 shrink-0">สถานะ</span>
            <ToggleGroup type="single" value={filterStatus} onValueChange={(v) => v && setFilterStatus(v)} className="gap-0.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)] p-1">
              {[['all','ทั้งหมด'],['active','กำลังทำ'],['done','เสร็จแล้ว']].map(([s, l]) => (
                <ToggleGroupItem key={s} value={s} size="sm" className="rounded-full px-3.5 text-[var(--ink-3)] hover:text-[var(--ink)] data-[state=on]:bg-[var(--ink)] data-[state=on]:text-white">{l}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="flex items-start gap-3 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground w-16 shrink-0 pt-1.5">ตัวกรอง</span>
            <div className="row wrap flex-1 min-w-0" style={{ gap: 8, alignItems: 'center' }}>
              {campOpts.length > 0 && <FilterDropdown label="แคมเปญ" icon="megaphone" options={campOpts} value={filterCamp} onChange={setFilterCamp} />}
              {respOpts.length > 0 && <FilterDropdown label="หน้าที่" icon="shield" options={respOpts} value={filterResp} onChange={setFilterResp} />}
              <FilterDropdown label="ความสำคัญ" icon="target" options={prioOpts} value={filterPriority} onChange={setFilterPriority} />
              {tagOpts.length > 0 && <FilterDropdown label="แท็ก" icon="star" options={tagOpts} value={filterTags} onChange={setFilterTags} />}
              {chanOpts.length > 0 && <FilterDropdown label="ช่องทาง" icon="layers" options={chanOpts} value={filterChannel} onChange={setFilterChannel} />}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function filterTasks(tasks, opts) {
  const { filterCamp, filterStatus, search, filterResp, doneIds,
    filterPriority, filterTags, filterChannel, filterDateFrom, filterDateTo } = opts || {};
  const isDone = (s) => doneIds ? doneIds.has(s) : s === 'done';
  return (tasks || []).filter(t => {
    if (filterCamp?.length && !filterCamp.includes(t.camp)) return false;
    if (filterResp?.length && !(t.responsible || []).some(r => filterResp.includes(r))) return false;
    if (filterPriority?.length && !filterPriority.includes(t.priority || 'medium')) return false;
    if (filterTags?.length && !(t.tags || []).some(tg => filterTags.includes(tg))) return false;
    if (filterChannel?.length && !tokenizeCh(t.channel).some(tok => filterChannel.includes(tok))) return false;
    if (filterStatus === 'active' && isDone(t.status)) return false;
    if (filterStatus === 'done' && !isDone(t.status)) return false;
    // ช่วงวันที่ — overlap งาน [start..end] กับช่วงที่เลือก [from..to] (เทียบ ISO ตรงๆ ได้)
    if (filterDateFrom || filterDateTo) {
      const start = t.dateISO || '';
      const end = t.dateEnd || t.dateISO || '';
      if (!start) return false;
      if (filterDateFrom && end < filterDateFrom) return false;
      if (filterDateTo && start > filterDateTo) return false;
    }
    if (search) {
      const ql = String(search).toLowerCase();
      const title = String(t.title || '').toLowerCase();
      if (!title.includes(ql)) return false;
    }
    return true;
  });
}

// คอลัมน์สถานะของโครงการ — ถ้าโครงการตั้ง statuses เอง ใช้ของโครงการ ไม่งั้นใช้ดีฟอลต์ kanbanMeta (ธง done = คอลัมน์ 'done')
function flowColumns(flow) {
  if (flow && Array.isArray(flow.statuses) && flow.statuses.length) {
    return flow.statuses.map(s => ({ id: s.id, label: s.label, color: s.color || null, done: !!s.done }));
  }
  return (DD.kanbanMeta || []).map(k => ({ id: k.id, label: k.label, color: null, done: k.id === 'done' }));
}
const doneIdsOf = (flow) => new Set(flowColumns(flow).filter(c => c.done).map(c => c.id));

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

export function PlannerView({ sub, tasks, setTasks, flow, readOnly }) {
  const [filterCamp, setFilterCamp] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterResp, setFilterResp] = useState([]);
  const [search, setSearch] = useState('');
  // ตัวกรองเพิ่ม (PART 18) — ความสำคัญ / แท็ก / ช่องทาง / ช่วงวันที่
  const [filterPriority, setFilterPriority] = useState([]);
  const [filterTags, setFilterTags] = useState([]);
  const [filterChannel, setFilterChannel] = useState([]);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [datePreset, setDatePreset] = useState('all'); // preset ของปุ่มช่วงวันที่ (แบบหน้ายอดขาย)
  // โครงการ — จำกัดงานเฉพาะของโครงการนี้ (scopeId: ปกติ=id · "งานทั่วไป"='' → งานที่ flow ว่าง)
  const sid = flow ? (flow.scopeId ?? flow.id ?? '') : null;
  const scoped = flow ? (tasks || []).filter(t => (t.flow || '') === sid) : tasks;
  const doneIds = useMemo(() => doneIdsOf(flow), [flow]);
  // ตัวเลือก "หน้าที่" — ดึงจากผู้รับผิดชอบจริงในงาน (ครอบคลุมทั้งชื่อหน้าที่/คน)
  const respOptions = useMemo(() => [...new Set((scoped || []).flatMap(t => t.responsible || []))].filter(Boolean).sort(), [scoped]);
  // ตัวเลือกแท็ก — ดึงจากแท็กจริงในงานของโครงการนี้
  const tagOptions = useMemo(() => [...new Set((scoped || []).flatMap(t => t.tags || []))].filter(Boolean).sort(), [scoped]);
  // แคมเปญที่เลือกได้ — ถ้าโครงการติ๊ก campaignIds ใช้เฉพาะนั้น · ไม่งั้นดึงจากแคมเปญที่งานจริงใช้ (ไม่โชว์ทุกแคมเปญในระบบ)
  const campsInTasks = useMemo(() => [...new Set((scoped || []).map(t => t.camp))].filter(Boolean), [scoped]);
  const campScope = (flow && flow.campaignIds && flow.campaignIds.length) ? flow.campaignIds : (flow ? campsInTasks : null);
  const fProps = { filterCamp, setFilterCamp, filterStatus, setFilterStatus, filterResp, setFilterResp, search, setSearch, respOptions, campScope,
    filterPriority, setFilterPriority, filterTags, setFilterTags, tagOptions, filterChannel, setFilterChannel,
    filterDateFrom, setFilterDateFrom, filterDateTo, setFilterDateTo, datePreset, setDatePreset };
  const filtered = filterTasks(scoped, { filterCamp, filterStatus, search, filterResp, doneIds,
    filterPriority, filterTags, filterChannel, filterDateFrom, filterDateTo });
  const beat = useBeat(350); // จังหวะ skeleton สั้นๆ ตอนเข้าหน้า ให้เหมือนหน้า Sale
  if (beat) return <PlannerSkeleton />;

  if (sub === 'kanban') return <KanbanBoard tasks={scoped} setTasks={setTasks} filtered={filtered} fProps={fProps} flow={flow} readOnly={readOnly} />;
  if (sub === 'timeline') return <TimelineView filtered={filtered} fProps={fProps} flow={flow} readOnly={readOnly} />;
  if (sub === 'list') return <TaskListView filtered={filtered} fProps={fProps} flow={flow} readOnly={readOnly} />;
  return <CalendarView tasks={scoped} filtered={filtered} fProps={fProps} flow={flow} readOnly={readOnly} />;
}

/* ---- Calendar (month navigation + week view) — ชื่อเดือนใช้ร่วมจาก lib/dateUtils ---- */
const DAY_LABELS = ['อา','จ','อ','พ','พฤ','ศ','ส'];


function CalendarView({ filtered, fProps, flow, readOnly }) {
  const newTaskBase = flow ? { flow_id: (flow.scopeId ?? flow.id) } : {};
  const colorSrc = colorSourceOf(flow); // แหล่งสีแถบ/ชิป ตามตั้งค่าโครงการ — ไม่มี flow (ปฏิทินรวม) = campaign
  const T = getToday();                       // วันจริง
  const curY = T.yearBE, curM = T.month - 1;  // เดือนปัจจุบัน (0-indexed)
  const [ym, setYm] = useState({ y: curY, m: curM });
  const [sel, setSel] = useState(T.day);

  const greg = ym.y - 543;
  const daysInMonth = new Date(greg, ym.m + 1, 0).getDate();
  const firstWeekday = new Date(greg, ym.m, 1).getDay(); // Sun-first (0=Sun)
  const isCurrentMonth = ym.y === curY && ym.m === curM;
  const todayDay = isCurrentMonth ? T.day : -1;

  // จับคู่งานกับวันของ "เดือนที่เลือก" (ym) — แยกงานวันเดียว (ชิปในช่อง) กับงานช่วงวัน เริ่ม–สิ้นสุด (แถบพาดข้ามวัน)
  const pad2 = (n) => String(n).padStart(2, '0');
  const mkIso = (d) => `${greg}-${pad2(ym.m + 1)}-${pad2(d)}`;
  const monthFirst = mkIso(1), monthLast = mkIso(daysInMonth);
  const byDay = {};   // งานวันเดียว → ชิปในช่องวัน
  const ranged = [];  // งานมีช่วงวัน → แถบพาดข้ามวัน (ds/de = วันในเดือนนี้หลัง clip ขอบเดือน)
  const dayAll = {};  // ทุกงานที่คาบเกี่ยววันนั้น → แผงข้าง/ไอคอนช่องทาง/จุดมือถือ
  filtered.forEach(t => {
    const s = t.dateISO || parseTaskDate(t.date);
    if (!s) return;
    const e = (t.dateEnd && t.dateEnd > s) ? t.dateEnd : s;
    if (e < monthFirst || s > monthLast) return; // ไม่คาบเกี่ยวเดือนนี้
    const ds = s <= monthFirst ? 1 : Number(s.slice(8));
    const de = e >= monthLast ? daysInMonth : Number(e.slice(8));
    if (e > s) ranged.push({ t, s, e, ds, de });
    else (byDay[ds] = byDay[ds] || []).push(t);
    for (let d = ds; d <= de; d++) (dayAll[d] = dayAll[d] || []).push(t);
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
  while (cells.length % 7) cells.push(null); // เติมท้ายให้เต็มสัปดาห์ — กริดเป็นสี่เหลี่ยมเต็มผืน
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  // ตัดแถบช่วงวันเป็น segment ต่อสัปดาห์ + จัดเลนแบบ greedy (ซ้อนไม่ทับกัน) — เกิน 4 เลนตัดทิ้ง (ยังเห็นในแผงวัน)
  const weekSegs = weeks.map(week => {
    const segs = [];
    ranged.forEach(r => {
      const cols = week.map((d, i) => ({ d, i })).filter(x => x.d && x.d >= r.ds && x.d <= r.de);
      if (!cols.length) return;
      const c0 = cols[0].i, c1 = cols[cols.length - 1].i;
      segs.push({ ...r, c0, c1, contL: r.s < mkIso(cols[0].d), contR: r.e > mkIso(cols[cols.length - 1].d) });
    });
    segs.sort((a, b) => a.c0 - b.c0 || (b.c1 - b.c0) - (a.c1 - a.c0));
    const laneEnd = [];
    segs.forEach(sg => {
      let ln = laneEnd.findIndex(end => sg.c0 > end);
      if (ln === -1) { ln = laneEnd.length; laneEnd.push(sg.c1); } else laneEnd[ln] = sg.c1;
      sg.lane = ln;
    });
    return segs.filter(sg => sg.lane < 4);
  });

  const selTasks = dayAll[sel] || [];

  // ลากงานเปลี่ยนวัน (E3) — ลากการ์ดมาวางที่ช่องวัน → อัปเดต date
  const dragId = React.useRef(null);
  const [dropDay, setDropDay] = useState(null);
  const [dragActive, setDragActive] = useState(false); // ไฮไลต์ช่องวันเฉพาะตอนกำลังลากจริง (กัน border ค้าง)
  const dayRef = React.useRef(null); // เลื่อนมาที่ส่วน "งานวันที่เลือก" เมื่อกดวัน
  // กันไฮไลต์ค้าง: ปล่อยลากนอกกริด/บางเบราว์เซอร์ไม่ยิง dragend ที่การ์ด → รีเซ็ตที่ระดับ window เสมอ
  React.useEffect(() => {
    const reset = () => { dragId.current = null; setDragActive(false); setDropDay(null); };
    window.addEventListener('dragend', reset);
    window.addEventListener('drop', reset);
    return () => { window.removeEventListener('dragend', reset); window.removeEventListener('drop', reset); };
  }, []);
  const reschedule = async (id, day) => {
    const wasDay = dropDay; dragId.current = null; setDropDay(null);
    if (!id || readOnly) return;
    if (!window.__canEdit) { window.__toast?.('สิทธิ์ "ดูอย่างเดียว" — ย้ายงานไม่ได้', 'warn'); return; }
    const iso = mkIso(day);
    const task = filtered.find(t => t.id === id);
    const oldS = task ? (task.dateISO || parseTaskDate(task.date)) : '';
    if (task && oldS === iso) return;
    void wasDay;
    try {
      // งานช่วงวัน: ลากแล้วเลื่อนทั้งช่วง — วันสิ้นสุดขยับตามจำนวนวันที่เลื่อน
      const patch = { date: iso };
      if (task?.dateEnd && oldS && task.dateEnd > oldS) {
        const delta = Math.round((_isoToDate(iso) - _isoToDate(oldS)) / 86400000);
        const ne = _isoToDate(task.dateEnd); ne.setDate(ne.getDate() + delta);
        patch.date_end = _dateToIso(ne);
      }
      // Phase 3.1 (OCC §9): guard ด้วย rowVersion — ถ้าคนอื่นแก้ก่อน = conflict (ไม่ทับเงียบ)
      const r = await versionedUpdate(supabase, 'tmk_tasks', id, patch, task?.rowVersion);
      if (r.conflict) { window.__toast?.('งานนี้ถูกแก้โดยคนอื่นแล้ว — รีเฟรชให้ใหม่', 'warn'); window.__refresh?.(['tmk_tasks']); return; }
      if (!r.ok) throw r.error || new Error('เลื่อนวันไม่สำเร็จ');
      logAudit({ action: 'move', entityType: 'task', entityName: task?.title || id, summary: `เลื่อนวันงาน "${task?.title || ''}" → ${day} ${MONTHS_TH_SHORT[ym.m]}`, flowId: task?.flow ?? '' });
      window.__refresh?.(['tmk_tasks']);
    } catch (err) { window.__toast?.('เลื่อนวันไม่สำเร็จ: ' + (err?.message || ''), 'error'); }
  };

  // เรนเดอร์เป็น "ฟังก์ชัน" (ไม่ใช่ <Component/>) — JSX inline reconcile ตาม key แทนที่จะ unmount/remount ทุกครั้งที่ตั้ง dropDay (กัน flicker + drag event หลุดตอนลาก)
  const renderCell = (d, i, lanes) => {
    if (!d) return <div key={i} style={{ background: 'var(--surface-2)', opacity: .55 }}></div>;
    const ts = byDay[d] || [];       // งานวันเดียว → ชิป
    const all = dayAll[d] || [];     // รวมงานช่วงวันที่คาบเกี่ยว → ไอคอน/จุด
    const isSel = d === sel, isToday = d === todayDay, isDrop = dragActive && dropDay === d;
    const show = ts.slice(0, 3);
    const more = ts.length - 3;
    // ไอคอนแพลตฟอร์มของวันนี้ — แตกครบทุกช่องทางจากทุกงาน + dedup
    const seen = new Set(); const dayInfos = [];
    all.forEach(t => matchedChannelsFor(t.channel).forEach(({ info, label }) => {
      const key = info.logoUrl || info.bg || label;
      if (seen.has(key)) return; seen.add(key); dayInfos.push(info);
    }));
    return (
      <button key={i} onClick={() => setSel(d)}
        onDragOver={readOnly ? undefined : (e) => { e.preventDefault(); if (dropDay !== d) setDropDay(d); }}
        onDragLeave={readOnly ? undefined : () => setDropDay(dd => dd === d ? null : dd)}
        onDrop={readOnly ? undefined : () => { setDragActive(false); reschedule(dragId.current, d); }}
        style={{
        // กริดชิดกัน: ไม่มี border ต่อช่อง (เส้นตาราง = gap ของ week-row) · เลือก = แค่พื้น accent-soft ไม่มีกรอบ
        border: 'none', borderRadius: 0,
        background: isDrop || isSel ? 'var(--accent-soft)' : 'var(--surface)',
        outline: isDrop ? '2px dashed var(--accent)' : 'none', outlineOffset: -2,
        padding: '5px 6px', display: 'flex', flexDirection: 'column',
        gap: 2, textAlign: 'left', alignItems: 'stretch', height: '100%',
        transition: 'background 0.15s var(--ease)', overflow: 'hidden',
      }}>
        <div className="row between" style={{ gap: 4, marginBottom: 1, flexShrink: 0 }}>
          {isToday
            ? <span className="num sm" style={{ display: 'inline-grid', placeItems: 'center', minWidth: 20, height: 20, padding: '0 4px', borderRadius: 6, background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 'var(--fs-sm)' }}>{d}</span>
            : <span className="num sm" style={{ fontWeight: isSel ? 700 : 500, color: isSel ? 'var(--accent-2)' : 'var(--ink)', fontSize: 'var(--fs-sm)', lineHeight: '20px' }}>{d}</span>}
          {dayInfos.length > 0 && (
            <div className="cal-day-icons" style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
              {dayInfos.slice(0, 4).map((info, i) => <ChIcon key={i} info={info} size={16} />)}
              {dayInfos.length > 4 && <span style={{ fontSize: 8, color: 'var(--ink-3)', fontWeight: 700, display: 'grid', placeItems: 'center' }}>+{dayInfos.length - 4}</span>}
            </div>
          )}
        </div>
        {/* กันที่ให้แถบช่วงวันที่ลอยทับ (เลนของสัปดาห์นี้) — ชิปงานวันเดียวเริ่มใต้แถบ */}
        {lanes > 0 && <div className="cal-lane-spacer" style={{ '--lanes': lanes }} />}
        <div className="cal-cell-titles" style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden', flex: 1, minHeight: 0 }}>
          {show.map(t => {
            const c = DD.campaigns.find(x => x.id === t.camp);
            const col = colorForTask(t, colorSrc, '#888');
            return <span key={t.id} title={t.title + (c ? ` · ${c.name}` : '')} style={{ fontSize: 'var(--fs-micro)', fontWeight: 600, padding: '2px 5px', borderRadius: 0, background: `color-mix(in srgb, ${col} 16%, transparent)`, color: `color-mix(in srgb, ${col} 72%, var(--ink))`, whiteSpace: 'normal', overflowWrap: 'anywhere', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.25, flexShrink: 0 }}>{t.title}</span>;
          })}
        </div>
        {/* มือถือ: โชว์เป็นจุดสีแทน title (แตะดูรายละเอียดข้างล่าง) — รวมงานช่วงวันด้วย */}
        <div className="cal-cell-dots">
          {all.slice(0, 8).map(t => <span key={t.id} style={{ width: 6, height: 6, borderRadius: '50%', background: colorForTask(t, colorSrc), flexShrink: 0 }} />)}
        </div>
        {more > 0 && <span className="cal-more-desktop" style={{ fontSize: 'var(--fs-micro)', fontWeight: 'var(--fw-sem)', color: 'var(--accent-2)', textAlign: 'center', flexShrink: 0 }}>+{more} งาน</span>}
      </button>
    );
  };

  return (
    <div className="content-inner rise">
      <PlannerFilters {...fProps} />
      {/* การ์ดเดียว: ปฏิทิน (ซ้าย) + งานวันที่เลือก (ขวา) รวมในกล่องเดียว */}
      <Card className="p-0 overflow-hidden">
        <div className="grid cal-layout" style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px', alignItems: 'stretch' }}>
          {/* ฝั่งปฏิทิน */}
          <div className="p-[22px]">
            <CardHeader className="flex-row items-center justify-between space-y-0 p-0 pb-4 flex-wrap gap-[10px]">
              <div className="row" style={{ gap: 8 }}>
                <Button variant="ghost" size="icon" onClick={() => shiftMonth(-1)} title="เดือนก่อน"><span style={{ transform: 'rotate(180deg)', display: 'grid' }}><Icon name="chevR" /></span></Button>
                <h3 style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>{MONTHS_TH[ym.m]} {ym.y}</h3>
                <Button variant="ghost" size="icon" onClick={() => shiftMonth(1)} title="เดือนถัดไป"><Icon name="chevR" /></Button>
                <Button variant="outline" size="sm" onClick={goToday}>วันนี้</Button>
              </div>
            </CardHeader>

            <div className="cal-month-grid">
              <div className="cal-head-row">
                {DAY_LABELS.map(dl => <div key={dl} className="cap" style={{ textAlign: 'center', padding: '6px 0', fontWeight: 'var(--fw-sem)' }}>{dl}</div>)}
              </div>
              {weeks.map((week, w) => {
                const segs = weekSegs[w];
                const lanes = segs.length ? Math.max(...segs.map(s => s.lane)) + 1 : 0;
                return (
                  <div key={w} className="cal-week-row">
                    {week.map((d, i) => renderCell(d, w * 7 + i, lanes))}
                    {/* แถบงานช่วงวัน — พาดข้ามช่องต่อเนื่อง (ชนขอบ = ต่อจาก/ต่อไปสัปดาห์อื่น) คลิกเปิดงานได้ */}
                    {segs.length > 0 && (
                      <div className="cal-range-bars">
                        {segs.map((sg, k) => {
                          const col = colorForTask(sg.t, colorSrc);
                          const insetL = sg.contL ? 0 : 4, insetR = sg.contR ? 0 : 4;
                          return (
                            <button key={sg.t.id + ':' + k} title={`${sg.t.title} · ${thaiDate(sg.s)} → ${thaiDate(sg.e)}`}
                              onClick={() => window.__openModal('task', { ...sg.t, channel: Array.isArray(sg.t.channel) ? sg.t.channel : [sg.t.channel] })}
                              style={{
                                position: 'absolute', top: sg.lane * 20,
                                left: `calc(${(sg.c0 / 7 * 100).toFixed(4)}% + ${insetL}px)`,
                                width: `calc(${((sg.c1 - sg.c0 + 1) / 7 * 100).toFixed(4)}% - ${insetL + insetR}px)`,
                                height: 18, background: col, color: '#fff',
                                fontSize: 'var(--fs-micro)', fontWeight: 600, padding: '0 6px', textAlign: 'left',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                border: 'none', borderRadius: 0, cursor: 'pointer',
                                pointerEvents: dragActive ? 'none' : 'auto',
                              }}>{sg.t.title}</button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ฝั่งงานวันที่เลือก — เส้นแบ่งในการ์ดเดียวกัน */}
          <div ref={dayRef} className="cal-day-panel p-[22px]" style={{ borderLeft: '1px solid var(--line)', background: 'var(--surface-2, transparent)' }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>{sel} {MONTHS_TH_SHORT[ym.m]} {ym.y}</div>
            <div className="row between" style={{ marginBottom: 14 }}>
              <h3>{selTasks.length} งาน</h3>
              {!readOnly && <Button size="sm" onClick={() => window.__openModal('task', { ...newTaskBase, date: `${greg}-${String(ym.m + 1).padStart(2, '0')}-${String(sel).padStart(2, '0')}` })}><Icon name="plus" /> เพิ่ม</Button>}
            </div>
            {selTasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--ink-4)' }}>
                <span style={{ display: 'inline-block', width: 36, height: 36 }}><Icon name="calendarDays" /></span>
                <div className="cap" style={{ marginTop: 8 }}>ไม่มีงานในวันที่เลือก</div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {selTasks.map(t => (
                  <TaskCard key={t.id} task={t} showFlow={!flow} readOnly={readOnly}
                    draggable={!readOnly} onDragStart={() => { dragId.current = t.id; setDragActive(true); }} onDragEnd={() => { dragId.current = null; setDragActive(false); setDropDay(null); }}
                    onClick={() => window.__openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] })} />
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ---- Kanban with drag & drop ---- */
function KanbanBoard({ tasks, setTasks, filtered, fProps, flow, readOnly }) {
  const [over, setOver] = React.useState(null);
  const dragId = React.useRef(null);
  const columns = flowColumns(flow);
  const newTaskBase = flow ? { flow_id: (flow.scopeId ?? flow.id) } : {};
  // ย้ายสถานะงาน — ใช้ทั้ง drag (desktop) และ select (มือถือ ที่ลากไม่ได้)
  const moveTask = async (id, status) => {
    if (!id) return;
    if (!window.__canEdit) { window.__toast?.('สิทธิ์ "ดูอย่างเดียว" — ย้ายงานไม่ได้', 'warn'); return; }
    const prev = tasks.find(t => t.id === id)?.status;
    if (prev === status) return;
    const task = tasks.find(t => t.id === id);
    setTasks(ts => ts.map(t => t.id === id ? { ...t, status } : t));
    try {
      // Phase 3.1 (OCC §9): guard ด้วย rowVersion — คนอื่นย้ายก่อน = conflict → rollback optimistic + refresh
      const r = await versionedUpdate(supabase, 'tmk_tasks', id, { status }, task?.rowVersion);
      if (r.conflict) { setTasks(ts => ts.map(t => t.id === id ? { ...t, status: prev } : t)); window.__toast?.('งานนี้ถูกแก้โดยคนอื่นแล้ว — รีเฟรชให้ใหม่', 'warn'); window.__refresh?.(['tmk_tasks']); return; }
      if (!r.ok) throw r.error || new Error('ย้ายไม่สำเร็จ');
      const stCol = columns.find(k => k.id === status) || {};
      const stLabel = stCol.label || status;
      logAudit({ action: 'move', entityType: 'task', entityName: task?.title || id, summary: `ย้ายงาน "${task?.title || ''}" → ${stLabel}`, flowId: task?.flow ?? '' });
      notify({ recipients: task?.responsible || [], kind: 'status', severity: stCol.done ? 'success' : undefined, title: `งาน "${task?.title || ''}" → ${stLabel}`, flowId: task?.flow ?? '', taskId: id, entityType: 'task', action: 'move' });
      window.__refresh?.(['tmk_tasks']); // sync TMK.tasks (notif/profile/export) ไม่ต้องรอ realtime
    } catch (err) {
      setTasks(ts => ts.map(t => t.id === id ? { ...t, status: prev } : t));
      if (window.__toast) window.__toast('ย้ายไม่สำเร็จ: ' + err.message, 'error');
    }
  };
  // ลากจัดลำดับในคอลัมน์ + ย้ายข้ามคอลัมน์ (E3) — reindex sort_order · graceful ถ้าคอลัมน์ sort_order ยังไม่ migrate
  const reorder = async (id, targetId, status) => {
    setOver(null);
    if (!id || id === targetId) return;
    if (!window.__canEdit) { window.__toast?.('สิทธิ์ "ดูอย่างเดียว" — ย้ายงานไม่ได้', 'warn'); return; }
    const dragged = tasks.find(t => t.id === id); if (!dragged) return;
    const col = tasks.filter(t => t.status === status && t.id !== id).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    let at = targetId ? col.findIndex(t => t.id === targetId) : col.length;
    if (at < 0) at = col.length;
    col.splice(at, 0, dragged);
    const updates = col.map((t, i) => ({ id: t.id, sort_order: (i + 1) * 10 }));
    setTasks(ts => ts.map(t => { const u = updates.find(x => x.id === t.id); return (u || t.id === id) ? { ...t, sortOrder: u ? u.sort_order : t.sortOrder, status: t.id === id ? status : t.status } : t; }));
    const changed = updates.filter(u => { const o = tasks.find(t => t.id === u.id); return o && (o.sortOrder !== u.sort_order || (u.id === id && o.status !== status)); });
    try {
      for (const u of changed) {
        const patch = (u.id === id) ? { sort_order: u.sort_order, status } : { sort_order: u.sort_order };
        let { error } = await supabase.from('tmk_tasks').update(patch).eq('id', u.id);
        if (error && /sort_order/.test(error.message || '')) { ({ error } = u.id === id ? await supabase.from('tmk_tasks').update({ status }).eq('id', u.id) : { error: null }); } // graceful: ยังไม่ migrate sort_order → ย้ายสถานะอย่างเดียว
        if (error) throw error;
      }
      if (dragged.status !== status) { const stLabel = (columns.find(k => k.id === status) || {}).label || status; logAudit({ action: 'move', entityType: 'task', entityName: dragged.title, summary: `ย้ายงาน "${dragged.title}" → ${stLabel}`, flowId: dragged.flow ?? '' }); }
      window.__refresh?.(['tmk_tasks']);
    } catch (err) { window.__refresh?.(['tmk_tasks']); window.__toast?.('จัดลำดับไม่สำเร็จ: ' + (err?.message || ''), 'error'); }
  };
  const onDrop = (status) => { const id = dragId.current; dragId.current = null; reorder(id, null, status); };
  return (
    <div className="content-inner rise">
      <PlannerFilters {...fProps} />
      <div className="planner-kanban" style={{ gap: 14, alignItems: 'start' }}>
        {columns.map(col => {
          const list = filtered.filter(t => t.status === col.id).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
          const tone = col.color || { todo: 'var(--ink-3)', inprogress: 'var(--info)', review: 'var(--warn)', done: 'var(--good)' }[col.id] || 'var(--ink-3)';
          return (
            <div key={col.id}
              onDragOver={readOnly ? undefined : e => { e.preventDefault(); if (over !== col.id) setOver(col.id); }}
              onDragLeave={readOnly ? undefined : () => setOver(o => o === col.id ? null : o)}
              onDrop={readOnly ? undefined : () => onDrop(col.id)}
              style={{ background: over === col.id ? 'var(--accent-soft)' : 'var(--surface-2)', borderRadius: 'var(--r-lg)', padding: 12, minHeight: 200, transition: 'background 0.15s', border: over===col.id?'1.5px dashed var(--accent)':'1.5px dashed transparent' }}>
              <div className="row between" style={{ padding: '2px 4px 12px' }}>
                <span className="row" style={{ gap: 8, fontWeight: 700, fontSize: 'var(--fs-sm)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: tone }}></span>{col.label}</span>
                <Badge variant="secondary">{list.length}</Badge>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {list.map(t => (
                  <div key={t.id}
                    onDragOver={readOnly ? undefined : e => { e.preventDefault(); if (over !== col.id) setOver(col.id); }}
                    onDrop={readOnly ? undefined : e => { e.stopPropagation(); const id = dragId.current; dragId.current = null; reorder(id, t.id, col.id); }}>
                    <TaskCard task={t} draggable={!readOnly} readOnly={readOnly}
                      onClick={() => window.__openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] })}
                      onDragStart={() => { dragId.current = t.id; }}
                      onDragEnd={() => { dragId.current = null; setOver(null); }}
                      statusColumns={columns} onStatusChange={moveTask} />
                  </div>
                ))}
                {list.length === 0 && <div className="cap" style={{ textAlign: 'center', padding: '16px 0', opacity: 0.6 }}>{readOnly ? 'ไม่มีงาน' : 'ลากการ์ดมาที่นี่'}</div>}
                {!readOnly && <button onClick={() => window.__openModal('task', { ...newTaskBase, status: col.id })} style={{
                  width: '100%', padding: '10px', border: '1.5px dashed var(--line)', borderRadius: 'var(--r-sm)',
                  background: 'transparent', cursor: 'pointer', color: 'var(--ink-3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontSize: 'var(--fs-sm)', fontFamily: 'var(--font)', marginTop: 4,
                }}>
                  <Icon name="plus" /> เพิ่มงาน
                </button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Smart Planner Timeline (vertical) ---- */
function TimelineView({ filtered, fProps, flow, readOnly }) {
  const stMeta = { live: { l: 'กำลังดำเนินการ', cls: 'chip-good' }, upcoming: { l: 'กำลังจะมา', cls: 'chip-accent' }, paused: { l: 'หยุดชั่วคราว', cls: 'chip-warn' }, cancelled: { l: 'ยกเลิก', cls: '' }, done: { l: 'จบแล้ว', cls: '' } };
  const doneIds = doneIdsOf(flow);
  const newTaskBase = flow ? { flow_id: (flow.scopeId ?? flow.id) } : {};
  const campScope = fProps.campScope;

  // Campaign progress — นับเฉพาะงานในขอบเขตโครงการ (ถ้ามี)
  const campTasks = {};
  (flow ? (DD.tasks || []).filter(t => (t.flow || '') === (flow.scopeId ?? flow.id ?? '')) : (DD.tasks || [])).forEach(t => { campTasks[t.camp] = campTasks[t.camp] || []; campTasks[t.camp].push(t); });

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
        {DD.campaigns.filter(c => (!campScope || campScope.includes(c.id)) && (!fProps.filterCamp?.length || fProps.filterCamp.includes(c.id))).map(c => {
          const tasks = campTasks[c.id] || [];
          const done = tasks.filter(t => doneIds.has(t.status)).length;
          const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
          const st = stMeta[c.status] || stMeta.done; // กัน status แปลก → จอขาว
          const campSel = (fProps.filterCamp || []).includes(c.id);
          return (
            <Card key={c.id} className="p-3" style={{ display: 'flex', alignItems: 'center', gap: 14, borderLeft: `3px solid ${c.color}`, cursor: 'pointer' }} onClick={() => fProps.setFilterCamp(campSel ? (fProps.filterCamp || []).filter(x => x !== c.id) : [...(fProps.filterCamp || []), c.id])}>
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
          {!readOnly && <Button size="sm" onClick={() => window.__openModal('task', { ...newTaskBase })}><Icon name="plus" /> เพิ่มงาน</Button>}
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
                  {tasks.map(t => (
                    <TaskCard key={t.id} task={t} showFlow={!flow} readOnly={readOnly}
                      onClick={() => window.__openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] })} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/* ---- ความสำคัญงาน (priority) — ป้าย/สี ใช้ร่วมทุกวิว ---- */

/* ---- List view (วิวที่ 5 · จัดกลุ่มตามสถานะ + ตาราง · เลือกหลายงาน+จัดกลุ่ม E2) ---- */
function TaskListView({ filtered, fProps, flow, readOnly }) {
  const cols = flowColumns(flow);
  const newTaskBase = flow ? { flow_id: (flow.scopeId ?? flow.id) } : {};
  const [sel, setSel] = useState(() => new Set());
  const selArr = [...sel];
  const canEdit = !readOnly && !!window.__canEdit; // bulk เลือก/ลบ ต้องมีสิทธิ์แก้ไข (ไม่ใช่แค่ไม่ใช่โหมดแชร์)
  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleGroup = (list) => setSel(s => { const n = new Set(s); const ids = list.map(t => t.id); const allOn = ids.every(id => n.has(id)); ids.forEach(id => allOn ? n.delete(id) : n.add(id)); return n; });
  const clearSel = () => setSel(new Set());
  const members = ((flow?.members?.length ? flow.members : (DD.staff || []).map(s => s.name)) || []).filter(Boolean);
  const bulkStatus = async (status) => {
    const ids = selArr; if (!ids.length || !window.__canEdit) return;
    const stCol = cols.find(k => k.id === status) || {};
    try { await Promise.all(ids.map(id => supabase.from('tmk_tasks').update({ status }).eq('id', id))); ids.forEach(id => { const t = filtered.find(x => x.id === id); logAudit({ action: 'move', entityType: 'task', entityName: t?.title || id, summary: `ย้ายงาน "${t?.title || ''}" → ${stCol.label || status}`, flowId: t?.flow ?? '' }); notify({ recipients: t?.responsible || [], kind: 'status', severity: stCol.done ? 'success' : undefined, title: `งาน "${t?.title || ''}" → ${stCol.label || status}`, flowId: t?.flow ?? '', taskId: id, entityType: 'task', action: 'move' }); }); window.__refresh?.(['tmk_tasks']); window.__toast?.(`เปลี่ยนสถานะ ${ids.length} งาน`, 'success'); clearSel(); }
    catch (e) { window.__toast?.('ไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
  };
  const bulkAssign = async (name) => {
    const ids = selArr; if (!ids.length || !window.__canEdit) return;
    try {
      await Promise.all(ids.map(id => { const t = filtered.find(x => x.id === id); const cur = t?.responsible || []; if (cur.includes(name)) return Promise.resolve(); notify({ recipients: [name], kind: 'assign', title: `คุณได้รับมอบหมายงาน "${t?.title || ''}"`, flowId: t?.flow ?? '', taskId: id, entityType: 'task' }); return supabase.from('tmk_tasks').update({ responsible: [...cur, name].join(', ') }).eq('id', id); }));
      window.__refresh?.(['tmk_tasks']); window.__toast?.(`มอบหมาย "${name}" ให้ ${ids.length} งาน`, 'success'); clearSel();
    } catch { window.__toast?.('ไม่สำเร็จ', 'error'); }
  };
  const bulkDelete = async () => {
    const ids = selArr; if (!ids.length || !window.__canEdit) return;
    if (!await window.__confirm?.({ title: `ลบ ${ids.length} งาน`, body: 'ย้ายงานที่เลือกไปถังขยะ (กู้คืนได้)?', danger: true, confirmText: 'ลบ' })) return;
    try { await Promise.all(ids.map(id => supabase.from('tmk_tasks').update({ deleted_at: new Date().toISOString() }).eq('id', id))); window.__refresh?.(['tmk_tasks']); window.__toast?.(`ลบ ${ids.length} งานแล้ว`, 'success'); clearSel(); }
    catch { window.__toast?.('ลบไม่สำเร็จ', 'error'); }
  };
  return (
    <div className="content-inner rise">
      <PlannerFilters {...fProps} />
      <div className="flex flex-col gap-5">
        {cols.map(col => {
          const list = filtered.filter(t => t.status === col.id);
          const tone = col.color || { todo: 'var(--ink-3)', inprogress: 'var(--info)', review: 'var(--warn)', done: 'var(--good)' }[col.id] || 'var(--ink-3)';
          const allOn = list.length > 0 && list.every(t => sel.has(t.id));
          return (
            <div key={col.id} className="rounded-lg border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b">
                <span className="flex items-center gap-2 font-bold text-sm"><span className="size-2.5 rounded-full" style={{ background: tone }} />{col.label}</span>
                <Badge variant="secondary">{list.length}</Badge>
              </div>
              {list.length === 0 ? (
                <div className="px-4 py-3 text-xs text-muted-foreground">ไม่มีงานในสถานะนี้</div>
              ) : (
                <CardTable><Table>
                  <TableHeader>
                    <TableRow>
                      {canEdit && <TableHead className="w-9"><ShadcnCheckbox checked={allOn} onCheckedChange={() => toggleGroup(list)} aria-label="เลือกทั้งหมด" /></TableHead>}
                      <TableHead className="w-[40%]">งาน</TableHead>
                      <TableHead className="hidden md:table-cell">รายละเอียด</TableHead>
                      <TableHead className="w-24">วันที่</TableHead>
                      <TableHead className="w-20">สำคัญ</TableHead>
                      <TableHead className="w-28">ทีม</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map(t => {
                      const col = colorForTask(t, colorSourceOf(flow), '#888');
                      return (
                        <TableRow key={t.id} data-state={sel.has(t.id) ? 'selected' : undefined} className={readOnly ? '' : 'cursor-pointer'} onClick={readOnly ? undefined : () => window.__openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] })}>
                          {canEdit && <TableCell onClick={e => e.stopPropagation()}><ShadcnCheckbox checked={sel.has(t.id)} onCheckedChange={() => toggle(t.id)} aria-label="เลือกงาน" /></TableCell>}
                          <TableCell className="cell-title">
                            <div className="font-medium text-[13px] flex items-center gap-2" style={{ borderLeft: `3px solid ${col}`, paddingLeft: 8 }}>{t.title}</div>
                            {(t.tags || []).length > 0 && <div className="flex flex-wrap gap-1 mt-1 pl-2">{t.tags.slice(0, 4).map(tg => <span key={tg} className="text-[10px] px-1.5 rounded-full bg-muted text-muted-foreground">{tg}</span>)}</div>}
                          </TableCell>
                          <TableCell className="hidden md:table-cell"><span className="text-xs text-muted-foreground line-clamp-1 max-w-[260px]">{t.detail || '—'}</span></TableCell>
                          <TableCell className="text-xs tabular-nums whitespace-nowrap">{t.date}{t.dateEnd ? <span className="text-muted-foreground"> – {thaiDate(t.dateEnd)}</span> : ''}</TableCell>
                          <TableCell><PriorityTag value={t.priority} /></TableCell>
                          <TableCell><div className="flex items-center -space-x-1.5">{(t.responsible || []).slice(0, 3).map(r => { const s = DD.staff.find(x => x.name === r) || { color: '#888' }; return <Avatar key={r} name={r} color={s.color} size={20} />; })}</div></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table></CardTable>
              )}
              {!readOnly && <button onClick={() => window.__openModal('task', { ...newTaskBase, status: col.id })} className="w-full px-4 py-2 text-xs text-muted-foreground hover:bg-muted/30 flex items-center gap-1.5 border-t"><Icon name="plus" className="size-3.5" /> เพิ่มงานใน "{col.label}"</button>}
            </div>
          );
        })}
      </div>
      {/* แถบจัดการกลุ่ม — ลอยล่างจอเมื่อเลือก ≥1 งาน */}
      {sel.size > 0 && canEdit && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-40 flex items-center gap-1.5 rounded-xl border bg-popover shadow-lg px-3 py-2">
          <span className="text-sm font-semibold px-1">เลือก {sel.size}</span>
          <span className="w-px h-5 bg-border mx-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-8"><Icon name="circle" className="size-4 mr-1" /> สถานะ</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="center" side="top">{cols.map(k => <DropdownMenuItem key={k.id} onClick={() => bulkStatus(k.id)}><span className="size-2 rounded-full mr-2" style={{ background: k.color || '#94a3b8' }} />{k.label}</DropdownMenuItem>)}</DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-8"><Icon name="users" className="size-4 mr-1" /> มอบหมาย</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="center" side="top" className="max-h-64 overflow-auto">{members.length === 0 ? <DropdownMenuItem disabled>ไม่มีสมาชิก</DropdownMenuItem> : members.map(n => <DropdownMenuItem key={n} onClick={() => bulkAssign(n)}>{n}</DropdownMenuItem>)}</DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" className="h-8 text-destructive hover:bg-destructive/10" onClick={bulkDelete}><Icon name="trash" className="size-4 mr-1" /> ลบ</Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={clearSel} title="ยกเลิกเลือก"><Icon name="x" className="size-4" /></Button>
        </div>
      )}
    </div>
  );
}

/* ====================  CATALOG  ==================== */
// ดึงทุกแถว — PostgREST จำกัด ~1000 แถว/request → ต้องวนดึงเป็นหน้าๆ (กันรายงานเห็นไม่ครบ)

