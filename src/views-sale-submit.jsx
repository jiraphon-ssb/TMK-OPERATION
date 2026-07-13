/* ============================================================
   TMK Operation — "ส่งยอด" (อัปโหลดใบเสร็จ Shipnity → บันทึกยอดเป็นชุด)
   ============================================================
   - เซลล์เลือก PDF หลายไฟล์ หรือ PDF เดียวหลายหน้า (50-60 ใบ/ครั้งได้)
   - อ่านด้วย pdf.js ฝั่ง client (receiptParse.js) — ไม่ใช้ AI/ไม่มีค่าใช้จ่าย
   - ตารางตรวจทั้งชุด: เดาช่องทางให้ · ตั้งค่ารวม · แก้รายใบ · กันซ้ำอัตโนมัติ
   - ยืนยัน → เขียน orders/skus/overrides (receiptSubmit.js) · เซลล์ = คนอัปโหลด
   - หลังส่ง: แก้ (เจ้าของใบ = วันเดียวกัน · แอดมิน = เสมอ) / ยกเลิกใบ + ประวัติ
   ============================================================ */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Icon, N, useBeat, PageSkeleton, SkelTable, PersonAvatar } from './components.jsx';
import { useUser } from './userContext.jsx';
import { useData } from './dataContext.jsx';
import { supabase } from './lib/supabaseClient.js';
import { SideSheet } from './modals.jsx';
import { logAudit } from './lib/audit.js';
import { funnelPlatforms, funnelBreakdown, funnelNewOld, getDateBounds } from './lib/saleData.js';
import { PRESETS, presetRange } from './lib/saleTime.js';
import { useSaleRealtime } from './lib/saleRealtime.js';
import { deriveColorSize } from './lib/mpReport.js';
import { channelColor } from './charts.jsx';
import { downloadCsv } from './lib/exportCsv.js';
import { useTableSort, SortHead, CardTable } from './components/DataTableParts.jsx';
import { ProvinceCombobox } from './components/ProductPicker.jsx';
import { DatePicker } from '@/components/ui/date-picker';
import { parseReceiptFiles, jobTypeFromNote } from './lib/receiptParse.js';
import {
  checkDuplicates, confirmReceipts, attachReceiptFiles, customerTypeLookup,
  canEditReceipt, editReceipt, voidReceipt, uploadReceiptFile,
  isMissingReceiptTable,
} from './lib/receiptSubmit.js';
import { fetchTargets, commissionFor } from './lib/targets.js';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { HealthHub, MultiSelect, DrawerGroup, DrawerField, DateRangePicker } from './views-2.jsx';
import { ImportExportHub } from './saleImportHub.jsx';
import { ManualSaleSheet } from './ManualSaleSheet.jsx';

