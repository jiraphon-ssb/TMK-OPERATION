/* ============================================================
   TMK Operation — Views part 1: Home (cockpit) + Sales
   ============================================================ */
import React, { useState, useMemo } from 'react';
import { TMK } from './data.js';
import { B, Bk, Bc, P, N, Icon, paceStatus, useCountUp, Avatar, Ring, MiniArea, Bars, Section, InfoTip } from './components.jsx';
import { useUser } from './userContext.jsx';
import { getToday, THAI_MONTHS, THAI_MONTHS_FULL, thaiDate, todayISO } from './lib/dateUtils.js';
import { computeMonth, adCampaignInMonth, useData } from './dataContext.jsx';

const THAI_WEEKDAYS = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];

const D = TMK;
const C = TMK.computed;
// ❌ ไม่ destructure constants เพราะ primitive snapshot จะค้างที่ 0
// ✅ ใช้ TMK.consts.X inline เพื่อให้อัปเดตจาก Supabase ทันที

/* ---------- Ad campaigns from Supabase (TMK.adCampaigns) ---------- */
// Will fall back to empty array if table not seeded
function getAdCampaigns() { return TMK.adCampaigns || []; }

/* ---------- Customer segments from Supabase (TMK.segments) ---------- */
function getSegments() { return TMK.segments || []; }

