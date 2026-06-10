/* ============================================================
   TMK Operation — Views: Data Entry Hub (บันทึก)
   ============================================================ */
import React, { useState, useRef, useLayoutEffect } from 'react';
import { TMK } from './data.js';
import { B, Bk, Bc, N, Icon, Ring } from './components.jsx';
import { getToday, THAI_MONTHS as MONTH_SHORT, THAI_MONTHS_FULL as MONTH_FULL } from './lib/dateUtils.js';
import { adCampaignInMonth, computeMonth } from './dataContext.jsx';
import { supabase } from './lib/supabaseClient.js';
import { logAudit } from './lib/audit.js';

const DD = TMK;


// "วันนี้" จากวันที่จริงของเครื่อง — คำนวณสดทุกครั้ง (กันค่าค้างเมื่อเปิดแอปข้ามเที่ยงคืน/ข้ามเดือน)
const _now = () => { const t = getToday(); return { NOW_MONTH: t.month - 1, NOW_YEAR: t.yearBE, TODAY: t.day, DAYS_IN_MONTH: t.daysInMonth }; };

// สร้างข้อมูลรายไตรมาสจาก monthly จริง (TMK.monthly) — qIndex 0-3
function quarterData(year, qIndex) {
  const { NOW_MONTH, NOW_YEAR } = _now();
  const months = [qIndex * 3 + 1, qIndex * 3 + 2, qIndex * 3 + 3]; // 1-indexed
  return months.map(mo => {
    const rec = (DD.monthly || []).find(r => r.year === year && r.month === mo);
    const target = rec ? rec.target : 0;
    const actual = rec ? rec.actual : 0;
    // สถานะจากเดือน vs วันจริง
    const isPastM = year < NOW_YEAR || (year === NOW_YEAR && mo - 1 < NOW_MONTH);
    const isCurM  = year === NOW_YEAR && mo - 1 === NOW_MONTH;
    const status = isCurM ? 'กำลังดำเนินการ' : isPastM ? 'ปิดแล้ว' : 'เตรียมการ';
    return { target, actual, status };
  });
}

function getMode(month, year) {
  const { NOW_MONTH, NOW_YEAR } = _now();
  const isCurrent = month === NOW_MONTH && year === NOW_YEAR;
  const isPast = year < NOW_YEAR || (year === NOW_YEAR && month < NOW_MONTH);
  const isFuture = year > NOW_YEAR || (year === NOW_YEAR && month > NOW_MONTH);
  return { isCurrent, isPast, isFuture };
}

