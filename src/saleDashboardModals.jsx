/* ============================================================
   saleDashboardModals.jsx — popup ของรายงานขาย
   แยกมาจาก saleDashboard.jsx (ยกมาทั้งดุ้น ไม่แก้เนื้อใน): DrillModal · DashDayDetail
   ============================================================ */
import { useMemo } from 'react';
import { N } from './components.jsx';
import { SideSheet } from './modals-core.jsx';
import { MetricCard, HBars } from './charts.jsx';
import { compute } from './lib/saleAgg.js';
import { OrderCard, daySummary, DayTiles, useOrderFinancials, finOf } from './orderCard.jsx';
import { baht } from './lib/saleDashboardHelpers.js';
import { CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// ---------- drill-down modal ----------
export function DrillModal({ drill, orders, skus, eff, onClose }) {
  const { dim, value } = drill;
  const f2 = { ...eff, [dim]: [value] };
  const f2Key = JSON.stringify(f2); // key ตามค่าจริงของ filter (f2 เป็น object ใหม่ทุก render)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ตั้งใจ memo ตาม f2Key (ค่าจริง) ไม่ใช่ตัว object f2 ที่สร้างใหม่ทุก render
  const A = useMemo(() => compute(orders, skus, f2), [orders, skus, f2Key]);
  const k = A.kpi;
  return <SideSheet size="lg" icon="grid" title={`${dim === 'channel' ? 'ช่องทาง' : dim === 'design' ? 'ลาย' : dim}: ${value}`} sub={`${baht(k.sales)} · ${N(k.orders)} ออเดอร์ · ${N(k.qty)} ตัว`} onClose={onClose} footer={<Button variant="outline" onClick={onClose}>ปิด</Button>}>
    <div className="metric-grid" style={{ marginBottom: 14 }}>
      <MetricCard label="ยอดขาย" value={baht(k.sales)} tone="var(--accent)" />
      <MetricCard label="ออเดอร์" value={N(k.orders)} />
      <MetricCard label="ตัว" value={N(k.qty)} />
      <MetricCard label="AOV" value={baht(k.aov)} />
    </div>
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <div><CardTitle className="m-0 text-base font-semibold mb-[10px]">ลายเด่น</CardTitle><HBars data={A.byDesign.slice(0, 8).map(d => ({ label: d.key, value: d.qty }))} height={180} unit="ตัว" /></div>
      <div><CardTitle className="m-0 text-base font-semibold mb-[10px]">สี & ไซซ์</CardTitle>
        <div className="cap" style={{ color: 'var(--ink-3)', marginBottom: 4 }}>สี</div><HBars data={A.byColor.slice(0, 6).map(c => ({ label: c.key, value: c.qty }))} height={120} unit="ตัว" />
      </div>
    </div>
  </SideSheet>;
}

// CustomerDrawer ย้ายไปเป็นของกลางใน customerDrawer.jsx (PART 88) — ประวัติซื้อเป็นแถวย่อกดขยาย
// popup วัน (คลิกแถวตารางโอน/COD) — tiles 10 ช่องชุดเดียวกับหน้าประสิทธิภาพเซลล์ + การ์ดออเดอร์กลาง (โชว์เซลล์)
export function DashDayDetail({ dateISO, ords, skus, funnelRows, onPickCustomer }) {
  const dayOrds = useMemo(() => (ords || []).filter(o => o.order_date === dateISO)
    .sort((a, b) => (Number(b.sales) || 0) - (Number(a.sales) || 0)), [ords, dateISO]);
  const skuBy = useMemo(() => {
    const noSet = new Set(dayOrds.map(o => o.order_no));
    const m = new Map();
    (skus || []).forEach(k => { if (!noSet.has(k.order_no)) return; const arr = m.get(k.order_no) || []; arr.push(k); m.set(k.order_no, arr); });
    return m;
  }, [skus, dayOrds]);
  const finBy = useOrderFinancials(dayOrds); // ส่วนลด/ค่าส่ง/VAT — batch ตอน popup เปิด
  return (
    <div className="flex flex-col gap-4">
      <DayTiles s={daySummary(dayOrds, funnelRows)} />
      <div>
        <div className="text-sm font-semibold mb-1.5" style={{ color: 'var(--ink)' }}>ออเดอร์ทั้งวัน ({N(dayOrds.length)})</div>
        {dayOrds.length === 0
          ? <div className="rounded-lg border p-6 text-center text-sm" style={{ color: 'var(--ink-4)' }}>ไม่มีออเดอร์ในวันนี้</div>
          : <div className="flex flex-col gap-2">
              {dayOrds.map((o, i) => <OrderCard key={(o.order_no || '') + '#' + i} o={o} lines={skuBy.get(o.order_no) || []} fin={finOf(finBy, o)} showSeller onPickCustomer={onPickCustomer} />)}
            </div>}
      </div>
    </div>
  );
}
