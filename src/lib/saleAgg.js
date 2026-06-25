/* ============================================================
   saleAgg.js — เครื่องคำนวณรวมของแดชบอร์ด Sale (pure, เทสได้)
   - orders (tmk_mp_orders) = grain ออเดอร์ → KPI หลัก + มิติช่อง/จังหวัด/เซลล์/ชำระ/ลูกค้า
   - skus (tmk_mp_skus) = grain บรรทัด → มิติลาย/สี/ไซซ์/type (qty แม่นสุด)
   filter f: { from,to, channel[],payment_type[],customer_type[],qty_band[],salesperson[],
               province[],source[],job_type[],  design[],product_code[],size[],color[],type[] }
   ============================================================ */
import { bucketKey, inRange, diffDays } from './saleTime.js';
import { codeType } from './catalogMeta.js';

const num = (v) => Number(v) || 0;
const has = (arr) => arr && arr.length > 0;
const inSet = (arr, v) => !has(arr) || arr.includes(v);

// ---- ผ่านฟิลเตอร์ระดับออเดอร์ (เวลา + มิติออเดอร์) ----
export function orderPass(o, f) {
  if (!f) return o.status !== 'cancelled';
  if (o.status === 'cancelled' && !f.includeCancelled) return false;
  if (!inRange(o.order_date, f.from, f.to)) return false;
  return inSet(f.channel, o.channel) && inSet(f.payment_type, o.payment_type) && inSet(f.customer_type, o.customer_type)
    && inSet(f.qty_band, o.qty_band) && inSet(f.salesperson, o.salesperson) && inSet(f.province, o.province)
    && inSet(f.source, o.source) && inSet(f.job_type, o.job_type);
}
// ---- ผ่านฟิลเตอร์ระดับ SKU (มิติ variant) ----
export function skuPass(s, f) {
  if (!f) return true;
  return inSet(f.design, s.design) && inSet(f.product_code, s.product_code) && inSet(f.size, s.size)
    && inSet(f.color, s.color) && inSet(f.type, codeType(s.product_code));
}

// ---- group → metrics (sort ยอดมากก่อน) ----
function groupBy(rows, keyFn, init) {
  const m = new Map();
  for (const r of rows) { const k = keyFn(r); if (k == null || k === '') continue; let g = m.get(k); if (!g) { g = { key: k, sales: 0, orders: 0, qty: 0, profit: 0, _ord: init ? new Set() : null }; m.set(k, g); } init && init(g, r); }
  return m;
}

