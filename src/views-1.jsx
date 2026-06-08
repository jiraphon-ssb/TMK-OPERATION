/* ============================================================
   TMK Operation — Views part 1: Home (cockpit) + Sales
   ============================================================ */
import React, { useState } from 'react';
import { TMK } from './data.js';
import { B, Bk, P, N, Icon, paceStatus, useCountUp, Avatar, Ring, MiniArea, Bars, Section } from './components.jsx';
import { useUser } from './userContext.jsx';
import { getToday, THAI_MONTHS, THAI_MONTHS_FULL, thaiDate, todayISO } from './lib/dateUtils.js';
import { computeMonth, adCampaignInMonth } from './dataContext.jsx';

const THAI_WEEKDAYS = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];

const D = TMK;
const C = TMK.computed;
// ❌ ไม่ destructure constants เพราะ primitive snapshot จะค้างที่ 0
// ✅ ใช้ TMK.consts.X inline เพื่อให้อัปเดตจาก Supabase ทันที

/* ---------- Previous month — from tmk_monthly_history (Supabase) ---------- */
// Computed live from TMK.month3 (which is from monthly_history)
function getPrev() {
  const m3 = TMK.month3 || [];
  // Get 2nd-to-last month (current is last)
  const prev = m3.length >= 2 ? m3[m3.length - 2] : null;
  return {
    revenue: prev?.actual || 0,
    orders: 0,  // not in month3, will use TMK.computed if needed
    aov: 0,
    ad: 0,
  };
}

/* ---------- Ad campaigns from Supabase (TMK.adCampaigns) ---------- */
// Will fall back to empty array if table not seeded
function getAdCampaigns() { return TMK.adCampaigns || []; }

/* ---------- Customer segments from Supabase (TMK.segments) ---------- */
function getSegments() { return TMK.segments || []; }

/* ---------- Channel growth from Supabase (channel.growthPct) ---------- */
function getGrowth(channelId) {
  const ch = (TMK.channels || []).find(c => c.id === channelId);
  return ch?.growthPct || 0;
}

