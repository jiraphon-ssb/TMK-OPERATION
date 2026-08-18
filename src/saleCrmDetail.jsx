/* ============================================================
   saleCrmDetail.jsx — แยกมาจาก saleCrm.jsx (หน้า "ภาพรวม CRM")
   ============================================================
   Drawer รายละเอียดลูกค้า (ดู/แก้โปรไฟล์ + งานติดตาม + Insight ซื้อบ่อย)
   ยกมาทั้งดุ้นไม่แก้เนื้อใน — props เดิม (c / onClose / onSaved)
   ============================================================ */
import { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { N, Icon } from './components.jsx';
import { channelColor } from './charts.jsx';
import { SideSheet } from './modals-core.jsx';
import { FormSection, DrawerGroup, DrawerField, Field } from './saleWidgets.jsx';
import { OrderCard } from './orderCard.jsx';
import { fmtBaht } from './lib/money.js';
import { invalidateSaleCache } from './lib/saleData.js';
import { makeSkuResolver, loadResolverMaps } from './lib/designResolve.js';
import { logAudit } from './lib/audit.js';
import { toast, openModal } from './lib/appBus.js';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const baht = (n) => fmtBaht(Number(n) || 0); // decimal-aware กลาง (lib/money.js)
const todayISO = () => new Date().toISOString().slice(0, 10);

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

export function CustomerDetail({ c, onClose, onSaved }) {
  const [insight, setInsight] = useState(null);   // { designs, colors, sizes, desByOrder } — lazy จาก skus
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);

  // Insight: ลาย/สี/ไซซ์ ที่ซื้อบ่อย + ลายต่อออเดอร์ (โหลดครั้งเดียวต่อลูกค้า)
  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ล้างก่อนโหลด async ตอนสลับลูกค้า (กัน Insight ของคนก่อนหน้าค้าง)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตั้งใจโหลดครั้งเดียวต่อลูกค้า (c.key) · c.orders เป็น array ที่สร้างใหม่ทุก render ใส่เป็น dep จะยิง query รัวๆ
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
    openModal('task', { title: `โทรตาม ${c.name}${c.contact ? ` (${c.contact})` : ''}`, detail, date: todayISO() });
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
