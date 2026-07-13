import { useState } from 'react';
import { B, N, Icon, ColorPicker } from './components.jsx';
import { DatePicker } from '@/components/ui/date-picker';
import { supabase } from './lib/supabaseClient.js';
import { parseTaskDate, getToday, thaiDate } from './lib/dateUtils.js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Toggle } from '@/components/ui/toggle';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { logAudit } from './lib/audit.js';
import { Modal, toast, nn, guardClose, uid, saveRow, MD } from './modals-core.jsx';

export function CampaignModal({ data, onClose }) {
  const palette = ['#0a5aa0', '#ee6a3a', '#6b5ce0', '#2f9e6e', '#c08a3e', '#4a8be0'];
  const [f, setF] = useState(() => data
    ? { ...data, start: data.startISO || parseTaskDate(data.start) || '', end: data.endISO || parseTaskDate(data.end) || '' } // ISO สำหรับ <input type=date>
    : { name: '', color: palette[0], start: '', end: '', channels: [], status: 'upcoming' });
  const [touched, setTouched] = useState(false);
  const set = (k, v) => { setTouched(true); setF(p => ({ ...p, [k]: v })); };
  const toggleCh = id => { setTouched(true); setF(p => ({ ...p, channels: p.channels.includes(id) ? p.channels.filter(x => x !== id) : [...p.channels, id] })); };
  const statuses = [['upcoming', 'กำลังจะมา'], ['live', 'กำลังดำเนินการ'], ['done', 'จบแล้ว']];
  const [busy, setBusy] = useState(false);
  const handleSave = async () => {
    if (busy || !f.name.trim()) return;
    if (f.start && f.end && f.end < f.start) { toast('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม', 'error'); return; }
    setBusy(true);
    const row = {
      id: data?.id || uid('c'),
      name: f.name.trim(),
      color: f.color,
      bg: f.color + '22',
      border: f.color + '55',
      start_date: f.start || null,   // ISO จาก <input type=date>
      end_date: f.end || null,
      status: f.status,
      channels: f.channels || [],
    };
    const _cstTH = { live: 'กำลังดำเนินการ', upcoming: 'กำลังจะมา', done: 'จบแล้ว' };
    const ok = await saveRow('tmk_campaigns', row, 'บันทึกแคมเปญ', {
      action: data ? 'update' : 'create', entityType: 'campaign', entityName: row.name,
      summary: `${data ? 'แก้ไข' : 'สร้าง'}แคมเปญ "${row.name}"`,
      fields: [
        { label: 'สถานะ', value: _cstTH[f.status] || f.status },
        { label: 'ช่วงเวลา', value: (f.start || f.end) ? `${thaiDate(f.start) || '?'} - ${thaiDate(f.end) || '?'}` : '—' },
        { label: 'ช่องทาง', value: (f.channels || []).join(', ') || '—' },
      ],
    });
    setBusy(false);
    if (ok) onClose();
  };
  const footer = (<><Button variant="outline" onClick={() => guardClose(touched, onClose)}>ยกเลิก</Button><Button disabled={busy} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึกแคมเปญ'}</Button></>);
  return (
    <Modal icon="megaphone" title={data ? 'แก้ไขแคมเปญ' : 'สร้างแคมเปญ'} sub="ตั้งชื่อ ช่วงเวลา และช่องทาง" onClose={onClose} footer={footer} confirmOnClose={touched}>
      <div className="field"><label>ชื่อแคมเปญ</label><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="เช่น Payday Push" /></div>
      <div className="field-row">
        <div className="field"><label>เริ่ม</label><DatePicker value={f.start} onChange={(v) => set('start', v)} /></div>
        <div className="field"><label>สิ้นสุด</label><DatePicker value={f.end} onChange={(v) => set('end', v)} /></div>
      </div>
      <div className="field"><label>สีประจำแคมเปญ</label>
        <ColorPicker value={f.color} onChange={(c) => set('color', c)} presets={palette} />
      </div>
      <div className="field"><label>ช่องทาง (ติ๊กเลือก)</label>
        <div className="chips-pick">
          {MD.channels.map(ch => (
            <Toggle key={ch.id} variant="pill" size="sm" pressed={f.channels.includes(ch.id)} onPressedChange={() => toggleCh(ch.id)}>
              {ch.logoUrl ? (
                <img src={ch.logoUrl} alt="" style={{ width: 16, height: 16, borderRadius: 3, objectFit: 'contain', marginRight: 4 }} />
              ) : (
                <span className="dot-c" style={{ background: ch.hex }}></span>
              )}
              {ch.name}
            </Toggle>
          ))}
        </div>
      </div>
      <div className="field"><label>สถานะ</label>
        <Tabs value={f.status} onValueChange={v => set('status', v)}>
          <TabsList>
            {statuses.map(s => <TabsTrigger key={s[0]} value={s[0]}>{s[1]}</TabsTrigger>)}
          </TabsList>
        </Tabs>
      </div>
    </Modal>
  );
}

/* ============================================================
   Order system (ออเดอร์ + ลูกค้า + ติดตามสถานะ)
   ============================================================ */
// โค้ดออเดอร์: ORD-YYMMDD-XXXX

export function MonthlyTargetModal({ data, onClose }) {
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const _t = getToday();
  const [monthIdx, setMonthIdx] = useState(data?.month != null ? data.month : _t.month - 1); // 0-indexed
  const [year, setYear] = useState(data?.year || _t.yearBE);

  // โหลดค่าตั้งค่าของเดือนที่เลือก จาก MD.monthly (target + meta) — ไม่ใส่ค่าปลอม
  const loadFor = (idx, yr) => {
    const row = (MD.monthly || []).find(m => m.month === idx + 1 && m.year === yr);
    const meta = (row && row.meta) || {};
    return {
      total: row?.target || '',
      chTargets: MD.channels.map(c => ({ id: c.id, name: c.name, hex: c.hex, target: meta.channelTargets?.[c.id] ?? '' })),
      adChannels: MD.channels.filter(c => c.hasAd).map(c => ({ id: c.id, name: c.name, hex: c.hex, budget: meta.adChannels?.[c.id] ?? '' })),
      newCustTarget: meta.newCustTarget ?? '',
      acosCeil: meta.acosCeil ?? 25,
    };
  };
  const _init = loadFor(monthIdx, year);
  const [total, setTotal] = useState(_init.total);
  const [chTargets, setChTargets] = useState(_init.chTargets);
  const [adChannels, setAdChannels] = useState(_init.adChannels);
  const [newCustTarget, setNewCustTarget] = useState(_init.newCustTarget);
  const [acosCeil, setAcosCeil] = useState(_init.acosCeil);
  const [touched, setTouched] = useState(false);

  // เปลี่ยนเดือน → โหลดค่าของเดือนนั้น (แต่ละเดือนแยกกัน)
  const changeMonth = (idx, yr) => {
    setMonthIdx(idx); setYear(yr);
    const v = loadFor(idx, yr);
    setTotal(v.total); setChTargets(v.chTargets);
    setAdChannels(v.adChannels); setNewCustTarget(v.newCustTarget); setAcosCeil(v.acosCeil);
    setTouched(false); // สลับเดือน = โหลดค่าเดิม ไม่นับว่าแก้
  };

  const chSum = chTargets.reduce((a, c) => a + (+c.target || 0), 0);
  const adSum = adChannels.reduce((a, c) => a + (+c.budget || 0), 0);
  const match = chSum === (+total || 0);

  const upCh = (i, v) => { if (+v < 0) return; setTouched(true); setChTargets(ts => ts.map((t, j) => j === i ? { ...t, target: v } : t)); };
  const upAd = (i, v) => { if (+v < 0) return; setTouched(true); setAdChannels(ts => ts.map((t, j) => j === i ? { ...t, budget: v } : t)); };

  const monthOptions = [];
  [year - 1, year, year + 1].forEach(y => months.forEach((m, i) => monthOptions.push({ idx: i, year: y, label: `${m} ${y}` })));

  const [busy, setBusy] = useState(false);
  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const existing = (MD.monthly || []).find(m => m.month === monthIdx + 1 && m.year === year);
      // เดือนปัจจุบัน: actual/orders คำนวณจากยอดรายวัน (single source of truth) → ห้าม baked ค่าสด overlay ลง DB
      const _t = getToday();
      const isCurMonth = (monthIdx + 1) === _t.month && year === _t.yearBE;
      const meta = {
        ...((existing && existing.meta) || {}), // preserve คีย์อื่น เช่น entryMode (กันโหมดรายวัน/รายเดือนถูกรีเซ็ตตอนเซฟเป้า)
        adBudget: adSum, // งบแอดรวม = ผลรวมงบต่อช่อง (อัตโนมัติ)
        channelTargets: Object.fromEntries(chTargets.map(c => [c.id, nn(c.target)])),
        adChannels: Object.fromEntries(adChannels.map(c => [c.id, nn(c.budget)])),
        newCustTarget: nn(newCustTarget),
        acosCeil: Number(acosCeil) || 25,
      };
      const row = {
        id: `${year}-${String(monthIdx + 1).padStart(2, '0')}`,
        month: monthIdx + 1, year, month_th: months[monthIdx],
        target: nn(total),
        actual: isCurMonth ? 0 : (existing?.actual || 0), projected: existing?.projected || 0,
        orders: isCurMonth ? 0 : (existing?.orders || 0), messages: existing?.messages || 0,
        meta,
      };
      const { error } = await supabase.from('tmk_monthly_history').upsert(row);
      if (error) throw error;
      const tgtFields = [{ label: 'เป้ารวม', value: B(Number(total) || 0) }];
      chTargets.forEach(c => { if (Number(c.target) > 0) tgtFields.push({ label: `เป้า ${c.name}`, value: B(Number(c.target)) }); });
      if (adSum > 0) tgtFields.push({ label: 'งบแอดรวม', value: B(adSum) });
      adChannels.forEach(c => { if (Number(c.budget) > 0) tgtFields.push({ label: `งบแอด ${c.name}`, value: B(Number(c.budget)) }); });
      if (Number(newCustTarget) > 0) tgtFields.push({ label: 'เป้าลูกค้าใหม่', value: N(Number(newCustTarget)) });
      tgtFields.push({ label: 'เพดาน ACOS', value: `${Number(acosCeil) || 25}%` });
      // ก่อน→หลัง — เทียบ config เป้าเดิม (เห็นว่าค่าไหนถูกแก้ รวมถึงค่าที่ถูกล้างเป็น 0)
      const exMeta = (existing && existing.meta) || {};
      const tgtChanges = [];
      const cmpMoney = (label, a, b) => { if (Math.round(Number(a) || 0) !== Math.round(Number(b) || 0)) tgtChanges.push({ label, from: B(Number(a) || 0), to: B(Number(b) || 0) }); };
      const cmpNum = (label, a, b, sfx = '') => { if ((Number(a) || 0) !== (Number(b) || 0)) tgtChanges.push({ label, from: `${Number(a) || 0}${sfx}`, to: `${Number(b) || 0}${sfx}` }); };
      cmpMoney('เป้ารวม', existing?.target, total);
      chTargets.forEach(c => cmpMoney(`เป้า ${c.name}`, exMeta.channelTargets?.[c.id], c.target));
      cmpMoney('งบแอดรวม', exMeta.adBudget, adSum);
      adChannels.forEach(c => cmpMoney(`งบแอด ${c.name}`, exMeta.adChannels?.[c.id], c.budget));
      cmpNum('เป้าลูกค้าใหม่', exMeta.newCustTarget, newCustTarget);
      cmpNum('เพดาน ACOS', exMeta.acosCeil ?? 25, Number(acosCeil) || 25, '%');
      logAudit({
        action: existing ? 'update' : 'create',
        entityType: 'monthly',
        entityName: `${months[monthIdx]} ${year}`,
        summary: `ตั้งเป้าเดือน ${months[monthIdx]} ${year} (${B(Number(total) || 0)})`,
        fields: tgtFields,
        changes: tgtChanges.length ? tgtChanges : null,
        data: { month: monthIdx + 1, year, target: nn(total), meta },
      });
      window.__refresh?.(['tmk_monthly_history']);
      toast('บันทึกเป้าหมายเรียบร้อย', 'success');
      onClose();
    } catch (err) {
      toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };
  const footer = (
    <>
      <Button variant="outline" onClick={() => guardClose(touched, onClose)}>ยกเลิก</Button>
      <Button disabled={busy} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
    </>
  );
  return (
    <Modal icon="target" title="ตั้งเป้าหมายรายเดือน" sub="กำหนดเป้ายอดขายและงบโฆษณา" onClose={onClose} footer={footer} wide confirmOnClose={touched}>
      <div className="field" style={{ maxWidth: 220 }}>
        <label>เดือน/ปี</label>
        <Select value={`${monthIdx}-${year}`} onValueChange={v => { const [i, y] = v.split('-').map(Number); changeMonth(i, y); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthOptions.map(o => <SelectItem key={o.label} value={`${o.idx}-${o.year}`}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="field">
        <label>เป้ายอดรวม (฿)</label>
        <Input type="number" min="0" inputMode="decimal" placeholder="0" value={total} onChange={e => { setTouched(true); setTotal(e.target.value); }} />
      </div>

      <div className="field">
        <label>เป้าต่อช่อง</label>
        <div className="ch-grid-2">
          {chTargets.map((c, i) => (
            <div key={c.id} className="row" style={{ gap: 10 }}>
              <span className="row" style={{ gap: 7, flex: '0 1 100px', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', fontWeight: 600 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: c.hex }}></span>{c.name}
              </span>
              <Input type="number" min="0" inputMode="decimal" placeholder="0" style={{ flex: 1 }} value={c.target} onChange={e => upCh(i, e.target.value)} />
            </div>
          ))}
        </div>
        <div className="row between" style={{ marginTop: 8 }}>
          <span className="cap">รวมช่องทาง: {B(chSum)}</span>
          {match
            ? <Badge className="border-transparent bg-[var(--good-soft)] text-[var(--good)] hover:bg-[var(--good-soft)]">ตรงกับเป้ารวม</Badge>
            : <Badge className="border-transparent bg-[var(--warn-soft)] text-[var(--warn)] hover:bg-[var(--warn-soft)]">ต่างจากเป้ารวม {B(Math.abs(chSum - total))}</Badge>}
        </div>
      </div>

      <div className="field">
        <label>งบแอดต่อช่อง</label>
        <div className="ch-grid-2">
          {adChannels.map((c, i) => (
            <div key={c.id} className="row" style={{ gap: 10 }}>
              <span className="row" style={{ gap: 7, flex: '0 1 100px', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', fontWeight: 600 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: c.hex }}></span>{c.name}
              </span>
              <Input type="number" min="0" inputMode="decimal" placeholder="0" style={{ flex: 1 }} value={c.budget} onChange={e => upAd(i, e.target.value)} />
            </div>
          ))}
        </div>
        <div className="row between" style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
          <span style={{ fontWeight: 700 }}>งบแอดรวม <span className="cap" style={{ fontWeight: 500, color: 'var(--ink-4)' }}>(รวมอัตโนมัติ)</span></span>
          <span className="num" style={{ fontWeight: 800, color: 'var(--accent)' }}>{B(adSum)}</span>
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label>เป้าลูกค้าใหม่</label>
          <Input type="number" min="0" inputMode="decimal" placeholder="0" value={newCustTarget} onChange={e => { setTouched(true); setNewCustTarget(e.target.value); }} />
        </div>
        <div className="field">
          <label>เพดาน ACOS %</label>
          <Input type="number" min="0" inputMode="decimal" value={acosCeil} onChange={e => { setTouched(true); setAcosCeil(e.target.value); }} />
        </div>
      </div>

    </Modal>
  );
}

/* ---------- Ad Campaign modal ---------- */
export function AdCampaignModal({ data, onClose }) {
  const _statusTH = { upcoming: 'รอเริ่ม', live: 'กำลังรัน', paused: 'หยุดชั่วคราว', done: 'เสร็จสิ้น', cancelled: 'ยกเลิก' };
  const [f, setF] = useState(() => data
    ? { ...data, status: _statusTH[data.status] || 'กำลังรัน' } // map internal→ไทย ให้ชิปตรง; status แปลก → default
    : { name: '', platform: 'Facebook', budget: '', startDate: '', endDate: '', goal: 'Conversion', status: 'รอเริ่ม' });
  const [touched, setTouched] = useState(false);
  const set = (k, v) => { setTouched(true); setF(p => ({ ...p, [k]: v })); };
  const platforms = ['Facebook', 'TikTok', 'Shopee', 'Lazada'];
  const goals = ['Awareness', 'Conversion', 'Retargeting'];
  const statuses = ['รอเริ่ม', 'กำลังรัน', 'หยุดชั่วคราว', 'เสร็จสิ้น', 'ยกเลิก'];
  const statusMap = { 'รอเริ่ม': 'upcoming', 'กำลังรัน': 'live', 'หยุดชั่วคราว': 'paused', 'เสร็จสิ้น': 'done', 'ยกเลิก': 'cancelled' };
  const [busy, setBusy] = useState(false);
  const handleSave = async () => {
    if (busy || !f.name.trim()) return;
    if (f.startDate && f.endDate && f.endDate < f.startDate) { toast('วันจบต้องไม่ก่อนวันเริ่ม', 'error'); return; }
    setBusy(true);
    const row = {
      id: data?.id || uid('ac'),
      name: f.name.trim(),
      platform: f.platform,
      budget: nn(f.budget),
      spent: Number(data?.spent) || 0,
      revenue: Number(data?.revenue) || 0,
      roas: Number(data?.roas) || 0,
      acos: Number(data?.acos) || 0,
      status: statusMap[f.status] || 'live',
      start_date: f.startDate || null,
      end_date: f.endDate || null,
      goal: f.goal,
    };
    const ok = await saveRow('tmk_ad_campaigns', row, 'บันทึกแคมเปญแอด', {
      action: data ? 'update' : 'create', entityType: 'ad', entityName: row.name,
      summary: `${data ? 'แก้ไข' : 'สร้าง'}แคมเปญแอด "${row.name}"`,
      fields: [
        { label: 'แพลตฟอร์ม', value: f.platform || '—' },
        { label: 'งบ', value: B(Number(f.budget) || 0) },
        { label: 'เป้าหมาย', value: f.goal || '—' },
        { label: 'ช่วงเวลา', value: (f.startDate || f.endDate) ? `${f.startDate || '?'} - ${f.endDate || '?'}` : '—' },
      ],
    });
    setBusy(false);
    if (ok) onClose();
  };

  const footer = (
    <>
      <Button variant="outline" onClick={() => guardClose(touched, onClose)}>ยกเลิก</Button>
      <Button disabled={busy} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
    </>
  );
  return (
    <Modal icon="zap" title={data ? 'แก้ไขแคมเปญแอด' : 'สร้างแคมเปญแอด'} sub="ตั้งค่าแคมเปญโฆษณา" onClose={onClose} footer={footer} confirmOnClose={touched}>
      <div className="field">
        <label>ชื่อแคมเปญ</label>
        <Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="เช่น Polo Signature — Awareness" />
      </div>

      <div className="field">
        <label>แพลตฟอร์ม</label>
        <ToggleGroup type="single" variant="pill" size="sm" className="chips-pick" value={f.platform} onValueChange={v => v && set('platform', v)}>
          {platforms.map(p => (
            <ToggleGroupItem key={p} value={p}>{p}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="field-row-3">
        <div className="field">
          <label>งบประมาณ (฿)</label>
          <Input type="number" min="0" inputMode="decimal" value={f.budget} onChange={e => set('budget', e.target.value)} placeholder="0" />
        </div>
        <div className="field">
          <label>วันเริ่ม</label>
          <DatePicker value={f.startDate} onChange={(v) => set('startDate', v)} />
        </div>
        <div className="field">
          <label>วันจบ</label>
          <DatePicker value={f.endDate} onChange={(v) => set('endDate', v)} />
        </div>
      </div>

      <div className="field">
        <label>เป้าหมาย</label>
        <ToggleGroup type="single" variant="pill" size="sm" className="chips-pick" value={f.goal} onValueChange={v => v && set('goal', v)}>
          {goals.map(g => (
            <ToggleGroupItem key={g} value={g}>{g}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="field">
        <label>สถานะ</label>
        <ToggleGroup type="single" variant="pill" size="sm" className="chips-pick" value={f.status} onValueChange={v => v && set('status', v)}>
          {statuses.map(s => (
            <ToggleGroupItem key={s} value={s}>{s}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </Modal>
  );
}

/* ---------- Customer Segment modal ---------- */
export function CustomerSegmentModal({ onClose }) {
  // โครงกลุ่มลูกค้า (นิยาม) — ค่าตัวเลขไม่ใส่ให้เอง: โหลดจากของจริงถ้ามี ไม่งั้นว่าง
  const segDefs = [
    { name: 'VIP', color: 'var(--accent)', criteria: 'ซื้อ ≥5 ครั้ง หรือ ยอด ≥10,000฿/เดือน' },
    { name: 'Regular', color: 'var(--good)', criteria: 'ซื้อ 2–4 ครั้ง ใน 3 เดือน' },
    { name: 'At-risk', color: 'var(--warn)', criteria: 'ไม่ซื้อ 30–60 วัน' },
    { name: 'Churned', color: 'var(--bad)', criteria: 'ไม่ซื้อ >60 วัน' },
  ];
  const segInit = segDefs.map(d => {
    const existing = (MD.segments || []).find(s => s.name === d.name);
    return { ...d, count: existing ? existing.count : '', revPct: existing ? existing.revPct : '' };
  });
  const [segments, setSegments] = useState(segInit);
  const [clv, setClv] = useState(MD.computed.CLV || '');
  const [touched, setTouched] = useState(false);

  const upSeg = (i, k, v) => { setTouched(true); setSegments(ss => ss.map((s, j) => j === i ? { ...s, [k]: v } : s)); };
  const totalCount = segments.reduce((a, s) => a + (+s.count || 0), 0);
  const totalRevPct = segments.reduce((a, s) => a + (+s.revPct || 0), 0);

  const [busy, setBusy] = useState(false);
  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const rows = segments.map((s, i) => ({
        id: 'seg' + (i + 1),
        name: s.name,
        count: nn(s.count),
        rev_pct: nn(s.revPct),
        color: typeof s.color === 'string' ? s.color : '#3b82f6',
        criteria: s.criteria,
        avg_clv: nn(clv),
        sort_order: i + 1,
      }));
      const { error } = await supabase.from('tmk_customer_segments').upsert(rows);
      if (error) throw error;
      logAudit({ action: 'update', entityType: 'segment', entityName: 'กลุ่มลูกค้า', summary: 'อัปเดตกลุ่มลูกค้า (RFM)' });
      window.__refresh?.(['tmk_customer_segments']);
      toast('บันทึกกลุ่มลูกค้าเรียบร้อย', 'success');
      onClose();
    } catch (err) {
      toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };
  const footer = (
    <>
      <Button variant="outline" onClick={() => guardClose(touched, onClose)}>ยกเลิก</Button>
      <Button disabled={busy} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
    </>
  );
  return (
    <Modal icon="users" title="อัปเดตกลุ่มลูกค้า" sub="จัดกลุ่มลูกค้าตามพฤติกรรมการซื้อ" onClose={onClose} footer={footer} wide confirmOnClose={touched}>
      <div className="rec-channel-grid">
        {segments.map((seg, i) => (
          <div key={seg.name} style={{ padding: '12px 14px', borderRadius: 'var(--r)', background: 'var(--surface-2)', borderLeft: `3px solid ${seg.color}` }}>
            <div style={{ marginBottom: 10 }}>
              <span className="row sm" style={{ fontWeight: 700, gap: 7 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: seg.color, flexShrink: 0 }}></span>{seg.name}
              </span>
              <div className="cap" style={{ color: 'var(--ink-3)', marginTop: 3 }}>{seg.criteria}</div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>จำนวน (คน)</label>
                <Input type="number" min="0" inputMode="decimal" placeholder="0" value={seg.count} onChange={e => upSeg(i, 'count', e.target.value === '' ? '' : +e.target.value)} />
              </div>
              <div className="field">
                <label>% รายได้</label>
                <Input type="number" min="0" inputMode="decimal" placeholder="0" value={seg.revPct} onChange={e => upSeg(i, 'revPct', e.target.value === '' ? '' : +e.target.value)} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label>CLV เฉลี่ย (฿)</label>
        <Input type="number" min="0" inputMode="decimal" placeholder="0" value={clv} onChange={e => { setTouched(true); setClv(e.target.value); }} />
      </div>

      <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 'var(--r)', background: 'var(--surface-2)' }}>
        <div className="row between" style={{ gap: 8 }}>
          <span className="cap">ลูกค้ารวม: <strong>{N(totalCount)}</strong> คน</span>
          <span className="cap">รวม % รายได้: <strong style={{ color: totalRevPct === 100 ? 'var(--good)' : 'var(--warn)' }}>{totalRevPct}%</strong>
            {totalRevPct === 100 ? ' ✓' : <span style={{ color: 'var(--ink-4)' }}> / 100%</span>}
          </span>
        </div>
        <div className="seg-progress">
          <span style={{ width: `${Math.min(100, totalRevPct)}%`, background: totalRevPct === 100 ? 'var(--good)' : totalRevPct > 100 ? 'var(--bad)' : 'var(--accent)' }}></span>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Historical Entry modal ---------- */