/* small KPI tile — clickable with optional onClick */
export function Kpi({ label, value, delta, deltaDir, deltaColor, icon, sub, accent, onClick }) {
  return (
    <div className="card card-pad-sm" onClick={onClick} style={{ display: 'flex', flexDirection: 'column', gap: 10, cursor: onClick ? 'pointer' : 'default', transition: 'box-shadow 0.15s' }}>
      <div className="row between">
        <span className="metric-label">{label}</span>
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
  const perDayNeeded = Math.ceil((TMK.consts.TARGET - C.MTD) / (TMK.consts.DAYS - TMK.consts.DAY));

  const todayThai = thaiDate(todayISO());
  const todayTasks = D.tasks.filter(t => t.status === 'inprogress' || t.status === 'review' || t.date === todayThai);
  const alerts = [];
  if (C.PACE_PCT < 95) alerts.push({ c: 'var(--warn)', cls: 'chip-warn', icon: 'target', t: `ยอด MTD ${st.label} (${P(C.PACE_PCT)})`, d: `ต้องทำเฉลี่ย ${B(perDayNeeded)}/วัน อีก ${TMK.consts.DAYS-TMK.consts.DAY} วัน` });
  if (C.ACOS_TOT > TMK.consts.ACOS_CEIL) alerts.push({ c: 'var(--bad)', cls: 'chip-bad', icon: 'flame', t: `ACOS รวม ${P(C.ACOS_TOT)} เกินเพดาน`, d: `Facebook ACOS ${P(D.fb.acos)} สูงสุด — ทบทวนงบ` });
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
          <span className="chip chip-good"><span className="dot-c" style={{ background: 'var(--good)' }}></span> {'ซิงค์แล้ว'}</span>
        </div>
      </div>

      {/* hero + alerts */}
      <div className="grid" style={{ gridTemplateColumns: '1.7fr 1fr', marginBottom: 16 }}>
        <div className="card" style={{ display: 'flex', gap: 26, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{'ยอดขายรวมเดือนนี้'} (MTD)</div>
            <div className="num" style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-1px', lineHeight: 1 }}>{B(mtd)}</div>
            <div className="row" style={{ gap: 14, marginTop: 14 }}>
              <div>
                <div className="cap">{'เป้าเดือน'}</div>
                <div className="num h3">{Bk(TMK.consts.TARGET)}</div>
              </div>
              <div className="divider" style={{ width: 1, height: 32, background: 'var(--line)' }}></div>
              <div>
                <div className="cap">{'คาดสิ้นเดือน'} (Run rate)</div>
                <div className="num h3" style={{ color: gap > 0 ? 'var(--warn)' : 'var(--good)' }}>{B(C.RUN)}</div>
              </div>
              <div className="divider" style={{ width: 1, height: 32, background: 'var(--line)' }}></div>
              <div>
                <div className="cap">{'ขาดอีก'}</div>
                <div className="num h3">{B(TMK.consts.TARGET - C.MTD)}</div>
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Ring pct={pace} size={128} stroke={11} color={st.c}>
              <div>
                <div className="num" style={{ fontSize: 26, fontWeight: 700, color: st.c }}>{P(pace, 0)}</div>
                <div className="cap" style={{ marginTop: 2 }}>Pace</div>
              </div>
            </Ring>
            <div style={{ marginTop: 8 }}><span className={`chip ${st.cls}`}>{st.label}</span></div>
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
        <Kpi label={'มูลค่าต่อบิล (AOV)'} value={B(C.AOV)} icon="wallet" sub={'เฉลี่ยต่อบิล'} onClick={() => go('sales', 'channels')} />
        <Kpi label={'ค่าแอด / ACOS'} value={Bk(C.AD)} icon="zap" delta={P(C.ACOS_TOT,0)}
          deltaDir={C.ACOS_TOT > TMK.consts.ACOS_CEIL ? 'up' : 'down'}
          deltaColor={C.ACOS_TOT > TMK.consts.ACOS_CEIL ? 'var(--bad)' : 'var(--good)'}
          sub={`เพดาน ${TMK.consts.ACOS_CEIL}%`} accent="var(--warn)" onClick={() => go('sales', 'ads')} />
        <Kpi label={'ลูกค้าใหม่'} value={N(C.NEW_C)} icon="userPlus" delta={`${P((C.NEW_REV/C.MTD)*100,0)} ของรายได้`} sub="" accent="var(--good)" onClick={() => go('sales', 'customers')} />
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
          <MiniArea data={dailyVals} h={110} id="home" />
          <div className="grid g3" style={{ marginTop: 16, gap: 10 }}>
            {D.channels.slice(0, 6).map(ch => (
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

export function SalesView({ sub }) {
  const _today = getToday();
  const [month, setMonth] = useState(_today.month - 1); // 0-indexed, เดือนจริง
  const [year, setYear] = useState(_today.yearBE);
  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };
  const prevMonthName = THAI_MONTHS[month === 0 ? 11 : month - 1];
  const dateProps = { month, year, onPrev: prev, onNext: next };
  // ข้อมูลของ "เดือนที่เลือก" (อดีต/ปัจจุบัน/อนาคต) — เปลี่ยนเดือนแล้วข้อมูลเปลี่ยนตาม
  const md = computeMonth(month, year);
  // ยอดเดือนก่อน (สำหรับ MoM)
  const prevMd = computeMonth(month === 0 ? 11 : month - 1, month === 0 ? year - 1 : year);

  if (sub === 'channels') return <SalesChannels dateProps={dateProps} prevMonthName={prevMonthName} md={md} />;
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
  const C = md.computed, consts = md.consts, channels = md.channels;
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
              const yEntry = (D.yoy || []).find(e => e.m === curAbbr);
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
            <div><div className="num h1" style={{ color: st.c }}>{P(pace,0)}</div><div className="cap">Pace</div></div>
          </Ring>
          <div>
            <span className={`chip ${st.cls}`} style={{ marginBottom: 10 }}>{st.label}</span>
            <div className="cap" style={{ marginTop: 10 }}>MTD / {'เป้า'} pace</div>
            <div className="num sm" style={{ fontWeight: 600 }}>{B(C.MTD)} / {C.PACE_TGT ? B(C.PACE_TGT) : '—'}</div>
            <div className="cap" style={{ marginTop: 8 }}>{'ต้องเฉลี่ย/วัน'}</div>
            <div className="num sm" style={{ fontWeight: 600 }}>{(consts.TARGET > 0 && consts.DAYS - consts.DAY > 0) ? B(Math.ceil((consts.TARGET-C.MTD)/(consts.DAYS-consts.DAY))) : '—'}</div>
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
          <div className="cap" style={{ marginBottom: 4 }}>AOV</div>
          <div className="num h1">{C.ORD ? B(C.AOV) : '—'}</div>
          <MomDelta current={C.AOV} previous={prevC.AOV} label={prevMonthName} />
        </div>
        <div className="card card-pad-sm">
          <div className="cap" style={{ marginBottom: 4 }}>{'ค่าแอด'}</div>
          <div className="num h1">{Bk(C.AD)}</div>
          <MomDelta current={C.AD} previous={prevC.AD} label={prevMonthName} />
        </div>
      </div>

      {/* per-platform: เป้า · ผลงาน · คุมแอด */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3>{'เป้า · ผลงาน · คุมแอด — รายแพลตฟอร์ม (MTD)'}</h3>
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
      <div className="grid g3">
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 12 }}>{'ยอดขายรายวัน'}</div>
          <MiniArea data={md.dailyMonth.map(d=>d.rev)} labels={md.dailyMonth.map(d=>'วันที่ '+d.d)} h={150} id="so" />
        </div>
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 12 }}>3 {'เดือนล่าสุด'}</div>
          <Bars data={D.month3} h={170} valueKey="actual" />
          <div className="cap" style={{ marginTop: 8 }}>{'มิ.ย.'} {'รวมคาดการณ์'} ({'โปร่ง'})</div>
        </div>
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 12 }}>{'เทียบปีก่อน'} (YoY)</div>
          <YoYChart />
        </div>
      </div>
    </div>
  );
}

