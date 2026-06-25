/* ============================================================
   saleImportHub.jsx — หน้า "นำเข้า/ส่งออก" (catalog sub = io)
   1) นำเข้าไฟล์มาร์เก็ตเพลส (MpImportModal)  2) ส่งออก
   3) กระทบยอดเซลล์ (อัปโหลดไฟล์เซลล์ → จับคู่ order_no → หา diff/ขาด/ลืม)
   ============================================================ */
import { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { N, Icon } from './components.jsx';
import { MpImportModal } from './modals.jsx';
import { parseSalespersonOrders, parseSalespersonFunnel, reconcile } from './lib/saleRecon.js';
import { cachedFetchAll, clearSaleCache } from './lib/saleData.js';

const fetchAllOrders = () => cachedFetchAll('tmk_mp_orders', 'order_no,marketplace_id,source,channel,salesperson,province,payment_type,customer_type,qty,qty_band,sales,cost,profit,mkt_commission,cod_amount,job_type,order_date,order_month,status,customer_code,customer_name,customer_social,cust_total_spent');
const baht = (n) => '฿' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const csvEsc = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
function downloadCSV(name, head, rows) {
  let csv = head.map(csvEsc).join(',') + '\n';
  rows.forEach(r => { csv += r.map(csvEsc).join(',') + '\n'; });
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

export function ImportExportHub() {
  const [orders, setOrders] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sp, setSp] = useState('');           // ชื่อเซลล์
  const [parsed, setParsed] = useState(null);  // { orders, funnel, fileName }
  const [err, setErr] = useState('');

  useEffect(() => { (async () => { const r = await fetchAllOrders(); if (r.error) setErr(r.error.message); else setOrders(r.data); })(); }, [reloadKey]);

  const onFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    setBusy(true); setErr('');
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const grid = (re) => { const nm = wb.SheetNames.find(s => re.test(s)); return nm ? XLSX.utils.sheet_to_json(wb.Sheets[nm], { header: 1, raw: false, defval: '' }) : null; };
      const dbG = grid(/database|sale.?data|ออเดอร์|รายการ/i) || XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
      const frG = grid(/report|รายงาน|funnel/i);
      const guessSp = sp || file.name.replace(/\.(xlsx|xls|csv)$/i, '').split(/[-–]/).pop().trim();
      const ords = parseSalespersonOrders(dbG, guessSp);
      const funnel = frG ? parseSalespersonFunnel(frG, guessSp) : [];
      if (!ords.length) { setErr('ไม่พบคอลัมน์ออเดอร์ (เลขออเดอร์/จำนวนเงิน) ในไฟล์'); setBusy(false); return; }
      setSp(guessSp); setParsed({ orders: ords, funnel, fileName: file.name });
    } catch (e2) { setErr('อ่านไฟล์ไม่สำเร็จ: ' + (e2?.message || '')); }
    setBusy(false);
  };

  const recon = useMemo(() => {
    if (!parsed || !orders) return null;
    const _dates = parsed.orders.map(o => o.order_date).filter(Boolean).sort();
    const dbMin = orders.map(o => o.order_date).filter(Boolean).sort()[0] || null;
    return reconcile(parsed.orders, orders, { salesperson: sp, from: dbMin });
  }, [parsed, orders, sp]);

  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      {err && <div className="card" style={{ padding: '12px 14px', color: 'var(--bad)' }}>{err}</div>}

      <div className="card" style={{ padding: '14px 18px' }}>
        <div className="row between" style={{ alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div className="card-title">Data workflow <span className="dim">นำเข้า → ตรวจยอด → รวมชื่อ</span></div>
            <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 3 }}>เริ่มจากไฟล์ marketplace, ตรวจความต่างกับไฟล์เซลล์, แล้วจัด mapping ชื่อให้รายงานรวมถูกคน</div>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className="badge badge-outline" style={{ color: 'var(--accent)' }}>1 Import</span>
            <span className="badge badge-outline" style={{ color: 'var(--warn)' }}>2 Reconcile</span>
            <span className="badge badge-outline" style={{ color: 'var(--good)' }}>3 Mapping</span>
          </div>
        </div>
      </div>

      <div className="io-grid" style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 14, alignItems: 'start' }}>
      {/* ===== 1) นำเข้าข้อมูลขาย (การ์ดหลัก) ===== */}
      <div className="card" style={{ padding: '16px 18px' }}>
        <div className="card-title" style={{ marginBottom: 4 }}>นำเข้าข้อมูลขาย <span className="dim">(Shipnity / Shopee / TikTok + แคตตาล็อก)</span></div>
        <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 14 }}>ลากไฟล์มาร์เก็ตเพลสเข้าระบบ — รวม / จับคู่ลาย / <b>เก็บโปรไฟล์ลูกค้า</b> / บันทึก Supabase อัตโนมัติในครั้งเดียว</div>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => setImportOpen(true)}><Icon name="external" /> นำเข้าไฟล์มาร์เก็ตเพลส</button>
          <span className="cap" style={{ color: 'var(--ink-4)', alignSelf: 'center' }}>{orders ? `ในระบบตอนนี้ ${N(orders.length)} ออเดอร์` : 'กำลังโหลด…'}</span>
        </div>
      </div>

      {/* ===== คอลัมน์ขวา: เครื่องมือเสริม ===== */}
      <div className="io-side" style={{ display: 'grid', gap: 14, minWidth: 0 }}>
      {/* ===== 2) กระทบยอดเซลล์ (reconciliation) ===== */}
      <div className="card" style={{ padding: '16px 18px' }}>
        <div className="card-title" style={{ marginBottom: 4 }}>กระทบยอดเซลล์ <span className="dim">(เช็คไฟล์ที่เซลล์กรอก vs ระบบ ว่าตรงไหม)</span></div>
        <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 14 }}>อัปโหลดไฟล์ Excel ของเซลล์ → จับคู่ด้วยเลขออเดอร์ → หาที่ยอด/จำนวนเพี้ยน · ออเดอร์ที่ระบบขาด · ที่เซลล์ลืมกรอก (ไม่บันทึก — ตรวจอย่างเดียว)</div>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
            <Icon name="external" /> {busy ? 'กำลังอ่าน…' : 'อัปโหลดไฟล์เซลล์'}
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onFile} disabled={busy} />
          </label>
          {parsed && <span className="cap" style={{ color: 'var(--ink-3)' }}>{parsed.fileName} · เซลล์ <b>{sp || '—'}</b> · {N(parsed.orders.length)} แถว{parsed.funnel.length ? ` · คนทัก ${N(parsed.funnel.length)} วัน` : ''}</span>}
        </div>

        {recon && (<>
          <div className="metric-grid" style={{ marginTop: 16 }}>
            <div className="metric-card"><div className="cap" style={{ color: 'var(--good)', fontWeight: 700 }}>✓ ตรงกัน</div><div className="num" style={{ fontSize: 22, fontWeight: 700 }}>{N(recon.summary.matched)}</div><div className="cap" style={{ color: 'var(--ink-4)' }}>ยอด+จำนวนตรง</div></div>
            <div className="metric-card" style={{ outline: recon.summary.diff ? '1px solid var(--warn)' : 'none' }}><div className="cap" style={{ color: 'var(--warn)', fontWeight: 700 }}>⚠ เพี้ยน</div><div className="num" style={{ fontSize: 22, fontWeight: 700 }}>{N(recon.summary.diff)}</div><div className="cap" style={{ color: 'var(--ink-4)' }}>ต่างรวม {baht(recon.summary.diffSalesAbs)}</div></div>
            <div className="metric-card" style={{ outline: recon.summary.onlySale ? '1px solid var(--accent)' : 'none' }}><div className="cap" style={{ color: 'var(--accent)', fontWeight: 700 }}>🆕 ระบบขาด</div><div className="num" style={{ fontSize: 22, fontWeight: 700 }}>{N(recon.summary.onlySale)}</div><div className="cap" style={{ color: 'var(--ink-4)' }}>ขายตรง {baht(recon.summary.onlySaleSales)}</div></div>
            <div className="metric-card"><div className="cap" style={{ color: 'var(--ink-3)', fontWeight: 700 }}>❓ เซลล์ลืม</div><div className="num" style={{ fontSize: 22, fontWeight: 700 }}>{N(recon.summary.onlyDb)}</div><div className="cap" style={{ color: 'var(--ink-4)' }}>ระบบมี ไฟล์ไม่มี</div></div>
          </div>

          {recon.diff.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="row between" style={{ marginBottom: 8 }}><div className="card-title" style={{ fontSize: 14 }}>รายการที่เพี้ยน ({N(recon.diff.length)})</div>
                <button className="btn btn-sm" onClick={() => downloadCSV(`recon-diff-${sp}.csv`, ['เลขออเดอร์', 'วันที่', 'ช่องทาง', 'เซลล์(ยอด)', 'ระบบ(ยอด)', 'ต่างยอด', 'เซลล์(ตัว)', 'ระบบ(ตัว)', 'ต่างตัว'], recon.diff.map(d => [d.order_no, d.order_date, d.channel, d.sales, d.db_sales, d.d_sales, d.qty, d.db_qty, d.d_qty]))}><Icon name="external" /> ส่งออก</button>
              </div>
              <div className="table-wrap" style={{ maxHeight: 320, overflow: 'auto' }}><table className="table">
                <thead><tr><th>เลขออเดอร์</th><th>วันที่</th><th>ช่อง</th><th style={{ textAlign: 'right' }}>เซลล์ ฿</th><th style={{ textAlign: 'right' }}>ระบบ ฿</th><th style={{ textAlign: 'right' }}>ต่าง ฿</th><th style={{ textAlign: 'right' }}>เซลล์/ระบบ ตัว</th></tr></thead>
                <tbody>{recon.diff.slice(0, 100).map(d => (
                  <tr key={d.order_no}><td className="num">{d.order_no}</td><td className="cap">{d.order_date}</td><td className="cap">{d.channel}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{baht(d.sales)}</td><td className="num" style={{ textAlign: 'right' }}>{baht(d.db_sales)}</td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 700, color: d.d_sales !== 0 ? 'var(--bad)' : 'var(--ink-4)' }}>{d.d_sales !== 0 ? (d.d_sales > 0 ? '+' : '') + d.d_sales : '—'}</td>
                    <td className="num" style={{ textAlign: 'right', color: d.d_qty !== 0 ? 'var(--bad)' : 'var(--ink-4)' }}>{d.qty}/{d.db_qty}{d.d_qty !== 0 ? ` (${d.d_qty > 0 ? '+' : ''}${d.d_qty})` : ''}</td></tr>
                ))}</tbody>
              </table></div>
            </div>
          )}

          {recon.onlySale.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="row between" style={{ marginBottom: 8 }}>
                <div className="card-title" style={{ fontSize: 14 }}>ออเดอร์ที่ระบบขาด ({N(recon.onlySale.length)}) <span className="dim">= เซลล์ขายตรง ฿{N(recon.summary.onlySaleSales)} ที่ไฟล์มาร์เก็ตเพลสไม่มี</span></div>
                <button className="btn btn-sm" onClick={() => downloadCSV(`recon-missing-${sp}.csv`, ['เลขออเดอร์', 'วันที่', 'งาน', 'ชำระ', 'ลูกค้า', 'ยอด', 'จำนวน', 'หมายเหตุ'], recon.onlySale.map(d => [d.order_no, d.order_date, d.job_type, d.payment_type, d.customer_type, d.sales, d.qty, d.note]))}><Icon name="external" /> ส่งออกทั้งหมด</button>
              </div>
              <div className="cap" style={{ color: 'var(--ink-4)' }}>ตัวอย่าง: {recon.onlySale.slice(0, 8).map(d => `${d.order_no}(${baht(d.sales)})`).join(' · ')}{recon.onlySale.length > 8 ? ' …' : ''}</div>
              <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 6 }}>* ขั้นถัดไปค่อยตัดสินใจว่าจะเพิ่มเข้าระบบในชื่อช่องทาง "เซลล์" ไหม (ตอนนี้ตรวจอย่างเดียว กันนับซ้ำ)</div>
            </div>
          )}
        </>)}
      </div>
      </div>
      </div>

      {/* ===== 3) รวมชื่อเซลล์ (handle → ชื่อจริง) ===== */}
      <div className="card-title" style={{ marginTop: 2 }}>Data mapping <span className="dim">ทำให้ชื่อในรายงานไม่แตกหลายบัญชี</span></div>
      <SalesAliasManager />

      {importOpen && <MpImportModal onClose={() => setImportOpen(false)} onDone={() => { clearSaleCache(); setReloadKey(k => k + 1); }} />}
    </div>
  );
}

