/* ============================================================
   TMK Operation — Views: Data Entry Hub (บันทึก)
   ============================================================ */
import React, { useState } from 'react';
import { TMK } from './data.js';
import { B, Bk, N, P, Icon, Ring } from './components.jsx';
import { getToday, THAI_MONTHS as MONTH_SHORT, THAI_MONTHS_FULL as MONTH_FULL } from './lib/dateUtils.js';
import { adCampaignInMonth, computeMonth } from './dataContext.jsx';

const DD = TMK;


// "วันนี้" จากวันที่จริงของเครื่อง (getToday เป็น pure date — ปลอดภัยที่ module-level)
const _T = getToday();
const NOW_MONTH = _T.month - 1; // 0-indexed
const NOW_YEAR  = _T.yearBE;
const TODAY = _T.day;
const DAYS_IN_MONTH = _T.daysInMonth;

// สร้างข้อมูลรายไตรมาสจาก monthly จริง (TMK.monthly) — qIndex 0-3
function quarterData(year, qIndex) {
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
  const isCurrent = month === NOW_MONTH && year === NOW_YEAR;
  const isPast = year < NOW_YEAR || (year === NOW_YEAR && month < NOW_MONTH);
  const isFuture = year > NOW_YEAR || (year === NOW_YEAR && month > NOW_MONTH);
  return { isCurrent, isPast, isFuture };
}

/* ====================  MONTH NAVIGATOR  ==================== */
function MonthNav({ month, year, setMonth, setYear, quarterView, setQuarterView }) {
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
        : sub === 'monthly' ? <MonthlySetup mode={mode} monthLabel={monthLabel} monthFull={monthFull} month={month} year={year} />
        : sub === 'status'  ? <StatusOverview mode={mode} monthLabel={monthLabel} monthFull={monthFull} month={month} year={year} />
        : <DailyEntry mode={mode} monthLabel={monthLabel} monthFull={monthFull} month={month} year={year} />
      }
    </>
  );
}

