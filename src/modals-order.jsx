import { useState, useMemo } from 'react';
import { B, N, Icon, lotTotal as calcLotTotal, orderStatusMeta } from './components.jsx';
import { supabase } from './lib/supabaseClient.js';
import { todayISO } from './lib/dateUtils.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { logAudit } from './lib/audit.js';
import { mutateProductReservations } from './modals-stock.js';
import { Modal, toast, nn, guardClose, uid, MD } from './modals-core.jsx';

function genOrderCode() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2), mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `ORD-${yy}${mm}${dd}-${(Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6)).slice(0, 8).toUpperCase()}`;
}
// ตัดสต็อกแบบ FIFO (ล็อตเก่าก่อน) สำหรับ 1 variant → คืน lots ใหม่ + จำนวนที่ตัดได้ + ต้นทุนรวม
function deductVariantFIFO(lots, color, size, qty) {
  let need = Math.max(0, Math.round(Number(qty) || 0)), costTotal = 0;
  const newLots = (lots || []).map(l => ({ ...l, grid: Object.fromEntries(Object.entries(l.grid || {}).map(([cid, row]) => [cid, { ...row }])) }));
  const order = newLots.map((l, i) => i).sort((a, b) => String(newLots[a].date || '9999').localeCompare(String(newLots[b].date || '9999')));
  for (const idx of order) {
    if (need <= 0) break;
    const lot = newLots[idx];
    const norm = (name) => { const n = String(name || '').trim(); return n === 'กรม' ? 'กรมท่า' : n; };
    const col = (lot.colors || []).find(c => norm(c.name) === norm(color));
    if (!col) continue;
    const avail = Number(lot.grid?.[col.id]?.[size]) || 0;
    if (avail <= 0) continue;
    const take = Math.min(need, avail);
    const row = { ...(lot.grid[col.id] || {}) }; const left = avail - take; if (left > 0) row[size] = left; else delete row[size];
    lot.grid[col.id] = row;
    need -= take; costTotal += take * (Number(lot.cost) || 0);
  }
  return { newLots, deducted: qty - need, costTotal };
}
// จองสต็อกตามออเดอร์ (เขียน reservations ที่มี orderId ลงแต่ละสินค้า)
async function applyOrderReservations(order) {
  const byProd = {};
  (order.items || []).forEach(it => { (byProd[it.productId] = byProd[it.productId] || []).push({ color: it.color, size: it.size, qty: nn(it.qty) }); });
  await Promise.all(Object.entries(byProd).map(([pid, items]) => {
    const p = (MD.products || []).find(x => x.id === pid); if (!p) return null;
    const rsv = { id: 'rsv-' + order.id, orderId: order.id, customer: order.customerName || '', date: todayISO(), note: `ออเดอร์ ${order.code}`, items };
    // re-derive จากค่าล่าสุด: เอา reservation เดิมของออเดอร์นี้ออกแล้วใส่ของใหม่ (optimistic-lock กัน lost update)
    return mutateProductReservations(pid, (cur) => [...cur.filter(r => r.orderId !== order.id), rsv]);
  }).filter(Boolean));
  const nProd = Object.keys(byProd).length;
  if (nProd) logAudit({ action: 'reserve', entityType: 'po', entityName: `ออเดอร์ ${order.code || order.id}`, summary: `จองสต็อก ${nProd} สินค้า (ออเดอร์ ${order.code || order.id})`, data: { orderId: order.id, products: nProd } });
}
async function releaseOrderReservations(orderId) {
  const affected = (MD.products || []).filter(p => (p.reservations || []).some(r => r.orderId === orderId));
  await Promise.all(affected.map(p => mutateProductReservations(p.id, (cur) => cur.filter(r => r.orderId !== orderId))));
  if (affected.length) logAudit({ action: 'release', entityType: 'po', entityName: `ออเดอร์ ${orderId}`, summary: `ปล่อยจองสต็อก ${affected.length} สินค้า (ออเดอร์ ${orderId})`, data: { orderId, products: affected.length } });
}
// คำนวณการตัดสต็อก (FIFO) — ไม่เขียน DB → คืน batch updates + audit + จำนวนที่ตัดได้
// (เขียนจริงแบบ atomic ใน advanceOrderStatus ผ่าน RPC tmk_fulfill_order)
function computeFulfillment(order, freshById) {
  const byProd = {};
  (order.items || []).forEach(it => (byProd[it.productId] = byProd[it.productId] || []).push(it));
  const updates = [], audits = [], sales = [], missing = [];
  let totReq = 0, totDeducted = 0; // กันตัดสต็อกขาดเงียบๆ — เตือนถ้าสต็อกไม่พอ
  for (const pid in byProd) {
    // ใช้ค่าสดจาก DB (freshById) ถ้ามี — กัน snapshot เก่าใน MD.products ทับการขาย/รับ/จองที่เกิดพร้อมกัน
    const p = freshById ? freshById[pid] : (MD.products || []).find(x => x.id === pid);
    if (!p) { missing.push(pid); byProd[pid].forEach(it => { totReq += nn(it.qty); }); continue; } // สินค้าถูกลบ/ยังโหลดไม่เข้า → อย่าตัดเงียบ (caller จะ abort)
    let lots = p.lots || []; let costTotal = 0, soldQty = 0, amount = 0; const lines = [];
    byProd[pid].forEach(it => {
      const r = deductVariantFIFO(lots, it.color, it.size, nn(it.qty));
      lots = r.newLots; costTotal += r.costTotal; soldQty += r.deducted; amount += r.deducted * (Number(it.price) || 0);
      totReq += nn(it.qty); totDeducted += r.deducted;
      if (r.deducted > 0) lines.push({ color: it.color, size: it.size, qty: r.deducted, cost: r.deducted ? r.costTotal / r.deducted : 0 });
    });
    updates.push({ id: pid, lots, stock_on_hand: lots.reduce((a, l) => a + calcLotTotal(l), 0), reservations: (p.reservations || []).filter(rr => rr.orderId !== order.id), actual_units: Number(p.units || 0) + soldQty });
    audits.push({ pid, p, soldQty, amount, costTotal, lines });
    if (soldQty > 0) sales.push({ id: 'sale-' + order.id + '-' + pid, sale_date: todayISO(), product_id: pid, product_name: p.name, category: p.category || '', channel: order.channel || '', qty: soldQty, amount, cost: costTotal, source: 'order', order_code: order.code, lines });
  }
  return { updates, audits, sales, totReq, totDeducted, missing };
}
// fallback (ยังไม่ได้รัน SQL function) — เขียนแบบเดิม non-atomic
async function fulfillLegacyWrite(order, updates, sales, log) {
  await Promise.all(updates.map(u => supabase.from('tmk_products').update({ lots: u.lots, stock_on_hand: u.stock_on_hand, reservations: u.reservations, actual_units: u.actual_units, updated_at: new Date().toISOString() }).eq('id', u.id)));
  if (sales && sales.length) await supabase.from('tmk_sales').upsert(sales); // บันทึกการขายลงตารางจริง (ถ้าตารางมี)
  const { error } = await supabase.from('tmk_orders').update({ status: 'shipped', status_log: log, updated_at: new Date().toISOString() }).eq('id', order.id);
  if (error) throw error;
}
// เปลี่ยนสถานะออเดอร์ + จัดการสต็อกตามสถานะ (เรียกจากบอร์ด Kanban)
export async function advanceOrderStatus(order, newStatus, by = '') {
  try {
    if (order.status === newStatus) return true;
    if (order.status === 'shipped' && newStatus !== 'shipped') { toast('ออเดอร์ที่ส่งแล้วเปลี่ยนสถานะไม่ได้ (สต็อกถูกตัดแล้ว)', 'error'); return false; } // กันสต็อกหาย (defense)
    const log = [...(order.statusLog || []), { status: newStatus, at: new Date().toISOString(), by }];
    if (newStatus === 'shipped' && order.status !== 'shipped') {
      // ส่งแล้ว → ตัดสต็อก (FIFO) + ปล่อยจอง + บวกขาย + เปลี่ยนสถานะ — ทั้งหมดใน transaction เดียว (atomic)
      // re-fetch ค่าสต็อก/จอง/actual_units สดจาก DB ก่อนคำนวณ — กัน lost-update จาก snapshot เก่า (อีกแท็บ/เครื่องขาย-รับ-จองพร้อมกันก่อน realtime sync)
      let freshById = null;
      try {
        const ids = [...new Set((order.items || []).map(it => it.productId).filter(Boolean))];
        if (ids.length) {
          const { data: rows, error: fErr } = await supabase.from('tmk_products').select('id,name,category,lots,reservations,actual_units').in('id', ids);
          if (!fErr && rows) { freshById = {}; rows.forEach(r => { freshById[r.id] = { id: r.id, name: r.name, category: r.category, lots: r.lots || [], reservations: r.reservations || [], units: r.actual_units || 0 }; }); }
        }
      } catch { /* fetch พลาด → fallback ใช้ MD.products (computeFulfillment รับ null ได้) */ }
      const { updates, audits, sales, totReq, totDeducted, missing } = computeFulfillment(order, freshById);
      // มีสินค้าในออเดอร์ที่หาไม่เจอ (ถูกลบ/ยังโหลดไม่เข้า) → อย่า ship เงียบ (จะจองค้าง+ขายหาย) ให้ผู้ใช้รีโหลด/แก้ก่อน
      if (missing.length) { toast('พบสินค้าที่ถูกลบหรือยังโหลดไม่ครบในออเดอร์นี้ — รีเฟรชหน้าแล้วลองส่งใหม่ (ถ้าสินค้าถูกลบ ให้กู้คืนหรือแก้ออเดอร์ก่อน)', 'error'); return false; }
      // ส่งไม่ครบ (สต็อกไม่พอ) → บันทึกจำนวนค้างส่งลง status_log ถาวร ไม่งั้นร่องรอยว่าค้างใครหายไป
      const shortfall = totReq - totDeducted;
      if (shortfall > 0) log[log.length - 1] = { ...log[log.length - 1], shortfall, note: `สต็อกไม่พอ — ค้างส่ง ${shortfall}/${totReq} ตัว` };
      const { error: rpcErr } = await supabase.rpc('tmk_fulfill_order', { p_order_id: order.id, p_status: 'shipped', p_status_log: log, p_updates: updates, p_sales: sales });
      if (rpcErr) {
        if (/PGRST202|could not find the function|schema cache/i.test(rpcErr.message || '')) {
          await fulfillLegacyWrite(order, updates, sales, log); // ยังไม่รัน SQL → ตัดแบบไม่ atomic ชั่วคราว
          toast('⚠️ ยังไม่ได้รัน SQL (tmk_fulfill_order) — ตัดสต็อกแบบไม่ atomic ชั่วคราว แนะนำรัน migration', 'warn');
        } else throw rpcErr;
      }
      audits.forEach(a => { if (a.soldQty > 0) logAudit({ action: 'sale', entityType: 'product', entityName: a.p.name, summary: `ขาย (ออเดอร์ ${order.code}) "${a.p.name}" ${a.soldQty} ตัว`, fields: [{ label: 'ออเดอร์', value: order.code }, { label: 'รวมขาย', value: N(a.soldQty) + ' ตัว' }, { label: 'มูลค่า', value: B(a.amount) }], data: { productId: a.pid, productName: a.p.name, category: a.p.category || '', price: a.soldQty ? a.amount / a.soldQty : 0, date: todayISO(), totalQty: a.soldQty, totalAmount: a.amount, totalCost: a.costTotal, lines: a.lines } }); });
      if (totDeducted < totReq) toast(`⚠️ สต็อกไม่พอ — ส่งได้ ${N(totDeducted)}/${N(totReq)} ตัว (ตัดสต็อกเท่าที่มี) ตรวจสอบสต็อกด้วย`, 'warn');
    } else {
      if (newStatus === 'cancelled' && order.status !== 'shipped' && order.status !== 'cancelled') await releaseOrderReservations(order.id);
      const { error } = await supabase.from('tmk_orders').update({ status: newStatus, status_log: log, updated_at: new Date().toISOString() }).eq('id', order.id);
      if (error) throw error;
    }
    logAudit({ action: 'order', entityType: 'order', entityName: order.code, summary: `ออเดอร์ ${order.code} → ${orderStatusMeta(newStatus).label}` });
    window.__refresh?.(['tmk_orders', 'tmk_products']);
    toast(`อัปเดตเป็น "${orderStatusMeta(newStatus).label}"`, 'success');
    return true;
  } catch (err) { toast('เปลี่ยนสถานะไม่สำเร็จ: ' + err.message, 'error'); return false; }
}

