/* ============================================================
   orderDrawer.jsx — ลิ้นชักดู/แก้/ยกเลิกออเดอร์ (PART 84 REFACTOR-1 · แยกจาก views-orders god-file)
   ============================================================
   MpOrdersView (views-orders.jsx) เรียก <OrderDrawer/> ตอนเปิดออเดอร์ · behavior-preserving
   ============================================================ */
import { useState, useEffect, useRef } from 'react';
import { B, N, Icon } from './components.jsx';
import { SideSheet } from './modals-core.jsx';
import { channelColor } from './charts.jsx';
import { skuOverrideKey } from './lib/designResolve.js';
import { qtyBand } from './lib/mpReport.js';
import { DesignCombobox, ColorSelect, SizeSelect, buildLineSku, findDesign, ProvinceCombobox } from './components/ProductPicker.jsx';
import { CardTable } from './components/DataTableParts.jsx';
import { supabase } from './lib/supabaseClient.js';
import { invalidateSaleCache, isDftNote } from './lib/saleData.js';
import { versionedUpdate, promptConflictResolution, mergeVersionedUpdate } from './lib/optimisticUpdate.js';
import { voidReceipt, restoreReceipt, uploadReceiptFile, canEditReceipt } from './lib/receiptSubmit.js';
import { CHANNELS, JOB_TYPES, PAYMENT_TYPES } from './lib/saleFields.js';
import { logAudit, diffFields } from './lib/audit.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DrawerField, DrawerGroup, SellerCombobox, FormSection, CustomerTypeChips, MoneyCard, ReceiptPdfModal, Field, FieldLabel, _pageList } from './saleWidgets.jsx';
import { MoneySummaryRows, payLabel } from './orderCard.jsx';

