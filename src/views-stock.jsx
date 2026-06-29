/* ============================================================
   views-stock.jsx — ระบบสต็อก/คลังสินค้า (แยกอิสระ · shadcn ล้วน)
   ============================================================
   เอากลับมาเป็นหน้าใน sidebar section "คลัง/สต็อก" — 3 หน้า:
     · สินค้า (ProductsView)   · สต็อก (StockView + ProductVariantMatrix)   · PO (POView)
   ใช้ backend เดิมทั้งหมด (tmk_products / tmk_purchase_orders + modals ที่ mount อยู่แล้ว)
   ไม่แตะระบบอื่น/Supabase อื่น — อ่าน TMK.products/poTracker + เปิด modal ผ่าน window.__openModal
   ============================================================ */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { TMK } from './data.js';
import { useData } from './dataContext.jsx';
import { B, P, N, Icon, SIZES, stockMeta, ORDER_STATUSES, barcodeSVGString, useBeatOn, PageSkeleton } from './components.jsx';
import { mutateProductReservations, mutateProductRow, advanceOrderStatus } from './modals.jsx';
import { deductLots, restockLots, lotsTotal } from './lib/lotOps.js';
import { supabase } from './lib/supabaseClient.js';
import { logAudit } from './lib/audit.js';
import { downloadCsv } from './lib/exportCsv.js';
import { thaiDate, todayISO } from './lib/dateUtils.js';
import { aggOps, suggestReorder } from './lib/opsAgg.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const DD = TMK;
const guardEdit = () => { if (!window.__canEdit) { window.__toast?.('สิทธิ์ "ดูอย่างเดียว" — แก้ไขไม่ได้ (ติดต่อแอดมิน)', 'warn'); return false; } return true; };
// "ลาย" (design) จาก strategy ที่เก็บรูป "ลาย: X" (มาจากนำเข้า) — จัดกลุ่มโดยไม่ต้องเพิ่มคอลัมน์ DB
function productDesign(p) { const m = /ลาย\s*[:：]\s*([^·|,]+)/.exec(p?.strategy || ''); return m ? m[1].trim() : ''; }

// ป้ายสถานะสต็อก (shadcn Badge) — ปกติ/ใกล้หมด/หมด
function StockBadge({ stock }) {
  if (stock === 'out') return <Badge variant="destructive">หมดสต็อก</Badge>;
  if (stock === 'low') return <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400">ใกล้หมด</Badge>;
  return <Badge variant="secondary">ปกติ</Badge>;
}