/* small KPI tile — clickable with optional onClick */
export function Kpi({ label, value, delta, deltaDir, deltaColor, icon, sub, accent, onClick, hint }) {
  return (
    <div className="card card-pad-sm" onClick={onClick}
      role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }) : undefined}
      style={{ display: 'flex', flexDirection: 'column', gap: 10, cursor: onClick ? 'pointer' : 'default', transition: 'box-shadow 0.15s' }}>
      <div className="row between">
        <span className="metric-label">{label}{hint ? <InfoTip text={hint} label={label} /> : null}</span>
        {icon && <span style={{ color: accent || 'var(--ink-3)' }}><Icon name={icon} /></span>}
      </div>
      <div className="metric-value">{value}</div>
      {(delta || sub) && (
        <div className="row" style={{ gap: 8 }}>
          {delta && (
            <span className="metric-delta" style={{ color: deltaColor || (deltaDir === 'down' ? 'var(--bad)' : 'var(--good)') }}>
              <Icon name={deltaDir === 'down' ? 'down' : 'up'} /> {delta}
            </span>
          )}
          {sub && <span className="cap">{sub}</span>}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   HOME — Executive cockpit
   ============================================================ */
export function HomeView({ go }) {
  const { user } = useUser() || {};
  const userName = user?.name || 'มัง';
  const mtd = useCountUp(C.MTD);
  const pace = useCountUp(C.PACE_PCT);
  const st = paceStatus(C.PACE_PCT);
  const gap = TMK.consts.TARGET - C.RUN;
  const _daysLeft = TMK.consts.DAYS - TMK.consts.DAY;
  const perDayNeeded = _daysLeft > 0 ? Math.max(0, Math.ceil((TMK.consts.TARGET - C.MTD) / _daysLeft)) : 0; // กัน /0 + กันติดลบเมื่อถึงเป้าแล้ว

  const todayTasks = D.tasks.filter(t => t.status === 'inprogress' || t.status === 'review' || t.dateISO === todayISO());
  const alerts = [];
  if (TMK.consts.TARGET > 0 && C.PACE_PCT < 95) alerts.push({ c: 'var(--warn)', cls: 'chip-warn', icon: 'target', t: `ยอด MTD ${st.label} (${P(C.PACE_PCT)})`, d: _daysLeft > 0 ? `ต้องทำเฉลี่ย ${B(perDayNeeded)}/วัน อีก ${_daysLeft} วัน` : 'วันสุดท้ายของเดือนแล้ว' });
  if (!(TMK.consts.TARGET > 0)) alerts.push({ c: 'var(--info)', cls: 'chip-accent', icon: 'target', t: 'ยังไม่ได้ตั้งเป้าเดือนนี้', d: 'ตั้งเป้าที่หน้า "ภาพรวมรายเดือน" เพื่อดู Pace และเปอร์เซ็นต์เป้า' });
  if (C.ACOS_TOT > TMK.consts.ACOS_CEIL) alerts.push({ c: 'var(--bad)', cls: 'chip-bad', icon: 'flame', t: `ACOS รวม ${P(C.ACOS_TOT)} เกินเพดาน`, d: `Facebook ACOS ${P(D.fb.acos)} สูงสุด — ทบทวนงบ` });
  // เตือนงบแอดใกล้เกิน — คาดการณ์จาก burn rate จริง
  const _adBudget = TMK.consts.AD_BUDGET;
  const _projAd = TMK.consts.DAY > 0 ? (C.AD / TMK.consts.DAY) * TMK.consts.DAYS : 0;
  if (_adBudget > 0 && _projAd > _adBudget) alerts.push({ c: 'var(--bad)', cls: 'chip-bad', icon: 'zap', t: `งบแอดจะเกิน — คาดใช้ ${Bk(_projAd)} / งบ ${Bk(_adBudget)}`, d: 'ทบทวนงบโฆษณาเดือนนี้ ก่อนใช้เกิน' });
  const outOfStock = D.products.filter(p => p.stock === 'out' || p.stock === 'low');
  if (outOfStock.length) alerts.push({ c: 'var(--info)', cls: 'chip-accent', icon: 'box', t: `สินค้าใกล้/หมดสต็อก ${outOfStock.length} รายการ`, d: outOfStock.map(p => p.name).slice(0,2).join(', ') });

  const dailyVals = D.dailyMonth.map(d => d.rev);

  return (
    <div className="content-inner rise">
      {/* greeting */}
      <div className="row between wrap" style={{ marginBottom: 20, gap: 12 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>{(() => { const td = getToday(); return `ภาพรวมวันนี้ · ${THAI_WEEKDAYS[new Date().getDay()]} ${td.day} ${THAI_MONTHS_FULL[td.month - 1]} ${td.yearBE}`; })()}</div>
          <h1 className="display">{(() => { const h = new Date().getHours(); return h < 12 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : h < 21 ? 'สวัสดีตอนเย็น' : 'สวัสดีตอนดึก'; })()}, {userName} {'👋'}</h1>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className={`chip ${navigator.onLine ? 'chip-good' : 'chip-warn'}`}><span className="dot-c" style={{ background: navigator.onLine ? 'var(--good)' : 'var(--warn)' }}></span> {navigator.onLine ? 'ออนไลน์' : 'ออฟไลน์'}</span>
        </div>
      </div>

      {/* hero + alerts */}
      <div className="grid" style={{ gridTemplateColumns: '1.7fr 1fr', marginBottom: 16 }}>
        <div className="card" style={{ display: 'flex', gap: 26, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{'ยอดสะสมเดือนนี้'} (MTD) <InfoTip text="ยอดสะสมเดือนนี้ (MTD = Month-To-Date) = ยอดขายสะสมตั้งแต่วันที่ 1 ถึงวันนี้ของเดือน" label="ยอดสะสมเดือนนี้" /></div>
            <div className="num" style={{ fontSize: 'clamp(26px,5vw,40px)', fontWeight: 700, letterSpacing: '-1px', lineHeight: 1.05, wordBreak: 'break-word' }}>{B(mtd)}</div>
            <div className="row" style={{ gap: 14, marginTop: 14 }}>
              <div>
                <div className="cap">{'เป้าเดือน'}</div>
                <div className="num h3">{Bk(TMK.consts.TARGET)}</div>
              </div>
              <div className="divider" style={{ width: 1, height: 32, background: 'var(--line)' }}></div>
              <div>
                <div className="cap">{'คาดยอดทั้งเดือน'} (Run rate) <InfoTip text="คาดยอดทั้งเดือน (Run rate) = (ยอดสะสม ÷ วันที่ผ่านมา) × จำนวนวันทั้งเดือน — ถ้าทำได้เท่านี้ต่อไปจะจบเดือนที่เท่าไร" label="คาดยอดทั้งเดือน (Run rate)" /></div>
                <div className="num h3" style={{ color: gap > 0 ? 'var(--warn)' : 'var(--good)' }}>{B(C.RUN)}</div>
              </div>
              <div className="divider" style={{ width: 1, height: 32, background: 'var(--line)' }}></div>
              <div>
                <div className="cap">{'ขาดอีก'}</div>
                <div className="num h3">{TMK.consts.TARGET > 0 && C.MTD >= TMK.consts.TARGET ? '✓ ถึงเป้าแล้ว' : B(Math.max(0, TMK.consts.TARGET - C.MTD))}</div>
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Ring pct={pace} size={128} stroke={11} color={st.c}>
              <div>
                <div className="num" style={{ fontSize: 26, fontWeight: 700, color: st.c }}>{P(pace, 0)}</div>
                <div className="cap" style={{ marginTop: 2 }}>จังหวะทำยอด (Pace) <InfoTip text="จังหวะทำยอด (Pace) = ยอดสะสม เทียบกับ 'เป้าที่ควรได้ ณ วันนี้' (เป้าเดือน ÷ จำนวนวัน × วันที่ผ่านไป) · 100% = ตรงจังหวะ, เกิน = นำเป้า, ต่ำกว่า = ช้ากว่าเป้า" label="จังหวะทำยอด (Pace)" align="right" /></div>
              </div>
            </Ring>
            <div style={{ marginTop: 8 }}><span className={`chip ${TMK.consts.TARGET > 0 ? st.cls : 'chip-accent'}`}>{TMK.consts.TARGET > 0 ? st.label : 'ยังไม่ตั้งเป้า'}</span></div>
          </div>
        </div>

        <div className="card card-pad-sm" style={{ display: 'flex', flexDirection: 'column', cursor: 'pointer' }} onClick={() => go('sales', 'channels')}>
          <div className="row between" style={{ marginBottom: 12 }}>
            <span className="eyebrow">{'ยอดขายแยกช่องทาง'} (MTD)</span>
            <span className="chip">{B(C.MTD)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, flex: 1 }}>
            {(() => {
              const chs = [...(D.channels || [])].sort((a, b) => (b.actual || 0) - (a.actual || 0));
              if (!chs.length || C.MTD <= 0) return <div className="cap" style={{ color: 'var(--ink-4)', padding: '12px 0' }}>ยังไม่มียอดขายเดือนนี้</div>;
              return chs.map((c, i) => {
                const pct = C.MTD > 0 ? (c.actual / C.MTD) * 100 : 0;
                return (
                  <div key={c.id}>
                    <div className="row between" style={{ marginBottom: 4, gap: 8 }}>
                      <span className="sm" style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: c.hex, flexShrink: 0 }}></span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                        {i === 0 && c.actual > 0 && <span className="chip chip-good" style={{ fontSize: 9, padding: '1px 6px' }}>อันดับ 1</span>}
                      </span>
                      <span className="num sm" style={{ fontWeight: 700, flexShrink: 0 }}>{B(c.actual)} <span className="cap" style={{ fontWeight: 500 }}>{P(pct, 0)}</span></span>
                    </div>
                    <div className="bar" style={{ height: 6 }}><span style={{ width: `${Math.min(pct, 100)}%`, background: c.hex }}></span></div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* KPI row — click navigates to relevant page */}
      <div className="grid g4" style={{ marginBottom: 24 }}>
        <Kpi label={'ออร์เดอร์รวม'} value={N(C.ORD)} icon="bag" sub="เดือนนี้" onClick={() => go('sales', 'overview')} />
        <Kpi label={'มูลค่าต่อบิล (AOV)'} value={B(C.AOV)} icon="wallet" sub={'เฉลี่ยต่อบิล'} hint="AOV (Average Order Value) = ยอดขายรวม ÷ จำนวนออร์เดอร์ — มูลค่าเฉลี่ยต่อบิล" onClick={() => go('sales', 'channels')} />
        <Kpi label={'ค่าแอด / ACOS'} value={Bk(C.AD)} icon="zap" delta={P(C.ACOS_TOT,0)} hint="ACOS = ค่าแอด ÷ ยอดขาย ×100 — ยิ่งต่ำยิ่งคุ้ม; เกินเพดานคือแอดแพงเกินไป"
          deltaDir={C.ACOS_TOT > TMK.consts.ACOS_CEIL ? 'up' : 'down'}
          deltaColor={C.ACOS_TOT > TMK.consts.ACOS_CEIL ? 'var(--bad)' : 'var(--good)'}
          sub={`เพดาน ${TMK.consts.ACOS_CEIL}%`} accent="var(--warn)" onClick={() => go('sales', 'ads')} />
        <Kpi label={'ลูกค้าใหม่'} value={N(C.NEW_C)} icon="userPlus" delta={(C.NEW_C + C.OLD_C) > 0 ? `${P((C.NEW_C / (C.NEW_C + C.OLD_C)) * 100, 0)} ของลูกค้า` : ''} sub="รายใหม่เดือนนี้" accent="var(--good)" onClick={() => go('sales', 'customers')} />
      </div>

      {/* focus + activity */}
      <div className="grid" style={{ gridTemplateColumns: '1.3fr 1fr', marginBottom: 24 }}>
        <div className="card">
          <div className="card-head">
            <h3><span style={{color:'var(--accent)'}}><Icon name="listChecks" /></span> {'โฟกัสวันนี้'}</h3>
            <button className="btn btn-sm btn-ghost" onClick={() => go('planner', 'kanban')}>{'ดูทั้งหมด'} <Icon name="arrowR" /></button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {todayTasks.slice(0, 5).map(t => {
              const camp = D.campaigns.find(c => c.id === t.camp);
              const stMap = { todo: { l: 'รอทำ', c: 'var(--ink-3)' }, inprogress: { l: 'กำลังทำ', c: 'var(--info)' }, review: { l: 'รอตรวจ', c: 'var(--warn)' }, done: { l: 'เสร็จ', c: 'var(--good)' } }[t.status] || { l: '—', c: 'var(--ink-3)' };
              return (
                <div key={t.id} className="row" onClick={() => window.__openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] })} style={{ gap: 12, padding: '11px 12px', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', cursor: 'pointer', transition: 'background 0.1s' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: stMap.c, flexShrink: 0 }}></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="sm" style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                    <div className="cap" style={{ marginTop: 1 }}>{camp?.name} {'·'} {t.channel}</div>
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    {(t.responsible || []).slice(0,2).map(r => {
                      const s = D.staff.find(x => x.name === r) || { color: 'var(--ink-3)' };
                      return <Avatar key={r} name={r} color={s.color} size={24} />;
                    })}
                  </div>
                  <span className="cap" style={{ color: stMap.c, fontWeight: 600, width: 52, textAlign: 'right' }}>{stMap.l}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3><span style={{color:'var(--accent)'}}><Icon name="clock" /></span> {'ความเคลื่อนไหวล่าสุด'}</h3>
            <button className="btn btn-sm btn-ghost" onClick={() => go('settings', 'audit')}>{'ทั้งหมด'} <Icon name="arrowR" /></button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {D.audit.slice(0, 5).map((a, i) => {
              const s = D.staff.find(x => x.name === a.user) || { color: 'var(--ink-3)' };
              return (
                <div key={i} className="row" style={{ gap: 11, padding: '9px 4px' }}>
                  <Avatar name={a.user} color={s.color} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="sm" style={{ lineHeight: 1.35 }}><strong>{a.user}</strong> <span className="muted">{a.action}</span></div>
                    <div className="cap" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.summary}</div>
                  </div>
                  <span className="cap" style={{ flexShrink: 0 }}>{a.time}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* channel strip */}
      <Section eyebrow={'ช่องทางการขาย'} title={'ยอดขายรายวันเดือนนี้'} action={<button className="btn btn-sm" onClick={() => go('sales', 'overview')}>{'เปิด'} Sales Dashboard <Icon name="arrowR" /></button>}>
        <div className="card">
          <div className="row between" style={{ marginBottom: 4 }}>
            <div>
              <div className="num h1">{Bk(C.MTD)}</div>
              <div className="cap">{'รวม'} {D.dailyMonth.length} {'วัน'} {'·'} {'เฉลี่ย'} {D.dailyMonth.length ? B(C.MTD / D.dailyMonth.length) : '—'}/{'วัน'}</div>
            </div>
          </div>
          <MiniArea data={dailyVals} labels={dailyVals.map((_, i) => 'วันที่ ' + (i + 1))} h={110} id="home" metricLabel="ยอดขาย" />
          <div className="grid g3" style={{ marginTop: 16, gap: 10 }}>
            {D.channels.map(ch => (
              <div key={ch.id} className="row" style={{ gap: 9 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: ch.hex, flexShrink: 0 }}></span>
                <span className="sm" style={{ flex: 1, fontWeight: 500 }}>{ch.name}</span>
                <span className="num sm" style={{ fontWeight: 600 }}>{Bk(ch.actual)}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </div>
  );
}

/* ============================================================
   SALES — sub: overview / channels / ads / customers
   ============================================================ */

/* Shared date picker bar */
function SalesDateBar({ month, year, onPrev, onNext }) {
  return (
    <div className="row between" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <button className="btn btn-sm btn-ghost" onClick={onPrev} style={{ padding: '4px 8px' }}>
          <Icon name="chevR" className="flip-h" />
        </button>
        <span className="h3 num">{THAI_MONTHS[month]} {year}</span>
        <button className="btn btn-sm btn-ghost" onClick={onNext} style={{ padding: '4px 8px' }}>
          <Icon name="chevR" />
        </button>
      </div>
    </div>
  );
}

// กราฟแท่งซ้อน (stacked) แบ่งตามวัน — แต่ละแท่ง = 1 วัน, แบ่งสีตามช่องทาง (ยอด/% ต่อช่อง)
function DailyStackedChart({ days, h = 240 }) {
  const [hi, setHi] = useState(null);
  if (!days || days.length === 0) return <div className="cap" style={{ textAlign: 'center', padding: 40, color: 'var(--ink-4)' }}>ยังไม่มีข้อมูลรายวัน</div>;
  const chrono = [...days].sort((a, b) => a.d - b.d); // เก่า → ใหม่ (ซ้าย → ขวา)
  const max = Math.max(...chrono.map(d => d.total), 1);
  const chMap = {}; chrono.forEach(d => d.channels.forEach(c => { chMap[c.id] = { name: c.name, hex: c.hex }; }));
  const legend = Object.entries(chMap).map(([id, v]) => ({ id, ...v }));
  const yTicks = [max, max / 2, 0];
  const n = chrono.length;
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 6 }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 9, color: 'var(--ink-4)', height: h, paddingBottom: 16, lineHeight: 1, whiteSpace: 'nowrap' }}>
          {yTicks.map((v, i) => <span key={i}>{Bc(v)}</span>)}
        </div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: Math.max(2, Math.min(6, Math.round(120 / n))), height: h, paddingBottom: 16 }}>
          {yTicks.map((v, i) => <div key={'g' + i} style={{ position: 'absolute', left: 0, right: 0, bottom: `calc(16px + ${(v / max) * (h - 16)}px)`, borderTop: '1px dashed var(--line)', opacity: 0.4 }} />)}
          {chrono.map((day, di) => (
            <div key={day.d} onMouseEnter={() => setHi(di)} onMouseLeave={() => setHi(null)} style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', position: 'relative', cursor: 'default' }}>
              <div style={{ display: 'flex', flexDirection: 'column', height: `${(day.total / max) * 100}%`, width: '100%', maxWidth: 30, margin: '0 auto', borderRadius: '4px 4px 0 0', overflow: 'hidden', opacity: hi == null || hi === di ? 1 : 0.45, transition: 'opacity .12s' }}>
                {day.channels.map(c => <div key={c.id} style={{ height: `${day.total > 0 ? (c.rev / day.total) * 100 : 0}%`, background: c.hex }} />)}
              </div>
              <div className="cap" style={{ position: 'absolute', bottom: -15, left: 0, right: 0, textAlign: 'center', fontSize: 9, color: 'var(--ink-4)' }}>{day.d}</div>
              {hi === di && (
                <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: `translateX(${di > n / 2 ? '-90%' : '-10%'})`, marginBottom: 4, background: 'var(--ink)', color: 'var(--paper)', padding: '7px 10px', borderRadius: 8, fontSize: 11, whiteSpace: 'nowrap', zIndex: 10, textAlign: 'left', boxShadow: '0 6px 20px rgba(0,0,0,.25)', pointerEvents: 'none', lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 700, marginBottom: 3 }}>{day.label} · {B(day.total)}</div>
                  {day.channels.map(c => <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: c.hex, flexShrink: 0 }} />{c.name} {B(c.rev)} <span style={{ opacity: 0.7 }}>({P(c.pct, 0)})</span></div>)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 12 }}>
        {legend.map(c => <span key={c.id} className="cap" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: c.hex }} />{c.name}</span>)}
      </div>
    </div>
  );
}

export function SalesView({ sub }) {
  const _today = getToday();
  const [month, setMonth] = useState(_today.month - 1); // 0-indexed, เดือนจริง
  const [year, setYear] = useState(_today.yearBE);
  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };
  const prevMonthName = THAI_MONTHS[month === 0 ? 11 : month - 1];
  const dateProps = { month, year, onPrev: prev, onNext: next };
  const { version } = useData() || {};
  // ข้อมูลของ "เดือนที่เลือก" — memo (คำนวณใหม่เมื่อเปลี่ยนเดือน/ปี หรือข้อมูลรีโหลด) กันคำนวณซ้ำทุก render
  const md = useMemo(() => computeMonth(month, year), [month, year, version]);
  const prevMd = useMemo(() => computeMonth(month === 0 ? 11 : month - 1, month === 0 ? year - 1 : year), [month, year, version]);

  if (sub === 'channels') return <SalesChannels dateProps={dateProps} prevMonthName={prevMonthName} md={md} prevMd={prevMd} />;
  if (sub === 'ads') return <SalesAds dateProps={dateProps} prevMonthName={prevMonthName} md={md} />;
  if (sub === 'customers') return <SalesCustomers dateProps={dateProps} prevMonthName={prevMonthName} md={md} />;
  return <SalesOverview dateProps={dateProps} prevMonthName={prevMonthName} md={md} prevMd={prevMd} />;
}

function MomDelta({ current, previous, label }) {
  // Guard: ไม่มีข้อมูลเดือนก่อน → แสดง "—"
  if (!previous || previous === 0 || !isFinite(previous)) {
    return (
      <span className="cap" style={{ color: 'var(--ink-3)', fontWeight: 500 }}>
        — ยังไม่มีข้อมูล{label}
      </span>
    );
  }
  const delta = ((current - previous) / previous) * 100;
  if (!isFinite(delta) || isNaN(delta)) {
    return <span className="cap" style={{ color: 'var(--ink-3)' }}>—</span>;
  }
  const isUp = delta >= 0;
  return (
    <span className="cap" style={{ color: isUp ? 'var(--good)' : 'var(--bad)', fontWeight: 600 }}>
      {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{delta.toFixed(1)}% vs {label}
    </span>
  );
}

function SalesOverview({ dateProps, prevMonthName, md, prevMd }) {
  const C = md.computed, consts = md.consts, channels = md.channels, pnl = md.pnl;
  const prevC = prevMd.computed;
  const st = paceStatus(C.PACE_PCT);
  const pace = useCountUp(C.PACE_PCT);
  const ABBR = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return (
    <div className="content-inner rise">
      <SalesDateBar {...dateProps} />

      <div className="grid" style={{ gridTemplateColumns: '1.6fr 1fr', marginBottom: 16 }}>
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 8 }}>{'ยอดขาย'} MTD {'·'} {'วันที่'} {consts.DAY}/{consts.DAYS}</div>
          <div className="num display">{B(C.MTD)}</div>
          <MomDelta current={C.MTD} previous={prevC.MTD} label={prevMonthName} />
          <div className="bar" style={{ marginTop: 14 }}>
            <span style={{ width: `${consts.TARGET > 0 ? Math.min((C.MTD/consts.TARGET)*100,100) : 0}%`, background: st.c }}></span>
          </div>
          <div className="row between" style={{ marginTop: 8 }}>
            <span className="cap">{'เป้า'} {consts.TARGET ? B(consts.TARGET) : '— ยังไม่ตั้ง'}</span>
            <span className="cap num">{consts.TARGET > 0 ? P((C.MTD/consts.TARGET)*100) : '—'} {'ของเป้า'}</span>
          </div>
          <div className="grid g4" style={{ marginTop: 18, gap: 12 }}>
            {(() => {
              const curAbbr = ABBR[dateProps.month];
              const yEntry = (md.yoy || []).find(e => e.m === curAbbr);
              const yoyPct = yEntry && yEntry.y25 > 0 ? ((yEntry.y26 - yEntry.y25) / yEntry.y25) * 100 : null;
              const yoyStr = yoyPct == null ? '—' : (yoyPct >= 0 ? '+' : '') + P(yoyPct, 0);
              const yoyColor = yoyPct == null ? 'var(--ink-3)' : yoyPct >= 0 ? 'var(--good)' : 'var(--bad)';
              return [['Run rate', C.RUN ? B(C.RUN) : '—', consts.TARGET && C.RUN >= consts.TARGET ? 'var(--good)' : 'var(--warn)'],
              ['ออร์เดอร์', N(C.ORD)], ['AOV', C.ORD ? B(C.AOV) : '—'], [`YoY ${curAbbr}`, yoyStr, yoyColor]];
            })().map((x,i)=>(
              <div key={i}>
                <div className="cap">{x[0]}</div>
                <div className="num h3" style={{ color: x[2] || 'var(--ink)' }}>{x[1]}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Ring pct={pace} size={120} stroke={11} color={st.c}>
            <div><div className="num h1" style={{ color: st.c }}>{P(pace,0)}</div><div className="cap">จังหวะทำยอด (Pace)</div></div>
          </Ring>
          <div>
            <span className={`chip ${st.cls}`} style={{ marginBottom: 10 }}>{st.label}</span>
            <div className="cap" style={{ marginTop: 10 }}>MTD / {'เป้า'} pace</div>
            <div className="num sm" style={{ fontWeight: 600 }}>{B(C.MTD)} / {C.PACE_TGT ? B(C.PACE_TGT) : '—'}</div>
            <div className="cap" style={{ marginTop: 8 }}>{'ต้องเฉลี่ย/วัน'}</div>
            <div className="num sm" style={{ fontWeight: 600 }}>{(consts.TARGET > 0 && consts.DAYS - consts.DAY > 0) ? B(Math.max(0, Math.ceil((consts.TARGET-C.MTD)/(consts.DAYS-consts.DAY)))) : '—'}</div>
          </div>
        </div>
      </div>

      {/* KPI with MoM */}
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="card card-pad-sm">
          <div className="cap" style={{ marginBottom: 4 }}>{'รายได้'}</div>
          <div className="num h1">{Bk(C.MTD)}</div>
          <MomDelta current={C.MTD} previous={prevC.MTD} label={prevMonthName} />
        </div>
        <div className="card card-pad-sm">
          <div className="cap" style={{ marginBottom: 4 }}>{'ออร์เดอร์'}</div>
          <div className="num h1">{N(C.ORD)}</div>
          <MomDelta current={C.ORD} previous={prevC.ORD} label={prevMonthName} />
        </div>
        <div className="card card-pad-sm">
          <div className="cap" style={{ marginBottom: 4 }}>เฉลี่ย/ออเดอร์ (AOV)</div>
          <div className="num h1">{C.ORD ? B(C.AOV) : '—'}</div>
          <MomDelta current={C.AOV} previous={prevC.AOV} label={prevMonthName} />
        </div>
        <div className="card card-pad-sm">
          <div className="cap" style={{ marginBottom: 4 }}>{'ค่าแอด'}</div>
          <div className="num h1">{Bk(C.AD)}</div>
          <MomDelta current={C.AD} previous={prevC.AD} label={prevMonthName} />
        </div>
      </div>

      {/* ยอดขายรายวัน (เจาะลึกตามช่องทาง) — เต็มแถว เห็นทั้งเดือน */}
      <div className="card" style={{ marginBottom: 16, display: 'flex', flexDirection: 'column' }}>
        <div className="card-head"><h3>{'ยอดขายรายวัน'} <span className="cap" style={{ fontWeight: 400, color: 'var(--ink-4)' }}>(เจาะลึกตามช่องทาง)</span></h3>
          <span className="cap">{md.dailyBreakdown.length} {'วัน'}</span></div>
        <DailyStackedChart days={md.dailyBreakdown} h={300} />
      </div>

      {/* per-platform: เป้า · ผลงาน · คุมแอด */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3>{'เป้า · ผลงาน · คุมงบโฆษณา — รายแพลตฟอร์ม (เดือนนี้)'}</h3>
          <span className="cap">{'เพดาน ACOS'} {consts.ACOS_CEIL}%</span></div>
        <div className="table-wrap"><table className="table">
          <thead><tr>
            <th>{'ช่องทาง'}</th>
            <th style={{ textAlign: 'right' }}>{'เป้าเดือน'}</th>
            <th style={{ textAlign: 'right' }}>{'ยอด MTD'}</th>
            <th style={{ textAlign: 'right' }}>{'% เป้า'}</th>
            <th style={{ textAlign: 'right' }}>{'ค่าแอด'}</th>
            <th style={{ textAlign: 'right' }}>ROAS</th>
            <th style={{ textAlign: 'right' }}>{'% แอด'}</th>
          </tr></thead>
          <tbody>
            {channels.map(ch => {
              const tgtPct = ch.target > 0 ? (ch.actual / ch.target) * 100 : null;
              const roas = ch.ad > 0 ? ch.actual / ch.ad : null;
              const adPct = ch.actual > 0 ? (ch.ad / ch.actual) * 100 : null; // ACOS
              return (
                <tr key={ch.id}>
                  <td><span className="row" style={{ gap: 8, fontWeight: 600 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: ch.hex, flexShrink: 0 }}></span>{ch.name}</span></td>
                  <td className="num" style={{ textAlign: 'right', color: 'var(--ink-2)' }}>{ch.target > 0 ? Bk(ch.target) : '—'}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{Bk(ch.actual)}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 700, color: tgtPct == null ? 'var(--ink-3)' : tgtPct >= 100 ? 'var(--good)' : tgtPct >= 70 ? 'var(--warn)' : 'var(--bad)' }}>{tgtPct == null ? '—' : P(tgtPct, 0)}</td>
                  <td className="num" style={{ textAlign: 'right', color: 'var(--ink-2)' }}>{ch.ad > 0 ? Bk(ch.ad) : '—'}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 700, color: roas == null ? 'var(--ink-3)' : roas >= 3 ? 'var(--good)' : roas >= 2 ? 'var(--warn)' : 'var(--bad)' }}>{roas == null ? '—' : roas.toFixed(1) + 'x'}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 700, color: adPct == null ? 'var(--ink-3)' : adPct <= consts.ACOS_CEIL ? 'var(--good)' : adPct <= 40 ? 'var(--warn)' : 'var(--bad)' }}>{adPct == null ? '—' : P(adPct, 0)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            {(() => {
              const tT = channels.reduce((s, c) => s + (c.target || 0), 0);
              const tA = channels.reduce((s, c) => s + (c.actual || 0), 0);
              const tAd = channels.reduce((s, c) => s + (c.ad || 0), 0);
              const tgtPct = tT > 0 ? (tA / tT) * 100 : null;
              const roas = tAd > 0 ? tA / tAd : null;
              const adPct = tA > 0 ? (tAd / tA) * 100 : null;
              return (
                <tr style={{ borderTop: '2px solid var(--line)' }}>
                  <td style={{ fontWeight: 800 }}>{'รวม'}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 800 }}>{tT > 0 ? Bk(tT) : '—'}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 800 }}>{Bk(tA)}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 800 }}>{tgtPct == null ? '—' : P(tgtPct, 0)}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 800 }}>{tAd > 0 ? Bk(tAd) : '—'}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 800 }}>{roas == null ? '—' : roas.toFixed(1) + 'x'}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 800 }}>{adPct == null ? '—' : P(adPct, 0)}</td>
                </tr>
              );
            })()}
          </tfoot>
        </table></div>
      </div>

      {/* charts */}
      <div className="grid g2">
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 12 }}>3 {'เดือนล่าสุด'}</div>
          <Bars data={md.month3} h={170} valueKey="actual" />
          <div className="cap" style={{ marginTop: 8 }}>{ABBR[dateProps.month]} {'รวมคาดการณ์'} ({'โปร่ง'})</div>
        </div>
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 12 }}>{'เทียบปีก่อน'} (YoY)</div>
          <YoYChart data={md.yoy} year={dateProps.year} />
        </div>
      </div>

      {/* P&L — กำไร-ขาดทุน เดือนนี้ (ล่างสุด) */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3>{'กำไร-ขาดทุน (P&L) — เดือนนี้'} <InfoTip text="กำไรสุทธิ = ยอดขาย − ต้นทุนสินค้า − ค่าแอด − ค่าธรรมเนียมแพลตฟอร์ม − ค่าใช้จ่ายอื่น · ตั้งต้นทุน% และค่าใช้จ่ายอื่นได้ที่หน้า 'ตั้งเป้ารายเดือน'" label="P&L" /></h3>
          <span className={`chip ${pnl.netProfit >= 0 ? 'chip-good' : 'chip-bad'}`}>{pnl.netProfit >= 0 ? 'กำไร' : 'ขาดทุน'} {P(pnl.netMargin, 1)}</span></div>
        {pnl.cogsPct === 0 && (
          <div className="cap" style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: '8px 10px', marginBottom: 12, color: 'var(--ink-3)' }}>
            💡 ยังไม่ได้ตั้ง <b>"ต้นทุนสินค้า %"</b> — กำไรสุทธิยังไม่หักต้นทุนสินค้า ตั้งที่หน้า <b>"ตั้งเป้ารายเดือน"</b> เพื่อให้กำไรแม่นยำ
          </div>
        )}
        <div style={{ display: 'grid', gap: 5 }}>
          {[
            ['ยอดขาย', pnl.revenue, false],
            [`− ต้นทุนสินค้า${pnl.cogsPct ? ` (${pnl.cogsPct}%)` : ''}`, -pnl.cogs, false],
            ['= กำไรขั้นต้น', pnl.grossProfit, true],
            ['− ค่าแอด', -pnl.ad, false],
            ['− ค่าธรรมเนียมแพลตฟอร์ม', -pnl.platformFees, false],
            ['− ค่าใช้จ่ายอื่น', -pnl.otherExpense, false],
          ].map(([label, val, sub], i) => (
            <div key={i} className="row between" style={{ padding: sub ? '6px 0' : '3px 0', borderTop: sub ? '1px solid var(--line)' : 'none' }}>
              <span className={sub ? '' : 'cap'} style={{ fontWeight: sub ? 700 : 400, color: sub ? 'var(--ink)' : 'var(--ink-3)' }}>{label}</span>
              <span className="num sm" style={{ fontWeight: sub ? 700 : 600, color: val < 0 ? 'var(--bad)' : 'var(--ink-2)' }}>{val < 0 ? '−' : ''}{B(Math.abs(val))}</span>
            </div>
          ))}
          <div className="row between" style={{ padding: '9px 0 0', borderTop: '2px solid var(--line)', marginTop: 3 }}>
            <span style={{ fontWeight: 800 }}>กำไรสุทธิ</span>
            <span className="num h3" style={{ fontWeight: 800, color: pnl.netProfit >= 0 ? 'var(--good)' : 'var(--bad)' }}>{B(pnl.netProfit)} <span className="cap" style={{ fontWeight: 600, color: 'var(--ink-3)' }}>({P(pnl.netMargin, 1)})</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}

