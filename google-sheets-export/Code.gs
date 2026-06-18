/* ============================================================
   TMK Operation — Google Sheets Export (READ-ONLY mirror)
   ============================================================
   ดึงข้อมูลจาก Supabase มาโชว์ใน Google Sheet (อ่านอย่างเดียว)
   - ทิศทางเดียว: Supabase → Sheet (ยิงแค่ GET ไม่มีทางแก้/ลบข้อมูลต้นทาง)
   - แต่ละเดือน = 1 แท็บ (wide: 1 แถว = 1 วัน, แยกแต่ละช่องเป็นคอลัมน์ + ยอดรวม) + แท็บ "สรุปรายเดือน" + "ตั้งค่า"
   - idempotent: กดดึงกี่รอบก็ได้ ล้างแถวเก่า เขียนใหม่จากของจริงเสมอ
   - กรอกข้อมูลจริงทำในเว็บเท่านั้น — ชีตนี้ไว้ "ดู" อย่างเดียว
   ------------------------------------------------------------
   วิธีใช้: เมนูบนสุด  TMK ▸ ⟳ ดึงข้อมูลล่าสุด
   ============================================================ */

// ===== ตั้งค่าเชื่อมต่อ (anon key เป็น public อยู่แล้ว — ฝังได้ปลอดภัยเท่าเว็บที่ deploy) =====
const SUPABASE_URL = 'https://asimudifasqvtjegbvdp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Am3Rm7MahwXIYSKTppLtnw_zkUeE7BR';
const TZ = 'Asia/Bangkok';

// ===== ชื่อแท็บระบบ =====
const SETTINGS_SHEET = '⚙️ ตั้งค่า';
const SUMMARY_SHEET = '📊 สรุปรายเดือน';

// ===== แม็ปคอลัมน์เดิม (legacy) สำหรับ fallback ยอดขาย ถ้า channels jsonb ยังไม่มี rev (ข้อมูลเก่า) =====
const DAILY_COL = { shopee: 'shopee', tiktok: 'tiktok', lazada: 'lazada', facebook: 'facebook', line: 'line_oa', crm: 'crm' };

const TH_MONTH_ABBR = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_WEEKDAY_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

// ===== หัวตาราง รายวัน (wide: 1 แถว/วัน + แยกช่องเป็นคอลัมน์) — สร้าง dynamic ตามจำนวนช่อง =====
const DAILY_PER_CH = ['ยอด ฿', 'ออเดอร์', 'แอด ฿', 'ใหม่', 'เก่า']; // 5 คอลัมน์ต่อช่อง
function dailyHeaders(channels) {
  const h = ['วันที่', 'วันที่ไทย', 'วันในสัปดาห์', 'เดือน-ปี'];
  channels.forEach(ch => DAILY_PER_CH.forEach(m => h.push(ch.name + ' ' + m)));
  return h.concat([
    'ยอดรวม ฿', 'ออเดอร์รวม', 'ค่าแอดรวม ฿', 'ลูกค้าใหม่รวม', 'ลูกค้าเก่ารวม',
    'AOV รวม ฿', 'ACOS รวม %', 'ROAS รวม', 'กำไรหลังหักแอด ฿', 'CAC รวม ฿',
    'เวลาตอบแชท (นาที)', 'โน้ตรายวัน', 'อัปเดตล่าสุด',
  ]);
}
const SUMMARY_HEADERS = [
  'เดือน/ปี', 'เลขเดือน', 'ปี (พ.ศ.)',
  'เป้ายอด ฿', 'ยอดจริง ฿', '% เป้า', 'Run Rate ฿',
  'ออเดอร์', 'AOV ฿',
  'ค่าแอดรวม ฿', 'ACOS %', 'ROAS', 'เพดาน ACOS %',
  'ลูกค้าใหม่', 'ลูกค้าเก่า', 'CAC ฿', 'จำนวนข้อความ',
  'อัปเดตล่าสุด',
];

/* ---------- เมนู ---------- */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('TMK')
    .addItem('⟳ ดึงข้อมูลล่าสุด', 'syncAll')
    .addSeparator()
    .addItem('ตั้งค่าเริ่มต้น (สร้างแท็บ)', 'initSheets')
    .addToUi();
}

