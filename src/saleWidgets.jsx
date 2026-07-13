/* ============================================================
   saleWidgets.jsx — shared widgets/helpers ของ views-2 split (PART 79)
   DateRangePicker/MultiSelect/DrawerField/DrawerGroup + date/csv/guard helpers
   (เดิมกระจายแทรกใน views-2 · planner ใช้ date helper ที่นิยามในโซน orders → ต้องรวมที่นี่)
   ============================================================ */
import React from 'react';
import { TMK } from './data.js';
import { Icon } from './components.jsx';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { th } from 'date-fns/locale';

export const DD = TMK;

// a11y: ให้ clickable div กดด้วยคีย์บอร์ดได้ (Enter/Space → trigger onClick)
export const onCardKey = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); e.currentTarget.click(); } }; // เฉพาะตอนโฟกัสที่การ์ดเอง ไม่ใช่ control ลูก (select/ปุ่ม) → กัน Space/Enter ของ select เด้งเปิด modal

// guard สิทธิ์ (ฝั่ง client) — กัน viewer แก้ผ่านหน้าตั้งค่า + จัดการผู้ใช้/สิทธิ์เฉพาะ admin
export const guardEdit = () => { if (!window.__canEdit) { window.__toast?.('สิทธิ์ "ดูอย่างเดียว" — แก้ไขไม่ได้ (ติดต่อแอดมิน)', 'warn'); return false; } return true; };
export const guardAdmin = () => { if (!window.__isAdmin) { window.__toast?.('เฉพาะแอดมินจัดการผู้ใช้และสิทธิ์ได้', 'warn'); return false; } return true; };

/* ====================  PLANNER  ==================== */
export const stLabel = { done: 'เสร็จ', review: 'รอตรวจ', inprogress: 'กำลังทำ', todo: 'รอ' };
export const stCls = { done: 'chip-good', review: 'chip-warn', inprogress: 'chip-accent', todo: '' };
export const chipVar2 = (cls) => ({ 'chip-good': 'success', 'chip-warn': 'warning', 'chip-bad': 'danger', 'chip-accent': 'accent', '': 'secondary' }[cls || ''] || 'secondary');

/* ---- DateRangePicker — ปุ่มช่วงเวลาเดียว (preset + ปฏิทินคู่) แบบหน้ายอดขาย · ใช้ helper _TH_MON/_isoToDate/_dateToIso/_fmtTh ร่วม (นิยามด้านล่าง) ---- */
export const fmtRange = (from, to) => {
  if (!from || !to) return '';
  const [fy, fm, fd] = from.split('-').map(Number), [ty, tm, td] = to.split('-').map(Number);
  if (fy === ty && fm === tm) return `${fd}–${td} ${_TH_MON[fm - 1]} ${fy}`;
  if (fy === ty) return `${fd} ${_TH_MON[fm - 1]} – ${td} ${_TH_MON[tm - 1]} ${ty}`;
  return `${_fmtTh(from)} – ${_fmtTh(to)}`;
};
export function DateRangePicker({ from, to, onChange, presets = [], activePreset, onPickPreset }) {
  const [open, setOpen] = React.useState(false);
  const [sel, setSel] = React.useState({ from: _isoToDate(from), to: _isoToDate(to) });
  const presetLabel = (presets.find(([id]) => id === activePreset) || [])[1];
  const main = presetLabel || (from || to ? 'กำหนดเอง' : 'ทุกช่วงเวลา');
  const sub = activePreset === 'all' ? '' : fmtRange(from, to);
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setSel({ from: _isoToDate(from), to: _isoToDate(to) }); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2 font-normal">
          <Icon name="calendarDays" /><span className="font-semibold text-[var(--ink)]">{main}</span>
          {sub && <span className="text-[var(--ink-4)]">· {sub}</span>}
          <Icon name="down" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex max-sm:flex-col">
          <div className="flex shrink-0 flex-col gap-0.5 border-b p-2 sm:min-w-[128px] sm:border-b-0 sm:border-r">
            <span className="px-2 pb-1 text-[11px] font-semibold text-[var(--ink-4)]">ช่วงเวลา</span>
            {presets.map(([id, lb]) => (
              <button key={id} onClick={() => { onPickPreset(id); setOpen(false); }}
                className={'rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ' + (id === activePreset ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent-2)]' : 'text-[var(--ink-2)] hover:bg-[var(--surface-2)]')}>{lb}</button>
            ))}
          </div>
          <div className="flex min-w-0 flex-col">
            <Calendar mode="range" numberOfMonths={2} locale={th} defaultMonth={_isoToDate(from)} selected={sel}
              onSelect={(r) => { setSel(r || { from: undefined, to: undefined }); if (r?.from && r?.to) { onChange(_dateToIso(r.from), _dateToIso(r.to)); setOpen(false); } }} />
            {/* แถบสรุประหว่างเลือก: วันเริ่ม → วันสิ้นสุด + ล้าง */}
            <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-[12.5px]">
              <span>
                <span className={sel?.from ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-4)]'}>{sel?.from ? _fmtTh(_dateToIso(sel.from)) : 'เลือกวันเริ่ม'}</span>
                <span className="mx-1.5 text-[var(--ink-4)]">→</span>
                <span className={sel?.to ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-4)]'}>{sel?.to ? _fmtTh(_dateToIso(sel.to)) : 'เลือกวันสิ้นสุด'}</span>
              </span>
              {(sel?.from || sel?.to) && (
                <button className="text-[12px] font-medium text-[var(--bad)] hover:underline" onClick={() => setSel({ from: undefined, to: undefined })}>ล้าง</button>
              )}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// กัน CSV formula-injection (Excel) แต่ "ยกเว้นเลขล้วน" — เลขติดลบ (-1234.56) ต้องคงเป็นตัวเลข ไม่งั้น SUM ใน Excel ข้าม