/* ====================  DAILY ENTRY  ==================== */
function DailyEntry({ mode, monthLabel, monthFull, month, year }) {
  const { isCurrent, isPast, isFuture } = mode;
  const [editing, setEditing] = useState(false);
  // ข้อมูลของ "เดือนที่เลือก" — เปลี่ยนเดือนแล้วปฏิทิน/ตารางเปลี่ยนตาม
  const md = computeMonth(month, year);
  const dailyLog = md.dailyLog;
  const todayLog = dailyLog[0];
  const dayRevMap = {}; md.dailyMonth.forEach(d => { dayRevMap[d.d] = d.rev; });
  const ENTERED_DAYS = md.enteredDays;
  const SEL_DAYS = md.consts.DAYS;
  const todayEntered = isCurrent && md.dailyMonth.some(d => d.d === TODAY);
  const totalToday = todayLog ? todayLog.shopee + todayLog.tiktok + todayLog.lazada + todayLog.facebook + todayLog.line + todayLog.crm : 0;

  /* ---- FUTURE ---- */
  if (isFuture) {
    return (
      <div className="content-inner" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card" style={{ padding: 20, background: 'var(--accent-soft)', borderLeft: '4px solid var(--accent)' }}>
          <div className="h3" style={{ marginBottom: 4 }}>เดือน{monthFull} {year} — ยังไม่เริ่ม</div>
          <div className="sm" style={{ color: 'var(--ink-2)' }}>เดือนนี้ยังไม่เปิดให้กรอกข้อมูล</div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="eyebrow">ปฏิทินการกรอก</div>
              <div className="h3">{monthLabel} {year}</div>
            </div>
          </div>
          <div style={{ padding: '40px 16px', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, margin: '0 auto 12px', color: 'var(--ink-4)' }}><Icon name="clock" /></div>
            <div className="h3" style={{ color: 'var(--ink-3)', marginBottom: 4 }}>ยังไม่ถึงเวลากรอกข้อมูลเดือนนี้</div>
            <div className="sm" style={{ color: 'var(--ink-4)' }}>ข้อมูลจะเปิดให้กรอกเมื่อถึงเดือน{monthFull}</div>
          </div>
        </div>
      </div>
    );
  }

  /* ---- PAST ---- */
  if (isPast) {
    return (
      <div className="content-inner" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card" style={{ padding: 20, background: 'var(--surface-2)', borderLeft: '4px solid var(--ink-3)' }}>
          <div className="row between wrap" style={{ gap: 12 }}>
            <div>
              <div className="h3" style={{ marginBottom: 4 }}>เดือน{monthFull} — ข้อมูลย้อนหลัง</div>
              <div className="sm" style={{ color: 'var(--ink-2)' }}>ข้อมูลเดือนนี้ถูกปิดแล้ว สามารถดูข้อมูลย้อนหลังได้</div>
            </div>
            <button className="btn btn-outline" onClick={() => setEditing(!editing)}>
              <Icon name="pencil" />{editing ? 'ยกเลิก' : 'แก้ไข'}
            </button>
          </div>
        </div>

        {/* Calendar - read only */}
        <div className="card" style={{ opacity: editing ? 1 : 0.8 }}>
          <div className="card-head">
            <div>
              <div className="eyebrow">ปฏิทินการกรอก</div>
              <div className="h3">{monthLabel} {year}</div>
            </div>
            <span className="chip">{ENTERED_DAYS}/{SEL_DAYS} วัน</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, padding: '0 16px 16px' }}>
            {['จ','อ','พ','พฤ','ศ','ส','อา'].map(d => (
              <div key={d} className="cap" style={{ textAlign: 'center', padding: '4px 0', fontWeight: 600 }}>{d}</div>
            ))}
            {/* offset วันแรกของเดือนที่เลือก (จันทร์คอลัมน์แรก) */}
            {Array.from({ length: (new Date(year - 543, month, 1).getDay() + 6) % 7 }, (_, i) => <div key={'blank-' + i}></div>)}
            {Array.from({ length: new Date(year - 543, month + 1, 0).getDate() }, (_, i) => {
              const day = i + 1;
              const entered = dayRevMap[day] != null;
              const rev = dayRevMap[day];
              const iso = `${year - 543}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              return (
                <div key={day} style={{
                  textAlign: 'center', padding: '6px 2px', borderRadius: 'var(--r-sm)',
                  background: entered ? 'var(--good-soft)' : 'var(--surface-2)', border: '1px solid var(--line)',
                  cursor: editing ? 'pointer' : 'default',
                  outline: editing ? '1px dashed var(--accent)' : 'none',
                }}
                onClick={() => { if (editing) window.__openModal('record', { date: iso }); }}>
                  <div className="sm" style={{ fontWeight: 600, color: entered ? 'var(--good)' : 'var(--ink-3)' }}>{day}</div>
                  {entered && rev ? <div className="cap" style={{ fontSize: 9, color: 'var(--ink-3)' }}>{Bk(rev)}</div> : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* Table - read only */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="eyebrow">รายการย้อนหลัง</div>
              <div className="h3">ยอดขายเดือน{monthLabel} {year}</div>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>วันที่</th>
                  <th style={{ textAlign: 'right' }}>รายได้รวม</th>
                  <th style={{ textAlign: 'right' }}>ออเดอร์</th>
                  <th style={{ textAlign: 'center' }}>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {dailyLog.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-4)' }} className="cap">ยังไม่มีข้อมูลเดือนนี้</td></tr>
                ) : dailyLog.map((log, i) => {
                  const total = log.shopee + log.tiktok + log.lazada + log.facebook + log.line + log.crm;
                  return (
                    <tr key={i}>
                      <td><span className="sm" style={{ fontWeight: 600 }}>{log.date}</span></td>
                      <td style={{ textAlign: 'right' }}><span className="num">{B(total)}</span></td>
                      <td style={{ textAlign: 'right' }}><span className="sm">—</span></td>
                      <td style={{ textAlign: 'center' }}><span className="chip chip-good">กรอกแล้ว</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  /* ---- CURRENT (default / existing behavior) ---- */
  return (
    <div className="content-inner" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Status Banner */}
      <div className="card" style={{ padding: 20, background: todayEntered ? 'var(--good-soft)' : 'var(--warn-soft)', borderLeft: `4px solid ${todayEntered ? 'var(--good)' : 'var(--warn)'}` }}>
        <div className="row between wrap" style={{ gap: 12 }}>
          <div>
            <div className="h3" style={{ marginBottom: 4 }}>
              {todayEntered ? `กรอกยอดวันนี้แล้ว (${TODAY} ${monthLabel})` : `ยังไม่ได้กรอกยอดวันนี้ (${TODAY} ${monthLabel})`}
            </div>
            <div className="sm" style={{ color: 'var(--ink-2)' }}>
              {todayEntered ? 'ข้อมูลอัปเดตแล้ว Dashboard จะแสดงตัวเลขล่าสุด' : 'กรอกยอดขายเพื่อให้ Dashboard อัปเดตข้อมูลวันนี้'}
            </div>
          </div>
          {!todayEntered && (
            <button className="btn btn-accent" onClick={() => window.__openModal('record')}>
              <Icon name="pencil" />กรอกเลย
            </button>
          )}
        </div>
      </div>

      {/* Quick Entry Button */}
      <button className="card" onClick={() => window.__openModal('record')}
        style={{ padding: 28, textAlign: 'center', cursor: 'pointer', border: '2px dashed var(--accent)', background: 'var(--accent-soft)' }}>
        <div style={{ width: 32, height: 32, margin: '0 auto 8px', color: 'var(--accent)' }}><Icon name="pencil" /></div>
        <div className="h2" style={{ color: 'var(--accent)', marginBottom: 4 }}>บันทึกยอดขายวันนี้</div>
        <div className="sm" style={{ color: 'var(--ink-3)' }}>กรอกยอดทุกช่องทาง — Shopee, TikTok, Lazada, Facebook, LINE, CRM</div>
      </button>

      {/* Entry Calendar */}
      <div className="card">
        <div className="card-head">
          <div>
            <div className="eyebrow">ปฏิทินการกรอก</div>
            <div className="h3">{monthLabel} {year}</div>
          </div>
          <span className="chip">{ENTERED_DAYS}/{DAYS_IN_MONTH} วัน</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, padding: '0 16px 16px' }}>
          {['จ','อ','พ','พฤ','ศ','ส','อา'].map(d => (
            <div key={d} className="cap" style={{ textAlign: 'center', padding: '4px 0', fontWeight: 600 }}>{d}</div>
          ))}
          {/* offset วันแรกของเดือนจริง (จันทร์เป็นคอลัมน์แรก) */}
          {Array.from({ length: (new Date(_T.yearCE, _T.month - 1, 1).getDay() + 6) % 7 }, (_, i) => <div key={'blank-' + i}></div>)}
          {Array.from({ length: DAYS_IN_MONTH }, (_, i) => {
            const day = i + 1;
            const isToday = day === TODAY;
            const entered = dayRevMap[day] != null; // กรอกจริงไหม
            const futureDay = day > TODAY;
            const rev = dayRevMap[day];
            const iso = `${_T.yearCE}-${String(_T.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            return (
              <div key={day} style={{
                textAlign: 'center', padding: '6px 2px', borderRadius: 'var(--r-sm)',
                background: isToday ? 'var(--warn-soft)' : entered ? 'var(--good-soft)' : 'var(--surface-2)',
                border: isToday ? '2px solid var(--warn)' : '1px solid var(--line)',
                opacity: futureDay ? 0.4 : 1,
                cursor: futureDay ? 'default' : 'pointer',
              }}
              onClick={() => { if (!futureDay) window.__openModal('record', { date: iso }); }}
              >
                <div className="sm" style={{ fontWeight: 600, color: isToday ? 'var(--warn)' : entered ? 'var(--good)' : 'var(--ink-4)' }}>{day}</div>
                {entered && rev && <div className="cap" style={{ fontSize: 9, color: 'var(--ink-3)' }}>{Bk(rev)}</div>}
                {isToday && !entered && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warn)', margin: '2px auto 0' }}></div>}
                {entered && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--good)', margin: '2px auto 0' }}></div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Entries Table */}
      <div className="card">
        <div className="card-head">
          <div>
            <div className="eyebrow">รายการล่าสุด</div>
            <div className="h3">ยอดขาย 7 วันล่าสุด</div>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>วันที่</th>
                <th style={{ textAlign: 'right' }}>รายได้รวม</th>
                <th style={{ textAlign: 'right' }}>ออเดอร์</th>
                <th style={{ textAlign: 'center' }}>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {dailyLog.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-4)' }} className="cap">ยังไม่มีข้อมูล — กรอกยอดวันแรกได้เลย</td></tr>
              ) : dailyLog.map((log, i) => {
                const total = log.shopee + log.tiktok + log.lazada + log.facebook + log.line + log.crm;
                const dayNum = parseInt(log.date);
                const entered = dayNum < TODAY;
                const isToday = dayNum === TODAY;
                return (
                  <tr key={i}>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <span className="sm" style={{ fontWeight: 600 }}>{log.date}</span>
                        <span className="cap">({log.day})</span>
                        {isToday && <span className="chip chip-warn" style={{ fontSize: 9 }}>วันนี้</span>}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="num">{B(total)}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="sm">—</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {entered ? (
                        <span className="chip chip-good">กรอกแล้ว</span>
                      ) : isToday ? (
                        <button className="chip chip-warn" style={{ cursor: 'pointer', border: 'none' }} onClick={() => window.__openModal('record')}>ยังไม่กรอก</button>
                      ) : (
                        <span className="chip">ยังไม่กรอก</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ====================  MONTHLY SETUP  ==================== */
function MonthlySetup({ mode, monthLabel, monthFull, month, year }) {
  const { isCurrent, isPast, isFuture } = mode;

  // อ่านค่าตั้งค่าของ "เดือนที่เลือก" (target + meta) — แยกแต่ละเดือน
  const selRow = (DD.monthly || []).find(m => m.month === month + 1 && m.year === year);
  const selMeta = (selRow && selRow.meta) || {};
  const selTarget = Number(selRow?.target || 0);
  const selAdBudget = Number(selMeta.adBudget || 0);
  const chTargetOf = (id) => Number((selMeta.channelTargets && selMeta.channelTargets[id]) || 0);
  const adBudgetOf = (id) => Number((selMeta.adChannels && selMeta.adChannels[id]) || 0);
  const targetSet = selTarget > 0;
  const adBudgetSet = selAdBudget > 0;
  const selMd = computeMonth(month, year);
  const monthAdCamps = (DD.adCampaigns || []).filter(c => adCampaignInMonth(c, month, year));
  const adCampCount = monthAdCamps.length;
  const segSet = (DD.segments || []).length > 0;
  const monthsFilled = (DD.monthly || []).filter(m => m.year === year && m.actual > 0).length;
  const items = [
    {
      title: 'เป้าหมายเดือน',
      icon: 'target',
      done: targetSet,
      status: targetSet ? `ตั้งแล้ว: ${B(selTarget)}` : 'ยังไม่ได้ตั้งเป้า',
      desc: 'ตั้งเป้ารายได้รวมและเป้าต่อช่องทาง',
      modal: 'monthlyTarget',
      extra: (
        <div style={{ marginTop: 10 }}>
          <div className="cap" style={{ marginBottom: 6 }}>เป้าต่อช่องทาง</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {DD.channels.map(ch => (
              <div key={ch.id} style={{ flex: 1, minWidth: 60 }}>
                <div className="bar" style={{ height: 6, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${selTarget > 0 ? Math.min((chTargetOf(ch.id) / selTarget) * 100, 100) : 0}%`, background: ch.hex, borderRadius: 3 }}></div>
                </div>
                <div className="cap" style={{ fontSize: 9, marginTop: 2 }}>{ch.name} {Bk(chTargetOf(ch.id))}</div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: 'งบโฆษณา',
      icon: 'zap',
      done: adBudgetSet,
      status: adBudgetSet ? `ตั้งแล้ว: ${B(selAdBudget)}` : 'ยังไม่ได้ตั้งงบ',
      desc: 'กำหนดงบโฆษณารวมและงบต่อช่องทาง',
      modal: 'monthlyTarget',
      extra: (
        <div style={{ marginTop: 10 }}>
          <div className="cap" style={{ marginBottom: 4 }}>งบต่อช่องทาง</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {DD.channels.filter(c => c.hasAd).map(ch => (
              <span key={ch.id} className="chip" style={{ background: ch.hex + '18', color: ch.hex }}>{ch.name} {Bk(adBudgetOf(ch.id))}</span>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: 'แคมเปญแอด',
      icon: 'megaphone',
      done: adCampCount > 0,
      status: adCampCount > 0 ? `${adCampCount} แคมเปญแอด` : 'ยังไม่มีแคมเปญแอด',
      desc: 'จัดการแคมเปญโฆษณาทุกแพลตฟอร์ม',
      modal: 'adCampaign',
      extra: (
        <div style={{ marginTop: 10 }}>
          <div className="cap" style={{ marginBottom: 6 }}>แคมเปญที่กำลังทำงาน</div>
          {DD.campaigns.filter(c => c.status === 'live').map(c => (
            <div key={c.id} className="row" style={{ gap: 8, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flexShrink: 0 }}></span>
              <span className="sm">{c.name}</span>
              <span className="cap" style={{ color: 'var(--ink-3)' }}>{c.start} - {c.end}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: 'กลุ่มลูกค้า',
      icon: 'users',
      done: segSet,
      status: segSet ? `${(DD.segments || []).length} กลุ่ม` : 'ยังไม่ได้อัปเดต',
      desc: 'แบ่งกลุ่มลูกค้าเพื่อวางแผนการตลาด',
      modal: 'customerSegment',
      extra: (
        <div style={{ marginTop: 10 }}>
          <div className="row" style={{ gap: 12 }}>
            <div className="cap">ลูกค้าใหม่ <span className="num" style={{ fontSize: 'var(--fs-sm)' }}>{N(selMd.computed.NEW_C)}</span></div>
            <div className="cap">ลูกค้าเดิม <span className="num" style={{ fontSize: 'var(--fs-sm)' }}>{N(selMd.computed.OLD_C)}</span></div>
          </div>
        </div>
      ),
    },
    {
      title: 'ข้อมูลย้อนหลัง',
      icon: 'clock',
      done: monthsFilled > 0,
      status: `กรอกแล้ว ${monthsFilled}/12 เดือน`,
      desc: 'กรอกข้อมูลย้อนหลังเพื่อวิเคราะห์แนวโน้ม',
      modal: 'historical',
      extra: (
        <div style={{ marginTop: 10 }}>
          <div className="cap" style={{ marginBottom: 4 }}>ความคืบหน้า {monthsFilled}/12 เดือน</div>
          <div className="bar" style={{ height: 8, background: 'var(--surface-3)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(monthsFilled / 12) * 100}%`, background: 'var(--accent)', borderRadius: 4 }}></div>
          </div>
        </div>
      ),
    },
  ];

  /* ---- FUTURE ---- */
  if (isFuture) {
    return (
      <div className="content-inner" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card" style={{ padding: 20, background: 'var(--accent-soft)', borderLeft: '4px solid var(--accent)' }}>
          <div className="h3" style={{ marginBottom: 4 }}>เดือน{monthFull} {year} — เตรียมการล่วงหน้า</div>
          <div className="sm" style={{ color: 'var(--ink-2)' }}>ตั้งค่าเป้าหมายและงบประมาณล่วงหน้าสำหรับเดือนถัดไป</div>
        </div>

        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-accent" onClick={() => window.__openModal('monthlyTarget', { month, year })}>
            <Icon name="target" />ตั้งเป้าล่วงหน้า
          </button>
        </div>

        <div className="grid g2">
          {items.map((item, i) => (
            <div key={i} className="card" style={{ padding: 20, opacity: 0.7 }}>
              <div className="row" style={{ gap: 10, marginBottom: 8 }}>
                <span style={{ width: 36, height: 36, borderRadius: 'var(--r-sm)', background: 'var(--surface-3)', color: 'var(--ink-4)', display: 'grid', placeItems: 'center' }}>
                  <Icon name={item.icon} />
                </span>
                <div>
                  <div className="sm" style={{ fontWeight: 700 }}>{item.title}</div>
                  <div className="cap" style={{ color: 'var(--ink-4)' }}>ยังไม่ได้ตั้งค่า</div>
                </div>
              </div>
              <button className="btn btn-outline btn-sm" style={{ width: '100%' }} onClick={() => window.__openModal(item.modal, item.modal === 'monthlyTarget' ? { month, year } : undefined)}>
                <Icon name="plus" />ตั้งเป้าล่วงหน้า
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ---- PAST — แก้ไขย้อนหลังได้ ---- */
  if (isPast) {
    const pastRec = (DD.monthly || []).find(m => m.month === month + 1 && m.year === year);
    const pastPct = pastRec && pastRec.target > 0 ? (pastRec.actual / pastRec.target) * 100 : null;
    return (
      <div className="content-inner" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card" style={{ padding: 20, background: 'var(--surface-2)', borderLeft: '4px solid var(--ink-3)' }}>
          <div className="h3" style={{ marginBottom: 4 }}>เดือน{monthFull} {year} — แก้ไขย้อนหลัง</div>
          <div className="sm" style={{ color: 'var(--ink-2)' }}>กดปุ่มเพื่อแก้ไขข้อมูลย้อนหลังของเดือนนี้ได้</div>
        </div>

        <div className="grid g2">
          {items.map((item, i) => (
            <div key={i} className="card" style={{ padding: 20 }}>
              <div className="row between" style={{ marginBottom: 8 }}>
                <div className="row" style={{ gap: 10 }}>
                  <span style={{ width: 36, height: 36, borderRadius: 'var(--r-sm)', background: item.done ? 'var(--good-soft)' : 'var(--warn-soft)', color: item.done ? 'var(--good)' : 'var(--warn)', display: 'grid', placeItems: 'center' }}>
                    <Icon name={item.icon} />
                  </span>
                  <div>
                    <div className="sm" style={{ fontWeight: 700 }}>{item.title}</div>
                    <div className="cap" style={{ color: 'var(--ink-3)' }}>{item.desc}</div>
                  </div>
                </div>
                <button className="btn btn-sm btn-accent" onClick={() => window.__openModal(item.modal, item.modal === 'monthlyTarget' ? { month, year } : undefined)}>
                  <Icon name="pencil" /> แก้ไข
                </button>
              </div>

              {i === 0 && pastPct != null && (
                <div style={{ marginTop: 8, padding: 10, background: 'var(--surface-2)', borderRadius: 'var(--r-sm)' }}>
                  <div className="cap" style={{ marginBottom: 4 }}>ผลจริง vs เป้า</div>
                  <div className="bar" style={{ height: 8, background: 'var(--surface-3)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(pastPct, 100)}%`, background: pastPct >= 95 ? 'var(--good)' : 'var(--warn)', borderRadius: 4 }}></div>
                  </div>
                  <div className="cap" style={{ marginTop: 2, color: pastPct >= 95 ? 'var(--good)' : 'var(--warn)' }}>{P(pastPct, 0)} ของเป้าหมาย</div>
                </div>
              )}

              {item.extra}
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ---- CURRENT (default) ---- */
  return (
    <div className="content-inner" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ marginBottom: 4 }}>
        <div className="eyebrow">ตั้งค่ารายเดือน</div>
        <div className="h2">ข้อมูลที่ต้องตั้งค่าสำหรับเดือน{monthLabel}</div>
      </div>

      <div className="grid g2">
        {items.map((item, i) => (
          <div key={i} className="card" style={{ padding: 20 }}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <div className="row" style={{ gap: 10 }}>
                <span style={{ width: 36, height: 36, borderRadius: 'var(--r-sm)', background: item.done ? 'var(--good-soft)' : 'var(--warn-soft)', color: item.done ? 'var(--good)' : 'var(--warn)', display: 'grid', placeItems: 'center' }}>
                  <Icon name={item.icon} />
                </span>
                <div>
                  <div className="sm" style={{ fontWeight: 700 }}>{item.title}</div>
                  <div className="cap" style={{ color: 'var(--ink-3)' }}>{item.desc}</div>
                </div>
              </div>
            </div>

            <div className="row" style={{ gap: 6, marginBottom: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: item.done ? 'var(--good)' : 'var(--warn)' }}></span>
              <span className="sm" style={{ fontWeight: 600, color: item.done ? 'var(--good)' : 'var(--warn)' }}>{item.status}</span>
            </div>

            {item.extra}

            <button className="btn btn-outline" style={{ marginTop: 12, width: '100%' }} onClick={() => window.__openModal(item.modal, item.modal === 'monthlyTarget' ? { month, year } : undefined)}>
              <Icon name={item.done ? 'pencil' : 'plus'} />
              {item.done ? 'แก้ไข' : 'ตั้งค่า'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ====================  STATUS OVERVIEW  ==================== */
function StatusOverview({ mode, monthLabel, monthFull, month, year }) {
  const { isCurrent, isPast, isFuture } = mode;
  const md = computeMonth(month, year);
  const ENTERED_DAYS = md.enteredDays;

  /* ---- FUTURE ---- */
  if (isFuture) {
    const prepItems = [
      { label: 'ตั้งเป้าหมาย', done: false, modal: 'monthlyTarget' },
      { label: 'ตั้งงบแอด', done: false, modal: 'monthlyTarget' },
      { label: 'เตรียมแคมเปญ', done: false, modal: 'adCampaign' },
    ];
    return (
      <div className="content-inner" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card" style={{ padding: 20, background: 'var(--accent-soft)', borderLeft: '4px solid var(--accent)' }}>
          <div className="h3" style={{ marginBottom: 4 }}>เดือน{monthFull} {year} — เตรียมการ</div>
          <div className="sm" style={{ color: 'var(--ink-2)' }}>เตรียมข้อมูลล่วงหน้าสำหรับเดือนถัดไป</div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="eyebrow">สิ่งที่ต้องเตรียม</div>
              <div className="h3">Checklist เตรียมการเดือน{monthLabel}</div>
            </div>
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            {prepItems.map((item, i) => (
              <div key={i} className="row between" style={{ padding: '14px 4px', borderBottom: i < prepItems.length - 1 ? '1px solid var(--line)' : 'none', gap: 12 }}>
                <div className="row" style={{ gap: 10, flex: 1 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 'var(--r-sm)', background: 'var(--surface-3)', color: 'var(--ink-4)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Icon name="clock" />
                  </span>
                  <div className="sm" style={{ fontWeight: 600 }}>{item.label}</div>
                </div>
                <button className="btn btn-sm btn-accent" onClick={() => window.__openModal(item.modal, item.modal === 'monthlyTarget' ? { month, year } : undefined)}>
                  ตั้งค่า
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ---- PAST — แสดงจาก monthly_history จริง; ไม่มีข้อมูล = บอกตรงๆ ---- */
  if (isPast) {
    const rec = (DD.monthly || []).find(m => m.month === month + 1 && m.year === year);
    const hasData = !!rec && (rec.actual > 0 || rec.target > 0);
    const pastPct = hasData && rec.target > 0 ? Math.round((rec.actual / rec.target) * 100) : null;
    return (
      <div className="content-inner" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card" style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <Ring pct={pastPct ?? 0} size={100} stroke={10} color={pastPct >= 95 ? 'var(--good)' : 'var(--warn)'}>
            <div>
              <div className="h2" style={{ lineHeight: 1 }}>{pastPct != null ? pastPct + '%' : '—'}</div>
              <div className="cap">ของเป้า</div>
            </div>
          </Ring>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="h2" style={{ marginBottom: 4 }}>สรุปเดือน{monthFull}</div>
            <div className="sm" style={{ color: 'var(--ink-2)', marginBottom: 8 }}>
              {hasData ? `เดือน${monthLabel} ${year} — ยอดจริง ${B(rec.actual)}` : `เดือน${monthLabel} ${year} — ไม่มีข้อมูล`}
            </div>
          </div>
        </div>

        {hasData ? (
          <div className="card">
            <div className="card-head"><div><div className="eyebrow">สรุปผลเดือน{monthLabel}</div><div className="h3">ข้อมูลจาก tmk_monthly_history</div></div></div>
            <div style={{ padding: '0 16px 16px' }}>
              {[
                { label: 'เป้าหมาย', detail: rec.target ? B(rec.target) : '—' },
                { label: 'ยอดขายจริง', detail: B(rec.actual) },
                { label: 'ออร์เดอร์', detail: rec.orders ? N(rec.orders) : '—' },
                { label: 'จำนวนข้อความ', detail: rec.messages ? N(rec.messages) : '—' },
              ].map((item, i) => (
                <div key={i} className="row between" style={{ padding: '12px 4px', borderBottom: i < 3 ? '1px solid var(--line)' : 'none', gap: 12 }}>
                  <div className="sm" style={{ fontWeight: 600 }}>{item.label}</div>
                  <span className="cap" style={{ fontWeight: 600 }}>{item.detail}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div className="cap">ยังไม่มีข้อมูลเดือนนี้ — กรอกผ่าน "กรอกข้อมูลย้อนหลัง" ได้</div>
            <button className="btn btn-sm btn-accent" style={{ marginTop: 12 }} onClick={() => window.__openModal('historical')}>กรอกข้อมูลย้อนหลัง</button>
          </div>
        )}
      </div>
    );
  }

  /* ---- CURRENT (default) — ทุกค่ามาจากข้อมูลจริงของเดือนที่เลือก ---- */
  const targetSet = (md.consts.TARGET || 0) > 0;
  const adBudgetSet = (md.consts.AD_BUDGET || 0) > 0;
  const segSet = (DD.segments || []).length > 0;
  const monthsFilled = (DD.monthly || []).filter(m => m.year === year && m.actual > 0).length;
  const todayEntered = md.dailyMonth.some(d => d.d === TODAY);
  const checkItems = [
    { label: `เป้าหมายเดือน ${monthLabel}`, done: targetSet, detail: targetSet ? B(md.consts.TARGET) : 'ยังไม่ได้ตั้ง', modal: 'monthlyTarget' },
    { label: 'งบโฆษณา', done: adBudgetSet, detail: adBudgetSet ? B(md.consts.AD_BUDGET) : 'ยังไม่ได้ตั้ง', modal: 'monthlyTarget' },
    { label: 'กลุ่มลูกค้า', done: segSet, detail: segSet ? `${DD.segments.length} กลุ่ม` : 'ยังไม่อัปเดต', modal: 'customerSegment' },
    { label: `ยอดขายเดือน ${monthLabel}`, done: ENTERED_DAYS > 0, detail: `กรอกแล้ว ${ENTERED_DAYS}/${md.consts.DAYS} วัน`, modal: 'record' },
    { label: `ยอดขาย ${TODAY} ${monthLabel} (วันนี้)`, done: todayEntered, detail: todayEntered ? 'กรอกแล้ว' : 'ยังไม่กรอก', modal: 'record' },
    { label: 'ข้อมูลย้อนหลัง', done: monthsFilled > 0, detail: `${monthsFilled}/12 เดือน`, modal: 'historical' },
  ];

  const doneCount = checkItems.filter(c => c.done).length;
  const totalCount = checkItems.length;
  const pct = Math.round((doneCount / totalCount) * 100);

  return (
    <div className="content-inner" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Overall completion */}
      <div className="card" style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <Ring pct={pct} size={100} stroke={10} color="var(--accent)">
          <div>
            <div className="h2" style={{ lineHeight: 1 }}>{pct}%</div>
            <div className="cap">สมบูรณ์</div>
          </div>
        </Ring>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="h2" style={{ marginBottom: 4 }}>สถานะการกรอกข้อมูล</div>
          <div className="sm" style={{ color: 'var(--ink-2)', marginBottom: 8 }}>เดือน{monthLabel} {year} — ทำแล้ว {doneCount}/{totalCount} รายการ</div>
          <div className="bar" style={{ height: 8, background: 'var(--surface-3)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 4, transition: 'width 0.6s var(--ease)' }}></div>
          </div>
        </div>
      </div>

      {/* Checklist */}
      <div className="card">
        <div className="card-head">
          <div>
            <div className="eyebrow">รายการทั้งหมด</div>
            <div className="h3">Checklist ข้อมูลที่ต้องกรอก</div>
          </div>
        </div>
        <div style={{ padding: '0 16px 16px' }}>
          {checkItems.map((item, i) => (
            <div key={i} className="row between" style={{ padding: '12px 4px', borderBottom: i < checkItems.length - 1 ? '1px solid var(--line)' : 'none', gap: 12 }}>
              <div className="row" style={{ gap: 10, flex: 1, minWidth: 0 }}>
                <span style={{ width: 24, height: 24, borderRadius: 'var(--r-sm)', background: item.done ? 'var(--good-soft)' : 'var(--warn-soft)', color: item.done ? 'var(--good)' : 'var(--warn)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Icon name={item.done ? 'check' : 'clock'} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="sm" style={{ fontWeight: 600 }}>{item.label}</div>
                </div>
              </div>
              <div className="row" style={{ gap: 8, flexShrink: 0 }}>
                <span className="cap" style={{ color: item.done ? 'var(--good)' : 'var(--warn)', fontWeight: 600 }}>{item.detail}</span>
                {!item.done && item.modal && (
                  <button className="btn btn-sm btn-accent" onClick={() => window.__openModal(item.modal, item.modal === 'monthlyTarget' ? { month, year } : undefined)}>
                    {item.modal === 'record' ? 'กรอก' : 'อัปเดต'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tips */}
      <div className="card" style={{ padding: 20, background: 'var(--accent-soft)', borderLeft: '4px solid var(--accent)' }}>
        <div className="row" style={{ gap: 10, marginBottom: 10 }}>
          <Icon name="sparkle" />
          <div className="sm" style={{ fontWeight: 700 }}>เคล็ดลับ</div>
        </div>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li className="sm" style={{ color: 'var(--ink-2)' }}>กรอกยอดทุกวันก่อน 22:00 เพื่อให้ Dashboard อัปเดตทันเวลา</li>
          <li className="sm" style={{ color: 'var(--ink-2)' }}>ตั้งเป้าเดือนใหม่ภายในวันที่ 1 ของเดือน</li>
          <li className="sm" style={{ color: 'var(--ink-2)' }}>อัปเดตกลุ่มลูกค้าทุกเดือนเพื่อให้โปรโมชั่นตรงเป้า</li>
        </ul>
      </div>
    </div>
  );
}
