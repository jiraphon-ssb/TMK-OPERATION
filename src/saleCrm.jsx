/* ============================================================
   saleCrm.jsx — ลูกค้า (CRM) · PART 45: ครบจบพร้อมใช้งาน + UI คลีน
   ============================================================
   - ยอด/ครั้ง/ซื้อล่าสุด = คำนวณสดจาก tmk_mp_orders (คีย์ customer_code จากใบเสร็จ
     · fallback 'N'+ชื่อ สำหรับออเดอร์เก่าที่ code ว่าง) → ยกเลิกใบแล้วยอดหายทันที
   - โปรไฟล์ (เบอร์/ที่อยู่/เจ้าของ/แท็ก/โน้ต) = tmk_mp_customers · แก้ไขได้ใน drawer
   - "สร้างงานติดตาม" → เปิดงานใหม่ในระบบโครงการ (prefill ชื่อ/รายละเอียด)
   - Insight ต่อลูกค้า: ลาย/สี/ไซซ์ที่ซื้อบ่อย (จาก tmk_mp_skus · lazy ตอนเปิด drawer)
   - ก้อน UI ย่อยแยกไฟล์แล้ว: saleCrmPanels.jsx (ตัวกรอง/skeleton/แดชบอร์ด/popup รายวัน)
     · saleCrmDetail.jsx (drawer รายละเอียดลูกค้า) — ไฟล์นี้เหลือ hook โหลดข้อมูล + aggregate + ตารางลูกค้า
   ============================================================ */
import { useState, useEffect, useMemo } from 'react';
import { N, Icon, useDelayedFlag, PersonAvatar } from './components.jsx';
import { channelColor } from './charts.jsx';
import { SideSheet } from './modals-core.jsx';
import { TIER_CHIP, TIERS, PER_PAGE, CRM_SORT, STATUS_PRED, STATUS_OPTS, pageList, buildDirectory } from './lib/crmDirectory.js';
import { buildCrmMonth, crmCustomerKey, crmTargetProgress } from './lib/crmAgg.js';
import { mergeOrderOverrides } from './lib/saleOverrides.js';
import { fetchCrmTargets } from './lib/crmTargets.js';
import { useUser } from './userContext.jsx';
import { isAdmin } from './lib/roleAccess.js';
import { fmtBaht } from './lib/money.js';
import { cachedFetchAll, CUST_SEL, OVERRIDES_SEL } from './lib/saleData.js';
import { useSaleLiveReload } from './lib/useSaleLive.js';
import { T } from './lib/tables.js';
import { usePersistedState } from './hooks/usePersistedState.js';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { downloadCsv } from './lib/exportCsv.js';
import { useTableSort, SortHead, CardTable } from './components/DataTableParts.jsx';
import { MultiSelect, CrmSkeleton, CrmDashboard, CrmDayDetail } from './saleCrmPanels.jsx';
import { CustomerDetail } from './saleCrmDetail.jsx';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { SearchInput } from '@/components/ui/search-input';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { EmptyState } from './components/EmptyState.jsx';

const baht = (n) => fmtBaht(Number(n) || 0); // decimal-aware กลาง (lib/money.js)
const todayISO = () => new Date().toISOString().slice(0, 10);
try { localStorage.removeItem('tmk-crm-seller'); } catch { /* เลิก persist ตัวเลือกเซลล์ — เข้าใหม่ล็อคเซลล์หลักเสมอ (PART 87.2) */ }

/* ---------- โหลดข้อมูล ---------- */
// โปรไฟล์ — graceful เมื่อคอลัมน์เสริม (note/contact_channel/last_order) ยังไม่มี
async function loadProfiles() {
  let r = await cachedFetchAll('tmk_mp_customers', CUST_SEL + ',contact_channel,note,last_order');
  if (r.error && /contact_channel|note|last_order|column/i.test(r.error.message || '')) r = await cachedFetchAll('tmk_mp_customers', CUST_SEL);
  return r;
}
// source ต้องมี — ORDER_OV_KEY = `${source}:${order_no}` (merge override ระดับออเดอร์)
// payment_type/cod_amount/customer_type/note/customer_phone/job_type — ไว้ใช้ในการ์ดออเดอร์ popup รายวัน (OVERRIDES_SEL มีครบ merge ต่อเนื่อง)
const ORDERS_CRM_SEL = 'order_no,source,customer_code,customer_name,customer_social,customer_phone,channel,salesperson,province,sales,qty,order_date,status,payment_type,cod_amount,customer_type,note,job_type';

