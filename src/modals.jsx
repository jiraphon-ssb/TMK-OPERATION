/* ============================================================
   TMK Operation — Modals & Login
   ============================================================ */
import { useState, useEffect, useMemo, useRef } from 'react';
import { TMK } from './data.js';
import { B, Bk, P, N, Icon, readImageCompressed, SIZES, SHIRT_COLORS, lotTotal as calcLotTotal, lotValue as calcLotValue, barcodeSVGString, Barcode, orderStatusMeta } from './components.jsx';
import tmkLogo from './assets/tmk-logo.png';
import { useLang } from './i18n.jsx';
import { supabase } from './lib/supabaseClient.js';
import { parseTaskDate, getToday, todayISO, thaiDate } from './lib/dateUtils.js';
import { logAudit } from './lib/audit.js';
import { computeMonth } from './dataContext.jsx';

// Toast helper
const toast = (m, k = 'success') => window.__toast?.(m, k);

// แปลงเลข + กันค่าติดลบ + clamp เพดาน 1e12 (กันเลขมหาศาล 1e308 ทำลายกราฟ/ยอดรวม)
const nn = (v) => Math.max(0, Math.min(Number(v) || 0, 1e12));
// ปัดเงินเป็น 2 ตำแหน่งสตางค์ (ตัด noise float เช่น 1473.8400000000001 → 1473.84) — ค่าจริงครบ
const money = (v) => Math.max(0, Math.round((Number(v) || 0) * 100) / 100); // เงิน ≥ 0 เสมอ (กันค่าติดลบจากการ paste)
// เงิน → ข้อความ ฿ + สตางค์ 2 ตำแหน่งเสมอ (ใช้ใน confirm/audit ให้ตรงกับทั้งเว็บ)
const bahtStr = (v) => '฿' + (Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// เตือนทิ้งข้อมูลก่อนปิด (ใช้ร่วมกับ Modal + ปุ่มยกเลิก ให้สม่ำเสมอ)
const DISCARD_MSG = 'ปิดหน้านี้? ข้อมูลที่ยังไม่ได้บันทึกจะหายไป';
const guardClose = (touched, onClose) => { if (touched && !window.confirm(DISCARD_MSG)) return; onClose(); };

// ID ที่ไม่ชนกัน (กันกดบันทึกซ้ำ/หลายคนพร้อมกัน → ข้อมูลซ้ำหรือทับกัน)
const uid = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Generic save wrapper — ส่ง audit (optional) เพื่อบันทึกประวัติการใช้งานเมื่อสำเร็จ
async function saveRow(table, row, label = 'บันทึก', audit = null) {
  try {
    const { error } = await supabase.from(table).upsert(row);
    if (error) throw error;
    if (audit) logAudit(audit);
    window.__reload?.(); // รีโหลดทันที (กันหน้าค้างถ้า realtime ช้า)
    toast(label + 'สำเร็จ', 'success');
    return true;
  } catch (err) {
    console.error(`Save ${table} failed:`, err);
    toast(label + 'ไม่สำเร็จ: ' + err.message, 'error');
    return false;
  }
}

// Generic soft-delete (ย้ายไปถังขยะ — กู้คืนได้) สำหรับโมดัลที่แก้ไขอยู่
async function deleteRow(table, id, label, audit = null) {
  if (!window.confirm(`ลบ${label}?\nจะย้ายไปถังขยะ (กู้คืนได้ภายหลัง)`)) return false;
  try {
    const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      if (/deleted_at/.test(error.message || '')) { toast('ต้องรัน SQL migration (deleted_at) ก่อนจึงจะลบได้', 'error'); return false; }
      throw error;
    }
    if (audit) logAudit(audit);
    window.__reload?.();
    toast(`ย้าย${label}ไปถังขยะแล้ว`, 'success');
    return true;
  } catch (err) { toast('ลบไม่สำเร็จ: ' + err.message, 'error'); return false; }
}

const MD = TMK;

