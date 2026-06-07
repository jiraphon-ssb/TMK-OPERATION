/* ============================================================
   TMK Operation — Default empty shape
   ============================================================
   ⚠️ ไม่มี mock data — ทุกข้อมูลโหลดจาก Supabase ผ่าน dataContext
   ไฟล์นี้ให้แค่ "shape" ของ TMK object ก่อนที่ Supabase จะ load เสร็จ
   เพื่อไม่ให้ destructure ที่ import-time พัง
   ============================================================ */

export const TMK = {
  consts: { TARGET: 0, DAY: 18, DAYS: 30, ACOS_CEIL: 25, AD_BUDGET: 0, current_month: 6, current_year: 2569 },
  channels: [],
  dailyMonth: [],
  month3: [],
  yoy: [],
  monthly: [],
  products: [],
  colorMix: [],
  sizeMix: [],
  campaigns: [],
  staff: [],
  tasks: [],
  kanbanMeta: [
    { id: 'todo',       label: 'รอดำเนินการ',   en: 'To-Do' },
    { id: 'inprogress', label: 'กำลังทำ',       en: 'In Progress' },
    { id: 'review',     label: 'รอตรวจ',        en: 'Review' },
    { id: 'done',       label: 'เสร็จแล้ว',     en: 'Done' },
  ],
  poTracker: [],
  adCampaigns: [],
  segments: [],
  fb: { revenue: 0, spend: 0, inquiries: 0, orders: 0, newCust: 0, oldCust: 0, roas: 0, acos: 0, conv: 0, aov: 0, cpInq: 0, cpOrd: 0, cac: 0, avgReplyMinutes: 0 },
  fbMsgTrend: [],
  dailyLog: [],
  audit: [],
  roles: [],
  promoChannels: ['หลังบ้าน', 'Line Broadcast', 'FB Post', 'TikTok Shop', 'ทุกแพลตฟอร์ม'],
  duties: [],
  computed: { MTD: 0, ORD: 0, AD: 0, NEW_REV: 0, OLD_REV: 0, NEW_C: 0, OLD_C: 0, PACE_TGT: 0, PACE_PCT: 0, RUN: 0, AOV: 0, ACOS_TOT: 0, CAC: 0, CLV: 0 },
};
