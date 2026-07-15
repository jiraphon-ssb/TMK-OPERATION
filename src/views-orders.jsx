import { useState, useEffect, useMemo, useRef } from 'react';
import { B, N, Icon, PersonAvatar, Skel, useDelayedFlag } from './components.jsx';
import { SideSheet } from './modals-core.jsx';
import { channelColor } from './charts.jsx';
import { makeSkuResolver, loadResolverMaps, skuOverrideKey } from './lib/designResolve.js';
import { mergeOrderOverrides, resolveSkuDesigns, ORDER_OV_KEY } from './lib/saleOverrides.js';
import { qtyBand, deriveColorSize } from './lib/mpReport.js';
import { DesignCombobox, ColorSelect, SizeSelect, buildLineSku, findDesign, ProvinceCombobox } from './components/ProductPicker.jsx';
import { usePersistedState } from './hooks/usePersistedState.js';
import { useTableSort, SortHead, ColumnToggle, CardTable } from './components/DataTableParts.jsx';
import { supabase } from './lib/supabaseClient.js';
import { cachedFetchRange, getDateBounds, invalidateSaleCache, ORDERS_SEL, SKUS_SEL, isDftNote } from './lib/saleData.js';
import { voidReceipt, restoreReceipt, deleteOrders, voidReceipts, uploadReceiptFile, canEditReceipt } from './lib/receiptSubmit.js';
import { useSaleRealtime } from './lib/saleRealtime.js';
import { ManualSaleSheet } from './ManualSaleSheet.jsx';
import { useUser } from './userContext.jsx';
import { useData } from './dataContext.jsx';
import { isAdmin, orderVisibleTo } from './lib/roleAccess.js';
import { CHANNELS, JOB_TYPES, PAYMENT_TYPES } from './lib/saleFields.js';
import { PRESETS, presetRange } from './lib/saleTime.js';
import { logAudit } from './lib/audit.js';
import { todayISO } from './lib/dateUtils.js';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox as ShadcnCheckbox } from '@/components/ui/checkbox';
import { SearchInput } from '@/components/ui/search-input';
import { DatePicker } from '@/components/ui/date-picker';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { MultiSelect, DrawerField, DrawerGroup, SellerCombobox, DateRangePicker, FormSection, CustomerTypeChips, MoneyCard, ReceiptPdfModal, Field, _pageList } from './saleWidgets.jsx';