/* ---------- helper: ตัวเลข/วันที่ ---------- */
function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
function round2(n) { return Math.round((num(n) + Number.EPSILON) * 100) / 100; }
function ratio(a, b) { return num(b) > 0 ? num(a) / num(b) : ''; }   // หารปลอดภัย — ตัวหาร 0 → ค่าว่าง (ไม่โชว์ 0/∞)
function pct(a, b) { return num(b) > 0 ? (num(a) / num(b)) * 100 : ''; }
function todayParts() {
  const s = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd').split('-').map(Number);
  return { y: s[0], m: s[1], d: s[2] };
}
function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); } // m = 1-12

/* ---------- helper: สี ---------- */
const NAVY = '#0c2236';
function normHex(c) {
  const s = String(c || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  if (/^[0-9a-fA-F]{6}$/.test(s)) return '#' + s;
  return '#64748b'; // เทากลาง ถ้าสีเพี้ยน/ว่าง
}
function hexToRgb(h) { const x = normHex(h).slice(1); return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)]; }
function toHex(n) { const s = Math.max(0, Math.min(255, Math.round(n))).toString(16); return s.length === 1 ? '0' + s : s; }
function tint(hex, a) { // ผสมกับขาว (a = สัดส่วนสีจริง 0..1) → สีอ่อนสำหรับพื้นข้อมูล
  const r = hexToRgb(hex); return '#' + toHex(255 - (255 - r[0]) * a) + toHex(255 - (255 - r[1]) * a) + toHex(255 - (255 - r[2]) * a);
}
function readableText(hex) { // เลือกตัวอักษรดำ/ขาวตามความสว่างพื้น (กันอ่านไม่ออก)
  const r = hexToRgb(hex); const lum = (0.299 * r[0] + 0.587 * r[1] + 0.114 * r[2]) / 255;
  return lum > 0.6 ? '#1f2937' : '#ffffff';
}

/* ---------- REST: GET พร้อมแบ่งหน้า (Range header) ---------- */
function sbGet(table, query) {
  const base = SUPABASE_URL + '/rest/v1/' + table + (query ? ('?' + query) : '');
  const PAGE = 1000;
  let from = 0, out = [];
  for (let guard = 0; guard < 1000; guard++) { // กันลูปไม่จบ (สูงสุด 1,000,000 แถว)
    const res = UrlFetchApp.fetch(base, {
      method: 'get',
      muteHttpExceptions: true,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        Accept: 'application/json',
        'Range-Unit': 'items',
        Range: from + '-' + (from + PAGE - 1),
      },
    });
    const code = res.getResponseCode();
    if (code === 416) break; // Range เกินช่วง (จำนวนแถวหารด้วย 1,000 ลงตัวพอดี) = ดึงครบแล้ว ไม่ใช่ error
    if (code >= 400) throw new Error('Supabase ' + table + ' HTTP ' + code + ': ' + res.getContentText().slice(0, 200));
    const chunk = JSON.parse(res.getContentText() || '[]');
    out = out.concat(chunk);
    if (chunk.length < PAGE) break; // หน้าสุดท้าย
    from += PAGE;
  }
  return out;
}

/* ---------- โหลดข้อมูลทั้งหมด (อ่านอย่างเดียว) ---------- */
function loadAll(startISO, endISO) {
  // ช่องทาง (เอาชื่อ/ลำดับ/ค่าธรรมเนียม) — ช่องที่เพิ่มในเว็บจะมาเองอัตโนมัติ
  const channels = sbGet('tmk_channels', 'select=id,name,sort_order,color&deleted_at=is.null&order=sort_order.asc')
    .map(c => ({ id: c.id, name: c.name, sortOrder: num(c.sort_order), hex: normHex(c.color) }));

  // ยอดขายรายวัน (กรองช่วง + ไม่เอาที่ลบ) เรียงเก่า→ใหม่
  let dq = 'select=*&deleted_at=is.null&order=date.asc';
  if (startISO) dq += '&date=gte.' + startISO;
  if (endISO) dq += '&date=lte.' + endISO;
  const daily = sbGet('tmk_daily_sales', dq);

  // สรุปรายเดือน (เป้า/ข้อความ/meta)
  const monthly = sbGet('tmk_monthly_history', 'select=*&order=year.asc,month.asc');

  return { channels, daily, monthly };
}

