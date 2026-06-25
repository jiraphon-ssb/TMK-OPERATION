/* ============================================================
   saleCrm.jsx — CRM ลูกค้า: directory จากตาราง tmk_mp_customers (เร็ว ไม่สแกนออเดอร์ทั้งหมด)
   - รายชื่อ/ยอดสะสม/ตามต่อ มาจากตารางลูกค้าโดยตรง
   - ประวัติการซื้อรายคน โหลดตอนกดเข้าดู (lazy) — เร็ว
   ============================================================ */
import { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { N, Icon, Skel, SkelTable, useDelayedFlag } from './components.jsx';
import { SideSheet } from './modals.jsx';
import { MetricCard } from './charts.jsx';
import { rfmTiers } from './lib/saleAgg.js';
import { cachedFetchAll, CUST_SEL } from './lib/saleData.js';

const baht = (n) => '฿' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayISO = () => new Date().toISOString().slice(0, 10);
const TIER_CHIP = { 'เพชร': 'tier-chip-diamond', 'ทอง': 'tier-chip-gold', 'เงิน': 'tier-chip-silver', 'ทองแดง': 'tier-chip-bronze' };
const initial = (s = '') => (String(s).trim().replace(/^[0-9]+/, '').slice(0, 2) || '?').toUpperCase();

// โหลดลูกค้า — รองรับกรณีตารางยังไม่มีคอลัมน์ last_order (fallback)
async function loadCustomers() {
  let r = await cachedFetchAll('tmk_mp_customers', CUST_SEL + ',last_order');
  if (r.error && /last_order/i.test(r.error.message || '')) r = await cachedFetchAll('tmk_mp_customers', CUST_SEL);
  return r;
}

// directory จากตารางลูกค้า + เซลล์กรอกเอง (ไม่สแกนออเดอร์ — ใช้ยอดสะสมที่เก็บไว้)
function buildDirectory(profiles, entries, asOf) {
  const m = new Map();
  (profiles || []).forEach(p => m.set(p.customer_code, {
    key: p.customer_code, name: p.name || p.customer_code, contact: p.phone || '',
    salesperson: p.owner || '', sales: Number(p.lifetime_sales) || 0, count: Number(p.lifetime_orders) || 0,
    last: p.last_order || '', province: p.province || '', owner: p.owner || '', cadence: p.cadence || '',
    repurchase: p.repurchase || 0, tags: Array.isArray(p.tags) ? p.tags : [], address: p.address || '',
    district: p.district || '', postcode: p.postcode || '', social: p.social_name || '', since: p.since || '',
    ltSales: Number(p.lifetime_sales) || 0, ltOrders: Number(p.lifetime_orders) || 0, ltCancel: Number(p.lifetime_cancel) || 0,
    profile: p, newCount: 0,
  }));
  // ลูกค้าที่เซลล์กรอกเอง (ยังไม่มีโปรไฟล์) — จับด้วยเบอร์/ชื่อ
  (entries || []).forEach(e => {
    const key = (e.customer_contact || e.customer_name || '').trim(); if (!key) return;
    const k = 'se:' + key;
    let r = m.get(k); if (!r) { r = { key: k, name: e.customer_name || key, contact: e.customer_contact || '', salesperson: e.salesperson || '', sales: 0, count: 0, last: '', tags: [], newCount: 0, fromEntry: true }; m.set(k, r); }
    r.sales += Number(e.sales) || 0; r.count += 1;
    if ((e.order_date || '') > r.last) r.last = e.order_date || '';
    if (['ใหม่', 'ลูกค้าใหม่'].includes(e.customer_type)) r.newCount += 1;
  });
  const arr = [...m.values()];
  const { rows: tiered } = rfmTiers(arr.map(r => ({ ...r, orders: r.count })), asOf);
  const tmap = new Map(tiered.map(t => [t.key, t]));
  return arr.map(r => { const t = tmap.get(r.key) || {}; return { ...r, aov: r.count ? r.sales / r.count : 0, recency: t.recency, tier: t.tier, flag: t.flag, repeat: (r.ltOrders || r.count) > 1, hasContact: !!r.contact, queue: !!(r.cadence || r.owner) }; }).sort((a, b) => b.sales - a.sales);
}

/* Skeleton ตรง layout CRM: 4 การ์ดเมตริก + แถบกรอง + ตารางลูกค้า */
function CrmSkeleton() {
  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      <div className="metric-grid">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="card"><Skel w="52%" h={10} /><Skel w="64%" h={24} style={{ marginTop: 11 }} /><Skel w="80%" h={9} style={{ marginTop: 11 }} /></div>)}
      </div>
      <div className="card" style={{ padding: '14px 16px' }}>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{Array.from({ length: 6 }).map((_, i) => <Skel key={i} w={i % 2 ? 84 : 64} h={26} r={8} />)}</div>
          <div className="row" style={{ gap: 6 }}><Skel w={120} h={28} r={8} /><Skel w={180} h={28} r={8} /></div>
        </div>
        <SkelTable cols={7} rows={9} />
      </div>
    </div>
  );
}

