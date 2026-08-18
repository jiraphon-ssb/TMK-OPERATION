/* ============================================================
   plannerTimeline.jsx — วิว "ไทม์ไลน์" ของหน้าวางแผน (แยกจาก views-planner.jsx)
   - TimelineView ยกมาทั้งดุ้น ไม่แก้เนื้อใน · รับ filtered/fProps/flow/readOnly เป็น props เหมือนเดิม
   ============================================================ */
import { Icon, Ring } from './components.jsx';
import { parseTaskDate, todayISO, thaiDate } from './lib/dateUtils.js';
import { TaskCard } from './taskCard.jsx';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DD, chipVar2 } from './saleWidgets.jsx';
import { openModal } from './lib/appBus.js';
import { doneIdsOf } from './plannerColumns.js';
import { PlannerFilters } from './plannerFilters.jsx';

/* ---- Smart Planner Timeline (vertical) ---- */
export function TimelineView({ filtered, fProps, flow, readOnly }) {
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
          {!readOnly && <Button size="sm" onClick={() => openModal('task', { ...newTaskBase })}><Icon name="plus" /> เพิ่มงาน</Button>}
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
                      onClick={() => openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] })} />
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
