/* ============================================================
   FLOWS — board วางแผนงานหลายอัน (multi-flow) · PART 15 + 16
   - section บนสุด · แต่ละโครงการ = บอร์ดของตัวเอง (ปฏิทิน/คัมบัง/ไทม์ไลน์/รายการ/ตั้งค่า)
   - reuse <PlannerView flow={...}> จาก views-2.jsx (scope งานตาม flow.scopeId)
   - หน้าตั้งค่าต่อโครงการ (page) เข้าไปปรับละเอียด: ทั่วไป/แบรนด์/แคมเปญ/คอลัมน์สถานะ/สมาชิก/การมองเห็น/โซนอันตราย
   - "งานทั่วไป" แก้ได้ (config row __general__ · scopeId='' กรองงาน flow ว่าง — งาน null ไม่หาย)
   - graceful: ตาราง tmk_flows ยังไม่ migrate → เหลือ "งานทั่วไป" อันเดียว
   ============================================================ */
import React, { useState, useMemo, useEffect } from 'react';
import { TMK } from './data.js';
import { Icon, Avatar, ColorPicker, FlowIcon, IconPicker, readImageCompressed, useBeatOn, PageSkeleton, CardGridSkeleton } from './components.jsx';
import { useData } from './dataContext.jsx';
import { supabase } from './lib/supabaseClient.js';
import { logAudit } from './lib/audit.js';
import { thaiDate, todayISO } from './lib/dateUtils.js';
import { SearchInput } from '@/components/ui/search-input';
import { PlannerView, TaskCard } from './views-2.jsx';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Checkbox as ShadcnCheckbox } from '@/components/ui/checkbox';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { QRCodeSVG } from 'qrcode.react';

// แถวเลือกแบบติ๊กได้ (แก้บั๊ก double-toggle: ไม่หุ้มด้วย <label> · div+onClick + checkbox visual-only)
function CheckRow({ checked, onToggle, children }) {
  return (
    <div role="button" tabIndex={0} onClick={onToggle} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      className="flex items-center gap-2 text-sm py-1.5 px-1 rounded hover:bg-muted/50 cursor-pointer select-none">
      <ShadcnCheckbox checked={checked} className="pointer-events-none" />{children}
    </div>
  );
}
// ปุ่มสีแบบ popover (ColorPicker ข้างใน) — สำหรับช่องเล็ก เช่นสีคอลัมน์สถานะ
function ColorDot({ value, onChange }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" title="เลือกสี" className="size-8 rounded border shrink-0" style={{ background: value || '#888888' }} />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3"><ColorPicker value={value || '#888888'} onChange={onChange} size="sm" /></PopoverContent>
    </Popover>
  );
}
const confirmAsync = async (opts, fallbackMsg) => (window.__confirm ? await window.__confirm(opts) : confirm(fallbackMsg || opts.body || opts.title));

const PALETTE = ['#6b5ce0', '#4a8be0', '#18a0ab', '#06c755', '#2f9e6e', '#c08a3e', '#ee6a3a', '#ec4899', '#cf4d5c', '#0a5aa0'];
const NEW_ICONS = ['Rocket', 'Target', 'ShoppingCart', 'Package', 'Palette', 'Megaphone', 'Flame', 'Star', 'Shirt', 'Sparkles']; // ไอคอนเริ่มต้นตอนสร้างโครงการ (lucide)
const GENERAL_ID = '__general__'; // config row ของ "งานทั่วไป" (scopeId='' กรองงาน flow ว่าง)
const VIEWS = [['calendar', 'calendarDays', 'ปฏิทิน'], ['kanban', 'listChecks', 'Kanban'], ['timeline', 'route', 'ไทม์ไลน์'], ['list', 'menu', 'รายการ']];

const guardEdit = () => { if (window.__canEdit === false) { window.__toast?.('สิทธิ์ "ดูอย่างเดียว" — แก้ไขไม่ได้', 'warn'); return false; } return true; };
const isMissing = (err) => /relation .* does not exist|does not exist|schema cache|PGRST205|42P01/i.test(err?.message || err?.code || '');
const defaultStatuses = () => (TMK.kanbanMeta || []).map(k => ({ id: k.id, label: k.label, color: '', done: k.id === 'done' }));
const doneSetOf = (f) => new Set((f.statuses && f.statuses.length) ? f.statuses.filter(s => s.done).map(s => s.id) : ['done']);
// แบรนด์ของโครงการ (รองรับหลายแบรนด์ · fallback brandId เดี่ยว)
const flowBrands = (flow) => {
  const ids = (flow.brandIds && flow.brandIds.length) ? flow.brandIds : (flow.brandId ? [flow.brandId] : []);
  return ids.map(id => (TMK.brands || []).find(b => b.id === id)).filter(Boolean);
};

// สร้าง object โครงการ "งานทั่วไป" จาก config row (ถ้ามี) — แก้ไขได้ แต่ลบ/archive ไม่ได้ · scopeId=''
function buildGeneral() {
  const r = (TMK.flows || []).find(f => f.id === GENERAL_ID);
  return {
    id: GENERAL_ID, scopeId: '', isGeneral: true,
    name: r?.name || 'งานทั่วไป', color: r?.color || '#64748b', icon: r?.icon || 'Inbox',
    description: r?.description || 'งานที่ยังไม่ได้จัดเข้าโครงการ',
    brandId: r?.brandId || '', brandIds: r?.brandIds || (r?.brandId ? [r.brandId] : []),
    campaignIds: r?.campaignIds || [], statuses: r?.statuses || [],
    members: r?.members || [], visibility: 'shared', owner: r?.owner || '', defaultView: r?.defaultView || 'kanban', sortOrder: -1,
    coverUrl: r?.coverUrl || '', shareToken: '', shareEnabled: false, // งานทั่วไปไม่เปิดแชร์
  };
}
// โครงการที่ "มองเห็นได้" (ไม่นับ config row / archived / private ของคนอื่น) — ใช้ทั้ง view + sidebar
export function visibleFlows() {
  const me = window.__userEmail || '';
  const general = buildGeneral();
  const real = (TMK.flows || []).filter(f => f.id !== GENERAL_ID && !f.archived && (f.visibility !== 'private' || f.owner === me)).map(f => ({ ...f, scopeId: f.id }));
  return [general, ...real];
}