/* ====================  MONTH NAVIGATOR  ==================== */
function MonthNav({ month, year, setMonth, setYear, quarterView, setQuarterView }) {
  const { NOW_MONTH, NOW_YEAR } = _now();
  const [showPicker, setShowPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(year);
  const { isCurrent, isPast, isFuture } = getMode(month, year);

  const label = MONTH_SHORT[month] + ' ' + year;

  const goPrev = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  };
  const goNext = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  };
  const goToday = () => { setMonth(NOW_MONTH); setYear(NOW_YEAR); setQuarterView(false); };

  const pickMonth = (m) => {
    setMonth(m);
    setYear(pickerYear);
    setShowPicker(false);
    setQuarterView(false);
  };

  const modeBadge = isCurrent
    ? { label: 'เดือนปัจจุบัน', bg: 'var(--good-soft)', color: 'var(--good)' }
    : isPast
    ? { label: 'เดือนที่ผ่านมา', bg: 'var(--surface-3)', color: 'var(--ink-3)' }
    : { label: 'เตรียมการ', bg: 'var(--accent-soft)', color: 'var(--accent)' };

  return (
    <div style={{ position: 'relative', marginBottom: 8 }}>
      <div className="card" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {/* Left arrow */}
        <button className="btn btn-ghost" onClick={goPrev} style={{ padding: 6 }}>
          <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>

        {/* Month label (clickable for picker) */}
        <button className="btn btn-ghost" onClick={() => { setPickerYear(year); setShowPicker(!showPicker); }}
          style={{ fontWeight: 700, fontSize: 'var(--fs-h3)', padding: '4px 12px', minWidth: 120, textAlign: 'center' }}>
          {label}
          <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: 14, height: 14, marginLeft: 4 }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {/* Right arrow */}
        <button className="btn btn-ghost" onClick={goNext} style={{ padding: 6 }}>
          <Icon name="chevR" />
        </button>

        {/* Mode badge */}
        <span className="chip" style={{ background: modeBadge.bg, color: modeBadge.color, fontWeight: 600 }}>
          {modeBadge.label}
        </span>

        {/* Today button */}
        {!isCurrent && (
          <button className="btn btn-sm btn-outline" onClick={goToday}>วันนี้</button>
        )}

        {/* Quarter view toggle */}
        <button className="btn btn-sm btn-outline" onClick={() => setQuarterView(!quarterView)}
          style={{ marginLeft: 'auto', background: quarterView ? 'var(--accent-soft)' : undefined, color: quarterView ? 'var(--accent)' : undefined }}>
          <Icon name="grid" />
          {quarterView ? 'ดูรายเดือน' : 'ดูรายไตรมาส'}
        </button>
      </div>

      {/* Quick Jump Dropdown */}
      {showPicker && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setShowPicker(false)}></div>
          <div className="card" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4, padding: 16, width: 320, boxShadow: 'var(--shadow-lg, 0 8px 32px rgba(0,0,0,.15))' }}>
            {/* Year nav */}
            <div className="row between" style={{ marginBottom: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setPickerYear(pickerYear - 1)}>
                <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
                {pickerYear - 1}
              </button>
              <span className="h3">{pickerYear}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setPickerYear(pickerYear + 1)}>
                {pickerYear + 1}
                <Icon name="chevR" />
              </button>
            </div>
            {/* Month grid 4x3 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {MONTH_SHORT.map((m, i) => {
                const isSelected = i === month && pickerYear === year;
                const isNow = i === NOW_MONTH && pickerYear === NOW_YEAR;
                return (
                  <button key={i} className={`pick${isSelected ? ' on' : ''}`}
                    onClick={() => pickMonth(i)}
                    style={{
                      padding: '8px 4px', borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer',
                      background: isSelected ? 'var(--accent)' : isNow ? 'var(--accent-soft)' : 'var(--surface-2)',
                      color: isSelected ? '#fff' : isNow ? 'var(--accent)' : 'var(--ink)',
                      fontWeight: isSelected || isNow ? 700 : 400,
                      fontSize: 'var(--fs-sm)',
                    }}>
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ====================  QUARTER VIEW  ==================== */
function QuarterView({ month, year }) {
  const statusIcon = (s) => {
    if (s === 'ปิดแล้ว') return { icon: 'check', color: 'var(--good)', bg: 'var(--good-soft)' };
    if (s === 'กำลังดำเนินการ') return { icon: 'refresh', color: 'var(--accent)', bg: 'var(--accent-soft)' };
    return { icon: 'clock', color: 'var(--ink-3)', bg: 'var(--surface-3)' };
  };

  const renderQuarter = (qIndex) => {
    const months = [qIndex * 3, qIndex * 3 + 1, qIndex * 3 + 2];
    const label = `Q${qIndex + 1}/${year}`;
    const data = quarterData(year, qIndex);
    return (
    <div key={qIndex} style={{ marginBottom: 24 }}>
      <div className="h3" style={{ marginBottom: 12 }}>{label}</div>
      <div className="grid g3">
        {months.map((mIdx, i) => {
          const d = data[i];
          const pct = d.target > 0 ? Math.round((d.actual / d.target) * 100) : 0;
          const si = statusIcon(d.status);
          const { isCurrent: isThisMonth } = getMode(mIdx, year);
          return (
            <div key={mIdx} className="card" style={{ padding: 20, border: isThisMonth ? '2px solid var(--accent)' : undefined }}>
              <div className="row between" style={{ marginBottom: 12 }}>
                <div className="h3">{MONTH_SHORT[mIdx]}</div>
                {isThisMonth && <span className="chip chip-accent" style={{ fontSize: 10 }}>เดือนนี้</span>}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                <Ring pct={pct} size={72} stroke={8} color={si.color}>
                  <div>
                    <div className="sm" style={{ fontWeight: 700, lineHeight: 1 }}>{pct}%</div>
                  </div>
                </Ring>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="row between">
                  <span className="cap">เป้า</span>
                  <span className="sm num">{d.target > 0 ? Bk(d.target) : '-'}</span>
                </div>
                <div className="row between">
                  <span className="cap">จริง</span>
                  <span className="sm num">{d.actual > 0 ? Bk(d.actual) : '-'}</span>
                </div>
                <div className="row between">
                  <span className="cap">Ring</span>
                  <span className="sm num">{d.target > 0 ? pct + '%' : '-'}</span>
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <span className="chip" style={{ background: si.bg, color: si.color, fontWeight: 600, width: '100%', justifyContent: 'center' }}>
                  <span style={{ width: 14, height: 14, display: 'inline-flex' }}><Icon name={si.icon} /></span>
                  {d.status}
                </span>
              </div>

              {d.status === 'เตรียมการ' && (
                <button className="btn btn-outline btn-sm" style={{ marginTop: 8, width: '100%' }}
                  onClick={() => window.__openModal('monthlyTarget', { month: mIdx, year })}>
                  ตั้งเป้า
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
    );
  };

  return (
    <div className="content-inner" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[0, 1, 2, 3].map(renderQuarter)}
    </div>
  );
}

/* ====================  ENTRY VIEW ROUTER  ==================== */
export function EntryView({ sub }) {
  const { NOW_MONTH, NOW_YEAR } = _now();
  const [month, setMonth] = useState(NOW_MONTH);
  const [year, setYear]   = useState(NOW_YEAR);
  const [quarterView, setQuarterView] = useState(false);

  const mode = getMode(month, year);
  const monthLabel = MONTH_SHORT[month];
  const monthFull  = MONTH_FULL[month];

  return (
    <>
      <div className="content-inner">
        <MonthNav month={month} year={year} setMonth={setMonth} setYear={setYear}
          quarterView={quarterView} setQuarterView={setQuarterView} />
      </div>
      {quarterView
        ? <QuarterView month={month} year={year} />
        : <MonthlyOverview mode={mode} monthLabel={monthLabel} monthFull={monthFull} month={month} year={year} />
      }
    </>
  );
}

/* ====================  บันทึก & ภาพรวมเดือน (หน้ากรอก/ตั้งค่า — ข้อมูลดิบ ไม่ตัดสินผลงาน)  ==================== */
// สถานะแคมเปญแอด — ป้าย/สี ชุดเดียว
const MO_AD_ST = {
  live: { l: 'กำลังรัน', c: 'var(--good)' },
  upcoming: { l: 'รอเริ่ม', c: 'var(--accent)' },
  paused: { l: 'หยุดชั่วคราว', c: 'var(--warn)' },
  done: { l: 'เสร็จสิ้น', c: 'var(--ink-3)' },
  cancelled: { l: 'ยกเลิก', c: 'var(--bad)' },
};
const MO_AD_ORDER = ['live', 'upcoming', 'paused', 'done', 'cancelled'];

function MoStat({ label, value }) {
  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>
      <div className="cap" style={{ color: 'var(--ink-3)' }}>{label}</div>
      <div className="num" style={{ fontWeight: 700, fontSize: 'var(--fs-sm)', marginTop: 2, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

function MonthlyOverview({ mode, monthLabel, monthFull, month, year }) {
  const { TODAY } = _now();
  const { isCurrent, isPast, isFuture } = mode;
  const md = computeMonth(month, year);
  const canEdit = !!window.__canEdit;

  // วัดความสูงปฏิทิน → ให้การ์ด "บันทึกรายวัน" สูงเท่ากัน (ตารางเลื่อนข้างใน) เฉพาะจอกว้าง
  const calRef = useRef(null);
  const [calH, setCalH] = useState(0);
  const [wide, setWide] = useState(typeof window !== 'undefined' ? window.innerWidth > 760 : true);
  useLayoutEffect(() => {
    const onResize = () => setWide(window.innerWidth > 760);
    window.addEventListener('resize', onResize);
    let ro;
    if (calRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => { if (calRef.current) setCalH(calRef.current.offsetHeight); });
      ro.observe(calRef.current);
    }
    if (calRef.current) setCalH(calRef.current.offsetHeight);
    return () => { window.removeEventListener('resize', onResize); if (ro) ro.disconnect(); };
  }, []);

  // ----- ค่าที่ "ตั้งไว้" (ดิบ — ตั้งอะไรมาก็โชว์อันนั้น) -----
  const selRow = (DD.monthly || []).find(m => m.month === month + 1 && m.year === year);
  const selMeta = (selRow && selRow.meta) || {};
  const TARGET = Number(md.consts.TARGET || 0);
  const AD_BUDGET = Number(md.consts.AD_BUDGET || 0);
  const acosCeil = Number(selMeta.acosCeil || 25);
  const newCustTarget = Number(selMeta.newCustTarget || 0);
  const chTargetOf = (id) => Number((selMeta.channelTargets && selMeta.channelTargets[id]) || 0);
  const adBudgetOf = (id) => Number((selMeta.adChannels && selMeta.adChannels[id]) || 0);
  const channels = md.channels || [];
  const adChannels = channels.filter(c => c.hasAd);
  const maxChTgt = Math.max(1, ...channels.map(c => chTargetOf(c.id)));
  const maxAdBudget = Math.max(1, ...adChannels.map(c => adBudgetOf(c.id)));

  // รายการที่กรอก (ดิบ) — ทุกวันของเดือนนี้ เรียงล่าสุดก่อน
  const dailyRows = (DD.dailyAll || []).filter(r => r.year === year && r.month === month + 1)
    .map(r => {
      const ch = r.ch || {};
      const rev = Object.values(ch).reduce((s, c) => s + (Number(c.rev) || 0), 0);
      const ord = Object.values(ch).reduce((s, c) => s + (Number(c.ord) || 0), 0);
      return { day: r.day, rev, ord, ad: Number(r.adSpend || 0) };
    }).sort((a, b) => b.day - a.day);

  // ----- การกรอกยอดรายวัน (ดิบ) -----
  const DAYS = md.consts.DAYS || 30;
  const ENTERED_DAYS = md.enteredDays;
  const enteredSet = new Set(md.dailyMonth.map(d => d.d));
  const dayRevMap = {}; (md.dailyMonth || []).forEach(d => { dayRevMap[d.d] = d.rev; });
  const todayEntered = enteredSet.has(TODAY);
  const lastFillable = isPast ? DAYS : Math.min(TODAY, DAYS);
  let firstMissing = 0;
  for (let d = 1; d <= lastFillable; d++) { if (!enteredSet.has(d)) { firstMissing = d; break; } }
  const isoFor = (d) => `${year - 543}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  // ----- แคมเปญ / กลุ่ม / ย้อนหลัง -----
  const monthAdCamps = (DD.adCampaigns || []).filter(c => adCampaignInMonth(c, month, year));
  const monthsFilled = (DD.monthly || []).filter(m => m.year === year && m.actual > 0).length;
  const segCount = (DD.segments || []).length;

  // ----- โหมดข้อมูล (อดีต): รายเดือน vs รายวัน -----
  const hasMonthlyTotal = !!selRow && Number(selRow.actual || 0) > 0;
  const hasDailyData = ENTERED_DAYS > 0;
  const hasData = hasMonthlyTotal || hasDailyData || (selRow && selRow.target > 0);
  const entryMode = (selMeta.entryMode) || (hasMonthlyTotal ? 'monthly' : 'daily');
  const switchEntryMode = async (toMode) => {
    if (!canEdit) { window.__toast?.('ต้องมีสิทธิ์แก้ไขก่อน', 'error'); return; }
    if (toMode === entryMode) return;
    const warn = toMode === 'daily'
      ? `เปลี่ยนเป็น "รายวัน"?\n\nระบบจะใช้ผลรวมจากการกรอกรายวันแทนยอดรวมรายเดือน\nยอดรวมเดิมยังเก็บไว้ — สลับกลับได้`
      : `เปลี่ยนเป็น "รายเดือน"?\n\nระบบจะใช้ยอดรวมรายเดือนแทนผลรวมรายวัน\nข้อมูลรายวันยังอยู่ครบ — สลับกลับได้`;
    if (!window.confirm(warn)) return;
    try {
      const newMeta = { ...selMeta, entryMode: toMode };
      const { data: upd, error } = await supabase.from('tmk_monthly_history').update({ meta: newMeta }).eq('month', month + 1).eq('year', year).select('id');
      if (error) throw error;
      if (!upd || upd.length === 0) { window.__toast?.('ยังไม่มีข้อมูลเดือนนี้ — ตั้งเป้า/กรอกยอดก่อนเปลี่ยนโหมด', 'warn'); return; }
      logAudit({ action: 'update', entityType: 'monthly', entityName: `${monthLabel} ${year}`, summary: `เปลี่ยนโหมดข้อมูลเดือน${monthLabel} ${year} → ${toMode === 'daily' ? 'รายวัน' : 'รายเดือน'}` });
      window.__reload?.();
      window.__toast?.('เปลี่ยนโหมดข้อมูลแล้ว', 'success');
    } catch (e) {
      window.__toast?.('เปลี่ยนโหมดไม่สำเร็จ: ' + e.message, 'error');
    }
  };
  const modeToggle = (
    <div className="row between" style={{ gap: 10, flexWrap: 'wrap', paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--line)' }}>
      <span className="cap" style={{ color: 'var(--ink-2)' }}>ใช้ข้อมูลแบบ:</span>
      <div className="row" style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
        {[['monthly', 'รายเดือน'], ['daily', 'รายวัน']].map(([m, l]) => (
          <button key={m} onClick={() => switchEntryMode(m)} style={{ border: 'none', padding: '5px 14px', cursor: 'pointer', fontSize: 'var(--fs-cap)', fontWeight: 600, background: entryMode === m ? 'var(--accent)' : 'transparent', color: entryMode === m ? '#fff' : 'var(--ink-2)' }}>{l}</button>
        ))}
      </div>
    </div>
  );

  // ----- ปุ่มหลักต่อโหมด -----
  let primaryLabel, primaryDate = null, primaryModal, primaryDisabled = !canEdit;
  if (isFuture) { primaryModal = 'monthlyTarget'; primaryLabel = 'ตั้งเป้า & งบล่วงหน้า'; }
  else if (isPast) { primaryModal = 'historical'; primaryLabel = hasData ? 'แก้ไขข้อมูลย้อนหลัง' : 'กรอกข้อมูลย้อนหลัง'; }
  else {
    primaryModal = 'record';
    primaryDate = todayEntered ? (firstMissing ? isoFor(firstMissing) : null) : isoFor(TODAY);
    primaryLabel = todayEntered ? (firstMissing ? `กรอกย้อนหลัง — วันที่ ${firstMissing}` : '✓ กรอกครบทุกวันแล้ว') : `กรอกยอดวันนี้ (${TODAY} ${monthLabel})`;
    primaryDisabled = !canEdit || (todayEntered && !firstMissing);
  }
  const firePrimary = () => {
    if (primaryDisabled) return;
    if (primaryModal === 'record') { if (primaryDate) window.__openModal('record', { date: primaryDate }); }
    else if (primaryModal === 'monthlyTarget') window.__openModal('monthlyTarget', { month, year });
    else if (primaryModal === 'historical') window.__openModal('historical', { year });
  };

  const _firstDow = new Date(year - 543, month, 1).getDay();
  const _WD = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

  /* ---------- การ์ดซ้ายบน: บันทึกยอดรายวัน (เน้นกรอก ไม่โชว์ยอดรวม/ผลงาน) ---------- */
  const missHint = firstMissing ? `ยังไม่กรอก: วันที่ ${firstMissing}` : (ENTERED_DAYS > 0 ? 'กรอกครบทุกวันแล้ว ✓' : 'ยังไม่มีข้อมูลรายวัน');
  const leftCard = (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: (wide && calH) ? calH : undefined }}>
      <div className="card-head"><div><div className="eyebrow">{isPast ? 'แก้ไขย้อนหลัง' : 'บันทึกยอดรายวัน'}</div><div className="h3">กรอกแล้ว {ENTERED_DAYS}/{DAYS} วัน</div></div></div>
      <div style={{ padding: '0 16px 16px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {isPast && (hasMonthlyTotal || hasDailyData) && modeToggle}
        <div className="bar" style={{ height: 8, background: 'var(--surface-3)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min((ENTERED_DAYS / DAYS) * 100, 100)}%`, background: 'var(--accent)', borderRadius: 4, transition: 'width 0.5s var(--ease)' }}></div>
        </div>
        <div className="cap" style={{ color: 'var(--ink-3)', margin: '10px 0 12px' }}>{missHint}</div>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 12, opacity: primaryDisabled ? 0.55 : 1 }} disabled={primaryDisabled} onClick={firePrimary}>
          <Icon name="pencil" /> {primaryLabel}
        </button>
        {/* รายการที่กรอก (ดิบ — โชว์มาเลย ไม่ซ่อน) */}
        <div className="cap" style={{ color: 'var(--ink-3)', fontWeight: 700, margin: '16px 0 6px' }}>รายการที่กรอก{dailyRows.length ? ` (${dailyRows.length})` : ''}</div>
        {dailyRows.length === 0
          ? <div className="cap" style={{ color: 'var(--ink-4)', padding: '6px 0' }}>ยังไม่มีรายการ — กดกรอกด้านบน</div>
          : (
            <div style={{ flex: 1, minHeight: 80, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)' }}>
              <table className="tbl" style={{ width: '100%', fontSize: 'var(--fs-cap)' }}>
                <thead><tr style={{ position: 'sticky', top: 0, background: 'var(--surface-2)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>วันที่</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px' }}>ยอดรวม</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px' }}>ออเดอร์</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px' }}>ค่าแอด</th>
                </tr></thead>
                <tbody>
                  {dailyRows.map(r => (
                    <tr key={r.day} onClick={() => canEdit && window.__openModal('record', { date: isoFor(r.day) })} style={{ cursor: canEdit ? 'pointer' : 'default', borderTop: '1px solid var(--line-2)' }} title={canEdit ? 'กดเพื่อแก้ไข' : ''}>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>{r.day} {monthLabel}</td>
                      <td className="num" style={{ textAlign: 'right', padding: '6px 8px' }}>{B(r.rev)}</td>
                      <td className="num" style={{ textAlign: 'right', padding: '6px 8px' }}>{r.ord || '—'}</td>
                      <td className="num" style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--ink-3)' }}>{r.ad > 0 ? B(r.ad) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );

  /* ---------- การ์ดขวาบน: ปฏิทินยอดขาย (โชว์ยอด/วัน — ดิบ) ---------- */
  const calendarCard = (
    <div className="card" ref={calRef}>
      <div className="card-head"><div><div className="eyebrow">ปฏิทินยอดขาย</div><div className="h3">เดือน{monthLabel}</div></div></div>
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
          {_WD.map((w, i) => <div key={'wd' + i} className="cap" style={{ textAlign: 'center', color: 'var(--ink-4)', fontWeight: 600, fontSize: 10, paddingBottom: 2 }}>{w}</div>)}
          {Array.from({ length: _firstDow }).map((_, i) => <div key={'blank' + i}></div>)}
          {Array.from({ length: DAYS }, (_, i) => i + 1).map(d => {
            const ent = enteredSet.has(d);
            const rev = dayRevMap[d];
            const future = isCurrent && d > TODAY;
            const today = isCurrent && d === TODAY;
            const disabled = future || !canEdit;
            return (
              <button key={d} disabled={disabled} onClick={() => window.__openModal('record', { date: isoFor(d) })}
                title={ent ? `วันที่ ${d} — ${B(rev)}` : future ? `วันที่ ${d} — ยังไม่ถึง` : `วันที่ ${d} — ยังไม่กรอก`}
                style={{ aspectRatio: '1', minHeight: 38, borderRadius: 6, border: today ? '2px solid var(--accent)' : '1px solid var(--line)', background: ent ? 'var(--good-soft)' : 'var(--surface)', cursor: disabled ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, padding: '2px 1px', opacity: future ? 0.4 : 1, overflow: 'hidden' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: ent ? 'var(--good)' : 'var(--ink-3)' }}>{d}</span>
                {ent && rev > 0 && <span style={{ fontSize: 8, fontWeight: 600, color: 'var(--good)', lineHeight: 1, whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{Bc(rev)}</span>}
              </button>
            );
          })}
        </div>
        <div className="cap" style={{ color: 'var(--ink-3)', marginTop: 8 }}>คลิกวันเพื่อกรอก/แก้ยอด · <span style={{ color: 'var(--good)' }}>เขียว</span> = กรอกแล้ว</div>
      </div>
    </div>
  );

  /* ---------- การ์ด: เป้าหมาย & งบ "ที่ตั้งไว้" (ดิบ — ไม่เทียบผลจริง) ---------- */
  const targetCard = (
    <div className="card">
      <div className="card-head row between" style={{ alignItems: 'center' }}>
        <div><div className="eyebrow">เป้าหมาย & งบ ที่ตั้งไว้</div><div className="h3">เดือน{monthLabel} {year}</div></div>
        {canEdit && <button className="btn btn-sm btn-outline" onClick={() => window.__openModal('monthlyTarget', { month, year })}><Icon name="pencil" /> {TARGET > 0 ? 'แก้ไข' : 'ตั้งค่า'}</button>}
      </div>
      <div style={{ padding: '0 16px 16px' }}>
        <div className="grid g2" style={{ gap: 10 }}>
          <MoStat label="เป้ายอดขาย" value={TARGET > 0 ? B(TARGET) : '— ยังไม่ตั้ง'} />
          <MoStat label="งบโฆษณา" value={AD_BUDGET > 0 ? B(AD_BUDGET) : '— ยังไม่ตั้ง'} />
          <MoStat label="เป้าลูกค้าใหม่" value={newCustTarget > 0 ? `${N(newCustTarget)} คน` : '—'} />
          <MoStat label="เพดาน ACOS" value={`${acosCeil}%`} />
        </div>
        {/* เป้าต่อช่องทาง — โชว์มาเลย ไม่ซ่อน */}
        <div className="cap" style={{ color: 'var(--ink-3)', fontWeight: 700, margin: '14px 0 6px' }}>เป้ายอดขายต่อช่องทาง</div>
        <div className="grid g2" style={{ gap: '4px 14px' }}>
          {channels.map(ch => {
            const tgt = chTargetOf(ch.id);
            const w = Math.min((tgt / maxChTgt) * 100, 100);
            return (
              <div key={ch.id} style={{ marginBottom: 4 }}>
                <div className="row between" style={{ marginBottom: 2 }}>
                  <span className="cap" style={{ color: 'var(--ink-2)' }}><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: ch.hex, marginRight: 5 }}></span>{ch.name}</span>
                  <span className="cap num">{tgt > 0 ? B(tgt) : '—'}</span>
                </div>
                <div className="bar" style={{ height: 5, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${w}%`, background: ch.hex, borderRadius: 3 }}></div>
                </div>
              </div>
            );
          })}
        </div>
        {/* งบโฆษณาต่อช่องทาง — แถบเหมือนเป้ายอดขาย */}
        {adChannels.length > 0 && (
          <>
            <div className="cap" style={{ color: 'var(--ink-3)', fontWeight: 700, margin: '14px 0 6px' }}>งบโฆษณาต่อช่องทาง</div>
            <div className="grid g2" style={{ gap: '4px 14px' }}>
              {adChannels.map(ch => {
                const bud = adBudgetOf(ch.id);
                const w = Math.min((bud / maxAdBudget) * 100, 100);
                return (
                  <div key={ch.id} style={{ marginBottom: 4 }}>
                    <div className="row between" style={{ marginBottom: 2 }}>
                      <span className="cap" style={{ color: 'var(--ink-2)' }}><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: ch.hex, marginRight: 5 }}></span>{ch.name}</span>
                      <span className="cap num">{bud > 0 ? B(bud) : '—'}</span>
                    </div>
                    <div className="bar" style={{ height: 5, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${w}%`, background: ch.hex, borderRadius: 3 }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );

  /* ---------- การ์ด: แคมเปญแอด (รายการที่ตั้ง) ---------- */
  const campaignCard = (
    <div className="card">
      <div className="card-head row between" style={{ alignItems: 'center' }}>
        <div><div className="eyebrow">แคมเปญแอด</div><div className="h3">{monthAdCamps.length > 0 ? `${monthAdCamps.length} แคมเปญ` : `เดือน${monthLabel}`}</div></div>
        {canEdit && <button className="btn btn-sm btn-outline" onClick={() => window.__openModal('adCampaign')}><Icon name="plus" /> เพิ่ม</button>}
      </div>
      <div style={{ padding: '0 16px 16px' }}>
        {monthAdCamps.length === 0
          ? <div className="cap" style={{ color: 'var(--ink-4)' }}>ยังไม่มีแคมเปญแอดในเดือนนี้</div>
          : MO_AD_ORDER.filter(st => monthAdCamps.some(c => (c.status || 'live') === st)).map(st => (
            <div key={st} style={{ marginBottom: 8 }}>
              <div className="cap" style={{ color: MO_AD_ST[st].c, fontWeight: 700, marginBottom: 4 }}>{MO_AD_ST[st].l} ({monthAdCamps.filter(c => (c.status || 'live') === st).length})</div>
              {monthAdCamps.filter(c => (c.status || 'live') === st).map(c => (
                <button key={c.id} onClick={() => window.__openModal('adCampaign', c)} title="แก้ไขแคมเปญแอด"
                  className="row between" style={{ width: '100%', gap: 8, padding: '6px 8px', marginBottom: 4, border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', cursor: 'pointer', textAlign: 'left' }}>
                  <div className="row" style={{ gap: 8, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: MO_AD_ST[st].c, flexShrink: 0 }}></span>
                    <div style={{ minWidth: 0 }}>
                      <div className="sm" style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                      <div className="cap" style={{ color: 'var(--ink-3)' }}>{c.platform} · งบ {B(c.budget)}</div>
                    </div>
                  </div>
                  <Icon name="pencil" />
                </button>
              ))}
            </div>
          ))}
      </div>
    </div>
  );

  /* ---------- การ์ด: กลุ่มลูกค้า & ข้อมูลย้อนหลัง ---------- */
  const _bubble = { width: 32, height: 32, borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', color: 'var(--ink-3)', display: 'grid', placeItems: 'center', flexShrink: 0 };
  const extrasCard = (
    <div className="card">
      <div className="card-head"><div><div className="eyebrow">เพิ่มเติม</div><div className="h3">กลุ่มลูกค้า & ข้อมูลย้อนหลัง</div></div></div>
      <div style={{ padding: '0 16px 16px' }}>
        <div className="row between" style={{ padding: '10px 4px', borderBottom: '1px solid var(--line)', gap: 12 }}>
          <div className="row" style={{ gap: 10, minWidth: 0 }}>
            <span style={_bubble}><Icon name="users" /></span>
            <div style={{ minWidth: 0 }}><div className="sm" style={{ fontWeight: 600 }}>กลุ่มลูกค้า</div><div className="cap" style={{ color: 'var(--ink-3)' }}>{segCount > 0 ? `${segCount} กลุ่ม` : 'ยังไม่ได้อัปเดต'}</div></div>
          </div>
          {canEdit && <button className="btn btn-sm btn-outline" onClick={() => window.__openModal('customerSegment')}>จัดการ</button>}
        </div>
        <div className="row between" style={{ padding: '10px 4px', gap: 12 }}>
          <div className="row" style={{ gap: 10, minWidth: 0 }}>
            <span style={_bubble}><Icon name="clock" /></span>
            <div style={{ minWidth: 0 }}><div className="sm" style={{ fontWeight: 600 }}>ข้อมูลย้อนหลัง</div><div className="cap" style={{ color: 'var(--ink-3)' }}>กรอกแล้ว {monthsFilled}/12 เดือน</div></div>
          </div>
          {canEdit && <button className="btn btn-sm btn-outline" onClick={() => window.__openModal('historical', { year })}>กรอก</button>}
        </div>
      </div>
    </div>
  );

  // ----- เลย์เอาต์ -----
  if (isFuture) {
    return (
      <div className="content-inner" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card" style={{ padding: 24, background: 'var(--accent-soft)', borderLeft: '4px solid var(--accent)' }}>
          <div className="h2" style={{ marginBottom: 4 }}>เตรียมเดือน{monthFull} {year}</div>
          <div className="sm" style={{ color: 'var(--ink-2)', marginBottom: 16 }}>ตั้งเป้าหมาย งบ และแคมเปญล่วงหน้าได้เลย — พอถึงเดือนนี้ค่อยเริ่มกรอกยอดรายวัน</div>
          {canEdit && <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 12 }} onClick={() => window.__openModal('monthlyTarget', { month, year })}><Icon name="target" /> ตั้งเป้า & งบล่วงหน้า</button>}
        </div>
        {targetCard}
        <div className="grid g2" style={{ gap: 14, alignItems: 'start' }}>{campaignCard}{extrasCard}</div>
      </div>
    );
  }
  return (
    <div className="content-inner" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="grid g2" style={{ gap: 14, alignItems: 'start' }}>
        {leftCard}
        {calendarCard}
      </div>
      {targetCard}
      <div className="grid g2" style={{ gap: 14, alignItems: 'start' }}>
        {campaignCard}
        {extrasCard}
      </div>
    </div>
  );
}