function YoYChart({ data: dataProp, year }) {
  const [hi, setHi] = useState(null);
  const data = dataProp || D.yoy;
  const cy = year || (new Date().getFullYear() + 543), py = cy - 1; // ปี พ.ศ. ตามที่เลือก (ไม่ฮาร์ดโค้ด)
  const w = 320, h = 150;
  // กันบั๊ก: ต้องมีอย่างน้อย 2 จุดถึงจะวาดเส้นได้ (ไม่งั้นหารด้วย 0 → NaN)
  if (!data || data.length < 2) {
    return (
      <div style={{ height: 150, display: 'grid', placeItems: 'center', color: 'var(--ink-4)' }} className="cap">
        ยังไม่มีข้อมูลเปรียบเทียบรายปี
      </div>
    );
  }
  const all = data.flatMap(d => [d.y25, d.y26]);
  const max = Math.max(...all), min = Math.min(...all) * 0.9;
  const range = (max - min) || 1; // กันหารศูนย์เมื่อค่าเท่ากันหมด
  const X = (i) => (i / (data.length - 1)) * w;
  const Y = (v) => h - 20 - ((v - min) / range) * (h - 30);
  const lineP = (key) => data.map((d, i) => [X(i), Y(d[key])]);
  const path = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const onMove = (e) => { const r = e.currentTarget.getBoundingClientRect(); const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); setHi(Math.round(ratio * (data.length - 1))); };
  const yTicks = [max, (max + min) / 2, min];
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 6, fontFamily: 'var(--font)' }}>
        {/* แกน Y (เงิน) */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', color: 'var(--ink-4)', fontSize: 9, height: 150, paddingBottom: 18, lineHeight: 1, whiteSpace: 'nowrap' }}>
          {yTicks.map((v, i) => <span key={i}>{Bc(v)}</span>)}
        </div>
        <div style={{ position: 'relative' }} onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
          <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: 150, display: 'block' }}>
            <path d={path(lineP('y25'))} fill="none" stroke="var(--ink-4)" strokeWidth="2" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            <path d={path(lineP('y26'))} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {data.map((d, i) => <text key={i} x={X(i)} y={h - 2} fontSize="9" fill="var(--ink-3)" textAnchor="middle">{d.m}</text>)}
            {hi != null && data[hi] && <line x1={X(hi)} y1="0" x2={X(hi)} y2={h - 14} stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" vectorEffect="non-scaling-stroke" />}
          </svg>
          {/* จุด (วาดด้วย HTML กันยืดเป็นวงรีจาก preserveAspectRatio=none) */}
          {[['y25', 'var(--ink-4)', 5], ['y26', 'var(--accent)', 6]].map(([k, col, sz]) => data.map((d, i) => (
            <span key={k + i} style={{ position: 'absolute', left: `${(i / (data.length - 1)) * 100}%`, top: `${(Y(d[k]) / h) * 100}%`, width: sz, height: sz, marginLeft: -sz / 2, marginTop: -sz / 2, borderRadius: '50%', background: col, pointerEvents: 'none' }} />
          )))}
          {hi != null && data[hi] && (
            <div style={{ position: 'absolute', left: `${(hi / Math.max(data.length - 1, 1)) * 100}%`, top: 0, transform: `translateX(${hi > data.length / 2 ? '-100%' : '0'})`, background: 'var(--ink)', color: 'var(--paper)', padding: '7px 11px', borderRadius: 8, fontSize: 12, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 5, textAlign: 'left', lineHeight: 1.45, boxShadow: '0 6px 20px rgba(0,0,0,.25)' }}>
              <div style={{ opacity: 0.75, fontWeight: 600, fontSize: 11 }}>{data[hi].m}</div>
              <div style={{ fontWeight: 700 }}>{cy} : {B(data[hi].y26)}</div>
              <div style={{ opacity: 0.55, fontWeight: 600 }}>{py} : {B(data[hi].y25)}</div>
            </div>
          )}
        </div>
      </div>
      <div className="row" style={{ gap: 14, marginTop: 6 }}>
        <span className="cap"><span style={{ display: 'inline-block', width: 14, height: 2, background: 'var(--accent)', verticalAlign: 'middle', marginRight: 5 }}></span>{cy}</span>
        <span className="cap"><span style={{ display: 'inline-block', width: 14, height: 2, background: 'var(--ink-4)', verticalAlign: 'middle', marginRight: 5 }}></span>{py}</span>
      </div>
    </div>
  );
}