export const _csvEsc = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
export function downloadCSV(filename, blocks) {
  let csv = '';
  blocks.forEach(({ title, cols, rows }) => {
    if (title) csv += title + '\n';
    if (cols) csv += cols.map(_csvEsc).join(',') + '\n';
    (rows || []).forEach(r => { csv += r.map(_csvEsc).join(',') + '\n'; });
    csv += '\n';
  });
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
}

/* ====================  ออเดอร์จากไฟล์นำเข้า (รายละเอียด)  ==================== */
/* Skeleton ตรง layout ออเดอร์: การ์ดหัว (ค้นหา + ชิปกรอง) + ตาราง 8 คอลัมน์ */
// รายการเลขหน้าแบบมี … (ย่อเมื่อหน้าเยอะ): 1 … 4 5 6 … 32
export function _pageList(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out = [1];
  const lo = Math.max(2, cur - 1), hi = Math.min(total - 1, cur + 1);
  if (lo > 2) out.push('…');
  for (let p = lo; p <= hi; p++) out.push(p);
  if (hi < total - 1) out.push('…');
  out.push(total);
  return out;
}

// ---------- date range picker (preset sidebar + ปฏิทิน range 2 เดือน) — เหมือนหน้ารายงานขาย ----------
export const _TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const _isoToDate = (s) => { if (!s) return undefined; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const _dateToIso = (dt) => dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}` : null;
export const _fmtTh = (s) => { if (!s) return '?'; const [y, m, d] = s.split('-').map(Number); return `${d} ${_TH_MON[m - 1]} ${y}`; };
export const _fmtRange = (from, to) => {
  if (!from || !to) return '';
  const [fy, fm, fd] = from.split('-').map(Number), [ty, tm, td] = to.split('-').map(Number);
  if (fy === ty && fm === tm) return `${fd}–${td} ${_TH_MON[fm - 1]} ${fy}`;
  if (fy === ty) return `${fd} ${_TH_MON[fm - 1]} – ${td} ${_TH_MON[tm - 1]} ${ty}`;
  return `${_fmtTh(from)} – ${_fmtTh(to)}`;
};

// ---------- multiselect dropdown (checkbox) — แบบเดียวกับหน้ารายงานขาย ----------
export function MultiSelect({ label, options, value, onChange }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  const n = value.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={'rounded-full font-medium' + (n ? ' border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-2)]' : '')}>
          {label}
          {n > 0 && <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[11px]">{n}</Badge>}
          <Icon name="down" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-auto">
        <DropdownMenuLabel className="flex items-center justify-between py-1">
          <span>{label}</span>
          {n > 0 && <button className="text-[12px] font-medium text-[var(--bad)] hover:underline" onClick={(e) => { e.preventDefault(); onChange([]); }}>ล้าง</button>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.length === 0 && <div className="px-2 py-2 text-[13px] text-[var(--ink-4)]">ไม่มีข้อมูล</div>}
        {options.map(o => (
          <DropdownMenuCheckboxItem key={o} checked={value.includes(o)} onSelect={(e) => { e.preventDefault(); toggle(o); }}>
            <span className="min-w-0 flex-1 truncate">{o || '(ไม่ระบุ)'}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DrawerField({ label, children }) {
  return <div><span className="cap">{label}</span><b>{children}</b></div>;
}
export function DrawerGroup({ icon, title, children }) {
  return (
    <div className="rounded-xl border p-3.5" style={{ borderColor: 'var(--line)', background: 'var(--surface-2, transparent)' }}>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-[14px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name={icon} /></span>
        <span className="text-[13px] font-bold" style={{ color: 'var(--ink)' }}>{title}</span>
      </div>
      <div className="kv-grid">{children}</div>
    </div>
  );
}

