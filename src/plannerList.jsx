/* ============================================================
   plannerList.jsx — วิว "รายการ" ของหน้าวางแผน (แยกจาก views-planner.jsx)
   - TaskListView ยกมาทั้งดุ้น ไม่แก้เนื้อใน · รับ filtered/fProps/flow/readOnly เป็น props เหมือนเดิม
   ============================================================ */
import { useState } from 'react';
import { Icon, Avatar } from './components.jsx';
import { CardTable } from './components/DataTableParts.jsx';
import { supabase } from './lib/supabaseClient.js';
import { logAudit } from './lib/audit.js';
import { thaiDate } from './lib/dateUtils.js';
import { colorForTask, colorSourceOf } from './lib/taskColor.js';
import { PriorityTag } from './taskCard.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox as ShadcnCheckbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { DD } from './saleWidgets.jsx';
import { toast, confirm, openModal, refresh, canEdit } from './lib/appBus.js';
import { flowColumns } from './plannerColumns.js';
import { PlannerFilters } from './plannerFilters.jsx';

/* ---- ความสำคัญงาน (priority) — ป้าย/สี ใช้ร่วมทุกวิว ---- */

/* ---- List view (วิวที่ 5 · จัดกลุ่มตามสถานะ + ตาราง · เลือกหลายงาน+จัดกลุ่ม E2) ---- */
export function TaskListView({ filtered, fProps, flow, readOnly }) {
  const cols = flowColumns(flow);
  const newTaskBase = flow ? { flow_id: (flow.scopeId ?? flow.id) } : {};
  const [sel, setSel] = useState(() => new Set());
  const selArr = [...sel];
  const mayEdit = !readOnly && canEdit(); // bulk เลือก/ลบ ต้องมีสิทธิ์แก้ไข (ไม่ใช่แค่ไม่ใช่โหมดแชร์)
  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleGroup = (list) => setSel(s => { const n = new Set(s); const ids = list.map(t => t.id); const allOn = ids.every(id => n.has(id)); ids.forEach(id => allOn ? n.delete(id) : n.add(id)); return n; });
  const clearSel = () => setSel(new Set());
  const members = ((flow?.members?.length ? flow.members : (DD.staff || []).map(s => s.name)) || []).filter(Boolean);
  const bulkStatus = async (status) => {
    const ids = selArr; if (!ids.length || !canEdit()) return;
    const stCol = cols.find(k => k.id === status) || {};
    try { await Promise.all(ids.map(id => supabase.from('tmk_tasks').update({ status }).eq('id', id))); ids.forEach(id => { const t = filtered.find(x => x.id === id); logAudit({ action: 'move', entityType: 'task', entityName: t?.title || id, summary: `ย้ายงาน "${t?.title || ''}" → ${stCol.label || status}`, flowId: t?.flow ?? '' }); }); refresh(['tmk_tasks']); toast(`เปลี่ยนสถานะ ${ids.length} งาน`, 'success'); clearSel(); }
    catch (e) { toast('ไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
  };
  const bulkAssign = async (name) => {
    const ids = selArr; if (!ids.length || !canEdit()) return;
    try {
      await Promise.all(ids.map(id => { const t = filtered.find(x => x.id === id); const cur = t?.responsible || []; if (cur.includes(name)) return Promise.resolve(); return supabase.from('tmk_tasks').update({ responsible: [...cur, name].join(', ') }).eq('id', id); }));
      refresh(['tmk_tasks']); toast(`มอบหมาย "${name}" ให้ ${ids.length} งาน`, 'success'); clearSel();
    } catch { toast('ไม่สำเร็จ', 'error'); }
  };
  const bulkDelete = async () => {
    const ids = selArr; if (!ids.length || !canEdit()) return;
    if (!await confirm({ title: `ลบ ${ids.length} งาน`, body: 'ย้ายงานที่เลือกไปถังขยะ (กู้คืนได้)?', danger: true, confirmText: 'ลบ' })) return;
    try { await Promise.all(ids.map(id => supabase.from('tmk_tasks').update({ deleted_at: new Date().toISOString() }).eq('id', id))); refresh(['tmk_tasks']); toast(`ลบ ${ids.length} งานแล้ว`, 'success'); clearSel(); }
    catch { toast('ลบไม่สำเร็จ', 'error'); }
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
                      {mayEdit && <TableHead className="w-9"><ShadcnCheckbox checked={allOn} onCheckedChange={() => toggleGroup(list)} aria-label="เลือกทั้งหมด" /></TableHead>}
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
                        <TableRow key={t.id} data-state={sel.has(t.id) ? 'selected' : undefined} className={readOnly ? '' : 'cursor-pointer'} onClick={readOnly ? undefined : () => openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] })}>
                          {mayEdit && <TableCell onClick={e => e.stopPropagation()}><ShadcnCheckbox checked={sel.has(t.id)} onCheckedChange={() => toggle(t.id)} aria-label="เลือกงาน" /></TableCell>}
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
              {!readOnly && <button onClick={() => openModal('task', { ...newTaskBase, status: col.id })} className="w-full px-4 py-2 text-xs text-muted-foreground hover:bg-muted/30 flex items-center gap-1.5 border-t"><Icon name="plus" className="size-3.5" /> เพิ่มงานใน "{col.label}"</button>}
            </div>
          );
        })}
      </div>
      {/* แถบจัดการกลุ่ม — ลอยล่างจอเมื่อเลือก ≥1 งาน */}
      {sel.size > 0 && mayEdit && (
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
