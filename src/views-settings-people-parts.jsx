/* ============================================================
   views-settings-people-parts.jsx — ชิ้นส่วน UI ของแท็บ "ผู้ใช้/สิทธิ์" (แยกจาก views-settings-people.jsx)
   ============================================================
   roleMeta / LOCK_SECTIONS / LockPicker / DutySelect / RoleSelect — ยกออกมาทั้งดุ้น ไม่แก้เนื้อใน
   (component ระดับโมดูล ใช้ร่วมทั้ง dialog เพิ่มผู้ใช้ + dialog แก้ไขผู้ใช้ ใน RolesView)
   ============================================================ */
import { TMK } from './data.js';
import { Icon } from './components.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

/* ---- component ย่อยระดับโมดูล (ยกออกจาก RolesView — ไม่ให้ถูกสร้างใหม่ทุก render) ---- */
export const roleMeta = {
  admin: { l: 'ผู้ดูแลระบบ', cls: 'chip-accent', icon: 'shield', d: 'จัดการได้ทุกอย่าง รวมถึงสิทธิ์ผู้ใช้' },
  editor: { l: 'แก้ไขได้', cls: 'chip-good', icon: 'pencil', d: 'บันทึกยอดขาย จัดการงาน แก้ไขข้อมูล' },
  viewer: { l: 'ดูอย่างเดียว', cls: '', icon: 'eye', d: 'เปิดดูข้อมูลได้ แต่แก้ไขไม่ได้' }
};
// หน้าที่ล็อกได้ต่อคน (deny-list) — หน้าหลักเข้าได้เสมอ · admin ไม่โดนล็อก
// Sale มีหน้าย่อย → ล็อกทั้งหมด หรือเลือกล็อกเฉพาะหน้าย่อย (composite "catalog:<sub>") ได้
export const LOCK_SECTIONS = [
  { id: 'sales', label: 'ยอดขาย', icon: 'sales' },
  { id: 'flows', label: 'โครงการ', icon: 'grid' },
  { id: 'catalog', label: 'Sale', icon: 'box', subs: [
    { id: 'report', label: 'รายงานขาย' },
    { id: 'perf', label: 'ประสิทธิภาพเซลล์' },
    { id: 'orders', label: 'ออเดอร์' },
    { id: 'crm', label: 'ภาพรวม CRM' },
    { id: 'data', label: 'ส่งยอด & ข้อมูล' },
    { id: 'shirts', label: 'สินค้า' },
  ] },
  { id: 'logs', label: 'บันทึกกิจกรรม', icon: 'clock' },
  { id: 'settings', label: 'ตั้งค่า', icon: 'system' },
];
// กลุ่มชิปเลือกหน้าที่จะล็อก — ใช้ทั้ง modal แก้ไข + dialog เพิ่มผู้ใช้ (admin = ซ่อน เข้าได้ทุกหน้า)
export const LockPicker = ({ role, locks, setLocks }) => role === 'admin' ? null : (
  <div className="grid gap-2">
    <Label>การเข้าถึงหน้า <span className="text-xs font-normal text-muted-foreground">(ติ๊ก = ล็อกไม่ให้เข้า)</span></Label>
    <div className="flex flex-col gap-2">
      {LOCK_SECTIONS.map(s => { const on = locks.includes(s.id); return (
        <div key={s.id} className="flex flex-col gap-1.5">
          <button type="button" onClick={() => setLocks(on ? locks.filter(x => x !== s.id) : [...locks, s.id])}
            className={`w-fit flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-colors ${on ? 'bg-destructive/10 border-destructive/40 text-destructive font-medium' : 'bg-background hover:bg-muted'}`}>
            <Icon name={on ? 'lock' : s.icon} className="size-3.5" />{s.label}
          </button>
          {/* หน้าย่อย — เลือกล็อกเฉพาะบางหน้าได้ · ล็อกทั้ง Sale แล้ว = ล็อกหมด (จาง กดไม่ได้) */}
          {s.subs && (
            <div className="flex flex-wrap gap-1.5 pl-4">
              {s.subs.map(sub => { const key = `${s.id}:${sub.id}`; const subOn = on || locks.includes(key); return (
                <button key={key} type="button" disabled={on}
                  onClick={() => setLocks(locks.includes(key) ? locks.filter(x => x !== key) : [...locks, key])}
                  className={`flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-full border transition-colors ${on ? 'opacity-40 cursor-not-allowed border-dashed' : subOn ? 'bg-destructive/10 border-destructive/40 text-destructive font-medium' : 'bg-background hover:bg-muted'}`}>
                  <Icon name={subOn ? 'lock' : 'chevR'} className="size-3" />{sub.label}
                </button>
              ); })}
            </div>
          )}
        </div>
      ); })}
    </div>
    <p className="text-xs text-muted-foreground">หน้าที่ล็อกจะโชว์จาง + กุญแจในเมนู กดแล้วแจ้งไม่มีสิทธิ์ · ล็อก “Sale” ทั้งหมด หรือเลือกเฉพาะหน้าย่อยได้ · หน้าหลักเข้าได้เสมอ</p>
  </div>
);

// dropdown ย่อ (แทนชิปเยอะๆ) — ใช้ร่วมทั้ง add + edit · Radix Select ห้าม value="" → ใช้ '__none__'
export const DutySelect = ({ value, onChange }) => (
  <Select value={value || '__none__'} onValueChange={(v) => onChange(v === '__none__' ? '' : v)}>
    <SelectTrigger className="bg-background"><SelectValue placeholder="— ไม่ระบุ —" /></SelectTrigger>
    <SelectContent>
      <SelectItem value="__none__">— ไม่ระบุ —</SelectItem>
      {(TMK.duties || []).map(d => (
        <SelectItem key={d.id} value={d.id}>
          <span className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: d.color }} />{d.name}</span>
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
export const RoleSelect = ({ value, onChange }) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
    <SelectContent>
      {Object.entries(roleMeta).map(([k, v]) => (
        <SelectItem key={k} value={k}>
          <span className="flex items-center gap-2"><Icon name={v.icon} className="size-4" />{v.l}</span>
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
