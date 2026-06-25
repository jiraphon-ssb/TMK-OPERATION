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

// ---- ประเภทงาน (ปลีก/ส่ง/OEM) จากจำนวน+ช่องทาง — proxy ตาม blueprint M1.3 ----
export function deriveJobType(channel, qty) {
  const q = Number(qty) || 0;
  const direct = ['Phone', 'Direct', 'POS', 'LINE', 'Facebook'].includes(String(channel));
  if (q >= 51) return direct ? 'OEM' : 'ส่ง';
  if (q >= 11) return 'ส่ง';
  return 'ปลีก';
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

/* ---- ตัวจับคู่ catalog (+ alias ชื่อพ้อง + สีที่ผู้ใช้ลงทะเบียนเพิ่ม) ----
   aliases: [{ kind:'design'|'color', term, code, design }]
   - design alias: term (ที่เจอในไฟล์) → code/design ใน catalog
   - color alias: term = คำสีใหม่ที่อยากให้ระบบรู้จัก */
export function buildMatchers(catalogGrid, aliases = []) {
  const { get } = indexer(catalogGrid);
  const ci = { code: get('product_code', 'sku', 'รหัสสินค้า', 'รหัส'), name: get('product_name', 'name', 'ชื่อสินค้า', 'ชื่อ'), design: get('design_key', 'design', 'ลาย') };
  const code2 = {}, name2 = {}, alias2 = {}, kwseen = new Set(), kw = [];
  const colors = new Set();
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
  // ผนวก alias เข้า matcher
  for (const a of (aliases || [])) {
    const term = String(a.term ?? '').trim(); if (!term) continue;
    if (a.kind === 'color') { colors.add(term.replace(/^สี/, '').trim()); continue; }
    const code = String(a.code ?? '').trim();
    const design = String(a.design ?? '').trim() || (code && code2[code.toUpperCase()]?.design) || term;
    alias2[term] = { code, design };                      // ตรงเป๊ะ
    const key = term + '||' + code; if (!kwseen.has(key)) { kwseen.add(key); kw.push([term, code, design]); }
  }
  kw.sort((a, b) => b[0].length - a[0].length); // ยาวสุดก่อน
  return { code2, name2, alias2, kw, colors };
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

/* ============================================================
   แก้ปัญหา "ลาย↔สี สลับกัน" ใน TikTok/Shopee
   ----------------------------------------------------------------
   ช่อง Variation/ชื่อตัวเลือก = "<สีหรือลาย>, <ไซซ์>"  โดย token แรก
   อาจเป็น "สี" (ดำ/ขาว/กรมท่า…) หรือ "ลาย" (กนกประยุกต์/จันทกานต์…)
   - ถ้า listing เจาะลาย (เช่น "(ลายสิริกานต์)") → token คือ "สี" / ลายอยู่ในชื่อ
   - ถ้า listing รวมสีดำ (เช่น "(รวมสีดำพิเศษ)") → token คือ "ลาย" / สี = ดำ
   ============================================================ */
export const MP_COLOR_WORDS = new Set([
  'ดำ', 'ขาว', 'กรม', 'กรมท่า', 'น้ำเงิน', 'ฟ้า', 'ชมพู', 'แดง', 'เหลือง', 'เขียว',
  'ม่วง', 'ส้ม', 'เทา', 'น้ำตาล', 'ครีม', 'โอรส', 'ทอง', 'เงิน', 'บานเย็น', 'เลือดหมู',
  'กากี', 'ขาวอมเหลือง', 'เขียวขี้ม้า', 'ฟ้าอ่อน', 'เทาอ่อน',
]);
// ตัดคำนำ "สี" เพื่อ normalize: สีฟ้า→ฟ้า, สีดำ→ดำ
export function cleanColor(tok) {
  const t = String(tok || '').trim();
  if (!t) return '';
  return t.split(/[-/]/).map(s => s.trim().replace(/^สี/, '').trim()).filter(Boolean).join('-') || t;
}
export function isMpColor(tok, extra) {
  const t = String(tok || '').trim();
  if (!t) return false;
  const has = (p) => MP_COLOR_WORDS.has(p) || (extra && extra.has && extra.has(p));
  const parts = t.split(/[-/]/).map(s => s.trim().replace(/^สี/, '').trim()).filter(Boolean);
  if (parts.length && parts.every(has)) return true;
  return has(t.replace(/^สี/, '').trim());
}
// แยก token แรก + ไซซ์ จาก "(qualifier) token, size (อกXX)"
export function splitVariantToken(varTxt) {
  let v = String(varTxt || '').trim();
  let prefix = '';
  const pm = /^\(([^)]*)\)\s*/.exec(v); // qualifier นำหน้า เช่น "(สกรีน-อปท) "
  if (pm) { prefix = pm[1].trim(); v = v.slice(pm[0].length).trim(); }
  let tok = v, size = '';
  const ci = v.indexOf(',');
  if (ci >= 0) { tok = v.slice(0, ci).trim(); const rest = v.slice(ci + 1).trim(); size = rest ? rest.split(/\s+/)[0] : ''; }
  if (tok && MP_SIZES.has(tok)) { size = size || tok; tok = ''; } // token เป็นไซซ์ล้วน
  return { tok, size, prefix };
}
// จับลายจาก "token" (กรณี token เป็นลาย) → คืน {code, design}; ไม่เจอใน catalog คืน design=token
export function matchDesignFromToken(tok, M) {
  const t = String(tok || '').replace(/^ลาย/, '').trim();
  if (!t) return { code: '', design: '' };
  for (const [k, code, dk] of (M.kw || [])) { if (dk === t || k === t) return { code, design: dk }; } // ตรงเป๊ะก่อน
  for (const [k, code, dk] of (M.kw || [])) { if (t.includes(k)) return { code, design: dk }; }          // token คลุม keyword (kw เรียงยาวสุดก่อน)
  return { code: '', design: t }; // เก็บชื่อลายไว้แม้ไม่มีรหัส
}
const MP_NAME_NOISE = /^(ลายใหม่|เปิดจอง|ใหม่ล่าสุด|ไม่มีโลโก้|พร้อมส่ง|NEW|ชาย\/หญิง|ชาย|หญิง)$/i;
// design_key กว้างเกินไป/ปนกับ brand "ลายไทย…" → ห้ามใช้จับทั้งชื่อ
const MP_GENERIC_DK = new Set(['ลายไทย', 'F02 ลายไทย', 'แถม', 'แถม05', 'DARK', 'OVERSIZE', 'อื่นๆ', 'Promotion01']);
// จับลายจาก "วงเล็บ" ในชื่อสินค้า เท่านั้น (เจาะจง — listing เจาะลาย เช่น "(ลายสิริกานต์)")
export function matchDesignFromName(name, M) {
  const n = String(name || '');
  const C = M && M.colors;
  const parens = [...n.matchAll(/\(([^)]*)\)/g)].map(x => x[1].trim());
  for (const p of parens.reverse()) {
    const p2 = p.replace(/^ลาย/, '').trim();
    if (!p2 || MP_NAME_NOISE.test(p2) || /รวม|สกรีน|พร้อมส่ง|โลโก้/.test(p2)) continue;
    for (const [k, code, dk] of (M.kw || [])) { if (isMpColor(dk, C)) continue; if (k === p2 || p2.includes(k)) return { code, design: dk }; }
    const guess = p2.replace(/[-,].*$/, '').trim();
    if (guess && !isMpColor(guess, C)) return { code: '', design: guess };
  }
  return { code: '', design: '' };
}
// สแกน "ทั้งชื่อ" หา keyword เจาะจง (ใช้เฉพาะตอน token เป็นสีแต่วงเล็บไม่ให้ลาย เช่น "(ไม่มีโลโก้)")
// กัน brand "ลายไทย…"/generic ปน
export function matchDesignWholeName(name, M) {
  const n = String(name || ''); const C = M && M.colors;
  for (const [k, code, dk] of (M.kw || [])) {
    if (isMpColor(dk, C) || MP_GENERIC_DK.has(dk) || k.length < 4) continue;
    if (n.includes(k)) return { code, design: dk };
  }
  return { code: '', design: '' };
}
// รวมตรรกะ: คืน {code, design, color, size, how, flag}
//   flag: ''(ปกติ) | 'color_new'(สีที่ระบบยังไม่รู้จัก) | 'design_new'(ลายที่ยังไม่มีรหัสใน catalog)
//   ใช้ "ชนิด listing" เป็นตัวตัดสิน — กันสลับแม้เจอสี/ลายใหม่ที่ไม่เคยเห็น
export function resolveMpVariant({ name, variation }, M, opt = {}) {
  const { tok, size } = splitVariantToken(variation);
  const nm = String(name || '');
  const C = M && M.colors;
  const blackListing = /รวม.*สีดำ|รวมเสื้อสีดำ|สีดำพิเศษ|สีดำโทน/.test(nm);
  const vIsColor = isMpColor(tok, C);
  const byOpt = () => (opt.code && M.code2 && M.code2[String(opt.code).toUpperCase()]) || null;

  // 1) listing "รวมสีดำ" → token = ลาย, สี = ดำ (ตัวตัดสินหลัก กันสลับ)
  //    ลำดับรหัส: design-token match (ลาย=รหัสตรงกัน) ก่อน → ไม่งั้นรหัสฝังใน SKU → ไม่งั้น design_new
  if (blackListing && tok && !vIsColor) {
    const md = matchDesignFromToken(tok, M); const bc = byOpt();
    if (md.code) return { code: md.code, design: md.design, color: 'ดำ', size, how: 'variant', flag: '' };
    if (bc) return { code: opt.code, design: bc.design, color: 'ดำ', size, how: 'sku-code', flag: '' };
    return { code: '', design: md.design, color: 'ดำ', size, how: 'variant', flag: 'design_new' };
  }
  // 2) listing เจาะลาย (วงเล็บให้ลาย) → token = สี (แม้สีใหม่ ก็ไม่เอาไปเป็นลาย)
  const dnParen = matchDesignFromName(nm, M);
  if (dnParen.design) {
    const color = tok ? cleanColor(tok) : (blackListing ? 'ดำ' : '');
    const flag = (tok && !vIsColor) ? 'color_new' : '';
    return { code: opt.code || dnParen.code, design: dnParen.design, color, size, how: 'name', flag };
  }
  // 3) token เป็นสีรู้จัก แต่วงเล็บไม่ให้ลาย → ลายมาจาก brand/ทั้งชื่อ (เช่น "(ไม่มีโลโก้)")
  if (vIsColor) {
    const bc = byOpt(); if (bc) return { code: opt.code, design: bc.design, color: cleanColor(tok), size, how: 'sku-code', flag: '' };
    const dw = matchDesignWholeName(nm, M);
    return { code: dw.code, design: dw.design, color: cleanColor(tok), size, how: dw.design ? 'name' : '', flag: '' };
  }
  // 4) token ไม่ใช่สี → ถือเป็น "ลาย" (รวมสีดำ หรือ pattern token)
  if (tok) {
    const md = matchDesignFromToken(tok, M); const bc = byOpt();
    const color = blackListing ? 'ดำ' : '';
    if (md.code) return { code: md.code, design: md.design, color, size, how: 'variant', flag: '' };
    if (bc) return { code: opt.code, design: bc.design, color, size, how: 'sku-code', flag: '' };
    return { code: '', design: md.design, color, size, how: 'variant', flag: 'design_new' };
  }
  // 5) ไม่มี token → พึ่งรหัสฝังอย่างเดียว
  const bc = byOpt();
  return { code: opt.code || '', design: bc ? bc.design : '', color: blackListing ? 'ดำ' : '', size, how: bc ? 'sku-code' : '', flag: '' };
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
      const ch = normChannel(o[c.mkt], o[c.contact], o[c.user], o[c.prov]);
      rows.push({
        order_no: ono, source: 'shipnity', status: cancelled ? 'cancelled' : 'active',
        channel: ch, job_type: deriveJobType(ch, q),
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
        order_no: oid, source: 'tiktok', status: g.cancelled ? 'cancelled' : 'active', channel: 'TikTok', job_type: deriveJobType('TikTok', g.qty), marketplace_id: oid,
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
  const M = catalogGrid ? buildMatchers(catalogGrid, opts.aliases) : { code2: {}, name2: {}, kw: [], colors: new Set() };
  // ดึงรหัส catalog ที่ฝังอยู่หัว SKU-ref เช่น "JRP111-S-4XL" → "JRP111"
  const embedCode = (txt) => { const t = String(txt || '').trim(); if (!t) return ''; for (const seg of t.split(/[-_\s/]/)) { const s = seg.trim().toUpperCase(); if (s && M.code2[s]) return M.code2[s].code; } return ''; };
  const rows = [];
  const hasShopee = !!(shopee && shopee.length > 1);
  const shipnityAll = opts.shipnityAllChannels != null ? opts.shipnityAllChannels : !hasShopee;

  // map เลข Shopee (date-hash) → เลขออเดอร์จริง (SK/M1K) จากชีต Shipnity
  // ไฟล์ Shopee มีแต่ 'หมายเลขคำสั่งซื้อ' = marketplace_id ทำให้ SKU จับคู่ออเดอร์ไม่ได้ ถ้าไม่ remap
  const mid2ono = new Map();
  if (shipnity && shipnity.length > 1) {
    const { get } = indexer(shipnity);
    const oi = get('เลขที่ออเดอร์'), mi = get('ID บน Marketplace');
    for (let r = 1; r < shipnity.length; r++) { const row = shipnity[r] || []; const mid = String(row[mi] ?? '').trim(); const ono = String(row[oi] ?? '').trim(); if (mid && mid !== '-' && ono) mid2ono.set(mid, ono); }
  }

  // ---- Shopee : Parent SKU → ไม่งั้นชื่อสินค้า ----
  if (hasShopee) {
    const { get } = indexer(shopee);
    const c = { status: get('สถานะการสั่งซื้อ'), order: get('หมายเลขคำสั่งซื้อ'), par: get('เลขอ้างอิง Parent SKU'), full: get('เลขอ้างอิง SKU (SKU Reference No.)', 'เลขอ้างอิง SKU'), opt: get('ชื่อตัวเลือก'), pname: get('ชื่อสินค้า'), qty: get('จำนวน'), price: get('ราคาขายสุทธิ') };
    for (let r = 1; r < shopee.length; r++) {
      const row = shopee[r] || [];
      if (String(row[c.status] ?? '').includes('ยกเลิก')) continue;
      const par = String(row[c.par] ?? '').trim();
      const full = String(row[c.full] ?? '').trim();
      const skuCode = embedCode(full) || embedCode(par); // รหัส catalog ที่ฝังใน SKU-ref/Parent
      const v = resolveMpVariant({ name: row[c.pname], variation: row[c.opt] }, M, { code: skuCode });
      // เติม design จากรหัส catalog ถ้า resolver ยังว่าง
      const byCode = M.code2[(v.code || par).toUpperCase()];
      const design = v.design || (byCode ? byCode.design : '');
      const code = v.code || (byCode ? byCode.code : '') || par || full;
      const rawOno = String(row[c.order] ?? '').trim();
      rows.push({ channel: 'Shopee', source: 'shopee', order_no: mid2ono.get(rawOno) || rawOno, product_code: code, design, color: v.color, size: v.size, qty: mpNum(row[c.qty]), line_sales: mpNum(row[c.price]), raw_sku_or_name: full, match_how: design ? (v.how || (byCode ? 'code' : '')) : '', attrs: v.flag ? { flag: v.flag } : undefined });
    }
  }

  // ---- TikTok : Variation อาจเป็น สี หรือ ลาย → resolveMpVariant จัดให้ ----
  if (tiktok && tiktok.length > 2) {
    const { get } = indexer(tiktok);
    const c = { status: get('Order Status'), oid: get('Order ID'), seller: get('Seller SKU'), skuid: get('SKU ID'), pname: get('Product Name'), variation: get('Variation'), qty: get('Quantity'), sub: get('SKU Subtotal After Discount') };
    for (let r = 1; r < tiktok.length; r++) {
      const row = tiktok[r] || [];
      const ono = String(row[c.oid] ?? '').trim();
      if (!/^\d{6,}$/.test(ono)) continue; // ข้ามแถวคำอธิบายคอลัมน์ ("Platform unique order ID.")
      if (String(row[c.status] ?? '').trim() === 'ยกเลิกแล้ว') continue;
      const seller = String(row[c.seller] || row[c.skuid] || '').trim();
      const v = resolveMpVariant({ name: row[c.pname], variation: row[c.variation] }, M, { code: embedCode(seller) });
      rows.push({ channel: 'TikTok', source: 'tiktok', order_no: ono, product_code: v.code, design: v.design, color: v.color, size: v.size, qty: mpNum(row[c.qty]), line_sales: mpNum(row[c.sub]), raw_sku_or_name: seller, match_how: v.design ? v.how : '', attrs: v.flag ? { flag: v.flag } : undefined });
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
  // ทุกแถวต้องมี key 'attrs' เท่ากัน (PostgREST bulk insert ต้องคีย์ตรงกัน)
  return rows.map(r => ({ ...r, attrs: r.attrs || {} }));
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

/* ============================ ตรวจสุขภาพการนำเข้า (Import Health) ============================
   คืน anomalies เพื่อเตือนผู้ใช้: ลายใหม่ / สีใหม่ / จับคู่ไม่ได้ — ทั้งตอน import และดูย้อนหลัง */
export function auditImport(master, sku, M, _opts = {}) {
  const s = sku || [], m = master || [];
  const hasCode = (x) => !!(x.product_code && M && M.code2 && M.code2[String(x.product_code).toUpperCase()]);
  const flagOf = (x) => (x.attrs && (x.attrs.flag || (typeof x.attrs === 'string' && (() => { try { return JSON.parse(x.attrs).flag; } catch { return ''; } })()))) || '';
  const tally = (arr, keyf) => {
    const o = {};
    arr.forEach(x => { const k = keyf(x); if (k == null || k === '') return; (o[k] = o[k] || { count: 0, qty: 0, channels: new Set(), sample: '' }); o[k].count++; o[k].qty += Number(x.qty) || 0; if (x.channel) o[k].channels.add(x.channel); if (!o[k].sample) o[k].sample = x.raw_sku_or_name || ''; });
    return Object.entries(o).map(([k, v]) => ({ key: k, count: v.count, qty: v.qty, channels: [...v.channels], sample: v.sample })).sort((a, b) => b.count - a.count);
  };
  return {
    newDesigns: tally(s.filter(x => x.design && !hasCode(x)), x => x.design),          // มีชื่อลายแต่ไม่มีรหัส catalog (ลายใหม่/สะกดต่าง)
    newColors: tally(s.filter(x => flagOf(x) === 'color_new'), x => x.color),           // สีที่ระบบยังไม่รู้จัก (เสี่ยงสลับ)
    unmatched: tally(s.filter(x => !x.design), x => `${x.channel || '?'} · ${x.color || '—'}`), // จับคู่ไม่ได้เลย
    counts: { skus: s.length, matched: s.filter(x => x.design).length, withCode: s.filter(hasCode).length, orders: m.length },
  };
}
// คอลัมน์ที่จำเป็นต่อชนิดไฟล์ → เตือนถ้าโครงเปลี่ยน/หาย
const MP_REQUIRED_COLS = {
  shipnity: ['เลขที่ออเดอร์', 'รายการขาย', 'ยอดขาย'],
  shopee: ['หมายเลขคำสั่งซื้อ', 'ชื่อตัวเลือก', 'ชื่อสินค้า', 'ราคาขายสุทธิ'],
  tiktok: ['Order ID', 'Product Name', 'Variation', 'SKU Subtotal After Discount'],
  catalog: ['product_code', 'design_key'],
};
export function auditColumns(files) {
  const issues = [];
  for (const f of (files || [])) {
    if (f.kind === 'unknown') { issues.push({ file: f.name, kind: 'unknown', missing: [] }); continue; }
    const req = MP_REQUIRED_COLS[f.kind]; if (!req) continue;
    const H = (f.grid?.[0] || []).map(x => String(x ?? '').trim());
    const missing = req.filter(col => !H.includes(col));
    if (missing.length) issues.push({ file: f.name, kind: f.kind, missing });
  }
  return issues;
}
