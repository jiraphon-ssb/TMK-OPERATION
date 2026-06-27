/* ============================================================
   DataTableParts.jsx — ชิ้นส่วน "DataTable มาตรฐาน" แบบ composable
   เสริมตารางเดิม (ไม่ rewrite การ render แถว) → ความเสี่ยงต่ำ
   - useTableSort: sort state + จัดเรียง rows
   - SortHead: <TableHead> ที่คลิกเรียงได้ + ลูกศรบอกทิศ
   - DensityToggle: ToggleGroup ปรับความแน่นแถว (shadcn)
   - ColumnToggle: DropdownMenu + Checkbox ซ่อน/โชว์คอลัมน์ (shadcn)
   ทุกชิ้น shadcn/Radix ล้วน
   ============================================================ */
import React, { useMemo, useState } from 'react';
import { Table, TableHeader, TableRow, TableHead, TableBody } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Icon } from '../components.jsx';

// ---- hook: จัดเรียงตามคอลัมน์ (รองรับ accessor ฟังก์ชัน) ----
// columns: { [field]: (row) => sortableValue }  · ถ้าไม่ส่ง ใช้ row[field] ตรงๆ
export function useTableSort(rows, { key = null, dir = 'desc', accessors = {} } = {}) {
  const [sortKey, setSortKey] = useState(key);
  const [sortDir, setSortDir] = useState(dir);
  const toggleSort = (field) => {
    if (field === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(field); setSortDir('desc'); }
  };
  const sorted = useMemo(() => {
    const arr = rows || [];
    if (!sortKey) return arr;
    const get = accessors[sortKey] || ((r) => r[sortKey]);
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...arr].sort((a, b) => {
      const av = get(a), bv = get(b);
      // null/undefined ไปท้ายเสมอ
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul;
      return String(av).localeCompare(String(bv), 'th') * mul;
    });
  }, [rows, sortKey, sortDir, accessors]);
  return { sorted, sortKey, sortDir, toggleSort };
}

// ---- TableHead ที่คลิกเรียงได้ ----
export function SortHead({ field, sortKey, sortDir, onSort, align = 'left', className = '', children, ...props }) {
  const active = field === sortKey;
  const right = align === 'right';
  return (
    <TableHead className={className} style={{ textAlign: align, padding: 0, ...(props.style || {}) }} aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(field)}
        className="inline-flex select-none items-center gap-1 px-2 py-2 font-medium transition-colors hover:text-[var(--ink)]"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: active ? 'var(--ink)' : 'inherit', fontFamily: 'var(--font)', fontSize: 'inherit', width: '100%', justifyContent: right ? 'flex-end' : 'flex-start', flexDirection: right ? 'row-reverse' : 'row' }}
        title="คลิกเพื่อเรียง">
        <span>{children}</span>
        <span style={{ display: 'inline-flex', width: 12, opacity: active ? 1 : 0.34, color: active ? 'var(--accent)' : 'currentColor', transform: active && sortDir === 'asc' ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s var(--ease), opacity 0.12s' }}>
          <Icon name="chevD" />
        </span>
      </button>
    </TableHead>
  );
}

// ---- SortableTable: ตารางพร้อม sort ในตัว (เรียก useTableSort เองครั้งเดียว/instance) ----
// ใช้ในที่ที่เรียก hook ตรงๆ ไม่ได้ (IIFE / branch เงื่อนไข) — drop-in component
// columns: [{ key, label, align?, style?, sortable?, accessor? }]  · sortable=false = หัวธรรมดา
// renderRow(row, i, ctx) → <TableRow> · ctx = { sortKey, sortDir, density }
// initial: { key, dir } default sort · density: 'dense'|'cozy' (เติม class .row-dense)
export function SortableTable({ columns, rows, renderRow, initial = {}, density, maxHeight, wrapClassName = 'table-wrap', wrapStyle }) {
  const accessors = useMemo(() => {
    const a = {};
    columns.forEach(c => { if (c.accessor) a[c.key] = c.accessor; });
    return a;
  }, [columns]);
  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(rows, { key: initial.key || null, dir: initial.dir || 'desc', accessors });
  const style = maxHeight ? { maxHeight, overflowY: 'auto', ...(wrapStyle || {}) } : wrapStyle;
  const cls = [wrapClassName, density].filter(Boolean).join(' ');
  return (
    <div className={cls} style={style}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map(c => c.sortable === false
              ? <TableHead key={c.key} className={c.className} style={{ ...(c.align ? { textAlign: c.align } : null), ...(c.style || {}) }}>{c.label}</TableHead>
              : <SortHead key={c.key} field={c.key} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align={c.align || 'left'} className={c.className} style={c.style}>{c.label}</SortHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>{sorted.map((row, i) => renderRow(row, i, { sortKey, sortDir, density }))}</TableBody>
      </Table>
    </div>
  );
}

// ---- ToggleGroup ปรับความแน่นแถว (compact / cozy) ----
export function DensityToggle({ value, onChange }) {
  return (
    <ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v)} variant="outline" size="sm" className="h-8">
      <ToggleGroupItem value="dense" className="h-8 px-2.5" title="แถวแน่น" aria-label="แถวแน่น"><Icon name="menu" /></ToggleGroupItem>
      <ToggleGroupItem value="cozy" className="h-8 px-2.5" title="แถวโปร่ง" aria-label="แถวโปร่ง"><Icon name="listChecks" /></ToggleGroupItem>
    </ToggleGroup>
  );
}

// ---- DropdownMenu + Checkbox เลือกคอลัมน์ที่จะโชว์ ----
// columns: [{ key, label, locked? }]  · visible: Set  · onToggle(key)
export function ColumnToggle({ columns, visible, onToggle, label = 'คอลัมน์' }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 font-normal" title="เลือกคอลัมน์ที่แสดง">
          <Icon name="grid" /> {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>แสดงคอลัมน์</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map(col => (
          <DropdownMenuCheckboxItem key={col.key} checked={visible.has(col.key)} disabled={col.locked}
            onSelect={(e) => { e.preventDefault(); if (!col.locked) onToggle(col.key); }}>
            {col.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