function YoYChart() {
  const data = D.yoy;
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
  const line = (key) => data.map((d,i)=>[X(i), h-20-((d[key]-min)/range)*(h-30)]);
  const path = pts => pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 150 }}>
        <path d={path(line('y25'))} fill="none" stroke="var(--ink-4)" strokeWidth="2" strokeDasharray="4 4" />
        <path d={path(line('y26'))} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
        {line('y25').map((p,i)=><circle key={'a'+i} cx={p[0]} cy={p[1]} r="2.5" fill="var(--ink-4)" />)}
        {line('y26').map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r="3" fill="var(--accent)" />)}
        {data.map((d,i)=><text key={i} x={X(i)} y={h-2} fontSize="9" fill="var(--ink-3)" textAnchor="middle">{d.m}</text>)}
        {/* hover columns — เอาเมาส์วางแสดงตัวเลขเทียบปี */}
        {data.map((d,i)=>{
          const dd = data.length>1 ? w/(data.length-1) : w;
          return <rect key={'h'+i} x={X(i)-dd/2} y="0" width={dd} height={h} fill="transparent" style={{ cursor:'default' }}>
            <title>{`${d.m} · 2569: ${B(d.y26)} · 2568: ${B(d.y25)}`}</title>
          </rect>;
        })}
      </svg>
      <div className="row" style={{ gap: 14, marginTop: 6 }}>
        <span className="cap"><span style={{ display:'inline-block', width:14, height:2, background:'var(--accent)', verticalAlign:'middle', marginRight:5 }}></span>2569</span>
        <span className="cap"><span style={{ display:'inline-block', width:14, height:2, background:'var(--ink-4)', verticalAlign:'middle', marginRight:5 }}></span>2568</span>
      </div>
    </div>
  );
}

