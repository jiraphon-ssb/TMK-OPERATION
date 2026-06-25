/* ============================================================
   saleRecon.js — อ่านไฟล์รายงานเซลล์ (per-salesperson Excel) + กระทบยอดกับระบบ
   ใช้ตรวจ "ข้อมูลเพี้ยน/ไม่ตรง" ระหว่างที่เซลล์กรอก กับ tmk_mp_orders (จับคู่ด้วย order_no)
   pure · เทสได้ · ไม่เขียน DB
   ============================================================ */

import { qtyBand } from './mpReport.js';

const num = (v) => parseFloat(String(v ?? '').replace(/,/g, '')) || 0;
const clean = (v) => String(v ?? '').trim();
const pad = (n) => String(n).padStart(2, '0');
// เซลล์กรอก "ใหม่/เก่า" แต่มาร์เก็ตเพลสใช้ "ลูกค้าใหม่/ลูกค้าเก่า" → รวมให้เป็นค่าเดียว (กราฟลูกค้าใหม่/เก่าจะนับยอดเซลล์ด้วย)
const normCustType = (v) => { const s = String(v ?? '').trim(); if (s === 'ใหม่' || s === 'ลูกค้าใหม่') return 'ลูกค้าใหม่'; if (s === 'เก่า' || s === 'ลูกค้าเก่า') return 'ลูกค้าเก่า'; return s; };

// แปลง tmk_sale_entries → รูป order/sku (source='เซลล์') ป้อนแดชบอร์ด
export function entriesToOrders(entries) {
  const orders = [], skus = [];
  (entries || []).forEach(e => {
    const order_no = clean(e.order_no) || ('se:' + e.id);
    const date = clean(e.order_date); const q = num(e.qty); const s = num(e.sales);
    orders.push({
      order_no, source: 'เซลล์', channel: e.channel || 'เซลล์', salesperson: e.salesperson || '', marketplace_id: '',
      order_date: date, order_month: date.slice(0, 7), province: '', payment_type: e.payment_type || '', customer_type: normCustType(e.customer_type),
      customer_code: clean(e.customer_contact) || clean(e.customer_name) || '', customer_name: clean(e.customer_name) || '',
      qty_band: qtyBand(q), qty: q, sales: s, cost: 0, profit: 0, mkt_commission: 0, mkt_net_income: 0, cod_amount: e.payment_type === 'COD' ? s : 0,
      job_type: e.job_type || '', status: 'active', attrs: { from: 'sale_entry' },
    });
    if (clean(e.design)) skus.push({ order_no, source: 'เซลล์', channel: e.channel || 'เซลล์', product_code: '', design: clean(e.design), color: clean(e.color), size: clean(e.size), qty: q, line_sales: s, raw_sku_or_name: '', match_how: 'manual', order_month: date.slice(0, 7), attrs: {} });
  });
  return { orders, skus };
}

// วันที่ในไฟล์มีทั้ง YYYY-MM-DD และ DD/MM/YYYY (ไทย) → normalize เป็น YYYY-MM-DD
export function normSaleDate(v) {
  const s = clean(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  // เผื่อ Excel serial (ตัวเลขวันที่)
  if (/^\d{5}$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000); return d.toISOString().slice(0, 10); }
  return s.slice(0, 10);
}

// ---- ชีต Database-sale → ออเดอร์ระดับแถว ----
export function parseSalespersonOrders(grid, salesperson = '') {
  if (!grid || grid.length < 2) return [];
  const H = (grid[0] || []).map(x => clean(x));
  const idx = (...names) => { for (const n of names) { const i = H.indexOf(n); if (i >= 0) return i; } return -1; };
  const c = {
    date: idx('วันที่'), job: idx('ประเภทงาน'), pay: idx('ประเภทการชำระ'), cust: idx('ลูกค้า'),
    amt: idx('จำนวนเงิน', 'ยอด', 'ยอดขาย'), qty: idx('จำนวนตัว', 'จำนวน'), ord: idx('เลขออเดอร์', 'เลขที่ออเดอร์'), note: idx('หมายเหตุ'),
  };
  const rows = [];
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] || []; const order_no = clean(row[c.ord]); if (!order_no) continue;
    rows.push({
      order_no, order_date: normSaleDate(row[c.date]),
      job_type: clean(row[c.job]), payment_type: clean(row[c.pay]), customer_type: clean(row[c.cust]),
      sales: num(row[c.amt]), qty: num(row[c.qty]), note: clean(row[c.note]), salesperson,
    });
  }
  return rows;
}