export function FlowsView({ sub, tasks, setTasks, activeFlow }) {
  const { reload, refresh } = useData() || {};
  const me = window.__userEmail || '';
  const flows = visibleFlows();
  const realFlows = flows.filter(f => !f.isGeneral);

  // activeId มาจาก App (single source of truth · ไม่มี state ซ้อนใน FlowsView → ไม่ lag/กดซ้ำ)
  const activeId = activeFlow || GENERAL_ID;
  const [busy, setBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [query, setQuery] = useState(''); // ค้นหางานข้ามโครงการ (E4)

  const goView = (flowId, view) => { window.__setFlow?.(flowId); window.__goSection?.('flows', view || 'kanban'); };

  const createFlow = async () => {
    if (!guardEdit()) return;
    setBusy(true);
    try {
      const id = 'flow_' + Math.random().toString(36).slice(2, 9);
      const maxOrder = Math.max(0, ...realFlows.map(f => f.sortOrder || 0));
      const payload = { id, name: 'โครงการใหม่', color: PALETTE[realFlows.length % PALETTE.length], icon: NEW_ICONS[realFlows.length % NEW_ICONS.length], owner: me, default_view: 'kanban', sort_order: maxOrder + 1 };
      const { error } = await supabase.from('tmk_flows').insert(payload);
      if (error) { if (isMissing(error)) throw new Error('ยังไม่ได้รัน migration — รัน 20260710-flows-brands.sql ก่อน'); throw error; }
      logAudit({ action: 'create', entityType: 'flow', entityName: 'โครงการใหม่', summary: 'สร้างโครงการใหม่', flowId: id });
      if (refresh) await refresh(['tmk_flows']); else if (reload) await reload();
      window.__setFlow?.(id);
      window.__goSection?.('flows', 'settings'); // เด้งเข้าหน้าตั้งค่าทันที (ตั้งชื่อ/แบรนด์/สี)
      window.__toast?.('สร้างโครงการแล้ว — ตั้งค่าต่อได้เลย', 'success');
    } catch (err) { window.__toast?.('สร้างไม่สำเร็จ: ' + err.message, 'error'); } finally { setBusy(false); }
  };

  // เปิดให้ sidebar ปุ่ม "+ สร้างโครงการ" เรียกได้ (window.__setFlow/__activeFlow เป็นของ App แล้ว · guard โครงการหายอยู่ที่ App)
  useEffect(() => { window.__createFlow = createFlow; });

  const active = flows.find(f => f.id === activeId) || flows[0];

  const tasksByFlow = useMemo(() => {
    const m = {};
    (TMK.tasks || []).forEach(t => { const k = t.flow || ''; (m[k] = m[k] || []).push(t); });
    return m;
  }, [TMK.tasks]);
  const tasksOf = (f) => tasksByFlow[f.scopeId ?? f.id ?? ''] || [];

  // skeleton สั้นๆ ตอนสลับหน้าย่อย (board subs ใช้ PlannerSkeleton ของ PlannerView เอง → ข้าม กันกระพริบซ้อน)
  const isBoardSub = ['calendar', 'kanban', 'timeline', 'list'].includes(sub);
  const beat = useBeatOn(sub);
  if (beat && !isBoardSub) return (sub === 'overview' || !sub || sub === 'mytasks') ? <CardGridSkeleton /> : <PageSkeleton />;

  // ===== หน้ารวมโครงการ (overview) — แดชบอร์ด + ค้นหาข้ามโครงการ (E4) =====
  if (sub === 'overview' || !sub) {
    const openTask = (t) => window.__openModal?.('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] });
    const doneOfTask = (t) => doneSetOf(flows.find(f => (f.scopeId ?? f.id ?? '') === (t.flow || '')) || {}).has(t.status);
    const allTasks = TMK.tasks || [];
    const tdy = todayISO();
    let kDone = 0, kOverdue = 0;
    allTasks.forEach(t => { if (doneOfTask(t)) kDone++; else { const due = t.dateEnd || t.dateISO || ''; if (due && due < tdy) kOverdue++; } });
    const kpis = [
      { label: 'โครงการ', value: realFlows.length, tone: 'var(--ink-2)' },
      { label: 'งานทั้งหมด', value: allTasks.length, tone: 'var(--ink-2)' },
      { label: 'เสร็จแล้ว', value: kDone, tone: 'var(--good, #1f8a5b)' },
      { label: 'ค้างอยู่', value: allTasks.length - kDone, tone: 'var(--info, #2563eb)' },
      { label: 'เลยกำหนด', value: kOverdue, tone: '#cf4d5c' },
    ];
    const q = query.trim().toLowerCase();
    const results = q ? allTasks.filter(t =>
      (t.title || '').toLowerCase().includes(q) ||
      (t.detail || '').toLowerCase().includes(q) ||
      (t.tags || []).some(tg => String(tg).toLowerCase().includes(q)) ||
      (t.responsible || []).some(r => String(r).toLowerCase().includes(q))
    ) : [];
    return (
      <div className="flex flex-col gap-6 w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">โครงการทั้งหมด</h2>
            <p className="text-sm text-muted-foreground mt-0.5">บอร์ดวางแผนงานแยกอิสระ — กดเข้าแต่ละโครงการเพื่อปรับแบรนด์/แคมเปญ/คอลัมน์/สมาชิกได้ละเอียด</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <SearchInput placeholder="ค้นหางานทุกโครงการ…" value={query} onChange={e => setQuery(e.target.value)} wrapperClassName="w-full sm:w-[230px]" />
            <Button onClick={createFlow} disabled={busy}><Icon name="plus" className="size-4 mr-2" /> สร้างโครงการ</Button>
          </div>
        </div>

        {/* แดชบอร์ดสรุป (ทุกโครงการ) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {kpis.map(k => (
            <div key={k.label} className="rounded-xl border bg-card px-4 py-3">
              <div className="text-2xl font-bold tabular-nums" style={{ color: k.tone }}>{k.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>

        {q ? (
          <div className="flex flex-col gap-3">
            <div className="text-sm text-muted-foreground">ผลการค้นหา “{query}” — {results.length} งาน</div>
            {results.length === 0
              ? <div className="text-sm text-muted-foreground py-8 text-center">ไม่พบงานที่ตรงกับคำค้น</div>
              : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">{results.map(t => <TaskCard key={t.id} task={t} showFlow onClick={() => openTask(t)} />)}</div>}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {flows.map(f => (
              <FlowCard key={f.id} flow={f} tasks={tasksOf(f)}
                onOpen={() => goView(f.id, f.defaultView)}
                onSettings={() => goView(f.id, 'settings')} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ===== งานของฉัน (ทุกโครงการ) =====
  if (sub === 'mytasks') return <MyTasksView />;

  // ===== บอร์ดของโครงการ (calendar/kanban/timeline/list/settings) =====
  const brands = flowBrands(active);
  return (
    <div className="space-y-4">
      {/* แถบหัวบอร์ด — content-inner (block · กว้างเท่าหน้ายอดขายเป๊ะ) · flex ข้างใน: ข้อมูลโครงการซ้าย · แท็บวิวขวา */}
      <div className="content-inner">
       <div className="flex flex-wrap items-center gap-3 pb-1">
        <button className="flex items-center gap-2 min-w-0 text-left" onClick={() => goView(active.id, active.defaultView)} title="เปิดบอร์ด">
          <FlowIcon icon={active.icon} className="size-7 shrink-0" style={{ color: active.color }} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-foreground truncate" style={{ color: active.color }}>{active.name}</h2>
              {brands.map(b => <Badge key={b.id} variant="outline" className="gap-1 shrink-0"><span className="size-2 rounded-full" style={{ background: b.color }} />{b.name}</Badge>)}
            </div>
            {active.description && <div className="text-xs text-muted-foreground truncate">{active.description}</div>}
          </div>
        </button>

        {/* สลับวิว (4) + ประวัติ + ตั้งค่า — สลับโครงการอยู่ที่ breadcrumb ด้านบนแล้ว · responsive ไม่ล้น */}
        <div className="flex items-center gap-1.5 ml-auto shrink-0 max-w-full">
          <ToggleGroup type="single" value={sub} onValueChange={(v) => v && window.__goSection?.('flows', v)} className="gap-0.5 rounded-md border bg-muted/30 p-0.5 overflow-x-auto">
            {VIEWS.map(([v, ic, l]) => (
              <ToggleGroupItem key={v} value={v} size="sm" className="gap-1.5 px-2.5 shrink-0 data-[state=on]:bg-background data-[state=on]:shadow-sm" title={l}><Icon name={ic} className="size-3.5" /><span className="hidden lg:inline">{l}</span></ToggleGroupItem>
            ))}
          </ToggleGroup>
          {!active.isGeneral && <Button variant={active.shareEnabled ? 'secondary' : 'ghost'} size="icon" className="size-8 shrink-0" title="แชร์ลิงก์โครงการ" onClick={() => setShareOpen(true)}><Icon name="layers" className="size-4" /></Button>}
          <Button variant={sub === 'history' ? 'secondary' : 'ghost'} size="icon" className="size-8 shrink-0" title="ประวัติกิจกรรม" onClick={() => window.__goSection?.('flows', 'history')}><Icon name="clock" className="size-4" /></Button>
          <Button variant={sub === 'settings' ? 'secondary' : 'ghost'} size="icon" className="size-8 shrink-0" title="ตั้งค่าโครงการ" onClick={() => window.__goSection?.('flows', 'settings')}><Icon name="system" className="size-4" /></Button>
        </div>
       </div>
      </div>
      {!active.isGeneral && <ShareFlowDialog flow={active} open={shareOpen} onOpenChange={setShareOpen} />}

      {/* เนื้อหา */}
      {sub === 'settings'
        ? <FlowSettingsPage key={active.id} flow={active} onAfter={(view) => goView(active.id, view || active.defaultView)} onGone={() => goView(GENERAL_ID, 'overview')} />
        : sub === 'history'
        ? <FlowHistoryView flow={active} />
        : <PlannerView sub={sub} tasks={tasks} setTasks={setTasks} flow={active} />}
    </div>
  );
}

/* ---- การ์ดโครงการ ---- */
function FlowCard({ flow, tasks, onOpen, onSettings }) {
  const doneSet = doneSetOf(flow);
  const total = tasks.length;
  const done = tasks.filter(t => doneSet.has(t.status)).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const brands = flowBrands(flow);
  const members = (flow.members || []).slice(0, 4);
  const color = flow.color || '#64748b';
  return (
    <Card className="flex flex-col overflow-hidden hover:shadow-md transition-shadow pt-0 gap-0">
      {/* ปก: รูปแนวนอน หรือ แถบสีโครงการ + ชื่อ (กดเปิดบอร์ด) */}
      <button type="button" onClick={onOpen} title={flow.name}
        className="relative block w-full aspect-[16/7] overflow-hidden text-left group">
        {flow.coverUrl
          ? <img src={flow.coverUrl} alt="" className="absolute inset-0 size-full object-cover transition-transform group-hover:scale-[1.03]" />
          : <span className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}cc 60%, ${color}99 100%)` }} />}
        <span className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
        <span className="absolute left-3 bottom-2.5 right-3 flex items-center gap-2 text-white">
          <FlowIcon icon={flow.icon} className="size-5 shrink-0 drop-shadow" />
          <span className="font-bold text-[15px] leading-snug line-clamp-2 drop-shadow">{flow.name}</span>
        </span>
      </button>
      <CardContent className="p-4 flex-1 flex flex-col gap-3" style={{ borderTop: `3px solid ${color}` }}>
        <div className="flex items-center gap-1.5 flex-wrap min-h-5">
          {brands.map(b => <Badge key={b.id} variant="outline" className="gap-1 text-[11px]"><span className="size-2 rounded-full" style={{ background: b.color }} />{b.name}</Badge>)}
          {flow.visibility === 'private' && <Badge variant="secondary" className="gap-1 text-[11px]"><Icon name="shield" className="size-3" /> ส่วนตัว</Badge>}
          {flow.shareEnabled && <Badge variant="secondary" className="gap-1 text-[11px]"><Icon name="layers" className="size-3" /> แชร์อยู่</Badge>}
          {flow.isGeneral && <Badge variant="secondary" className="text-[11px]">ทั่วไป</Badge>}
          {brands.length === 0 && !flow.isGeneral && flow.visibility !== 'private' && !flow.shareEnabled && <span className="text-[11px] text-muted-foreground/50">ยังไม่มีแบรนด์</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground"><Icon name="listChecks" className="size-3.5" />ความคืบหน้า</span>
            <span className="font-semibold tabular-nums">{total ? <>{done}/{total} <span className="text-muted-foreground font-normal">({pct}%)</span></> : <span className="text-muted-foreground font-normal">ยังไม่มีงาน</span>}</span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-3 border-t border-border/50">
          <div className="flex items-center -space-x-1.5">
            {members.length === 0 ? <span className="text-[11px] text-muted-foreground/60">ไม่มีสมาชิก</span>
              : members.map(m => { const s = (TMK.staff || []).find(x => x.name === m) || { color: '#888' }; return <Avatar key={m} name={m} color={s.color} size={22} />; })}
            {(flow.members || []).length > 4 && <span className="text-[11px] text-muted-foreground ml-2">+{flow.members.length - 4}</span>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" onClick={onSettings} title="ตั้งค่าโครงการ"><Icon name="system" className="size-3.5" /></Button>
            <Button variant="outline" size="sm" className="h-7" onClick={onOpen}>เปิด <Icon name="chevR" className="size-3.5 ml-0.5" /></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---- หน้าตั้งค่าต่อโครงการ (page · เข้าไปปรับละเอียด) ---- */
function FlowSettingsPage({ flow, onAfter, onGone }) {
  const { reload, refresh } = useData() || {};
  const me = window.__userEmail || '';
  const isGeneral = !!flow.isGeneral;
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('general');
  const [name, setName] = useState(flow.name || '');
  const [color, setColor] = useState(flow.color || PALETTE[0]);
  const [icon, setIcon] = useState(flow.icon || 'ClipboardList');
  const [description, setDescription] = useState(flow.description || '');
  const [coverUrl, setCoverUrl] = useState(flow.coverUrl || '');
  const [brandIds, setBrandIds] = useState(flow.brandIds && flow.brandIds.length ? flow.brandIds : (flow.brandId ? [flow.brandId] : []));
  const [campaignIds, setCampaignIds] = useState(flow.campaignIds || []);
  const [statuses, setStatuses] = useState((flow.statuses && flow.statuses.length) ? flow.statuses : defaultStatuses());
  const [members, setMembers] = useState(flow.members || []);
  const [visibility, setVisibility] = useState(flow.visibility || 'shared');
  const [defaultView, setDefaultView] = useState(flow.defaultView || 'kanban');

  const toggle = (arr, set, id) => set(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);

  const save = async () => {
    if (!guardEdit()) return;
    if (!name.trim()) { window.__toast?.('ใส่ชื่อโครงการก่อน', 'warn'); return; }
    setBusy(true);
    try {
      const payload = {
        id: flow.id, name: name.trim(), color, icon, description: description.trim(),
        brand_id: brandIds[0] || null, brand_ids: brandIds,   // brand_id = back-compat · brand_ids = หลายแบรนด์
        campaign_ids: campaignIds, statuses, members, visibility: isGeneral ? 'shared' : visibility,
        default_view: defaultView, owner: flow.owner || me, sort_order: flow.sortOrder ?? 0,
        cover_url: coverUrl || null,   // รูปปก (20260720 · graceful)
      };
      // graceful: คอลัมน์เสริม (brand_ids/cover_url) ยังไม่ migrate → ตัดคอลัมน์ที่ขาดออกแล้วลองใหม่
      const p = { ...payload };
      let error, guard = 0;
      ({ error } = await supabase.from('tmk_flows').upsert(p));
      while (error && guard++ < 4) {
        const col = ((error.message || '').match(/(brand_ids|cover_url|share_token|share_enabled)/) || [])[1];
        if (!col || !(col in p)) break;
        delete p[col];
        ({ error } = await supabase.from('tmk_flows').upsert(p));
      }
      if (error) { if (isMissing(error)) throw new Error('ยังไม่ได้รัน migration — รัน 20260710-flows-brands.sql ก่อน'); throw error; }
      logAudit({ action: 'update', entityType: 'flow', entityName: name.trim(), summary: `แก้ไขโครงการ "${name.trim()}"`, flowId: flow.scopeId ?? flow.id });
      if (refresh) await refresh(['tmk_flows']); else if (reload) await reload();
      window.__toast?.('บันทึกโครงการเรียบร้อย', 'success');
    } catch (err) { window.__toast?.('บันทึกไม่สำเร็จ: ' + err.message, 'error'); } finally { setBusy(false); }
  };

  const archiveFlow = async () => {
    if (!guardEdit() || isGeneral) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('tmk_flows').update({ archived: true }).eq('id', flow.id);
      if (error) throw error;
      logAudit({ action: 'update', entityType: 'flow', entityName: flow.name, summary: `เก็บโครงการ "${flow.name}" เข้าคลัง`, flowId: flow.scopeId ?? flow.id });
      if (refresh) await refresh(['tmk_flows']); else if (reload) await reload();
      window.__toast?.('เก็บโครงการเข้าคลังแล้ว', 'success');
      onGone?.();
    } catch (err) { window.__toast?.('ทำไม่สำเร็จ: ' + err.message, 'error'); } finally { setBusy(false); }
  };

  const deleteFlow = async () => {
    if (!guardEdit()) return;
    // งานทั่วไป: ลบ = รีเซ็ตค่า (soft-delete config row __general__ เท่านั้น · งาน flow_id ว่าง ยังอยู่ · general โผล่ใหม่ default)
    if (isGeneral) {
      if (!await confirmAsync({ title: 'รีเซ็ต "งานทั่วไป"', body: 'ตั้งค่า (ชื่อ/สี/ไอคอน/คอลัมน์/สมาชิก) จะกลับค่าเริ่มต้น · งานที่ยังไม่จัดเข้าโครงการยังอยู่ครบ', confirmText: 'รีเซ็ต', danger: true }, 'รีเซ็ตงานทั่วไป? งานไม่หาย')) return;
      setBusy(true);
      try {
        // ลบเฉพาะ config row (ถ้ามี) — ถ้ายังไม่เคยบันทึก ก็ถือว่า default อยู่แล้ว
        await supabase.from('tmk_flows').delete().eq('id', GENERAL_ID);
        logAudit({ action: 'update', entityType: 'flow', entityName: 'งานทั่วไป', summary: 'รีเซ็ตงานทั่วไปกลับค่าเริ่มต้น', flowId: '' });
        if (refresh) await refresh(['tmk_flows']); else if (reload) await reload();
        window.__toast?.('รีเซ็ตงานทั่วไปแล้ว (งานไม่หาย)', 'success');
        onGone?.();
      } catch (err) { window.__toast?.('รีเซ็ตไม่สำเร็จ: ' + err.message, 'error'); } finally { setBusy(false); }
      return;
    }
    const linked = (TMK.tasks || []).filter(t => t.flow === flow.id).length;
    if (!await confirmAsync({ title: `ลบโครงการ "${flow.name}"`, body: linked > 0 ? `มี ${linked} งานในโครงการ — ลบจะย้ายงานกลับ "งานทั่วไป"` : 'ลบโครงการนี้?', confirmText: 'ลบ', danger: true }, `ลบโครงการ "${flow.name}"?`)) return;
    setBusy(true);
    try {
      if (linked > 0) await supabase.from('tmk_tasks').update({ flow_id: null }).eq('flow_id', flow.id);
      const { error } = await supabase.from('tmk_flows').update({ deleted_at: new Date().toISOString() }).eq('id', flow.id);
      if (error) throw error;
      logAudit({ action: 'delete', entityType: 'flow', entityName: flow.name, summary: `ลบโครงการ "${flow.name}"`, flowId: flow.scopeId ?? flow.id });
      if (refresh) await refresh(['tmk_flows', 'tmk_tasks']); else if (reload) await reload();
      window.__toast?.('ย้ายโครงการไปถังขยะแล้ว', 'success', 6000, {
        label: 'เลิกทำ',
        onClick: async () => { try { await supabase.from('tmk_flows').update({ deleted_at: null }).eq('id', flow.id); if (refresh) await refresh(['tmk_flows']); else if (reload) await reload(); window.__toast?.('กู้คืนโครงการแล้ว', 'success'); } catch (e) { window.__toast?.('กู้คืนไม่สำเร็จ', 'error'); } },
      });
      onGone?.();
    } catch (err) { window.__toast?.('ลบไม่สำเร็จ: ' + err.message, 'error'); } finally { setBusy(false); }
  };

  // ตัวแก้คอลัมน์สถานะ
  const setStatus = (i, patch) => setStatuses(st => st.map((s, j) => j === i ? { ...s, ...patch } : s));
  const addStatus = () => setStatuses(st => [...st, { id: 'st_' + Math.random().toString(36).slice(2, 7), label: 'สถานะใหม่', color: PALETTE[st.length % PALETTE.length], done: false }]);
  const removeStatus = (i) => setStatuses(st => st.length > 1 ? st.filter((_, j) => j !== i) : st);
  const moveStatus = (i, dir) => setStatuses(st => { const j = i + dir; if (j < 0 || j >= st.length) return st; const c = [...st]; [c[i], c[j]] = [c[j], c[i]]; return c; });

  const TABS = [
    ['general', 'system', 'ทั่วไป'], ['brand', 'store', 'แบรนด์'], ['camp', 'megaphone', 'แคมเปญ'],
    ['status', 'listChecks', 'คอลัมน์สถานะ'], ['members', 'users', 'สมาชิก'],
    ...(isGeneral ? [] : [['access', 'shield', 'การมองเห็น']]),
    ['history', 'clock', 'ประวัติ'],
    ['danger', 'trash', isGeneral ? 'รีเซ็ต' : 'โซนอันตราย'],
  ];

  return (
    <div className="flex flex-col gap-4 max-w-4xl w-full mx-auto pb-20">
      <div className="rounded-lg border bg-muted/20 p-4 flex items-start gap-3">
        <FlowIcon icon={icon} className="size-7 shrink-0 mt-0.5" style={{ color }} />
        <div className="min-w-0">
          <div className="font-bold text-foreground">ตั้งค่าโครงการ: {name || '(ไม่มีชื่อ)'}</div>
          <div className="text-xs text-muted-foreground">{isGeneral ? 'งานทั่วไป — แก้ชื่อ/ไอคอน/สี/คอลัมน์/สมาชิกได้ · ลบ = รีเซ็ตค่า (งานไม่หาย)' : 'ปรับแบรนด์ · แคมเปญที่ใช้ · คอลัมน์สถานะ · สมาชิก · การมองเห็น'}</div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex flex-col lg:flex-row gap-6 w-full">
        <aside className="lg:w-1/4 shrink-0">
          <TabsList className="flex flex-row lg:flex-col h-auto bg-transparent p-0 gap-1 w-full lg:items-start overflow-x-auto">
            {TABS.map(([id, ic, l]) => (
              <TabsTrigger key={id} value={id} className="w-full justify-start gap-2.5 px-3 py-2 text-sm data-[state=active]:bg-muted data-[state=active]:shadow-none whitespace-nowrap">
                <Icon name={ic} className="size-4" />{l}
              </TabsTrigger>
            ))}
          </TabsList>
        </aside>

        <div className="flex-1 min-w-0">
          {/* ทั่วไป */}
          <TabsContent value="general" className="m-0 flex flex-col gap-5">
            <div className="grid gap-2"><Label>ชื่อโครงการ <span className="text-destructive">*</span></Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="เช่น แคมเปญเปิดตัว Q3" /></div>
            <div className="grid gap-2"><Label>รายละเอียด</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="โครงการนี้ใช้ทำอะไร" /></div>
            <div className="grid gap-2">
              <Label>ไอคอน</Label>
              <IconPicker value={icon} onChange={setIcon} />
            </div>
            <div className="grid gap-2"><Label>สีประจำโครงการ</Label><ColorPicker value={color} onChange={setColor} /></div>
            <div className="grid gap-2">
              <Label>รูปปกการ์ด <span className="text-muted-foreground font-normal text-xs">(แนวนอน · ไม่ใส่ = ใช้แถบสีโครงการ)</span></Label>
              <div className="flex items-center gap-3">
                <div className="relative w-40 aspect-[16/7] rounded-lg overflow-hidden border bg-muted shrink-0">
                  {coverUrl
                    ? <img src={coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
                    : <span className="absolute inset-0 flex items-center justify-center gap-1.5 text-white text-xs font-semibold" style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)` }}><FlowIcon icon={icon} className="size-4" />{name || 'ชื่อโครงการ'}</span>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer rounded-md border px-3 py-1.5 hover:bg-muted">
                    <Icon name="image" className="size-4" /> เลือกรูป
                    <input type="file" accept="image/*" className="hidden" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { const url = await readImageCompressed(file, 640, 0.8); setCoverUrl(url); } catch (err) { window.__toast?.('อัปโหลดรูปไม่สำเร็จ: ' + (err?.message || err), 'error'); } e.target.value = ''; }} />
                  </label>
                  {coverUrl && <button type="button" className="text-xs text-destructive hover:underline text-left" onClick={() => setCoverUrl('')}>ลบรูปปก</button>}
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>มุมมองเริ่มต้น</Label>
              <Select value={defaultView} onValueChange={setDefaultView}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="calendar">ปฏิทิน</SelectItem><SelectItem value="kanban">Kanban</SelectItem>
                  <SelectItem value="timeline">ไทม์ไลน์</SelectItem><SelectItem value="list">รายการ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          {/* แบรนด์ (เลือกได้หลายอัน) */}
          <TabsContent value="brand" className="m-0 flex flex-col gap-2">
            <Label>แบรนด์ของโครงการนี้ {brandIds.length > 0 && <span className="text-muted-foreground font-normal">({brandIds.length})</span>}</Label>
            <p className="text-xs text-muted-foreground">เลือกได้หลายแบรนด์ · ชิปแบรนด์จะโชว์บนการ์ด/หัวบอร์ด</p>
            <div className="flex flex-col gap-0.5 max-h-72 overflow-y-auto rounded-md border p-2">
              {(TMK.brands || []).length === 0 ? <span className="text-xs text-muted-foreground p-1">ยังไม่มีแบรนด์</span>
                : (TMK.brands || []).map(b => (
                  <CheckRow key={b.id} checked={brandIds.includes(b.id)} onToggle={() => toggle(brandIds, setBrandIds, b.id)}>
                    <span className="size-2.5 rounded-full" style={{ background: b.color }} />{b.logoUrl ? <img src={b.logoUrl} alt="" className="size-4 rounded object-contain bg-white" /> : null}{b.name}
                  </CheckRow>
                ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">จัดการแบรนด์ (เพิ่ม/แก้สี/โลโก้) ได้ที่ <button className="text-primary underline" onClick={() => window.__goSection?.('settings', 'brands')}>ตั้งค่า → แบรนด์</button></p>
          </TabsContent>

          {/* แคมเปญ */}
          <TabsContent value="camp" className="m-0 flex flex-col gap-2">
            <Label>แคมเปญที่ใช้ในโครงการนี้ {campaignIds.length > 0 && <span className="text-muted-foreground font-normal">({campaignIds.length})</span>}</Label>
            <p className="text-xs text-muted-foreground">เว้นว่าง = ใช้ได้ทุกแคมเปญ · เลือกบางอัน = จำกัดเฉพาะที่เลือกในโมดัลงาน/ตัวกรอง</p>
            <div className="flex flex-col gap-0.5 max-h-72 overflow-y-auto rounded-md border p-2">
              {(TMK.campaigns || []).length === 0 ? <span className="text-xs text-muted-foreground p-1">ยังไม่มีแคมเปญ</span>
                : (TMK.campaigns || []).map(c => (
                  <CheckRow key={c.id} checked={campaignIds.includes(c.id)} onToggle={() => toggle(campaignIds, setCampaignIds, c.id)}>
                    <span className="size-2.5 rounded-full" style={{ background: c.color }} />{c.name}
                  </CheckRow>
                ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">สร้างแคมเปญใหม่ได้ที่ <button className="text-primary underline" onClick={() => window.__openModal?.('campaign')}>+ สร้างแคมเปญ</button></p>
          </TabsContent>

          {/* คอลัมน์สถานะ */}
          <TabsContent value="status" className="m-0 flex flex-col gap-2">
            <div className="flex items-center justify-between"><Label>คอลัมน์สถานะ (Kanban/รายการ)</Label><Button type="button" variant="outline" size="sm" onClick={addStatus}><Icon name="plus" className="size-3.5 mr-1" /> เพิ่มคอลัมน์</Button></div>
            <p className="text-xs text-muted-foreground">ลากลำดับด้วยปุ่ม ▲▼ · ติ๊ก "เสร็จ" = คอลัมน์ที่ถือว่างานเสร็จ (ใช้คิด % ความคืบหน้า)</p>
            <div className="flex flex-col gap-2">
              {statuses.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2 rounded-md border p-2 bg-muted/10">
                  <div className="flex flex-col">
                    <button type="button" className="text-muted-foreground disabled:opacity-30 leading-none text-[10px]" disabled={i === 0} onClick={() => moveStatus(i, -1)}>▲</button>
                    <button type="button" className="text-muted-foreground disabled:opacity-30 leading-none text-[10px]" disabled={i === statuses.length - 1} onClick={() => moveStatus(i, 1)}>▼</button>
                  </div>
                  <ColorDot value={s.color || '#888888'} onChange={(c) => setStatus(i, { color: c })} />
                  <Input value={s.label} onChange={e => setStatus(i, { label: e.target.value })} className="h-8 flex-1" />
                  <div role="button" tabIndex={0} onClick={() => setStatus(i, { done: !s.done })} className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer select-none" title="ถือว่างานในคอลัมน์นี้ = เสร็จ"><ShadcnCheckbox checked={!!s.done} className="pointer-events-none" /> เสร็จ</div>
                  <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive hover:bg-destructive/10" disabled={statuses.length <= 1} onClick={() => removeStatus(i)}><Icon name="trash" className="size-3.5" /></Button>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* สมาชิก — เลือกได้ทั้ง "บทบาท" (หน้าที่) และ "คน" */}
          <TabsContent value="members" className="m-0 flex flex-col gap-3">
            <Label>สมาชิกโครงการ {members.length > 0 && <span className="text-muted-foreground font-normal">({members.length})</span>}</Label>
            <p className="text-xs text-muted-foreground -mt-1">เลือกเป็น "บทบาท/หน้าที่" หรือ "รายคน" ก็ได้ — งานในโครงการจะแสดงให้คนในบทบาท/คนที่เลือก</p>
            <div className="grid gap-1.5">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Icon name="shield" className="size-3.5" /> บทบาท/หน้าที่</div>
              <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto rounded-md border p-2">
                {(TMK.duties || []).length === 0 ? <span className="text-xs text-muted-foreground p-1">ยังไม่มีบทบาท (เพิ่มที่ ตั้งค่า → หน้าที่)</span>
                  : (TMK.duties || []).map((d, i) => (
                    <CheckRow key={'duty-' + d.name + i} checked={members.includes(d.name)} onToggle={() => toggle(members, setMembers, d.name)}>
                      <span className="size-2.5 rounded-full" style={{ background: d.color }} />{d.name} <span className="text-[10px] text-muted-foreground">(บทบาท)</span>
                    </CheckRow>
                  ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Icon name="user" className="size-3.5" /> รายคน</div>
              <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto rounded-md border p-2">
                {(TMK.staff || []).length === 0 ? <span className="text-xs text-muted-foreground p-1">ยังไม่มีรายชื่อทีม</span>
                  : (TMK.staff || []).map((s, i) => (
                    <CheckRow key={'staff-' + s.name + i} checked={members.includes(s.name)} onToggle={() => toggle(members, setMembers, s.name)}>
                      <Avatar name={s.name} color={s.color} size={22} />{s.name}
                    </CheckRow>
                  ))}
              </div>
            </div>
          </TabsContent>

          {/* การมองเห็น */}
          {!isGeneral && (
            <TabsContent value="access" className="m-0 flex flex-col gap-2">
              <Label>การมองเห็น</Label>
              <ToggleGroup type="single" value={visibility} onValueChange={(v) => v && setVisibility(v)} className="justify-start gap-1">
                <ToggleGroupItem value="shared" size="sm" className="gap-1.5 data-[state=on]:bg-muted"><Icon name="users" className="size-3.5" /> ทุกคนเห็น</ToggleGroupItem>
                <ToggleGroupItem value="private" size="sm" className="gap-1.5 data-[state=on]:bg-muted"><Icon name="shield" className="size-3.5" /> ส่วนตัว (เฉพาะฉัน)</ToggleGroupItem>
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">ส่วนตัว = เห็นเฉพาะผู้สร้าง ({flow.owner || me || '—'})</p>
            </TabsContent>
          )}

          {/* ประวัติกิจกรรมของโครงการนี้ */}
          <TabsContent value="history" className="m-0">
            <FlowHistoryView flow={flow} compact />
          </TabsContent>

          {/* โซนอันตราย / รีเซ็ต */}
          <TabsContent value="danger" className="m-0 flex flex-col gap-3">
            <div className="rounded-lg border border-destructive/30 p-4 flex flex-col gap-3">
              {!isGeneral && (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div><div className="font-medium text-sm">เก็บเข้าคลัง (archive)</div><div className="text-xs text-muted-foreground">ซ่อนจากรายการ · กู้คืนได้ · งานไม่หาย</div></div>
                  <Button type="button" variant="outline" size="sm" onClick={archiveFlow} disabled={busy}><Icon name="box" className="size-4 mr-1" /> เก็บเข้าคลัง</Button>
                </div>
              )}
              <div className={`flex items-center justify-between gap-3 flex-wrap ${isGeneral ? '' : 'border-t pt-3'}`}>
                <div>
                  <div className="font-medium text-sm text-destructive">{isGeneral ? 'รีเซ็ตงานทั่วไป' : 'ลบโครงการ'}</div>
                  <div className="text-xs text-muted-foreground">{isGeneral ? 'ตั้งค่ากลับค่าเริ่มต้น · งานที่ยังไม่จัดเข้าโครงการยังอยู่ครบ' : 'งานในโครงการจะย้ายกลับ "งานทั่วไป" · กู้คืนได้'}</div>
                </div>
                <Button type="button" variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={deleteFlow} disabled={busy}><Icon name="trash" className="size-4 mr-1" /> {isGeneral ? 'รีเซ็ต' : 'ลบโครงการ'}</Button>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* แถบบันทึก (sticky) */}
      <div className="sticky bottom-0 -mx-1 mt-2 flex items-center justify-end gap-2 border-t bg-background/95 backdrop-blur px-1 py-3">
        <Button variant="outline" onClick={() => onAfter?.(active_view_fallback(flow))} disabled={busy}>กลับบอร์ด</Button>
        <Button onClick={save} disabled={!name.trim() || busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}</Button>
      </div>
    </div>
  );
}
const active_view_fallback = (flow) => (flow.defaultView && flow.defaultView !== 'settings' ? flow.defaultView : 'kanban');

/* ============================================================
   ShareFlowDialog — แชร์ลิงก์โครงการ (อ่านอย่างเดียว) แบบ Dialog สวย + QR
   - เปิดจากปุ่ม "แชร์" ในแถบหัวบอร์ด (ไม่ฝังในตั้งค่าแล้ว)
   - สวิตช์เปิด/ปิด + คัดลอกลิงก์ + QR + เปิดดูตัวอย่าง + รีเซ็ตลิงก์ · graceful
   ============================================================ */
function ShareFlowDialog({ flow, open, onOpenChange }) {
  const { reload, refresh } = useData() || {};
  const [enabled, setEnabled] = useState(!!flow?.shareEnabled);
  const [token, setToken] = useState(flow?.shareToken || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setEnabled(!!flow?.shareEnabled); setToken(flow?.shareToken || ''); }, [flow?.id, flow?.shareEnabled, flow?.shareToken]);
  const link = token ? `${window.location.origin}/?share=${token}` : '';
  const apply = async (on, rotate) => {
    if (!guardEdit() || !flow?.id || flow.isGeneral) return;
    setBusy(true);
    try {
      let tok = token;
      if (rotate || (on && !tok)) tok = 'shr_' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
      const { error } = await supabase.from('tmk_flows').update({ share_token: tok, share_enabled: on }).eq('id', flow.id);
      if (error) { if (/share_token|share_enabled|column/i.test(error.message || '')) throw new Error('ยังไม่ได้รัน migration — รัน 20260720-flow-cover-share.sql ก่อน'); throw error; }
      setToken(tok); setEnabled(on);
      logAudit({ action: 'update', entityType: 'flow', entityName: flow.name, summary: `${on ? 'เปิด' : 'ปิด'}แชร์ลิงก์โครงการ "${flow.name}"${rotate ? ' (รีเซ็ตลิงก์)' : ''}`, flowId: flow.scopeId ?? flow.id });
      if (refresh) await refresh(['tmk_flows']); else if (reload) await reload();
      window.__toast?.(on ? (rotate ? 'รีเซ็ตลิงก์แชร์แล้ว' : 'เปิดแชร์ลิงก์แล้ว') : 'ปิดแชร์ลิงก์แล้ว', 'success');
    } catch (err) { window.__toast?.(err.message, 'error'); } finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); window.__toast?.('คัดลอกลิงก์แล้ว', 'success'); } catch { window.__toast?.('คัดลอกไม่สำเร็จ', 'error'); } };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Icon name="layers" className="size-5 text-primary" /> แชร์โครงการ "{flow?.name}"</DialogTitle>
          <DialogDescription>ให้คนนอกเปิดลิงก์ดูบอร์ดแบบอ่านอย่างเดียว (ไม่ต้องล็อกอิน · แก้ไขไม่ได้)</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex flex-col">
            <span className="font-medium text-sm">{enabled ? 'เปิดแชร์อยู่' : 'ปิดแชร์อยู่'}</span>
            <span className="text-xs text-muted-foreground">{enabled ? 'ใครมีลิงก์ก็เปิดดูได้' : 'เปิดเพื่อสร้างลิงก์'}</span>
          </div>
          <Switch checked={enabled} disabled={busy} onCheckedChange={(v) => apply(v, false)} />
        </div>
        {enabled && link && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Input readOnly value={link} onFocus={e => e.target.select()} className="font-mono text-xs" />
              <Button type="button" onClick={copy} className="shrink-0"><Icon name="external" className="size-4 mr-1" /> คัดลอก</Button>
            </div>
            <div className="flex justify-center py-1">
              <div className="rounded-xl border bg-white p-3"><QRCodeSVG value={link} size={168} level="M" includeMargin={false} /></div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <a href={link} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1"><Icon name="eye" className="size-3.5" /> เปิดดูตัวอย่าง</a>
              <button type="button" className="text-muted-foreground hover:text-foreground underline" disabled={busy} onClick={() => apply(true, true)}>รีเซ็ตลิงก์ (ลิงก์เดิมใช้ไม่ได้)</button>
            </div>
          </div>
        )}
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground flex gap-2">
          <Icon name="shield" className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <span>ใครก็ตามที่มีลิงก์นี้จะดูข้อมูลในโครงการได้ (งาน/ผู้รับผิดชอบ/แคมเปญ) — แชร์เฉพาะคนที่ไว้ใจ · ปิดสวิตช์เพื่อตัดสิทธิ์ทันที</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   PublicFlowShare — หน้าแชร์โครงการอ่านอย่างเดียว (คนนอก · ไม่ต้องล็อกอิน)
   - เปิดผ่าน ?share=<token> (App.jsx ก่อน auth gate)
   - โหลดเอง (supabase anon) flow by share_token+share_enabled → ใส่ลง TMK → render <PlannerView readOnly>
   - window.__canEdit=false → ลาก/แก้/+งาน ไม่ได้ (มี guard อยู่แล้ว) + readOnly ซ่อนปุ่ม/ปิดคลิก
   ============================================================ */
export function PublicFlowShare({ token }) {
  const [state, setState] = useState('loading'); // loading | ready | notfound
  const [flow, setFlow] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [view, setView] = useState('kanban');

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data: f, error } = await supabase.from('tmk_flows').select('*')
          .eq('share_token', token).eq('share_enabled', true).is('deleted_at', null).maybeSingle();
        if (cancel) return;
        if (error || !f) { setState('notfound'); return; }
        const [tRes, cRes, sRes, dRes, chRes] = await Promise.all([
          supabase.from('tmk_tasks').select('*').eq('flow_id', f.id).is('deleted_at', null),
          supabase.from('tmk_campaigns').select('id,name,color').is('deleted_at', null),
          supabase.from('tmk_staff').select('name,color,email').is('deleted_at', null),
          supabase.from('tmk_duties').select('name,color').is('deleted_at', null),
          supabase.from('tmk_channels').select('id,name,color,logo_url').is('deleted_at', null),
        ]);
        if (cancel) return;
        // ใส่ข้อมูลประกอบลง TMK (ไม่มี DataProvider — public อ่านอย่างเดียว)
        TMK.campaigns = (cRes.data || []).map(c => ({ id: c.id, name: c.name, color: c.color }));
        TMK.staff = (sRes.data || []).map(s => ({ name: s.name, color: s.color || 'var(--ink-3)', email: s.email || '' }));
        TMK.duties = (dRes.data || []).map(d => ({ name: d.name, color: d.color || 'var(--ink-3)' }));
        TMK.channels = (chRes.data || []).map(ch => ({ id: ch.id, name: ch.name, hex: ch.color, logoUrl: ch.logo_url || '', color: `var(--ch-${(ch.id || '').toLowerCase()})` }));
        if (!TMK.kanbanMeta || !TMK.kanbanMeta.length) TMK.kanbanMeta = [{ id: 'todo', label: 'รอดำเนินการ' }, { id: 'inprogress', label: 'กำลังทำ' }, { id: 'review', label: 'รอตรวจ' }, { id: 'done', label: 'เสร็จแล้ว' }];
        const fl = {
          id: f.id, scopeId: f.id, name: f.name, color: f.color || '#6b5ce0', icon: f.icon || '',
          description: f.description || '', coverUrl: f.cover_url || '',
          statuses: Array.isArray(f.statuses) ? f.statuses : [],
          campaignIds: Array.isArray(f.campaign_ids) ? f.campaign_ids : [],
        };
        TMK.flows = [fl];
        const mapped = (tRes.data || []).map(t => ({
          id: t.id, title: t.title, detail: t.detail || '',
          date: thaiDate(t.date), dateISO: t.date || '',
          responsible: String(t.responsible || '').split(',').map(s => s.trim()).filter(Boolean),
          camp: t.camp || '', flow: t.flow_id || '', status: t.status || 'todo',
          channel: t.channel || '', priority: t.priority || 'medium', dateEnd: t.date_end || '',
          tags: Array.isArray(t.tags) ? t.tags : [],
        }));
        TMK.tasks = mapped;
        if (typeof window !== 'undefined') window.__canEdit = false;
        setFlow(fl); setTasks(mapped);
        setView(f.default_view && f.default_view !== 'settings' ? f.default_view : 'kanban');
        setState('ready');
      } catch { if (!cancel) setState('notfound'); }
    })();
    return () => { cancel = true; };
  }, [token]);

  if (state === 'loading') return (
    <div className="min-h-screen grid place-items-center text-muted-foreground">
      <div className="flex flex-col items-center gap-3"><Icon name="loader" className="size-7 animate-spin opacity-50" /><span className="text-sm">กำลังโหลด…</span></div>
    </div>
  );
  if (state === 'notfound') return (
    <div className="min-h-screen grid place-items-center text-center p-6">
      <div className="flex flex-col items-center gap-3 max-w-sm">
        <Icon name="shield" className="size-10 opacity-30" />
        <h1 className="text-lg font-bold">ลิงก์ไม่พร้อมใช้งาน</h1>
        <p className="text-sm text-muted-foreground">ลิงก์แชร์นี้อาจถูกปิดหรือไม่ถูกต้อง — ติดต่อเจ้าของโครงการเพื่อขอลิงก์ใหม่</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur px-4 sm:px-6 h-14 flex items-center gap-3">
        <FlowIcon icon={flow.icon} className="size-6 shrink-0" style={{ color: flow.color }} />
        <div className="min-w-0">
          <div className="font-bold truncate leading-tight" style={{ color: flow.color }}>{flow.name}</div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Icon name="eye" className="size-3" /> อ่านอย่างเดียว · แชร์สาธารณะ</div>
        </div>
        <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v)} className="ml-auto gap-0.5 rounded-md border bg-muted/30 p-0.5 overflow-x-auto shrink-0">
          {VIEWS.map(([v, ic, l]) => (
            <ToggleGroupItem key={v} value={v} size="sm" className="gap-1.5 px-2.5 shrink-0 data-[state=on]:bg-background data-[state=on]:shadow-sm" title={l}><Icon name={ic} className="size-3.5" /><span className="hidden lg:inline">{l}</span></ToggleGroupItem>
          ))}
        </ToggleGroup>
      </header>
      <main className="flex-1 p-4 sm:p-6 overflow-auto">
        <PlannerView sub={view} tasks={tasks} setTasks={setTasks} flow={flow} readOnly />
      </main>
      <footer className="text-center text-[11px] text-muted-foreground py-3 border-t">TMK Operation</footer>
    </div>
  );
}

