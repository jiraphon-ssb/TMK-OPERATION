/* ============================================================
   lotOps.js — จัดการล็อต (pure functions · deep-clone · ไม่แตะของเดิม)
   ============================================================
   ใช้กับ: รับคืน (restock) · ตัดสต็อกจากยอดมาร์เก็ตเพลส (deduct FIFO)
   โครงล็อต: { id, lotNo, date, cost, colors:[{id,name,hex}], sizes:[], grid:{colorId:{size:qty}} }
   ============================================================ */

const clone = (x) => JSON.parse(JSON.stringify(x || []));
const num = (v) => Number(v) || 0;

export function lotsTotal(lots) {
  let t = 0;
  for (const l of lots || []) for (const cid in (l.grid || {})) for (const s in l.grid[cid]) t += num(l.grid[cid][s]);
  return t;
}

/**
 * ตัดสต็อก qty จากล็อต — FIFO (ล็อตเก่าสุดก่อน) · เลือก cell ที่ตรง color+size ก่อน → color → ใดก็ได้
 * คืน { lots, deducted, short } (short>0 = ของไม่พอ)
 */
export function deductLots(lots, color, size, qty) {
  const out = clone(lots);
  let need = num(qty);
  const sorted = out.slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const pass = (matchColor, matchSize) => {
    for (const l of sorted) {
      if (need <= 0) break;
      for (const c of (l.colors || [])) {
        if (need <= 0) break;
        if (matchColor && c.name !== color) continue;
        const grid = l.grid?.[c.id]; if (!grid) continue;
        for (const s of Object.keys(grid)) {
          if (need <= 0) break;
          if (matchSize && s !== size) continue;
          const have = num(grid[s]); if (have <= 0) continue;
          const take = Math.min(have, need); grid[s] = have - take; need -= take;
        }
      }
    }
  };
  if (color && size) pass(true, true);
  if (need > 0 && color) pass(true, false);
  if (need > 0) pass(false, false);
  return { lots: out, deducted: num(qty) - need, short: need };
}

/**
 * รับคืนเข้าสต็อก qty — เพิ่มเข้า cell ที่ตรง color/size ในล็อตแรกที่มีสีนั้น
 * ถ้าไม่เจอสีในล็อตไหนเลย → สร้างล็อต "คืน" ใหม่
 * คืน { lots }
 */
export function restockLots(lots, color, size, qty, opts = {}) {
  const out = clone(lots);
  const n = num(qty); if (n <= 0) return { lots: out };
  for (const l of out) {
    const c = (l.colors || []).find(x => x.name === color);
    if (c) { l.grid = l.grid || {}; l.grid[c.id] = l.grid[c.id] || {}; l.grid[c.id][size] = num(l.grid[c.id][size]) + n; return { lots: out }; }
  }
  // ไม่เจอสี → ล็อตคืนใหม่
  const cid = 'c-' + Math.random().toString(36).slice(2, 7);
  out.push({
    id: 'lot-ret-' + Date.now().toString(36), lotNo: opts.lotNo || 'RETURN', date: opts.date || new Date().toISOString().slice(0, 10),
    cost: num(opts.cost), note: opts.note || 'รับคืน', colors: [{ id: cid, name: color || 'ไม่ระบุสี', hex: '#ccc' }], sizes: [size], grid: { [cid]: { [size]: n } },
  });
  return { lots: out };
}
