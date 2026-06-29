/* ============================================================
   saleEntry.jsx — เซลล์กรอกยอดขายในเว็บ (แทน Excel/Google) → tmk_sale_entries
   เน้นกรอกเร็ว + เก็บ contact ลูกค้าใหม่ไว้ต่อยอด
   ============================================================ */
import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { N, Icon, Skel, SkelTable, useDelayedFlag } from './components.jsx';
import { logAudit } from './lib/audit.js';
import { useUser } from './userContext.jsx';
import { Modal, SideSheet } from './modals.jsx';
import { normalizeProvince } from './lib/provinces.js';
import { cachedFetchAll, clearSaleCache } from './lib/saleData.js';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchInput } from '@/components/ui/search-input';
import { SortableTable, DensityToggle } from './components/DataTableParts.jsx';
import { usePersistedState } from './hooks/usePersistedState.js';

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const uid = () => 'se-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const baht = (n) => '฿' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const JOBS = ['ค้าปลีก', 'DFT', 'ส่ง', 'OEM', 'พรีออเดอร์'];
const PAYS = ['โอน', 'COD', 'มัดจำ', 'ปลายทาง', 'อื่นๆ'];
const toast = (m, t) => window.__toast && window.__toast(m, t);

const blankForm = (sp) => ({ salesperson: sp || '', order_date: todayISO(), order_no: '', job_type: 'ค้าปลีก', payment_type: 'โอน', customer_type: 'เก่า', customer_name: '', customer_contact: '', sales: '', qty: '1', design: '', note: '' });

