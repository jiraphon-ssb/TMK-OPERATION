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
import { Icon, useBeat, PageSkeleton } from './components.jsx';
import { useUser } from './userContext.jsx';
import { supabase } from './lib/supabaseClient.js';
import { parseReceiptFiles, jobTypeFromNote } from './lib/receiptParse.js';
import {
  checkDuplicates, confirmReceipts, attachReceiptFiles, customerTypeLookup,
  canEditReceipt, editReceipt, voidReceipt,
  isMissingReceiptTable,
} from './lib/receiptSubmit.js';
import { fetchTargets, commissionFor } from './lib/targets.js';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { HealthHub } from './views-2.jsx';
import { ImportExportHub } from './saleImportHub.jsx';

const CHANNELS = ['Facebook', 'LINE', 'Instagram', 'Phone', 'POS', 'Direct', 'Shopee', 'Lazada', 'TikTok'];
const JOB_TYPES = ['ปลีก', 'OEM', 'DFT'];
const fmtB = (n) => '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const fmtD = (iso) => { const s = String(iso || ''); return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}` : '—'; };
const curMonth = () => new Date().toISOString().slice(0, 7);
const toast = (m, k) => window.__toast?.(m, k);

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
        <label className="flex flex-col gap-1"><span className="text-[11px] text-muted-foreground">จังหวัด</span>
          <Input value={row.province || ''} onChange={e => set('province', e.target.value)} /></label>
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
  const month = curMonth();
  const loadFeed = useCallback(async () => {
    try {
      let q = supabase.from('tmk_sale_receipts').select('*').eq('order_month', month).order('created_at', { ascending: false }).limit(200);
      if (!isAdmin) q = q.eq('uploader_email', user?.email || '');
      const r = await q;
      if (r.error) throw r.error;
      setFeed(r.data || []);
      setMissingTable(false);
    } catch (e) {
      if (isMissingReceiptTable(e)) setMissingTable(true);
      setFeed([]);
    }
  }, [month, isAdmin, user?.email]);
  useEffect(() => { loadFeed(); }, [loadFeed]);
  useEffect(() => { fetchTargets(month).then(rows2 => { const m = {}; rows2.forEach(t => { m[t.salesperson] = t; }); setTargets(m); }).catch(() => {}); }, [month]);

  const myKpi = useMemo(() => {
    const mine = (feed || []).filter(r => r.status === 'confirmed' && (isAdmin ? r.uploader_email === user?.email : true));
    const sales = mine.reduce((s, r) => s + (Number(r.sales) || 0), 0);
    const t = targets[user?.name] || null;
    const target = Number(t?.sales_target) || 0;
    return { count: mine.length, sales, target, pct: target ? Math.min(100, sales / target * 100) : 0, comm: t ? commissionFor(sales, t) : 0 };
  }, [feed, targets, user, isAdmin]);

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
      if (res.ok.length) toast(`บันทึกแล้ว ${res.ok.length} ใบ`, 'success');
      // หลักฐานขึ้น Storage แบบ background (ไม่บล็อก)
      attachReceiptFiles(readyRows.filter(r => res.ok.includes(String(r.order_no).trim())).map(r => ({ order_no: String(r.order_no).trim(), file: r.file, page: r.page })))
        .then(() => loadFeed()).catch(() => {});
    } catch (e) {
      if (isMissingReceiptTable(e)) { setMissingTable(true); toast('ต้องรัน migration ก่อน (20260703-sale-receipts.sql)', 'warn'); }
      else toast('บันทึกไม่สำเร็จ: ' + (e?.message || ''), 'error');
    } finally { setSaving(false); }
  };

  /* ---- drawer รายละเอียด/แก้/ยกเลิก ---- */
  const [detail, setDetail] = useState(null);   // แถว feed
  const [editRow, setEditRow] = useState(null); // payload กำลังแก้
  const [editSeller, setEditSeller] = useState('');
  const openDetail = (r) => { setDetail(r); setEditRow(null); setEditSeller(r.salesperson || ''); };
  const startEdit = () => {
    const c = detail.confirmed || {};
    setEditRow({
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

      {/* KPI ของฉันเดือนนี้ */}
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[11px] text-muted-foreground">ยอดของฉันเดือนนี้ ({user?.name || user?.email})</div>
            <div className="text-2xl font-bold">{fmtB(myKpi.sales)} <span className="text-sm font-normal text-muted-foreground">· {myKpi.count} ใบ</span></div>
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
            <div className="text-sm text-muted-foreground">กำลังอ่านใบเสร็จ… {parsing.done}/{parsing.total} ไฟล์{checking ? ' · เช็คข้อมูลซ้ำ' : ''}</div>
          ) : (
            <>
              <div className="text-base font-semibold">วางไฟล์ใบเสร็จ Shipnity ที่นี่ หรือกดเลือกไฟล์</div>
              <div className="text-xs text-muted-foreground mt-1">PDF หลายไฟล์พร้อมกัน หรือ PDF เดียวหลายหน้า (50-60 ใบต่อครั้งได้) · ระบบอ่านเองไม่กี่วินาที</div>
              {!canEdit && <div className="text-xs text-amber-600 mt-2">บัญชีนี้เป็นสิทธิ์ "ดูอย่างเดียว" — ส่งยอดไม่ได้</div>}
            </>
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

      {/* ใบของฉัน / ทั้งหมด */}
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <span className="text-sm font-semibold">{isAdmin ? 'ใบเสร็จทั้งหมดเดือนนี้' : 'ใบของฉันเดือนนี้'}</span>
          <Badge variant="secondary">{(feed || []).length}</Badge>
        </div>
        {feed === null ? <div className="p-4 text-sm text-muted-foreground">กำลังโหลด…</div>
          : !feed.length ? <div className="p-6 text-center text-sm text-muted-foreground">ยังไม่มีใบเสร็จเดือนนี้ — เริ่มส่งใบแรกได้เลย</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground bg-muted/40">
                  <tr><th className="text-left px-3 py-2">เลขที่</th><th className="text-left px-2 py-2">วันที่</th>{isAdmin && <th className="text-left px-2 py-2">เซลล์</th>}<th className="text-right px-2 py-2">ยอด</th><th className="text-left px-2 py-2">ช่องทาง</th><th className="text-left px-2 py-2">สถานะ</th></tr>
                </thead>
                <tbody>
                  {feed.map(r => (
                    <tr key={r.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => openDetail(r)}>
                      <td className="px-3 py-2 font-mono text-xs">{r.order_no}</td>
                      <td className="px-2 py-2 text-xs">{fmtD(r.order_date)}</td>
                      {isAdmin && <td className="px-2 py-2 text-xs">{r.salesperson}</td>}
                      <td className="px-2 py-2 text-right">{fmtB(r.sales)}</td>
                      <td className="px-2 py-2 text-xs">{r.channel || '—'}</td>
                      <td className="px-2 py-2">{statusBadge(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">วันที่:</span> {fmtD(detail.order_date)}</div>
                    <div><span className="text-muted-foreground">เซลล์:</span> {detail.salesperson}</div>
                    <div><span className="text-muted-foreground">ยอด:</span> {fmtB(detail.sales)}</div>
                    <div><span className="text-muted-foreground">ช่องทาง:</span> {detail.channel || '—'}</div>
                    <div><span className="text-muted-foreground">ลูกค้า:</span> {detail.confirmed?.customer_name || '—'}</div>
                    <div><span className="text-muted-foreground">จังหวัด:</span> {detail.confirmed?.province || '—'}</div>
                  </div>
                  {Array.isArray(detail.confirmed?.lines) && detail.confirmed.lines.length > 0 && (
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 text-muted-foreground"><tr><th className="text-left px-2 py-1">รหัส</th><th className="text-left px-2 py-1">สินค้า</th><th className="text-right px-2 py-1">จำนวน</th><th className="text-right px-2 py-1">ยอด</th></tr></thead>
                        <tbody>{detail.confirmed.lines.map((l, i) => <tr key={i} className="border-t"><td className="px-2 py-1 font-mono">{l.code}</td><td className="px-2 py-1">{l.name}</td><td className="px-2 py-1 text-right">{l.qty}</td><td className="px-2 py-1 text-right">{fmtB(l.amount)}</td></tr>)}</tbody>
                      </table>
                    </div>
                  )}
                  {detail.file_url && <a className="text-xs text-primary underline" href={detail.file_url} target="_blank" rel="noreferrer">เปิดไฟล์ใบเสร็จ</a>}
                  {Array.isArray(detail.history) && detail.history.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      <div className="font-medium mb-1">ประวัติการแก้</div>
                      {detail.history.map((h, i) => <div key={i}>· {String(h.at).slice(0, 16).replace('T', ' ')} — {h.by} แก้ {Object.keys(h.changes || {}).join(', ')}</div>)}
                    </div>
                  )}
                  {detail.status === 'void' && <div className="text-xs text-red-500">ยกเลิกโดย {detail.void_by} {detail.void_reason ? `— ${detail.void_reason}` : ''}</div>}
                  {detail.status !== 'void' && (
                    <div className="flex gap-2 mt-2">
                      {canEditReceipt(detail, { email: user?.email, isAdmin })
                        ? <Button size="sm" variant="outline" onClick={startEdit}><Icon name="pencil" className="size-3.5" /> แก้ไข</Button>
                        : <span className="text-xs text-muted-foreground self-center">เลยเวลาแก้ (วันเดียวกัน) — ติดต่อแอดมิน</span>}
                      {canEditReceipt(detail, { email: user?.email, isAdmin }) && (
                        <Button size="sm" variant="outline" className="text-red-500" onClick={doVoid}><Icon name="trash" className="size-3.5" /> ยกเลิกใบ</Button>
                      )}
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
    </div>
  );
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
            {r.problems.map((p, i) => <span key={i} className={`text-[10px] ${r.hard ? 'text-red-500' : 'text-amber-600 dark:text-amber-400'}`}>{p}</span>)}
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