/* ---------- แปลง 1 แถว daily → แถวต่อช่องทาง (อ่าน channels jsonb + fallback rev) ---------- */
function expandDaily(d, channels) {
  const cj = (d.channels && typeof d.channels === 'object') ? d.channels : {};
  const per = channels.map(ch => {
    const j = cj[ch.id] || {};
    const legacy = DAILY_COL[ch.id];
    const rev = num(j.rev != null ? j.rev : (legacy ? d[legacy] : 0));
    const ord = num(j.ord), ad = num(j.ad), newC = num(j.newC), oldC = num(j.oldC);
    return { ch, rev, ord, ad, newC, oldC, inq: newC + oldC };
  });
  const dayRev = per.reduce((s, p) => s + p.rev, 0);
  const dayOrd = per.reduce((s, p) => s + p.ord, 0);
  // ค่าแอดรวมวัน = คอลัมน์ ad_spend (แหล่งจริงเดียวกับเว็บ/computeMonth) — ไม่ใช่ผลรวม jsonb ต่อช่อง
  // (per-channel p.ad ยังใช้คิด ACOS/ROAS/CAC ของแต่ละช่องตามเดิม)
  const dayAd = num(d.ad_spend);
  const dayNew = per.reduce((s, p) => s + p.newC, 0);
  const dayOld = per.reduce((s, p) => s + p.oldC, 0);
  const dayInq = dayNew + dayOld;
  return { per, dayRev, dayOrd, dayAd, dayNew, dayOld, dayInq };
}

/* ---------- สร้างแถวแท็บเดือน (wide: 1 แถว/วัน + แยกช่องเป็นคอลัมน์) ---------- */
function buildDailyRows(daily, channels) {
  const byMonth = {}; // key 'YYYY-MM'
  daily.forEach(d => {
    const parts = String(d.date).split('-'); // YYYY-MM-DD
    const y = Number(parts[0]), m = Number(parts[1]), dd = Number(parts[2]);
    if (!y || !m) return;
    const key = parts[0] + '-' + parts[1];
    const dt = new Date(y, m - 1, dd);
    const thaiDate = dd + ' ' + TH_MONTH_ABBR[m - 1] + ' ' + String((y + 543) % 100).padStart(2, '0');
    const weekday = TH_WEEKDAY_FULL[dt.getDay()];
    const monthLabel = TH_MONTH_ABBR[m - 1] + ' ' + (y + 543);
    const agg = expandDaily(d, channels);
    const updated = d.updated_at ? Utilities.formatDate(new Date(d.updated_at), TZ, 'yyyy-MM-dd HH:mm') : '';
    // คอลัมน์ระบุวัน
    const row = [d.date, thaiDate, weekday, monthLabel];
    // แต่ละช่อง 5 คอลัมน์ (ยอด/ออเดอร์/แอด/ใหม่/เก่า) เรียงตาม channels
    agg.per.forEach(p => { row.push(round2(p.rev), p.ord, round2(p.ad), p.newC, p.oldC); });
    // ยอดรวมทุกช่อง + อัตราส่วนรวม + ต่อวัน
    row.push(
      round2(agg.dayRev), agg.dayOrd, round2(agg.dayAd), agg.dayNew, agg.dayOld,
      ratio(agg.dayRev, agg.dayOrd), pct(agg.dayAd, agg.dayRev), ratio(agg.dayRev, agg.dayAd),
      round2(agg.dayRev - agg.dayAd), ratio(agg.dayAd, agg.dayNew),
      num(d.avg_reply_minutes), d.note || '', updated
    );
    (byMonth[key] = byMonth[key] || { y: y, m: m, rows: [] }).rows.push(row);
  });
  return byMonth;
}

