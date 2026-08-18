import { useState, useEffect, useRef } from 'react';
import { B, N, Icon, readImageCompressed, SIZES, SHIRT_COLORS, lotTotal as calcLotTotal, lotValue as calcLotValue } from './components.jsx';
import { DatePicker } from '@/components/ui/date-picker';
import { supabase } from './lib/supabaseClient.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import { logAudit } from './lib/audit.js';
import { Modal, toast, nn, guardClose, uid, deleteRow, MD } from './modals-core.jsx';
import { refresh } from './lib/appBus.js';

const newLot = (proto) => ({
  id: uid('lot'), lotNo: '', date: '', cost: proto?.cost ?? '', note: '',
  sizes: proto ? [...proto.sizes] : ['S', 'M', 'L', 'XL'],
  colors: proto ? proto.colors.map(c => ({ id: uid('clr'), name: c.name, hex: c.hex })) : [],
  grid: {}, // คัดลอกโครงสร้าง = ลอกสี+ไซส์ แต่จำนวนเริ่มว่าง
});
// normalize ล็อตที่โหลดมา → กัน legacy/พัง (ให้มี sizes/colors/grid เสมอ)
const normLot = (l) => ({
  id: l.id || uid('lot'), lotNo: l.lotNo || '', date: l.date || '', cost: l.cost ?? '', note: l.note || '',
  sizes: Array.isArray(l.sizes) ? SIZES.filter(s => l.sizes.includes(s)) : [],
  colors: Array.isArray(l.colors) ? l.colors.map(c => ({ id: c.id || uid('clr'), name: c.name || '', hex: c.hex || '#cccccc' })) : [],
  grid: (l.grid && typeof l.grid === 'object' && !Array.isArray(l.grid)) ? l.grid : {},
});
// จำนวนช่อง grid (สำหรับ input ในตาราง — string ว่างเมื่อ 0)
const cellQty = (l, cid, s) => { const v = l.grid?.[cid]?.[s]; return v ? String(v) : ''; };
const rowSum = (l, cid) => l.sizes.reduce((a, s) => a + (Number(l.grid?.[cid]?.[s]) || 0), 0);
const colSum = (l, s) => l.colors.reduce((a, c) => a + (Number(l.grid?.[c.id]?.[s]) || 0), 0);

