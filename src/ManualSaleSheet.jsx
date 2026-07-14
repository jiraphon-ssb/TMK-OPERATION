/* ============================================================
   ManualSaleSheet — "เพิ่มออเดอร์เอง / คีย์มือ" (ขายไม่มีใบเสร็จ)
   ============================================================
   เขียนท่อเดียวกับใบเสร็จ (confirmReceipts) → กันเลขซ้ำ · เติมลูกค้า CRM · ขึ้นรายงานครบ
   ยอดขึ้นชื่อ "คนที่ล็อกอิน" (user ที่ส่งเข้ามา) เสมอ
   PART 63: แบ่ง 2 ส่วน (ขาย / ลูกค้า) + หลายรายการต่อออเดอร์ + เลือกลาย/สี/ไซซ์จากสินค้า (หรือพิมพ์เอง)
   (แยกเป็นไฟล์อิสระ — กัน circular import ระหว่าง views-2 ↔ views-sale-submit) */
import { useMemo, useState } from 'react';
import { Icon } from './components.jsx';
import { SideSheet } from './modals-core.jsx';
import { logAudit } from './lib/audit.js';
import { confirmReceipts } from './lib/receiptSubmit.js';
import { jobTypeFromNote } from './lib/receiptParse.js';
import { CHANNELS, JOB_TYPES, RECEIPT_PAYMENTS } from './lib/saleFields.js';
import { DesignCombobox, ColorSelect, SizeSelect, buildLineSku, lineDisplayName, findDesign, ProvinceCombobox } from './components/ProductPicker.jsx';
import { FormSection, CustomerTypeChips } from './saleWidgets.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DatePicker } from '@/components/ui/date-picker';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
const fmtB = (n) => '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const toast = (m, k) => window.__toast?.(m, k);
const N = (n) => Number(n) || 0;

// บรรทัดสินค้าเปล่า (โหมด "เลือกจากสินค้า" เป็นค่าเริ่ม)
const blankLine = () => ({ mode: 'pick', design: '', code: '', color: '', size: '', qty: '1', price: '' });
const lineAmount = (l) => N(l.qty) * N(l.price);

/* FormSection ย้ายไป saleWidgets (PART 81.5) — มาตรฐานเดียวทั้ง 3 ฟอร์มขาย */

/* ---------- บรรทัดสินค้า 1 รายการ (เลือกจากสินค้า / พิมพ์เอง) ---------- */
function LineRow({ line, idx, canRemove, onChange, onRemove }) {
  const upd = (patch) => onChange({ ...line, ...patch });
  const design = findDesign(line.design);
  // เลือกลายจากสินค้า → เติมโค้ด + ราคาอัตโนมัติ (ราคายังแก้ได้) · เคลียร์สี/ไซซ์ที่ลายใหม่ไม่มี
  const pickDesign = ({ name, code, design: d }) => {
    const next = { design: name, code };
    if (d?.price && !line.price) next.price = String(d.price);
    if (line.color && d?.colors?.length && !d.colors.includes(line.color)) next.color = '';
    if (line.size && d?.sizes?.length && !d.sizes.includes(line.size)) next.size = '';
    upd(next);
  };
  return (
    <div className="rounded-lg border p-2.5" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
      <div className="mb-2 flex items-center gap-2">
        <span className="cap font-semibold" style={{ color: 'var(--ink-3)' }}>รายการ {idx + 1}</span>
        <ToggleGroup type="single" value={line.mode} onValueChange={v => v && upd({ mode: v })} variant="outline" size="sm" className="h-7 ml-1">
          <ToggleGroupItem value="pick" className="h-7 px-2 text-[11px]">เลือกจากสินค้า</ToggleGroupItem>
          <ToggleGroupItem value="manual" className="h-7 px-2 text-[11px]">พิมพ์เอง</ToggleGroupItem>
        </ToggleGroup>
        <span className="ml-auto cap font-semibold" style={{ color: 'var(--accent)' }}>{fmtB(lineAmount(line))}</span>
        {canRemove && <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onRemove} title="ลบรายการ"><Icon name="trash" className="size-3.5" /></Button>}
      </div>
      {line.mode === 'pick' ? (
        <div className="grid gap-2">
          <DesignCombobox value={line.design} code={line.code} onPick={pickDesign} />
          <div className="grid gap-2" style={{ gridTemplateColumns: '1.2fr 1fr 0.7fr 0.9fr' }}>
            <ColorSelect design={design} value={line.color} onChange={v => upd({ color: v })} />
            <SizeSelect design={design} value={line.size} onChange={v => upd({ size: v })} />
            <Input type="number" inputMode="numeric" min="1" value={line.qty} onChange={e => upd({ qty: e.target.value })} placeholder="จำนวน" title="จำนวน" />
            <Input type="number" inputMode="decimal" min="0" step="0.01" value={line.price} onChange={e => upd({ price: e.target.value })} placeholder="ราคา/ตัว" title="ราคา/ตัว" />
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          <div className="grid gap-2" style={{ gridTemplateColumns: '1.4fr 1fr 0.9fr' }}>
            <Input value={line.design} onChange={e => upd({ design: e.target.value })} placeholder="ลาย เช่น สิริกานต์" />
            <Input value={line.color} onChange={e => upd({ color: e.target.value })} placeholder="สี" />
            <Input value={line.size} onChange={e => upd({ size: e.target.value })} placeholder="ไซซ์" />
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Input type="number" inputMode="numeric" min="1" value={line.qty} onChange={e => upd({ qty: e.target.value })} placeholder="จำนวน (ตัว)" />
            <Input type="number" inputMode="decimal" min="0" step="0.01" value={line.price} onChange={e => upd({ price: e.target.value })} placeholder="ราคา/ตัว" />
          </div>
        </div>
      )}
    </div>
  );
}