/* ============================================================
   งานของฉัน (My Tasks) — งานที่มอบหมายให้ฉัน จากทุกโครงการ
   - จับคู่ตัวตน: window.__userEmail → ชื่อ/บทบาทใน TMK.roles + TMK.staff
   - งานของฉัน = responsible มีชื่อ/บทบาทของฉัน · แยก "ค้างอยู่/เสร็จแล้ว"
   - ใช้ <TaskCard showFlow> เดียวกับ Kanban (component ซ้ำ)
   ============================================================ */
function MyTasksView() {
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
  }, [me]);
  const mine = useMemo(() => (TMK.tasks || []).filter(t => (t.responsible || []).some(r => myNames.has(r))), [myNames]);
  const isDone = (t) => {
    const fl = t.flow ? (TMK.flows || []).find(x => x.id === t.flow) : null;
    const sts = (fl?.statuses && fl.statuses.length) ? fl.statuses : null;
    return sts ? sts.filter(s => s.done).some(s => s.id === t.status) : t.status === 'done';
  };
  const open = mine.filter(t => !isDone(t));
  const done = mine.filter(t => isDone(t));
  const openTask = (t) => window.__openModal?.('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] });

  const Section = ({ title, items, tone }) => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: tone }} /><h3 className="font-semibold text-sm">{title}</h3><Badge variant="secondary">{items.length}</Badge></div>
      {items.length === 0
        ? <div className="text-xs text-muted-foreground border-2 border-dashed rounded-lg py-6 text-center">— ไม่มี —</div>
        : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">{items.map(t => <TaskCard key={t.id} task={t} showFlow onClick={() => openTask(t)} />)}</div>}
    </div>
  );

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full">
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2"><Icon name="user" className="size-5" /> งานของฉัน</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{myNames.size ? `งานที่มอบหมายให้ ${[...myNames].join(' · ')} — รวมจากทุกโครงการ` : 'ยังจับคู่บัญชีกับสมาชิกทีมไม่ได้'}</p>
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
          <Section title="ค้างอยู่" items={open} tone="var(--warn)" />
          <Section title="เสร็จแล้ว" items={done} tone="var(--good)" />
        </>
      )}
    </div>
  );
}

