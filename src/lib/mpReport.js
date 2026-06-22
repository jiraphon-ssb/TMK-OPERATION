/* ============================================================================
   mpReport.js — รวมยอดขายข้ามช่องทาง (marketplace multi-channel report)
   พอร์ตจาก pipeline.py (Juntakarn handoff spec) — pure functions ล้วน
   รับ "grid" (array-of-arrays จาก CSV/Excel) → คืน array ของ object
   ไม่มี IO / ไม่มี DB / ไม่มี React  → ทดสอบแยกได้ + ใช้ในเบราว์เซอร์ได้

   สถาปัตยกรรม (ตาม README):
   - Shipnity = SPINE ระดับออเดอร์ (มีทุกช่องในระบบเดียว)
   - Shopee  = ใช้เฉพาะระดับ SKU (Parent SKU สะอาด) — ไม่นับเป็นออเดอร์ (อยู่ใน Shipnity แล้ว)
   - TikTok  = นับเป็นออเดอร์ใหม่ (คนละระบบ)
   - ตัดออเดอร์ยกเลิกทิ้ง · รวมหลาย LOT เป็นลายเดียว (design_key)
============================================================================ */

export const MP_SIZES = new Set(['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL']);

// ---- ตัวเลข: ตัดคอมมา/ค่าที่ถือว่าว่าง ----
export function mpNum(x) {
  const s = String(x ?? '').replace(/,/g, '').trim();
  if (s === '' || s === '-' || s === 'None' || s === 'nan' || s === 'NaN') return 0;
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

// ---- ช่วงจำนวน (proxy ปลีก/ส่ง) ----
export function qtyBand(q) {
  q = Math.round(Number(q) || 0);
  if (q <= 1) return '1 ตัว';
  if (q <= 3) return '2-3';
  if (q <= 10) return '4-10';
  if (q <= 50) return '11-50';
  return '51+';
}

// ---- เดือน YYYY-MM จากวันที่ dd/mm/yyyy (Shipnity/TikTok ใช้รูปนี้) ----
export function ymOf(d) {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(d || ''));
  return m ? `${m[3]}-${String(m[2]).padStart(2, '0')}` : '';
}
// วันที่ระดับวัน ISO yyyy-mm-dd (จาก dd/mm/yyyy) — day-grain ปลดล็อก cohort/forecast/pacing
export function isoDate(d) {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(d || ''));
  return m ? `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}` : null;
}

// ---- ช่องทาง 7 ค่า (ตาม norm_channel ใน pipeline.py) ----
export function normChannel(marketplace, contact, userCreated = '', province = '') {
  const mp = String(marketplace).toLowerCase().trim();
  if (mp === 'shopee') return 'Shopee';
  if (mp === 'lazada') return 'Lazada';
  const c = String(contact).toLowerCase().trim();
  if (c.includes('shopee')) return 'Shopee';
  if (c.includes('lazada')) return 'Lazada';
  if (c.includes('face')) return 'Facebook';
  if (c.includes('line')) return 'LINE';
  if (c.includes('phone')) return 'Phone';
  if (c.includes('pos')) return 'POS';
  const u = String(userCreated).trim();
  if (c === '' && u !== '' && u !== '-') {
    const p = String(province).trim();
    if (p === '' || p.toLowerCase() === 'unknown') return 'POS';
    return 'Direct';
  }
  return 'Direct';
}

// ---- ประเภทการชำระ ----
export function payShipnity(bank) {
  const b = String(bank).trim().toLowerCase();
  if (b === 'shopee' || b === 'lazada') return 'มาร์เก็ตเพลส';
  if (b.includes('จ่ายทีหลัง') || b.includes('cod')) return 'COD';
  if (b === '' || b === '-') return 'ไม่ระบุ';
  return 'โอน';
}
export function payTiktok(method) {
  return String(method).includes('ปลายทาง') ? 'COD' : 'จ่ายล่วงหน้า';
}

