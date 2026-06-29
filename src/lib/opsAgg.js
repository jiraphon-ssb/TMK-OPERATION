/* ============================================================
   opsAgg.js — analytics ระบบคลัง (PART P1)
   ============================================================
   คำนวณจาก TMK.products (derived fields ที่ dataContext ทำแล้ว) — ไม่ดึง DB ซ้ำ
   ผลใช้ใน แดชบอร์ดคลัง / รายงานคลัง: margin · sell-through · ABC · aging · dead-stock · reorder
   ============================================================ */

const num = (v) => Number(v) || 0;

// เมตริกต่อสินค้า 1 ตัว
export function productMetrics(p) {
  const onHand = num(p.onHand), value = num(p.stockValue), sold = num(p.units), price = num(p.price);
  const avgCost = onHand > 0 && value > 0 ? value / onHand : 0;
  const unitProfit = avgCost ? price - avgCost : null;
  const marginPct = unitProfit != null && price > 0 ? (unitProfit / price) * 100 : null;
  const sellThrough = (sold + onHand) > 0 ? (sold / (sold + onHand)) * 100 : 0;
  // อัตราหมุน (สะสม) ≈ มูลค่าทุนที่ขายไป / มูลค่าทุนคงเหลือ
  const turnover = value > 0 ? (sold * avgCost) / value : 0;
  return { onHand, value, sold, price, avgCost, unitProfit, marginPct, sellThrough, turnover };
}

// อายุสต็อก (วัน) จากล็อตเก่าสุดที่ยังมีของ
export function ageDays(p, todayISO) {
  if (!p.oldestLotDate) return null;
  const d0 = new Date(p.oldestLotDate + 'T00:00:00');
  const d1 = new Date((todayISO || new Date().toISOString().slice(0, 10)) + 'T00:00:00');
  return Math.max(0, Math.round((d1 - d0) / 864e5));
}

export const AGING_BUCKETS = [
  { key: '0-30', label: '0–30 วัน', max: 30 },
  { key: '31-90', label: '31–90 วัน', max: 90 },
  { key: '91-180', label: '91–180 วัน', max: 180 },
  { key: '180+', label: '180+ วัน', max: Infinity },
];
export function agingBucket(days) {
  if (days == null) return null;
  return AGING_BUCKETS.find(b => days <= b.max)?.key || '180+';
}

// reorder: แนะนำจำนวนสั่ง = ทำให้กลับเหนือจุดสั่งซ้ำ (อย่างน้อย = reorder)
export const suggestReorder = (p) => Math.max(num(p.reorder), num(p.reorder) * 2 - num(p.onHand), 0);

/**
 * รวมภาพรวมคลังทั้งหมด — คืน totals + ABC + aging + deadStock + reorderList + perProduct
 * dead-stock = มีของ (onHand>0) + ขายไม่ออก (units=0) + อายุ > 90 วัน
 */
export function aggOps(products, todayISO) {
  const items = (products || []).map(p => {
    const m = productMetrics(p);
    const age = ageDays(p, todayISO);
    return { p, ...m, age, bucket: agingBucket(age), deadStock: m.onHand > 0 && m.sold === 0 && (age || 0) > 90 };
  });

  const totals = {
    skus: items.length,
    units: items.reduce((a, x) => a + x.onHand, 0),
    value: items.reduce((a, x) => a + x.value, 0),
    reserved: (products || []).reduce((a, p) => a + num(p.reservedTotal), 0),
    available: (products || []).reduce((a, p) => a + num(p.available ?? p.onHand), 0),
    low: items.filter(x => x.p.stock === 'low').length,
    out: items.filter(x => x.p.stock === 'out').length,
    deadValue: items.filter(x => x.deadStock).reduce((a, x) => a + x.value, 0),
    deadCount: items.filter(x => x.deadStock).length,
  };

  // ABC: Pareto สะสมตามมูลค่าสต็อก (A≤80% / B≤95% / C ที่เหลือ)
  const byValue = [...items].filter(x => x.value > 0).sort((a, b) => b.value - a.value);
  const totalVal = byValue.reduce((a, x) => a + x.value, 0) || 1;
  let cum = 0;
  const abcOf = new Map();
  for (const x of byValue) { cum += x.value; const pct = cum / totalVal; abcOf.set(x.p.id, pct <= 0.8 ? 'A' : pct <= 0.95 ? 'B' : 'C'); }
  items.forEach(x => { x.abc = abcOf.get(x.p.id) || (x.value > 0 ? 'C' : '—'); });
  const abcSummary = ['A', 'B', 'C'].map(c => {
    const g = items.filter(x => x.abc === c);
    return { class: c, count: g.length, value: g.reduce((a, x) => a + x.value, 0) };
  });

  // aging: รวมมูลค่าต่อช่วงอายุ
  const aging = AGING_BUCKETS.map(b => {
    const g = items.filter(x => x.bucket === b.key);
    return { ...b, count: g.length, units: g.reduce((a, x) => a + x.onHand, 0), value: g.reduce((a, x) => a + x.value, 0) };
  });

  // reorder: สินค้าที่ต้องสั่ง (low/out) + จำนวนแนะนำ
  const reorderList = items
    .filter(x => x.p.stock === 'low' || x.p.stock === 'out')
    .map(x => ({ ...x, suggest: suggestReorder(x.p) }))
    .sort((a, b) => (a.p.stock === 'out' ? 0 : 1) - (b.p.stock === 'out' ? 0 : 1) || b.value - a.value);

  // valuation ตามหมวด
  const byCat = (() => {
    const m = new Map();
    items.forEach(x => { const k = x.p.category || 'ไม่ระบุหมวด'; const r = m.get(k) || { key: k, count: 0, units: 0, value: 0 }; r.count++; r.units += x.onHand; r.value += x.value; m.set(k, r); });
    return [...m.values()].sort((a, b) => b.value - a.value);
  })();

  return { items, totals, abcSummary, aging, reorderList, byCat };
}