/* ---------- Modal shell ---------- */
export function Modal({ icon, title, sub, onClose, footer, wide, children, confirmOnClose }) {
  // กันข้อมูลหายเงียบ: ถ้ามีการแก้ไขค้าง (confirmOnClose) → ถามก่อนปิดด้วย ESC/พื้นหลัง/ปุ่ม X
  const tryClose = () => {
    if (confirmOnClose && !window.confirm(DISCARD_MSG)) return;
    onClose();
  };
  const boxRef = useRef(null);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') tryClose(); };
    window.addEventListener('keydown', onKey);
    boxRef.current?.focus?.(); // โฟกัสเข้า modal เมื่อเปิด (a11y)
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmOnClose]);
  return (
    <div className="modal-scrim" onClick={tryClose}>
      <div ref={boxRef} className={'modal' + (wide ? ' modal-lg' : '')} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div className="modal-head">
          {icon && <div className="mh-icon"><Icon name={icon} /></div>}
          <div style={{ minWidth: 0 }}>
            <div className="modal-title">{title}</div>
            {sub && <div className="modal-sub">{sub}</div>}
          </div>
          <button className="icon-btn modal-x" onClick={tryClose} aria-label="ปิด"><Icon name="x" /></button>
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
  const [exists, setExists] = useState(false); // มีข้อมูลวันนี้ใน DB แล้ว → โชว์ปุ่มลบ
  const [openSecondary, setOpenSecondary] = useState({}); // ผู้ใช้กดเปิดแถวรอง (คนทัก/ลูกค้าใหม่-เก่า) เอง — ต่อ channel
  const [touched, setTouched] = useState(false); // มีการแก้ไขค้าง → เตือนก่อนปิด
  const loadDirty = useRef(false); // ผู้ใช้พิมพ์ระหว่างที่ข้อมูลกำลังโหลด → กันโหลดมาทับ (race fix)
  const beforeRef = useRef(null); // ค่าเดิมจาก DB ตอนเปิด (snapshot) → ทำ log ก่อน→หลัง + เก็บค่าที่ถูกลบ

  // โหลดข้อมูลเดิมของวันที่เลือก (แก้เดือน/วันเก่าได้); ถ้าไม่มี = ว่าง
  const colMap = { shopee: 'shopee', tiktok: 'tiktok', lazada: 'lazada', facebook: 'facebook', line: 'line_oa', crm: 'crm' };
  const numStr = (v) => (v != null && v !== '' && !isNaN(Number(v))) ? String(v) : ''; // โชว์ค่าจริงรวม 0 (กัน 0→ช่องว่าง)
  useEffect(() => {
    let cancel = false;
    loadDirty.current = false; // เริ่มโหลดวันใหม่ = ยังไม่พิมพ์
    (async () => {
      const { data: row } = await supabase.from('tmk_daily_sales').select('*').eq('id', 'd-' + date).maybeSingle();
      if (cancel) return;
      setExists(!!row && !row.deleted_at);
      // snapshot ค่าเดิมจาก DB (ทุก field/ช่องทาง) — ใช้ทำ log ก่อน→หลัง + merge กันช่องเดิมหายตอนเซฟ
      beforeRef.current = row ? {
        channels: (row.channels && typeof row.channels === 'object') ? { ...row.channels } : {},
        note: row.note || '', chatTime: Number(row.avg_reply_minutes) || 0, deleted: !!row.deleted_at,
      } : null;
      // ผู้ใช้พิมพ์ระหว่างโหลด → ไม่เอาข้อมูล DB มาทับ (กันที่พิมพ์ไป 1-2 ตัวหาย)
      if (loadDirty.current) return;
      setTouched(false); // โหลดวันใหม่ = ยังไม่นับว่าแก้
      if (row) {
        const cj = (row.channels && typeof row.channels === 'object') ? row.channels : {};
        setRows(MD.channels.map(c => {
          const j = cj[c.id] || {};
          const col = colMap[c.id];
          // รายได้: เอาจาก jsonb ก่อน, ถ้าไม่มี fallback คอลัมน์เดิม (ข้อมูลเก่า)
          const rev = j.rev != null ? j.rev : (col ? row[col] : 0);
          return { id: c.id, rev: numStr(rev), ord: numStr(j.ord), ad: numStr(j.ad), inq: numStr(j.inq), newC: numStr(j.newC), oldC: numStr(j.oldC) };
        }));
        setNote(row.note || '');
        setChatTime(numStr(row.avg_reply_minutes));
      } else {
        setRows(emptyRows());
        setNote('');
        setChatTime('');
      }
    })();
    return () => { cancel = true; };
  }, [date]);

  const up = (i, k, v) => {
    // Validation: no negative numbers
    if (+v < 0) return;
    loadDirty.current = true; // พิมพ์แล้ว → กันข้อมูลที่กำลังโหลดมาทับค่าที่พิมพ์
    setTouched(true);
    setRows(rs => rs.map((r, j) => j === i ? { ...r, [k]: v } : r));
  };

  // Save handler — upsert ลง tmk_daily_sales (id = "d-YYYY-MM-DD")
  const handleSave = async () => {
    if (saving) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('เลือกวันที่ให้ถูกต้องก่อนบันทึก', 'error'); return; } // กัน id ขยะ 'd-'
    if (date > todayISO()) { toast('กรอกยอดล่วงหน้าไม่ได้ — เลือกวันที่ไม่เกินวันนี้', 'error'); return; } // กันยอดอนาคตดัน MTD เพี้ยน
    // กันพิมพ์ผิดหลัก (fat-finger): เทียบกับค่าเฉลี่ยรายวันของ "เดือนที่กรอก" (ตัดวันที่กำลังกรอกออก)
    const _tot = rows.reduce((a, r) => a + (Number(r.rev) || 0), 0);
    const _selDay = Number(String(date).split('-')[2]);
    const _days = (sel.dailyMonth || []).filter(d => d.d !== _selDay).map(d => d.rev).filter(v => v > 0);
    const _avg = _days.length ? _days.reduce((a, b) => a + b, 0) / _days.length : 0;
    if (_avg > 0 && _tot > _avg * 3) {
      const x = (_tot / _avg).toFixed(1);
      if (!window.confirm(`⚠️ ยอดวันนี้ ${bahtStr(_tot)} สูงกว่าค่าเฉลี่ยรายวัน ${x} เท่า (เฉลี่ย ${bahtStr(_avg)})\nตรวจสอบว่าพิมพ์ถูกหรือไม่ — ยืนยันบันทึก?`)) return;
    }
    setSaving(true);
    try {
      const dayNames = ['อา','จ','อ','พ','พฤ','ศ','ส'];
      const d = new Date(date + 'T00:00:00'); // parse local (กันเพี้ยน timezone ติดลบ)
      const day_name = dayNames[d.getDay()] || '';
      const byId = Object.fromEntries(rows.map(r => [r.id, r]));
      // per-channel jsonb เก็บครบทุก field (rev/ord/ad/inq/newC/oldC) — กันข้อมูลหาย
      const curChannels = {};
      for (const r of rows) {
        curChannels[r.id] = {
          rev: money(r.rev), ord: Number(r.ord) || 0, ad: money(r.ad),
          inq: Number(r.inq) || 0, newC: Number(r.newC) || 0, oldC: Number(r.oldC) || 0,
        };
      }
      // merge ค่าเดิมจาก DB ก่อน — ช่องทางที่ถูกลบ/ซ่อนออกจากรายการจะไม่สูญข้อมูลอดีต (data-loss fix)
      const channels = { ...(beforeRef.current?.channels || {}), ...curChannels };
      const row = {
        id: 'd-' + date,
        date,
        day_name,
        // คอลัมน์เดิม (รายได้) — คงไว้เพื่อ backward-compat
        shopee: money(byId.shopee?.rev),
        tiktok: money(byId.tiktok?.rev),
        lazada: money(byId.lazada?.rev),
        facebook: money(byId.facebook?.rev),
        line_oa: money(byId.line?.rev),
        crm: money(byId.crm?.rev),
        channels,
        ad_spend: money(rows.reduce((a, r) => a + (Number(r.ad) || 0), 0)),
        avg_reply_minutes: Number(chatTime) || 0,
        note: note || '',
        deleted_at: null, // กรอกวันเดิมที่เคยลบ → กู้กลับ (กันข้อมูลล่องหน)
      };
      let { error } = await supabase.from('tmk_daily_sales').upsert(row);
      // ถ้ายังไม่ได้รัน migration (ไม่มีคอลัมน์เสริม) → บันทึกแบบ core columns (รายได้ยังเก็บได้)
      if (error && /channels|avg_reply_minutes|deleted_at/i.test(error.message || '')) {
        const { channels: _c, avg_reply_minutes: _a, deleted_at: _d, ...legacy } = row;
        console.warn('tmk_daily_sales: ยังไม่มีคอลัมน์เสริม — บันทึกเฉพาะคอลัมน์หลัก รัน migration 20260608-daily-channel-detail.sql และ 20260608-daily-reply-time.sql');
        ({ error } = await supabase.from('tmk_daily_sales').upsert(legacy));
      }
      if (error) throw error;
      // ===== Audit: เก็บละเอียดสุด — ทุกช่องทาง ทุกตัวเลข + ก่อน→หลัง + machine data =====
      const chName = (id) => (MD.channels.find(c => c.id === id)?.name) || id;
      const nz = (v) => Number(v) || 0;
      const totRev = rows.reduce((a, r) => a + nz(r.rev), 0);
      const totOrd = rows.reduce((a, r) => a + nz(r.ord), 0);
      const totAd  = rows.reduce((a, r) => a + nz(r.ad), 0);
      const totInq = rows.reduce((a, r) => a + nz(r.inq), 0);
      const totNew = rows.reduce((a, r) => a + nz(r.newC), 0);
      const totOld = rows.reduce((a, r) => a + nz(r.oldC), 0);
      const chDetail = (o) => {
        const p = [];
        if (nz(o.rev))  p.push(bahtStr(o.rev));
        if (nz(o.ord))  p.push(`${nz(o.ord)} ออร์เดอร์`);
        if (nz(o.ad))   p.push(`แอด ${bahtStr(o.ad)}`);
        if (nz(o.inq))  p.push(`ทัก ${nz(o.inq)}`);
        if (nz(o.newC)) p.push(`ใหม่ ${nz(o.newC)}`);
        if (nz(o.oldC)) p.push(`เก่า ${nz(o.oldC)}`);
        return p.join(' · ');
      };
      const auditFields = [{ label: 'ยอดรวม', value: bahtStr(totRev) }];
      if (totOrd) auditFields.push({ label: 'ออร์เดอร์รวม', value: `${totOrd}` });
      if (totAd)  auditFields.push({ label: 'ค่าแอดรวม', value: bahtStr(totAd) });
      if (totInq) auditFields.push({ label: 'คนทักรวม', value: `${totInq}` });
      if (totNew) auditFields.push({ label: 'ลูกค้าใหม่รวม', value: `${totNew}` });
      if (totOld) auditFields.push({ label: 'ลูกค้าเก่ารวม', value: `${totOld}` });
      // ต่อช่องทาง — เก็บทุกช่องที่มีข้อมูล (ไม่กรองแค่ rev>0 อีกต่อไป → ไม่ตก inq/newC/oldC)
      rows.forEach(r => { const d = chDetail(r); if (d) auditFields.push({ label: chName(r.id), value: d }); });
      if (nz(chatTime) > 0) auditFields.push({ label: 'เวลาตอบแชทเฉลี่ย', value: `${chatTime} นาที` });
      if (note) auditFields.push({ label: 'โน้ต', value: note });

      // ก่อน→หลัง (เฉพาะแก้ของเดิมที่ยัง active) — ต่อช่องทาง ต่อตัวเลข
      const before = beforeRef.current;
      const isEdit = exists;
      let auditChanges = null;
      if (before && exists) {
        const ch = [];
        const mLabels = { rev: 'ยอด', ord: 'ออร์เดอร์', ad: 'ค่าแอด', inq: 'คนทัก', newC: 'ลูกค้าใหม่', oldC: 'ลูกค้าเก่า' };
        const fmt = (k, v) => (k === 'rev' || k === 'ad') ? bahtStr(nz(v)) : `${nz(v)}`;
        rows.forEach(r => {
          const o = before.channels?.[r.id] || {};
          Object.keys(mLabels).forEach(k => {
            if (nz(r[k]) !== nz(o[k])) ch.push({ label: `${chName(r.id)} · ${mLabels[k]}`, from: fmt(k, o[k]), to: fmt(k, r[k]) });
          });
        });
        if (nz(before.chatTime) !== nz(chatTime)) ch.push({ label: 'เวลาตอบแชท', from: `${nz(before.chatTime)} นาที`, to: `${nz(chatTime)} นาที` });
        if ((before.note || '') !== (note || '')) ch.push({ label: 'โน้ต', from: before.note || '—', to: note || '—' });
        if (ch.length) auditChanges = ch;
      }

      logAudit({
        action: isEdit ? 'update' : 'create',
        entityType: 'daily',
        entityName: date,
        summary: `${isEdit ? 'แก้ไข' : 'บันทึก'}ยอดขายวันที่ ${date} (รวม ${bahtStr(totRev)}${totOrd ? `, ${totOrd} ออร์เดอร์` : ''})`,
        fields: auditFields,
        changes: auditChanges,
        data: { date, day_name, channels, totals: { rev: totRev, ord: totOrd, ad: totAd, inq: totInq, newC: totNew, oldC: totOld }, avg_reply_minutes: nz(chatTime), note: note || '' },
      });
      window.__reload?.();
      toast(t('toastSaved'), 'success');
      onClose();
    } catch (err) {
      console.error('RecordSales save failed:', err);
      toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally { setSaving(false); }
  };

  // ค่าคงที่ + ยอดของ "เดือนของวันที่เลือก" (ไม่ใช่ค่า global ที่ค้างจาก import)
  const sel = useMemo(() => {
    const [yy, mm] = String(date).split('-').map(Number);
    return computeMonth((mm || 1) - 1, (yy || 2026) + 543);
  }, [date]);
  const M_TARGET = sel.consts.TARGET, M_DAY = sel.consts.DAY, M_DAYS = sel.consts.DAYS, M_ACOS = sel.consts.ACOS_CEIL;
  // base MTD = ยอดเดือนนี้ "ไม่รวมวันที่กำลังกรอก/แก้" → กัน preview บวกซ้ำตอนแก้วันเดิม
  const _selDay = Number(String(date).slice(8, 10));
  const _otherDays = (sel.dailyMonth || []).filter(d => d.d !== _selDay);
  const MTD = _otherDays.reduce((a, d) => a + (d.rev || 0), 0);
  const s = useMemo(() => {
    const tRev = rows.reduce((a, r) => a + (+r.rev || 0), 0);
    const tOrd = rows.reduce((a, r) => a + (+r.ord || 0), 0);
    const tAd = rows.reduce((a, r) => a + (+r.ad || 0), 0);
    const tNewC = rows.reduce((a, r) => a + (+r.newC || 0), 0);
    const tOldC = rows.reduce((a, r) => a + (+r.oldC || 0), 0);
    const aov = tOrd > 0 ? tRev / tOrd : 0;
    const acos = tRev > 0 ? (tAd / tRev) * 100 : 0;
    const newMtd = MTD + tRev;
    // ใช้ M_DAY (วันปัจจุบัน) ให้ตรงกับ Dashboard (computeMonth PACE_TGT) — ไม่ +1 เพื่อให้ pace ตรงกันทุกหน้า
    const paceDay = M_DAY > 0 ? M_DAY : 1;
    const pPct = M_TARGET > 0 ? (newMtd / ((M_TARGET / M_DAYS) * paceDay)) * 100 : 0;
    const rr = Math.round(newMtd / paceDay * M_DAYS);
    const avg = _otherDays.length > 0 ? _otherDays.reduce((a, d) => a + d.rev, 0) / _otherDays.length : 0; // เฉลี่ยจากวันอื่น (ไม่รวมวันที่กำลังแก้)
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
  }, [rows, sel]);

  const handleDelete = async () => {
    if (!window.confirm(`ลบข้อมูลยอดขายวันที่ ${date}?\nจะย้ายไปถังขยะ กู้คืนได้ภายหลัง`)) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('tmk_daily_sales').update({ deleted_at: new Date().toISOString() }).eq('id', 'd-' + date);
      if (error) {
        if (/deleted_at/.test(error.message || '')) { toast('ต้องรัน SQL migration (deleted_at) ใน Supabase ก่อนจึงจะลบได้', 'error'); setSaving(false); return; }
        throw error;
      }
      // เก็บค่าทั้งหมดที่กำลังลบ — ตรวจสอบ/กู้คืนได้ภายหลัง
      const _chName = (id) => (MD.channels.find(c => c.id === id)?.name) || id;
      const _nz = (v) => Number(v) || 0;
      const _totRev = rows.reduce((a, r) => a + _nz(r.rev), 0);
      const delFields = [{ label: 'ยอดรวมที่ลบ', value: bahtStr(_totRev) }];
      rows.forEach(r => {
        const p = [];
        if (_nz(r.rev))  p.push(bahtStr(r.rev));
        if (_nz(r.ord))  p.push(`${_nz(r.ord)} ออร์เดอร์`);
        if (_nz(r.ad))   p.push(`แอด ${bahtStr(r.ad)}`);
        if (_nz(r.inq))  p.push(`ทัก ${_nz(r.inq)}`);
        if (_nz(r.newC)) p.push(`ใหม่ ${_nz(r.newC)}`);
        if (_nz(r.oldC)) p.push(`เก่า ${_nz(r.oldC)}`);
        if (p.length) delFields.push({ label: _chName(r.id), value: p.join(' · ') });
      });
      if (_nz(chatTime)) delFields.push({ label: 'เวลาตอบแชท', value: `${chatTime} นาที` });
      if (note) delFields.push({ label: 'โน้ต', value: note });
      logAudit({ action: 'delete', entityType: 'daily', entityName: date, summary: `ลบยอดขายรายวันวันที่ ${date} (รวม ${bahtStr(_totRev)})`, fields: delFields, data: { date, channels: beforeRef.current?.channels || null, note: note || '', chatTime: _nz(chatTime) } });
      window.__reload?.();
      toast('ย้ายข้อมูลรายวันไปถังขยะแล้ว', 'success');
      onClose();
    } catch (err) { toast('ลบไม่สำเร็จ: ' + err.message, 'error'); }
    finally { setSaving(false); }
  };

  // คัดลอกยอดของเมื่อวานมาเป็นจุดเริ่ม (กรอกเร็วขึ้น) — ปรับแก้ได้ก่อนบันทึก
  const copyYesterday = async () => {
    const prev = new Date(date + 'T00:00:00'); prev.setDate(prev.getDate() - 1);
    const pid = 'd-' + `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
    const { data: row } = await supabase.from('tmk_daily_sales').select('*').eq('id', pid).maybeSingle();
    if (!row || row.deleted_at) { toast('ไม่พบข้อมูลของเมื่อวาน', 'error'); return; }
    const cj = (row.channels && typeof row.channels === 'object') ? row.channels : {};
    setRows(MD.channels.map(c => {
      const j = cj[c.id] || {}; const col = colMap[c.id];
      const rev = j.rev != null ? j.rev : (col ? row[col] : 0);
      return { id: c.id, rev: numStr(rev), ord: numStr(j.ord), ad: numStr(j.ad), inq: numStr(j.inq), newC: numStr(j.newC), oldC: numStr(j.oldC) };
    }));
    setChatTime(numStr(row.avg_reply_minutes));
    setTouched(true);
    toast('คัดลอกยอดเมื่อวานแล้ว — ปรับแก้ได้ก่อนบันทึก', 'success');
  };

  const footer = step === 1 ? (
    <>
      {exists && <button className="btn btn-sm" style={{ color: 'var(--bad)', marginRight: 'auto' }} disabled={saving} onClick={handleDelete}><Icon name="trash" /> ลบข้อมูลวันนี้</button>}
      <button className="btn" onClick={() => guardClose(touched, onClose)}>{t('cancel')}</button>
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
    <Modal icon="pencil" title={step === 1 ? 'บันทึกยอดขายประจำวัน' : 'ตรวจสอบก่อนบันทึก'} sub={step === 1 ? 'กรอกยอดแต่ละช่องทาง' : `ยอดขายวันที่ ${date}`} onClose={onClose} footer={footer} wide confirmOnClose={touched}>

      {/* Step indicator */}
      <div className="row" style={{ gap: 8, marginBottom: 4 }}>
        <span className={`chip ${step === 1 ? 'chip-accent' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setStep(1)}>1. กรอกข้อมูล</span>
        <span style={{ color: 'var(--ink-4)' }}>→</span>
        <span className={`chip ${step === 2 ? 'chip-accent' : ''}`}>2. ตรวจสอบ & บันทึก</span>
      </div>

      {step === 1 && (
        <>
          {/* Date + คัดลอกเมื่อวาน */}
          <div className="row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="field" style={{ maxWidth: 220, margin: 0 }}>
              <label>วันที่</label>
              <input type="date" className="input" max={todayISO()} value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <button type="button" className="btn btn-sm" onClick={copyYesterday} title="ดึงยอดของเมื่อวานมาเป็นจุดเริ่ม">
              <Icon name="refresh" /> คัดลอกเมื่อวาน
            </button>
          </div>

          {/* Channel cards — each channel is a card */}
          {rows.map((r, i) => {
            const ch = MD.channels.find(c => c.id === r.id) || { hex: 'var(--ink-3)', name: r.id, hasAd: false }; // กัน crash ถ้าช่องถูกลบขณะเปิด
            // แสดงแถวรอง (คนทัก/ลูกค้าใหม่/ลูกค้าเก่า) เฉพาะช่องแชท หรือเมื่อมีค่าเดิม หรือกดเปิดเอง
            // — Shopee/TikTok/Lazada/CRM ปกติไม่กรอกคนทัก ฟอร์มจะสั้นลงเกือบครึ่ง
            const isChat = ch.id === 'facebook' || ch.id === 'line';
            const hasSecondary = (+r.inq) > 0 || (+r.newC) > 0 || (+r.oldC) > 0;
            const showSecondary = isChat || hasSecondary || (openSecondary[r.id] === true);
            return (
              <div key={r.id} style={{ padding: '12px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)', borderLeft: `3px solid ${ch.hex}` }}>
                <div className="row" style={{ gap: 7, fontWeight: 600, marginBottom: 10 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: ch.hex }}></span>{ch.name}
                </div>
                <div className="grid" style={{ gridTemplateColumns: ch.hasAd ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10 }}>
                  <div className="field"><label>ยอดขาย (฿)</label><input type="number" min="0" className="input num" style={{ textAlign: 'right' }} placeholder="0" value={r.rev} onChange={e => up(i, 'rev', e.target.value)} /></div>
                  <div className="field"><label>ออเดอร์</label><input type="number" min="0" className="input num" style={{ textAlign: 'right' }} placeholder="0" value={r.ord} onChange={e => up(i, 'ord', e.target.value)} /></div>
                  {ch.hasAd && <div className="field"><label>ค่าแอด (฿)</label><input type="number" min="0" className="input num" style={{ textAlign: 'right' }} placeholder="0" value={r.ad} onChange={e => up(i, 'ad', e.target.value)} /></div>}
                </div>
                {showSecondary ? (
                  <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 8 }}>
                    <div className="field"><label>คนทัก</label><input type="number" min="0" className="input num" style={{ textAlign: 'right' }} placeholder="0" value={r.inq} onChange={e => up(i, 'inq', e.target.value)} /></div>
                    <div className="field"><label>ลูกค้าใหม่</label><input type="number" min="0" className="input num" style={{ textAlign: 'right' }} placeholder="0" value={r.newC} onChange={e => up(i, 'newC', e.target.value)} /></div>
                    <div className="field"><label>ลูกค้าเก่า</label><input type="number" min="0" className="input num" style={{ textAlign: 'right' }} placeholder="0" value={r.oldC} onChange={e => up(i, 'oldC', e.target.value)} /></div>
                  </div>
                ) : (
                  <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: 8, color: 'var(--ink-3)' }}
                          onClick={() => setOpenSecondary(m => ({ ...m, [r.id]: true }))}>
                    + คนทัก / ลูกค้าใหม่-เก่า
                  </button>
                )}
              </div>
            );
          })}

          <div className="field-row">
            <div className="field"><label>เวลาตอบแชทเฉลี่ย (นาที)</label><input type="number" min="0" className="input" placeholder="0" value={chatTime} onChange={e => { loadDirty.current = true; setTouched(true); setChatTime(e.target.value); }} /></div>
            <div className="field"><label>โน้ตประจำวัน</label><input className="input" placeholder="ไลฟ์เย็น 1 รอบ, Flash Sale..." value={note} onChange={e => { loadDirty.current = true; setTouched(true); setNote(e.target.value); }} /></div>
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
              const ch = MD.channels.find(c => c.id === r.id) || { hex: 'var(--ink-3)', name: r.id }; // กัน crash ถ้าช่องถูกลบ
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
export function TaskModal({ data, onClose, onSubmit, onDelete }) {
  const edit = !!data?.id; // มี id = แก้ไขจริง; ส่งแค่ {date} = งานใหม่ที่เลือกวันไว้
  // แตกค่าที่อาจเป็น string คั่น comma (หรือ array ที่มีสมาชิกเป็น comma-string) → array สะอาด
  const splitToArr = v => (Array.isArray(v) ? v : [v])
    .flatMap(x => String(x || '').split(','))
    .map(s => s.trim())
    .filter(Boolean);
  const [f, setF] = useState(() => {
    // วันที่เก็บเป็น ISO (YYYY-MM-DD) เพื่อใช้กับปฏิทิน <input type="date">
    // ใช้ dateISO เต็ม (กันปีหายตอนแก้งานข้ามปี); fallback parse จากไทย/ค่าที่ส่งมา
    const isoDate = data?.dateISO || (data?.date ? (parseTaskDate(data.date) || data.date) : todayISO());
    if (!data?.id) return { title: '', detail: '', date: isoDate, responsible: [], channel: [], camp: '', status: 'todo' };
    const validNames = new Set((MD.channels || []).map(c => c.name));
    const chanPieces = splitToArr(data.channel);
    // เก็บเฉพาะช่องทางที่มีจริงในระบบ — ตัดข้อความอิสระเก่า (เช่น "FB Post") ที่ map ไม่ได้ทิ้ง
    const channel = chanPieces.filter(c => validNames.has(c));
    return { ...data, date: isoDate, responsible: splitToArr(data.responsible), channel };
  });
  const [touched, setTouched] = useState(false);
  const set = (k, v) => { setTouched(true); setF(p => ({ ...p, [k]: v })); };
  const toggle = (k, v) => { setTouched(true); setF(p => {
    const arr = Array.isArray(p[k]) ? p[k] : splitToArr(p[k]);
    return { ...p, [k]: arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v] };
  }); };
  const valid = f.title.trim();
  const [submitting, setSubmitting] = useState(false); // กันกดบันทึกซ้ำ → งานซ้ำ
  const taskId = useMemo(() => data?.id || uid('tn'), [data?.id]); // id เดียวต่อการเปิดฟอร์ม (กดซ้ำไม่ได้ id ใหม่)
  const footer = (
    <>
      {edit && onDelete && (
        <button className="btn" style={{ color: 'var(--bad)', marginRight: 'auto' }}
          onClick={() => { if (window.confirm(`ลบงาน "${data.title}"?\nงานจะถูกย้ายไปถังขยะ (กู้คืนได้)`)) onDelete(data); }}>
          <Icon name="trash" /> ลบงาน
        </button>
      )}
      <button className="btn" onClick={() => guardClose(touched, onClose)}>ยกเลิก</button>
      <button className="btn btn-primary" disabled={!valid || submitting} style={{ opacity: valid && !submitting ? 1 : 0.5 }} onClick={() => { if (!valid || submitting) return; setSubmitting(true); onSubmit({ ...f, id: taskId }); }}>
        <Icon name="check" /> {edit ? 'บันทึกการแก้ไข' : 'เพิ่มงาน'}
      </button>
    </>
  );
  return (
    <Modal icon="listChecks" title={edit ? 'แก้ไขงาน' : 'เพิ่มงานใหม่'} sub="มอบหมายงานให้ทีมพร้อมกำหนดวัน" onClose={onClose} footer={footer} confirmOnClose={touched}>
      <div className="field-row">
        <div className="field"><label>วันที่</label><input type="date" className="input" value={f.date} onChange={e => set('date', e.target.value)} /></div>
        <div className="field"><label>แคมเปญ</label>
          <select className="input" value={f.camp} onChange={e => set('camp', e.target.value)}>
            <option value="">— ยังไม่ได้เลือก —</option>
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
          {/* ไม่มีช่องทาง (งานภายใน) — เคลียร์ช่องทางทั้งหมด */}
          <button className={'pick' + (f.channel.length === 0 ? ' on' : '')} onClick={() => set('channel', [])}>
            <span className="dot-c" style={{ background: 'var(--ink-4)' }}></span>ไม่มี
          </button>
          {/* ช่องทางจริงจาก Supabase เท่านั้น */}
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
// ล็อต = ตาราง ไซส์ × สี (เสื้อพิมพ์ลาย): { id, lotNo, date, cost, note, sizes[], colors[{id,name,hex}], grid{colorId:{size:qty}} }
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
      // มีล็อต → สต็อก = ผลรวมล็อต; ไม่มีล็อต → ช่องสต็อกเดิม (เว้นว่าง = ไม่ track null→'ok')
      stock_on_hand: cleanHasLots ? cleanTotal : (f.onHand === '' || f.onHand == null ? null : nn(f.onHand)),
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
    });
    setBusy(false);
    if (ok) onClose();
  };
  const footer = (<>{data?.id && <button className="btn" style={{ color: 'var(--bad)', marginRight: 'auto' }} disabled={busy} onClick={async () => { if (await deleteRow('tmk_products', data.id, 'สินค้า', { action: 'delete', entityType: 'product', entityName: data.name, summary: `ลบสินค้า "${data.name}"` })) onClose(); }}><Icon name="trash" /> ลบ</button>}<button className="btn" onClick={() => guardClose(touched, onClose)}>ยกเลิก</button><button className="btn btn-primary" disabled={busy} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึกสินค้า'}</button></>);

  // สไตล์ช่องในตาราง ไซส์×สี
  const cellInput = { width: 46, textAlign: 'center', padding: '5px 2px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 'var(--fs-sm)', fontVariantNumeric: 'tabular-nums' };
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
          {f.image && <button type="button" className="btn btn-sm btn-ghost" style={{ width: 92, marginTop: 6, color: 'var(--bad)' }} onClick={() => set('image', '')}>ลบรูป</button>}
        </div>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}><label>ชื่อสินค้า</label><input className="input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="เช่น เสื้อยืดลาย Summer" /></div>
      </div>
      <div className="field-row">
        <div className="field"><label>ราคาขาย (฿)</label><input type="number" min="0" className="input num" value={f.price} onChange={e => set('price', e.target.value)} placeholder="0" /></div>
        <div className="field"><label>จำนวนที่ขาย (ตัว)</label><input type="number" min="0" className="input num" value={f.units} onChange={e => set('units', e.target.value)} placeholder="0" /></div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>สต็อกคงเหลือ{hasLots && <span className="cap" style={{ marginLeft: 6, color: 'var(--ink-4)' }}>(คิดจากล็อต)</span>}</label>
          {hasLots
            ? <input type="number" className="input num" value={grandTotal} readOnly disabled style={{ opacity: 0.7 }} />
            : <input type="number" min="0" className="input num" value={f.onHand} onChange={e => set('onHand', e.target.value)} placeholder="0" />}
        </div>
        <div className="field"><label>จุดสั่งผลิตซ้ำ</label><input type="number" min="0" className="input num" value={f.reorder} onChange={e => set('reorder', e.target.value)} placeholder="0" /></div>
      </div>
      {hasLots && <div className="cap" style={{ marginTop: -4, marginBottom: 12, color: 'var(--ink-3)' }}>มูลค่าสต็อก (ต้นทุน): <b style={{ color: 'var(--ink)' }}>{B(grandValue)}</b></div>}

      {/* ล็อต (ไซส์ × สี) */}
      <div className="field">
        <div className="row between" style={{ marginBottom: 8 }}>
          <label style={{ margin: 0 }}>ล็อต (ไซส์ × สี){hasLots && <span className="cap" style={{ marginLeft: 6, color: 'var(--ink-3)' }}>· {lots.length} ล็อต · รวม {N(grandTotal)} ตัว</span>}</label>
          <div className="row" style={{ gap: 6 }}>
            {hasLots && <button type="button" className="btn btn-sm btn-ghost" title="คัดลอกสี+ไซส์จากล็อตล่าสุด" onClick={() => addLot(lots[lots.length - 1])}><Icon name="layers" /> คัดลอกโครงสร้าง</button>}
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => addLot()}><Icon name="plus" /> เพิ่มล็อต</button>
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
                  <span style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: 'var(--ink-3)' }}><Icon name="chevR" /></span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>ล็อต {i + 1}{l.lotNo ? ` · ${l.lotNo}` : ''}</div>
                    <div className="cap" style={{ color: 'var(--ink-3)' }}>รวม {N(calcLotTotal(l))} ตัว · {l.colors.length} สี × {l.sizes.length} ไซส์{calcLotValue(l) ? ` · มูลค่า ${B(calcLotValue(l))}` : ''}</div>
                  </div>
                </div>
                <button type="button" className="icon-btn" title="ลบล็อตนี้" onClick={(e) => { e.stopPropagation(); removeLot(i); }} style={{ color: 'var(--bad)', flexShrink: 0 }}><Icon name="trash" /></button>
              </div>

              {isOpen && (
                <div style={{ padding: '0 12px 12px', borderTop: '1px solid var(--line)' }}>
                  <div className="field-row" style={{ marginTop: 12, marginBottom: 8 }}>
                    <div className="field" style={{ marginBottom: 0 }}><label>รหัสล็อต</label><input className="input" value={l.lotNo} onChange={e => setLotField(i, 'lotNo', e.target.value)} placeholder="เช่น LOT-2406" /></div>
                    <div className="field" style={{ marginBottom: 0 }}><label>วันที่รับเข้า</label><input type="date" className="input" value={l.date} onChange={e => setLotField(i, 'date', e.target.value)} /></div>
                  </div>
                  <div className="field-row" style={{ marginBottom: 10 }}>
                    <div className="field" style={{ marginBottom: 0 }}><label>ต้นทุน/ตัว (฿)</label><input type="number" min="0" className="input num" value={l.cost} onChange={e => setLotField(i, 'cost', e.target.value)} placeholder="0" /></div>
                    <div className="field" style={{ marginBottom: 0 }}><label>โน้ต</label><input className="input" value={l.note} onChange={e => setLotField(i, 'note', e.target.value)} placeholder="เช่น โรงงาน A / ผ้า Cotton" /></div>
                  </div>

                  {/* เลือกไซส์ */}
                  <div className="field" style={{ marginBottom: 10 }}>
                    <label>ไซส์ในล็อตนี้</label>
                    <div className="chips-pick">
                      {SIZES.map(s => <button type="button" key={s} className={'pick' + (l.sizes.includes(s) ? ' on' : '')} onClick={() => toggleSize(i, s)}>{s}</button>)}
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
                                      <input value={c.name} onChange={e => setColor(i, c.id, 'name', e.target.value)} placeholder="ชื่อสี" style={{ flex: 1, minWidth: 70, padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 'var(--fs-sm)' }} />
                                      <button type="button" className="icon-btn" title="ลบสีนี้" onClick={() => removeColor(i, c.id)} style={{ color: 'var(--bad)', flexShrink: 0 }}><Icon name="x" /></button>
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
        <div className="field"><label>หมวดหมู่</label><input className="input" list="cat-list" value={f.category} onChange={e => set('category', e.target.value)} placeholder="เช่น เสื้อยืด, โปโล" /></div>
        <div className="field"><label>ผู้ผลิต / ซัพพลายเออร์</label><input className="input" list="sup-list" value={f.supplier} onChange={e => set('supplier', e.target.value)} placeholder="เช่น โรงงาน A" /></div>
      </div>
      <div className="field-row">
        <div className="field"><label>SKU</label><input className="input" value={f.sku} onChange={e => set('sku', e.target.value)} placeholder="เช่น TS-SUMMER-01" /></div>
        <div className="field"><label>บาร์โค้ด</label><input className="input" value={f.barcode} onChange={e => set('barcode', e.target.value)} placeholder="เช่น 885xxxxxxxxxx" /></div>
      </div>

      <div className="field" style={{ marginBottom: 0 }}><label>กลยุทธ์ / โน้ต</label><textarea className="input" value={f.strategy} onChange={e => set('strategy', e.target.value)} placeholder="เช่น สินค้าเรือธง ดันต่อเนื่อง" /></div>
    </Modal>
  );
}