// ---- header → index (จับชื่อคอลัมน์แบบยืดหยุ่น) ----
function indexer(grid) {
  const H = (grid?.[0] || []).map(x => String(x ?? '').trim());
  const L = H.map(h => h.toLowerCase());
  const get = (...names) => {
    for (const n of names) { const i = H.indexOf(n); if (i >= 0) return i; }
    for (const n of names) { const i = L.indexOf(String(n).toLowerCase()); if (i >= 0) return i; }
    return -1;
  };
  return { H, get };
}

/* ---- ตรวจชนิดไฟล์จากหัวคอลัมน์ (ให้ผู้ใช้ไม่ต้องบอกว่าไฟล์ไหนคืออะไร) ---- */
export function detectFileKind(grid) {
  const H = (grid?.[0] || []).map(x => String(x ?? '').trim().toLowerCase());
  const has = (...n) => n.some(x => H.includes(x.toLowerCase()));
  if (has('เลขที่ออเดอร์') && has('marketplace ของออเดอร์', 'รายการขาย')) return 'shipnity';
  if (has('หมายเลขคำสั่งซื้อ') && has('เลขอ้างอิง parent sku', 'ชื่อตัวเลือก')) return 'shopee';
  if (has('order id') && has('product name', 'variation')) return 'tiktok';
  if (has('product_code', 'design_key') || (has('product_name') && has('design_key', 'design'))) return 'catalog';
  return 'unknown';
}

/* ---- ตัวจับคู่ catalog ---- */
export function buildMatchers(catalogGrid) {
  const { get } = indexer(catalogGrid);
  const ci = { code: get('product_code', 'sku', 'รหัสสินค้า', 'รหัส'), name: get('product_name', 'name', 'ชื่อสินค้า', 'ชื่อ'), design: get('design_key', 'design', 'ลาย') };
  const code2 = {}, name2 = {}, kwseen = new Set(), kw = [];
  for (let r = 1; r < (catalogGrid?.length || 0); r++) {
    const row = catalogGrid[r] || [];
    const code = String(row[ci.code] ?? '').trim();
    const name = String(row[ci.name] ?? '').trim();
    const dk = String(row[ci.design] ?? '').trim();
    if (!code && !name) continue;
    if (code) code2[code.toUpperCase()] = { code, design: dk };
    if (name) name2[name] = { code, design: dk };
    for (const tok of [dk, name]) {
      const t = String(tok).trim();
      if (t && t.length >= 3) { const key = t + '||' + code; if (!kwseen.has(key)) { kwseen.add(key); kw.push([t, code, dk]); } }
    }
  }
  kw.sort((a, b) => b[0].length - a[0].length); // ยาวสุดก่อน
  return { code2, name2, kw };
}
function kwmatch(kw, text) {
  const t = String(text);
  for (const [k, code, dk] of kw) { if (t.includes(k)) return { code, design: dk }; }
  return { code: '', design: '' };
}

// ---- แยก สี/ไซซ์ ----
export function splitParenVar(varTxt) {
  let t = String(varTxt || '').trim().replace(/^\(/, '').replace(/\)$/, '').trim();
  if (!t) return { color: '', size: '' };
  const p = t.split('-');
  const last = p[p.length - 1].trim();
  if (MP_SIZES.has(last)) return { color: p.slice(0, -1).join('-').trim(), size: last };
  return { color: t, size: '' };
}
export function splitShopeeVar(v) {
  v = String(v || '');
  if (v.includes(',')) {
    const i = v.lastIndexOf(',');
    const color = v.slice(0, i).trim();
    const rest = v.slice(i + 1).trim();
    const size = rest ? rest.split(/\s+/)[0] : '';
    return { color, size };
  }
  return { color: v.trim(), size: '' };
}