/* ---------- สร้างแถวสรุปรายเดือน (KPI ตาม computeMonth, ไม่รวม P&L) ---------- */
function buildSummaryRows(daily, monthly, channels) {
  const t = todayParts();          // {y(ค.ศ.), m, d}
  const tBE = t.y + 543;
  // รวม daily ต่อเดือน — key เป็น 'ค.ศ.-เดือน'
  const agg = {};
  daily.forEach(d => {
    const parts = String(d.date).split('-');
    const yCE = Number(parts[0]), m = Number(parts[1]);
    if (!yCE || !m) return;
    const key = yCE + '-' + m;
    const a = agg[key] || (agg[key] = { actual: 0, orders: 0, ad: 0, newC: 0, oldC: 0 });
    const e = expandDaily(d, channels);
    a.actual += e.dayRev; a.orders += e.dayOrd; a.ad += e.dayAd; a.newC += e.dayNew; a.oldC += e.dayOld;
  });
  // index monthly_history — แปลงปีเป็น ค.ศ. (DB เก็บเป็น พ.ศ.) ให้ key ตรงกับ daily
  const mIndex = {};
  monthly.forEach(m => {
    const yCE = num(m.year) > 2400 ? num(m.year) - 543 : num(m.year); // กันเผื่อบางแถวเป็น ค.ศ.
    mIndex[yCE + '-' + num(m.month)] = m;
  });

  // รวมทุกเดือนที่ปรากฏ (จาก daily และ monthly_history) — key ค.ศ. ทั้งหมด → ไม่ซ้ำ
  const keys = {};
  Object.keys(agg).forEach(k => keys[k] = true);
  Object.keys(mIndex).forEach(k => keys[k] = true);

  const list = Object.keys(keys).map(k => ({ yCE: Number(k.split('-')[0]), m: Number(k.split('-')[1]) }))
    .sort((a, b) => (a.yCE - b.yCE) || (a.m - b.m)); // เก่า→ใหม่

  return list.map(({ yCE, m }) => {
    const yBE = yCE + 543;
    const mRow = mIndex[yCE + '-' + m] || null;
    const meta = (mRow && mRow.meta && typeof mRow.meta === 'object') ? mRow.meta : {};
    const a = agg[yCE + '-' + m] || { actual: 0, orders: 0, ad: 0, newC: 0, oldC: 0 };

    const isCurrent = (yCE === t.y) && (m === t.m);
    const isFuture = (yCE > t.y) || (yCE === t.y && m > t.m);
    const DAYS = daysInMonth(yCE, m);
    const DAY = isCurrent ? t.d : (isFuture ? 0 : DAYS);

    // โหมดข้อมูล: อดีตที่กรอกผ่าน "ข้อมูลย้อนหลัง" (มี actual แต่ไม่มี daily) → ใช้ยอดรวมรายเดือน
    const useMonthly = !isFuture && !isCurrent && mRow && num(mRow.actual) > 0 && meta.entryMode !== 'daily';
    const actual = round2(useMonthly ? num(mRow.actual) : a.actual);
    const orders = useMonthly ? num(mRow.orders) : a.orders;
    const ad = round2(useMonthly ? num(mRow.ad_spend) : a.ad);
    const newC = useMonthly ? num(mRow.new_cust) : a.newC;
    const oldC = a.oldC; // monthly_history ไม่เก็บลูกค้าเก่า → ใช้จาก daily
    const target = num(mRow && mRow.target);
    const acosCeil = num(meta.acosCeil) || 25;
    const messages = num(mRow && mRow.messages);

    const aov = ratio(actual, orders);
    const acos = pct(ad, actual);
    const roas = ratio(actual, ad);
    const cac = ratio(ad, newC);
    const run = DAY > 0 ? round2((actual / DAY) * DAYS) : '';
    const pctTarget = pct(actual, target);

    const monthLabel = TH_MONTH_ABBR[m - 1] + ' ' + yBE;
    const updated = mRow && mRow.updated_at ? Utilities.formatDate(new Date(mRow.updated_at), TZ, 'yyyy-MM-dd HH:mm') : '';
    return [
      monthLabel, m, yBE,
      round2(target), actual, pctTarget, run,
      orders, aov,
      ad, acos, roas, acosCeil,
      newC, oldC, cac, messages,
      updated,
    ];
  });
}

