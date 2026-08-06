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
import { Icon, N, useBeat, PageSkeleton } from './components.jsx';
import { useUser } from './userContext.jsx';
import { useData } from './dataContext.jsx';
import { isAdmin } from './lib/roleAccess.js';
import { supabase } from './lib/supabaseClient.js';
import { SideSheet, Modal } from './modals-core.jsx';
import { logAudit } from './lib/audit.js';
import { funnelPlatforms, funnelBreakdown, funnelNewOld, funnelTotal, getDateBounds } from './lib/saleData.js';
import { presetRange } from './lib/saleTime.js';
import { useSaleRealtime } from './lib/saleRealtime.js';
import { channelColor } from './charts.jsx';
import { ProvinceCombobox } from './components/ProductPicker.jsx';
import { DatePicker } from '@/components/ui/date-picker';
import { parseReceiptFiles, jobTypeFromNote, paymentKind } from './lib/receiptParse.js';
import { CHANNELS, JOB_TYPES, RECEIPT_PAYMENTS } from './lib/saleFields.js';
import {
  checkDuplicates, confirmReceipts, attachReceiptFiles, customerTypeLookup,
  isMissingReceiptTable, loadReceiptMatcher, enrichReceiptLine,
} from './lib/receiptSubmit.js';
import { deriveReceiptRowStatus } from './lib/receiptValidate.js';
import { fetchTargets, commissionFor } from './lib/targets.js';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { HealthHub } from './views-health.jsx';
import { FormSection, CustomerTypeChips, PriceBreakdown } from './saleWidgets.jsx';
import { ImportExportHub } from './saleImportHub.jsx';