/* ============================ STEP 1: MASTER (order-level) ============================ */
export function buildMaster({ shipnity, tiktok } = {}) {
  const rows = [];
  if (shipnity && shipnity.length > 1) {
    const { get } = indexer(shipnity);
    const c = {
      order: get('เลขที่ออเดอร์'), date: get('วันที่สร้าง'), mid: get('ID บน Marketplace'),
      mkt: get('Marketplace ของออเดอร์'), contact: get('ช่องทางที่ลูกค้าทักมา'), user: get('User ที่สร้าง'),
      cancel: get('ยกเลิกออเดอร์แล้ว'), qty: get('จำนวนสั่งซื้อรวม'), sales: get('ยอดขาย'), cost: get('ต้นทุนรวม'),
      comm: get('ค่าคอมมิชชั่นของ Marketplace'), net: get('รายรับจากคำสั่งซื้อ Shopee'), profit: get('กำไรสุทธิ'),
      cod: get('ยอด COD'), bank: get('ธนาคารที่รับเงิน'), prov: get('ชื่อจังหวัด (จังหวัด)'),
      custDate: get('วันที่สร้าง (ลูกค้า)'), custCum: get('จำนวนออเดอร์สะสม (ลูกค้า)'),
      custCode: get('รหัสลูกค้า (ลูกค้า)'), custName: get('ชื่อ'), custSocial: get('ชื่อโซเชียล (ลูกค้า)', 'ชื่อในช่องทางติดต่อ'), custSpent: get('ยอดสั่งซื้อสะสม (ลูกค้า)'),
    };
    for (let r = 1; r < shipnity.length; r++) {
      const o = shipnity[r] || [];
      const ono = String(o[c.order] ?? '').trim();
      if (!ono) continue;
      const cancelled = String(o[c.cancel] ?? '').trim().toLowerCase() === 'true';
      const om = ymOf(o[c.date]), cm = ymOf(o[c.custDate]);
      const q = mpNum(o[c.qty]); const user = String(o[c.user] ?? '').trim();
      rows.push({
        order_no: ono, source: 'shipnity', status: cancelled ? 'cancelled' : 'active',
        channel: normChannel(o[c.mkt], o[c.contact], o[c.user], o[c.prov]),
        marketplace_id: String(o[c.mid] ?? '').trim(),
        order_month: om, order_date: isoDate(o[c.date]),
        salesperson: (user && user !== '-') ? user : '(อัตโนมัติ/มาร์เก็ตเพลส)',
        province: String(o[c.prov] ?? '').trim(),
        payment_type: payShipnity(o[c.bank]),
        customer_type: (om && cm && om === cm) ? 'ลูกค้าใหม่' : 'ลูกค้าเก่า',
        customer_code: String(o[c.custCode] ?? '').trim(),
        customer_name: String(o[c.custName] ?? '').trim(),
        customer_social: String(o[c.custSocial] ?? '').trim(),
        cust_total_orders: mpNum(o[c.custCum]),
        cust_total_spent: mpNum(o[c.custSpent]),
        qty_band: qtyBand(q), qty: q, sales: mpNum(o[c.sales]), cost: mpNum(o[c.cost]),
        mkt_commission: mpNum(o[c.comm]), mkt_net_income: mpNum(o[c.net]),
        profit: mpNum(o[c.profit]), cod_amount: mpNum(o[c.cod]),
      });
    }
  }
  if (tiktok && tiktok.length > 2) {
    const { get } = indexer(tiktok);
    const c = { oid: get('Order ID'), created: get('Created Time'), status: get('Order Status'), pay: get('Payment Method'), qty: get('Quantity'), sub: get('SKU Subtotal After Discount'), prov: get('Province') };
    const byOrder = new Map(); // group SKU lines → 1 order
    for (let r = 1; r < tiktok.length; r++) {
      const row = tiktok[r] || [];
      const oid = String(row[c.oid] ?? '').trim();
      if (!oid) continue;
      const cancelled = String(row[c.status] ?? '').trim() === 'ยกเลิกแล้ว';
      if (!byOrder.has(oid)) byOrder.set(oid, { qty: 0, sales: 0, created: row[c.created], pay: row[c.pay], prov: row[c.prov], cancelled });
      const g = byOrder.get(oid); g.qty += mpNum(row[c.qty]); g.sales += mpNum(row[c.sub]);
    }
    for (const [oid, g] of byOrder) {
      const om = ymOf(g.created);
      rows.push({
        order_no: oid, source: 'tiktok', status: g.cancelled ? 'cancelled' : 'active', channel: 'TikTok', marketplace_id: oid,
        order_month: om, order_date: isoDate(g.created), salesperson: '(TikTok)', province: String(g.prov ?? '').trim(),
        payment_type: payTiktok(g.pay), customer_type: 'ไม่ทราบ (TikTok)',
        customer_code: '', customer_name: '', customer_social: '', cust_total_orders: 0, cust_total_spent: 0,
        qty_band: qtyBand(g.qty), qty: g.qty, sales: g.sales, cost: 0,
        mkt_commission: 0, mkt_net_income: 0, profit: 0, cod_amount: 0,
      });
    }
  }
  return rows;
}