/* ============================================================
   ประวัติกิจกรรมต่อโครงการ (per-flow activity history)
   - วิวที่ 6 ในบอร์ด + แท็บใน FlowSettingsPage (compact)
   - กรองจาก tmk_audit_logs ด้วย flow_id = scopeKey (general='' · real=id)
   - graceful: คอลัมน์ flow_id ยังไม่ migrate → fallback ilike บน details ("flowId":"…")
   ============================================================ */
const AUDIT_ACTION_META = {
  create: { l: 'สร้าง', c: '#16a34a' }, update: { l: 'แก้ไข', c: '#2563eb' },
  delete: { l: 'ลบ', c: '#dc2626' }, purge: { l: 'ลบถาวร', c: '#dc2626' },
  restore: { l: 'กู้คืน', c: '#16a34a' }, move: { l: 'ย้าย', c: '#7c3aed' }, export: { l: 'ส่งออก', c: '#0891b2' },
};
const AUDIT_ENTITY_TH = { task: 'งาน', flow: 'โครงการ', campaign: 'แคมเปญ', brand: 'แบรนด์', comment: 'คอมเมนต์' };

function FlowHistoryView({ flow, compact = false }) {
  const PAGE = compact ? 20 : 40;
  const scopeKey = flow?.scopeId ?? flow?.id ?? '';
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setPage(0); }, [scopeKey]);

  useEffect(() => {
    let cancel = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag ก่อน async fetch
    setLoading(true);
    (async () => {
      const sel = () => supabase.from('tmk_audit_logs').select('*', { count: 'exact' })
        .order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
      let { data, count, error } = await sel().eq('flow_id', scopeKey);
      // graceful: ยังไม่ได้รัน 20260718-audit-flow.sql (คอลัมน์ flow_id หาย) → กรองจาก details JSON
      if (error && /flow_id|column|42703|does not exist/i.test(error.message || error.code || '')) {
        ({ data, count, error } = await sel().ilike('details', `%"flowId":"${scopeKey}"%`));
      }
      if (cancel) return;
      if (error) { setRows([]); setTotal(0); } else { setRows(data || []); setTotal(count || 0); }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [scopeKey, page, PAGE]);

  const mapped = rows.map(r => {
    let d = {};
    try { d = typeof r.details === 'string' ? JSON.parse(r.details) : (r.details || {}); } catch { /* ignore */ }
    return {
      action: r.action || '', entity: d.entityType || '', user: r.user_email || 'system',
      name: d.entityName || '', summary: d.summary || r.action || '',
      changes: Array.isArray(d.changes) ? d.changes : null,
      fields: Array.isArray(d.fields) ? d.fields : null,
      time: new Date(r.created_at).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }),
    };
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE));

  const Body = (
    <div className="flex flex-col divide-y divide-border/50">
      {loading && (
        <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
          <Icon name="loader" className="size-6 animate-spin opacity-50" /><p className="text-sm">กำลังโหลด…</p>
        </div>
      )}
      {!loading && mapped.length === 0 && (
        <div className="py-16 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed m-4 rounded-lg bg-muted/10">
          <Icon name="clock" className="size-8 opacity-20 mb-3" />
          <p className="text-sm">ยังไม่มีประวัติของโครงการนี้</p>
          <p className="text-xs opacity-70 mt-1">สร้าง/แก้ไข/ย้าย/ลบงานในโครงการนี้ จะถูกบันทึกไว้ที่นี่</p>
        </div>
      )}
      {!loading && mapped.map((a, i) => {
        const s = (TMK.staff || []).find(x => x.name === a.user || x.email === a.user) || { color: '#888' };
        const m = AUDIT_ACTION_META[a.action] || { l: a.action, c: '#64748b' };
        return (
          <div key={i} className="flex gap-3 p-3.5 hover:bg-muted/20 transition-colors">
            <div className="shrink-0 mt-0.5"><Avatar name={a.user} color={s.color} size={32} /></div>
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-foreground text-sm">{(a.user || '').split('@')[0]}</span>
                <span className="text-muted-foreground text-xs font-medium">· {AUDIT_ENTITY_TH[a.entity] || a.entity}</span>
              </div>
              <div className="text-sm text-foreground/90">{a.summary}</div>
              {a.changes && a.changes.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {a.changes.map((c, j) => (
                    <Badge key={j} variant="secondary" className="text-xs font-normal bg-muted/50">
                      <span className="opacity-70 mr-1">{c.label}:</span>
                      <span className="line-through opacity-50 mr-1">{c.from}</span>
                      <span className="text-muted-foreground text-[10px] mx-0.5">→</span>
                      <span className="text-primary font-semibold ml-1">{c.to}</span>
                    </Badge>
                  ))}
                </div>
              )}
              {a.fields && a.fields.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {a.fields.map((fld, j) => (
                    <Badge key={j} variant="secondary" className="text-xs font-normal bg-muted/50">
                      <span className="opacity-70 mr-1">{fld.label}:</span>
                      <span className="font-semibold text-foreground/90">{fld.value}</span>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <Badge variant="outline" className="font-medium shrink-0" style={{ background: m.c + '15', color: m.c, borderColor: m.c + '30' }}>{m.l}</Badge>
              <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{a.time}</span>
            </div>
          </div>
        );
      })}
    </div>
  );

  const Pager = total > PAGE && (
    <div className="flex items-center justify-center gap-4 p-3 border-t border-border/50 bg-muted/10">
      <Button variant="outline" size="sm" disabled={page <= 0 || loading} onClick={() => setPage(p => Math.max(0, p - 1))}><Icon name="chevL" className="size-4 mr-1" /> ก่อนหน้า</Button>
      <span className="text-sm text-muted-foreground font-medium tabular-nums">หน้า {page + 1} <span className="opacity-50">/</span> {totalPages}</span>
      <Button variant="outline" size="sm" disabled={page >= totalPages - 1 || loading} onClick={() => setPage(p => p + 1)}>ถัดไป <Icon name="chevR" className="size-4 ml-1" /></Button>
    </div>
  );

  // compact = แท็บในตั้งค่า (ไม่มี Card chrome ใหญ่)
  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon name="clock" className="size-4" /> ประวัติกิจกรรมของโครงการนี้ <span className="font-semibold tabular-nums">({total})</span>
        </div>
        <div className="rounded-lg border overflow-hidden">{Body}{Pager}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-4xl w-full mx-auto">
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/50 bg-muted/20">
            <div className="flex items-center gap-2 font-semibold">
              <Icon name="clock" className="size-5 text-primary" /> ประวัติกิจกรรม
              <span className="text-sm text-muted-foreground font-normal">({total})</span>
            </div>
            <span className="text-xs text-muted-foreground">เฉพาะโครงการ "{flow?.name}"</span>
          </div>
          {Body}{Pager}
        </CardContent>
      </Card>
    </div>
  );
}
