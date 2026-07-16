/* ============================================================
   computeMonthPure.js — แกนคำนวณ "ยอดขายจริง (operational truth)" รายเดือน (PART 84 Phase 6)
   ============================================================
   pure ล้วน — behavior-preserving extraction จาก computeMonth() ใน dataContext.jsx
   เดิมอ่าน TMK singleton + getToday() ตรง ๆ → แยกเป็น pure function ที่ inject ctx เข้ามา
   เพื่อ (1) ทำให้ operational-truth เทสต์ได้ (money-critical) (2) ลด coupling กับ TMK
   ctx = { dailyAll, monthly, channels, clv, today }  (today = { yearBE, month, day } จาก getToday())
   → dataContext.computeMonth เป็น thin wrapper: ส่ง TMK.* + getToday() เข้ามา
   ============================================================ */
import { THAI_MONTHS } from './dateUtils.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const _ABBR = THAI_MONTHS;

export function computeMonthPure(monthIdx0, yearBE, ctx) {
  const { dailyAll = [], monthly = [], channels: chBase = [], clv = 0, today } = ctx || {};
  const monthNum = monthIdx0 + 1;
  const isCurrent = yearBE === today.yearBE && monthNum === today.month;
  const isFuture = yearBE > today.yearBE || (yearBE === today.yearBE && monthNum > today.month);
  const DAYS = new Date(yearBE - 543, monthNum, 0).getDate();
  const DAY = isCurrent ? today.day : isFuture ? 0 : DAYS;

  const rows = (dailyAll || []).filter(r => r.year === yearBE && r.month === monthNum);
  const mRow = (monthly || []).find(m => m.year === yearBE && m.month === monthNum);
  const meta = (mRow && mRow.meta) || {};
  const TARGET = Number(mRow?.target || 0);
  // งบแอดรวม = meta.adBudget (รวมอัตโนมัติตอนเซฟ) — fallback บวกจากงบต่อช่อง เผื่อข้อมูลเก่ายังไม่ได้เซฟใหม่
  const AD_BUDGET = Number(meta.adBudget || 0) || Object.values(meta.adChannels || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  const ACOS_CEIL = Number(meta.acosCeil || 25);

  const channels = (chBase || []).map(base => {
    let rev = 0, ord = 0, ad = 0, newC = 0, oldC = 0;
    rows.forEach(r => { const c = r.ch[base.id]; if (c) { rev += c.rev; ord += c.ord; ad += c.ad; newC += c.newC; oldC += c.oldC; } });
    const inq = newC + oldC; // "คนทัก" = ลูกค้าใหม่ + เก่า (นิยามรวมจำนวนลูกค้า)
    return { ...base, actual: round2(rev), orders: ord, ad: round2(ad), newCust: newC, oldCust: oldC, inq, newRev: 0, oldRev: 0,
      target: Number((meta.channelTargets && meta.channelTargets[base.id]) || 0),
      adBudget: Number((meta.adChannels && meta.adChannels[base.id]) || 0) };
  });

  // fallback: เดือนอดีตที่กรอกผ่าน "ข้อมูลย้อนหลัง" (มี monthly.actual แต่ไม่มี daily) → ใช้ยอดรายเดือน (กัน SalesView โชว์ ฿0 ทั้งที่กราฟมียอด)
  // โหมดข้อมูลของเดือน (meta.entryMode): 'monthly' = ใช้ยอดรวมรายเดือน · 'daily' = ใช้ผลรวมรายวัน
  // อดีตที่มียอดรวมรายเดือน → ใช้ยอดรวมเสมอ (กันข้อมูลรายวันบางส่วนมา "ทับ" ยอดรวมหาย) เว้นแต่เลือกโหมด 'daily' ชัดเจน
  // (เดือนปัจจุบัน/อนาคต = สดจาก daily เสมอ)
  const _useMonthly = !isFuture && !isCurrent && Number(mRow?.actual || 0) > 0 && meta.entryMode !== 'daily';
  const MTD = round2(_useMonthly ? Number(mRow.actual || 0) : channels.reduce((s, c) => s + c.actual, 0));
  const ORD = _useMonthly ? Number(mRow.orders || 0) : channels.reduce((s, c) => s + c.orders, 0);
  const AD = round2(_useMonthly ? Number(mRow.adSpend || 0) : rows.reduce((s, r) => s + r.adSpend, 0));
  const NEW_C = _useMonthly ? Number(mRow.newCust || 0) : channels.reduce((s, c) => s + c.newCust, 0);
  const OLD_C = channels.reduce((s, c) => s + c.oldCust, 0);
  const AOV = ORD > 0 ? MTD / ORD : 0;
  const PACE_TGT = (DAYS > 0 && DAY > 0) ? (TARGET / DAYS) * DAY : 0; // ไม่ปัดเศษ
  const PACE_PCT = PACE_TGT > 0 ? (MTD / PACE_TGT) * 100 : 0;
  const RUN = DAY > 0 ? (MTD / DAY) * DAYS : 0;                       // ไม่ปัดเศษ
  const ACOS_TOT = MTD > 0 ? (AD / MTD) * 100 : 0;

  const dailyMonth = rows.map(r => ({ d: r.day, rev: round2(Object.values(r.ch).reduce((s, c) => s + c.rev, 0)) }));
  const dailyLog = [...rows].sort((a, b) => b.day - a.day).slice(0, 7).map(r => ({
    date: `${r.day} ${_ABBR[monthNum - 1]}`, day: r.dayName,
    iso: `${yearBE - 543}-${String(monthNum).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`,
    shopee: r.ch.shopee?.rev || 0, tiktok: r.ch.tiktok?.rev || 0, lazada: r.ch.lazada?.rev || 0,
    facebook: r.ch.facebook?.rev || 0, line: r.ch.line?.rev || 0, crm: r.ch.crm?.rev || 0,
    total: round2(Object.values(r.ch).reduce((s, c) => s + (c.rev || 0), 0)), // รวม "ทุกช่องทาง" (รวมช่องที่เพิ่มเอง) — ตรงกับปฏิทิน
    ord: Object.values(r.ch).reduce((s, c) => s + (c.ord || 0), 0), // รวมออเดอร์ทุกช่อง
    ad: r.adSpend, note: r.note,
  }));
  // เจาะลึกรายวัน: แต่ละวันยอดมาจากช่องทางไหน กี่บาท กี่% (ทุกช่อง, ทุกวันที่กรอก, ล่าสุดก่อน)
  const dailyBreakdown = [...rows].sort((a, b) => b.day - a.day).map(r => {
    const perCh = (chBase || []).map(base => ({ id: base.id, name: base.name, hex: base.hex, rev: round2(r.ch[base.id]?.rev || 0) })).filter(c => c.rev > 0); // คงลำดับช่องทางมาตรฐาน (channels sort แล้ว) — legend/แท่ง สีตรงกันทุกวัน
    const tot = round2(perCh.reduce((s, c) => s + c.rev, 0));
    return { d: r.day, label: `${r.day} ${_ABBR[monthNum - 1]}`, dayName: r.dayName, total: tot, channels: perCh.map(c => ({ ...c, pct: tot > 0 ? (c.rev / tot) * 100 : 0 })) };
  });

  // FB deep-dive ของเดือนที่เลือก — มาจากช่องทาง facebook รายวันของเดือนนั้น
  const fbCh = channels.find(c => c.id === 'facebook') || { actual: 0, orders: 0, ad: 0, newCust: 0, oldCust: 0, inq: 0 };
  const fb = {
    revenue: fbCh.actual, spend: fbCh.ad, inquiries: fbCh.inq || 0, orders: fbCh.orders,
    newCust: fbCh.newCust, oldCust: fbCh.oldCust,
    roas: fbCh.ad > 0 ? fbCh.actual / fbCh.ad : 0,
    acos: fbCh.actual > 0 ? (fbCh.ad / fbCh.actual) * 100 : 0,
    conv: (fbCh.inq || 0) > 0 ? (fbCh.orders / fbCh.inq) * 100 : 0,
    aov: fbCh.orders > 0 ? fbCh.actual / fbCh.orders : 0,
    cpInq: (fbCh.inq || 0) > 0 ? fbCh.ad / fbCh.inq : 0,
    cpOrd: fbCh.orders > 0 ? fbCh.ad / fbCh.orders : 0,
    cac: fbCh.newCust > 0 ? fbCh.ad / fbCh.newCust : 0,
    // เวลาตอบแชทเฉลี่ย = เฉลี่ยจากค่าที่กรอกรายวันของเดือนนั้น (นับเฉพาะวันที่กรอก > 0)
    avgReplyMinutes: (() => {
      const v = rows.map(r => r.replyMin).filter(x => x > 0);
      return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
    })(),
  };

  // กราฟ 3 เดือนล่าสุด + YoY ของ "เดือนที่เลือก" (ตามเดือนที่เลือก ไม่ผูกกับเดือนปัจจุบัน)
  const _allM = monthly || [];
  const month3 = [];
  for (let off = 2; off >= 0; off--) {
    let mo = monthNum - off, yr = yearBE;
    while (mo < 1) { mo += 12; yr -= 1; }
    const r = _allM.find(m => m.year === yr && m.month === mo);
    const isSel = off === 0;
    // เดือนที่เลือก & เป็นเดือนปัจจุบัน → ทำได้ = MTD (ทึบ) + คาดการณ์ที่เหลือ = Run rate − MTD (จาง)
    const a = (isSel && isCurrent) ? MTD : Number(r?.actual || 0);
    const pj = (isSel && isCurrent) ? Math.max(0, RUN - MTD) : Number(r?.projected || 0);
    month3.push({ m: _ABBR[mo - 1], actual: a, proj: pj });
  }
  const _lastYr = yearBE - 1;
  const yoy = [];
  for (let mo = 1; mo <= 12; mo++) {
    const cur = _allM.find(m => m.year === yearBE && m.month === mo);
    const prev = _allM.find(m => m.year === _lastYr && m.month === mo);
    if (cur || prev) yoy.push({ m: _ABBR[mo - 1], y25: Number(prev?.actual || 0), y26: Number(cur?.actual || 0) });
  }
  // FB message trend ของ "เดือนที่เลือก" (เดือนต้นปีถึงเดือนที่เลือก) — ตามเดือน ไม่ผูกปัจจุบัน
  const fbMsgTrend = _allM
    .filter(m => m.year === yearBE && m.month <= monthNum)
    .sort((a, b) => a.month - b.month)
    .map(m => ({ m: _ABBR[m.month - 1], v: Number(m.messages || 0) }));

  // อัตราลูกค้าเก่า (ซื้อซ้ำ) รายสัปดาห์ — จากจำนวน newC/oldC รายวันจริง (ไม่ใช่รายได้ ระบบไม่เก็บรายได้แยกใหม่/เก่า)
  const _wk = {};
  rows.forEach(r => {
    const k = Math.ceil(r.day / 7); // สัปดาห์ที่ 1-5 ของเดือน
    const w = _wk[k] || (_wk[k] = { newC: 0, oldC: 0 });
    Object.values(r.ch).forEach(c => { w.newC += Number(c.newC || 0); w.oldC += Number(c.oldC || 0); });
  });
  const custWeekly = Object.keys(_wk).map(Number).sort((a, b) => a - b).map(k => {
    const w = _wk[k], tot = w.newC + w.oldC;
    return { week: k, newC: w.newC, oldC: w.oldC, returningPct: tot > 0 ? (w.oldC / tot) * 100 : 0 };
  });

  return {
    consts: { TARGET, DAY, DAYS, ACOS_CEIL, AD_BUDGET },
    channels, dailyMonth, dailyLog, dailyBreakdown, enteredDays: rows.length, isCurrent, isFuture, fb, month3, yoy, fbMsgTrend, custWeekly,
    computed: { MTD, ORD, AD, NEW_REV: 0, OLD_REV: 0, NEW_C, OLD_C, PACE_TGT, PACE_PCT, RUN, AOV, ACOS_TOT, CLV: clv || 0 },
  };
}
