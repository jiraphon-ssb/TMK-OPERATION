/* ============================================================
   saleWidgets.jsx — shared widgets/helpers ของ views-2 split (PART 79)
   DateRangePicker/MultiSelect/DrawerField/DrawerGroup + date/csv/guard helpers
   (เดิมกระจายแทรกใน views-2 · planner ใช้ date helper ที่นิยามในโซน orders → ต้องรวมที่นี่)
   ============================================================ */
import React from 'react';
import { TMK } from './data.js';
import { Icon } from './components.jsx';
import { Modal } from './modals-core.jsx';
import { CUSTOMER_TYPES } from './lib/saleFields.js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { th } from 'date-fns/locale';

export const DD = TMK;

// a11y: ให้ clickable div กดด้วยคีย์บอร์ดได้ (Enter/Space → trigger onClick)
export const onCardKey = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); e.currentTarget.click(); } }; // เฉพาะตอนโฟกัสที่การ์ดเอง ไม่ใช่ control ลูก (select/ปุ่ม) → กัน Space/Enter ของ select เด้งเปิด modal

// guard สิทธิ์ (ฝั่ง client) — กัน viewer แก้ผ่านหน้าตั้งค่า + จัดการผู้ใช้/สิทธิ์เฉพาะ admin
export const guardEdit = () => { if (!window.__canEdit) { window.__toast?.('สิทธิ์ "ดูอย่างเดียว" — แก้ไขไม่ได้ (ติดต่อแอดมิน)', 'warn'); return false; } return true; };
export const guardAdmin = () => { if (!window.__isAdmin) { window.__toast?.('เฉพาะแอดมินจัดการผู้ใช้และสิทธิ์ได้', 'warn'); return false; } return true; };

/* ---- FormSection — กล่องส่วนฟอร์ม (หัวไอคอน + กรอบอ่อน) — มาตรฐานเดียวทั้ง 3 ฟอร์มขาย (PART 81.5)
   เดิมอยู่ใน ManualSaleSheet ไฟล์เดียว → ยกมากลางให้ ตรวจก่อนบันทึก + แก้ออเดอร์ ใช้ร่วม ---- */
export function FormSection({ icon, title, sub, children, className = '' }) {
  return (
    <div className={'rounded-xl border p-3.5 shadow-sm ' + className} style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid place-items-center rounded-lg size-7" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', flex: 'none' }}><Icon name={icon} /></span>
        <span className="text-[13px] font-bold">{title}</span>
        {sub && <span className="cap" style={{ color: 'var(--ink-4)' }}>· {sub}</span>}
      </div>
      {children}
    </div>
  );
}

/* ---- FieldLabel / Field — label + field มาตรฐานเดียวทุกฟอร์มแก้/เพิ่ม (PART 83) ----
   แทน 3 ระบบเดิม (EL 11px/400 · .field 13px/600 · kv-grid) ให้ label ทั้งแอปหน้าตาเดียวกัน */
export function FieldLabel({ children, className = '' }) {
  return <span className={'text-[12px] font-semibold text-muted-foreground ' + className}>{children}</span>;
}
export function Field({ label, children, className = '' }) {
  return <div className={'flex flex-col gap-1.5 ' + className}><FieldLabel>{label}</FieldLabel>{children}</div>;
}

/* ---- PriceBreakdown — แยก "ราคาเสื้อ / ส่วนลด / ค่าส่ง / VAT → ยอดขาย" (PART 81.6) ----
   ใช้ร่วมทุก popup: ใบเสร็จ + ออเดอร์ + ตรวจก่อนบันทึก · โชว์เฉพาะเมื่อมี break จริง (ไม่งั้นซ่อน) */
const _fmtB = (n) => '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
export function PriceBreakdown({ subtotal, discount, shipping, vat, total, className = '' }) {
  const d = Number(discount) || 0, s = Number(shipping) || 0, v = Number(vat) || 0;
  const tot = Number(total) || 0;
  const sub = subtotal != null && subtotal !== '' ? Number(subtotal) : null;
  const hasBreak = d || s || v || (sub != null && Math.abs(sub - tot) > 0.01);
  if (!hasBreak) return null;
  const Row = ({ label, val, sign = '', strong }) => (
    <div className="flex items-center justify-between text-[13px]">
      <span className={strong ? 'font-semibold' : 'text-muted-foreground'}>{label}</span>
      <span className={'tabular-nums ' + (strong ? 'font-bold' : 'text-muted-foreground')}>{sign}{_fmtB(val)}</span>
    </div>
  );
  return (
    <div className={'rounded-lg border p-2.5 flex flex-col gap-1 ' + className} style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
      {sub != null && <Row label="ราคาเสื้อ" val={sub} />}
      {d ? <Row label="ส่วนลด" val={d} sign="−" /> : null}
      {s ? <Row label="ค่าส่ง" val={s} sign="+" /> : null}
      {v ? <Row label="VAT" val={v} sign="+" /> : null}
      <div className="mt-0.5 border-t pt-1" style={{ borderColor: 'var(--line)' }}><Row label="ยอดขาย" val={tot} strong /></div>
    </div>
  );
}