// รวมชื่อเซลล์: บัญชีคีย์ข้อมูล (handle) → ชื่อจริงที่ใช้รวมยอด/ปิดการขายต่อเซลล์
function SalesAliasManager() {
  const [handles, setHandles] = useState(null);
  const [edits, setEdits] = useState({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');
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
  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div className="card-title" style={{ marginBottom: 4 }}>รวมชื่อเซลล์ <span className="dim">(บัญชีคีย์ข้อมูล → ชื่อจริง)</span></div>
      <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 14 }}>มาร์เก็ตเพลสบันทึกชื่อเป็นบัญชีระบบ (เช่น <code>jirarattukta</code>) — ใส่ชื่อจริงเพื่อให้รายงาน "ยอด/ปิดการขายต่อเซลล์" รวมเป็นคนเดียว ไม่แตกหลายชื่อ</div>
      {handles === null ? <div className="cap" style={{ color: 'var(--ink-4)' }}>กำลังโหลด…</div>
        : handles.length === 0 ? <div className="cap" style={{ color: 'var(--ink-4)' }}>ยังไม่มีชื่อเซลล์ในออเดอร์</div>
          : <>
            <div className="table-wrap" style={{ maxHeight: 320, overflow: 'auto' }}><table className="table">
              <thead><tr><th>บัญชีในระบบ</th><th style={{ textAlign: 'right' }}>ออเดอร์</th><th>ชื่อจริงที่ใช้รวม</th></tr></thead>
              <tbody>{handles.map(([h, n]) => (
                <tr key={h}>
                  <td className="num">{h}</td>
                  <td className="num" style={{ textAlign: 'right', color: 'var(--ink-3)' }}>{N(n)}</td>
                  <td><input className="input input-sm" style={{ maxWidth: 220 }} value={edits[h] || ''} onChange={e => setEdits(p => ({ ...p, [h]: e.target.value }))} placeholder="เช่น ฟ้า / ปาย / อุ้ม" /></td>
                </tr>
              ))}</tbody>
            </table></div>
            <div className="row" style={{ gap: 10, marginTop: 14, alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={saveAll} disabled={busy}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึกชื่อเซลล์'}</button>
              {saved && <span className="cap" style={{ color: 'var(--good)', fontWeight: 600 }}>✓ {saved}</span>}
            </div>
          </>}
    </div>
  );
}