/* ============================ STEP 2: SKU master (SKU-level) ============================ */
// opts.shipnityAllChannels=true → แกะ 'รายการขาย' ทุกออเดอร์ (โหมด base-only ไม่มี Shopee file)
export function buildSku({ shipnity, shopee, tiktok } = {}, catalogGrid, opts = {}) {
  const M = catalogGrid ? buildMatchers(catalogGrid) : { code2: {}, name2: {}, kw: [] };
  const rows = [];
  const hasShopee = !!(shopee && shopee.length > 1);
  const shipnityAll = opts.shipnityAllChannels != null ? opts.shipnityAllChannels : !hasShopee;

  // ---- Shopee : Parent SKU → ไม่งั้นชื่อสินค้า ----
  if (hasShopee) {
    const { get } = indexer(shopee);
    const c = { status: get('สถานะการสั่งซื้อ'), order: get('หมายเลขคำสั่งซื้อ'), par: get('เลขอ้างอิง Parent SKU'), full: get('เลขอ้างอิง SKU (SKU Reference No.)', 'เลขอ้างอิง SKU'), opt: get('ชื่อตัวเลือก'), pname: get('ชื่อสินค้า'), qty: get('จำนวน'), price: get('ราคาขายสุทธิ') };
    for (let r = 1; r < shopee.length; r++) {
      const row = shopee[r] || [];
      if (String(row[c.status] ?? '').includes('ยกเลิก')) continue;
      const par = String(row[c.par] ?? '').trim();
      const full = String(row[c.full] ?? '').trim();
      const { color, size } = splitShopeeVar(row[c.opt]);
      let m = M.code2[par.toUpperCase()], how = 'code';
      if (!m) { m = kwmatch(M.kw, row[c.pname]); how = 'name'; }
      rows.push({ channel: 'Shopee', source: 'shopee', order_no: String(row[c.order] ?? '').trim(), product_code: m.code || par || full, design: m.design, color, size, qty: mpNum(row[c.qty]), line_sales: mpNum(row[c.price]), raw_sku_or_name: full, match_how: m.design ? how : '' });
    }
  }

  // ---- TikTok : ลายในวงเล็บก่อน → ไม่งั้น keyword ----
  if (tiktok && tiktok.length > 2) {
    const { get } = indexer(tiktok);
    const c = { status: get('Order Status'), oid: get('Order ID'), seller: get('Seller SKU'), skuid: get('SKU ID'), pname: get('Product Name'), variation: get('Variation'), qty: get('Quantity'), sub: get('SKU Subtotal After Discount') };
    const tkDesign = (name) => {
      const n = String(name);
      const parens = [...n.matchAll(/\(([^)]*)\)/g)].map(x => x[1]);
      for (const p of parens.reverse()) {
        const p2 = p.replace(/^ลาย/, '').trim();
        for (const [k, code, dk] of M.kw) { if (k === p2 || p2.includes(k)) return { code, design: dk, how: 'paren' }; }
      }
      const m = kwmatch(M.kw, n); return { code: m.code, design: m.design, how: m.design ? 'listing' : '' };
    };
    for (let r = 1; r < tiktok.length; r++) {
      const row = tiktok[r] || [];
      if (String(row[c.status] ?? '').trim() === 'ยกเลิกแล้ว') continue;
      const { color, size } = splitShopeeVar(row[c.variation]);
      const d = tkDesign(row[c.pname]);
      rows.push({ channel: 'TikTok', source: 'tiktok', order_no: String(row[c.oid] ?? '').trim(), product_code: d.code, design: d.design, color, size, qty: mpNum(row[c.qty]), line_sales: mpNum(row[c.sub]), raw_sku_or_name: String(row[c.seller] || row[c.skuid] || '').trim(), match_how: d.how });
    }
  }

  // ---- Shipnity-direct : แกะ 'รายการขาย' ----
  if (shipnity && shipnity.length > 1) {
    const { get } = indexer(shipnity);
    const c = { order: get('เลขที่ออเดอร์'), cancel: get('ยกเลิกออเดอร์แล้ว'), mkt: get('Marketplace ของออเดอร์'), items: get('รายการขาย'), qty: get('จำนวนสั่งซื้อรวม'), sales: get('ยอดขาย'), channelCtx: get('ช่องทางที่ลูกค้าทักมา'), user: get('User ที่สร้าง'), prov: get('ชื่อจังหวัด (จังหวัด)') };
    const matchLabel = (lbl) => { const s = String(lbl).trim(); return M.name2[s] || kwmatch(M.kw, s); };
    for (let r = 1; r < shipnity.length; r++) {
      const o = shipnity[r] || [];
      const ono = String(o[c.order] ?? '').trim(); if (!ono) continue;
      if (String(o[c.cancel] ?? '').trim().toLowerCase() === 'true') continue;
      const mkt = String(o[c.mkt] ?? '').trim().toLowerCase();
      // ถ้ามีไฟล์ Shopee แล้ว → เอาเฉพาะช่องตรง (no_marketplace/lazada) กันนับซ้ำ; ไม่มี → เอาทุกออเดอร์
      if (!shipnityAll && !(mkt === 'no_marketplace' || mkt === 'lazada')) continue;
      const li = String(o[c.items] ?? ''); if (!li || li === 'nan') continue;
      const tot = mpNum(o[c.qty]); const osales = mpNum(o[c.sales]);
      const ch = normChannel(o[c.mkt], o[c.channelCtx], o[c.user], o[c.prov]);
      for (const partRaw of li.split('|')) {
        const part = partRaw.trim(); if (!part) continue;
        let nm = part, qStr = '1';
        if (part.includes('=')) { const i = part.lastIndexOf('='); nm = part.slice(0, i); qStr = part.slice(i + 1); }
        const q = mpNum(qStr);
        const mm = /\(([^)]*)\)\s*$/.exec(nm.trim()); const varTxt = mm ? mm[1] : '';
        const label = nm.replace(/\s*\([^)]*\)\s*$/, '').trim();
        const { color, size } = splitParenVar(varTxt);
        const m = matchLabel(label);
        const lsales = tot ? Math.round(osales * (q / tot) * 100) / 100 : 0; // เฉลี่ยตามชิ้น
        rows.push({ channel: shipnityAll ? ch : 'Shipnity-direct', source: 'shipnity', order_no: ono, product_code: m.code, design: m.design, color, size, qty: q, line_sales: lsales, raw_sku_or_name: label + (varTxt ? ` (${varTxt})` : ''), match_how: m.design ? 'label' : '' });
      }
    }
  }
  return rows;
}

/* ============================ สรุป/รวมยอด (สำหรับ preview reconciliation) ============================ */
export function summarize(master, sku) {
  const all = master || [], s = sku || [];
  const m = all.filter(x => x.status !== 'cancelled'); // ยอดขายนับเฉพาะ active
  const sum = (arr, k) => arr.reduce((a, x) => a + (Number(x[k]) || 0), 0);
  const matched = s.filter(x => x.design);
  return {
    orders: m.length,
    cancelled: all.length - m.length,
    sales: Math.round(sum(m, 'sales')),
    qty: sum(m, 'qty'),
    profit: Math.round(sum(m, 'profit')),
    skuLines: s.length,
    skuQty: sum(s, 'qty'),
    matchedPct: s.length ? (matched.length / s.length) * 100 : 0,
    byChannel: groupSum(m, 'channel', 'sales'),
  };
}
function groupSum(arr, key, val) {
  const o = {};
  arr.forEach(x => { const k = x[key] || 'ไม่ระบุ'; if (!o[k]) o[k] = { count: 0, value: 0 }; o[k].count++; o[k].value += Number(x[val]) || 0; });
  return o;
}