/* ---------- Order modal (สร้าง/แก้ออเดอร์) ---------- */
const emptyOrderItem = () => ({ id: uid('oi'), productId: '', color: '', size: '', qty: '', price: '' });
export function OrderModal({ data, onClose }) {
  const products = (MD.products || []).filter(p => p.hasLots);
  const customers = MD.customers || [];
  const [custId, setCustId] = useState(data?.customerId || '');
  const [custNew, setCustNew] = useState(data ? null : { name: '', phone: '', line: '', address: '' });
  const [items, setItems] = useState(data?.items?.length ? data.items.map(it => ({ ...it, id: uid('oi') })) : [emptyOrderItem()]);
  const [discount, setDiscount] = useState(data?.discount || '');
  const [channel, setChannel] = useState(data?.channel || '');
  const [note, setNote] = useState(data?.note || '');
  const [trackingNo, setTrackingNo] = useState(data?.trackingNo || '');
  const [carrier, setCarrier] = useState(data?.carrier || '');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const _t = (fn) => (...a) => { setTouched(true); fn(...a); };

  const prodById = (id) => products.find(p => p.id === id);
  // ตอนแก้ออเดอร์เดิม: จองของออเดอร์นี้ถูกนับใน reservedByVariant อยู่แล้ว → บวกกลับก่อนคิด avail ไม่งั้นโชว์ "พร้อมขาย" ต่ำเกินจริง
  const ownReserved = useMemo(() => {
    const m = {};
    if (data?.id) (data.items || []).forEach(it => {
      if (!it.productId || !it.color || !it.size) return;
      const byColor = (m[it.productId] = m[it.productId] || {});
      const bySize = (byColor[it.color] = byColor[it.color] || {});
      bySize[it.size] = (bySize[it.size] || 0) + nn(it.qty);
    });
    return m;
  }, [data]);
  const ownRes = (pid, color, size) => (ownReserved[pid]?.[color]?.[size]) || 0;
  const setItem = (i, patch) => { setTouched(true); setItems(its => its.map((x, j) => j === i ? { ...x, ...patch } : x)); };
  const addItem = () => { setTouched(true); setItems(its => [...its, emptyOrderItem()]); };
  const removeItem = (i) => { setTouched(true); setItems(its => its.length > 1 ? its.filter((_, j) => j !== i) : [emptyOrderItem()]); };

  const lineAmt = (it) => (Number(it.qty) || 0) * (Number(it.price) || 0);
  const subtotal = items.reduce((a, it) => a + lineAmt(it), 0);
  const total = Math.max(0, subtotal - (Number(discount) || 0));
  const totalQty = items.reduce((a, it) => a + (Number(it.qty) || 0), 0);

  const handleSave = async () => {
    if (busy) return;
    // ล็อกแก้ออเดอร์ที่ส่งแล้ว — สต็อกถูกตัดไปแล้ว แก้ items จะทำให้สต็อกเพี้ยน
    if (data?.status === 'shipped') { toast('ออเดอร์ที่ "ส่งแล้ว" แก้ไขไม่ได้ (สต็อกถูกตัดแล้ว)', 'error'); return; }
    const cleanItems = items.filter(it => it.productId && it.color && it.size && Number(it.qty) > 0).map(it => {
      const p = prodById(it.productId);
      return { productId: it.productId, name: p?.name || '', color: it.color, size: it.size, qty: Math.round(nn(it.qty)), price: nn(it.price), cost: 0 };
    });
    if (!cleanItems.length) { toast('เพิ่มรายการสินค้าก่อน', 'error'); return; }
    const custName = (custNew ? custNew.name : (customers.find(c => c.id === custId)?.name || '')).trim();
    if (!custName) { toast('ระบุชื่อลูกค้า', 'error'); return; }
    setBusy(true);
    try {
      // ลูกค้าใหม่ → เช็กเบอร์ซ้ำก่อน (มีเบอร์นี้แล้ว → ใช้ซ้ำ ไม่สร้างซ้ำ) แล้วค่อยสร้างเรคคอร์ด
      let customerId = custId;
      if (custNew && custNew.name.trim()) {
        const ph = (custNew.phone || '').trim();
        const dup = ph && customers.find(c => (c.phone || '').trim() === ph);
        if (dup) {
          customerId = dup.id;
        } else {
          customerId = uid('cust');
          const cRow = { id: customerId, code: 'C' + customerId.slice(-5).toUpperCase(), name: custNew.name.trim(), phone: ph, line: custNew.line.trim(), address: custNew.address.trim(), note: '' };
          const { error: cErr } = await supabase.from('tmk_customers').insert(cRow);
          if (cErr) throw cErr;
        }
      }
      const oid = data?.id || uid('o');
      const code = data?.code || genOrderCode();
      const status = data?.status || 'pending';
      const sub = cleanItems.reduce((a, it) => a + it.qty * it.price, 0);
      const tot = Math.max(0, sub - nn(discount));
      const order = { id: oid, code, customer_id: customerId || null, customer_name: custName, items: cleanItems, subtotal: sub, discount: nn(discount), total: tot, status, channel: channel.trim(), tracking_no: trackingNo.trim(), carrier: carrier.trim(), note: note.trim(), status_log: data?.statusLog || [{ status, at: new Date().toISOString(), by: '' }] };
      // จองสต็อก "ก่อน" เซฟออเดอร์ (reserve-then-commit) — ถ้าจองพลาด ออเดอร์จะไม่ถูกเซฟ
      // กันเคส "ออเดอร์เซฟแล้วแต่จองไม่สำเร็จ" → ATP เกินจริง/ขายซ้ำ
      if (data?.id) await releaseOrderReservations(data.id); // แก้ออเดอร์: ปล่อยจองเดิมก่อน
      const willReserve = status !== 'shipped' && status !== 'cancelled';
      if (willReserve) await applyOrderReservations({ ...order, customerName: custName });
      const { error } = await supabase.from('tmk_orders').upsert(order);
      if (error) {
        // rollback การจอง — กันจองค้างโดยไม่มีออเดอร์ (แก้ออเดอร์: คืนจองเดิมของออเดอร์นั้น)
        try {
          if (willReserve) await releaseOrderReservations(oid);
          if (data?.id) await applyOrderReservations({ ...data, id: oid });
        } catch { /* best-effort rollback */ }
        throw error;
      }
      logAudit({ action: 'order', entityType: 'order', entityName: code, summary: `${data ? 'แก้ไข' : 'สร้าง'}ออเดอร์ ${code} (${custName}) ${totalQty} ตัว`, fields: [{ label: 'ลูกค้า', value: custName }, { label: 'ยอดรวม', value: B(tot) }, { label: 'สถานะ', value: orderStatusMeta(status).label }] });
      window.__refresh?.(['tmk_orders', 'tmk_customers', 'tmk_products']);
      toast(`${data ? 'แก้ไข' : 'สร้าง'}ออเดอร์สำเร็จ`, 'success');
      onClose();
    } catch (err) {
      if (/tmk_orders|tmk_customers|column|schema cache|PGRST/i.test(err.message || '')) toast('ต้องรัน SQL migration (orders, customers) ก่อน', 'error');
      else toast('บันทึกออเดอร์ไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const isShipped = data?.status === 'shipped';
  const footer = (<>{data?.id && !isShipped && <Button variant="outline" style={{ color: 'var(--bad)', marginRight: 'auto' }} disabled={busy} onClick={async () => { if (await window.__confirm?.({ title: 'ยกเลิกออเดอร์', body: 'ยกเลิกออเดอร์นี้? (จะปล่อยจองสต็อกคืน)', danger: true, confirmText: 'ยกเลิก' })) { await advanceOrderStatus(data, 'cancelled'); onClose(); } }}><Icon name="x" /> ยกเลิกออเดอร์</Button>}<Button variant="outline" onClick={() => guardClose(touched, onClose)}>ปิด</Button>{!isShipped && <Button disabled={busy || !total && !totalQty} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : (data ? 'บันทึก' : 'สร้างออเดอร์')}</Button>}</>);

  return (
    <Modal wide icon="listChecks" title={data ? `ออเดอร์ ${data.code}` : 'สร้างออเดอร์'} sub={data ? orderStatusMeta(data.status).label : 'เลือกลูกค้า + สินค้า → จองสต็อกอัตโนมัติ'} onClose={onClose} footer={footer} confirmOnClose={touched}>
      {products.length === 0
        ? <div className="cap" style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }}>ยังไม่มีสินค้าที่มีล็อต — เพิ่มสินค้า+ล็อตก่อน</div>
        : (<>
          {/* ลูกค้า */}
          <div className="field"><label>ลูกค้า</label>
            {custNew ? (
              <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: 10 }}>
                <div className="field-row" style={{ marginBottom: 8 }}>
                  <div className="field" style={{ margin: 0 }}><label>ชื่อลูกค้า</label><Input value={custNew.name} onChange={e => _t(setCustNew)({ ...custNew, name: e.target.value })} placeholder="ชื่อ-นามสกุล / ชื่อร้าน" /></div>
                  <div className="field" style={{ margin: 0 }}><label>เบอร์โทร</label><Input value={custNew.phone} onChange={e => _t(setCustNew)({ ...custNew, phone: e.target.value })} placeholder="08x-xxx-xxxx" /></div>
                </div>
                <div className="field-row" style={{ marginBottom: 0 }}>
                  <div className="field" style={{ margin: 0 }}><label>LINE</label><Input value={custNew.line} onChange={e => _t(setCustNew)({ ...custNew, line: e.target.value })} placeholder="LINE ID" /></div>
                  <div className="field" style={{ margin: 0 }}><label>ที่อยู่จัดส่ง</label><Input value={custNew.address} onChange={e => _t(setCustNew)({ ...custNew, address: e.target.value })} placeholder="ที่อยู่" /></div>
                </div>
                {customers.length > 0 && <Button variant="ghost" size="sm" type="button" style={{ marginTop: 8 }} onClick={() => { setCustNew(null); setCustId(''); }}>← เลือกจากลูกค้าเดิม</Button>}
              </div>
            ) : (
              <div className="row" style={{ gap: 8 }}>
                <Select value={custId || undefined} onValueChange={v => _t(setCustId)(v)}>
                  <SelectTrigger style={{ flex: 1 }}><SelectValue placeholder="— เลือกลูกค้า —" /></SelectTrigger>
                  <SelectContent>
                    {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" type="button" onClick={() => { setCustNew({ name: '', phone: '', line: '', address: '' }); }}><Icon name="userPlus" /> ลูกค้าใหม่</Button>
              </div>
            )}
          </div>

          {/* รายการสินค้า */}
          <div className="row between" style={{ marginBottom: 8 }}>
            <label style={{ margin: 0 }}>รายการสินค้า</label>
            <Button variant="ghost" size="sm" type="button" onClick={addItem}><Icon name="plus" /> เพิ่มสินค้า</Button>
          </div>
          {items.map((it, i) => {
            const p = prodById(it.productId);
            const colors = p ? Object.keys(p.variants || {}) : [];
            const sizes = (p && it.color) ? Object.keys(p.variants[it.color] || {}) : [];
            const avail = (p && it.color && it.size) ? (Number(p.variants[it.color]?.[it.size]) || 0) - Math.max(0, (Number(p.reservedByVariant?.[it.color]?.[it.size]) || 0) - ownRes(p.id, it.color, it.size)) : null;
            return (
              <div key={it.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: 10, marginBottom: 8, background: 'var(--surface)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 8 }}>
                  <Select value={it.productId || undefined} onValueChange={v => { const np = prodById(v); setItem(i, { productId: v, color: '', size: '', price: np?.price || '' }); }}>
                    <SelectTrigger><SelectValue placeholder="— เลือกสินค้า —" /></SelectTrigger>
                    <SelectContent>
                      {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" type="button" onClick={() => removeItem(i)} style={{ color: 'var(--bad)' }}><Icon name="x" /></Button>
                </div>
                <div className="order-item-grid">
                  <Select value={it.color || undefined} disabled={!it.productId} onValueChange={v => setItem(i, { color: v, size: '' })}><SelectTrigger><SelectValue placeholder="สี" /></SelectTrigger><SelectContent>{colors.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
                  <Select value={it.size || undefined} disabled={!it.color} onValueChange={v => setItem(i, { size: v })}><SelectTrigger><SelectValue placeholder="ไซส์" /></SelectTrigger><SelectContent>{sizes.map(s => <SelectItem key={s} value={s}>{s} (ว่าง {Math.max(0, (Number(p.variants[it.color]?.[s]) || 0) - Math.max(0, (Number(p.reservedByVariant?.[it.color]?.[s]) || 0) - ownRes(p.id, it.color, s)))})</SelectItem>)}</SelectContent></Select>
                  <Input type="number" min="0" inputMode="decimal" className="num" value={it.qty} disabled={!it.size} onChange={e => setItem(i, { qty: e.target.value })} placeholder="จำนวน" />
                  <Input type="number" min="0" inputMode="decimal" className="num" value={it.price} onChange={e => setItem(i, { price: e.target.value })} placeholder="ราคา/ตัว" />
                </div>
                {avail != null && Number(it.qty) > avail && <div className="cap" style={{ color: 'var(--warn)', marginTop: 6 }}>พร้อมขายเหลือ {avail} (เกินจะกลายเป็นค้างส่ง)</div>}
              </div>
            );
          })}

          <div className="field-row" style={{ marginTop: 4 }}>
            <div className="field" style={{ marginBottom: 0 }}><label>ส่วนลด (฿)</label><Input type="number" min="0" inputMode="decimal" className="num" value={discount} onChange={e => _t(setDiscount)(e.target.value)} placeholder="0" /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>ช่องทาง</label>
              <Input list="order-channel-list" value={channel} onChange={e => _t(setChannel)(e.target.value)} placeholder="เช่น LINE / Shopee / หน้าร้าน" />
              <datalist id="order-channel-list">{(MD.channels || []).map(c => <option key={c.id} value={c.name} />)}</datalist>
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ marginBottom: 0 }}><label>เลขแทร็กกิ้ง</label><Input value={trackingNo} onChange={e => _t(setTrackingNo)(e.target.value)} placeholder="(ใส่ตอนส่ง)" /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>ขนส่ง</label><Input value={carrier} onChange={e => _t(setCarrier)(e.target.value)} placeholder="เช่น Flash / Kerry / J&T" /></div>
          </div>
          <div className="field" style={{ marginTop: 8, marginBottom: 0 }}><label>โน้ต</label><Input value={note} onChange={e => _t(setNote)(e.target.value)} placeholder="เช่น พิมพ์ลายพิเศษ / นัดรับ" /></div>

          <div className="row between" style={{ marginTop: 14, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)' }}>
            <span className="cap">{N(totalQty)} ตัว · ส่วนลด {B(Number(discount) || 0)}</span>
            <span>ยอดรวม <b style={{ fontSize: 17, color: 'var(--accent-2)' }}>{B(total)}</b></span>
          </div>
        </>)}
    </Modal>
  );
}

/* ---------- Monthly Target modal ---------- */


