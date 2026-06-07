/* ============================================================
   TMK Operation — Modals & Login
   ============================================================ */
import React, { useState, useEffect, useMemo } from 'react';
import { TMK } from './data.js';
import { B, Bk, P, N, Icon } from './components.jsx';
import { useLang } from './i18n.jsx';
import { supabase } from './lib/supabaseClient.js';
import { parseTaskDate, getToday, todayISO } from './lib/dateUtils.js';
import { logAudit } from './lib/audit.js';
import tmkLogoWhite from './assets/tmk-logo-white.png';

// Toast helper
const toast = (m, k = 'success') => window.__toast?.(m, k);

// Generic save wrapper — ส่ง audit (optional) เพื่อบันทึกประวัติการใช้งานเมื่อสำเร็จ
async function saveRow(table, row, label = 'บันทึก', audit = null) {
  try {
    const { error } = await supabase.from(table).upsert(row);
    if (error) throw error;
    if (audit) logAudit(audit);
    toast(label + 'สำเร็จ', 'success');
    return true;
  } catch (err) {
    console.error(`Save ${table} failed:`, err);
    toast(label + 'ไม่สำเร็จ: ' + err.message, 'error');
    return false;
  }
}

const MD = TMK;
const { TARGET: M_TARGET, DAY: M_DAY, DAYS: M_DAYS, ACOS_CEIL: M_ACOS } = TMK.consts;

