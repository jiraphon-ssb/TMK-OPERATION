/* ============================================================
   customerDrawer.jsx — drawer ลูกค้ากลาง (PART 88 · ย้ายจาก saleDashboard)
   ============================================================
   เปิดจาก: ตาราง RFM (รายงานขาย) + กดชื่อลูกค้าบนการ์ดออเดอร์ (perf)
   - cust ทนฟิลด์ขาด: tier/flag/recency ไม่มี → ซ่อนส่วนนั้น (perf ส่ง stat พื้นฐานพอ)
   - ประวัติซื้อ = แถวย่อกดขยายเป็นการ์ดเต็ม (OrderCard collapsed · โหลด fin เฉพาะใบที่กด)
   ============================================================ */
import { useMemo } from 'react';
import { N } from './components.jsx';
import { SideSheet } from './modals-core.jsx';
import { MetricCard, HBars, channelColor } from './charts.jsx';
import { normColor } from './lib/saleAgg.js';
import { fmtBaht } from './lib/money.js';
import { OrderCard } from './orderCard.jsx';
import { Card, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const baht = (n) => fmtBaht(Number(n) || 0);
export const COLOR_HEX = { 'ขาว': '#dcdce0', 'ดำ': '#2a2a2e', 'กรม': '#1f2d50', 'กรมท่า': '#1f2d50', 'ฟ้า': '#4a8be0', 'น้ำเงิน': '#1f3aa0', 'เขียว': '#2f9e6e', 'เหลือง': '#e8c23b', 'แดง': '#c0392b', 'ชมพู': '#e06aa0', 'ม่วง': '#7c5cff', 'ส้ม': '#e0772f', 'โอรส': '#e0772f', 'ครีม': '#e6dcc2' };

// สร้าง cust stat จากออเดอร์ในหน่วยความจำ (ให้หน้าที่ไม่มี RFM เช่น perf เปิด drawer ได้)
export function custFromOrders(o, ords) {
  const code = o.customer_code || '';
  const name = o.customer_name || code || 'ไม่ระบุลูกค้า';
  // 1.9: จับด้วย code ก่อน · ถ้าไม่มี code แต่มีชื่อ → จับด้วยชื่อ · ไม่มีทั้งคู่ → เฉพาะใบนี้ (กันแมตช์ทุกใบชื่อว่าง)
  const mine = code ? (ords || []).filter(x => x.customer_code === code)
    : (o.customer_name ? (ords || []).filter(x => x.customer_name === o.customer_name) : [o]);
  const sales = mine.reduce((a, x) => a + (Number(x.sales) || 0), 0);
  const dates = mine.map(x => x.order_date || '').filter(Boolean).sort();
  return { code, name, sales, orders: mine.length, aov: mine.length ? sales / mine.length : 0, first: dates[0] || '', last: dates[dates.length - 1] || '' };
}

export function CustomerDrawer({ cust, ords, skus, onClose }) {
  const TIER_CHIP = { 'เพชร': 'tier-chip-diamond', 'ทอง': 'tier-chip-gold', 'เงิน': 'tier-chip-silver', 'ทองแดง': 'tier-chip-bronze' };
  const flagTone = (fl) => fl === 'เสี่ยงหลุด' ? 'var(--bad)' : fl === 'ใหม่' ? 'var(--accent)' : fl === 'ขาประจำ' ? 'var(--good)' : 'var(--ink-4)';
  const { myOrds, lineBy, designTop, colorTop, chTop, qtyTotal } = useMemo(() => {
    const mo = (ords || []).filter(o => cust.code ? o.customer_code === cust.code : o.customer_name === cust.name)
      .sort((a, b) => (b.order_date || '').localeCompare(a.order_date || ''));
    const noSet = new Set(mo.map(o => o.order_no));
    const ms = (skus || []).filter(s => noSet.has(s.order_no));
    const lb = new Map();
    ms.forEach(s => { const g = lb.get(s.order_no) || []; g.push(s); lb.set(s.order_no, g); });
    const agg = (rows, keyFn) => { const m = {}; rows.forEach(r => { const k = keyFn(r); if (!k) return; m[k] = (m[k] || 0) + (Number(r.qty) || 0); }); return Object.entries(m).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value); };
    const ch = {}; mo.forEach(o => { if (o.channel) ch[o.channel] = (ch[o.channel] || 0) + (Number(o.sales) || 0); });
    return {
      myOrds: mo, lineBy: lb,
      designTop: agg(ms, s => s.design).slice(0, 8),
      colorTop: agg(ms, s => normColor(s.color)).slice(0, 6),
      chTop: Object.entries(ch).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      qtyTotal: ms.reduce((a, s) => a + (Number(s.qty) || 0), 0) || mo.reduce((a, o) => a + (Number(o.qty) || 0), 0),
    };
  }, [cust.code, cust.name, ords, skus]);
  return <SideSheet size="lg" icon="user" title={cust.name}
    sub={<span className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{cust.tier && <span className={`tier-chip ${TIER_CHIP[cust.tier] || ''}`}>{cust.tier}</span>}{cust.code && <span style={{ color: 'var(--ink-4)' }}>รหัส {cust.code}</span>}{cust.flag && <Badge variant="outline" style={{ fontSize: 10, color: flagTone(cust.flag) }}>{cust.flag}</Badge>}</span>}
    onClose={onClose} footer={<Button variant="outline" onClick={onClose}>ปิด</Button>}>
    <div className="metric-grid" style={{ marginBottom: 14 }}>
      <MetricCard label="ยอดซื้อรวม" value={baht(cust.sales)} tone="var(--accent)" />
      <MetricCard label="จำนวนครั้ง" value={N(cust.orders)} />
      <MetricCard label="เฉลี่ย/ครั้ง" value={baht(cust.aov)} />
      <MetricCard label="ตัวรวม" value={N(qtyTotal)} />
    </div>
    <div className="grid g2" style={{ alignItems: 'start', marginBottom: 14 }}>
      <Card className="p-[16px]">
        <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 8 }}>ความเคลื่อนไหว</div>
        <div style={{ display: 'grid', gap: 7, fontSize: 13.5 }}>
          <div className="row between"><span style={{ color: 'var(--ink-4)' }}>ซื้อครั้งแรก</span><span className="num">{cust.first || '—'}</span></div>
          <div className="row between"><span style={{ color: 'var(--ink-4)' }}>ซื้อล่าสุด</span><span className="num">{cust.last || '—'}{cust.recency != null ? ` (${cust.recency} ว.ก่อน)` : ''}</span></div>
          <div className="row between"><span style={{ color: 'var(--ink-4)' }}>ช่องทางที่ใช้</span><span className="num">{N(cust.channels ?? chTop.length)} ช่อง</span></div>
        </div>
      </Card>
      <Card className="p-[16px]">
        <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 8 }}>ยอดซื้อแยกช่องทาง</div>
        {chTop.length ? <HBars data={chTop.map(c => ({ label: c.label, value: c.value, color: channelColor(c.label) }))} height={Math.max(80, chTop.length * 30)} unit="฿" /> : <div className="cap" style={{ color: 'var(--ink-4)' }}>—</div>}
      </Card>
    </div>
    {designTop.length > 0 && <div className="grid g2" style={{ alignItems: 'start', marginBottom: 14 }}>
      <Card className="p-[16px]">
        <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 8 }}>ลายที่ซื้อบ่อย</div>
        <HBars data={designTop} height={Math.max(120, designTop.length * 30)} unit="ตัว" />
      </Card>
      <Card className="p-[16px]">
        <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 8 }}>สีที่ซื้อบ่อย</div>
        <HBars data={colorTop.map(c => ({ label: c.label, value: c.value, color: COLOR_HEX[c.label] || 'var(--accent-2)' }))} height={Math.max(120, colorTop.length * 30)} unit="ตัว" />
      </Card>
    </div>}
    {/* ประวัติซื้อ — แถวย่อกดขยายเป็นการ์ดเต็ม (โหลดส่วนลด/รายละเอียดเฉพาะใบที่กด) */}
    <CardTitle className="m-0 text-base font-semibold mb-[10px]">ประวัติการสั่งซื้อ <span className="dim">· {N(myOrds.length)} ครั้ง</span></CardTitle>
    <div className="flex flex-col gap-1.5" style={{ maxHeight: 380, overflowY: 'auto' }}>
      {myOrds.length === 0 && <div className="cap" style={{ color: 'var(--ink-4)', padding: '16px 0', textAlign: 'center' }}>ไม่มีประวัติออเดอร์ในระบบ</div>}
      {myOrds.map((o, i) => <OrderCard key={(o.order_no || '') + '#' + i} o={o} lines={lineBy.get(o.order_no)} collapsed />)}
    </div>
  </SideSheet>;
}
