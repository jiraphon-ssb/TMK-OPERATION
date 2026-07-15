/* ============================================================
   views-mytasks.jsx — "งานของฉัน" (My Tasks) แยกจาก views-flows god-file (PART 84 REFACTOR-1)
   ============================================================
   FlowsView (views-flows.jsx) เรียก <MyTasksView/> เมื่อ sub==="mytasks" · behavior-preserving
   ============================================================ */
import { useState, useMemo } from 'react';
import { TMK } from './data.js';
import { Icon } from './components.jsx';
import { useData } from './dataContext.jsx';
import { SearchInput } from '@/components/ui/search-input';
import { TaskCard } from './views-planner.jsx';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Checkbox as ShadcnCheckbox } from '@/components/ui/checkbox';

/* ============================================================
   งานของฉัน (My Tasks) — ครบวงจร: KPI + ค้นหา/กรอง/เรียง/จัดกลุ่ม
   - จับคู่ตัวตน: window.__userEmail → ชื่อ/บทบาทใน TMK.roles + TMK.staff (+ dutyName)
   - reuse <TaskCard showFlow> · realtime ผ่าน useData().version
   ============================================================ */
const MT_PRIO = [{ id: 'high', name: 'สูง', color: '#cf4d5c' }, { id: 'medium', name: 'กลาง', color: '#c08a3e' }, { id: 'low', name: 'ต่ำ', color: '#64748b' }];
const mtToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// ตัวกรอง multi-select เล็ก (reuse DropdownMenu + Checkbox) — ซ่อนเองถ้าไม่มีตัวเลือก (data-driven)
function MtFilter({ label, icon, options, value, onChange }) {
  if (!options || !options.length) return null;
  const toggle = (id) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  const active = value.length > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={active ? 'secondary' : 'outline'} size="sm" className="h-8 gap-1.5">
          <span className="inline-flex w-4 justify-center shrink-0"><Icon name={icon} className="size-3.5" /></span>
          {label}{active ? ` (${value.length})` : ''}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="max-h-72 overflow-auto">
        {options.map(o => (
          <DropdownMenuItem key={o.id} onSelect={e => { e.preventDefault(); toggle(o.id); }} className="gap-2">
            <ShadcnCheckbox checked={value.includes(o.id)} className="pointer-events-none" />
            {o.color ? <span className="size-2 rounded-full shrink-0" style={{ background: o.color }} /> : null}
            <span className="truncate">{o.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MyTasksView() {
  const { version } = useData() || {}; // realtime/refresh bump → recompute (กัน list ค้างตอนมีงานใหม่มอบหมายเข้ามา)
  const me = window.__userEmail || '';
  const low = (x) => String(x || '').toLowerCase();
  const myNames = useMemo(() => {
    const s = new Set();
    const role = (TMK.roles || []).find(r => low(r.email) === low(me));
    if (role?.name) s.add(role.name);
    if (role?.dutyName) s.add(role.dutyName);
    const staff = (TMK.staff || []).find(st => low(st.email) === low(me));
    if (staff?.name) s.add(staff.name);
    if (staff?.dutyName) s.add(staff.dutyName);
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, version]); // roles/staff โหลด async → ผูก version ด้วย ไม่งั้นจับคู่ตัวตนไม่ได้จนกว่าจะรีโหลด
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mine = useMemo(() => (TMK.tasks || []).filter(t => (t.responsible || []).some(r => myNames.has(r))), [myNames, version]);

  // helpers (match TaskCard: flow = scopeId??id)
  const flowOf = (t) => (TMK.flows || []).find(x => (x.scopeId ?? x.id ?? '') === (t.flow || ''));
  const isDone = (t) => { const fl = flowOf(t); const sts = (fl?.statuses && fl.statuses.length) ? fl.statuses : null; return sts ? sts.filter(s => s.done).some(s => s.id === t.status) : t.status === 'done'; };
  const statusMeta = (t) => { const fl = flowOf(t); const sts = (fl?.statuses && fl.statuses.length) ? fl.statuses : (TMK.kanbanMeta || []); const m = sts.find(s => s.id === t.status); return { id: t.status || 'todo', label: m?.label || t.status || '—', color: m?.color || '' }; };
  const dueISOf = (t) => t.dateEnd || t.dateISO || '';
  const dueDiff = (t) => { const iso = dueISOf(t); if (!iso) return null; return Math.round((new Date(iso + 'T00:00:00') - new Date(mtToday() + 'T00:00:00')) / 86400000); };
  const chanList = (t) => (Array.isArray(t.channel) ? t.channel : [t.channel]).map(c => String(c || '').trim()).filter(Boolean);

  // filter/sort/group state
  const [query, setQuery] = useState('');
  const [fFlow, setFFlow] = useState([]); const [fStatus, setFStatus] = useState([]); const [fPrio, setFPrio] = useState([]);
  const [fTag, setFTag] = useState([]); const [fChan, setFChan] = useState([]); const [fDue, setFDue] = useState('all');
  const [groupBy, setGroupBy] = useState('status'); const [sortBy, setSortBy] = useState('due');

  // option lists (data-driven จาก mine)
  const flowOpts = useMemo(() => { const m = new Map(); mine.forEach(t => { const fl = flowOf(t); const id = t.flow || '__general__'; if (!m.has(id)) m.set(id, { id, name: fl?.name || 'งานทั่วไป', color: fl?.color || 'var(--ink-3)' }); }); return [...m.values()]; }, [mine]);
  const statusOpts = useMemo(() => { const m = new Map(); mine.forEach(t => { const s = statusMeta(t); if (!m.has(s.id)) m.set(s.id, { id: s.id, name: s.label, color: s.color }); }); return [...m.values()]; }, [mine]);
  const tagOpts = useMemo(() => { const s = new Set(); mine.forEach(t => (t.tags || []).forEach(x => s.add(x))); return [...s].map(x => ({ id: x, name: x })); }, [mine]);
  const chanOpts = useMemo(() => { const s = new Set(); mine.forEach(t => chanList(t).forEach(x => s.add(x))); return [...s].map(x => ({ id: x, name: x })); }, [mine]);
  const prioOpts = useMemo(() => { const used = new Set(mine.map(t => t.priority || 'medium')); return MT_PRIO.filter(p => used.has(p.id)); }, [mine]);

  // apply filters
  const q = low(query);
  const shown = useMemo(() => mine.filter(t => {
    if (fFlow.length && !fFlow.includes(t.flow || '__general__')) return false;
    if (fStatus.length && !fStatus.includes(t.status)) return false;
    if (fPrio.length && !fPrio.includes(t.priority || 'medium')) return false;
    if (fTag.length && !(t.tags || []).some(x => fTag.includes(x))) return false;
    if (fChan.length && !chanList(t).some(x => fChan.includes(x))) return false;
    if (fDue !== 'all') { const d = dueDiff(t); const open = !isDone(t); if (fDue === 'overdue' && !(open && d != null && d < 0)) return false; if (fDue === 'today' && !(open && d === 0)) return false; if (fDue === 'week' && !(open && d != null && d >= 0 && d <= 7)) return false; }
    if (q) { const hay = `${t.title || ''} ${t.detail || ''} ${(t.tags || []).join(' ')} ${(t.responsible || []).join(' ')}`.toLowerCase(); if (!hay.includes(q)) return false; }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [mine, fFlow, fStatus, fPrio, fTag, fChan, fDue, q]);

  // KPI จาก mine (ก่อนกรอง)
  const openT = mine.filter(t => !isDone(t));
  const kpi = {
    open: openT.length,
    overdue: openT.filter(t => { const d = dueDiff(t); return d != null && d < 0; }).length,
    today: openT.filter(t => dueDiff(t) === 0).length,
    soon: openT.filter(t => { const d = dueDiff(t); return d != null && d > 0 && d <= 7; }).length,
    done: mine.filter(t => isDone(t)).length,
  };
  const pct = mine.length ? Math.round((kpi.done / mine.length) * 100) : 0;

  // sort + group
  const prioRank = { high: 0, medium: 1, low: 2 };
  const sortFn = (a, b) => {
    if (sortBy === 'priority') return (prioRank[a.priority] ?? 1) - (prioRank[b.priority] ?? 1);
    if (sortBy === 'updated') return String(b.updatedAt || b.dateISO || '').localeCompare(String(a.updatedAt || a.dateISO || ''));
    const da = dueDiff(a), db = dueDiff(b);
    if (da == null && db == null) return 0; if (da == null) return 1; if (db == null) return -1; return da - db;
  };
  const groups = useMemo(() => {
    const sorted = [...shown].sort(sortFn);
    if (groupBy === 'flow') {
      const m = new Map();
      sorted.forEach(t => { const id = t.flow || '__general__'; const fl = flowOf(t); if (!m.has(id)) m.set(id, { key: id, label: fl?.name || 'งานทั่วไป', color: fl?.color || 'var(--ink-3)', items: [] }); m.get(id).items.push(t); });
      return [...m.values()];
    }
    if (groupBy === 'due') {
      const buckets = [
        { key: 'overdue', label: 'เลยกำหนด', color: 'var(--bad)', test: t => { const d = dueDiff(t); return !isDone(t) && d != null && d < 0; } },
        { key: 'today', label: 'ครบวันนี้', color: 'var(--warn)', test: t => !isDone(t) && dueDiff(t) === 0 },
        { key: 'week', label: 'ภายใน 7 วัน', color: 'var(--info)', test: t => { const d = dueDiff(t); return !isDone(t) && d != null && d > 0 && d <= 7; } },
        { key: 'later', label: 'หลังจากนี้', color: 'var(--accent)', test: t => { const d = dueDiff(t); return !isDone(t) && d != null && d > 7; } },
        { key: 'nodate', label: 'ไม่มีกำหนด', color: 'var(--ink-3)', test: t => !isDone(t) && dueDiff(t) == null },
        { key: 'done', label: 'เสร็จแล้ว', color: 'var(--good)', test: t => isDone(t) },
      ];
      return buckets.map(b => ({ key: b.key, label: b.label, color: b.color, items: sorted.filter(b.test) })).filter(b => b.items.length);
    }
    const order = (TMK.kanbanMeta || []).map(k => k.id);
    const m = new Map();
    sorted.forEach(t => { const s = statusMeta(t); if (!m.has(s.id)) m.set(s.id, { key: s.id, label: s.label, color: s.color || (isDone(t) ? 'var(--good)' : 'var(--ink-3)'), items: [] }); m.get(s.id).items.push(t); });
    const arr = [...m.values()];
    arr.sort((a, b) => { const ia = order.indexOf(a.key), ib = order.indexOf(b.key); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, groupBy, sortBy]);

  const openTask = (t) => window.__openModal?.('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] });
  const anyFilter = fFlow.length || fStatus.length || fPrio.length || fTag.length || fChan.length || fDue !== 'all' || query;
  const clearAll = () => { setFFlow([]); setFStatus([]); setFPrio([]); setFTag([]); setFChan([]); setFDue('all'); setQuery(''); };

  const Kpi = ({ label, value, color }) => (
    <div className="rounded-lg border bg-card px-3 py-2.5 min-w-0">
      <div className="text-xl font-bold tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[11px] text-muted-foreground truncate">{label}</div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 max-w-6xl mx-auto w-full">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2"><Icon name="user" className="size-5" /> งานของฉัน</h2>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">{myNames.size ? `งานที่มอบหมายให้ ${[...myNames].join(' · ')} — ทุกโครงการ` : 'ยังจับคู่บัญชีกับสมาชิกทีมไม่ได้'}</p>
        </div>
        {myNames.size > 0 && mine.length > 0 && <SearchInput value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหา" className="w-full sm:w-64" />}
      </div>

      {myNames.size === 0 ? (
        <div className="border-2 border-dashed rounded-xl py-16 text-center text-muted-foreground">
          <Icon name="user" className="size-8 mx-auto opacity-30 mb-2" />
          <p className="text-sm">จับคู่อีเมลของคุณกับสมาชิกทีมไม่ได้</p>
          <p className="text-xs opacity-70 mt-1">เพิ่มชื่อ/อีเมลของคุณที่ ตั้งค่า → สิทธิ์ผู้ใช้ เพื่อให้ระบบดึงงานของคุณ</p>
        </div>
      ) : mine.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl py-16 text-center text-muted-foreground">
          <Icon name="check" className="size-8 mx-auto opacity-30 mb-2" />
          <p className="text-sm">ยังไม่มีงานที่มอบหมายให้คุณ</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Kpi label="ค้างอยู่" value={kpi.open} color="var(--ink)" />
            <Kpi label="เลยกำหนด" value={kpi.overdue} color="var(--bad)" />
            <Kpi label="ครบวันนี้" value={kpi.today} color="var(--warn)" />
            <Kpi label="ใน 7 วัน" value={kpi.soon} color="var(--info)" />
            <Kpi label="เสร็จแล้ว" value={kpi.done} color="var(--good)" />
          </div>
          <Progress value={pct} className="h-1.5" />

          <div className="flex items-center gap-2 flex-wrap">
            <ToggleGroup type="single" value={groupBy} onValueChange={v => v && setGroupBy(v)} variant="outline" size="sm">
              <ToggleGroupItem value="status" className="h-8 px-2.5 text-xs">สถานะ</ToggleGroupItem>
              <ToggleGroupItem value="flow" className="h-8 px-2.5 text-xs">โครงการ</ToggleGroupItem>
              <ToggleGroupItem value="due" className="h-8 px-2.5 text-xs">กำหนดส่ง</ToggleGroupItem>
            </ToggleGroup>
            <span className="w-px h-5 bg-border hidden sm:block" />
            <MtFilter label="โครงการ" icon="grid" options={flowOpts} value={fFlow} onChange={setFFlow} />
            <MtFilter label="สถานะ" icon="circle" options={statusOpts} value={fStatus} onChange={setFStatus} />
            <MtFilter label="ความสำคัญ" icon="target" options={prioOpts} value={fPrio} onChange={setFPrio} />
            <MtFilter label="แท็ก" icon="filter" options={tagOpts} value={fTag} onChange={setFTag} />
            <MtFilter label="ช่องทาง" icon="layers" options={chanOpts} value={fChan} onChange={setFChan} />
            <Select value={fDue} onValueChange={setFDue}>
              <SelectTrigger className="h-8 w-auto gap-1 text-xs"><Icon name="calendarDays" className="size-3.5" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">กำหนด: ทั้งหมด</SelectItem>
                <SelectItem value="overdue">เลยกำหนด</SelectItem>
                <SelectItem value="today">ครบวันนี้</SelectItem>
                <SelectItem value="week">ใน 7 วัน</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-2">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-8 w-auto gap-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="due">เรียง: ครบกำหนด</SelectItem>
                  <SelectItem value="priority">เรียง: ความสำคัญ</SelectItem>
                  <SelectItem value="updated">เรียง: อัปเดตล่าสุด</SelectItem>
                </SelectContent>
              </Select>
              {anyFilter ? <Button variant="ghost" size="sm" className="h-8" onClick={clearAll}>ล้าง</Button> : null}
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="border-2 border-dashed rounded-xl py-14 text-center text-muted-foreground">
              <Icon name="search" className="size-8 mx-auto opacity-30 mb-2" />
              <p className="text-sm">ไม่มีงานตรงกับตัวกรอง</p>
              <Button variant="link" size="sm" onClick={clearAll}>ล้างตัวกรอง</Button>
            </div>
          ) : groups.map(g => (
            <div key={g.key} className="flex flex-col gap-3">
              <div className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: g.color }} /><h3 className="font-semibold text-sm">{g.label}</h3><Badge variant="secondary">{g.items.length}</Badge></div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">{g.items.map(t => <TaskCard key={t.id} task={t} showFlow onClick={() => openTask(t)} />)}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
