// สัญญาณภาพรวม (PART 34) — เงื่อนไข/สภาวะระบบที่คำนวณสดจาก TMK (ไม่เก็บ DB, ไม่ "อ่าน/ปิด" ได้)
// ต่างจาก Inbox (เหตุการณ์ที่เก็บถาวร) — แยกโซนกันชัด เลิกเด้งซ้ำกับ due-sweep
// หมายเหตุ: งาน "ใกล้ครบ/เลยกำหนด" ย้ายไปอยู่ Inbox (due-sweep) แล้ว จึงไม่อยู่ที่นี่อีก
import { TMK } from '../data.js';
import { B, N } from '../components.jsx';
import { THAI_MONTHS, todayISO } from './dateUtils.js';

// prefOn(key) → true/false (ค่าจาก store; default เปิด)
export function computeSignals(prefOn = () => true) {
  const todayDay = TMK.consts?.DAY;
  const Cm = TMK.computed || {};

  // ลืมกรอกยอดขายวันนี้
  const todaysales = (prefOn('daily') && !((TMK.dailyMonth || []).some(d => d.d === todayDay)))
    ? [{ id: 'today-sales', kind: 'todaysales', title: 'ยังไม่ได้กรอกยอดขายวันนี้', txt: 'กรอกเลย' }]
    : [];

  // ยังไม่สรุปยอดเดือนก่อน
  const lastmonth = prefOn('monthly') ? (() => {
    const cm = TMK.consts?.current_month, cy = TMK.consts?.current_year;
    if (!cm) return [];
    const pm = cm === 1 ? 12 : cm - 1;
    const py = cm === 1 ? cy - 1 : cy;
    const rec = (TMK.monthly || []).find(m => m.month === pm && m.year === py);
    const hasDaily = (TMK.dailyAll || []).some(d => d.year === py && d.month === pm);
    if ((rec && rec.actual > 0) || hasDaily) return [];
    return [{ id: 'lastmonth', kind: 'lastmonth', title: `ยังไม่ได้สรุปยอดเดือน${THAI_MONTHS[pm - 1]}`, txt: 'กรอกย้อนหลัง' }];
  })() : [];

  // สัญญาณยอดขาย/ค่าแอด
  const sales = prefOn('sales') ? (() => {
    const out = [];
    const ceil = TMK.consts?.ACOS_CEIL || 25;
    (TMK.channels || []).forEach(c => {
      if (c.actual > 0 && c.ad > 0) {
        const acos = (c.ad / c.actual) * 100;
        if (acos > ceil) out.push({ id: 'acos-' + c.id, kind: 'sales', title: `${c.name}: ค่าแอด ${acos.toFixed(0)}% ของยอด (เพดาน ${ceil}%)`, txt: 'ดูภาพรวม' });
      }
    });
    if ((TMK.consts?.TARGET || 0) > 0 && typeof Cm.PACE_PCT === 'number' && Cm.PACE_PCT < 90) {
      out.push({ id: 'pace', kind: 'sales', title: `ยอดช้ากว่าแผน — จังหวะทำยอด ${Cm.PACE_PCT.toFixed(0)}%`, txt: 'ดูภาพรวม' });
    }
    const adBudget = Number(TMK.consts?.AD_BUDGET || 0);
    if (adBudget > 0 && Number(Cm.AD || 0) > adBudget) {
      out.push({ id: 'ad-over', kind: 'sales', title: `ใช้งบโฆษณาเกินที่ตั้ง (${B(Cm.AD)} / ${B(adBudget)})`, txt: 'ดูภาพรวม' });
    }
    const cm = TMK.consts?.current_month, cy = TMK.consts?.current_year;
    const curMonthRow = (TMK.monthly || []).find(m => m.month === cm && m.year === cy);
    const newCTarget = Number(curMonthRow?.meta?.newCustTarget || 0);
    if (newCTarget > 0 && TMK.consts?.DAYS > 0) {
      const expected = (TMK.consts.DAY / TMK.consts.DAYS) * newCTarget;
      const newCPace = expected > 0 ? (Number(Cm.NEW_C || 0) / expected) * 100 : 100;
      if (newCPace < 90) out.push({ id: 'newc-pace', kind: 'sales', title: `ลูกค้าใหม่ช้ากว่าแผน — pace ${newCPace.toFixed(0)}% (เป้า ${N(newCTarget)} คน/เดือน)`, txt: 'ดูลูกค้า' });
    }
    return out;
  })() : [];

  // ออเดอร์ค้าง pending/processing > 2 วัน
  const orders = prefOn('orders') ? (() => {
    const out = [];
    const cutoff = new Date(Date.now() - 2 * 86400000).toISOString();
    (TMK.orders || []).filter(o => ['pending', 'processing'].includes(o.status) && o.createdAt && o.createdAt < cutoff).forEach(o => {
      const days = Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 86400000);
      out.push({ id: 'order-' + o.id, kind: 'orders', title: `ออเดอร์ ${o.code} ค้าง ${days} วัน (${o.customerName || '—'})`, txt: 'ไปบอร์ดออเดอร์' });
    });
    return out.slice(0, 10);
  })() : [];

  const groups = [
    { key: 'todaysales', label: 'บันทึกวันนี้', items: todaysales, color: 'var(--accent)' },
    { key: 'sales', label: 'ยอดขาย/แอด', items: sales, color: 'var(--warn)' },
    { key: 'orders', label: 'ออเดอร์ค้าง', items: orders, color: 'var(--warn)' },
    { key: 'lastmonth', label: 'เดือนที่แล้ว', items: lastmonth, color: 'var(--bad)' },
  ].filter(g => g.items.length > 0);

  const all = groups.flatMap(g => g.items.map(it => ({ ...it, _color: g.color })));
  return { signals: all, signalGroups: groups, count: all.length };
}

// นำทางจาก signal — แหล่งเดียว (เดิมกระจายใน App.onNotifClick)
export function navigateSignal(n) {
  if (!n) return;
  const go = (sec, sub) => window.__goSection?.(sec, sub);
  switch (n.kind) {
    case 'todaysales': window.__openModal?.('record', { date: todayISO() }); return;
    case 'sales': go('sales', n.id === 'newc-pace' ? 'customers' : 'overview'); return;
    case 'orders': go('catalog', 'orders'); return;
    case 'lastmonth': go('sales', 'monthly'); setTimeout(() => window.__openModal?.('historical'), 100); return;
    default: go('flows', 'kanban');
  }
}