/* ---------- Modal shell ---------- */
export function Modal({ icon, title, sub, onClose, footer, wide, children }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className={'modal' + (wide ? ' modal-lg' : '')} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          {icon && <div className="mh-icon"><Icon name={icon} /></div>}
          <div style={{ minWidth: 0 }}>
            <div className="modal-title">{title}</div>
            {sub && <div className="modal-sub">{sub}</div>}
          </div>
          <button className="icon-btn modal-x" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Record daily sales (rich, live summary) ---------- */
export function RecordSalesModal({ data, onClose }) {
  const { t } = useLang();
  const [step, setStep] = useState(1); // 1=กรอก, 2=ตรวจสอบ
  const [date, setDate] = useState(data?.date || todayISO());
  const emptyRows = () => MD.channels.map(c => ({ id: c.id, rev: '', ord: '', ad: '', inq: '', newC: '', oldC: '' }));
  const [rows, setRows] = useState(emptyRows);
  const [note, setNote] = useState('');
  const [chatTime, setChatTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // โหลดข้อมูลเดิมของวันที่เลือก (แก้เดือน/วันเก่าได้); ถ้าไม่มี = ว่าง
  useEffect(() => {
    let cancel = false;
    const colMap = { shopee: 'shopee', tiktok: 'tiktok', lazada: 'lazada', facebook: 'facebook', line: 'line_oa', crm: 'crm' };
    setLoading(true);
    (async () => {
      const { data: row } = await supabase.from('tmk_daily_sales').select('*').eq('id', 'd-' + date).maybeSingle();
      if (cancel) return;
      if (row) {
        setRows(MD.channels.map(c => {
          const col = colMap[c.id];
          return { id: c.id, rev: col && row[col] ? String(row[col]) : '', ord: '', ad: '', inq: '', newC: '', oldC: '' };
        }));
        setNote(row.note || '');
      } else {
        setRows(emptyRows());
        setNote('');
      }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [date]);

  const up = (i, k, v) => {
    // Validation: no negative numbers
    if (+v < 0) return;
    setRows(rs => rs.map((r, j) => j === i ? { ...r, [k]: v } : r));
  };

  // Save handler — upsert ลง tmk_daily_sales (id = "d-YYYY-MM-DD")
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const dayNames = ['อา','จ','อ','พ','พฤ','ศ','ส'];
      const d = new Date(date);
      const day_name = dayNames[d.getDay()] || '';
      const byId = Object.fromEntries(rows.map(r => [r.id, r]));
      const channelMap = { shopee: 'shopee', tiktok: 'tiktok', lazada: 'lazada', facebook: 'facebook', line: 'line_oa', crm: 'crm' };
      const row = {
        id: 'd-' + date,
        date,
        day_name,
        shopee: Number(byId.shopee?.rev) || 0,
        tiktok: Number(byId.tiktok?.rev) || 0,
        lazada: Number(byId.lazada?.rev) || 0,
        facebook: Number(byId.facebook?.rev) || 0,
        line_oa: Number(byId.line?.rev) || 0,
        crm: Number(byId.crm?.rev) || 0,
        ad_spend: rows.reduce((a, r) => a + (Number(r.ad) || 0), 0),
        note: note || '',
      };
      // map any other channel ids that happen to match column names
      for (const r of rows) {
        const col = channelMap[r.id];
        if (col && row[col] === 0) row[col] = Number(r.rev) || 0;
      }
      const { error } = await supabase.from('tmk_daily_sales').upsert(row);
      if (error) throw error;
      logAudit({ action: 'create', entityType: 'daily', entityName: date, summary: `บันทึกยอดขายวันที่ ${date}` });
      toast(t('toastSaved'), 'success');
      onClose();
    } catch (err) {
      console.error('RecordSales save failed:', err);
      toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally { setSaving(false); }
  };

  const MTD = MD.computed.MTD;
  const s = useMemo(() => {
    const tRev = rows.reduce((a, r) => a + (+r.rev || 0), 0);
    const tOrd = rows.reduce((a, r) => a + (+r.ord || 0), 0);
    const tAd = rows.reduce((a, r) => a + (+r.ad || 0), 0);
    const tNewC = rows.reduce((a, r) => a + (+r.newC || 0), 0);
    const tOldC = rows.reduce((a, r) => a + (+r.oldC || 0), 0);
    const aov = tOrd > 0 ? tRev / tOrd : 0;
    const acos = tRev > 0 ? (tAd / tRev) * 100 : 0;
    const newMtd = MTD + tRev;
    const pPct = (newMtd / ((M_TARGET / M_DAYS) * (M_DAY + 1))) * 100;
    const rr = Math.round(newMtd / (M_DAY + 1) * M_DAYS);
    const avg = MD.dailyMonth.reduce((a, d) => a + d.rev, 0) / MD.dailyMonth.length;
    const vsAvg = avg > 0 ? ((tRev - avg) / avg) * 100 : 0;
    const tips = [];
    if (tRev > 0) {
      if (vsAvg > 20) tips.push({ c: 'var(--good)', m: `ยอดสูงกว่าค่าเฉลี่ย ${Math.abs(vsAvg).toFixed(0)}%` });
      else if (vsAvg < -20) tips.push({ c: 'var(--bad)', m: `ยอดต่ำกว่าค่าเฉลี่ย ${Math.abs(vsAvg).toFixed(0)}%` });
      if (acos > 40) tips.push({ c: 'var(--bad)', m: `ACOS ${acos.toFixed(1)}% สูงมาก` });
      else if (acos > M_ACOS) tips.push({ c: 'var(--warn)', m: `ACOS ${acos.toFixed(1)}% เกินเพดาน ${M_ACOS}%` });
      else if (tAd > 0) tips.push({ c: 'var(--good)', m: `ACOS ${acos.toFixed(1)}% ดี` });
      if (pPct >= 95) tips.push({ c: 'var(--good)', m: `Pace ${pPct.toFixed(0)}% ทันเป้า` });
      else tips.push({ c: 'var(--warn)', m: `Pace ${pPct.toFixed(0)}% — ต้องเร่ง` });
    }
    return { tRev, tOrd, tAd, aov, acos, newMtd, pPct, rr, vsAvg, tips, ok: tRev > 0, tNewC, tOldC };
  }, [rows]);

  const footer = step === 1 ? (
    <>
      <button className="btn" onClick={onClose}>{t('cancel')}</button>
      <button className="btn btn-primary" disabled={!s.ok} style={{ opacity: s.ok ? 1 : 0.5 }} onClick={() => setStep(2)}>{t('reviewBefore')} <Icon name="arrowR" /></button>
    </>
  ) : (
    <>
      <button className="btn" onClick={() => setStep(1)}><Icon name="chevR" className="flip-h" /> {t('goBackEdit')}</button>
      <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
        {saving ? <><Icon name="refresh" /> {t('saving')}</> : <><Icon name="check" /> {t('confirmSave')}</>}
      </button>
    </>
  );

  return (
    <Modal icon="pencil" title={step === 1 ? 'บันทึกยอดขายประจำวัน' : 'ตรวจสอบก่อนบันทึก'} sub={step === 1 ? 'กรอกยอดแต่ละช่องทาง' : `ยอดขายวันที่ ${date}`} onClose={onClose} footer={footer} wide>

      {/* Step indicator */}
      <div className="row" style={{ gap: 8, marginBottom: 4 }}>
        <span className={`chip ${step === 1 ? 'chip-accent' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setStep(1)}>1. กรอกข้อมูล</span>
        <span style={{ color: 'var(--ink-4)' }}>→</span>
        <span className={`chip ${step === 2 ? 'chip-accent' : ''}`}>2. ตรวจสอบ & บันทึก</span>
      </div>

      {step === 1 && (
        <>
          {/* Date */}
          <div className="field" style={{ maxWidth: 220 }}>
            <label>วันที่</label>
            <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          {/* Channel cards — each channel is a card */}
          {rows.map((r, i) => {
            const ch = MD.channels.find(c => c.id === r.id);
            return (
              <div key={r.id} style={{ padding: '12px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)', borderLeft: `3px solid ${ch.hex}` }}>
                <div className="row" style={{ gap: 7, fontWeight: 600, marginBottom: 10 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: ch.hex }}></span>{ch.name}
                </div>
                <div className="grid" style={{ gridTemplateColumns: ch.hasAd ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10 }}>
                  <div className="field"><label>ยอดขาย (฿)</label><input type="number" className="input num" style={{ textAlign: 'right' }} placeholder="0" value={r.rev} onChange={e => up(i, 'rev', e.target.value)} /></div>
                  <div className="field"><label>ออร์เดอร์</label><input type="number" className="input num" style={{ textAlign: 'right' }} placeholder="0" value={r.ord} onChange={e => up(i, 'ord', e.target.value)} /></div>
                  {ch.hasAd && <div className="field"><label>ค่าแอด (฿)</label><input type="number" className="input num" style={{ textAlign: 'right' }} placeholder="0" value={r.ad} onChange={e => up(i, 'ad', e.target.value)} /></div>}
                </div>
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 8 }}>
                  <div className="field"><label>แชท/สอบถาม</label><input type="number" className="input num" style={{ textAlign: 'right' }} placeholder="0" value={r.inq} onChange={e => up(i, 'inq', e.target.value)} /></div>
                  <div className="field"><label>ลูกค้าใหม่</label><input type="number" className="input num" style={{ textAlign: 'right' }} placeholder="0" value={r.newC} onChange={e => up(i, 'newC', e.target.value)} /></div>
                  <div className="field"><label>ลูกค้าเก่า</label><input type="number" className="input num" style={{ textAlign: 'right' }} placeholder="0" value={r.oldC} onChange={e => up(i, 'oldC', e.target.value)} /></div>
                </div>
              </div>
            );
          })}

          <div className="field-row">
            <div className="field"><label>เวลาตอบแชทเฉลี่ย (นาที)</label><input type="number" className="input" placeholder="0" value={chatTime} onChange={e => setChatTime(e.target.value)} /></div>
            <div className="field"><label>โน้ตประจำวัน</label><input className="input" placeholder="ไลฟ์เย็น 1 รอบ, Flash Sale..." value={note} onChange={e => setNote(e.target.value)} /></div>
          </div>
        </>
      )}

      {step === 2 && s.ok && (
        <>
          {/* Summary KPIs */}
          <div className="sum-grid" style={{ marginBottom: 14 }}>
            {[['ยอดรวมวันนี้', B(s.tRev), 'var(--accent-2)'],
              ['ออร์เดอร์', String(s.tOrd), 'var(--ink)'],
              ['AOV', B(s.aov), 'var(--ink)'],
              ['ค่าแอดรวม', B(s.tAd), 'var(--ink-2)'],
              ['ACOS', s.tAd > 0 ? P(s.acos) : '—', s.acos <= M_ACOS ? 'var(--good)' : 'var(--warn)']].map((x, i) => (
              <div key={i} className="sum-cell" style={{ background: 'var(--surface-2)' }}>
                <div className="cap">{x[0]}</div>
                <div className="num h3" style={{ color: x[2], fontWeight: 700 }}>{x[1]}</div>
              </div>
            ))}
          </div>

          {/* Channel breakdown */}
          <div style={{ marginBottom: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>รายละเอียดต่อช่องทาง</div>
            {rows.filter(r => +r.rev > 0).map(r => {
              const ch = MD.channels.find(c => c.id === r.id);
              const rev = +r.rev || 0;
              const pct = s.tRev > 0 ? (rev / s.tRev * 100) : 0;
              return (
                <div key={r.id} className="row" style={{ gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line-2)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: ch.hex, flexShrink: 0 }}></span>
                  <span className="sm" style={{ fontWeight: 600, width: 70 }}>{ch.name}</span>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--surface-3)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: ch.hex, borderRadius: 4 }}></div>
                  </div>
                  <span className="num sm" style={{ fontWeight: 700, width: 75, textAlign: 'right' }}>{B(rev)}</span>
                  <span className="num cap" style={{ width: 36, textAlign: 'right' }}>{P(pct, 0)}</span>
                  <span className="cap" style={{ width: 55, textAlign: 'right' }}>{r.ord || 0} ออร์เดอร์</span>
                </div>
              );
            })}
          </div>

          {/* Impact on MTD */}
          <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--r)', padding: 14, marginBottom: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>ผลกระทบต่อเป้าเดือน</div>
            <div className="grid g3" style={{ gap: 12 }}>
              <div><div className="cap">MTD หลังบันทึก</div><div className="num h2" style={{ color: 'var(--accent-2)' }}>{B(s.newMtd)}</div><div className="cap">{P((s.newMtd / M_TARGET) * 100)} ของเป้า {Bk(M_TARGET)}</div></div>
              <div><div className="cap">Run Rate ใหม่</div><div className="num h2" style={{ color: s.rr >= M_TARGET ? 'var(--good)' : 'var(--warn)' }}>{B(s.rr)}</div><div className="cap">{s.rr >= M_TARGET ? '✓ เกินเป้า' : `ขาดอีก ${Bk(M_TARGET - s.rr)}`}</div></div>
              <div><div className="cap">Pace</div><div className="num h2" style={{ color: s.pPct >= 95 ? 'var(--good)' : 'var(--warn)' }}>{P(s.pPct)}</div><div className="cap">{s.pPct >= 95 ? '✓ ทันเป้า' : 'ต้องเร่ง'}</div></div>
            </div>
            <div style={{ marginTop: 10 }}>
              <div className="bar"><span style={{ width: `${Math.min((s.newMtd / M_TARGET) * 100, 100)}%`, background: s.pPct >= 95 ? 'var(--good)' : 'var(--accent)' }}></span></div>
              <div className="row between cap" style={{ marginTop: 4 }}><span>{B(s.newMtd)}</span><span>เป้า {B(M_TARGET)}</span></div>
            </div>
          </div>

          {/* Customers */}
          {(s.tNewC > 0 || s.tOldC > 0) && (
            <div className="grid g2" style={{ gap: 12, marginBottom: 14 }}>
              <div style={{ background: 'var(--good-soft)', borderRadius: 'var(--r-sm)', padding: 12 }}>
                <div className="cap" style={{ color: 'var(--good)' }}>ลูกค้าใหม่</div>
                <div className="num h2" style={{ color: 'var(--good)' }}>{s.tNewC} คน</div>
              </div>
              <div style={{ background: 'var(--info-soft)', borderRadius: 'var(--r-sm)', padding: 12 }}>
                <div className="cap" style={{ color: 'var(--info)' }}>ลูกค้าเก่า</div>
                <div className="num h2" style={{ color: 'var(--info)' }}>{s.tOldC} คน</div>
              </div>
            </div>
          )}

          {/* Tips */}
          {s.tips.length > 0 && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>สิ่งที่ควรรู้</div>
              {s.tips.map((t, i) => (
                <div key={i} className="row" style={{ gap: 8, padding: '7px 10px', borderRadius: 'var(--r-xs)', background: 'var(--surface-2)', borderLeft: `3px solid ${t.c}`, marginBottom: 4 }}>
                  <span className="sm">{t.m}</span>
                </div>
              ))}
            </div>
          )}

          {/* Note */}
          {note && <div style={{ padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)' }}><span className="cap">โน้ต: </span><span className="sm">{note}</span></div>}
        </>
      )}
    </Modal>
  );
}

/* ---------- Task modal (add / edit) ---------- */
export function TaskModal({ data, onClose, onSubmit }) {
  const edit = !!data;
  // แตกค่าที่อาจเป็น string คั่น comma (หรือ array ที่มีสมาชิกเป็น comma-string) → array สะอาด
  const splitToArr = v => (Array.isArray(v) ? v : [v])
    .flatMap(x => String(x || '').split(','))
    .map(s => s.trim())
    .filter(Boolean);
  const [f, setF] = useState(() => {
    if (!data) return { title: '', detail: '', date: '18 มิ.ย.', responsible: ['มัง'], channel: ['หลังบ้าน'], camp: 'c1', status: 'todo' };
    const validNames = new Set((MD.channels || []).map(c => c.name));
    const chanPieces = splitToArr(data.channel);
    // เก็บเฉพาะช่องทางที่มีจริงในระบบ — ตัดข้อความอิสระเก่า (เช่น "FB Post") ที่ map ไม่ได้ทิ้ง
    const channel = chanPieces.filter(c => validNames.has(c));
    return { ...data, responsible: splitToArr(data.responsible), channel };
  });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const toggle = (k, v) => setF(p => {
    const arr = Array.isArray(p[k]) ? p[k] : splitToArr(p[k]);
    return { ...p, [k]: arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v] };
  });
  const valid = f.title.trim();
  const footer = (
    <>
      <button className="btn" onClick={onClose}>ยกเลิก</button>
      <button className="btn btn-primary" disabled={!valid} style={{ opacity: valid ? 1 : 0.5 }} onClick={() => valid && onSubmit({ ...f, id: data?.id || 'tn' + Date.now() })}>
        <Icon name="check" /> {edit ? 'บันทึกการแก้ไข' : 'เพิ่มงาน'}
      </button>
    </>
  );
  return (
    <Modal icon="listChecks" title={edit ? 'แก้ไขงาน' : 'เพิ่มงานใหม่'} sub="มอบหมายงานให้ทีมพร้อมกำหนดวัน" onClose={onClose} footer={footer}>
      <div className="field-row">
        <div className="field"><label>วันที่</label><input className="input" value={f.date} onChange={e => set('date', e.target.value)} placeholder="เช่น 20 มิ.ย." /></div>
        <div className="field"><label>แคมเปญ</label>
          <select className="input" value={f.camp} onChange={e => set('camp', e.target.value)}>
            {MD.campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div className="field"><label>หัวข้องาน *</label><input className="input" value={f.title} onChange={e => set('title', e.target.value)} placeholder="เช่น บรีฟงาน Graphic / ถ่ายคอนเทนต์" /></div>
      <div className="field"><label>รายละเอียด</label><textarea className="input" value={f.detail} onChange={e => set('detail', e.target.value)} placeholder="ระบุขั้นตอน / สิ่งที่ต้องส่ง..." /></div>
      <div className="field"><label>ผู้รับผิดชอบ (เลือกหน้าที่)</label>
        <div className="chips-pick">
          {(MD.duties && MD.duties.length > 0 ? MD.duties.map(d => ({ name: d.name, color: d.color })) : MD.staff).map(st => (
            <button key={st.name} className={'pick' + (f.responsible.includes(st.name) ? ' on' : '')} onClick={() => toggle('responsible', st.name)}>
              <span className="dot-c" style={{ background: st.color }}></span>{st.name}
            </button>
          ))}
        </div>
        <div className="cap" style={{ marginTop: 6, color: 'var(--ink-3)' }}>
          เลือกได้หลายหน้าที่ — งานนี้จะแสดงให้ผู้ใช้ทุกคนที่อยู่ในหน้าที่นั้น
        </div>
      </div>
      <div className="field"><label>ช่องทาง</label>
        <div className="chips-pick">
          {/* ทุก channel จาก Supabase — รวม หลังบ้าน + ทุกแพลตฟอร์ม แล้ว */}
          {(MD.channels || []).map(ch => (
            <button key={ch.id} className={'pick' + (f.channel.includes(ch.name) ? ' on' : '')} onClick={() => toggle('channel', ch.name)}>
              {ch.logoUrl ? (
                <img src={ch.logoUrl} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'contain', marginRight: 4 }} />
              ) : (
                <span className="dot-c" style={{ background: ch.hex }}></span>
              )}
              {ch.name}
            </button>
          ))}
        </div>
      </div>
      <div className="field"><label>สถานะ</label>
        <div className="segbar">
          {MD.kanbanMeta.map(k => <button key={k.id} className={'seg' + (f.status === k.id ? ' active' : '')} onClick={() => set('status', k.id)}>{k.label}</button>)}
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Product modal ---------- */
export function ProductModal({ data, onClose }) {
  const [f, setF] = useState(data || { name: '', price: '', units: '', onHand: '', reorder: '', strategy: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const handleSave = async () => {
    if (busy || !f.name.trim()) return;
    setBusy(true);
    const row = {
      id: data?.id || 'p' + Date.now(),
      name: f.name.trim(),
      price: Number(f.price) || 0,
      target_units: Number(f.units) || 0,
      actual_units: Number(data?.units) || 0,
      stock_on_hand: Number(f.onHand) || 0,
      reorder_point: Number(f.reorder) || 0,
      strategy: f.strategy || '',
    };
    const ok = await saveRow('tmk_products', row, 'บันทึกสินค้า', {
      action: data ? 'update' : 'create', entityType: 'product', entityName: row.name,
      summary: `${data ? 'แก้ไข' : 'สร้าง'}สินค้า "${row.name}"`,
    });
    setBusy(false);
    if (ok) onClose();
  };
  const footer = (<><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn btn-primary" disabled={busy} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึกสินค้า'}</button></>);
  return (
    <Modal icon="bag" title={data ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'} sub="ข้อมูลสินค้าและสต็อกคงเหลือ" onClose={onClose} footer={footer}>
      <div className="field"><label>ชื่อสินค้า</label><input className="input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="เช่น เสื้อโปโล Signature" /></div>
      <div className="field-row">
        <div className="field"><label>ราคาขาย (฿)</label><input type="number" className="input num" value={f.price} onChange={e => set('price', e.target.value)} placeholder="0" /></div>
        <div className="field"><label>เป้าจำนวน (ตัว)</label><input type="number" className="input num" value={f.units} onChange={e => set('units', e.target.value)} placeholder="0" /></div>
      </div>
      <div className="field-row-3">
        <div className="field"><label>สต็อกคงเหลือ</label><input type="number" className="input num" value={f.onHand} onChange={e => set('onHand', e.target.value)} placeholder="0" /></div>
        <div className="field"><label>จุดสั่งผลิตซ้ำ</label><input type="number" className="input num" value={f.reorder} onChange={e => set('reorder', e.target.value)} placeholder="0" /></div>
        <div className="field"><label>ขายไปแล้ว</label><input type="number" className="input num" placeholder="0" disabled /></div>
      </div>
      <div className="field"><label>กลยุทธ์ / โน้ต</label><textarea className="input" value={f.strategy} onChange={e => set('strategy', e.target.value)} placeholder="เช่น สินค้าเรือธง ดันต่อเนื่อง" /></div>
    </Modal>
  );
}

/* ---------- Campaign modal ---------- */
export function CampaignModal({ data, onClose }) {
  const palette = ['#0a5aa0', '#ee6a3a', '#6b5ce0', '#2f9e6e', '#c08a3e', '#4a8be0'];
  const [f, setF] = useState(data || { name: '', color: palette[0], start: '', end: '', channels: [], status: 'upcoming' });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const toggleCh = id => setF(p => ({ ...p, channels: p.channels.includes(id) ? p.channels.filter(x => x !== id) : [...p.channels, id] }));
  const statuses = [['upcoming', 'กำลังจะมา'], ['live', 'กำลังดำเนินการ'], ['done', 'จบแล้ว']];
  const [busy, setBusy] = useState(false);
  const handleSave = async () => {
    if (busy || !f.name.trim()) return;
    setBusy(true);
    const row = {
      id: data?.id || 'c' + Date.now(),
      name: f.name.trim(),
      color: f.color,
      bg: f.color + '22',
      border: f.color + '55',
      start_date: parseTaskDate(f.start) || null,
      end_date: parseTaskDate(f.end) || null,
      status: f.status,
      channels: f.channels || [],
    };
    const ok = await saveRow('tmk_campaigns', row, 'บันทึกแคมเปญ', {
      action: data ? 'update' : 'create', entityType: 'campaign', entityName: row.name,
      summary: `${data ? 'แก้ไข' : 'สร้าง'}แคมเปญ "${row.name}"`,
    });
    setBusy(false);
    if (ok) onClose();
  };
  const footer = (<><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn btn-primary" disabled={busy} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึกแคมเปญ'}</button></>);
  return (
    <Modal icon="megaphone" title={data ? 'แก้ไขแคมเปญ' : 'สร้างแคมเปญ'} sub="ตั้งชื่อ ช่วงเวลา และช่องทาง" onClose={onClose} footer={footer}>
      <div className="field"><label>ชื่อแคมเปญ</label><input className="input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="เช่น Payday Push" /></div>
      <div className="field-row">
        <div className="field"><label>เริ่ม</label><input className="input" value={f.start} onChange={e => set('start', e.target.value)} placeholder="25 มิ.ย." /></div>
        <div className="field"><label>สิ้นสุด</label><input className="input" value={f.end} onChange={e => set('end', e.target.value)} placeholder="30 มิ.ย." /></div>
      </div>
      <div className="field"><label>สีประจำแคมเปญ</label>
        <div className="chips-pick">
          {palette.map(c => (
            <button key={c} onClick={() => set('color', c)} style={{ width: 30, height: 30, borderRadius: 9, background: c, border: f.color === c ? '2px solid var(--ink)' : '2px solid transparent', boxShadow: '0 0 0 1px var(--line)' }}></button>
          ))}
        </div>
      </div>
      <div className="field"><label>ช่องทาง (ติ๊กเลือก)</label>
        <div className="chips-pick">
          {MD.channels.map(ch => (
            <button key={ch.id} className={'pick' + (f.channels.includes(ch.id) ? ' on' : '')} onClick={() => toggleCh(ch.id)}>
              {ch.logoUrl ? (
                <img src={ch.logoUrl} alt="" style={{ width: 16, height: 16, borderRadius: 3, objectFit: 'contain', marginRight: 4 }} />
              ) : (
                <span className="dot-c" style={{ background: ch.hex }}></span>
              )}
              {ch.name}
            </button>
          ))}
        </div>
      </div>
      <div className="field"><label>สถานะ</label>
        <div className="segbar">
          {statuses.map(s => <button key={s[0]} className={'seg' + (f.status === s[0] ? ' active' : '')} onClick={() => set('status', s[0])}>{s[1]}</button>)}
        </div>
      </div>
    </Modal>
  );
}

/* ---------- PO modal ---------- */
export function POModal({ data, onClose }) {
  const [f, setF] = useState(data || { product: MD.products[0]?.name || '', quantity: '', orderDate: '', arrivalDate: '', status: 'Pending' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const handleSave = async () => {
    if (busy || !f.product) return;
    setBusy(true);
    const row = {
      id: data?.id || 'po' + Date.now(),
      product: f.product,
      quantity: Number(f.quantity) || 0,
      order_date: parseTaskDate(f.orderDate) || new Date().toISOString().slice(0, 10),
      arrival_date: parseTaskDate(f.arrivalDate) || new Date().toISOString().slice(0, 10),
      status: f.status,
    };
    const ok = await saveRow('tmk_purchase_orders', row, 'บันทึก PO', {
      action: data ? 'update' : 'create', entityType: 'po', entityName: row.product,
      summary: `${data ? 'แก้ไข' : 'เปิด'} PO "${row.product}" (${row.quantity} ชิ้น)`,
    });
    setBusy(false);
    if (ok) onClose();
  };
  const footer = (<><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn btn-primary" disabled={busy} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก PO'}</button></>);
  return (
    <Modal icon="box" title={data ? 'แก้ไข PO' : 'เปิด PO การผลิตใหม่'} sub="สั่งผลิตสินค้ากับโรงงาน" onClose={onClose} footer={footer}>
      <div className="field"><label>รายการสินค้า</label>
        <select className="input" value={f.product} onChange={e => set('product', e.target.value)}>
          {MD.products.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </div>
      <div className="field-row">
        <div className="field"><label>จำนวน (ตัว)</label><input type="number" className="input num" value={f.quantity} onChange={e => set('quantity', e.target.value)} placeholder="0" /></div>
        <div className="field"><label>สถานะ</label>
          <div className="segbar">
            <button className={'seg' + (f.status === 'Pending' ? ' active' : '')} onClick={() => set('status', 'Pending')}>กำลังผลิต</button>
            <button className={'seg' + (f.status === 'Completed' ? ' active' : '')} onClick={() => set('status', 'Completed')}>ของเข้าแล้ว</button>
          </div>
        </div>
      </div>
      <div className="field-row">
        <div className="field"><label>วันที่สั่ง</label><input className="input" value={f.orderDate} onChange={e => set('orderDate', e.target.value)} placeholder="15 มิ.ย." /></div>
        <div className="field"><label>กำหนดของเข้า</label><input className="input" value={f.arrivalDate} onChange={e => set('arrivalDate', e.target.value)} placeholder="02 ก.ค." /></div>
      </div>
    </Modal>
  );
}

/* ---------- Monthly Target modal ---------- */
export function MonthlyTargetModal({ onClose }) {
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const _t = getToday();
  const [month, setMonth] = useState(`${months[_t.month - 1]} ${_t.yearBE}`);
  // ไม่ใส่ค่าให้เอง — โหลดค่าจริงที่เคยตั้งไว้ (ถ้ามี) ไม่งั้นว่าง
  const [total, setTotal] = useState(MD.consts.TARGET || '');
  const [chTargets, setChTargets] = useState(MD.channels.map(c => ({ id: c.id, name: c.name, hex: c.hex, target: c.target || '' })));
  const [adTotal, setAdTotal] = useState(MD.consts.AD_BUDGET || '');
  const [adChannels, setAdChannels] = useState(MD.channels.filter(c => c.hasAd).map(c => ({ id: c.id, name: c.name, hex: c.hex, budget: c.ad || '' })));
  const [newCustTarget, setNewCustTarget] = useState('');
  const [acosCeil, setAcosCeil] = useState(MD.consts.ACOS_CEIL || 25);

  const chSum = chTargets.reduce((a, c) => a + (+c.target || 0), 0);
  const adSum = adChannels.reduce((a, c) => a + (+c.budget || 0), 0);
  const match = chSum === +total;

  const upCh = (i, v) => setChTargets(ts => ts.map((t, j) => j === i ? { ...t, target: v } : t));
  const upAd = (i, v) => setAdChannels(ts => ts.map((t, j) => j === i ? { ...t, budget: v } : t));

  const monthOptions = [];
  [2569, 2570].forEach(y => months.forEach(m => monthOptions.push(`${m} ${y}`)));

  const [busy, setBusy] = useState(false);
  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { error: e1 } = await supabase.from('tmk_settings').upsert({
        id: 'main',
        total_target: Number(total) || 0,
        ad_budget_total: Number(adTotal) || 0,
        new_cust_target: Number(newCustTarget) || 0,
        acos_ceil: Number(acosCeil) || 25,
      });
      if (e1) throw e1;
      for (const c of chTargets) {
        const { error } = await supabase.from('tmk_channels').update({ percentage: Number(c.target) || 0 }).eq('id', c.id);
        if (error) throw error;
      }
      for (const c of adChannels) {
        const { error } = await supabase.from('tmk_channels').update({ ad: Number(c.budget) || 0 }).eq('id', c.id);
        if (error) throw error;
      }
      logAudit({ action: 'update', entityType: 'settings', entityName: month, summary: `ตั้งเป้ารายเดือน ${month} (${B(total)})` });
      toast('บันทึกเป้าหมายเรียบร้อย', 'success');
      onClose();
    } catch (err) {
      toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };
  const footer = (
    <>
      <button className="btn" onClick={onClose}>ยกเลิก</button>
      <button className="btn btn-primary" disabled={busy} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
    </>
  );
  return (
    <Modal icon="target" title="ตั้งเป้าหมายรายเดือน" sub="กำหนดเป้ายอดขายและงบโฆษณา" onClose={onClose} footer={footer} wide>
      <div className="field" style={{ maxWidth: 220 }}>
        <label>เดือน/ปี</label>
        <select className="input" value={month} onChange={e => setMonth(e.target.value)}>
          {monthOptions.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      <div className="field">
        <label>เป้ายอดรวม (฿)</label>
        <input type="number" className="input" value={total} onChange={e => setTotal(e.target.value)} />
      </div>

      <div className="field">
        <label>เป้าต่อช่อง</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {chTargets.map((c, i) => (
            <div key={c.id} className="row" style={{ gap: 10 }}>
              <span className="row" style={{ gap: 7, width: 100, fontWeight: 600 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: c.hex }}></span>{c.name}
              </span>
              <input type="number" className="input" style={{ flex: 1 }} value={c.target} onChange={e => upCh(i, +e.target.value)} />
            </div>
          ))}
        </div>
        <div className="row between" style={{ marginTop: 8 }}>
          <span className="cap">รวมช่องทาง: {B(chSum)}</span>
          {match
            ? <span className="chip chip-good">ตรงกับเป้ารวม</span>
            : <span className="chip chip-warn">ต่างจากเป้ารวม {B(Math.abs(chSum - total))}</span>}
        </div>
      </div>

      <div className="field">
        <label>งบแอดรวม (฿)</label>
        <input type="number" className="input" value={adTotal} onChange={e => setAdTotal(e.target.value)} />
      </div>

      <div className="field">
        <label>งบแอดต่อช่อง</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {adChannels.map((c, i) => (
            <div key={c.id} className="row" style={{ gap: 10 }}>
              <span className="row" style={{ gap: 7, width: 100, fontWeight: 600 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: c.hex }}></span>{c.name}
              </span>
              <input type="number" className="input" style={{ flex: 1 }} value={c.budget} onChange={e => upAd(i, +e.target.value)} />
            </div>
          ))}
        </div>
        <div className="cap" style={{ marginTop: 6 }}>รวมงบแอด: {B(adSum)}</div>
      </div>

      <div className="field-row">
        <div className="field">
          <label>เป้าลูกค้าใหม่</label>
          <input type="number" className="input" value={newCustTarget} onChange={e => setNewCustTarget(e.target.value)} />
        </div>
        <div className="field">
          <label>เพดาน ACOS %</label>
          <input type="number" className="input" value={acosCeil} onChange={e => setAcosCeil(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Ad Campaign modal ---------- */
export function AdCampaignModal({ data, onClose }) {
  const [f, setF] = useState(data || {
    name: '', platform: 'Facebook', budget: '', startDate: '', endDate: '', goal: 'Conversion', status: 'กำลังดำเนินการ'
  });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const platforms = ['Facebook', 'TikTok', 'Shopee', 'Lazada'];
  const goals = ['Awareness', 'Conversion', 'Retargeting'];
  const statuses = ['กำลังดำเนินการ', 'หยุดชั่วคราว', 'จบแล้ว'];
  const statusMap = { 'กำลังดำเนินการ': 'live', 'หยุดชั่วคราว': 'paused', 'จบแล้ว': 'done' };
  const [busy, setBusy] = useState(false);
  const handleSave = async () => {
    if (busy || !f.name.trim()) return;
    setBusy(true);
    const row = {
      id: data?.id || 'ac' + Date.now(),
      name: f.name.trim(),
      platform: f.platform,
      budget: Number(f.budget) || 0,
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
    });
    setBusy(false);
    if (ok) onClose();
  };

  const footer = (
    <>
      <button className="btn" onClick={onClose}>ยกเลิก</button>
      <button className="btn btn-primary" disabled={busy} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
    </>
  );
  return (
    <Modal icon="zap" title={data ? 'แก้ไขแคมเปญแอด' : 'สร้างแคมเปญแอด'} sub="ตั้งค่าแคมเปญโฆษณา" onClose={onClose} footer={footer}>
      <div className="field">
        <label>ชื่อแคมเปญ</label>
        <input className="input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="เช่น Polo Signature — Awareness" />
      </div>

      <div className="field">
        <label>แพลตฟอร์ม</label>
        <div className="chips-pick">
          {platforms.map(p => (
            <button key={p} className={'pick' + (f.platform === p ? ' on' : '')} onClick={() => set('platform', p)}>{p}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>งบประมาณ (฿)</label>
        <input type="number" className="input" value={f.budget} onChange={e => set('budget', e.target.value)} placeholder="0" />
      </div>

      <div className="field-row">
        <div className="field">
          <label>วันเริ่ม</label>
          <input type="date" className="input" value={f.startDate} onChange={e => set('startDate', e.target.value)} />
        </div>
        <div className="field">
          <label>วันจบ</label>
          <input type="date" className="input" value={f.endDate} onChange={e => set('endDate', e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label>เป้าหมาย</label>
        <div className="chips-pick">
          {goals.map(g => (
            <button key={g} className={'pick' + (f.goal === g ? ' on' : '')} onClick={() => set('goal', g)}>{g}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>สถานะ</label>
        <div className="chips-pick">
          {statuses.map(s => (
            <button key={s} className={'pick' + (f.status === s ? ' on' : '')} onClick={() => set('status', s)}>{s}</button>
          ))}
        </div>
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

  const upSeg = (i, k, v) => setSegments(ss => ss.map((s, j) => j === i ? { ...s, [k]: v } : s));
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
        count: Number(s.count) || 0,
        rev_pct: Number(s.revPct) || 0,
        color: typeof s.color === 'string' ? s.color : '#3b82f6',
        criteria: s.criteria,
        avg_clv: Number(clv) || 0,
        sort_order: i + 1,
      }));
      const { error } = await supabase.from('tmk_customer_segments').upsert(rows);
      if (error) throw error;
      logAudit({ action: 'update', entityType: 'segment', entityName: 'กลุ่มลูกค้า', summary: 'อัปเดตกลุ่มลูกค้า (RFM)' });
      toast('บันทึกกลุ่มลูกค้าเรียบร้อย', 'success');
      onClose();
    } catch (err) {
      toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };
  const footer = (
    <>
      <button className="btn" onClick={onClose}>ยกเลิก</button>
      <button className="btn btn-primary" disabled={busy} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
    </>
  );
  return (
    <Modal icon="users" title="อัปเดตกลุ่มลูกค้า" sub="จัดกลุ่มลูกค้าตามพฤติกรรมการซื้อ" onClose={onClose} footer={footer}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {segments.map((seg, i) => (
          <div key={seg.name} style={{ padding: '12px 14px', borderRadius: 'var(--r)', background: 'var(--surface-2)', borderLeft: `3px solid ${seg.color}` }}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <span className="sm" style={{ fontWeight: 700 }}>{seg.name}</span>
              <span className="cap" style={{ color: 'var(--ink-3)' }}>{seg.criteria}</span>
            </div>
            <div className="field-row">
              <div className="field">
                <label>จำนวน (คน)</label>
                <input type="number" className="input" value={seg.count} onChange={e => upSeg(i, 'count', +e.target.value)} />
              </div>
              <div className="field">
                <label>% รายได้</label>
                <input type="number" className="input" value={seg.revPct} onChange={e => upSeg(i, 'revPct', +e.target.value)} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label>CLV เฉลี่ย (฿)</label>
        <input type="number" className="input" value={clv} onChange={e => setClv(e.target.value)} />
      </div>

      <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 'var(--r)', background: 'var(--surface-2)' }}>
        <div className="row between">
          <span className="cap">ลูกค้ารวม: <strong>{N(totalCount)}</strong> คน</span>
          <span className="cap">รวม % รายได้: <strong>{totalRevPct}%</strong>
            {totalRevPct === 100 ? ' ✓' : <span style={{ color: 'var(--warn)' }}> (ควรเป็น 100%)</span>}
          </span>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Historical Entry modal ---------- */
export function HistoricalEntryModal({ onClose }) {
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const year = getToday().yearBE;
  const monthlyRef = MD.monthly || [];
  const initRows = months.map((m, i) => {
    const ref = monthlyRef.find(r => r.year === year && r.month === i + 1);
    return {
      month: m,
      rev: ref && ref.actual ? ref.actual : '',
      orders: ref && ref.orders ? ref.orders : '',
      ad: '',
      newCust: '',
      messages: ref && ref.messages ? ref.messages : '',
    };
  });
  const [rows, setRows] = useState(initRows);
  const up = (i, k, v) => setRows(rs => rs.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [busy, setBusy] = useState(false);
  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const dbRows = rows
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r.rev !== '' || r.orders !== '' || r.ad !== '' || r.newCust !== '' || r.messages !== '')
        .map(({ r, i }) => ({
          id: `${year}-${String(i + 1).padStart(2, '0')}`,
          month: i + 1,
          year,
          month_th: r.month,
          target: 0,
          actual: Number(r.rev) || 0,
          projected: 0,
          orders: Number(r.orders) || 0,
          ad_spend: Number(r.ad) || 0,
          new_cust: Number(r.newCust) || 0,
          messages: Number(r.messages) || 0,
        }));
      if (dbRows.length === 0) { toast('ไม่มีข้อมูลให้บันทึก', 'error'); setBusy(false); return; }
      const { error } = await supabase.from('tmk_monthly_history').upsert(dbRows);
      if (error) throw error;
      logAudit({ action: 'update', entityType: 'monthly', entityName: 'ข้อมูลย้อนหลัง', summary: `บันทึกข้อมูลย้อนหลัง ${dbRows.length} เดือน` });
      toast('บันทึกข้อมูลย้อนหลังเรียบร้อย', 'success');
      onClose();
    } catch (err) {
      toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };
  const footer = (
    <>
      <button className="btn" onClick={onClose}>ยกเลิก</button>
      <button className="btn btn-primary" disabled={busy} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
    </>
  );
  return (
    <Modal icon="clock" title="กรอกข้อมูลย้อนหลัง" sub="ป้อนยอดขายรายเดือนเพื่อเปรียบเทียบแนวโน้ม" onClose={onClose} footer={footer} wide>
      <div className="table-wrap">
        <table className="table" style={{ minWidth: 640 }}>
          <thead><tr>
            <th>เดือน</th>
            <th style={{ textAlign: 'right' }}>ยอดรวม (฿)</th>
            <th style={{ textAlign: 'right' }}>ออร์เดอร์</th>
            <th style={{ textAlign: 'right' }}>ค่าแอด (฿)</th>
            <th style={{ textAlign: 'right' }}>ลูกค้าใหม่</th>
            <th style={{ textAlign: 'right' }}>จำนวนข้อความ</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.month}>
                <td style={{ fontWeight: 600 }}>{r.month}</td>
                <td style={{ padding: '5px 8px' }}><input type="number" className="input num" style={{ textAlign: 'right' }} placeholder="0" value={r.rev} onChange={e => up(i, 'rev', e.target.value)} /></td>
                <td style={{ padding: '5px 8px' }}><input type="number" className="input num" style={{ textAlign: 'right', width: 90 }} placeholder="0" value={r.orders} onChange={e => up(i, 'orders', e.target.value)} /></td>
                <td style={{ padding: '5px 8px' }}><input type="number" className="input num" style={{ textAlign: 'right' }} placeholder="0" value={r.ad} onChange={e => up(i, 'ad', e.target.value)} /></td>
                <td style={{ padding: '5px 8px' }}><input type="number" className="input num" style={{ textAlign: 'right', width: 90 }} placeholder="0" value={r.newCust} onChange={e => up(i, 'newCust', e.target.value)} /></td>
                <td style={{ padding: '5px 8px' }}><input type="number" className="input num" style={{ textAlign: 'right', width: 90 }} placeholder="0" value={r.messages} onChange={e => up(i, 'messages', e.target.value)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/* ---------- Login screen ---------- */
export function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [agree, setAgree] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const submit = (e) => { e.preventDefault(); if (agree) onLogin(email.trim() || 'jiraphon.e@tmk.co'); };
  return (
    <div className="login">
      <div className="login-art">
        <div className="blob b1"></div><div className="blob b2"></div><div className="gridlines"></div>
        <div className="login-logo"><img src={tmkLogoWhite} alt="TMK" /></div>
        <div className="login-head">
          <div className="eyebrow" style={{ color: 'rgba(255,255,255,0.65)', marginBottom: 12 }}>TMK OPERATION</div>
          <h1>ศูนย์ปฏิบัติการ<br />บริหารแบรนด์<br />ครบในที่เดียว</h1>
          <p>ดูยอดขายทุกช่องทาง บันทึกข้อมูลรายวัน วางแผนงาน คุมแคมเปญ จัดการสต็อก และดูภาพรวมธุรกิจแบบเรียลไทม์</p>
        </div>
        <div className="login-stats">
          <div><div className="ls-v">{MD.consts.TARGET ? Bk(MD.consts.TARGET) : '฿1M'}</div><div className="ls-l">เป้ายอดขาย/เดือน</div></div>
          <div><div className="ls-v">{MD.channels.length || 6}</div><div className="ls-l">ช่องทางการขาย</div></div>
          <div><div className="ls-v">{(MD.roles && MD.roles.length) || (MD.staff && MD.staff.length) || 4}</div><div className="ls-l">ทีมผู้ใช้งาน</div></div>
        </div>
      </div>

      <div className="login-form-wrap">
        <form className="login-card" onSubmit={submit}>
          <div className="row" style={{ gap: 11, marginBottom: 20 }}>
            <div className="rail-brand" style={{ margin: 0, width: 44, height: 44 }}><img src={tmkLogoWhite} alt="" /></div>
            <div><div className="h2">เข้าสู่ระบบ TMK</div><div className="cap">ยินดีต้อนรับกลับมา 👋</div></div>
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>อีเมล</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@tmk.co" />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>รหัสผ่าน</label>
            <input className="input" type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={agree} onChange={e => { if (!agree) { setShowTerms(true); } else { setAgree(false); } }} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
              <span className="cap">ยอมรับ<button type="button" onClick={e => { e.preventDefault(); setShowTerms(true); }} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 'inherit', fontFamily: 'inherit' }}>ข้อตกลงและกฎระเบียบการใช้งานระบบ</button></span>
            </label>
          </div>

          {/* Terms & Conditions Modal */}
          {showTerms && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setShowTerms(false)}>
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,18,32,0.6)', backdropFilter: 'blur(4px)' }}></div>
              <div onClick={e => e.stopPropagation()} style={{
                position: 'relative', width: '100%', maxWidth: 560, maxHeight: '85vh',
                background: 'var(--surface)', borderRadius: 'var(--r-xl)',
                boxShadow: '0 12px 48px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
              }}>
                {/* Header */}
                <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'grid', placeItems: 'center' }}>
                    <Icon name="shield" />
                  </span>
                  <div style={{ flex: 1 }}>
                    <div className="h3">ข้อตกลงและกฎระเบียบการใช้งานระบบ</div>
                    <div className="cap">TMK Operation — กรุณาอ่านก่อนยอมรับ</div>
                  </div>
                  <button type="button" onClick={() => setShowTerms(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', width: 24, height: 24 }}>
                    <Icon name="x" />
                  </button>
                </div>

                {/* Content — scrollable */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', lineHeight: 1.8 }}>
                  <h3 style={{ color: 'var(--ink)', marginBottom: 8 }}>1. ขอบเขตการใช้งาน</h3>
                  <p style={{ marginBottom: 16 }}>
                    ระบบ TMK Operation เป็นเครื่องมือภายในสำหรับบริหารจัดการธุรกิจแบรนด์ TMK เท่านั้น ผู้ใช้งานต้องเป็นบุคลากรของบริษัทหรือได้รับอนุญาตจากผู้ดูแลระบบ ห้ามมิให้ใช้งานระบบเพื่อวัตถุประสงค์อื่นนอกเหนือจากการบริหารธุรกิจ
                  </p>

                  <h3 style={{ color: 'var(--ink)', marginBottom: 8 }}>2. บัญชีผู้ใช้และความปลอดภัย</h3>
                  <p style={{ marginBottom: 16 }}>
                    ผู้ใช้งานต้องรักษาความลับของอีเมลและรหัสผ่าน ห้ามแบ่งปันข้อมูลการเข้าสู่ระบบกับบุคคลภายนอก หากพบว่ามีการเข้าถึงบัญชีโดยไม่ได้รับอนุญาต ให้แจ้งผู้ดูแลระบบทันที ผู้ใช้งานต้องรับผิดชอบต่อทุกการกระทำที่เกิดขึ้นภายใต้บัญชีของตน
                  </p>

                  <h3 style={{ color: 'var(--ink)', marginBottom: 8 }}>3. ข้อมูลที่เป็นความลับ</h3>
                  <p style={{ marginBottom: 16 }}>
                    ข้อมูลทั้งหมดในระบบ ได้แก่ ยอดขาย ข้อมูลลูกค้า กลยุทธ์การตลาด ข้อมูลสินค้า ราคา ต้นทุน ค่าโฆษณา และข้อมูลทางธุรกิจอื่น ๆ ถือเป็นความลับทางการค้า ห้ามมิให้เปิดเผย คัดลอก แจกจ่าย หรือนำไปใช้นอกเหนือจากการปฏิบัติงาน การละเมิดอาจถูกดำเนินการทางกฎหมาย
                  </p>

                  <h3 style={{ color: 'var(--ink)', marginBottom: 8 }}>4. สิทธิ์การเข้าถึงและระดับผู้ใช้</h3>
                  <p style={{ marginBottom: 16 }}>
                    ระบบแบ่งสิทธิ์เป็น 3 ระดับ: <strong>ผู้ดูแลระบบ</strong> (จัดการได้ทุกอย่าง รวมถึงสิทธิ์ผู้ใช้), <strong>แก้ไขได้</strong> (บันทึกยอดขาย จัดการงาน แก้ไขข้อมูล), <strong>ดูอย่างเดียว</strong> (เปิดดูข้อมูลได้แต่ไม่สามารถแก้ไข) ผู้ดูแลระบบเป็นผู้กำหนดสิทธิ์ของแต่ละบุคคล
                  </p>

                  <h3 style={{ color: 'var(--ink)', marginBottom: 8 }}>5. การบันทึกข้อมูลและความถูกต้อง</h3>
                  <p style={{ marginBottom: 16 }}>
                    ผู้ใช้งานต้องกรอกข้อมูลยอดขายรายวันอย่างถูกต้องและตรงเวลา ข้อมูลที่บันทึกจะถูกใช้ในการวิเคราะห์ภาพรวมธุรกิจ การกรอกข้อมูลเท็จหรือบิดเบือนข้อมูลถือเป็นการกระทำที่ร้ายแรง ทุกการเปลี่ยนแปลงจะถูกบันทึกไว้ในประวัติการใช้งาน (Audit Log) เพื่อตรวจสอบย้อนหลัง
                  </p>

                  <h3 style={{ color: 'var(--ink)', marginBottom: 8 }}>6. การใช้งานอุปกรณ์และเครือข่าย</h3>
                  <p style={{ marginBottom: 16 }}>
                    ควรเข้าใช้งานระบบผ่านเครือข่ายที่ปลอดภัย หลีกเลี่ยงการใช้งานผ่าน Wi-Fi สาธารณะที่ไม่เข้ารหัส เมื่อใช้งานเสร็จให้ออกจากระบบทุกครั้ง โดยเฉพาะเมื่อใช้เครื่องคอมพิวเตอร์ร่วมกับผู้อื่น
                  </p>

                  <h3 style={{ color: 'var(--ink)', marginBottom: 8 }}>7. การสำรองข้อมูลและการกู้คืน</h3>
                  <p style={{ marginBottom: 16 }}>
                    ข้อมูลที่ลบจะถูกเก็บไว้ในถังขยะเป็นเวลา 30 วันก่อนลบถาวร สามารถกู้คืนได้ตลอดภายในระยะเวลาดังกล่าว ระบบจะสำรองข้อมูลอัตโนมัติเมื่อเชื่อมต่อกับ Supabase
                  </p>

                  <h3 style={{ color: 'var(--ink)', marginBottom: 8 }}>8. การเปลี่ยนแปลงข้อตกลง</h3>
                  <p style={{ marginBottom: 16 }}>
                    บริษัทขอสงวนสิทธิ์ในการเปลี่ยนแปลงข้อตกลงนี้โดยไม่ต้องแจ้งล่วงหน้า ผู้ใช้งานสามารถตรวจสอบข้อตกลงฉบับล่าสุดได้ที่หน้าตั้งค่าของระบบ การใช้งานระบบต่อเนื่องหลังจากการเปลี่ยนแปลงถือว่าผู้ใช้ยอมรับข้อตกลงฉบับใหม่
                  </p>

                  <h3 style={{ color: 'var(--ink)', marginBottom: 8 }}>9. การระงับการใช้งาน</h3>
                  <p style={{ marginBottom: 16 }}>
                    ผู้ดูแลระบบมีสิทธิ์ระงับหรือยกเลิกบัญชีผู้ใช้ได้ทุกเมื่อ ในกรณีที่พบว่ามีการฝ่าฝืนข้อตกลง ใช้งานอย่างไม่เหมาะสม หรือเมื่อบุคลากรพ้นจากการปฏิบัติงาน
                  </p>

                  <div style={{ padding: '14px 16px', background: 'var(--accent-soft)', borderRadius: 'var(--r)', borderLeft: '3px solid var(--accent)', marginTop: 8 }}>
                    <div className="sm" style={{ fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}>หมายเหตุ</div>
                    <div className="cap" style={{ lineHeight: 1.6 }}>
                      การกด "ยอมรับและดำเนินการต่อ" ถือว่าท่านได้อ่าน เข้าใจ และยินยอมปฏิบัติตามข้อตกลงและกฎระเบียบทั้งหมดข้างต้น
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '14px 24px', borderTop: '1px solid var(--line)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
                  <button type="button" className="btn" onClick={() => setShowTerms(false)}>ปิด</button>
                  <button type="button" className="btn btn-primary" onClick={() => { setAgree(true); setShowTerms(false); }}>
                    <Icon name="check" /> ยอมรับและดำเนินการต่อ
                  </button>
                </div>
              </div>
            </div>
          )}
          <button className="btn btn-primary" type="submit" disabled={!agree} style={{ width: '100%', justifyContent: 'center', padding: '11px', opacity: agree ? 1 : 0.5 }}>
            เข้าสู่ระบบ (Sign In) <Icon name="arrowR" />
          </button>
        </form>
      </div>
    </div>
  );
}
