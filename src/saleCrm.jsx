/* ============================================================
   saleCrm.jsx — ลูกค้า (CRM) · PART 45: ครบจบพร้อมใช้งาน + UI คลีน
   ============================================================
   - ยอด/ครั้ง/ซื้อล่าสุด = คำนวณสดจาก tmk_mp_orders (คีย์ customer_code จากใบเสร็จ
     · fallback 'N'+ชื่อ สำหรับออเดอร์เก่าที่ code ว่าง) → ยกเลิกใบแล้วยอดหายทันที
   - โปรไฟล์ (เบอร์/ที่อยู่/เจ้าของ/แท็ก/โน้ต) = tmk_mp_customers · แก้ไขได้ใน drawer
   - "สร้างงานติดตาม" → เปิดงานใหม่ในระบบโครงการ (prefill ชื่อ/รายละเอียด)
   - Insight ต่อลูกค้า: ลาย/สี/ไซซ์ที่ซื้อบ่อย (จาก tmk_mp_skus · lazy ตอนเปิด drawer)
   ============================================================ */
import { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { N, Icon, Skel, SkelTable, useDelayedFlag } from './components.jsx';
import { SideSheet } from './modals.jsx';
import { rfmTiers } from './lib/saleAgg.js';
import { cachedFetchAll, CUST_SEL, invalidateSaleCache } from './lib/saleData.js';
import { usePersistedState } from './hooks/usePersistedState.js';
import { downloadCsv } from './lib/exportCsv.js';
import { logAudit } from './lib/audit.js';
import { useTableSort, SortHead, CardTable } from './components/DataTableParts.jsx';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { SearchInput } from '@/components/ui/search-input';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';

const baht = (n) => '฿' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayISO = () => new Date().toISOString().slice(0, 10);
const num = (v) => Number(v) || 0;
const toast = (m, t) => window.__toast && window.__toast(m, t);
const TIER_CHIP = { 'เพชร': 'tier-chip-diamond', 'ทอง': 'tier-chip-gold', 'เงิน': 'tier-chip-silver', 'ทองแดง': 'tier-chip-bronze' };
const TIERS = ['เพชร', 'ทอง', 'เงิน', 'ทองแดง'];
const initial = (s = '') => (String(s).trim().replace(/^[0-9]+/, '').slice(0, 2) || '?').toUpperCase();
const PER_PAGE = 50;
const CRM_SORT = {
  name: (c) => (c.name || '').toLowerCase(),
  sales: (c) => c.sales || 0,
  count: (c) => c.count || 0,
  recency: (c) => (c.recency == null ? Infinity : c.recency), // ใหม่สุด = recency น้อย
};
// สถานะลูกค้า — ป้าย → predicate (เลือกหลายอัน = OR)
const STATUS_PRED = {
  'ลูกค้าใหม่': c => c.flag === 'ใหม่',
  'ซื้อซ้ำ': c => c.repeat,
  'เสี่ยงหลุด': c => c.flag === 'เสี่ยงหลุด',
  'มีเบอร์': c => c.hasContact,
  'คิวตามต่อ': c => c.queue,
};
const STATUS_OPTS = Object.keys(STATUS_PRED);

/* ---------- ตัวกรอง dropdown (เลือกหลายอัน + เช็คบ็อกซ์ — แพทเทิร์นเดียวกับหน้าออเดอร์) ---------- */
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

/* ---------- โหลดข้อมูล ---------- */
// โปรไฟล์ — graceful เมื่อคอลัมน์เสริม (note/contact_channel/last_order) ยังไม่มี
async function loadProfiles() {
  let r = await cachedFetchAll('tmk_mp_customers', CUST_SEL + ',contact_channel,note,last_order');
  if (r.error && /contact_channel|note|last_order|column/i.test(r.error.message || '')) r = await cachedFetchAll('tmk_mp_customers', CUST_SEL);
  return r;
}
const ORDERS_CRM_SEL = 'order_no,customer_code,customer_name,customer_social,channel,salesperson,province,sales,qty,order_date,status';

/* ---------- รวม directory: โปรไฟล์ + ออเดอร์สด + เซลล์กรอกเอง ---------- */
function buildDirectory(profiles, orders, asOf) {
  const m = new Map();
  const ensure = (key) => {
    let r = m.get(key);
    if (!r) {
      r = { key, name: '', contact: '', social: '', address: '', district: '', postcode: '', province: '', owner: '', cadence: '', note: '', contactChannel: '', repurchase: 0, tags: [], since: '', salesperson: '', sales: 0, count: 0, qty: 0, first: '', last: '', channels: new Map(), orders: [], ltSales: 0, ltOrders: 0, profile: null };
      m.set(key, r);
    }
    return r;
  };
  const isMasked = (v) => /\*{2,}/.test(String(v || ''));
  // 1) โปรไฟล์ (tmk_mp_customers) — ข้อมูลติดต่อ/เจ้าของ/แท็ก (ข้ามโปรไฟล์ปกปิดที่หลุดเข้ามาก่อนหน้า)
  (profiles || []).forEach(p => {
    if (isMasked(p.name) || isMasked(p.customer_code)) return;
    const r = ensure(p.customer_code);
    r.profile = p; r.name = p.name || p.customer_code; r.contact = p.phone || '';
    r.social = p.social_name || ''; r.address = p.address || ''; r.district = p.district || ''; r.postcode = p.postcode || '';
    r.province = p.province || ''; r.owner = p.owner || ''; r.cadence = p.cadence || ''; r.note = p.note || '';
    r.contactChannel = p.contact_channel || ''; r.repurchase = num(p.repurchase);
    r.tags = Array.isArray(p.tags) ? p.tags : []; r.since = p.since || '';
    r.ltSales = num(p.lifetime_sales); r.ltOrders = num(p.lifetime_orders);
    if (p.last_order && p.last_order > r.last) r.last = p.last_order;   // fallback — ออเดอร์สดทับทีหลัง
  });
  // 2) ออเดอร์สด (tmk_mp_orders) — ยอด/ครั้ง/ล่าสุด ต่อคน (ตัดใบยกเลิก → ยอดไม่ค้าง)
  const orderKey = (o) => {
    // ลูกค้าปกปิด (Shopee mask "ณ******์") → ไม่คลัสเตอร์ (เช็คชื่อ/รหัสก่อน · ครอบออเดอร์เก่าที่ code เป็นคีย์ปกปิด)
    if (isMasked(o.customer_name) || isMasked(o.customer_code)) return '';
    const c = String(o.customer_code || '').trim();
    if (c) return c;
    const n = String(o.customer_name || '').trim();
    return n ? 'N' + n.slice(0, 60) : '';   // ออเดอร์เก่า code ว่าง — จับด้วยชื่อ (คีย์เดียวกับโปรไฟล์ N)
  };
  (orders || []).forEach(o => {
    if (o.status === 'cancelled') return;
    const k = orderKey(o); if (!k) return;   // ไม่มีชื่อ/รหัสลูกค้า (มาร์เก็ตเพลสนิรนาม) — ไม่ขึ้น CRM
    const r = ensure(k);
    if (!r.name) r.name = o.customer_name || k;
    if (!r.social) r.social = o.customer_social || '';
    if (!r.province) r.province = o.province || '';
    if (!r.salesperson) r.salesperson = o.salesperson || '';
    r.sales += num(o.sales); r.count += 1; r.qty += num(o.qty);
    const d = o.order_date || '';
    if (d && (!r.first || d < r.first)) r.first = d;
    if (d > r.last) r.last = d;
    if (o.channel) r.channels.set(o.channel, (r.channels.get(o.channel) || 0) + 1);
    r.orders.push({ date: d, order_no: o.order_no, channel: o.channel || '', sales: num(o.sales), qty: num(o.qty) });
  });
  const arr = [...m.values()];
  // โปรไฟล์เก่าจาก import (CE####) ที่ไม่มีออเดอร์สดในระบบ → โชว์ยอดสะสมเดิม (อ่านอย่างเดียว)
  arr.forEach(r => { if (r.count === 0 && r.ltOrders > 0) { r.sales = r.ltSales; r.count = r.ltOrders; } });
  const { rows: tiered } = rfmTiers(arr.map(r => ({ ...r, orders: r.count })), asOf);
  const tmap = new Map(tiered.map(t => [t.key, t]));
  return arr.map(r => {
    const t = tmap.get(r.key) || {};
    const mainChannel = [...r.channels.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || r.contactChannel || '';
    return {
      ...r, orders: r.orders.sort((a, b) => (b.date || '').localeCompare(a.date || '')),
      aov: r.count ? r.sales / r.count : 0,
      recency: t.recency, tier: t.tier, flag: t.flag,
      repeat: r.count > 1, hasContact: !!r.contact, queue: !!(r.cadence || r.owner), mainChannel,
    };
  }).sort((a, b) => b.sales - a.sales);
}

/* ---------- แถบสรุปแบบ inline (แพทเทิร์น HealthStat — PART 42) ---------- */
const CrmStat = ({ label, value, tone }) => (
  <div style={{ minWidth: 84 }}>
    <div className="cap" style={{ color: 'var(--ink-4)' }}>{label}</div>
    <div className="num" style={{ fontWeight: 800, fontSize: 20, lineHeight: 1.2, color: tone || 'var(--ink-1)' }}>{value}</div>
  </div>
);

/* ---------- Skeleton (แถบสรุป + ตาราง) ---------- */
function CrmSkeleton() {
  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      <Card className="p-4"><div className="row" style={{ gap: 26, flexWrap: 'wrap' }}>{Array.from({ length: 5 }).map((_, i) => <div key={i}><Skel w={64} h={9} /><Skel w={48} h={20} style={{ marginTop: 7 }} /></div>)}</div></Card>
      <Card className="p-4">
        <div className="row between" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 12 }}><Skel w={160} h={16} /><Skel w={90} h={28} r={8} /></div>
        <Skel w="100%" h={34} r={9} style={{ marginBottom: 12 }} />
        <SkelTable cols={6} rows={9} />
      </Card>
    </div>
  );
}

