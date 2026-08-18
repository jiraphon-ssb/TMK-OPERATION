/* ============================================================
   EmptyState.jsx — สถานะ "ไม่มีอะไรให้แสดง" แบบเดียวกันทั้งแอป
   ============================================================
   ปัญหาเดิม: ข้อความว่างเขียนมือกระจายหลายสิบจุด ด้วยถ้อยคำและหน้าตาต่างกัน
   ("ยังไม่มี…" / "ไม่มีข้อมูล" / "ไม่พบ…") บางที่กรอบประ บางที่ข้อความเปล่า
   → ผู้ใช้แยกไม่ออกว่า "ยังไม่มีข้อมูลจริง" / "ตัวกรองไม่ตรง" / "โหลดพลาด"
     ซึ่งเป็นคนละเรื่องและต้องทำคนละอย่าง = งงและไม่มั่นใจว่าระบบเสียหรือเปล่า

   แยกให้ชัดด้วย mode (คุมไอคอน/โทน/ค่าเริ่มต้นของข้อความ):
     • empty    — ยังไม่มีข้อมูลจริง  → ชวนสร้าง (action)
     • filtered — มีข้อมูลแต่ตัวกรอง/คำค้นไม่ตรง → ชวนล้างตัวกรอง (onClear)
     • error    — โหลดไม่สำเร็จ → ชวนลองใหม่ (onRetry) · โทนสีเตือน

   size:
     • block  (ค่าเริ่มต้น) — กรอบประกลางพื้นที่ ใช้แทนตาราง/รายการทั้งก้อน
     • inline — บรรทัดเดียวจางๆ ใช้ในฟอร์ม/การ์ดเล็ก (ไม่ต้องมีกรอบ)
   ============================================================ */
import { Button } from '@/components/ui/button';
import { Icon } from '../components.jsx';

const MODE = {
  empty:    { icon: 'box',     tone: 'text-muted-foreground' },
  filtered: { icon: 'search',  tone: 'text-muted-foreground' },
  error:    { icon: 'alertTriangle', tone: 'text-[var(--bad)]' },
};

export function EmptyState({
  mode = 'empty',
  icon,                 // ทับไอคอนตาม mode ได้ (เช่นหน้างานใช้ 'check')
  title,
  hint,                 // บรรทัดอธิบายรอง (ทำไมถึงว่าง / ทำอะไรต่อ)
  action,               // ปุ่มหลัก: { label, onClick, icon }
  onClear,              // filtered: ปุ่มล้างตัวกรอง
  onRetry,              // error: ปุ่มลองใหม่
  size = 'block',
  className = '',
}) {
  const m = MODE[mode] || MODE.empty;
  const iconName = icon || m.icon;

  if (size === 'inline') {
    return (
      <div className={`cap flex items-center gap-1.5 py-1.5 ${m.tone} ${className}`}>
        <Icon name={iconName} className="size-3.5 shrink-0 opacity-70" />
        <span className="min-w-0">{title}{hint ? ` — ${hint}` : ''}</span>
        {onClear && <button className="ml-1 font-medium underline hover:no-underline" onClick={onClear}>ล้างตัวกรอง</button>}
        {onRetry && <button className="ml-1 font-medium underline hover:no-underline" onClick={onRetry}>ลองใหม่</button>}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/10 px-6 py-16 text-center ${m.tone} ${className}`}>
      <Icon name={iconName} className="size-8 opacity-25 mb-3" />
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-md text-xs opacity-70">{hint}</p>}
      {(action || onClear || onRetry) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {onClear && <Button variant="outline" size="sm" onClick={onClear}><Icon name="x" /> ล้างตัวกรอง</Button>}
          {onRetry && <Button variant="outline" size="sm" onClick={onRetry}><Icon name="refresh" /> ลองใหม่</Button>}
          {action && <Button size="sm" onClick={action.onClick}>{action.icon && <Icon name={action.icon} />} {action.label}</Button>}
        </div>
      )}
    </div>
  );
}
