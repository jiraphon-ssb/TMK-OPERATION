/* ============================================================
   views-planner.jsx — จุดเข้าหน้าวางแผน (PlannerView) + Skeleton
   - state/ตัวกรอง/scope งาน คงไว้ที่นี่ทั้งหมด (แหล่งข้อมูลเดียว) แล้วส่งลงวิวเป็น props
   - วิวย่อยแยกไฟล์: plannerCalendar / plannerKanban / plannerTimeline / plannerList
   - แถบตัวกรอง = plannerFilters.jsx · คอลัมน์สถานะ = plannerColumns.js
   ============================================================ */
import { useState, useMemo } from 'react';
import { doneIdsOf } from './plannerColumns.js';
import { filterTasks } from './plannerFilters.jsx';
import { CalendarView } from './plannerCalendar.jsx';
import { KanbanBoard } from './plannerKanban.jsx';
import { TimelineView } from './plannerTimeline.jsx';
import { TaskListView } from './plannerList.jsx';


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
  // ข้อมูลอยู่ใน TMK singleton แล้ว = ไม่มีการโหลดจริง → render ทันที (เดิมมี skeleton หลอก 320-350ms)

  if (sub === 'kanban') return <KanbanBoard tasks={scoped} setTasks={setTasks} filtered={filtered} fProps={fProps} flow={flow} readOnly={readOnly} />;
  if (sub === 'timeline') return <TimelineView filtered={filtered} fProps={fProps} flow={flow} readOnly={readOnly} />;
  if (sub === 'list') return <TaskListView filtered={filtered} fProps={fProps} flow={flow} readOnly={readOnly} />;
  return <CalendarView tasks={scoped} filtered={filtered} fProps={fProps} flow={flow} readOnly={readOnly} />;
}

/* ====================  CATALOG  ==================== */
// ดึงทุกแถว — PostgREST จำกัด ~1000 แถว/request → ต้องวนดึงเป็นหน้าๆ (กันรายงานเห็นไม่ครบ)

