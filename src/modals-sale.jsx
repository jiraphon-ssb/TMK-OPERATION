import { useState, useEffect, useMemo, useRef } from 'react';
import { B, Bk, P, Icon } from './components.jsx';
import { DatePicker } from '@/components/ui/date-picker';
import { useLang } from './i18n.jsx';
import { supabase } from './lib/supabaseClient.js';
import { getToday, todayISO } from './lib/dateUtils.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { logAudit } from './lib/audit.js';
import { computeMonth } from './dataContext.jsx';
import { Modal, toast, nn, money, bahtStr, confirmDiscard, guardClose, MD } from './modals-core.jsx';
import { refresh, confirm } from './lib/appBus.js';

// map ช่องทาง → คอลัมน์เดิมใน tmk_daily_sales (ค่าคงที่ · ยกออกนอก component กัน identity เปลี่ยนทุก render)
const colMap = { shopee: 'shopee', tiktok: 'tiktok', lazada: 'lazada', facebook: 'facebook', line: 'line_oa', crm: 'crm' };

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
  const [touched, setTouched] = useState(false); // มีการแก้ไขค้าง → เตือนก่อนปิด
  const loadDirty = useRef(false); // ผู้ใช้พิมพ์ระหว่างที่ข้อมูลกำลังโหลด → กันโหลดมาทับ (race fix)
  const beforeRef = useRef(null); // ค่าเดิมจาก DB ตอนเปิด (snapshot) → ทำ log ก่อน→หลัง + เก็บค่าที่ถูกลบ

  // โหลดข้อมูลเดิมของวันที่เลือก (แก้เดือน/วันเก่าได้); ถ้าไม่มี = ว่าง
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
        savedAt: row.updated_at || null, // baseline สำหรับ optimistic lock (กันอุปกรณ์อื่นเซฟทับ)
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
      // ยืนยันตัวเลขเงินด้วยกล่องของแอป — จุดนี้ผู้ใช้กำลังตัดสินใจเรื่องยอดเงิน
      // กล่องเบราว์เซอร์ที่ขึ้นชื่อโดเมนกำกับทำให้รู้สึกว่า "ไม่ใช่ระบบเรา" = เสียความเชื่อมั่นตรงจุดสำคัญที่สุด
      const ok = await confirm({
        title: 'ยอดสูงกว่าปกติ — ยืนยันบันทึก?',
        body: `ยอดวันนี้ ${bahtStr(_tot)} สูงกว่าค่าเฉลี่ยรายวัน ${x} เท่า (เฉลี่ย ${bahtStr(_avg)})\nกรุณาตรวจสอบว่าพิมพ์ถูกต้องหรือไม่`,
        confirmText: 'ยืนยันบันทึก', cancelText: 'กลับไปตรวจสอบ',
      });
      if (!ok) return;
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
        const newC = Number(r.newC) || 0, oldC = Number(r.oldC) || 0;
        curChannels[r.id] = {
          rev: money(r.rev), ord: Number(r.ord) || 0, ad: money(r.ad),
          inq: newC + oldC, newC, oldC, // คนทัก = ลูกค้าใหม่ + เก่า (เก็บให้ตรงนิยาม)
        };
      }
      // merge ค่าเดิมจาก DB ก่อน — ช่องทางที่ถูกลบ/ซ่อนออกจากรายการจะไม่สูญข้อมูลอดีต (data-loss fix)
      const channels = { ...(beforeRef.current?.channels || {}), ...curChannels };
      const nowIso = new Date().toISOString();
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
        avg_reply_minutes: nn(chatTime),
        note: note || '',
        deleted_at: null, // กรอกวันเดิมที่เคยลบ → กู้กลับ (กันข้อมูลล่องหน)
        updated_at: nowIso, // bump เสมอ → optimistic lock ของอุปกรณ์อื่นจับการแก้ได้
      };
      // optimistic lock — ถ้าแถวถูกแก้หลังเราเปิดโมดัล (อุปกรณ์อื่นเซฟ) → ไม่เขียนทับ ให้ปิด/เปิดใหม่
      // ดึงเฉพาะตอน query สำเร็จ (ถ้าคอลัมน์ยังไม่มีบน DB เก่า → ข้าม lock ไม่บล็อกการเซฟ)
      {
        const baseSavedAt = beforeRef.current?.savedAt ?? null;
        const { data: _cur, error: _lockErr } = await supabase.from('tmk_daily_sales').select('updated_at, deleted_at').eq('id', 'd-' + date).maybeSingle();
        if (!_lockErr) {
          const curSavedAt = (_cur && !_cur.deleted_at) ? (_cur.updated_at || null) : null;
          if (curSavedAt !== baseSavedAt) {
            toast('มีการบันทึกยอดวันนี้จากอุปกรณ์อื่น — ปิดแล้วเปิดใหม่เพื่อดึงค่าล่าสุด (กันเขียนทับ)', 'warn');
            refresh(['tmk_daily_sales']);
            setSaving(false);
            return;
          }
        }
      }
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
      const totNew = rows.reduce((a, r) => a + nz(r.newC), 0);
      const totOld = rows.reduce((a, r) => a + nz(r.oldC), 0);
      const totInq = totNew + totOld; // คนทัก = ลูกค้าใหม่ + เก่า
      const chDetail = (o) => {
        const p = [];
        if (nz(o.rev))  p.push(bahtStr(o.rev));
        if (nz(o.ord))  p.push(`${nz(o.ord)} ออเดอร์`);
        if (nz(o.ad))   p.push(`แอด ${bahtStr(o.ad)}`);
        if (nz(o.newC)) p.push(`ใหม่ ${nz(o.newC)}`);
        if (nz(o.oldC)) p.push(`เก่า ${nz(o.oldC)}`);
        return p.join(' · ');
      };
      const auditFields = [{ label: 'ยอดรวม', value: bahtStr(totRev) }];
      if (totOrd) auditFields.push({ label: 'ออเดอร์รวม', value: `${totOrd}` });
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
        const mLabels = { rev: 'ยอด', ord: 'ออเดอร์', ad: 'ค่าแอด', newC: 'ลูกค้าใหม่', oldC: 'ลูกค้าเก่า' }; // ไม่ diff inq — เป็นค่า derived (ใหม่+เก่า)
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
        summary: `${isEdit ? 'แก้ไข' : 'บันทึก'}ยอดขายวันที่ ${date} (รวม ${bahtStr(totRev)}${totOrd ? `, ${totOrd} ออเดอร์` : ''})`,
        fields: auditFields,
        changes: auditChanges,
        data: { date, day_name, channels, totals: { rev: totRev, ord: totOrd, ad: totAd, inq: totInq, newC: totNew, oldC: totOld }, avg_reply_minutes: nz(chatTime), note: note || '' },
      });
      refresh(['tmk_daily_sales']);
      toast(t('toastSaved'), 'success');
      onClose();
    } catch (err) {
      console.error('RecordSales save failed:', err);
      toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally { setSaving(false); }
  };

  // ค่าคงที่ + ยอดของ "เดือนของวันที่เลือก" (ไม่ใช่ค่า global ที่ค้างจาก import)
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- computeMonth อ่าน TMK singleton (compiler มองว่าไม่ pure จึงรักษา memo ไม่ได้) · ต้องคง memo ไว้ เพราะคำนวณทั้งเดือนใหม่ทุก keystroke จะหน่วง
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
    // บันทึกได้เมื่อมี metric ใดก็ได้ (ไม่ใช่แค่ยอดขาย) — กันวันที่มีแค่ค่าแอด/ออเดอร์/ลูกค้าใหม่กรอกไม่ได้
    const ok = tRev > 0 || tAd > 0 || tOrd > 0 || tNewC > 0 || tOldC > 0;
    return { tRev, tOrd, tAd, aov, acos, newMtd, pPct, rr, vsAvg, tips, ok, tNewC, tOldC };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- MTD/M_TARGET/M_DAY/M_DAYS/M_ACOS/_otherDays derive จาก sel ล้วน (อยู่ใน deps แล้ว) · _otherDays เป็น array สร้างใหม่ทุก render ถ้าใส่จะ recompute รัวทุก keystroke
  }, [rows, sel]);

  const handleDelete = async () => {
    if (!await confirm({ title: "ลบยอดขาย", body: `ลบข้อมูลยอดขายวันที่ ${date}? จะย้ายไปถังขยะ กู้คืนได้ภายหลัง`, danger: true, confirmText: "ลบ" })) return;
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
        if (_nz(r.ord))  p.push(`${_nz(r.ord)} ออเดอร์`);
        if (_nz(r.ad))   p.push(`แอด ${bahtStr(r.ad)}`);
        if (_nz(r.newC)) p.push(`ใหม่ ${_nz(r.newC)}`);
        if (_nz(r.oldC)) p.push(`เก่า ${_nz(r.oldC)}`);
        if (p.length) delFields.push({ label: _chName(r.id), value: p.join(' · ') });
      });
      if (_nz(chatTime)) delFields.push({ label: 'เวลาตอบแชท', value: `${chatTime} นาที` });
      if (note) delFields.push({ label: 'โน้ต', value: note });
      logAudit({ action: 'delete', entityType: 'daily', entityName: date, summary: `ลบยอดขายรายวันวันที่ ${date} (รวม ${bahtStr(_totRev)})`, fields: delFields, data: { date, channels: beforeRef.current?.channels || null, note: note || '', chatTime: _nz(chatTime) } });
      refresh(['tmk_daily_sales']);
      toast('ย้ายข้อมูลรายวันไปถังขยะแล้ว', 'success', 6000, {
        label: 'เลิกทำ',
        onClick: async () => {
          try {
            const { error: e2 } = await supabase.from('tmk_daily_sales').update({ deleted_at: null }).eq('id', 'd-' + date);
            if (e2) throw e2;
            refresh(['tmk_daily_sales']);
            toast('กู้คืนข้อมูลรายวันแล้ว', 'success');
          } catch (e) { toast('กู้คืนไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
        },
      });
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
    loadDirty.current = true; // กันผลโหลดของวันปัจจุบันที่ยังค้างอยู่มาทับค่าที่เพิ่งคัดลอก (race)
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
      {exists && <Button variant="outline" size="sm" style={{ color: 'var(--bad)', marginRight: 'auto' }} disabled={saving} onClick={handleDelete}><Icon name="trash" /> ลบข้อมูลวันนี้</Button>}
      <Button variant="outline" onClick={() => guardClose(touched, onClose)}>{t('cancel')}</Button>
      <Button disabled={!s.ok} style={{ opacity: s.ok ? 1 : 0.5 }} onClick={() => setStep(2)}>{t('reviewBefore')} <Icon name="arrowR" /></Button>
    </>
  ) : (
    <>
      <Button variant="outline" onClick={() => setStep(1)}><Icon name="chevR" className="flip-h" /> {t('goBackEdit')}</Button>
      <Button disabled={saving} onClick={handleSave}>
        {saving ? <><Icon name="refresh" /> {t('saving')}</> : <><Icon name="check" /> {t('confirmSave')}</>}
      </Button>
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
              <DatePicker value={date} max={todayISO()} clearable={false} onChange={async (v) => { if (touched && !(await confirmDiscard())) return; setDate(v); }} />
            </div>
            <Button variant="outline" size="sm" type="button" onClick={copyYesterday} title="ดึงยอดของเมื่อวานมาเป็นจุดเริ่ม">
              <Icon name="refresh" /> คัดลอกเมื่อวาน
            </Button>
          </div>

          {/* Channel cards — 2 คอลัมน์ ลดการเลื่อน */}
          <div className="rec-channel-grid">
          {rows.map((r, i) => {
            const ch = MD.channels.find(c => c.id === r.id) || { hex: 'var(--ink-3)', name: r.id, hasAd: false }; // กัน crash ถ้าช่องถูกลบขณะเปิด
            // โชว์ลูกค้าใหม่/เก่าทุกช่องเสมอ → การ์ดโครงเดียวกัน สูงเท่ากันทุกแถว ไม่ต้องกดขยาย
            // "คนทัก" = ลูกค้าใหม่ + เก่า (คำนวณอัตโนมัติ ไม่ต้องกรอกแยก)
            const inq = ((+r.newC) || 0) + ((+r.oldC) || 0);
            return (
              <div key={r.id} style={{ padding: '12px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)', borderLeft: `3px solid ${ch.hex}` }}>
                <div className="row" style={{ gap: 7, fontWeight: 600, marginBottom: 10 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: ch.hex }}></span>{ch.name}
                </div>
                <div className="grid" style={{ gridTemplateColumns: ch.hasAd ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10 }}>
                  <div className="field"><label>ยอดขาย (฿)</label><Input type="number" min="0" inputMode="decimal" className="num" style={{ textAlign: 'right' }} placeholder="0" value={r.rev} onChange={e => up(i, 'rev', e.target.value)} /></div>
                  <div className="field"><label>ออเดอร์</label><Input type="number" min="0" inputMode="decimal" className="num" style={{ textAlign: 'right' }} placeholder="0" value={r.ord} onChange={e => up(i, 'ord', e.target.value)} /></div>
                  {ch.hasAd && <div className="field"><label>ค่าแอด (฿)</label><Input type="number" min="0" inputMode="decimal" className="num" style={{ textAlign: 'right' }} placeholder="0" value={r.ad} onChange={e => up(i, 'ad', e.target.value)} /></div>}
                </div>
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                  <div className="field"><label>ลูกค้าใหม่</label><Input type="number" min="0" inputMode="decimal" className="num" style={{ textAlign: 'right' }} placeholder="0" value={r.newC} onChange={e => up(i, 'newC', e.target.value)} /></div>
                  <div className="field"><label>ลูกค้าเก่า</label><Input type="number" min="0" inputMode="decimal" className="num" style={{ textAlign: 'right' }} placeholder="0" value={r.oldC} onChange={e => up(i, 'oldC', e.target.value)} /></div>
                </div>
                {/* คนทัก = ลูกค้าใหม่ + เก่า (auto) — โชว์เมื่อกรอกแล้ว */}
                {inq > 0 && (
                  <div className="cap" style={{ marginTop: 6, color: 'var(--ink-4)' }}>คนทัก (ลูกค้ารวม): <b style={{ color: 'var(--ink-2)' }}>{inq}</b> คน</div>
                )}
              </div>
            );
          })}
          </div>

          <div className="field-row">
            <div className="field"><label>เวลาตอบแชทเฉลี่ย (นาที)</label><Input type="number" min="0" inputMode="decimal" placeholder="0" value={chatTime} onChange={e => { loadDirty.current = true; setTouched(true); setChatTime(e.target.value); }} /></div>
            <div className="field"><label>โน้ตประจำวัน</label><Input placeholder="ไลฟ์เย็น 1 รอบ, Flash Sale..." value={note} onChange={e => { loadDirty.current = true; setTouched(true); setNote(e.target.value); }} /></div>
          </div>
        </>
      )}

      {step === 2 && s.ok && (
        <>
          {/* Summary KPIs */}
          <div className="sum-grid" style={{ marginBottom: 14 }}>
            {[['ยอดรวมวันนี้', B(s.tRev), 'var(--accent-2)'],
              ['ออเดอร์', String(s.tOrd), 'var(--ink)'],
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
                  <span className="sm" style={{ fontWeight: 600, width: 70, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ch.name}</span>
                  <div style={{ flex: 1, minWidth: 40, height: 8, borderRadius: 4, background: 'var(--surface-3)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: ch.hex, borderRadius: 4 }}></div>
                  </div>
                  <span className="num sm" style={{ fontWeight: 700, width: 84, flexShrink: 0, textAlign: 'right', whiteSpace: 'nowrap' }}>{B(rev)}</span>
                  <span className="num cap" style={{ width: 38, flexShrink: 0, textAlign: 'right' }}>{P(pct, 0)}</span>
                  <span className="cap" style={{ width: 72, flexShrink: 0, textAlign: 'right', whiteSpace: 'nowrap' }}>{r.ord || 0} ออเดอร์</span>
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
        if (Number(rr.orders))   p.push(`${rr.orders} ออเดอร์`);
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
      refresh(['tmk_monthly_history']);
      toast('บันทึกข้อมูลย้อนหลังเรียบร้อย', 'success');
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
    <Modal icon="clock" title="กรอกข้อมูลย้อนหลัง" sub="ป้อนยอดขายรายเดือนเพื่อเปรียบเทียบแนวโน้ม" onClose={onClose} footer={footer} wide confirmOnClose={touched}>
      <div className="row" style={{ gap: 10, marginBottom: 12, alignItems: 'center' }}>
        <span className="cap" style={{ fontWeight: 600 }}>ปี (พ.ศ.)</span>
        <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
          <SelectTrigger style={{ maxWidth: 140 }}><SelectValue /></SelectTrigger>
          <SelectContent>
            {yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}{y === _today.yearBE ? ' (ปีนี้)' : ''}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="cap" style={{ color: 'var(--ink-4)' }}>เลือกปีเพื่อแก้ไขย้อนหลังข้ามปีได้</span>
      </div>
      <div className="table-wrap hist-scroll">
        <table className="table" style={{ minWidth: 640 }}>
          <thead><tr>
            <th>เดือน</th>
            <th style={{ textAlign: 'right' }}>ยอดรวม (฿)</th>
            <th style={{ textAlign: 'right' }}>ออเดอร์</th>
            <th style={{ textAlign: 'right' }}>ค่าแอด (฿)</th>
            <th style={{ textAlign: 'right' }}>ลูกค้าใหม่</th>
            <th style={{ textAlign: 'right' }}>จำนวนข้อความ</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.month} className={r.isCurrent ? 'hist-row-current' : ''}>
                <td style={{ fontWeight: 600 }}>{r.month}{r.isCurrent && <span className="cap" style={{ marginLeft: 6, color: 'var(--accent-2)' }}>· อัตโนมัติ</span>}</td>
                {r.isCurrent ? (
                  <td colSpan={5} style={{ padding: '5px 8px', color: 'var(--ink-4)', fontSize: 'var(--fs-cap)' }}>เดือนปัจจุบันคำนวณจากยอดรายวันอัตโนมัติ — กรอกที่หน้า "บันทึก & ภาพรวมเดือน"</td>
                ) : (<>
                  <td style={{ padding: '5px 8px' }}><Input type="number" min="0" inputMode="decimal" className="num" style={{ textAlign: 'right' }} placeholder="0" value={r.rev} onChange={e => up(i, 'rev', e.target.value)} /></td>
                  <td style={{ padding: '5px 8px' }}><Input type="number" min="0" inputMode="decimal" className="num" style={{ textAlign: 'right', width: 90 }} placeholder="0" value={r.orders} onChange={e => up(i, 'orders', e.target.value)} /></td>
                  <td style={{ padding: '5px 8px' }}><Input type="number" min="0" inputMode="decimal" className="num" style={{ textAlign: 'right' }} placeholder="0" value={r.ad} onChange={e => up(i, 'ad', e.target.value)} /></td>
                  <td style={{ padding: '5px 8px' }}><Input type="number" min="0" inputMode="decimal" className="num" style={{ textAlign: 'right', width: 90 }} placeholder="0" value={r.newCust} onChange={e => up(i, 'newCust', e.target.value)} /></td>
                  <td style={{ padding: '5px 8px' }}><Input type="number" min="0" inputMode="decimal" className="num" style={{ textAlign: 'right', width: 90 }} placeholder="0" value={r.messages} onChange={e => up(i, 'messages', e.target.value)} /></td>
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


