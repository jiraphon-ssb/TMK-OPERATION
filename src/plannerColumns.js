/* ============================================================
   plannerColumns.js — คอลัมน์สถานะของโครงการ (แยกจาก views-planner.jsx)
   - flowColumns/doneIdsOf ใช้ร่วม 4 วิว (ปฏิทิน/คัมบัง/ไทม์ไลน์/รายการ) — ยกมาทั้งดุ้น ไม่แก้เนื้อใน
   ============================================================ */
import { DD } from './saleWidgets.jsx';

// คอลัมน์สถานะของโครงการ — ถ้าโครงการตั้ง statuses เอง ใช้ของโครงการ ไม่งั้นใช้ดีฟอลต์ kanbanMeta (ธง done = คอลัมน์ 'done')
export function flowColumns(flow) {
  if (flow && Array.isArray(flow.statuses) && flow.statuses.length) {
    return flow.statuses.map(s => ({ id: s.id, label: s.label, color: s.color || null, done: !!s.done }));
  }
  return (DD.kanbanMeta || []).map(k => ({ id: k.id, label: k.label, color: null, done: k.id === 'done' }));
}
export const doneIdsOf = (flow) => new Set(flowColumns(flow).filter(c => c.done).map(c => c.id));
