/* ============================================================
   saleCatalog.jsx — แคตตาล็อกเสื้อ (Sale → แคตตาล็อกเสื้อ) → tmk_shirt_catalog
   เพิ่ม/แก้/ลบได้ทุกฟิลด์ · ไม่ต้องแนบไฟล์ (รูป optional) · สลับการ์ด/ตาราง
   ============================================================ */
import { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { N, Icon, Skel, SkelTable, useDelayedFlag, readImageCompressed } from './components.jsx';
import { Modal, SideSheet } from './modals.jsx';
import { logAudit } from './lib/audit.js';
import { GOLDEN_DESIGNS, COLOR_TH2CODE } from './lib/shirtCatalog.js';

const baht = (n) => '฿' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toast = (m, t) => window.__toast && window.__toast(m, t);
const uid = () => 'sc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const TYPES = ['เสื้อโปโล', 'เสื้อกล้าม', 'กระเป๋า', 'กล่องสุ่ม', 'ถุงเท้า', 'ของแถม/โปร', 'อื่นๆ'];
const STATUSES = ['พร้อมขาย', 'พรีออเดอร์', 'หมด', 'เลิกผลิต'];
const statusTone = (s) => ({ 'พร้อมขาย': 'var(--good)', 'พรีออเดอร์': 'var(--accent)', 'หมด': 'var(--bad)', 'เลิกผลิต': 'var(--ink-4)' }[s] || 'var(--ink-3)');
const blank = () => ({ code: '', name: '', type: 'เสื้อโปโล', price: '', price_wholesale: '', cost: '', colors: '', sizes: '', status: 'พร้อมขาย', image: '', note: '', variants: {} });
// variants อาจมาเป็น object (jsonb) หรือ string → คืน object เสมอ
const parseVariants = (v) => { if (!v) return {}; if (typeof v === 'object') return v; try { return JSON.parse(v) || {}; } catch { return {}; } };
// แปลง row จาก DB → form (numeric เป็น string ในช่องกรอก)
const toForm = (it) => ({ ...blank(), ...it, price: it.price ?? '', price_wholesale: it.price_wholesale ?? '', cost: it.cost ?? '', variants: parseVariants(it.variants) });

// พาเลตสี/ไซซ์มาตรฐาน + ตัวช่วยแก้ไขแบบชิป
const COLOR_HEX = { 'ขาว':'#ffffff','ดำ':'#1a1a1a','กรม':'#1f2d50','กรมท่า':'#1f2d50','ฟ้า':'#4a8be0','น้ำเงิน':'#1f3aa0','เขียว':'#2f9e6e','เหลือง':'#e8c23b','แดง':'#c0392b','ชมพู':'#e06aa0','ม่วง':'#6b5ce0','ส้ม':'#e0772f','โอรส':'#e0772f','ครีม':'#efe7d2' };
const STD_COLORS = Object.keys(COLOR_TH2CODE);
const STD_SIZES = ['XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL','7XL'];
const splitList = (s) => (s || '').split(',').map(x => x.trim()).filter(Boolean);
const sizeRank = (s) => { const i = STD_SIZES.indexOf(s); return i < 0 ? 99 : i; };
const qualityBadges = (it) => {
  const out = [];
  if (!it.image) out.push(['warn', 'ไม่มีรูป']);
  if (!(Number(it.price) > 0)) out.push(['warn', 'ยังไม่ตั้งราคา']);
  if (!splitList(it.colors).length) out.push(['warn', 'ไม่มีสี']);
  if (!splitList(it.sizes).length) out.push(['warn', 'ไม่มีไซซ์']);
  if (!out.length) out.push(['good', 'ข้อมูลครบ']);
  return out;
};
function CatalogThumb({ item, small = false }) {
  if (item?.image) return <img src={item.image} alt={item.name || ''} style={small ? { width: 34, height: 34, borderRadius: 'var(--r-xs)', objectFit: 'cover', display: 'block' } : undefined} />;
  if (small) return <span className="catalog-thumb-ph sm"><Icon name="bag" /></span>;
  return (
    <>
      <div className="catalog-pattern" />
      <div className="catalog-thumb-code">
        <b>{item?.code || 'TMK'}</b>
        <span className="cap">{item?.type || 'Catalog'}</span>
      </div>
    </>
  );
}

/* ---------- Skeleton ---------- */
function CatalogSkeleton({ view }) {
  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      <div className="card">
        <div className="row between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10 }}><Skel w={200} h={16} /><div className="row" style={{ gap: 8 }}><Skel w={70} h={30} r={8} /><Skel w={110} h={30} r={8} /></div></div>
        <Skel w="100%" h={34} r={9} style={{ marginBottom: 12 }} />
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{Array.from({ length: 8 }).map((_, i) => <Skel key={i} w={i % 2 ? 78 : 56} h={26} r={8} />)}</div>
      </div>
      {view === 'table'
        ? <div className="card"><SkelTable cols={8} rows={9} /></div>
        : <div className="catalog-grid">{Array.from({ length: 10 }).map((_, i) => <div key={i} className="card" style={{ padding: 0, overflow: 'hidden' }}><Skel w="100%" h={150} r={0} /><div style={{ padding: 12 }}><Skel w="40%" h={9} /><Skel w="80%" h={14} style={{ marginTop: 8 }} /><Skel w="55%" h={11} style={{ marginTop: 10 }} /></div></div>)}</div>}
    </div>
  );
}