/* ============================================================
   หน้า ลูกค้า (CRM)
   ============================================================ */
export function CrmView() {
  const [raw, setRaw] = useState(null); // { profiles, orders } — orders merge override แล้ว
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = usePersistedState('tmk-crm-statusF', []);
  const [ownerF, setOwnerF] = usePersistedState('tmk-crm-ownerF', []);
  const [channelF, setChannelF] = usePersistedState('tmk-crm-channelF', []);
  const [provF, setProvF] = usePersistedState('tmk-crm-provF', []);
  const [tierF, setTierF] = usePersistedState('tmk-crm-tierF', []);
  const [seg, setSeg] = usePersistedState('tmk-crm-seg', 'all'); // แยกช่องทาง: all | crm | phone | line
  const [month, setMonth] = usePersistedState('tmk-crm-month', todayISO().slice(0, 7)); // แดชบอร์ด CRM
  const [seller, setSeller] = useState(null); // scope เซลล์ CRM (session-only) · null = ยังไม่เลือก (default = เซลล์หลัก · เข้าใหม่ล็อคเสมอ) · '' = รวมทุกคน
  const [crmTargets, setCrmTargets] = useState([]); // เป้า CRM ต่อเซลล์ของเดือนที่ดู
  const { user } = useUser();
  const [dayOpen, setDayOpen] = useState(null); // 'YYYY-MM-DD' ที่กดในกราฟ → popup รายวัน
  const [sel, setSel] = useState(null);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rk, setRk] = useState(0); // bump จาก realtime → refetch สด

  useEffect(() => {
    let alive = true;   // 1.6: กัน setState หลัง unmount (fetch all-time ช้า)
    (async () => {
      const [p, o, ov] = await Promise.all([
        loadProfiles(),
        cachedFetchAll('tmk_mp_orders', ORDERS_CRM_SEL),
        cachedFetchAll('tmk_order_overrides', OVERRIDES_SEL),
      ]);
      if (!alive) return;
      if (p.error) { setErr(p.error.message); return; }
      // merge override (channel/ยอด/วันที่ ที่แอดมินแก้) ทับออเดอร์ดิบ — ให้ยอด CRM ตรง dashboard/perf
      const ovMap = {}; if (ov && !ov.error) (ov.data || []).forEach(x => { ovMap[x.order_id] = x; });
      const orders = mergeOrderOverrides(o.error ? [] : (o.data || []), ovMap);
      setRaw({ profiles: p.data || [], orders });
    })();
    return () => { alive = false; };
  }, [rk]);
  // realtime: ออเดอร์/ลูกค้า/override เปลี่ยน → CRM เห็นสด (invalidate cache ก่อน refetch — บทเรียน PART 80)
  useSaleLiveReload([T.mpOrders, T.mpCustomers, T.orderOverrides], () => setRk(k => k + 1), { invalidate: [T.mpOrders, T.mpCustomers, T.orderOverrides] });

  // เป้า CRM ต่อเซลล์ของเดือนที่ดู (graceful [] ก่อน migration) · rk เพื่อ refresh หลังตั้งค่า
  const curYm = todayISO().slice(0, 7);
  const monthClamped = month > curYm ? curYm : month; // เดือน persisted อนาคต → clamp
  useEffect(() => { let alive = true; (async () => { const t = await fetchCrmTargets(monthClamped); if (alive) setCrmTargets(t); })(); return () => { alive = false; }; }, [monthClamped, rk]);

  // directory (ตารางลูกค้า all-time) + stats (แดชบอร์ด CRM รายเดือน) — derive จาก raw
  const data = useMemo(() => raw ? buildDirectory(raw.profiles, raw.orders, todayISO()) : null, [raw]);
  // statsAll = รวมทุกคน (ให้ bySeller + default เซลล์หลัก) · effSeller = seller ที่เลือก (null → default = เซลล์ CRM อันดับ 1)
  const statsAll = useMemo(() => raw ? buildCrmMonth(raw.orders, monthClamped, '') : null, [raw, monthClamped]);
  const effSeller = seller === null ? (statsAll?.bySeller?.[0]?.name || '') : seller;
  const stats = useMemo(() => {
    if (!raw) return null;
    return effSeller === '' ? statsAll : buildCrmMonth(raw.orders, monthClamped, effSeller);
  }, [raw, monthClamped, effSeller, statsAll]);
  // เป้า CRM: เลือกคน → เป้าคนนั้น · รวมทุกคน → ผลรวมเป้าทุกเซลล์ (ตรง requirement) · ความคืบหน้าเทียบยอดสะสม
  const target = useMemo(() => {
    if (!effSeller) return crmTargets.reduce((s, t) => s + (Number(t.sales_target) || 0), 0);
    return Number(crmTargets.find(t => t.salesperson === effSeller)?.sales_target) || 0;
  }, [crmTargets, effSeller]);
  const targetProg = useMemo(() => stats ? crmTargetProgress({ crmSales: stats.crmSales, month: monthClamped, target, todayISO: todayISO() }) : null, [stats, monthClamped, target]);
  // ออเดอร์ที่ scope ตามเซลล์ (สำหรับ popup รายวัน)
  const dayOrders = useMemo(() => {
    const os = raw?.orders || [];
    return effSeller ? os.filter(o => (o.salesperson || '').trim() === effSeller) : os;
  }, [raw, effSeller]);

  // แก้โปรไฟล์จาก drawer → patch raw.profiles (ตาราง+memo คำนวณใหม่) + sel in-place (drawer ที่เปิดอยู่)
  const applyProfile = (key, row) => {
    // อัปเดตโปรไฟล์ต้นทาง — buildDirectory คีย์ตาม p.customer_code
    setRaw(prev => {
      if (!prev) return prev;
      const profiles = [...(prev.profiles || [])];
      const idx = profiles.findIndex(p => p.customer_code === key);
      if (idx >= 0) profiles[idx] = { ...profiles[idx], ...row };
      else profiles.push({ ...row, customer_code: key });
      return { ...prev, profiles };
    });
    // drawer ที่เปิดอยู่ — merge in-place ให้เห็นผลทันที (memo ไม่ผูกกับ sel)
    setSel(s => {
      if (!s || s.key !== key) return s;
      const contactChannel = row.contact_channel ?? s.contactChannel;
      const segPhone = s.channels?.has?.('Phone') || contactChannel === 'Phone';
      const segLine = s.channels?.has?.('LINE') || contactChannel === 'LINE';
      return {
        ...s,
        name: row.name || s.name, contact: row.phone ?? s.contact, social: row.social_name ?? s.social,
        address: row.address ?? s.address, province: row.province ?? s.province,
        owner: row.owner ?? s.owner, cadence: row.cadence ?? s.cadence,
        note: row.note ?? s.note, tags: Array.isArray(row.tags) ? row.tags : s.tags,
        contactChannel, segPhone, segLine, segCrm: segPhone || segLine,
        hasContact: !!(row.phone || s.contact), queue: !!((row.cadence ?? s.cadence) || (row.owner ?? s.owner)),
      };
    });
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

  // segment โทร/LINE (แยกช่องทาง) — CRM = โทร+LINE · สมาชิกจากช่องที่เคยซื้อ + ที่ตั้ง contact_channel ไว้
  const segRows = useMemo(() => {
    const d = data || [];
    if (seg === 'crm') return d.filter(c => c.segCrm);
    if (seg === 'phone') return d.filter(c => c.segPhone);
    if (seg === 'line') return d.filter(c => c.segLine);
    return d;
  }, [data, seg]);
  // ยอดที่เกี่ยวกับ segment (โทร→ยอดโทร · LINE→ยอดไลน์ · อื่น→ยอดรวม)
  const segSalesOf = (c) => seg === 'phone' ? c.phoneSales : seg === 'line' ? c.lineSales : c.sales;

  const filtered = useMemo(() => {
    let r = segRows;
    const sf = statusF.filter(s => STATUS_PRED[s]);   // ทิ้งป้ายเก่าที่ persisted จากเวอร์ชันก่อน
    if (sf.length) r = r.filter(c => sf.some(s => STATUS_PRED[s](c)));
    if (ownerF.length) r = r.filter(c => ownerF.includes(c.owner));
    if (channelF.length) r = r.filter(c => channelF.includes(c.mainChannel));
    if (provF.length) r = r.filter(c => provF.includes(c.province));
    if (tierF.length) r = r.filter(c => tierF.includes(c.tier));
    const ql = q.trim().toLowerCase();
    if (ql) r = r.filter(c => `${c.name} ${c.contact} ${c.social} ${c.owner} ${c.salesperson} ${c.province}`.toLowerCase().includes(ql));
    return r;
  }, [segRows, statusF, ownerF, channelF, provF, tierF, q]);

  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(filtered, { key: 'sales', dir: 'desc', accessors: CRM_SORT });
  // eslint-disable-next-line react-hooks/set-state-in-effect -- รีเซ็ตหน้ากลับ 1 เมื่อเปลี่ยนตัวกรอง/เรียง (page เป็น state ที่ผู้ใช้กดเอง — derive ไม่ได้)
  useEffect(() => { setPage(1); }, [statusF, ownerF, channelF, provF, tierF, q, seg, sortKey, sortDir]);
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

  const total = segRows.length; // ใช้ใน empty state ของตาราง
  const SEGS = [['all', 'ทั้งหมด'], ['crm', 'CRM (โทร+LINE)'], ['phone', 'โทร'], ['line', 'LINE']];

  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      {/* แดชบอร์ดยอด CRM รายเดือน (โทร + LINE) — PART 87 · พาดหัวสลับเซลล์ได้ + กดแท่งดูรายวัน */}
      {stats && <CrmDashboard stats={stats} month={monthClamped} setMonth={setMonth} curYm={curYm}
        seller={effSeller} setSeller={setSeller}
        target={target} targetProg={targetProg} isAdminUser={isAdmin(user)}
        onDayClick={(i) => { const d = stats.byDay[i]; if (d) setDayOpen(d.date); }} />}

      {/* คั่น: ด้านบน = แดชบอร์ดรายเดือน · ด้านล่าง = รายชื่อลูกค้าทั้งหมด (ไม่จำกัดเดือน) */}
      <div className="row items-center gap-2" style={{ marginTop: 4, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
        <Icon name="users" />
        <h2 className="m-0 text-lg font-bold leading-tight" style={{ color: 'var(--ink)' }}>รายชื่อลูกค้า</h2>
        <span className="cap" style={{ color: 'var(--ink-4)' }}>ทั้งหมด ไม่จำกัดเดือน</span>
      </div>
      {/* แยกช่องทาง: ทั้งหมด | CRM(โทร+LINE) | โทร | LINE — สลับแล้วตาราง+สรุปคิดตาม segment */}
      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <ToggleGroup type="single" value={seg} onValueChange={(v) => v && setSeg(v)} className="gap-0.5 rounded-md border bg-muted/30 p-0.5">
          {SEGS.map(([v, l]) => <ToggleGroupItem key={v} value={v} size="sm" className="px-3 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm">{l}</ToggleGroupItem>)}
        </ToggleGroup>
        {seg !== 'all' && <span className="cap" style={{ color: 'var(--ink-4)' }}>ลูกค้าที่เคยซื้อผ่านช่องนี้ หรือถูกตั้ง "ช่องทางติดต่อหลัก" ไว้</span>}
      </div>

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
              <TableRow><TableCell colSpan={6} className="p-0">
                {total === 0
                  ? <EmptyState icon="users" title="ยังไม่มีลูกค้าในระบบ" hint="ส่งยอดใบเสร็จแล้วลูกค้าจะเข้ามาที่นี่เอง" className="border-0 bg-transparent" />
                  : <EmptyState mode="filtered" title="ไม่พบลูกค้าที่ตรงกับตัวกรอง" hint="ลองเปลี่ยนคำค้นหรือล้างตัวกรองเพื่อดูทั้งหมด" className="border-0 bg-transparent" />}
              </TableCell></TableRow>
            )}
            {pageRows.map(c => (
              <TableRow key={c.key} onClick={() => setSel(c)} style={{ cursor: 'pointer' }}>
                <TableCell className="cell-title">
                  <div className="crm-person">
                    <PersonAvatar name={c.name} size={34} color={channelColor(c.mainChannel)} className={!c.contact ? 'opacity-60' : ''} />
                    <div style={{ minWidth: 0 }}>
                      <div className="crm-name">{c.name}</div>
                      <div className="cap" style={{ color: 'var(--ink-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.province || c.owner || c.salesperson || '—'}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="cap" style={{ whiteSpace: 'nowrap' }}>
                  {c.contact ? <span className="num">{c.contact}</span> : (c.social ? <span style={{ color: 'var(--ink-3)' }}>@{c.social}</span> : <span style={{ color: 'var(--ink-4)' }}>—</span>)}
                  {c.mainChannel && <Badge variant="outline" className="ml-1.5 rounded-full text-[10px] font-medium" style={{ color: channelColor(c.mainChannel), background: `color-mix(in srgb, ${channelColor(c.mainChannel)} 14%, transparent)`, borderColor: `color-mix(in srgb, ${channelColor(c.mainChannel)} 40%, transparent)` }}>{c.mainChannel}</Badge>}
                </TableCell>
                <TableCell>{c.tier && <span className={`tier-chip ${TIER_CHIP[c.tier] || ''}`}>{c.tier}</span>}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right', fontWeight: 600 }}>
                  {baht(c.sales)}
                  {(seg === 'phone' || seg === 'line') && <div className="cap" style={{ color: channelColor(seg === 'phone' ? 'Phone' : 'LINE'), fontWeight: 500 }}>{seg === 'phone' ? 'โทร' : 'LINE'} {baht(segSalesOf(c))}</div>}
                </TableCell>
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
              {pageList(pageClamped, totalPages).map((p, i) => p === '…'
                ? <span key={'e' + i} className="px-1.5 text-[var(--ink-4)]">…</span>
                : <Button key={p} variant={p === pageClamped ? 'default' : 'outline'} size="sm" className="min-w-9 px-0" onClick={() => setPage(p)}>{p}</Button>)}
              <Button variant="outline" size="sm" className="gap-1" disabled={pageClamped >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>ถัดไป <Icon name="right" /></Button>
            </div>
          </div>
        )}
      </Card>

      {/* popup รายละเอียดวัน (กดแท่งกราฟ) */}
      {dayOpen && (
        <SideSheet size="lg" icon="calendarDays"
          title={`ออเดอร์ CRM วันที่ ${Number(dayOpen.slice(8, 10))}`}
          sub={`${dayOpen}${effSeller ? ` · ${effSeller}` : ' · รวมทุกคน'}`}
          onClose={() => setDayOpen(null)}>
          <CrmDayDetail dateISO={dayOpen} orders={dayOrders} allOrders={raw?.orders} seller={effSeller} user={user}
            onPickCustomer={(o) => { const c = (data || []).find(x => x.key === crmCustomerKey(o)); setDayOpen(null); if (c) setSel(c); }} />
        </SideSheet>
      )}

      {sel && <CustomerDetail c={sel} onClose={() => setSel(null)} onSaved={applyProfile} />}
    </div>
  );
}
