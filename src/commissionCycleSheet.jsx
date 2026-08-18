/* ============================================================
   CommissionCycleSheet — ป๊อปอัพ "ค่าคอมรอบตัด" (26 → 25) รายคน + รายทีม
   ============================================================
   ตกลงกับ user (docs/COMMISSION-CYCLE-PLAN.md · 13 ส.ค. 2569):
   - ไม่ขยับหน้า salePerf เดิม (ยังเป็นเดือนปฏิทิน) — popup นี้คือที่เดียวที่คิดตามรอบตัด
   - รอบเรียกตามเดือนที่จบ/จ่ายเงิน (26 ก.ค.–25 ส.ค. = "รอบ ส.ค.") · ใช้เรท/เทียร์ของเดือนที่จบรอบ
   - ยอดคิดคอม = ทุกช่องทางของเซลล์ ตัดยกเลิก + merge override (สูตรเดียวกับหน้า salePerf)
   - สิทธิ์: แอดมินเห็นทั้งทีม · เซลล์เห็นเฉพาะแถวตัวเอง
   - วันตัดรอบ (default 26) แก้ได้เฉพาะแอดมิน — เก็บ tmk_settings.commission_cutoff_day
     (schema-tolerant: ยังไม่รัน migration → ใช้ 26 · เซฟไม่ได้จะบอกให้รัน migration)
   ============================================================ */
import { useState, useEffect, useCallback } from 'react';
import { Icon, N, PersonAvatar } from './components.jsx';
import { supabase } from './lib/supabaseClient.js';
import { SideSheet } from './modals-core.jsx';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cachedFetchRange, cachedFetchAll, ORDERS_SEL, OVERRIDES_SEL } from './lib/saleData.js';
import { mergeOrderOverrides } from './lib/saleOverrides.js';
import { fetchTargets } from './lib/targets.js';
import { orderVisibleTo } from './lib/roleAccess.js';
import { fmtB, monthLabel } from './lib/salePerfView.js';
import { goSection } from './lib/appBus.js';
import {
  DEFAULT_CUTOFF_DAY, normCutoffDay, cycleOf, currentCycleEndMonth, cycleProgress,
  buildCycleRows, rateLabel, shiftMonth,
} from './lib/commissionCycle.js';

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const thDate = (iso) => { const [y, m, d] = String(iso).split('-'); return `${Number(d)} ${monthLabel(`${y}-${m}`)}`; };