const CHANNELS = ['Facebook', 'LINE', 'Instagram', 'Phone', 'POS', 'Direct', 'Shopee', 'Lazada', 'TikTok'];
const JOB_TYPES = ['ปลีก', 'OEM', 'DFT'];
const STATUS_OPTS = ['บันทึกแล้ว', 'แก้ไขแล้ว', 'ยกเลิก'];   // ตัวกรองสถานะใบเสร็จ (แบบหน้าออเดอร์)
const matchStatus = (label, r) => {
  if (label === 'บันทึกแล้ว') return r.status === 'confirmed' && !(Array.isArray(r.history) && r.history.length);
  if (label === 'แก้ไขแล้ว') return r.status !== 'void' && Array.isArray(r.history) && r.history.length;
  if (label === 'ยกเลิก') return r.status === 'void';
  return true;
};
const fmtB = (n) => '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const fmtD = (iso) => { const s = String(iso || ''); return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}` : '—'; };
const curMonth = () => new Date().toISOString().slice(0, 7);
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const toast = (m, k) => window.__toast?.(m, k);
// เดือน YYYY-MM ก่อนหน้า (ค.ศ.) — ใช้เทียบเดือนก่อน
const prevMonthOf = (ym) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
// รายชื่อเดือนย้อนหลัง N เดือนจากปัจจุบัน (ใหม่→เก่า) — ใช้ใน Select เลือกเดือน
const monthOptions = (n = 12) => { const out = []; const d = new Date(); for (let i = 0; i < n; i++) { out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); d.setMonth(d.getMonth() - 1); } return out; };
const monthLabel = (ym) => { const [y, m] = ym.split('-'); const th = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']; return `${th[Number(m) - 1] || m} ${Number(y) + 543}`; };

/* ป้ายเตือนยัง未 migrate (ตารางใบเสร็จยังไม่มีใน Supabase) */
function MigrationNotice() {
  return (
    <Card className="p-4 border-amber-500/40 bg-amber-500/10">
      <div className="text-sm font-semibold text-amber-700 dark:text-amber-400">ยังไม่ได้เปิดใช้ระบบส่งยอด</div>
      <div className="text-xs text-muted-foreground mt-1">
        รันไฟล์ <code className="font-mono">supabase/migrations/20260703-sale-receipts.sql</code> ใน Supabase SQL Editor แล้วรีเฟรชหน้านี้
      </div>
    </Card>
  );
}

/* ============================================================
   ฟอร์มแก้ 1 ใบ (ใช้ทั้ง expand แถวตอนตรวจ และแก้หลังส่งใน drawer)
   ============================================================ */
function RowEditor({ row, onChange, showChannel = true }) {
  const set = (k, v) => onChange({ ...row, [k]: v });
  const setLine = (i, k, v) => {
    const lines = row.lines.map((l, ix) => ix === i ? { ...l, [k]: v } : l);
    onChange({ ...row, lines });
  };
  const delLine = (i) => onChange({ ...row, lines: row.lines.filter((_, ix) => ix !== i) });
  const addLine = () => onChange({ ...row, lines: [...row.lines, { code: '', name: '', qty: 1, unit_price: 0, discount: 0, amount: 0 }] });
  const sum = row.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const mismatch = Math.abs(sum - (Number(row.total) || 0)) > 0.01 && Math.abs(sum - (Number(row.subtotal ?? NaN) || NaN)) > 0.01;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <label className="flex flex-col gap-1"><span className="text-[11px] text-muted-foreground">เลขที่เอกสาร</span>
          <Input value={row.order_no || ''} onChange={e => set('order_no', e.target.value.trim())} /></label>
        <label className="flex flex-col gap-1"><span className="text-[11px] text-muted-foreground">วันที่ (YYYY-MM-DD)</span>
          <Input value={row.order_date || ''} onChange={e => set('order_date', e.target.value.trim())} placeholder="2026-07-02" /></label>
        <label className="flex flex-col gap-1"><span className="text-[11px] text-muted-foreground">ชื่อลูกค้า</span>
          <Input value={row.customer_name || ''} onChange={e => set('customer_name', e.target.value)} /></label>
        <label className="flex flex-col gap-1"><span className="text-[11px] text-muted-foreground">เบอร์โทร</span>
          <Input value={row.customer_phone || ''} onChange={e => set('customer_phone', e.target.value)} /></label>
        <div className="flex flex-col gap-1"><span className="text-[11px] text-muted-foreground">จังหวัด</span>
          <ProvinceCombobox value={row.province || ''} onChange={v => set('province', v)} /></div>
        <label className="flex flex-col gap-1"><span className="text-[11px] text-muted-foreground">ยอดรวมสุทธิ</span>
          <Input type="number" inputMode="decimal" value={row.total ?? ''} onChange={e => set('total', Number(e.target.value) || 0)} /></label>
        <label className="flex flex-col gap-1"><span className="text-[11px] text-muted-foreground">การชำระ</span>
          <Input value={row.payment_method || ''} onChange={e => set('payment_method', e.target.value)} placeholder="scb / cod" /></label>
        <label className="flex flex-col gap-1"><span className="text-[11px] text-muted-foreground">หมายเหตุ (DFT = งาน DFT)</span>
          <Input value={row.note || ''} onChange={e => { const v = e.target.value; onChange({ ...row, note: v, job_type: jobTypeFromNote(v) === 'DFT' ? 'DFT' : row.job_type }); }} /></label>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {showChannel && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">ช่องทาง</span>
            {CHANNELS.map(c => (
              <button key={c} type="button" onClick={() => set('channel', c)}
                className={`h-7 px-2 rounded-md border text-xs transition-colors ${row.channel === c ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground'}`}>{c}</button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">ประเภทงาน</span>
          {JOB_TYPES.map(j => (
            <button key={j} type="button" onClick={() => set('job_type', j)}
              className={`h-7 px-2 rounded-md border text-xs transition-colors ${row.job_type === j ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground'}`}>{j}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">ลูกค้า</span>
          {['ลูกค้าใหม่', 'ลูกค้าเก่า'].map(t => (
            <button key={t} type="button" onClick={() => set('customer_type', t)}
              className={`h-7 px-2 rounded-md border text-xs transition-colors ${row.customer_type === t ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground'}`}>{t}</button>
          ))}
        </div>
      </div>
      {/* รายการสินค้า */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr><th className="text-left px-2 py-1.5">รหัส</th><th className="text-left px-2 py-1.5">ชื่อสินค้า</th><th className="text-right px-2 py-1.5 w-14">จำนวน</th><th className="text-right px-2 py-1.5 w-20">ราคา</th><th className="text-right px-2 py-1.5 w-20">ยอด</th><th className="w-8"></th></tr>
          </thead>
          <tbody>
            {row.lines.map((l, i) => (
              <tr key={i} className="border-t">
                <td className="px-1 py-1"><Input className="h-7 text-xs font-mono" value={l.code || ''} onChange={e => setLine(i, 'code', e.target.value)} /></td>
                <td className="px-1 py-1"><Input className="h-7 text-xs" value={l.name || ''} onChange={e => setLine(i, 'name', e.target.value)} /></td>
                <td className="px-1 py-1"><Input className="h-7 text-xs text-right" type="number" value={l.qty ?? 0} onChange={e => setLine(i, 'qty', Number(e.target.value) || 0)} /></td>
                <td className="px-1 py-1"><Input className="h-7 text-xs text-right" type="number" value={l.unit_price ?? 0} onChange={e => setLine(i, 'unit_price', Number(e.target.value) || 0)} /></td>
                <td className="px-1 py-1"><Input className="h-7 text-xs text-right" type="number" value={l.amount ?? 0} onChange={e => setLine(i, 'amount', Number(e.target.value) || 0)} /></td>
                <td className="px-1 py-1 text-center"><button type="button" className="text-muted-foreground hover:text-red-500" onClick={() => delLine(i)} aria-label="ลบรายการ"><Icon name="trash" className="size-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-2 py-1.5 border-t bg-muted/30">
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={addLine}><Icon name="plus" className="size-3" /> เพิ่มรายการ</Button>
          <span className={`text-xs ${mismatch ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-muted-foreground'}`}>
            รวมรายการ {fmtB(sum)}{mismatch ? ` ≠ ยอดบนใบ ${fmtB(row.total)}` : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   หน้าใหญ่
   ============================================================ */
export function SubmitSalesView() {
  const beat = useBeat(350);
  const { user } = useUser();
  const { staff } = useData();
  const canEdit = window.__canEdit !== false;
  const isAdmin = window.__isAdmin === true;

  const [missingTable, setMissingTable] = useState(false);
  const [rows, setRows] = useState([]);            // ใบที่อ่านได้ รอตรวจ
  const [fileErrors, setFileErrors] = useState([]);
  const [parsing, setParsing] = useState(null);    // {done,total}
  const [checking, setChecking] = useState(false);
  const [expandId, setExpandId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);      // {ok:[], skipped:[]}
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  /* ---- feed + KPI ---- */
  const [feed, setFeed] = useState(null);
  const [targets, setTargets] = useState({});
  const [feedScope, setFeedScope] = useState('mine');         // 'mine' | 'team'
  // ช่วงวันที่แบบหน้าออเดอร์ (DateRangePicker) แทน Select เดือน
  const [range, setRange] = useState({ from: '', to: '' });
  const [datePreset, setDatePreset] = useState('month');      // preset ปุ่มช่วงวันที่ (default = เดือนนี้)
  const [bounds, setBounds] = useState({ min: null, max: null });
  const [fSeller, setFSeller] = useState([]);                 // กรองเซลล์ (โหมดทีม) — array แบบหน้าออเดอร์
  const [fStatus, setFStatus] = useState([]);                 // ['บันทึกแล้ว'|'แก้ไขแล้ว'|'ยกเลิก']
  const [fChannel, setFChannel] = useState([]);               // กรองช่องทาง (array)
  const [fSearch, setFSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);      // แผงตัวกรอง (แบบหน้าออเดอร์)
  const [page, setPage] = useState(1);
  const [prevSales, setPrevSales] = useState(null);           // ยอดฉันช่วงก่อนหน้า (เทียบ)
  // เดือนอ้างอิง (เป้า/คอม/ป้าย) = เดือนของปลายช่วง · โหมดเดือนเดียว → ป้ายเป็นชื่อเดือน
  const refMonth = (range.to || todayISO()).slice(0, 7);
  const singleMonth = range.from && range.to && range.from.slice(0, 7) === range.to.slice(0, 7);
  // ตั้งช่วงเริ่มต้น = เดือนปัจจุบันจริง (anchor วันจริง) + ขอบวันที่ข้อมูล
  useEffect(() => { (async () => {
    const b = await getDateBounds('tmk_sale_receipts');
    setBounds({ min: b.min, max: b.max });
    const r = presetRange('month', todayISO(), b.min, b.max);
    setRange({ from: r.from || '', to: r.to || '' });
  })().catch(() => { const r = presetRange('month', todayISO()); setRange({ from: r.from || '', to: r.to || '' }); }); }, []);
  const loadFeed = useCallback(async () => {
    if (!range.from || !range.to) return;   // รอขอบวันที่
    try {
      // โหลด "ทั้งทีม" เสมอเมื่อ admin หรือเลือกโหมดทีม (ทุกคนดูทีมได้ — โปร่งใส) แล้วกรองฝั่ง client
      const wantTeam = feedScope === 'team' || isAdmin;
      // narrow: ตัด `parsed` (raw parser jsonb — ไม่เคย render · ตัวหนักสุด) · คง confirmed/history/file_url ที่ feed+drawer ใช้จริง
      const FEED_SEL = 'id,order_no,uploader_email,salesperson,channel,order_date,order_month,qty,sales,status,confirmed,history,file_url,void_by,void_reason,void_at,created_at';
      let q = supabase.from('tmk_sale_receipts').select(FEED_SEL).gte('order_date', range.from).lte('order_date', range.to).order('created_at', { ascending: false }).limit(2000);
      if (!wantTeam) q = q.eq('uploader_email', user?.email || '');
      const r = await q;
      if (r.error) throw r.error;
      setFeed(r.data || []);
      setMissingTable(false);
    } catch (e) {
      if (isMissingReceiptTable(e)) setMissingTable(true);
      setFeed([]);
    }
  }, [range.from, range.to, feedScope, isAdmin, user?.email]);
  useEffect(() => { loadFeed(); }, [loadFeed]);
  useEffect(() => { setPage(1); }, [feedScope, range.from, range.to, fSeller, fChannel, fStatus, fSearch]);
  useEffect(() => { fetchTargets(refMonth).then(rows2 => { const m = {}; rows2.forEach(t => { m[t.salesperson] = t; }); setTargets(m); }).catch(() => {}); }, [refMonth]);
  // ยอดฉันเดือนก่อน (เทียบ ▲▼) — เฉพาะโหมดเดือนเดียว (ช่วงกว้างเทียบไม่ได้)
  useEffect(() => {
    if (!singleMonth) { setPrevSales(null); return; }
    const pm = prevMonthOf(refMonth);
    supabase.from('tmk_sale_receipts').select('sales,status,uploader_email').eq('order_month', pm).eq('uploader_email', user?.email || '')
      .then(({ data }) => setPrevSales((data || []).filter(r => r.status === 'confirmed').reduce((s, r) => s + (Number(r.sales) || 0), 0)))
      .catch(() => setPrevSales(null));
  }, [refMonth, singleMonth, user?.email]);
  // realtime: ทีมส่งใบ/แก้ → feed อัปเดตสด (ต้องรัน migration 20260706)
  useSaleRealtime(['tmk_sale_receipts', 'tmk_sales_funnel'], loadFeed);
  // ปุ่มช่วงวันที่ (แบบหน้าออเดอร์): preset → presetRange · เลือกเอง → กำหนดเอง
  const pickPreset = (id) => { const r = presetRange(id, todayISO(), bounds.min, bounds.max); setDatePreset(id); setRange({ from: r.from || '', to: r.to || '' }); };
  const pickRange = (f, t) => { setDatePreset(''); setRange({ from: f || '', to: t || '' }); };
  const rangeLabel = singleMonth ? monthLabel(refMonth) : `${fmtD(range.from)}–${fmtD(range.to)}`;

  const myKpi = useMemo(() => {
    const mine = (feed || []).filter(r => r.status === 'confirmed' && r.uploader_email === user?.email);
    const sales = mine.reduce((s, r) => s + (Number(r.sales) || 0), 0);
    const t = targets[user?.name] || null;
    const target = Number(t?.sales_target) || 0;
    const dPct = prevSales != null && prevSales > 0 ? (sales - prevSales) / prevSales * 100 : null;
    return { count: mine.length, sales, target, pct: target ? Math.min(100, sales / target * 100) : 0, comm: t ? commissionFor(sales, t) : 0, dPct };
  }, [feed, targets, user, prevSales]);

  /* ---- feed ที่กรอง/เรียง/แบ่งหน้า ---- */
  const scopedFeed = useMemo(() => {
    let rows2 = feed || [];
    if (feedScope === 'mine') rows2 = rows2.filter(r => r.uploader_email === user?.email);
    if (fSeller.length) rows2 = rows2.filter(r => fSeller.includes(r.salesperson || ''));
    if (fChannel.length) rows2 = rows2.filter(r => fChannel.includes(r.channel || ''));
    if (fStatus.length) rows2 = rows2.filter(r => fStatus.some(s => matchStatus(s, r)));
    if (fSearch.trim()) {
      const q = fSearch.trim().toLowerCase();
      rows2 = rows2.filter(r => String(r.order_no || '').toLowerCase().includes(q) || String(r.confirmed?.customer_name || '').toLowerCase().includes(q));
    }
    return rows2;
  }, [feed, feedScope, fSeller, fChannel, fStatus, fSearch, user?.email]);
  const channelOpts = useMemo(() => [...new Set((feed || []).map(r => r.channel).filter(Boolean))].sort(), [feed]);
  const nFilters = fSeller.length + fChannel.length + fStatus.length;
  const clearFilters = () => { setFSeller([]); setFChannel([]); setFStatus([]); };
  const feedStat = useMemo(() => {
    const active = scopedFeed.filter(r => r.status !== 'void');
    const sales = active.reduce((s, r) => s + (Number(r.sales) || 0), 0);
    const voids = scopedFeed.filter(r => r.status === 'void').length;
    return { total: scopedFeed.length, sales, voids, avg: active.length ? sales / active.length : 0 };
  }, [scopedFeed]);
  const sellerOpts = useMemo(() => [...new Set((feed || []).map(r => r.salesperson).filter(Boolean))].sort(), [feed]);
  // รายชื่อเซลล์สำหรับคนทัก (staff + คนที่มีใบเสร็จ) · จำนวนออเดอร์ยืนยันวันนี้ต่อคน (ไว้คิด %ปิด)
  const funnelSellers = useMemo(() => {
    const set = new Set();
    (staff || []).forEach(s => { if (s?.name) set.add(s.name); });
    (feed || []).forEach(r => { if (r?.salesperson) set.add(r.salesperson); });
    return [...set].sort();
  }, [staff, feed]);
  const ordersToday = useMemo(() => {
    const m = {}, t = todayISO();
    (feed || []).forEach(r => { if (r.status === 'confirmed' && r.order_date === t && r.salesperson) m[r.salesperson] = (m[r.salesperson] || 0) + 1; });
    return m;
  }, [feed]);
  const feedSortAcc = useMemo(() => ({
    order_no: r => r.order_no, order_date: r => r.order_date, salesperson: r => r.salesperson,
    sales: r => Number(r.sales) || 0, qty: r => Number(r.qty) || 0, customer: r => r.confirmed?.customer_name || '', channel: r => r.channel,
  }), []);
  const { sorted: sortedFeed, sortKey: fSortKey, sortDir: fSortDir, toggleSort: fToggle } = useTableSort(scopedFeed, { key: 'order_date', dir: 'desc', accessors: feedSortAcc });
  const PAGE = 50;
  const pages = Math.max(1, Math.ceil(sortedFeed.length / PAGE));
  const curPage = Math.min(page, pages);   // clamp — กัน realtime/void ทำ list หด แล้วค้างหน้าว่าง
  const pageRows = sortedFeed.slice((curPage - 1) * PAGE, curPage * PAGE);
  const exportFeed = () => downloadCsv(`ใบเสร็จ-${range.from}_${range.to}`, scopedFeed, [
    { key: 'order_no', label: 'เลขที่' }, { key: 'order_date', label: 'วันที่' }, { key: 'salesperson', label: 'เซลล์' },
    { label: 'ลูกค้า', map: r => r.confirmed?.customer_name || '' }, { key: 'channel', label: 'ช่องทาง' },
    { key: 'qty', label: 'จำนวน' }, { key: 'sales', label: 'ยอด' }, { key: 'status', label: 'สถานะ' },
  ]);

  /* ---- เลือกไฟล์ → parse → เช็คซ้ำ/เก่าใหม่ ---- */
  const onFiles = async (fileList) => {
    const files = [...fileList].filter(f => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
    if (!files.length) { toast('รองรับเฉพาะไฟล์ PDF จาก Shipnity', 'warn'); return; }
    setResult(null); setFileErrors([]); setParsing({ done: 0, total: files.length });
    try {
      const { receipts, errors } = await parseReceiptFiles(files, (done, total) => setParsing({ done, total }));
      setFileErrors(errors);
      if (!receipts.length) { setParsing(null); return; }
      setChecking(true);
      const nos = receipts.map(r => r.order_no).filter(Boolean);
      const [{ dupReceipts, dupOrders, missingTable: miss }, typeOf] = await Promise.all([
        checkDuplicates(nos), customerTypeLookup(receipts),
      ]);
      if (miss) setMissingTable(true);
      const seen = new Set();
      const next = receipts.map((r, i) => {
        const problems = [...(r.warnings || [])];
        let hard = false;
        if (!r.order_no) { hard = true; }
        else if (seen.has(r.order_no)) { problems.push('เลขซ้ำในชุดนี้'); hard = true; }
        else seen.add(r.order_no);
        const dup = dupReceipts.get(r.order_no);
        if (dup && dup.status === 'confirmed') { problems.push(`ส่งแล้วโดย ${dup.salesperson || dup.uploader_email}`); hard = true; }
        const fromImport = !dup && dupOrders.has(r.order_no);
        if (fromImport) problems.push('มีอยู่แล้วจากไฟล์ import — ติ๊กเพื่อบันทึกทับ');
        return {
          _id: `r${i}`, ...r,
          parsedRaw: { ...r, file: undefined },
          channel: r.channel_hint || '',
          job_type: jobTypeFromNote(r.note),
          customer_type: typeOf(r),
          problems, hard, fromImport,
          selected: !hard && !fromImport,
        };
      });
      setRows(next);
      setExpandId(null);
    } catch (e) {
      toast('อ่านไฟล์ไม่สำเร็จ: ' + (e?.message || ''), 'error');
    } finally { setParsing(null); setChecking(false); }
  };

  const patchRow = (id, patch) => setRows(rs => rs.map(r => r._id === id ? { ...r, ...patch } : r));
  const selectedRows = rows.filter(r => r.selected && !r.hard);
  const readyRows = selectedRows.filter(r => r.channel && r.order_no && (Number(r.total) || 0) > 0);
  const sumSelected = selectedRows.reduce((s, r) => s + (Number(r.total) || 0), 0);

  const setChannelAll = (c) => setRows(rs => rs.map(r => r.selected && !r.hard ? { ...r, channel: c } : r));

  /* ---- ยืนยันชุด ---- */
  const submit = async () => {
    if (!canEdit) { toast('บัญชีนี้เป็นสิทธิ์ "ดูอย่างเดียว"', 'warn'); return; }
    if (!readyRows.length) return;
    if (readyRows.length < selectedRows.length) { toast('บางใบยังไม่ได้เลือกช่องทาง', 'warn'); return; }
    if (!await window.__confirm?.({ title: 'บันทึกยอด', body: `บันทึก ${readyRows.length} ใบ · ${fmtB(sumSelected)}\nยอดจะขึ้น dashboard ในชื่อ "${user?.name || user?.email}" ทันที`, confirmText: 'บันทึก' })) return;
    setSaving(true);
    try {
      const res = await confirmReceipts(readyRows, { email: user?.email || '', name: user?.name || '' });
      setResult(res);
      setRows(rs => rs.filter(r => !res.ok.includes(String(r.order_no).trim())));
      loadFeed();
      // รายงานตามจริง: สำเร็จ / ข้าม(ส่งแล้ว·ซ้ำ) — ไม่เงียบเมื่อ ok=0
      const nOk = res.ok.length, nSkip = res.skipped.length;
      if (nOk) toast(`บันทึกแล้ว ${nOk} ใบ${nSkip ? ` · ข้าม ${nSkip} (ส่งแล้ว/ซ้ำ)` : ''}`, 'success');
      else if (nSkip) toast(`ข้าม ${nSkip} ใบ — ส่งแล้ว/เลขซ้ำ (ไม่มีใบใหม่)`, 'warn');
      // หลักฐานขึ้น Storage แบบ background (ไม่บล็อก)
      attachReceiptFiles(readyRows.filter(r => res.ok.includes(String(r.order_no).trim())).map(r => ({ order_no: String(r.order_no).trim(), file: r.file, page: r.page })))
        .then(() => loadFeed()).catch(() => {});
    } catch (e) {
      if (isMissingReceiptTable(e)) { setMissingTable(true); toast('ต้องรัน migration ก่อน (20260703-sale-receipts.sql)', 'warn'); }
      else toast('บันทึกไม่สำเร็จ: ' + (e?.message || ''), 'error');
    } finally { setSaving(false); }
  };

  /* ---- drawer รายละเอียด/แก้/ยกเลิก ---- */
  const [manualOpen, setManualOpen] = useState(false);   // ฟอร์มคีย์มือ (ยุบจากหน้าบันทึกขาย)
  const [detail, setDetail] = useState(null);   // แถว feed
  const [editRow, setEditRow] = useState(null); // payload กำลังแก้
  const [editSeller, setEditSeller] = useState('');
  const [attaching, setAttaching] = useState(false);   // แนบไฟล์ย้อนหลัง
  const attachRef = useRef(null);
  const openDetail = (r) => { setDetail(r); setEditRow(null); setEditSeller(r.salesperson || ''); };
  // แนบ/เปลี่ยนไฟล์ใบเสร็จหลังส่ง (ใบเก่าที่ไฟล์ไม่ขึ้น — bucket เพิ่งรองรับ PDF)
  const attachFile = async (file) => {
    if (!file || !detail) return;
    setAttaching(true);
    try {
      const url = await uploadReceiptFile(file, detail.order_no);
      if (!url) { toast('อัปโหลดไม่สำเร็จ — รัน migration 20260704 (bucket รับ PDF) แล้วหรือยัง?', 'error'); return; }
      const { error } = await supabase.from('tmk_sale_receipts').update({ file_url: url }).eq('order_no', detail.order_no);
      if (error) { toast('บันทึกลิงก์ไม่สำเร็จ: ' + error.message, 'error'); return; }
      toast('แนบไฟล์ใบเสร็จแล้ว', 'success');
      setDetail(d => d ? { ...d, file_url: url } : d); loadFeed();
    } catch (e) { toast('แนบไฟล์ไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
    finally { setAttaching(false); }
  };
  const startEdit = () => {
    const c = detail.confirmed || {};
    setEditRow({
      ...c,   // พกทุกฟิลด์บนใบไปด้วย (vat/promo_code/order_time/tax_id/masked/…) — แก้ใบแล้วข้อมูลที่ไม่ได้แตะต้องไม่หาย
      order_no: detail.order_no, order_date: detail.order_date || c.order_date || '',
      customer_name: c.customer_name || '', customer_phone: c.customer_phone || '',
      customer_social: c.customer_social || '', customer_address: c.customer_address || '',
      province: c.province || '', lines: Array.isArray(c.lines) ? c.lines : [],
      subtotal: c.subtotal, discount: c.discount, shipping: c.shipping,
      total: Number(detail.sales) || Number(c.total) || 0,
      payment_method: c.payment_method || '', carrier: c.carrier || '', note: c.note || '',
      channel: detail.channel || c.channel || '', job_type: c.job_type || 'ปลีก',
      customer_type: c.customer_type || 'ลูกค้าใหม่',
    });
  };
  const saveEdit = async () => {
    try {
      const override = isAdmin && editSeller && editSeller !== detail.salesperson ? editSeller : null;
      await editReceipt(detail, editRow, { email: user?.email, name: user?.name, isAdmin }, { salespersonOverride: override });
      toast('แก้ไขแล้ว — ยอดใน dashboard อัปเดตทันที', 'success');
      setDetail(null); setEditRow(null); loadFeed();
    } catch (e) { toast('แก้ไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
  };
  const doVoid = async () => {
    if (!await window.__confirm?.({ title: 'ยกเลิกใบเสร็จ', body: `ยกเลิกใบ ${detail.order_no}?\nยอดจะถูกตัดออกจากรายงานทันที (ส่งใหม่ได้)`, danger: true, confirmText: 'ยกเลิกใบ' })) return;
    try {
      await voidReceipt(detail, { by: user?.name || user?.email, reason: '' });
      toast('ยกเลิกใบแล้ว', 'success');
      setDetail(null); loadFeed();
    } catch (e) { toast('ยกเลิกไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
  };

  if (beat) return <PageSkeleton />;

  const statusBadge = (r) => r.status === 'void'
    ? <Badge variant="secondary" className="bg-red-500/15 text-red-600 dark:text-red-400">ยกเลิกแล้ว</Badge>
    : (Array.isArray(r.history) && r.history.length
      ? <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 dark:text-amber-400">แก้ไขแล้ว</Badge>
      : <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">บันทึกแล้ว</Badge>);

  return (
    <div className="content-inner rise flex flex-col gap-4">
      {missingTable && <MigrationNotice />}

      {/* บน: ยอดของฉัน (ซ้าย กว้างกว่า) + คนทักวันนี้ (ขวา) — การ์ดสูงเท่ากัน (items-stretch default) */}
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
      {/* KPI ของฉันเดือนนี้ */}
      <Card className="p-4 flex flex-col justify-center">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="wallet" /></span>
            <div>
            <div className="text-[11px] text-muted-foreground">ยอดของฉัน {rangeLabel} ({user?.name || user?.email})</div>
            <div className="text-2xl font-bold flex items-baseline gap-2">
              {fmtB(myKpi.sales)} <span className="text-sm font-normal text-muted-foreground">· {myKpi.count} ใบ</span>
              {myKpi.dPct != null && (
                <span className={`text-xs font-medium ${myKpi.dPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                  {myKpi.dPct >= 0 ? '▲' : '▼'} {Math.abs(Math.round(myKpi.dPct))}% <span className="text-muted-foreground font-normal">vs เดือนก่อน</span>
                </span>
              )}
            </div>
            </div>
          </div>
          {myKpi.target > 0 && (
            <div className="min-w-[220px] flex-1 max-w-sm">
              <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                <span>เป้า {fmtB(myKpi.target)}</span><span>{Math.round(myKpi.sales / myKpi.target * 100)}%{myKpi.comm ? ` · คอม ${fmtB(myKpi.comm)}` : ''}</span>
              </div>
              <Progress value={myKpi.pct} indicatorColor={myKpi.sales >= myKpi.target ? 'var(--good)' : 'var(--accent)'} />
            </div>
          )}
        </div>
      </Card>
      {/* คนทักวันนี้ (funnel) — แยกใหม่/เก่า ต่อแพลตฟอร์ม · แอดมินกรอกให้ทั้งทีม */}
      <FunnelCard sellers={funnelSellers} createdBy={user?.email || ''} isAdmin={isAdmin} ordersToday={ordersToday} />
      </div>

      {/* ขั้น 1: เลือกไฟล์ */}
      {!rows.length && (
        <Card
          className={`p-8 border-dashed border-2 text-center transition-colors ${dragOver ? 'border-primary bg-primary/5' : ''} ${!canEdit ? 'opacity-60' : 'cursor-pointer'}`}
          onClick={() => canEdit && fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); if (canEdit) onFiles(e.dataTransfer.files); }}>
          <input ref={fileRef} type="file" accept="application/pdf" multiple hidden onChange={e => { onFiles(e.target.files); e.target.value = ''; }} />
          {parsing ? (
            <div className="flex flex-col items-center gap-3 py-3">
              <span className="flex h-16 w-16 items-center justify-center rounded-full animate-pulse [&_svg]:size-7" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="upload" /></span>
              <div className="text-sm text-muted-foreground">กำลังอ่านใบเสร็จ… {parsing.done}/{parsing.total} ไฟล์{checking ? ' · เช็คข้อมูลซ้ำ' : ''}</div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-3">
              <span className="flex h-16 w-16 items-center justify-center rounded-full [&_svg]:size-8" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="upload" /></span>
              <div>
                <div className="text-base font-semibold">วางไฟล์ใบเสร็จ Shipnity ที่นี่ หรือลากมาวาง</div>
                <div className="text-xs text-muted-foreground mt-1">PDF หลายไฟล์พร้อมกัน หรือ PDF เดียวหลายหน้า (50-60 ใบต่อครั้งได้) · ระบบอ่านเองไม่กี่วินาที</div>
              </div>
              <Button size="sm" disabled={!canEdit} onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}><Icon name="upload" /> เลือกไฟล์</Button>
              {!canEdit && <div className="text-xs text-amber-600">บัญชีนี้เป็นสิทธิ์ "ดูอย่างเดียว" — ส่งยอดไม่ได้</div>}
            </div>
          )}
          {fileErrors.length > 0 && (
            <div className="mt-3 text-left inline-block text-xs text-red-500">
              {fileErrors.map((e, i) => <div key={i}>· {e.file}: {e.error}</div>)}
            </div>
          )}
          {/* คีย์มือ — ขายไม่มีใบเสร็จ (ยุบจากหน้าบันทึกขาย · เข้าท่อเดียวกับใบเสร็จ) */}
          {canEdit && !parsing && (
            <div className="mt-4 pt-3 border-t text-xs text-muted-foreground" onClick={e => e.stopPropagation()}>
              ขายที่ไม่มีใบเสร็จ (หน้าร้าน/โทร)? <Button variant="outline" size="sm" className="ml-1 h-7" onClick={() => setManualOpen(true)}><Icon name="pencil" /> คีย์มือ</Button>
            </div>
          )}
        </Card>
      )}

      {/* ขั้น 2: ตารางตรวจ */}
      {rows.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center gap-2 flex-wrap p-3 border-b bg-muted/30">
            <span className="text-sm font-semibold">ตรวจก่อนบันทึก · {rows.length} ใบ</span>
            <Badge variant="secondary">เลือก {selectedRows.length}</Badge>
            {rows.some(r => r.hard) && <Badge variant="secondary" className="bg-red-500/15 text-red-600 dark:text-red-400">ซ้ำ/มีปัญหา {rows.filter(r => r.hard).length}</Badge>}
            <span className="text-sm text-muted-foreground ml-auto">รวม {fmtB(sumSelected)}</span>
            <Select value="" onValueChange={setChannelAll}>
              <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="ตั้งช่องทางทั้งชุด…" /></SelectTrigger>
              <SelectContent>{CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => { setRows([]); setResult(null); }}>เริ่มใหม่</Button>
            <Button size="sm" disabled={saving || !readyRows.length} onClick={submit}>
              {saving ? 'กำลังบันทึก…' : `บันทึก ${readyRows.length} ใบ · ${fmtB(sumSelected)}`}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/40">
                <tr>
                  <th className="px-3 py-2 w-8"></th>
                  <th className="text-left px-2 py-2">เลขที่</th>
                  <th className="text-left px-2 py-2">วันที่</th>
                  <th className="text-left px-2 py-2">ลูกค้า</th>
                  <th className="text-right px-2 py-2">ยอด</th>
                  <th className="text-left px-2 py-2 w-[150px]">ช่องทาง</th>
                  <th className="text-left px-2 py-2">สถานะ</th>
                  <th className="px-2 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <ReviewRow key={r._id} r={r} expanded={expandId === r._id}
                    onToggle={() => setExpandId(id => id === r._id ? null : r._id)}
                    onSelect={v => patchRow(r._id, { selected: v })}
                    onChannel={c => patchRow(r._id, { channel: c })}
                    onEdit={next => patchRow(r._id, next)} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* สรุปผลหลังบันทึก */}
      {result && (
        <Card className="p-4">
          <div className="text-sm font-semibold">ผลการบันทึก</div>
          <div className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">✓ สำเร็จ {result.ok.length} ใบ</div>
          {result.skipped.length > 0 && (
            <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              ข้าม {result.skipped.length} ใบ: {result.skipped.map(s => `${s.order_no} (${s.reason})`).join(' · ')}
            </div>
          )}
        </Card>
      )}

      {/* ใบเสร็จ — ครบจบ ดูได้ทุกอย่าง (ของฉัน/ทั้งทีม · เลือกเดือน · กรอง · สรุป · CSV) */}
      <Card className="p-0 overflow-hidden">
        {/* แถบเครื่องมือ — ตัวกรองแบบหน้าออเดอร์ (ยุบได้ + ชิป + ล้าง) */}
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <div className="p-3 border-b flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold">ใบเสร็จ</span>
          <Tabs value={feedScope} onValueChange={setFeedScope}>
            <TabsList className="h-8">
              <TabsTrigger value="mine" className="text-xs px-3">ของฉัน</TabsTrigger>
              <TabsTrigger value="team" className="text-xs px-3">ทั้งทีม</TabsTrigger>
            </TabsList>
          </Tabs>
          <DateRangePicker from={range.from} to={range.to} onChange={pickRange} presets={PRESETS} activePreset={datePreset || ''} onPickPreset={pickPreset} />
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5"><Icon name="filter" className="size-3.5" /> ตัวกรอง{nFilters > 0 ? ` (${nFilters})` : ''} <span className={'inline-flex size-3.5 shrink-0 items-center justify-center opacity-60 transition-transform ' + (filtersOpen ? 'rotate-180' : '')}><Icon name="chevD" className="size-3.5" /></span></Button>
          </CollapsibleTrigger>
          <SearchInput value={fSearch} onChange={e => setFSearch(e.target.value)} placeholder="ค้นหา" className="h-8 text-xs" wrapperClassName="ml-auto w-full sm:w-[200px]" />
        </div>
        <CollapsibleContent>
          <div className="p-3 border-b bg-muted/20 flex items-center gap-2 flex-wrap">
            <MultiSelect label="สถานะ" options={STATUS_OPTS} value={fStatus} onChange={setFStatus} />
            {channelOpts.length > 0 && <MultiSelect label="ช่องทาง" options={channelOpts} value={fChannel} onChange={setFChannel} />}
            {feedScope === 'team' && sellerOpts.length > 0 && <MultiSelect label="เซลล์" options={sellerOpts} value={fSeller} onChange={setFSeller} />}
            {nFilters > 0 && <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={clearFilters}>ล้างตัวกรอง</Button>}
          </div>
        </CollapsibleContent>
        {/* ชิปตัวกรองที่เลือก (Badge แบบหน้าออเดอร์เป๊ะ) */}
        {nFilters > 0 && (
          <div className="px-3 py-2 border-b flex items-center gap-1.5 flex-wrap">
            {[
              ...fStatus.map(v => ({ dim: 'สถานะ', v, clear: () => setFStatus(fStatus.filter(x => x !== v)) })),
              ...fChannel.map(v => ({ dim: 'ช่องทาง', v, clear: () => setFChannel(fChannel.filter(x => x !== v)) })),
              ...fSeller.map(v => ({ dim: 'เซลล์', v, clear: () => setFSeller(fSeller.filter(x => x !== v)) })),
            ].map(({ dim, v, clear }) => (
              <Badge key={dim + v} variant="outline" onClick={clear} title="คลิกเพื่อเอาออก" style={{ cursor: 'pointer', padding: '2px 8px' }}><span style={{ color: 'var(--ink-4)' }}>{dim}:</span> {v || '(ไม่ระบุ)'} <Icon name="x" /></Badge>
            ))}
          </div>
        )}
        </Collapsible>
        {feed === null ? <div className="p-3"><SkelTable cols={6} rows={6} /></div>
          : !scopedFeed.length ? <div className="p-6 text-center text-sm text-muted-foreground">ไม่มีใบเสร็จตามเงื่อนไข — {feedScope === 'mine' ? 'เริ่มส่งใบแรกได้เลย' : 'ลองเปลี่ยนเดือน/ตัวกรอง'}</div>
          : (
            <>
            <CardTable className="cozy">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground bg-muted/40">
                  <tr>
                    <SortHead field="order_no" sortKey={fSortKey} sortDir={fSortDir} onSort={fToggle}>เลขที่</SortHead>
                    <SortHead field="order_date" sortKey={fSortKey} sortDir={fSortDir} onSort={fToggle}>วันที่</SortHead>
                    {feedScope === 'team' && <SortHead field="salesperson" sortKey={fSortKey} sortDir={fSortDir} onSort={fToggle}>เซลล์</SortHead>}
                    <SortHead field="customer" sortKey={fSortKey} sortDir={fSortDir} onSort={fToggle}>ลูกค้า</SortHead>
                    <SortHead field="channel" sortKey={fSortKey} sortDir={fSortDir} onSort={fToggle}>ช่องทาง</SortHead>
                    <SortHead field="qty" sortKey={fSortKey} sortDir={fSortDir} onSort={fToggle} align="right">ตัว</SortHead>
                    <SortHead field="sales" sortKey={fSortKey} sortDir={fSortDir} onSort={fToggle} align="right">ยอด</SortHead>
                    <th className="text-left px-2 py-2">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(r => (
                    <tr key={r.id || r.order_no} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => openDetail(r)}>
                      <td className="px-3 py-2 font-mono text-xs cell-title">{r.order_no}</td>
                      <td className="px-2 py-2 text-xs">{fmtD(r.order_date)}</td>
                      {feedScope === 'team' && <td className="px-2 py-2 text-xs">{r.salesperson}</td>}
                      <td className="px-2 py-2 text-xs"><span className="inline-flex items-center gap-1.5 max-w-[160px]">{r.confirmed?.customer_name && <PersonAvatar name={r.confirmed.customer_name} color={channelColor(r.channel)} size={18} className="shrink-0" />}<span className="truncate">{r.confirmed?.customer_name || '—'}</span></span></td>
                      <td className="px-2 py-2 text-xs">{r.channel ? <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full shrink-0" style={{ background: channelColor(r.channel) }} />{r.channel}</span> : '—'}</td>
                      <td className="px-2 py-2 text-right text-xs">{N(r.qty)}</td>
                      <td className="px-2 py-2 text-right font-semibold">{fmtB(r.sales)}</td>
                      <td className="px-2 py-2">{statusBadge(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardTable>
            {pages > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border-t text-xs text-muted-foreground">
                <span>หน้า {curPage}/{pages} · {N(scopedFeed.length)} ใบ</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="h-7" disabled={curPage <= 1} onClick={() => setPage(Math.max(1, curPage - 1))}>ก่อนหน้า</Button>
                  <Button variant="outline" size="sm" className="h-7" disabled={curPage >= pages} onClick={() => setPage(Math.min(pages, curPage + 1))}>ถัดไป</Button>
                </div>
              </div>
            )}
            </>
          )}
      </Card>

      {/* Drawer รายละเอียดใบ */}
      <Sheet open={!!detail} onOpenChange={o => { if (!o) { setDetail(null); setEditRow(null); } }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">ใบเสร็จ {detail.order_no} {statusBadge(detail)}</SheetTitle>
              </SheetHeader>
              {!editRow ? (
                <div className="flex flex-col gap-3 mt-3 text-sm">
                  {/* ยอดเด่น + จำนวน */}
                  <div className="rounded-xl border p-3.5 flex items-center justify-between" style={{ borderColor: 'var(--line)', background: 'var(--surface-2, transparent)' }}>
                    <div>
                      <div className="cap" style={{ color: 'var(--ink-4)' }}>ยอดรวม</div>
                      <div className="text-2xl font-extrabold tabular-nums" style={{ color: 'var(--accent)' }}>{fmtB(detail.sales)}</div>
                    </div>
                    <div className="text-right">
                      <div className="cap" style={{ color: 'var(--ink-4)' }}>จำนวน</div>
                      <div className="text-lg font-bold tabular-nums">{N(detail.confirmed?.lines?.reduce((s, l) => s + (Number(l.qty) || 0), 0) ?? detail.qty)} ตัว</div>
                    </div>
                  </div>
                  {/* กลุ่มข้อมูล (สไตล์เดียวกับหน้าออเดอร์) */}
                  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                    <DrawerGroup icon="listChecks" title="ข้อมูลใบเสร็จ">
                      <DrawerField label="เลขที่">{detail.order_no}</DrawerField>
                      <DrawerField label="วันที่">{fmtD(detail.order_date)}{detail.confirmed?.order_time ? ` · ${detail.confirmed.order_time}` : ''}</DrawerField>
                      <DrawerField label="เซลล์">{detail.salesperson || '—'}</DrawerField>
                      <div><span className="cap">ช่องทาง</span><b><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full shrink-0" style={{ background: channelColor(detail.channel) }} />{detail.channel || '—'}</span></b></div>
                      <DrawerField label="การชำระ">{detail.confirmed?.payment_method || '—'}</DrawerField>
                      <DrawerField label="ขนส่ง">{detail.confirmed?.carrier || '—'}</DrawerField>
                      {detail.confirmed?.promo_code ? <DrawerField label="รหัสส่วนลด">{detail.confirmed.promo_code}</DrawerField> : null}
                      {detail.confirmed?.note ? <DrawerField label="หมายเหตุ">{detail.confirmed.note}</DrawerField> : null}
                    </DrawerGroup>
                    <DrawerGroup icon="user" title="ลูกค้า">
                      <DrawerField label="ชื่อลูกค้า">{detail.confirmed?.customer_name || '—'}</DrawerField>
                      <DrawerField label="เบอร์">{detail.confirmed?.customer_phone || '—'}</DrawerField>
                      {detail.confirmed?.customer_social ? <DrawerField label="โซเชียล">{detail.confirmed.customer_social}</DrawerField> : null}
                      <DrawerField label="จังหวัด">{detail.confirmed?.province || '—'}</DrawerField>
                      {detail.confirmed?.customer_address ? <DrawerField label="ที่อยู่">{detail.confirmed.customer_address}</DrawerField> : null}
                      {detail.confirmed?.customer_tax_id ? <DrawerField label="เลขภาษี">{detail.confirmed.customer_tax_id}</DrawerField> : null}
                    </DrawerGroup>
                  </div>
                  {Array.isArray(detail.confirmed?.lines) && detail.confirmed.lines.length > 0 && (
                    <div className="rounded-xl border overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-[14px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="tag" /></span>
                        <span className="text-[13px] font-bold">รายการสินค้า</span>
                        <span className="ml-auto text-xs text-muted-foreground">{detail.confirmed.lines.length} รายการ</span>
                      </div>
                      <CardTable>
                      <table className="w-full text-xs">
                        <thead className="text-[11px] uppercase text-muted-foreground"><tr className="border-b"><th className="text-left px-3 py-2 font-medium">รหัส</th><th className="text-left px-3 py-2 font-medium">สินค้า</th><th className="text-left px-3 py-2 font-medium">สี/ไซซ์</th><th className="text-right px-3 py-2 font-medium">จำนวน</th><th className="text-right px-3 py-2 font-medium">ยอด</th></tr></thead>
                        <tbody>{detail.confirmed.lines.map((l, i) => { const cs = deriveColorSize(l.name || '', l.code || ''); const c = l.color || cs.color, sz = l.size || cs.size; return <tr key={i} className="border-t hover:bg-muted/30 transition-colors"><td className="px-3 py-2 cell-title"><span className="font-mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent-2)' }}>{l.code}</span></td><td className="px-3 py-2 font-medium">{l.name}</td><td className="px-3 py-2 text-muted-foreground">{[c, sz].filter(Boolean).join(' · ') || '—'}</td><td className="px-3 py-2 text-right tabular-nums">{l.qty}</td><td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtB(l.amount)}</td></tr>; })}</tbody>
                      </table>
                      </CardTable>
                      {/* สรุปยอดครบจากใบ: ยอด/ส่วนลด/ค่าส่ง/VAT → ยอดรวม (โชว์เฉพาะบรรทัดที่มีค่า) */}
                      <div className="px-3 py-2 border-t bg-muted/30 text-xs space-y-1">
                        <div className="flex items-center justify-between"><span className="text-muted-foreground">รวม {N(detail.confirmed.lines.reduce((s, l) => s + (Number(l.qty) || 0), 0))} ตัว{detail.confirmed.subtotal != null ? ` · ยอด ${fmtB(detail.confirmed.subtotal)}` : ''}</span><span className="inline-flex items-center gap-3">
                          {Number(detail.confirmed.discount) ? <span className="text-muted-foreground">ส่วนลด −{fmtB(detail.confirmed.discount)}</span> : null}
                          {Number(detail.confirmed.shipping) ? <span className="text-muted-foreground">ค่าส่ง +{fmtB(detail.confirmed.shipping)}</span> : null}
                          {Number(detail.confirmed.vat) ? <span className="text-muted-foreground">VAT +{fmtB(detail.confirmed.vat)}</span> : null}
                          <b className="tabular-nums">{fmtB(detail.sales)}</b>
                        </span></div>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    {detail.file_url
                      ? <Button asChild size="sm" variant="outline" className="h-8 gap-1.5"><a href={detail.file_url} target="_blank" rel="noreferrer"><Icon name="external" className="size-3.5" /> เปิดไฟล์ใบเสร็จ</a></Button>
                      : <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Icon name="external" className="size-3.5 opacity-60" /> ยังไม่มีไฟล์แนบ</span>}
                    {detail.status !== 'void' && canEditReceipt(detail, { email: user?.email, isAdmin }) && (
                      <>
                        <input ref={attachRef} type="file" accept="application/pdf" hidden onChange={e => { attachFile(e.target.files?.[0]); e.target.value = ''; }} />
                        <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={attaching} onClick={() => attachRef.current?.click()}>
                          <Icon name="pencil" className="size-3.5" /> {attaching ? 'กำลังแนบ…' : detail.file_url ? 'เปลี่ยนไฟล์' : 'แนบไฟล์'}
                        </Button>
                      </>
                    )}
                  </div>
                  {Array.isArray(detail.history) && detail.history.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      <div className="font-medium mb-1">ประวัติการแก้</div>
                      {detail.history.map((h, i) => <div key={i}>· {String(h.at).slice(0, 16).replace('T', ' ')} — {h.by} แก้ {Object.keys(h.changes || {}).join(', ')}</div>)}
                    </div>
                  )}
                  {detail.status === 'void' && <div className="text-xs text-red-500">ยกเลิกโดย {detail.void_by} {detail.void_reason ? `— ${detail.void_reason}` : ''}</div>}
                  {detail.status !== 'void' && (
                    <div className="mt-1 flex items-center gap-1.5 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      <Icon name="external" className="size-3.5 shrink-0" />
                      <span>ต้องการ <b className="text-foreground">แก้ไข</b> หรือ <b className="text-foreground">ยกเลิก</b> ออเดอร์นี้? ทำได้ที่หน้า <button type="button" className="text-[var(--accent)] font-medium hover:underline" onClick={() => { setDetail(null); window.__goSection?.('catalog', 'orders'); }}>ออเดอร์</button></span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3 mt-3">
                  {isAdmin && (
                    <label className="flex flex-col gap-1 text-sm max-w-xs"><span className="text-[11px] text-muted-foreground">เซลล์เจ้าของยอด (แอดมินโอนได้)</span>
                      <Input value={editSeller} onChange={e => setEditSeller(e.target.value)} /></label>
                  )}
                  <RowEditor row={editRow} onChange={setEditRow} />
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setEditRow(null)}>ยกเลิก</Button>
                    <Button size="sm" onClick={saveEdit} disabled={!editRow.order_no || !(Number(editRow.total) > 0)}>บันทึกการแก้ไข</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* คีย์มือ (ขายไม่มีใบเสร็จ) */}
      {manualOpen && <ManualSaleSheet user={user} onClose={() => setManualOpen(false)} onSaved={() => loadFeed()} />}
    </div>
  );
}

/* ---- แยกปัญหาแต่ละชนิดเป็นชิปสั้น + สีต่อชนิด (ดูง่าย ไม่ยาวเป็นพืด) ---- */
const PROBLEM_TONE = {
  block: 'bg-red-500/12 text-red-600 dark:text-red-400 border-red-500/30',       // บันทึกไม่ได้ (ซ้ำ)
  over: 'bg-violet-500/12 text-violet-600 dark:text-violet-400 border-violet-500/30', // มีในระบบ · ทับได้
  warn: 'bg-amber-500/12 text-amber-700 dark:text-amber-400 border-amber-500/30',    // เตือนเบา (แก้ได้)
  info: 'bg-slate-500/12 text-slate-600 dark:text-slate-300 border-slate-400/30',    // ข้อมูล (มาร์เก็ตเพลส)
};
function problemChip(p) {
  const s = String(p || '');
  if (/ส่งแล้วโดย/.test(s)) return { label: s.replace('ส่งแล้วโดย', 'ส่งแล้ว · '), tone: 'block' };
  if (/เลขซ้ำในชุด/.test(s)) return { label: 'ซ้ำในชุดนี้', tone: 'block' };
  if (/มีอยู่แล้วจากไฟล์|import/.test(s)) return { label: 'มีในระบบ · ติ๊กเพื่อทับ', tone: 'over' };
  if (/ปกปิด|มาร์เก็ตเพลส/.test(s)) return { label: 'ลูกค้าปกปิด', tone: 'info' };
  if (/วรรณยุกต์|สระหาย|ฟอนต์/.test(s)) return { label: 'ชื่ออาจเพี้ยน', tone: 'warn' };
  if (/วันที่/.test(s)) return { label: 'ไม่มีวันที่', tone: 'warn' };
  if (/จังหวัด/.test(s)) return { label: 'ไม่มีจังหวัด', tone: 'warn' };
  if (/รหัสสินค้า/.test(s)) return { label: 'ไม่มีรหัส', tone: 'warn' };
  if (/ช่องทาง/.test(s)) return { label: 'ช่องทาง?', tone: 'warn' };
  const short = s.split(/\s*[—(]/)[0].trim().slice(0, 18);
  return { label: short || 'ตรวจสอบ', tone: 'warn' };
}

/* ---- แถวในตารางตรวจ ---- */
function ReviewRow({ r, expanded, onToggle, onSelect, onChannel, onEdit }) {
  const problem = r.problems.length > 0;
  return (
    <>
      <tr className={`border-t ${r.hard ? 'opacity-60 bg-red-500/5' : problem ? 'bg-amber-500/5' : ''}`}>
        <td className="px-3 py-2">
          <Checkbox checked={r.selected} disabled={r.hard} onCheckedChange={v => onSelect(!!v)} aria-label="เลือกใบนี้" />
        </td>
        <td className="px-2 py-2 font-mono text-xs">{r.order_no || '—'}</td>
        <td className="px-2 py-2 text-xs">{fmtD(r.order_date)}</td>
        <td className="px-2 py-2 text-xs max-w-[160px] truncate">{r.customer_name || '—'}<div className="text-[10px] text-muted-foreground">{r.province || ''}</div></td>
        <td className="px-2 py-2 text-right">{fmtB(r.total)}</td>
        <td className="px-2 py-2">
          <Select value={r.channel || ''} onValueChange={onChannel}>
            <SelectTrigger className={`h-7 w-[135px] text-xs ${!r.channel ? 'border-amber-500/60' : ''}`}><SelectValue placeholder="เลือกช่องทาง*" /></SelectTrigger>
            <SelectContent>{CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </td>
        <td className="px-2 py-2">
          <div className="flex items-center gap-1 flex-wrap">
            {r.job_type === 'DFT' && <Badge variant="secondary" className="text-[10px]">DFT</Badge>}
            <Badge variant="secondary" className="text-[10px]">{r.customer_type === 'ลูกค้าเก่า' ? 'เก่า' : 'ใหม่'}</Badge>
            {r.problems.map((p, i) => { const { label, tone } = problemChip(p); return <span key={i} title={p} className={`inline-flex items-center whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${PROBLEM_TONE[tone]}`}>{label}</span>; })}
            {!r.problems.length && <span className="text-[10px] text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5"><Icon name="check" className="size-3" /> พร้อม</span>}
          </div>
        </td>
        <td className="px-2 py-2 text-center">
          <button type="button" className="text-muted-foreground" onClick={onToggle} aria-label="แก้รายละเอียด">
            <span style={{ display: 'inline-grid', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><Icon name="chevR" className="size-4" /></span>
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t bg-muted/20">
          <td colSpan={8} className="px-4 py-3">
            <RowEditor row={r} onChange={next => onEdit(next)} />
          </td>
        </tr>
      )}
    </>
  );
}

/* ============================================================
   SaleDataHub — "ส่งยอด & ข้อมูล" หน้าเดียว 3 แท็บ (แทน sub submit + io เดิม)
   ============================================================
   [ส่งยอดใบเสร็จ (default — เซลล์ใช้ทุกวัน)] [นำเข้ามาร์เก็ตเพลส] [คุณภาพข้อมูล]
   แต่ละแท็บเป็น component เดิมทั้งก้อน (มี content-inner ของตัวเอง) — แค่รวมทางเข้า */
/* ManualSaleSheet ("คีย์มือ") ย้ายไปไฟล์แยก src/ManualSaleSheet.jsx (reuse ในหน้าออเดอร์ด้วย) */

/* ============================================================
   คนทักวันนี้ (funnel) — แยก "คนใหม่/คนเก่า" ต่อแพลตฟอร์ม · แอดมินกรอกให้ทั้งทีม
   เก็บ jsonb `leads` {Facebook:{new,old}, ...} · เขียนคอลัมน์เก่า fb/line ด้วย (back-compat แดชบอร์ด)
   สิทธิ์: เฉพาะแอดมิน (isAdmin) เลือกเซลล์แล้วกรอกให้ · คนอื่นดูแถบทีมอย่างเดียว
   ============================================================ */
const FUNNEL_PLATFORMS = ['Facebook', 'LINE', 'Instagram', 'TikTok', 'Phone', 'อื่นๆ'];
const emptyLeads = () => Object.fromEntries(FUNNEL_PLATFORMS.map(p => [p, { new: '', old: '' }]));
function FunnelCard({ sellers = [], createdBy, isAdmin, ordersToday = {} }) {
  const [date, setDate] = useState(todayISO());   // เลือกวันได้ — กรอก/ดูคนทักย้อนหลัง
  const isToday = date === todayISO();
  const [leads, setLeads] = useState(emptyLeads);
  const [busy, setBusy] = useState(false);
  const [exists, setExists] = useState(false);
  const [open, setOpen] = useState(false);
  const [selSeller, setSelSeller] = useState('');
  const [team, setTeam] = useState([]);   // ทีมวันนี้ (ทุกคน) — ทุกคนเห็นทีมได้
  const nv = (v) => Number(v) || 0;
  // แถวใบเดียว → เติมฟอร์มใหม่/เก่า (legacy/แบน unknown → รวมเข้าช่อง "เก่า" กันข้อมูลหาย)
  const fillFromRow = (data) => {
    const bd = funnelBreakdown(data);
    return Object.fromEntries(FUNNEL_PLATFORMS.map(p => {
      const v = bd[p]; if (!v) return [p, { new: '', old: '' }];
      const nw = Number(v.new) || 0, od = (Number(v.old) || 0) + (Number(v.unknown) || 0);
      return [p, { new: nw ? String(nw) : '', old: od ? String(od) : '' }];
    }));
  };
  const loadSeller = useCallback(async (name) => {
    if (!name) { setLeads(emptyLeads()); setExists(false); return; }
    const { data } = await supabase.from('tmk_sales_funnel').select('*').eq('id', `${date}:${name}`).maybeSingle();
    if (data) { setLeads(fillFromRow(data)); setExists(true); } else { setLeads(emptyLeads()); setExists(false); }
  }, [date]);
  const loadTeam = useCallback(async () => {
    const { data } = await supabase.from('tmk_sales_funnel').select('*').eq('date', date);
    setTeam(data || []);
  }, [date]);
  // เลือกเซลล์คนแรกให้อัตโนมัติ (แอดมินเปิดมาพร้อมกรอก)
  useEffect(() => { if (!selSeller && sellers.length) setSelSeller(sellers[0]); }, [sellers, selSeller]);
  useEffect(() => { if (selSeller) loadSeller(selSeller); }, [selSeller, loadSeller]);
  useEffect(() => { loadTeam(); }, [loadTeam]);
  // realtime: ใครกรอกคนทัก → แถบทีม + ฟอร์มเซลล์ที่เลือกขยับสด
  // realtime: refresh แถบทีมเสมอ · แต่ "ไม่" รีโหลดฟอร์มขณะแอดมินเปิดชีตกรอก (กันทับค่าที่พิมพ์ค้าง)
  useSaleRealtime(['tmk_sales_funnel'], () => { loadTeam(); if (selSeller && !open) loadSeller(selSeller); });
  const teamStat = useMemo(() => {
    const byPlat = {}; let total = 0, newT = 0, oldT = 0;
    (team || []).forEach(r => {
      const pf = funnelPlatforms(r); Object.entries(pf).forEach(([k, v]) => { byPlat[k] = (byPlat[k] || 0) + v; total += v; });
      const no = funnelNewOld(r); newT += no.new; oldT += no.old;
    });
    return { total, byPlat, newT, oldT, people: (team || []).length };
  }, [team]);
  const platTot = (p) => nv(leads[p]?.new) + nv(leads[p]?.old);
  const totalLeads = FUNNEL_PLATFORMS.reduce((a, p) => a + platTot(p), 0);
  const totalNew = FUNNEL_PLATFORMS.reduce((a, p) => a + nv(leads[p]?.new), 0);
  const totalOld = FUNNEL_PLATFORMS.reduce((a, p) => a + nv(leads[p]?.old), 0);
  const ordersCount = nv(ordersToday[selSeller]);
  const close = totalLeads ? Math.round(ordersCount / totalLeads * 100) : 0;
  const closeTone = close >= 15 ? 'var(--good)' : close >= 8 ? 'var(--warn)' : 'var(--bad)';
  const setNum = (p, field, v) => setLeads(prev => ({ ...prev, [p]: { ...prev[p], [field]: v === '' ? '' : String(Math.max(0, Math.floor(Number(v) || 0))) } }));
  const save = async () => {
    if (!isAdmin) { toast('เฉพาะแอดมินกรอกคนทัก', 'error'); return; }
    if (!selSeller) { toast('เลือกเซลล์ก่อน', 'warn'); return; }
    setBusy(true);
    const leadsJson = {};
    FUNNEL_PLATFORMS.forEach(p => { const nw = nv(leads[p]?.new), od = nv(leads[p]?.old); if (nw + od > 0) leadsJson[p] = { new: nw, old: od }; });
    const row = {
      id: `${date}:${selSeller}`, date, salesperson: selSeller, leads: leadsJson,
      // back-compat: คอลัมน์เก่าเก็บใหม่/เก่าของ FB/LINE ตรงความหมาย — แถวเก่า/กราฟเก่ายังอ่านได้
      leads_fb_new: nv(leads.Facebook?.new), leads_fb_old: nv(leads.Facebook?.old),
      leads_line_new: nv(leads.LINE?.new), leads_line_old: nv(leads.LINE?.old),
      note: '', created_by: createdBy, updated_at: new Date().toISOString(),
    };
    let { error } = await supabase.from('tmk_sales_funnel').upsert(row, { onConflict: 'id' });
    if (error && /leads/.test(error.message || '') && !/does not exist.*tmk_sales_funnel|tmk_sales_funnel.*does not exist/.test(error.message || '')) {
      // ยังไม่รัน migration 20260705 (คอลัมน์ leads ไม่มี) → เก็บเฉพาะคอลัมน์เก่า FB/LINE
      const { leads: _l, ...legacy } = row;
      ({ error } = await supabase.from('tmk_sales_funnel').upsert(legacy, { onConflict: 'id' }));
      if (!error) toast('บันทึกได้เฉพาะ FB/LINE — รัน migration 20260705-funnel-leads.sql เพื่อเก็บทุกแพลตฟอร์ม', 'warn');
    }
    setBusy(false);
    if (error) { toast(/funnel|does not exist/.test(error.message) ? 'ต้องรัน migration tmk_sales_funnel ก่อน' : 'บันทึกไม่สำเร็จ', 'error'); return; }
    toast(`บันทึกคนทัก ${selSeller} แล้ว ✓`, 'success'); setExists(true); setOpen(false); loadTeam();
    logAudit({ action: exists ? 'update' : 'create', entityType: 'data', entityName: 'คนทัก', summary: `คนทัก ${selSeller} ${date} · ใหม่ ${totalNew}/เก่า ${totalOld} · ปิด ${ordersCount}` });
  };
  return (
    <>
      <Card className="p-3 flex flex-col justify-center">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="chat" /></span>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold">{isToday ? 'คนทักวันนี้ · ทีม' : `คนทัก ${fmtD(date)} · ทีม`}</div>
              {teamStat.total > 0
                ? <div className="text-xs text-muted-foreground">ทัก <b style={{ color: 'var(--ink)' }}>{N(teamStat.total)}</b> · ใหม่ <b style={{ color: 'var(--good)' }}>{N(teamStat.newT)}</b> · เก่า <b style={{ color: 'var(--ink-3)' }}>{N(teamStat.oldT)}</b> ({teamStat.people} คน)</div>
                : <div className="text-xs text-muted-foreground">ยังไม่มีใครกรอก{isToday ? 'วันนี้' : `วันที่ ${fmtD(date)}`}</div>}
            </div>
          </div>
          {isAdmin
            ? <Button size="sm" disabled={!sellers.length} onClick={() => setOpen(true)}><Icon name="pencil" /> กรอก/แก้คนทัก</Button>
            : <Badge variant="secondary" className="text-[11px]">แอดมินเป็นผู้กรอกคนทัก</Badge>}
        </div>
        {/* ทีมวันนี้ ต่อแพลตฟอร์ม — ทุกคนเห็น (สด · realtime) · จุดสีช่องทาง */}
        {teamStat.total > 0 && (
          <div className="mt-2 pt-2 border-t flex items-center gap-x-3 gap-y-1 flex-wrap text-xs">
            <span className="text-muted-foreground">ต่อช่องทาง:</span>
            {FUNNEL_PLATFORMS.filter(p => teamStat.byPlat[p]).map(p => (
              <span key={p} className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="size-2 rounded-full shrink-0" style={{ background: channelColor(p) }} />{p} <b style={{ color: 'var(--ink)' }}>{N(teamStat.byPlat[p])}</b></span>
            ))}
          </div>
        )}
      </Card>
      {open && <SideSheet size="md" icon="users" title={`${isToday ? 'คนทักวันนี้' : 'คนทัก'} (แอดมินกรอกให้ทีม)`} sub="เลือกวัน + เซลล์ แล้วใส่จำนวนคนทัก แยกใหม่/เก่า ต่อช่องทาง" onClose={() => setOpen(false)}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>ปิด</Button><Button disabled={busy || !selSeller} onClick={save}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button></>}>
        <div className="field mb-3">
          <label>วันที่{!isToday && <span className="ml-1.5 text-[11px] rounded-full px-1.5 py-0.5 bg-amber-500/12 text-amber-600 dark:text-amber-400">ย้อนหลัง</span>}</label>
          <DatePicker value={date} onChange={v => setDate(v || todayISO())} max={todayISO()} />
        </div>
        {!sellers.length
          ? <div className="rounded-xl border p-4 text-sm text-muted-foreground" style={{ borderColor: 'var(--line)' }}>ยังไม่มีรายชื่อเซลล์ในระบบ — เพิ่มทีมงานที่ ตั้งค่า → สมาชิก ก่อน แล้วจึงกรอกคนทัก</div>
          : <div className="field mb-4">
          <label>เซลล์ที่กรอกให้</label>
          <div className="flex items-center gap-2">
            <Select value={selSeller || undefined} onValueChange={setSelSeller}>
              <SelectTrigger className="max-w-[260px]"><SelectValue placeholder="เลือกเซลล์" /></SelectTrigger>
              <SelectContent>{sellers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <Badge variant={exists ? 'secondary' : 'outline'} className="text-[11px]">{exists ? 'มีข้อมูลแล้ว' : 'ยังไม่กรอก'}</Badge>
          </div>
        </div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {FUNNEL_PLATFORMS.map(p => (
            <div key={p} className="rounded-xl border p-3" style={{ borderColor: 'var(--line)' }}>
              <div className="text-[13px] font-medium mb-2 flex items-center justify-between">
                <span>{p}</span>
                {platTot(p) > 0 && <span className="text-[11px] text-muted-foreground">รวม {N(platTot(p))}</span>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="text-[11px]" style={{ color: 'var(--good)' }}>ลูกค้าใหม่</label>
                  <Input type="number" inputMode="numeric" min="0" step="1" className="num" value={leads[p]?.new ?? ''} onChange={e => setNum(p, 'new', e.target.value)} placeholder="0" />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="text-[11px]" style={{ color: 'var(--ink-3)' }}>ลูกค้าเก่า</label>
                  <Input type="number" inputMode="numeric" min="0" step="1" className="num" value={leads[p]?.old ?? ''} onChange={e => setNum(p, 'old', e.target.value)} placeholder="0" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
          {[['ทักรวม', N(totalLeads), ''], ['ใหม่', N(totalNew), 'var(--good)'], ['เก่า', N(totalOld), 'var(--ink-3)'], ['ปิดได้', N(ordersCount), 'var(--accent)'], ['%ปิด', close + '%', closeTone]].map(([lb, val, c]) => (
            <div key={lb} className="rounded-xl border p-3" style={{ borderColor: 'var(--line)' }}>
              <div className="text-[11px] text-muted-foreground">{lb}</div>
              <div className="num text-xl font-bold" style={c ? { color: c } : undefined}>{val}</div>
            </div>
          ))}
        </div>
      </SideSheet>}
    </>
  );
}

export function SaleDataHub() {
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('tmk-datahub-tab') || 'submit'; } catch { return 'submit'; } });
  useEffect(() => { try { localStorage.setItem('tmk-datahub-tab', tab); } catch { /* ignore */ } }, [tab]);
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <div className="content-inner" style={{ paddingBottom: 0 }}>
        <TabsList>
          <TabsTrigger value="submit"><Icon name="checkCheck" /> ส่งยอดใบเสร็จ</TabsTrigger>
          <TabsTrigger value="import"><Icon name="external" /> นำเข้ามาร์เก็ตเพลส</TabsTrigger>
          <TabsTrigger value="quality"><Icon name="search" /> คุณภาพข้อมูล</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="submit"><SubmitSalesView /></TabsContent>
      <TabsContent value="import"><div className="content-inner rise" style={{ display: 'grid', gap: 14 }}><ImportExportHub /></div></TabsContent>
      <TabsContent value="quality"><HealthHub /></TabsContent>
    </Tabs>
  );
}
