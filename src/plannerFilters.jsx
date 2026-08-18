/* ============================================================
   plannerFilters.jsx — แถบตัวกรองของหน้าวางแผน (แยกจาก views-planner.jsx)
   - FilterDropdown + PlannerFilters + filterTasks() ยกมาทั้งดุ้น ไม่แก้เนื้อใน
   - รับค่าทุกอย่างผ่าน props (fProps) จาก PlannerView เหมือนเดิมเป๊ะ
   ============================================================ */
import React from 'react';
import { Icon } from './components.jsx';
import { PRESETS, presetRange } from './lib/saleTime.js';
import { todayISO } from './lib/dateUtils.js';
import { tokenizeCh } from './taskCard.jsx';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SearchInput } from '@/components/ui/search-input';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { DateRangePicker, DD } from './saleWidgets.jsx';

// ดรอปดาวน์ฟิลเตอร์ — ใช้กับตัวเลือกเยอะ (แคมเปญ/หน้าที่) ให้แถบสะอาด ไม่กองพิลล์ · shadcn DropdownMenu
// multi-select: value = array ของ id · เลือกได้หลายตัว (เมนูไม่ปิดตอนเลือก)
function FilterDropdown({ label, icon, options, value, onChange }) {
  const sel = Array.isArray(value) ? value : (value ? [value] : []);
  const active = sel.length > 0;
  const selOpts = options.filter(o => sel.includes(o.id));
  const trigText = sel.length === 0 ? label : sel.length === 1 ? (selOpts[0]?.name || label) : `${label} (${sel.length})`;
  const toggle = (id) => onChange(sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={'rounded-full font-medium' + (active ? ' border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-2)]' : '')}>
          {/* ไอคอน slot กว้างคงที่ — กันปุ่มขยับ/layout shift ตอนเลือก (dot) ↔ ไม่เลือก (icon) → dropdown เด้งสมูท */}
          <span className="inline-flex w-4 items-center justify-center shrink-0">
            {sel.length === 1 ? <span className="dot-c" style={{ background: selOpts[0]?.color }} /> : <Icon name={icon} />}
          </span>
          <span className="max-w-[140px] truncate">{trigText}</span>
          <Icon name="down" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="max-h-72 w-52 overflow-auto">
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onChange([]); }}>
          <span className="flex-1">ทั้งหมด</span>{sel.length === 0 && <Icon name="check" />}
        </DropdownMenuItem>
        {options.map(o => (
          <DropdownMenuItem key={o.id} onSelect={(e) => { e.preventDefault(); toggle(o.id); }}>
            <span className="dot-c" style={{ background: o.color }} />
            <span className="min-w-0 flex-1 truncate">{o.name}</span>
            {sel.includes(o.id) && <Icon name="check" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PlannerFilters({ filterCamp, setFilterCamp, filterStatus, setFilterStatus, filterResp, setFilterResp, search, setSearch, respOptions, campScope,
  filterPriority, setFilterPriority, filterTags, setFilterTags, tagOptions, filterChannel, setFilterChannel,
  filterDateFrom, setFilterDateFrom, filterDateTo, setFilterDateTo, datePreset, setDatePreset }) {
  const [open, setOpen] = React.useState(false);
  const respColor = (name) => (DD.duties.find(d => d.name === name)?.color) || (DD.staff.find(s => s.name === name)?.color) || 'var(--ink-3)';
  const dateActive = !!(filterDateFrom || filterDateTo);
  // campScope = null (ไม่มีโครงการ = หน้ารวม) → ทุกแคมเปญ · array (ในโครงการ) → เฉพาะที่ติ๊ก/ใช้จริง (ไม่โชว์อันที่ไม่เกี่ยว)
  const campOpts = (DD.campaigns || []).filter(c => campScope == null || campScope.includes(c.id)).map(c => ({ id: c.id, name: c.name, color: c.color }));
  const respOpts = respOptions.map(r => ({ id: r, name: r, color: respColor(r) }));
  const prioOpts = [{ id: 'high', name: 'สูง', color: '#cf4d5c' }, { id: 'medium', name: 'กลาง', color: '#c08a3e' }, { id: 'low', name: 'ต่ำ', color: '#64748b' }];
  const tagOpts = (tagOptions || []).map(tg => ({ id: tg, name: tg, color: 'var(--ink-3)' }));
  const chanOpts = (DD.channels || []).map(c => ({ id: c.name, name: c.name, color: c.hex }));
  const stOpts = [{ id: 'active', name: 'กำลังทำ', color: 'var(--info)' }, { id: 'done', name: 'เสร็จแล้ว', color: 'var(--good)' }];
  // จำนวนตัวกรองที่เปิดอยู่ (ไม่นับวันที่/ค้นหา — โชว์แยก) + มีอะไรกรองไหม
  const nFilters = (filterStatus !== 'all' ? 1 : 0) + (filterCamp?.length || 0) + (filterResp?.length || 0) + (filterPriority?.length || 0) + (filterTags?.length || 0) + (filterChannel?.length || 0);
  const anyActive = nFilters > 0 || dateActive || search;
  const clearAll = () => {
    setFilterStatus('all'); setFilterCamp([]); setFilterResp([]); setSearch('');
    setFilterPriority?.([]); setFilterTags?.([]); setFilterChannel?.([]);
    setFilterDateFrom?.(''); setFilterDateTo?.(''); setDatePreset?.('all');
  };
  // ปุ่มช่วงวันที่ (แบบหน้ายอดขาย): preset → presetRange · เลือกเอง → กำหนดเอง
  const pickPreset = (id) => { const r = presetRange(id, todayISO()); setDatePreset?.(id); setFilterDateFrom?.(r.from || ''); setFilterDateTo?.(r.to || ''); };
  const pickRange = (f, t) => { setDatePreset?.(''); setFilterDateFrom?.(f || ''); setFilterDateTo?.(t || ''); };
  // ชิปตัวกรองที่เลือก (ถอดได้) — รวมสถานะ/แคมเปญ/หน้าที่/ความสำคัญ/แท็ก/ช่องทาง
  const chips = [];
  if (filterStatus !== 'all') chips.push({ k: 'st', label: (stOpts.find(o => o.id === filterStatus)?.name) || filterStatus, color: stOpts.find(o => o.id === filterStatus)?.color, remove: () => setFilterStatus('all') });
  (filterCamp || []).forEach(id => { const o = campOpts.find(x => x.id === id); chips.push({ k: 'c' + id, label: o?.name || id, color: o?.color, remove: () => setFilterCamp(filterCamp.filter(x => x !== id)) }); });
  (filterResp || []).forEach(id => { const o = respOpts.find(x => x.id === id); chips.push({ k: 'r' + id, label: id, color: o?.color, remove: () => setFilterResp(filterResp.filter(x => x !== id)) }); });
  (filterPriority || []).forEach(id => { const o = prioOpts.find(x => x.id === id); chips.push({ k: 'p' + id, label: o?.name || id, color: o?.color, remove: () => setFilterPriority(filterPriority.filter(x => x !== id)) }); });
  (filterTags || []).forEach(id => chips.push({ k: 't' + id, label: '#' + id, remove: () => setFilterTags(filterTags.filter(x => x !== id)) }));
  (filterChannel || []).forEach(id => { const o = chanOpts.find(x => x.id === id); chips.push({ k: 'ch' + id, label: id, color: o?.color, remove: () => setFilterChannel(filterChannel.filter(x => x !== id)) }); });
  return (
    <Card className="p-3" style={{ marginBottom: 12 }}>
      {/* แถวบน: ช่วงวันที่ · ตัวกรอง · ชิป · ล้าง · ค้นหา(ขวา) */}
      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker from={filterDateFrom} to={filterDateTo} onChange={pickRange} presets={PRESETS} activePreset={dateActive ? datePreset : 'all'} onPickPreset={pickPreset} />
        <span className="h-6 w-px bg-[var(--line)] mx-0.5 hidden sm:block" />
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(o => !o)} title="ตัวกรอง">
          <Icon name="filter" /> ตัวกรอง {nFilters > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{nFilters}</Badge>} <Icon name={open ? 'up' : 'down'} className="size-3.5 opacity-60" />
        </Button>
        {chips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            {chips.map(ch => (
              <Badge key={ch.k} variant="secondary" className="gap-1 pl-2 pr-1 font-normal">
                {ch.color && <span className="size-2 rounded-full shrink-0" style={{ background: ch.color }} />}
                <span className="truncate max-w-[120px]">{ch.label}</span>
                <button onClick={ch.remove} className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10" aria-label="เอาออก"><Icon name="x" className="size-3" /></button>
              </Badge>
            ))}
          </div>
        ) : <span className="text-xs text-muted-foreground hidden md:inline">ยังไม่ได้กรอง — แสดงทุกงาน</span>}
        {anyActive && <Button variant="ghost" size="sm" onClick={clearAll} title="ล้างตัวกรองทั้งหมด"><Icon name="x" /> ล้าง</Button>}
        <div className="flex-1" />
        <SearchInput placeholder="ค้นหา" value={search} onChange={e => setSearch(e.target.value)} wrapperClassName="w-full sm:w-[200px] shrink-0" />
      </div>
      {/* พาเนลตัวกรอง (กางออก) — สถานะ + แคมเปญ/หน้าที่/ความสำคัญ/แท็ก/ช่องทาง */}
      {open && (
        <div className="mt-3 pt-3 border-t border-[var(--line)] flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground w-16 shrink-0">สถานะ</span>
            <ToggleGroup type="single" value={filterStatus} onValueChange={(v) => v && setFilterStatus(v)} className="gap-0.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)] p-1">
              {[['all','ทั้งหมด'],['active','กำลังทำ'],['done','เสร็จแล้ว']].map(([s, l]) => (
                <ToggleGroupItem key={s} value={s} size="sm" className="rounded-full px-3.5 text-[var(--ink-3)] hover:text-[var(--ink)] data-[state=on]:bg-[var(--ink)] data-[state=on]:text-white">{l}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="flex items-start gap-3 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground w-16 shrink-0 pt-1.5">ตัวกรอง</span>
            <div className="row wrap flex-1 min-w-0" style={{ gap: 8, alignItems: 'center' }}>
              {campOpts.length > 0 && <FilterDropdown label="แคมเปญ" icon="megaphone" options={campOpts} value={filterCamp} onChange={setFilterCamp} />}
              {respOpts.length > 0 && <FilterDropdown label="หน้าที่" icon="shield" options={respOpts} value={filterResp} onChange={setFilterResp} />}
              <FilterDropdown label="ความสำคัญ" icon="target" options={prioOpts} value={filterPriority} onChange={setFilterPriority} />
              {tagOpts.length > 0 && <FilterDropdown label="แท็ก" icon="star" options={tagOpts} value={filterTags} onChange={setFilterTags} />}
              {chanOpts.length > 0 && <FilterDropdown label="ช่องทาง" icon="layers" options={chanOpts} value={filterChannel} onChange={setFilterChannel} />}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export function filterTasks(tasks, opts) {
  const { filterCamp, filterStatus, search, filterResp, doneIds,
    filterPriority, filterTags, filterChannel, filterDateFrom, filterDateTo } = opts || {};
  const isDone = (s) => doneIds ? doneIds.has(s) : s === 'done';
  return (tasks || []).filter(t => {
    if (filterCamp?.length && !filterCamp.includes(t.camp)) return false;
    if (filterResp?.length && !(t.responsible || []).some(r => filterResp.includes(r))) return false;
    if (filterPriority?.length && !filterPriority.includes(t.priority || 'medium')) return false;
    if (filterTags?.length && !(t.tags || []).some(tg => filterTags.includes(tg))) return false;
    if (filterChannel?.length && !tokenizeCh(t.channel).some(tok => filterChannel.includes(tok))) return false;
    if (filterStatus === 'active' && isDone(t.status)) return false;
    if (filterStatus === 'done' && !isDone(t.status)) return false;
    // ช่วงวันที่ — overlap งาน [start..end] กับช่วงที่เลือก [from..to] (เทียบ ISO ตรงๆ ได้)
    if (filterDateFrom || filterDateTo) {
      const start = t.dateISO || '';
      const end = t.dateEnd || t.dateISO || '';
      if (!start) return false;
      if (filterDateFrom && end < filterDateFrom) return false;
      if (filterDateTo && start > filterDateTo) return false;
    }
    if (search) {
      const ql = String(search).toLowerCase();
      const title = String(t.title || '').toLowerCase();
      if (!title.includes(ql)) return false;
    }
    return true;
  });
}