export function ShirtCatalogView() {
  const [items, setItems] = useState(null);
  const [noTable, setNoTable] = useState(false);
  const [err, setErr] = useState('');
  const [view, setView] = useState(() => localStorage.getItem('tmk_catalog_view') || 'card');
  const [q, setQ] = useState('');
  const [fType, setFType] = useState('all');
  const [fStatus, setFStatus] = useState('all');
  const [edit, setEdit] = useState(null);      // form object หรือ null
  const [busy, setBusy] = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const [importing, setImporting] = useState(false);
  const [askImport, setAskImport] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.from('tmk_shirt_catalog').select('*').order('updated_at', { ascending: false }).limit(3000);
    if (error) {
      if (/relation|does not exist|tmk_shirt_catalog/i.test(error.message)) setNoTable(true);
      else setErr(error.message);
      setItems([]); return;
    }
    setNoTable(false); setItems(data || []);
  };
  useEffect(() => { load(); }, []);

  const setViewP = (v) => { setView(v); try { localStorage.setItem('tmk_catalog_view', v); } catch {/* noop */} };

  const types = useMemo(() => { const s = new Set(); (items || []).forEach(i => { if (i.type) s.add(i.type); }); return [...s].sort(); }, [items]);
  const filtered = useMemo(() => {
    let r = items || [];
    if (fType !== 'all') r = r.filter(i => (i.type || '') === fType);
    if (fStatus !== 'all') r = r.filter(i => (i.status || 'พร้อมขาย') === fStatus);
    const ql = q.trim().toLowerCase();
    if (ql) r = r.filter(i => `${i.code} ${i.name} ${i.type} ${i.colors} ${i.note}`.toLowerCase().includes(ql));
    return r;
  }, [items, fType, fStatus, q]);

  const save = async () => {
    if (!edit) return;
    if (!edit.code.trim() && !edit.name.trim()) { toast('ใส่รหัสหรือชื่อลายอย่างน้อย 1 อย่าง', 'error'); return; }
    setBusy(true);
    const row = {
      id: edit.id || uid(),
      code: edit.code.trim(), name: edit.name.trim(), type: edit.type || '',
      price: Number(edit.price) || 0, price_wholesale: Number(edit.price_wholesale) || 0, cost: Number(edit.cost) || 0,
      colors: (edit.colors || '').trim(), sizes: (edit.sizes || '').trim(), status: edit.status || 'พร้อมขาย',
      image: edit.image || '', note: (edit.note || '').trim(), variants: edit.variants || {}, updated_at: new Date().toISOString(),
    };
    let { error } = await supabase.from('tmk_shirt_catalog').upsert(row, { onConflict: 'id' });
    // ยังไม่ได้รัน migration variants → บันทึกส่วนอื่นได้ แต่รหัสรายตัวยังไม่เก็บ
    if (error && /variants/i.test(error.message)) {
      const { variants: _variants, ...row2 } = row;
      ({ error } = await supabase.from('tmk_shirt_catalog').upsert(row2, { onConflict: 'id' }));
      if (!error) { setBusy(false); toast('บันทึกแล้ว — แต่รหัสที่แก้รายตัวยังไม่เก็บ (รัน migration variants ก่อน)', 'info'); setEdit(null); load(); return; }
    }
    setBusy(false);
    if (error) { toast(noTable ? 'ต้องรัน migration tmk_shirt_catalog ก่อน' : 'บันทึกไม่สำเร็จ: ' + error.message, 'error'); return; }
    toast(edit.id ? 'แก้ไขแล้ว' : 'เพิ่มเสื้อแล้ว', 'success');
    logAudit({ action: edit.id ? 'update' : 'create', entityType: 'data', entityName: 'catalog', summary: `${edit.id ? 'แก้ไข' : 'เพิ่ม'}แคตตาล็อก ${row.code || row.name}` });
    setEdit(null); load();
  };

  const del = async () => {
    if (!delTarget) return;
    const { error } = await supabase.from('tmk_shirt_catalog').delete().eq('id', delTarget.id);
    if (error) { toast('ลบไม่สำเร็จ', 'error'); return; }
    toast('ลบแล้ว', 'success');
    logAudit({ action: 'delete', entityType: 'data', entityName: 'catalog', summary: `ลบแคตตาล็อก ${delTarget.code || delTarget.name}` });
    setDelTarget(null); setEdit(null); load();
  };

  // นำเข้า 47 ลายจากตารางลายเสื้อ (golden) — พร้อมรหัส/หมวด/ราคา/สี/ไซซ์ · ข้ามลายที่มีแล้ว
  const importLegacy = async () => {
    setAskImport(false); setImporting(true);
    const existing = new Set((items || []).map(i => (i.name || '').trim().toLowerCase()));
    const rows = GOLDEN_DESIGNS
      .filter(d => !existing.has((d.name || '').trim().toLowerCase()))
      .map(d => ({ id: uid(), code: d.code || '', name: d.name || '', type: d.type || '', price: d.price || 0, price_wholesale: 0, cost: 0, colors: (d.colors || []).join(', '), sizes: (d.sizes || []).join(', '), status: 'พร้อมขาย', image: '', note: '', updated_at: new Date().toISOString() }));
    if (!rows.length) { setImporting(false); toast('มีครบแล้ว ไม่มีลายใหม่ให้นำเข้า', 'info'); return; }
    let ok = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await supabase.from('tmk_shirt_catalog').insert(chunk);
      if (error) { toast(noTable ? 'ต้องรัน migration tmk_shirt_catalog ก่อน' : 'นำเข้าไม่สำเร็จ: ' + error.message, 'error'); setImporting(false); return; }
      ok += chunk.length;
    }
    setImporting(false); toast(`นำเข้า ${ok} ลายแล้ว — แก้ไขเติมรูป/ราคาได้เลย`, 'success');
    logAudit({ action: 'create', entityType: 'data', entityName: 'catalog', summary: `นำเข้าลายเสื้อจากตาราง ${ok} ลาย` });
    load();
  };

  const onImage = async (file) => {
    if (!file) return;
    try { const url = await readImageCompressed(file, 640, 0.82); setEdit(e => ({ ...e, image: url })); }
    catch (e) { toast(e.message || 'อ่านรูปไม่ได้', 'error'); }
  };

  const showSkel = useDelayedFlag(items === null, 120);
  if (err) return <div className="content-inner"><div className="card" style={{ padding: 20, color: 'var(--bad)' }}>{err}</div></div>;
  if (showSkel) return <CatalogSkeleton view={view} />;
  if (items === null) return null;

  const empty = items.length === 0;

  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      {noTable && <div className="card" style={{ padding: '12px 14px', color: 'var(--warn)', borderLeft: '3px solid var(--warn)' }}>⚠️ ยังไม่ได้สร้างตาราง <code>tmk_shirt_catalog</code> — รัน <code>supabase/migrations/20260624-shirt-catalog.sql</code> ใน Supabase ก่อนจึงจะเพิ่ม/บันทึกได้</div>}

      <div className="card">
        <div className="row between" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div className="card-head" style={{ margin: 0 }}>
            <h3><span style={{ color: 'var(--accent)' }}><Icon name="bag" /></span> แคตตาล็อกเสื้อ</h3>
            <span className="cap"><b style={{ color: 'var(--ink)' }}>{N(filtered.length)}</b> รายการ{filtered.length !== items.length ? ` / ${N(items.length)}` : ''}</span>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div className="tabs-list" style={{ margin: 0 }}>
              <button className={'tabs-trigger' + (view === 'card' ? ' active' : '')} onClick={() => setViewP('card')} title="การ์ดรูป"><Icon name="grid" /></button>
              <button className={'tabs-trigger' + (view === 'table' ? ' active' : '')} onClick={() => setViewP('table')} title="ตาราง"><Icon name="list" /></button>
            </div>
            <button className="btn btn-sm" onClick={() => setAskImport(true)} disabled={importing}><Icon name="external" /> {importing ? 'กำลังนำเข้า…' : 'นำเข้าลายเสื้อ (47 ลาย)'}</button>
            <button className="btn btn-sm btn-primary" onClick={() => setEdit(blank())}><Icon name="plus" /> เพิ่มเสื้อ</button>
          </div>
        </div>

        <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 ค้นหา รหัส / ชื่อลาย / หมวด / สี" style={{ marginBottom: 10 }} />
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <div className="chips-pick">
            <button className={'pick' + (fType === 'all' ? ' on' : '')} onClick={() => setFType('all')}>ทุกหมวด</button>
            {types.map(t => <button key={t} className={'pick' + (fType === t ? ' on' : '')} onClick={() => setFType(t)}>{t}</button>)}
          </div>
          <div className="chips-pick">
            <button className={'pick' + (fStatus === 'all' ? ' on' : '')} onClick={() => setFStatus('all')}>ทุกสถานะ</button>
            {STATUSES.map(s => <button key={s} className={'pick' + (fStatus === s ? ' on' : '')} onClick={() => setFStatus(s)}>{s}</button>)}
          </div>
        </div>
      </div>

      {empty ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ color: 'var(--ink-4)', marginBottom: 16 }}>ยังไม่มีเสื้อในแคตตาล็อก — เพิ่มเองหรือดึง 47 ลายจากตารางลายเสื้อมาใส่ก่อนก็ได้ (พร้อมสี/ไซซ์/ราคา)</div>
          <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
            <button className="btn" onClick={() => setAskImport(true)} disabled={importing}><Icon name="external" /> นำเข้าลายเสื้อ (47 ลาย)</button>
            <button className="btn btn-primary" onClick={() => setEdit(blank())}><Icon name="plus" /> เพิ่มเสื้อ</button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--ink-4)' }}>ไม่พบรายการที่ค้น</div>
      ) : view === 'card' ? (
        <div className="catalog-grid">
          {filtered.map(it => (
            <div key={it.id} className="card catalog-card" onClick={() => setEdit(toForm(it))} style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}>
              <div className="catalog-thumb"><CatalogThumb item={it} /></div>
              <div style={{ padding: '10px 12px' }}>
                <div className="row between" style={{ gap: 6 }}>
                  <span className="cap" style={{ color: 'var(--ink-4)' }}>{it.code || '—'}</span>
                  <span className="badge badge-outline" style={{ fontSize: 10, color: statusTone(it.status), fontWeight: 700 }}>{it.status || 'พร้อมขาย'}</span>
                </div>
                <div style={{ fontWeight: 700, margin: '4px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name || '(ไม่มีชื่อ)'}</div>
                <div className="cap" style={{ color: 'var(--ink-3)' }}>{it.type || '—'}</div>
                <div className="row between" style={{ marginTop: 8, alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{baht(it.price)}</span>
                  {Number(it.price_wholesale) > 0 && <span className="cap" style={{ color: 'var(--ink-4)' }}>ส่ง {baht(it.price_wholesale)}</span>}
                </div>
                {it.colors && <div className="catalog-color-swatches">{splitList(it.colors).slice(0, 8).map(c => <span key={c} className="catalog-color-dot" style={{ background: COLOR_HEX[c] || '#bbb' }} title={c} />)}</div>}
                {it.sizes && <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.sizes}</div>}
                <div className="quality-row">{qualityBadges(it).slice(0, 2).map(([tone, label]) => <span key={label} className={`quality-badge ${tone}`}>{label}</span>)}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap"><table className="table">
            <thead><tr><th></th><th>รหัส</th><th>ชื่อลาย</th><th>หมวด</th><th style={{ textAlign: 'right' }}>ปลีก</th><th style={{ textAlign: 'right' }}>ส่ง</th><th>สี</th><th>ไซซ์</th><th>สถานะ</th><th></th></tr></thead>
            <tbody>{filtered.map(it => (
              <tr key={it.id} onClick={() => setEdit(toForm(it))} style={{ cursor: 'pointer' }}>
                <td><CatalogThumb item={it} small /></td>
                <td className="cap">{it.code || '—'}</td>
                <td style={{ fontWeight: 600 }}>{it.name || '—'}</td>
                <td className="cap">{it.type || '—'}</td>
                <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{baht(it.price)}</td>
                <td className="num cap" style={{ textAlign: 'right' }}>{Number(it.price_wholesale) > 0 ? baht(it.price_wholesale) : '—'}</td>
                <td className="cap">{it.colors || '—'}</td>
                <td className="cap">{it.sizes || '—'}</td>
                <td><div className="row" style={{ gap: 5, flexWrap: 'wrap' }}><span className="badge badge-outline" style={{ fontSize: 10, color: statusTone(it.status), fontWeight: 700 }}>{it.status || 'พร้อมขาย'}</span>{qualityBadges(it).slice(0, 1).map(([tone, label]) => <span key={label} className={`quality-badge ${tone}`}>{label}</span>)}</div></td>
                <td><button className="btn btn-sm" onClick={e => { e.stopPropagation(); setDelTarget(it); }} title="ลบ"><Icon name="trash" /></button></td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      {/* ---------- เพิ่ม/แก้ไข ---------- */}
      {edit && (
        <SideSheet size="lg" icon="bag" title={edit.id ? 'แก้ไขเสื้อ' : 'เพิ่มเสื้อ'} sub="แก้ไขได้ทุกฟิลด์ · รูปใส่หรือไม่ใส่ก็ได้" onClose={() => setEdit(null)}
          footer={<div className="row between" style={{ width: '100%' }}>
            {edit.id ? <button className="btn btn-sm" style={{ color: 'var(--bad)' }} onClick={() => { setDelTarget(edit); setEdit(null); }}><Icon name="trash" /> ลบ</button> : <span />}
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" onClick={() => setEdit(null)}>ยกเลิก</button>
              <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
            </div>
          </div>}>
          <div style={{ display: 'grid', gap: 12 }}>
            {/* รูป (ไม่บังคับ) */}
            <div className="row" style={{ gap: 12, alignItems: 'center' }}>
              <div className="catalog-thumb" style={{ width: 88, height: 88, borderRadius: 'var(--r-sm)', flex: 'none' }}>
                {edit.image ? <img src={edit.image} alt="" /> : <span className="catalog-thumb-ph"><Icon name="image" /></span>}
              </div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <label className="btn btn-sm" style={{ cursor: 'pointer' }}><Icon name="image" /> {edit.image ? 'เปลี่ยนรูป' : 'ใส่รูป (ไม่บังคับ)'}<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => onImage(e.target.files?.[0])} /></label>
                {edit.image && <button className="btn btn-sm" onClick={() => setEdit(e => ({ ...e, image: '' }))}><Icon name="x" /> ลบรูป</button>}
              </div>
            </div>
            <div className="form-grid2">
              <label className="fld"><span>รหัสสินค้า</span><input className="input" value={edit.code} onChange={e => setEdit({ ...edit, code: e.target.value })} placeholder="เช่น JKN111" /></label>
              <label className="fld"><span>ชื่อลาย / ชื่อเสื้อ</span><input className="input" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="เช่น กนกประยุกต์" /></label>
              <label className="fld"><span>หมวด</span>
                <input className="input" list="catalog-types" value={edit.type} onChange={e => setEdit({ ...edit, type: e.target.value })} placeholder="เช่น เสื้อโปโล" />
                <datalist id="catalog-types">{[...new Set([...TYPES, ...types])].map(t => <option key={t} value={t} />)}</datalist>
              </label>
              <label className="fld"><span>สถานะ</span>
                <select className="input" value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value })}>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select>
              </label>
              <label className="fld"><span>ราคาปลีก (฿)</span><input className="input" type="number" inputMode="decimal" value={edit.price} onChange={e => setEdit({ ...edit, price: e.target.value })} placeholder="0" /></label>
              <label className="fld"><span>ราคาส่ง (฿)</span><input className="input" type="number" inputMode="decimal" value={edit.price_wholesale} onChange={e => setEdit({ ...edit, price_wholesale: e.target.value })} placeholder="0" /></label>
              <label className="fld"><span>ต้นทุน (฿)</span><input className="input" type="number" inputMode="decimal" value={edit.cost} onChange={e => setEdit({ ...edit, cost: e.target.value })} placeholder="0" /></label>
            </div>

            {/* สีที่มี — ชิปแก้รายสี + พาเลตกดเพิ่ม */}
            {(() => {
              const colorList = splitList(edit.colors);
              const setColors = (arr) => setEdit({ ...edit, colors: [...new Set(arr)].join(', ') });
              return (
                <div className="fld">
                  <span>สีที่มี ({colorList.length}) — กดเพิ่ม/ลบได้</span>
                  {colorList.length > 0 && <div className="chip-edit">{colorList.map(c => (
                    <span key={c} className="chip-tag"><span className="sw" style={{ background: COLOR_HEX[c] || '#bbb' }} />{c}<button type="button" onClick={() => setColors(colorList.filter(x => x !== c))}>×</button></span>
                  ))}</div>}
                  <div className="chip-add">
                    {STD_COLORS.filter(c => !colorList.includes(c)).map(c => <button type="button" key={c} className="pick" onClick={() => setColors([...colorList, c])}><span className="sw" style={{ background: COLOR_HEX[c] }} />{c}</button>)}
                    <input className="input" style={{ width: 110, height: 28 }} placeholder="+ สีอื่น ↵" onKeyDown={e => { const v = e.target.value.trim(); if (e.key === 'Enter' && v) { e.preventDefault(); setColors([...colorList, v]); e.target.value = ''; } }} />
                  </div>
                </div>
              );
            })()}

            {/* ไซซ์ที่มี — toggle */}
            {(() => {
              const sizeList = splitList(edit.sizes);
              const setSizes = (arr) => setEdit({ ...edit, sizes: [...new Set(arr)].sort((a, b) => sizeRank(a) - sizeRank(b)).join(', ') });
              return (
                <div className="fld">
                  <span>ไซซ์ที่มี ({sizeList.length}) — กดเลือก</span>
                  <div className="chip-add">
                    {STD_SIZES.map(s => { const on = sizeList.includes(s); return <button type="button" key={s} className={'pick' + (on ? ' on' : '')} onClick={() => setSizes(on ? sizeList.filter(x => x !== s) : [...sizeList, s])}>{s}</button>; })}
                    <input className="input" style={{ width: 90, height: 28 }} placeholder="+ อื่น ↵" onKeyDown={e => { const v = e.target.value.trim().toUpperCase(); if (e.key === 'Enter' && v) { e.preventDefault(); setSizes([...sizeList, v]); e.target.value = ''; } }} />
                  </div>
                </div>
              );
            })()}

            {/* ตารางรหัสสินค้าครบทุกแบบ (สี × ไซซ์) — แก้รหัสรายตัวได้ · ตัวที่ไม่แก้ตามสูตร base-โค้ดสี-ไซซ์ */}
            {(() => {
              const cs = splitList(edit.colors), ss = splitList(edit.sizes), base = (edit.code || '').trim();
              if (!base) return <div className="cap" style={{ color: 'var(--ink-4)' }}>ใส่ <b>รหัสสินค้า</b> ด้านบน เพื่อสร้างรหัสรายสี/ไซซ์อัตโนมัติ</div>;
              const cols = cs.length ? cs : [null], szs = ss.length ? ss : [null];
              const vmap = edit.variants || {};
              const vkey = (c, s) => `${c || ''}|${s || ''}`;
              const formula = (c, s) => [base, c ? (COLOR_TH2CODE[c] || c) : null, s].filter(Boolean).join('-');
              const codeOf = (c, s) => { const o = vmap[vkey(c, s)]; return (o != null && o !== '') ? o : formula(c, s); };
              const setCode = (c, s, val) => { const k = vkey(c, s), v = { ...vmap }, def = formula(c, s); const t = val.trim(); if (!t || t === def) delete v[k]; else v[k] = t; setEdit({ ...edit, variants: v }); };
              const resetAll = () => setEdit({ ...edit, variants: {} });
              const overrideN = Object.keys(vmap).length;
              const all = []; cols.forEach(c => szs.forEach(s => all.push(codeOf(c, s))));
              return (
                <div className="fld">
                  <div className="row between" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <span>รหัสสินค้าทั้งหมด ({all.length} แบบ){overrideN ? <span className="cap" style={{ color: 'var(--accent)' }}> · แก้เอง {overrideN}</span> : ''}</span>
                    <div className="row" style={{ gap: 6 }}>
                      {overrideN > 0 && <button type="button" className="btn btn-sm" onClick={resetAll} title="คืนทุกรหัสเป็นสูตร"><Icon name="refresh" /> รีเซ็ตสูตร</button>}
                      <button type="button" className="btn btn-sm" onClick={() => { try { navigator.clipboard.writeText(all.join('\n')); toast(`คัดลอก ${all.length} รหัสแล้ว`, 'success'); } catch { toast('คัดลอกไม่ได้', 'error'); } }}><Icon name="external" /> คัดลอก</button>
                    </div>
                  </div>
                  <div className="cap" style={{ color: 'var(--ink-4)' }}>แก้รหัสในช่องได้เลย — ตัวที่แก้จะมีกรอบสี ตัวที่ไม่แก้ปรับตามรหัส/สี/ไซซ์ให้อัตโนมัติ</div>
                  <div className="sku-table-wrap">
                    <table className="table sku-table"><tbody>
                      {cols.map(c => (
                        <tr key={c || '_'}>
                          <td className="sku-color">{c ? <><span className="sw" style={{ background: COLOR_HEX[c] || '#bbb' }} />{c} <span className="cap" style={{ color: 'var(--ink-4)' }}>{COLOR_TH2CODE[c] || '?'}</span></> : <span className="cap" style={{ color: 'var(--ink-4)' }}>ไม่ระบุสี</span>}</td>
                          <td><div className="sku-codes">{szs.map(s => { const ov = vmap[vkey(c, s)] != null && vmap[vkey(c, s)] !== ''; return <input key={s || '_'} className={'sku-input' + (ov ? ' edited' : '')} value={codeOf(c, s)} title={s ? `ไซซ์ ${s}` : ''} onChange={e => setCode(c, s, e.target.value)} />; })}</div></td>
                        </tr>
                      ))}
                    </tbody></table>
                  </div>
                </div>
              );
            })()}

            <label className="fld"><span>รายละเอียด / โน้ต</span><textarea className="input" rows={3} value={edit.note} onChange={e => setEdit({ ...edit, note: e.target.value })} placeholder="เนื้อผ้า / รายละเอียดเพิ่มเติม" /></label>
            {Number(edit.cost) > 0 && Number(edit.price) > 0 && <div className="cap" style={{ color: 'var(--ink-4)' }}>กำไรปลีก ≈ {baht(Number(edit.price) - Number(edit.cost))} ({Math.round((1 - Number(edit.cost) / Number(edit.price)) * 100)}%)</div>}
          </div>
        </SideSheet>
      )}

      {/* ---------- ยืนยันลบ ---------- */}
      {delTarget && (
        <Modal icon="trash" title="ลบเสื้อออกจากแคตตาล็อก?" onClose={() => setDelTarget(null)}
          footer={<div className="row" style={{ gap: 8, marginLeft: 'auto' }}><button className="btn" onClick={() => setDelTarget(null)}>ยกเลิก</button><button className="btn btn-primary" style={{ background: 'var(--bad)', borderColor: 'var(--bad)' }} onClick={del}>ลบ</button></div>}>
          <div>ลบ "<b>{delTarget.name || delTarget.code || 'รายการนี้'}</b>" ออกจากแคตตาล็อก? — ย้อนกลับไม่ได้</div>
        </Modal>
      )}

      {/* ---------- ยืนยันนำเข้า 47 ลาย ---------- */}
      {askImport && (
        <Modal icon="external" title="นำเข้าลายเสื้อ 47 ลาย?" onClose={() => setAskImport(false)}
          footer={<div className="row" style={{ gap: 8, marginLeft: 'auto' }}><button className="btn" onClick={() => setAskImport(false)}>ยกเลิก</button><button className="btn btn-primary" onClick={importLegacy}>นำเข้าเลย</button></div>}>
          <div>ดึง 47 ลายจากตารางลายเสื้อ (รหัส · ชื่อลาย · หมวด · ราคา · สีที่มี · ไซซ์ที่มี) มาใส่ <b>ข้ามลายที่มีอยู่แล้ว</b> — จากนั้นเติมรูป/ราคาที่ว่างได้เลย</div>
        </Modal>
      )}
    </div>
  );
}