/* ============================================================
   หน้า ลูกค้า (CRM)
   ============================================================ */
export function CrmView() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = usePersistedState('tmk-crm-statusF', []);
  const [ownerF, setOwnerF] = usePersistedState('tmk-crm-ownerF', []);
  const [channelF, setChannelF] = usePersistedState('tmk-crm-channelF', []);
  const [provF, setProvF] = usePersistedState('tmk-crm-provF', []);
  const [tierF, setTierF] = usePersistedState('tmk-crm-tierF', []);
  const [sel, setSel] = useState(null);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => { (async () => {
    const [p, o] = await Promise.all([
      loadProfiles(),
      cachedFetchAll('tmk_mp_orders', ORDERS_CRM_SEL),
    ]);
    if (p.error) { setErr(p.error.message); return; }
    setData(buildDirectory(p.data || [], o.error ? [] : (o.data || []), todayISO()));
  })(); }, []);

  // แก้โปรไฟล์จาก drawer → อัปเดตแถวใน list + แถวที่เปิดอยู่ in-place (ไม่ refetch)
  const applyProfile = (key, row) => {
    const merge = (r) => ({
      ...r,
      name: row.name || r.name, contact: row.phone ?? r.contact, social: row.social_name ?? r.social,
      address: row.address ?? r.address, province: row.province ?? r.province,
      owner: row.owner ?? r.owner, cadence: row.cadence ?? r.cadence,
      note: row.note ?? r.note, tags: Array.isArray(row.tags) ? row.tags : r.tags,
      hasContact: !!(row.phone || r.contact), queue: !!((row.cadence ?? r.cadence) || (row.owner ?? r.owner)),
    });
    setData(d => (d || []).map(r => r.key === key ? merge(r) : r));
    setSel(s => (s && s.key === key) ? merge(s) : s);
  };

  const opts = useMemo(() => {
    const d = data || [];
    const uniq = (f) => [...new Set(d.map(f).filter(Boolean))].sort();
    return {
      owners: uniq(c => c.owner),
      channels: uniq(c => c.mainChannel),
      provs: uniq(c => c.province),
      tiers: TIERS.filter(t => d.some(c => c.tier === t)),
    };
  }, [data]);

  const filtered = useMemo(() => {
    let r = data || [];
    const sf = statusF.filter(s => STATUS_PRED[s]);   // ทิ้งป้ายเก่าที่ persisted จากเวอร์ชันก่อน
    if (sf.length) r = r.filter(c => sf.some(s => STATUS_PRED[s](c)));
    if (ownerF.length) r = r.filter(c => ownerF.includes(c.owner));
    if (channelF.length) r = r.filter(c => channelF.includes(c.mainChannel));
    if (provF.length) r = r.filter(c => provF.includes(c.province));
    if (tierF.length) r = r.filter(c => tierF.includes(c.tier));
    const ql = q.trim().toLowerCase();
    if (ql) r = r.filter(c => `${c.name} ${c.contact} ${c.social} ${c.owner} ${c.salesperson} ${c.province}`.toLowerCase().includes(ql));
    return r;
  }, [data, statusF, ownerF, channelF, provF, tierF, q]);

  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(filtered, { key: 'sales', dir: 'desc', accessors: CRM_SORT });
  useEffect(() => { setPage(1); }, [statusF, ownerF, channelF, provF, tierF, q, sortKey, sortDir]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const pageClamped = Math.min(page, totalPages);
  const pageRows = sorted.slice((pageClamped - 1) * PER_PAGE, pageClamped * PER_PAGE);
  const nFilters = statusF.length + ownerF.length + channelF.length + provF.length + tierF.length;
  const activeChips = [
    ...statusF.map(v => ({ dim: 'สถานะ', v, clear: () => setStatusF(statusF.filter(x => x !== v)) })),
    ...ownerF.map(v => ({ dim: 'เซลล์', v, clear: () => setOwnerF(ownerF.filter(x => x !== v)) })),
    ...channelF.map(v => ({ dim: 'ช่องทาง', v, clear: () => setChannelF(channelF.filter(x => x !== v)) })),
    ...provF.map(v => ({ dim: 'จังหวัด', v, clear: () => setProvF(provF.filter(x => x !== v)) })),
    ...tierF.map(v => ({ dim: 'ระดับ', v, clear: () => setTierF(tierF.filter(x => x !== v)) })),
  ];
  const clearFilters = () => { setStatusF([]); setOwnerF([]); setChannelF([]); setProvF([]); setTierF([]); };

  const showSkel = useDelayedFlag(!data, 120);
  if (err) return <div className="content-inner"><Card className="p-5" style={{ color: 'var(--bad)' }}>{err}</Card></div>;
  if (showSkel) return <CrmSkeleton />;
  if (!data) return null;

  const curMonth = todayISO().slice(0, 7);
  const total = data.length;
  const newMonth = data.filter(c => (c.first || c.since || '').slice(0, 7) === curMonth).length;
  const repeat = data.filter(c => c.repeat).length;
  const risk = data.filter(c => c.flag === 'เสี่ยงหลุด').length;
  const withContact = data.filter(c => c.hasContact).length;

  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      {/* แถบสรุปบรรทัดเดียว */}
      <Card className="p-4">
        <div className="row" style={{ gap: 26, alignItems: 'center', flexWrap: 'wrap' }}>
          <CrmStat label="ลูกค้าทั้งหมด" value={N(total)} />
          <CrmStat label="ใหม่เดือนนี้" value={N(newMonth)} tone={newMonth ? 'var(--accent)' : undefined} />
          <CrmStat label="ซื้อซ้ำ" value={total ? N(repeat) : '—'} tone={repeat ? 'var(--good)' : undefined} />
          <CrmStat label="เสี่ยงหลุด" value={N(risk)} tone={risk ? 'var(--warn)' : 'var(--good)'} />
          <CrmStat label="มีเบอร์ติดต่อ" value={total ? `${Math.round(withContact / total * 100)}%` : '—'} />
        </div>
        {total === 0 && <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 8 }}>ยังไม่มีลูกค้า — ลูกค้าจะถูกเติมอัตโนมัติเมื่อส่งยอดใบเสร็จ (Sale › ส่งยอด &amp; ข้อมูล)</div>}
      </Card>

      {/* ตารางลูกค้า */}
      <Card className="p-4">
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 mr-1 text-base font-bold leading-tight" style={{ color: 'var(--ink)', whiteSpace: 'nowrap' }}>ลูกค้า</h3>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 rounded-full">
                <Icon name="filter" /> ตัวกรอง{nFilters > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{nFilters}</Badge>}
                <Icon name={filtersOpen ? 'up' : 'down'} />
              </Button>
            </CollapsibleTrigger>
            {nFilters > 0 && <Button variant="ghost" size="sm" className="text-[var(--bad)]" onClick={clearFilters}><Icon name="x" /> ล้าง</Button>}
          </div>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <SearchInput value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา" wrapperClassName="w-full sm:w-[240px]" />
            <Button variant="outline" size="sm" className="flex-none" disabled={!filtered.length}
              onClick={() => downloadCsv(`ลูกค้า_CRM_${filtered.length}ราย`, sorted, [
                { label: 'ชื่อลูกค้า', key: 'name' },
                { label: 'เบอร์', key: 'contact' },
                { label: 'โซเชียล', key: 'social' },
                { label: 'ช่องทางหลัก', key: 'mainChannel' },
                { label: 'จังหวัด', key: 'province' },
                { label: 'เซลล์', map: (c) => c.owner || c.salesperson || '' },
                { label: 'ระดับ', key: 'tier' },
                { label: 'ยอดซื้อสะสม', key: 'sales' },
                { label: 'จำนวนครั้ง', key: 'count' },
                { label: 'ซื้อล่าสุด', key: 'last' },
              ])} title="ส่งออกลูกค้าตามตัวกรองปัจจุบัน">
              <Icon name="external" /> CSV
            </Button>
          </div>
        </div>
          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {activeChips.map(({ dim, v, clear }) => <Badge key={dim + v} variant="outline" onClick={clear} title="คลิกเพื่อเอาออก" style={{ cursor: 'pointer', padding: '2px 8px' }}><span style={{ color: 'var(--ink-4)' }}>{dim}:</span> {v || '(ไม่ระบุ)'} <Icon name="x" /></Badge>)}
            </div>
          )}
          <CollapsibleContent>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingTop: 12, marginTop: 10, borderTop: '1px solid var(--line)' }}>
              <span className="cap" style={{ color: 'var(--ink-4)', fontWeight: 600, width: 64, flexShrink: 0 }}>ตัวกรอง</span>
              <MultiSelect label="สถานะ" options={STATUS_OPTS} value={statusF} onChange={setStatusF} />
              {opts.channels.length > 0 && <MultiSelect label="ช่องทาง" options={opts.channels} value={channelF} onChange={setChannelF} />}
              {opts.provs.length > 0 && <MultiSelect label="จังหวัด" options={opts.provs} value={provF} onChange={setProvF} />}
              {opts.owners.length > 0 && <MultiSelect label="เซลล์" options={opts.owners} value={ownerF} onChange={setOwnerF} />}
              {opts.tiers.length > 0 && <MultiSelect label="ระดับ" options={opts.tiers} value={tierF} onChange={setTierF} />}
            </div>
          </CollapsibleContent>
        </Collapsible>

        <CardTable className="cozy"><Table>
          <TableHeader><TableRow>
            <SortHead field="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>ลูกค้า</SortHead>
            <TableHead>ติดต่อ</TableHead>
            <TableHead>ระดับ</TableHead>
            <SortHead field="sales" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">ยอดซื้อ</SortHead>
            <SortHead field="count" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">ครั้ง</SortHead>
            <SortHead field="recency" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">ซื้อล่าสุด</SortHead>
          </TableRow></TableHeader>
          <TableBody>
            {pageRows.length === 0 && (
              <TableRow><TableCell colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-4)', padding: '28px 0' }}>
                {total === 0 ? 'ยังไม่มีลูกค้าในระบบ — ส่งยอดใบเสร็จแล้วลูกค้าจะเข้ามาที่นี่เอง' : 'ไม่พบลูกค้าที่ตรงกับตัวกรอง'}
              </TableCell></TableRow>
            )}
            {pageRows.map(c => (
              <TableRow key={c.key} onClick={() => setSel(c)} style={{ cursor: 'pointer' }}>
                <TableCell className="cell-title">
                  <div className="crm-person">
                    <span className={`crm-avatar ${!c.contact ? 'muted' : ''}`}>{initial(c.name)}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="crm-name">{c.name}</div>
                      <div className="cap" style={{ color: 'var(--ink-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.province || c.owner || c.salesperson || '—'}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="cap" style={{ whiteSpace: 'nowrap' }}>
                  {c.contact ? <span className="num">{c.contact}</span> : (c.social ? <span style={{ color: 'var(--ink-3)' }}>@{c.social}</span> : <span style={{ color: 'var(--ink-4)' }}>—</span>)}
                  {c.mainChannel && <Badge variant="secondary" className="ml-1.5 rounded-full text-[10px]">{c.mainChannel}</Badge>}
                </TableCell>
                <TableCell>{c.tier && <span className={`tier-chip ${TIER_CHIP[c.tier] || ''}`}>{c.tier}</span>}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{baht(c.sales)}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right' }}>{N(c.count)}</TableCell>
                <TableCell className="num cap" style={{ textAlign: 'right', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                  {c.recency != null ? `${N(c.recency)} วันก่อน` : (c.last || '—')}
                  {c.flag && <Badge variant="outline" className="ml-1.5 rounded-full text-[10px]" style={{ color: c.flag === 'เสี่ยงหลุด' ? 'var(--warn)' : 'var(--accent)', borderColor: 'currentColor' }}>{c.flag}</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table></CardTable>

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

      {sel && <CustomerDetail c={sel} onClose={() => setSel(null)} onSaved={applyProfile} />}
    </div>
  );
}

/* ============================================================
   Drawer รายละเอียดลูกค้า — ดู/แก้โปรไฟล์ + งานติดตาม + Insight
   ============================================================ */
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
// ชิปนับความถี่ "ดำ ×5" — ใช้กับ Insight ลาย/สี/ไซซ์
const FreqChips = ({ label, items }) => items.length > 0 && (
  <div style={{ marginTop: 12 }}>
    <div className="cap mb-1.5" style={{ fontWeight: 600, color: 'var(--ink-3)' }}>{label}</div>
    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
      {items.slice(0, 8).map(([k, n]) => <Badge key={k} variant="outline">{k}{n > 1 ? <span style={{ color: 'var(--ink-4)', marginLeft: 3 }}>×{N(n)}</span> : null}</Badge>)}
    </div>
  </div>
);

function CustomerDetail({ c, onClose, onSaved }) {
  const [insight, setInsight] = useState(null);   // { designs, colors, sizes, desByOrder } — lazy จาก skus
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);

  // Insight: ลาย/สี/ไซซ์ ที่ซื้อบ่อย + ลายต่อออเดอร์ (โหลดครั้งเดียวต่อลูกค้า)
  useEffect(() => {
    let live = true;
    setInsight(null);
    (async () => {
      const nos = [...new Set((c.orders || []).map(o => o.order_no).filter(x => x && !String(x).startsWith('(')))];
      if (!nos.length) { if (live) setInsight({ designs: [], colors: [], sizes: [], desByOrder: {} }); return; }
      const rows = [];
      for (let i = 0; i < nos.length; i += 150) {
        const { data } = await supabase.from('tmk_mp_skus').select('order_no,design,color,size,qty').in('order_no', nos.slice(i, i + 150));
        rows.push(...(data || []));
      }
      if (!live) return;
      const cnt = (keyf) => { const mm = new Map(); rows.forEach(s => { const k = (keyf(s) || '').trim(); if (!k) return; mm.set(k, (mm.get(k) || 0) + (Number(s.qty) || 1)); }); return [...mm.entries()].sort((a, b) => b[1] - a[1]); };
      const desByOrder = {};
      rows.forEach(s => { if (s.design) (desByOrder[s.order_no] = desByOrder[s.order_no] || new Set()).add(s.design); });
      setInsight({ designs: cnt(s => s.design), colors: cnt(s => s.color), sizes: cnt(s => s.size), desByOrder });
    })();
    return () => { live = false; };
  }, [c.key]);

  const copy = async (text, label) => { try { await navigator.clipboard.writeText(text); toast(`คัดลอก${label}แล้ว`, 'success'); } catch { toast('คัดลอกไม่ได้', 'error'); } };

  // สร้างงานติดตาม → เปิดงานใหม่ในระบบโครงการ (prefill)
  const followUp = () => {
    const detail = [
      `ลูกค้า: ${c.name}`,
      c.contact && `เบอร์: ${c.contact}`,
      c.last && `ซื้อล่าสุด: ${c.last}${c.recency != null ? ` (${c.recency} วันก่อน)` : ''}`,
      c.sales > 0 && `ยอดสะสม: ${baht(c.sales)} · ${N(c.count)} ครั้ง`,
      c.note && `โน้ต: ${c.note}`,
    ].filter(Boolean).join('\n');
    onClose();
    window.__openModal?.('task', { title: `โทรตาม ${c.name}${c.contact ? ` (${c.contact})` : ''}`, detail, date: todayISO() });
  };

  const startEdit = () => {
    setF({ name: c.name || '', phone: c.contact || '', social: c.social || '', address: c.address || '', province: c.province || '', owner: c.owner || '', cadence: c.cadence || '', note: c.note || '', tags: [...(c.tags || [])] });
    setEditing(true);
  };
  const saveProfile = async () => {
    if (!f.name.trim()) { toast('ใส่ชื่อลูกค้าก่อน', 'error'); return; }
    setBusy(true);
    try {
      const row = {
        customer_code: c.key,
        name: f.name.trim(), phone: f.phone.replace(/\D/g, ''), social_name: f.social.trim(),
        address: f.address.trim(), province: f.province.trim(),
        owner: f.owner.trim(), cadence: f.cadence.trim(), note: f.note.trim(),
        tags: f.tags, updated_at: new Date().toISOString(),
      };
      let { error } = await supabase.from('tmk_mp_customers').upsert(row, { onConflict: 'customer_code' });
      if (error && /note|cadence|tags|column/i.test(error.message || '')) {   // คอลัมน์เสริมยังไม่มี → เซฟส่วนที่เหลือ
        const r2 = { ...row }; delete r2.note; delete r2.cadence; delete r2.tags;
        ({ error } = await supabase.from('tmk_mp_customers').upsert(r2, { onConflict: 'customer_code' }));
      }
      if (error) { toast('บันทึกไม่สำเร็จ: ' + error.message, 'error'); return; }
      toast('บันทึกโปรไฟล์แล้ว', 'success');
      logAudit({ action: 'update', entityType: 'data', entityName: 'crm', summary: `แก้โปรไฟล์ลูกค้า ${row.name || c.key}` });
      invalidateSaleCache('tmk_mp_customers');
      onSaved?.(c.key, row);
      setEditing(false);
    } catch (e) { toast('บันทึกไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
    finally { setBusy(false); }
  };

  const addr = c.address || (c.province ? `${c.district ? c.district + ' · ' : ''}${c.province} ${c.postcode || ''}` : '');
  const desByOrder = insight?.desByOrder || {};

  return (
    <SideSheet size="lg" icon="user" title={c.name} sub={`${c.tier || ''} · ${baht(c.sales)} · ${N(c.count)} ครั้ง`} onClose={onClose}
      footer={editing
        ? <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
          <Button variant="outline" onClick={() => setEditing(false)} disabled={busy}>ยกเลิก</Button>
          <Button onClick={saveProfile} disabled={busy || !f?.name?.trim()}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึกโปรไฟล์'}</Button>
        </div>
        : <Button variant="outline" onClick={onClose}>ปิด</Button>}>

      {!editing ? (<>
        {/* แถวปุ่มลัด */}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {c.contact && <Button size="sm" asChild><a href={`tel:${c.contact}`} style={{ textDecoration: 'none' }}><Icon name="phone" /> โทร {c.contact}</a></Button>}
          {c.contact && <Button size="sm" variant="outline" onClick={() => copy(c.contact, 'เบอร์')}>คัดลอกเบอร์</Button>}
          {addr && <Button size="sm" variant="outline" onClick={() => copy(addr, 'ที่อยู่')}>คัดลอกที่อยู่</Button>}
          <Button size="sm" variant="outline" onClick={followUp}><Icon name="plus" /> สร้างงานติดตาม</Button>
          <Button size="sm" variant="outline" onClick={startEdit}><Icon name="pencil" /> แก้ไข</Button>
        </div>
        {(c.flag || c.cadence || c.repurchase > 0) && (
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {c.flag && <Badge variant="outline" className="rounded-full" style={{ color: c.flag === 'เสี่ยงหลุด' ? 'var(--bad)' : 'var(--accent)' }}>{c.flag}</Badge>}
            {c.cadence && <Badge variant="outline" className="rounded-full" style={{ color: 'var(--warn)' }}>ตามต่อ {c.cadence}</Badge>}
            {c.repurchase > 0 && <Badge variant="outline" className="rounded-full" style={{ color: 'var(--good)' }}>ซื้อซ้ำรอบ {c.repurchase}</Badge>}
          </div>
        )}

        {/* KPI strip */}
        <div className="mb-4 flex items-stretch overflow-hidden rounded-xl border" style={{ borderColor: 'var(--line)' }}>
          {[
            { label: 'ยอดซื้อรวม', val: baht(c.sales), color: 'var(--accent)' },
            { label: 'จำนวนครั้ง', val: N(c.count) },
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
          {(c.owner || c.salesperson) && <CrmField label={c.owner ? 'เซลล์เจ้าของ' : 'เซลล์'}><span style={{ color: c.owner ? 'var(--good)' : 'var(--ink)' }}>{c.owner || c.salesperson}</span></CrmField>}
          {c.mainChannel && <CrmField label="ช่องทางหลัก">{c.mainChannel}</CrmField>}
          {c.province && <CrmField label="จังหวัด">{c.province}</CrmField>}
          {c.since && <CrmField label="เป็นลูกค้าตั้งแต่">{c.since}</CrmField>}
          {c.last && <CrmField label="ซื้อล่าสุด">{c.last}</CrmField>}
          {addr && <CrmField label="ที่อยู่จัดส่ง" full>{addr}</CrmField>}
          {c.note && <CrmField label="โน้ต" full><span style={{ whiteSpace: 'pre-wrap', fontWeight: 500 }}>{c.note}</span></CrmField>}
        </CrmGroup>

        {/* Insight ซื้อบ่อย */}
        {insight && (insight.designs.length > 0 || insight.colors.length > 0 || insight.sizes.length > 0) && (
          <div className="rounded-xl border p-3.5 mt-3.5" style={{ borderColor: 'var(--line)', background: 'var(--surface-2, transparent)' }}>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-[14px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="sparkle" /></span>
              <span className="text-[13px] font-bold" style={{ color: 'var(--ink)' }}>ซื้อบ่อย — ใช้เชียร์ขายซ้ำ</span>
            </div>
            <FreqChips label="ลาย" items={insight.designs} />
            <FreqChips label="สี" items={insight.colors} />
            <FreqChips label="ไซซ์" items={insight.sizes} />
          </div>
        )}

        {c.tags && c.tags.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="cap mb-2" style={{ fontWeight: 600, color: 'var(--ink-3)' }}>แท็ก</div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{c.tags.map((t, i) => <Badge key={i} variant="accent" style={{ fontSize: 11 }}>{t}</Badge>)}</div>
          </div>
        )}

        {/* ประวัติซื้อ — จาก directory (ไม่ fetch ซ้ำ) */}
        <div className="cap mb-2" style={{ fontWeight: 600, color: 'var(--ink-3)', marginTop: 16 }}>ประวัติการซื้อ ({N((c.orders || []).length)})</div>
        {(c.orders || []).length === 0
          ? <div className="cap" style={{ color: 'var(--ink-4)', padding: 12 }}>ไม่มีประวัติออเดอร์ในระบบ</div>
          : <CardTable className="table-wrap" style={{ maxHeight: 300, overflow: 'auto' }}><Table>
            <TableHeader><TableRow><TableHead>วันที่</TableHead><TableHead>ออเดอร์</TableHead><TableHead>ช่อง</TableHead><TableHead>ลาย</TableHead><TableHead style={{ textAlign: 'right' }}>ยอด</TableHead><TableHead style={{ textAlign: 'right' }}>ตัว</TableHead></TableRow></TableHeader>
            <TableBody>{(c.orders || []).map((o, i) => (
              <TableRow key={o.order_no + '#' + i}>
                <TableCell className="cap">{o.date || '—'}</TableCell>
                <TableCell className="num cell-title">{o.order_no}</TableCell>
                <TableCell className="cap">{o.channel || '—'}</TableCell>
                <TableCell className="cap">{desByOrder[o.order_no] ? [...desByOrder[o.order_no]].join(', ') : '—'}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{baht(o.sales)}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right' }}>{N(o.qty)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table></CardTable>}
      </>) : (
        /* ---------- โหมดแก้ไขโปรไฟล์ ---------- */
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="form-grid2">
            <label className="fld"><span>ชื่อลูกค้า *</span><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
            <label className="fld"><span>เบอร์โทร</span><Input inputMode="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="เช่น 0812345678" /></label>
            <label className="fld"><span>โซเชียล (FB/LINE)</span><Input value={f.social} onChange={e => setF({ ...f, social: e.target.value })} /></label>
            <label className="fld"><span>จังหวัด</span><Input value={f.province} onChange={e => setF({ ...f, province: e.target.value })} /></label>
            <label className="fld"><span>เซลล์เจ้าของ</span><Input value={f.owner} onChange={e => setF({ ...f, owner: e.target.value })} placeholder="ชื่อเซลล์ที่ดูแล" /></label>
            <label className="fld"><span>ตามต่อ (เช่น 7D / 30D)</span><Input value={f.cadence} onChange={e => setF({ ...f, cadence: e.target.value })} placeholder="เว้นว่าง = ไม่ตั้ง" /></label>
          </div>
          <label className="fld"><span>ที่อยู่จัดส่ง</span><Textarea rows={2} value={f.address} onChange={e => setF({ ...f, address: e.target.value })} /></label>
          {/* แท็ก — พิมพ์แล้ว Enter เพื่อเพิ่ม */}
          <div className="fld">
            <span>แท็ก ({f.tags.length})</span>
            {f.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{f.tags.map((t, i) => (
              <Badge key={t + i} variant="secondary" className="gap-1 rounded-full py-1 pl-2.5 pr-1 font-normal">{t}
                <button type="button" aria-label={`ลบ ${t}`} className="ml-0.5 inline-flex rounded-full p-0.5 text-[var(--ink-4)] hover:bg-[var(--surface-2)] hover:text-[var(--bad)]" onClick={() => setF({ ...f, tags: f.tags.filter((_, j) => j !== i) })}><Icon name="x" /></button>
              </Badge>
            ))}</div>}
            <Input className="h-8 mt-1.5" placeholder="พิมพ์แท็กแล้วกด Enter เช่น ขายส่ง / VIP" onKeyDown={e => {
              const v = e.target.value.trim();
              if (e.key === 'Enter' && v) { e.preventDefault(); if (!f.tags.includes(v)) setF({ ...f, tags: [...f.tags, v] }); e.target.value = ''; }
            }} />
          </div>
          <label className="fld"><span>โน้ต</span><Textarea rows={3} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="บันทึกภายใน เช่น ชอบสั่งช่วงสิ้นเดือน / ให้ส่ง Flash เท่านั้น" /></label>
        </div>
      )}
    </SideSheet>
  );
}