// ---- คำนวณทุกอย่างของช่วงหนึ่ง ----
export function compute(orders, skus, f) {
  const ords = orders.filter(o => orderPass(o, f));
  const idSet = new Set(ords.map(o => o.order_no));
  const sk = skus.filter(s => idSet.has(s.order_no) && skuPass(s, f));

  // ---- KPI หลัก ----
  const sum = (a, k) => a.reduce((x, r) => x + num(r[k]), 0);
  const sales = sum(ords, 'sales'), qty = sum(ords, 'qty'), profit = sum(ords, 'profit'), cost = sum(ords, 'cost');
  const commission = sum(ords, 'mkt_commission');
  const newC = ords.filter(o => o.customer_type === 'ลูกค้าใหม่').length;
  const oldC = ords.filter(o => o.customer_type === 'ลูกค้าเก่า').length;
  const codO = ords.filter(o => num(o.cod_amount) > 0 || o.payment_type === 'COD').length;
  const mpO = ords.filter(o => ['Shopee', 'Lazada', 'TikTok'].includes(o.channel));
  const mpSales = sum(mpO, 'sales');
  const big = ords.filter(o => ['11-50 ตัว', '51+ ตัว', '11-50', '51+'].includes(o.qty_band) || num(o.qty) >= 11).length;
  const hasCostCh = new Set(ords.filter(o => num(o.cost) > 0).map(o => o.channel));
  // มาร์จิ้นที่เชื่อได้ = คิดเฉพาะออเดอร์ที่มีต้นทุนจริง (กันเฟ้อจากช่องที่ cost=0 แล้วกำไร=ยอดเต็ม)
  const costOrds = ords.filter(o => num(o.cost) > 0);
  const costSales = sum(costOrds, 'sales'), costProfit = sum(costOrds, 'profit');

  const kpi = {
    sales, orders: ords.length, qty, profit, cost, commission,
    aov: ords.length ? sales / ords.length : 0,
    ppu: qty ? sales / qty : 0,
    margin: sales ? profit / sales : 0,
    marginReal: costSales ? costProfit / costSales : 0, costSales, costOrders: costOrds.length,
    commPct: sales ? commission / sales : 0,
    newC, oldC, newPct: ords.length ? newC / ords.length : 0,
    codO, codPct: ords.length ? codO / ords.length : 0,
    mpSales, mpPct: sales ? mpSales / sales : 0,
    big, bigPct: ords.length ? big / ords.length : 0,
    skuLines: sk.length, skuQty: sum(sk, 'qty'),
    nChannels: new Set(ords.map(o => o.channel)).size,
    nDesigns: new Set(sk.map(s => s.design).filter(Boolean)).size,
    nProvinces: new Set(ords.map(o => o.province).filter(Boolean)).size,
    nCustomers: new Set(ords.map(o => o.customer_code).filter(Boolean)).size,
    cancelled: orders.filter(o => o.status === 'cancelled' && inRange(o.order_date, f?.from, f?.to)).length,
    hasCostCh,
  };

  // ---- มิติระดับออเดอร์ ----
  const ordDim = (keyFn) => {
    const m = groupBy(ords, keyFn);
    for (const o of ords) { const k = keyFn(o); if (k == null || k === '') continue; const g = m.get(k); g.sales += num(o.sales); g.orders += 1; g.qty += num(o.qty); g.profit += num(o.profit); }
    return finalize(m, sales);
  };
  // ---- มิติระดับ SKU (variant) ----
  const skuDim = (keyFn) => {
    const m = new Map();
    for (const s of sk) { const k = keyFn(s); if (k == null || k === '') continue; let g = m.get(k); if (!g) { g = { key: k, sales: 0, orders: new Set(), qty: 0, profit: 0 }; m.set(k, g); } g.sales += num(s.line_sales); g.qty += num(s.qty); g.orders.add(s.order_no); }
    const arr = [...m.values()].map(g => ({ key: g.key, sales: g.sales, qty: g.qty, orders: g.orders.size, profit: 0 }));
    const tot = arr.reduce((a, x) => a + x.qty, 0);
    arr.forEach(x => x.share = tot ? x.qty / tot : 0);
    return arr.sort((a, b) => b.qty - a.qty);
  };

  return {
    kpi, _ords: ords, _skus: sk,
    byChannel: ordDim(o => o.channel),
    byProvince: ordDim(o => o.province),
    bySalesperson: ordDim(o => o.salesperson),
    byPayment: ordDim(o => o.payment_type),
    byJobType: ordDim(o => o.job_type),
    byCustomerType: ordDim(o => o.customer_type),
    byQtyBand: ordDim(o => o.qty_band),
    byDesign: skuDim(s => s.design),
    byColor: skuDim(s => normColor(s.color)),
    bySize: skuDim(s => normSize(s.size)),
    byType: skuDim(s => codeType(s.product_code) || 'ไม่ระบุ'),
  };
}
function finalize(m, total) {
  const arr = [...m.values()].map(g => ({ key: g.key, sales: g.sales, orders: g.orders, qty: g.qty, profit: g.profit, aov: g.orders ? g.sales / g.orders : 0, share: total ? g.sales / total : 0 }));
  return arr.sort((a, b) => b.sales - a.sales);
}

// ---- time series (แท่ง/เส้นตามเวลา) ----
export function series(orders, f, gran, dateField = 'order_date') {
  const ords = orders.filter(o => orderPass(o, f));
  const m = new Map();
  for (const o of ords) { const k = bucketKey(o[dateField], gran); if (!k) continue; let g = m.get(k); if (!g) { g = { key: k, sales: 0, orders: 0, qty: 0, profit: 0 }; m.set(k, g); } g.sales += num(o.sales); g.orders += 1; g.qty += num(o.qty); g.profit += num(o.profit); }
  return m;
}

// ---- %Δ เทียบช่วงก่อน ----
export const pctDelta = (cur, prev) => (prev > 0 ? (cur - prev) / prev : (cur > 0 ? 1 : 0));
export function deltaKpi(cur, prev) {
  const out = {};
  for (const k of Object.keys(cur)) if (typeof cur[k] === 'number') out[k] = { cur: cur[k], prev: prev ? prev[k] : 0, d: pctDelta(cur[k], prev ? prev[k] : 0) };
  return out;
}

