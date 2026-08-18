/* ============================================================
   saleCrmPanels.jsx — แยกมาจาก saleCrm.jsx (หน้า "ภาพรวม CRM")
   ============================================================
   ยกก้อน UI ออกมาทั้งดุ้น ไม่แก้เนื้อใน — ค่าที่เคยเป็น closure ส่งเป็น props เหมือนเดิม
   - MultiSelect      : dropdown ตัวกรองหลายตัวเลือก
   - CrmSkeleton      : โครงร่างตอนโหลด
   - CrmDashboard     : แดชบอร์ดยอด CRM รายเดือน (โทร + LINE)
   - CrmDayDetail     : popup รายละเอียดวัน (กดแท่งกราฟ) + ฟอร์มบันทึกประจำวัน
   hook โหลดข้อมูล/aggregate ระดับหน้ายังอยู่ที่ saleCrm.jsx (CrmView) เหมือนเดิม
   ============================================================ */
import { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { N, Icon, Skel, SkelTable, PersonAvatar } from './components.jsx';
import { MetricCard, DonutChart, StackedBars } from './charts.jsx';
import { OrderCard } from './orderCard.jsx';
import { num, LINE_C, PHONE_C, dlt } from './lib/crmDirectory.js';
import { isCrmOrder, crmCustomerKey } from './lib/crmAgg.js';
import { isCancelled } from './lib/salePerfAgg.js';
import { fetchCrmNotes, saveCrmNote } from './lib/crmTargets.js';
import { blankNoteData, normNoteData, isNoteDataEmpty, noteSummaryText, totalCalls } from './lib/crmDailyNote.js';
import { isAdmin, myNamesOf } from './lib/roleAccess.js';
import { Progress } from '@/components/ui/progress';
import { fmtBaht } from './lib/money.js';
import { MonthPicker } from './components/MonthPicker.jsx';
import { makeSkuResolver, loadResolverMaps } from './lib/designResolve.js';
import { toast, goSection } from './lib/appBus.js';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
export { MultiSelect } from './components/MultiSelect.jsx'; // แหล่งเดียวของทั้งแอป (เดิมมีสำเนา 6 ชุด)

const baht = (n) => fmtBaht(Number(n) || 0); // decimal-aware กลาง (lib/money.js)


/* ---------- Skeleton (แดชบอร์ด + ตาราง) ---------- */
export function CrmSkeleton() {
  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}><Skel w={200} h={18} /><Skel w={130} h={30} r={8} /></div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => <Card key={i} className="p-3"><Skel w={70} h={9} /><Skel w={80} h={22} style={{ marginTop: 8 }} /></Card>)}</div>
      <div className="grid lg:grid-cols-3 gap-3"><Card className="p-4 lg:col-span-2"><Skel w={140} h={14} style={{ marginBottom: 12 }} /><Skel w="100%" h={200} r={9} /></Card><Card className="p-4"><Skel w={120} h={14} style={{ marginBottom: 12 }} /><Skel w="100%" h={150} r={9} /></Card></div>
      <Card className="p-4">
        <div className="row between" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 12 }}><Skel w={160} h={16} /><Skel w={90} h={28} r={8} /></div>
        <Skel w="100%" h={34} r={9} style={{ marginBottom: 12 }} />
        <SkelTable cols={6} rows={9} />
      </Card>
    </div>
  );
}

