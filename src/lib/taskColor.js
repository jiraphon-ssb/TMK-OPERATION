/* ============================================================
   สีของงานตาม "แหล่งสี" ของโครงการ (bar_color_source)
   ============================================================
   ใช้ร่วมกันทั้งปฏิทิน (แถบช่วงวัน/ชิป/จุดมือถือ), Kanban, List
   ไล่ลำดับอัตโนมัติ: แหล่งที่เลือก → อีกแหล่ง → fallback (เทา)
   ============================================================ */
import { TMK } from '../data.js';

// แหล่งสีของโครงการ — flow ว่าง (ดูข้ามโครงการ/งานของฉัน) หรือยังไม่ migrate = 'campaign'
export const colorSourceOf = (flow) => (flow?.barColorSource === 'brand' ? 'brand' : 'campaign');

export function colorForTask(t, source = 'campaign', fallback = 'var(--ink-3)') {
  const camp = (TMK.campaigns || []).find(x => x.id === t.camp)?.color || '';
  const bid = (t.brandIds || [])[0];
  const brand = bid ? ((TMK.brands || []).find(b => b.id === bid)?.color || '') : '';
  return (source === 'brand' ? (brand || camp) : (camp || brand)) || fallback;
}