export function ManualSaleSheet({ user, onClose, onSaved }) {
  const blank = () => ({
    order_date: todayISO(), order_no: '', channel: '', job_type: 'ปลีก', payment: 'โอน', note: '', total: '',
    lines: [blankLine()],
    customer_type: 'ลูกค้าใหม่', customer_name: '', customer_phone: '', customer_social: '', customer_address: '', province: '',
    discount: '', shipping: '',   // รายละเอียดเพิ่มเติม (เดิม hardcode 0 — ข้อมูลหายถาวร)
  });
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const setLine = (i, next) => setF(p => ({ ...p, lines: p.lines.map((l, j) => j === i ? next : l) }));
  const addLine = () => setF(p => ({ ...p, lines: [...p.lines, blankLine()] }));
  const removeLine = (i) => setF(p => ({ ...p, lines: p.lines.length > 1 ? p.lines.filter((_, j) => j !== i) : p.lines }));

  const sumLines = useMemo(() => f.lines.reduce((s, l) => s + lineAmount(l), 0), [f.lines]);
  const effectiveTotal = N(f.total) > 0 ? N(f.total) : sumLines;
  const hasValidLine = f.lines.some(l => N(l.qty) >= 1 && lineAmount(l) > 0);
  const valid = f.channel && hasValidLine && effectiveTotal > 0;

  const save = async () => {
    if (!valid) { toast('เลือกช่องทาง + ใส่รายการ (ลาย/จำนวน/ราคา) ให้ครบก่อน', 'warn'); return; }
    setBusy(true);
    try {
      const ono = f.order_no.trim().toUpperCase().replace(/\s+/g, '') || ('MN' + (Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).toUpperCase());   // suffix สุ่ม กันชนใน ms เดียว
      const lines = f.lines
        .filter(l => N(l.qty) >= 1 && lineAmount(l) > 0)
        .map(l => ({
          code: l.mode === 'pick' ? buildLineSku(l.code, l.color, l.size) : '',
          name: lineDisplayName(l.design, l.color, l.size) || 'ไม่ระบุลาย',
          color: l.color.trim(), size: l.size.trim(),
          qty: N(l.qty), amount: lineAmount(l),
        }));
      const item = {
        order_no: ono, order_date: f.order_date,
        customer_name: f.customer_name.trim(), customer_phone: f.customer_phone.trim(), customer_social: f.customer_social.trim(), customer_address: f.customer_address.trim(),
        province: f.province.trim(),
        lines,
        subtotal: sumLines, discount: N(f.discount), shipping: N(f.shipping), total: effectiveTotal,
        payment_method: f.payment === 'COD' ? 'cod' : f.payment === 'ไม่ระบุ' ? '' : 'โอน', carrier: '', note: f.note.trim(),
        channel: f.channel, job_type: f.job_type, customer_type: f.customer_type,
        source_tool: 'manual', warnings: [],
      };
      const res = await confirmReceipts([item], { email: user?.email || '', name: user?.name || '' });
      if (res.skipped.length) { toast(`บันทึกไม่ได้: ${res.skipped[0].reason}`, 'error'); return; }
      logAudit({ action: 'create', entityType: 'data', entityName: 'เพิ่มออเดอร์', summary: `เพิ่มออเดอร์ ${ono} · ${lines.length} รายการ · ${fmtB(item.total)} (${user?.name || user?.email})` });
      toast(`บันทึกแล้ว ${ono} ✓ — คีย์ต่อได้เลย`, 'success');
      onSaved?.();
      // เคลียร์เฉพาะรายการ/ยอด/ลูกค้า — คงวันที่/ช่องทาง/งาน/ชำระ ไว้คีย์ต่อเร็ว
      setF(p => ({ ...blank(), order_date: p.order_date, channel: p.channel, job_type: p.job_type, payment: p.payment }));
    } catch (e) { toast('บันทึกไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <SideSheet size="md" icon="pencil" title="เพิ่มออเดอร์" sub={`เซลล์: ${user?.name || user?.email || '—'} · เข้าระบบเดียวกับใบเสร็จ`} onClose={onClose}
      footer={<>
        <span className="mr-auto text-sm"><span style={{ color: 'var(--ink-4)' }}>รวม </span><b style={{ color: 'var(--accent)' }}>{fmtB(effectiveTotal)}</b></span>
        <Button variant="outline" onClick={onClose}>ปิด</Button>
        <Button disabled={busy || !valid} onClick={save}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
      </>}>
      <div className="grid gap-3">
        {/* ---------- ส่วนขาย ---------- */}
        <FormSection icon="sales" title="ข้อมูลการขาย">
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <div className="field"><label>วันที่</label><DatePicker value={f.order_date} max={todayISO()} clearable={false} onChange={v => set('order_date', v)} /></div>
            <div className="field"><label>เลขออเดอร์ (ว่าง = สร้างให้)</label><Input value={f.order_no} onChange={e => set('order_no', e.target.value)} placeholder="เช่น SK1234" /></div>
            <div className="field"><label>ช่องทาง *</label>
              <Select value={f.channel || undefined} onValueChange={v => set('channel', v)}>
                <SelectTrigger><SelectValue placeholder="เลือก" /></SelectTrigger>
                <SelectContent>{CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="field"><label>ประเภทงาน</label>
              {(() => {
                // ท่อบันทึก (buildRows) ยึดหมายเหตุตัดสิน ปลีก/DFT — UI ต้อง couple กับ note ไม่งั้นเลือก DFT แต่เซฟเป็นปลีก
                const eff = f.job_type === 'OEM' ? 'OEM' : (jobTypeFromNote(f.note) === 'DFT' ? 'DFT' : 'ปลีก');
                const stripDft = (s) => String(s || '').replace(/\bdft\b/ig, '').replace(/\s{2,}/g, ' ').trim();
                const pick = (v) => {
                  if (!v || v === eff) return;
                  if (v === 'OEM') { set('job_type', 'OEM'); return; }
                  let n = stripDft(f.note);
                  if (v === 'DFT') n = (n ? n + ' ' : '') + 'DFT';
                  setF(p => ({ ...p, job_type: v, note: n }));
                };
                return (
                  <ToggleGroup type="single" value={eff} onValueChange={pick} variant="outline" className="justify-start">
                    {JOB_TYPES.map(j => <ToggleGroupItem key={j} value={j} className="h-9 px-2.5 text-[12px]">{j}</ToggleGroupItem>)}
                  </ToggleGroup>
                );
              })()}
            </div>
            <div className="field"><label>การชำระ</label>
              <Select value={f.payment} onValueChange={v => set('payment', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{RECEIPT_PAYMENTS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* รายการสินค้า */}
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between">
              <label className="cap font-semibold" style={{ color: 'var(--ink-3)' }}>รายการสินค้า</label>
              <span className="cap" style={{ color: 'var(--ink-4)' }}>รวมรายการ {fmtB(sumLines)}</span>
            </div>
            <div className="grid gap-2">
              {f.lines.map((l, i) => (
                <LineRow key={i} line={l} idx={i} canRemove={f.lines.length > 1} onChange={next => setLine(i, next)} onRemove={() => removeLine(i)} />
              ))}
            </div>
            <Button variant="outline" size="sm" className="mt-2 w-full gap-1.5" onClick={addLine}><Icon name="plus" className="size-3.5" /> เพิ่มรายการ</Button>
          </div>

          <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <div className="field"><label>ยอดรวม (฿) · ว่าง = ใช้ยอดรายการ</label><Input type="number" inputMode="decimal" min="0" step="0.01" value={f.total} onChange={e => set('total', e.target.value)} placeholder={String(sumLines || 0)} /></div>
            <div className="field"><label>หมายเหตุ (พิมพ์ “DFT” = งาน DFT)</label><Input value={f.note} onChange={e => { const v = e.target.value; setF(p => ({ ...p, note: v, job_type: p.job_type === 'OEM' ? 'OEM' : (jobTypeFromNote(v) === 'DFT' ? 'DFT' : 'ปลีก') })); }} placeholder="เช่น DFT / แบ่งชำระ" /></div>
          </div>

          {/* รายละเอียดเพิ่มเติม (ไม่บังคับ) — ส่วนลด/ค่าส่ง ลง attrs เหมือนใบเสร็จ (เดิม hardcode 0 = หายถาวร) */}
          <Collapsible className="mt-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-1 text-[12px]" style={{ color: 'var(--ink-4)' }}><Icon name="down" className="size-3.5" /> รายละเอียดเพิ่มเติม (ส่วนลด/ค่าส่ง)</Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                <div className="field"><label>ส่วนลด (฿)</label><Input type="number" inputMode="decimal" min="0" step="0.01" value={f.discount} onChange={e => set('discount', e.target.value)} placeholder="0" /></div>
                <div className="field"><label>ค่าส่ง (฿)</label><Input type="number" inputMode="decimal" min="0" step="0.01" value={f.shipping} onChange={e => set('shipping', e.target.value)} placeholder="0" /></div>
              </div>
              <span className="cap" style={{ color: 'var(--ink-4)' }}>บันทึกเป็นข้อมูลประกอบ — ยอดรวมสุทธิยังเป็นตามที่กรอก (ไม่คำนวณให้)</span>
            </CollapsibleContent>
          </Collapsible>
        </FormSection>

        {/* ---------- ส่วนลูกค้า ---------- */}
        <FormSection icon="user" title="ข้อมูลลูกค้า" sub="ไว้ตามต่อ / เข้า CRM">
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <div className="field"><label>ชื่อลูกค้า</label><Input value={f.customer_name} onChange={e => set('customer_name', e.target.value)} placeholder="ชื่อ/ชื่อเล่น" /></div>
            {/* แยกเบอร์กับโซเชียล — เดิมช่องเดียวปนกัน: พิมพ์ชื่อไลน์ลง customer_phone → เบอร์เสีย + CRM key ตกไปใช้ชื่อ */}
            <div className="field"><label>เบอร์โทร</label><Input value={f.customer_phone} onChange={e => set('customer_phone', e.target.value)} inputMode="tel" placeholder="เช่น 0812345678" /></div>
            <div className="field"><label>โซเชียล (FB/LINE)</label><Input value={f.customer_social} onChange={e => set('customer_social', e.target.value)} placeholder="ชื่อเพจ/ไลน์ ไว้ตามต่อ" /></div>
            <div className="field"><label>จังหวัด</label><ProvinceCombobox value={f.province} onChange={v => set('province', v)} /></div>
          </div>
          <div className="mt-3 field"><label>ที่อยู่</label><Input value={f.customer_address} onChange={e => set('customer_address', e.target.value)} placeholder="ที่อยู่จัดส่ง (เข้าโปรไฟล์ลูกค้า CRM)" /></div>
          <div className="mt-3"><CustomerTypeChips value={f.customer_type} onChange={v => set('customer_type', v)} /></div>
        </FormSection>
      </div>
    </SideSheet>
  );
}