export function CrmView() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [preset, setPreset] = useState('all');
  const [owner, setOwner] = useState('');
  const [sel, setSel] = useState(null);

  useEffect(() => { (async () => {
    const [p, e] = await Promise.all([loadCustomers(), cachedFetchAll('tmk_sale_entries', '*')]);
    if (p.error) { setErr(p.error.message); return; }
    setData(buildDirectory(p.data || [], e.error ? [] : (e.data || []), todayISO()));
  })(); }, []);

  const owners = useMemo(() => [...new Set((data || []).map(c => c.owner).filter(Boolean))].sort(), [data]);

  const filtered = useMemo(() => {
    let r = data || [];
    if (preset === 'queue') r = r.filter(c => c.queue);
    else if (preset === 'followup') r = r.filter(c => c.hasContact && (c.newCount > 0 || c.count === 1));
    else if (preset === 'repeat') r = r.filter(c => c.repeat);
    else if (preset === 'risk') r = r.filter(c => c.recency != null && c.recency >= 35 && c.count >= 2);
    else if (preset === 'contact') r = r.filter(c => c.hasContact);
    if (owner) r = r.filter(c => c.owner === owner);
    const ql = q.trim().toLowerCase();
    if (ql) r = r.filter(c => `${c.name} ${c.contact} ${c.salesperson} ${c.province}`.toLowerCase().includes(ql));
    return r;
  }, [data, preset, owner, q]);

  const showSkel = useDelayedFlag(!data, 120); // โผล่หลัง 120ms · อยู่อย่างน้อย 300ms · cache ไว → เด้งทันที
  if (err) return <div className="content-inner"><div className="card" style={{ padding: 20, color: 'var(--bad)' }}>{err}</div></div>;
  if (showSkel) return <CrmSkeleton />;
  if (!data) return null;

  const total = data.length;
  const withContact = data.filter(c => c.hasContact).length;
  const queue = data.filter(c => c.queue).length;
  const risk = data.filter(c => c.recency != null && c.recency >= 35 && c.count >= 2).length;
  const noProfile = !data.some(c => c.profile);

  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      {noProfile && <div className="card" style={{ padding: '12px 14px', background: 'var(--accent-soft)' }}><span className="cap" style={{ color: 'var(--ink-3)' }}>💡 ยังไม่มีเบอร์/โปรไฟล์ลูกค้า — นำเข้าไฟล์ Shipnity ที่หน้า <b>ข้อมูล</b> แล้วเบอร์โทร · ที่อยู่ · สถานะตามต่อจะมาเติมที่นี่</span></div>}
      <div className="metric-grid">
        <MetricCard label="ลูกค้าทั้งหมด" value={N(total)} icon="users" />
        <MetricCard label="มีเบอร์/ติดต่อได้" value={N(withContact)} icon="user" sub={`${total ? Math.round(withContact / total * 100) : 0}% ตามต่อได้`} tone="var(--accent)" />
        <MetricCard label="คิวตามต่อ" value={N(queue)} icon="target" sub="เซลล์ติดสถานะไว้แล้ว" tone="var(--good)" />
        <MetricCard label="เสี่ยงหลุด" value={N(risk)} icon="shield" sub="ขาประจำที่หาย ≥35 วัน" tone="var(--warn)" />
      </div>

      <div className="card" style={{ padding: '14px 16px' }}>
        <div className="card-header" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
            {[['all', 'ทั้งหมด'], ['queue', '🎯 คิวตามต่อ'], ['followup', 'ลูกค้าใหม่มีเบอร์'], ['repeat', 'ซื้อซ้ำ'], ['risk', 'เสี่ยงหลุด'], ['contact', 'มีเบอร์']].map(([id, lb]) => <button key={id} className={'pick' + (preset === id ? ' active' : '')} onClick={() => setPreset(id)}>{lb}</button>)}
          </div>
          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
            {owners.length > 0 && <select className="input input-sm" style={{ width: 120 }} value={owner} onChange={e => setOwner(e.target.value)}><option value="">เซลล์ทุกคน</option>{owners.map(o => <option key={o} value={o}>{o}</option>)}</select>}
            <Icon name="search" /><input className="input input-sm" style={{ width: 180 }} placeholder="ค้นชื่อ/เบอร์/จังหวัด" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 10 }}>แสดง {N(filtered.length)} ราย · คลิกแถวเพื่อดูประวัติ + โทรตามต่อ</div>
        <div className="table-wrap" style={{ maxHeight: 540, overflow: 'auto' }}><table className="table">
          <thead><tr><th>ลูกค้า</th><th>เบอร์/ติดต่อ</th><th>ระดับ</th><th>ตามต่อ</th><th style={{ textAlign: 'right' }}>ยอดซื้อ</th><th style={{ textAlign: 'right' }}>ครั้ง</th><th style={{ textAlign: 'right' }}>ซื้อล่าสุด</th></tr></thead>
          <tbody>{filtered.slice(0, 300).map((c, i) => (
            <tr key={c.key} className={c.flag === 'เสี่ยงหลุด' ? 'crm-row-risk' : c.queue ? 'crm-row-queue' : ''} onClick={() => setSel(c)} style={{ cursor: 'pointer' }}>
              <td>
                <div className="crm-person">
                  <span className={`crm-avatar ${!c.contact ? 'muted' : ''}`}>{initial(c.name)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="crm-name"><span className="num" style={{ color: 'var(--ink-4)', marginRight: 6, fontWeight: 500 }}>{i + 1}</span>{c.name}</div>
                    <div className="cap" style={{ color: 'var(--ink-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.province || c.salesperson || '—'}</div>
                  </div>
                </div>
              </td>
              <td className="cap">{c.contact ? <span className="badge badge-default" style={{ fontSize: 11 }}><Icon name="user" /> {c.contact}</span> : <span className="badge badge-destructive">ไม่มีเบอร์</span>}</td>
              <td>{c.tier && <span className={`tier-chip ${TIER_CHIP[c.tier] || ''}`}>{c.tier}</span>}</td>
              <td className="cap">{c.cadence && <span className="badge badge-outline" style={{ fontSize: 10, color: c.cadence === '0D' ? 'var(--accent)' : 'var(--warn)' }}>{c.cadence}</span>}{c.repurchase > 0 && <span className="badge badge-default" style={{ fontSize: 10, color: 'var(--good)' }}>ซ้ำ×{c.repurchase}</span>}{c.owner && <span className="cap" style={{ color: 'var(--ink-4)', marginLeft: 4 }}>{c.owner}</span>}</td>
              <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{baht(c.sales)}</td>
              <td className="num" style={{ textAlign: 'right' }}>{N(c.count)}</td>
              <td className="num cap" style={{ textAlign: 'right', color: 'var(--ink-3)' }}>{c.last || '—'}{c.recency != null ? ` (${c.recency}ว.)` : ''}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>

      {sel && <CustomerDetail c={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function CustomerDetail({ c, onClose }) {
  const [orders, setOrders] = useState(null);
  useEffect(() => { (async () => {
    if (!c.key || c.key.startsWith('se:')) { setOrders([]); return; }  // เซลล์กรอก: ไม่มีออเดอร์มาร์เก็ตเพลส
    const { data: ods } = await supabase.from('tmk_mp_orders').select('order_no,marketplace_id,channel,sales,qty,order_date,status').eq('customer_code', c.key);
    const act = (ods || []).filter(o => o.status !== 'cancelled');
    const mid2ono = new Map(act.filter(o => o.marketplace_id && o.marketplace_id !== '-').map(o => [o.marketplace_id, o.order_no]));
    const keys = [...act.map(o => o.order_no), ...mid2ono.keys()];
    let skuRows = [];
    if (keys.length) { const { data: sk } = await supabase.from('tmk_mp_skus').select('order_no,design').in('order_no', keys); skuRows = sk || []; }
    const desByOrder = {}; skuRows.forEach(s => { const on = mid2ono.get(s.order_no) || s.order_no; if (s.design) (desByOrder[on] = desByOrder[on] || []).push(s.design); });
    const hist = act.map(o => ({ date: o.order_date, order_no: o.order_no, channel: o.channel, sales: Number(o.sales) || 0, qty: Number(o.qty) || 0, design: [...new Set(desByOrder[o.order_no] || [])].join(', ') })).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    setOrders(hist);
  })(); }, [c.key]);
  const designs = orders ? [...new Set(orders.flatMap(o => o.design ? o.design.split(', ') : []).filter(Boolean))] : [];
  const addr = c.address || (c.province ? `${c.district ? c.district + ' · ' : ''}${c.province} ${c.postcode || ''}` : '');
  return (
    <SideSheet size="lg" icon="user" title={c.name} sub={`${c.tier || ''} · ${baht(c.ltSales || c.sales)} · ${N(c.ltOrders || c.count)} ครั้ง`} onClose={onClose} footer={<button className="btn" onClick={onClose}>ปิด</button>}>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        {c.contact && <a href={`tel:${c.contact}`} className="btn btn-sm btn-primary" style={{ textDecoration: 'none' }}><Icon name="user" /> โทร {c.contact}</a>}
        {c.social && <span className="badge badge-secondary">@{c.social}</span>}
        {c.owner && <span className="badge badge-default" style={{ color: 'var(--good)' }}>เจ้าของ: {c.owner}</span>}
        {!c.owner && c.salesperson && <span className="badge badge-secondary">เซลล์: {c.salesperson}</span>}
        {c.cadence && <span className="badge badge-outline" style={{ color: c.cadence === '0D' ? 'var(--accent)' : 'var(--warn)' }}>ตามต่อ {c.cadence}</span>}
        {c.repurchase > 0 && <span className="badge badge-outline" style={{ color: 'var(--good)' }}>ซื้อซ้ำรอบ {c.repurchase}</span>}
        {c.flag && <span className="badge badge-outline" style={{ color: c.flag === 'เสี่ยงหลุด' ? 'var(--bad)' : 'var(--accent)' }}>{c.flag}</span>}
        {!c.contact && <span className="cap" style={{ color: 'var(--ink-4)' }}>ยังไม่มีเบอร์ — นำเข้าไฟล์ Shipnity เพื่อเติมเบอร์ให้ลูกค้ากลุ่มนี้</span>}
      </div>
      {addr && <div className="cap" style={{ color: 'var(--ink-3)', marginBottom: 14, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 'var(--r-xs)' }}><Icon name="box" /> {addr}</div>}
      <div className="metric-grid" style={{ marginBottom: 14 }}>
        <MetricCard label="ยอดซื้อรวม" value={baht(c.ltSales || c.sales)} tone="var(--accent)" sub={c.ltSales ? 'ยอดสะสม (Shipnity)' : ''} />
        <MetricCard label="จำนวนครั้ง" value={N(c.ltOrders || c.count)} sub={c.repeat ? 'ลูกค้าซื้อซ้ำ' : 'ซื้อครั้งเดียว'} />
        <MetricCard label="เฉลี่ย/ครั้ง" value={baht(c.aov)} />
        <MetricCard label={c.since ? 'เป็นลูกค้าตั้งแต่' : 'ซื้อล่าสุด'} value={c.since || c.last || '—'} sub={c.recency != null ? `ซื้อล่าสุด ${c.recency} วันก่อน` : ''} />
      </div>
      {designs.length > 0 && <div style={{ marginBottom: 14 }}><div className="card-title" style={{ fontSize: 14, marginBottom: 8 }}>ลายที่เคยซื้อ</div><div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{designs.map(d => <span key={d} className="badge badge-outline">{d}</span>)}</div></div>}
      {c.tags && c.tags.length > 0 && <div style={{ marginBottom: 14 }}><div className="card-title" style={{ fontSize: 14, marginBottom: 8 }}>ป้ายลูกค้า (ที่เซลล์ติดไว้)</div><div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{c.tags.map((t, i) => <span key={i} className="badge badge-default" style={{ fontSize: 11 }}>{t}</span>)}</div></div>}
      <div className="card-title" style={{ fontSize: 14, marginBottom: 8 }}>ประวัติการซื้อ {orders ? `(${N(orders.length)})` : ''}</div>
      {orders === null ? <div className="cap" style={{ color: 'var(--ink-4)', padding: 12 }}>กำลังโหลดประวัติ…</div>
        : orders.length === 0 ? <div className="cap" style={{ color: 'var(--ink-4)', padding: 12 }}>ไม่มีประวัติออเดอร์ในระบบ</div>
          : <div className="table-wrap" style={{ maxHeight: 300, overflow: 'auto' }}><table className="table">
            <thead><tr><th>วันที่</th><th>ออเดอร์</th><th>ช่อง</th><th>ลาย</th><th style={{ textAlign: 'right' }}>ยอด</th><th style={{ textAlign: 'right' }}>ตัว</th></tr></thead>
            <tbody>{orders.map((o, i) => <tr key={i}><td className="cap">{o.date}</td><td className="num">{o.order_no}</td><td className="cap">{o.channel}</td><td className="cap">{o.design || '—'}</td><td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{baht(o.sales)}</td><td className="num" style={{ textAlign: 'right' }}>{N(o.qty)}</td></tr>)}</tbody>
          </table></div>}
    </SideSheet>
  );
}
