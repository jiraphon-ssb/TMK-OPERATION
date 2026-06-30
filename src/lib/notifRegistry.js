// ทะเบียนกลางของระบบแจ้งเตือน (PART 34) — แหล่งเดียวของ "ชนิด → ป้าย/ไอคอน/สี", เวลา, การนำทาง
// ใช้ร่วมกันทั้งกระดิ่ง (NotifBell) และศูนย์แจ้งเตือน (NotificationsCenter) — เลิกมี map ซ้ำ 3 ชุด
import { TMK } from '../data.js';

// ชนิดแจ้งเตือนแบบ "เหตุการณ์" (เก็บใน tmk_notifications) — Inbox
export const KIND = {
  mention:     { label: 'ถูกกล่าวถึง',   icon: 'chat',   color: 'var(--accent)' },
  reply:       { label: 'ตอบกลับ',        icon: 'reply',  color: 'var(--info)'   },
  comment:     { label: 'คอมเมนต์',       icon: 'chat',   color: 'var(--info)'   },
  assign:      { label: 'มอบหมายงาน',     icon: 'userPlus', color: 'var(--good)' },
  status:      { label: 'เปลี่ยนสถานะ',   icon: 'circle', color: 'var(--accent)' },
  flow_member: { label: 'สมาชิกโครงการ',  icon: 'users',  color: 'var(--accent)' },
  due:         { label: 'ใกล้ครบกำหนด',   icon: 'clock',  color: 'var(--warn)'   },
  overdue:     { label: 'เลยกำหนด',        icon: 'zap',    color: 'var(--bad)'    },
};
const FALLBACK = { label: 'แจ้งเตือน', icon: 'bell', color: 'var(--accent)' };

// ไอคอนของ "สัญญาณ" (ไม่ใช่เหตุการณ์ จึงไม่อยู่ใน KIND) — ให้แต่ละชนิดมีไอคอนต่างกัน
export const SIGNAL_ICON = {
  todaysales: 'pencil', sales: 'megaphone', orders: 'bag', po: 'box', stock: 'layers', lastmonth: 'calendarDays',
};

// severity → สี (ทับสีของ kind ถ้ามี) — แหล่งเดียว เลิกประกาศซ้ำ
export const SEVERITY_COLOR = { urgent: 'var(--bad)', warn: 'var(--warn)', success: 'var(--good)', info: null };

// meta สำหรับเรนเดอร์ 1 แถว (รองรับทั้ง notif จาก DB และ signal จาก client)
export function kindMeta(n) {
  const base = KIND[n?.kind] || FALLBACK;
  const sev = SEVERITY_COLOR[n?.severity];
  return { label: base.label, icon: n?.icon || base.icon, color: n?.color || sev || base.color };
}

export function timeAgo(iso) {
  if (!iso) return '';
  const sec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (sec < 60) return 'เมื่อสักครู่';
  if (sec < 3600) return Math.floor(sec / 60) + ' นาทีที่แล้ว';
  if (sec < 86400) return Math.floor(sec / 3600) + ' ชม.ที่แล้ว';
  if (sec < 604800) return Math.floor(sec / 86400) + ' วันที่แล้ว';
  return String(iso).slice(0, 10);
}

export function dateBucket(iso) {
  if (!iso) return 'ก่อนหน้า';
  const d = new Date(iso), now = new Date();
  const day = (x) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (day(d) === day(now)) return 'วันนี้';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (day(d) === day(y)) return 'เมื่อวาน';
  return 'ก่อนหน้า';
}
export const BUCKET_ORDER = ['วันนี้', 'เมื่อวาน', 'ก่อนหน้า'];

// อีเมล → ชื่อแสดงผล (staff) · ตัด @domain ถ้าไม่เจอ
export function displayName(email) {
  if (!email) return '';
  return (TMK.staff || []).find(s => s.email === email)?.name || String(email).replace(/@.*/, '');
}

// นำทางจาก notif (DB) — เปิดงาน/ไปโครงการ ผ่าน window globals (แหล่งเดียว เลิกมี handler ซ้ำ 3 ตัว)
export function navigateNotif(n) {
  if (!n) return;
  if (n.url && typeof window !== 'undefined') { /* เผื่อ event ที่ไม่ใช่ flow/task */ }
  if (n.task_id) {
    const tk = (TMK.tasks || []).find(x => x.id === n.task_id);
    if (tk) {
      window.__setFlow?.(tk.flow || '__general__');
      window.__goSection?.('flows', 'kanban');
      setTimeout(() => window.__openModal?.('task', { ...tk, channel: Array.isArray(tk.channel) ? tk.channel : [tk.channel] }), 80);
      return;
    }
  }
  if (n.flow_id != null) {
    window.__setFlow?.(n.flow_id || '__general__');
    window.__goSection?.('flows', 'kanban');
  }
}