function SalesChannels({ dateProps, prevMonthName, md }) {
  const consts = md.consts, channels = md.channels;
  return (
    <div className="content-inner rise">
      <SalesDateBar {...dateProps} />
      <div className="grid g3">
        {channels.map(ch => {
          const pPct = (ch.target > 0 && consts.DAYS > 0 && consts.DAY > 0) ? (ch.actual / ((ch.target/consts.DAYS)*consts.DAY)) * 100 : 0;
          const st = paceStatus(pPct);
          const roas = ch.ad > 0 ? ch.actual/ch.ad : null;
          const acos = (ch.ad > 0 && ch.actual > 0) ? (ch.ad/ch.actual)*100 : null;
          const tot = ch.newCust + ch.oldCust;
          const platformFee = ch.actual * 0.05;
          const profit = ch.actual - ch.ad - platformFee;
          const margin = ch.actual > 0 ? (profit / ch.actual) * 100 : 0;
          const growth = ch.growthPct;
          const tgtPct = ch.target > 0 ? Math.min((ch.actual / ch.target) * 100, 100) : 0;
          return (
            <div key={ch.id} className="card" style={{ borderTop: `3px solid ${ch.hex}` }}>
              <div className="row between" style={{ marginBottom: 10 }}>
                <span className="row" style={{ gap: 8, fontWeight: 700 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: ch.hex }}></span>{ch.name}</span>
                <Ring pct={tgtPct} size={40} stroke={4} color={ch.hex}>
                  <span className="num" style={{ fontSize: 9, fontWeight: 700 }}>{P(tgtPct, 0)}</span>
                </Ring>
              </div>
              <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
                <div className="num h1">{B(ch.actual)}</div>
                {growth ? <span className="cap" style={{ color: growth >= 0 ? 'var(--good)' : 'var(--bad)', fontWeight: 600 }}>{growth >= 0 ? '▲ +' : '▼ '}{growth}% vs {'เดือนก่อน'}</span> : null}
              </div>
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <div className="bar" style={{ flex: 1 }}><span style={{ width: `${tgtPct}%`, background: ch.hex }}></span></div>
                <span className="num cap" style={{ fontWeight: 700, color: ch.hex }}>{ch.target > 0 ? P((ch.actual/ch.target)*100,0) : '—'}</span>
              </div>
              <div className="row between" style={{ marginTop: 6 }}>
                <span className="cap">{'เป้า'} <span className="num" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>{ch.target > 0 ? B(ch.target) : '— ยังไม่ตั้ง'}</span></span>
                {ch.target > 0 && <span className="cap">{ch.actual >= ch.target ? '✓ ถึงเป้าแล้ว' : <>{'ขาดอีก'} <span className="num" style={{ fontWeight: 700 }}>{B(ch.target - ch.actual)}</span></>}</span>}
              </div>
              <div className="grid g3" style={{ marginTop: 14, gap: 8 }}>
                <div><div className="cap">{'ออร์เดอร์'}</div><div className="num h3">{ch.orders}</div></div>
                <div><div className="cap">AOV</div><div className="num h3">{ch.orders > 0 ? B(ch.actual/ch.orders) : '—'}</div></div>
                <div><div className="cap">{'ใหม่'}</div><div className="num h3" style={{ color: 'var(--good)' }}>{tot > 0 ? P((ch.newCust/tot)*100,0) : '—'}</div></div>
              </div>

              {/* P&L row */}
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                <div className="cap" style={{ marginBottom: 6 }}>P&L</div>
                <div className="row between" style={{ gap: 4 }}>
                  <span className="sm">{Bk(ch.actual)} - {Bk(ch.ad)} - {Bk(platformFee)}</span>
                  <span className="num sm" style={{ fontWeight: 700, color: profit >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                    = {Bk(profit)} ({P(margin, 0)})
                  </span>
                </div>
              </div>

              {ch.hasAd && (
                <div className="grid g3" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)', gap: 8 }}>
                  <div><div className="cap">{'ค่าแอด'}</div><div className="num sm" style={{ fontWeight: 600 }}>{Bk(ch.ad)}</div></div>
                  <div><div className="cap">ROAS</div><div className="num sm" style={{ fontWeight: 700, color: roas==null?'var(--ink-3)':roas>=3?'var(--good)':roas>=2?'var(--warn)':'var(--bad)' }}>{roas != null ? roas.toFixed(1) + 'x' : '—'}</div></div>
                  <div><div className="cap">ACOS</div><div className="num sm" style={{ fontWeight: 700, color: acos==null?'var(--ink-3)':acos<=consts.ACOS_CEIL?'var(--good)':acos<=40?'var(--warn)':'var(--bad)' }}>{acos != null ? P(acos,0) : '—'}</div></div>
                </div>
              )}
            </div>
          );
        })}
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

  return (
    <div className="content-inner rise">
      <SalesDateBar {...dateProps} />

      {/* Budget planner */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3><span style={{ color: 'var(--accent)' }}><Icon name="wallet" /></span> {'งบโฆษณา'}</h3></div>
        <div className="grid g4" style={{ marginBottom: 12 }}>
          <div>
            <div className="cap">{'งบทั้งหมด'}</div>
            <div className="num h1">{totalBudget > 0 ? Bk(totalBudget) : '— ยังไม่ตั้งงบ'}</div>
          </div>
          <div>
            <div className="cap">{'ใช้ไปแล้ว'}</div>
            <div className="num h1" style={{ color: 'var(--warn)' }}>{Bk(totalSpent)}</div>
          </div>
          <div>
            <div className="cap">{'คงเหลือ'}</div>
            <div className="num h1" style={{ color: totalBudget <= 0 ? 'var(--ink-3)' : remaining > 0 ? 'var(--good)' : 'var(--bad)' }}>{totalBudget > 0 ? Bk(remaining) : '—'}</div>
          </div>
          <div>
            <div className="cap">Burn rate/{'วัน'}</div>
            <div className="num h1">{Bk(burnRate)}</div>
            <span className="cap" style={{ color: projectedSpend > totalBudget ? 'var(--bad)' : 'var(--good)' }}>
              {'คาดใช้'} {Bk(projectedSpend)}
            </span>
          </div>
        </div>
        <div className="bar"><span style={{ width: `${totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0}%`, background: totalBudget > 0 && totalSpent / totalBudget > 0.8 ? 'var(--warn)' : 'var(--accent)' }}></span></div>
        <div className="row between" style={{ marginTop: 6 }}>
          <span className="cap">{totalBudget > 0 ? P((totalSpent / totalBudget) * 100, 0) : '—'} {'ของงบ'}</span>
          <span className="cap">{consts.DAYS > 0 ? P((consts.DAY / consts.DAYS) * 100, 0) : '—'} {'ของเวลา'}</span>
        </div>
      </div>

      {/* Ad performance table */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3><span style={{color:'var(--accent)'}}><Icon name="zap" /></span> {'ประสิทธิภาพโฆษณา'}</h3></div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>{'ช่องทาง'}</th><th style={{textAlign:'right'}}>{'รายได้'}</th><th style={{textAlign:'right'}}>{'ค่าแอด'}</th><th style={{textAlign:'right'}}>ROAS</th><th style={{textAlign:'right'}}>ACOS</th></tr></thead>
          <tbody>
            {channels.filter(c=>c.hasAd).map(c => {
              const r = c.ad > 0 ? c.actual/c.ad : null;
              const a = c.actual > 0 ? (c.ad/c.actual)*100 : null;
              return (
                <tr key={c.id}>
                  <td><span className="row" style={{gap:8, fontWeight:600}}><span style={{width:9,height:9,borderRadius:3,background:c.hex}}></span>{c.name}</span></td>
                  <td className="num" style={{textAlign:'right', fontWeight:600}}>{Bk(c.actual)}</td>
                  <td className="num" style={{textAlign:'right', color:'var(--ink-2)'}}>{Bk(c.ad)}</td>
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
            {getAdCampaigns().filter(c => adCampaignInMonth(c, dateProps.month, dateProps.year)).map((c, i) => {
              const stMap = { live: { l: 'กำลังยิง', cls: 'chip-good' }, upcoming: { l: 'รอเริ่ม', cls: 'chip-warn' }, done: { l: 'จบแล้ว', cls: '' } };
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
          {[['รายได้', B(fb.revenue)],['ค่าแอด', B(fb.spend)],['ROAS', Number(fb.roas || 0).toFixed(2)+'x', fb.roas>=2?'var(--good)':'var(--bad)'],['ACOS', P(fb.acos), fb.acos<=consts.ACOS_CEIL?'var(--good)':'var(--bad)']].map((x,i)=>(
            <div key={i}><div className="cap">{x[0]}</div><div className="num h1" style={{ color: x[2]||'var(--ink)' }}>{x[1]}</div></div>
          ))}
          <div>
            <div className="cap">{'เวลาตอบแชทเฉลี่ย'}</div>
            <div className="num h1" style={{ color: 'var(--info)' }}>{fb.avgReplyMinutes ? <>{fb.avgReplyMinutes} <span className="cap">{'นาที'}</span></> : '—'}</div>
          </div>
        </div>
        <div className="grid g3" style={{ gap: 12 }}>
          <div className="card card-pad-sm" style={{ background: 'var(--surface-2)', border: 'none' }}>
            <div className="cap" style={{ marginBottom: 6 }}>{'แชท'} {'→'} {'สั่งซื้อ'}</div>
            <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
              <span className="num h1">{fb.inquiries}</span><span className="cap">{'แชท'}</span>
              <span style={{ width: 16, height: 16, display: 'inline-block', color: 'var(--ink-3)' }}><Icon name="arrowR" /></span>
              <span className="num h1" style={{ color: 'var(--good)' }}>{fb.orders}</span><span className="cap">{'ออร์เดอร์'}</span>
            </div>
            <div className="bar" style={{ marginTop: 8 }}><span style={{ width: `${fb.conv}%`, background: 'var(--good)' }}></span></div>
            <div className="sm" style={{ color: 'var(--good)', fontWeight: 700, marginTop: 4 }}>Conversion {P(fb.conv)}</div>
          </div>
          <div className="card card-pad-sm" style={{ background: 'var(--surface-2)', border: 'none' }}>
            <div className="cap" style={{ marginBottom: 8 }}>{'ต้นทุน'}</div>
            {[['ต่อแชท', B(fb.cpInq)],['ต่อออร์เดอร์', B(fb.cpOrd)],['CAC ลูกค้าใหม่', B(fb.cac), 'var(--warn)']].map((x,i)=>(
              <div key={i} className="row between" style={{ marginBottom: 6 }}><span className="cap">{x[0]}</span><span className="num sm" style={{ fontWeight: 700, color: x[2]||'var(--ink)' }}>{x[1]}</span></div>
            ))}
          </div>
          <div className="card card-pad-sm" style={{ background: 'var(--surface-2)', border: 'none' }}>
            <div className="cap" style={{ marginBottom: 8 }}>{'ปริมาณข้อความ'} (6 {'ด.'})</div>
            <MiniArea data={D.fbMsgTrend.map(d=>d.v)} labels={D.fbMsgTrend.map(d=>d.m)} fmt={N} h={70} color="var(--ch-facebook)" id="fbmsg" />
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
        <span className="eyebrow">กลุ่มลูกค้า</span>
      </div>
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
            <div className="eyebrow" style={{ marginBottom: 8 }}>Customer Lifetime Value (CLV)</div>
            <div className="num display" style={{ color: 'var(--accent)' }}>{C.CLV ? B(C.CLV) : '—'}</div>
            <div className="cap" style={{ marginTop: 4 }}>{'เฉลี่ยต่อลูกค้า'} {'·'} {'จากกลุ่มลูกค้า'}</div>
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

      {/* Cohort table */}
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
