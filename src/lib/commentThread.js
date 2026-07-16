/* Phase 1 (realtime scale) — patch thread คอมเมนต์จาก realtime payload แทน reload ทั้ง thread
   pure reducer (testable) · thread เรียงเก่า→ใหม่ (append)
   INSERT → append (dedup by id · กัน echo ซ้ำกับ optimistic ที่ใช้ client-gen id เดียวกัน)
   UPDATE → patch by id (เช่น reactions/edit — merge field · เฉพาะที่มีใน list)
   DELETE → remove by old.id
   ทุกกรณีที่ไม่เปลี่ยน → คืน list เดิม (ref เดิม · กัน rerender เกิน) */
export function reduceCommentList(list, payload) {
  const type = payload?.eventType || payload?.type;
  const row = payload?.new, old = payload?.old;
  if (type === 'INSERT') {
    if (!row?.id || list.some(c => c.id === row.id)) return list;
    return [...list, row];
  }
  if (type === 'UPDATE') {
    if (!row?.id) return list;
    return list.some(c => c.id === row.id) ? list.map(c => (c.id === row.id ? { ...c, ...row } : c)) : list;
  }
  if (type === 'DELETE') {
    const id = old?.id;
    return id != null && list.some(c => c.id === id) ? list.filter(c => c.id !== id) : list;
  }
  return list;
}