/* ---- MoneyCard — ยอดเด่น + COD badge + แยกราคา (รวมการ์ดบน+breakdown เป็นใบเดียว · PART 83) ----
   เลิกโชว์ยอดซ้ำ 2 ที่ · extras = เซลล์เสริม (ค่าธรรมเนียม/ยอด COD) · breakdown props = ราคาเสื้อ/ส่วนลด/ค่าส่ง/VAT */
export function MoneyCard({ total, codBadge, extras = [], subtotal, discount, shipping, vat, className = '' }) {
  const d = Number(discount) || 0, s = Number(shipping) || 0, v = Number(vat) || 0, tot = Number(total) || 0;
  const sub = subtotal != null && subtotal !== '' ? Number(subtotal) : null;
  const hasBreak = d || s || v || (sub != null && Math.abs(sub - tot) > 0.01);
  const Row = ({ label, val, sign = '' }) => (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums text-muted-foreground">{sign}{_fmtB(val)}</span>
    </div>
  );
  return (
    <div className={'rounded-xl border p-4 ' + className} style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <span className="text-[26px] font-extrabold leading-none tabular-nums" style={{ color: 'var(--accent)' }}>{_fmtB(tot)}</span>
          {codBadge && <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 dark:text-amber-400">{codBadge}</Badge>}
        </div>
        <span className="text-[11px] text-muted-foreground">ยอดขาย</span>
      </div>
      {extras.length > 0 && (
        <div className="mt-3 flex items-stretch justify-center gap-5">{extras.map(e => (
          <div key={e.label} className="text-center"><div className="text-[13px] font-bold tabular-nums">{e.val}</div><div className="text-[11px] text-muted-foreground">{e.label}</div></div>
        ))}</div>
      )}
      {hasBreak && (
        <div className="mt-3 border-t pt-2.5 flex flex-col gap-1" style={{ borderColor: 'var(--line)' }}>
          {sub != null && <Row label="ราคาเสื้อ" val={sub} />}
          {d ? <Row label="ส่วนลด" val={d} sign="−" /> : null}
          {s ? <Row label="ค่าส่ง" val={s} sign="+" /> : null}
          {v ? <Row label="VAT" val={v} sign="+" /> : null}
        </div>
      )}
    </div>
  );
}

/* ---- ReceiptPdfModal — เปิดไฟล์ใบเสร็จเป็น popup ฝัง PDF ในหน้า (Modal + pdf.js canvas · PART 83) ----
   file_url เป็น public URL (Storage) โหลดตอนเปิดเท่านั้น = egress น้อย
   ใช้ pdf.js render ลง canvas (ไม่พึ่งปลั๊กอิน PDF ของเบราว์เซอร์ที่บางตัวไม่มี → iframe ดำ)
   PdfViewer lazy-load → pdfjs โหลดเฉพาะตอนเปิด ไม่บวม bundle หลัก */
const PdfViewer = React.lazy(() => import('./components/PdfViewer.jsx'));
export function ReceiptPdfModal({ url, title = 'ไฟล์ใบเสร็จ', onClose }) {
  return (
    <Modal xl icon="external" title={title} sub="ดูไฟล์ใบเสร็จ (PDF)" onClose={onClose}
      footer={<><Button asChild variant="outline" size="sm"><a href={url} target="_blank" rel="noreferrer"><Icon name="external" /> เปิดแท็บใหม่</a></Button><Button size="sm" onClick={onClose}>ปิด</Button></>}>
      <div className="overflow-y-auto rounded-lg border p-2" style={{ maxHeight: '74vh', borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
        <React.Suspense fallback={<div className="py-10 text-center text-sm text-muted-foreground">กำลังโหลด…</div>}>
          <PdfViewer url={url} />
        </React.Suspense>
      </div>
    </Modal>
  );
}

/* ---- CustomerTypeChips — ลูกค้าใหม่/เก่า แบบ chips อันเดียวทุกฟอร์ม (เลิก Select บ้าง chips บ้าง) ---- */
export function CustomerTypeChips({ value, onChange }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground">สถานะ</span>
      {CUSTOMER_TYPES.map(t => (
        <button key={t} type="button" onClick={() => onChange(t)}
          className={`h-7 px-2.5 rounded-md border text-xs transition-colors ${value === t ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground'}`}>{t}</button>
      ))}
    </div>
  );
}

/* ---- SellerCombobox — เลือกเซลล์จากรายชื่อ (Command+Popover · พิมพ์เองได้เป็น fallback) ----
   ชื่อเซลล์ = ฟิลด์ Tier-1: ต้อง match เป๊ะ 3 ที่ (ออเดอร์ ↔ คนทัก funnel ↔ เป้า/คอม)
   พิมพ์เพี้ยน = เซลล์แตกเป็น 2 คนใน leaderboard → picker ลด drift · options เจ้าของหน้า derive (staff ∪ เซลล์จากข้อมูล) */
export function SellerCombobox({ value, onChange, options = [], placeholder = 'เลือกเซลล์', className }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const opts = React.useMemo(() => [...new Set((options || []).map(s => String(s || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th')), [options]);
  const qt = q.trim();
  const pick = (v) => { onChange(v); setOpen(false); setQ(''); };
  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setQ(''); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open}
          className={'w-full justify-between font-normal ' + (className || '')} style={{ color: value ? 'var(--ink-1)' : 'var(--ink-4)' }}>
          <span className="truncate">{value || placeholder}</span>
          <Icon name="chevD" className="opacity-60 flex-none" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 w-[var(--radix-popover-trigger-width)]" style={{ minWidth: 220 }}>
        <Command>
          <CommandInput placeholder="ค้นหา/พิมพ์ชื่อเซลล์…" value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>พิมพ์ชื่อแล้วกด “ใช้ชื่อนี้”</CommandEmpty>
            {(value || (qt && !opts.some(s => s.toLowerCase() === qt.toLowerCase()))) && (
              <CommandGroup>
                {qt && !opts.some(s => s.toLowerCase() === qt.toLowerCase()) && (
                  <CommandItem value={qt} onSelect={() => pick(qt)}>
                    <span style={{ width: 16, flex: 'none' }} /><span>ใช้ชื่อนี้: <b>{qt}</b></span>
                  </CommandItem>
                )}
                {value && (
                  <CommandItem value="__clear__" onSelect={() => pick('')}>
                    <span style={{ width: 16, flex: 'none' }} /><span style={{ color: 'var(--ink-4)' }}>ล้างชื่อเซลล์</span>
                  </CommandItem>
                )}
              </CommandGroup>
            )}
            <CommandGroup heading="รายชื่อเซลล์">
              {opts.map(s => {
                const sel = s === value;
                return (
                  <CommandItem key={s} value={s} onSelect={() => pick(s)}>
                    <span style={{ width: 16, color: 'var(--accent)', flex: 'none' }}>{sel && <Icon name="check" />}</span>
                    <span className="truncate" style={{ fontWeight: sel ? 600 : 400 }}>{s}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

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
export function DateRangePicker({ from, to, min, max, onChange, presets = [], activePreset, onPickPreset }) {
  const [open, setOpen] = React.useState(false);
  const [sel, setSel] = React.useState({ from: _isoToDate(from), to: _isoToDate(to) });
  // min/max = ขอบวันที่ข้อมูลจริง (ใช้โดยหน้าออเดอร์ — เดิม OrderDatePicker fork แยก · PART 81 รวมเป็นตัวเดียว)
  const disabled = []; if (_isoToDate(min)) disabled.push({ before: _isoToDate(min) }); if (_isoToDate(max)) disabled.push({ after: _isoToDate(max) });
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
            <Calendar mode="range" numberOfMonths={2} locale={th} defaultMonth={_isoToDate(from) || _isoToDate(max)} selected={sel}
              disabled={disabled.length ? disabled : undefined}
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

export function DrawerField({ label, children, full }) {
  return <div style={full ? { gridColumn: '1 / -1' } : undefined}><span className="cap">{label}</span><b>{children}</b></div>;
}
export function DrawerGroup({ icon, title, children }) {
  return (
    <div className="rounded-xl border p-3.5" style={{ borderColor: 'var(--line)', background: 'var(--surface-2, transparent)' }}>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid place-items-center rounded-lg size-7" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', flex: 'none' }}><Icon name={icon} /></span>
        <span className="text-[13px] font-bold" style={{ color: 'var(--ink)' }}>{title}</span>
      </div>
      <div className="kv-grid">{children}</div>
    </div>
  );
}

