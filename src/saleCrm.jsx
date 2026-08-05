/* ============================================================
   saleCrm.jsx — ลูกค้า (CRM) · PART 45: ครบจบพร้อมใช้งาน + UI คลีน
   ============================================================
   - ยอด/ครั้ง/ซื้อล่าสุด = คำนวณสดจาก tmk_mp_orders (คีย์ customer_code จากใบเสร็จ
     · fallback 'N'+ชื่อ สำหรับออเดอร์เก่าที่ code ว่าง) → ยกเลิกใบแล้วยอดหายทันที
   - โปรไฟล์ (เบอร์/ที่อยู่/เจ้าของ/แท็ก/โน้ต) = tmk_mp_customers · แก้ไขได้ใน drawer
   - "สร้างงานติดตาม" → เปิดงานใหม่ในระบบโครงการ (prefill ชื่อ/รายละเอียด)
   - Insight ต่อลูกค้า: ลาย/สี/ไซซ์ที่ซื้อบ่อย (จาก tmk_mp_skus · lazy ตอนเปิด drawer)
   ============================================================ */
import { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { N, Icon, Skel, SkelTable, useDelayedFlag, PersonAvatar } from './components.jsx';
import { channelColor, MetricCard, DonutChart, StackedBars } from './charts.jsx';
import { SideSheet } from './modals-core.jsx';
import { FormSection, DrawerGroup, DrawerField, Field } from './saleWidgets.jsx';
import { OrderCard } from './orderCard.jsx';
import { rfmTiers } from './lib/saleAgg.js';
import { buildCrmMonth, isCrmOrder, crmCustomerKey, crmTargetProgress } from './lib/crmAgg.js';
import { isCancelled } from './lib/salePerfAgg.js';
import { mergeOrderOverrides } from './lib/saleOverrides.js';
import { fetchCrmTargets, fetchCrmNotes, saveCrmNote } from './lib/crmTargets.js';
import { blankNoteData, normNoteData, isNoteDataEmpty, noteSummaryText, buildCrmDailyReport, totalCalls } from './lib/crmDailyNote.js';
import { useUser } from './userContext.jsx';
import { isAdmin, myNamesOf } from './lib/roleAccess.js';
import { Progress } from '@/components/ui/progress';
import { fmtBaht } from './lib/money.js';
import { cachedFetchAll, CUST_SEL, OVERRIDES_SEL, invalidateSaleCache } from './lib/saleData.js';
import { MonthPicker } from './components/MonthPicker.jsx';
import { makeSkuResolver, loadResolverMaps } from './lib/designResolve.js';
import { useSaleLiveReload } from './lib/useSaleLive.js';
import { T } from './lib/tables.js';
import { usePersistedState } from './hooks/usePersistedState.js';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { downloadCsv } from './lib/exportCsv.js';
import { logAudit } from './lib/audit.js';
import { useTableSort, SortHead, CardTable } from './components/DataTableParts.jsx';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { SearchInput } from '@/components/ui/search-input';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';

const baht = (n) => fmtBaht(Number(n) || 0); // decimal-aware กลาง (lib/money.js)
const todayISO = () => new Date().toISOString().slice(0, 10);
try { localStorage.removeItem('tmk-crm-seller'); } catch { /* เลิก persist ตัวเลือกเซลล์ — เข้าใหม่ล็อคเซลล์หลักเสมอ (PART 87.2) */ }
const num = (v) => Number(v) || 0;
const toast = (m, t) => window.__toast && window.__toast(m, t);
const TIER_CHIP = { 'เพชร': 'tier-chip-diamond', 'ทอง': 'tier-chip-gold', 'เงิน': 'tier-chip-silver', 'ทองแดง': 'tier-chip-bronze' };
const TIERS = ['เพชร', 'ทอง', 'เงิน', 'ทองแดง'];
const PER_PAGE = 50;
const CRM_SORT = {
  name: (c) => (c.name || '').toLowerCase(),
  sales: (c) => c.sales || 0,
  count: (c) => c.count || 0,
  recency: (c) => (c.recency == null ? Infinity : c.recency), // ใหม่สุด = recency น้อย
};
// สถานะลูกค้า — ป้าย → predicate (เลือกหลายอัน = OR)
const STATUS_PRED = {
  'ลูกค้าใหม่': c => c.flag === 'ใหม่',
  'ซื้อซ้ำ': c => c.repeat,
  'เสี่ยงหลุด': c => c.flag === 'เสี่ยงหลุด',
  'มีเบอร์': c => c.hasContact,
  'คิวตามต่อ': c => c.queue,
};
const STATUS_OPTS = Object.keys(STATUS_PRED);

/* ---------- ตัวกรอง dropdown (เลือกหลายอัน + เช็คบ็อกซ์ — แพทเทิร์นเดียวกับหน้าออเดอร์) ---------- */
function MultiSelect({ label, options, value, onChange }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  const n = value.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={'rounded-full font-medium' + (n ? ' border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-2)]' : '')}>
          {label}
          {n > 0 && <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[11px]">{n}</Badge>}
          <Icon name="down" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-auto">
        <DropdownMenuLabel className="flex items-center justify-between py-1">
          <span>{label}</span>
          {n > 0 && <button className="text-[12px] font-medium text-[var(--bad)] hover:underline" onClick={(e) => { e.preventDefault(); onChange([]); }}>ล้าง</button>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.length === 0 && <div className="px-2 py-2 text-[13px] text-[var(--ink-4)]">ไม่มีข้อมูล</div>}
        {options.map(o => (
          <DropdownMenuCheckboxItem key={o} checked={value.includes(o)} onSelect={(e) => { e.preventDefault(); toggle(o); }}>
            <span className="min-w-0 flex-1 truncate">{o || '(ไม่ระบุ)'}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
function _pageList(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out = [1];
  const lo = Math.max(2, cur - 1), hi = Math.min(total - 1, cur + 1);
  if (lo > 2) out.push('…');
  for (let p = lo; p <= hi; p++) out.push(p);
  if (hi < total - 1) out.push('…');
  out.push(total);
  return out;
}

/* ---------- โหลดข้อมูล ---------- */
// โปรไฟล์ — graceful เมื่อคอลัมน์เสริม (note/contact_channel/last_order) ยังไม่มี
async function loadProfiles() {
  let r = await cachedFetchAll('tmk_mp_customers', CUST_SEL + ',contact_channel,note,last_order');
  if (r.error && /contact_channel|note|last_order|column/i.test(r.error.message || '')) r = await cachedFetchAll('tmk_mp_customers', CUST_SEL);
  return r;
}
// source ต้องมี — ORDER_OV_KEY = `${source}:${order_no}` (merge override ระดับออเดอร์)
// payment_type/cod_amount/customer_type/note/customer_phone/job_type — ไว้ใช้ในการ์ดออเดอร์ popup รายวัน (OVERRIDES_SEL มีครบ merge ต่อเนื่อง)
const ORDERS_CRM_SEL = 'order_no,source,customer_code,customer_name,customer_social,customer_phone,channel,salesperson,province,sales,qty,order_date,status,payment_type,cod_amount,customer_type,note,job_type';

/* ---------- รวม directory: โปรไฟล์ + ออเดอร์สด + เซลล์กรอกเอง ---------- */
function buildDirectory(profiles, orders, asOf) {
  const m = new Map();
  const ensure = (key) => {
    let r = m.get(key);
    if (!r) {
      r = { key, name: '', contact: '', social: '', address: '', district: '', postcode: '', province: '', owner: '', cadence: '', note: '', contactChannel: '', repurchase: 0, tags: [], since: '', salesperson: '', sales: 0, count: 0, qty: 0, first: '', last: '', channels: new Map(), chSales: new Map(), orders: [], ltSales: 0, ltOrders: 0, profile: null };
      m.set(key, r);
    }
    return r;
  };
  const isMasked = (v) => /\*{2,}/.test(String(v || ''));
  // 1) โปรไฟล์ (tmk_mp_customers) — ข้อมูลติดต่อ/เจ้าของ/แท็ก (ข้ามโปรไฟล์ปกปิดที่หลุดเข้ามาก่อนหน้า)
  (profiles || []).forEach(p => {
    if (isMasked(p.name) || isMasked(p.customer_code)) return;
    const r = ensure(p.customer_code);
    r.profile = p; r.name = p.name || p.customer_code; r.contact = p.phone || '';
    r.social = p.social_name || ''; r.address = p.address || ''; r.district = p.district || ''; r.postcode = p.postcode || '';
    r.province = p.province || ''; r.owner = p.owner || ''; r.cadence = p.cadence || ''; r.note = p.note || '';
    r.contactChannel = p.contact_channel || ''; r.repurchase = num(p.repurchase);
    r.tags = Array.isArray(p.tags) ? p.tags : []; r.since = p.since || '';
    r.ltSales = num(p.lifetime_sales); r.ltOrders = num(p.lifetime_orders);
    if (p.last_order && p.last_order > r.last) r.last = p.last_order;   // fallback — ออเดอร์สดทับทีหลัง
  });
  // 2) ออเดอร์สด (tmk_mp_orders) — ยอด/ครั้ง/ล่าสุด ต่อคน (ตัดใบยกเลิก → ยอดไม่ค้าง)
  const orderKey = (o) => {
    // ลูกค้าปกปิด (Shopee mask "ณ******์") → ไม่คลัสเตอร์ (เช็คชื่อ/รหัสก่อน · ครอบออเดอร์เก่าที่ code เป็นคีย์ปกปิด)
    if (isMasked(o.customer_name) || isMasked(o.customer_code)) return '';
    const c = String(o.customer_code || '').trim();
    if (c) return c;
    const n = String(o.customer_name || '').trim();
    return n ? 'N' + n.slice(0, 60) : '';   // ออเดอร์เก่า code ว่าง — จับด้วยชื่อ (คีย์เดียวกับโปรไฟล์ N)
  };
  (orders || []).forEach(o => {
    if (o.status === 'cancelled') return;
    const k = orderKey(o); if (!k) return;   // ไม่มีชื่อ/รหัสลูกค้า (มาร์เก็ตเพลสนิรนาม) — ไม่ขึ้น CRM
    const r = ensure(k);
    if (!r.name) r.name = o.customer_name || k;
    if (!r.social) r.social = o.customer_social || '';
    if (!r.province) r.province = o.province || '';
    if (!r.salesperson) r.salesperson = o.salesperson || '';
    r.sales += num(o.sales); r.count += 1; r.qty += num(o.qty);
    const d = o.order_date || '';
    if (d && (!r.first || d < r.first)) r.first = d;
    if (d > r.last) r.last = d;
    if (o.channel) { r.channels.set(o.channel, (r.channels.get(o.channel) || 0) + 1); r.chSales.set(o.channel, (r.chSales.get(o.channel) || 0) + num(o.sales)); }
    r.orders.push({ date: d, order_no: o.order_no, channel: o.channel || '', sales: num(o.sales), qty: num(o.qty) });
  });
  const arr = [...m.values()];
  // โปรไฟล์เก่าจาก import (CE####) ที่ไม่มีออเดอร์สดในระบบ → โชว์ยอดสะสมเดิม (อ่านอย่างเดียว)
  arr.forEach(r => { if (r.count === 0 && r.ltOrders > 0) { r.sales = r.ltSales; r.count = r.ltOrders; } });
  const { rows: tiered } = rfmTiers(arr.map(r => ({ ...r, orders: r.count })), asOf);
  const tmap = new Map(tiered.map(t => [t.key, t]));
  return arr.map(r => {
    const t = tmap.get(r.key) || {};
    const mainChannel = [...r.channels.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || r.contactChannel || '';
    // segment โทร/LINE: เป็นสมาชิกถ้าเคยซื้อผ่านช่องนั้น หรือถูกตั้ง "ช่องทางติดต่อหลัก (CRM)" ไว้ (r.contactChannel)
    const segPhone = r.channels.has('Phone') || r.contactChannel === 'Phone';
    const segLine = r.channels.has('LINE') || r.contactChannel === 'LINE';
    return {
      ...r, orders: r.orders.sort((a, b) => (b.date || '').localeCompare(a.date || '')),
      aov: r.count ? r.sales / r.count : 0,
      recency: t.recency, tier: t.tier, flag: t.flag,
      repeat: r.count > 1, hasContact: !!r.contact, queue: !!(r.cadence || r.owner), mainChannel,
      segPhone, segLine, segCrm: segPhone || segLine,
      phoneSales: r.chSales.get('Phone') || 0, lineSales: r.chSales.get('LINE') || 0,
    };
  }).sort((a, b) => b.sales - a.sales);
}

/* ---------- Skeleton (แดชบอร์ด + ตาราง) ---------- */
function CrmSkeleton() {
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
const LINE_C = channelColor('LINE');   // #06c755
const PHONE_C = channelColor('Phone'); // #3aa0c9
// delta % เทียบเดือนก่อน → { delta, deltaUp } | null
const dlt = (cur, prev) => {
  if (prev == null || prev <= 0) return null;
  const p = Math.round((cur - prev) / prev * 100);
  if (p === 0) return null;
  return { delta: `${p > 0 ? '+' : ''}${p}%`, deltaUp: p > 0 };
};

function CrmDashboard({ stats, month, setMonth, curYm, seller, setSeller, target, targetProg, isAdminUser, onDayClick }) {
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
          <Button variant="outline" size="sm" onClick={() => window.__goSection?.('settings', 'targets')}><Icon name="target" /> ตั้งเป้า CRM</Button>
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
// ช่องตัวเลขฟอร์มบันทึกประจำวัน — 0 โชว์ว่าง (พิมพ์ทับง่าย) · ชิดขวา tabular
function NoteNum({ label, value, onChange }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px]" style={{ color: 'var(--ink-4)' }}>{label}</span>
      <Input type="number" inputMode="numeric" min={0} className="h-8 text-[13px] text-right tabular-nums"
        value={value === 0 ? '' : value} placeholder="0" onChange={e => onChange(e.target.value)} />
    </label>
  );
}
// กลุ่มโทร (0DAY / 5DAY / Repurchase) — โทรทั้งหมด + รับสาย · ไม่รับคิดให้อัตโนมัติ
function NoteCallGroup({ title, g, onChange }) {
  const missed = Math.max(0, (Number(g.total) || 0) - (Number(g.answered) || 0));
  const cell = (key, lb) => (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] w-9 shrink-0" style={{ color: 'var(--ink-4)' }}>{lb}</span>
      <Input type="number" inputMode="numeric" min={0} className="h-8 text-[13px] text-right tabular-nums"
        value={g[key] === 0 ? '' : g[key]} placeholder="0" onChange={e => onChange(key, e.target.value)} />
    </div>
  );
  return (
    <div className="rounded-lg p-2.5" style={{ border: '1px solid var(--line)' }}>
      <div className="text-[12px] font-semibold mb-1.5" style={{ color: 'var(--ink-2)' }}>{title}</div>
      <div className="flex flex-col gap-1.5">{cell('total', 'โทร')}{cell('answered', 'รับ')}</div>
      <div className="text-[11px] mt-1.5" style={{ color: 'var(--ink-4)' }}>ไม่รับ <b style={{ color: 'var(--ink-2)' }}>{missed}</b> สาย</div>
    </div>
  );
}
// การ์ดออเดอร์ → ใช้ OrderCard กลาง (orderCard.jsx · PART 88) — ดีไซน์ Lemon: ส่วนลดที่หัว + สรุปเงินท้ายรายการ
function CrmDayDetail({ dateISO, orders, allOrders, seller, user, onPickCustomer }) {
  const [lineBy, setLineBy] = useState(null); // order_no → [{design,color,size,qty,line_sales}]
  const [finBy, setFinBy] = useState({});     // "source:order_no" → {subtotal,discount,shipping,vat}
  const [notes, setNotes] = useState([]);     // บันทึกประจำวัน ของวันนั้น (ทุกคน)
  const [noteData, setNoteData] = useState(blankNoteData()); // ฟอร์มมีช่อง (PART 91)
  const [noteBusy, setNoteBusy] = useState(false);
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
  useEffect(() => { setNoteData(savedData); }, [notes, seller, dateISO]); // eslint-disable-line react-hooks/exhaustive-deps
  const noteDirty = useMemo(() => JSON.stringify(normNoteData(noteData)) !== JSON.stringify(savedData), [noteData, savedData]);
  const autoFor = () => ({ crmSales: line + phone, line, phone, orders: ords.length, qty, buyers, oldCust, newCust, repurchaseOrders, repurchaseBaht });

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
  const copyReport = async (sp) => {
    const text = buildCrmDailyReport({ seller: sp, dateISO, auto: autoFor(), data: noteData });
    try { await navigator.clipboard.writeText(text); toast('คัดลอกรายงานแล้ว — วางในไลน์ได้เลย', 'success'); }
    catch { toast('คัดลอกไม่สำเร็จ — เบราว์เซอร์บล็อก คลิปบอร์ด', 'error'); }
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

      {/* บันทึกประจำวัน CRM — ฟอร์มมีช่อง (PART 91) · อยู่ในรูปแคปด้วย */}
      {seller ? (
        (canEditNote(seller) || singleRow?.note) && (
          <div className="rounded-xl border p-3" style={{ borderColor: 'var(--line)' }}>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="cap" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>บันทึกประจำวัน — {seller}</span>
              <span className="ml-auto text-[11px]" style={{ color: 'var(--ink-4)' }}>{dateISO}</span>
            </div>
            {canEditNote(seller) ? (
              <div className="flex flex-col gap-3">
                {/* การโทร 3 กลุ่ม */}
                <div>
                  <div className="cap mb-1.5" style={{ color: 'var(--ink-4)' }}><Icon name="phone" /> การโทร</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <NoteCallGroup title="0DAY" g={noteData.calls.d0} onChange={(k, v) => setCall('d0', k, v)} />
                    <NoteCallGroup title="5DAY" g={noteData.calls.d5} onChange={(k, v) => setCall('d5', k, v)} />
                    <NoteCallGroup title="Repurchase" g={noteData.calls.rep} onChange={(k, v) => setCall('rep', k, v)} />
                  </div>
                  <div className="text-[11px] mt-1.5" style={{ color: 'var(--ink-4)' }}>รวม <b style={{ color: 'var(--ink-2)' }}>{totalCalls(noteData)}</b> สาย — คิดให้อัตโนมัติ</div>
                </div>
                {/* ผลจากการโทร/แชท */}
                <div>
                  <div className="cap mb-1.5" style={{ color: 'var(--ink-4)' }}><Icon name="chat" /> ผลการขาย</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <NoteNum label="อัพเซลล์ (ออเดอร์)" value={noteData.upsellOrders} onChange={v => setNum('upsellOrders', v)} />
                    <NoteNum label="อัพเซลล์ (บาท)" value={noteData.upsellBaht} onChange={v => setNum('upsellBaht', v)} />
                    <NoteNum label="ออเดอร์แถม" value={noteData.freebieOrders} onChange={v => setNum('freebieOrders', v)} />
                    <NoteNum label="โปรวันเกิด" value={noteData.birthdayOrders} onChange={v => setNum('birthdayOrders', v)} />
                  </div>
                </div>
                {/* เสียงลูกค้า */}
                <div>
                  <div className="cap mb-1.5" style={{ color: 'var(--ink-4)' }}>เสียงลูกค้า</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label className="flex flex-col gap-1"><span className="text-[11px]" style={{ color: 'var(--ink-4)' }}>ถามหาอะไร</span><Textarea rows={2} className="text-[13px]" value={noteData.ask} onChange={e => setTxt('ask', e.target.value)} placeholder="เช่น เสื้อแบบมีกระเป๋า" /></label>
                    <label className="flex flex-col gap-1"><span className="text-[11px]" style={{ color: 'var(--ink-4)' }}>ชมเรื่องอะไร</span><Textarea rows={2} className="text-[13px]" value={noteData.praise} onChange={e => setTxt('praise', e.target.value)} placeholder="—" /></label>
                    <label className="flex flex-col gap-1"><span className="text-[11px]" style={{ color: 'var(--ink-4)' }}>ติอะไร</span><Textarea rows={2} className="text-[13px]" value={noteData.complaint} onChange={e => setTxt('complaint', e.target.value)} placeholder="—" /></label>
                  </div>
                </div>
                {/* หมายเหตุเพิ่มเติม (รับข้อความโน้ตเก่าก่อนมีฟอร์มมาไว้ที่นี่ด้วย) */}
                <label className="flex flex-col gap-1">
                  <span className="text-[11px]" style={{ color: 'var(--ink-4)' }}>หมายเหตุเพิ่มเติม (ถ้ามี)</span>
                  <Textarea rows={2} className="text-[13px]" value={noteData.extra} onChange={e => setTxt('extra', e.target.value)} placeholder="เรื่องอื่นๆ ที่อยากบันทึกไว้" />
                </label>
                {/* ระบบเติมเอง (คิดสดจากออเดอร์จริง — เข้ารายงานอัตโนมัติ ไม่ต้องกรอก) */}
                <div className="rounded-lg px-3 py-2 text-[12px] leading-relaxed" style={{ background: 'var(--accent-soft, var(--surface-2))', color: 'var(--accent)' }}>
                  <b>ระบบเติมให้เอง</b> (เข้ารายงานอัตโนมัติ): ยอด CRM {baht(line + phone)} (LINE {baht(line)} · โทร {baht(phone)}) · {N(ords.length)} ออเดอร์ · {N(qty)} ตัว · ปิด Repurchase {N(repurchaseOrders)} ({baht(repurchaseBaht)}) · ลูกค้าซื้อ {N(buyers)} คน (เก่า {N(oldCust)} · ใหม่ {N(newCust)})
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => copyReport(seller)}><Icon name="chat" /> คัดลอกรายงานส่ง LINE</Button>
                  <Button size="sm" disabled={noteBusy || !noteDirty} onClick={() => saveNote(seller)}><Icon name="check" /> บันทึก</Button>
                </div>
              </div>
            ) : <div className="text-[13px]" style={{ color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{singleRow?.note}</div>}
          </div>
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

/* ============================================================
   หน้า ลูกค้า (CRM)
   ============================================================ */
export function CrmView() {
  const [raw, setRaw] = useState(null); // { profiles, orders } — orders merge override แล้ว
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = usePersistedState('tmk-crm-statusF', []);
  const [ownerF, setOwnerF] = usePersistedState('tmk-crm-ownerF', []);
  const [channelF, setChannelF] = usePersistedState('tmk-crm-channelF', []);
  const [provF, setProvF] = usePersistedState('tmk-crm-provF', []);
  const [tierF, setTierF] = usePersistedState('tmk-crm-tierF', []);
  const [seg, setSeg] = usePersistedState('tmk-crm-seg', 'all'); // แยกช่องทาง: all | crm | phone | line
  const [month, setMonth] = usePersistedState('tmk-crm-month', todayISO().slice(0, 7)); // แดชบอร์ด CRM
  const [seller, setSeller] = useState(null); // scope เซลล์ CRM (session-only) · null = ยังไม่เลือก (default = เซลล์หลัก · เข้าใหม่ล็อคเสมอ) · '' = รวมทุกคน
  const [crmTargets, setCrmTargets] = useState([]); // เป้า CRM ต่อเซลล์ของเดือนที่ดู
  const { user } = useUser();
  const [dayOpen, setDayOpen] = useState(null); // 'YYYY-MM-DD' ที่กดในกราฟ → popup รายวัน
  const [sel, setSel] = useState(null);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rk, setRk] = useState(0); // bump จาก realtime → refetch สด

  useEffect(() => {
    let alive = true;   // 1.6: กัน setState หลัง unmount (fetch all-time ช้า)
    (async () => {
      const [p, o, ov] = await Promise.all([
        loadProfiles(),
        cachedFetchAll('tmk_mp_orders', ORDERS_CRM_SEL),
        cachedFetchAll('tmk_order_overrides', OVERRIDES_SEL),
      ]);
      if (!alive) return;
      if (p.error) { setErr(p.error.message); return; }
      // merge override (channel/ยอด/วันที่ ที่แอดมินแก้) ทับออเดอร์ดิบ — ให้ยอด CRM ตรง dashboard/perf
      const ovMap = {}; if (ov && !ov.error) (ov.data || []).forEach(x => { ovMap[x.order_id] = x; });
      const orders = mergeOrderOverrides(o.error ? [] : (o.data || []), ovMap);
      setRaw({ profiles: p.data || [], orders });
    })();
    return () => { alive = false; };
  }, [rk]);
  // realtime: ออเดอร์/ลูกค้า/override เปลี่ยน → CRM เห็นสด (invalidate cache ก่อน refetch — บทเรียน PART 80)
  useSaleLiveReload([T.mpOrders, T.mpCustomers, T.orderOverrides], () => setRk(k => k + 1), { invalidate: [T.mpOrders, T.mpCustomers, T.orderOverrides] });

  // เป้า CRM ต่อเซลล์ของเดือนที่ดู (graceful [] ก่อน migration) · rk เพื่อ refresh หลังตั้งค่า
  const curYm = todayISO().slice(0, 7);
  const monthClamped = month > curYm ? curYm : month; // เดือน persisted อนาคต → clamp
  useEffect(() => { let alive = true; (async () => { const t = await fetchCrmTargets(monthClamped); if (alive) setCrmTargets(t); })(); return () => { alive = false; }; }, [monthClamped, rk]);

  // directory (ตารางลูกค้า all-time) + stats (แดชบอร์ด CRM รายเดือน) — derive จาก raw
  const data = useMemo(() => raw ? buildDirectory(raw.profiles, raw.orders, todayISO()) : null, [raw]);
  // statsAll = รวมทุกคน (ให้ bySeller + default เซลล์หลัก) · effSeller = seller ที่เลือก (null → default = เซลล์ CRM อันดับ 1)
  const statsAll = useMemo(() => raw ? buildCrmMonth(raw.orders, monthClamped, '') : null, [raw, monthClamped]);
  const effSeller = seller === null ? (statsAll?.bySeller?.[0]?.name || '') : seller;
  const stats = useMemo(() => {
    if (!raw) return null;
    return effSeller === '' ? statsAll : buildCrmMonth(raw.orders, monthClamped, effSeller);
  }, [raw, monthClamped, effSeller, statsAll]);
  // เป้า CRM: เลือกคน → เป้าคนนั้น · รวมทุกคน → ผลรวมเป้าทุกเซลล์ (ตรง requirement) · ความคืบหน้าเทียบยอดสะสม
  const target = useMemo(() => {
    if (!effSeller) return crmTargets.reduce((s, t) => s + (Number(t.sales_target) || 0), 0);
    return Number(crmTargets.find(t => t.salesperson === effSeller)?.sales_target) || 0;
  }, [crmTargets, effSeller]);
  const targetProg = useMemo(() => stats ? crmTargetProgress({ crmSales: stats.crmSales, month: monthClamped, target, todayISO: todayISO() }) : null, [stats, monthClamped, target]);
  // ออเดอร์ที่ scope ตามเซลล์ (สำหรับ popup รายวัน)
  const dayOrders = useMemo(() => {
    const os = raw?.orders || [];
    return effSeller ? os.filter(o => (o.salesperson || '').trim() === effSeller) : os;
  }, [raw, effSeller]);

  // แก้โปรไฟล์จาก drawer → patch raw.profiles (ตาราง+memo คำนวณใหม่) + sel in-place (drawer ที่เปิดอยู่)
  const applyProfile = (key, row) => {
    // อัปเดตโปรไฟล์ต้นทาง — buildDirectory คีย์ตาม p.customer_code
    setRaw(prev => {
      if (!prev) return prev;
      const profiles = [...(prev.profiles || [])];
      const idx = profiles.findIndex(p => p.customer_code === key);
      if (idx >= 0) profiles[idx] = { ...profiles[idx], ...row };
      else profiles.push({ ...row, customer_code: key });
      return { ...prev, profiles };
    });
    // drawer ที่เปิดอยู่ — merge in-place ให้เห็นผลทันที (memo ไม่ผูกกับ sel)
    setSel(s => {
      if (!s || s.key !== key) return s;
      const contactChannel = row.contact_channel ?? s.contactChannel;
      const segPhone = s.channels?.has?.('Phone') || contactChannel === 'Phone';
      const segLine = s.channels?.has?.('LINE') || contactChannel === 'LINE';
      return {
        ...s,
        name: row.name || s.name, contact: row.phone ?? s.contact, social: row.social_name ?? s.social,
        address: row.address ?? s.address, province: row.province ?? s.province,
        owner: row.owner ?? s.owner, cadence: row.cadence ?? s.cadence,
        note: row.note ?? s.note, tags: Array.isArray(row.tags) ? row.tags : s.tags,
        contactChannel, segPhone, segLine, segCrm: segPhone || segLine,
        hasContact: !!(row.phone || s.contact), queue: !!((row.cadence ?? s.cadence) || (row.owner ?? s.owner)),
      };
    });
  };

  const opts = useMemo(() => {
    const d = data || [];
    const uniq = (f) => [...new Set(d.map(f).filter(Boolean))].sort();
    return {
      owners: uniq(c => c.owner),
      channels: uniq(c => c.mainChannel),
      provs: uniq(c => c.province),
      tiers: TIERS.filter(t => d.some(c => c.tier === t)),
    };
  }, [data]);

  // segment โทร/LINE (แยกช่องทาง) — CRM = โทร+LINE · สมาชิกจากช่องที่เคยซื้อ + ที่ตั้ง contact_channel ไว้
  const segRows = useMemo(() => {
    const d = data || [];
    if (seg === 'crm') return d.filter(c => c.segCrm);
    if (seg === 'phone') return d.filter(c => c.segPhone);
    if (seg === 'line') return d.filter(c => c.segLine);
    return d;
  }, [data, seg]);
  // ยอดที่เกี่ยวกับ segment (โทร→ยอดโทร · LINE→ยอดไลน์ · อื่น→ยอดรวม)
  const segSalesOf = (c) => seg === 'phone' ? c.phoneSales : seg === 'line' ? c.lineSales : c.sales;

  const filtered = useMemo(() => {
    let r = segRows;
    const sf = statusF.filter(s => STATUS_PRED[s]);   // ทิ้งป้ายเก่าที่ persisted จากเวอร์ชันก่อน
    if (sf.length) r = r.filter(c => sf.some(s => STATUS_PRED[s](c)));
    if (ownerF.length) r = r.filter(c => ownerF.includes(c.owner));
    if (channelF.length) r = r.filter(c => channelF.includes(c.mainChannel));
    if (provF.length) r = r.filter(c => provF.includes(c.province));
    if (tierF.length) r = r.filter(c => tierF.includes(c.tier));
    const ql = q.trim().toLowerCase();
    if (ql) r = r.filter(c => `${c.name} ${c.contact} ${c.social} ${c.owner} ${c.salesperson} ${c.province}`.toLowerCase().includes(ql));
    return r;
  }, [segRows, statusF, ownerF, channelF, provF, tierF, q]);

  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(filtered, { key: 'sales', dir: 'desc', accessors: CRM_SORT });
  useEffect(() => { setPage(1); }, [statusF, ownerF, channelF, provF, tierF, q, seg, sortKey, sortDir]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const pageClamped = Math.min(page, totalPages);
  const pageRows = sorted.slice((pageClamped - 1) * PER_PAGE, pageClamped * PER_PAGE);
  const nFilters = statusF.length + ownerF.length + channelF.length + provF.length + tierF.length;
  const activeChips = [
    ...statusF.map(v => ({ dim: 'สถานะ', v, clear: () => setStatusF(statusF.filter(x => x !== v)) })),
    ...ownerF.map(v => ({ dim: 'เซลล์', v, clear: () => setOwnerF(ownerF.filter(x => x !== v)) })),
    ...channelF.map(v => ({ dim: 'ช่องทาง', v, clear: () => setChannelF(channelF.filter(x => x !== v)) })),
    ...provF.map(v => ({ dim: 'จังหวัด', v, clear: () => setProvF(provF.filter(x => x !== v)) })),
    ...tierF.map(v => ({ dim: 'ระดับ', v, clear: () => setTierF(tierF.filter(x => x !== v)) })),
  ];
  const clearFilters = () => { setStatusF([]); setOwnerF([]); setChannelF([]); setProvF([]); setTierF([]); };

  const showSkel = useDelayedFlag(!data, 120);
  if (err) return <div className="content-inner"><Card className="p-5" style={{ color: 'var(--bad)' }}>{err}</Card></div>;
  if (showSkel) return <CrmSkeleton />;
  if (!data) return null;

  const total = segRows.length; // ใช้ใน empty state ของตาราง
  const SEGS = [['all', 'ทั้งหมด'], ['crm', 'CRM (โทร+LINE)'], ['phone', 'โทร'], ['line', 'LINE']];

  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      {/* แดชบอร์ดยอด CRM รายเดือน (โทร + LINE) — PART 87 · พาดหัวสลับเซลล์ได้ + กดแท่งดูรายวัน */}
      {stats && <CrmDashboard stats={stats} month={monthClamped} setMonth={setMonth} curYm={curYm}
        seller={effSeller} setSeller={setSeller}
        target={target} targetProg={targetProg} isAdminUser={isAdmin(user)}
        onDayClick={(i) => { const d = stats.byDay[i]; if (d) setDayOpen(d.date); }} />}

      {/* คั่น: ด้านบน = แดชบอร์ดรายเดือน · ด้านล่าง = รายชื่อลูกค้าทั้งหมด (ไม่จำกัดเดือน) */}
      <div className="row items-center gap-2" style={{ marginTop: 4, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
        <Icon name="users" />
        <h2 className="m-0 text-lg font-bold leading-tight" style={{ color: 'var(--ink)' }}>รายชื่อลูกค้า</h2>
        <span className="cap" style={{ color: 'var(--ink-4)' }}>ทั้งหมด ไม่จำกัดเดือน</span>
      </div>
      {/* แยกช่องทาง: ทั้งหมด | CRM(โทร+LINE) | โทร | LINE — สลับแล้วตาราง+สรุปคิดตาม segment */}
      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <ToggleGroup type="single" value={seg} onValueChange={(v) => v && setSeg(v)} className="gap-0.5 rounded-md border bg-muted/30 p-0.5">
          {SEGS.map(([v, l]) => <ToggleGroupItem key={v} value={v} size="sm" className="px-3 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm">{l}</ToggleGroupItem>)}
        </ToggleGroup>
        {seg !== 'all' && <span className="cap" style={{ color: 'var(--ink-4)' }}>ลูกค้าที่เคยซื้อผ่านช่องนี้ หรือถูกตั้ง "ช่องทางติดต่อหลัก" ไว้</span>}
      </div>

      {/* ตารางลูกค้า */}
      <Card className="p-4">
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 mr-1 text-base font-bold leading-tight" style={{ color: 'var(--ink)', whiteSpace: 'nowrap' }}>ลูกค้า</h3>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 rounded-full">
                <Icon name="filter" /> ตัวกรอง{nFilters > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{nFilters}</Badge>}
                <Icon name={filtersOpen ? 'up' : 'down'} />
              </Button>
            </CollapsibleTrigger>
            {nFilters > 0 && <Button variant="ghost" size="sm" className="text-[var(--bad)]" onClick={clearFilters}><Icon name="x" /> ล้าง</Button>}
          </div>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <SearchInput value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา" wrapperClassName="w-full sm:w-[240px]" />
            <Button variant="outline" size="sm" className="flex-none" disabled={!filtered.length}
              onClick={() => downloadCsv(`ลูกค้า_CRM_${filtered.length}ราย`, sorted, [
                { label: 'ชื่อลูกค้า', key: 'name' },
                { label: 'เบอร์', key: 'contact' },
                { label: 'โซเชียล', key: 'social' },
                { label: 'ช่องทางหลัก', key: 'mainChannel' },
                { label: 'จังหวัด', key: 'province' },
                { label: 'เซลล์', map: (c) => c.owner || c.salesperson || '' },
                { label: 'ระดับ', key: 'tier' },
                { label: 'ยอดซื้อสะสม', key: 'sales' },
                { label: 'จำนวนครั้ง', key: 'count' },
                { label: 'ซื้อล่าสุด', key: 'last' },
              ])} title="ส่งออกลูกค้าตามตัวกรองปัจจุบัน">
              <Icon name="external" /> CSV
            </Button>
          </div>
        </div>
          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {activeChips.map(({ dim, v, clear }) => <Badge key={dim + v} variant="outline" onClick={clear} title="คลิกเพื่อเอาออก" style={{ cursor: 'pointer', padding: '2px 8px' }}><span style={{ color: 'var(--ink-4)' }}>{dim}:</span> {v || '(ไม่ระบุ)'} <Icon name="x" /></Badge>)}
            </div>
          )}
          <CollapsibleContent>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingTop: 12, marginTop: 10, borderTop: '1px solid var(--line)' }}>
              <span className="cap" style={{ color: 'var(--ink-4)', fontWeight: 600, width: 64, flexShrink: 0 }}>ตัวกรอง</span>
              <MultiSelect label="สถานะ" options={STATUS_OPTS} value={statusF} onChange={setStatusF} />
              {opts.channels.length > 0 && <MultiSelect label="ช่องทาง" options={opts.channels} value={channelF} onChange={setChannelF} />}
              {opts.provs.length > 0 && <MultiSelect label="จังหวัด" options={opts.provs} value={provF} onChange={setProvF} />}
              {opts.owners.length > 0 && <MultiSelect label="เซลล์" options={opts.owners} value={ownerF} onChange={setOwnerF} />}
              {opts.tiers.length > 0 && <MultiSelect label="ระดับ" options={opts.tiers} value={tierF} onChange={setTierF} />}
            </div>
          </CollapsibleContent>
        </Collapsible>

        <CardTable className="cozy"><Table>
          <TableHeader><TableRow>
            <SortHead field="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>ลูกค้า</SortHead>
            <TableHead>ติดต่อ</TableHead>
            <TableHead>ระดับ</TableHead>
            <SortHead field="sales" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">ยอดซื้อ</SortHead>
            <SortHead field="count" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">ครั้ง</SortHead>
            <SortHead field="recency" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">ซื้อล่าสุด</SortHead>
          </TableRow></TableHeader>
          <TableBody>
            {pageRows.length === 0 && (
              <TableRow><TableCell colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-4)', padding: '28px 0' }}>
                {total === 0 ? 'ยังไม่มีลูกค้าในระบบ — ส่งยอดใบเสร็จแล้วลูกค้าจะเข้ามาที่นี่เอง' : 'ไม่พบลูกค้าที่ตรงกับตัวกรอง'}
              </TableCell></TableRow>
            )}
            {pageRows.map(c => (
              <TableRow key={c.key} onClick={() => setSel(c)} style={{ cursor: 'pointer' }}>
                <TableCell className="cell-title">
                  <div className="crm-person">
                    <PersonAvatar name={c.name} size={34} color={channelColor(c.mainChannel)} className={!c.contact ? 'opacity-60' : ''} />
                    <div style={{ minWidth: 0 }}>
                      <div className="crm-name">{c.name}</div>
                      <div className="cap" style={{ color: 'var(--ink-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.province || c.owner || c.salesperson || '—'}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="cap" style={{ whiteSpace: 'nowrap' }}>
                  {c.contact ? <span className="num">{c.contact}</span> : (c.social ? <span style={{ color: 'var(--ink-3)' }}>@{c.social}</span> : <span style={{ color: 'var(--ink-4)' }}>—</span>)}
                  {c.mainChannel && <Badge variant="outline" className="ml-1.5 rounded-full text-[10px] font-medium" style={{ color: channelColor(c.mainChannel), background: `color-mix(in srgb, ${channelColor(c.mainChannel)} 14%, transparent)`, borderColor: `color-mix(in srgb, ${channelColor(c.mainChannel)} 40%, transparent)` }}>{c.mainChannel}</Badge>}
                </TableCell>
                <TableCell>{c.tier && <span className={`tier-chip ${TIER_CHIP[c.tier] || ''}`}>{c.tier}</span>}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right', fontWeight: 600 }}>
                  {baht(c.sales)}
                  {(seg === 'phone' || seg === 'line') && <div className="cap" style={{ color: channelColor(seg === 'phone' ? 'Phone' : 'LINE'), fontWeight: 500 }}>{seg === 'phone' ? 'โทร' : 'LINE'} {baht(segSalesOf(c))}</div>}
                </TableCell>
                <TableCell className="num" style={{ textAlign: 'right' }}>{N(c.count)}</TableCell>
                <TableCell className="num cap" style={{ textAlign: 'right', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                  {c.recency != null ? `${N(c.recency)} วันก่อน` : (c.last || '—')}
                  {c.flag && <Badge variant="outline" className="ml-1.5 rounded-full text-[10px]" style={{ color: c.flag === 'เสี่ยงหลุด' ? 'var(--warn)' : 'var(--accent)', borderColor: 'currentColor' }}>{c.flag}</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table></CardTable>

        {filtered.length > PER_PAGE && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="cap" style={{ color: 'var(--ink-4)' }}>แสดง {N((pageClamped - 1) * PER_PAGE + 1)}–{N(Math.min(pageClamped * PER_PAGE, filtered.length))} จาก {N(filtered.length)} ราย</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="gap-1" disabled={pageClamped <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}><Icon name="left" /> ก่อนหน้า</Button>
              {_pageList(pageClamped, totalPages).map((p, i) => p === '…'
                ? <span key={'e' + i} className="px-1.5 text-[var(--ink-4)]">…</span>
                : <Button key={p} variant={p === pageClamped ? 'default' : 'outline'} size="sm" className="min-w-9 px-0" onClick={() => setPage(p)}>{p}</Button>)}
              <Button variant="outline" size="sm" className="gap-1" disabled={pageClamped >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>ถัดไป <Icon name="right" /></Button>
            </div>
          </div>
        )}
      </Card>

      {/* popup รายละเอียดวัน (กดแท่งกราฟ) */}
      {dayOpen && (
        <SideSheet size="lg" icon="calendarDays"
          title={`ออเดอร์ CRM วันที่ ${Number(dayOpen.slice(8, 10))}`}
          sub={`${dayOpen}${effSeller ? ` · ${effSeller}` : ' · รวมทุกคน'}`}
          onClose={() => setDayOpen(null)}>
          <CrmDayDetail dateISO={dayOpen} orders={dayOrders} allOrders={raw?.orders} seller={effSeller} user={user}
            onPickCustomer={(o) => { const c = (data || []).find(x => x.key === crmCustomerKey(o)); setDayOpen(null); if (c) setSel(c); }} />
        </SideSheet>
      )}

      {sel && <CustomerDetail c={sel} onClose={() => setSel(null)} onSaved={applyProfile} />}
    </div>
  );
}

/* ============================================================
   Drawer รายละเอียดลูกค้า — ดู/แก้โปรไฟล์ + งานติดตาม + Insight
   ============================================================ */
// CrmField/CrmGroup ยุบไปใช้ DrawerField/DrawerGroup กลาง (saleWidgets · PART 83)
// ชิปนับความถี่ "ดำ ×5" — ใช้กับ Insight ลาย/สี/ไซซ์
const FreqChips = ({ label, items }) => items.length > 0 && (
  <div style={{ marginTop: 12 }}>
    <div className="cap mb-1.5" style={{ fontWeight: 600, color: 'var(--ink-3)' }}>{label}</div>
    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
      {items.slice(0, 8).map(([k, n]) => <Badge key={k} variant="outline">{k}{n > 1 ? <span style={{ color: 'var(--ink-4)', marginLeft: 3 }}>×{N(n)}</span> : null}</Badge>)}
    </div>
  </div>
);

function CustomerDetail({ c, onClose, onSaved }) {
  const [insight, setInsight] = useState(null);   // { designs, colors, sizes, desByOrder } — lazy จาก skus
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);

  // Insight: ลาย/สี/ไซซ์ ที่ซื้อบ่อย + ลายต่อออเดอร์ (โหลดครั้งเดียวต่อลูกค้า)
  useEffect(() => {
    let live = true;
    setInsight(null);
    (async () => {
      const nos = [...new Set((c.orders || []).map(o => o.order_no).filter(x => x && !String(x).startsWith('(')))];
      if (!nos.length) { if (live) setInsight({ designs: [], colors: [], sizes: [], desByOrder: {} }); return; }
      const rows = [];
      for (let i = 0; i < nos.length; i += 150) {
        // ดึง product_code/raw/วันที่ เพิ่ม → resolve ชื่อลายสด (ตรงแดชบอร์ด · แก้ชื่อในแคตตาล็อกไม่แตก 2 bucket)
        const { data } = await supabase.from('tmk_mp_skus').select('order_no,design,color,size,qty,product_code,raw_sku_or_name,order_date').in('order_no', nos.slice(i, i + 150));
        rows.push(...(data || []));
      }
      if (!live) return;
      // resolve ชื่อลายสดด้วย resolver เดียวกับหน้าออเดอร์/แดชบอร์ด (catalog→alias→golden→frozen + as-of)
      const maps = await loadResolverMaps(supabase);
      if (!live) return;
      const resolve = makeSkuResolver(maps);
      rows.forEach(s => { s.design = resolve(s).design || s.design; });
      const cnt = (keyf) => { const mm = new Map(); rows.forEach(s => { const k = (keyf(s) || '').trim(); if (!k) return; mm.set(k, (mm.get(k) || 0) + (Number(s.qty) || 1)); }); return [...mm.entries()].sort((a, b) => b[1] - a[1]); };
      const desByOrder = {};
      rows.forEach(s => { if (s.design) (desByOrder[s.order_no] = desByOrder[s.order_no] || new Set()).add(s.design); });
      setInsight({ designs: cnt(s => s.design), colors: cnt(s => s.color), sizes: cnt(s => s.size), desByOrder });
    })();
    return () => { live = false; };
  }, [c.key]);

  const copy = async (text, label) => { try { await navigator.clipboard.writeText(text); toast(`คัดลอก${label}แล้ว`, 'success'); } catch { toast('คัดลอกไม่ได้', 'error'); } };

  // สร้างงานติดตาม → เปิดงานใหม่ในระบบโครงการ (prefill)
  const followUp = () => {
    const detail = [
      `ลูกค้า: ${c.name}`,
      c.contact && `เบอร์: ${c.contact}`,
      c.last && `ซื้อล่าสุด: ${c.last}${c.recency != null ? ` (${c.recency} วันก่อน)` : ''}`,
      c.sales > 0 && `ยอดสะสม: ${baht(c.sales)} · ${N(c.count)} ครั้ง`,
      c.note && `โน้ต: ${c.note}`,
    ].filter(Boolean).join('\n');
    onClose();
    window.__openModal?.('task', { title: `โทรตาม ${c.name}${c.contact ? ` (${c.contact})` : ''}`, detail, date: todayISO() });
  };

  const startEdit = () => {
    setF({ name: c.name || '', phone: c.contact || '', social: c.social || '', address: c.address || '', province: c.province || '', owner: c.owner || '', cadence: c.cadence || '', note: c.note || '', tags: [...(c.tags || [])], contactChannel: c.contactChannel || '' });
    setEditing(true);
  };
  const saveProfile = async () => {
    if (!f.name.trim()) { toast('ใส่ชื่อลูกค้าก่อน', 'error'); return; }
    setBusy(true);
    try {
      const row = {
        customer_code: c.key,
        name: f.name.trim(), phone: f.phone.replace(/\D/g, ''), social_name: f.social.trim(),
        address: f.address.trim(), province: f.province.trim(),
        owner: f.owner.trim(), cadence: f.cadence.trim(), note: f.note.trim(),
        contact_channel: f.contactChannel || '',
        tags: f.tags, updated_at: new Date().toISOString(),
      };
      let { error } = await supabase.from('tmk_mp_customers').upsert(row, { onConflict: 'customer_code' });
      if (error && /note|cadence|tags|contact_channel|column/i.test(error.message || '')) {   // คอลัมน์เสริมยังไม่มี → เซฟส่วนที่เหลือ
        const r2 = { ...row }; delete r2.note; delete r2.cadence; delete r2.tags; delete r2.contact_channel;
        ({ error } = await supabase.from('tmk_mp_customers').upsert(r2, { onConflict: 'customer_code' }));
      }
      if (error) { toast('บันทึกไม่สำเร็จ: ' + error.message, 'error'); return; }
      toast('บันทึกโปรไฟล์แล้ว', 'success');
      logAudit({
        action: 'update', entityType: 'customer', entityName: row.name || c.key, entityId: row.customer_code || c.key,
        summary: `แก้โปรไฟล์ลูกค้า ${row.name || c.key}`,
        fields: [
          { label: 'ชื่อ', value: row.name || '—' },
          { label: 'เบอร์', value: row.phone || '—' },
          { label: 'โซเชียล', value: row.social_name || '—' },
          { label: 'จังหวัด', value: row.province || '—' },
          ...(row.owner ? [{ label: 'เจ้าของ', value: row.owner }] : []),
          ...(row.cadence ? [{ label: 'รอบติดตาม', value: row.cadence }] : []),
          ...(Array.isArray(row.tags) && row.tags.length ? [{ label: 'แท็ก', value: row.tags.join(', ') }] : []),
        ],
      });
      invalidateSaleCache('tmk_mp_customers');
      onSaved?.(c.key, row);
      setEditing(false);
    } catch (e) { toast('บันทึกไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
    finally { setBusy(false); }
  };

  const addr = c.address || (c.province ? `${c.district ? c.district + ' · ' : ''}${c.province} ${c.postcode || ''}` : '');
  // desByOrder เลิกใช้ — ประวัติซื้อเปลี่ยนเป็นการ์ดกลางที่โหลดรายการสินค้าเองตอนขยาย (PART 88)

  return (
    <SideSheet size="lg" icon="user" title={c.name} sub={`${c.tier || ''} · ${baht(c.sales)} · ${N(c.count)} ครั้ง`} onClose={onClose}
      footer={editing
        ? <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
          <Button variant="outline" onClick={() => setEditing(false)} disabled={busy}>ยกเลิก</Button>
          <Button onClick={saveProfile} disabled={busy || !f?.name?.trim()}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึกโปรไฟล์'}</Button>
        </div>
        : <Button variant="outline" onClick={onClose}>ปิด</Button>}>

      {!editing ? (<>
        {/* แถวปุ่มลัด */}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {c.contact && <Button size="sm" asChild><a href={`tel:${c.contact}`} style={{ textDecoration: 'none' }}><Icon name="phone" /> โทร {c.contact}</a></Button>}
          {c.contact && <Button size="sm" variant="outline" onClick={() => copy(c.contact, 'เบอร์')}>คัดลอกเบอร์</Button>}
          {addr && <Button size="sm" variant="outline" onClick={() => copy(addr, 'ที่อยู่')}>คัดลอกที่อยู่</Button>}
          <Button size="sm" variant="outline" onClick={followUp}><Icon name="plus" /> สร้างงานติดตาม</Button>
          <Button size="sm" variant="outline" onClick={startEdit}><Icon name="pencil" /> แก้ไข</Button>
        </div>
        {(c.flag || c.cadence || c.repurchase > 0) && (
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {c.flag && <Badge variant="outline" className="rounded-full" style={{ color: c.flag === 'เสี่ยงหลุด' ? 'var(--bad)' : 'var(--accent)' }}>{c.flag}</Badge>}
            {c.cadence && <Badge variant="outline" className="rounded-full" style={{ color: 'var(--warn)' }}>ตามต่อ {c.cadence}</Badge>}
            {c.repurchase > 0 && <Badge variant="outline" className="rounded-full" style={{ color: 'var(--good)' }}>ซื้อซ้ำรอบ {c.repurchase}</Badge>}
          </div>
        )}

        {/* KPI strip */}
        <div className="mb-4 flex items-stretch overflow-hidden rounded-xl border" style={{ borderColor: 'var(--line)' }}>
          {[
            { label: 'ยอดซื้อรวม', val: baht(c.sales), color: 'var(--accent)' },
            { label: 'จำนวนครั้ง', val: N(c.count) },
            { label: 'เฉลี่ย/ครั้ง', val: baht(c.aov) },
            { label: 'ซื้อล่าสุด', val: c.recency != null ? `${N(c.recency)} วันก่อน` : (c.last || '—') },
          ].map((m, i) => (
            <div key={m.label} className="flex-1 px-3 py-2.5 text-center" style={i > 0 ? { borderLeft: '1px solid var(--line)' } : undefined}>
              <div className="text-[15px] font-bold leading-tight tabular-nums" style={{ color: m.color || 'var(--ink)' }}>{m.val}</div>
              <div className="mt-0.5 text-[11px]" style={{ color: 'var(--ink-4)' }}>{m.label}</div>
            </div>
          ))}
        </div>

        <DrawerGroup icon="user" title="ข้อมูลลูกค้า">
          {c.social && <DrawerField label="โซเชียล">@{c.social}</DrawerField>}
          {(c.owner || c.salesperson) && <DrawerField label={c.owner ? 'เซลล์เจ้าของ' : 'เซลล์'}><span style={{ color: c.owner ? 'var(--good)' : 'var(--ink)' }}>{c.owner || c.salesperson}</span></DrawerField>}
          {c.mainChannel && <DrawerField label="ช่องทางหลัก"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full shrink-0" style={{ background: channelColor(c.mainChannel) }} />{c.mainChannel}</span></DrawerField>}
          {c.province && <DrawerField label="จังหวัด">{c.province}</DrawerField>}
          {c.since && <DrawerField label="เป็นลูกค้าตั้งแต่">{c.since}</DrawerField>}
          {c.last && <DrawerField label="ซื้อล่าสุด">{c.last}</DrawerField>}
          {addr && <DrawerField label="ที่อยู่จัดส่ง" full>{addr}</DrawerField>}
          {c.note && <DrawerField label="โน้ต" full><span style={{ whiteSpace: 'pre-wrap', fontWeight: 500 }}>{c.note}</span></DrawerField>}
        </DrawerGroup>

        {/* Insight ซื้อบ่อย */}
        {insight && (insight.designs.length > 0 || insight.colors.length > 0 || insight.sizes.length > 0) && (
          <div className="rounded-xl border p-3.5 mt-3.5" style={{ borderColor: 'var(--line)', background: 'var(--surface-2, transparent)' }}>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-[14px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="sparkle" /></span>
              <span className="text-[13px] font-bold" style={{ color: 'var(--ink)' }}>ซื้อบ่อย — ใช้เชียร์ขายซ้ำ</span>
            </div>
            <FreqChips label="ลาย" items={insight.designs} />
            <FreqChips label="สี" items={insight.colors} />
            <FreqChips label="ไซซ์" items={insight.sizes} />
          </div>
        )}

        {c.tags && c.tags.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="cap mb-2" style={{ fontWeight: 600, color: 'var(--ink-3)' }}>แท็ก</div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{c.tags.map((t, i) => <Badge key={i} variant="accent" style={{ fontSize: 11 }}>{t}</Badge>)}</div>
          </div>
        )}

        {/* ประวัติซื้อ — แถวย่อกดขยายเป็นการ์ดเต็ม (PART 88 · โหลดรายการสินค้า/ส่วนลดเฉพาะใบที่กด) */}
        <div className="cap mb-2" style={{ fontWeight: 600, color: 'var(--ink-3)', marginTop: 16 }}>ประวัติการซื้อ ({N((c.orders || []).length)})</div>
        {(c.orders || []).length === 0
          ? <div className="cap" style={{ color: 'var(--ink-4)', padding: 12 }}>ไม่มีประวัติออเดอร์ในระบบ</div>
          : <div className="flex flex-col gap-1.5" style={{ maxHeight: 340, overflowY: 'auto' }}>
              {(c.orders || []).map((o, i) => <OrderCard key={o.order_no + '#' + i} o={o} collapsed />)}
            </div>}
      </>) : (
        /* ---------- โหมดแก้ไขโปรไฟล์ ---------- */
        <FormSection icon="user" title="แก้ไขโปรไฟล์ลูกค้า">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="ชื่อลูกค้า *"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="เบอร์โทร"><Input inputMode="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="เช่น 0812345678" /></Field>
            <Field label="โซเชียล (FB/LINE)"><Input value={f.social} onChange={e => setF({ ...f, social: e.target.value })} /></Field>
            <Field label="จังหวัด"><Input value={f.province} onChange={e => setF({ ...f, province: e.target.value })} /></Field>
            <Field label="เซลล์เจ้าของ"><Input value={f.owner} onChange={e => setF({ ...f, owner: e.target.value })} placeholder="ชื่อเซลล์ที่ดูแล" /></Field>
            <Field label="ตามต่อ (เช่น 7D / 30D)"><Input value={f.cadence} onChange={e => setF({ ...f, cadence: e.target.value })} placeholder="เว้นว่าง = ไม่ตั้ง" /></Field>
          </div>
          {/* ช่องทางติดต่อหลัก (CRM) — กำหนดว่าลูกค้ารายนี้เป็นลูกค้า "โทร/LINE" (เข้ากลุ่ม CRM แม้ยอดมาจากช่องอื่น) */}
          <Field label="ช่องทางติดต่อหลัก (CRM)" className="mt-3">
            <ToggleGroup type="single" value={f.contactChannel || 'none'} onValueChange={(v) => setF({ ...f, contactChannel: v === 'none' ? '' : v })} className="gap-0.5 rounded-md border bg-muted/30 p-0.5 w-fit">
              {[['none', 'ไม่ระบุ'], ['Phone', 'โทร'], ['LINE', 'LINE'], ['Facebook', 'Facebook']].map(([v, l]) => (
                <ToggleGroupItem key={v} value={v} size="sm" className="px-3 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm">{l}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          <Field label="ที่อยู่จัดส่ง" className="mt-3"><Textarea rows={2} value={f.address} onChange={e => setF({ ...f, address: e.target.value })} /></Field>
          {/* แท็ก — พิมพ์แล้ว Enter เพื่อเพิ่ม */}
          <Field label={`แท็ก (${f.tags.length})`} className="mt-3">
            {f.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{f.tags.map((t, i) => (
              <Badge key={t + i} variant="secondary" className="gap-1 rounded-full py-1 pl-2.5 pr-1 font-normal">{t}
                <button type="button" aria-label={`ลบ ${t}`} className="ml-0.5 inline-flex rounded-full p-0.5 text-[var(--ink-4)] hover:bg-[var(--surface-2)] hover:text-[var(--bad)]" onClick={() => setF({ ...f, tags: f.tags.filter((_, j) => j !== i) })}><Icon name="x" /></button>
              </Badge>
            ))}</div>}
            <Input className="h-8" placeholder="พิมพ์แท็กแล้วกด Enter เช่น ขายส่ง / VIP" onKeyDown={e => {
              const v = e.target.value.trim();
              if (e.key === 'Enter' && v) { e.preventDefault(); if (!f.tags.includes(v)) setF({ ...f, tags: [...f.tags, v] }); e.target.value = ''; }
            }} />
          </Field>
          <Field label="โน้ต" className="mt-3"><Textarea rows={3} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="บันทึกภายใน เช่น ชอบสั่งช่วงสิ้นเดือน / ให้ส่ง Flash เท่านั้น" /></Field>
        </FormSection>
      )}
    </SideSheet>
  );
}