function SalesChannels({ dateProps, prevMonthName, md, prevMd }) {
  const consts = md.consts, channels = md.channels;
  const bigIds = ['facebook', 'line'];
  const big = channels.filter(c => bigIds.includes(c.id));
  const rest = channels.filter(c => !bigIds.includes(c.id));
  return (
    <div className="content-inner rise">
      <SalesDateBar {...dateProps} />
      {big.length > 0 && (
        <div className="grid g2" style={{ marginBottom: 16, alignItems: 'start' }}>
          {big.map(ch => <SocialChannelCard key={ch.id} ch={ch} md={md} consts={consts} prevMd={prevMd} />)}
        </div>
      )}
      <div className="grid g3">
        {rest.map(ch => <ChannelCard key={ch.id} ch={ch} md={md} consts={consts} prevMd={prevMd} />)}
      </div>
    </div>
  );
}

// การ์ดใหญ่ FB/LINE — เน้น "แชท → ปิดการขาย" (คนทัก → ปิดออเดอร์ → %ปิด) + ต้นทุน/มูลค่าต่อทัก
function SocialChannelCard({ ch, md, consts }) {
  const inq = ch.inq || 0, orders = ch.orders || 0;
  const conv = inq > 0 ? (orders / inq) * 100 : null;        // % ปิด = ปิดออเดอร์ ÷ คนทัก
  const roas = ch.ad > 0 ? ch.actual / ch.ad : null;
  const acos = (ch.ad > 0 && ch.actual > 0) ? (ch.ad / ch.actual) * 100 : null;
  const costPerInq = (ch.ad > 0 && inq > 0) ? ch.ad / inq : null;      // ต้นทุน/คนทัก
  const costPerOrd = (ch.ad > 0 && orders > 0) ? ch.ad / orders : null; // ต้นทุน/ออเดอร์
  const valPerInq = inq > 0 ? ch.actual / inq : null;                 // มูลค่า/คนทัก (ทัก 1 คน = ยอดเท่าไร)
  const reply = md.fb.avgReplyMinutes || 0;                           // เวลาตอบเฉลี่ย (รวมทั้งร้าน/วัน)
  const tgtPct = ch.target > 0 ? Math.min((ch.actual / ch.target) * 100, 100) : null;
  return (
    <div className="card" style={{ borderTop: `3px solid ${ch.hex}` }}>
      <div className="card-head"><h3><span style={{ width: 11, height: 11, borderRadius: 3, background: ch.hex, display: 'inline-block', marginRight: 7, verticalAlign: 'middle' }} />{ch.name} <span className="cap" style={{ fontWeight: 400, color: 'var(--ink-4)' }}>(แชท → ปิดการขาย)</span></h3>
        <span className="num h3" style={{ fontWeight: 800 }}>{B(ch.actual)}</span></div>
      {/* funnel: คนทัก → ปิดออเดอร์ → %ปิด */}
      <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ flex: 1, textAlign: 'center' }}><div className="num h1">{N(inq)}</div><div className="cap">คนทัก</div></div>
        <span style={{ width: 16, height: 16, display: 'inline-block', color: 'var(--ink-3)', flexShrink: 0 }}><Icon name="arrowR" /></span>
        <div style={{ flex: 1, textAlign: 'center' }}><div className="num h1" style={{ color: 'var(--good)' }}>{N(orders)}</div><div className="cap">ปิดออเดอร์</div></div>
        <div style={{ flex: 1, textAlign: 'center', borderLeft: '1px solid var(--line)' }}><div className="num h1" style={{ color: conv == null ? 'var(--ink-3)' : conv >= 20 ? 'var(--good)' : 'var(--warn)' }}>{conv == null ? '—' : P(conv, 0)}</div><div className="cap">% ปิด <InfoTip text="อัตราปิดการขาย = ปิดออเดอร์ ÷ คนทัก × 100" label="% ปิด" align="right" /></div></div>
      </div>
      <div className="grid g3" style={{ gap: 10, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
        <div><div className="cap">เวลาตอบเฉลี่ย</div><div className="num sm" style={{ fontWeight: 700, color: 'var(--info)' }}>{reply > 0 ? <>{reply} <span className="cap">นาที</span></> : '—'}</div></div>
        <div><div className="cap">ต้นทุน/คนทัก</div><div className="num sm" style={{ fontWeight: 700 }}>{costPerInq != null ? B(costPerInq) : '—'}</div></div>
        <div><div className="cap">ต้นทุน/ออเดอร์</div><div className="num sm" style={{ fontWeight: 700 }}>{costPerOrd != null ? B(costPerOrd) : '—'}</div></div>
        <div><div className="cap">มูลค่า/คนทัก <InfoTip text="ทัก 1 คน สร้างยอดขายเฉลี่ยเท่าไร = ยอดขาย ÷ คนทัก" label="มูลค่า/คนทัก" /></div><div className="num sm" style={{ fontWeight: 700, color: 'var(--good)' }}>{valPerInq != null ? B(valPerInq) : '—'}</div></div>
        <div><div className="cap">ลูกค้าใหม่/เก่า</div><div className="num sm" style={{ fontWeight: 700 }}>{N(ch.newCust)}<span style={{ color: 'var(--ink-4)' }}> / {N(ch.oldCust)}</span></div></div>
        <div><div className="cap">ค่าแอด</div><div className="num sm" style={{ fontWeight: 700 }}>{ch.ad > 0 ? B(ch.ad) : '—'}</div></div>
      </div>
      {ch.hasAd && (
        <div className="grid g3" style={{ gap: 10, marginTop: 10, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <div><div className="cap">ยอดขาย</div><div className="num sm" style={{ fontWeight: 700 }}>{B(ch.actual)}</div></div>
          <div><div className="cap">โฆษณาคืนกี่เท่า <InfoTip text="ROAS = ยอดขาย ÷ ค่าแอด (ยิ่งสูงยิ่งดี, ≥3 ดีมาก)" label="ROAS" align="right" /> (ROAS)</div><div className="num sm" style={{ fontWeight: 700, color: roas == null ? 'var(--ink-3)' : roas >= 3 ? 'var(--good)' : roas >= 2 ? 'var(--warn)' : 'var(--bad)' }}>{roas != null ? roas.toFixed(1) + 'x' : '—'}</div></div>
          <div><div className="cap">ค่าแอด%ยอด <InfoTip text="ACOS = ค่าแอด ÷ ยอดขาย × 100 (ยิ่งต่ำยิ่งคุ้ม)" label="ACOS" align="right" /> (ACOS)</div><div className="num sm" style={{ fontWeight: 700, color: acos == null ? 'var(--ink-3)' : acos <= consts.ACOS_CEIL ? 'var(--good)' : acos <= 40 ? 'var(--warn)' : 'var(--bad)' }}>{acos != null ? P(acos, 0) : '—'}</div></div>
        </div>
      )}
      {ch.target > 0 && (
        <div className="row between" style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
          <span className="cap">เป้า <span className="num" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>{B(ch.target)}</span></span>
          <span className="cap">{ch.actual >= ch.target ? '✓ ถึงเป้าแล้ว' : <>ขาดอีก <span className="num" style={{ fontWeight: 700 }}>{B(ch.target - ch.actual)}</span> ({P(tgtPct, 0)})</>}</span>
        </div>
      )}
    </div>
  );
}

// การ์ดช่องทางทั่วไป (เดิม)
function ChannelCard({ ch, md, consts, prevMd }) {
  const roas = ch.ad > 0 ? ch.actual / ch.ad : null;
  const acos = (ch.ad > 0 && ch.actual > 0) ? (ch.ad / ch.actual) * 100 : null;
  const cogsPct = consts.cogsPct || 0;
  const profit = ch.actual - (ch.actual * cogsPct / 100) - ch.ad - (ch.actual * ((ch.platformFeePct || 0) / 100));
  const margin = ch.actual > 0 ? (profit / ch.actual) * 100 : 0;
  const _prevCh = (prevMd?.channels || []).find(c => c.id === ch.id);
  const growth = (_prevCh && _prevCh.actual > 0) ? Math.round(((ch.actual - _prevCh.actual) / _prevCh.actual) * 100) : null;
  const tgtPct = ch.target > 0 ? (ch.actual / ch.target) * 100 : null;
  return (
    <div className="card" style={{ borderTop: `3px solid ${ch.hex}` }}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <span className="row" style={{ gap: 8, fontWeight: 700 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: ch.hex }}></span>{ch.name}</span>
        {growth != null ? <span className="cap" style={{ color: growth >= 0 ? 'var(--good)' : 'var(--bad)', fontWeight: 600 }}>{growth >= 0 ? '▲ +' : '▼ '}{growth}%</span> : null}
      </div>
      <div className="num h1">{B(ch.actual)}</div>
      <div className="cap" style={{ margin: '4px 0 14px', color: 'var(--ink-3)' }}>
        {tgtPct != null ? <>ขายได้ <b className="num" style={{ color: tgtPct >= 100 ? 'var(--good)' : 'var(--ink-2)' }}>{P(tgtPct, 0)}</b> ของเป้า {B(ch.target)}</> : 'ยังไม่ตั้งเป้า'}
      </div>
      <div className="grid g2" style={{ gap: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
        <div><div className="cap">{'ออร์เดอร์'}</div><div className="num h3">{N(ch.orders)}</div></div>
        <div><div className="cap">เฉลี่ย/ออเดอร์</div><div className="num h3">{ch.orders > 0 ? B(ch.actual / ch.orders) : '—'}</div></div>
        {ch.hasAd && <div><div className="cap">โฆษณาคืนกี่เท่า (ROAS)</div><div className="num h3" style={{ color: roas == null ? 'var(--ink-3)' : roas >= 3 ? 'var(--good)' : roas >= 2 ? 'var(--warn)' : 'var(--bad)' }}>{roas != null ? roas.toFixed(1) + 'x' : '—'}</div></div>}
        {ch.hasAd && <div><div className="cap">ค่าแอด%ยอด (ACOS)</div><div className="num h3" style={{ color: acos == null ? 'var(--ink-3)' : acos <= consts.ACOS_CEIL ? 'var(--good)' : acos <= 40 ? 'var(--warn)' : 'var(--bad)' }}>{acos != null ? P(acos, 0) : '—'}</div></div>}
      </div>
      <div className="row between" style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
        <span className="cap">กำไร{cogsPct === 0 ? ' (ยังไม่หักทุน)' : ''} <InfoTip text={`กำไร = ยอดขาย − ต้นทุนสินค้า${cogsPct > 0 ? ` (${cogsPct}%)` : ' (ยังไม่ตั้ง)'} − ค่าแอด − ค่าธรรมเนียม${ch.platformFeePct > 0 ? ` (${ch.platformFeePct}%)` : ''}`} label="กำไร" /></span>
        <span className="num" style={{ fontWeight: 800, color: profit >= 0 ? 'var(--good)' : 'var(--bad)' }}>{B(profit)} <span className="cap" style={{ fontWeight: 600, color: 'var(--ink-4)' }}>({P(margin, 0)})</span></span>
      </div>
    </div>
  );
}

function SalesAds({ dateProps, prevMonthName, md }) {
  const fb = md.fb;
  const consts = md.consts, channels = md.channels;
  const totalBudget = consts.AD_BUDGET || 0;
  const totalSpent = channels.filter(c => c.hasAd).reduce((s, c) => s + c.ad, 0);
  const remaining = totalBudget - totalSpent;
  const burnRate = consts.DAY > 0 ? totalSpent / consts.DAY : 0;
  const daysLeft = consts.DAYS - consts.DAY;
  const projectedSpend = totalSpent + (burnRate * daysLeft);
  const spentPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  const timePct = consts.DAYS > 0 ? (consts.DAY / consts.DAYS) * 100 : 0;
  const perDayLeft = (totalBudget > 0 && daysLeft > 0 && remaining > 0) ? remaining / daysLeft : 0;
  const overBudget = totalBudget > 0 && totalSpent > totalBudget;
  const projOver = totalBudget > 0 && !overBudget && projectedSpend > totalBudget;
  const fastPace = totalBudget > 0 && !overBudget && !projOver && spentPct > timePct + 5; // ใช้งบเร็วกว่าเวลา
  const barColor = spentPct > 100 ? 'var(--bad)' : spentPct > 80 ? 'var(--warn)' : 'var(--good)';
  const alertColor = (overBudget || projOver) ? 'var(--bad)' : fastPace ? 'var(--warn)' : 'var(--good)';

  return (
    <div className="content-inner rise">
      <SalesDateBar {...dateProps} />

      {/* Budget planner */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3><span style={{ color: 'var(--accent)' }}><Icon name="wallet" /></span> {'งบโฆษณา'}</h3>
          {totalBudget > 0 && <span className="cap" style={{ color: barColor, fontWeight: 700 }}>ใช้ไป {P(spentPct, 0)} ของงบ</span>}</div>
        <div className="grid g4" style={{ marginBottom: 12 }}>
          <div>
            <div className="cap">{'งบทั้งหมด'}</div>
            <div className="num h1">{totalBudget > 0 ? Bk(totalBudget) : '— ยังไม่ตั้งงบ'}</div>
            {totalBudget <= 0 && <span className="cap" style={{ color: 'var(--ink-4)' }}>ตั้งงบต่อช่องที่หน้า "ตั้งเป้ารายเดือน"</span>}
          </div>
          <div>
            <div className="cap">{'ใช้ไปแล้ว'}</div>
            <div className="num h1" style={{ color: 'var(--warn)' }}>{Bk(totalSpent)}</div>
            {totalBudget > 0 && <span className="cap" style={{ color: barColor, fontWeight: 600 }}>{P(spentPct, 0)} ของงบ</span>}
          </div>
          <div>
            <div className="cap">{'คงเหลือ'}</div>
            <div className="num h1" style={{ color: totalBudget <= 0 ? 'var(--ink-3)' : remaining > 0 ? 'var(--good)' : 'var(--bad)' }}>{totalBudget > 0 ? Bk(remaining) : '—'}</div>
            {totalBudget > 0 && perDayLeft > 0 && <span className="cap">{'ใช้ได้อีก'} {Bk(perDayLeft)}/{'วัน'} ({daysLeft} {'วัน'})</span>}
          </div>
          <div>
            <div className="cap">ใช้แอดเฉลี่ย/{'วัน'} (Burn rate) <InfoTip text="ใช้แอดเฉลี่ย/วัน (Burn rate) = ค่าแอดเฉลี่ยที่ใช้ต่อวันในเดือนนี้ (ค่าแอดรวม ÷ วันที่ผ่านไป)" label="ใช้แอดเฉลี่ย/วัน" /></div>
            <div className="num h1">{Bk(burnRate)}</div>
            <span className="cap" style={{ color: projOver ? 'var(--bad)' : 'var(--good)' }}>
              {'คาดใช้ทั้งเดือน'} {Bk(projectedSpend)}
            </span>
          </div>
        </div>
        <div className="bar"><span style={{ width: `${totalBudget > 0 ? Math.min(spentPct, 100) : 0}%`, background: barColor }}></span></div>
        <div className="row between" style={{ marginTop: 6 }}>
          <span className="cap">{totalBudget > 0 ? P(spentPct, 0) : '—'} {'ของงบ'}</span>
          <span className="cap">{consts.DAYS > 0 ? P(timePct, 0) : '—'} {'ของเวลา'}</span>
        </div>
        {totalBudget > 0 && (
          <div className="cap" style={{ marginTop: 10, padding: '8px 11px', borderRadius: 'var(--r-sm)', fontWeight: 600, background: 'var(--surface-2)', borderLeft: `3px solid ${alertColor}`, color: alertColor }}>
            {overBudget ? `🔴 ใช้เกินงบแล้ว ${Bk(totalSpent - totalBudget)} (เกินมา ${P(spentPct - 100, 0)})`
              : projOver ? `🟠 คาดว่าจะเกินงบ ${Bk(projectedSpend - totalBudget)} ภายในสิ้นเดือน — ควรชะลอการใช้`
              : fastPace ? `🟠 ใช้งบเร็วกว่าแผน — ใช้ไป ${P(spentPct, 0)} แต่เวลาผ่านแค่ ${P(timePct, 0)}`
              : `🟢 คุมงบดี — ใช้ไป ${P(spentPct, 0)} ตามจังหวะเวลา ${P(timePct, 0)}`}
          </div>
        )}
      </div>

      {/* Ad performance table */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3><span style={{color:'var(--accent)'}}><Icon name="zap" /></span> {'ประสิทธิภาพโฆษณา'}</h3></div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>{'ช่องทาง'}</th><th style={{textAlign:'right'}}>{'รายได้'}</th><th style={{textAlign:'right'}}>{'ค่าแอด'}</th><th style={{textAlign:'right'}}>{'งบ'}</th><th style={{textAlign:'right'}}>{'ใช้/งบ'}</th><th style={{textAlign:'right'}}>ROAS</th><th style={{textAlign:'right'}}>ACOS</th></tr></thead>
          <tbody>
            {channels.filter(c=>c.hasAd).length === 0 && (
              <tr><td colSpan={7} style={{ textAlign:'center', padding:18, color:'var(--ink-4)' }} className="cap">ยังไม่มีช่องทางที่เปิดโฆษณา</td></tr>
            )}
            {channels.filter(c=>c.hasAd).map(c => {
              const r = c.ad > 0 ? c.actual/c.ad : null;
              const a = c.actual > 0 ? (c.ad/c.actual)*100 : null;
              const bud = c.adBudget || 0;
              const usePct = bud > 0 ? (c.ad/bud)*100 : null;
              return (
                <tr key={c.id}>
                  <td><span className="row" style={{gap:8, fontWeight:600}}><span style={{width:9,height:9,borderRadius:3,background:c.hex}}></span>{c.name}</span></td>
                  <td className="num" style={{textAlign:'right', fontWeight:600}}>{Bk(c.actual)}</td>
                  <td className="num" style={{textAlign:'right', color:'var(--ink-2)'}}>{Bk(c.ad)}</td>
                  <td className="num" style={{textAlign:'right', color:'var(--ink-3)'}}>{bud > 0 ? Bk(bud) : '—'}</td>
                  <td className="num" style={{textAlign:'right', fontWeight:700, color: usePct==null?'var(--ink-3)':usePct>100?'var(--bad)':usePct>80?'var(--warn)':'var(--good)'}}>{usePct!=null ? P(usePct,0) : '—'}</td>
                  <td className="num" style={{textAlign:'right', fontWeight:700, color: r==null?'var(--ink-3)':r>=3?'var(--good)':r>=2?'var(--warn)':'var(--bad)'}}>{r!=null ? r.toFixed(1)+'x' : '—'}</td>
                  <td className="num" style={{textAlign:'right', fontWeight:700, color: a==null?'var(--ink-3)':a<=consts.ACOS_CEIL?'var(--good)':a<=40?'var(--warn)':'var(--bad)'}}>{a!=null ? P(a,0) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>

      {/* Ad campaigns table */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3><Icon name="megaphone" /> {'แคมเปญแอด'}</h3>
          <span className="cap">{'จัดการที่หน้า'} {'รายเดือน'}</span>
        </div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>{'ชื่อแคมเปญ'}</th><th>{'แพลตฟอร์ม'}</th><th style={{textAlign:'right'}}>{'งบ'}</th><th style={{textAlign:'right'}}>{'ใช้ไป'}</th><th style={{textAlign:'right'}}>ROAS</th><th>{'สถานะ'}</th></tr></thead>
          <tbody>
            {getAdCampaigns().filter(c => adCampaignInMonth(c, dateProps.month, dateProps.year)).length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: 'var(--ink-4)' }} className="cap">ยังไม่มีแคมเปญแอดในเดือนนี้ — สร้างที่หน้า "ภาพรวมรายเดือน"</td></tr>
            )}
            {getAdCampaigns().filter(c => adCampaignInMonth(c, dateProps.month, dateProps.year)).map((c, i) => {
              const stMap = { live: { l: 'กำลังรัน', cls: 'chip-good' }, paused: { l: 'หยุดชั่วคราว', cls: 'chip-warn' }, upcoming: { l: 'รอเริ่ม', cls: 'chip-warn' }, done: { l: 'เสร็จสิ้น', cls: '' }, cancelled: { l: 'ยกเลิก', cls: 'chip-bad' } };
              const s = stMap[c.status] || stMap.done;
              return (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td><span className="cap">{c.platform}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}>{Bk(c.budget)}</td>
                  <td className="num" style={{ textAlign: 'right', color: 'var(--ink-2)' }}>{Bk(c.spent)}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 700, color: c.roas >= 3 ? 'var(--good)' : c.roas >= 2 ? 'var(--warn)' : 'var(--bad)' }}>{Number(c.roas || 0).toFixed(1)}x</td>
                  <td><span className={`chip ${s.cls}`}>{s.l}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>

      {/* Facebook deep dive */}
      <div className="card" style={{ borderTop: '3px solid var(--ch-facebook)' }}>
        <div className="card-head"><h3><span style={{ width: 20, height: 20, display: 'inline-block', verticalAlign: 'middle', color: 'var(--ch-facebook)' }}><Icon name="message" /></span> {'เจาะลึก'} Facebook & {'แชท'}</h3></div>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr auto', marginBottom: 16, gap: 12 }}>
          {[['รายได้', B(fb.revenue)],['ค่าแอด', B(fb.spend)],['ROAS', fb.spend>0 ? fb.roas.toFixed(2)+'x' : '—', fb.spend>0 ? (fb.roas>=2?'var(--good)':'var(--bad)') : 'var(--ink-3)'],['ACOS', fb.spend>0 ? P(fb.acos) : '—', fb.spend>0 ? (fb.acos<=consts.ACOS_CEIL?'var(--good)':'var(--bad)') : 'var(--ink-3)']].map((x,i)=>(
            <div key={i}><div className="cap">{x[0]}</div><div className="num h1" style={{ color: x[2]||'var(--ink)' }}>{x[1]}</div></div>
          ))}
          <div>
            <div className="cap">{'เวลาตอบแชทเฉลี่ย'}</div>
            <div className="num h1" style={{ color: 'var(--info)' }}>{fb.avgReplyMinutes ? <>{fb.avgReplyMinutes} <span className="cap">{'นาที'}</span></> : '—'}</div>
          </div>
        </div>
        <div className="grid g3" style={{ gap: 12 }}>
          <div className="card card-pad-sm" style={{ background: 'var(--surface-2)', border: 'none' }}>
            <div className="cap" style={{ marginBottom: 6 }}>{'คนทัก'} {'→'} {'ปิดการขาย'}</div>
            <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
              <span className="num h1">{fb.inquiries}</span><span className="cap">{'คนทัก'}</span>
              <span style={{ width: 16, height: 16, display: 'inline-block', color: 'var(--ink-3)' }}><Icon name="arrowR" /></span>
              <span className="num h1" style={{ color: 'var(--good)' }}>{fb.orders}</span><span className="cap">{'ออร์เดอร์'}</span>
            </div>
            <div className="bar" style={{ marginTop: 8 }}><span style={{ width: `${fb.inquiries > 0 ? Math.min(fb.conv, 100) : 0}%`, background: 'var(--good)' }}></span></div>
            <div className="sm" style={{ color: fb.inquiries > 0 ? 'var(--good)' : 'var(--ink-3)', fontWeight: 700, marginTop: 4 }}>อัตราปิดการขาย (Conversion) {fb.inquiries > 0 ? P(fb.conv) : '— (ยังไม่กรอกคนทัก)'}</div>
          </div>
          <div className="card card-pad-sm" style={{ background: 'var(--surface-2)', border: 'none' }}>
            <div className="cap" style={{ marginBottom: 8 }}>{'ต้นทุน'}</div>
            {[['ต่อคนทัก', fb.cpInq>0 ? B(fb.cpInq) : '—'],['ต่อออร์เดอร์', fb.cpOrd>0 ? B(fb.cpOrd) : '—'],['ต้นทุนหาลูกค้าใหม่ (CAC)', fb.cac>0 ? B(fb.cac) : '—', fb.cac>0 ? 'var(--warn)' : 'var(--ink-3)']].map((x,i)=>(
              <div key={i} className="row between" style={{ marginBottom: 6 }}><span className="cap">{x[0]}</span><span className="num sm" style={{ fontWeight: 700, color: x[2]||'var(--ink)' }}>{x[1]}</span></div>
            ))}
          </div>
          <div className="card card-pad-sm" style={{ background: 'var(--surface-2)', border: 'none' }}>
            <div className="cap" style={{ marginBottom: 8 }}>{'ปริมาณข้อความ'} (6 {'ด.'})</div>
            <MiniArea data={(md.fbMsgTrend||[]).map(d=>d.v)} labels={(md.fbMsgTrend||[]).map(d=>d.m)} fmt={N} axisFmt={N} h={86} color="var(--ch-facebook)" id="fbmsg" metricLabel="ข้อความ" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SalesCustomers({ dateProps, prevMonthName, md }) {
  const C = md.computed;
  // สัดส่วนลูกค้าใหม่คิดจาก "จำนวนคน" (ไม่ได้แยกรายได้ใหม่/เก่า)
  const custTot = C.NEW_C + C.OLD_C;
  const newPct = custTot > 0 ? (C.NEW_C / custTot) * 100 : 0;
  return (
    <div className="content-inner rise">
      <SalesDateBar {...dateProps} />

      {/* Segment cards */}
      <div className="row between" style={{ marginBottom: 12 }}>
        <span className="eyebrow">กลุ่มลูกค้า <span className="cap" style={{ fontWeight: 400, color: 'var(--ink-4)' }}>(รวมทุกเดือน)</span></span>
      </div>
      {getSegments().length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--ink-4)', marginBottom: 16 }}>
          <div className="cap">ยังไม่มีกลุ่มลูกค้า — ตั้งค่าที่หน้า "ภาพรวมรายเดือน" → กลุ่มลูกค้า</div>
        </div>
      )}
      <div className="grid g4" style={{ marginBottom: 16 }}>
        {getSegments().map(seg => (
          <div key={seg.name} className="card card-pad-sm" style={{ borderLeft: `3px solid ${seg.color}` }}>
            <div className="row between" style={{ marginBottom: 6 }}>
              <span className="sm" style={{ fontWeight: 700 }}>{seg.name}</span>
              <span className="chip">{seg.revPct}% {'รายได้'}</span>
            </div>
            <div className="num h1">{seg.count} <span className="cap">{'คน'}</span></div>
            <div className="bar" style={{ marginTop: 8 }}>
              <span style={{ width: `${seg.revPct}%`, background: seg.color }}></span>
            </div>
          </div>
        ))}
      </div>

      {/* CLV + New vs Old overview */}
      <div className="grid g2" style={{ marginBottom: 16 }}>
        <div className="card" style={{ display: 'flex', gap: 22, alignItems: 'center' }}>
          <Ring pct={newPct} size={130} stroke={16} color="var(--good)" track="var(--info)">
            <div><div className="num h2">{N(C.NEW_C + C.OLD_C)}</div><div className="cap">{'ลูกค้า'}</div></div>
          </Ring>
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: 14 }}>
              <div className="row" style={{ gap: 7 }}><span style={{width:9,height:9,borderRadius:'50%',background:'var(--good)'}}></span><span className="cap">{'ลูกค้าใหม่'}</span></div>
              <div className="num h1" style={{ color: 'var(--good)' }}>{N(C.NEW_C)} <span className="cap">{'คน'}</span></div>
              <div className="cap">{custTot > 0 ? P(newPct) : '—'} {'ของลูกค้าทั้งหมด'}</div>
            </div>
            <div>
              <div className="row" style={{ gap: 7 }}><span style={{width:9,height:9,borderRadius:'50%',background:'var(--info)'}}></span><span className="cap">{'ลูกค้าเก่า'}</span></div>
              <div className="num h1" style={{ color: 'var(--info)' }}>{N(C.OLD_C)} <span className="cap">{'คน'}</span></div>
              <div className="cap">{custTot > 0 ? P(100 - newPct) : '—'} {'ของลูกค้าทั้งหมด'}</div>
            </div>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* CLV */}
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>มูลค่าลูกค้าตลอดอายุ (CLV)</div>
            <div className="num display" style={{ color: 'var(--accent)' }}>{C.CLV ? B(C.CLV) : '—'}</div>
            <div className="cap" style={{ marginTop: 4 }}>{'เฉลี่ยต่อลูกค้า'} {'·'} {'รวมทุกเดือน'}</div>
          </div>
          {/* Returning trend */}
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{'สัดส่วนลูกค้าเก่า'} (Returning)</div>
            {(C.NEW_C + C.OLD_C) > 0
              ? <div className="num h1" style={{ color: 'var(--info)' }}>{P((C.OLD_C / (C.NEW_C + C.OLD_C)) * 100, 0)}</div>
              : <div className="num h2" style={{ color: 'var(--ink-4)' }}>—</div>}
            <div className="cap" style={{ marginTop: 4 }}>{'เป้าหมาย: เพิ่ม'} Returning {'≥'} 35%</div>
          </div>
        </div>
      </div>

      {/* Cohort table — ซ่อนจนกว่าจะมี tmk_cohort จริง (กันการ์ดว่างถาวร) */}
      {false && (
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3>{'ตาราง'} Cohort Retention</h3></div>
        <div className="table-wrap"><table className="table">
          <thead>
            <tr>
              <th>{'เดือนเริ่มต้น'}</th>
              <th style={{ textAlign: 'right' }}>{'เดือนที่'} 1</th>
              <th style={{ textAlign: 'right' }}>{'เดือนที่'} 2</th>
              <th style={{ textAlign: 'right' }}>{'เดือนที่'} 3</th>
            </tr>
          </thead>
          <tbody>
            {([]).map((row, i) => (  /* Cohort table — empty until tmk_cohort table is added */
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{row.month}</td>
                <td className="num" style={{ textAlign: 'right' }}>
                  <span className="chip chip-good">{row.m1}%</span>
                </td>
                <td className="num" style={{ textAlign: 'right' }}>
                  {row.m2 !== null
                    ? <span className="chip" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>{row.m2}%</span>
                    : <span className="cap">—</span>}
                </td>
                <td className="num" style={{ textAlign: 'right' }}>
                  {row.m3 !== null
                    ? <span className="chip" style={{ background: 'var(--bad-soft)', color: 'var(--bad)' }}>{row.m3}%</span>
                    : <span className="cap">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      )}

      {/* New vs old by channel */}
      <div className="card">
        <div className="card-head"><h3>{'ลูกค้าใหม่'} vs {'เก่า แยกตามช่องทาง'}</h3></div>
        {md.channels.map(ch => {
          const t = ch.newCust + ch.oldCust, nP = t > 0 ? (ch.newCust/t)*100 : 0;
          return (
            <div key={ch.id} className="row" style={{ gap: 12, padding: '9px 0', borderBottom: '1px solid var(--line-2)' }}>
              <span className="sm" style={{ width: 78, fontWeight: 600, display:'flex', gap:7, alignItems:'center' }}><span style={{width:9,height:9,borderRadius:3,background:ch.hex}}></span>{ch.name}</span>
              <div style={{ flex: 1, height: 13, borderRadius: 6, overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: `${nP}%`, background: 'var(--good)' }}></div>
                <div style={{ width: `${100-nP}%`, background: 'var(--info)' }}></div>
              </div>
              <span className="num cap" style={{ width: 70, textAlign: 'right', color: 'var(--good)', fontWeight: 700 }}>{ch.newCust} {'ใหม่'}</span>
              <span className="num cap" style={{ width: 56, textAlign: 'right', color: 'var(--info)', fontWeight: 700 }}>{ch.oldCust} {'เก่า'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