// ---- ชีต Sale Report → funnel รายวัน (คนทัก/ปิดการขาย) ----
export function parseSalespersonFunnel(grid, salesperson = '') {
  if (!grid || grid.length < 2) return [];
  const H = (grid[0] || []).map(x => clean(x).replace(/\s+/g, ' '));
  const find = (kw) => H.findIndex(h => kw.every(k => h.includes(k)));
  const c = {
    date: find(['วันที่']), sales: find(['ยอดขายรายวัน']) , orders: find(['จำนวนออเดอร์']), qty: find(['จำนวนตัว']),
    fbNew: find(['คนทัก', 'FB', 'ใหม่']), fbOld: find(['คนทัก', 'FB', 'เก่า']),
    lineNew: find(['คนทัก', 'Line', 'ใหม่']), lineOld: find(['คนทัก', 'Line', 'เก่า']),
    totalTalk: find(['รวมคนทักทั้งหมด']), close: find(['ปิดการขาย']), basket: find(['Basket']),
  };
  const rows = [];
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] || []; const date = normSaleDate(row[c.date]); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const closeRaw = clean(row[c.close]).replace('%', '');
    rows.push({
      date, salesperson,
      sales: num(row[c.sales]), orders: num(row[c.orders]), qty: num(row[c.qty]),
      leads_fb_new: num(row[c.fbNew]), leads_fb_old: num(row[c.fbOld]),
      leads_line_new: num(row[c.lineNew]), leads_line_old: num(row[c.lineOld]),
      leads_total: num(row[c.totalTalk]),
      close_rate: num(closeRaw) / (closeRaw.includes('.') || Number(closeRaw) <= 1 ? 1 : 1), // เก็บเป็น %
      basket_size: num(row[c.basket]),
    });
  }
  return rows;
}

// ---- กระทบยอด: เซลล์ vs ระบบ (จับคู่ order_no) ----
export function reconcile(saleRows, dbOrders, opt = {}) {
  const tol = opt.tol != null ? opt.tol : 1; // ผ่อนผันเศษสตางค์
  const dbByNo = new Map((dbOrders || []).map(o => [o.order_no, o]));
  const matched = [], diff = [], onlySale = [];
  for (const s of (saleRows || [])) {
    const u = dbByNo.get(s.order_no);
    if (!u) { onlySale.push(s); continue; }
    const dS = Math.round((s.sales - (Number(u.sales) || 0)) * 100) / 100;
    const dQ = s.qty - (Number(u.qty) || 0);
    if (Math.abs(dS) >= tol || dQ !== 0) diff.push({ ...s, db_sales: Math.round(Number(u.sales) || 0), db_qty: Number(u.qty) || 0, d_sales: dS, d_qty: dQ, channel: u.channel, db_status: u.status });
    else matched.push({ ...s, channel: u.channel });
  }
  const saleNos = new Set((saleRows || []).map(s => s.order_no));
  // ออเดอร์ที่ระบบมี (ของเซลล์คนนี้) แต่ไฟล์ไม่มี — เฉพาะเมื่อระบุ salesperson + ช่วงเวลา
  const onlyDb = opt.salesperson
    ? (dbOrders || []).filter(o => o.salesperson === opt.salesperson && !saleNos.has(o.order_no) && (!opt.from || o.order_date >= opt.from))
    : [];
  const sum = (arr, k) => arr.reduce((a, x) => a + (Number(x[k]) || 0), 0);
  return {
    matched, diff, onlySale, onlyDb,
    summary: {
      sale: (saleRows || []).length, matched: matched.length, diff: diff.length, onlySale: onlySale.length, onlyDb: onlyDb.length,
      saleSales: Math.round(sum(saleRows || [], 'sales')),
      onlySaleSales: Math.round(sum(onlySale, 'sales')),  // ยอดที่ระบบขาด
      diffSalesAbs: Math.round(diff.reduce((a, x) => a + Math.abs(x.d_sales), 0)),
    },
  };
}
