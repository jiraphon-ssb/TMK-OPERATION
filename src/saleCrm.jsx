/* ============================================================
   saleCrm.jsx — CRM ลูกค้า: directory จากตาราง tmk_mp_customers (เร็ว ไม่สแกนออเดอร์ทั้งหมด)
   - รายชื่อ/ยอดสะสม/ตามต่อ มาจากตารางลูกค้าโดยตรง
   - ประวัติการซื้อรายคน โหลดตอนกดเข้าดู (lazy) — เร็ว
   ============================================================ */
import { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { N, Icon, Skel, SkelTable, useDelayedFlag } from './components.jsx';
import { SideSheet } from './modals.jsx';
import { MetricCard } from './charts.jsx';
import { rfmTiers } from './lib/saleAgg.js';
import { cachedFetchAll, CUST_SEL } from './lib/saleData.js';
import { usePersistedState } from './hooks/usePersistedState.js';
import { downloadCsv } from './lib/exportCsv.js';
import { useTableSort, SortHead, DensityToggle, ColumnToggle } from './components/DataTableParts.jsx';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { SearchInput } from '@/components/ui/search-input';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';

const baht = (n) => '฿' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayISO = () => new Date().toISOString().slice(0, 10);
const TIER_CHIP = { 'เพชร': 'tier-chip-diamond', 'ทอง': 'tier-chip-gold', 'เงิน': 'tier-chip-silver', 'ทองแดง': 'tier-chip-bronze' };
// ---- DataTable: คอลัมน์ที่ซ่อน/โชว์ได้ (name/sales locked เป็นแกนหลัก) + accessor สำหรับ sort ----
const CRM_COLS = [
  { key: 'name', label: 'ลูกค้า', locked: true },
  { key: 'contact', label: 'เบอร์/ติดต่อ' },
  { key: 'tier', label: 'ระดับ' },
  { key: 'cadence', label: 'ตามต่อ' },
  { key: 'sales', label: 'ยอดซื้อ', locked: true },
  { key: 'count', label: 'ครั้ง' },
  { key: 'recency', label: 'ซื้อล่าสุด' },
];
const CRM_SORT = {
  name: (c) => (c.name || '').toLowerCase(),
  sales: (c) => c.sales || 0,
  count: (c) => c.count || 0,
  recency: (c) => (c.recency == null ? Infinity : c.recency), // ใหม่สุด = recency น้อย
};
const initial = (s = '') => (String(s).trim().replace(/^[0-9]+/, '').slice(0, 2) || '?').toUpperCase();
const PER_PAGE = 50;
// สถานะลูกค้า — ป้าย → predicate (เลือกหลายอันได้ = OR เหมือนตัวกรองหน้าออเดอร์)
const STATUS_PRED = {
  'คิวตามต่อ': c => c.queue,
  'ลูกค้าใหม่มีเบอร์': c => c.hasContact && (c.newCount > 0 || c.count === 1),
  'ซื้อซ้ำ': c => c.repeat,
  'เสี่ยงหลุด': c => c.recency != null && c.recency >= 35 && c.count >= 2,
  'มีเบอร์': c => c.hasContact,
};
const STATUS_OPTS = Object.keys(STATUS_PRED);

// ตัวกรอง dropdown แบบเดียวกับหน้าออเดอร์ (เลือกหลายอัน + เช็คบ็อกซ์)
function MultiSelect({ label, options, value, onChange }) {
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
function _pageList(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out = [1];
  const lo = Math.max(2, cur - 1), hi = Math.min(total - 1, cur + 1);
  if (lo > 2) out.push('…');
  for (let p = lo; p <= hi; p++) out.push(p);
  if (hi < total - 1) out.push('…');
  out.push(total);
  return out;
}

// โหลดลูกค้า — รองรับกรณีตารางยังไม่มีคอลัมน์ last_order (fallback)
async function loadCustomers() {
  let r = await cachedFetchAll('tmk_mp_customers', CUST_SEL + ',last_order');
  if (r.error && /last_order/i.test(r.error.message || '')) r = await cachedFetchAll('tmk_mp_customers', CUST_SEL);
  return r;
}

// directory จากตารางลูกค้า + เซลล์กรอกเอง (ไม่สแกนออเดอร์ — ใช้ยอดสะสมที่เก็บไว้)
function buildDirectory(profiles, entries, asOf) {
  const m = new Map();
  (profiles || []).forEach(p => m.set(p.customer_code, {
    key: p.customer_code, name: p.name || p.customer_code, contact: p.phone || '',
    salesperson: p.owner || '', sales: Number(p.lifetime_sales) || 0, count: Number(p.lifetime_orders) || 0,
    last: p.last_order || '', province: p.province || '', owner: p.owner || '', cadence: p.cadence || '',
    repurchase: p.repurchase || 0, tags: Array.isArray(p.tags) ? p.tags : [], address: p.address || '',
    district: p.district || '', postcode: p.postcode || '', social: p.social_name || '', since: p.since || '',
    ltSales: Number(p.lifetime_sales) || 0, ltOrders: Number(p.lifetime_orders) || 0, ltCancel: Number(p.lifetime_cancel) || 0,
    profile: p, newCount: 0,
  }));
  // ลูกค้าที่เซลล์กรอกเอง (ยังไม่มีโปรไฟล์) — จับด้วยเบอร์/ชื่อ
  (entries || []).forEach(e => {
    const key = (e.customer_contact || e.customer_name || '').trim(); if (!key) return;
    const k = 'se:' + key;
    let r = m.get(k); if (!r) { r = { key: k, name: e.customer_name || key, contact: e.customer_contact || '', salesperson: e.salesperson || '', sales: 0, count: 0, last: '', tags: [], newCount: 0, fromEntry: true }; m.set(k, r); }
    r.sales += Number(e.sales) || 0; r.count += 1;
    if ((e.order_date || '') > r.last) r.last = e.order_date || '';
    if (['ใหม่', 'ลูกค้าใหม่'].includes(e.customer_type)) r.newCount += 1;
  });
  const arr = [...m.values()];
  const { rows: tiered } = rfmTiers(arr.map(r => ({ ...r, orders: r.count })), asOf);
  const tmap = new Map(tiered.map(t => [t.key, t]));
  return arr.map(r => { const t = tmap.get(r.key) || {}; return { ...r, aov: r.count ? r.sales / r.count : 0, recency: t.recency, tier: t.tier, flag: t.flag, repeat: (r.ltOrders || r.count) > 1, hasContact: !!r.contact, queue: !!(r.cadence || r.owner) }; }).sort((a, b) => b.sales - a.sales);
}

/* Skeleton ตรง layout CRM: 4 การ์ดเมตริก + แถบกรอง + ตารางลูกค้า */
function CrmSkeleton() {
  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      <div className="metric-grid">
        {Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-[22px]"><Skel w="52%" h={10} /><Skel w="64%" h={24} style={{ marginTop: 11 }} /><Skel w="80%" h={9} style={{ marginTop: 11 }} /></Card>)}
      </div>
      <Card className="p-4">
        <div className="row between" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{Array.from({ length: 6 }).map((_, i) => <Skel key={i} w={i % 2 ? 84 : 64} h={26} r={8} />)}</div>
          <div className="row" style={{ gap: 6 }}><Skel w={120} h={28} r={8} /><Skel w={180} h={28} r={8} /></div>
        </div>
        <SkelTable cols={7} rows={9} />
      </Card>
    </div>
  );
}

export function CrmView() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = usePersistedState('tmk-crm-statusF', []);
  const [ownerF, setOwnerF] = usePersistedState('tmk-crm-ownerF', []);
  const [sel, setSel] = useState(null);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [density, setDensity] = usePersistedState('tmk-crm-density', 'cozy');
  const [hiddenCols, setHiddenCols] = usePersistedState('tmk-crm-hiddenCols', []);
  const colVisible = useMemo(() => new Set(CRM_COLS.map(c => c.key).filter(k => !hiddenCols.includes(k))), [hiddenCols]);
  const toggleCol = (k) => setHiddenCols(hc => hc.includes(k) ? hc.filter(x => x !== k) : [...hc, k]);

  useEffect(() => { (async () => {
    const [p, e] = await Promise.all([loadCustomers(), cachedFetchAll('tmk_sale_entries', '*')]);
    if (p.error) { setErr(p.error.message); return; }
    setData(buildDirectory(p.data || [], e.error ? [] : (e.data || []), todayISO()));
  })(); }, []);

  const owners = useMemo(() => [...new Set((data || []).map(c => c.owner).filter(Boolean))].sort(), [data]);

  const filtered = useMemo(() => {
    let r = data || [];
    if (statusF.length) r = r.filter(c => statusF.some(s => STATUS_PRED[s] && STATUS_PRED[s](c)));
    if (ownerF.length) r = r.filter(c => ownerF.includes(c.owner));
    const ql = q.trim().toLowerCase();
    if (ql) r = r.filter(c => `${c.name} ${c.contact} ${c.salesperson} ${c.province}`.toLowerCase().includes(ql));
    return r;
  }, [data, statusF, ownerF, q]);

  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(filtered, { key: 'sales', dir: 'desc', accessors: CRM_SORT });
  useEffect(() => { setPage(1); }, [statusF, ownerF, q, sortKey, sortDir]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const pageClamped = Math.min(page, totalPages);
  const pageRows = sorted.slice((pageClamped - 1) * PER_PAGE, pageClamped * PER_PAGE);
  const nFilters = statusF.length + ownerF.length;
  const activeChips = [
    ...statusF.map(v => ({ dim: 'สถานะ', v, clear: () => setStatusF(statusF.filter(x => x !== v)) })),
    ...ownerF.map(v => ({ dim: 'เซลล์', v, clear: () => setOwnerF(ownerF.filter(x => x !== v)) })),
  ];
  const clearFilters = () => { setStatusF([]); setOwnerF([]); };

  const showSkel = useDelayedFlag(!data, 120); // โผล่หลัง 120ms · อยู่อย่างน้อย 300ms · cache ไว → เด้งทันที
  if (err) return <div className="content-inner"><Card className="p-5" style={{ color: 'var(--bad)' }}>{err}</Card></div>;
  if (showSkel) return <CrmSkeleton />;
  if (!data) return null;

  const total = data.length;
  const withContact = data.filter(c => c.hasContact).length;
  const queue = data.filter(c => c.queue).length;
  const risk = data.filter(c => c.recency != null && c.recency >= 35 && c.count >= 2).length;
  const noProfile = !data.some(c => c.profile);

  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      {noProfile && <Card className="p-3" style={{ background: 'var(--accent-soft)' }}><span className="cap" style={{ color: 'var(--ink-3)' }}><Icon name="lightbulb" /> ยังไม่มีเบอร์/โปรไฟล์ลูกค้า — นำเข้าไฟล์ Shipnity ที่หน้า <b>ข้อมูล</b> แล้วเบอร์โทร · ที่อยู่ · สถานะตามต่อจะมาเติมที่นี่</span></Card>}
      <div className="metric-grid">
        <MetricCard label="ลูกค้าทั้งหมด" value={N(total)} icon="users" />
        <MetricCard label="มีเบอร์/ติดต่อได้" value={N(withContact)} icon="user" sub={`${total ? Math.round(withContact / total * 100) : 0}% ตามต่อได้`} tone="var(--accent)" />
        <MetricCard label="คิวตามต่อ" value={N(queue)} icon="target" sub="เซลล์ติดสถานะไว้แล้ว" tone="var(--good)" />
        <MetricCard label="เสี่ยงหลุด" value={N(risk)} icon="shield" sub="ขาประจำที่หาย ≥35 วัน" tone="var(--warn)" />
      </div>

      <Card className="p-4">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 p-0 pb-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-[18px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="users" /></span>
            <div className="min-w-0">
              <h3 className="m-0 text-base font-bold leading-tight" style={{ color: 'var(--ink)' }}>ลูกค้า (CRM)</h3>
              <p className="m-0 mt-0.5 text-xs" style={{ color: 'var(--ink-4)' }}>แสดง {N(filtered.length)} ราย · คลิกแถวเพื่อดูประวัติ + โทรตามต่อ</p>
            </div>
          </div>
        </CardHeader>
        <SearchInput value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา ชื่อลูกค้า / เบอร์ / จังหวัด / เซลล์" wrapperClassName="mb-3" />
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 rounded-full">
                <Icon name="filter" /> ตัวกรอง{nFilters > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{nFilters}</Badge>}
                <Icon name={filtersOpen ? 'up' : 'down'} />
              </Button>
            </CollapsibleTrigger>
            {activeChips.length > 0
              ? activeChips.map(({ dim, v, clear }) => <Badge key={dim + v} variant="outline" onClick={clear} title="คลิกเพื่อเอาออก" style={{ cursor: 'pointer', padding: '2px 8px' }}><span style={{ color: 'var(--ink-4)' }}>{dim}:</span> {v || '(ไม่ระบุ)'} <Icon name="x" /></Badge>)
              : <span className="cap" style={{ color: 'var(--ink-4)' }}>ยังไม่ได้กรอง — แสดงทุกราย</span>}
            {nFilters > 0 && <Button variant="ghost" size="sm" className="text-[var(--bad)] ml-auto" onClick={clearFilters}><Icon name="x" /> ล้าง</Button>}
            <Button variant="outline" size="sm" className={'h-8 gap-1.5 font-normal' + (nFilters > 0 ? '' : ' ml-auto')} disabled={!filtered.length}
              onClick={() => downloadCsv(`ลูกค้า_CRM_${filtered.length}ราย`, filtered, [
                { label: 'ลำดับ', map: (c) => filtered.indexOf(c) + 1 },
                { label: 'ชื่อลูกค้า', key: 'name' },
                { label: 'เบอร์/ติดต่อ', key: 'contact' },
                { label: 'จังหวัด', key: 'province' },
                { label: 'เซลล์', map: (c) => c.owner || c.salesperson || '' },
                { label: 'ระดับ', key: 'tier' },
                { label: 'ตามต่อ', key: 'cadence' },
                { label: 'ซื้อซ้ำ', key: 'repurchase' },
                { label: 'ยอดซื้อสะสม', key: 'sales' },
                { label: 'จำนวนครั้ง', key: 'count' },
                { label: 'ซื้อล่าสุด', key: 'last' },
              ])} title="ส่งออกลูกค้าตามตัวกรองปัจจุบัน">
              <Icon name="external" /> CSV
            </Button>
            <ColumnToggle columns={CRM_COLS} visible={colVisible} onToggle={toggleCol} />
            <DensityToggle value={density} onChange={setDensity} />
          </div>
          <CollapsibleContent>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingTop: 12, marginTop: 10, borderTop: '1px solid var(--line)' }}>
              <span className="cap" style={{ color: 'var(--ink-4)', fontWeight: 600, width: 64, flexShrink: 0 }}>ตัวกรอง</span>
              <MultiSelect label="สถานะ" options={STATUS_OPTS} value={statusF} onChange={setStatusF} />
              {owners.length > 0 && <MultiSelect label="เซลล์" options={owners} value={ownerF} onChange={setOwnerF} />}
            </div>
          </CollapsibleContent>
        </Collapsible>
        <div className={'table-wrap ' + density}><Table>
          <TableHeader><TableRow>
            <SortHead field="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>ลูกค้า</SortHead>
            {colVisible.has('contact') && <TableHead>เบอร์/ติดต่อ</TableHead>}
            {colVisible.has('tier') && <TableHead>ระดับ</TableHead>}
            {colVisible.has('cadence') && <TableHead>ตามต่อ</TableHead>}
            <SortHead field="sales" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">ยอดซื้อ</SortHead>
            {colVisible.has('count') && <SortHead field="count" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">ครั้ง</SortHead>}
            {colVisible.has('recency') && <SortHead field="recency" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">ซื้อล่าสุด</SortHead>}
          </TableRow></TableHeader>
          <TableBody>{pageRows.map((c, i) => (
            <TableRow key={c.key} className={c.flag === 'เสี่ยงหลุด' ? 'crm-row-risk' : c.queue ? 'crm-row-queue' : ''} onClick={() => setSel(c)} style={{ cursor: 'pointer' }}>
              <TableCell>
                <div className="crm-person">
                  <span className={`crm-avatar ${!c.contact ? 'muted' : ''}`}>{initial(c.name)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="crm-name"><span className="num" style={{ color: 'var(--ink-4)', marginRight: 6, fontWeight: 500 }}>{(pageClamped - 1) * PER_PAGE + i + 1}</span>{c.name}</div>
                    <div className="cap" style={{ color: 'var(--ink-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.province || c.salesperson || '—'}</div>
                  </div>
                </div>
              </TableCell>
              {colVisible.has('contact') && <TableCell className="cap">{c.contact ? <Badge variant="outline" style={{ fontSize: 11 }}><Icon name="user" /> {c.contact}</Badge> : <Badge variant="destructive">ไม่มีเบอร์</Badge>}</TableCell>}
              {colVisible.has('tier') && <TableCell>{c.tier && <span className={`tier-chip ${TIER_CHIP[c.tier] || ''}`}>{c.tier}</span>}</TableCell>}
              {colVisible.has('cadence') && <TableCell className="cap">{c.cadence && <Badge variant="outline" style={{ fontSize: 10, color: c.cadence === '0D' ? 'var(--accent)' : 'var(--warn)' }}>{c.cadence}</Badge>}{c.repurchase > 0 && <Badge variant="secondary" style={{ fontSize: 10, color: 'var(--good)' }}>ซ้ำ×{c.repurchase}</Badge>}{c.owner && <span className="cap" style={{ color: 'var(--ink-4)', marginLeft: 4 }}>{c.owner}</span>}</TableCell>}
              <TableCell className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{baht(c.sales)}</TableCell>
              {colVisible.has('count') && <TableCell className="num" style={{ textAlign: 'right' }}>{N(c.count)}</TableCell>}
              {colVisible.has('recency') && <TableCell className="num cap" style={{ textAlign: 'right', color: 'var(--ink-3)' }}>{c.last || '—'}{c.recency != null ? ` (${c.recency}ว.)` : ''}</TableCell>}
            </TableRow>
          ))}</TableBody>
        </Table></div>
        {filtered.length > PER_PAGE && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="cap" style={{ color: 'var(--ink-4)' }}>แสดง {N((pageClamped - 1) * PER_PAGE + 1)}–{N(Math.min(pageClamped * PER_PAGE, filtered.length))} จาก {N(filtered.length)} ราย</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="gap-1" disabled={pageClamped <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}><Icon name="left" /> ก่อนหน้า</Button>
              {_pageList(pageClamped, totalPages).map((p, i) => p === '…'
                ? <span key={'e' + i} className="px-1.5 text-[var(--ink-4)]">…</span>
                : <Button key={p} variant={p === pageClamped ? 'default' : 'outline'} size="sm" className="min-w-9 px-0" onClick={() => setPage(p)}>{p}</Button>)}
              <Button variant="outline" size="sm" className="gap-1" disabled={pageClamped >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>ถัดไป <Icon name="right" /></Button>
            </div>
          </div>
        )}
      </Card>

      {sel && <CustomerDetail c={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function CrmField({ label, children, full }) {
  return <div style={full ? { gridColumn: '1 / -1' } : undefined}><span className="cap">{label}</span><b>{children}</b></div>;
}
function CrmGroup({ icon, title, children }) {
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
function CustomerDetail({ c, onClose }) {
  const [orders, setOrders] = useState(null);
  useEffect(() => { (async () => {
    if (!c.key || c.key.startsWith('se:')) { setOrders([]); return; }  // เซลล์กรอก: ไม่มีออเดอร์มาร์เก็ตเพลส
    const { data: ods } = await supabase.from('tmk_mp_orders').select('order_no,marketplace_id,channel,sales,qty,order_date,status').eq('customer_code', c.key);
    const act = (ods || []).filter(o => o.status !== 'cancelled');
    const mid2ono = new Map(act.filter(o => o.marketplace_id && o.marketplace_id !== '-').map(o => [o.marketplace_id, o.order_no]));
    const keys = [...act.map(o => o.order_no), ...mid2ono.keys()];
    let skuRows = [];
    if (keys.length) { const { data: sk } = await supabase.from('tmk_mp_skus').select('order_no,design').in('order_no', keys); skuRows = sk || []; }
    const desByOrder = {}; skuRows.forEach(s => { const on = mid2ono.get(s.order_no) || s.order_no; if (s.design) (desByOrder[on] = desByOrder[on] || []).push(s.design); });
    const hist = act.map(o => ({ date: o.order_date, order_no: o.order_no, channel: o.channel, sales: Number(o.sales) || 0, qty: Number(o.qty) || 0, design: [...new Set(desByOrder[o.order_no] || [])].join(', ') })).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    setOrders(hist);
  })(); }, [c.key]);
  const designs = orders ? [...new Set(orders.flatMap(o => o.design ? o.design.split(', ') : []).filter(Boolean))] : [];
  const addr = c.address || (c.province ? `${c.district ? c.district + ' · ' : ''}${c.province} ${c.postcode || ''}` : '');
  return (
    <SideSheet size="lg" icon="user" title={c.name} sub={`${c.tier || ''} · ${baht(c.ltSales || c.sales)} · ${N(c.ltOrders || c.count)} ครั้ง`} onClose={onClose} footer={<Button variant="outline" onClick={onClose}>ปิด</Button>}>
      <div className="quality-row" style={{ marginBottom: 14, gap: 8, alignItems: 'center' }}>
        {c.contact
          ? <Button size="sm" asChild><a href={`tel:${c.contact}`} style={{ textDecoration: 'none' }}><Icon name="phone" /> โทร {c.contact}</a></Button>
          : <Badge variant="destructive" className="rounded-full">ไม่มีเบอร์</Badge>}
        {c.cadence && <Badge variant="outline" className="rounded-full" style={{ color: c.cadence === '0D' ? 'var(--accent)' : 'var(--warn)' }}>ตามต่อ {c.cadence}</Badge>}
        {c.repurchase > 0 && <Badge variant="outline" className="rounded-full" style={{ color: 'var(--good)' }}>ซื้อซ้ำรอบ {c.repurchase}</Badge>}
        {c.flag && <Badge variant="outline" className="rounded-full" style={{ color: c.flag === 'เสี่ยงหลุด' ? 'var(--bad)' : 'var(--accent)' }}>{c.flag}</Badge>}
      </div>

      <div className="mb-4 flex items-stretch overflow-hidden rounded-xl border" style={{ borderColor: 'var(--line)' }}>
        {[
          { label: c.ltSales ? 'ยอดซื้อรวม (Shipnity)' : 'ยอดซื้อรวม', val: baht(c.ltSales || c.sales), color: 'var(--accent)' },
          { label: 'จำนวนครั้ง', val: N(c.ltOrders || c.count) },
          { label: 'เฉลี่ย/ครั้ง', val: baht(c.aov) },
          { label: 'ซื้อล่าสุด', val: c.recency != null ? `${N(c.recency)} วันก่อน` : (c.last || '—') },
        ].map((m, i) => (
          <div key={m.label} className="flex-1 px-3 py-2.5 text-center" style={i > 0 ? { borderLeft: '1px solid var(--line)' } : undefined}>
            <div className="text-[15px] font-bold leading-tight tabular-nums" style={{ color: m.color || 'var(--ink)' }}>{m.val}</div>
            <div className="mt-0.5 text-[11px]" style={{ color: 'var(--ink-4)' }}>{m.label}</div>
          </div>
        ))}
      </div>

      <CrmGroup icon="user" title="ข้อมูลลูกค้า">
        {c.social && <CrmField label="โซเชียล">@{c.social}</CrmField>}
        {(c.owner || c.salesperson) && <CrmField label={c.owner ? 'เจ้าของ' : 'เซลล์'}><span style={{ color: c.owner ? 'var(--good)' : 'var(--ink)' }}>{c.owner || c.salesperson}</span></CrmField>}
        {c.province && <CrmField label="จังหวัด">{c.province}</CrmField>}
        {c.since && <CrmField label="เป็นลูกค้าตั้งแต่">{c.since}</CrmField>}
        {c.last && <CrmField label="ซื้อล่าสุด">{c.last}</CrmField>}
        {addr && <CrmField label="ที่อยู่จัดส่ง" full><span className="row" style={{ gap: 6, alignItems: 'flex-start' }}><span className="shrink-0 [&_svg]:size-[14px]" style={{ color: 'var(--ink-4)', marginTop: 1 }}><Icon name="box" /></span>{addr}</span></CrmField>}
      </CrmGroup>

      {!c.contact && <div className="cap mt-3" style={{ color: 'var(--ink-4)' }}>ยังไม่มีเบอร์ — นำเข้าไฟล์ Shipnity เพื่อเติมเบอร์ให้ลูกค้ากลุ่มนี้</div>}
      {designs.length > 0 && <div style={{ marginTop: 16 }}><div className="cap mb-2" style={{ fontWeight: 600, color: 'var(--ink-3)' }}>ลายที่เคยซื้อ</div><div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{designs.map(d => <Badge key={d} variant="outline">{d}</Badge>)}</div></div>}
      {c.tags && c.tags.length > 0 && <div style={{ marginTop: 16 }}><div className="cap mb-2" style={{ fontWeight: 600, color: 'var(--ink-3)' }}>ป้ายลูกค้า (ที่เซลล์ติดไว้)</div><div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{c.tags.map((t, i) => <Badge key={i} variant="accent" style={{ fontSize: 11 }}>{t}</Badge>)}</div></div>}
      <div className="cap mb-2" style={{ fontWeight: 600, color: 'var(--ink-3)', marginTop: 16 }}>ประวัติการซื้อ {orders ? `(${N(orders.length)})` : ''}</div>
      {orders === null ? <div className="cap" style={{ color: 'var(--ink-4)', padding: 12 }}>กำลังโหลดประวัติ…</div>
        : orders.length === 0 ? <div className="cap" style={{ color: 'var(--ink-4)', padding: 12 }}>ไม่มีประวัติออเดอร์ในระบบ</div>
          : <div className="table-wrap" style={{ maxHeight: 300, overflow: 'auto' }}><Table>
            <TableHeader><TableRow><TableHead>วันที่</TableHead><TableHead>ออเดอร์</TableHead><TableHead>ช่อง</TableHead><TableHead>ลาย</TableHead><TableHead style={{ textAlign: 'right' }}>ยอด</TableHead><TableHead style={{ textAlign: 'right' }}>ตัว</TableHead></TableRow></TableHeader>
            <TableBody>{orders.map((o, i) => <TableRow key={i}><TableCell className="cap">{o.date}</TableCell><TableCell className="num">{o.order_no}</TableCell><TableCell className="cap">{o.channel}</TableCell><TableCell className="cap">{o.design || '—'}</TableCell><TableCell className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{baht(o.sales)}</TableCell><TableCell className="num" style={{ textAlign: 'right' }}>{N(o.qty)}</TableCell></TableRow>)}</TableBody>
          </Table></div>}
    </SideSheet>
  );
}