function OrdersSkeleton() {
  // คอลัมน์จริง: ออเดอร์/วันที่/ช่องทาง/ลูกค้า(avatar)/ลาย/งาน/ชำระ/สถานะ/หมายเหตุ/ตัว/ยอด — นำด้วย checkbox ปิดท้ายด้วยลูกศร
  const W = ['62%', '58%', '66%', '80%', '60%', '40%', '46%', '34%', '30%', '28%', '54%'];
  const CUST = 3; // คอลัมน์ลูกค้า (กว้างกว่า + มี avatar)
  return (
    <div className="content-inner rise">
      {/* toolbar แถวเดียว: ชื่อ + ช่วงวัน + ตัวกรอง · (ขวา) ค้นหา + คอลัมน์ + เพิ่มออเดอร์ */}
      <Card className="p-[22px] mb-4">
        <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Skel w={64} h={16} />
          <Skel w={150} h={30} r={8} />
          <Skel w={80} h={30} r={8} />
          <Skel w={158} h={32} r={8} style={{ marginLeft: 'auto' }} />
          <Skel w={84} h={32} r={8} />
          <Skel w={116} h={32} r={8} />
        </div>
      </Card>
      {/* ตาราง: checkbox + 11 คอลัมน์ (ลูกค้า=avatar+2บรรทัด) + ลูกศร · แถวจางลงให้รู้สึกมีของ */}
      <Card className="p-[22px]">
        <div style={{ display: 'grid', gap: 13 }}>
          <div className="row" style={{ gap: 14, alignItems: 'center' }}>
            <Skel w={16} h={16} r={4} />
            {W.map((w, i) => <div key={i} style={{ flex: i === CUST ? 1.5 : 1 }}><Skel w={w} h={11} /></div>)}
            <Skel w={14} h={14} r={4} />
          </div>
          {Array.from({ length: 10 }).map((_, r) => (
            <div key={r} className="row" style={{ gap: 14, alignItems: 'center', opacity: Math.max(0.3, 1 - r * 0.072) }}>
              <Skel w={16} h={16} r={4} />
              {W.map((w, i) => i === CUST
                ? <div key={i} className="row" style={{ flex: 1.5, gap: 8, alignItems: 'center' }}><Skel w={22} h={22} r="50%" style={{ flexShrink: 0 }} /><div style={{ flex: 1 }}><Skel w="72%" h={12} /><Skel w="46%" h={8} style={{ marginTop: 5 }} /></div></div>
                : <div key={i} style={{ flex: 1 }}><Skel w={w} h={13} /></div>)}
              <Skel w={14} h={14} r={4} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}


// (PART 81) เลิก fork OrderDatePicker — ใช้ DateRangePicker กลางจาก saleWidgets (เพิ่ม min/max รองรับแล้ว)


// คอลัมน์ตารางออเดอร์ (สำหรับ ColumnToggle) — ออเดอร์/ยอดขาย ล็อกไว้เสมอ
const ORDERS_COLS = [
  { key: 'order_no', label: 'ออเดอร์', locked: true },
  { key: 'date', label: 'วันที่' },
  { key: 'channel', label: 'ช่องทาง' },
  { key: 'customer', label: 'ลูกค้า' },
  { key: 'designs', label: 'ลายเสื้อ' },
  { key: 'job', label: 'งาน' },
  { key: 'payment', label: 'การชำระ' },
  { key: 'status', label: 'สถานะ' },
  { key: 'note', label: 'หมายเหตุ' },
  { key: 'qty', label: 'ตัว' },
  { key: 'sales', label: 'ยอดขาย', locked: true },
];
// accessor สำหรับ useTableSort (ตัวเลข vs ข้อความ — null ไปท้าย)
const ORDERS_SORT = {
  order_no: (o) => o.order_no || '',
  date: (o) => o.order_date || o.order_month || '',
  channel: (o) => o.channel || '',
  customer: (o) => o.customer_name || o.customer_code || '',
  payment: (o) => o.payment_type || '',
  qty: (o) => Number(o.qty) || 0,
  sales: (o) => Number(o.sales) || 0,
};

function MpOrdersView() {
  const { staff } = useData();   // รายชื่อทีม → ตัวเลือกเซลล์ใน SellerCombobox (แพทเทิร์นเดียวกับ funnelSellers หน้า ส่งยอด)
  const [orders, setOrders] = useState(null);
  const [rawSkus, setRawSkus] = useState([]);          // SKU ดิบจาก DB (frozen) — resolve ตอนแสดงผล
  const [resolverMaps, setResolverMaps] = useState(null);  // catalog/alias/override สด (null = ยังไม่โหลด)
  const [orderOv, setOrderOv] = useState({});          // override ระดับออเดอร์ (job_type/ลูกค้า/เซลล์) keyed by source:order_no
  const [err, setErr] = useState('');
  const [bounds, setBounds] = useState({ min: null, max: null });
  const [range, setRange] = useState({ from: null, to: null }); // null = ยังไม่ตั้ง (รอขอบวันที่)
  const [channelF, setChannelF] = useState([]);
  const [jobF, setJobF] = useState([]);
  const [sellerF, setSellerF] = useState([]);
  const [statusF, setStatusF] = useState([]);   // ['ใช้งาน','ยกเลิก'] · ว่าง = ทั้งหมด
  const [payF, setPayF] = useState([]);          // การชำระ (โอน/COD/…) · ว่าง = ทั้งหมด
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [addOpen, setAddOpen] = useState(false); // เปิด sheet เพิ่มออเดอร์เอง
  const { user } = useUser();
  // มองเห็นออเดอร์ตาม "สิทธิการเข้าถึง" (role): ผู้ดูแลระบบ(admin) = เห็นทุกออเดอร์
  // แก้ไขได้(editor) + ดูอย่างเดียว(viewer) = เห็นเฉพาะของตัวเอง (salesperson = ชื่อ/อีเมลตัวเอง)
  // ผูกกับ user.role ตรงๆ (reactive · ไม่พึ่ง window.__isAdmin ที่เซ็ตใน effect อาจ lag รอบแรก)
  const canSeeAll = isAdmin(user);
  const PER_PAGE = 50;
  const [page, setPage] = useState(1);
  const [selSet, setSelSet] = useState(() => new Set()); // เลือกหลายออเดอร์ (order_no) สำหรับ action รวดเร็ว
  const [bulkBusy, setBulkBusy] = useState(false);
  const canEdit = window.__canEdit !== false;
  const [density] = usePersistedState('tmk-orders-density', 'cozy');
  const [hiddenCols, setHiddenCols] = usePersistedState('tmk-orders-hiddenCols', []);
  const colVisible = useMemo(() => new Set(ORDERS_COLS.map(c => c.key).filter(k => !hiddenCols.includes(k))), [hiddenCols]);
  const toggleCol = (k) => setHiddenCols(hc => hc.includes(k) ? hc.filter(x => x !== k) : [...hc, k]);

  const [reloadKey, setReloadKey] = useState(0);   // bump หลังแก้/ยกเลิก/ลบออเดอร์ → refetch สด

  // ขอบวันที่ของข้อมูล + ตั้งช่วงเริ่มต้น = เดือนปัจจุบันจริง (anchor วันจริง · ยุค realtime)
  useEffect(() => { (async () => {
    const b = await getDateBounds('tmk_mp_orders');
    setBounds({ min: b.min, max: b.max });
    if (b.max) { const r = presetRange('month', todayISO(), b.min, b.max); setRange({ from: r.from, to: r.to }); }
    else { setOrders([]); setRawSkus([]); }   // ตารางว่างทั้งระบบ → โชว์ empty-state (ไม่ค้าง skeleton)
  })(); }, [reloadKey]);

  // โหลดออเดอร์ตามช่วงวันที่ที่เลือก (server-side, มีแคช) — เปลี่ยนช่วงค่อยโหลดเฉพาะส่วน
  useEffect(() => {
    if (!range.from || !range.to) return; // รอขอบวันที่
    let cancel = false;
    (async () => {
      setOrders(null); setErr('');
      const o = await cachedFetchRange('tmk_mp_orders', ORDERS_SEL, range.from, range.to);
      if (cancel) return;
      if (o.error) { setErr(o.error.message || ''); setOrders([]); return; }
      const s = await cachedFetchRange('tmk_mp_skus', SKUS_SEL, range.from, range.to);
      if (cancel) return;
      setRawSkus(s.error ? [] : s.data || []);
      // คงออเดอร์ยกเลิกไว้ในลิสต์ (โชว์ dim + ชิป · กรองด้วยตัวกรองสถานะ) — ไม่กระทบรายงาน (saleAgg กรอง cancelled เอง)
      setOrders((o.data || []).sort((a, b) => (b.order_date || '').localeCompare(a.order_date || '')));
    })();
    return () => { cancel = true; };
  }, [range.from, range.to, reloadKey]);

  // โหลด map สด (catalog/alias/override + override ระดับออเดอร์) → live-resolve + apply override (กับดัก reimport)
  const reloadOverrides = async () => {
    const m = await loadResolverMaps(supabase); setResolverMaps(m);
    try { const r = await supabase.from('tmk_order_overrides').select('*'); const map = {}; if (!r.error) (r.data || []).forEach(x => { map[x.order_id] = x; }); setOrderOv(map); } catch { setOrderOv({}); }
  };
  // reload เต็ม (orders + skus + overrides) — ใช้หลังแก้ตรง/ยกเลิก/ลบ จาก drawer
  const reloadAll = () => {
    // reloadAll ใช้ทั้ง realtime-receive + หลังเซฟ — bust cache แต่ไม่ mark (การเขียนจริง mark เองแล้ว · กัน "หูหนวก" ต่อ event คนอื่น)
    // ล้าง override/funnel cache ด้วย (dashboard/perf โหลดผ่าน cachedFetchAll TTL 5 นาที) → แก้ override แล้วหน้าอื่นเห็นสด
    invalidateSaleCache('tmk_mp_orders', { mark: false }); invalidateSaleCache('tmk_mp_skus', { mark: false });
    invalidateSaleCache('tmk_order_overrides', { mark: false }); invalidateSaleCache('tmk_sales_funnel', { mark: false });
    setReloadKey(k => k + 1); reloadOverrides();
  };
  // realtime: ออเดอร์/รายการ/override เปลี่ยนที่ไหน (คนอื่นเพิ่ม/แก้/ยกเลิก/ลบ · ส่งยอดใบเสร็จ) → ตารางเด้งสด
  useSaleRealtime(['tmk_mp_orders', 'tmk_mp_skus', 'tmk_order_overrides', 'tmk_sale_receipts'], reloadAll);
  useEffect(() => { let cancel = false; (async () => { const m = await loadResolverMaps(supabase); if (cancel) return; setResolverMaps(m); try { const r = await supabase.from('tmk_order_overrides').select('*'); if (cancel) return; const map = {}; if (!r.error) (r.data || []).forEach(x => { map[x.order_id] = x; }); setOrderOv(map); } catch { /* ตารางยังไม่มี */ } })(); return () => { cancel = true; }; }, []);
  const orderOvKey = ORDER_OV_KEY;

  // ── เลือกหลายออเดอร์ + action รวดเร็ว (ยกเลิก/นำกลับ/ลบถาวร) ─────────────
  const isRcpt = (o) => (o.source || '') === 'shipnity';
  const toggleSel = (no) => setSelSet(s => { const n = new Set(s); n.has(no) ? n.delete(no) : n.add(no); return n; });
  const runBulk = async (kind) => {
    if (!canEdit) { window.__toast?.('บัญชีนี้เป็นสิทธิ์ "ดูอย่างเดียว"', 'warn'); return; }
    const rows = (ordersM || []).filter(o => selSet.has(o.order_no) &&
      (kind === 'cancel' ? o.status !== 'cancelled' : kind === 'restore' ? o.status === 'cancelled' : true));
    if (!rows.length) return;
    const meta = {
      cancel: { title: `ยกเลิก ${rows.length} ออเดอร์`, body: 'ยอดจะถูกตัดออกจากรายงานทันที (ส่งใบเสร็จซ้ำได้)', danger: true, confirmText: 'ยกเลิก' },
      restore: { title: `นำ ${rows.length} ออเดอร์กลับมา`, body: 'ยอดจะกลับเข้ารายงานทันที', confirmText: 'นำกลับมา' },
      remove: { title: `ลบ ${rows.length} ออเดอร์ถาวร`, body: 'รายการสินค้า/ใบเสร็จจะถูกลบด้วย — ย้อนกลับไม่ได้', danger: true, confirmText: 'ลบถาวร' },
    }[kind];
    if (!await window.__confirm?.(meta)) return;
    setBulkBusy(true);
    const by = window.__userName || window.__userEmail || '';
    // จัดกลุ่มตาม source (batch/RPC ทีเดียวต่อกลุ่ม แทน loop ทีละแถว)
    const bySource = (rs) => { const m = new Map(); rs.forEach(o => { const s = o.source || ''; (m.get(s) || m.set(s, []).get(s)).push(o); }); return m; };
    const nosOf = (rs) => rs.map(o => o.order_no);
    let fail = 0;
    try {
      if (kind === 'remove') {
        for (const [src, g] of bySource(rows)) await deleteOrders(nosOf(g), { source: src, overrideIds: g.map(orderOvKey) });
        logAudit({ action: 'delete', entityType: 'order', entityName: `${rows.length} ออเดอร์`, summary: `ลบถาวร ${rows.length} ออเดอร์` });
      } else if (kind === 'cancel') {
        const rc = rows.filter(isRcpt), other = rows.filter(o => !isRcpt(o));
        if (rc.length) await voidReceipts(nosOf(rc), { by, reason: 'ยกเลิกจากหน้าออเดอร์ (เลือกหลายรายการ)' });
        for (const [src, g] of bySource(other)) { const { error } = await supabase.from('tmk_mp_orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).in('order_no', nosOf(g)).eq('source', src); if (error) throw error; }
        logAudit({ action: 'delete', entityType: 'order', entityName: `${rows.length} ออเดอร์`, summary: `ยกเลิก ${rows.length} ออเดอร์` });
      } else { // restore
        const rc = rows.filter(isRcpt), other = rows.filter(o => !isRcpt(o));
        for (const o of rc) { try { await restoreReceipt({ order_no: o.order_no }, { by }); } catch { fail++; } } // ใบเสร็จ: ต้องสร้าง sku คืน (client · กันเคสแถวหาย)
        for (const [src, g] of bySource(other)) { const { error } = await supabase.from('tmk_mp_orders').update({ status: 'active', updated_at: new Date().toISOString() }).in('order_no', nosOf(g)).eq('source', src); if (error) throw error; }
        logAudit({ action: 'update', entityType: 'order', entityName: `${rows.length} ออเดอร์`, summary: `นำ ${rows.length} ออเดอร์กลับมา` });
      }
    } catch (e) { fail = fail || rows.length; window.__toast?.('ทำรายการไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
    setBulkBusy(false);
    setSelSet(new Set());
    const okN = rows.length - fail;
    if (okN > 0) window.__toast?.(`${meta.confirmText} ${okN} ออเดอร์${fail ? ` · ล้มเหลว ${fail}` : ''}`, fail ? 'warn' : 'success');
    invalidateSaleCache('tmk_mp_orders'); invalidateSaleCache('tmk_mp_skus');
    reloadAll();
  };

  // resolver จาก map สด — เปลี่ยน catalog/alias/override แล้ว recompute (ไม่ต้อง reimport)
  const resolver = useMemo(() => makeSkuResolver(resolverMaps || {}), [resolverMaps]);
  // ออเดอร์ที่ merge override ระดับออเดอร์ทับค่า frozen (job_type/ลูกค้า/เซลล์/ยอด ที่แก้ในเว็บ) — helper กลาง saleOverrides
  const ordersM = useMemo(() => mergeOrderOverrides(orders, orderOv), [orders, orderOv]);
  // SKU แยกตามออเดอร์ — resolve ชื่อลาย/รหัสสด + derive สี/ไซซ์ตอน override (helper กลาง) แล้ว group ตามออเดอร์
  const skusByOrder = useMemo(() => {
    const byO = {};
    resolveSkuDesigns(rawSkus, resolver, { deriveColorSize }).forEach(s2 => {
      (byO[s2.order_no] = byO[s2.order_no] || []).push(s2);
    });
    return byO;
  }, [rawSkus, resolver]);
  // active preset (ให้ปฏิทินไฮไลต์) + ตัวจัดการเลือก preset/ช่วงเอง
  const activePreset = useMemo(() => { if (!bounds.max) return ''; for (const [id] of PRESETS) { const r = presetRange(id, todayISO(), bounds.min, bounds.max); if (range.from === r.from && range.to === r.to) return id; } return ''; }, [range.from, range.to, bounds.min, bounds.max]);
  const pickPreset = (id) => { const r = presetRange(id, todayISO(), bounds.min, bounds.max); setRange({ from: r.from, to: r.to }); };
  const channels = useMemo(() => [...new Set((ordersM || []).map(o => o.channel).filter(Boolean))], [ordersM]);
  const sellers = useMemo(() => [...new Set((ordersM || []).map(o => o.salesperson).filter(Boolean))].sort(), [ordersM]);
  const payments = useMemo(() => [...new Set((ordersM || []).map(o => o.payment_type || 'ไม่ระบุ'))].sort(), [ordersM]);
  // ตัวเลือกเซลล์ในฟอร์มแก้ = ทีม (staff) ∪ เซลล์ที่มีในข้อมูล — ชื่อต้อง match เป๊ะกับ funnel/เป้า (Tier-1)
  const sellerOptions = useMemo(() => [...new Set([...(staff || []).map(s => s?.name).filter(Boolean), ...sellers])], [staff, sellers]);
  // ตัวกรองแบบ multi-select (ว่าง = แสดงทั้งหมด) — แพทเทิร์นเดียวกับหน้ารายงานขาย
  const nFilters = jobF.length + channelF.length + sellerF.length + statusF.length + payF.length;
  const activeChips = [
    ...statusF.map(v => ({ dim: 'สถานะ', v, clear: () => setStatusF(statusF.filter(x => x !== v)) })),
    ...jobF.map(v => ({ dim: 'งาน', v, clear: () => setJobF(jobF.filter(x => x !== v)) })),
    ...channelF.map(v => ({ dim: 'ช่องทาง', v, clear: () => setChannelF(channelF.filter(x => x !== v)) })),
    ...payF.map(v => ({ dim: 'ชำระ', v, clear: () => setPayF(payF.filter(x => x !== v)) })),
    ...sellerF.map(v => ({ dim: 'เซลล์', v, clear: () => setSellerF(sellerF.filter(x => x !== v)) })),
  ];
  const clearFilters = () => { setJobF([]); setChannelF([]); setSellerF([]); setStatusF([]); setPayF([]); };
  const ql = q.trim().toLowerCase();
  // memoize — ต้องคง identity ของ filtered ให้เสถียร ไม่งั้น useTableSort re-sort ทุก render (กดเช็คบ็อกซ์/เปิด drawer/สลับหน้า → กระตุก)
  const filtered = useMemo(() => (ordersM || []).filter(o =>
    orderVisibleTo(o, user) &&
    (statusF.length === 0 || statusF.includes(o.status === 'cancelled' ? 'ยกเลิก' : 'ใช้งาน')) &&
    (channelF.length === 0 || channelF.includes(o.channel)) &&
    (payF.length === 0 || payF.includes(o.payment_type || 'ไม่ระบุ')) &&
    (jobF.length === 0 || jobF.includes(o.job_type || 'ปลีก')) &&
    (sellerF.length === 0 || sellerF.includes(o.salesperson || '')) &&
    (!ql || `${o.order_no} ${o.marketplace_id || ''} ${o.customer_name || ''} ${o.customer_code || ''} ${o.customer_social || ''} ${o.province || ''} ${o.salesperson || ''}`.toLowerCase().includes(ql) || (skusByOrder[o.order_no] || []).some(s => `${s.design || ''} ${s.color || ''} ${s.raw_sku_or_name || ''}`.toLowerCase().includes(ql)))
  ), [ordersM, statusF, channelF, payF, jobF, sellerF, ql, skusByOrder, user]);

  // เรียงตามคอลัมน์ (เริ่มต้น = วันที่ล่าสุดก่อน เหมือนเดิม)
  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(filtered, { key: 'date', dir: 'desc', accessors: ORDERS_SORT });

  // แบ่งหน้า — รีเซ็ตกลับหน้า 1 เมื่อเปลี่ยนช่วงวันที่/ตัวกรอง/คำค้น/การเรียง
  useEffect(() => { setPage(1); setSelSet(new Set()); }, [range.from, range.to, jobF, channelF, sellerF, statusF, payF, q, sortKey, sortDir]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const pageClamped = Math.min(page, totalPages);
  const pageRows = sorted.slice((pageClamped - 1) * PER_PAGE, pageClamped * PER_PAGE);
  // เลือกทั้งหน้า (checkbox หัวตาราง) + สรุปสิ่งที่เลือกไว้ (เพื่อโชว์ปุ่ม action ที่เกี่ยวข้อง)
  const pageNos = pageRows.map(o => o.order_no);
  const allOnPage = pageNos.length > 0 && pageNos.every(no => selSet.has(no));
  const toggleAllPage = () => setSelSet(s => { const n = new Set(s); if (allOnPage) pageNos.forEach(no => n.delete(no)); else pageNos.forEach(no => n.add(no)); return n; });
  const selRows = (ordersM || []).filter(o => selSet.has(o.order_no));
  const selHasCancelled = selRows.some(o => o.status === 'cancelled');

  const showSkel = useDelayedFlag(orders === null, 120); // โผล่หลัง 120ms · อยู่อย่างน้อย 300ms · cache ไว → เด้งทันที
  if (showSkel) return <OrdersSkeleton />;
  if (orders === null) return null;
  // ไม่มีข้อมูลเลยทั้งระบบ (ไม่มีเดือนใดเลย) → แนะนำนำเข้า · ถ้าแค่เดือนนี้ว่าง ยังให้เลือกเดือนอื่นได้
  if (err || (orders.length === 0 && !bounds.max)) return (
    <div className="content-inner rise"><Card className="p-[22px]"><div className="cap" style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }}>
      {/relation .* does not exist|tmk_mp_/i.test(err) ? 'ยังไม่ได้สร้างตาราง — รัน migration ก่อน' : 'ยังไม่มีออเดอร์ — ส่งยอดใบเสร็จหรือนำเข้าไฟล์มาร์เก็ตเพลสได้ที่เมนู "ส่งยอด & ข้อมูล"'}
    </div></Card></div>
  );

  const buildDesigns = (sk) => { const dmap = {}; sk.forEach(s => { const d = s.design || '(จับคู่ไม่ได้)'; if (!dmap[d]) dmap[d] = { design: d, codes: new Set(), qty: 0, sales: 0 }; const g = dmap[d]; if (s.product_code) g.codes.add(s.product_code); g.qty += Number(s.qty) || 0; g.sales += Number(s.line_sales) || 0; }); return Object.values(dmap).sort((a, b) => b.qty - a.qty); };
  const jobChip = (j) => ({ 'ปลีก': '', 'DFT': 'chip-accent', 'OEM': 'chip-warn' }[j] || '');
  const statusChip = (s) => {
    if (!s || s === 'completed' || s === 'delivered') return 'chip-delivered';
    if (s === 'cancelled') return 'chip-cancelled';
    if (s === 'pending' || s === 'processing') return 'chip-pending';
    if (s === 'shipped') return 'chip-shipped';
    return '';
  };
  const statusLabel = (s) => ({ 'completed': 'สำเร็จ', 'delivered': 'ส่งแล้ว', 'cancelled': 'ยกเลิก', 'pending': 'รอดำเนินการ', 'processing': 'กำลังทำ', 'shipped': 'จัดส่งแล้ว' }[s] || s || '');
  return (
    <div className="content-inner rise">
      <Card className="p-[22px]">
        {/* หัว + เครื่องมือ แถวเดียว: ชื่อ · ช่วงวัน · ตัวกรอง · ล้าง | (ขวา) ค้นหา · คอลัมน์ · เพิ่มออเดอร์ */}
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 mr-1 text-base font-bold leading-tight" style={{ color: 'var(--ink)' }}>ออเดอร์</h3>
            {!canSeeAll && <Badge variant="outline" className="gap-1 text-[11px] text-muted-foreground"><Icon name="user" className="size-3" />เฉพาะของฉัน</Badge>}
            <DateRangePicker from={range.from} to={range.to} min={bounds.min} max={bounds.max}
              onChange={(a, b) => setRange({ from: a, to: b })} presets={PRESETS} activePreset={activePreset} onPickPreset={pickPreset} />
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 rounded-full">
                <Icon name="filter" /> ตัวกรอง{nFilters > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{nFilters}</Badge>}
                <Icon name={filtersOpen ? 'up' : 'down'} />
              </Button>
            </CollapsibleTrigger>
            {nFilters > 0 && <Button variant="ghost" size="sm" className="text-[var(--bad)]" onClick={clearFilters}><Icon name="x" /> ล้าง</Button>}
            <div className="ml-auto flex items-center gap-2">
              <SearchInput value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา" wrapperClassName="w-full sm:w-[220px]" />
              <ColumnToggle columns={ORDERS_COLS} visible={colVisible} onToggle={toggleCol} />
              <Button size="sm" className="shrink-0 gap-1.5" disabled={window.__canEdit === false} onClick={() => setAddOpen(true)}><Icon name="plus" /> เพิ่มออเดอร์</Button>
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
              <MultiSelect label="สถานะ" options={['ใช้งาน', 'ยกเลิก']} value={statusF} onChange={setStatusF} />
              <MultiSelect label="งาน" options={['ปลีก', 'DFT', 'OEM']} value={jobF} onChange={setJobF} />
              <MultiSelect label="ช่องทาง" options={channels} value={channelF} onChange={setChannelF} />
              {payments.length > 0 && <MultiSelect label="การชำระ" options={payments} value={payF} onChange={setPayF} />}
              {canSeeAll && sellers.length > 0 && <MultiSelect label="เซลล์" options={sellers} value={sellerF} onChange={setSellerF} />}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {canEdit && selSet.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}>
            <span className="text-[13px] font-bold" style={{ color: 'var(--accent)' }}>เลือก {N(selSet.size)} ออเดอร์</span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {selHasCancelled && <Button variant="outline" size="sm" className="gap-1" style={{ color: 'var(--good)' }} disabled={bulkBusy} onClick={() => runBulk('restore')}><Icon name="refresh" /> นำกลับมา</Button>}
              <Button variant="outline" size="sm" className="gap-1" style={{ color: 'var(--bad)' }} disabled={bulkBusy} onClick={() => runBulk('remove')}><Icon name="trash" /> ลบถาวร</Button>
              <Button variant="ghost" size="sm" disabled={bulkBusy} onClick={() => setSelSet(new Set())}>เลิกเลือก</Button>
            </div>
          </div>
        )}

        <CardTable className={'table-sticky-first mt-4 ' + density}><Table>
          <TableHeader><TableRow>
            {canEdit && <TableHead className="w-9 cell-hide-m"><ShadcnCheckbox checked={allOnPage} onCheckedChange={toggleAllPage} aria-label="เลือกทั้งหน้า" /></TableHead>}
            <SortHead field="order_no" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>ออเดอร์</SortHead>
            {colVisible.has('date') && <SortHead field="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>วันที่</SortHead>}
            {colVisible.has('channel') && <SortHead field="channel" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>ช่องทาง</SortHead>}
            {colVisible.has('customer') && <SortHead field="customer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>ลูกค้า</SortHead>}
            {colVisible.has('designs') && <TableHead>ลายเสื้อ</TableHead>}
            {colVisible.has('job') && <TableHead>งาน</TableHead>}
            {colVisible.has('payment') && <SortHead field="payment" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>การชำระ</SortHead>}
            {colVisible.has('status') && <TableHead>สถานะ</TableHead>}
            {colVisible.has('note') && <TableHead>หมายเหตุ</TableHead>}
            {colVisible.has('qty') && <SortHead field="qty" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">ตัว</SortHead>}
            <SortHead field="sales" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">ยอดขาย</SortHead>
          </TableRow></TableHeader>
          <TableBody>{pageRows.map(o => { const designs = buildDesigns(skusByOrder[o.order_no] || []);
            return (
              <TableRow key={o.order_no} data-state={selSet.has(o.order_no) ? 'selected' : undefined} className={`mp-order-row ${openId === o.order_no ? 'is-open' : ''} ${o.status === 'cancelled' ? 'opacity-55' : ''}`} onClick={() => setOpenId(o.order_no)} style={{ cursor: 'pointer' }}>
                {canEdit && <TableCell className="cell-hide-m" onClick={e => e.stopPropagation()}><ShadcnCheckbox checked={selSet.has(o.order_no)} onCheckedChange={() => toggleSel(o.order_no)} aria-label={`เลือก ${o.order_no}`} /></TableCell>}
                <TableCell className="cell-title"><span style={{ fontWeight: 600, textDecoration: o.status === 'cancelled' ? 'line-through' : 'none' }}>{o.order_no}</span></TableCell>
                {colVisible.has('date') && <TableCell className="cap" style={{ whiteSpace: 'nowrap' }}>{o.order_date || o.order_month}</TableCell>}
                {colVisible.has('channel') && <TableCell><span className="order-channel-chip"><span className="order-channel-dot" style={{ background: channelColor(o.channel) }} />{o.channel}</span></TableCell>}
                {colVisible.has('customer') && <TableCell><div className="flex items-center gap-2 min-w-0">{o.customer_name && <PersonAvatar name={o.customer_name} color={channelColor(o.channel)} size={22} className="shrink-0" />}<div className="min-w-0">{o.customer_name || o.customer_code || '—'}{o.province && <div className="cap">{o.province}</div>}{!o.customer_name && !o.customer_code && <Badge variant="warning" className="rounded-full text-[10px] font-medium">ไม่มีลูกค้า</Badge>}</div></div></TableCell>}
                {colVisible.has('designs') && <TableCell className="cell-hide-m">{designs.length === 0 ? <span className="cap" style={{ color: 'var(--ink-4)' }}>—</span> : <span style={{ fontWeight: 600 }}>{designs.slice(0, 2).map(d => d.design).join(', ')}{designs.length > 2 ? ` +${designs.length - 2}` : ''}</span>}</TableCell>}
                {colVisible.has('job') && <TableCell>{(o.job_type && o.job_type !== 'ปลีก') ? <span className={'chip ' + jobChip(o.job_type)}>{o.job_type}</span> : <span className="cap">ปลีก</span>}</TableCell>}
                {colVisible.has('payment') && <TableCell><span className="cap" style={o.payment_type ? undefined : { color: 'var(--ink-4)' }}>{o.payment_type || '—'}</span></TableCell>}
                {colVisible.has('status') && <TableCell>{o.status && !['completed', 'active'].includes(o.status) ? <span className={'chip ' + statusChip(o.status)}>{statusLabel(o.status)}</span> : <span className="cap" style={{ color: 'var(--ink-4)' }}>—</span>}</TableCell>}
                {colVisible.has('note') && <TableCell className="cell-hide-m">{o.note ? <span className="block max-w-[160px] truncate text-[13px]" title={o.note}>{o.note}</span> : <span className="cap" style={{ color: 'var(--ink-4)' }}>—</span>}</TableCell>}
                {colVisible.has('qty') && <TableCell className="num" style={{ textAlign: 'right' }}>{N(o.qty)}</TableCell>}
                <TableCell className="num" style={{ textAlign: 'right', fontWeight: 700 }}><span className="row" style={{ gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>{B(o.sales)}<Icon name="arrowR" /></span></TableCell>
              </TableRow>
          ); })}</TableBody>
        </Table></CardTable>
        {filtered.length > PER_PAGE && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="cap" style={{ color: 'var(--ink-4)' }}>แสดง {N((pageClamped - 1) * PER_PAGE + 1)}–{N(Math.min(pageClamped * PER_PAGE, filtered.length))} จาก {N(filtered.length)} ออเดอร์</span>
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

      {openId && (() => {
        const o = (ordersM || []).find(x => x.order_no === openId);
        if (!o) return null;
        return <OrderDrawer order={o} sk={skusByOrder[o.order_no] || []} buildDesigns={buildDesigns} sellerOptions={sellerOptions} onClose={() => setOpenId(null)} onSaved={reloadOverrides} onChanged={reloadAll} />;
      })()}

      {addOpen && <ManualSaleSheet user={user} onClose={() => setAddOpen(false)} onSaved={reloadAll} />}
    </div>
  );
}


// รหัสลูกค้า = คีย์ CRM ภายใน (P<เบอร์>/S<โซเชียล>/N<ชื่อ>) — โชว์อ่านง่าย: ตัด prefix + ซ่อนถ้าซ้ำชื่อ (ไม่โชว์คีย์ดิบ)
const custCodeShow = (code, name) => { const c = String(code || '').replace(/^[PSN]/, '').trim(); return c && c !== String(name || '').trim() ? c : ''; };
// label ฟิลด์ในฟอร์มแก้ = จางเล็ก 11px (หัวข้อกลุ่ม FormSection เด่นกว่า — ลำดับชั้นถูกทาง · PART 81.5)
function OrderDrawer({ order: o, sk, buildDesigns, sellerOptions = [], onClose, onSaved, onChanged }) {
  const designs = buildDesigns(sk);
  const jt = o.job_type || 'ปลีก';
  const jtCls = { DFT: 'chip-accent', OEM: 'chip-warn' }[jt] || '';
  const hasOv = !!o._ov;                                   // ออเดอร์นี้เคยแก้มือไหม
  const isReceipt = (o.source || '') === 'shipnity';       // มาจากใบเสร็จ — ยกเลิกผ่านระบบใบเสร็จ (ส่งใหม่ได้)
  const isCancelled = o.status === 'cancelled';            // ยกเลิกแล้ว → ปุ่มเป็น "นำกลับมา"
  const [edit, setEdit] = useState(null);                  // null | ฟอร์มแก้เต็มทุกช่อง
  const [busy, setBusy] = useState(false);
  const [lineEdit, setLineEdit] = useState(null);          // index ของบรรทัดที่กำลังแก้ลาย
  const [linePick, setLinePick] = useState({ design: '', code: '', color: '', size: '' });
  const [fin, setFin] = useState(null);                    // ราคาเสื้อ/ส่วนลด/ค่าส่ง/VAT จาก attrs (โหลด lazy ตอนเปิด — attrs ไม่อยู่ใน ORDERS_SEL กัน egress)
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data } = await supabase.from('tmk_mp_orders').select('attrs').eq('order_no', o.order_no).eq('source', o.source || '').maybeSingle();
        if (cancel) return;
        const a = data?.attrs || {};
        setFin({ subtotal: a.subtotal, discount: a.discount, shipping: a.shipping, vat: a.vat });
      } catch { /* attrs optional */ }
    })();
    return () => { cancel = true; };
  }, [o.order_no, o.source]);
  // ไฟล์ใบเสร็จ (PDF) — ออเดอร์จากใบเสร็จ (source=shipnity) มีแถวใน tmk_sale_receipts · โหลด lazy ตอนเปิด
  const [rec, setRec] = useState(undefined);              // undefined=กำลังโหลด · null=ไม่มีใบเสร็จ · obj=แถวใบเสร็จ
  const [attaching, setAttaching] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);          // popup ฝัง PDF ใบเสร็จ
  const attachRef = useRef(null);
  useEffect(() => {
    if (!isReceipt) { setRec(null); return; }
    let cancel = false;
    (async () => {
      try {
        const { data } = await supabase.from('tmk_sale_receipts')
          .select('id,order_no,file_url,uploader_email,status,created_at').eq('order_no', o.order_no).maybeSingle();
        if (!cancel) setRec(data || null);
      } catch { if (!cancel) setRec(null); }
    })();
    return () => { cancel = true; };
  }, [o.order_no, isReceipt]);
  const ovId = `${o.source || ''}:${o.order_no}`;
  const toast = (m, t) => window.__toast && window.__toast(m, t);
  // แนบ/เปลี่ยนไฟล์ใบเสร็จจากหน้าออเดอร์ (เหมือนหน้าส่งยอด) — อัปเดต file_url ที่ tmk_sale_receipts
  const attachReceiptToOrder = async (file) => {
    if (!file || !rec) return;
    setAttaching(true);
    try {
      const url = await uploadReceiptFile(file, rec.order_no);
      if (!url) { toast('อัปโหลดไม่สำเร็จ — รัน migration 20260704 (bucket รับ PDF) แล้วหรือยัง?', 'error'); return; }
      const { error } = await supabase.from('tmk_sale_receipts').update({ file_url: url }).eq('order_no', rec.order_no);
      if (error) { toast('บันทึกลิงก์ไม่สำเร็จ: ' + error.message, 'error'); return; }
      toast('แนบไฟล์ใบเสร็จแล้ว', 'success');
      setRec(r => r ? { ...r, file_url: url } : r);
    } catch (e) { toast('แนบไฟล์ไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
    finally { setAttaching(false); }
  };
  const startEdit = () => {
    setEdit({
      order_date: o.order_date || '', channel: o.channel || '', job_type: jt,
      payment_type: PAYMENT_TYPES.includes(o.payment_type) ? o.payment_type : (o.payment_type || 'ไม่ระบุ'),
      sales: String(o.sales ?? ''), qty: String(o.qty ?? ''),
      customer_name: o.customer_name || '', customer_type: o.customer_type || 'ลูกค้าใหม่',
      customer_phone: o.customer_phone || '', customer_social: o.customer_social || '',
      customer_address: '',
      province: o.province || '', salesperson: o.salesperson || '', note: o.note || '',
    });
    // ที่อยู่อยู่ที่โปรไฟล์ลูกค้า (ไม่มีคอลัมน์บนออเดอร์) — prefill best-effort ถ้ายังไม่พิมพ์ทับ
    if (o.customer_code) {
      supabase.from('tmk_mp_customers').select('address').eq('customer_code', o.customer_code).maybeSingle()
        .then(({ data }) => { if (data?.address) setEdit(prev => prev && prev.customer_address === '' ? { ...prev, customer_address: data.address } : prev); })
        .catch(() => { /* โปรไฟล์ optional */ });
    }
  };
  // บันทึก: อัปเดตตรงที่ tmk_mp_orders (มีผลทุกรายงานทันที) + override field ที่รองรับ (ประกันข้าม reimport)
  // + ใบเสร็จ: sync แถว tmk_sale_receipts ให้ feed ส่งยอดตรงกัน
  const saveOrder = async () => {
    if (window.__canEdit === false) { toast('บัญชีนี้เป็นสิทธิ์ "ดูอย่างเดียว"', 'warn'); return; }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const patch = {
        order_date: edit.order_date || null,
        order_month: (edit.order_date || o.order_month || '').slice(0, 7),
        channel: edit.channel, job_type: edit.job_type,
        payment_type: edit.payment_type,
        cod_amount: edit.payment_type === 'COD' ? (Number(edit.sales) || 0) : 0,
        sales: Number(edit.sales) || 0, qty: Number(edit.qty) || 0, qty_band: qtyBand(Number(edit.qty) || 0),
        customer_name: edit.customer_name.trim(), customer_type: edit.customer_type,
        customer_phone: edit.customer_phone.trim(), customer_social: edit.customer_social.trim(),
        province: edit.province.trim(), salesperson: edit.salesperson.trim(), note: edit.note.trim(),
        updated_at: now,
      };
      {
        // schema-tolerant: คอลัมน์ customer_phone ยังไม่รัน 20260715 → ตัดออกแล้วลองใหม่
        let { error } = await supabase.from('tmk_mp_orders').update(patch).eq('order_no', o.order_no).eq('source', o.source || '');
        if (error && /customer_phone/i.test(error.message || '')) {
          const { customer_phone: _p, ...slim } = patch;
          ({ error } = await supabase.from('tmk_mp_orders').update(slim).eq('order_no', o.order_no).eq('source', o.source || ''));
        }
        if (error) throw error;
      }
      try {
        // mirror ทุกช่องที่แก้ลง override (ประกันข้าม reimport มาร์เก็ตเพลส) — graceful ตัดคอลัมน์ใหม่ถ้ายังไม่ migrate
        const ovRow = { order_id: ovId, job_type: patch.job_type, customer_name: patch.customer_name, customer_type: patch.customer_type, salesperson: patch.salesperson, note: patch.note, channel: patch.channel, payment_type: patch.payment_type, sales: patch.sales, qty: patch.qty, province: patch.province, order_date: patch.order_date, cod_amount: patch.cod_amount, customer_phone: patch.customer_phone, customer_social: patch.customer_social, updated_at: now };
        let { error: ovErr } = await supabase.from('tmk_order_overrides').upsert(ovRow, { onConflict: 'order_id' });
        if (ovErr && /channel|payment_type|sales|qty|province|order_date|cod_amount|customer_phone|customer_social|column/i.test(ovErr.message || '')) {
          const base = { order_id: ovId, job_type: patch.job_type, customer_name: patch.customer_name, customer_type: patch.customer_type, salesperson: patch.salesperson, note: patch.note, updated_at: now };
          await supabase.from('tmk_order_overrides').upsert(base, { onConflict: 'order_id' });
        }
      } catch { /* ตาราง override ยังไม่มี — ค่าตรงบันทึกแล้ว */ }
      // เบอร์/โซเชียล/ที่อยู่ → อัปเดตโปรไฟล์ลูกค้า (best-effort · เฉพาะช่องที่มีค่า กันทับของเดิมด้วยค่าว่าง)
      try {
        const code = o.customer_code || '';
        const addr = (edit.customer_address || '').trim();
        if (code && (patch.customer_phone || patch.customer_social || addr)) {
          const prof = { customer_code: code, updated_at: now };
          if (patch.customer_name) prof.name = patch.customer_name;
          if (patch.customer_phone) prof.phone = patch.customer_phone;
          if (patch.customer_social) prof.social_name = patch.customer_social;
          if (patch.province) prof.province = patch.province;
          if (addr) prof.address = addr;
          await supabase.from('tmk_mp_customers').upsert(prof, { onConflict: 'customer_code' });
        }
      } catch { /* โปรไฟล์ optional */ }
      if (isReceipt) {
        try { await supabase.from('tmk_sale_receipts').update({ channel: patch.channel, order_date: patch.order_date, order_month: patch.order_month, sales: patch.sales, qty: patch.qty, salesperson: patch.salesperson, updated_at: now }).eq('order_no', o.order_no); } catch { /* เงียบ */ }
      }
      // ปรับ SKU (+ confirmed payload ของใบเสร็จ) ให้ยอด/จำนวนรวมตรงกับที่แก้ — กัน breakdown ลาย/สี/geo เพี้ยนจาก order total
      const oldSales = sk.reduce((a, s) => a + (Number(s.line_sales) || 0), 0);
      const oldQty = sk.reduce((a, s) => a + (Number(s.qty) || 0), 0);
      if (sk.length && (Math.abs(oldSales - patch.sales) > 0.01 || oldQty !== patch.qty)) {
        // แบ่งสัดส่วนตามของเดิม · reconcile บรรทัดสุดท้ายให้รวมตรงเป๊ะ
        const splitVals = (rows, getV, total, integer) => {
          const base = rows.map(getV); const sum = base.reduce((a, v) => a + v, 0); let acc = 0;
          return rows.map((r, i) => {
            if (i === rows.length - 1) return Math.max(0, integer ? Math.round(total - acc) : Math.round((total - acc) * 100) / 100);
            const v = sum > 0 ? (base[i] / sum) * total : total / rows.length;
            const rv = integer ? Math.round(v) : Math.round(v * 100) / 100; acc += rv; return Math.max(0, rv);
          });
        };
        const newLS = splitVals(sk, s => Number(s.line_sales) || 0, patch.sales, false);
        const newQ = splitVals(sk, s => Number(s.qty) || 0, patch.qty, true);
        for (let i = 0; i < sk.length; i++) {
          if (!sk[i].id) continue;
          try { await supabase.from('tmk_mp_skus').update({ line_sales: newLS[i], qty: newQ[i] }).eq('id', sk[i].id); } catch { /* order-level ถูกแล้ว */ }
        }
        if (isReceipt) {
          try {
            const { data: rc } = await supabase.from('tmk_sale_receipts').select('confirmed').eq('order_no', o.order_no).maybeSingle();
            const cf = rc?.confirmed;
            if (cf && Array.isArray(cf.lines) && cf.lines.length) {
              const cLS = splitVals(cf.lines, l => Number(l.amount) || 0, patch.sales, false);
              const cQ = splitVals(cf.lines, l => Number(l.qty) || 0, patch.qty, true);
              cf.lines = cf.lines.map((l, i) => ({ ...l, amount: cLS[i], qty: cQ[i] }));
              cf.total = patch.sales; cf.subtotal = patch.sales;
              await supabase.from('tmk_sale_receipts').update({ confirmed: cf }).eq('order_no', o.order_no);
            }
          } catch { /* เงียบ — restore จะใช้ payload เดิม */ }
        }
      }
      logAudit({ action: 'update', entityType: 'order', entityName: o.order_no, summary: `แก้ออเดอร์ ${o.order_no} (${patch.channel} · ฿${patch.sales})` });
      toast('บันทึกการแก้ไขแล้ว — ยอดในรายงานอัปเดตทันที', 'success');
      setEdit(null); onChanged ? onChanged() : onSaved?.();
    } catch (e) { toast('บันทึกไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
    finally { setBusy(false); }
  };
  const revertOrder = async () => {
    setBusy(true);
    const { error } = await supabase.from('tmk_order_overrides').delete().eq('order_id', ovId);
    setBusy(false);
    if (error) { toast('คืนค่าไม่สำเร็จ', 'error'); return; }
    toast('คืนค่าออเดอร์เป็นค่าจากไฟล์แล้ว', 'success');
    setEdit(null); onSaved && onSaved();
  };
  // ยกเลิกออเดอร์ — ใบเสร็จ: void ผ่านระบบใบเสร็จ (ยอดหาย+ส่งใหม่ได้) · มาร์เก็ตเพลส: mark cancelled
  const cancelOrder = async () => {
    if (window.__canEdit === false) { toast('บัญชีนี้เป็นสิทธิ์ "ดูอย่างเดียว"', 'warn'); return; }
    if (!await window.__confirm?.({ title: 'ยกเลิกออเดอร์', body: `ยกเลิก ${o.order_no}?\nยอดจะถูกตัดออกจากรายงานทันที${isReceipt ? ' (ส่งใบเสร็จซ้ำได้)' : ''}`, danger: true, confirmText: 'ยกเลิกออเดอร์' })) return;
    setBusy(true);
    try {
      if (isReceipt) await voidReceipt({ order_no: o.order_no }, { by: window.__userName || window.__userEmail || '', reason: 'ยกเลิกจากหน้าออเดอร์' });
      else {
        const { error } = await supabase.from('tmk_mp_orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('order_no', o.order_no).eq('source', o.source || '');
        if (error) throw error;
        logAudit({ action: 'delete', entityType: 'order', entityName: o.order_no, summary: `ยกเลิกออเดอร์ ${o.order_no}` });
      }
      toast('ยกเลิกออเดอร์แล้ว — ยอดถูกตัดออกจากรายงาน', 'success');
      onClose(); onChanged?.();
    } catch (e) { toast('ยกเลิกไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
    finally { setBusy(false); }
  };
  // นำกลับมา — ใบเสร็จ: un-void + สร้าง sku คืนจาก payload · มาร์เก็ตเพลส: mark active
  const restoreOrder = async () => {
    if (window.__canEdit === false) { toast('บัญชีนี้เป็นสิทธิ์ "ดูอย่างเดียว"', 'warn'); return; }
    if (!await window.__confirm?.({ title: 'นำออเดอร์กลับมา', body: `นำ ${o.order_no} กลับมาใช้งาน?\nยอดจะกลับเข้ารายงานทันที`, confirmText: 'นำกลับมา' })) return;
    setBusy(true);
    try {
      if (isReceipt) await restoreReceipt({ order_no: o.order_no }, { by: window.__userName || window.__userEmail || '' });
      else {
        const { error } = await supabase.from('tmk_mp_orders').update({ status: 'active', updated_at: new Date().toISOString() }).eq('order_no', o.order_no).eq('source', o.source || '');
        if (error) throw error;
        invalidateSaleCache('tmk_mp_orders');
        logAudit({ action: 'update', entityType: 'order', entityName: o.order_no, summary: `นำออเดอร์ ${o.order_no} กลับมา` });
      }
      toast('นำออเดอร์กลับมาแล้ว — ยอดกลับเข้ารายงาน', 'success');
      onClose(); onChanged?.();
    } catch (e) { toast('นำกลับไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
    finally { setBusy(false); }
  };
  // ลบถาวร — เอาออกทุกตาราง (ออเดอร์ + รายการสินค้า + override + ใบเสร็จ) ย้อนกลับไม่ได้
  const deleteOrder = async () => {
    if (window.__canEdit === false) { toast('บัญชีนี้เป็นสิทธิ์ "ดูอย่างเดียว"', 'warn'); return; }
    if (!await window.__confirm?.({ title: 'ลบออเดอร์ถาวร', body: `ลบ ${o.order_no} ออกจากระบบถาวร?\nรายการสินค้า${isReceipt ? ' + ใบเสร็จ' : ''} จะถูกลบด้วย — ย้อนกลับไม่ได้`, danger: true, confirmText: 'ลบถาวร' })) return;
    setBusy(true);
    try {
      await supabase.from('tmk_mp_skus').delete().eq('source', o.source || '').eq('order_no', o.order_no);
      { const { error } = await supabase.from('tmk_mp_orders').delete().eq('order_no', o.order_no).eq('source', o.source || ''); if (error) throw error; }
      try { await supabase.from('tmk_order_overrides').delete().eq('order_id', ovId); } catch { /* optional */ }
      try { await supabase.from('tmk_sku_overrides').delete().eq('order_no', o.order_no); } catch { /* optional — กัน override ลายบรรทัดค้างเป็น orphan */ }
      if (isReceipt) { try { await supabase.from('tmk_sale_receipts').delete().eq('order_no', o.order_no); } catch { /* optional */ } }
      logAudit({ action: 'delete', entityType: 'order', entityName: o.order_no, summary: `ลบออเดอร์ ${o.order_no} ถาวร (฿${o.sales})` });
      toast('ลบออเดอร์ถาวรแล้ว', 'success');
      onClose(); onChanged?.();
    } catch (e) { toast('ลบไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
    finally { setBusy(false); }
  };
  const saveLine = async (s) => {
    setBusy(true);
    // รหัสสินค้าเต็ม = รหัสฐาน + สี + ไซซ์ (JSK01-WH-XL) → derive สี/ไซซ์ตอนอ่าน · ไม่ต้องคอลัมน์ใหม่
    const baseCode = (linePick.code || '').trim();
    const fullCode = buildLineSku(baseCode, linePick.color, linePick.size) || baseCode;
    const row = { key: skuOverrideKey(o.order_no, s.raw_sku_or_name), order_no: o.order_no, design: linePick.design.trim(), product_code: fullCode, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('tmk_sku_overrides').upsert(row, { onConflict: 'key' });
    setBusy(false);
    if (error) { window.__toast && window.__toast(/relation|does not exist|schema cache/i.test(error.message) ? 'ต้องรัน migration tmk_sku_overrides ก่อน' : 'บันทึกไม่สำเร็จ: ' + error.message, 'error'); return; }
    logAudit({ action: 'update', entityType: 'data', entityName: o.order_no, summary: `แก้ลายบรรทัด "${s.raw_sku_or_name}" → ${linePick.design}` });
    window.__toast && window.__toast('แก้ลายบรรทัดนี้แล้ว — มีผลทันที ไม่ต้อง reimport', 'success');
    setLineEdit(null); onSaved && onSaved();
  };
  const stMap = { completed: 'สำเร็จ', delivered: 'ส่งแล้ว', cancelled: 'ยกเลิก', pending: 'รอดำเนินการ', processing: 'กำลังทำ', shipped: 'จัดส่งแล้ว' };
  // COD เต็มจำนวน (ยอด COD = ยอดขาย) → โชว์ป้าย "เก็บปลายทาง" แทนเลขซ้ำ · COD บางส่วน → โชว์เลขจริง
  const isFullCod = o.cod_amount > 0 && Number(o.cod_amount) === Number(o.sales);
  const money = [{ label: 'ยอดขาย', val: B(o.sales), badge: isFullCod ? 'เก็บปลายทาง (COD)' : '' }];
  if (o.mkt_commission > 0) money.push({ label: 'ค่าธรรมเนียม', val: '−' + B(o.mkt_commission) });
  if (o.cod_amount > 0 && !isFullCod) money.push({ label: 'ยอด COD', val: B(o.cod_amount) });
  // ปุ่มจัดการอยู่ที่ footer (กันทับ badge บนหัว) — ตอนแก้ไขเหลือแค่ "ปิด" (ฟอร์มมี Save/Cancel เอง)
  const footerActions = edit ? <Button variant="outline" onClick={onClose}>ปิด</Button> : (
    <div className="flex w-full items-center gap-2 flex-wrap">
      {!isCancelled && window.__canEdit !== false && <Button variant="outline" size="sm" className="gap-1" onClick={startEdit} disabled={busy}><Icon name="pencil" /> แก้ไข</Button>}
      {isCancelled
        ? <Button variant="outline" size="sm" className="gap-1" style={{ color: 'var(--good)' }} onClick={restoreOrder} disabled={busy}><Icon name="refresh" /> นำกลับมา</Button>
        : <Button variant="outline" size="sm" className="gap-1" style={{ color: 'var(--warn)' }} onClick={cancelOrder} disabled={busy}><Icon name="x" /> ยกเลิกออเดอร์</Button>}
      <Button variant="outline" size="sm" className="gap-1" style={{ color: 'var(--bad)' }} onClick={deleteOrder} disabled={busy}><Icon name="trash" /> ลบ</Button>
      <Button variant="outline" className="ml-auto" onClick={onClose}>ปิด</Button>
    </div>
  );
  return <SideSheet size="lg" icon="listChecks" title={`ออเดอร์ ${o.order_no}`}
    sub={<span className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><span className="order-channel-chip"><span className="order-channel-dot" style={{ background: channelColor(o.channel) }} />{o.channel}</span><span style={{ color: 'var(--ink-4)' }}>{o.order_date || o.order_month}</span><b style={{ color: 'var(--ink)' }}>{B(o.sales)}</b></span>}
    onClose={onClose} footer={footerActions}>
    {(isCancelled || sk.length === 0 || designs.some(d => d.design === '(จับคู่ไม่ได้)')) && (
      <div className="quality-row items-center">
        {isCancelled && <Badge variant="secondary" className="rounded-full text-[10px] font-medium bg-red-500/15 text-red-600 dark:text-red-400">ยกเลิกแล้ว</Badge>}
        {sk.length === 0 && <Badge variant="warning" className="rounded-full text-[10px] font-medium">ไม่มี SKU</Badge>}
        {designs.some(d => d.design === '(จับคู่ไม่ได้)') && <Badge variant="warning" className="rounded-full text-[10px] font-medium">มีลายจับคู่ไม่ได้</Badge>}
      </div>
    )}

    {edit && (
      <div className="flex flex-col gap-3">
        <div className="cap cap-head" style={{ fontWeight: 700, color: 'var(--accent)' }}><Icon name="pencil" /> แก้ไขออเดอร์ — มีผลกับรายงานทันที</div>

        <FormSection icon="listChecks" title="ออเดอร์">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="วันที่"><DatePicker value={edit.order_date} onChange={v => setEdit({ ...edit, order_date: v || '' })} /></Field>
            <Field label="ช่องทาง">
              <Select value={edit.channel || undefined} onValueChange={v => setEdit({ ...edit, channel: v })}>
                <SelectTrigger className="bg-background"><SelectValue placeholder="เลือกช่องทาง" /></SelectTrigger>
                <SelectContent>{[...new Set([...CHANNELS, edit.channel].filter(Boolean))].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="ประเภทงาน">
              {(() => {
                // ยึด "หมายเหตุ" ตัดสิน ปลีก/DFT (isDftNote) · OEM = เลือกตรง — เลือก DFT/ปลีก = เติม/ถอดคำ "DFT" ในหมายเหตุให้เอง
                const eff = edit.job_type === 'OEM' ? 'OEM' : (isDftNote(edit.note) ? 'DFT' : 'ปลีก');
                const stripDft = (s) => String(s || '').replace(/\bdft\b/ig, '').replace(/\s{2,}/g, ' ').trim();
                const pick = (v) => {
                  if (!v || v === eff) return;
                  if (v === 'OEM') { setEdit({ ...edit, job_type: 'OEM' }); return; }
                  let n = stripDft(edit.note);
                  if (v === 'DFT') n = (n ? n + ' ' : '') + 'DFT';
                  setEdit({ ...edit, job_type: v, note: n });
                };
                return (
                  <ToggleGroup type="single" value={eff} onValueChange={pick} variant="outline" className="justify-start"
                    title="ปลีก/DFT ตัดสินจากคำ “DFT” ในหมายเหตุ — เลือกแล้วระบบเติม/ถอดให้">
                    {JOB_TYPES.map(j => <ToggleGroupItem key={j} value={j} className="h-9 px-3 text-[13px] whitespace-nowrap">{j}</ToggleGroupItem>)}
                  </ToggleGroup>
                );
              })()}
            </Field>
          </div>
        </FormSection>

        <FormSection icon="wallet" title="เงิน">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="ยอดขาย (฿)"><Input className="bg-background" type="number" inputMode="decimal" min="0" step="0.01" value={edit.sales} onChange={e => setEdit({ ...edit, sales: e.target.value })} /></Field>
            <Field label="จำนวน (ตัว)"><Input className="bg-background" type="number" inputMode="numeric" min="0" value={edit.qty} onChange={e => setEdit({ ...edit, qty: e.target.value })} /></Field>
            <Field label="การชำระ">
              <Select value={edit.payment_type || 'ไม่ระบุ'} onValueChange={v => setEdit({ ...edit, payment_type: v })}>
                <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>{[...new Set([...PAYMENT_TYPES, edit.payment_type].filter(Boolean))].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </FormSection>

        <FormSection icon="user" title="ลูกค้า">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="ชื่อลูกค้า"><Input className="bg-background" value={edit.customer_name} onChange={e => setEdit({ ...edit, customer_name: e.target.value })} placeholder="ชื่อลูกค้า" /></Field>
            <Field label="เบอร์โทร"><Input className="bg-background" value={edit.customer_phone} onChange={e => setEdit({ ...edit, customer_phone: e.target.value })} placeholder="ไว้ตามต่อ / เข้า CRM" /></Field>
            <Field label="โซเชียล (FB/LINE)"><Input className="bg-background" value={edit.customer_social} onChange={e => setEdit({ ...edit, customer_social: e.target.value })} placeholder="ชื่อเพจ/ไลน์" /></Field>
            <Field label="จังหวัด"><ProvinceCombobox className="bg-background" value={edit.province} onChange={v => setEdit({ ...edit, province: v })} /></Field>
            <Field label="ที่อยู่" className="sm:col-span-2"><Input className="bg-background" value={edit.customer_address} onChange={e => setEdit({ ...edit, customer_address: e.target.value })} placeholder="ที่อยู่จัดส่ง (เข้าโปรไฟล์ลูกค้า CRM)" /></Field>
          </div>
          <div className="mt-3"><CustomerTypeChips value={edit.customer_type} onChange={v => setEdit({ ...edit, customer_type: v })} /></div>
        </FormSection>

        <FormSection icon="pencil" title="อื่นๆ">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="เซลล์"><SellerCombobox className="bg-background" value={edit.salesperson} onChange={v => setEdit({ ...edit, salesperson: v })} options={sellerOptions} /></Field>
            <Field label="หมายเหตุ"><Textarea className="bg-background" rows={2} value={edit.note} onChange={e => setEdit({ ...edit, note: e.target.value })} placeholder="เช่น DFT / ล็อตสินค้า / โน้ตภายใน" /></Field>
          </div>
        </FormSection>

        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button onClick={saveOrder} disabled={busy || edit.sales === '' || !(Number(edit.sales) >= 0)}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
          <Button variant="ghost" onClick={() => setEdit(null)} disabled={busy}>ยกเลิก</Button>
          {hasOv && <Button variant="ghost" className="ml-auto" style={{ color: 'var(--bad)' }} onClick={revertOrder} disabled={busy}><Icon name="refresh" /> คืนค่าจากไฟล์</Button>}
        </div>
      </div>
    )}

    {/* ยอดเงิน — การ์ดเดียว: ยอดเด่น + COD badge + เซลล์เสริม (ค่าธรรมเนียม/COD) + แยกราคา (ไม่โชว์ยอดซ้ำ) */}
    <MoneyCard total={o.sales} codBadge={isFullCod ? 'เก็บปลายทาง (COD)' : ''} extras={money.slice(1)}
      subtotal={!edit && fin ? fin.subtotal : undefined} discount={!edit && fin ? fin.discount : undefined}
      shipping={!edit && fin ? fin.shipping : undefined} vat={!edit && fin ? fin.vat : undefined} />

    {/* ไฟล์ใบเสร็จ — เปิด(popup ฝัง PDF)/แนบ/เปลี่ยน (เฉพาะออเดอร์จากใบเสร็จ) */}
    {!edit && isReceipt && rec && (
      <div className="flex items-center gap-2 flex-wrap">
        {rec.file_url
          ? <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setPdfOpen(true)}><Icon name="external" className="size-3.5" /> เปิดไฟล์ใบเสร็จ</Button>
          : <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Icon name="external" className="size-3.5 opacity-60" /> ยังไม่มีไฟล์แนบ</span>}
        {rec.status !== 'void' && canEditReceipt(rec, { email: window.__userEmail, isAdmin: window.__isAdmin === true }) && (
          <>
            <input ref={attachRef} type="file" accept="application/pdf" hidden onChange={e => { attachReceiptToOrder(e.target.files?.[0]); e.target.value = ''; }} />
            <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={attaching} onClick={() => attachRef.current?.click()}>
              <Icon name="pencil" className="size-3.5" /> {attaching ? 'กำลังแนบ…' : rec.file_url ? 'เปลี่ยนไฟล์' : 'แนบไฟล์'}
            </Button>
          </>
        )}
      </div>
    )}
    {pdfOpen && rec?.file_url && <ReceiptPdfModal url={rec.file_url} title={`ใบเสร็จ ${o.order_no}`} onClose={() => setPdfOpen(false)} />}

    {o.note && (
      <div className="flex gap-2.5 rounded-xl border p-3" style={{ borderColor: 'var(--line)', background: 'var(--warn-soft)' }}>
        <span className="mt-0.5 shrink-0 [&_svg]:size-[15px]" style={{ color: 'var(--warn)' }}><Icon name="lightbulb" /></span>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold" style={{ color: 'var(--warn)' }}>หมายเหตุ</div>
          <div className="text-sm" style={{ color: 'var(--ink)' }}>{o.note}</div>
        </div>
      </div>
    )}

    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
      <DrawerGroup icon="listChecks" title="ข้อมูลออเดอร์">
        <DrawerField label="เลขออเดอร์">{o.order_no}</DrawerField>
        {o.marketplace_id && o.marketplace_id !== '-' && <DrawerField label="ID มาร์เก็ตเพลส">{o.marketplace_id}</DrawerField>}
        <DrawerField label="วันที่">{o.order_date || o.order_month}</DrawerField>
        <DrawerField label="ช่องทาง"><span className="row" style={{ gap: 6, alignItems: 'center' }}><span style={{ width: 8, height: 8, borderRadius: 3, background: channelColor(o.channel), flex: 'none' }} />{o.channel}</span></DrawerField>
        <DrawerField label="ประเภทงาน">{jt === 'ปลีก' ? 'ปลีก' : <span className={'chip ' + jtCls}>{jt}</span>}</DrawerField>
        {o.status && o.status !== 'completed' && o.status !== 'active' && <DrawerField label="สถานะ"><Badge variant="secondary">{stMap[o.status] || o.status}</Badge></DrawerField>}
        <DrawerField label="การชำระ">{o.payment_type || '—'}</DrawerField>
      </DrawerGroup>
      <DrawerGroup icon="user" title="ลูกค้า">
        <DrawerField label="ลูกค้า">{o.customer_name || '—'}</DrawerField>
        {custCodeShow(o.customer_code, o.customer_name) && <DrawerField label="รหัสลูกค้า">{custCodeShow(o.customer_code, o.customer_name)}</DrawerField>}
        {o.customer_phone && <DrawerField label="เบอร์">{o.customer_phone}</DrawerField>}
        {o.customer_social && o.customer_social !== o.customer_name && <DrawerField label="โซเชียล">{o.customer_social}</DrawerField>}
        <DrawerField label="สถานะลูกค้า">{o.customer_type || '—'}</DrawerField>
        {o.cust_total_orders > 0 && <DrawerField label="ออเดอร์สะสม">{N(o.cust_total_orders)} ครั้ง</DrawerField>}
        {o.province && <DrawerField label="จังหวัด">{o.province}</DrawerField>}
        <DrawerField label="เซลล์">{o.salesperson || '—'}</DrawerField>
      </DrawerGroup>
    </div>
    {designs.length > 0 && <>
      <div className="cap cap-head mt-1 mb-1.5" style={{ fontWeight: 600, color: 'var(--accent)' }}><Icon name="bag" /> ลายเสื้อในออเดอร์นี้ ({N(designs.length)} ลาย)</div>
      <div style={{ display: 'grid', gap: 6, marginBottom: 4 }}>{designs.map((d, i) => (
        <div key={i} className="row between" style={{ gap: 8, padding: '7px 11px', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', border: '1px solid var(--line)', flexWrap: 'wrap' }}>
          <span style={{ minWidth: 0 }}><b style={{ color: d.design === '(จับคู่ไม่ได้)' ? 'var(--bad)' : 'var(--ink)' }}>{d.design}</b>{d.codes.size > 0 && <Badge variant="outline" style={{ marginLeft: 8 }}>รหัส {[...d.codes].join(', ')}</Badge>}</span>
          <span className="num cap"><b style={{ color: 'var(--ink)' }}>{N(d.qty)}</b> ตัว · {B(d.sales)}</span>
        </div>
      ))}</div>
    </>}
    {sk.length > 0 && <>
      <div className="cap mt-1 mb-1.5" style={{ fontWeight: 600, color: 'var(--ink-3)' }}>รายการสินค้า ({N(sk.length)} รายการ · {N(sk.reduce((a, x) => a + (Number(x.qty) || 0), 0))} ตัว)</div>
      <CardTable className="table-wrap"><Table>
        <TableHeader><TableRow><TableHead>ลาย</TableHead><TableHead>รหัส</TableHead><TableHead>สี</TableHead><TableHead>ไซซ์</TableHead><TableHead style={{ textAlign: 'right' }}>จำนวน</TableHead><TableHead style={{ textAlign: 'right' }}>ยอด</TableHead><TableHead>จับคู่</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>{sk.map((s, i) => [
          <TableRow key={i}>
            <TableCell className="cell-title" style={{ fontWeight: 600 }}>{s.design || <span style={{ color: 'var(--bad)' }}>จับคู่ไม่ได้</span>}{s._resolveSrc === 'override' && <Badge variant="outline" className="ml-1.5 text-[10px]" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>แก้มือ</Badge>}{s.raw_sku_or_name && s.raw_sku_or_name !== s.design && <div className="cap" style={{ color: 'var(--ink-4)' }}>{s.raw_sku_or_name}</div>}</TableCell>
            <TableCell className="cap">{s.product_code || '—'}</TableCell>
            <TableCell className="cap">{s.color || '—'}</TableCell>
            <TableCell className="cap">{s.size || '—'}</TableCell>
            <TableCell className="num" style={{ textAlign: 'right' }}>{N(s.qty)}</TableCell>
            <TableCell className="num" style={{ textAlign: 'right' }}>{B(s.line_sales)}</TableCell>
            <TableCell><span className="cap" style={{ color: s.match_how ? 'var(--ink-3)' : 'var(--bad)' }}>{s.match_how || '—'}</span></TableCell>
            <TableCell style={{ textAlign: 'right' }}>{lineEdit !== i && <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={() => { setLineEdit(i); const d = findDesign(s.design); setLinePick({ design: s.design || '', code: d?.code || s.product_code || '', color: s.color || '', size: s.size || '' }); }} title="แก้ลาย/สี/ไซซ์บรรทัดนี้"><Icon name="pencil" /></Button>}</TableCell>
          </TableRow>,
          lineEdit === i && <TableRow key={i + '-edit'}>
            <TableCell colSpan={8} style={{ background: 'var(--surface-2)' }}>
              <div className="cap cap-head mb-2" style={{ fontWeight: 700, color: 'var(--accent)' }}><Icon name="pencil" /> แก้ลาย/สี/ไซซ์ของ "{s.raw_sku_or_name || s.design}" (เลือกจากสินค้า หรือพิมพ์รหัสเอง)</div>
              <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 220 }}><DesignCombobox value={linePick.design} code={linePick.code} onPick={({ name, code, design: d }) => setLinePick(p => ({ design: name, code: code || p.code, color: (p.color && d?.colors?.length && !d.colors.includes(p.color)) ? '' : p.color, size: (p.size && d?.sizes?.length && !d.sizes.includes(p.size)) ? '' : p.size }))} /></div>
                <div style={{ minWidth: 120 }}><ColorSelect design={findDesign(linePick.design)} value={linePick.color} onChange={v => setLinePick(p => ({ ...p, color: v }))} /></div>
                <div style={{ minWidth: 90 }}><SizeSelect design={findDesign(linePick.design)} value={linePick.size} onChange={v => setLinePick(p => ({ ...p, size: v }))} /></div>
                <Input value={linePick.code} onChange={e => setLinePick({ ...linePick, code: e.target.value })} placeholder="รหัสฐาน เช่น JRP111" style={{ maxWidth: 150 }} />
                <Button size="sm" onClick={() => saveLine(s)} disabled={busy || !linePick.design.trim()}><Icon name="check" /> บันทึก</Button>
                <Button size="sm" variant="ghost" onClick={() => setLineEdit(null)} disabled={busy}>ยกเลิก</Button>
              </div>
            </TableCell>
          </TableRow>,
        ])}</TableBody>
      </Table></CardTable>
    </>}
  </SideSheet>;
}

export function OrdersHub() {
  return <MpOrdersView />;
}