// บันทึกสินค้า — เผื่อ DB ยังไม่มีคอลัมน์ image_url/lots ให้ fallback ตัดออกแล้วลองใหม่ (เตือนให้รัน migration)
async function saveProductRow(row, isUpdate, audit) {
  // คอลัมน์เสริมที่อาจยังไม่มีใน DB (ยังไม่ได้รัน migration) → ตัดออกทีละตัวแล้วลองใหม่
  // (PostgREST ฟ้องทีละคอลัมน์ จึงวน loop จนสำเร็จ; เก็บข้อมูลให้ได้มากที่สุด)
  const OPTIONAL_COLS = ['category', 'supplier', 'sku', 'barcode', 'image_url', 'lots'];
  const payload = { ...row };
  const dropped = [];
  try {
    for (let attempt = 0; attempt <= OPTIONAL_COLS.length; attempt++) {
      const { error } = await supabase.from('tmk_products').upsert(payload);
      if (!error) break;
      const isColErr = /column|schema cache|PGRST204|does not exist/i.test(error.message || '');
      const target = OPTIONAL_COLS.find(c => (c in payload) && (error.message || '').includes(c));
      if (isColErr && target) { delete payload[target]; dropped.push(target); continue; } // ตัดคอลัมน์ที่ไม่มี ลองใหม่
      throw error; // error อื่น → โยนออก
    }
    if (dropped.length) toast(`บันทึกแล้ว แต่บางช่อง (${dropped.join(', ')}) ยังไม่ถูกเก็บ — ต้องรัน SQL migration ก่อน`, 'warn');
    if (audit) logAudit(audit);
    window.__reload?.();
    toast('บันทึกสินค้าสำเร็จ', 'success');
    return true;
  } catch (err) {
    console.error('Save tmk_products failed:', err);
    toast('บันทึกสินค้าไม่สำเร็จ: ' + err.message, 'error');
    return false;
  }
}

/* ---------- Sell / stock-out modal (ตัดสต็อกเมื่อขาย: เลือกล็อต→สี→ไซส์→จำนวน) ---------- */
const emptySellLine = () => ({ id: uid('sl'), lotId: '', colorId: '', size: '', qty: '' });
// คงเหลือของช่อง (ล็อต/สี/ไซส์)
const cellAvail = (lot, colorId, size) => Number(lot?.grid?.[colorId]?.[size]) || 0;