// ---- รวมยอดต่อลูกค้า (จาก orders ที่กรองแล้ว) ----
export function customerAgg(ords) {
  const m = {};
  (ords || []).forEach(o => { const c = o.customer_code; if (!c) return; const g = m[c] || (m[c] = { code: c, name: o.customer_name || c, sales: 0, orders: 0, qty: 0, last: '', first: '', channels: new Set() }); g.sales += num(o.sales); g.orders += 1; g.qty += num(o.qty); if (o.channel) g.channels.add(o.channel); if (!g.first || o.order_date < g.first) g.first = o.order_date; if (o.order_date > g.last) g.last = o.order_date; });
  return Object.values(m).map(g => ({ ...g, channels: g.channels.size, aov: g.orders ? g.sales / g.orders : 0 }));
}

// ---- จัด TIER อัตโนมัติ (RFM) — เพชร/ทอง/เงิน/ทองแดง ตามยอดซื้อ + ป้าย ใหม่/เสี่ยงหลุด ----
export const RFM_TIERS = [
  { key: 'เพชร', color: '#7c5cff', icon: 'star', desc: 'ยอดสูงสุด · ดูแลพิเศษ' },
  { key: 'ทอง', color: '#e39b2e', icon: 'star', desc: 'ลูกค้าคนสำคัญ' },
  { key: 'เงิน', color: '#3aa0c9', icon: 'user', desc: 'ซื้อสม่ำเสมอ' },
  { key: 'ทองแดง', color: '#8a909c', icon: 'user', desc: 'ทั่วไป' },
];
export function rfmTiers(custs, asOf) {
  const list = custs || [];
  if (!list.length) return { rows: [], summary: RFM_TIERS.map(t => ({ ...t, count: 0, sales: 0, avg: 0, share: 0, sharePct: 0 })) };
  const spends = list.map(c => c.sales).sort((a, b) => a - b);
  const q = (p) => spends[Math.min(spends.length - 1, Math.floor(spends.length * p))];
  const p90 = q(0.9), p70 = q(0.7), p40 = q(0.4);
  const total = spends.reduce((a, b) => a + b, 0);
  const rows = list.map(c => {
    const recency = (asOf && c.last) ? diffDays(c.last, asOf) : null;
    const tier = c.sales >= p90 ? 'เพชร' : c.sales >= p70 ? 'ทอง' : c.sales >= p40 ? 'เงิน' : 'ทองแดง';
    let flag = '';
    if (c.orders === 1 && recency != null && recency <= 21) flag = 'ใหม่';
    else if (recency != null && recency >= 35 && c.orders >= 2) flag = 'เสี่ยงหลุด';
    else if (c.orders >= 3) flag = 'ขาประจำ';
    return { ...c, recency, tier, flag };
  }).sort((a, b) => b.sales - a.sales);
  const summary = RFM_TIERS.map(t => { const g = rows.filter(r => r.tier === t.key); const sales = g.reduce((a, r) => a + r.sales, 0); return { ...t, count: g.length, sales, avg: g.length ? sales / g.length : 0, share: list.length ? g.length / list.length : 0, sharePct: total ? sales / total : 0 }; });
  return { rows, summary };
}

// ---- Pareto (เรียง + สะสม %) ----
export function pareto(items, valKey = 'sales') {
  const total = items.reduce((a, x) => a + x[valKey], 0);
  let cum = 0;
  return items.map(x => { cum += x[valKey]; return { ...x, cum, cumPct: total ? cum / total : 0 }; });
}

// ---- ดาวรุ่ง/ดาวร่วง (เทียบ 2 ช่วง) ----
export function movers(curArr, prevArr, valKey = 'sales') {
  const pm = new Map(prevArr.map(x => [x.key, x[valKey]]));
  return curArr.map(x => { const p = pm.get(x.key) || 0; return { key: x.key, cur: x[valKey], prev: p, d: pctDelta(x[valKey], p), abs: x[valKey] - p }; })
    .sort((a, b) => b.d - a.d);
}

// ---- normalize ไซซ์/สี (ข้อมูลดิบมีขยะ) ----
export const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL'];
export function normSize(s) {
  const t = String(s || '').toUpperCase().replace(/\(.*$/, '').replace(/ไซส์|ไซซ์/g, '').trim();
  const m = SIZE_ORDER.find(x => t === x || t === x.replace('X', 'X')); return m || (t || 'ไม่ระบุ');
}
export function normColor(c) { return String(c || '').replace(/\(ตราอปท\.?\)/g, '').trim() || 'ไม่ระบุ'; }
export const sizeRank = (s) => { const i = SIZE_ORDER.indexOf(normSize(s)); return i < 0 ? 99 : i; };
