/* ============================================================
   FLOWS — board วางแผนงานหลายอัน (multi-flow) · PART 15 + 16
   - section บนสุด · แต่ละโครงการ = บอร์ดของตัวเอง (ปฏิทิน/คัมบัง/ไทม์ไลน์/รายการ/ตั้งค่า)
   - reuse <PlannerView flow={...}> จาก views-planner.jsx (scope งานตาม flow.scopeId)
   - "งานทั่วไป" แก้ได้ (config row __general__ · scopeId='' กรองงาน flow ว่าง — งาน null ไม่หาย)
   - graceful: ตาราง tmk_flows ยังไม่ migrate → เหลือ "งานทั่วไป" อันเดียว
   - ส่วนที่แยกออกไป: flowsShared.js (ค่าคงที่/helper) · flowCard.jsx · flowSettingsPage.jsx
     · flowHistory.jsx · flowShareDialog.jsx · flowPublicShare.jsx
   ============================================================ */
import { useState, useMemo, useEffect } from 'react';
import { TMK } from './data.js';
import { Icon, Avatar, FlowIcon } from './components.jsx';
import { useData } from './dataContext.jsx';
import { supabase } from './lib/supabaseClient.js';
import { registerServices, toast, openModal, goSection, setFlow, userEmail } from './lib/appBus.js';
import { logAudit } from './lib/audit.js';
import { todayISO } from './lib/dateUtils.js';
import { SearchInput } from '@/components/ui/search-input';
import { PlannerView } from './views-planner.jsx';
import { TaskCard } from './taskCard.jsx';
import { MyTasksView } from './views-mytasks.jsx';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PALETTE, NEW_ICONS, GENERAL_ID, VIEWS, guardEdit, isMissing, doneSetOf, flowBrands, visibleFlows } from './flowsShared.js';
import { FlowCard } from './flowCard.jsx';
import { FlowSettingsPage } from './flowSettingsPage.jsx';
import { FlowHistoryView } from './flowHistory.jsx';
import { ShareFlowDialog } from './flowShareDialog.jsx';
import { EmptyState } from './components/EmptyState.jsx';

export { visibleFlows };   // คง public API เดิมของไฟล์นี้ (ย้ายตัวจริงไป flowsShared.js)