export function SellModal({ data, onClose }) {
  const lotProducts = (MD.products || []).filter(p => p.hasLots);
  const [productId, setProductId] = useState(data?.id || (lotProducts.length === 1 ? lotProducts[0].id : ''));
  const [lines, setLines] = useState([emptySellLine()]);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const product = (MD.products || []).find(p => p.id === productId) || null;
  const lots = product?.lots || [];
  const lotById = (id) => lots.find(l => l.id === id);

  const setLine = (i, patch) => { setTouched(true); setLines(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l)); };
  const addLine = () => { setTouched(true); setLines(ls => [...ls, emptySellLine()]); };
  const removeLine = (i) => { setTouched(true); setLines(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : [emptySellLine()]); };
  const changeProduct = (id) => { setTouched(true); setProductId(id); setLines([emptySellLine()]); };

  // จำนวนจริงที่จะตัดของแต่ละ line (clamp ตามคงเหลือ)
  const lineQty = (l) => Math.max(0, Math.min(Math.round(Number(l.qty) || 0), cellAvail(lotById(l.lotId), l.colorId, l.size)));
  const totalQty = lines.reduce((a, l) => a + lineQty(l), 0);
  const totalAmount = totalQty * (product?.price || 0);

  const handleSave = async () => {
    if (busy || !product) return;
    // รวม deduction ต่อ (lotId, colorId, size)
    const agg = {};
    lines.forEach(l => {
      if (!l.lotId || !l.colorId || !l.size) return;
      const q = Math.max(0, Math.round(Number(l.qty) || 0));
      if (!q) return;
      const key = `${l.lotId}||${l.colorId}||${l.size}`;
      agg[key] = (agg[key] || 0) + q;
    });
    const keys = Object.keys(agg);
    if (!keys.length) { toast('เพิ่มรายการที่จะขายก่อน (เลือกล็อต / สี / ไซส์ / จำนวน)', 'error'); return; }
    setBusy(true);
    // clone lots (deep grid) แล้วหักช่อง
    const newLots = lots.map(l => ({ ...l, grid: Object.fromEntries(Object.entries(l.grid || {}).map(([cid, row]) => [cid, { ...row }])) }));
    const idxById = {}; newLots.forEach((l, idx) => { idxById[l.id] = idx; });
    let soldTotal = 0, soldCost = 0, clamped = false;
    const auditFields = [];
    const saleLines = []; // structured สำหรับรายงาน: { color, size, qty, cost }
    keys.forEach(key => {
      const [lotId, colorId, size] = key.split('||');
      const lot = newLots[idxById[lotId]];
      if (!lot) return;
      const avail = Number(lot.grid?.[colorId]?.[size]) || 0;
      let take = agg[key];
      if (take > avail) { take = avail; clamped = true; }
      if (take <= 0) return;
      const row = { ...(lot.grid[colorId] || {}) };
      const left = avail - take;
      if (left > 0) row[size] = left; else delete row[size];
      lot.grid[colorId] = row;
      soldTotal += take;
      const unitCost = Number(lot.cost) || 0;
      soldCost += take * unitCost; // ต้นทุนขาย (จากต้นทุนต่อตัวของล็อต) → ใช้คิดกำไรในรายงาน
      const colorName = (lot.colors || []).find(c => c.id === colorId)?.name || 'สี';
      auditFields.push({ label: `${colorName} ${size}`, value: `×${take} (${lot.lotNo || 'ล็อต'})` });
      saleLines.push({ color: colorName, size, qty: take, cost: unitCost });
    });
    if (soldTotal <= 0) { setBusy(false); toast('ไม่มีจำนวนที่ตัดได้ — สต็อกอาจหมดแล้ว', 'error'); return; }
    const newStock = newLots.reduce((a, l) => a + calcLotTotal(l), 0);
    const newUnits = Number(product.units || 0) + soldTotal;
    try {
      const { error } = await supabase.from('tmk_products')
        .update({ lots: newLots, stock_on_hand: newStock, actual_units: newUnits, updated_at: new Date().toISOString() })
        .eq('id', product.id);
      if (error) throw error;
      // บันทึกการขายลงตารางจริง (tmk_sales) — รายงานอ่านจากตารางนี้ (ไม่พึ่ง audit log อย่างเดียว)
      try { await supabase.from('tmk_sales').insert({ id: 'sale-sell-' + product.id + '-' + Date.now().toString(36), sale_date: date || todayISO(), product_id: product.id, product_name: product.name, category: product.category || '', channel: '', qty: soldTotal, amount: soldTotal * (Number(product.price) || 0), cost: soldCost, source: 'sell', lines: saleLines }); } catch (e) { console.warn('tmk_sales:', e?.message); }
      logAudit({
        action: 'sale', entityType: 'product', entityName: product.name,
        summary: `ขาย "${product.name}" ${soldTotal} ตัว (ตัดสต็อก)${note ? ' — ' + note : ''}`,
        fields: [
          { label: 'รวมขาย', value: `${N(soldTotal)} ตัว` },
          { label: 'มูลค่าขาย', value: B(soldTotal * (product.price || 0)) },
          { label: 'วันที่', value: thaiDate(date) || date || '—' },
          ...auditFields,
        ],
        // machine-readable สำหรับหน้า "รายงานขาย"
        data: { productId: product.id, productName: product.name, category: product.category || '', price: Number(product.price) || 0, date: date || todayISO(), totalQty: soldTotal, totalAmount: soldTotal * (Number(product.price) || 0), totalCost: soldCost, lines: saleLines },
      });
      window.__reload?.();
      toast(`ตัดสต็อก ${soldTotal} ตัวเรียบร้อย${clamped ? ' (บางรายการปรับตามคงเหลือ)' : ''}`, clamped ? 'warn' : 'success');
      onClose();
    } catch (err) {
      toast('บันทึกการขายไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const canSave = !!product && totalQty > 0;
  const footer = (<><button className="btn" onClick={() => guardClose(touched, onClose)}>ยกเลิก</button><button className="btn btn-primary" disabled={busy || !canSave} style={{ opacity: canSave ? 1 : 0.5 }} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึกการขาย'}</button></>);

  return (
    <Modal wide icon="wallet" title="บันทึกการขาย / ตัดสต็อก" sub="เลือก ล็อต → สี → ไซส์ → จำนวน แล้วระบบจะหักสต็อกให้" onClose={onClose} footer={footer} confirmOnClose={touched}>
      {lotProducts.length === 0
        ? <div className="cap" style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }}>ยังไม่มีสินค้าที่มีล็อต — ไปหน้า "สินค้า" เพิ่มล็อต (ไซส์ × สี) ก่อน</div>
        : (<>
          <div className="field"><label>สินค้า</label>
            <select className="input" value={productId} onChange={e => changeProduct(e.target.value)}>
              <option value="">— เลือกสินค้า —</option>
              {lotProducts.map(p => <option key={p.id} value={p.id}>{p.name} (เหลือ {p.onHand})</option>)}
            </select>
          </div>

          {product && product.reservedTotal > 0 && (
            <div className="cap" style={{ marginBottom: 10, padding: '6px 10px', background: 'var(--accent-soft)', color: 'var(--accent-2)', borderRadius: 'var(--r-xs)' }}>
              <Icon name="clock" /> สินค้านี้มีจอง {N(product.reservedTotal)} ตัว · พร้อมขาย {N(product.available)} ตัว — ระวังขายทับของจอง
            </div>
          )}
          {product && (<>
            <div className="row between" style={{ marginBottom: 8 }}>
              <label style={{ margin: 0 }}>รายการที่ขาย</label>
              <button type="button" className="btn btn-sm btn-ghost" onClick={addLine}><Icon name="plus" /> เพิ่มรายการ</button>
            </div>
            {lines.map((l, i) => {
              const lot = lotById(l.lotId);
              const colorsAvail = (lot?.colors || []).filter(c => Object.values(lot.grid?.[c.id] || {}).some(v => Number(v) > 0));
              const sizesAvail = lot ? (lot.sizes || []).filter(s => Number(lot.grid?.[l.colorId]?.[s]) > 0) : [];
              const avail = cellAvail(lot, l.colorId, l.size);
              return (
                <div key={l.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: 10, marginBottom: 8, background: 'var(--surface)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div className="field" style={{ margin: 0 }}><label>ล็อต</label>
                      <select className="input" value={l.lotId} onChange={e => setLine(i, { lotId: e.target.value, colorId: '', size: '', qty: '' })}>
                        <option value="">— เลือกล็อต —</option>
                        {lots.filter(x => calcLotTotal(x) > 0).map((x, xi) => <option key={x.id} value={x.id}>{(x.lotNo || `ล็อต ${xi + 1}`)}{x.date ? ` · ${x.date}` : ''} (เหลือ {calcLotTotal(x)})</option>)}
                      </select>
                    </div>
                    <div className="field" style={{ margin: 0 }}><label>สี</label>
                      <select className="input" value={l.colorId} disabled={!l.lotId} onChange={e => setLine(i, { colorId: e.target.value, size: '', qty: '' })}>
                        <option value="">{l.lotId ? '— เลือกสี —' : '— เลือกล็อตก่อน —'}</option>
                        {colorsAvail.map(c => { const n = Object.values(lot.grid?.[c.id] || {}).reduce((a, v) => a + (Number(v) || 0), 0); return <option key={c.id} value={c.id}>{c.name} (เหลือ {n})</option>; })}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                    <div className="field" style={{ margin: 0 }}><label>ไซส์</label>
                      <select className="input" value={l.size} disabled={!l.colorId} onChange={e => setLine(i, { size: e.target.value, qty: '' })}>
                        <option value="">{l.colorId ? '— เลือกไซส์ —' : '— เลือกสีก่อน —'}</option>
                        {sizesAvail.map(s => <option key={s} value={s}>{s} (เหลือ {cellAvail(lot, l.colorId, s)})</option>)}
                      </select>
                    </div>
                    <div className="field" style={{ margin: 0 }}><label>จำนวน{l.size ? ` / เหลือ ${avail}` : ''}</label>
                      <input type="number" min="0" max={avail || undefined} className="input num" value={l.qty} disabled={!l.size} onChange={e => setLine(i, { qty: e.target.value })} placeholder="0" />
                    </div>
                    <button type="button" className="icon-btn" title="ลบรายการ" onClick={() => removeLine(i)} style={{ color: 'var(--bad)', marginBottom: 4 }}><Icon name="x" /></button>
                  </div>
                  {l.size && Number(l.qty) > avail && <div className="cap" style={{ color: 'var(--warn)', marginTop: 6 }}>เกินคงเหลือ — จะตัดได้สูงสุด {avail} ตัว</div>}
                </div>
              );
            })}

            <div className="field-row" style={{ marginTop: 4 }}>
              <div className="field" style={{ marginBottom: 0 }}><label>วันที่ขาย</label><input type="date" className="input" value={date} onChange={e => { setTouched(true); setDate(e.target.value); }} /></div>
              <div className="field" style={{ marginBottom: 0 }}><label>โน้ต (ไม่บังคับ)</label><input className="input" value={note} onChange={e => { setTouched(true); setNote(e.target.value); }} placeholder="เช่น ลูกค้า / ช่องทาง" /></div>
            </div>

            <div className="row between" style={{ marginTop: 14, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)' }}>
              <span className="cap">รวมตัดสต็อก</span>
              <span><b style={{ fontSize: 16 }}>{N(totalQty)}</b> ตัว · มูลค่าขาย <b style={{ color: 'var(--accent-2)' }}>{B(totalAmount)}</b></span>
            </div>
          </>)}
        </>)}
    </Modal>
  );
}

/* ---------- Campaign modal ---------- */
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
  const footer = (<><button className="btn" onClick={() => guardClose(touched, onClose)}>ยกเลิก</button><button className="btn btn-primary" disabled={busy} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึกแคมเปญ'}</button></>);
  return (
    <Modal icon="megaphone" title={data ? 'แก้ไขแคมเปญ' : 'สร้างแคมเปญ'} sub="ตั้งชื่อ ช่วงเวลา และช่องทาง" onClose={onClose} footer={footer} confirmOnClose={touched}>
      <div className="field"><label>ชื่อแคมเปญ</label><input className="input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="เช่น Payday Push" /></div>
      <div className="field-row">
        <div className="field"><label>เริ่ม</label><input type="date" className="input" value={f.start} onChange={e => set('start', e.target.value)} /></div>
        <div className="field"><label>สิ้นสุด</label><input type="date" className="input" value={f.end} onChange={e => set('end', e.target.value)} /></div>
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

/* ---------- Stock adjust modal (ปรับสต็อก: รับเข้า/รับคืน/เสียหาย/นับใหม่) ---------- */
const ADJUST_REASONS = [
  { id: 'in', label: 'รับเข้าเพิ่ม', sign: 1, mode: 'delta' },
  { id: 'return', label: 'รับคืนจากลูกค้า', sign: 1, mode: 'delta', units: -1 }, // คืนสต็อก + ลดยอดขายแล้ว
  { id: 'damage', label: 'เสียหาย / สูญหาย', sign: -1, mode: 'delta' },
  { id: 'recount', label: 'นับสต็อกใหม่ (ตั้งค่า)', sign: 0, mode: 'set' },
];
const emptyAdjLine = () => ({ id: uid('aj'), lotId: '', colorId: '', size: '', reason: 'in', qty: '' });

export function StockAdjustModal({ data, onClose }) {
  const lotProducts = (MD.products || []).filter(p => p.hasLots);
  const [productId, setProductId] = useState(data?.id || (lotProducts.length === 1 ? lotProducts[0].id : ''));
  const [lines, setLines] = useState([emptyAdjLine()]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const product = (MD.products || []).find(p => p.id === productId) || null;
  const lots = product?.lots || [];
  const lotById = (id) => lots.find(l => l.id === id);

  const setLine = (i, patch) => { setTouched(true); setLines(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l)); };
  const addLine = () => { setTouched(true); setLines(ls => [...ls, emptyAdjLine()]); };
  const removeLine = (i) => { setTouched(true); setLines(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : [emptyAdjLine()]); };
  const changeProduct = (id) => { setTouched(true); setProductId(id); setLines([emptyAdjLine()]); };

  // ผลลัพธ์ของ 1 line: { avail, reason, newQty }
  const computeLine = (l) => {
    const lot = lotById(l.lotId);
    const avail = cellAvail(lot, l.colorId, l.size);
    const reason = ADJUST_REASONS.find(r => r.id === l.reason) || ADJUST_REASONS[0];
    const q = Math.max(0, Math.round(Number(l.qty) || 0));
    const newQty = reason.mode === 'set' ? q : Math.max(0, avail + reason.sign * q);
    return { avail, reason, q, newQty };
  };
  const lineReady = (l) => l.lotId && l.colorId && l.size && (Number(l.qty) > 0 || l.reason === 'recount');

  const handleSave = async () => {
    if (busy || !product) return;
    const valid = lines.filter(lineReady);
    if (!valid.length) { toast('เพิ่มรายการปรับสต็อกก่อน (เลือกล็อต / สี / ไซส์ / เหตุผล / จำนวน)', 'error'); return; }
    setBusy(true);
    const newLots = lots.map(l => ({ ...l, grid: Object.fromEntries(Object.entries(l.grid || {}).map(([cid, row]) => [cid, { ...row }])) }));
    const idxById = {}; newLots.forEach((l, idx) => { idxById[l.id] = idx; });
    let unitsDelta = 0;
    const auditFields = [];
    valid.forEach(l => {
      const lot = newLots[idxById[l.lotId]]; if (!lot) return;
      const avail = Number(lot.grid?.[l.colorId]?.[l.size]) || 0;
      const reason = ADJUST_REASONS.find(r => r.id === l.reason) || ADJUST_REASONS[0];
      const q = Math.max(0, Math.round(Number(l.qty) || 0));
      const newQty = reason.mode === 'set' ? q : Math.max(0, avail + reason.sign * q);
      const row = { ...(lot.grid[l.colorId] || {}) };
      if (newQty > 0) row[l.size] = newQty; else delete row[l.size];
      lot.grid[l.colorId] = row;
      const actualDelta = newQty - avail;
      if (reason.units && actualDelta > 0) unitsDelta += reason.units * actualDelta; // รับคืน → ลด actual_units
      const colorName = (lot.colors || []).find(c => c.id === l.colorId)?.name || 'สี';
      auditFields.push({ label: `${colorName} ${l.size} · ${reason.label}`, value: `${avail} → ${newQty} (${lot.lotNo || 'ล็อต'})` });
    });
    const newStock = newLots.reduce((a, l) => a + calcLotTotal(l), 0);
    const newUnits = Math.max(0, Number(product.units || 0) + unitsDelta);
    try {
      const { error } = await supabase.from('tmk_products')
        .update({ lots: newLots, stock_on_hand: newStock, actual_units: newUnits, updated_at: new Date().toISOString() })
        .eq('id', product.id);
      if (error) throw error;
      logAudit({ action: 'adjust', entityType: 'product', entityName: product.name, summary: `ปรับสต็อก "${product.name}"${note ? ' — ' + note : ''}`, fields: auditFields });
      window.__reload?.();
      toast('ปรับสต็อกเรียบร้อย', 'success');
      onClose();
    } catch (err) {
      toast('ปรับสต็อกไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const canSave = !!product && lines.some(lineReady);
  const footer = (<><button className="btn" onClick={() => guardClose(touched, onClose)}>ยกเลิก</button><button className="btn btn-primary" disabled={busy || !canSave} style={{ opacity: canSave ? 1 : 0.5 }} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึกการปรับสต็อก'}</button></>);

  return (
    <Modal wide icon="box" title="ปรับสต็อก / นับสต็อก" sub="รับเข้า / รับคืน / ของเสีย / นับสต็อกใหม่ — แยกตาม ล็อต × สี × ไซส์" onClose={onClose} footer={footer} confirmOnClose={touched}>
      {lotProducts.length === 0
        ? <div className="cap" style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }}>ยังไม่มีสินค้าที่มีล็อต — ไปหน้า "สินค้า" เพิ่มล็อตก่อน</div>
        : (<>
          <div className="field"><label>สินค้า</label>
            <select className="input" value={productId} onChange={e => changeProduct(e.target.value)}>
              <option value="">— เลือกสินค้า —</option>
              {lotProducts.map(p => <option key={p.id} value={p.id}>{p.name} (เหลือ {p.onHand})</option>)}
            </select>
          </div>

          {product && (<>
            <div className="row between" style={{ marginBottom: 8 }}>
              <label style={{ margin: 0 }}>รายการปรับสต็อก</label>
              <button type="button" className="btn btn-sm btn-ghost" onClick={addLine}><Icon name="plus" /> เพิ่มรายการ</button>
            </div>
            {lines.map((l, i) => {
              const lot = lotById(l.lotId);
              const colorsAvail = (lot?.colors || []).filter(c => Object.values(lot.grid?.[c.id] || {}).some(v => Number(v) > 0));
              const sizesAll = lot ? (lot.sizes || []) : [];
              const { avail, reason, newQty } = computeLine(l);
              const isSet = reason.mode === 'set';
              return (
                <div key={l.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: 10, marginBottom: 8, background: 'var(--surface)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div className="field" style={{ margin: 0 }}><label>ล็อต</label>
                      <select className="input" value={l.lotId} onChange={e => setLine(i, { lotId: e.target.value, colorId: '', size: '' })}>
                        <option value="">— เลือกล็อต —</option>
                        {lots.map((x, xi) => <option key={x.id} value={x.id}>{x.lotNo || `ล็อต ${xi + 1}`}{x.date ? ` · ${x.date}` : ''} (เหลือ {calcLotTotal(x)})</option>)}
                      </select>
                    </div>
                    <div className="field" style={{ margin: 0 }}><label>สี</label>
                      <select className="input" value={l.colorId} disabled={!l.lotId} onChange={e => setLine(i, { colorId: e.target.value, size: '' })}>
                        <option value="">{l.lotId ? '— เลือกสี —' : '— เลือกล็อตก่อน —'}</option>
                        {/* รับเข้า/นับใหม่ = โชว์ทุกสีในล็อต; ของเสีย/รับคืน = เฉพาะที่มีของ */}
                        {(reason.sign >= 0 && isSet ? (lot?.colors || []) : reason.sign > 0 ? (lot?.colors || []) : colorsAvail).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 8, marginBottom: 8 }}>
                    <div className="field" style={{ margin: 0 }}><label>ไซส์</label>
                      <select className="input" value={l.size} disabled={!l.colorId} onChange={e => setLine(i, { size: e.target.value })}>
                        <option value="">{l.colorId ? '— เลือกไซส์ —' : '— เลือกสีก่อน —'}</option>
                        {sizesAll.map(s => <option key={s} value={s}>{s} (เหลือ {cellAvail(lot, l.colorId, s)})</option>)}
                      </select>
                    </div>
                    <div className="field" style={{ margin: 0 }}><label>เหตุผล</label>
                      <select className="input" value={l.reason} onChange={e => setLine(i, { reason: e.target.value })}>
                        {ADJUST_REASONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'end' }}>
                    <div className="field" style={{ margin: 0 }}><label>{isSet ? 'ตั้งเป็น (ตัว)' : 'จำนวน (ตัว)'}</label>
                      <input type="number" min="0" className="input num" value={l.qty} disabled={!l.size} onChange={e => setLine(i, { qty: e.target.value })} placeholder="0" />
                    </div>
                    <div className="cap" style={{ paddingBottom: 8, whiteSpace: 'nowrap', color: 'var(--ink-3)' }}>{l.size ? <>คงเหลือ {N(avail)} → <b style={{ color: newQty >= avail ? 'var(--good)' : 'var(--bad)' }}>{N(newQty)}</b></> : ''}</div>
                    <button type="button" className="icon-btn" title="ลบรายการ" onClick={() => removeLine(i)} style={{ color: 'var(--bad)', marginBottom: 4 }}><Icon name="x" /></button>
                  </div>
                </div>
              );
            })}
            <div className="field" style={{ marginTop: 4, marginBottom: 0 }}><label>โน้ต (ไม่บังคับ)</label><input className="input" value={note} onChange={e => { setTouched(true); setNote(e.target.value); }} placeholder="เช่น ตรวจนับประจำเดือน / ลูกค้าคืนของ" /></div>
          </>)}
        </>)}
    </Modal>
  );
}

/* ---------- Reservation modal (จองสต็อก: สี×ไซส์ ให้ลูกค้า) ---------- */
const emptyRsvItem = () => ({ id: uid('ri'), color: '', size: '', qty: '' });

export function ReservationModal({ data, onClose }) {
  const lotProducts = (MD.products || []).filter(p => p.hasLots);
  const [productId, setProductId] = useState(data?.id || (lotProducts.length === 1 ? lotProducts[0].id : ''));
  const [items, setItems] = useState([emptyRsvItem()]);
  const [customer, setCustomer] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const product = (MD.products || []).find(p => p.id === productId) || null;
  const variants = product?.variants || {};         // { color: { size: qty } }
  const reserved = product?.reservedByVariant || {}; // { color: { size: qty } }
  const availOf = (color, size) => Math.max(0, (Number(variants[color]?.[size]) || 0) - (Number(reserved[color]?.[size]) || 0));

  const setItem = (i, patch) => { setTouched(true); setItems(it => it.map((x, j) => j === i ? { ...x, ...patch } : x)); };
  const addItem = () => { setTouched(true); setItems(it => [...it, emptyRsvItem()]); };
  const removeItem = (i) => { setTouched(true); setItems(it => it.length > 1 ? it.filter((_, j) => j !== i) : [emptyRsvItem()]); };
  const changeProduct = (id) => { setTouched(true); setProductId(id); setItems([emptyRsvItem()]); };

  const lineQty = (it) => Math.max(0, Math.min(Math.round(Number(it.qty) || 0), availOf(it.color, it.size)));
  const totalQty = items.reduce((a, it) => a + lineQty(it), 0);

  const handleSave = async () => {
    if (busy || !product) return;
    const clean = items.filter(it => it.color && it.size && lineQty(it) > 0).map(it => ({ color: it.color, size: it.size, qty: lineQty(it) }));
    if (!clean.length) { toast('เพิ่มรายการจองก่อน (สี / ไซส์ / จำนวน)', 'error'); return; }
    setBusy(true);
    try {
      const rsv = { id: uid('rsv'), customer: customer.trim(), date: date || todayISO(), note: note.trim(), items: clean };
      const newRes = [...(product.reservations || []), rsv];
      const { error } = await supabase.from('tmk_products').update({ reservations: newRes, updated_at: new Date().toISOString() }).eq('id', product.id);
      if (error) {
        if (/reservations|column|schema cache|PGRST204/i.test(error.message || '')) { toast('ต้องรัน SQL migration (reservations) ก่อนจึงจะจองได้', 'error'); setBusy(false); return; }
        throw error;
      }
      logAudit({ action: 'reserve', entityType: 'product', entityName: product.name, summary: `จองสต็อก "${product.name}" ${clean.reduce((a, x) => a + x.qty, 0)} ตัว${customer ? ' — ' + customer : ''}`, fields: clean.map(x => ({ label: `${x.color} ${x.size}`, value: `×${x.qty}` })) });
      window.__reload?.();
      toast('จองสต็อกเรียบร้อย', 'success');
      onClose();
    } catch (err) {
      toast('จองไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const canSave = !!product && totalQty > 0;
  const footer = (<><button className="btn" onClick={() => guardClose(touched, onClose)}>ยกเลิก</button><button className="btn btn-primary" disabled={busy || !canSave} style={{ opacity: canSave ? 1 : 0.5 }} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'จองสต็อก'}</button></>);

  return (
    <Modal wide icon="clock" title="จองสต็อก" sub="กันสินค้า (สี × ไซส์) ให้ลูกค้า → พร้อมขายจะลดลงตามจอง" onClose={onClose} footer={footer} confirmOnClose={touched}>
      {lotProducts.length === 0
        ? <div className="cap" style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }}>ยังไม่มีสินค้าที่มีล็อต</div>
        : (<>
          <div className="field-row">
            <div className="field"><label>สินค้า</label>
              <select className="input" value={productId} onChange={e => changeProduct(e.target.value)}>
                <option value="">— เลือกสินค้า —</option>
                {lotProducts.map(p => <option key={p.id} value={p.id}>{p.name} (พร้อมขาย {p.available})</option>)}
              </select>
            </div>
            <div className="field"><label>ลูกค้า / อ้างอิง</label><input className="input" value={customer} onChange={e => { setTouched(true); setCustomer(e.target.value); }} placeholder="เช่น คุณเอ / ออเดอร์ #123" /></div>
          </div>

          {product && (<>
            <div className="row between" style={{ marginBottom: 8 }}>
              <label style={{ margin: 0 }}>รายการจอง</label>
              <button type="button" className="btn btn-sm btn-ghost" onClick={addItem}><Icon name="plus" /> เพิ่มรายการ</button>
            </div>
            {items.map((it, i) => {
              const colors = Object.keys(variants).filter(c => Object.entries(variants[c]).some(([s]) => availOf(c, s) > 0 || s === it.size));
              const sizes = it.color ? Object.keys(variants[it.color] || {}).filter(s => availOf(it.color, s) > 0 || s === it.size) : [];
              const av = availOf(it.color, it.size);
              return (
                <div key={it.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
                  <div className="field" style={{ margin: 0 }}><label>สี</label>
                    <select className="input" value={it.color} onChange={e => setItem(i, { color: e.target.value, size: '' })}>
                      <option value="">— สี —</option>{colors.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ margin: 0 }}><label>ไซส์</label>
                    <select className="input" value={it.size} disabled={!it.color} onChange={e => setItem(i, { size: e.target.value })}>
                      <option value="">— ไซส์ —</option>{sizes.map(s => <option key={s} value={s}>{s} (ว่าง {availOf(it.color, s)})</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ margin: 0 }}><label>จำนวน{it.size ? ` / ว่าง ${av}` : ''}</label>
                    <input type="number" min="0" max={av || undefined} className="input num" value={it.qty} disabled={!it.size} onChange={e => setItem(i, { qty: e.target.value })} placeholder="0" />
                  </div>
                  <button type="button" className="icon-btn" onClick={() => removeItem(i)} style={{ color: 'var(--bad)', marginBottom: 4 }}><Icon name="x" /></button>
                </div>
              );
            })}
            <div className="field-row" style={{ marginTop: 4 }}>
              <div className="field" style={{ marginBottom: 0 }}><label>วันที่จอง</label><input type="date" className="input" value={date} onChange={e => { setTouched(true); setDate(e.target.value); }} /></div>
              <div className="field" style={{ marginBottom: 0 }}><label>โน้ต</label><input className="input" value={note} onChange={e => { setTouched(true); setNote(e.target.value); }} placeholder="เช่น รอโอน / นัดรับศุกร์" /></div>
            </div>
            <div className="row between" style={{ marginTop: 12, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)' }}>
              <span className="cap">รวมจอง</span><span><b style={{ fontSize: 16 }}>{N(totalQty)}</b> ตัว</span>
            </div>
          </>)}
        </>)}
    </Modal>
  );
}

/* ---------- Movement ledger modal (ประวัติเข้า-ออกต่อสินค้า) ---------- */
const LEDGER_META = {
  receive: { l: 'รับเข้า', c: 'var(--good)', sign: '+' },
  sale: { l: 'ขาย', c: 'var(--accent-2)', sign: '−' },
  adjust: { l: 'ปรับสต็อก', c: 'var(--info)', sign: '±' },
  reserve: { l: 'จอง', c: 'var(--accent)', sign: '·' },
  release: { l: 'ปล่อยจอง', c: 'var(--ink-3)', sign: '·' },
};
export function MovementLedgerModal({ data, onClose }) {
  const product = data || {};
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: logs, error } = await supabase.from('tmk_audit_logs')
        .select('created_at,action,details').in('action', ['receive', 'sale', 'adjust', 'reserve', 'release'])
        .order('created_at', { ascending: false }).limit(500);
      if (cancel) return;
      if (error) { setRows([]); return; }
      const parsed = (logs || []).map(r => {
        let d = {}; try { d = typeof r.details === 'string' ? JSON.parse(r.details) : (r.details || {}); } catch { /* ข้าม */ }
        return { action: r.action, at: r.created_at, name: d.entityName || '', summary: d.summary || '', fields: Array.isArray(d.fields) ? d.fields : [] };
      }).filter(x => x.name === product.name);
      setRows(parsed);
    })();
    return () => { cancel = true; };
  }, [product.name]);

  const footer = <button className="btn" onClick={onClose}>ปิด</button>;
  return (
    <Modal wide icon="route" title="ประวัติเข้า-ออกสต็อก" sub={product.name || ''} onClose={onClose} footer={footer}>
      {rows === null
        ? <div className="cap" style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }}>กำลังโหลด…</div>
        : rows.length === 0
          ? <div className="cap" style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }}>ยังไม่มีประวัติเคลื่อนไหวของสินค้านี้</div>
          : (
            <div className="table-wrap" style={{ maxHeight: 460, overflowY: 'auto' }}><table className="table">
              <thead><tr><th>วันที่/เวลา</th><th>รายการ</th><th>รายละเอียด</th></tr></thead>
              <tbody>
                {rows.map((r, i) => { const m = LEDGER_META[r.action] || { l: r.action, c: 'var(--ink-3)', sign: '·' }; return (
                  <tr key={i}>
                    <td className="cap" style={{ whiteSpace: 'nowrap' }}>{new Date(r.at).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td><span className="chip" style={{ background: 'var(--surface-2)', color: m.c, fontWeight: 700 }}>{m.sign} {m.l}</span></td>
                    <td><div className="cap">{(r.fields || []).filter(f => !['รวมขาย', 'มูลค่าขาย', 'วันที่', 'ล็อต', 'ต้นทุน/ตัว'].includes(f.label)).map(f => `${f.label} ${f.value}`).join(', ') || r.summary}</div></td>
                  </tr>
                ); })}
              </tbody>
            </table></div>
          )}
    </Modal>
  );
}

