/* ============================================================
   plannerKanban.jsx — วิว "Kanban" ของหน้าวางแผน (แยกจาก views-planner.jsx)
   - KanbanBoard ยกมาทั้งดุ้น ไม่แก้เนื้อใน · รับ tasks/setTasks/filtered/fProps/flow/readOnly เป็น props เหมือนเดิม
   ============================================================ */
import React from 'react';
import { Icon } from './components.jsx';
import { supabase } from './lib/supabaseClient.js';
import { versionedUpdate, promptConflictResolution } from './lib/optimisticUpdate.js';
import { logAudit } from './lib/audit.js';
import { TaskCard } from './taskCard.jsx';
import { Badge } from '@/components/ui/badge';
import { toast, openModal, refresh, canEdit } from './lib/appBus.js';
import { flowColumns } from './plannerColumns.js';
import { PlannerFilters } from './plannerFilters.jsx';

/* ---- Kanban with drag & drop ---- */
export function KanbanBoard({ tasks, setTasks, filtered, fProps, flow, readOnly }) {
  const [over, setOver] = React.useState(null);
  const dragId = React.useRef(null);
  const columns = flowColumns(flow);
  const newTaskBase = flow ? { flow_id: (flow.scopeId ?? flow.id) } : {};
  // ย้ายสถานะงาน — ใช้ทั้ง drag (desktop) และ select (มือถือ ที่ลากไม่ได้)
  const moveTask = async (id, status) => {
    if (!id) return;
    if (!canEdit()) { toast('สิทธิ์ "ดูอย่างเดียว" — ย้ายงานไม่ได้', 'warn'); return; }
    const prev = tasks.find(t => t.id === id)?.status;
    if (prev === status) return;
    const task = tasks.find(t => t.id === id);
    setTasks(ts => ts.map(t => t.id === id ? { ...t, status } : t));
    try {
      // Phase 3.1 (OCC §9): guard ด้วย rowVersion — คนอื่นย้ายก่อน = conflict → ให้ user เลือก
      let r = await versionedUpdate(supabase, 'tmk_tasks', id, { status }, task?.rowVersion);
      if (r.conflict) {
        // Phase 3.4 (§9.1): 'reload' → rollback optimistic + refresh · 'overwrite' → ทับ (UI แสดง status ใหม่อยู่แล้ว)
        const choice = await promptConflictResolution({ entity: 'งาน', changedFields: ['status'] });
        if (choice !== 'overwrite') { setTasks(ts => ts.map(t => t.id === id ? { ...t, status: prev } : t)); refresh(['tmk_tasks']); return; }
        r = await versionedUpdate(supabase, 'tmk_tasks', id, { status });
      }
      if (!r.ok) throw r.error || new Error('ย้ายไม่สำเร็จ');
      const stCol = columns.find(k => k.id === status) || {};
      const stLabel = stCol.label || status;
      logAudit({ action: 'move', entityType: 'task', entityName: task?.title || id, summary: `ย้ายงาน "${task?.title || ''}" → ${stLabel}`, flowId: task?.flow ?? '' });
      refresh(['tmk_tasks']); // sync TMK.tasks (notif/profile/export) ไม่ต้องรอ realtime
    } catch (err) {
      setTasks(ts => ts.map(t => t.id === id ? { ...t, status: prev } : t));
      toast('ย้ายไม่สำเร็จ: ' + err.message, 'error');
    }
  };
  // ลากจัดลำดับในคอลัมน์ + ย้ายข้ามคอลัมน์ (E3) — reindex sort_order · graceful ถ้าคอลัมน์ sort_order ยังไม่ migrate
  const reorder = async (id, targetId, status) => {
    setOver(null);
    if (!id || id === targetId) return;
    if (!canEdit()) { toast('สิทธิ์ "ดูอย่างเดียว" — ย้ายงานไม่ได้', 'warn'); return; }
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
      refresh(['tmk_tasks']);
    } catch (err) { refresh(['tmk_tasks']); toast('จัดลำดับไม่สำเร็จ: ' + (err?.message || ''), 'error'); }
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
                      onClick={() => openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] })}
                      onDragStart={() => { dragId.current = t.id; }}
                      onDragEnd={() => { dragId.current = null; setOver(null); }}
                      statusColumns={columns} onStatusChange={moveTask} />
                  </div>
                ))}
                {list.length === 0 && <div className="cap" style={{ textAlign: 'center', padding: '16px 0', opacity: 0.6 }}>{readOnly ? 'ไม่มีงาน' : 'ลากการ์ดมาที่นี่'}</div>}
                {!readOnly && <button onClick={() => openModal('task', { ...newTaskBase, status: col.id })} style={{
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