const fmtB = (n) => '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const fmtD = (iso) => { const s = String(iso || ''); return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}` : '—'; };
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const toast = (m, k) => window.__toast?.(m, k);
// เดือน YYYY-MM ก่อนหน้า (ค.ศ.) — ใช้เทียบเดือนก่อน
const prevMonthOf = (ym) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
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
    const lines = row.lines.map((l, ix) => {
      if (ix !== i) return l;
      const next = { ...l, [k]: v };
      // ยอด = จำนวน×ราคา อัตโนมัติ เมื่อยอดเดิม sync อยู่ (ไม่ทับยอดที่แก้มือ/มีส่วนลดบรรทัดจาก parser)
      if ((k === 'qty' || k === 'unit_price') && Math.abs((Number(l.amount) || 0) - (Number(l.qty) || 0) * (Number(l.unit_price) || 0)) < 0.01) {
        next.amount = Math.round((Number(next.qty) || 0) * (Number(next.unit_price) || 0) * 100) / 100;
      }
      return next;
    });
    onChange({ ...row, lines });
  };
  const delLine = (i) => onChange({ ...row, lines: row.lines.filter((_, ix) => ix !== i) });
  const addLine = () => onChange({ ...row, lines: [...row.lines, { code: '', name: '', qty: 1, unit_price: 0, amount: 0 }] });
  const sum = row.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const mismatch = Math.abs(sum - (Number(row.total) || 0)) > 0.01 && Math.abs(sum - (Number(row.subtotal ?? NaN) || NaN)) > 0.01;
  // การชำระ: โชว์เป็นค่ามาตรฐาน (paymentKind จับ cod/pay_later/ปลายทาง) · เลือกใหม่ = เขียนทับ payment_method
  const payKind = paymentKind(row.payment_method, row.carrier);
  const payNorm = payKind === 'COD' ? 'COD' : payKind === 'โอน' ? 'โอน' : 'ไม่ระบุ';
  const payRaw = String(row.payment_method || '').trim();
  const payRawShow = payRaw && !RECEIPT_PAYMENTS.includes(payRaw) ? payRaw : '';
  const chipCls = (on) => `h-7 px-2 rounded-md border text-xs transition-colors ${on ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground'}`;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <FormSection icon="listChecks" title="ออเดอร์">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <label className="flex flex-col gap-1"><span className="text-[11px] text-muted-foreground">เลขที่เอกสาร</span>
            <Input value={row.order_no || ''} onChange={e => set('order_no', e.target.value.trim())} /></label>
          <div className="flex flex-col gap-1"><span className="text-[11px] text-muted-foreground">วันที่</span>
            <DatePicker value={row.order_date || ''} onChange={v => set('order_date', v || '')} /></div>
          {showChannel && (
            <div className="flex flex-col gap-1"><span className="text-[11px] text-muted-foreground">ช่องทาง</span>
              <Select value={row.channel || undefined} onValueChange={v => set('channel', v)}>
                <SelectTrigger className={!row.channel ? 'border-amber-500/60' : ''}><SelectValue placeholder="เลือกช่องทาง*" /></SelectTrigger>
                <SelectContent>{CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-muted-foreground">ประเภทงาน</span>
          {JOB_TYPES.map(j => (
            <button key={j} type="button" onClick={() => set('job_type', j)} className={chipCls(row.job_type === j)}>{j}</button>
          ))}
        </div>
      </FormSection>
      <FormSection icon="wallet" title="เงิน">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <label className="flex flex-col gap-1"><span className="text-[11px] text-muted-foreground">ยอดรวมสุทธิ</span>
            <Input type="number" inputMode="decimal" value={row.total ?? ''} onChange={e => set('total', Number(e.target.value) || 0)} /></label>
          <div className="flex flex-col gap-1"><span className="text-[11px] text-muted-foreground">การชำระ</span>
            <Select value={payNorm} onValueChange={v => set('payment_method', v === 'ไม่ระบุ' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{RECEIPT_PAYMENTS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
            {payRawShow && <span className="text-[10px] text-muted-foreground">จากใบ: {payRawShow} → {payNorm}</span>}
          </div>
        </div>
        {/* แยกราคาเสื้อ/ส่วนลด/ค่าส่งจากใบ (อ่านอย่างเดียว) → ตรวจยอดก่อนบันทึก */}
        <PriceBreakdown className="mt-2.5" subtotal={row.subtotal} discount={row.discount} shipping={row.shipping} vat={row.vat} total={row.total} />
      </FormSection>
      <FormSection icon="user" title="ลูกค้า">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <label className="flex flex-col gap-1"><span className="text-[11px] text-muted-foreground">ชื่อลูกค้า</span>
            <Input value={row.customer_name || ''} onChange={e => set('customer_name', e.target.value)} /></label>
          <label className="flex flex-col gap-1"><span className="text-[11px] text-muted-foreground">เบอร์โทร</span>
            <Input value={row.customer_phone || ''} onChange={e => set('customer_phone', e.target.value)} /></label>
          <label className="flex flex-col gap-1"><span className="text-[11px] text-muted-foreground">โซเชียล (FB/LINE)</span>
            <Input value={row.customer_social || ''} onChange={e => set('customer_social', e.target.value)} placeholder="ชื่อเพจ/ไลน์" /></label>
          <div className="flex flex-col gap-1"><span className="text-[11px] text-muted-foreground">จังหวัด</span>
            <ProvinceCombobox value={row.province || ''} onChange={v => set('province', v)} /></div>
          <label className="flex flex-col gap-1 sm:col-span-2"><span className="text-[11px] text-muted-foreground">ที่อยู่</span>
            <Input value={row.customer_address || ''} onChange={e => set('customer_address', e.target.value)} placeholder="ที่อยู่จัดส่ง (เข้าโปรไฟล์ลูกค้า CRM)" /></label>
        </div>
        <div className="mt-2.5"><CustomerTypeChips value={row.customer_type} onChange={v => set('customer_type', v)} /></div>
      </FormSection>
      <label className="flex flex-col gap-1"><span className="text-[11px] text-muted-foreground">หมายเหตุ (พิมพ์ “DFT” = งาน DFT)</span>
        <Input value={row.note || ''} onChange={e => { const v = e.target.value; onChange({ ...row, note: v, job_type: jobTypeFromNote(v) === 'DFT' ? 'DFT' : row.job_type }); }} /></label>
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
  // เห็น "ทั้งทีม" (ใบเสร็จ + คนทัก) = ผู้ดูแลระบบ (role=admin) เท่านั้น · แก้ไขได้/ดูอย่างเดียว = เฉพาะของตัวเอง
  // ผูก role จาก useUser ตรงๆ (reactive · ไม่พึ่ง window.__isAdmin ที่ lag รอบแรก)
  const canSeeTeam = isAdmin(user);

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
  // re-validate สถานะแถวสด (บั๊ก: เดิม freeze problems ตอน parse) — เก็บ matcher + dup maps ให้ patchRow ใช้ซ้ำ
  const matcherRef = useRef(null);       // ผล loadReceiptMatcher() (live re-match ลาย/รหัส)
  const dupRef = useRef(new Map());      // dupReceipts (order_no → row ที่ส่งแล้ว)
  const dupOrdersRef = useRef(new Set()); // dupOrders (order_no ที่มีจาก import)

  /* ---- feed + KPI ---- */
  const [feed, setFeed] = useState(null);
  const [targets, setTargets] = useState({});
  const [range, setRange] = useState({ from: '', to: '' });
  const [, setBounds] = useState({ min: null, max: null });
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
      // เห็นทีมได้เฉพาะ admin: admin โหลดทั้งทีมเสมอ (กรองฝั่ง client) · non-admin โหลดเฉพาะใบตัวเอง
      const wantTeam = canSeeTeam;
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
  }, [range.from, range.to, canSeeTeam, user?.email]);
  useEffect(() => { loadFeed(); }, [loadFeed]);
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
  const rangeLabel = singleMonth ? monthLabel(refMonth) : `${fmtD(range.from)}–${fmtD(range.to)}`;

  const myKpi = useMemo(() => {
    const mine = (feed || []).filter(r => r.status === 'confirmed' && r.uploader_email === user?.email);
    const sales = mine.reduce((s, r) => s + (Number(r.sales) || 0), 0);
    const t = targets[user?.name] || null;
    const target = Number(t?.sales_target) || 0;
    const dPct = prevSales != null && prevSales > 0 ? (sales - prevSales) / prevSales * 100 : null;
    return { count: mine.length, sales, target, pct: target ? Math.min(100, sales / target * 100) : 0, comm: t ? commissionFor(sales, t) : 0, dPct };
  }, [feed, targets, user, prevSales]);

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
      const [{ dupReceipts, dupOrders, missingTable: miss }, typeOf, M] = await Promise.all([
        checkDuplicates(nos), customerTypeLookup(receipts), loadReceiptMatcher().catch(() => null),
      ]);
      if (miss) setMissingTable(true);
      matcherRef.current = M; dupRef.current = dupReceipts; dupOrdersRef.current = dupOrders; // เก็บให้ patchRow re-validate ซ้ำ
      // 1) สร้างแถว + live re-match บรรทัด (ดึงรหัส/จับคู่ลายให้ตรงกับตอนเขียน — "ไม่มีรหัส" ที่จับคู่ได้จะไม่เตือน)
      const built = receipts.map((r, i) => ({
        _id: `r${i}`, ...r,
        lines: M ? (r.lines || []).map(l => enrichReceiptLine(l, M)) : (r.lines || []),
        parsedRaw: { ...r, file: undefined },       // ค่าตอน parse — ใช้เทียบว่าผู้ใช้แก้ field ไหนแล้ว
        channel: r.channel_hint || '',
        job_type: jobTypeFromNote(r.note),
        customer_type: typeOf(r),
      }));
      // 2) คำนวณสถานะสดจากค่าปัจจุบัน (recompute ได้เมื่อผู้ใช้แก้ทีหลังผ่าน patchRow)
      const next = built.map(b => {
        const st = deriveReceiptRowStatus(b, { allRows: built, dupReceipts, dupOrders });
        const fromImport = !st.hard && !dupReceipts.get(b.order_no) && dupOrders.has(b.order_no);
        return { ...b, ...st, fromImport, selected: !st.hard && !fromImport };
      });
      setRows(next);
      setExpandId(null);
    } catch (e) {
      toast('อ่านไฟล์ไม่สำเร็จ: ' + (e?.message || ''), 'error');
    } finally { setParsing(null); setChecking(false); }
  };

  // แก้ค่าแถว → merge + live re-match (ถ้าแก้บรรทัด) + recompute สถานะทุกแถว (แก้ order_no กระทบ dup แถวอื่น)
  const patchRow = (id, patch) => setRows(rs => {
    const merged = rs.map(r => {
      if (r._id !== id) return r;
      const nr = { ...r, ...patch };
      if (patch.lines && matcherRef.current) nr.lines = nr.lines.map(l => enrichReceiptLine(l, matcherRef.current));
      return nr;
    });
    return merged.map(r => ({ ...r, ...deriveReceiptRowStatus(r, { allRows: merged, dupReceipts: dupRef.current, dupOrders: dupOrdersRef.current }) }));
  });
  const selectedRows = rows.filter(r => r.selected && !r.hard);
  const readyRows = selectedRows.filter(r => r.channel && r.order_no && (Number(r.total) || 0) > 0);
  const sumSelected = selectedRows.reduce((s, r) => s + (Number(r.total) || 0), 0);


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
  // path แก้/ยกเลิกในนี้ถูกถอด (PART 81) — แก้/ยกเลิกทำที่หน้าออเดอร์ที่เดียว (แบนเนอร์ท้าย drawer นำทาง · editReceipt/voidReceipt คงอยู่ใน lib)

  if (beat) return <PageSkeleton />;


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
      {/* คนทัก (funnel) — แต่ละคนกรอกของตัวเอง · แอดมินกรอก/แก้แทนได้ + ดูภาพรวมทีม */}
      <FunnelCard sellers={funnelSellers} createdBy={user?.email || ''} isAdmin={canSeeTeam} canEdit={canEdit} myName={user?.name || ''} ordersToday={ordersToday} />
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

      {/* แก้ใบเสร็จก่อนบันทึก — popup กลางจอ (reuse RowEditor · Modal เดียวกับระบบ) */}
      {expandId != null && (() => {
        const er = rows.find(r => r._id === expandId);
        if (!er) return null;
        return (
          <Modal xl icon="pencil" title={`แก้ใบเสร็จ ${er.order_no || '—'}`}
            sub={`${er.customer_name || 'ลูกค้า'} · ${fmtB(er.total)}`} onClose={() => setExpandId(null)}
            footer={<Button onClick={() => setExpandId(null)}><Icon name="check" /> เสร็จ</Button>}>
            <RowEditor row={er} onChange={next => patchRow(er._id, next)} />
          </Modal>
        );
      })()}

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

      {/* คีย์มือ (ขายไม่มีใบเสร็จ) */}
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
function ReviewRow({ r, expanded, onToggle, onSelect, onChannel }) {
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
          <button type="button" className={'transition-colors ' + (expanded ? 'text-[var(--accent)]' : 'text-muted-foreground hover:text-foreground')} onClick={onToggle} aria-label="แก้รายละเอียด" title="แก้รายละเอียด">
            <Icon name="pencil" className="size-4" />
          </button>
        </td>
      </tr>
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
   คนทัก (funnel) — แยก "คนใหม่/คนเก่า" ต่อแพลตฟอร์ม
   เก็บ jsonb `leads` {Facebook:{new,old}, ...} · เขียนคอลัมน์เก่า fb/line ด้วย (back-compat แดชบอร์ด)
   สิทธิ์: แต่ละคน (canEdit) กรอกของตัวเองได้ (ล็อกชื่อ = ตัวเอง) · แอดมิน (isAdmin) เลือก/แก้แทนทุกคน + ดูภาพรวมทีม
   หมายเหตุ: ตาราง tmk_sales_funnel ยังไม่มี RLS → gate ฝั่ง client เท่านั้น (ถ้าต้องบังคับจริงต้อง migration RLS)
   ============================================================ */
const FUNNEL_PLATFORMS = ['Facebook', 'LINE', 'Instagram', 'TikTok', 'Phone', 'อื่นๆ'];
const emptyLeads = () => Object.fromEntries(FUNNEL_PLATFORMS.map(p => [p, { new: '', old: '' }]));
// เสียงลูกค้า (แยกอิสระต่อ วัน+เซลล์ · เก็บใน tmk_sales_funnel.voice jsonb)
const emptyVoice = () => ({ ask: '', praise: '', complaint: '' });
const normVoice = (v) => (v && typeof v === 'object') ? { ask: String(v.ask || ''), praise: String(v.praise || ''), complaint: String(v.complaint || '') } : emptyVoice();
const voiceEmpty = (v) => !v.ask.trim() && !v.praise.trim() && !v.complaint.trim();
function FunnelCard({ sellers = [], createdBy, isAdmin, canEdit = true, myName = '', ordersToday = {} }) {
  const [date, setDate] = useState(todayISO());   // เลือกวันได้ — กรอก/ดูคนทักย้อนหลัง
  const isToday = date === todayISO();
  const [leads, setLeads] = useState(emptyLeads);
  const [voice, setVoice] = useState(emptyVoice);   // เสียงลูกค้า ถาม/ชม/ติ (ต่อ วัน+เซลล์)
  const [busy, setBusy] = useState(false);
  const [exists, setExists] = useState(false);
  const [open, setOpen] = useState(false);
  const [selSeller, setSelSeller] = useState('');
  const [team, setTeam] = useState([]);   // admin = ทั้งทีม · non-admin = เฉพาะของตัวเอง (role-based)
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
    if (!name) { setLeads(emptyLeads()); setVoice(emptyVoice()); setExists(false); return; }
    const { data } = await supabase.from('tmk_sales_funnel').select('*').eq('id', `${date}:${name}`).maybeSingle();
    if (data) { setLeads(fillFromRow(data)); setVoice(normVoice(data.voice)); setExists(true); } else { setLeads(emptyLeads()); setVoice(emptyVoice()); setExists(false); }
  }, [date]);
  const loadTeam = useCallback(async () => {
    // admin เห็นทั้งทีม · non-admin เห็นเฉพาะคนทักของตัวเอง (กรองที่ query = ไม่โหลดของคนอื่นมาเลย)
    let q = supabase.from('tmk_sales_funnel').select('*').eq('date', date);
    if (!isAdmin) q = q.eq('salesperson', myName || '__none__');
    const { data } = await q;
    setTeam(data || []);
  }, [date, isAdmin, myName]);
  // เลือกเซลล์เริ่มต้น: แอดมิน = คนแรก · เซลล์ = ตัวเองเสมอ (ล็อก ไม่มี Select)
  useEffect(() => { if (!selSeller) setSelSeller(isAdmin ? (sellers[0] || '') : (myName || '')); }, [sellers, selSeller, isAdmin, myName]);
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
  // ปิดได้/%ปิด อ้างจำนวนออเดอร์ "วันนี้" เท่านั้น — วันย้อนหลังไม่รู้ออเดอร์วันนั้นตรงนี้ → null (โชว์ —) กันเลขหลอก
  const ordersCount = isToday ? nv(ordersToday[selSeller]) : null;
  const close = (ordersCount != null && totalLeads) ? Math.round(ordersCount / totalLeads * 100) : null;
  const closeTone = close == null ? 'var(--ink-4)' : close >= 15 ? 'var(--good)' : close >= 8 ? 'var(--warn)' : 'var(--bad)';
  const setNum = (p, field, v) => setLeads(prev => ({ ...prev, [p]: { ...prev[p], [field]: v === '' ? '' : String(Math.max(0, Math.floor(Number(v) || 0))) } }));
  const save = async () => {
    if (!canEdit) { toast('บัญชีนี้เป็นสิทธิ์ "ดูอย่างเดียว"', 'warn'); return; }
    if (!isAdmin && selSeller !== myName) { toast('กรอกได้เฉพาะคนทักของตัวเอง', 'error'); return; }
    if (!selSeller) { toast(isAdmin ? 'เลือกเซลล์ก่อน' : 'ไม่พบชื่อของคุณในระบบ — แจ้งแอดมินเพิ่มทีมงาน', 'warn'); return; }
    setBusy(true);
    const leadsJson = {};
    FUNNEL_PLATFORMS.forEach(p => { const nw = nv(leads[p]?.new), od = nv(leads[p]?.old); if (nw + od > 0) leadsJson[p] = { new: nw, old: od }; });
    const vClean = normVoice(voice);
    const row = {
      id: `${date}:${selSeller}`, date, salesperson: selSeller, leads: leadsJson,
      // back-compat: คอลัมน์เก่าเก็บใหม่/เก่าของ FB/LINE ตรงความหมาย — แถวเก่า/กราฟเก่ายังอ่านได้
      leads_fb_new: nv(leads.Facebook?.new), leads_fb_old: nv(leads.Facebook?.old),
      leads_line_new: nv(leads.LINE?.new), leads_line_old: nv(leads.LINE?.old),
      voice: voiceEmpty(vClean) ? null : vClean,   // เสียงลูกค้า ถาม/ชม/ติ (แยกอิสระหน้านี้)
      note: '', created_by: createdBy, updated_at: new Date().toISOString(),
    };
    // upsert + fallback คอลัมน์ leads ยังไม่ migrate (20260705) → เก็บเฉพาะ FB/LINE
    const upsertFunnel = async (r) => {
      let e = (await supabase.from('tmk_sales_funnel').upsert(r, { onConflict: 'id' })).error;
      if (e && /leads/.test(e.message || '') && !/does not exist.*tmk_sales_funnel|tmk_sales_funnel.*does not exist/.test(e.message || '')) {
        const { leads: _l, ...legacy } = r;
        e = (await supabase.from('tmk_sales_funnel').upsert(legacy, { onConflict: 'id' })).error;
        if (!e) toast('บันทึกได้เฉพาะ FB/LINE — รัน migration 20260705-funnel-leads.sql เพื่อเก็บทุกแพลตฟอร์ม', 'warn');
      }
      return e;
    };
    let error = await upsertFunnel(row);
    // คอลัมน์ voice ยังไม่ migrate → ลองใหม่แบบไม่มี voice (คนทักยังบันทึกได้ · เตือนให้รัน migration)
    if (error && /voice/.test(error.message || '') && /column|schema cache/i.test(error.message || '')) {
      const { voice: _v, ...noVoice } = row;
      error = await upsertFunnel(noVoice);
      if (!error && !voiceEmpty(vClean)) toast('คนทักบันทึกแล้ว แต่เสียงลูกค้ายังไม่ถูกเก็บ — ต้องรัน migration 20260806-funnel-voice.sql', 'warn');
    }
    setBusy(false);
    if (error) { toast(/funnel|does not exist/.test(error.message) ? 'ต้องรัน migration tmk_sales_funnel ก่อน' : 'บันทึกไม่สำเร็จ', 'error'); return; }
    toast(`บันทึกคนทัก ${selSeller} แล้ว ✓`, 'success'); setExists(true); setOpen(false); loadTeam();
    logAudit({
      action: exists ? 'update' : 'create', entityType: 'daily', entityName: `คนทัก ${selSeller}`,
      summary: `คนทัก ${selSeller} ${date} · ใหม่ ${totalNew}/เก่า ${totalOld}${ordersCount != null ? ` · ปิด ${ordersCount}` : ''}`,
      fields: [
        { label: 'เซลล์', value: selSeller },
        { label: 'วันที่', value: date },
        { label: 'ทักใหม่', value: `${totalNew} คน` },
        { label: 'ทักเก่า', value: `${totalOld} คน` },
        { label: 'ทักรวม', value: `${totalNew + totalOld} คน` },
        ...(ordersCount != null ? [
          { label: 'ปิดการขาย', value: `${ordersCount} ออเดอร์` },
          { label: '%ปิด', value: `${(totalNew + totalOld) > 0 ? Math.round(ordersCount / (totalNew + totalOld) * 100) : 0}%` },
        ] : []),
      ],
      data: { seller: selSeller, date, new: totalNew, old: totalOld, closed: ordersCount, leads: row.leads },
    });
  };
  return (
    <>
      <Card className="p-3 flex flex-col justify-center">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="chat" /></span>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold">{(isToday ? 'คนทักวันนี้' : `คนทัก ${fmtD(date)}`)}{isAdmin ? ' · ทีม' : ' · ของฉัน'}</div>
              {teamStat.total > 0
                ? <div className="text-xs text-muted-foreground">ทัก <b style={{ color: 'var(--ink)' }}>{N(teamStat.total)}</b> · ใหม่ <b style={{ color: 'var(--good)' }}>{N(teamStat.newT)}</b> · เก่า <b style={{ color: 'var(--ink-3)' }}>{N(teamStat.oldT)}</b>{isAdmin ? ` (${teamStat.people} คน)` : ''}</div>
                : <div className="text-xs text-muted-foreground">{isAdmin ? 'ยังไม่มีใครกรอก' : 'ยังไม่มีคนทักของคุณ'}{isToday ? 'วันนี้' : `วันที่ ${fmtD(date)}`}</div>}
            </div>
          </div>
          {canEdit
            ? <Button size="sm" onClick={() => setOpen(true)}><Icon name="pencil" /> {isAdmin ? 'กรอก/แก้คนทัก' : 'กรอกคนทักของฉัน'}</Button>
            : <Badge variant="secondary" className="text-[11px]">ดูอย่างเดียว</Badge>}
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
      {open && <SideSheet size="md" icon="users" title={`คนทัก${isToday ? 'วันนี้' : ''}${isAdmin ? ' (แอดมิน — กรอก/แก้ทั้งทีม)' : ' ของฉัน'}`} sub={isAdmin ? 'เลือกวัน + เซลล์ · ใส่จำนวนคนทัก (ใหม่/เก่า ต่อช่องทาง) + เสียงลูกค้า' : 'ใส่จำนวนคนทัก (ใหม่/เก่า ต่อช่องทาง) + เสียงลูกค้า ของคุณ'} onClose={() => setOpen(false)}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>ปิด</Button><Button disabled={busy || !selSeller} onClick={save}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button></>}>
        <div className="field mb-3">
          <label>วันที่{!isToday && <span className="ml-1.5 text-[11px] rounded-full px-1.5 py-0.5 bg-amber-500/12 text-amber-600 dark:text-amber-400">ย้อนหลัง</span>}</label>
          <DatePicker value={date} onChange={v => setDate(v || todayISO())} max={todayISO()} />
        </div>
        {/* เซลล์: ล็อกชื่อตัวเอง · แอดมิน: เลือกได้ + ตารางภาพรวมทีม */}
        {!isAdmin ? (
          <div className="field mb-4">
            <label>กรอกในนาม</label>
            <div className="flex items-center gap-2">
              <div className="rounded-md border px-3 py-1.5 text-sm font-medium" style={{ borderColor: 'var(--line)' }}>{selSeller || myName || '—'} <span className="text-[11px] text-muted-foreground">(คุณ)</span></div>
              <Badge variant={exists ? 'secondary' : 'outline'} className="text-[11px]">{exists ? 'มีข้อมูลแล้ว' : 'ยังไม่กรอก'}</Badge>
            </div>
          </div>
        ) : !sellers.length ? (
          <div className="rounded-xl border p-4 text-sm text-muted-foreground" style={{ borderColor: 'var(--line)' }}>ยังไม่มีรายชื่อเซลล์ในระบบ — เพิ่มทีมงานที่ ตั้งค่า → สมาชิก ก่อน แล้วจึงกรอกคนทัก</div>
        ) : (
          <div className="field mb-4">
            <label>เซลล์ที่กรอกให้</label>
            <div className="flex items-center gap-2">
              <Select value={selSeller || undefined} onValueChange={setSelSeller}>
                <SelectTrigger className="max-w-[260px]"><SelectValue placeholder="เลือกเซลล์" /></SelectTrigger>
                <SelectContent>{sellers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <Badge variant={exists ? 'secondary' : 'outline'} className="text-[11px]">{exists ? 'มีข้อมูลแล้ว' : 'ยังไม่กรอก'}</Badge>
            </div>
            {/* ภาพรวมทีมวันที่เลือก — กดชื่อเพื่อกรอก/แก้แทน */}
            {sellers.length > 0 && (() => {
              const byName = new Map((team || []).map(r => [r.salesperson, r]));
              return (
                <div className="mt-3 rounded-lg border overflow-hidden text-xs" style={{ borderColor: 'var(--line)' }}>
                  <table className="w-full">
                    <thead className="bg-muted/40 text-muted-foreground"><tr><th className="text-left px-2 py-1 font-medium">เซลล์</th><th className="text-right px-2 py-1 font-medium">ทัก</th><th className="text-right px-2 py-1 font-medium">ใหม่</th><th className="text-right px-2 py-1 font-medium">เก่า</th><th className="text-right px-2 py-1 font-medium">สถานะ</th></tr></thead>
                    <tbody>{sellers.map(s => {
                      const r = byName.get(s); const tot = r ? funnelTotal(r) : 0; const no = r ? funnelNewOld(r) : { new: 0, old: 0 };
                      return (
                        <tr key={s} className={'border-t cursor-pointer hover:bg-muted/30' + (s === selSeller ? ' bg-[var(--accent-soft)]' : '')} onClick={() => setSelSeller(s)}>
                          <td className="px-2 py-1 font-medium">{s}</td>
                          <td className="px-2 py-1 text-right">{tot ? N(tot) : '—'}</td>
                          <td className="px-2 py-1 text-right" style={{ color: no.new ? 'var(--good)' : 'var(--ink-4)' }}>{no.new || '—'}</td>
                          <td className="px-2 py-1 text-right text-muted-foreground">{no.old || '—'}</td>
                          <td className="px-2 py-1 text-right">{r ? <span style={{ color: 'var(--good)' }}>กรอกแล้ว</span> : <span className="text-muted-foreground">ยังไม่กรอก</span>}</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        )}
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
        {/* เสียงลูกค้า (ต่อ วัน+เซลล์ที่เลือก) — ถาม/ชม/ติ */}
        <div className="rounded-xl border p-3 mb-4" style={{ borderColor: 'var(--line)', background: 'var(--warn-soft)', borderLeft: '3px solid var(--warn)' }}>
          <div className="text-[12px] font-semibold mb-2.5 flex items-center gap-1.5 [&_svg]:size-[15px]" style={{ color: 'var(--warn)' }}><Icon name="chat" /> เสียงลูกค้า{isAdmin && selSeller ? ` — ${selSeller}` : ''}</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="flex flex-col gap-1"><span className="text-[11px]" style={{ color: 'var(--ink-4)' }}>ถามหาอะไร</span><Textarea rows={2} className="text-[13px]" style={{ background: 'var(--surface)' }} value={voice.ask} onChange={e => setVoice(v => ({ ...v, ask: e.target.value }))} placeholder="เช่น เสื้อแบบมีกระเป๋า" /></label>
            <label className="flex flex-col gap-1"><span className="text-[11px]" style={{ color: 'var(--ink-4)' }}>ชมเรื่องอะไร</span><Textarea rows={2} className="text-[13px]" style={{ background: 'var(--surface)' }} value={voice.praise} onChange={e => setVoice(v => ({ ...v, praise: e.target.value }))} placeholder="—" /></label>
            <label className="flex flex-col gap-1"><span className="text-[11px]" style={{ color: 'var(--ink-4)' }}>ติอะไร</span><Textarea rows={2} className="text-[13px]" style={{ background: 'var(--surface)' }} value={voice.complaint} onChange={e => setVoice(v => ({ ...v, complaint: e.target.value }))} placeholder="—" /></label>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
          {[['ทักรวม', N(totalLeads), ''], ['ใหม่', N(totalNew), 'var(--good)'], ['เก่า', N(totalOld), 'var(--ink-3)'], ['ปิดได้', ordersCount == null ? '—' : N(ordersCount), 'var(--accent)'], ['%ปิด', close == null ? '—' : close + '%', closeTone]].map(([lb, val, c]) => (
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
