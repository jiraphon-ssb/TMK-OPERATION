/* ============================================================
   saleImportHub.jsx — การ์ดนำเข้าไฟล์มาร์เก็ตเพลส + รวมชื่อเซลล์
   (กระทบยอดเซลล์ ถูกยกเลิกแล้ว — เหลือแค่นำเข้า)
   ============================================================ */
import { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { N, Icon, CardHead } from './components.jsx';
import { MpImportModal } from './modals.jsx';
import { cachedFetchAll, clearSaleCache } from './lib/saleData.js';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';

const fetchAllOrders = () => cachedFetchAll('tmk_mp_orders', 'order_no,marketplace_id,source,channel,salesperson,province,payment_type,customer_type,qty,qty_band,sales,cost,profit,mkt_commission,cod_amount,job_type,order_date,order_month,status,customer_code,customer_name,customer_social,cust_total_spent');

// การ์ดนำเข้าไฟล์มาร์เก็ตเพลส (คืน Card ใบเดียว — ให้ HealthHub วางในกริดของตัวเอง)
export function ImportExportHub() {
  const [orders, setOrders] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => { (async () => { const r = await fetchAllOrders(); if (!r.error) setOrders(r.data); })(); }, [reloadKey]);

  return (
    <Card className="p-4">
      <CardHead icon="box" title={<>นำเข้าข้อมูลขาย <span className="dim">(Shipnity / Shopee / TikTok + แคตตาล็อก)</span></>}
        sub={<>ลากไฟล์มาร์เก็ตเพลสเข้าระบบ — รวม / จับคู่ลาย / <b>เก็บโปรไฟล์ลูกค้า</b> / บันทึก Supabase อัตโนมัติในครั้งเดียว</>} />
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button onClick={() => setImportOpen(true)}><Icon name="external" /> นำเข้าไฟล์มาร์เก็ตเพลส</Button>
        {orders ? <Badge variant="secondary">ในระบบ {N(orders.length)} ออเดอร์</Badge> : <span className="cap" style={{ color: 'var(--ink-4)' }}>กำลังโหลด…</span>}
      </div>
      {importOpen && <MpImportModal onClose={() => setImportOpen(false)} onDone={() => { clearSaleCache(); setReloadKey(k => k + 1); }} />}
    </Card>
  );
}

// รวมชื่อเซลล์: บัญชีคีย์ข้อมูล (handle) → ชื่อจริงที่ใช้รวมยอด/ปิดการขายต่อเซลล์
export function SalesAliasManager() {
  const [handles, setHandles] = useState(null);
  const [edits, setEdits] = useState({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');
  const [q, setQ] = useState('');
  const reload = async () => {
    const cnt = {}; let from = 0;
    for (let i = 0; i < 60; i++) {
      const { data } = await supabase.from('tmk_mp_orders').select('salesperson').range(from, from + 999);
      if (!data || !data.length) break;
      data.forEach(o => { const h = (o.salesperson || '').trim(); if (h && !/^\(.*\)$/.test(h)) cnt[h] = (cnt[h] || 0) + 1; });
      if (data.length < 1000) break; from += 1000;
    }
    const { data: al } = await supabase.from('tmk_sales_aliases').select('handle,display_name');
    const m = {}; (al || []).forEach(a => { m[a.handle] = a.display_name || ''; });
    setEdits(m);
    setHandles(Object.entries(cnt).sort((a, b) => b[1] - a[1]));
  };
  useEffect(() => { reload(); }, []);
  const saveAll = async () => {
    setBusy(true); setSaved('');
    const rows = Object.entries(edits).filter(([, v]) => (v || '').trim()).map(([handle, display_name]) => ({ handle, display_name: display_name.trim(), updated_at: new Date().toISOString() }));
    if (!rows.length) { setBusy(false); return; }
    const { error } = await supabase.from('tmk_sales_aliases').upsert(rows, { onConflict: 'handle' });
    setBusy(false);
    if (error) { setSaved('บันทึกไม่สำเร็จ — รัน migration tmk_sales_aliases แล้วหรือยัง?'); return; }
    setSaved(`รวมชื่อแล้ว ${N(rows.length)} บัญชี — หน้ารายงานจะรวมยอดต่อเซลล์ให้`); window.__toast?.('บันทึกชื่อเซลล์แล้ว', 'good');
  };
  const named = handles ? handles.filter(([h]) => (edits[h] || '').trim()).length : 0;
  const shown = handles ? handles.filter(([h]) => !q.trim() || h.toLowerCase().includes(q.trim().toLowerCase())) : [];
  return (
    <Card className="p-4">
      <CardHead icon="users" title={<>รวมชื่อเซลล์ <span className="dim">(บัญชีคีย์ข้อมูล → ชื่อจริง)</span></>}
        sub={<>มาร์เก็ตเพลสบันทึกชื่อเป็นบัญชีระบบ (เช่น <code>jirarattukta</code>) — ใส่ชื่อจริงเพื่อให้รายงาน "ยอด/ปิดการขายต่อเซลล์" รวมเป็นคนเดียว ไม่แตกหลายชื่อ</>}
        right={handles && handles.length > 0 ? <Badge variant={named === handles.length ? 'success' : 'secondary'}>ตั้งชื่อแล้ว {N(named)}/{N(handles.length)}</Badge> : null} />
      {handles === null ? <div className="cap" style={{ color: 'var(--ink-4)' }}>กำลังโหลด…</div>
        : handles.length === 0 ? <div className="cap" style={{ color: 'var(--ink-4)' }}>ยังไม่มีชื่อเซลล์ในออเดอร์</div>
          : <>
            {handles.length > 12 && <div className="mb-2 max-w-xs"><SearchInput value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาบัญชี…" className="h-8" /></div>}
            <div className="table-wrap" style={{ maxHeight: 320, overflow: 'auto' }}><Table>
              <TableHeader><TableRow><TableHead>บัญชีในระบบ</TableHead><TableHead style={{ textAlign: 'right' }}>ออเดอร์</TableHead><TableHead>ชื่อจริงที่ใช้รวม</TableHead></TableRow></TableHeader>
              <TableBody>{shown.map(([h, n]) => (
                <TableRow key={h}>
                  <TableCell className="num">{h}</TableCell>
                  <TableCell className="num" style={{ textAlign: 'right', color: 'var(--ink-3)' }}>{N(n)}</TableCell>
                  <TableCell>
                    <div className="relative" style={{ maxWidth: 240 }}>
                      <Input className="h-8 pr-7" value={edits[h] || ''} onChange={e => setEdits(p => ({ ...p, [h]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') saveAll(); }} placeholder="เช่น ฟ้า / ปาย / อุ้ม" />
                      {(edits[h] || '').trim() && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--good)]"><Icon name="check" /></span>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table></div>
            {q.trim() && shown.length === 0 && <div className="cap" style={{ color: 'var(--ink-4)', padding: '8px 2px' }}>ไม่พบบัญชี "{q}"</div>}
            <div className="row" style={{ gap: 10, marginTop: 14, alignItems: 'center' }}>
              <Button onClick={saveAll} disabled={busy}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึกชื่อเซลล์'}</Button>
              {saved && <span className="cap row" style={{ color: 'var(--good)', fontWeight: 600, gap: 4 }}><Icon name="check" /> {saved}</span>}
            </div>
          </>}
    </Card>
  );
}