export function CommissionCycleSheet({ onClose, user, canSeeTeam }) {
  const [cutoff, setCutoff] = useState(DEFAULT_CUTOFF_DAY);
  const [endMonth, setEndMonth] = useState(null);             // 'YYYY-MM' — null จนกว่าจะรู้ cutoff จริง
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [prevRows, setPrevRows] = useState([]);

  // 1) โหลดวันตัดรอบจาก settings (ครั้งเดียวตอนเปิด) → ตั้งรอบปัจจุบัน
  //    ที่นี่ "อ่านอย่างเดียว" — แก้วันตัดที่ ตั้งค่า → เป้า/คอม (TargetsView)
  useEffect(() => {
    let live = true;
    (async () => {
      let day = DEFAULT_CUTOFF_DAY;
      try {
        const { data, error } = await supabase.from('tmk_settings').select('commission_cutoff_day').eq('id', 'main').maybeSingle();
        if (!error && data?.commission_cutoff_day != null) day = normCutoffDay(data.commission_cutoff_day);
      } catch { /* คอลัมน์ยังไม่ migrate → ใช้ default 26 */ }
      if (!live) return;
      setCutoff(day);
      setEndMonth(currentCycleEndMonth(todayISO(), day));
    })();
    return () => { live = false; };
  }, []);

  // 2) โหลดข้อมูลรอบ + รอบก่อน (ทุกครั้งที่เปลี่ยนรอบ/วันตัด)
  const load = useCallback(async (em, day) => {
    setLoading(true);
    try {
      const cyc = cycleOf(em, day);
      const prevCyc = cycleOf(shiftMonth(em, -1), day);
      const [oR, pR, ovR, tg, ptg] = await Promise.all([
        cachedFetchRange('tmk_mp_orders', ORDERS_SEL, cyc.from, cyc.to, 'order_date'),
        cachedFetchRange('tmk_mp_orders', ORDERS_SEL, prevCyc.from, prevCyc.to, 'order_date'),
        cachedFetchAll('tmk_order_overrides', OVERRIDES_SEL),
        fetchTargets(em),
        fetchTargets(shiftMonth(em, -1)),
      ]);
      const ovMap = {}; if (ovR && !ovR.error) (ovR.data || []).forEach(x => { ovMap[x.order_id] = x; });
      const scope = (list) => canSeeTeam ? list : (list || []).filter(o => orderVisibleTo(o, user)); // เซลล์เห็นเฉพาะของตัวเอง
      const tmap = {}; (tg || []).forEach(t => { tmap[t.salesperson] = t; });
      const ptmap = {}; (ptg || []).forEach(t => { ptmap[t.salesperson] = t; });
      setRows(buildCycleRows(scope(mergeOrderOverrides(oR.data || [], ovMap)), tmap));
      setPrevRows(buildCycleRows(scope(mergeOrderOverrides(pR.data || [], ovMap)), ptmap));
    } catch { setRows([]); setPrevRows([]); }
    finally { setLoading(false); }
  }, [canSeeTeam, user]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดข้อมูล async ตอนเปลี่ยนรอบ/วันตัด (pattern ปกติ · load เป็น useCallback)
  useEffect(() => { if (endMonth) load(endMonth, cutoff); }, [endMonth, cutoff, load]);


  if (!endMonth) return (
    <SideSheet icon="wallet" title="ค่าคอมรอบตัด" onClose={onClose} size="lg">
      <div className="grid gap-3 p-1">{[0, 1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
    </SideSheet>
  );

  const cyc = cycleOf(endMonth, cutoff);
  const prog = cycleProgress(cyc, todayISO());
  const isCurrent = endMonth === currentCycleEndMonth(todayISO(), cutoff);
  const teamSales = rows.reduce((a, r) => a + r.sales, 0);
  const teamComm = rows.reduce((a, r) => a + r.comm, 0);
  const prevBy = Object.fromEntries(prevRows.map(r => [r.name, r]));
  const noTarget = rows.filter(r => !r.tgt).length;

  return (
    <SideSheet icon="wallet" title={`ค่าคอมรอบตัด · รอบ ${monthLabel(endMonth)}`}
      sub={`${thDate(cyc.from)} – ${thDate(cyc.to)} · ${prog.days} วัน${isCurrent ? ` (ผ่านมาแล้ว ${prog.passed} วัน)` : ''}`}
      onClose={onClose} size="lg">
      {/* เลือกรอบ + วันตัด */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <Button variant="outline" size="sm" onClick={() => setEndMonth(shiftMonth(endMonth, -1))}><Icon name="chevL" /> รอบก่อน</Button>
        <Button variant="outline" size="sm" disabled={isCurrent} onClick={() => setEndMonth(shiftMonth(endMonth, 1))}>รอบถัดไป <Icon name="chevR" /></Button>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          วันตัดรอบ: ทุกวันที่ <b className="text-foreground">{cutoff}</b>
          {canSeeTeam && (
            <button type="button" className="text-[var(--accent)] underline decoration-dotted"
              onClick={() => { onClose?.(); goSection('settings', 'targets'); }}>แก้ที่ตั้งค่า</button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <>
          {/* สรุปทีม (เซลล์ธรรมดา = สรุปของตัวเอง) */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded-xl border p-3"><div className="text-[11px] text-muted-foreground">ยอดขายรวมในรอบ{canSeeTeam ? ' (ทั้งทีม)' : ''}</div><div className="text-xl font-bold num">{fmtB(teamSales)}</div></div>
            <div className="rounded-xl border p-3" style={{ background: 'var(--accent-soft)' }}><div className="text-[11px] text-muted-foreground">ค่าคอมรวม{canSeeTeam ? 'ทั้งทีม' : ''}</div><div className="text-xl font-bold num" style={{ color: 'var(--accent)' }}>{fmtB(teamComm)}</div></div>
          </div>
          {isCurrent && <div className="text-[11px] text-muted-foreground mb-2">รอบนี้ยังไม่จบ — ตัวเลขจะเพิ่มขึ้นจนถึงวันที่ {thDate(cyc.to)}</div>}

          {/* รายคน */}
          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">ยังไม่มียอดขายในรอบนี้</div>
          ) : (
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="text-[11px] text-muted-foreground border-b bg-muted/40">
                  <th className="text-left px-3 py-2 font-medium">เซลล์</th>
                  <th className="text-right px-3 py-2 font-medium">ยอดในรอบ</th>
                  <th className="text-right px-3 py-2 font-medium">เรทที่ใช้</th>
                  <th className="text-right px-3 py-2 font-medium">ค่าคอม</th>
                  <th className="text-right px-3 py-2 font-medium">vs รอบก่อน</th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const pv = prevBy[r.name];
                    const d = pv && pv.sales > 0 ? Math.round((r.sales - pv.sales) / pv.sales * 100) : null;
                    return (
                      <tr key={r.name} className="border-b last:border-0">
                        <td className="px-3 py-2"><span className="inline-flex items-center gap-2"><PersonAvatar name={r.name} size={22} /><span className="font-medium">{r.name}</span></span></td>
                        <td className="px-3 py-2 text-right num">{fmtB(r.sales)}<div className="text-[10px] text-muted-foreground">{N(r.orders)} ออเดอร์</div></td>
                        <td className="px-3 py-2 text-right text-xs">{rateLabel(r) ?? (
                          canSeeTeam
                            ? <button type="button" className="text-amber-600 underline decoration-dotted" onClick={() => { onClose?.(); goSection('settings', 'targets'); }}>ยังไม่ตั้ง ({monthLabel(endMonth)})</button>
                            : <span className="text-amber-600">ยังไม่ตั้ง</span>
                        )}</td>
                        <td className="px-3 py-2 text-right num font-semibold" style={{ color: r.comm > 0 ? 'var(--accent)' : 'var(--ink-4)' }}>{r.comm > 0 ? fmtB(r.comm) : '—'}</td>
                        <td className="px-3 py-2 text-right text-xs">{d == null ? <span className="text-muted-foreground">—</span> : <Badge variant="secondary" className={d >= 0 ? 'text-emerald-600' : 'text-red-500'}>{d >= 0 ? '▲' : '▼'} {Math.abs(d)}%</Badge>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {canSeeTeam && noTarget > 0 && <div className="mt-2 text-[11px] text-amber-600">มี {noTarget} คนยังไม่ตั้งเป้า/เรทของเดือน {monthLabel(endMonth)} — ตั้งได้ที่ ตั้งค่า → เป้า/คอม</div>}
          <div className="mt-3 text-[11px] text-muted-foreground">
            สูตร: ยอดขายทุกช่องทางของเซลล์ในช่วงรอบ (ตัดออเดอร์ยกเลิก · รวมการแก้ไขแล้ว) × เรท/เทียร์ของเดือน {monthLabel(endMonth)} — ตัวเลขนี้คือรอบตัดจริงที่ใช้จ่ายเงิน (ต่างจากการ์ดในหน้าซึ่งเป็นเดือนปฏิทิน)
          </div>
        </>
      )}
    </SideSheet>
  );
}