const custCodeShow = (code, name) => { const c = String(code || '').replace(/^[PSN]/, '').trim(); return c && c !== String(name || '').trim() ? c : ''; };
// label ฟิลด์ในฟอร์มแก้ = จางเล็ก 11px (หัวข้อกลุ่ม FormSection เด่นกว่า — ลำดับชั้นถูกทาง · PART 81.5)
export function OrderDrawer({ order: o, sk, buildDesigns, sellerOptions = [], onClose, onSaved, onChanged }) {
  const designs = buildDesigns(sk);
  const jt = o.job_type || 'ปลีก';
  const jtCls = { DFT: 'chip-accent', OEM: 'chip-warn' }[jt] || '';
  const hasOv = !!o._ov;                                   // ออเดอร์นี้เคยแก้มือไหม
  const isReceipt = (o.source || '') === 'shipnity';       // มาจากใบเสร็จ — ยกเลิกผ่านระบบใบเสร็จ (ส่งใหม่ได้)
  const isCancelled = o.status === 'cancelled';            // ยกเลิกแล้ว → ปุ่มเป็น "นำกลับมา"
  const [edit, setEdit] = useState(null);                  // null | ฟอร์มแก้เต็มทุกช่อง
  const [busy, setBusy] = useState(false);
  // โหมดแก้ไขครบจบ (PART 88.2) — รายการสินค้า editable ทุกบรรทัด + ลบ/เพิ่ม (เขียนตอน "บันทึกทั้งหมด" ทีเดียว)
  const [editLines, setEditLines] = useState(null);        // [{id,raw,design,code,color,size,qty,line_sales,_design0,_code0}]
  const [delIds, setDelIds] = useState([]);                // id ของบรรทัดเดิมที่กดลบ
  const [fin, setFin] = useState(null);                    // ราคาเสื้อ/ส่วนลด/ค่าส่ง/VAT จาก attrs (โหลด lazy ตอนเปิด — attrs ไม่อยู่ใน ORDERS_SEL กัน egress)
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data } = await supabase.from('tmk_mp_orders').select('attrs').eq('order_no', o.order_no).eq('source', o.source || '').maybeSingle();
        if (cancel) return;
        const a = data?.attrs || {};
        setFin({ subtotal: a.subtotal, discount: a.discount, shipping: a.shipping, vat: a.vat, promo: a.promo_code });
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
      // เงินละเอียด (attrs) — ครบจบที่เดียว: ราคาเสื้อ/ส่วนลด/ค่าส่ง/VAT แก้ได้แล้ว
      subtotal: fin?.subtotal ?? '', discount: fin?.discount ?? '', shipping: fin?.shipping ?? '', vat: fin?.vat ?? '',
    });
    setEditLines(sk.map(s => ({
      id: s.id || null, raw: s.raw_sku_or_name || '',
      design: s.design || '', code: s.product_code || '', color: s.color || '', size: s.size || '',
      qty: String(s.qty ?? ''), line_sales: String(s.line_sales ?? ''),
      _design0: s.design || '', _code0: s.product_code || '',
    })));
    setDelIds([]);
    // ที่อยู่อยู่ที่โปรไฟล์ลูกค้า (ไม่มีคอลัมน์บนออเดอร์) — prefill best-effort ถ้ายังไม่พิมพ์ทับ
    if (o.customer_code) {
      supabase.from('tmk_mp_customers').select('address').eq('customer_code', o.customer_code).maybeSingle()
        .then(({ data }) => { if (data?.address) setEdit(prev => prev && prev.customer_address === '' ? { ...prev, customer_address: data.address } : prev); })
        .catch(() => { /* โปรไฟล์ optional */ });
    }
  };
  // ---- helper รายการสินค้าในโหมดแก้ไข (PART 88.2) — จำนวนรวมเติมอัตโนมัติจากบรรทัด ----
  const _sumQ = (ls) => ls.reduce((a, l) => a + (Number(l.qty) || 0), 0);
  const _sumS = (ls) => ls.reduce((a, l) => a + (Number(l.line_sales) || 0), 0);
  const setLine = (i, patch) => setEditLines(ls => {
    const n = ls.map((l, j) => j === i ? { ...l, ...patch } : l);
    if ('qty' in patch) setEdit(prev => prev ? { ...prev, qty: String(_sumQ(n)) } : prev);
    return n;
  });
  const addLine = () => setEditLines(ls => {
    const n = [...ls, { id: null, raw: '', design: '', code: '', color: '', size: '', qty: '1', line_sales: '', _design0: '', _code0: '' }];
    setEdit(prev => prev ? { ...prev, qty: String(_sumQ(n)) } : prev);
    return n;
  });
  const removeLine = (i) => setEditLines(ls => {
    const l = ls[i];
    if (l?.id) setDelIds(d => [...d, l.id]);
    const n = ls.filter((_, j) => j !== i);
    setEdit(prev => prev ? { ...prev, qty: String(_sumQ(n)) } : prev);
    return n;
  });

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
        // Phase 3.5 (§9.1): guard ด้วย row_version → conflict = three-way merge (auto-merge ช่องไม่ชน · critical ถาม user รายช่อง)
        // abort ก่อนเขียน override/profile/sku ถ้า user เลือกโหลดล่าสุด (กัน partial write)
        const match = { order_no: o.order_no, source: o.source || '' };
        // apply แบบ schema-tolerant (customer_phone อาจยังไม่รัน migration 20260715)
        const apply = async (p, ev) => {
          let rr = await versionedUpdate(supabase, 'tmk_mp_orders', match, p, ev);
          if (!rr.ok && !rr.conflict && /customer_phone/i.test(rr.error?.message || '')) {
            const { customer_phone: _p, ...slim } = p;
            rr = await versionedUpdate(supabase, 'tmk_mp_orders', match, slim, ev);
          }
          return rr;
        };
        const r = await mergeVersionedUpdate({ supabase, table: 'tmk_mp_orders', match, base: o, patch, expectedVersion: o.row_version, entity: 'ออเดอร์', apply });
        if (r.reloaded) { onClose(); onChanged?.(); return; }                               // user เลือกโหลดล่าสุด
        if (r.raced) { toast('มีคนแก้ซ้อนอีกครั้ง — รีเฟรชแล้วลองใหม่', 'warn'); onClose(); onChanged?.(); return; }
        if (!r.ok) throw r.error || new Error('บันทึกไม่สำเร็จ');
        if (r.merged) toast(r.auto ? 'มีคนแก้พร้อมกัน — รวมให้อัตโนมัติแล้ว' : 'บันทึกตามที่เลือกแล้ว', 'success');
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
      // รายการสินค้า — เขียนตามที่แก้จริงในฟอร์ม (PART 88.2 แก้ครบจบที่เดียว · เลิกแบ่งสัดส่วนอัตโนมัติ)
      if (editLines) {
        try {
          // ลบบรรทัดที่กด 🗑 (+ ล้าง override ของบรรทัดนั้น กัน orphan — pattern PART 72)
          for (const id of delIds) {
            await supabase.from('tmk_mp_skus').delete().eq('id', id);
          }
          const delRaws = sk.filter(s => delIds.includes(s.id)).map(s => s.raw_sku_or_name).filter(Boolean);
          for (const raw of delRaws) {
            try { await supabase.from('tmk_sku_overrides').delete().eq('key', skuOverrideKey(o.order_no, raw)); } catch { /* optional */ }
          }
          for (let i = 0; i < editLines.length; i++) {
            const l = editLines[i];
            if (!String(l.design || '').trim() && !(Number(l.qty) > 0)) continue;  // บรรทัดว่าง — ข้าม
            const baseCode = (l.code || '').trim();
            const fullCode = buildLineSku(baseCode, l.color, l.size) || baseCode;
            const row = { design: (l.design || '').trim(), product_code: fullCode, color: l.color || '', size: l.size || '', qty: Number(l.qty) || 0, line_sales: Number(l.line_sales) || 0 };
            if (l.id) await supabase.from('tmk_mp_skus').update(row).eq('id', l.id);
            else await supabase.from('tmk_mp_skus').insert({ id: `${o.source || 'manual'}:${o.order_no}:edit:${Date.now()}:${i}`, order_no: o.order_no, source: o.source || '', channel: patch.channel, order_month: patch.order_month, order_date: patch.order_date, raw_sku_or_name: row.design, match_how: 'manual', ...row });
            // เปลี่ยนลาย/รหัส → override กันหายตอน reimport (เฉพาะบรรทัดเดิมที่มี raw)
            if (l.id && l.raw && (row.design !== l._design0 || fullCode !== l._code0)) {
              try { await supabase.from('tmk_sku_overrides').upsert({ key: skuOverrideKey(o.order_no, l.raw), order_no: o.order_no, design: row.design, product_code: fullCode, updated_at: now }, { onConflict: 'key' }); } catch { /* optional */ }
            }
          }
        } catch { /* บรรทัดพลาดบางส่วน — order-level บันทึกแล้ว */ }
      }
      // เงินละเอียด (ราคาเสื้อ/ส่วนลด/ค่าส่ง/VAT) → attrs ของออเดอร์ (merge คีย์อื่นคงเดิม) — เดิมแก้จากหน้าจอไหนไม่ได้เลย
      const numOr = (v) => (v === '' || v == null) ? null : (Number(v) || 0);
      const finPatch = { subtotal: numOr(edit.subtotal), discount: numOr(edit.discount), shipping: numOr(edit.shipping), vat: numOr(edit.vat) };
      const finChanged = ['subtotal', 'discount', 'shipping', 'vat'].some(k => (finPatch[k] ?? null) !== (numOr(fin?.[k]) ?? null));
      if (finChanged) {
        try {
          const { data: cur } = await supabase.from('tmk_mp_orders').select('attrs').eq('order_no', o.order_no).eq('source', o.source || '').maybeSingle();
          const a = { ...(cur?.attrs || {}) };
          for (const k of ['subtotal', 'discount', 'shipping', 'vat']) {
            if (finPatch[k] == null || finPatch[k] === 0) delete a[k]; else a[k] = finPatch[k];
          }
          await supabase.from('tmk_mp_orders').update({ attrs: a }).eq('order_no', o.order_no).eq('source', o.source || '');
          setFin({ subtotal: a.subtotal, discount: a.discount, shipping: a.shipping, vat: a.vat, promo: a.promo_code });
        } catch { /* attrs optional */ }
      }
      // ใบเสร็จ: sync confirmed payload ให้ restore/รายงานใบเสร็จตรงกับที่แก้
      if (isReceipt && (editLines || finChanged)) {
        try {
          const { data: rc } = await supabase.from('tmk_sale_receipts').select('confirmed').eq('order_no', o.order_no).maybeSingle();
          const cf = rc?.confirmed;
          if (cf) {
            if (editLines) cf.lines = editLines.filter(l => String(l.design || '').trim() || Number(l.qty) > 0).map(l => ({ name: (l.design || '').trim(), code: buildLineSku((l.code || '').trim(), l.color, l.size) || (l.code || '').trim(), qty: Number(l.qty) || 0, unit_price: (Number(l.qty) || 0) > 0 ? Math.round(((Number(l.line_sales) || 0) / (Number(l.qty) || 1)) * 100) / 100 : (Number(l.line_sales) || 0), amount: Number(l.line_sales) || 0 }));
            cf.total = patch.sales;
            cf.subtotal = finPatch.subtotal ?? patch.sales;
            if (finPatch.discount != null) cf.discount = finPatch.discount; else delete cf.discount;
            if (finPatch.shipping != null) cf.shipping = finPatch.shipping; else delete cf.shipping;
            if (finPatch.vat != null) cf.vat = finPatch.vat; else delete cf.vat;
            await supabase.from('tmk_sale_receipts').update({ confirmed: cf }).eq('order_no', o.order_no);
          }
        } catch { /* เงียบ — restore จะใช้ payload เดิม */ }
      }
      logAudit({
        action: 'update', entityType: 'order', entityName: o.order_no, entityId: o.order_no,
        summary: `แก้ออเดอร์ ${o.order_no} (${patch.channel} · ฿${patch.sales})`,
        changes: diffFields(o, patch, [
          ['channel', 'ช่องทาง'], ['sales', 'ยอดขาย'], ['qty', 'จำนวน'], ['job_type', 'ประเภทงาน'],
          ['payment_type', 'การชำระ'], ['customer_name', 'ลูกค้า'], ['customer_type', 'ประเภทลูกค้า'],
          ['province', 'จังหวัด'], ['salesperson', 'เซลล์'], ['customer_phone', 'เบอร์'], ['note', 'หมายเหตุ'],
        ]),
        fields: [
          { label: 'เลขที่', value: o.order_no },
          { label: 'ช่องทาง', value: patch.channel || '—' },
          { label: 'ยอดขาย', value: `฿${Number(patch.sales || 0).toLocaleString()}` },
          { label: 'จำนวน', value: `${patch.qty || 0} ตัว` },
          { label: 'ประเภทงาน', value: patch.job_type || '—' },
          { label: 'การชำระ', value: patch.payment_type || '—' },
          { label: 'ลูกค้า', value: patch.customer_name || '—' },
          { label: 'จังหวัด', value: patch.province || '—' },
          { label: 'เซลล์', value: patch.salesperson || '—' },
          { label: 'วันที่', value: patch.order_date || o.order_date || '—' },
          ...(editLines ? [{ label: 'รายการสินค้า', value: `${editLines.length} บรรทัด${delIds.length ? ` · ลบ ${delIds.length}` : ''}` }] : []),
          ...(finChanged ? [{ label: 'เงินละเอียด', value: `ส่วนลด ${finPatch.discount ?? 0} · ส่ง ${finPatch.shipping ?? 0} · VAT ${finPatch.vat ?? 0}` }] : []),
        ],
      });
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
        // Phase 3.2 (OCC §9): guard ด้วย row_version — คนอื่นแก้ออเดอร์นี้ก่อน = conflict (ไม่ทับสถานะเงียบ)
        const match = { order_no: o.order_no, source: o.source || '' };
        const patch = { status: 'cancelled', updated_at: new Date().toISOString() };
        let r = await versionedUpdate(supabase, 'tmk_mp_orders', match, patch, o.row_version);
        if (r.conflict) {
          const choice = await promptConflictResolution({ entity: 'ออเดอร์', changedFields: ['status'] });
          if (choice !== 'overwrite') { onClose(); onChanged?.(); return; }
          r = await versionedUpdate(supabase, 'tmk_mp_orders', match, patch);
        }
        if (!r.ok) throw r.error || new Error('ยกเลิกไม่สำเร็จ');
        logAudit({ action: 'delete', entityType: 'order', entityName: o.order_no, entityId: o.order_no, severity: 'warn', summary: `ยกเลิกออเดอร์ ${o.order_no}`, fields: [{ label: 'เลขที่', value: o.order_no }, { label: 'ยอดขาย', value: `฿${Number(o.sales || 0).toLocaleString()}` }, { label: 'ช่องทาง', value: o.channel || '—' }, { label: 'ลูกค้า', value: o.customer_name || '—' }, { label: 'เซลล์', value: o.salesperson || '—' }] });
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
        // Phase 3.2 (OCC §9): guard ด้วย row_version
        const match = { order_no: o.order_no, source: o.source || '' };
        const patch = { status: 'active', updated_at: new Date().toISOString() };
        let r = await versionedUpdate(supabase, 'tmk_mp_orders', match, patch, o.row_version);
        if (r.conflict) {
          const choice = await promptConflictResolution({ entity: 'ออเดอร์', changedFields: ['status'] });
          if (choice !== 'overwrite') { onClose(); onChanged?.(); return; }
          r = await versionedUpdate(supabase, 'tmk_mp_orders', match, patch);
        }
        if (!r.ok) throw r.error || new Error('นำกลับไม่สำเร็จ');
        invalidateSaleCache('tmk_mp_orders');
        logAudit({ action: 'restore', entityType: 'order', entityName: o.order_no, entityId: o.order_no, summary: `นำออเดอร์ ${o.order_no} กลับมา`, fields: [{ label: 'เลขที่', value: o.order_no }, { label: 'ยอดขาย', value: `฿${Number(o.sales || 0).toLocaleString()}` }, { label: 'ช่องทาง', value: o.channel || '—' }, { label: 'ลูกค้า', value: o.customer_name || '—' }] });
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
      logAudit({ action: 'purge', entityType: 'order', entityName: o.order_no, entityId: o.order_no, severity: 'warn', summary: `ลบออเดอร์ ${o.order_no} ถาวร (฿${o.sales})`, fields: [{ label: 'เลขที่', value: o.order_no }, { label: 'ยอดขาย', value: `฿${Number(o.sales || 0).toLocaleString()}` }, { label: 'ช่องทาง', value: o.channel || '—' }, { label: 'ลูกค้า', value: o.customer_name || '—' }, { label: 'เซลล์', value: o.salesperson || '—' }] });
      toast('ลบออเดอร์ถาวรแล้ว', 'success');
      onClose(); onChanged?.();
    } catch (e) { toast('ลบไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
    finally { setBusy(false); }
  };
  // saveLine รายบรรทัดถูกยุบเข้า "บันทึกทั้งหมด" ของโหมดแก้ไขครบจบ (PART 88.2)
  const stMap = { completed: 'สำเร็จ', delivered: 'ส่งแล้ว', cancelled: 'ยกเลิก', pending: 'รอดำเนินการ', processing: 'กำลังทำ', shipped: 'จัดส่งแล้ว' };
  // COD เต็มจำนวน (ยอด COD = ยอดขาย) → โชว์ป้าย "เก็บปลายทาง" แทนเลขซ้ำ · COD บางส่วน → โชว์เลขจริง
  const isFullCod = o.cod_amount > 0 && Number(o.cod_amount) === Number(o.sales);
  const money = [{ label: 'ยอดขาย', val: B(o.sales), badge: isFullCod ? 'เก็บปลายทาง (COD)' : '' }];
  if (o.mkt_commission > 0) money.push({ label: 'ค่าธรรมเนียม', val: '−' + B(o.mkt_commission) });
  if (o.cod_amount > 0 && !isFullCod) money.push({ label: 'ยอด COD', val: B(o.cod_amount) });
  // PART 88.1: โหมดดู — ปุ่มจัดการย้ายเข้าการ์ด "ไฟล์ใบเสร็จ & จัดการ" (ไม่มี footer bar) · โหมดแก้ไขคง footer "ปิด"
  const footerActions = edit ? <Button variant="outline" onClick={onClose}>ปิด</Button> : undefined;
  // หัว drawer สะอาด — ชื่อออเดอร์อย่างเดียว (ช่องทาง/วันที่/ยอด ไปอยู่การ์ด "ข้อมูลออเดอร์" + กล่องยอด · PART 88.1)
  return <SideSheet size="lg" icon="listChecks" title={`ออเดอร์ ${o.order_no}`}
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
        <div className="cap cap-head" style={{ fontWeight: 700, color: 'var(--accent)' }}><Icon name="pencil" /> แก้ไขออเดอร์ — แก้ตรงช่องได้ทุกจุด บันทึกครั้งเดียว มีผลกับรายงานทันที</div>

        {/* เงิน — ตำแหน่ง/หน้าตาเดียวกับกล่องยอดโหมดดู: ยอดขายใหญ่กลาง + ส่วนลด/ค่าส่ง/VAT/ราคาเสื้อ/จำนวนรวม */}
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
          <div className="mx-auto flex w-full max-w-[220px] flex-col items-center gap-1">
            <FieldLabel>ยอดขาย (฿)</FieldLabel>
            <Input className="h-11 bg-background text-center text-[20px] font-bold tabular-nums" type="number" inputMode="decimal" min="0" step="0.01" value={edit.sales} onChange={e => setEdit({ ...edit, sales: e.target.value })} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Field label="ราคาเสื้อ (฿)"><Input className="bg-background text-right" type="number" inputMode="decimal" min="0" step="0.01" value={edit.subtotal} onChange={e => setEdit({ ...edit, subtotal: e.target.value })} placeholder="—" /></Field>
            <Field label="ส่วนลด (฿)"><Input className="bg-background text-right" type="number" inputMode="decimal" min="0" step="0.01" value={edit.discount} onChange={e => setEdit({ ...edit, discount: e.target.value })} placeholder="0" /></Field>
            <Field label="ค่าส่ง (฿)"><Input className="bg-background text-right" type="number" inputMode="decimal" min="0" step="0.01" value={edit.shipping} onChange={e => setEdit({ ...edit, shipping: e.target.value })} placeholder="0" /></Field>
            <Field label="VAT (฿)"><Input className="bg-background text-right" type="number" inputMode="decimal" min="0" step="0.01" value={edit.vat} onChange={e => setEdit({ ...edit, vat: e.target.value })} placeholder="0" /></Field>
            <Field label="จำนวนรวม (ตัว)"><Input className="bg-background text-right" type="number" inputMode="numeric" min="0" value={edit.qty} onChange={e => setEdit({ ...edit, qty: e.target.value })} /></Field>
          </div>
        </div>

        {/* รายการสินค้า — บล็อกหน้าตาเดียวกับโหมดดู แต่แก้ตรงช่อง + เพิ่ม/ลบบรรทัด (จำนวนรวมเติมอัตโนมัติ) */}
        <div className="overflow-hidden rounded-xl border shadow-sm" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
          <div className="flex items-center gap-2 border-b px-3.5 py-2.5" style={{ background: 'var(--surface-2)', borderColor: 'var(--line)' }}>
            <span className="grid size-7 place-items-center rounded-lg" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', flex: 'none' }}><Icon name="bag" /></span>
            <span className="text-[13px] font-bold">รายการสินค้า</span>
            <span className="cap" style={{ color: 'var(--ink-4)' }}>· {N((editLines || []).length)} รายการ · {N(_sumQ(editLines || []))} ตัว</span>
          </div>
          <div className="flex flex-col gap-1.5 p-3.5">
            {editLines && editLines.length > 0 && (
              <div className="hidden items-center gap-1.5 text-[11px] font-semibold text-muted-foreground sm:grid" style={{ gridTemplateColumns: 'minmax(150px,2fr) minmax(90px,1fr) minmax(70px,0.9fr) 56px 84px 30px' }}>
                <span>ลาย</span><span>สี</span><span>ไซซ์</span><span className="text-right">จำนวน</span><span className="text-right">ยอด (฿)</span><span />
              </div>
            )}
            {(editLines || []).map((l, i) => (
              <div key={(l.id || 'new') + '#' + i} className="grid items-center gap-1.5" style={{ gridTemplateColumns: 'minmax(150px,2fr) minmax(90px,1fr) minmax(70px,0.9fr) 56px 84px 30px' }}>
                <DesignCombobox value={l.design} code={l.code} onPick={({ name, code, design: d }) => setLine(i, { design: name, code: code || l.code, color: (l.color && d?.colors?.length && !d.colors.includes(l.color)) ? '' : l.color, size: (l.size && d?.sizes?.length && !d.sizes.includes(l.size)) ? '' : l.size })} />
                <ColorSelect design={findDesign(l.design)} value={l.color} onChange={v => setLine(i, { color: v })} />
                <SizeSelect design={findDesign(l.design)} value={l.size} onChange={v => setLine(i, { size: v })} />
                <Input className="bg-background text-right" inputMode="numeric" value={l.qty} onChange={e => setLine(i, { qty: e.target.value })} />
                <Input className="bg-background text-right" inputMode="decimal" value={l.line_sales} onChange={e => setLine(i, { line_sales: e.target.value })} />
                <Button variant="ghost" size="sm" className="h-8 px-2" style={{ color: 'var(--bad)' }} onClick={() => removeLine(i)} title="ลบบรรทัดนี้"><Icon name="trash" /></Button>
              </div>
            ))}
            {(!editLines || editLines.length === 0) && <div className="cap py-2 text-center" style={{ color: 'var(--ink-4)' }}>ยังไม่มีรายการ — กด "เพิ่มรายการ"</div>}
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" className="h-8 gap-1" onClick={addLine}><Icon name="plus" /> เพิ่มรายการ</Button>
              {editLines && editLines.length > 0 && (() => {
                const s = _sumS(editLines); const match = Math.abs(s - (Number(edit.sales) || 0)) <= 0.01;
                return <span className="cap ml-auto" style={{ color: match ? 'var(--good)' : 'var(--warn)' }}>รวมรายการ {_sumQ(editLines)} ตัว · {B(s)} {match ? '= ยอดขาย ✓' : `≠ ยอดขาย ${B(Number(edit.sales) || 0)}`}</span>;
              })()}
            </div>
          </div>
        </div>

        {/* ข้อมูลออเดอร์ | ลูกค้า — การ์ดคู่ตำแหน่งเดียวกับโหมดดู แก้ตรงช่อง */}
        <div className="grid items-start gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <FormSection icon="listChecks" title="ข้อมูลออเดอร์">
            <div className="flex flex-col gap-3">
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
              <Field label="การชำระ">
                <Select value={edit.payment_type || 'ไม่ระบุ'} onValueChange={v => setEdit({ ...edit, payment_type: v })}>
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>{[...new Set([...PAYMENT_TYPES, edit.payment_type].filter(Boolean))].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
          </FormSection>
          <FormSection icon="user" title="ลูกค้า">
            <div className="flex flex-col gap-3">
              <Field label="ชื่อลูกค้า"><Input className="bg-background" value={edit.customer_name} onChange={e => setEdit({ ...edit, customer_name: e.target.value })} placeholder="ชื่อลูกค้า" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="เบอร์โทร"><Input className="bg-background" value={edit.customer_phone} onChange={e => setEdit({ ...edit, customer_phone: e.target.value })} placeholder="ไว้ตามต่อ / เข้า CRM" /></Field>
                <Field label="โซเชียล (FB/LINE)"><Input className="bg-background" value={edit.customer_social} onChange={e => setEdit({ ...edit, customer_social: e.target.value })} placeholder="ชื่อเพจ/ไลน์" /></Field>
              </div>
              <Field label="สถานะลูกค้า"><CustomerTypeChips value={edit.customer_type} onChange={v => setEdit({ ...edit, customer_type: v })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="จังหวัด"><ProvinceCombobox className="bg-background" value={edit.province} onChange={v => setEdit({ ...edit, province: v })} /></Field>
                <Field label="เซลล์"><SellerCombobox className="bg-background" value={edit.salesperson} onChange={v => setEdit({ ...edit, salesperson: v })} options={sellerOptions} /></Field>
              </div>
              <Field label="ที่อยู่"><Input className="bg-background" value={edit.customer_address} onChange={e => setEdit({ ...edit, customer_address: e.target.value })} placeholder="ที่อยู่จัดส่ง (เข้าโปรไฟล์ลูกค้า CRM)" /></Field>
              <Field label="หมายเหตุ"><Textarea className="bg-background" rows={2} value={edit.note} onChange={e => setEdit({ ...edit, note: e.target.value })} placeholder="เช่น DFT / ล็อตสินค้า / โน้ตภายใน" /></Field>
            </div>
          </FormSection>
        </div>

        {/* แถวบันทึก — การ์ดเดียวแบบแถวจัดการโหมดดู */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3 shadow-sm" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
          <Button onClick={saveOrder} disabled={busy || edit.sales === '' || !(Number(edit.sales) >= 0)}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึกทั้งหมด'}</Button>
          <Button variant="ghost" onClick={() => setEdit(null)} disabled={busy}>ยกเลิก</Button>
          {hasOv && <Button variant="ghost" className="ml-auto" style={{ color: 'var(--bad)' }} onClick={revertOrder} disabled={busy}><Icon name="refresh" /> คืนค่าจากไฟล์</Button>}
        </div>
      </div>
    )}

    {/* ยอดเงิน — การ์ดเดียว: ยอดเด่น + COD badge + เซลล์เสริม (ค่าธรรมเนียม/COD) + แยกราคา (ไม่โชว์ยอดซ้ำ) */}
    {!edit && <MoneyCard total={o.sales} codBadge={isFullCod ? 'เก็บปลายทาง (COD)' : ''} extras={money.slice(1)} discount={fin?.discount} />}

    {/* ===== Order Summary (Lemon · PART 88.1) — รายการสินค้า + สรุปเงิน เป็นบล็อกเดียวถัดจากยอด (ซ่อนตอนแก้ — ฟอร์มมีของตัวเอง) ===== */}
    {!edit && sk.length > 0 && <div className="overflow-hidden rounded-xl border shadow-sm" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b" style={{ background: 'var(--surface-2)', borderColor: 'var(--line)' }}>
        <span className="grid place-items-center rounded-lg size-7" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', flex: 'none' }}><Icon name="bag" /></span>
        <span className="text-[13px] font-bold">รายการสินค้า</span>
        <span className="cap" style={{ color: 'var(--ink-4)' }}>· {N(sk.length)} รายการ · {N(sk.reduce((a, x) => a + (Number(x.qty) || 0), 0))} ตัว</span>
      </div>
      <CardTable className="table-wrap"><Table>
        <TableHeader><TableRow><TableHead>ลาย</TableHead><TableHead>รหัส</TableHead><TableHead>สี</TableHead><TableHead>ไซซ์</TableHead><TableHead style={{ textAlign: 'right' }}>จำนวน</TableHead><TableHead style={{ textAlign: 'right' }}>ยอด</TableHead><TableHead>จับคู่</TableHead></TableRow></TableHeader>
        <TableBody>{sk.map((s, i) => (
          <TableRow key={i}>
            <TableCell className="cell-title" style={{ fontWeight: 600 }}>{s.design || <span style={{ color: 'var(--bad)' }}>จับคู่ไม่ได้</span>}{s._resolveSrc === 'override' && <Badge variant="outline" className="ml-1.5 text-[10px]" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>แก้มือ</Badge>}{s.raw_sku_or_name && s.raw_sku_or_name !== s.design && <div className="cap" style={{ color: 'var(--ink-4)' }}>{s.raw_sku_or_name}</div>}</TableCell>
            <TableCell className="cap">{s.product_code || '—'}</TableCell>
            <TableCell className="cap">{s.color || '—'}</TableCell>
            <TableCell className="cap">{s.size || '—'}</TableCell>
            <TableCell className="num" style={{ textAlign: 'right' }}>{N(s.qty)}</TableCell>
            <TableCell className="num" style={{ textAlign: 'right' }}>{B(s.line_sales)}</TableCell>
            <TableCell><span className="cap" style={{ color: s.match_how ? 'var(--ink-3)' : 'var(--bad)' }}>{s.match_how || '—'}</span></TableCell>
          </TableRow>
        ))}</TableBody>
      </Table></CardTable>
      {/* สรุปเงินท้ายรายการ (Lemon) — ราคาเสื้อ→ส่วนลด→ค่าส่ง→VAT→ยอดขาย · ซ่อนเองถ้าไม่มี breakdown */}
      <MoneySummaryRows fin={edit ? null : fin} total={o.sales} />
    </div>}

    {/* ===== ข้อมูลออเดอร์ + ลูกค้า — การ์ดคู่โชว์เลย (ซ่อนตอนแก้ — ฟอร์มมีครบ) ===== */}
    {!edit && <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
      <DrawerGroup icon="listChecks" title="ข้อมูลออเดอร์">
        <DrawerField label="เลขออเดอร์">{o.order_no}</DrawerField>
        {o.marketplace_id && o.marketplace_id !== '-' && <DrawerField label="ID มาร์เก็ตเพลส">{o.marketplace_id}</DrawerField>}
        <DrawerField label="วันที่">{o.order_date || o.order_month}</DrawerField>
        <DrawerField label="ช่องทาง"><span className="row" style={{ gap: 6, alignItems: 'center' }}><span style={{ width: 8, height: 8, borderRadius: 3, background: channelColor(o.channel), flex: 'none' }} />{o.channel}</span></DrawerField>
        <DrawerField label="ประเภทงาน">{jt === 'ปลีก' ? 'ปลีก' : <span className={'chip ' + jtCls}>{jt}</span>}</DrawerField>
        {o.status && o.status !== 'completed' && o.status !== 'active' && <DrawerField label="สถานะ"><Badge variant="secondary">{stMap[o.status] || o.status}</Badge></DrawerField>}
        <DrawerField label="การชำระ">{payLabel(o)}</DrawerField>
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
    </div>}

    {/* ไฟล์ใบเสร็จ + จัดการออเดอร์ — แบบ A: การ์ดแถวเดียวจบ (PART 88.1 · user เลือกจาก mockup)
        ซ้าย = สถานะไฟล์ + เปิด/เปลี่ยน · ขวา = แก้ไข(เด่น) · ยกเลิก/ลบ(ghost) · ไม่มีปุ่ม "ปิด" (ใช้ ✕ บนหัว) */}
    {!edit && (
      <div className="flex items-center gap-2 flex-wrap rounded-xl border px-4 py-3 shadow-sm" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
        {isReceipt && rec && (<>
          <span className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--ink-3)' }}>
            <span className="inline-flex [&_svg]:size-4" style={{ color: 'var(--accent)' }}><Icon name="external" /></span> ใบเสร็จ
            <b style={{ color: rec.file_url ? 'var(--good)' : 'var(--ink-4)' }}>{rec.file_url ? 'แนบแล้ว' : 'ยังไม่แนบ'}</b>
          </span>
          {rec.file_url && <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setPdfOpen(true)}><Icon name="external" className="size-3.5" /> เปิดไฟล์</Button>}
          {rec.status !== 'void' && canEditReceipt(rec, { email: window.__userEmail, isAdmin: window.__isAdmin === true }) && (
            <>
              <input ref={attachRef} type="file" accept="application/pdf" hidden onChange={e => { attachReceiptToOrder(e.target.files?.[0]); e.target.value = ''; }} />
              <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={attaching} onClick={() => attachRef.current?.click()}>
                {attaching ? 'กำลังแนบ…' : rec.file_url ? 'เปลี่ยนไฟล์' : 'แนบไฟล์'}
              </Button>
            </>
          )}
        </>)}
        <span className="ml-auto flex items-center gap-1.5 flex-wrap">
          {!isCancelled && window.__canEdit !== false && <Button size="sm" className="h-8 gap-1.5" onClick={startEdit} disabled={busy}><Icon name="pencil" /> แก้ไข</Button>}
          {isCancelled
            ? <Button variant="outline" size="sm" className="h-8 gap-1.5" style={{ color: 'var(--good)' }} onClick={restoreOrder} disabled={busy}><Icon name="refresh" /> นำกลับมา</Button>
            : <Button variant="ghost" size="sm" className="h-8 gap-1.5" style={{ color: 'var(--warn)' }} onClick={cancelOrder} disabled={busy}>ยกเลิก</Button>}
          <Button variant="ghost" size="sm" className="h-8 px-2.5" style={{ color: 'var(--bad)' }} onClick={deleteOrder} disabled={busy} title="ลบออเดอร์ถาวร"><Icon name="trash" /></Button>
        </span>
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

  </SideSheet>;
}
