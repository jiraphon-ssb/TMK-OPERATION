/* ============================================================
   saleDashboardTeam.jsx — ลีดเดอร์บอร์ดเซลล์ (แท็บ team ของรายงานขาย)
   แยกมาจาก saleDashboard.jsx (ยกมาทั้งดุ้น ไม่แก้เนื้อใน): SalesLeaderboard
   ============================================================ */
import { useState, useEffect, useMemo } from 'react';
import { N, Icon } from './components.jsx';
import { fetchTargets, commissionFor } from './lib/targets.js';
import { baht } from './lib/saleDashboardHelpers.js';
import { ExportBtn } from './saleDashboardChrome.jsx';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { CardTable } from './components/DataTableParts.jsx';
import { Toggle } from '@/components/ui/toggle';
import { Progress } from '@/components/ui/progress';

// ---------- ทีมขาย leaderboard ----------
const SALES_AUTO = (k) => /อัตโนมัติ|มาร์เก็ตเพลส|tiktok|\(.*\)/i.test(k);
const initial = (k) => { const s = String(k || '').replace(/[()]/g, '').trim(); return s ? s[0].toUpperCase() : '?'; };

// ===== D2 — ลีดเดอร์บอร์ดเซลล์ (podium + คอลัมน์ครบ + run-rate) =====
export function SalesLeaderboard({ ords, items, prevItems, cmp, onFilter, range }) {
  const [humanOnly, setHumanOnly] = useState(true);
  // เป้า/คอมต่อเซลล์ (PART 12/T3) — โชว์เฉพาะช่วงที่เป็น "เดือนปฏิทินเดียว" (เป้าตั้งรายเดือน)
  const monthOfRange = (range.from && range.to && range.from.slice(0, 7) === range.to.slice(0, 7)) ? range.from.slice(0, 7) : null;
  const [targets, setTargets] = useState({});
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดข้อมูลเป้า async (pattern ปกติ) · ไม่มีเดือน = ล้างค่าเป้าที่ค้างจากช่วงก่อน
    if (!monthOfRange) { setTargets({}); return; }
    fetchTargets(monthOfRange).then(rows => {
      if (!alive) return;
      const m = {}; (rows || []).forEach(t => { m[t.salesperson] = t; }); setTargets(m);
    });
    return () => { alive = false; };
  }, [monthOfRange]);
  const anyTargets = Object.keys(targets).length > 0;
  // เสริมข้อมูลรายเซลล์จากออเดอร์: ลูกค้าใหม่ + ค่าคอม + จำนวนตัว
  const enrich = useMemo(() => {
    const m = {};
    (ords || []).forEach(o => {
      const g = m[o.salesperson] || (m[o.salesperson] = { newC: 0, comm: 0, qty: 0 });
      if (o.customer_type === 'ลูกค้าใหม่') g.newC += 1;
      g.comm += Number(o.mkt_commission) || 0;
      g.qty += Number(o.qty) || 0;
    });
    return m;
  }, [ords]);
  const pm = prevItems ? new Map(prevItems.map(x => [x.key, x.sales])) : null;
  let rows = [...(items || [])].map(s => ({ ...s, ...(enrich[s.key] || { newC: 0, comm: 0, qty: 0 }), auto: SALES_AUTO(s.key) })).sort((a, b) => b.sales - a.sales);
  if (humanOnly) rows = rows.filter(s => !s.auto);
  const total = rows.reduce((a, s) => a + s.sales, 0);
  const hasComm = rows.some(s => s.comm > 0);
  // run-rate: คาดการณ์สิ้นช่วงจากจำนวนวันที่ผ่านไป
  const today = new Date().toISOString().slice(0, 10);
  const dayspan = (a, b) => Math.max(1, Math.round((new Date(b) - new Date(a)) / 86400000) + 1);
  const totalDays = (range.from && range.to) ? dayspan(range.from, range.to) : 1;
  const elapsedDays = range.from ? dayspan(range.from, (range.to && today < range.to) ? today : range.to) : 1;
  const periodPct = Math.min(100, Math.round(elapsedDays / totalDays * 100));
  const medal = ['#e3b341', '#b8c0cc', '#cd8b5e'];
  const top3 = rows.slice(0, 3);
  return (
    <Card className="p-[22px]">
      <CardHeader className="flex-row items-center justify-between space-y-0 p-0 pb-3" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <CardTitle className="m-0 text-base font-semibold">อันดับเซลล์ <span className="dim">(ลีดเดอร์บอร์ด)</span></CardTitle>
          <CardDescription>{humanOnly ? `เฉพาะเซลล์คน ${N(rows.length)} คน · ${baht(total)}` : `ทุกช่องทาง ${N(rows.length)} · รวมมาร์เก็ตเพลส (อัตโนมัติ)`}</CardDescription>
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <ExportBtn filename={`อันดับเซลล์_${range.from || ''}_${range.to || ''}`} rows={rows} columns={[
            { label: 'อันดับ', map: (s) => rows.indexOf(s) + 1 },
            { label: 'เซลล์', map: (s) => s.auto ? s.key.replace(/[()]/g, '') : s.key },
            { label: 'ยอดขาย', key: 'sales' },
            { label: 'ออเดอร์', key: 'orders' },
            { label: 'จำนวนตัว', key: 'qty' },
            { label: 'AOV', map: (s) => Math.round(s.aov) },
            { label: 'ลูกค้าใหม่', key: 'newC' },
            { label: 'ค่าคอม', key: 'comm' },
            ...(anyTargets ? [
              { label: 'เป้า', map: (s) => Math.round(targets[s.key]?.sales_target || 0) },
              { label: '% เป้า', map: (s) => (targets[s.key]?.sales_target > 0 ? Math.round(s.sales / targets[s.key].sales_target * 100) : '') },
              { label: 'คอมคำนวณ', map: (s) => Math.round(commissionFor(s.sales, targets[s.key])) },
            ] : []),
          ]} />
          <Toggle variant="outline" size="sm" pressed={humanOnly} onPressedChange={setHumanOnly} title="ซ่อนยอดมาร์เก็ตเพลสอัตโนมัติ"><Icon name="users" /> เฉพาะเซลล์คน</Toggle>
        </div>
      </CardHeader>
      {/* โพเดียม Top 3 */}
      {top3.length >= 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, top3.length)}, 1fr)`, gap: 12, marginBottom: 16 }}>
          {top3.map((s, i) => {
            const name = s.auto ? s.key.replace(/[()]/g, '') : s.key;
            return (
              <div key={s.key} onClick={() => onFilter('salesperson', s.key)} style={{ cursor: 'pointer', padding: 14, borderRadius: 'var(--r-md)', border: `1px solid ${i === 0 ? medal[0] : 'var(--line)'}`, background: i === 0 ? `color-mix(in srgb, ${medal[0]} 8%, var(--surface))` : 'var(--surface)' }}>
                <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: s.auto ? 'var(--surface-2)' : 'var(--accent)', color: s.auto ? 'var(--ink-3)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>{s.auto ? <Icon name="refresh" /> : initial(name)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 5, alignItems: 'center' }}><span style={{ fontWeight: 800, fontSize: 13, color: medal[i] }}>#{i + 1}</span><Icon name="flame" size={14} style={{ color: medal[i] }} /></div>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                  </div>
                </div>
                <div className="num" style={{ fontWeight: 800, fontSize: 19, letterSpacing: '-.5px' }}>{baht(s.sales)}</div>
                <div className="cap" style={{ color: 'var(--ink-3)', marginTop: 2 }}>{N(s.orders)} ออเดอร์ · {baht(s.aov)}/ออเดอร์ · ใหม่ {N(s.newC)}</div>
              </div>
            );
          })}
        </div>
      )}
      {/* ตารางเต็ม */}
      <CardTable><Table>
        <TableHeader><TableRow>
          <TableHead style={{ width: 32 }}>#</TableHead>
          <TableHead>เซลล์</TableHead>
          <TableHead style={{ textAlign: 'right' }}>ยอดขาย</TableHead>
          <TableHead style={{ textAlign: 'right' }}>ออเดอร์</TableHead>
          <TableHead style={{ textAlign: 'right' }}>ตัว</TableHead>
          <TableHead style={{ textAlign: 'right' }}>AOV</TableHead>
          <TableHead style={{ textAlign: 'right' }}>ลูกค้าใหม่</TableHead>
          {hasComm && <TableHead style={{ textAlign: 'right' }}>ค่าคอม</TableHead>}
          {anyTargets && <TableHead style={{ textAlign: 'right' }}>เป้า</TableHead>}
          {anyTargets && <TableHead style={{ minWidth: 120 }}>% เป้า</TableHead>}
          {anyTargets && <TableHead style={{ textAlign: 'right' }}>คอมคำนวณ</TableHead>}
          <TableHead style={{ minWidth: 130 }}>คาดสิ้นช่วง</TableHead>
          {cmp && <TableHead style={{ textAlign: 'right' }}>%Δ</TableHead>}
        </TableRow></TableHeader>
        <TableBody>{rows.map((s, i) => {
          const d = cmp && pm && pm.get(s.key) > 0 ? (s.sales - pm.get(s.key)) / pm.get(s.key) : null;
          const name = s.auto ? s.key.replace(/[()]/g, '') : s.key;
          const projected = elapsedDays ? s.sales / elapsedDays * totalDays : s.sales;
          const tgt = targets[s.key];
          const pctTarget = tgt && tgt.sales_target > 0 ? Math.min(100, Math.round(s.sales / tgt.sales_target * 100)) : null;
          const commCalc = tgt ? commissionFor(s.sales, tgt) : 0;
          return (
            <TableRow key={s.key} onClick={() => onFilter('salesperson', s.key)} style={{ cursor: 'pointer' }}>
              <TableCell className="num cell-hide-m" style={{ fontWeight: 800, color: i < 3 ? medal[i] : 'var(--ink-4)' }}>{i + 1}</TableCell>
              <TableCell className="cell-title"><span className="row" style={{ gap: 6, alignItems: 'center' }}>{name}{s.auto && <Badge variant="secondary" style={{ fontSize: 10 }}>อัตโนมัติ</Badge>}</span></TableCell>
              <TableCell className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{baht(s.sales)}</TableCell>
              <TableCell className="num" style={{ textAlign: 'right' }}>{N(s.orders)}</TableCell>
              <TableCell className="num" style={{ textAlign: 'right' }}>{N(s.qty)}</TableCell>
              <TableCell className="num" style={{ textAlign: 'right' }}>{baht(s.aov)}</TableCell>
              <TableCell className="num" style={{ textAlign: 'right' }}>{N(s.newC)}</TableCell>
              {hasComm && <TableCell className="num" style={{ textAlign: 'right' }}>{baht(s.comm)}</TableCell>}
              {anyTargets && <TableCell className="num" style={{ textAlign: 'right', color: 'var(--ink-3)' }}>{tgt && tgt.sales_target > 0 ? baht(tgt.sales_target) : '—'}</TableCell>}
              {anyTargets && <TableCell>{pctTarget == null ? <span className="dim">—</span> : (
                <div className="row" style={{ gap: 7, alignItems: 'center' }}>
                  <Progress value={pctTarget} indicatorColor={pctTarget >= 100 ? 'var(--good)' : 'var(--accent)'} style={{ flex: 1, minWidth: 50 }} />
                  <span className="cap num" style={{ flexShrink: 0, fontWeight: 700, color: pctTarget >= 100 ? 'var(--good)' : 'var(--ink-3)' }}>{pctTarget}%</span>
                </div>
              )}</TableCell>}
              {anyTargets && <TableCell className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{commCalc > 0 ? baht(commCalc) : '—'}</TableCell>}
              <TableCell>
                <div className="row" style={{ gap: 7, alignItems: 'center' }}>
                  <Progress value={periodPct} indicatorColor={s.auto ? 'var(--ink-4)' : 'var(--accent)'} style={{ flex: 1 }} />
                  <span className="cap num" style={{ flexShrink: 0, color: 'var(--ink-3)' }}>{baht(projected)}</span>
                </div>
              </TableCell>
              {cmp && <TableCell className="num" style={{ textAlign: 'right', fontWeight: 700, color: d == null ? 'var(--ink-4)' : d >= 0 ? 'var(--good)' : 'var(--bad)' }}>{d == null ? '—' : (d >= 0 ? '▲' : '▼') + Math.abs(Math.round(d * 100)) + '%'}</TableCell>}
            </TableRow>
          );
        })}</TableBody>
      </Table></CardTable>
      <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 10 }}>"คาดสิ้นช่วง" = ประมาณการจากอัตราขายที่ผ่านมา {periodPct}% ของช่วง ({N(elapsedDays)}/{N(totalDays)} วัน) · คลิกแถวเพื่อกรองทั้งหน้า</div>
    </Card>
  );
}