/* ---------- เขียน + จัดรูปแบบแท็บ ---------- */
function writeSheet(ss, name, headers, rows, fmt) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clearContents();
  // หัวตาราง
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#0c2236').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  if (rows.length) {
    sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  // ฟอร์แมตตัวเลขรายคอลัมน์ (fmt = { colIndex(1-based): 'numberFormat' })
  if (fmt) {
    Object.keys(fmt).forEach(col => {
      const c = Number(col);
      if (c <= headers.length) sh.getRange(2, c, Math.max(rows.length, 1), 1).setNumberFormat(fmt[col]);
    });
  }
  // ลบแถวส่วนเกิน (idempotent — ครั้งก่อนยาวกว่า)
  const maxRows = sh.getMaxRows();
  const used = rows.length + 1;          // header + data
  if (maxRows > used) sh.deleteRows(used + 1, maxRows - used);
  return sh;
}

/* ---------- ลงสีกลุ่มช่องทางในแท็บเดือน (หัว = สีช่องเต็ม, ข้อมูล = สีอ่อน) ---------- */
function colorChannelGroups(sh, channels, rowCount) {
  channels.forEach((ch, i) => {
    const base = 5 + i * 5; // 5 คอลัมน์ต่อช่อง เริ่มที่คอลัมน์ 5
    sh.getRange(1, base, 1, 5).setBackground(ch.hex).setFontColor(readableText(ch.hex)).setFontWeight('bold');
    if (rowCount > 0) sh.getRange(2, base, rowCount, 5).setBackground(tint(ch.hex, 0.14));
  });
}

/* ---------- จัดสไตล์แท็บตั้งค่าให้สวย (idempotent — ไม่แตะค่า B3/B4) ---------- */
function styleSettings(sh) {
  sh.getRange('A1:B1').merge().setBackground(NAVY).setFontColor('#ffffff')
    .setFontWeight('bold').setFontSize(14).setVerticalAlignment('middle');
  sh.setRowHeight(1, 40);
  sh.getRange('A3:A4').setFontWeight('bold').setFontColor(NAVY);
  sh.getRange('B3:B4').setBackground('#fff8e1').setFontWeight('bold')
    .setBorder(true, true, true, true, false, false, '#e0c060', SpreadsheetApp.BorderStyle.SOLID)
    .setNumberFormat('yyyy-mm-dd');
  // ปฏิทินเด้ง (ดับเบิลคลิกช่อง → เลือกวันจากปฏิทิน) — เว้นว่าง = ดึงทั้งหมด
  const dateRule = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(true)
    .setHelpText('ดับเบิลคลิกเพื่อเลือกวันจากปฏิทิน · เว้นว่าง = ดึงทั้งหมด').build();
  sh.getRange('B3:B4').setDataValidation(dateRule);
  sh.getRange('A6:A8').setFontWeight('bold').setFontColor('#475569');
  sh.getRange('B6:B8').setBackground('#f1f5f9').setFontColor('#0f172a');
  sh.getRange('A10').setFontStyle('italic').setFontColor('#94a3b8');
  sh.setColumnWidth(1, 232); sh.setColumnWidth(2, 220);
}

/* ---------- รูปแบบเงิน/เปอร์เซ็นต์ (dynamic ตามจำนวนช่อง) ---------- */
function dailyFmt(channels) {
  const m = {};
  const N = channels.length;
  // ต่อช่อง: คอลัมน์ 5,10,15,... เป็น 'ยอด ฿' ; +2 เป็น 'แอด ฿' (เริ่มที่คอลัมน์ 5)
  for (let i = 0; i < N; i++) {
    const base = 5 + i * 5;
    m[base] = '#,##0.00';      // ยอด ฿
    m[base + 2] = '#,##0.00';  // แอด ฿
  }
  // กลุ่มรวม (เริ่มหลังคอลัมน์ช่องทั้งหมด): ยอดรวม,ออเดอร์รวม,ค่าแอดรวม,ใหม่รวม,เก่ารวม,AOV,ACOS,ROAS,กำไร,CAC
  const t = 5 + 5 * N;
  m[t] = '#,##0.00';           // ยอดรวม ฿
  m[t + 2] = '#,##0.00';       // ค่าแอดรวม ฿
  m[t + 5] = '#,##0.00';       // AOV รวม ฿
  m[t + 6] = '#,##0.0"%"';     // ACOS รวม %
  m[t + 7] = '#,##0.00"x"';    // ROAS รวม
  m[t + 8] = '#,##0.00';       // กำไรหลังหักแอด ฿
  m[t + 9] = '#,##0.00';       // CAC รวม ฿
  return m;
}
function summaryFmt() {
  const m = {};
  [4, 5, 7, 9, 10, 16].forEach(c => m[c] = '#,##0.00'); // เป้า/ยอดจริง/RunRate/AOV/ค่าแอด/CAC
  [6, 11, 13].forEach(c => m[c] = '#,##0.0"%"');          // %เป้า/ACOS/เพดานACOS
  m[12] = '#,##0.00"x"';                                  // ROAS
  return m;
}