/* ---------- แดชบอร์ดยอด CRM รายเดือน (โทร + LINE) — PART 87 ---------- */
export function CrmDashboard({ stats, month, setMonth, curYm, seller, setSeller, target, targetProg, isAdminUser, onDayClick }) {
  const s = stats;
  const empty = s.crmOrders === 0;
  const isCurMonth = month === curYm;
  const dailyData = [
    { label: 'LINE', data: s.byDay.map(d => d.line), color: LINE_C },
    { label: 'โทร', data: s.byDay.map(d => d.phone), color: PHONE_C },
  ];
  const dailyLabels = s.byDay.map((_, i) => String(i + 1));
  const otherSales = Math.max(0, s.totalSales - s.crmSales);
  const buyers = s.buyers;
  const newPct = buyers ? Math.round(s.newBuyers / buyers * 100) : 0;
  const scopeLabel = seller || 'รวมทุกคน';

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Zone A — พาดหัวเซลล์ (สลับคนได้) + เลือกเดือน */}
      <div className="row between" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <div className="row items-center" style={{ gap: 10, minWidth: 0 }}>
          <PersonAvatar name={scopeLabel} size={40} />
          <div style={{ minWidth: 0 }}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="row items-center gap-1.5 text-lg font-bold leading-tight hover:opacity-80" style={{ color: 'var(--ink)' }}>
                  {scopeLabel} <Icon name="down" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 w-52 overflow-auto">
                <DropdownMenuLabel className="py-1">เลือกเซลล์ CRM</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setSeller('')}>
                  <span className="min-w-0 flex-1">รวมทุกคน</span>{!seller && <Icon name="check" />}
                </DropdownMenuItem>
                {s.bySeller.map(sp => (
                  <DropdownMenuItem key={sp.name} onSelect={() => setSeller(sp.name)}>
                    <PersonAvatar name={sp.name} size={20} />
                    <span className="min-w-0 flex-1 truncate">{sp.name}</span>
                    {seller === sp.name && <Icon name="check" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 1 }}>ยอด CRM (โทร + LINE){seller ? '' : ' ทั้งทีม'} · ไม่นับใบยกเลิก</div>
          </div>
        </div>
        <MonthPicker value={month} onChange={setMonth} max={curYm} />
      </div>

      {/* Zone B — KPI 6 ใบ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {(() => { const d = dlt(s.crmSales, s.prev.crmSales); return (
          <MetricCard index={0} label="ยอด CRM เดือนนี้" value={baht(s.crmSales)} tone="var(--accent)" icon="chat" {...(d || {})} sub={d ? 'เทียบเดือนก่อน' : undefined} />
        ); })()}
        <MetricCard index={1} label="ยอด LINE" value={baht(s.lineSales)} tone={LINE_C} icon="chat" />
        <MetricCard index={2} label="ยอดโทร" value={baht(s.phoneSales)} tone={PHONE_C} icon="phone" />
        {(() => { const d = dlt(s.crmOrders, s.prev.crmOrders); return (
          <MetricCard index={3} label="ออเดอร์ CRM" value={N(s.crmOrders)} icon="bag" {...(d || {})} sub={d ? 'เทียบเดือนก่อน' : undefined} />
        ); })()}
        {(() => { const d = dlt(s.buyers, s.prev.buyers); return (
          <MetricCard index={4} label="ลูกค้าที่ซื้อ" value={N(s.buyers)} icon="users" {...(d || {})} sub={d ? 'เทียบเดือนก่อน' : undefined} />
        ); })()}
        <MetricCard index={5} label="สัดส่วน CRM" value={`${Math.round(s.crmShare)}%`} icon="target" sub={`จากยอดรวม ${baht(s.totalSales)}`} />
      </div>

      {/* เป้ายอดขาย CRM — ความคืบหน้า + วันเหลือ + ส่วนต่าง + คาดสิ้นเดือน (pattern เดียวกับหน้าเซลล์) */}
      {target > 0 ? (() => {
        const p = targetProg || {};
        const pct = p.pct || 0;
        const reached = s.crmSales >= target;
        return (
          <Card className="p-4">
            <div className="row between mb-2" style={{ flexWrap: 'wrap', gap: 6, alignItems: 'baseline' }}>
              <div className="cap" style={{ color: 'var(--ink-2)' }}>
                เป้ายอดขาย CRM <b style={{ color: 'var(--ink)' }}>{baht(target)}</b> · ยอดสะสม <b style={{ color: 'var(--ink)' }}>{baht(s.crmSales)}</b>
                <span style={{ color: reached ? 'var(--good)' : 'var(--accent-2)', fontWeight: 700, marginLeft: 4 }}>({Math.round(pct)}%)</span>
              </div>
              {isCurMonth && <span className="cap" style={{ color: 'var(--ink-4)' }}>เหลืออีก {N(p.daysLeft)} วัน</span>}
            </div>
            <Progress value={Math.min(100, pct)} className="h-2" indicatorColor={reached ? 'var(--good)' : 'var(--accent)'} />
            <div className="row mt-2.5" style={{ gap: 20, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <div>
                <span className="cap" style={{ color: 'var(--ink-4)' }}>ส่วนต่างยอดขาย </span>
                <b className="num" style={{ color: p.gap >= 0 ? 'var(--good)' : 'var(--bad)' }}>{p.gap >= 0 ? '+' : '−'}{baht(Math.abs(p.gap))}</b>
                <span className="cap" style={{ color: 'var(--ink-4)', marginLeft: 3 }}>{p.gap >= 0 ? 'เกินเป้า' : 'ถึงเป้า'}</span>
              </div>
              {isCurMonth && p.projected > 0 && (
                <div><span className="cap" style={{ color: 'var(--ink-4)' }}>คาดสิ้นเดือน </span><b className="num" style={{ color: p.projected >= target ? 'var(--good)' : 'var(--ink-2)' }}>{baht(p.projected)}</b></div>
              )}
            </div>
          </Card>
        );
      })() : isAdminUser ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-dashed p-4">
          <div className="cap" style={{ color: 'var(--ink-3)' }}>ยังไม่ได้ตั้งเป้ายอดขาย CRM {seller ? `ของ ${seller}` : ''} เดือนนี้</div>
          <Button variant="outline" size="sm" onClick={() => goSection('settings', 'targets')}><Icon name="target" /> ตั้งเป้า CRM</Button>
        </Card>
      ) : null}

      {/* Zone C — กราฟรายวัน (กดแท่งดูรายวัน) + สัดส่วน + ใหม่/ซื้อซ้ำ (ซ้าย-ขวาสูงเท่ากัน) */}
      <div className="grid lg:grid-cols-3 gap-3 items-stretch">
        <Card className="p-4 lg:col-span-2 flex flex-col">
          <div className="row between mb-3" style={{ alignItems: 'baseline' }}>
            <div className="cap" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>ยอด CRM รายวัน — LINE เทียบโทร</div>
            {!empty && <span className="cap" style={{ color: 'var(--ink-4)' }}>กดแท่งเพื่อดูออเดอร์วันนั้น</span>}
          </div>
          {empty
            ? <div className="flex flex-1 items-center justify-center text-center" style={{ minHeight: 240, color: 'var(--ink-4)' }}>ยังไม่มียอด CRM ในเดือนนี้</div>
            : <div className="flex-1"><StackedBars labels={dailyLabels} datasets={dailyData} height={260} fmt={baht} onDayClick={onDayClick} /></div>}
        </Card>
        <div className="flex flex-col gap-3">
          <Card className="p-4 flex-1 flex flex-col justify-center">
            <div className="cap mb-2" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>CRM เทียบยอดรวม</div>
            {s.totalSales > 0
              ? <div className="relative">
                  <DonutChart height={140} data={[{ label: 'CRM (โทร+LINE)', value: s.crmSales, color: 'var(--accent)' }, { label: 'ช่องทางอื่น', value: otherSales, color: '#8a909c' }]} />
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <div className="num" style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{Math.round(s.crmShare)}%</div>
                    <div className="cap" style={{ color: 'var(--ink-4)' }}>เป็น CRM</div>
                  </div>
                </div>
              : <div className="flex items-center justify-center text-center" style={{ height: 120, color: 'var(--ink-4)' }}>ยังไม่มียอดขายในเดือนนี้</div>}
          </Card>
          <Card className="p-4 flex-1 flex flex-col justify-center">
            <div className="cap mb-2" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>ลูกค้า CRM เดือนนี้</div>
            <div className="row" style={{ gap: 20, alignItems: 'baseline' }}>
              <div><div className="num" style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{N(s.newBuyers)}</div><div className="cap" style={{ color: 'var(--ink-4)' }}>ลูกค้าใหม่</div></div>
              <div><div className="num" style={{ fontSize: 22, fontWeight: 800, color: 'var(--good)' }}>{N(s.repeatBuyers)}</div><div className="cap" style={{ color: 'var(--ink-4)' }}>ซื้อซ้ำ</div></div>
              <div className="ml-auto text-right"><div className="num" style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-2)' }}>{N(buyers)}</div><div className="cap" style={{ color: 'var(--ink-4)' }}>รวม</div></div>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'color-mix(in srgb, var(--good) 22%, transparent)' }}>
              <div style={{ width: `${newPct}%`, height: '100%', background: 'var(--accent)' }} />
            </div>
            <div className="cap mt-1.5" style={{ color: 'var(--ink-4)' }}>ใหม่ = ซื้อผ่าน LINE/โทรครั้งแรกในเดือนนี้</div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ---------- Popup รายละเอียดวัน (กดแท่งกราฟ) — แบบหน้าประสิทธิภาพเซลล์ ---------- */
function CrmDayTile({ label, value, tone }) {
  return (
    <div className="rounded-xl border p-2.5" style={{ borderColor: 'var(--line)' }}>
      <div className="cap" style={{ color: 'var(--ink-4)' }}>{label}</div>
      <div className="num" style={{ fontSize: 17, fontWeight: 800, color: tone || 'var(--ink)', marginTop: 2 }}>{value}</div>
    </div>
  );
}
// ช่องตัวเลขฟอร์มบันทึกประจำวัน — 0 โชว์ว่าง (พิมพ์ทับง่าย) · กึ่งกลาง tabular · พื้นขาวเด่นบนการ์ดสีหมวด
function NoteNum({ label, value, onChange }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px]" style={{ color: 'var(--ink-4)' }}>{label}</span>
      <Input type="number" inputMode="numeric" min={0} className="h-9 text-[13px] text-center tabular-nums"
        style={{ background: 'var(--surface)' }} value={value === 0 ? '' : value} placeholder="0" onChange={e => onChange(e.target.value)} />
    </label>
  );
}
// กลุ่มโทร (0DAY / 5DAY / Repurchase) — การ์ดขาว: โทรทั้งหมด + รับสาย เคียงกัน · ไม่รับคิดอัตโนมัติ (แบบ A)
function NoteCallGroup({ title, g, onChange, tone }) {
  const missed = Math.max(0, (Number(g.total) || 0) - (Number(g.answered) || 0));
  const cell = (key, lb) => (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[10.5px]" style={{ color: 'var(--ink-4)' }}>{lb}</span>
      <Input type="number" inputMode="numeric" min={0} className="h-9 text-[13px] text-center tabular-nums"
        style={{ background: 'var(--surface)' }} value={g[key] === 0 ? '' : g[key]} placeholder="0" onChange={e => onChange(key, e.target.value)} />
    </label>
  );
  return (
    <div className="rounded-lg p-2.5" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <div className="text-[12px] font-semibold mb-2" style={{ color: tone }}>{title}</div>
      <div className="grid grid-cols-2 gap-1.5">{cell('total', 'โทร')}{cell('answered', 'รับ')}</div>
      <div className="text-[11px] mt-1.5 text-center" style={{ color: 'var(--ink-4)' }}>ไม่รับ <b style={{ color: 'var(--ink-2)' }}>{missed}</b> สาย</div>
    </div>
  );
}
// การ์ดออเดอร์ → ใช้ OrderCard กลาง (orderCard.jsx · PART 88) — ดีไซน์ Lemon: ส่วนลดที่หัว + สรุปเงินท้ายรายการ
export function CrmDayDetail({ dateISO, orders, allOrders, seller, user, onPickCustomer }) {
  const [lineBy, setLineBy] = useState(null); // order_no → [{design,color,size,qty,line_sales}]
  const [finBy, setFinBy] = useState({});     // "source:order_no" → {subtotal,discount,shipping,vat}
  const [notes, setNotes] = useState([]);     // บันทึกประจำวัน ของวันนั้น (ทุกคน)
  const [noteData, setNoteData] = useState(blankNoteData()); // ฟอร์มมีช่อง (PART 91)
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false); // ย่อ/กางฟอร์มบันทึกประจำวัน (กดเพื่อเปิด · แบบ A)
  const loading = lineBy === null;

  // ออเดอร์ CRM (LINE/โทร) ของวันนั้น — เรียงยอดมาก→น้อย
  const ords = useMemo(() => (orders || []).filter(o => o.order_date === dateISO && !isCancelled(o) && isCrmOrder(o))
    .sort((a, b) => (num(b.sales) - num(a.sales))), [orders, dateISO]);
  const line = ords.filter(o => o.channel === 'LINE').reduce((x, o) => x + num(o.sales), 0);
  const phone = ords.filter(o => o.channel === 'Phone').reduce((x, o) => x + num(o.sales), 0);
  const qty = ords.reduce((x, o) => x + num(o.qty), 0);
  const buyers = new Set(ords.map(o => crmCustomerKey(o)).filter(Boolean)).size;

  // ลูกค้าเก่า/ใหม่ + ปิดการขาย Repurchase — คิดสดจากวันซื้อครั้งแรกทั้งบริษัท (allOrders · เก่า=เคยซื้อก่อนวันนี้แม้กับเซลล์คนอื่น)
  const { oldCust, newCust, repurchaseOrders, repurchaseBaht } = useMemo(() => {
    const firstDate = {};
    (allOrders || orders || []).forEach(o => {
      if (isCancelled(o)) return;
      const k = crmCustomerKey(o), dt = o.order_date || '';
      if (!k || !dt) return;
      if (!firstDate[k] || dt < firstDate[k]) firstDate[k] = dt;
    });
    const keys = [...new Set(ords.map(o => crmCustomerKey(o)).filter(Boolean))];
    const nc = keys.filter(k => (firstDate[k] || dateISO) >= dateISO).length;
    const rep = ords.filter(o => { const k = crmCustomerKey(o); return k && (firstDate[k] || dateISO) < dateISO; });
    return { oldCust: keys.length - nc, newCust: nc, repurchaseOrders: rep.length, repurchaseBaht: rep.reduce((x, o) => x + num(o.sales), 0) };
  }, [allOrders, orders, ords, dateISO]);

  // lazy: รายการสินค้า (skus) + แยกราคา (attrs) — โหลดตอนเปิด popup เท่านั้น (ออเดอร์/วันไม่มาก · egress ต่ำ)
  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ล้างค่าเดิมก่อนโหลด async ตอนเปลี่ยนวัน/ชุดออเดอร์ (กันโชว์รายการสินค้าของวันเก่าค้าง)
    setLineBy(null); setFinBy({});
    (async () => {
      const nos = [...new Set(ords.map(o => o.order_no).filter(x => x && !String(x).startsWith('(')))];
      const lb = new Map();
      if (nos.length) {
        const rows = [];
        for (let i = 0; i < nos.length; i += 150) {
          const { data } = await supabase.from('tmk_mp_skus').select('order_no,design,color,size,qty,line_sales,product_code,raw_sku_or_name,order_date').in('order_no', nos.slice(i, i + 150));
          rows.push(...(data || []));
        }
        // resolve ชื่อลายสด (ตรงหน้าออเดอร์/แดชบอร์ด)
        const maps = await loadResolverMaps(supabase);
        if (!live) return;
        const resolve = makeSkuResolver(maps);
        rows.forEach(s => { s.design = resolve(s).design || s.design; const g = lb.get(s.order_no) || []; g.push(s); lb.set(s.order_no, g); });
        // attrs (ส่วนลด/ค่าส่ง/VAT/ราคาเสื้อ) — คีย์ source:order_no กันชนข้าม source
        const fb = {};
        const { data: aData } = await supabase.from('tmk_mp_orders').select('order_no,source,attrs').in('order_no', nos);
        (aData || []).forEach(r => { const a = r.attrs || {}; fb[`${r.source || ''}:${r.order_no}`] = { subtotal: a.subtotal, discount: a.discount, shipping: a.shipping, vat: a.vat, promo: a.promo_code }; });
        if (live) setFinBy(fb);
      }
      if (live) setLineBy(lb);
    })();
    return () => { live = false; };
  }, [dateISO, ords]);

  // บันทึกประจำวัน — โหลดแยกจากออเดอร์ (คีย์ [dateISO] เท่านั้น) · กัน realtime ออเดอร์เข้ามาระหว่างกรอก → ฟอร์มรีเซ็ต/ที่พิมพ์หาย
  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ล้างก่อนโหลด async ตอนเปลี่ยนวัน (กันโน้ตวันเก่าค้างให้เห็น)
    setNotes([]);
    fetchCrmNotes(dateISO).then(n => { if (live) setNotes(n); });
    return () => { live = false; };
  }, [dateISO]);

  // ส่วนลดรวมของวัน (จาก attrs · ไม่มี = 0 ตามจริง — ใบเสร็จที่ไม่มีส่วนลดจะไม่เขียน attrs.discount)
  const discTotal = useMemo(() => ords.reduce((x, o) => x + (Number(finBy[`${o.source || ''}:${o.order_no}`]?.discount) || 0), 0), [ords, finBy]);

  // บันทึกประจำวัน — scope เดี่ยว = ของเซลล์คนนั้น · แก้ได้ถ้า admin หรือเป็นตัวเอง
  const canEditNote = (sp) => isAdmin(user) || myNamesOf(user).includes(sp);
  const singleRow = seller ? notes.find(n => n.salesperson === seller) : null;
  // โหลดค่าเดิม · แถวเก่าก่อนมีฟอร์ม (มี note ข้อความ ไม่มี data) → ยกข้อความมาไว้ช่อง "หมายเหตุเพิ่มเติม" กันหาย
  const savedData = useMemo(() => {
    const d = normNoteData(singleRow?.data);
    if (!singleRow?.data && singleRow?.note && !d.extra.trim()) d.extra = String(singleRow.note);
    return d;
  }, [singleRow]);
  // โหลดค่าเข้าฟอร์มเมื่อดึงโน้ตใหม่/เปลี่ยนวัน (notes identity เปลี่ยนเฉพาะตอน refetch → ไม่ทับที่กำลังพิมพ์)
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect -- ตั้งใจ sync ฟอร์มจากค่าที่ดึงมา เฉพาะตอน refetch/เปลี่ยนวัน/เปลี่ยนเซลล์ (ใส่ savedData เป็น dep จะทับสิ่งที่กำลังพิมพ์)
  useEffect(() => { setNoteData(savedData); }, [notes, seller, dateISO]);
  const noteDirty = useMemo(() => JSON.stringify(normNoteData(noteData)) !== JSON.stringify(savedData), [noteData, savedData]);

  const saveNote = async (sp) => {
    setNoteBusy(true);
    const data = normNoteData(noteData);
    const empty = isNoteDataEmpty(data);
    const summary = empty ? '' : (noteSummaryText(data) || 'มีข้อมูลบันทึกประจำวัน');
    const { error, degraded } = await saveCrmNote({ salesperson: sp, date: dateISO, note: summary, data: empty ? null : data });
    setNoteBusy(false);
    if (error) {
      const miss = /relation .* does not exist|tmk_crm_notes|schema cache/i.test(error.message || '');
      toast(miss ? 'ต้องรัน migration 20260731-crm-targets-notes.sql ใน Supabase ก่อน' : 'บันทึกไม่สำเร็จ', 'error');
      return;
    }
    if (degraded) toast('บันทึกข้อความแล้ว แต่ช่องตัวเลขยังไม่ถูกเก็บ — ต้องรัน migration 20260805-crm-note-data.sql', 'warn');
    else toast('บันทึกแล้ว', 'success');
    setNotes(await fetchCrmNotes(dateISO));
  };
  // helpers อัปเดตฟอร์ม · setCall กัน "รับ > โทรทั้งหมด" (ให้ total ≥ answered เสมอ → รายงานไม่ขัดกัน)
  const setCall = (grp, key, v) => setNoteData(d => {
    const g = { ...d.calls[grp] };
    g[key] = Math.max(0, Math.round(Number(v) || 0));
    if (key === 'total' && g.answered > g.total) g.answered = g.total;   // ลดโทรรวม → รับตามลง
    if (key === 'answered' && g.answered > g.total) g.total = g.answered; // รับเกินโทรรวม → ดันโทรรวมขึ้น
    return { ...d, calls: { ...d.calls, [grp]: g } };
  });
  const setNum = (key, v) => setNoteData(d => ({ ...d, [key]: Math.max(0, Number(v) || 0) }));
  const setTxt = (key, v) => setNoteData(d => ({ ...d, [key]: v }));

  return (
    <div className="flex flex-col gap-4">
      {/* tiles สรุปวัน (7 ใบ) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <CrmDayTile label="ยอด CRM" value={baht(line + phone)} tone="var(--accent)" />
        <CrmDayTile label="ยอด LINE" value={baht(line)} tone={LINE_C} />
        <CrmDayTile label="ยอดโทร" value={baht(phone)} tone={PHONE_C} />
        <CrmDayTile label="ออเดอร์" value={N(ords.length)} />
        <CrmDayTile label="จำนวนตัว" value={N(qty)} />
        <CrmDayTile label="ลูกค้าที่ซื้อ" value={N(buyers)} />
        <CrmDayTile label="ส่วนลดรวม" value={discTotal > 0 ? baht(discTotal) : '—'} tone={discTotal > 0 ? 'var(--bad)' : undefined} />
      </div>

      {/* บันทึกประจำวัน CRM — ฟอร์มมีช่อง แบบ A (การ์ดสีประจำหมวด · กดเพื่อเปิด) · อยู่ในรูปแคปด้วย */}
      {seller ? (
        (canEditNote(seller) || singleRow?.note) && (
          canEditNote(seller) ? (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--line)' }}>
              {/* หัวกดเพื่อย่อ/กาง */}
              <button type="button" onClick={() => setNoteOpen(o => !o)} className="w-full flex items-center gap-3 p-3 text-left" style={{ background: 'transparent' }}>
                <span className="shrink-0 grid place-items-center rounded-lg [&_svg]:size-[18px]" style={{ width: 34, height: 34, background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="chat" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>บันทึกประจำวัน — {seller}</span>
                  <span className="block text-[12px] truncate" style={{ color: 'var(--ink-4)' }}>{noteDirty ? 'มีการแก้ยังไม่บันทึก' : (isNoteDataEmpty(savedData) ? 'ยังไม่กรอก · กดเพื่อเปิดฟอร์ม' : `บันทึกแล้ว · ${noteSummaryText(savedData) || 'มีข้อมูล'}`)}</span>
                </span>
                <span className="shrink-0 transition-transform [&_svg]:size-[18px]" style={{ color: 'var(--ink-4)', transform: noteOpen ? 'rotate(-180deg)' : 'none' }}><Icon name="chevD" /></span>
              </button>
              {noteOpen && (
                <div className="flex flex-col gap-3 p-3 pt-0">
                  {/* การโทร — โซนฟ้า */}
                  <div className="rounded-[10px] p-3" style={{ background: 'var(--accent-soft)', borderLeft: '3px solid var(--accent)' }}>
                    <div className="text-[12px] font-semibold mb-2.5 [&_svg]:size-[15px] flex items-center gap-1.5" style={{ color: 'var(--accent-2)' }}><Icon name="phone" /> การโทร</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <NoteCallGroup title="0DAY" g={noteData.calls.d0} onChange={(k, v) => setCall('d0', k, v)} tone="var(--accent-2)" />
                      <NoteCallGroup title="5DAY" g={noteData.calls.d5} onChange={(k, v) => setCall('d5', k, v)} tone="var(--accent-2)" />
                      <NoteCallGroup title="Repurchase" g={noteData.calls.rep} onChange={(k, v) => setCall('rep', k, v)} tone="var(--accent-2)" />
                    </div>
                    <div className="text-[11px] mt-2" style={{ color: 'var(--accent-2)' }}>รวม <b>{totalCalls(noteData)}</b> สาย — คิดให้อัตโนมัติ</div>
                  </div>
                  {/* ผลการขาย — โซนเขียว */}
                  <div className="rounded-[10px] p-3" style={{ background: 'var(--good-soft)', borderLeft: '3px solid var(--good)' }}>
                    <div className="text-[12px] font-semibold mb-2.5 [&_svg]:size-[15px] flex items-center gap-1.5" style={{ color: 'var(--good)' }}><Icon name="chat" /> ผลการขาย</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <NoteNum label="อัพเซลล์ (ออเดอร์)" value={noteData.upsellOrders} onChange={v => setNum('upsellOrders', v)} />
                      <NoteNum label="อัพเซลล์ (บาท)" value={noteData.upsellBaht} onChange={v => setNum('upsellBaht', v)} />
                      <NoteNum label="ออเดอร์แถม" value={noteData.freebieOrders} onChange={v => setNum('freebieOrders', v)} />
                      <NoteNum label="โปรวันเกิด" value={noteData.birthdayOrders} onChange={v => setNum('birthdayOrders', v)} />
                    </div>
                  </div>
                  {/* เสียงลูกค้า — โซนเหลือง */}
                  <div className="rounded-[10px] p-3" style={{ background: 'var(--warn-soft)', borderLeft: '3px solid var(--warn)' }}>
                    <div className="text-[12px] font-semibold mb-2.5 [&_svg]:size-[15px] flex items-center gap-1.5" style={{ color: 'var(--warn)' }}><Icon name="chat" /> เสียงลูกค้า</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <label className="flex flex-col gap-1"><span className="text-[11px]" style={{ color: 'var(--ink-4)' }}>ถามหาอะไร</span><Textarea rows={2} className="text-[13px]" style={{ background: 'var(--surface)' }} value={noteData.ask} onChange={e => setTxt('ask', e.target.value)} placeholder="เช่น เสื้อแบบมีกระเป๋า" /></label>
                      <label className="flex flex-col gap-1"><span className="text-[11px]" style={{ color: 'var(--ink-4)' }}>ชมเรื่องอะไร</span><Textarea rows={2} className="text-[13px]" style={{ background: 'var(--surface)' }} value={noteData.praise} onChange={e => setTxt('praise', e.target.value)} placeholder="—" /></label>
                      <label className="flex flex-col gap-1"><span className="text-[11px]" style={{ color: 'var(--ink-4)' }}>ติอะไร</span><Textarea rows={2} className="text-[13px]" style={{ background: 'var(--surface)' }} value={noteData.complaint} onChange={e => setTxt('complaint', e.target.value)} placeholder="—" /></label>
                    </div>
                  </div>
                  {/* หมายเหตุเพิ่มเติม (รับข้อความโน้ตเก่าก่อนมีฟอร์มมาไว้ที่นี่ด้วย) */}
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px]" style={{ color: 'var(--ink-4)' }}>หมายเหตุเพิ่มเติม (ถ้ามี)</span>
                    <Textarea rows={2} className="text-[13px]" value={noteData.extra} onChange={e => setTxt('extra', e.target.value)} placeholder="เรื่องอื่นๆ ที่อยากบันทึกไว้" />
                  </label>
                  {/* ระบบเติมเอง (คิดสดจากออเดอร์จริง — เข้ารายงานอัตโนมัติ ไม่ต้องกรอก) */}
                  <div className="rounded-[10px] px-3 py-2 text-[12px] leading-relaxed" style={{ background: 'var(--accent-soft)', color: 'var(--accent-2)' }}>
                    <b>ระบบเติมให้เอง</b> (เข้ารายงานอัตโนมัติ): ยอด CRM {baht(line + phone)} (LINE {baht(line)} · โทร {baht(phone)}) · {N(ords.length)} ออเดอร์ · {N(qty)} ตัว · ปิด Repurchase {N(repurchaseOrders)} ({baht(repurchaseBaht)}) · ลูกค้าซื้อ {N(buyers)} คน (เก่า {N(oldCust)} · ใหม่ {N(newCust)})
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <Button size="sm" disabled={noteBusy || !noteDirty} onClick={() => saveNote(seller)}><Icon name="check" /> บันทึก</Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--line)' }}>
              <div className="cap mb-1.5" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>บันทึกประจำวัน — {seller}</div>
              <div className="text-[13px]" style={{ color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{singleRow?.note}</div>
            </div>
          )
        )
      ) : notes.length > 0 && (
        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--line)' }}>
          <div className="cap mb-1.5" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>บันทึกประจำวัน</div>
          <div className="flex flex-col gap-1.5">
            {notes.filter(n => (n.note || '').trim()).map(n => <div key={n.id} className="text-[13px]" style={{ color: 'var(--ink-2)' }}><b style={{ color: 'var(--ink)' }}>{n.salesperson}:</b> <span style={{ whiteSpace: 'pre-wrap' }}>{n.note}</span></div>)}
          </div>
        </div>
      )}

      <div>
        <div className="text-sm font-semibold mb-1.5" style={{ color: 'var(--ink)' }}>ออเดอร์ CRM วันนี้ ({N(ords.length)})</div>
        {ords.length === 0
          ? <div className="rounded-lg border p-6 text-center text-sm" style={{ color: 'var(--ink-4)' }}>ไม่มีออเดอร์ CRM ในวันนี้</div>
          : loading
            ? <div className="flex flex-col gap-2">{Array.from({ length: Math.min(ords.length, 3) }).map((_, i) => <Skel key={i} w="100%" h={90} r={9} />)}</div>
            : <div className="flex flex-col gap-2">
                {ords.map((o, i) => (
                  <OrderCard key={o.order_no + '#' + i} o={o} lines={lineBy?.get(o.order_no)} fin={finBy[`${o.source || ''}:${o.order_no}`]} onPickCustomer={onPickCustomer} />
                ))}
              </div>}
      </div>
    </div>
  );
}