/* Skeleton ตรง layout บันทึกขาย: การ์ดฟอร์ม (ช่องกรอก) + การ์ดลิสต์รายการ */
function EntrySkeleton() {
  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      <Card className="p-[22px]">
        <Skel w={150} h={14} style={{ marginBottom: 16 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
          {Array.from({ length: 8 }).map((_, i) => <div key={i}><Skel w="42%" h={9} /><Skel w="100%" h={34} r={8} style={{ marginTop: 6 }} /></div>)}
        </div>
        <Skel w={130} h={38} r={9} style={{ marginTop: 16 }} />
      </Card>
      <Card className="p-[22px]"><Skel w={160} h={12} style={{ marginBottom: 14 }} /><SkelTable cols={6} rows={6} /></Card>
    </div>
  );
}

export function SaleEntryView() {
  const me = useUser()?.user;
  const isAdmin = me?.role === 'admin';
  const canEnter = !!me && me.role !== 'viewer'; // viewer = ดูอย่างเดียว
  const myName = me?.name || '';
  const myEmail = me?.email || '';

  const [rows, setRows] = useState(null);
  const [noTable, setNoTable] = useState(false);
  const [err, setErr] = useState('');
  const [f, setF] = useState(() => blankForm(''));
  const [tried, setTried] = useState(false);   // กดบันทึกแล้วยังไม่ผ่าน → โชว์ error ใต้ช่อง
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState(null);
  const [dateFilter, setDateFilter] = useState(todayISO());
  const [spFilter, setSpFilter] = useState('');
  const [designOpts, setDesignOpts] = useState([]);
  const [custList, setCustList] = useState([]);   // ลูกค้าเดิม (Shipnity + เซลล์กรอก) ไว้ค้น/จดจำ
  const [custQ, setCustQ] = useState('');
  const [custOpen, setCustOpen] = useState(false);
  const [selCust, setSelCust] = useState(null);  // ลูกค้าเก่าที่เลือก (โชว์ยืนยันตัวตน)
  const [delTarget, setDelTarget] = useState(null);  // รายการที่จะลบ (เปิด modal ยืนยัน)
  const [entryDensity, setEntryDensity] = usePersistedState('tmk-entry-density', 'cozy');
  const amtRef = useRef(null);
  const nameRef = useRef(null);
  // Enter ที่ช่องเงิน/จำนวน: ถ้าเป็นลูกค้าใหม่แต่ยังไม่ได้กรอกชื่อ/เบอร์ → เด้งไปกรอกชื่อก่อน (กันบันทึก lead ใหม่ที่ไม่มีช่องทางตามต่อ) ไม่งั้น save เลย
  const enterOrAdvance = () => { if (f.customer_type === 'ใหม่' && !f.customer_name.trim() && !f.customer_contact.trim()) { nameRef.current?.focus(); return; } save(); };

  const load = async () => {
    let q = supabase.from('tmk_sale_entries').select('id,salesperson,order_date,order_no,job_type,payment_type,customer_type,customer_name,customer_contact,design,sales,qty,note').order('order_date', { ascending: false }).order('created_at', { ascending: false }).limit(3000);
    if (!isAdmin && myEmail) q = q.eq('created_by', myEmail); // เซลล์เห็นเฉพาะของตัวเอง
    const { data, error } = await q;
    if (error) { if (/relation|does not exist|tmk_sale_entries/.test(error.message)) setNoTable(true); else setErr(error.message); setRows([]); return; }
    setNoTable(false); setRows(data || []);
  };
  useEffect(() => { if (me) load(); /* eslint-disable-next-line */ }, [myEmail, isAdmin]);
  // ลายที่มีจริงในแคตตาล็อก → autocomplete ช่อง "ลาย" (กันพิมพ์ผิด/ชื่อไม่ตรงกัน) · ใช้แคชกลาง
  useEffect(() => { (async () => {
    const { data } = await cachedFetchAll('tmk_mp_skus', 'order_no,channel,design,color,size,qty,line_sales,product_code,raw_sku_or_name,match_how');
    if (!data) return;
    const cnt = {}; data.forEach(r => { const d = (r.design || '').trim(); if (d) cnt[d] = (cnt[d] || 0) + 1; });
    setDesignOpts(Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([d]) => d).slice(0, 80));
  })(); }, []);
  // ลูกค้าเดิม (Shipnity) → ค้น/จดจำลูกค้าเก่า ด้วยเบอร์/FB/LINE/ชื่อ · ใช้แคชกลาง (สลับหน้าไม่โหลดใหม่)
  useEffect(() => { (async () => {
    const { data } = await cachedFetchAll('tmk_mp_customers', 'customer_code,name,phone,social_name,province,district,postcode,address,owner,cadence,repurchase,lifetime_orders,lifetime_sales,lifetime_cancel,since,tags');
    if (!data) return;
    setCustList(data.map(c => ({ ...c, _q: `${c.name || ''} ${c.phone || ''} ${c.social_name || ''}`.toLowerCase() })));
  })(); }, []);
  // ล็อกชื่อเซลล์เป็นคนล็อกอิน (admin เท่านั้นที่พิมพ์ชื่อเองได้ = กรอกแทน)
  useEffect(() => { if (myName && !isAdmin) setF(p => ({ ...p, salesperson: myName })); }, [myName, isAdmin]);

  const salespeople = useMemo(() => [...new Set((rows || []).map(r => r.salesperson).filter(Boolean))], [rows]);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!canEnter) { toast('สิทธิ์ดูอย่างเดียว — กรอกไม่ได้', 'error'); return; }
    setTried(true);
    const salesperson = (isAdmin ? f.salesperson : myName).trim();
    if (!salesperson) { toast('ไม่พบชื่อเซลล์ (ต้องล็อกอิน)', 'error'); return; }
    if (!(Number(f.sales) > 0)) { toast('ใส่ยอดเงินมากกว่า 0', 'error'); amtRef.current?.focus(); return; }
    const qn = Number(f.qty);
    if (!(qn >= 1 && Number.isInteger(qn))) { toast('จำนวนต้องเป็นจำนวนเต็มอย่างน้อย 1 ตัว', 'error'); return; }
    // กันเลขออเดอร์ซ้ำ (เฉพาะตอนเพิ่มใหม่) — จัดฟอร์แมตให้สม่ำเสมอ (ตัวพิมพ์ใหญ่ ไม่มีเว้นวรรค)
    const ono = f.order_no.trim().toUpperCase().replace(/\s+/g, '');
    if (ono && !editId) {
      const dup = (rows || []).find(r => r.order_no === ono);
      if (dup && !await window.__confirm?.({ title: 'เลขออเดอร์ซ้ำ', body: `เลขออเดอร์ ${ono} เคยกรอกแล้ว (${baht(dup.sales)}${dup.salesperson !== salesperson ? ' โดย ' + dup.salesperson : ''})\nบันทึกซ้ำ?`, confirmText: 'บันทึกซ้ำ' })) return;
    }
    setBusy(true);
    const row = {
      id: editId || uid(), salesperson, created_by: myEmail, order_date: f.order_date, order_no: ono,
      job_type: f.job_type, payment_type: f.payment_type, customer_type: f.customer_type,
      customer_name: f.customer_name.trim(), customer_contact: f.customer_contact.trim(),
      channel: 'เซลล์', design: f.design.trim(), sales: Number(f.sales) || 0, qty: Number(f.qty) > 0 ? Number(f.qty) : 1, note: f.note.trim(), updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('tmk_sale_entries').upsert(row, { onConflict: 'id' });
    setBusy(false);
    if (error) { toast(noTable ? 'ต้องรัน migration tmk_sale_entries ก่อน' : 'บันทึกไม่สำเร็จ: ' + error.message, 'error'); return; }
    toast(editId ? 'แก้ไขแล้ว' : 'บันทึกแล้ว ✓', 'success');
    logAudit({ action: editId ? 'update' : 'create', entityType: 'data', entityName: 'ยอดขายเซลล์', summary: `${editId ? 'แก้' : 'บันทึก'}ยอดเซลล์ ${row.salesperson} ${baht(row.sales)}${row.order_no ? ' #' + row.order_no : ''}` });
    // กรอกต่อเร็ว: เคลียร์ยอด/ออเดอร์/ลูกค้าใหม่ คงเซลล์+วันที่+ประเภท
    setEditId(null); setTried(false);
    setF(p => ({ ...p, order_no: '', sales: '', qty: '1', customer_name: '', customer_contact: '', design: '', note: '' }));
    setSelCust(null); setCustQ('');
    amtRef.current?.focus();
    clearSaleCache(); // ให้รายงาน/CRM เห็นยอดใหม่รอบหน้า
    load();
  };
  const edit = (r) => { setEditId(r.id); setF({ salesperson: r.salesperson, order_date: r.order_date, order_no: r.order_no || '', job_type: r.job_type || 'ค้าปลีก', payment_type: r.payment_type || 'โอน', customer_type: r.customer_type || 'เก่า', customer_name: r.customer_name || '', customer_contact: r.customer_contact || '', sales: String(r.sales || ''), qty: String(r.qty || '1'), design: r.design || '', note: r.note || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const doDelete = async (r) => { const { error } = await supabase.from('tmk_sale_entries').delete().eq('id', r.id); setDelTarget(null); if (error) { toast('ลบไม่สำเร็จ', 'error'); return; } toast('ลบแล้ว', 'success'); clearSaleCache(); load(); };

  const filtered = (rows || []).filter(r => (!dateFilter || r.order_date === dateFilter) && (!spFilter || r.salesperson === spFilter));
  const sumSales = filtered.reduce((a, r) => a + (Number(r.sales) || 0), 0);
  const sumQty = filtered.reduce((a, r) => a + (Number(r.qty) || 0), 0);
  const newLeads = filtered.filter(r => r.customer_type === 'ใหม่');
  const newWithContact = newLeads.filter(r => r.customer_name || r.customer_contact);
  const isNew = f.customer_type === 'ใหม่';
  // ---- inline validation (โชว์ใต้ช่องเมื่อกรอกผิด/กดบันทึกแล้ว) ----
  const qtyN = Number(f.qty);
  const salesErr = (tried || f.sales !== '') && !(Number(f.sales) > 0) ? 'ใส่ยอดมากกว่า 0' : '';
  const qtyErr = (tried || f.qty !== '') && !(qtyN >= 1 && Number.isInteger(qtyN)) ? 'จำนวนเต็ม ≥ 1 ตัว' : '';
  const blockSave = !(Number(f.sales) > 0) || !(qtyN >= 1 && Number.isInteger(qtyN));
  // จับคู่ลูกค้าเก่าจากคำค้น (เบอร์/FB/LINE/ชื่อ)
  const custMatches = useMemo(() => {
    const q = custQ.trim().toLowerCase(); if (!q) return [];
    const qd = q.replace(/[^0-9]/g, '');
    return custList.filter(c => c._q.includes(q) || (qd.length >= 4 && (c.phone || '').includes(qd))).slice(0, 8);
  }, [custQ, custList]);
  const pickCust = (c) => { setF(p => ({ ...p, customer_name: c.name || '', customer_contact: c.phone || c.social_name || '', customer_type: 'เก่า' })); setSelCust(c); setCustQ(''); setCustOpen(false); };
  const clearCust = () => { setF(p => ({ ...p, customer_name: '', customer_contact: '' })); setSelCust(null); };

  const showSkel = useDelayedFlag(rows === null, 120); // โผล่หลัง 120ms · อยู่อย่างน้อย 300ms · cache ไว → เด้งทันที
  if (showSkel) return <EntrySkeleton />;
  if (rows === null) return null;

  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      {noTable && <Card className="p-3" style={{ color: 'var(--warn)', borderLeft: '3px solid var(--warn)' }}><Icon name="alertTriangle" /> ยังไม่ได้สร้างตาราง <code>tmk_sale_entries</code> — รัน <code>supabase/migrations/20260623-sale-entries.sql</code> ใน Supabase ก่อนจึงจะบันทึกได้</Card>}
      {err && <Card className="p-3" style={{ color: 'var(--bad)' }}>{err}</Card>}

      {/* ===== ฟอร์มกรอก ===== */}
      <Card className="p-4">
        <div className="row between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <CardTitle className="m-0 text-base font-semibold">{editId ? 'แก้ไขรายการ' : 'บันทึกยอดขาย'}</CardTitle>
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {me && <Badge variant="outline" style={{ color: isAdmin ? 'var(--warn)' : 'var(--accent)' }}>{isAdmin ? <><Icon name="shield" /> หัวหน้า · ทุกคน</> : <><Icon name="user" /> {myName}</>}</Badge>}
            {!canEnter && <Badge variant="outline" style={{ color: 'var(--bad)' }}>ดูอย่างเดียว</Badge>}
          </div>
        </div>
        <div className="entry-section">
          <div className="entry-section-title"><Icon name="listChecks" /> ออเดอร์</div>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 140px', marginBottom: 0 }}><label>เซลล์</label>
              {isAdmin
                ? <Input list="se-sp" value={f.salesperson} onChange={e => set('salesperson', e.target.value)} placeholder="ชื่อเซลล์" />
                : <div className="input" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', color: 'var(--ink)' }}><Icon name="user" /> {myName || '—'}</div>}
              <datalist id="se-sp">{salespeople.map(s => <option key={s} value={s} />)}</datalist>
            </div>
            <div className="field" style={{ flex: '0 0 160px', marginBottom: 0 }}><label>วันที่</label><DatePicker value={f.order_date} max={todayISO()} clearable={false} onChange={(v) => set('order_date', v)} /></div>
            <div className="field" style={{ flex: '0 0 130px', marginBottom: 0 }}><label>เลขออเดอร์</label><Input value={f.order_no} onChange={e => set('order_no', e.target.value)} placeholder="SIxxxx" /></div>
            <div className="field" style={{ flex: '0 0 120px', marginBottom: 0 }}><label>งาน</label><Select value={f.job_type} onValueChange={v => set('job_type', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{JOBS.map(j => <SelectItem key={j} value={j}>{j}</SelectItem>)}</SelectContent></Select></div>
            <div className="field" style={{ flex: '0 0 110px', marginBottom: 0 }}><label>ชำระ</label><Select value={f.payment_type} onValueChange={v => set('payment_type', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PAYS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
          </div>
        </div>
        <div className="entry-section">
          <div className="entry-section-title"><Icon name="sales" /> ยอดขายและสินค้า</div>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '0 0 130px', marginBottom: 0 }}><label>ยอด (฿)</label><Input ref={amtRef} type="number" inputMode="decimal" min="0" step="0.01" className="num" aria-invalid={!!salesErr} value={f.sales} onChange={e => set('sales', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') enterOrAdvance(); }} placeholder="0" />{salesErr && <span className="field-err">{salesErr}</span>}</div>
            <div className="field" style={{ flex: '0 0 90px', marginBottom: 0 }}><label>จำนวน</label><Input type="number" inputMode="numeric" min="1" step="1" className="num" aria-invalid={!!qtyErr} value={f.qty} onChange={e => set('qty', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') enterOrAdvance(); }} />{qtyErr && <span className="field-err">{qtyErr}</span>}</div>
            <div className="field" style={{ flex: '0 0 auto', marginBottom: 0 }}><label>ลูกค้า</label><Tabs value={f.customer_type} onValueChange={v => set('customer_type', v)}><TabsList>{['ใหม่', 'เก่า'].map(c => <TabsTrigger key={c} value={c}>{c}</TabsTrigger>)}</TabsList></Tabs></div>
            <div className="field" style={{ flex: '1 1 140px', marginBottom: 0 }}><label>ลาย</label><Input list="se-design" value={f.design} onChange={e => set('design', e.target.value)} placeholder="เช่น สิริกานต์" /><datalist id="se-design">{designOpts.map(d => <option key={d} value={d} />)}</datalist></div>
          </div>
        </div>
        {isNew && <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 10, padding: '10px 12px', background: 'var(--accent-soft)', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)' }}>
          <span className="cap row" style={{ gap: 6, color: 'var(--accent)', fontWeight: 700, alignItems: 'center' }}><Icon name="userPlus" /> ลูกค้าใหม่</span>
          <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}><label>ชื่อ</label><Input ref={nameRef} value={f.customer_name} onChange={e => set('customer_name', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.target.closest('.row').querySelector('input[data-contact]')?.focus(); }} placeholder="ชื่อ/ชื่อเล่น" /></div>
          <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}><label>เบอร์/LINE/FB</label><Input data-contact value={f.customer_contact} onChange={e => set('customer_contact', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }} placeholder="ไว้ตามต่อ" /></div>
        </div>}
        {!isNew && <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 10, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)', alignItems: 'center' }}>
          <span className="cap row" style={{ gap: 6, color: 'var(--ink-3)', fontWeight: 700, alignItems: 'center' }}><Icon name="search" /> ลูกค้าเก่า</span>
          {f.customer_name || selCust
            ? <Badge variant="outline" className="gap-1.5" style={{ color: 'var(--good)' }}><Icon name="check" /> {f.customer_name || selCust?.name}{f.customer_contact ? ' · ' + f.customer_contact : ''}{selCust ? ` · ซื้อ ${N(selCust.lifetime_orders)} ครั้ง` : ''} <button onClick={clearCust} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-4)', padding: 0, marginLeft: 2 }} title="ล้าง">✕</button></Badge>
            : <div className="field" style={{ flex: '1 1 260px', marginBottom: 0, position: 'relative' }}>
                <SearchInput value={custQ} onChange={e => { setCustQ(e.target.value); setCustOpen(true); }} onFocus={() => setCustOpen(true)} onBlur={() => setTimeout(() => setCustOpen(false), 160)} placeholder="ค้นด้วย เบอร์ / FB / LINE / ชื่อ — เพื่อยืนยันว่าเป็นใคร" />
                {custOpen && custQ.trim() && <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', boxShadow: 'var(--sh-md)', maxHeight: 260, overflow: 'auto', marginTop: 4 }}>
                  {custMatches.length === 0
                    ? <div className="cap" style={{ padding: 11, color: 'var(--ink-4)' }}>ไม่เจอลูกค้านี้ — ถ้าเป็นลูกค้าใหม่ กดปุ่ม "ใหม่"</div>
                    : custMatches.map(c => <button key={c.customer_code} type="button" className="cust-opt" onMouseDown={() => pickCust(c)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 11px', border: 'none', borderBottom: '1px solid var(--line)', background: 'transparent', cursor: 'pointer' }}>
                        <div style={{ fontWeight: 500 }}>{c.name || c.customer_code}</div>
                        <div className="cap" style={{ color: 'var(--ink-4)' }}>{c.phone || c.social_name || 'ไม่มีเบอร์'}{c.province ? ' · ' + (normalizeProvince(c.province) || c.province) : ''} · ซื้อ {N(c.lifetime_orders)} ครั้ง{c.lifetime_sales ? ` · ${baht(c.lifetime_sales)}` : ''}</div>
                      </button>)}
                </div>}
              </div>}
          {!f.customer_name && !selCust && <span className="cap" style={{ color: 'var(--ink-4)' }}>หรือข้ามไปได้ถ้าไม่รู้</span>}
        </div>}
        <div className="row entry-action-row" style={{ gap: 10, alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}><label>หมายเหตุ</label><Input value={f.note} onChange={e => set('note', e.target.value)} placeholder="แบ่งชำระ / สกรีน / คืนเงิน" /></div>
          {editId && <Button variant="outline" onClick={() => { setEditId(null); setF(blankForm(f.salesperson)); }}>ยกเลิกแก้</Button>}
          <Button disabled={busy || blockSave} title={blockSave ? 'กรอกยอด/จำนวนให้ถูกก่อน' : undefined} onClick={save}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : editId ? 'บันทึกการแก้ไข' : 'บันทึก (Enter)'}</Button>
        </div>
      </Card>

      {/* ===== คนทักวันนี้ (funnel) ===== */}
      <FunnelCard salesperson={isAdmin ? f.salesperson : myName} date={f.order_date} createdBy={myEmail} canEnter={canEnter} ordersCount={(rows || []).filter(r => r.order_date === f.order_date && r.salesperson === (isAdmin ? f.salesperson : myName)).length} />

      {/* ===== สรุป + รายการ ===== */}
      <Card className="p-4">
        <div className="row between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <CardTitle className="m-0 text-base font-semibold">รายการที่กรอก <span className="dim">({N(filtered.length)} ออเดอร์ · {baht(sumSales)} · {N(sumQty)} ตัว)</span></CardTitle>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <DatePicker value={dateFilter} onChange={(v) => setDateFilter(v)} placeholder="กรองวันที่" className="h-8 w-[150px]" />
            <Button variant="outline" size="sm" onClick={() => setDateFilter('')}>ทุกวัน</Button>
            {isAdmin && <Select value={spFilter || undefined} onValueChange={v => setSpFilter(v)}><SelectTrigger className="input-sm w-auto"><SelectValue placeholder="ทุกเซลล์" /></SelectTrigger><SelectContent>{salespeople.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>}
            {filtered.length > 0 && <DensityToggle value={entryDensity} onChange={setEntryDensity} />}
          </div>
        </div>
        {newLeads.length > 0 && <div className="cap cap-head" style={{ color: 'var(--accent)', marginBottom: 10 }}><Icon name="userPlus" /> ลูกค้าใหม่ {N(newLeads.length)} · มีเบอร์ {N(newWithContact.length)}</div>}
        {rows === null ? <div className="cap" style={{ color: 'var(--ink-4)', padding: 12 }}>กำลังโหลด…</div>
          : filtered.length === 0 ? <div className="entry-empty" style={{ padding: 32 }}>
              <Icon name="listChecks" />
              <div style={{ color: 'var(--ink-3)', fontWeight: 600, fontSize: 15 }}>ยังไม่มีรายการ{dateFilter ? 'ในวันนี้' : ''}</div>
              <div className="cap" style={{ color: 'var(--ink-4)', maxWidth: 320 }}>
                {dateFilter ? 'ลองเปลี่ยนวันที่หรือดูทุกวัน' : 'เริ่มกรอกยอดขายด้านบน — รายการจะปรากฏที่นี่'}
              </div>
              {dateFilter && <Button variant="outline" size="sm" onClick={() => setDateFilter('')} style={{ marginTop: 4 }}>ดูทุกวัน</Button>}
            </div>
            : <SortableTable maxHeight={460} density={entryDensity} initial={{ key: 'order_date', dir: 'desc' }}
                columns={[
                  { key: 'order_date', label: 'วันที่', accessor: r => r.order_date },
                  { key: 'order_no', label: 'ออเดอร์', accessor: r => r.order_no || '' },
                  { key: 'job_type', label: 'งาน', accessor: r => r.job_type },
                  { key: 'payment_type', label: 'ชำระ', accessor: r => r.payment_type },
                  { key: 'customer', label: 'ลูกค้า', accessor: r => r.customer_name || r.customer_type },
                  { key: 'design', label: 'ลาย', accessor: r => r.design || '' },
                  { key: 'sales', label: 'ยอด', align: 'right', accessor: r => Number(r.sales) || 0 },
                  { key: 'qty', label: 'ตัว', align: 'right', accessor: r => Number(r.qty) || 0 },
                  { key: 'act', label: '', sortable: false },
                ]}
                rows={filtered}
                renderRow={r => (
                <TableRow key={r.id}>
                  <TableCell className="cap">{r.order_date}</TableCell><TableCell className="num">{r.order_no || '—'}</TableCell><TableCell className="cap">{r.job_type}</TableCell><TableCell className="cap">{r.payment_type}</TableCell>
                  <TableCell>{r.customer_type === 'ใหม่' ? <Badge variant="outline" style={{ color: 'var(--accent)', fontSize: 11 }}>ใหม่{r.customer_name ? ' · ' + r.customer_name : ''}</Badge> : <span className="cap" style={{ color: 'var(--ink-3)' }}>เก่า</span>}{r.customer_contact ? <span className="cap" style={{ color: 'var(--ink-4)', marginLeft: 4 }}>{r.customer_contact}</span> : ''}</TableCell>
                  <TableCell className="cap">{r.design || '—'}</TableCell>
                  <TableCell className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{baht(r.sales)}</TableCell><TableCell className="num" style={{ textAlign: 'right' }}>{N(r.qty)}</TableCell>
                  <TableCell style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><Button variant="outline" size="sm" onClick={() => edit(r)}><Icon name="pencil" /></Button> <Button variant="outline" size="sm" className="text-[var(--bad)]" onClick={() => setDelTarget(r)}><Icon name="trash" /></Button></TableCell>
                </TableRow>
              )} />}
      </Card>

      {delTarget && <Modal icon="trash" title="ลบรายการ" sub={delTarget.order_no || baht(delTarget.sales)} onClose={() => setDelTarget(null)}
        footer={<><Button variant="outline" onClick={() => setDelTarget(null)}>ยกเลิก</Button><Button className="bg-[var(--bad)] border-[var(--bad)]" onClick={() => doDelete(delTarget)}><Icon name="trash" /> ลบเลย</Button></>}>
        <div className="cap" style={{ color: 'var(--ink-3)' }}>ลบรายการนี้ถาวร?</div>
        <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)' }}>
          <div style={{ fontWeight: 600 }}>{delTarget.order_no || '—'} · {baht(delTarget.sales)} · {N(delTarget.qty)} ตัว</div>
          <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 2 }}>{delTarget.order_date} · {delTarget.salesperson}{delTarget.design ? ' · ' + delTarget.design : ''}</div>
        </div>
      </Modal>}
    </div>
  );
}

// ---------- คนทักรายวัน (funnel) ----------
function FunnelCard({ salesperson, date, createdBy, canEnter, ordersCount }) {
  const [fn, setFn] = useState({ fb_new: '', fb_old: '', line_new: '', line_old: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [exists, setExists] = useState(false);
  const id = `${date}:${salesperson}`;
  useEffect(() => {
    if (!salesperson || !date) { setExists(false); return; }
    (async () => {
      const { data } = await supabase.from('tmk_sales_funnel').select('*').eq('id', id).maybeSingle();
      if (data) { setFn({ fb_new: String(data.leads_fb_new || ''), fb_old: String(data.leads_fb_old || ''), line_new: String(data.leads_line_new || ''), line_old: String(data.leads_line_old || ''), note: data.note || '' }); setExists(true); }
      else { setFn({ fb_new: '', fb_old: '', line_new: '', line_old: '', note: '' }); setExists(false); }
    })();
  }, [id]);
  const nv = (v) => Number(v) || 0;
  const totalLeads = nv(fn.fb_new) + nv(fn.fb_old) + nv(fn.line_new) + nv(fn.line_old);
  const newLeads = nv(fn.fb_new) + nv(fn.line_new);
  const close = totalLeads ? Math.round(ordersCount / totalLeads * 100) : 0;
  const set = (k, v) => setFn(p => ({ ...p, [k]: v }));
  const save = async () => {
    if (!canEnter) { toast('สิทธิ์ดูอย่างเดียว', 'error'); return; }
    if (!salesperson) { toast('เลือกเซลล์ก่อน', 'error'); return; }
    setBusy(true);
    const { error } = await supabase.from('tmk_sales_funnel').upsert({ id, date, salesperson, leads_fb_new: nv(fn.fb_new), leads_fb_old: nv(fn.fb_old), leads_line_new: nv(fn.line_new), leads_line_old: nv(fn.line_old), note: fn.note, created_by: createdBy, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    setBusy(false);
    if (error) { toast(/funnel|does not exist/.test(error.message) ? 'ต้องรัน migration tmk_sales_funnel ก่อน' : 'บันทึกไม่สำเร็จ', 'error'); return; }
    toast('บันทึกคนทักแล้ว ✓', 'success'); setExists(true); clearSaleCache();
    logAudit({ action: exists ? 'update' : 'create', entityType: 'data', entityName: 'คนทัก', summary: `คนทัก ${salesperson} ${date} รวม ${totalLeads} · ปิด ${ordersCount}` });
  };
  const [open, setOpen] = useState(false);
  const closeTone = close >= 15 ? 'var(--good)' : close >= 8 ? 'var(--warn)' : 'var(--bad)';
  // render function (ไม่ใช่ component) — กัน React remount input ทุก keystroke ทำ focus หลุด
  // กันค่าติดลบ — ตัดเครื่องหมายลบทิ้งตั้งแต่พิมพ์
  const setNum = (k, v) => set(k, v === '' ? '' : String(Math.max(0, Math.floor(Number(v) || 0))));
  const inp = (k, lb) => <div className="field" style={{ flex: '1 1 92px', marginBottom: 0 }}><label>{lb}</label><Input type="number" inputMode="numeric" min="0" step="1" className="num" value={fn[k]} onChange={e => setNum(k, e.target.value)} placeholder="0" /></div>;
  const doSave = async () => { await save(); setOpen(false); };
  return (
    <>
      {/* แถบสรุป (เปิด popup กรอก) — funnel เป็นงานวันละครั้ง ไม่ขวางการกรอกออเดอร์ */}
      <Card className="p-3">
        <div className="row between" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <div className="row" style={{ gap: 12, alignItems: 'baseline', flexWrap: 'wrap', minWidth: 0 }}>
            <CardTitle className="m-0 text-[15px] font-semibold">คนทักวันนี้</CardTitle>
            {exists
              ? <span className="cap" style={{ color: 'var(--ink-3)' }}>ทัก <b style={{ color: 'var(--ink)' }}>{N(totalLeads)}</b> · ปิด <b style={{ color: 'var(--accent)' }}>{N(ordersCount)}</b> · <b style={{ color: closeTone }}>{close}%</b></span>
              : <span className="cap" style={{ color: 'var(--ink-4)' }}>ยังไม่กรอกวันนี้</span>}
          </div>
          <Button variant="outline" disabled={!salesperson} onClick={() => setOpen(true)}><Icon name="pencil" /> {exists ? 'แก้คนทัก' : 'กรอกคนทักวันนี้'}</Button>
        </div>
      </Card>

      {open && <SideSheet size="sm" icon="users" title="คนทักวันนี้" sub={`${salesperson || '—'} · ${date}`} onClose={() => setOpen(false)}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>ปิด</Button><Button disabled={busy} onClick={doSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button></>}>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {inp('fb_new', 'FB ใหม่')}{inp('fb_old', 'FB เก่า')}{inp('line_new', 'LINE ใหม่')}{inp('line_old', 'LINE เก่า')}
        </div>
        <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          <div className="metric-card"><div className="cap" style={{ color: 'var(--ink-4)' }}>ทักรวม</div><div className="num" style={{ fontSize: 22, fontWeight: 700 }}>{N(totalLeads)}</div><div className="cap" style={{ color: 'var(--ink-4)' }}>ใหม่ {N(newLeads)}</div></div>
          <div className="metric-card"><div className="cap" style={{ color: 'var(--ink-4)' }}>ปิดได้</div><div className="num" style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>{N(ordersCount)}</div><div className="cap" style={{ color: 'var(--ink-4)' }}>ออเดอร์วันนี้</div></div>
          <div className="metric-card"><div className="cap" style={{ color: 'var(--ink-4)' }}>%ปิด</div><div className="num" style={{ fontSize: 22, fontWeight: 700, color: closeTone }}>{close}%</div><div className="cap" style={{ color: 'var(--ink-4)' }}>ปิด ÷ ทัก</div></div>
        </div>
      </SideSheet>}
    </>
  );
}