/* ---------- Receive PO into a lot modal (รับเข้า PO → สร้างล็อต ไซส์×สี) ---------- */
export function ReceiveModal({ data, onClose }) {
  const po = data || {};
  const product = (MD.products || []).find(p => p.name === po.product) || null;
  const [lot, setLotObj] = useState(() => ({ ...newLot(), date: po.arrivalISO || todayISO() }));
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const patchLot = (fn) => { setTouched(true); setLotObj(fn); };
  const toggleSize = (size) => patchLot(l => {
    const has = l.sizes.includes(size);
    if (!has) return { ...l, sizes: SIZES.filter(s => l.sizes.includes(s) || s === size) };
    const grid = {}; for (const cid in l.grid) { const row = { ...l.grid[cid] }; delete row[size]; grid[cid] = row; }
    return { ...l, sizes: l.sizes.filter(s => s !== size), grid };
  });
  const addColor = (proto) => patchLot(l => ({ ...l, colors: [...l.colors, { id: uid('clr'), name: proto?.name || '', hex: proto?.hex || '#cccccc' }] }));
  const setColor = (cid, k, v) => patchLot(l => ({ ...l, colors: l.colors.map(c => c.id === cid ? { ...c, [k]: v } : c) }));
  const removeColor = (cid) => patchLot(l => { const grid = { ...l.grid }; delete grid[cid]; return { ...l, colors: l.colors.filter(c => c.id !== cid), grid }; });
  const setCell = (cid, size, v) => patchLot(l => { const q = Math.max(0, Math.round(Number(v) || 0)); const row = { ...(l.grid[cid] || {}) }; if (q > 0) row[size] = q; else delete row[size]; return { ...l, grid: { ...l.grid, [cid]: row } }; });

  const lotTot = calcLotTotal(lot);
  const cellInput = { width: 46, textAlign: 'center', padding: '5px 2px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 'var(--fs-sm)' };
  const stickyTh = { position: 'sticky', left: 0, zIndex: 2, background: 'var(--surface-2)', minWidth: 156, textAlign: 'left' };
  const stickyTd = { position: 'sticky', left: 0, zIndex: 1, background: 'var(--surface)', minWidth: 156 };

  const handleSave = async () => {
    if (busy || !product) return;
    // normalize ล็อต (เหมือนตอนเซฟใน ProductModal)
    const orderedSizes = SIZES.filter(s => lot.sizes.includes(s));
    const colors = [], grid = {};
    lot.colors.forEach(c => {
      const row = {}; orderedSizes.forEach(s => { const q = Math.max(0, Math.round(Number(lot.grid?.[c.id]?.[s]) || 0)); if (q > 0) row[s] = q; });
      if (Object.keys(row).length) { const cid = c.id || uid('clr'); colors.push({ id: cid, name: String(c.name || '').trim() || 'สี', hex: c.hex || '#cccccc' }); grid[cid] = row; }
    });
    if (!colors.length) { toast('กรอกจำนวนรับเข้าอย่างน้อย 1 ช่อง', 'error'); return; }
    const usedSizes = orderedSizes.filter(s => colors.some(c => grid[c.id][s] != null));
    const newLotObj = { id: lot.id || uid('lot'), lotNo: String(lot.lotNo || '').trim() || (po.product ? `PO-${po.id?.slice(-4) || ''}` : ''), date: lot.date || todayISO(), cost: nn(lot.cost), note: String(lot.note || '').trim() || `รับเข้าจาก PO`, sizes: usedSizes, colors, grid };
    const received = colors.reduce((a, c) => a + Object.values(grid[c.id]).reduce((x, y) => x + y, 0), 0);
    setBusy(true);
    try {
      const newLots = [...(product.lots || []), newLotObj];
      const newStock = newLots.reduce((a, l) => a + calcLotTotal(l), 0);
      const { error } = await supabase.from('tmk_products').update({ lots: newLots, stock_on_hand: newStock, updated_at: new Date().toISOString() }).eq('id', product.id);
      if (error) throw error;
      // มาร์ค PO ว่าของเข้าแล้ว
      if (po.id) await supabase.from('tmk_purchase_orders').update({ status: 'Completed', updated_at: new Date().toISOString() }).eq('id', po.id);
      logAudit({ action: 'receive', entityType: 'product', entityName: product.name, summary: `รับเข้า PO "${po.product}" ${received} ตัว → ล็อต "${newLotObj.lotNo}"`, fields: [{ label: 'รับเข้า', value: `${N(received)} ตัว` }, { label: 'ล็อต', value: newLotObj.lotNo }, { label: 'ต้นทุน/ตัว', value: B(newLotObj.cost) }] });
      window.__reload?.();
      toast(`รับเข้าสต็อก ${received} ตัวเรียบร้อย`, 'success');
      onClose();
    } catch (err) {
      toast('รับเข้าไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const canSave = !!product && lotTot > 0;
  const footer = (<><button className="btn" onClick={() => guardClose(touched, onClose)}>ยกเลิก</button><button className="btn btn-primary" disabled={busy || !canSave} style={{ opacity: canSave ? 1 : 0.5 }} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'รับเข้าสต็อก'}</button></>);

  return (
    <Modal wide icon="box" title="รับเข้าสต็อกจาก PO" sub={`${po.product || ''} · สั่ง ${N(po.quantity || 0)} ตัว`} onClose={onClose} footer={footer} confirmOnClose={touched}>
      {!product
        ? <div className="cap" style={{ textAlign: 'center', padding: 24, color: 'var(--bad)' }}>ไม่พบสินค้าชื่อ "{po.product}" ในแคตตาล็อก — สร้างสินค้าชื่อนี้ก่อน หรือแก้ชื่อ PO ให้ตรงกับสินค้า</div>
        : (<>
          <div className="cap" style={{ marginBottom: 12, color: 'var(--ink-3)' }}>กรอกจำนวนที่รับเข้าจริงแยกตาม ไซส์ × สี → จะสร้างเป็นล็อตใหม่ให้สินค้า <b style={{ color: 'var(--ink)' }}>{product.name}</b> และมาร์ค PO นี้ว่าของเข้าแล้ว</div>
          <div className="field-row">
            <div className="field"><label>รหัสล็อต</label><input className="input" value={lot.lotNo} onChange={e => patchLot(l => ({ ...l, lotNo: e.target.value }))} placeholder="เช่น LOT-2406 (เว้นว่าง = อัตโนมัติ)" /></div>
            <div className="field"><label>วันที่รับเข้า</label><input type="date" className="input" value={lot.date} onChange={e => patchLot(l => ({ ...l, date: e.target.value }))} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>ต้นทุน/ตัว (฿)</label><input type="number" min="0" className="input num" value={lot.cost} onChange={e => patchLot(l => ({ ...l, cost: e.target.value }))} placeholder="0" /></div>
            <div className="field"><label>โน้ต</label><input className="input" value={lot.note} onChange={e => patchLot(l => ({ ...l, note: e.target.value }))} placeholder="เช่น โรงงาน A" /></div>
          </div>

          <div className="field" style={{ marginBottom: 10 }}>
            <label>ไซส์ในล็อตนี้</label>
            <div className="chips-pick">{SIZES.map(s => <button type="button" key={s} className={'pick' + (lot.sizes.includes(s) ? ' on' : '')} onClick={() => toggleSize(s)}>{s}</button>)}</div>
          </div>

          <label style={{ display: 'block', marginBottom: 6 }}>จำนวนรับเข้า ต่อ สี × ไซส์ <span className="cap" style={{ fontWeight: 400 }}>· รวม {N(lotTot)} ตัว</span></label>
          {lot.sizes.length === 0
            ? <div className="cap" style={{ color: 'var(--ink-4)', padding: '2px 0 8px' }}>เลือกไซส์ด้านบนก่อน</div>
            : lot.colors.length === 0
              ? <div className="cap" style={{ color: 'var(--ink-4)', padding: '2px 0 8px' }}>เพิ่มสีด้านล่างเพื่อกรอกจำนวน</div>
              : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 'var(--r-xs)', marginBottom: 10 }}>
                  <table className="table" style={{ margin: 0, minWidth: 'max-content' }}>
                    <thead><tr><th style={stickyTh}>สี \ ไซส์</th>{lot.sizes.map(s => <th key={s} style={{ textAlign: 'center', minWidth: 50 }}>{s}</th>)}<th style={{ textAlign: 'center' }}>รวม</th></tr></thead>
                    <tbody>
                      {lot.colors.map(c => (
                        <tr key={c.id}>
                          <td style={stickyTd}>
                            <div className="row" style={{ gap: 6 }}>
                              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(c.hex) ? c.hex : '#cccccc'} onChange={e => setColor(c.id, 'hex', e.target.value)} style={{ width: 22, height: 22, padding: 0, border: '1px solid var(--line)', borderRadius: 5, background: 'none', cursor: 'pointer', flexShrink: 0 }} />
                              <input value={c.name} onChange={e => setColor(c.id, 'name', e.target.value)} placeholder="ชื่อสี" style={{ flex: 1, minWidth: 70, padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 'var(--fs-sm)' }} />
                              <button type="button" className="icon-btn" onClick={() => removeColor(c.id)} style={{ color: 'var(--bad)', flexShrink: 0 }}><Icon name="x" /></button>
                            </div>
                          </td>
                          {lot.sizes.map(s => <td key={s} style={{ textAlign: 'center', padding: 4 }}><input inputMode="numeric" value={cellQty(lot, c.id, s)} onChange={e => setCell(c.id, s, e.target.value)} placeholder="0" style={cellInput} /></td>)}
                          <td className="num" style={{ textAlign: 'center', fontWeight: 700 }}>{N(rowSum(lot, c.id))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr style={{ fontWeight: 700 }}><td style={stickyTd}>รวมต่อไซส์</td>{lot.sizes.map(s => <td key={s} className="num" style={{ textAlign: 'center' }}>{N(colSum(lot, s))}</td>)}<td className="num" style={{ textAlign: 'center', color: 'var(--accent-2)' }}>{N(lotTot)}</td></tr></tfoot>
                  </table>
                </div>
              )}

          <label style={{ display: 'block', marginBottom: 6 }}>เพิ่มสี</label>
          <div className="chips-pick">
            {SHIRT_COLORS.map(sc => <button type="button" key={sc.name} className="pick" onClick={() => addColor(sc)} disabled={lot.colors.some(c => c.name === sc.name)} style={{ opacity: lot.colors.some(c => c.name === sc.name) ? 0.4 : 1 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: sc.hex, border: '1px solid var(--line)', display: 'inline-block', marginRight: 4, verticalAlign: '-1px' }}></span>{sc.name}</button>)}
            <button type="button" className="pick" onClick={() => addColor()}><Icon name="plus" /> สีกำหนดเอง</button>
          </div>
        </>)}
    </Modal>
  );
}

/* ---------- Quick find / barcode scan → ขายเร็ว ---------- */
export function QuickFindModal({ onClose }) {
  const products = MD.products || [];
  const [q, setQ] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState('');
  const inputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const norm = s => String(s || '').trim().toLowerCase();
  const ql = norm(q);
  const exact = ql ? products.find(p => norm(p.barcode) === ql || norm(p.sku) === ql) : null;
  const matches = ql ? products.filter(p => norm(p.name).includes(ql) || (p.sku && norm(p.sku).includes(ql)) || (p.barcode && norm(p.barcode).includes(ql))).slice(0, 8) : [];

  const stopCam = () => { try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* ignore */ } streamRef.current = null; setScanning(false); };
  useEffect(() => { inputRef.current?.focus(); return () => stopCam(); }, []);

  const close = () => { stopCam(); onClose(); };
  const goSell = (p) => { stopCam(); onClose(); window.__openModal('sell', p); };
  const onKey = (e) => { if (e.key === 'Enter') { if (exact) goSell(exact); else if (matches.length === 1) goSell(matches[0]); } };

  const startCam = async () => {
    if (!('BarcodeDetector' in window)) { setScanErr('เบราว์เซอร์นี้ไม่รองรับสแกนด้วยกล้อง — พิมพ์ชื่อ/SKU หรือใช้เครื่องยิงบาร์โค้ดแทนได้'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream; setScanning(true); setScanErr('');
      const video = videoRef.current; video.srcObject = stream; await video.play();
      const detector = new window.BarcodeDetector();
      const loop = async () => {
        if (!streamRef.current) return;
        try {
          const codes = await detector.detect(video);
          if (codes && codes.length) {
            const val = codes[0].rawValue; setQ(val);
            const found = products.find(p => norm(p.barcode) === norm(val) || norm(p.sku) === norm(val));
            if (found) { goSell(found); return; }
          }
        } catch { /* detect อาจ throw ระหว่างเฟรม — ข้าม */ }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch (err) { setScanErr('เปิดกล้องไม่ได้: ' + err.message); }
  };

  const footer = <button className="btn" onClick={close}>ปิด</button>;
  return (
    <Modal icon="search" title="ขายเร็ว / สแกนบาร์โค้ด" sub="พิมพ์ชื่อ / SKU / บาร์โค้ด หรือยิงสแกนเนอร์ แล้วกด Enter → ไปหน้าขาย" onClose={close} footer={footer}>
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <input ref={inputRef} className="input" style={{ flex: 1 }} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} placeholder="🔍 บาร์โค้ด / SKU / ชื่อสินค้า" />
        {!scanning
          ? <button className="btn btn-sm" onClick={startCam} title="สแกนด้วยกล้อง"><Icon name="search" /> กล้อง</button>
          : <button className="btn btn-sm" onClick={stopCam} style={{ color: 'var(--bad)' }}><Icon name="x" /> หยุด</button>}
      </div>
      {scanErr && <div className="cap" style={{ color: 'var(--warn)', marginBottom: 10 }}>{scanErr}</div>}
      {scanning && <div style={{ marginBottom: 10, borderRadius: 'var(--r-sm)', overflow: 'hidden', border: '1px solid var(--line)', background: '#000' }}><video ref={videoRef} muted playsInline style={{ width: '100%', maxHeight: 240, objectFit: 'cover', display: 'block' }} /></div>}

      {ql && matches.length === 0 && <div className="cap" style={{ color: 'var(--ink-4)', padding: '6px 0' }}>ไม่พบสินค้าที่ตรงกับ "{q}"</div>}
      {matches.map(p => (
          <button key={p.id} onClick={() => goSell(p)} className="row between" style={{ width: '100%', textAlign: 'left', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', marginBottom: 6, cursor: 'pointer' }}>
            <span className="row" style={{ gap: 10, minWidth: 0 }}>
              <span style={{ width: 30, height: 30, borderRadius: 7, flexShrink: 0, overflow: 'hidden', background: 'var(--surface-2)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center' }}>{p.image ? <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name="bag" />}</span>
              <span style={{ minWidth: 0 }}><span style={{ fontWeight: 600 }}>{p.name}</span><span className="cap" style={{ display: 'block' }}>{[p.sku && ('SKU ' + p.sku), p.barcode].filter(Boolean).join(' · ') || `คงเหลือ ${p.onHand}`}</span></span>
            </span>
            <span className="cap" style={{ flexShrink: 0 }}>เหลือ {p.onHand} · {B(p.price)}</span>
          </button>
        ))}
      {!ql && <div className="cap" style={{ color: 'var(--ink-4)', padding: '6px 0' }}>เริ่มพิมพ์หรือยิงบาร์โค้ดเพื่อค้นหาสินค้า แล้วไปหน้าขายทันที</div>}
    </Modal>
  );
}

/* ---------- Print product labels (ป้ายราคา/บาร์โค้ด) ---------- */
function printLabels(items, opts = {}) {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const { height = 46, module = 1.5 } = opts;
  let cells = '';
  items.forEach(it => {
    const code = it.barcode || it.sku || it.name;
    const svg = barcodeSVGString(code, { height, module, color: '#000' });
    for (let k = 0; k < it.copies; k++) {
      cells += `<div class="lbl"><div class="nm">${esc(it.name)}</div><div class="pr">฿${Number(it.price || 0).toLocaleString('en-US')}</div><div class="bc">${svg}</div><div class="cd">${esc(code)}</div></div>`;
    }
  });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>ป้ายสินค้า</title><style>
    *{box-sizing:border-box;font-family:'Sarabun','Noto Sans Thai',system-ui,sans-serif;}
    body{margin:8px;}
    .sheet{display:flex;flex-wrap:wrap;gap:4mm;}
    .lbl{width:48mm;border:1px dashed #ccc;border-radius:4px;padding:3mm;text-align:center;break-inside:avoid;page-break-inside:avoid;}
    .nm{font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .pr{font-size:18px;font-weight:800;margin:2px 0;}
    .bc svg{max-width:100%;height:auto;}
    .cd{font-size:9px;letter-spacing:1px;margin-top:1px;font-family:monospace;}
    @media print{.lbl{border:1px solid #eee;} @page{margin:6mm;}}
  </style></head><body><div class="sheet">${cells}</div></body></html>`;
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document; doc.open(); doc.write(html); doc.close();
  setTimeout(() => { try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch { /* ignore */ } setTimeout(() => iframe.remove(), 1500); }, 350);
}

export function LabelModal({ data, onClose }) {
  const products = MD.products || [];
  const SIZE_OPTS = { s: { height: 36, module: 1.2, label: 'เล็ก' }, m: { height: 46, module: 1.5, label: 'กลาง' }, l: { height: 60, module: 1.9, label: 'ใหญ่' } };
  const [copies, setCopies] = useState(() => Object.fromEntries(products.map(p => [p.id, data?.id ? (p.id === data.id ? 1 : 0) : 1])));
  const [size, setSize] = useState('m');
  const setC = (id, v) => setCopies(c => ({ ...c, [id]: Math.max(0, Math.min(99, Math.round(Number(v) || 0))) }));
  const items = products.filter(p => (copies[p.id] || 0) > 0).map(p => ({ name: p.name, price: p.price, sku: p.sku, barcode: p.barcode, copies: copies[p.id] }));
  const totalLabels = items.reduce((a, it) => a + it.copies, 0);
  const so = SIZE_OPTS[size];
  const preview = products.find(p => (copies[p.id] || 0) > 0) || products[0];
  const previewCode = preview ? (preview.barcode || preview.sku || preview.name) : '';

  const doPrint = () => {
    if (!totalLabels) { toast('เลือกจำนวนป้ายอย่างน้อย 1 ดวง', 'error'); return; }
    printLabels(items, so);
    logAudit({ action: 'export', entityType: 'data', entityName: 'ป้ายสินค้า', summary: `พิมพ์ป้ายสินค้า ${totalLabels} ดวง` });
    toast(`กำลังเปิดหน้าพิมพ์ ${totalLabels} ดวง`, 'success');
  };

  const footer = (<><button className="btn" onClick={onClose}>ปิด</button><button className="btn btn-primary" disabled={!totalLabels} style={{ opacity: totalLabels ? 1 : 0.5 }} onClick={doPrint}><Icon name="external" /> พิมพ์ป้าย ({totalLabels})</button></>);
  return (
    <Modal wide icon="bag" title="พิมพ์ป้ายราคา / บาร์โค้ด" sub="เลือกจำนวนป้ายต่อสินค้า แล้วกดพิมพ์ (ใช้กับเครื่องพิมพ์ทั่วไป/ป้ายสติกเกอร์)" onClose={onClose} footer={footer}>
      {products.length === 0
        ? <div className="cap" style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }}>ยังไม่มีสินค้า</div>
        : (<>
          <div className="row between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div className="row" style={{ gap: 8 }}>
              <span className="cap">ขนาดป้าย</span>
              <div className="segbar">{Object.entries(SIZE_OPTS).map(([id, o]) => <button key={id} className={'seg' + (size === id ? ' active' : '')} onClick={() => setSize(id)}>{o.label}</button>)}</div>
            </div>
            {/* พรีวิวป้าย */}
            {preview && <div style={{ border: '1px dashed var(--line)', borderRadius: 6, padding: 8, textAlign: 'center', minWidth: 150 }}>
              <div style={{ fontWeight: 600, fontSize: 11 }}>{preview.name}</div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{B(preview.price)}</div>
              <Barcode value={previewCode} height={so.height} module={so.module} />
              <div className="cap" style={{ fontFamily: 'monospace', letterSpacing: 1 }}>{previewCode}</div>
            </div>}
          </div>
          <div className="row between" style={{ marginBottom: 6 }}>
            <label style={{ margin: 0 }}>จำนวนป้ายต่อสินค้า</label>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCopies(Object.fromEntries(products.map(p => [p.id, 1])))}>ทุกชิ้น ×1</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCopies(Object.fromEntries(products.map(p => [p.id, 0])))}>ล้าง</button>
            </div>
          </div>
          <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}><table className="table">
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td><div className="row" style={{ gap: 8 }}>
                    <span style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, overflow: 'hidden', background: 'var(--surface-2)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center' }}>{p.image ? <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name="bag" />}</span>
                    <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>{p.name}</div><div className="cap">{[p.sku && ('SKU ' + p.sku), p.barcode].filter(Boolean).join(' · ') || B(p.price)}</div></div>
                  </div></td>
                  <td style={{ width: 90, textAlign: 'right' }}><input type="number" min="0" max="99" className="input num" style={{ width: 70 }} value={copies[p.id] || 0} onChange={e => setC(p.id, e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </>)}
    </Modal>
  );
}

/* ============================================================
   Order system (ออเดอร์ + ลูกค้า + ติดตามสถานะ)
   ============================================================ */
// โค้ดออเดอร์: ORD-YYMMDD-XXXX
function genOrderCode() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2), mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `ORD-${yy}${mm}${dd}-${(Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6)).slice(0, 8).toUpperCase()}`;
}
// ตัดสต็อกแบบ FIFO (ล็อตเก่าก่อน) สำหรับ 1 variant → คืน lots ใหม่ + จำนวนที่ตัดได้ + ต้นทุนรวม
function deductVariantFIFO(lots, color, size, qty) {
  let need = Math.max(0, Math.round(Number(qty) || 0)), costTotal = 0;
  const newLots = (lots || []).map(l => ({ ...l, grid: Object.fromEntries(Object.entries(l.grid || {}).map(([cid, row]) => [cid, { ...row }])) }));
  const order = newLots.map((l, i) => i).sort((a, b) => String(newLots[a].date || '9999').localeCompare(String(newLots[b].date || '9999')));
  for (const idx of order) {
    if (need <= 0) break;
    const lot = newLots[idx];
    const col = (lot.colors || []).find(c => c.name === color);
    if (!col) continue;
    const avail = Number(lot.grid?.[col.id]?.[size]) || 0;
    if (avail <= 0) continue;
    const take = Math.min(need, avail);
    const row = { ...(lot.grid[col.id] || {}) }; const left = avail - take; if (left > 0) row[size] = left; else delete row[size];
    lot.grid[col.id] = row;
    need -= take; costTotal += take * (Number(lot.cost) || 0);
  }
  return { newLots, deducted: qty - need, costTotal };
}
// จองสต็อกตามออเดอร์ (เขียน reservations ที่มี orderId ลงแต่ละสินค้า)
async function applyOrderReservations(order) {
  const byProd = {};
  (order.items || []).forEach(it => { (byProd[it.productId] = byProd[it.productId] || []).push({ color: it.color, size: it.size, qty: nn(it.qty) }); });
  await Promise.all(Object.entries(byProd).map(([pid, items]) => {
    const p = (MD.products || []).find(x => x.id === pid); if (!p) return null;
    const others = (p.reservations || []).filter(r => r.orderId !== order.id);
    const rsv = { id: 'rsv-' + order.id, orderId: order.id, customer: order.customerName || '', date: todayISO(), note: `ออเดอร์ ${order.code}`, items };
    return supabase.from('tmk_products').update({ reservations: [...others, rsv], updated_at: new Date().toISOString() }).eq('id', pid);
  }).filter(Boolean));
}
async function releaseOrderReservations(orderId) {
  const affected = (MD.products || []).filter(p => (p.reservations || []).some(r => r.orderId === orderId));
  await Promise.all(affected.map(p => supabase.from('tmk_products').update({ reservations: (p.reservations || []).filter(r => r.orderId !== orderId), updated_at: new Date().toISOString() }).eq('id', p.id)));
}
// คำนวณการตัดสต็อก (FIFO) — ไม่เขียน DB → คืน batch updates + audit + จำนวนที่ตัดได้
// (เขียนจริงแบบ atomic ใน advanceOrderStatus ผ่าน RPC tmk_fulfill_order)
function computeFulfillment(order) {
  const byProd = {};
  (order.items || []).forEach(it => (byProd[it.productId] = byProd[it.productId] || []).push(it));
  const updates = [], audits = [], sales = [];
  let totReq = 0, totDeducted = 0; // กันตัดสต็อกขาดเงียบๆ — เตือนถ้าสต็อกไม่พอ
  for (const pid in byProd) {
    const p = (MD.products || []).find(x => x.id === pid); if (!p) continue;
    let lots = p.lots || []; let costTotal = 0, soldQty = 0, amount = 0; const lines = [];
    byProd[pid].forEach(it => {
      const r = deductVariantFIFO(lots, it.color, it.size, nn(it.qty));
      lots = r.newLots; costTotal += r.costTotal; soldQty += r.deducted; amount += r.deducted * (Number(it.price) || 0);
      totReq += nn(it.qty); totDeducted += r.deducted;
      if (r.deducted > 0) lines.push({ color: it.color, size: it.size, qty: r.deducted, cost: r.deducted ? r.costTotal / r.deducted : 0 });
    });
    updates.push({ id: pid, lots, stock_on_hand: lots.reduce((a, l) => a + calcLotTotal(l), 0), reservations: (p.reservations || []).filter(rr => rr.orderId !== order.id), actual_units: Number(p.units || 0) + soldQty });
    audits.push({ pid, p, soldQty, amount, costTotal, lines });
    if (soldQty > 0) sales.push({ id: 'sale-' + order.id + '-' + pid, sale_date: todayISO(), product_id: pid, product_name: p.name, category: p.category || '', channel: order.channel || '', qty: soldQty, amount, cost: costTotal, source: 'order', order_code: order.code, lines });
  }
  return { updates, audits, sales, totReq, totDeducted };
}
// fallback (ยังไม่ได้รัน SQL function) — เขียนแบบเดิม non-atomic
async function fulfillLegacyWrite(order, updates, sales, log) {
  await Promise.all(updates.map(u => supabase.from('tmk_products').update({ lots: u.lots, stock_on_hand: u.stock_on_hand, reservations: u.reservations, actual_units: u.actual_units, updated_at: new Date().toISOString() }).eq('id', u.id)));
  if (sales && sales.length) await supabase.from('tmk_sales').upsert(sales); // บันทึกการขายลงตารางจริง (ถ้าตารางมี)
  const { error } = await supabase.from('tmk_orders').update({ status: 'shipped', status_log: log, updated_at: new Date().toISOString() }).eq('id', order.id);
  if (error) throw error;
}
// เปลี่ยนสถานะออเดอร์ + จัดการสต็อกตามสถานะ (เรียกจากบอร์ด Kanban)
export async function advanceOrderStatus(order, newStatus, by = '') {
  try {
    if (order.status === newStatus) return true;
    if (order.status === 'shipped' && newStatus !== 'shipped') { toast('ออเดอร์ที่ส่งแล้วเปลี่ยนสถานะไม่ได้ (สต็อกถูกตัดแล้ว)', 'error'); return false; } // กันสต็อกหาย (defense)
    const log = [...(order.statusLog || []), { status: newStatus, at: new Date().toISOString(), by }];
    if (newStatus === 'shipped' && order.status !== 'shipped') {
      // ส่งแล้ว → ตัดสต็อก (FIFO) + ปล่อยจอง + บวกขาย + เปลี่ยนสถานะ — ทั้งหมดใน transaction เดียว (atomic)
      const { updates, audits, sales, totReq, totDeducted } = computeFulfillment(order);
      const { error: rpcErr } = await supabase.rpc('tmk_fulfill_order', { p_order_id: order.id, p_status: 'shipped', p_status_log: log, p_updates: updates, p_sales: sales });
      if (rpcErr) {
        if (/PGRST202|could not find the function|schema cache/i.test(rpcErr.message || '')) {
          await fulfillLegacyWrite(order, updates, sales, log); // ยังไม่รัน SQL → ตัดแบบไม่ atomic ชั่วคราว
          toast('⚠️ ยังไม่ได้รัน SQL (tmk_fulfill_order) — ตัดสต็อกแบบไม่ atomic ชั่วคราว แนะนำรัน migration', 'warn');
        } else throw rpcErr;
      }
      audits.forEach(a => { if (a.soldQty > 0) logAudit({ action: 'sale', entityType: 'product', entityName: a.p.name, summary: `ขาย (ออเดอร์ ${order.code}) "${a.p.name}" ${a.soldQty} ตัว`, fields: [{ label: 'ออเดอร์', value: order.code }, { label: 'รวมขาย', value: N(a.soldQty) + ' ตัว' }, { label: 'มูลค่า', value: B(a.amount) }], data: { productId: a.pid, productName: a.p.name, category: a.p.category || '', price: a.soldQty ? a.amount / a.soldQty : 0, date: todayISO(), totalQty: a.soldQty, totalAmount: a.amount, totalCost: a.costTotal, lines: a.lines } }); });
      if (totDeducted < totReq) toast(`⚠️ สต็อกไม่พอ — ส่งได้ ${N(totDeducted)}/${N(totReq)} ตัว (ตัดสต็อกเท่าที่มี) ตรวจสอบสต็อกด้วย`, 'warn');
    } else {
      if (newStatus === 'cancelled' && order.status !== 'shipped' && order.status !== 'cancelled') await releaseOrderReservations(order.id);
      const { error } = await supabase.from('tmk_orders').update({ status: newStatus, status_log: log, updated_at: new Date().toISOString() }).eq('id', order.id);
      if (error) throw error;
    }
    logAudit({ action: 'order', entityType: 'order', entityName: order.code, summary: `ออเดอร์ ${order.code} → ${orderStatusMeta(newStatus).label}` });
    window.__reload?.();
    toast(`อัปเดตเป็น "${orderStatusMeta(newStatus).label}"`, 'success');
    return true;
  } catch (err) { toast('เปลี่ยนสถานะไม่สำเร็จ: ' + err.message, 'error'); return false; }
}

/* ---------- Order modal (สร้าง/แก้ออเดอร์) ---------- */
const emptyOrderItem = () => ({ id: uid('oi'), productId: '', color: '', size: '', qty: '', price: '' });
export function OrderModal({ data, onClose }) {
  const products = (MD.products || []).filter(p => p.hasLots);
  const customers = MD.customers || [];
  const [custId, setCustId] = useState(data?.customerId || '');
  const [custNew, setCustNew] = useState(data ? null : { name: '', phone: '', line: '', address: '' });
  const [items, setItems] = useState(data?.items?.length ? data.items.map(it => ({ ...it, id: uid('oi') })) : [emptyOrderItem()]);
  const [discount, setDiscount] = useState(data?.discount || '');
  const [channel, setChannel] = useState(data?.channel || '');
  const [note, setNote] = useState(data?.note || '');
  const [trackingNo, setTrackingNo] = useState(data?.trackingNo || '');
  const [carrier, setCarrier] = useState(data?.carrier || '');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const _t = (fn) => (...a) => { setTouched(true); fn(...a); };

  const prodById = (id) => products.find(p => p.id === id);
  const setItem = (i, patch) => { setTouched(true); setItems(its => its.map((x, j) => j === i ? { ...x, ...patch } : x)); };
  const addItem = () => { setTouched(true); setItems(its => [...its, emptyOrderItem()]); };
  const removeItem = (i) => { setTouched(true); setItems(its => its.length > 1 ? its.filter((_, j) => j !== i) : [emptyOrderItem()]); };

  const lineAmt = (it) => (Number(it.qty) || 0) * (Number(it.price) || 0);
  const subtotal = items.reduce((a, it) => a + lineAmt(it), 0);
  const total = Math.max(0, subtotal - (Number(discount) || 0));
  const totalQty = items.reduce((a, it) => a + (Number(it.qty) || 0), 0);

  const handleSave = async () => {
    if (busy) return;
    // ล็อกแก้ออเดอร์ที่ส่งแล้ว — สต็อกถูกตัดไปแล้ว แก้ items จะทำให้สต็อกเพี้ยน
    if (data?.status === 'shipped') { toast('ออเดอร์ที่ "ส่งแล้ว" แก้ไขไม่ได้ (สต็อกถูกตัดแล้ว)', 'error'); return; }
    const cleanItems = items.filter(it => it.productId && it.color && it.size && Number(it.qty) > 0).map(it => {
      const p = prodById(it.productId);
      return { productId: it.productId, name: p?.name || '', color: it.color, size: it.size, qty: nn(it.qty), price: nn(it.price), cost: 0 };
    });
    if (!cleanItems.length) { toast('เพิ่มรายการสินค้าก่อน', 'error'); return; }
    const custName = (custNew ? custNew.name : (customers.find(c => c.id === custId)?.name || '')).trim();
    if (!custName) { toast('ระบุชื่อลูกค้า', 'error'); return; }
    setBusy(true);
    try {
      // ลูกค้าใหม่ → เช็กเบอร์ซ้ำก่อน (มีเบอร์นี้แล้ว → ใช้ซ้ำ ไม่สร้างซ้ำ) แล้วค่อยสร้างเรคคอร์ด
      let customerId = custId;
      if (custNew && custNew.name.trim()) {
        const ph = (custNew.phone || '').trim();
        const dup = ph && customers.find(c => (c.phone || '').trim() === ph);
        if (dup) {
          customerId = dup.id;
        } else {
          customerId = uid('cust');
          const cRow = { id: customerId, code: 'C' + customerId.slice(-5).toUpperCase(), name: custNew.name.trim(), phone: ph, line: custNew.line.trim(), address: custNew.address.trim(), note: '' };
          const { error: cErr } = await supabase.from('tmk_customers').insert(cRow);
          if (cErr) throw cErr;
        }
      }
      const oid = data?.id || uid('o');
      const code = data?.code || genOrderCode();
      const status = data?.status || 'pending';
      const sub = cleanItems.reduce((a, it) => a + it.qty * it.price, 0);
      const tot = Math.max(0, sub - nn(discount));
      const order = { id: oid, code, customer_id: customerId || null, customer_name: custName, items: cleanItems, subtotal: sub, discount: nn(discount), total: tot, status, channel: channel.trim(), tracking_no: trackingNo.trim(), carrier: carrier.trim(), note: note.trim(), status_log: data?.statusLog || [{ status, at: new Date().toISOString(), by: '' }] };
      const { error } = await supabase.from('tmk_orders').upsert(order);
      if (error) throw error;
      // จองสต็อก (ยังไม่ส่ง) — ออเดอร์ที่ยัง active
      if (data?.id) await releaseOrderReservations(data.id); // แก้ออเดอร์: ปล่อยจองเดิมก่อน (กันจองค้างของสินค้าที่ถูกเอาออกจากออเดอร์)
      if (status !== 'shipped' && status !== 'cancelled') await applyOrderReservations({ ...order, customerName: custName });
      logAudit({ action: 'order', entityType: 'order', entityName: code, summary: `${data ? 'แก้ไข' : 'สร้าง'}ออเดอร์ ${code} (${custName}) ${totalQty} ตัว`, fields: [{ label: 'ลูกค้า', value: custName }, { label: 'ยอดรวม', value: B(tot) }, { label: 'สถานะ', value: orderStatusMeta(status).label }] });
      window.__reload?.();
      toast(`${data ? 'แก้ไข' : 'สร้าง'}ออเดอร์สำเร็จ`, 'success');
      onClose();
    } catch (err) {
      if (/tmk_orders|tmk_customers|column|schema cache|PGRST/i.test(err.message || '')) toast('ต้องรัน SQL migration (orders, customers) ก่อน', 'error');
      else toast('บันทึกออเดอร์ไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const isShipped = data?.status === 'shipped';
  const footer = (<>{data?.id && !isShipped && <button className="btn" style={{ color: 'var(--bad)', marginRight: 'auto' }} disabled={busy} onClick={async () => { if (window.confirm('ยกเลิกออเดอร์นี้? (จะปล่อยจองสต็อกคืน)')) { await advanceOrderStatus(data, 'cancelled'); onClose(); } }}><Icon name="x" /> ยกเลิกออเดอร์</button>}<button className="btn" onClick={() => guardClose(touched, onClose)}>ปิด</button>{!isShipped && <button className="btn btn-primary" disabled={busy || !total && !totalQty} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : (data ? 'บันทึก' : 'สร้างออเดอร์')}</button>}</>);

  return (
    <Modal wide icon="listChecks" title={data ? `ออเดอร์ ${data.code}` : 'สร้างออเดอร์'} sub={data ? orderStatusMeta(data.status).label : 'เลือกลูกค้า + สินค้า → จองสต็อกอัตโนมัติ'} onClose={onClose} footer={footer} confirmOnClose={touched}>
      {products.length === 0
        ? <div className="cap" style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }}>ยังไม่มีสินค้าที่มีล็อต — เพิ่มสินค้า+ล็อตก่อน</div>
        : (<>
          {/* ลูกค้า */}
          <div className="field"><label>ลูกค้า</label>
            {custNew ? (
              <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: 10 }}>
                <div className="field-row" style={{ marginBottom: 8 }}>
                  <div className="field" style={{ margin: 0 }}><label>ชื่อลูกค้า</label><input className="input" value={custNew.name} onChange={e => _t(setCustNew)({ ...custNew, name: e.target.value })} placeholder="ชื่อ-นามสกุล / ชื่อร้าน" /></div>
                  <div className="field" style={{ margin: 0 }}><label>เบอร์โทร</label><input className="input" value={custNew.phone} onChange={e => _t(setCustNew)({ ...custNew, phone: e.target.value })} placeholder="08x-xxx-xxxx" /></div>
                </div>
                <div className="field-row" style={{ marginBottom: 0 }}>
                  <div className="field" style={{ margin: 0 }}><label>LINE</label><input className="input" value={custNew.line} onChange={e => _t(setCustNew)({ ...custNew, line: e.target.value })} placeholder="LINE ID" /></div>
                  <div className="field" style={{ margin: 0 }}><label>ที่อยู่จัดส่ง</label><input className="input" value={custNew.address} onChange={e => _t(setCustNew)({ ...custNew, address: e.target.value })} placeholder="ที่อยู่" /></div>
                </div>
                {customers.length > 0 && <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={() => { setCustNew(null); setCustId(''); }}>← เลือกจากลูกค้าเดิม</button>}
              </div>
            ) : (
              <div className="row" style={{ gap: 8 }}>
                <select className="input" style={{ flex: 1 }} value={custId} onChange={e => _t(setCustId)(e.target.value)}>
                  <option value="">— เลือกลูกค้า —</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
                </select>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setCustNew({ name: '', phone: '', line: '', address: '' }); }}><Icon name="userPlus" /> ลูกค้าใหม่</button>
              </div>
            )}
          </div>

          {/* รายการสินค้า */}
          <div className="row between" style={{ marginBottom: 8 }}>
            <label style={{ margin: 0 }}>รายการสินค้า</label>
            <button type="button" className="btn btn-sm btn-ghost" onClick={addItem}><Icon name="plus" /> เพิ่มสินค้า</button>
          </div>
          {items.map((it, i) => {
            const p = prodById(it.productId);
            const colors = p ? Object.keys(p.variants || {}) : [];
            const sizes = (p && it.color) ? Object.keys(p.variants[it.color] || {}) : [];
            const avail = (p && it.color && it.size) ? (Number(p.variants[it.color]?.[it.size]) || 0) - (Number(p.reservedByVariant?.[it.color]?.[it.size]) || 0) : null;
            return (
              <div key={it.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: 10, marginBottom: 8, background: 'var(--surface)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 8 }}>
                  <select className="input" value={it.productId} onChange={e => { const np = prodById(e.target.value); setItem(i, { productId: e.target.value, color: '', size: '', price: np?.price || '' }); }}>
                    <option value="">— เลือกสินค้า —</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button type="button" className="icon-btn" onClick={() => removeItem(i)} style={{ color: 'var(--bad)' }}><Icon name="x" /></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                  <select className="input" value={it.color} disabled={!it.productId} onChange={e => setItem(i, { color: e.target.value, size: '' })}><option value="">สี</option>{colors.map(c => <option key={c} value={c}>{c}</option>)}</select>
                  <select className="input" value={it.size} disabled={!it.color} onChange={e => setItem(i, { size: e.target.value })}><option value="">ไซส์</option>{sizes.map(s => <option key={s} value={s}>{s} (ว่าง {Math.max(0, (Number(p.variants[it.color]?.[s]) || 0) - (Number(p.reservedByVariant?.[it.color]?.[s]) || 0))})</option>)}</select>
                  <input type="number" min="0" className="input num" value={it.qty} disabled={!it.size} onChange={e => setItem(i, { qty: e.target.value })} placeholder="จำนวน" />
                  <input type="number" min="0" className="input num" value={it.price} onChange={e => setItem(i, { price: e.target.value })} placeholder="ราคา/ตัว" />
                </div>
                {avail != null && Number(it.qty) > avail && <div className="cap" style={{ color: 'var(--warn)', marginTop: 6 }}>พร้อมขายเหลือ {avail} (เกินจะกลายเป็นค้างส่ง)</div>}
              </div>
            );
          })}

          <div className="field-row" style={{ marginTop: 4 }}>
            <div className="field" style={{ marginBottom: 0 }}><label>ส่วนลด (฿)</label><input type="number" min="0" className="input num" value={discount} onChange={e => _t(setDiscount)(e.target.value)} placeholder="0" /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>ช่องทาง</label><input className="input" value={channel} onChange={e => _t(setChannel)(e.target.value)} placeholder="เช่น LINE / Shopee / หน้าร้าน" /></div>
          </div>
          <div className="field-row">
            <div className="field" style={{ marginBottom: 0 }}><label>เลขแทร็กกิ้ง</label><input className="input" value={trackingNo} onChange={e => _t(setTrackingNo)(e.target.value)} placeholder="(ใส่ตอนส่ง)" /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>ขนส่ง</label><input className="input" value={carrier} onChange={e => _t(setCarrier)(e.target.value)} placeholder="เช่น Flash / Kerry / J&T" /></div>
          </div>
          <div className="field" style={{ marginTop: 8, marginBottom: 0 }}><label>โน้ต</label><input className="input" value={note} onChange={e => _t(setNote)(e.target.value)} placeholder="เช่น พิมพ์ลายพิเศษ / นัดรับ" /></div>

          <div className="row between" style={{ marginTop: 14, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)' }}>
            <span className="cap">{N(totalQty)} ตัว · ส่วนลด {B(Number(discount) || 0)}</span>
            <span>ยอดรวม <b style={{ fontSize: 17, color: 'var(--accent-2)' }}>{B(total)}</b></span>
          </div>
        </>)}
    </Modal>
  );
}

/* ---------- Customer modal (แก้/เพิ่มลูกค้า) ---------- */
export function CustomerModal({ data, onClose }) {
  const [f, setF] = useState(data || { name: '', phone: '', line: '', address: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const set = (k, v) => { setTouched(true); setF(p => ({ ...p, [k]: v })); };
  const handleSave = async () => {
    if (busy || !f.name.trim()) return;
    setBusy(true);
    try {
      const id = data?.id || uid('cust');
      const row = { id, code: data?.code || 'C' + id.slice(-5).toUpperCase(), name: f.name.trim(), phone: (f.phone || '').trim(), line: (f.line || '').trim(), address: (f.address || '').trim(), note: (f.note || '').trim() };
      const { error } = await supabase.from('tmk_customers').upsert(row);
      if (error) throw error;
      logAudit({ action: data ? 'update' : 'create', entityType: 'customer', entityName: row.name, summary: `${data ? 'แก้ไข' : 'เพิ่ม'}ลูกค้า "${row.name}"` });
      window.__reload?.();
      toast('บันทึกลูกค้าสำเร็จ', 'success');
      onClose();
    } catch (err) { toast('บันทึกไม่สำเร็จ: ' + err.message, 'error'); } finally { setBusy(false); }
  };
  const footer = (<><button className="btn" onClick={() => guardClose(touched, onClose)}>ยกเลิก</button><button className="btn btn-primary" disabled={busy} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก'}</button></>);
  return (
    <Modal icon="user" title={data ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้า'} onClose={onClose} footer={footer} confirmOnClose={touched}>
      <div className="field"><label>ชื่อลูกค้า</label><input className="input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="ชื่อ-นามสกุล / ชื่อร้าน" /></div>
      <div className="field-row">
        <div className="field"><label>เบอร์โทร</label><input className="input" value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="08x-xxx-xxxx" /></div>
        <div className="field"><label>LINE</label><input className="input" value={f.line} onChange={e => set('line', e.target.value)} placeholder="LINE ID" /></div>
      </div>
      <div className="field"><label>ที่อยู่จัดส่ง</label><textarea className="input" value={f.address} onChange={e => set('address', e.target.value)} placeholder="ที่อยู่" /></div>
      <div className="field" style={{ marginBottom: 0 }}><label>โน้ต</label><input className="input" value={f.note} onChange={e => set('note', e.target.value)} placeholder="เช่น ลูกค้าประจำ / ขายส่ง" /></div>
    </Modal>
  );
}

/* ---------- PO modal ---------- */
export function POModal({ data, onClose }) {
  const [f, setF] = useState(() => data
    ? { ...data, orderDate: data.orderISO || parseTaskDate(data.orderDate) || '', arrivalDate: data.arrivalISO || parseTaskDate(data.arrivalDate) || '' }
    : { product: '', quantity: '', orderDate: '', arrivalDate: '', status: 'Pending' });
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const set = (k, v) => { setTouched(true); setF(p => ({ ...p, [k]: v })); };
  const handleSave = async () => {
    if (busy || !f.product) return;
    if (f.orderDate && f.arrivalDate && f.arrivalDate < f.orderDate) { toast('กำหนดของเข้าต้องไม่ก่อนวันสั่ง', 'error'); return; }
    setBusy(true);
    const row = {
      id: data?.id || uid('po'),
      product: f.product,
      quantity: nn(f.quantity),
      order_date: f.orderDate || todayISO(),       // ISO จาก <input type=date>
      arrival_date: f.arrivalDate || todayISO(),
      status: f.status,
    };
    const ok = await saveRow('tmk_purchase_orders', row, 'บันทึก PO', {
      action: data ? 'update' : 'create', entityType: 'po', entityName: row.product,
      summary: `${data ? 'แก้ไข' : 'เปิด'} PO "${row.product}" (${row.quantity} ชิ้น)`,
      fields: [
        { label: 'จำนวน', value: N(row.quantity) + ' ชิ้น' },
        { label: 'วันสั่ง', value: thaiDate(f.orderDate) || '—' },
        { label: 'กำหนดเข้า', value: thaiDate(f.arrivalDate) || '—' },
        { label: 'สถานะ', value: f.status },
      ],
    });
    setBusy(false);
    if (ok) onClose();
  };
  const footer = (<>{data?.id && <button className="btn" style={{ color: 'var(--bad)', marginRight: 'auto' }} disabled={busy} onClick={async () => { if (await deleteRow('tmk_purchase_orders', data.id, 'PO', { action: 'delete', entityType: 'po', entityName: data.product, summary: `ลบ PO "${data.product}"` })) onClose(); }}><Icon name="trash" /> ลบ</button>}<button className="btn" onClick={() => guardClose(touched, onClose)}>ยกเลิก</button><button className="btn btn-primary" disabled={busy || !f.product} style={{ opacity: f.product ? 1 : 0.5 }} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก PO'}</button></>);
  return (
    <Modal icon="box" title={data?.id ? 'แก้ไข PO' : 'เปิด PO การผลิตใหม่'} sub="สั่งผลิตสินค้ากับโรงงาน" onClose={onClose} footer={footer} confirmOnClose={touched}>
      <div className="field"><label>รายการสินค้า</label>
        <select className="input" value={f.product} onChange={e => set('product', e.target.value)}>
          <option value="">{MD.products.length ? '— ยังไม่ได้เลือก —' : '— ยังไม่มีสินค้า (เพิ่มสินค้าก่อน) —'}</option>
          {MD.products.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </div>
      <div className="field-row">
        <div className="field"><label>จำนวน (ตัว)</label><input type="number" min="0" className="input num" value={f.quantity} onChange={e => set('quantity', e.target.value)} placeholder="0" /></div>
        <div className="field"><label>สถานะ</label>
          <div className="segbar">
            <button className={'seg' + (f.status === 'Pending' ? ' active' : '')} onClick={() => set('status', 'Pending')}>กำลังผลิต</button>
            <button className={'seg' + (f.status === 'Completed' ? ' active' : '')} onClick={() => set('status', 'Completed')}>ของเข้าแล้ว</button>
          </div>
        </div>
      </div>
      <div className="field-row">
        <div className="field"><label>วันที่สั่ง</label><input type="date" className="input" value={f.orderDate} onChange={e => set('orderDate', e.target.value)} /></div>
        <div className="field"><label>กำหนดของเข้า</label><input type="date" className="input" value={f.arrivalDate} onChange={e => set('arrivalDate', e.target.value)} /></div>
      </div>
    </Modal>
  );
}

/* ---------- Monthly Target modal ---------- */
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
      cogsPct: meta.cogsPct ?? '',
      otherExpense: meta.otherExpense ?? '',
    };
  };
  const _init = loadFor(monthIdx, year);
  const [total, setTotal] = useState(_init.total);
  const [chTargets, setChTargets] = useState(_init.chTargets);
  const [adChannels, setAdChannels] = useState(_init.adChannels);
  const [newCustTarget, setNewCustTarget] = useState(_init.newCustTarget);
  const [acosCeil, setAcosCeil] = useState(_init.acosCeil);
  const [cogsPct, setCogsPct] = useState(_init.cogsPct);
  const [otherExpense, setOtherExpense] = useState(_init.otherExpense);
  const [touched, setTouched] = useState(false);

  // เปลี่ยนเดือน → โหลดค่าของเดือนนั้น (แต่ละเดือนแยกกัน)
  const changeMonth = (idx, yr) => {
    setMonthIdx(idx); setYear(yr);
    const v = loadFor(idx, yr);
    setTotal(v.total); setChTargets(v.chTargets);
    setAdChannels(v.adChannels); setNewCustTarget(v.newCustTarget); setAcosCeil(v.acosCeil);
    setCogsPct(v.cogsPct); setOtherExpense(v.otherExpense);
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
        cogsPct: Math.min(100, Math.max(0, Number(cogsPct) || 0)),
        otherExpense: nn(otherExpense),
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
      if (Number(cogsPct) > 0) tgtFields.push({ label: 'ต้นทุนสินค้า', value: `${Number(cogsPct)}%` });
      if (Number(otherExpense) > 0) tgtFields.push({ label: 'ค่าใช้จ่ายอื่น', value: B(Number(otherExpense)) });
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
      cmpNum('ต้นทุนสินค้า %', exMeta.cogsPct, Math.min(100, Math.max(0, Number(cogsPct) || 0)), '%');
      cmpMoney('ค่าใช้จ่ายอื่น', exMeta.otherExpense, otherExpense);
      logAudit({
        action: existing ? 'update' : 'create',
        entityType: 'monthly',
        entityName: `${months[monthIdx]} ${year}`,
        summary: `ตั้งเป้าเดือน ${months[monthIdx]} ${year} (${B(Number(total) || 0)})`,
        fields: tgtFields,
        changes: tgtChanges.length ? tgtChanges : null,
        data: { month: monthIdx + 1, year, target: nn(total), meta },
      });
      window.__reload?.();
      toast('บันทึกเป้าหมายเรียบร้อย', 'success');
      onClose();
    } catch (err) {
      toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };
  const footer = (
    <>
      <button className="btn" onClick={() => guardClose(touched, onClose)}>ยกเลิก</button>
      <button className="btn btn-primary" disabled={busy} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
    </>
  );
  return (
    <Modal icon="target" title="ตั้งเป้าหมายรายเดือน" sub="กำหนดเป้ายอดขายและงบโฆษณา" onClose={onClose} footer={footer} wide confirmOnClose={touched}>
      <div className="field" style={{ maxWidth: 220 }}>
        <label>เดือน/ปี</label>
        <select className="input" value={`${monthIdx}-${year}`} onChange={e => { const [i, y] = e.target.value.split('-').map(Number); changeMonth(i, y); }}>
          {monthOptions.map(o => <option key={o.label} value={`${o.idx}-${o.year}`}>{o.label}</option>)}
        </select>
      </div>

      <div className="field">
        <label>เป้ายอดรวม (฿)</label>
        <input type="number" min="0" className="input" placeholder="0" value={total} onChange={e => { setTouched(true); setTotal(e.target.value); }} />
      </div>

      <div className="field">
        <label>เป้าต่อช่อง</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {chTargets.map((c, i) => (
            <div key={c.id} className="row" style={{ gap: 10 }}>
              <span className="row" style={{ gap: 7, width: 100, fontWeight: 600 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: c.hex }}></span>{c.name}
              </span>
              <input type="number" min="0" className="input" placeholder="0" style={{ flex: 1 }} value={c.target} onChange={e => upCh(i, e.target.value)} />
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
        <label>งบแอดต่อช่อง</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {adChannels.map((c, i) => (
            <div key={c.id} className="row" style={{ gap: 10 }}>
              <span className="row" style={{ gap: 7, width: 100, fontWeight: 600 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: c.hex }}></span>{c.name}
              </span>
              <input type="number" min="0" className="input" placeholder="0" style={{ flex: 1 }} value={c.budget} onChange={e => upAd(i, e.target.value)} />
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
          <input type="number" min="0" className="input" placeholder="0" value={newCustTarget} onChange={e => { setTouched(true); setNewCustTarget(e.target.value); }} />
        </div>
        <div className="field">
          <label>เพดาน ACOS %</label>
          <input type="number" min="0" className="input" value={acosCeil} onChange={e => { setTouched(true); setAcosCeil(e.target.value); }} />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label>ต้นทุนสินค้า % (ของยอดขาย)</label>
          <input type="number" min="0" max="100" className="input" placeholder="เช่น 40" value={cogsPct} onChange={e => { setTouched(true); setCogsPct(e.target.value); }} />
          <div className="cap" style={{ marginTop: 4, color: 'var(--ink-4)' }}>ใช้คำนวณกำไรสุทธิ — ต้นทุนสินค้าคิดเป็น % ของยอดขาย</div>
        </div>
        <div className="field">
          <label>ค่าใช้จ่ายอื่น/เดือน (บาท)</label>
          <input type="number" min="0" className="input" placeholder="0" value={otherExpense} onChange={e => { setTouched(true); setOtherExpense(e.target.value); }} />
          <div className="cap" style={{ marginTop: 4, color: 'var(--ink-4)' }}>ค่าส่ง/แพ็ค/เงินเดือน/ค่าเช่า ฯลฯ</div>
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
      <button className="btn" onClick={() => guardClose(touched, onClose)}>ยกเลิก</button>
      <button className="btn btn-primary" disabled={busy} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
    </>
  );
  return (
    <Modal icon="zap" title={data ? 'แก้ไขแคมเปญแอด' : 'สร้างแคมเปญแอด'} sub="ตั้งค่าแคมเปญโฆษณา" onClose={onClose} footer={footer} confirmOnClose={touched}>
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
        <input type="number" min="0" className="input" value={f.budget} onChange={e => set('budget', e.target.value)} placeholder="0" />
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
      window.__reload?.();
      toast('บันทึกกลุ่มลูกค้าเรียบร้อย', 'success');
      onClose();
    } catch (err) {
      toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };
  const footer = (
    <>
      <button className="btn" onClick={() => guardClose(touched, onClose)}>ยกเลิก</button>
      <button className="btn btn-primary" disabled={busy} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
    </>
  );
  return (
    <Modal icon="users" title="อัปเดตกลุ่มลูกค้า" sub="จัดกลุ่มลูกค้าตามพฤติกรรมการซื้อ" onClose={onClose} footer={footer} confirmOnClose={touched}>
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
                <input type="number" min="0" className="input" placeholder="0" value={seg.count} onChange={e => upSeg(i, 'count', e.target.value === '' ? '' : +e.target.value)} />
              </div>
              <div className="field">
                <label>% รายได้</label>
                <input type="number" min="0" className="input" placeholder="0" value={seg.revPct} onChange={e => upSeg(i, 'revPct', e.target.value === '' ? '' : +e.target.value)} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label>CLV เฉลี่ย (฿)</label>
        <input type="number" min="0" className="input" placeholder="0" value={clv} onChange={e => { setTouched(true); setClv(e.target.value); }} />
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
export function HistoricalEntryModal({ onClose, data }) {
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const monthlyRef = MD.monthly || [];
  const _today = getToday();
  const rnd = (x) => (x ? String(x) : ''); // ไม่ปัดเศษ — แสดง/บันทึกค่าจริงเท่านั้น
  const buildRows = (yr) => months.map((m, i) => {
    // เดือนปัจจุบันคำนวณอัตโนมัติจากยอดรายวัน → ไม่ prefill/ไม่ให้กรอกทับ
    const isCurrent = (i + 1) === _today.month && yr === _today.yearBE;
    const ref = monthlyRef.find(r => r.year === yr && r.month === i + 1);
    return {
      month: m,
      isCurrent,
      rev: isCurrent ? '' : rnd(ref?.actual),
      orders: isCurrent ? '' : (ref?.orders ? String(ref.orders) : ''),
      ad: isCurrent ? '' : rnd(ref?.adSpend),
      newCust: isCurrent ? '' : (ref?.newCust ? String(ref.newCust) : ''),
      messages: isCurrent ? '' : (ref?.messages ? String(ref.messages) : ''),
    };
  });
  // ตัวเลือกปี — แก้ย้อนหลังข้ามปีได้ (ปีปัจจุบัน ถึง ย้อนหลัง 5 ปี)
  const yearOptions = [0, 1, 2, 3, 4, 5].map(d => _today.yearBE - d);
  const [year, setYear] = useState(data?.year || _today.yearBE); // จำปีที่เลือกจากหน้าเดือน (กันเปิดมาปีปัจจุบันเสมอ)
  const [rows, setRows] = useState(() => buildRows(data?.year || _today.yearBE));
  const [touched, setTouched] = useState(false);
  // เปลี่ยนปี → โหลดค่าเดิมของปีนั้น (ปรับตอน render แทน setState ใน effect → ไม่ render ซ้ำ/ไม่กระพริบ)
  const [rowsYear, setRowsYear] = useState(year);
  if (rowsYear !== year) {
    setRowsYear(year);
    setRows(buildRows(year));
    setTouched(false);
  }
  const up = (i, k, v) => { setTouched(true); setRows(rs => rs.map((r, j) => j === i ? { ...r, [k]: v } : r)); };

  const [busy, setBusy] = useState(false);
  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const dbRows = rows
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => !r.isCurrent) // เดือนปัจจุบัน auto จากยอดรายวัน — ไม่เขียนทับ
        .filter(({ r }) => r.rev !== '' || r.orders !== '' || r.ad !== '' || r.newCust !== '' || r.messages !== '')
        .map(({ r, i }) => {
          // คงค่า target/projected/meta เดิม (ตั้งจากหน้า "ตั้งค่ารายเดือน") ไม่ให้ถูกล้างเป็น 0
          const ex = monthlyRef.find(m => m.year === year && m.month === i + 1);
          return {
            id: `${year}-${String(i + 1).padStart(2, '0')}`,
            month: i + 1,
            year,
            month_th: r.month,
            target: ex?.target || 0,
            actual: nn(r.rev),
            projected: ex?.projected || 0,
            orders: nn(r.orders),
            ad_spend: nn(r.ad),
            new_cust: nn(r.newCust),
            messages: nn(r.messages),
            // กรอกยอดรวมรายเดือน (rev>0) → ตั้งโหมด 'monthly' ชัดเจน (กันยอดรายวันบางส่วนมาทับให้สับสน)
            meta: { ...(ex?.meta || {}), ...(nn(r.rev) > 0 ? { entryMode: 'monthly' } : {}) },
          };
        });
      if (dbRows.length === 0) { toast('ไม่มีข้อมูลให้บันทึก', 'error'); setBusy(false); return; }
      const { error } = await supabase.from('tmk_monthly_history').upsert(dbRows);
      if (error) throw error;
      // รายละเอียด: ค่าทุกเดือนที่บันทึก + ระบุเดือนที่สลับเป็นโหมดรายเดือน
      const histFields = dbRows.map(rr => {
        const p = [];
        if (Number(rr.actual))   p.push(`ยอด ${B(rr.actual)}`);
        if (Number(rr.orders))   p.push(`${rr.orders} ออร์เดอร์`);
        if (Number(rr.ad_spend)) p.push(`แอด ${B(rr.ad_spend)}`);
        if (Number(rr.new_cust)) p.push(`ลูกค้าใหม่ ${rr.new_cust}`);
        if (Number(rr.messages)) p.push(`คนทัก ${rr.messages}`);
        if (rr.meta?.entryMode === 'monthly') p.push('[โหมดรายเดือน]');
        return { label: `${rr.month_th} ${rr.year}`, value: p.join(' · ') || '—' };
      });
      const modeFlips = dbRows.filter(rr => rr.meta?.entryMode === 'monthly').length;
      logAudit({
        action: 'update', entityType: 'monthly', entityName: `ข้อมูลย้อนหลัง ปี ${year}`,
        summary: `บันทึกข้อมูลย้อนหลัง ${dbRows.length} เดือน (ปี ${year})${modeFlips ? ` · ตั้งโหมดรายเดือน ${modeFlips} เดือน` : ''}`,
        fields: histFields,
        data: { year, months: dbRows.map(rr => ({ month: rr.month, actual: rr.actual, orders: rr.orders, ad_spend: rr.ad_spend, new_cust: rr.new_cust, messages: rr.messages, entryMode: rr.meta?.entryMode || 'daily' })) },
      });
      window.__reload?.();
      toast('บันทึกข้อมูลย้อนหลังเรียบร้อย', 'success');
      onClose();
    } catch (err) {
      toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };
  const footer = (
    <>
      <button className="btn" onClick={() => guardClose(touched, onClose)}>ยกเลิก</button>
      <button className="btn btn-primary" disabled={busy} onClick={handleSave}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
    </>
  );
  return (
    <Modal icon="clock" title="กรอกข้อมูลย้อนหลัง" sub="ป้อนยอดขายรายเดือนเพื่อเปรียบเทียบแนวโน้ม" onClose={onClose} footer={footer} wide confirmOnClose={touched}>
      <div className="row" style={{ gap: 10, marginBottom: 12, alignItems: 'center' }}>
        <span className="cap" style={{ fontWeight: 600 }}>ปี (พ.ศ.)</span>
        <select className="input" style={{ maxWidth: 140 }} value={year} onChange={e => setYear(Number(e.target.value))}>
          {yearOptions.map(y => <option key={y} value={y}>{y}{y === _today.yearBE ? ' (ปีนี้)' : ''}</option>)}
        </select>
        <span className="cap" style={{ color: 'var(--ink-4)' }}>เลือกปีเพื่อแก้ไขย้อนหลังข้ามปีได้</span>
      </div>
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
                <td style={{ fontWeight: 600 }}>{r.month}{r.isCurrent && <span className="cap" style={{ marginLeft: 6, color: 'var(--accent-2)' }}>· อัตโนมัติ</span>}</td>
                {r.isCurrent ? (
                  <td colSpan={5} style={{ padding: '5px 8px', color: 'var(--ink-4)', fontSize: 'var(--fs-cap)' }}>เดือนปัจจุบันคำนวณจากยอดรายวันอัตโนมัติ — กรอกที่หน้า "บันทึก & ภาพรวมเดือน"</td>
                ) : (<>
                  <td style={{ padding: '5px 8px' }}><input type="number" min="0" className="input num" style={{ textAlign: 'right' }} placeholder="0" value={r.rev} onChange={e => up(i, 'rev', e.target.value)} /></td>
                  <td style={{ padding: '5px 8px' }}><input type="number" min="0" className="input num" style={{ textAlign: 'right', width: 90 }} placeholder="0" value={r.orders} onChange={e => up(i, 'orders', e.target.value)} /></td>
                  <td style={{ padding: '5px 8px' }}><input type="number" min="0" className="input num" style={{ textAlign: 'right' }} placeholder="0" value={r.ad} onChange={e => up(i, 'ad', e.target.value)} /></td>
                  <td style={{ padding: '5px 8px' }}><input type="number" min="0" className="input num" style={{ textAlign: 'right', width: 90 }} placeholder="0" value={r.newCust} onChange={e => up(i, 'newCust', e.target.value)} /></td>
                  <td style={{ padding: '5px 8px' }}><input type="number" min="0" className="input num" style={{ textAlign: 'right', width: 90 }} placeholder="0" value={r.messages} onChange={e => up(i, 'messages', e.target.value)} /></td>
                </>)}
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
  const [email, setEmail] = useState(() => { try { return localStorage.getItem('tmk-remember-email') || ''; } catch { return ''; } });
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false); // ดู/ซ่อนรหัสผ่าน
  const [agree, setAgree] = useState(false);
  const [remember, setRemember] = useState(() => { try { return localStorage.getItem('tmk-remember') === 'true'; } catch { return false; } });
  const [showTerms, setShowTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const rememberEmail = (em) => {
    try {
      if (remember) { localStorage.setItem('tmk-remember', 'true'); localStorage.setItem('tmk-remember-email', em); }
      else { localStorage.removeItem('tmk-remember'); localStorage.removeItem('tmk-remember-email'); }
    } catch { /* ignore */ }
  };

  // เข้าสู่ระบบด้วยอีเมล+รหัส (แอดมินเป็นคนตั้งรหัสให้ — ไม่มีตั้งเอง/ลืมรหัสในหน้านี้)
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const em = email.trim().toLowerCase();
    if (!em) { setErr('กรุณากรอกอีเมล'); return; }
    if (!pw) { setErr('กรุณากรอกรหัสผ่าน'); return; }
    if (!agree) { setErr('กรุณายอมรับข้อตกลงก่อน'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: em, password: pw });
      if (error) throw error;
      rememberEmail(em);
      onLogin?.(em);
    } catch (e2) {
      const m = e2.message || '';
      setErr(/invalid login/i.test(m) ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
        : /not confirmed/i.test(m) ? 'อีเมลยังไม่ได้ยืนยัน — ติดต่อแอดมิน'
        : 'เข้าสู่ระบบไม่สำเร็จ: ' + m);
    } finally { setBusy(false); }
  };

  const canSubmit = !busy && !!email.trim() && !!pw && agree;
  return (
    <div className="login">
      <div className="login-art">
        <div className="blob b1"></div><div className="blob b2"></div><div className="gridlines"></div>
        <div className="login-logo"><img src={tmkLogo} alt="TMK" /></div>
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
            <div className="rail-brand" style={{ margin: 0, width: 44, height: 44 }}><img src={tmkLogo} alt="TMK" /></div>
            <div><div className="h2">เข้าสู่ระบบ TMK</div><div className="cap">ยินดีต้อนรับกลับมา 👋</div></div>
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>อีเมล</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@tmk.co" autoComplete="username" />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>รหัสผ่าน</label>
            <div style={{ position: 'relative' }}>
              <input className="input" type={showPw ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" autoComplete="current-password" style={{ width: '100%', paddingRight: 42 }} />
              <button type="button" onClick={() => setShowPw(v => !v)} title={showPw ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} aria-label={showPw ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: showPw ? 'var(--accent)' : 'var(--ink-3)', width: 30, height: 30, display: 'grid', placeItems: 'center', padding: 0 }}>
                <Icon name="eye" />
              </button>
            </div>
          </div>

          {err && <div className="sm" style={{ background: 'var(--bad-soft, rgba(255,90,90,0.12))', color: 'var(--bad, #d9434e)', padding: '9px 12px', borderRadius: 'var(--r-sm)', marginBottom: 14 }}>{err}</div>}

          <div style={{ marginBottom: 14 }}>
            <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
              <span className="cap">จำการเข้าสู่ระบบ (จำอีเมลไว้ ไม่ต้องกรอกใหม่)</span>
            </label>
          </div>
          <div style={{ marginBottom: 18 }}>
            <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={agree} onChange={() => { if (!agree) { setShowTerms(true); } else { setAgree(false); } }} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
              <span className="cap">ยอมรับ<button type="button" onClick={e => { e.preventDefault(); setShowTerms(true); }} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 'inherit', fontFamily: 'inherit' }}>ข้อตกลงและกฎระเบียบการใช้งานระบบ</button></span>
            </label>
          </div>

          {/* Terms & Conditions Modal */}
          {showTerms && (
            <div className="modal-scrim" style={{ zIndex: 9999 }} onClick={() => setShowTerms(false)}>
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
          <button className="btn btn-primary" type="submit" disabled={!canSubmit} style={{ width: '100%', justifyContent: 'center', padding: '11px', opacity: canSubmit ? 1 : 0.5 }}>
            {busy ? 'กำลังเข้าสู่ระบบ…' : <>เข้าสู่ระบบ (Sign In) <Icon name="arrowR" /></>}
          </button>

          <div className="cap" style={{ textAlign: 'center', marginTop: 16, color: 'var(--ink-4)' }}>
            ลืมรหัสผ่าน? ติดต่อผู้ดูแลระบบเพื่อตั้งรหัสใหม่
          </div>
        </form>
      </div>
    </div>
  );
}