/* ---------- เรียงแท็บ: ตั้งค่า → สรุป → เดือนเก่า→ใหม่ ---------- */
function reorderTabs(ss) {
  const order = [];
  const settings = ss.getSheetByName(SETTINGS_SHEET); if (settings) order.push(settings);
  const summary = ss.getSheetByName(SUMMARY_SHEET); if (summary) order.push(summary);
  const months = ss.getSheets().filter(s => /^\d{4}-\d{2} /.test(s.getName()))
    .sort((a, b) => a.getName().localeCompare(b.getName())); // 'YYYY-MM ...' เรียงสตริง = เรียงเวลา
  months.forEach(s => order.push(s));
  order.forEach((s, i) => { ss.setActiveSheet(s); ss.moveActiveSheet(i + 1); });
}

/* ---------- แท็บตั้งค่า ---------- */
function ensureSettings(ss) {
  let sh = ss.getSheetByName(SETTINGS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SETTINGS_SHEET, 0);
    sh.getRange('A1').setValue('⚙️ ตั้งค่าการดึงข้อมูล TMK').setFontWeight('bold').setFontSize(13);
    sh.getRange('A3').setValue('วันที่เริ่ม (YYYY-MM-DD)');
    sh.getRange('A4').setValue('วันที่สิ้นสุด (YYYY-MM-DD)');
    sh.getRange('A6').setValue('เวลาดึงล่าสุด');
    sh.getRange('A7').setValue('จำนวนวันที่ดึง');
    sh.getRange('A8').setValue('จำนวนแถว (รายวัน)');
    sh.getRange('A10').setValue('เว้นวันที่ว่าง = ดึงทั้งหมด · กดเมนู TMK ▸ ⟳ ดึงข้อมูลล่าสุด')
      .setFontColor('#888888');
  }
  styleSettings(sh); // จัดสไตล์ + ปฏิทิน ทุกครั้ง (idempotent — ไม่แตะค่าที่กรอก)
  return sh;
}
function isRealDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const p = s.split('-').map(Number), y = p[0], m = p[1], d = p[2];
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);                       // ตรวจวันที่มีจริง (กัน 2026-02-30 / 2026-13-40)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
function cellDate(sh, a1) {
  const v = sh.getRange(a1).getValue();
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd'); // ค่าจากปฏิทิน = Date → แปลงเป็น ISO
  return String(v || '').trim();                                          // เว้นว่าง/ข้อความ
}
function readDateRange(ss) {
  const sh = ensureSettings(ss);
  const start = cellDate(sh, 'B3');
  const end = cellDate(sh, 'B4');
  if (start && !isRealDate(start)) throw new Error('วันที่เริ่มไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD เช่น 2026-01-01)');
  if (end && !isRealDate(end)) throw new Error('วันที่สิ้นสุดไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD เช่น 2026-06-30)');
  if (start && end && start > end) throw new Error('ช่วงวันที่ไม่ถูกต้อง: วันที่เริ่ม (' + start + ') อยู่หลังวันที่สิ้นสุด (' + end + ')');
  return { start: isRealDate(start) ? start : '', end: isRealDate(end) ? end : '' };
}