export function FlowsView({ sub, tasks, setTasks, activeFlow }) {
  const { reload, refresh } = useData() || {};
  const me = userEmail();
  const flows = visibleFlows();
  const realFlows = flows.filter(f => !f.isGeneral);

  // activeId มาจาก App (single source of truth · ไม่มี state ซ้อนใน FlowsView → ไม่ lag/กดซ้ำ)
  const activeId = activeFlow || GENERAL_ID;
  const [busy, setBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [query, setQuery] = useState(''); // ค้นหางานข้ามโครงการ (E4)
  const [drill, setDrill] = useState(''); // เจาะดูงานตาม KPI: '' | 'open' | 'soon' | 'overdue'
  const [flowSort, setFlowSort] = useState('default'); // จัดเรียงการ์ดโครงการ: default | progress | overdue | tasks

  const goView = (flowId, view) => { setFlow(flowId); goSection('flows', view || 'kanban'); };

  const createFlow = async () => {
    if (!guardEdit()) return;
    setBusy(true);
    try {
      // eslint-disable-next-line react-hooks/purity -- สุ่ม id ตอนกดปุ่มสร้าง (event handler ไม่ใช่ตอน render) · ต้องสุ่มจริงเพื่อไม่ให้ id ชนกัน
      const id = 'flow_' + Math.random().toString(36).slice(2, 9);
      const maxOrder = Math.max(0, ...realFlows.map(f => f.sortOrder || 0));
      const payload = { id, name: 'โครงการใหม่', color: PALETTE[realFlows.length % PALETTE.length], icon: NEW_ICONS[realFlows.length % NEW_ICONS.length], owner: me, default_view: 'kanban', sort_order: maxOrder + 1 };
      const { error } = await supabase.from('tmk_flows').insert(payload);
      if (error) { if (isMissing(error)) throw new Error('ยังไม่ได้รัน migration — รัน 20260710-flows-brands.sql ก่อน'); throw error; }
      logAudit({ action: 'create', entityType: 'flow', entityName: 'โครงการใหม่', summary: 'สร้างโครงการใหม่', flowId: id });
      if (refresh) await refresh(['tmk_flows']); else if (reload) await reload();
      setFlow(id);
      goSection('flows', 'settings'); // เด้งเข้าหน้าตั้งค่าทันที (ตั้งชื่อ/แบรนด์/สี)
      toast('สร้างโครงการแล้ว — ตั้งค่าต่อได้เลย', 'success');
    } catch (err) { toast('สร้างไม่สำเร็จ: ' + err.message, 'error'); } finally { setBusy(false); }
  };

  // เปิดให้ sidebar ปุ่ม "+ สร้างโครงการ" เรียกได้ (setFlow/activeFlow เป็นของ App แล้ว · guard โครงการหายอยู่ที่ App)
  useEffect(() => { registerServices({ createFlow }); });

  const active = flows.find(f => f.id === activeId) || flows[0];

  const tasksByFlow = useMemo(() => {
    const m = {};
    (TMK.tasks || []).forEach(t => { const k = t.flow || ''; (m[k] = m[k] || []).push(t); });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- TMK เป็น singleton module-level (compiler มองว่าไม่ reactive) แต่ TMK.tasks เปลี่ยนอ้างอิงทุกครั้งที่โหลดใหม่ → ต้องคง dep ไว้ ไม่งั้น group ค้างข้อมูลเก่า
  }, [TMK.tasks]);
  const tasksOf = (f) => tasksByFlow[f.scopeId ?? f.id ?? ''] || [];

  // ข้อมูลอยู่ใน TMK singleton แล้ว = ไม่มีการโหลดจริง → render ทันที (เดิมมี skeleton หลอก 320-350ms)

  // ===== หน้ารวมโครงการ (overview) — แดชบอร์ด + ค้นหาข้ามโครงการ (E4) =====
  if (sub === 'overview' || !sub) {
    const openTask = (t) => openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] });
    const doneOfTask = (t) => doneSetOf(flows.find(f => (f.scopeId ?? f.id ?? '') === (t.flow || '')) || {}).has(t.status);
    const dueOf = (t) => t.dateEnd || t.dateISO || '';
    const allTasks = TMK.tasks || [];
    const tdy = todayISO();
    const weekEnd = (() => { const d = new Date(tdy + 'T00:00:00'); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();
    // จัดกลุ่มงานรอบเดียว: เสร็จ / ค้าง / เลยกำหนด / ครบใน 7 วัน
    let kDone = 0;
    const openTasks = [], overdueTasks = [], soonTasks = [];
    allTasks.forEach(t => {
      if (doneOfTask(t)) { kDone++; return; }
      openTasks.push(t);
      const due = dueOf(t);
      if (due && due < tdy) overdueTasks.push(t);
      else if (due && due <= weekEnd) soonTasks.push(t);
    });
    const donePct = allTasks.length ? Math.round(kDone / allTasks.length * 100) : 0;
    const kpis = [
      { key: 'flows', label: 'โครงการ', value: realFlows.length, tone: 'var(--ink-2)' },
      { key: 'all', label: 'งานทั้งหมด', value: allTasks.length, tone: 'var(--ink-2)' },
      { key: 'done', label: 'เสร็จแล้ว', value: kDone, tone: 'var(--good, #1f8a5b)' },
      { key: 'open', label: 'ค้างอยู่', value: openTasks.length, tone: 'var(--info, #2563eb)', drill: 'open' },
      { key: 'soon', label: 'ครบใน 7 วัน', value: soonTasks.length, tone: '#c08a3e', drill: 'soon' },
      { key: 'overdue', label: 'เลยกำหนด', value: overdueTasks.length, tone: '#cf4d5c', drill: 'overdue' },
    ];
    // งานต่อคน (workload) — เฉพาะงานค้าง เรียงคนที่ถือเยอะสุด
    const workload = (() => {
      const m = {};
      openTasks.forEach(t => (t.responsible || []).forEach(r => {
        if (!r) return; const g = m[r] || (m[r] = { name: r, open: 0, overdue: 0 });
        g.open++; const due = dueOf(t); if (due && due < tdy) g.overdue++;
      }));
      return Object.values(m).sort((a, b) => b.open - a.open).slice(0, 8);
    })();
    // สถิติต่อโครงการ (สำหรับจัดเรียงการ์ด)
    const flowStat = (f) => {
      const ts = tasksOf(f), ds = doneSetOf(f);
      const done = ts.filter(t => ds.has(t.status)).length;
      const overdue = ts.filter(t => !ds.has(t.status) && dueOf(t) && dueOf(t) < tdy).length;
      return { total: ts.length, pct: ts.length ? done / ts.length : 0, overdue };
    };
    const sortedFlows = flowSort === 'default' ? flows : [...flows].sort((a, b) => {
      if (a.isGeneral !== b.isGeneral) return a.isGeneral ? -1 : 1; // งานทั่วไปนำเสมอ
      const sa = flowStat(a), sb = flowStat(b);
      if (flowSort === 'progress') return sb.pct - sa.pct;
      if (flowSort === 'overdue') return sb.overdue - sa.overdue;
      if (flowSort === 'tasks') return sb.total - sa.total;
      return 0;
    });
    const q = query.trim().toLowerCase();
    const results = q ? allTasks.filter(t =>
      (t.title || '').toLowerCase().includes(q) ||
      (t.detail || '').toLowerCase().includes(q) ||
      (t.tags || []).some(tg => String(tg).toLowerCase().includes(q)) ||
      (t.responsible || []).some(r => String(r).toLowerCase().includes(q))
    ) : [];
    const drillMeta = { open: { label: 'งานค้างทั้งหมด', tasks: openTasks }, soon: { label: 'ครบกำหนดใน 7 วัน', tasks: soonTasks }, overdue: { label: 'งานเลยกำหนด', tasks: overdueTasks } };
    const drillView = drill && drillMeta[drill] ? drillMeta[drill] : null;
    const drillTasks = drillView ? [...drillView.tasks].sort((a, b) => (dueOf(a) || '9999').localeCompare(dueOf(b) || '9999')) : [];
    const SORTS = [['default', 'เริ่มต้น'], ['progress', 'คืบหน้า'], ['overdue', 'เลยกำหนด'], ['tasks', 'งานเยอะ']];
    return (
      <div className="flex flex-col gap-6 w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">โครงการทั้งหมด</h2>
            <p className="text-sm text-muted-foreground mt-0.5">บอร์ดวางแผนงานแยกอิสระ — กดเข้าแต่ละโครงการเพื่อปรับแบรนด์/แคมเปญ/คอลัมน์/สมาชิกได้ละเอียด</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <SearchInput placeholder="ค้นหา" value={query} onChange={e => setQuery(e.target.value)} wrapperClassName="w-full sm:w-[230px]" />
            <Button onClick={createFlow} disabled={busy}><Icon name="plus" className="size-4 mr-2" /> สร้างโครงการ</Button>
          </div>
        </div>

        {/* แดชบอร์ดสรุป (ทุกโครงการ) — การ์ดที่ drill ได้ กดเจาะดูรายการงาน */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {kpis.map(k => {
              const active = drill && k.drill === drill;
              return (
                <button key={k.key} type="button" disabled={!k.drill}
                  onClick={() => k.drill && setDrill(drill === k.drill ? '' : k.drill)}
                  className={'rounded-xl border bg-card px-4 py-3 text-left transition-colors ' + (k.drill ? 'hover:bg-muted/40 cursor-pointer' : 'cursor-default') + (active ? ' ring-2 ring-offset-1' : '')}
                  style={active ? { '--tw-ring-color': k.tone } : undefined}>
                  <div className="text-2xl font-bold tabular-nums" style={{ color: k.tone }}>{k.value}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">{k.label}{k.drill && <Icon name="chevR" className="size-3 opacity-40" />}</div>
                </button>
              );
            })}
          </div>
          {/* แถบความคืบหน้ารวมทุกโครงการ */}
          {allTasks.length > 0 && (
            <div className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3">
              <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1.5"><Icon name="listChecks" className="size-3.5" />คืบหน้ารวม</span>
              <Progress value={donePct} className="h-2 flex-1" />
              <span className="text-sm font-semibold tabular-nums shrink-0">{donePct}%</span>
            </div>
          )}
        </div>

        {q ? (
          <div className="flex flex-col gap-3">
            <div className="text-sm text-muted-foreground">ผลการค้นหา “{query}” — {results.length} งาน</div>
            {results.length === 0
              ? <EmptyState size="inline" mode="filtered" title="ไม่พบงานที่ตรงกับคำค้น" />
              : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">{results.map(t => <TaskCard key={t.id} task={t} showFlow onClick={() => openTask(t)} />)}</div>}
          </div>
        ) : drillView ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-foreground">{drillView.label} — {drillTasks.length} งาน</div>
              <Button variant="ghost" size="sm" onClick={() => setDrill('')}><Icon name="x" className="size-3.5 mr-1" /> ปิด</Button>
            </div>
            {drillTasks.length === 0
              ? <div className="text-sm text-muted-foreground py-8 text-center">ไม่มีงานในกลุ่มนี้ 🎉</div>
              : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">{drillTasks.map(t => <TaskCard key={t.id} task={t} showFlow onClick={() => openTask(t)} />)}</div>}
          </div>
        ) : (
          <>
            {/* งานต่อคน (workload) */}
            {workload.length > 0 && (
              <div className="rounded-xl border bg-card p-4">
                <div className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5"><Icon name="users" className="size-4" />งานค้างต่อคน</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-2.5">
                  {workload.map(w => {
                    const s = (TMK.staff || []).find(x => x.name === w.name) || { color: '#888' };
                    const max = workload[0].open || 1;
                    return (
                      <div key={w.name} className="flex items-center gap-2.5 min-w-0">
                        <Avatar name={w.name} color={s.color} size={26} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium truncate">{w.name}</span>
                            <span className="text-xs tabular-nums shrink-0">{w.open}{w.overdue > 0 && <span className="text-[var(--bad,#cf4d5c)]"> · {w.overdue} เลย</span>}</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${w.open / max * 100}%`, background: w.overdue > 0 ? 'var(--bad, #cf4d5c)' : s.color }} /></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* จัดเรียงการ์ดโครงการ */}
            {realFlows.length > 1 && (
              <div className="flex items-center gap-2 -mb-2">
                <span className="text-xs text-muted-foreground">เรียงตาม</span>
                <ToggleGroup type="single" value={flowSort} onValueChange={(v) => v && setFlowSort(v)} className="gap-0.5 rounded-md border bg-muted/30 p-0.5">
                  {SORTS.map(([v, l]) => <ToggleGroupItem key={v} value={v} size="sm" className="px-2.5 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm">{l}</ToggleGroupItem>)}
                </ToggleGroup>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedFlows.map(f => (
                <FlowCard key={f.id} flow={f} tasks={tasksOf(f)}
                  onOpen={() => goView(f.id, f.defaultView)}
                  onSettings={() => goView(f.id, 'settings')} />
              ))}
            </div>
          </>
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
          <ToggleGroup type="single" value={sub} onValueChange={(v) => v && goSection('flows', v)} className="gap-0.5 rounded-md border bg-muted/30 p-0.5 overflow-x-auto">
            {VIEWS.map(([v, ic, l]) => (
              <ToggleGroupItem key={v} value={v} size="sm" className="gap-1.5 px-2.5 shrink-0 data-[state=on]:bg-background data-[state=on]:shadow-sm" title={l}><Icon name={ic} className="size-3.5" /><span className="hidden lg:inline">{l}</span></ToggleGroupItem>
            ))}
          </ToggleGroup>
          {!active.isGeneral && <Button variant={active.shareEnabled ? 'secondary' : 'ghost'} size="icon" className="size-8 shrink-0" title="แชร์ลิงก์โครงการ" onClick={() => setShareOpen(true)}><Icon name="layers" className="size-4" /></Button>}
          <Button variant={sub === 'history' ? 'secondary' : 'ghost'} size="icon" className="size-8 shrink-0" title="ประวัติกิจกรรม" onClick={() => goSection('flows', 'history')}><Icon name="clock" className="size-4" /></Button>
          <Button variant={sub === 'settings' ? 'secondary' : 'ghost'} size="icon" className="size-8 shrink-0" title="ตั้งค่าโครงการ" onClick={() => goSection('flows', 'settings')}><Icon name="system" className="size-4" /></Button>
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
