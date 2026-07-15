/* ============================================================
   csv.js — pure CSV helpers (PART 84 REFACTOR-1)
   ============================================================
   ย้าย logic บริสุทธิ์ออกจาก saleWidgets.jsx (_csvEsc) + views-settings.jsx (export builders)
   → เทสต์ได้ (มี security behavior: formula-injection escape) + ลด god-file
   side-effect (Blob/download/audit/toast) ยังอยู่ที่ view — ที่นี่คืน "string" ล้วน
   ============================================================ */

// escape เซลล์ CSV — กัน formula-injection (=+-@ นำหน้า) แต่ไม่ทำเลขลบเป็น text · ครอบ quote/comma/newline
export const csvEsc = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// สร้าง CSV "ส่งออกข้อมูลทั้งหมด" (หลาย section) — รับ snapshot จาก TMK singleton (pure)
// data: { dailyAll, monthly, audit, channels, products, tasks, campaigns, adCampaigns }
export function buildAllCsv(data = {}) {
  const esc = csvEsc;
  const dailyRows = [];
  (data.dailyAll || []).forEach(d => {
    const dateStr = `${d.year - 543}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
    Object.entries(d.ch || {}).forEach(([chId, c]) => {
      dailyRows.push({ date: dateStr, channel: chId, rev: r2(c.rev || 0), ord: c.ord || 0, ad: r2(c.ad || 0), inq: (c.newC || 0) + (c.oldC || 0), newC: c.newC || 0, oldC: c.oldC || 0 });
    });
  });
  const monthlyRows = (data.monthly || []).map(m => ({
    year: m.year - 543, month: m.month, target: m.target, actual: r2(m.actual), adSpend: r2(m.adSpend), orders: m.orders, newCust: m.newCust,
  }));
  const auditRows = (data.audit || []).map(a => ({
    ts: a.ts || '', user: a.user || '', action: a.action || '', entity: a.entityType || '', name: a.entityName || '', summary: a.summary || '',
  }));
  const sections = [
    ['ช่องทาง — เดือนปัจจุบัน (Channels — current month)', ['name', 'target', 'actual', 'orders', 'ad'], data.channels || []],
    ['สินค้า (Products)', ['name', 'price', 'units', 'onHand', 'stockValue', 'reorder'], data.products || []],
    ['งาน (Tasks)', ['title', 'date', 'status', 'camp', 'channel'], data.tasks || []],
    ['แคมเปญ (Campaigns)', ['name', 'status', 'start', 'end'], data.campaigns || []],
    ['แคมเปญแอด (Ad)', ['name', 'platform', 'budget', 'spent', 'status'], data.adCampaigns || []],
    ['ยอดรายวันต่อช่องทาง (Daily × Channel)', ['date', 'channel', 'rev', 'ord', 'ad', 'inq', 'newC', 'oldC'], dailyRows],
    ['สรุปรายเดือน (Monthly Summary)', ['year', 'month', 'target', 'actual', 'adSpend', 'orders', 'newCust'], monthlyRows],
    ['ประวัติการใช้งาน (Audit Log)', ['ts', 'user', 'action', 'entity', 'name', 'summary'], auditRows],
  ];
  let csv = '';
  sections.forEach(([title, cols, rows]) => {
    csv += title + '\n' + cols.join(',') + '\n';
    rows.forEach(r => { csv += cols.map(c => esc(Array.isArray(r[c]) ? r[c].join(' ') : r[c])).join(',') + '\n'; });
    csv += '\n';
  });
  return csv;
}

// สร้าง CSV "รายงานรายเดือน" — สรุปรวม + ต่อช่องทาง (ROAS) + ยอดรายวัน×ช่องทาง (pure)
// อาร์กิวเมนต์: { md (computeMonth), dailyAll, channelNameById, monthTH, yearBE, month }
export function buildMonthlyReportCsv({ md, dailyAll = [], channelNameById = {}, monthTH, yearBE, month }) {
  const esc = csvEsc;
  let csv = `รายงานยอดขายเดือน ${monthTH} ${yearBE}\n\n`;
  csv += 'สรุปรวม\n';
  csv += `เป้าเดือน,${md.consts.TARGET}\nยอด,${md.computed.MTD}\nออเดอร์,${md.computed.ORD}\nค่าแอดรวม,${md.computed.AD}\nลูกค้าใหม่,${md.computed.NEW_C}\n\n`;
  csv += 'ช่องทาง,เป้า,ยอด,%เป้า,ออเดอร์,ค่าแอด,ROAS\n';
  (md.channels || []).forEach(c => {
    const pct = c.target > 0 ? ((c.actual / c.target) * 100).toFixed(1) : '';
    const roas = c.ad > 0 ? (c.actual / c.ad).toFixed(2) : '';
    csv += [esc(c.name), c.target, c.actual, pct, c.orders, c.ad, roas].join(',') + '\n';
  });
  csv += '\n';
  csv += 'ยอดรายวันต่อช่องทาง\nวันที่,ช่องทาง,รายได้,ออเดอร์,ค่าแอด,คนทัก,ลูกค้าใหม่,ลูกค้าเก่า\n';
  const rows = (dailyAll || []).filter(r => r.year === yearBE && r.month === month).sort((a, b) => a.day - b.day);
  rows.forEach(r => {
    const dateStr = `${r.year - 543}-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`;
    Object.entries(r.ch || {}).forEach(([chId, c]) => {
      csv += [dateStr, esc(channelNameById[chId] || chId), r2(c.rev || 0), c.ord || 0, r2(c.ad || 0), (c.newC || 0) + (c.oldC || 0), c.newC || 0, c.oldC || 0].join(',') + '\n';
    });
  });
  return csv;
}