/* ====================  สินค้า  ==================== */
function ProductsView() {
  const products = DD.products || [];
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('rank');
  const [filter, setFilter] = useState('all');
  const [cat, setCat] = useState('');
  const [groupDesign, setGroupDesign] = useState(false);
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
  const hasAnyDesign = products.some(p => productDesign(p));

  const ql = q.trim().toLowerCase();
  let list = products.filter(p => {
    if (ql && !`${p.name} ${p.sku || ''} ${p.barcode || ''} ${p.category || ''} ${p.supplier || ''} ${productDesign(p)}`.toLowerCase().includes(ql)) return false;
    if (cat && p.category !== cat) return false;
    if (filter === 'lots' && !p.hasLots) return false;
    if (filter === 'low' && p.stock !== 'low') return false;
    if (filter === 'out' && p.stock !== 'out') return false;
    return true;
  });
  const sorters = {
    rank: (a, b) => a.rank - b.rank,
    sold: (a, b) => b.units - a.units,
    stock: (a, b) => b.onHand - a.onHand,
    value: (a, b) => (b.stockValue || 0) - (a.stockValue || 0),
    name: (a, b) => String(a.name).localeCompare(String(b.name), 'th'),
  };
  list = [...list].sort(sorters[sort] || sorters.rank);

  const showGroups = groupDesign && hasAnyDesign;
  const designGroups = showGroups ? (() => {
    const map = new Map();
    list.forEach(p => { const d = productDesign(p) || '— ไม่ระบุลาย —'; if (!map.has(d)) map.set(d, []); map.get(d).push(p); });
    return [...map.entries()].map(([design, items]) => ({
      design, items, noDesign: design === '— ไม่ระบุลาย —', count: items.length,
      onHand: items.reduce((a, p) => a + (p.onHand || 0), 0),
      value: items.reduce((a, p) => a + (p.stockValue || 0), 0),
      sold: items.reduce((a, p) => a + (p.units || 0), 0),
    })).sort((a, b) => (a.noDesign - b.noDesign) || (b.value - a.value));
  })() : [];

  const exportProductsCSV = () => {
    downloadCsv(`tmk-products-${todayISO()}.csv`, list, [
      { label: 'ชื่อ', key: 'name' }, { label: 'หมวดหมู่', map: p => p.category || '' },
      { label: 'SKU', map: p => p.sku || '' }, { label: 'บาร์โค้ด', map: p => p.barcode || '' },
      { label: 'ผู้ผลิต', map: p => p.supplier || '' }, { label: 'ราคา', map: p => Math.round(p.price) },
      { label: 'ต้นทุนเฉลี่ย', map: p => (p.onHand > 0 && p.stockValue > 0) ? Math.round(p.stockValue / p.onHand) : '' },
      { label: 'ขายแล้ว', key: 'units' }, { label: 'รายได้', map: p => Math.round(p.rev) },
      { label: 'คงเหลือ', key: 'onHand' }, { label: 'มูลค่าสต็อก', map: p => Math.round(p.stockValue || 0) },
      { label: 'จุดสั่งซ้ำ', key: 'reorder' },
    ]);
    logAudit({ action: 'export', entityType: 'data', entityName: 'สินค้า', summary: 'ส่งออกรายการสินค้าเป็น CSV' });
    window.__toast?.('ส่งออก CSV เรียบร้อย', 'success');
  };

  const filters = [['all', 'ทั้งหมด'], ['lots', 'มีล็อต'], ['low', 'ใกล้หมด'], ['out', 'หมด']];
  const sorts = [['rank', 'ลำดับ'], ['sold', 'ขายดี'], ['stock', 'คงเหลือมาก'], ['value', 'มูลค่าสูง'], ['name', 'ชื่อ ก-ฮ']];

  const renderRow = (p, i) => {
    const avgCost = (p.onHand > 0 && p.stockValue > 0) ? p.stockValue / p.onHand : null;
    const unitProfit = avgCost != null ? p.price - avgCost : null;
    const marginPct = unitProfit != null && p.price > 0 ? (unitProfit / p.price) * 100 : null;
    const sm = stockMeta(p.stock);
    return (
      <TableRow key={p.id} onClick={() => window.__openModal('product', p)} className="cursor-pointer">
        <TableCell className="num text-muted-foreground font-bold">{i + 1}</TableCell>
        <TableCell>
          <div className="flex items-center gap-2.5">
            <span className="size-9 shrink-0 overflow-hidden rounded-md border bg-muted grid place-items-center">
              {p.image ? <img src={p.image} alt="" loading="lazy" className="size-full object-cover" /> : <span className="text-muted-foreground"><Icon name="bag" /></span>}
            </span>
            <div className="min-w-0">
              <div className="font-semibold flex items-center gap-1.5">{p.name}{p.category && <Badge variant="outline" className="font-normal">{p.category}</Badge>}</div>
              <div className="text-xs text-muted-foreground truncate">{p.hasLots ? `${p.lots.length} ล็อต · รวม ${N(p.lotTotal)} ตัว · มูลค่า ${B(p.stockValue)}${p.strategy ? ' · ' + p.strategy : ''}` : (p.sku ? `SKU ${p.sku}${p.strategy ? ' · ' + p.strategy : ''}` : p.strategy)}</div>
            </div>
          </div>
        </TableCell>
        <TableCell className="num text-right">{B(p.price)}</TableCell>
        <TableCell className="num text-right">{unitProfit == null ? <span className="text-muted-foreground">—</span> : <span style={{ color: unitProfit >= 0 ? 'var(--good)' : 'var(--bad)' }} className="font-semibold">{B(unitProfit)}<span className="text-xs font-normal ml-1">{P(marginPct, 0)}</span></span>}</TableCell>
        <TableCell className="num text-right">{N(p.units)}</TableCell>
        <TableCell className="num text-right font-bold">{B(p.rev)}</TableCell>
        <TableCell className="num text-right font-semibold" style={{ color: sm.c }}>{p.onHand}</TableCell>
        <TableCell className="text-right"><StockBadge stock={p.stock} /></TableCell>
      </TableRow>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto w-full rise">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 flex-wrap space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <span style={{ color: 'var(--accent)' }}><Icon name="bag" /></span> สินค้า
            {products.length > 0 && <span className="text-sm font-normal text-muted-foreground">({list.length}/{products.length})</span>}
          </CardTitle>
          <div className="flex items-center gap-1.5 flex-wrap">
            {products.length > 0 && <Button size="sm" variant="ghost" onClick={() => window.__openModal('label')} title="พิมพ์ป้ายราคา/บาร์โค้ด"><Icon name="bag" /> ป้าย</Button>}
            <Button size="sm" variant="ghost" onClick={() => window.__openModal('import-products')} title="นำเข้าสินค้าจากไฟล์ CSV หรือ Excel"><Icon name="external" /> นำเข้า</Button>
            <Button size="sm" variant="ghost" disabled={!list.length} onClick={exportProductsCSV} title="ส่งออก CSV"><Icon name="external" /> CSV</Button>
            <Button size="sm" onClick={() => window.__openModal('product')}><Icon name="plus" /> เพิ่มสินค้า</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {products.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <div className="flex gap-2 flex-wrap items-center">
                <Input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา ชื่อ / SKU / บาร์โค้ด / หมวด" className="flex-1 min-w-[220px]" />
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger className="w-auto min-w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{sorts.map(([id, l]) => <SelectItem key={id} value={id}>เรียง: {l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                <ToggleGroup type="single" value={filter} onValueChange={v => v && setFilter(v)} variant="outline" size="sm">
                  {filters.map(([id, l]) => <ToggleGroupItem key={id} value={id}>{l}</ToggleGroupItem>)}
                </ToggleGroup>
                {categories.length > 0 && (
                  <ToggleGroup type="single" value={cat} onValueChange={v => setCat(v || '')} variant="outline" size="sm">
                    <ToggleGroupItem value="">ทุกหมวด</ToggleGroupItem>
                    {categories.map(c => <ToggleGroupItem key={c} value={c}>{c}</ToggleGroupItem>)}
                  </ToggleGroup>
                )}
                {hasAnyDesign && (
                  <ToggleGroup type="single" value={groupDesign ? 'on' : ''} onValueChange={v => setGroupDesign(v === 'on')} variant="outline" size="sm">
                    <ToggleGroupItem value="on" title="รวมหลายล็อต/สีของลายเดียวกัน"><Icon name="layers" /> จัดกลุ่มตามลาย</ToggleGroupItem>
                  </ToggleGroup>
                )}
              </div>
            </div>
          )}

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-9">#</TableHead><TableHead>สินค้า</TableHead>
                  <TableHead className="text-right">ราคา</TableHead><TableHead className="text-right">กำไร/ตัว</TableHead>
                  <TableHead className="text-right">ขายแล้ว</TableHead><TableHead className="text-right">รายได้</TableHead>
                  <TableHead className="text-right">คงเหลือ</TableHead><TableHead className="text-right">สถานะ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">{products.length === 0 ? 'ยังไม่มีสินค้า — กด "เพิ่มสินค้า" เพื่อเริ่ม' : 'ไม่พบสินค้าที่ตรงกับเงื่อนไข'}</TableCell></TableRow>
                )}
                {showGroups
                  ? designGroups.map(g => (
                    <React.Fragment key={g.design}>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableCell colSpan={8}>
                          <div className="flex items-center justify-between flex-wrap gap-1.5">
                            <span className="font-bold flex items-center gap-1.5"><span style={{ color: g.noDesign ? 'var(--ink-4)' : 'var(--accent)' }}><Icon name="layers" /></span>{g.design}<span className="text-xs font-normal text-muted-foreground">· {N(g.count)} รายการ</span></span>
                            <span className="text-xs text-muted-foreground">คงเหลือ <b className="text-foreground">{N(g.onHand)}</b> · มูลค่า <b className="text-foreground">{B(g.value)}</b> · ขายแล้ว <b className="text-foreground">{N(g.sold)}</b></span>
                          </div>
                        </TableCell>
                      </TableRow>
                      {g.items.map((p, i) => renderRow(p, i))}
                    </React.Fragment>
                  ))
                  : list.map((p, i) => renderRow(p, i))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ====================  สต็อก / คลัง  ==================== */
function StockView() {
  const products = DD.products || [];
  const [openId, setOpenId] = useState(null);
  const activeSizes = SIZES.filter(s => products.some(p => (p.sizeStock?.[s] || 0) > 0));
  const shopUnits = products.reduce((a, p) => a + (p.onHand || 0), 0);
  const shopValue = products.reduce((a, p) => a + (p.stockValue || 0), 0);
  const shopReserved = products.reduce((a, p) => a + (p.reservedTotal || 0), 0);
  const lotCount = products.filter(p => p.hasLots).length;
  const alerts = products.filter(p => p.stock === 'out' || p.stock === 'low').sort((a, b) => (a.stock === 'out' ? 0 : 1) - (b.stock === 'out' ? 0 : 1));
  const allReservations = products.flatMap(p => (p.reservations || []).map(r => ({ ...r, product: p })));

  const suggestPO = (p) => Math.max(p.reorder || 0, (p.reorder || 0) * 2 - (p.onHand || 0), 1);
  const orderPO = (p) => window.__openModal('po', { product: p.name, quantity: suggestPO(p) });

  const releaseReservation = async (p, rsvId, alsoSell) => {
    if (!guardEdit()) return;
    try {
      const { ok, error } = await mutateProductReservations(p.id, (cur) => cur.filter(r => r.id !== rsvId));
      if (!ok) throw error || new Error('ปล่อยจองไม่สำเร็จ');
      logAudit({ action: 'release', entityType: 'product', entityName: p.name, summary: `ปล่อยจองสต็อก "${p.name}"` });
      window.__refresh?.(['tmk_products']);
      window.__toast?.(alsoSell ? 'ปล่อยจองแล้ว — บันทึกการขายต่อได้เลย' : 'ปล่อยจองเรียบร้อย', 'success');
      if (alsoSell) window.__openModal('sell', p);
    } catch (err) { window.__toast?.('ปล่อยจองไม่สำเร็จ: ' + err.message, 'error'); }
  };

  const Stat = ({ label, children }) => (
    <div><div className="text-xs text-muted-foreground">{label}</div><div className="num text-xl font-bold">{children}</div></div>
  );

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto w-full rise">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 flex-wrap space-y-0">
          <CardTitle className="flex items-center gap-2 text-base"><span style={{ color: 'var(--accent)' }}><Icon name="grid" /></span> สต็อก / คลังสินค้า</CardTitle>
          <div className="flex items-center gap-1.5 flex-wrap">
            {lotCount > 0 && <Button size="sm" onClick={() => window.__openModal('sell')}><Icon name="wallet" /> บันทึกการขาย</Button>}
            {lotCount > 0 && <Button size="sm" variant="ghost" onClick={() => window.__openModal('quickfind')}><Icon name="search" /> ขายเร็ว/สแกน</Button>}
            {lotCount > 0 && <Button size="sm" variant="ghost" onClick={() => window.__openModal('reserve')}><Icon name="clock" /> จองสต็อก</Button>}
            {lotCount > 0 && <Button size="sm" variant="ghost" onClick={() => window.__openModal('adjust')}><Icon name="box" /> ปรับสต็อก</Button>}
            <Button size="sm" variant="ghost" onClick={() => window.__openModal('product')}><Icon name="plus" /> เพิ่มสินค้า</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* แจ้งเตือน ต้องสั่งผลิต / ใกล้หมด */}
          {alerts.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
              <div className="flex items-center gap-2 mb-2 font-bold"><span style={{ color: 'var(--warn)' }}><Icon name="bell" /></span> ต้องสั่งผลิต / ใกล้หมด ({alerts.length})</div>
              <div className="flex gap-2 flex-wrap">
                {alerts.map(p => { const sm = stockMeta(p.stock); return (
                  <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-sm" style={{ borderColor: sm.c }}>
                    <span className="size-1.5 rounded-full" style={{ background: sm.c }} />
                    <span className="cursor-pointer" onClick={() => window.__openModal('product', p)}>{p.name} <span className="text-xs text-muted-foreground">เหลือ {p.onHand}</span></span>
                    <Button size="sm" variant="outline" className="h-6 px-2 ml-1" title={`สร้าง PO สั่งผลิต ~${suggestPO(p)} ตัว`} onClick={() => orderPO(p)}><Icon name="box" /> สั่ง</Button>
                  </span>
                ); })}
              </div>
            </div>
          )}

          {/* สรุปทั้งร้าน */}
          <div className="flex gap-7 flex-wrap">
            <Stat label="รวมสต็อกทั้งร้าน">{N(shopUnits)} <span className="text-xs font-normal text-muted-foreground">ตัว</span></Stat>
            <Stat label="มูลค่าต้นทุนคงคลัง">{B(shopValue)}</Stat>
            {shopReserved > 0 && <Stat label="จองรวม / พร้อมขาย">{N(shopReserved)} <span className="text-xs font-normal text-muted-foreground">/ {N(shopUnits - shopReserved)}</span></Stat>}
            <Stat label="สินค้าที่มีล็อต">{lotCount}/{products.length}</Stat>
          </div>

          {/* รายการจอง */}
          {allReservations.length > 0 && (
            <div className="rounded-md border px-3 py-2.5">
              <div className="flex items-center gap-2 mb-2 font-bold"><span style={{ color: 'var(--accent)' }}><Icon name="clock" /></span> รายการจอง ({allReservations.length})</div>
              <div className="overflow-x-auto">
                <Table>
                  <TableBody>
                    {allReservations.map(r => (
                      <TableRow key={r.id}>
                        <TableCell><span className="font-semibold">{r.product.name}</span>{r.customer && <span className="text-xs text-muted-foreground"> · {r.customer}</span>}<div className="text-xs text-muted-foreground">{(r.items || []).map(it => `${it.color} ${it.size}×${it.qty}`).join(', ')}{r.note ? ' · ' + r.note : ''}</div></TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{thaiDate(r.date) || r.date}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button size="sm" variant="ghost" onClick={() => releaseReservation(r.product, r.id, true)} title="ปล่อยจอง + บันทึกขาย"><Icon name="wallet" /> ขาย</Button>
                          <Button size="sm" variant="ghost" onClick={() => releaseReservation(r.product, r.id, false)} className="text-destructive" title="ปล่อยจอง (ยกเลิก)"><Icon name="x" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {products.length === 0
            ? <div className="text-center py-6 text-muted-foreground">ยังไม่มีสินค้า — ไปหน้า "สินค้า" เพื่อเพิ่ม + ใส่ล็อต (ไซส์ × สี)</div>
            : (
              <div className="rounded-md border overflow-x-auto">
                <Table className="min-w-max">
                  <TableHeader>
                    <TableRow>
                      <TableHead>สินค้า</TableHead>
                      {activeSizes.map(s => <TableHead key={s} className="text-center min-w-11">{s}</TableHead>)}
                      <TableHead className="text-right">รวม</TableHead><TableHead className="text-right">มูลค่า</TableHead>
                      <TableHead className="text-right">สถานะ</TableHead><TableHead className="text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map(p => {
                      const sm = stockMeta(p.stock);
                      const isOpen = openId === p.id;
                      return (
                        <React.Fragment key={p.id}>
                          <TableRow onClick={() => setOpenId(isOpen ? null : p.id)} className="cursor-pointer">
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <span className="shrink-0 text-muted-foreground transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}><Icon name="chevR" /></span>
                                <span onClick={(e) => { e.stopPropagation(); window.__openModal('product', p); }} title="แก้ไขสินค้า" className="size-8 shrink-0 overflow-hidden rounded-md border bg-muted grid place-items-center">
                                  {p.image ? <img src={p.image} alt="" loading="lazy" className="size-full object-cover" /> : <span className="text-muted-foreground"><Icon name="bag" /></span>}
                                </span>
                                <div className="min-w-0"><div className="font-semibold">{p.name}</div><div className="text-xs text-muted-foreground">{p.hasLots ? `${p.lots.length} ล็อต` : 'ไม่มีล็อต'}</div></div>
                              </div>
                            </TableCell>
                            {activeSizes.map(s => { const q = p.sizeStock?.[s] || 0; return <TableCell key={s} className="num text-center" style={{ color: q ? 'var(--ink)' : 'var(--ink-4)' }}>{q ? N(q) : '—'}</TableCell>; })}
                            <TableCell className="num text-right font-bold" style={{ color: sm.c }}>{N(p.onHand)}{p.reservedTotal > 0 && <div className="text-xs font-normal" style={{ color: 'var(--accent)' }}>จอง {N(p.reservedTotal)} · ว่าง {N(p.available)}</div>}</TableCell>
                            <TableCell className="num text-right">{p.stockValue ? B(p.stockValue) : '—'}</TableCell>
                            <TableCell className="text-right"><StockBadge stock={p.stock} /></TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <Button size="icon" variant="ghost" className="size-8" title="ประวัติเข้า-ออก" onClick={(e) => { e.stopPropagation(); window.__openModal('ledger', p); }}><Icon name="route" /></Button>
                              {p.hasLots && p.onHand > 0 && <Button size="sm" variant="ghost" title="บันทึกการขาย / ตัดสต็อก" onClick={(e) => { e.stopPropagation(); window.__openModal('sell', p); }}><Icon name="wallet" /> ขาย</Button>}
                            </TableCell>
                          </TableRow>
                          {isOpen && (
                            <TableRow className="hover:bg-transparent"><TableCell colSpan={activeSizes.length + 5} className="bg-muted/50 p-3"><ProductVariantMatrix p={p} /></TableCell></TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          {activeSizes.length === 0 && products.length > 0 && <div className="text-xs text-muted-foreground">ยังไม่มีข้อมูลไซส์ในล็อต — เปิดสินค้าแล้วเพิ่มล็อต (ไซส์ × สี) เพื่อดูภาพรวมที่นี่</div>}
        </CardContent>
      </Card>
    </div>
  );
}

// ตารางสี × ไซส์ ของสินค้า 1 ตัว (รวมทุกล็อต) — อ่านอย่างเดียว สำหรับ drill-down
function ProductVariantMatrix({ p }) {
  const variants = p.variants || {};
  const colorNames = Object.keys(variants);
  const sizes = SIZES.filter(s => (p.sizeStock?.[s] || 0) > 0);
  if (!colorNames.length || !sizes.length) return <div className="text-xs text-muted-foreground">ไม่มีข้อมูลล็อต (ไซส์ × สี) — สินค้านี้กรอกสต็อกรวมแบบไม่แยกไซส์/สี</div>;
  const hexByName = {};
  (p.lots || []).forEach(l => (l.colors || []).forEach(c => { if (c?.name && !hexByName[c.name]) hexByName[c.name] = c.hex; }));
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-max bg-background m-0">
        <TableHeader>
          <TableRow><TableHead>สี \ ไซส์</TableHead>{sizes.map(s => <TableHead key={s} className="text-center min-w-11">{s}</TableHead>)}<TableHead className="text-center">รวม</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {colorNames.map(name => {
            const row = variants[name] || {};
            const rt = sizes.reduce((a, s) => a + (row[s] || 0), 0);
            return (
              <TableRow key={name}>
                <TableCell><span className="flex items-center gap-1.5"><span className="size-3 rounded-sm border inline-block shrink-0" style={{ background: hexByName[name] || '#ccc' }} />{name}</span></TableCell>
                {sizes.map(s => { const q = row[s] || 0; const col = q === 0 ? 'var(--ink-4)' : q <= 2 ? 'var(--warn)' : 'var(--good)'; return <TableCell key={s} className="num text-center" style={{ color: col, fontWeight: q > 0 && q <= 2 ? 700 : 400 }}>{q ? N(q) : '—'}</TableCell>; })}
                <TableCell className="num text-center font-bold">{N(rt)}</TableCell>
              </TableRow>
            );
          })}
          <TableRow className="font-bold hover:bg-transparent">
            <TableCell>รวมต่อไซส์</TableCell>
            {sizes.map(s => <TableCell key={s} className="num text-center">{N(p.sizeStock?.[s] || 0)}</TableCell>)}
            <TableCell className="num text-center font-extrabold" style={{ color: 'var(--accent-2)' }}>{N(p.onHand)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

/* ====================  PO / ใบสั่งผลิต  ==================== */
function POView() {
  const poTracker = DD.poTracker || [];
  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto w-full rise">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 flex-wrap space-y-0">
          <CardTitle className="flex items-center gap-2 text-base"><span style={{ color: 'var(--accent)' }}><Icon name="box" /></span> ใบสั่งผลิต & PO โรงงาน</CardTitle>
          <Button size="sm" onClick={() => window.__openModal('po')}><Icon name="plus" /> เปิด PO ใหม่</Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow><TableHead>สินค้า</TableHead><TableHead className="text-right">จำนวน</TableHead><TableHead>วันสั่ง</TableHead><TableHead>กำหนดเข้า</TableHead><TableHead className="text-right">สถานะ</TableHead><TableHead className="text-right" /></TableRow>
              </TableHeader>
              <TableBody>
                {poTracker.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">ยังไม่มี PO — กด "เปิด PO ใหม่" เพื่อเริ่ม</TableCell></TableRow>}
                {poTracker.map(po => {
                  const matched = (DD.products || []).some(p => p.name === po.product);
                  return (
                    <TableRow key={po.id}>
                      <TableCell className="font-semibold cursor-pointer" onClick={() => window.__openModal('po', po)}>{po.product}</TableCell>
                      <TableCell className="num text-right">{N(po.quantity)} ตัว</TableCell>
                      <TableCell className="num text-xs">{po.orderDate}</TableCell>
                      <TableCell className="num text-xs">{po.arrivalDate}</TableCell>
                      <TableCell className="text-right">{po.status === 'Completed' ? <Badge variant="secondary">ของเข้าแล้ว</Badge> : <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400">กำลังผลิต</Badge>}</TableCell>
                      <TableCell className="text-right">
                        {po.status !== 'Completed' && matched && <Button size="sm" variant="ghost" title="รับเข้าสต็อก (สร้างล็อต)" onClick={() => window.__openModal('receive', po)}><Icon name="box" /> รับเข้า</Button>}
                        {po.status !== 'Completed' && !matched && <span className="text-xs text-muted-foreground" title="ชื่อ PO ไม่ตรงกับสินค้าในแคตตาล็อก">— ไม่พบสินค้า —</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ====================  ออเดอร์จัดส่ง (fulfillment · tmk_orders)  ==================== */
// พิมพ์ใบเสร็จ/ใบส่งของ (iframe print) — กู้จากระบบเดิม
function printReceipt(order) {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = (order.items || []).map(it => `<tr><td>${esc(it.name)} · ${esc(it.color)} ${esc(it.size)}</td><td style="text-align:center">${it.qty}</td><td style="text-align:right">${B(it.price)}</td><td style="text-align:right">${B((it.qty || 0) * (it.price || 0))}</td></tr>`).join('');
  const bc = barcodeSVGString(order.code, { height: 38, module: 1.3 });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(order.code)}</title><style>
    *{font-family:'Sarabun','Noto Sans Thai',system-ui,sans-serif;box-sizing:border-box}
    body{margin:0;padding:14px;max-width:340px} h2{margin:0;font-size:18px;text-align:center}
    .sub{text-align:center;font-size:11px;color:#555;margin-bottom:8px}
    table{width:100%;border-collapse:collapse;font-size:12px;margin:8px 0} td,th{padding:3px 2px;border-bottom:1px solid #eee;text-align:left}
    .tot{display:flex;justify-content:space-between;font-size:13px;margin-top:3px} .tot.big{font-weight:800;font-size:16px;border-top:1px solid #333;padding-top:4px;margin-top:4px}
    .cust{font-size:12px;margin:6px 0} .bc{text-align:center;margin-top:10px} .bc svg{max-width:100%}
    @media print{@page{margin:6mm}}
  </style></head><body>
    <h2>TMK — ใบเสร็จ / ใบส่งของ</h2><div class="sub">${esc(order.code)} · ${new Date(order.createdAt || Date.now()).toLocaleDateString('th-TH')}</div>
    <div class="cust"><b>ลูกค้า:</b> ${esc(order.customerName || '-')}</div>
    <table><thead><tr><th>รายการ</th><th style="text-align:center">จำนวน</th><th style="text-align:right">ราคา</th><th style="text-align:right">รวม</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="tot"><span>รวม</span><span>${B(order.subtotal)}</span></div>
    ${order.discount ? `<div class="tot"><span>ส่วนลด</span><span>-${B(order.discount)}</span></div>` : ''}
    <div class="tot big"><span>ยอดสุทธิ</span><span>${B(order.total)}</span></div>
    ${order.note ? `<div class="cust" style="margin-top:8px;color:#555">โน้ต: ${esc(order.note)}</div>` : ''}
    <div class="bc">${bc}<div style="font-family:monospace;font-size:10px">${esc(order.code)}</div></div>
  </body></html>`;
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document; doc.open(); doc.write(html); doc.close();
  setTimeout(() => { try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch { /* ignore */ } setTimeout(() => iframe.remove(), 1500); }, 350);
}

function OrdersView() {
  const orders = DD.orders || [];
  const [dragId, setDragId] = useState(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [showShippedAll, setShowShippedAll] = useState(false);
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();

  const cutoff = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const matchSearch = (o) => !ql || `${o.code || ''} ${o.customerName || ''} ${o.trackingNo || ''}`.toLowerCase().includes(ql);
  const shipDate = (o) => ((o.statusLog || []).filter(x => x.status === 'shipped').map(x => x.at).sort().pop() || o.createdAt || '');
  const isRecentShipped = (o) => shipDate(o).slice(0, 10) >= cutoff;
  const active = orders.filter(o => o.status !== 'cancelled' && matchSearch(o) && (o.status !== 'shipped' || showShippedAll || isRecentShipped(o)));
  const shippedHidden = orders.filter(o => o.status === 'shipped' && !isRecentShipped(o) && matchSearch(o)).length;
  const cancelled = orders.filter(o => o.status === 'cancelled' && matchSearch(o));
  const copyTrack = (o) => { try { navigator.clipboard.writeText(`${location.origin}${location.pathname}?track=${o.code}`); window.__toast?.('คัดลอกลิงก์ติดตามแล้ว — ส่งให้ลูกค้าได้เลย', 'success'); } catch { window.__toast?.('คัดลอกไม่ได้', 'error'); } };
  const changeStatus = async (o, status) => {
    if (!o || o.status === status) return;
    if (!guardEdit()) return;
    if (o.status === 'shipped') { window.__toast?.(`ออเดอร์ ${o.code} "ส่งแล้ว" — เปลี่ยนสถานะไม่ได้ (ถ้าต้องการคืนสต็อกใช้ "ปรับสต็อก")`, 'warn', 6000); return; }
    if (status === 'shipped' && !await window.__confirm?.({ title: 'ยืนยันส่งแล้ว', body: `ยืนยัน "ส่งแล้ว" ออเดอร์ ${o.code}?\nระบบจะตัดสต็อกจริงตามออเดอร์นี้ (กู้คืนไม่ได้)`, danger: true, confirmText: 'ส่งแล้ว' })) return;
    if (status === 'cancelled' && !await window.__confirm?.({ title: 'ยกเลิกออเดอร์', body: `ยกเลิกออเดอร์ ${o.code}?\nระบบจะปล่อยสต็อกที่จองคืน`, danger: true, confirmText: 'ยกเลิกออเดอร์' })) return;
    advanceOrderStatus(o, status);
  };
  const onDrop = (status) => { const o = orders.find(x => x.id === dragId); setDragId(null); changeStatus(o, status); };
  // เชื่อมข้อมูล: คลิกชื่อลูกค้า → เปิด CRM 360 ของลูกค้านั้น
  const openCrm = (o) => { window.__crmTarget = { name: o.customerName, shopId: o.customerId, phone: o.customerPhone }; window.__goSection?.('crm', 'directory'); };

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto w-full rise">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2.5">
        <h3 className="m-0 text-base font-semibold flex items-center gap-2"><span style={{ color: 'var(--accent)' }}><Icon name="listChecks" /></span> ออเดอร์จัดส่ง {active.length > 0 && <span className="text-sm font-normal text-muted-foreground">({active.length})</span>}</h3>
        <Button size="sm" onClick={() => window.__openModal('order')}><Icon name="plus" /> สร้างออเดอร์</Button>
      </div>
      {orders.length > 0 && (
        <div className="flex gap-2 mb-3 flex-wrap items-center">
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา รหัสออเดอร์ / ลูกค้า / tracking" className="flex-1 min-w-[220px]" />
          {shippedHidden > 0 && <Button size="sm" variant="outline" onClick={() => setShowShippedAll(s => !s)}><Icon name="eye" /> {showShippedAll ? 'ซ่อน' : 'ดู'}ส่งแล้วทั้งหมด ({shippedHidden})</Button>}
        </div>
      )}
      {orders.length === 0
        ? <Card><CardContent className="text-center py-8 text-muted-foreground">ยังไม่มีออเดอร์ — กด "สร้างออเดอร์" เพื่อเริ่ม (จองสต็อกอัตโนมัติ + ลูกค้าติดตามสถานะได้)</CardContent></Card>
        : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {ORDER_STATUSES.map(col => {
              const list = active.filter(o => o.status === col.id);
              return (
                <div key={col.id} onDragOver={e => e.preventDefault()} onDrop={() => onDrop(col.id)} className="shrink-0 w-60 rounded-md bg-muted/50 p-2">
                  <div className="flex items-center justify-between mb-2 px-1"><span className="font-bold" style={{ color: col.color }}>{col.label}</span><span className="text-xs text-muted-foreground">{list.length}</span></div>
                  {list.map(o => (
                    <div key={o.id} draggable onDragStart={() => setDragId(o.id)} onDragEnd={() => setDragId(null)} className="bg-background border rounded-md px-2.5 py-2 mb-1.5 cursor-grab" style={{ borderLeft: `3px solid ${col.color}` }}>
                      <div className="flex items-center justify-between"><span className="font-bold text-sm cursor-pointer" onClick={() => window.__openModal('order', o)}>{o.code}</span><span className="num font-bold">{B(o.total)}</span></div>
                      <div className="text-xs text-muted-foreground my-0.5">{o.customerName ? <button className="hover:underline text-foreground/80" onClick={(e) => { e.stopPropagation(); openCrm(o); }} title="เปิดโปรไฟล์ลูกค้าใน CRM">{o.customerName}</button> : '-'} · {N(o.qty)} ตัว</div>
                      <div className="text-xs text-muted-foreground truncate">{(o.items || []).slice(0, 2).map(it => `${it.color} ${it.size}×${it.qty}`).join(', ')}{(o.items || []).length > 2 ? '…' : ''}{o.trackingNo ? ` · 📦${o.trackingNo}` : ''}</div>
                      <div className="flex gap-1 mt-1.5 items-stretch">
                        <Select value={o.status} onValueChange={v => changeStatus(o, v)}>
                          <SelectTrigger className="h-7 flex-1 text-xs px-2"><SelectValue /></SelectTrigger>
                          <SelectContent>{ORDER_STATUSES.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}<SelectItem value="cancelled">ยกเลิก</SelectItem></SelectContent>
                        </Select>
                        <Button size="icon" variant="ghost" className="size-7" onClick={() => copyTrack(o)} title="คัดลอกลิงก์ติดตามให้ลูกค้า"><Icon name="route" /></Button>
                        <Button size="icon" variant="ghost" className="size-7" onClick={() => printReceipt(o)} title="พิมพ์ใบเสร็จ/ใบส่งของ"><Icon name="external" /></Button>
                      </div>
                    </div>
                  ))}
                  {list.length === 0 && <div className="text-xs text-center text-muted-foreground py-3.5">ลากการ์ดมาที่นี่</div>}
                </div>
              );
            })}
          </div>
        )}
      {cancelled.length > 0 && (
        <Card className="mt-3.5">
          <CardContent className="py-3">
            <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowCancelled(s => !s)}><span className="text-xs font-semibold uppercase text-muted-foreground">ยกเลิก ({cancelled.length})</span><Icon name={showCancelled ? 'chevD' : 'chevR'} /></div>
            {showCancelled && cancelled.map(o => (
              <div key={o.id} className="flex items-center justify-between py-1.5 border-t text-xs"><span><b>{o.code}</b> · {o.customerName} · {N(o.qty)} ตัว</span><span>{B(o.total)}</span></div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ====================  แดชบอร์ดคลัง (ภาพรวม)  ==================== */
function KpiCard({ label, value, sub, tone }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="num text-2xl font-bold mt-1" style={tone ? { color: tone } : undefined}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </CardContent></Card>
  );
}

function StockDashboard() {
  const products = DD.products || [];
  const orders = DD.orders || [];
  const A = useMemo(() => aggOps(products, todayISO()), [products]);
  const pendingShip = orders.filter(o => o.status !== 'cancelled' && o.status !== 'shipped').length;
  const abcMax = Math.max(1, ...A.abcSummary.map(c => c.value));
  const ageMax = Math.max(1, ...A.aging.map(b => b.value));

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto w-full rise space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2.5">
        <h2 className="text-xl font-bold flex items-center gap-2"><span style={{ color: 'var(--accent)' }}><Icon name="grid" /></span> แดชบอร์ดคลัง</h2>
        <div className="flex gap-1.5 flex-wrap">
          <ScanButton label="สแกน" onScan={(code) => { const p = findByCode(code); if (p) window.__openModal('sell', p); else window.__toast?.(`ไม่พบสินค้าจากรหัส "${code}" (ตั้ง SKU/บาร์โค้ดให้ตรง)`, 'warn'); }} />
          <Button size="sm" variant="outline" onClick={() => window.__openModal('sell')}><Icon name="wallet" /> ขาย</Button>
          <Button size="sm" variant="outline" onClick={() => window.__openModal('receive')}><Icon name="box" /> รับเข้า</Button>
          <Button size="sm" variant="outline" onClick={() => window.__openModal('product')}><Icon name="plus" /> สินค้า</Button>
          <Button size="sm" variant="outline" onClick={() => window.__openModal('po')}><Icon name="box" /> PO</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="มูลค่าสต็อก (ทุน)" value={B(A.totals.value)} sub={`${N(A.totals.skus)} รายการ`} />
        <KpiCard label="ตัวคงเหลือ" value={N(A.totals.units)} sub={`พร้อมขาย ${N(A.totals.available)}`} />
        <KpiCard label="จองอยู่" value={N(A.totals.reserved)} tone="var(--accent)" />
        <KpiCard label="ออเดอร์รอจัดส่ง" value={N(pendingShip)} tone={pendingShip ? 'var(--warn)' : undefined} />
        <KpiCard label="ใกล้หมด / หมด" value={`${N(A.totals.low)} / ${N(A.totals.out)}`} tone={A.totals.out ? 'var(--bad)' : A.totals.low ? 'var(--warn)' : undefined} />
        <KpiCard label="ของค้าง >90 วัน" value={B(A.totals.deadValue)} sub={`${N(A.totals.deadCount)} รายการ`} tone={A.totals.deadValue ? 'var(--bad)' : undefined} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* ต้องสั่งผลิต */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><span style={{ color: 'var(--warn)' }}><Icon name="bell" /></span> ต้องสั่งผลิต / ใกล้หมด ({A.reorderList.length})</CardTitle></CardHeader>
          <CardContent>
            {A.reorderList.length === 0 ? <div className="text-sm text-muted-foreground py-3 text-center">สต็อกเพียงพอ ไม่มีรายการต้องสั่ง</div> : (
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {A.reorderList.slice(0, 20).map(x => { const sm = stockMeta(x.p.stock); return (
                  <div key={x.p.id} className="flex items-center justify-between gap-2 text-sm border-b pb-1.5">
                    <span className="flex items-center gap-1.5 min-w-0"><span className="size-1.5 rounded-full shrink-0" style={{ background: sm.c }} /><span className="truncate cursor-pointer" onClick={() => window.__openModal('product', x.p)}>{x.p.name}</span><span className="text-xs text-muted-foreground shrink-0">เหลือ {x.onHand}</span></span>
                    <Button size="sm" variant="outline" className="h-6 px-2 shrink-0" onClick={() => window.__openModal('po', { product: x.p.name, quantity: x.suggest })}><Icon name="box" /> สั่ง ~{x.suggest}</Button>
                  </div>
                ); })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* ABC */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">ABC (มูลค่าสต็อก)</CardTitle><CardDescription>A = มูลค่าสูงสุด 80% · B = ถัดมา 15% · C = ที่เหลือ</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {A.abcSummary.map(c => (
                <div key={c.class} className="flex items-center gap-3">
                  <span className="w-6 font-bold" style={{ color: c.class === 'A' ? 'var(--good)' : c.class === 'B' ? 'var(--warn)' : 'var(--ink-4)' }}>{c.class}</span>
                  <Progress value={c.value / abcMax * 100} className="flex-1" />
                  <span className="num text-xs w-28 text-right text-muted-foreground">{B(c.value)} · {N(c.count)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          {/* Aging */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">อายุสต็อก (มูลค่าตามช่วงวัน)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {A.aging.map(b => (
                <div key={b.key} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-muted-foreground">{b.label}</span>
                  <Progress value={b.value / ageMax * 100} indicatorColor={b.key === '180+' ? 'var(--bad)' : b.key === '91-180' ? 'var(--warn)' : 'var(--accent)'} className="flex-1" />
                  <span className="num text-xs w-28 text-right text-muted-foreground">{B(b.value)} · {N(b.units)} ตัว</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ====================  ความเคลื่อนไหว (ledger รวมจาก audit_logs)  ==================== */
const MOVE_TYPES = [
  { id: 'all', label: 'ทั้งหมด' }, { id: 'receive', label: 'รับเข้า' }, { id: 'sale', label: 'ขาย/ตัดสต็อก' },
  { id: 'adjust', label: 'ปรับสต็อก' }, { id: 'reserve', label: 'จอง' }, { id: 'release', label: 'ปล่อยจอง' },
];
const MOVE_META = {
  receive: { label: 'รับเข้า', color: 'var(--good)', icon: 'box' }, sale: { label: 'ขาย', color: 'var(--accent)', icon: 'wallet' },
  adjust: { label: 'ปรับ', color: 'var(--warn)', icon: 'box' }, reserve: { label: 'จอง', color: 'var(--info)', icon: 'clock' }, release: { label: 'ปล่อยจอง', color: 'var(--ink-3)', icon: 'x' },
};
function MovementsView() {
  const [rows, setRows] = useState(null);
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.from('tmk_audit_logs')
          .select('id,user_email,action,details,created_at')
          .in('action', ['receive', 'sale', 'adjust', 'reserve', 'release'])
          .order('created_at', { ascending: false }).limit(400);
        if (!alive) return;
        if (error) { setRows([]); return; }
        setRows((data || []).map(r => { let d = {}; try { d = JSON.parse(r.details || '{}'); } catch { /* ignore */ } return { id: r.id, action: r.action, by: r.user_email, at: r.created_at, name: d.entityName || '', summary: d.summary || '' }; }));
      } catch { if (alive) setRows([]); }
    })();
    return () => { alive = false; };
  }, []);

  const ql = q.trim().toLowerCase();
  const list = (rows || []).filter(r => (type === 'all' || r.action === type) && (!ql || `${r.name} ${r.summary} ${r.by}`.toLowerCase().includes(ql)));
  const fmt = (s) => { try { return new Date(s).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  const exportCSV = () => {
    downloadCsv(`tmk-movements-${todayISO()}.csv`, list, [
      { label: 'วันเวลา', map: r => fmt(r.at) }, { label: 'ประเภท', map: r => MOVE_META[r.action]?.label || r.action },
      { label: 'สินค้า/รายการ', key: 'name' }, { label: 'รายละเอียด', key: 'summary' }, { label: 'โดย', key: 'by' },
    ]);
    window.__toast?.('ส่งออก CSV เรียบร้อย', 'success');
  };

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto w-full rise">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 flex-wrap space-y-0">
          <CardTitle className="flex items-center gap-2 text-base"><span style={{ color: 'var(--accent)' }}><Icon name="route" /></span> ความเคลื่อนไหวสต็อก {list.length > 0 && <span className="text-sm font-normal text-muted-foreground">({N(list.length)})</span>}</CardTitle>
          <Button size="sm" variant="ghost" disabled={!list.length} onClick={exportCSV}><Icon name="external" /> CSV</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา สินค้า / รายละเอียด / ผู้ทำ" className="flex-1 min-w-[200px]" />
            <ToggleGroup type="single" value={type} onValueChange={v => v && setType(v)} variant="outline" size="sm">
              {MOVE_TYPES.map(t => <ToggleGroupItem key={t.id} value={t.id}>{t.label}</ToggleGroupItem>)}
            </ToggleGroup>
          </div>
          {rows === null ? <div className="text-center py-6 text-muted-foreground">กำลังโหลด…</div>
            : list.length === 0 ? <div className="text-center py-6 text-muted-foreground">ยังไม่มีความเคลื่อนไหว</div>
            : <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead className="w-36">วันเวลา</TableHead><TableHead className="w-24">ประเภท</TableHead><TableHead>รายละเอียด</TableHead><TableHead className="w-32">โดย</TableHead></TableRow></TableHeader>
                  <TableBody>{list.map(r => { const m = MOVE_META[r.action] || { label: r.action, color: 'var(--ink-3)' }; return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{fmt(r.at)}</TableCell>
                      <TableCell><Badge variant="outline" style={{ borderColor: m.color, color: m.color }}>{m.label}</Badge></TableCell>
                      <TableCell><div className="font-medium">{r.name || '—'}</div>{r.summary && <div className="text-xs text-muted-foreground">{r.summary}</div>}</TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate">{r.by}</TableCell>
                    </TableRow>
                  ); })}</TableBody>
                </Table>
              </div>}
        </CardContent>
      </Card>
    </div>
  );
}

/* ====================  รายงานคลัง  ==================== */
function ReportsView() {
  const products = DD.products || [];
  const A = useMemo(() => aggOps(products, todayISO()), [products]);
  const exportValuation = () => {
    downloadCsv(`tmk-valuation-${todayISO()}.csv`, A.byCat, [
      { label: 'หมวด', key: 'key' }, { label: 'จำนวนรายการ', key: 'count' }, { label: 'ตัวคงเหลือ', key: 'units' }, { label: 'มูลค่าทุน', map: r => Math.round(r.value) },
    ]);
    window.__toast?.('ส่งออก CSV เรียบร้อย', 'success');
  };
  const exportDead = () => {
    const dead = A.items.filter(x => x.deadStock);
    downloadCsv(`tmk-deadstock-${todayISO()}.csv`, dead, [
      { label: 'สินค้า', map: x => x.p.name }, { label: 'คงเหลือ', key: 'onHand' }, { label: 'มูลค่าทุน', map: x => Math.round(x.value) }, { label: 'อายุ(วัน)', key: 'age' },
    ]);
    window.__toast?.('ส่งออก CSV เรียบร้อย', 'success');
  };
  const catMax = Math.max(1, ...A.byCat.map(c => c.value));

  return (
    <div className="p-4 md:p-6 max-w-[1300px] mx-auto w-full rise space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2"><span style={{ color: 'var(--accent)' }}><Icon name="sales" /></span> รายงานคลัง</h2>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Valuation by category */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-base">มูลค่าสต็อกตามหมวด</CardTitle><Button size="sm" variant="ghost" onClick={exportValuation}><Icon name="external" /> CSV</Button></CardHeader>
          <CardContent className="space-y-2">
            {A.byCat.length === 0 ? <div className="text-sm text-muted-foreground py-3 text-center">ไม่มีข้อมูล</div> : A.byCat.map(c => (
              <div key={c.key} className="flex items-center gap-3">
                <span className="w-28 text-sm truncate">{c.key}</span>
                <Progress value={c.value / catMax * 100} className="flex-1" />
                <span className="num text-xs w-28 text-right text-muted-foreground">{B(c.value)} · {N(c.units)} ตัว</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Dead stock */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-base flex items-center gap-2">ของค้าง / ขายไม่ออก <span className="text-xs font-normal text-muted-foreground">(มี &gt;90 วัน · ยังไม่ขาย)</span></CardTitle><Button size="sm" variant="ghost" onClick={exportDead}><Icon name="external" /> CSV</Button></CardHeader>
          <CardContent>
            {A.items.filter(x => x.deadStock).length === 0 ? <div className="text-sm text-muted-foreground py-3 text-center">ไม่มีของค้าง</div> : (
              <div className="rounded-md border overflow-x-auto max-h-[320px] overflow-y-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>สินค้า</TableHead><TableHead className="text-right">คงเหลือ</TableHead><TableHead className="text-right">มูลค่า</TableHead><TableHead className="text-right">อายุ</TableHead></TableRow></TableHeader>
                  <TableBody>{A.items.filter(x => x.deadStock).sort((a, b) => b.value - a.value).map(x => (
                    <TableRow key={x.p.id} onClick={() => window.__openModal('product', x.p)} className="cursor-pointer">
                      <TableCell className="font-medium">{x.p.name}</TableCell>
                      <TableCell className="num text-right">{N(x.onHand)}</TableCell>
                      <TableCell className="num text-right">{B(x.value)}</TableCell>
                      <TableCell className="num text-right text-muted-foreground">{x.age} วัน</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reorder report */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">รายการต้องสั่งซื้อ (reorder)</CardTitle><CardDescription>สินค้าที่ต่ำกว่าจุดสั่งซ้ำ + จำนวนแนะนำ</CardDescription></CardHeader>
        <CardContent>
          {A.reorderList.length === 0 ? <div className="text-sm text-muted-foreground py-3 text-center">ไม่มีรายการต้องสั่ง</div> : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>สินค้า</TableHead><TableHead className="text-right">คงเหลือ</TableHead><TableHead className="text-right">จุดสั่งซ้ำ</TableHead><TableHead className="text-right">แนะนำสั่ง</TableHead><TableHead className="text-right">สถานะ</TableHead><TableHead className="text-right" /></TableRow></TableHeader>
                <TableBody>{A.reorderList.map(x => (
                  <TableRow key={x.p.id}>
                    <TableCell className="font-medium">{x.p.name}</TableCell>
                    <TableCell className="num text-right">{N(x.onHand)}</TableCell>
                    <TableCell className="num text-right text-muted-foreground">{N(x.p.reorder)}</TableCell>
                    <TableCell className="num text-right font-bold">{N(x.suggest)}</TableCell>
                    <TableCell className="text-right"><StockBadge stock={x.p.stock} /></TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => window.__openModal('po', { product: x.p.name, quantity: x.suggest })}><Icon name="box" /> PO</Button></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ====================  ซัพพลายเออร์ (tmk_suppliers · graceful)  ==================== */
const genId = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const isMissingTable = (err) => /relation .* does not exist|does not exist|schema cache|PGRST205|42P01/i.test(err?.message || err?.code || '');

function MigrationNotice({ file }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-2">
        <Icon name="box" className="size-12 opacity-20" />
        <div className="font-semibold">ยังไม่ได้รัน migration</div>
        <div className="text-sm text-muted-foreground">รัน <code className="px-1.5 py-0.5 rounded bg-muted">{file}</code> ใน Supabase → SQL Editor ก่อน แล้วรีเฟรช</div>
      </CardContent>
    </Card>
  );
}

function SuppliersView() {
  const [rows, setRows] = useState(null);
  const [need, setNeed] = useState(false);
  const [edit, setEdit] = useState(null);   // {id?,name,contact,phone,lead_time_days,note}
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data, error } = await supabase.from('tmk_suppliers').select('*').is('deleted_at', null).order('name');
      if (error) { if (isMissingTable(error)) setNeed(true); setRows([]); return; }
      setRows(data || []);
    } catch { setRows([]); }
  };
  useEffect(() => { load(); }, []);

  const blank = () => ({ name: '', contact: '', phone: '', lead_time_days: '', note: '' });
  const save = async () => {
    if (!guardEdit()) return;
    if (!edit.name?.trim()) { window.__toast?.('ใส่ชื่อซัพพลายเออร์ก่อน', 'warn'); return; }
    setSaving(true);
    const row = { id: edit.id || genId('sup'), name: edit.name.trim(), contact: edit.contact || '', phone: edit.phone || '', lead_time_days: Number(edit.lead_time_days) || 0, note: edit.note || '', updated_at: new Date().toISOString() };
    const { error } = await supabase.from('tmk_suppliers').upsert(row, { onConflict: 'id' });
    setSaving(false);
    if (error) { window.__toast?.(isMissingTable(error) ? 'ต้องรัน migration 20260706-stock-crm-all.sql ก่อน' : 'บันทึกไม่สำเร็จ: ' + error.message, 'error'); return; }
    logAudit({ action: edit.id ? 'update' : 'create', entityType: 'supplier', entityName: row.name, summary: `${edit.id ? 'แก้ไข' : 'เพิ่ม'}ซัพพลายเออร์ "${row.name}"` });
    window.__toast?.('บันทึกซัพพลายเออร์แล้ว', 'success');
    setEdit(null); load();
  };
  const del = async (s) => {
    if (!guardEdit()) return;
    if (!await window.__confirm?.({ title: 'ลบซัพพลายเออร์', body: `ลบซัพพลายเออร์ "${s.name}"?`, danger: true, confirmText: 'ลบ' })) return;
    const { error } = await supabase.from('tmk_suppliers').update({ deleted_at: new Date().toISOString() }).eq('id', s.id);
    if (error) { window.__toast?.('ลบไม่สำเร็จ', 'error'); return; }
    window.__toast?.('ลบแล้ว', 'success'); load();
  };

  return (
    <div className="p-4 md:p-6 max-w-[1100px] mx-auto w-full rise">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 flex-wrap space-y-0">
          <CardTitle className="flex items-center gap-2 text-base"><span style={{ color: 'var(--accent)' }}><Icon name="box" /></span> ซัพพลายเออร์ {rows && rows.length > 0 && <span className="text-sm font-normal text-muted-foreground">({rows.length})</span>}</CardTitle>
          {!need && <Button size="sm" onClick={() => setEdit(blank())}><Icon name="plus" /> เพิ่มซัพพลายเออร์</Button>}
        </CardHeader>
        <CardContent className="space-y-3">
          {need ? <MigrationNotice file="20260706-stock-crm-all.sql" /> : (<>
            {edit && (
              <div className="rounded-md border p-3 space-y-2 bg-muted/30">
                <div className="grid sm:grid-cols-2 gap-2">
                  <Input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="ชื่อซัพพลายเออร์ *" />
                  <Input value={edit.phone} onChange={e => setEdit({ ...edit, phone: e.target.value })} placeholder="เบอร์โทร" />
                  <Input value={edit.contact} onChange={e => setEdit({ ...edit, contact: e.target.value })} placeholder="ผู้ติดต่อ" />
                  <Input type="number" value={edit.lead_time_days} onChange={e => setEdit({ ...edit, lead_time_days: e.target.value })} placeholder="lead time (วัน)" />
                </div>
                <Input value={edit.note} onChange={e => setEdit({ ...edit, note: e.target.value })} placeholder="โน้ต" />
                <div className="flex gap-2 justify-end"><Button size="sm" variant="ghost" onClick={() => setEdit(null)}>ยกเลิก</Button><Button size="sm" disabled={saving} onClick={save}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</Button></div>
              </div>
            )}
            {rows === null ? <div className="text-center py-6 text-muted-foreground">กำลังโหลด…</div>
              : rows.length === 0 ? <div className="text-center py-6 text-muted-foreground">ยังไม่มีซัพพลายเออร์ — กด "เพิ่มซัพพลายเออร์"</div>
              : <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>ชื่อ</TableHead><TableHead>ติดต่อ</TableHead><TableHead className="text-right">lead time</TableHead><TableHead className="text-right" /></TableRow></TableHeader>
                    <TableBody>{rows.map(s => (
                      <TableRow key={s.id}>
                        <TableCell><div className="font-semibold">{s.name}</div>{s.note && <div className="text-xs text-muted-foreground">{s.note}</div>}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{[s.phone, s.contact].filter(Boolean).join(' · ') || '—'}</TableCell>
                        <TableCell className="num text-right">{s.lead_time_days ? `${s.lead_time_days} วัน` : '—'}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button size="sm" variant="ghost" onClick={() => setEdit({ ...s, lead_time_days: s.lead_time_days || '' })}>แก้</Button>
                          <Button size="icon" variant="ghost" className="size-8 text-destructive" onClick={() => del(s)}><Icon name="x" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}</TableBody>
                  </Table>
                </div>}
          </>)}
        </CardContent>
      </Card>
    </div>
  );
}

/* ====================  ตรวจนับสต็อก (tmk_stock_counts · graceful)  ==================== */
function StockTakeView() {
  const products = (DD.products || []);
  const [q, setQ] = useState('');
  const [counts, setCounts] = useState({});   // productId -> counted (string)
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState(null);
  const [need, setNeed] = useState(false);

  const loadHistory = async () => {
    try {
      const { data, error } = await supabase.from('tmk_stock_counts').select('id,count_date,status,lines,note,created_by').order('count_date', { ascending: false }).limit(20);
      if (error) { if (isMissingTable(error)) setNeed(true); setHistory([]); return; }
      setHistory(data || []);
    } catch { setHistory([]); }
  };
  useEffect(() => { loadHistory(); }, []);

  const ql = q.trim().toLowerCase();
  const list = products.filter(p => !ql || `${p.name} ${p.sku || ''}`.toLowerCase().includes(ql));
  const lines = products.map(p => ({ product_id: p.id, name: p.name, system_qty: Number(p.onHand) || 0, counted_qty: counts[p.id] === '' || counts[p.id] == null ? null : Number(counts[p.id]), }))
    .filter(l => l.counted_qty != null).map(l => ({ ...l, variance: l.counted_qty - l.system_qty }));
  const variances = lines.filter(l => l.variance !== 0);

  const saveCount = async () => {
    if (!guardEdit()) return;
    if (!lines.length) { window.__toast?.('ยังไม่ได้กรอกจำนวนนับ', 'warn'); return; }
    setSaving(true);
    const row = { id: genId('sc'), count_date: todayISO(), status: 'done', lines, note: `นับ ${lines.length} รายการ · ต่าง ${variances.length}`, created_by: (window.__userEmail || ''), updated_at: new Date().toISOString() };
    const { error } = await supabase.from('tmk_stock_counts').insert(row);
    setSaving(false);
    if (error) { window.__toast?.(isMissingTable(error) ? 'ต้องรัน migration 20260706-stock-crm-all.sql ก่อน' : 'บันทึกไม่สำเร็จ: ' + error.message, 'error'); return; }
    logAudit({ action: 'create', entityType: 'stock_count', entityName: row.count_date, summary: `ตรวจนับสต็อก ${lines.length} รายการ (ต่าง ${variances.length})` });
    window.__toast?.(`บันทึกรอบนับแล้ว · ส่วนต่าง ${variances.length} รายการ — แก้ยอดจริงที่ "ปรับสต็อก"`, 'success');
    setCounts({}); loadHistory();
  };

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto w-full rise space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 flex-wrap space-y-0">
          <CardTitle className="flex items-center gap-2 text-base"><span style={{ color: 'var(--accent)' }}><Icon name="box" /></span> ตรวจนับสต็อก (cycle count)</CardTitle>
          <Button size="sm" disabled={saving || !lines.length} onClick={saveCount}>{saving ? 'กำลังบันทึก…' : `บันทึกรอบนับ (${lines.length})`}</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {need ? <MigrationNotice file="20260706-stock-crm-all.sql" /> : products.length === 0 ? <div className="text-center py-6 text-muted-foreground">ยังไม่มีสินค้า</div> : (<>
            <div className="flex items-center gap-2 flex-wrap">
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาสินค้า" className="flex-1 min-w-[200px]" />
              {variances.length > 0 && <Badge variant="outline" className="border-amber-500 text-amber-600">ส่วนต่าง {variances.length} รายการ</Badge>}
            </div>
            <div className="rounded-md border overflow-x-auto max-h-[460px] overflow-y-auto">
              <Table>
                <TableHeader><TableRow><TableHead>สินค้า</TableHead><TableHead className="text-right">ระบบ</TableHead><TableHead className="text-right w-28">นับจริง</TableHead><TableHead className="text-right">ส่วนต่าง</TableHead></TableRow></TableHeader>
                <TableBody>{list.map(p => {
                  const c = counts[p.id]; const v = (c === '' || c == null) ? null : Number(c) - (Number(p.onHand) || 0);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="num text-right text-muted-foreground">{N(p.onHand)}</TableCell>
                      <TableCell className="text-right"><Input type="number" value={c ?? ''} onChange={e => setCounts({ ...counts, [p.id]: e.target.value })} placeholder="—" className="w-24 ml-auto text-right h-8" /></TableCell>
                      <TableCell className="num text-right font-semibold" style={{ color: v == null ? 'var(--ink-4)' : v === 0 ? 'var(--good)' : v > 0 ? 'var(--accent)' : 'var(--bad)' }}>{v == null ? '—' : (v > 0 ? '+' : '') + N(v)}</TableCell>
                    </TableRow>
                  );
                })}</TableBody>
              </Table>
            </div>
            <div className="text-xs text-muted-foreground">บันทึกรอบนับ = เก็บส่วนต่างไว้ตรวจสอบ · ปรับยอดจริงให้ใช้ "ปรับสต็อก" ที่สินค้า (แก้ระดับล็อต/สี/ไซซ์)</div>
          </>)}
        </CardContent>
      </Card>

      {history && history.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">ประวัติรอบนับ</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {history.map(h => { const vc = (h.lines || []).filter(l => l.variance !== 0).length; return (
              <div key={h.id} className="flex items-center justify-between text-sm border-b pb-1.5">
                <span>{thaiDate(h.count_date) || h.count_date} · {(h.lines || []).length} รายการ</span>
                <span className="text-xs text-muted-foreground">{vc > 0 ? <Badge variant="outline" className="border-amber-500 text-amber-600">ต่าง {vc}</Badge> : <Badge variant="secondary">ตรงทั้งหมด</Badge>}</span>
              </div>
            ); })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ====================  บาร์โค้ด/สแกน (native BarcodeDetector · graceful)  ==================== */
function ScanButton({ onScan, label = 'สแกน', variant = 'outline' }) {
  const [open, setOpen] = useState(false);
  const videoRef = useRef(null), streamRef = useRef(null), rafRef = useRef(0);
  const stop = () => { cancelAnimationFrame(rafRef.current); if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; setOpen(false); };
  useEffect(() => () => stop(), []);
  const manual = () => { const v = window.prompt('พิมพ์/สแกน บาร์โค้ดหรือ SKU'); if (v && v.trim()) onScan(v.trim()); };
  const start = async () => {
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) { manual(); return; }
    try {
      setOpen(true);
      const det = new window.BarcodeDetector();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream; const vid = videoRef.current; vid.srcObject = stream; await vid.play();
      const scan = async () => {
        if (!streamRef.current) return;
        try { const codes = await det.detect(vid); if (codes?.[0]?.rawValue) { const v = codes[0].rawValue.trim(); stop(); onScan(v); return; } } catch { /* */ }
        rafRef.current = requestAnimationFrame(scan);
      };
      rafRef.current = requestAnimationFrame(scan);
    } catch { stop(); manual(); }
  };
  return (<>
    <Button size="sm" variant={variant} onClick={start}><Icon name="search" /> {label}</Button>
    {open && (
      <div className="fixed inset-0 z-[300] bg-black/80 grid place-items-center p-4" onClick={stop}>
        <div className="bg-background rounded-lg p-3 max-w-sm w-full" onClick={e => e.stopPropagation()}>
          <video ref={videoRef} className="w-full rounded-md bg-black aspect-square object-cover" playsInline muted />
          <div className="text-center text-sm text-muted-foreground mt-2">เล็งบาร์โค้ด/QR ให้อยู่ในกรอบ</div>
          <div className="flex gap-2 mt-2"><Button variant="ghost" className="flex-1" onClick={() => { stop(); manual(); }}>พิมพ์เอง</Button><Button variant="outline" className="flex-1" onClick={stop}>ปิด</Button></div>
        </div>
      </div>
    )}
  </>);
}
const findByCode = (code) => { const c = (code || '').trim().toLowerCase(); if (!c) return null; return (DD.products || []).find(p => (p.barcode || '').toLowerCase() === c || (p.sku || '').toLowerCase() === c); };

/* ====================  รับคืน / RMA (tmk_returns · graceful)  ==================== */
function ReturnsView() {
  const products = DD.products || [];
  const [need, setNeed] = useState(false);
  const [history, setHistory] = useState(null);
  const [f, setF] = useState({ productId: '', color: '', size: '', qty: '', reason: 'ลูกค้าเปลี่ยนใจ', action: 'restock', customer: '', refund: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try { const { data, error } = await supabase.from('tmk_returns').select('id,customer_name,lines,action,refund,created_at').order('created_at', { ascending: false }).limit(30); if (error) { if (isMissingTable(error)) setNeed(true); setHistory([]); return; } setHistory(data || []); } catch { setHistory([]); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!guardEdit()) return;
    const p = products.find(x => x.id === f.productId);
    if (!p || !(Number(f.qty) > 0)) { window.__toast?.('เลือกสินค้า + จำนวน > 0', 'warn'); return; }
    setSaving(true);
    try {
      if (f.action === 'restock' && p.hasLots) {
        const { error: e2 } = await mutateProductRow(p.id, (cur) => { const r = restockLots(cur.lots || [], f.color, f.size, Number(f.qty), { note: 'รับคืน' }); return { lots: r.lots, stock_on_hand: lotsTotal(r.lots) }; });
        if (e2) throw e2;
      } else if (f.action === 'restock') {
        const { error: e2 } = await mutateProductRow(p.id, (cur) => ({ stock_on_hand: (Number(cur.stock_on_hand) || 0) + Number(f.qty) }));
        if (e2) throw e2;
      }
      const row = { id: genId('ret'), order_code: '', customer_name: f.customer || '', lines: [{ product_id: p.id, name: p.name, color: f.color, size: f.size, qty: Number(f.qty), reason: f.reason }], action: f.action, refund: Number(f.refund) || 0, status: 'done', note: f.reason || '', created_by: window.__userEmail || '', created_at: new Date().toISOString() };
      const { error } = await supabase.from('tmk_returns').insert(row);
      if (error && !isMissingTable(error)) throw error;
      logAudit({ action: 'return', entityType: 'product', entityName: p.name, summary: `รับคืน ${f.qty} ${f.color} ${f.size} (${f.action === 'restock' ? 'คืนสต็อก' : 'ตัดทิ้ง'})` });
      window.__refresh?.(['tmk_products']);
      window.__toast?.(error && isMissingTable(error) ? 'รับคืนแล้ว (สต็อกอัปเดต) — รัน migration 20260704 เพื่อเก็บประวัติ' : 'รับคืนเรียบร้อย', 'success');
      setF({ ...f, productId: '', color: '', size: '', qty: '', refund: '' }); load();
    } catch (e) { window.__toast?.('รับคืนไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
    setSaving(false);
  };

  return (
    <div className="p-4 md:p-6 max-w-[1000px] mx-auto w-full rise space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><span style={{ color: 'var(--accent)' }}><Icon name="box" /></span> รับคืนสินค้า / RMA</CardTitle><CardDescription>ลูกค้าคืนของ → คืนเข้าสต็อก หรือ ตัดทิ้ง (ของเสีย)</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <div className="grid sm:grid-cols-2 gap-2">
            <Select value={f.productId} onValueChange={v => setF({ ...f, productId: v })}>
              <SelectTrigger><SelectValue placeholder="เลือกสินค้า" /></SelectTrigger>
              <SelectContent className="max-h-[300px]">{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={f.customer} onChange={e => setF({ ...f, customer: e.target.value })} placeholder="ชื่อลูกค้า (ไม่บังคับ)" />
            <Input value={f.color} onChange={e => setF({ ...f, color: e.target.value })} placeholder="สี" />
            <Input value={f.size} onChange={e => setF({ ...f, size: e.target.value })} placeholder="ไซซ์" />
            <Input type="number" value={f.qty} onChange={e => setF({ ...f, qty: e.target.value })} placeholder="จำนวน *" />
            <Input type="number" value={f.refund} onChange={e => setF({ ...f, refund: e.target.value })} placeholder="คืนเงิน (บาท)" />
            <Input value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} placeholder="เหตุผล" />
            <Select value={f.action} onValueChange={v => setF({ ...f, action: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="restock">คืนเข้าสต็อก</SelectItem><SelectItem value="writeoff">ตัดทิ้ง (ของเสีย)</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="flex justify-end"><Button disabled={saving} onClick={save}>{saving ? 'กำลังบันทึก…' : 'บันทึกรับคืน'}</Button></div>
        </CardContent>
      </Card>
      {history && history.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">ประวัติรับคืน</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {history.map(h => (<div key={h.id} className="flex items-center justify-between text-sm border-b pb-1.5">
              <span>{(h.lines || []).map(l => `${l.name} ${l.color} ${l.size}×${l.qty}`).join(', ')}{h.customer_name ? ' · ' + h.customer_name : ''}</span>
              <span className="text-xs"><Badge variant={h.action === 'restock' ? 'secondary' : 'outline'}>{h.action === 'restock' ? 'คืนสต็อก' : 'ตัดทิ้ง'}</Badge>{h.refund ? ' ' + B(h.refund) : ''}</span>
            </div>))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ====================  ที่เก็บสินค้า (tmk_locations · graceful)  ==================== */
function LocationsView() {
  const [rows, setRows] = useState(null);
  const [need, setNeed] = useState(false);
  const [edit, setEdit] = useState(null);
  const load = async () => {
    try { const { data, error } = await supabase.from('tmk_locations').select('*').order('name'); if (error) { if (isMissingTable(error)) setNeed(true); setRows([]); return; } setRows(data || []); } catch { setRows([]); }
  };
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (!guardEdit() || !edit.name?.trim()) { window.__toast?.('ใส่ชื่อที่เก็บ', 'warn'); return; }
    const row = { id: edit.id || genId('loc'), name: edit.name.trim(), type: edit.type || 'warehouse', note: edit.note || '', updated_at: new Date().toISOString() };
    const { error } = await supabase.from('tmk_locations').upsert(row, { onConflict: 'id' });
    if (error) { window.__toast?.(isMissingTable(error) ? 'ต้องรัน migration 20260706-stock-crm-all.sql ก่อน' : 'บันทึกไม่สำเร็จ', 'error'); return; }
    window.__toast?.('บันทึกที่เก็บแล้ว', 'success'); setEdit(null); load();
  };
  return (
    <div className="p-4 md:p-6 max-w-[900px] mx-auto w-full rise">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 flex-wrap space-y-0">
          <CardTitle className="flex items-center gap-2 text-base"><span style={{ color: 'var(--accent)' }}><Icon name="layers" /></span> ที่เก็บสินค้า / คลังหลายแห่ง</CardTitle>
          {!need && <Button size="sm" onClick={() => setEdit({ name: '', type: 'warehouse', note: '' })}><Icon name="plus" /> เพิ่มที่เก็บ</Button>}
        </CardHeader>
        <CardContent className="space-y-3">
          {need ? <MigrationNotice file="20260706-stock-crm-all.sql" /> : (<>
            <div className="text-xs text-muted-foreground">ตั้งรายชื่อที่เก็บ (คลัง/ชั้น/กล่อง/หน้าร้าน) — การผูกสต็อกต่อที่เก็บ + โอนระหว่างที่เก็บ เป็นเฟสถัดไป</div>
            {edit && (<div className="rounded-md border p-3 bg-muted/30 flex gap-2 flex-wrap items-end">
              <Input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="ชื่อที่เก็บ *" className="flex-1 min-w-[160px]" />
              <Select value={edit.type} onValueChange={v => setEdit({ ...edit, type: v })}><SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="warehouse">คลัง</SelectItem><SelectItem value="shelf">ชั้นวาง</SelectItem><SelectItem value="bin">กล่อง</SelectItem><SelectItem value="shop">หน้าร้าน</SelectItem></SelectContent></Select>
              <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>ยกเลิก</Button><Button size="sm" onClick={save}>บันทึก</Button>
            </div>)}
            {rows === null ? <div className="text-center py-6 text-muted-foreground">กำลังโหลด…</div>
              : rows.length === 0 ? <div className="text-center py-6 text-muted-foreground">ยังไม่มีที่เก็บ</div>
              : <div className="rounded-md border overflow-x-auto"><Table>
                  <TableHeader><TableRow><TableHead>ชื่อ</TableHead><TableHead>ประเภท</TableHead><TableHead className="text-right" /></TableRow></TableHeader>
                  <TableBody>{rows.map(s => (<TableRow key={s.id}><TableCell className="font-medium">{s.name}</TableCell><TableCell className="text-xs text-muted-foreground">{({ warehouse: 'คลัง', shelf: 'ชั้นวาง', bin: 'กล่อง', shop: 'หน้าร้าน' })[s.type] || s.type}</TableCell><TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => setEdit(s)}>แก้</Button></TableCell></TableRow>))}</TableBody>
                </Table></div>}
          </>)}
        </CardContent>
      </Card>
    </div>
  );
}

/* ====================  ตัดสต็อกจากยอดขายมาร์เก็ตเพลส (idempotent)  ==================== */
function MpDeductView() {
  const products = DD.products || [];
  const [rows, setRows] = useState(null);   // proposed deductions
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const prodByCode = useMemo(() => { const m = new Map(); products.forEach(p => { if (p.sku) m.set(p.sku.toLowerCase(), p); if (p.barcode) m.set(p.barcode.toLowerCase(), p); }); return m; }, [products]);

  const scan = async () => {
    setLoading(true);
    try {
      // ออเดอร์มาร์เก็ตเพลส active ล่าสุด + sku
      const { data: ords } = await supabase.from('tmk_mp_orders').select('order_no,channel,order_date').eq('status', 'active').order('order_date', { ascending: false }).limit(500);
      const orderNos = (ords || []).map(o => o.order_no);
      let skus = [];
      if (orderNos.length) { const { data: s } = await supabase.from('tmk_mp_skus').select('order_no,channel,product_code,color,size,qty').in('order_no', orderNos).limit(5000); skus = s || []; }
      // event ที่ตัดไปแล้ว (idempotency)
      let doneKeys = new Set();
      try { const { data: ev } = await supabase.from('tmk_channel_events').select('id').limit(20000); (ev || []).forEach(e => doneKeys.add(e.id)); } catch { /* ตารางยังไม่มี → ถือว่ายังไม่เคยตัด */ }
      const chMeta = new Map((ords || []).map(o => [o.order_no, o.channel]));
      const proposed = [];
      for (const s of skus) {
        const code = (s.product_code || '').toLowerCase();
        const key = `${s.channel || chMeta.get(s.order_no) || 'mp'}:${s.order_no}:${s.product_code || ''}:${s.color || ''}:${s.size || ''}`;
        if (!code || doneKeys.has(key)) continue;
        const p = prodByCode.get(code);
        proposed.push({ key, order_no: s.order_no, channel: s.channel || chMeta.get(s.order_no) || 'mp', code: s.product_code, color: s.color, size: s.size, qty: Number(s.qty) || 0, product: p || null });
      }
      setRows(proposed);
    } catch (e) { window.__toast?.('สแกนไม่สำเร็จ: ' + (e?.message || ''), 'error'); setRows([]); }
    setLoading(false);
  };

  const matched = (rows || []).filter(r => r.product && r.qty > 0);
  const run = async () => {
    if (!guardEdit() || !matched.length) return;
    if (!await window.__confirm?.({ title: 'ตัดสต็อกจากยอดขาย', body: `ยืนยันตัดสต็อก ${matched.length} รายการตามยอดขายมาร์เก็ตเพลส?\n(ตัดครั้งเดียว กันซ้ำด้วย idempotency)`, danger: true, confirmText: 'ตัดสต็อก' })) return;
    setBusy(true);
    let ok = 0, short = 0;
    for (const r of matched) {
      try {
        let sh = 0;
        const { error } = await mutateProductRow(r.product.id, (cur) => { const d = deductLots(cur.lots || [], r.color, r.size, r.qty); sh = d.short; return { lots: d.lots, stock_on_hand: lotsTotal(d.lots), actual_units: (Number(cur.actual_units) || 0) + d.deducted }; });
        if (error) continue;
        await supabase.from('tmk_channel_events').insert({ id: r.key, channel: r.channel, order_no: r.order_no, product_code: r.code, qty: r.qty, kind: 'deduct', created_by: window.__userEmail || '', created_at: new Date().toISOString() });
        ok++; if (sh > 0) short++;
      } catch { /* ข้ามรายการที่พลาด */ }
    }
    logAudit({ action: 'update', entityType: 'data', entityName: 'ตัดสต็อกมาร์เก็ตเพลส', summary: `ตัดสต็อกจากยอดขาย ${ok} รายการ${short ? ` (ของไม่พอ ${short})` : ''}` });
    window.__refresh?.(['tmk_products']);
    window.__toast?.(`ตัดสต็อกแล้ว ${ok} รายการ${short ? ` · ของไม่พอ ${short}` : ''}`, 'success');
    setBusy(false); scan();
  };

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto w-full rise">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 flex-wrap space-y-0">
          <CardTitle className="flex items-center gap-2 text-base"><span style={{ color: 'var(--accent)' }}><Icon name="wallet" /></span> ตัดสต็อกจากยอดขายมาร์เก็ตเพลส</CardTitle>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" disabled={loading} onClick={scan}>{loading ? 'กำลังสแกน…' : 'สแกนยอดขายที่ยังไม่ตัด'}</Button>
            {matched.length > 0 && <Button size="sm" disabled={busy} onClick={run}>{busy ? 'กำลังตัด…' : `ตัดสต็อก (${matched.length})`}</Button>}
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-muted-foreground mb-2">อ่านยอดขายจริงจาก <code className="px-1 bg-muted rounded">tmk_mp_orders/skus</code> → จับคู่ SKU กับสินค้าในคลัง → ตัดสต็อก FIFO · กันตัดซ้ำด้วย idempotency (tmk_channel_events) · ตรวจก่อนยืนยันเสมอ</div>
          {rows === null ? <div className="text-center py-6 text-muted-foreground">กด "สแกนยอดขายที่ยังไม่ตัด" เพื่อเริ่ม</div>
            : rows.length === 0 ? <div className="text-center py-6 text-muted-foreground">ไม่มียอดขายค้างตัด (ตัดครบแล้ว)</div>
            : <div className="rounded-md border overflow-x-auto max-h-[520px] overflow-y-auto"><Table>
                <TableHeader><TableRow><TableHead>ออเดอร์</TableHead><TableHead>ช่อง</TableHead><TableHead>SKU</TableHead><TableHead>สินค้าในคลัง</TableHead><TableHead className="text-right">ตัด</TableHead></TableRow></TableHeader>
                <TableBody>{rows.map((r, i) => (
                  <TableRow key={r.key + '#' + i}>
                    <TableCell className="text-xs">{r.order_no}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.channel}</TableCell>
                    <TableCell className="text-xs">{r.code} {r.color} {r.size}</TableCell>
                    <TableCell>{r.product ? <span className="font-medium">{r.product.name}</span> : <Badge variant="outline" className="border-amber-500 text-amber-600">แมพไม่เจอ</Badge>}</TableCell>
                    <TableCell className="num text-right">{N(r.qty)}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table></div>}
          {rows && rows.length > 0 && <div className="text-xs text-muted-foreground mt-2">จับคู่ได้ {matched.length} · แมพไม่เจอ {rows.length - matched.length} (ตั้ง SKU/บาร์โค้ดของสินค้าให้ตรง product_code เพื่อให้ตัดได้)</div>}
        </CardContent>
      </Card>
    </div>
  );
}

/* ====================  Router  ==================== */
export function StockSection({ sub }) {
  // อ่าน data context เพื่อ re-render เมื่อข้อมูลอัปเดต (TMK เป็น mutable global ที่ provider sync)
  useData();
  const beat = useBeatOn(sub); // skeleton สั้นๆ ตอนสลับหน้าย่อย
  if (beat) return <PageSkeleton />;
  if (sub === 'stock') return <StockView />;
  if (sub === 'products') return <ProductsView />;
  if (sub === 'orders') return <OrdersView />;
  if (sub === 'movements') return <MovementsView />;
  if (sub === 'stocktake') return <StockTakeView />;
  if (sub === 'returns') return <ReturnsView />;
  if (sub === 'locations') return <LocationsView />;
  if (sub === 'mpdeduct') return <MpDeductView />;
  if (sub === 'po') return <POView />;
  if (sub === 'suppliers') return <SuppliersView />;
  if (sub === 'reports') return <ReportsView />;
  return <StockDashboard />;
}