export function ProductModal({ data, onClose }) {
  const [f, setF] = useState(data
    ? { ...data, image: data.image || '', category: data.category || '', supplier: data.supplier || '', sku: data.sku || '', barcode: data.barcode || '', lots: Array.isArray(data.lots) ? data.lots.map(normLot) : [] }
    : { name: '', price: '', units: '', onHand: '', reorder: '', strategy: '', image: '', category: '', supplier: '', sku: '', barcode: '', lots: [] });
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [open, setOpen] = useState({}); // ล็อตไหนกางอยู่ (key = lot id)
  const imgRef = useRef(null);
  const set = (k, v) => { setTouched(true); setF(p => ({ ...p, [k]: v })); };

  // baseline updated_at (สินค้าเดิม) → optimistic-lock กัน save ทับ stock movement (ขาย/รับ/ปรับ) ที่เกิดระหว่างเปิดฟอร์ม
  const baseUpdatedAtRef = useRef(undefined);
  useEffect(() => {
    if (!data?.id) return;
    let cancel = false;
    supabase.from('tmk_products').select('updated_at').eq('id', data.id).maybeSingle()
      .then(({ data: row }) => { if (!cancel) baseUpdatedAtRef.current = row ? (row.updated_at ?? null) : null; });
    return () => { cancel = true; };
  }, [data?.id]);

  const lots = f.lots || [];
  const hasLots = lots.length > 0;
  // มีล็อต → สต็อก = ผลรวมทุกช่องทุกล็อต (อ่านอย่างเดียว); ไม่มีล็อต → ใช้ช่องสต็อกเดิม
  const grandTotal = lots.reduce((a, l) => a + calcLotTotal(l), 0);
  const grandValue = lots.reduce((a, l) => a + calcLotValue(l), 0);

  // ===== mutators ล็อต (immutable) =====
  const mutateLot = (i, fn) => { setTouched(true); setF(p => ({ ...p, lots: p.lots.map((l, j) => j === i ? fn(l) : l) })); };
  const setLotField = (i, k, v) => mutateLot(i, l => ({ ...l, [k]: v }));
  const toggleSize = (i, size) => mutateLot(i, l => {
    const has = l.sizes.includes(size);
    if (!has) return { ...l, sizes: SIZES.filter(s => l.sizes.includes(s) || s === size) }; // เพิ่ม คงลำดับ
    const grid = {}; // ลบไซส์ → เคลียร์คอลัมน์นั้นออกจากทุกสี
    for (const cid in l.grid) { const row = { ...l.grid[cid] }; delete row[size]; grid[cid] = row; }
    return { ...l, sizes: l.sizes.filter(s => s !== size), grid };
  });
  const addColor = (i, proto) => mutateLot(i, l => ({ ...l, colors: [...l.colors, { id: uid('clr'), name: proto?.name || '', hex: proto?.hex || '#cccccc' }] }));
  const setColor = (i, cid, k, v) => mutateLot(i, l => ({ ...l, colors: l.colors.map(c => c.id === cid ? { ...c, [k]: v } : c) }));
  const removeColor = (i, cid) => mutateLot(i, l => { const grid = { ...l.grid }; delete grid[cid]; return { ...l, colors: l.colors.filter(c => c.id !== cid), grid }; }); // ลบสี = ลบทั้งแถว
  const setCell = (i, cid, size, v) => mutateLot(i, l => {
    const q = Math.max(0, Math.round(Number(v) || 0)); // clamp 0+ จำนวนเต็ม (grid key = colorId คงที่ → rename สีไม่กระทบ)
    const row = { ...(l.grid[cid] || {}) };
    if (q > 0) row[size] = q; else delete row[size];
    return { ...l, grid: { ...l.grid, [cid]: row } };
  });
  const addLot = (proto) => { const lot = newLot(proto); setTouched(true); setF(p => ({ ...p, lots: [...(p.lots || []), lot] })); setOpen(o => ({ ...o, [lot.id]: true })); };
  const removeLot = (i) => { setTouched(true); setF(p => ({ ...p, lots: p.lots.filter((_, j) => j !== i) })); };

  const pickImage = async (file) => {
    if (!file) return;
    try {
      // ย่อรูปก่อนเสมอ (ลดขนาดอัปโหลด/ขนาดเก็บ)
      const dataUrl = await readImageCompressed(file, 640, 0.82);
      // อัปโหลดไป Supabase Storage — เก็บ public URL แทน data URL (ลดขนาดแถว DB จาก ~80kB เหลือ <200 ไบต์)
      // ถ้า bucket ยังไม่มี/upload ล้มเหลว → fallback ใช้ data URL เหมือนเดิม (ไม่บล็อกฟอร์ม)
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const pid = f.id || ('p-tmp-' + Date.now());
        const path = `products/${pid}.jpg`;
        const { error } = await supabase.storage.from('tmk-images')
          .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
        if (error) throw error;
        const { data: pub } = supabase.storage.from('tmk-images').getPublicUrl(path);
        set('image', `${pub.publicUrl}?v=${Date.now()}`); // cache-bust หลังแก้รูป
      } catch (e) {
        console.warn('Storage upload failed → ใช้ data URL แทน:', e?.message);
        set('image', dataUrl);
        if (!/(bucket|not found|404)/i.test(e?.message || '')) toast('อัปโหลดรูปขึ้น Storage ไม่ได้ — ใช้แบบฝังในข้อมูล (ขนาดใหญ่กว่า)', 'warn');
      }
    } catch { toast('อ่านรูปไม่สำเร็จ', 'error'); }
  };

  const handleSave = async () => {
    if (busy || !f.name.trim()) return;
    // แก้สินค้าเดิมแต่ baseline updated_at ยังโหลดไม่เสร็จ → อย่าเซฟแบบไม่มี optimistic-lock (กัน lost update) ให้รอแล้วลองใหม่
    if (data?.id && baseUpdatedAtRef.current === undefined) {
      toast('กำลังโหลดข้อมูลสินค้าล่าสุด — รอสักครู่แล้วกดบันทึกอีกครั้ง', 'warn');
      return;
    }
    setBusy(true);
    // normalize ล็อต — เก็บเฉพาะสีที่มีจำนวน, ไซส์ที่ใช้จริง, ทิ้งล็อตว่างเปล่า
    const cleanLots = lots.map(l => {
      const orderedSizes = SIZES.filter(s => l.sizes.includes(s));
      const colors = []; const grid = {};
      l.colors.forEach(c => {
        const row = {};
        orderedSizes.forEach(s => { const q = Math.max(0, Math.round(Number(l.grid?.[c.id]?.[s]) || 0)); if (q > 0) row[s] = q; });
        if (Object.keys(row).length) {
          const cid = c.id || uid('clr');
          colors.push({ id: cid, name: String(c.name || '').trim() || 'สี', hex: c.hex || '#cccccc' });
          grid[cid] = row;
        }
      });
      const usedSizes = orderedSizes.filter(s => colors.some(c => grid[c.id][s] != null));
      return { id: l.id || uid('lot'), lotNo: String(l.lotNo || '').trim(), date: l.date || '', cost: nn(l.cost), note: String(l.note || '').trim(), sizes: usedSizes, colors, grid };
    }).filter(l => l.colors.length > 0 || l.lotNo); // ทิ้งล็อตที่ไม่มีทั้งจำนวนและรหัส
    const cleanHasLots = cleanLots.length > 0;
    const cleanTotal = cleanLots.reduce((a, l) => a + calcLotTotal(l), 0);
    const cleanValue = cleanLots.reduce((a, l) => a + calcLotValue(l), 0);
    const row = {
      id: data?.id || uid('p'),
      name: f.name.trim(),
      price: nn(f.price),
      target_units: Number(f.units) || 0,
      actual_units: nn(f.units), // = จำนวนที่ขาย (แสดงผล + คิดรายได้)
      // มีล็อต → สต็อก = ผลรวมล็อต; ไม่มีล็อต → ช่องสต็อกเดิม (เว้นว่าง = 0; คอลัมน์เป็น NOT NULL ห้ามส่ง null)
      stock_on_hand: cleanHasLots ? cleanTotal : nn(f.onHand),
      reorder_point: nn(f.reorder),
      strategy: f.strategy || '',
      image_url: f.image || null,
      category: (f.category || '').trim() || null,
      supplier: (f.supplier || '').trim() || null,
      sku: (f.sku || '').trim() || null,
      barcode: (f.barcode || '').trim() || null,
      lots: cleanLots,
    };
    const ok = await saveProductRow(row, !!data, {
      action: data ? 'update' : 'create', entityType: 'product', entityName: row.name,
      summary: `${data ? 'แก้ไข' : 'สร้าง'}สินค้า "${row.name}"`,
      fields: [
        { label: 'ราคา', value: B(Number(f.price) || 0) },
        { label: 'จำนวนที่ขาย', value: N(Number(f.units) || 0) },
        { label: 'สต็อกคงเหลือ', value: N(cleanHasLots ? cleanTotal : (Number(f.onHand) || 0)) },
        { label: 'มูลค่าสต็อก', value: B(cleanValue) },
        { label: 'จำนวนล็อต', value: cleanHasLots ? `${cleanLots.length} ล็อต` : '—' },
        { label: 'จุดสั่งผลิตซ้ำ', value: N(Number(f.reorder) || 0) },
      ],
    }, data ? baseUpdatedAtRef.current : undefined);
    setBusy(false);
    if (ok) onClose();
  };
  const footer = (<>{data?.id && <Button variant="outline" style={{ color: 'var(--bad)', marginRight: 'auto' }} disabled={busy} onClick={async () => { if (await deleteRow('tmk_products', data.id, 'สินค้า', { action: 'delete', entityType: 'product', entityName: data.name, summary: `ลบสินค้า "${data.name}"` })) onClose(); }}><Icon name="trash" /> ลบ</Button>}<Button variant="outline" onClick={() => guardClose(touched, onClose)}>ยกเลิก</Button><Button disabled={busy} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึกสินค้า'}</Button></>);

  // สไตล์ช่องในตาราง ไซส์×สี
  const cellInput = { width: 50, textAlign: 'center', padding: '6px 2px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 16, fontVariantNumeric: 'tabular-nums' };
  const stickyTh = { position: 'sticky', left: 0, zIndex: 2, background: 'var(--surface-2)', minWidth: 156, textAlign: 'left' };
  const stickyTd = { position: 'sticky', left: 0, zIndex: 1, background: 'var(--surface)', minWidth: 156 };

  return (
    <Modal wide icon="bag" title={data ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'} sub="ข้อมูลสินค้า รูป และล็อต (ไซส์ × สี)" onClose={onClose} footer={footer} confirmOnClose={touched}>
      {/* รูปสินค้า + ชื่อ */}
      <div className="row" style={{ alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
        <div style={{ flexShrink: 0 }}>
          <input ref={imgRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { pickImage(e.target.files?.[0]); e.target.value = ''; }} />
          <button
            type="button"
            onClick={() => imgRef.current?.click()}
            title={f.image ? 'เปลี่ยนรูป' : 'เพิ่มรูป'}
            style={{ width: 92, height: 92, borderRadius: 'var(--r-sm)', border: '1px dashed var(--line)', background: 'var(--surface-2)', overflow: 'hidden', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 }}
          >
            {f.image
              ? <img src={f.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ color: 'var(--ink-4)', display: 'grid', placeItems: 'center', gap: 4 }}><Icon name="bag" /><span className="cap">เพิ่มรูป</span></span>}
          </button>
          {f.image && <Button variant="ghost" size="sm" type="button" style={{ width: 92, marginTop: 6, color: 'var(--bad)' }} onClick={() => set('image', '')}>ลบรูป</Button>}
        </div>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}><label>ชื่อสินค้า</label><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="เช่น เสื้อยืดลาย Summer" /></div>
      </div>
      <div className="field-row">
        <div className="field"><label>ราคาขาย (฿)</label><Input type="number" min="0" inputMode="decimal" className="num" value={f.price} onChange={e => set('price', e.target.value)} placeholder="0" /></div>
        <div className="field"><label>จำนวนที่ขาย (ตัว)</label><Input type="number" min="0" inputMode="decimal" className="num" value={f.units} onChange={e => set('units', e.target.value)} placeholder="0" /></div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>สต็อกคงเหลือ{hasLots && <span className="cap" style={{ marginLeft: 6, color: 'var(--ink-4)' }}>(คิดจากล็อต)</span>}</label>
          {hasLots
            ? <Input type="number" className="num" value={grandTotal} readOnly disabled style={{ opacity: 0.7 }} />
            : <Input type="number" min="0" inputMode="decimal" className="num" value={f.onHand} onChange={e => set('onHand', e.target.value)} placeholder="0" />}
        </div>
        <div className="field"><label>จุดสั่งผลิตซ้ำ</label><Input type="number" min="0" inputMode="decimal" className="num" value={f.reorder} onChange={e => set('reorder', e.target.value)} placeholder="0" /></div>
      </div>
      {hasLots && <div className="cap" style={{ marginTop: -4, marginBottom: 12, color: 'var(--ink-3)' }}>มูลค่าสต็อก (ต้นทุน): <b style={{ color: 'var(--ink)' }}>{B(grandValue)}</b></div>}

      {/* ล็อต (ไซส์ × สี) */}
      <div className="field">
        <div className="row between" style={{ marginBottom: 8 }}>
          <label style={{ margin: 0 }}>ล็อต (ไซส์ × สี){hasLots && <span className="cap" style={{ marginLeft: 6, color: 'var(--ink-3)' }}>· {lots.length} ล็อต · รวม {N(grandTotal)} ตัว</span>}</label>
          <div className="row" style={{ gap: 6 }}>
            {hasLots && <Button variant="ghost" size="sm" type="button" title="คัดลอกสี+ไซส์จากล็อตล่าสุด" onClick={() => addLot(lots[lots.length - 1])}><Icon name="layers" /> คัดลอกโครงสร้าง</Button>}
            <Button variant="ghost" size="sm" type="button" onClick={() => addLot()}><Icon name="plus" /> เพิ่มล็อต</Button>
          </div>
        </div>
        {!hasLots && <div className="cap" style={{ color: 'var(--ink-4)', padding: '4px 0 2px' }}>ยังไม่มีล็อต — กด "เพิ่มล็อต" เพื่อกรอกจำนวนแยกตามไซส์ × สี (สต็อกคงเหลือคิดจากผลรวมทุกล็อตอัตโนมัติ)</div>}

        {lots.map((l, i) => {
          const isOpen = !!open[l.id];
          return (
            <div key={l.id || i} style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', marginBottom: 8, background: 'var(--surface)' }}>
              {/* หัวการ์ด (คลิกพับ/กาง) */}
              <div className="row between" style={{ padding: '10px 12px', cursor: 'pointer', gap: 8 }} onClick={() => setOpen(o => ({ ...o, [l.id]: !o[l.id] }))}>
                <div className="row" style={{ gap: 8, minWidth: 0 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: 'var(--ink-3)' }}><Icon name="chevR" /></span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>ล็อต {i + 1}{l.lotNo ? ` · ${l.lotNo}` : ''}</div>
                    <div className="cap" style={{ color: 'var(--ink-3)' }}>รวม {N(calcLotTotal(l))} ตัว · {l.colors.length} สี × {l.sizes.length} ไซส์{calcLotValue(l) ? ` · มูลค่า ${B(calcLotValue(l))}` : ''}</div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" type="button" title="ลบล็อตนี้" onClick={(e) => { e.stopPropagation(); removeLot(i); }} style={{ color: 'var(--bad)', flexShrink: 0 }}><Icon name="trash" /></Button>
              </div>

              {isOpen && (
                <div style={{ padding: '0 12px 12px', borderTop: '1px solid var(--line)' }}>
                  <div className="field-row" style={{ marginTop: 12, marginBottom: 8 }}>
                    <div className="field" style={{ marginBottom: 0 }}><label>รหัสล็อต</label><Input value={l.lotNo} onChange={e => setLotField(i, 'lotNo', e.target.value)} placeholder="เช่น LOT-2406" /></div>
                    <div className="field" style={{ marginBottom: 0 }}><label>วันที่รับเข้า</label><DatePicker value={l.date} onChange={(v) => setLotField(i, 'date', v)} /></div>
                  </div>
                  <div className="field-row" style={{ marginBottom: 10 }}>
                    <div className="field" style={{ marginBottom: 0 }}><label>ต้นทุน/ตัว (฿)</label><Input type="number" min="0" inputMode="decimal" className="num" value={l.cost} onChange={e => setLotField(i, 'cost', e.target.value)} placeholder="0" /></div>
                    <div className="field" style={{ marginBottom: 0 }}><label>โน้ต</label><Input value={l.note} onChange={e => setLotField(i, 'note', e.target.value)} placeholder="เช่น โรงงาน A / ผ้า Cotton" /></div>
                  </div>

                  {/* เลือกไซส์ */}
                  <div className="field" style={{ marginBottom: 10 }}>
                    <label>ไซส์ในล็อตนี้</label>
                    <div className="chips-pick">
                      {SIZES.map(s => <Toggle type="button" variant="pill" size="sm" key={s} pressed={l.sizes.includes(s)} onPressedChange={() => toggleSize(i, s)}>{s}</Toggle>)}
                    </div>
                  </div>

                  {/* ตารางจำนวน ไซส์ × สี */}
                  <label style={{ display: 'block', marginBottom: 6 }}>จำนวนต่อ สี × ไซส์</label>
                  {l.sizes.length === 0
                    ? <div className="cap" style={{ color: 'var(--ink-4)', padding: '2px 0 8px' }}>เลือกไซส์ด้านบนก่อน แล้วเพิ่มสีเพื่อกรอกจำนวน</div>
                    : l.colors.length === 0
                      ? <div className="cap" style={{ color: 'var(--ink-4)', padding: '2px 0 8px' }}>ยังไม่มีสี — เพิ่มสีด้านล่างเพื่อเริ่มกรอกจำนวน</div>
                      : (
                        <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 'var(--r-xs)', marginBottom: 10 }}>
                          <table className="table" style={{ margin: 0, minWidth: 'max-content' }}>
                            <thead>
                              <tr>
                                <th style={stickyTh}>สี \ ไซส์</th>
                                {l.sizes.map(s => <th key={s} style={{ textAlign: 'center', minWidth: 50 }}>{s}</th>)}
                                <th style={{ textAlign: 'center' }}>รวม</th>
                              </tr>
                            </thead>
                            <tbody>
                              {l.colors.map(c => (
                                <tr key={c.id}>
                                  <td style={stickyTd}>
                                    <div className="row" style={{ gap: 6 }}>
                                      <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(c.hex) ? c.hex : '#cccccc'} onChange={e => setColor(i, c.id, 'hex', e.target.value)} title="เลือกสี" style={{ width: 22, height: 22, padding: 0, border: '1px solid var(--line)', borderRadius: 5, background: 'none', cursor: 'pointer', flexShrink: 0 }} />
                                      <input value={c.name} onChange={e => setColor(i, c.id, 'name', e.target.value)} placeholder="ชื่อสี" style={{ flex: 1, minWidth: 70, padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 16 }} />
                                      <Button variant="ghost" size="icon" type="button" title="ลบสีนี้" onClick={() => removeColor(i, c.id)} style={{ color: 'var(--bad)', flexShrink: 0 }}><Icon name="x" /></Button>
                                    </div>
                                  </td>
                                  {l.sizes.map(s => (
                                    <td key={s} style={{ textAlign: 'center', padding: 4 }}>
                                      <input inputMode="numeric" value={cellQty(l, c.id, s)} onChange={e => setCell(i, c.id, s, e.target.value)} placeholder="0" style={cellInput} />
                                    </td>
                                  ))}
                                  <td style={{ textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{N(rowSum(l, c.id))}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr style={{ fontWeight: 700 }}>
                                <td style={stickyTd}>รวมต่อไซส์</td>
                                {l.sizes.map(s => <td key={s} style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{N(colSum(l, s))}</td>)}
                                <td style={{ textAlign: 'center', fontWeight: 800, color: 'var(--accent-2)', fontVariantNumeric: 'tabular-nums' }}>{N(calcLotTotal(l))}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}

                  {/* เพิ่มสี */}
                  <label style={{ display: 'block', marginBottom: 6 }}>เพิ่มสี</label>
                  <div className="chips-pick" style={{ marginBottom: 6 }}>
                    {SHIRT_COLORS.map(sc => (
                      <button type="button" key={sc.name} className="pick" onClick={() => addColor(i, sc)} disabled={l.colors.some(c => c.name === sc.name)} style={{ opacity: l.colors.some(c => c.name === sc.name) ? 0.4 : 1 }}>
                        <span style={{ width: 12, height: 12, borderRadius: 3, background: sc.hex, border: '1px solid var(--line)', display: 'inline-block', marginRight: 4, verticalAlign: '-1px' }}></span>{sc.name}
                      </button>
                    ))}
                    <button type="button" className="pick" onClick={() => addColor(i)}><Icon name="plus" /> สีกำหนดเอง</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ข้อมูลเพิ่มเติม — หมวดหมู่ / ซัพพลายเออร์ / SKU / บาร์โค้ด */}
      <div className="eyebrow" style={{ margin: '14px 0 8px' }}>ข้อมูลเพิ่มเติม</div>
      <datalist id="cat-list">{[...new Set((MD.products || []).map(p => p.category).filter(Boolean))].map(c => <option key={c} value={c} />)}</datalist>
      <datalist id="sup-list">{[...new Set((MD.products || []).map(p => p.supplier).filter(Boolean))].map(s => <option key={s} value={s} />)}</datalist>
      <div className="field-row">
        <div className="field"><label>หมวดหมู่</label><Input list="cat-list" value={f.category} onChange={e => set('category', e.target.value)} placeholder="เช่น เสื้อยืด, โปโล" /></div>
        <div className="field"><label>ผู้ผลิต / ซัพพลายเออร์</label><Input list="sup-list" value={f.supplier} onChange={e => set('supplier', e.target.value)} placeholder="เช่น โรงงาน A" /></div>
      </div>
      <div className="field-row">
        <div className="field"><label>SKU</label><Input value={f.sku} onChange={e => set('sku', e.target.value)} placeholder="เช่น TS-SUMMER-01" /></div>
        <div className="field"><label>บาร์โค้ด</label><Input value={f.barcode} onChange={e => set('barcode', e.target.value)} placeholder="เช่น 885xxxxxxxxxx" /></div>
      </div>

      <div className="field" style={{ marginBottom: 0 }}><label>กลยุทธ์ / โน้ต</label><Textarea value={f.strategy} onChange={e => set('strategy', e.target.value)} placeholder="เช่น สินค้าเรือธง ดันต่อเนื่อง" /></div>
    </Modal>
  );
}

// บันทึกสินค้า — เผื่อ DB ยังไม่มีคอลัมน์ image_url/lots ให้ fallback ตัดออกแล้วลองใหม่ (เตือนให้รัน migration)
async function saveProductRow(row, isUpdate, audit, lockUpdatedAt) {
  // คอลัมน์เสริมที่อาจยังไม่มีใน DB (ยังไม่ได้รัน migration) → ตัดออกทีละตัวแล้วลองใหม่
  // (PostgREST ฟ้องทีละคอลัมน์ จึงวน loop จนสำเร็จ; เก็บข้อมูลให้ได้มากที่สุด)
  const OPTIONAL_COLS = ['category', 'supplier', 'sku', 'barcode', 'image_url', 'lots'];
  const payload = { ...row, updated_at: new Date().toISOString() }; // bump เสมอ → optimistic-lock ของฟอร์มอื่นจับการแก้ได้
  const dropped = [];
  // สินค้าเดิม + มี baseline → update แบบมี precondition (updated_at ไม่เปลี่ยน) กัน save ทับ stock movement ที่เกิดระหว่างเปิดฟอร์ม
  const useLock = isUpdate && lockUpdatedAt !== undefined;
  try {
    for (let attempt = 0; attempt <= OPTIONAL_COLS.length; attempt++) {
      let error;
      if (useLock) {
        let q = supabase.from('tmk_products').update(payload).eq('id', row.id);
        q = (lockUpdatedAt == null) ? q.is('updated_at', null) : q.eq('updated_at', lockUpdatedAt);
        const res = await q.select('id');
        error = res.error;
        if (!error && (!res.data || res.data.length === 0)) {
          // 0 แถว = มีเครื่องอื่นแก้สินค้านี้ (ขาย/รับ/ปรับ) หลังเราเปิดฟอร์ม → ไม่เขียนทับ
          toast('มีการแก้ไขสินค้านี้จากที่อื่น (เช่น ขาย/รับของ/ปรับสต็อก) — ปิดแล้วเปิดใหม่เพื่อดึงค่าล่าสุด แล้วบันทึกอีกครั้ง', 'warn');
          refresh(['tmk_products']);
          return false;
        }
      } else {
        const res = await supabase.from('tmk_products').upsert(payload);
        error = res.error;
      }
      if (!error) break;
      const isColErr = /column|schema cache|PGRST204|does not exist/i.test(error.message || '');
      const target = OPTIONAL_COLS.find(c => (c in payload) && (error.message || '').includes(c));
      if (isColErr && target) { delete payload[target]; dropped.push(target); continue; } // ตัดคอลัมน์ที่ไม่มี ลองใหม่
      throw error; // error อื่น → โยนออก
    }
    if (dropped.length) toast(`บันทึกแล้ว แต่บางช่อง (${dropped.join(', ')}) ยังไม่ถูกเก็บ — ต้องรัน SQL migration ก่อน`, 'warn');
    if (audit) logAudit(audit);
    refresh(['tmk_products']);
    toast('บันทึกสินค้าสำเร็จ', 'success');
    return true;
  } catch (err) {
    console.error('Save tmk_products failed:', err);
    toast('บันทึกสินค้าไม่สำเร็จ: ' + err.message, 'error');
    return false;
  }
}

/* ---------- Import products from CSV (เอาข้อมูลสินค้าเข้าแคตตาล็อกครั้งละหลายรายการ) ---------- */
// เดาตัวคั่น (Thai/EU Excel มักใช้ ; · บางไฟล์ TAB/|) — นับนอกเครื่องหมายคำพูดจาก 10 บรรทัดแรก