/* ---------- main: ดึงทั้งชีต ---------- */
function syncAll() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  try {
    const { start, end } = readDateRange(ss);
    // 1) โหลดทั้งหมดให้สำเร็จก่อน (ถ้าพลาด = ไม่แตะแท็บเดิม)
    const data = loadAll(start, end);
    if (!data.channels.length) throw new Error('ไม่พบช่องทางใน tmk_channels');

    // กรองแถวที่วันที่เพี้ยน/ว่างออกครั้งเดียว → byMonth/สรุป/ตัวนับ ใช้ชุดเดียวกัน (เลขที่โชว์ตรงกับที่เขียนจริง)
    const daily = data.daily.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(String(d.date)));
    const skipped = data.daily.length - daily.length;

    // 2) สร้างแถว
    const byMonth = buildDailyRows(daily, data.channels);
    const summaryRows = buildSummaryRows(daily, data.monthly, data.channels);

    // 3) เขียนแท็บสรุป
    ensureSettings(ss);
    writeSheet(ss, SUMMARY_SHEET, SUMMARY_HEADERS, summaryRows, summaryFmt());

    // 4) เขียนแท็บเดือน (เฉพาะเดือนที่มีข้อมูล) — หัวตาราง/ฟอร์แมต dynamic ตามช่องทาง
    const dHeaders = dailyHeaders(data.channels);
    const dFmt = dailyFmt(data.channels);
    const monthKeys = Object.keys(byMonth).sort();
    monthKeys.forEach(key => {
      const info = byMonth[key];
      const tabName = key + ' ' + TH_MONTH_ABBR[info.m - 1] + (String((info.y + 543) % 100).padStart(2, '0'));
      const sh = writeSheet(ss, tabName, dHeaders, info.rows, dFmt);
      colorChannelGroups(sh, data.channels, info.rows.length); // ลงสีแต่ละแพลตฟอร์ม
    });

    // 4.5) ลบแท็บเดือน "ค้าง" ที่ไม่มีข้อมูลในรอบนี้แล้ว (เช่น แคบช่วงวันที่/ลบข้อมูลต้นทาง) → mirror ตรงเสมอ
    const keep = {}; monthKeys.forEach(k => { keep[k] = true; });
    ss.setActiveSheet(ensureSettings(ss)); // ออกจากแท็บเดือนก่อนลบ (กันลบแท็บที่ active อยู่)
    ss.getSheets().forEach(s => {
      const mt = s.getName().match(/^(\d{4}-\d{2}) /);
      if (mt && !keep[mt[1]] && ss.getSheets().length > 1) ss.deleteSheet(s);
    });

    // 5) เรียงแท็บ + อัปเดตสถานะ
    reorderTabs(ss);
    const set = ensureSettings(ss);
    set.getRange('B6').setValue(Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'));
    set.getRange('B7').setValue(daily.length ? new Set(daily.map(d => d.date)).size : 0);
    set.getRange('B8').setValue(daily.length * data.channels.length);

    ui.alert('ดึงข้อมูลเรียบร้อย ✓',
      'เดือน: ' + monthKeys.length + ' แท็บ\n' +
      'วันรายวัน: ' + daily.length + ' วัน' + (skipped ? (' (ข้ามวันที่เพี้ยน ' + skipped + ')') : '') + '\n' +
      'ช่องทาง: ' + data.channels.length + '\n' +
      (start || end ? ('ช่วง: ' + (start || 'เริ่มต้น') + ' → ' + (end || 'ล่าสุด')) : 'ทั้งหมด'),
      ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('ดึงข้อมูลไม่สำเร็จ', String(err && err.message || err) + '\n\n(ข้อมูลเดิมในชีตไม่ถูกแตะ)', ui.ButtonSet.OK);
  }
}

/* ---------- ตั้งค่าเริ่มต้น (สร้างแท็บระบบ) ---------- */
function initSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSettings(ss);
  if (!ss.getSheetByName(SUMMARY_SHEET)) writeSheet(ss, SUMMARY_SHEET, SUMMARY_HEADERS, [], summaryFmt());
  reorderTabs(ss);
  SpreadsheetApp.getUi().alert('สร้างแท็บระบบแล้ว', 'กรอกช่วงวันที่ (ถ้าต้องการ) แล้วกด TMK ▸ ⟳ ดึงข้อมูลล่าสุด', SpreadsheetApp.getUi().ButtonSet.OK);
}
