/* ============================================================
   TMK Operation — Data Context (Supabase only — no mock)
   ============================================================
   - โหลดทั้งหมด 15 ตารางจาก Supabase ตอน mount
   - Mutate TMK object in-place เพื่อให้ views ที่ import { TMK } เห็นค่าจริง
   - Force re-render ผ่าน React state เมื่อ data มา
   - Realtime subscription: อัปเดตอัตโนมัติเมื่อ DB เปลี่ยน
   ============================================================ */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { TMK } from './data.js';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient.js';
import { getToday } from './lib/dateUtils.js';

const DataContext = createContext();

const THAI_MONTH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

// แปลง "2026-06-18" → "18 มิ.ย."
function thaiDate(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  if (parts.length !== 3) return dateStr;
  return `${parseInt(parts[2], 10)} ${THAI_MONTH[parseInt(parts[1], 10) - 1] || ''}`;
}

// แปลง array ของ user_roles + staff → roles + staff สำหรับ UI
function mapRolesAndStaff(userRoles, staff) {
  const byEmail = Object.fromEntries(staff.map(s => [s.email, s]));
  return {
    roles: userRoles.map(r => {
      const s = byEmail[r.email];
      return {
        email: r.email,
        name: r.name || s?.name || r.email.split('@')[0],
        role: r.role || 'viewer',
        dutyId: r.duty_id || '',
        department: r.dutyName || r.department || s?.role || '',
        color: r.dutyColor || r.color || s?.color || '#3b82f6',
        avatarUrl: s?.avatar_url || '',
      };
    }),
    staff: staff.map(s => ({
      name: s.name,
      role: s.role,
      email: s.email || '',
      color: s.color || '#3b82f6',
      avatarUrl: s.avatar_url || '',
    })),
  };
}

// โหลดทุกตารางพร้อมกัน
async function loadAllTables() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase ยังไม่ได้ตั้งค่า (.env)');
  }

  const tables = {
    settings:    supabase.from('tmk_settings').select('*').eq('id', 'main').maybeSingle(),
    channels:    supabase.from('tmk_channels').select('*').is('deleted_at', null).order('sort_order'),
    campaigns:   supabase.from('tmk_campaigns').select('*').is('deleted_at', null).order('sort_order', { nullsFirst: false }).order('start_date'),
    tasks:       supabase.from('tmk_tasks').select('*').is('deleted_at', null).order('date'),
    products:    supabase.from('tmk_products').select('*').is('deleted_at', null).order('created_at'),
    po:          supabase.from('tmk_purchase_orders').select('*').is('deleted_at', null).order('arrival_date'),
    audit:       supabase.from('tmk_audit_logs').select('*').order('created_at', { ascending: false }).limit(50),
    roles:       supabase.from('tmk_user_roles').select('*').is('deleted_at', null),
    staff:       supabase.from('tmk_staff').select('*').is('deleted_at', null).order('joined_at'),
    duties:      supabase.from('tmk_duties').select('*').is('deleted_at', null).order('sort_order'),
    daily:       supabase.from('tmk_daily_sales').select('*').order('date'),
    adCamps:     supabase.from('tmk_ad_campaigns').select('*').is('deleted_at', null).order('start_date'),
    segments:    supabase.from('tmk_customer_segments').select('*').is('deleted_at', null).order('sort_order'),
    fbMetrics:   supabase.from('tmk_fb_metrics').select('*').eq('id', 'current').maybeSingle(),
    monthly:     supabase.from('tmk_monthly_history').select('*').order('year').order('month'),
    colorMix:    supabase.from('tmk_color_mix').select('*').order('sort_order'),
    sizeMix:     supabase.from('tmk_size_mix').select('*').order('sort_order'),
  };

  const keys = Object.keys(tables);
  const results = await Promise.all(Object.values(tables));

  // ตรวจ errors — log ตารางไหนล้ม (อาจจะยังไม่ได้ run migration)
  const result = {};
  results.forEach((r, i) => {
    const key = keys[i];
    if (r.error) {
      console.warn(`⚠️ tmk_${key}: ${r.error.message}`);
      result[key] = Array.isArray(r.data) ? [] : null;
    } else {
      result[key] = r.data;
    }
  });
  return result;
}

// แปลง raw Supabase data → TMK structure
function mapToTMK(raw) {
  const settings = raw.settings || {};
  const today = getToday(); // วันที่จริงของเครื่อง = source of truth ของ "วันนี้"
  // ค่าตั้งค่า "รายเดือน" ของเดือนปัจจุบัน (เก็บใน tmk_monthly_history: target + meta jsonb)
  const _curRow = (raw.monthly || []).find(m => Number(m.year) === today.yearBE && Number(m.month) === today.month);
  const _curMeta = (_curRow && _curRow.meta) || {};
  const TARGET = Number(_curRow?.target || 0);             // เป้ายอดรวมของเดือนนี้ (ยังไม่ตั้ง = 0)
  const DAY = today.day;                 // วันจริง (แทน settings.current_day)
  const DAYS = today.daysInMonth;        // จำนวนวันจริงในเดือนนี้
  const ACOS_CEIL = Number(_curMeta.acosCeil || 25);       // เพดาน ACOS รายเดือน — default 25%
  const AD_BUDGET = Number(_curMeta.adBudget || 0);        // งบโฆษณาของเดือนนี้ (ยังไม่ตั้ง = 0)

  // รายได้ต่อช่องทาง derive จาก tmk_daily_sales จริง (single source of truth)
  // กรอกยอดรายวัน → MTD/ช่องทางอัปเดตเอง; ถ้ายังไม่มี daily → 0
  const DAILY_COL = { shopee: 'shopee', tiktok: 'tiktok', lazada: 'lazada', facebook: 'facebook', line: 'line_oa', crm: 'crm' };
  const _dailyRows = raw.daily || [];
  const dailyRevByCh = {};
  let dailyAdTotal = 0;
  _dailyRows.forEach(d => {
    dailyAdTotal += Number(d.ad_spend || 0);
    for (const [id, col] of Object.entries(DAILY_COL)) {
      dailyRevByCh[id] = (dailyRevByCh[id] || 0) + Number(d[col] || 0);
    }
  });

  // Channels
  const channels = (raw.channels || []).map(ch => ({
    id: ch.id,
    name: ch.name,
    icon: ch.icon || '',
    logoUrl: ch.logo_url || '',
    color: `var(--ch-${(ch.id || '').toLowerCase()})`,
    hex: ch.color,
    // เป้าต่อช่องทาง = ค่าของเดือนปัจจุบัน (meta.channelTargets); ไม่มี = 0
    target: Number((_curMeta.channelTargets && _curMeta.channelTargets[ch.id]) || 0),
    // รายได้ต่อช่องทาง = ยอดจริงจาก daily (ช่องทางมาตรฐาน); อื่นๆ ใช้ค่าใน channels
    actual: (ch.id in DAILY_COL) ? (dailyRevByCh[ch.id] || 0) : Number(ch.actual || 0),
    sortOrder: Number(ch.sort_order || 0),
    // metric รายช่องทาง (ยังไม่ได้เก็บจากการกรอกจริง — มาจากคอลัมน์ channels)
    orders: Number(ch.orders || 0),
    newRev: Number(ch.new_rev || 0),
    oldRev: Number(ch.old_rev || 0),
    newCust: Number(ch.new_cust || 0),
    oldCust: Number(ch.old_cust || 0),
    ad: Number(ch.ad || 0),
    hasAd: Boolean(ch.has_ad),
    growthPct: Number(ch.growth_pct || 0),
  }));

  // Campaigns
  const campaigns = (raw.campaigns || []).map(c => ({
    id: c.id,
    name: c.name,
    color: c.color,
    start: c.start_date ? thaiDate(c.start_date) : '',
    end: c.end_date ? thaiDate(c.end_date) : '',
    status: c.status || 'upcoming',
    channels: c.channels || [],
    tasks: (raw.tasks || []).filter(t => t.camp === c.id).length,
  }));

  // Tasks
  const tasks = (raw.tasks || []).map(t => ({
    id: t.id,
    title: t.title,
    detail: t.detail || '',
    date: thaiDate(t.date),
    responsible: String(t.responsible || '').split(',').map(s => s.trim()).filter(Boolean),
    camp: t.camp || '',
    status: t.status || 'todo',
    channel: t.channel || '',
    reminderDays: Number(t.reminder_days || 1),
  }));

  // Products
  const products = (raw.products || []).map((p, i) => ({
    id: p.id,
    rank: i + 1,
    name: p.name,
    price: Number(p.price || 0),
    units: Number(p.actual_units || 0),
    rev: Number(p.price || 0) * Number(p.actual_units || 0),
    stock: p.stock_on_hand <= 0 ? 'out' : p.stock_on_hand < p.reorder_point ? 'low' : 'ok',
    onHand: Number(p.stock_on_hand || 0),
    reorder: Number(p.reorder_point || 0),
    strategy: p.strategy || '',
  }));

  // dailyAll — ทุกแถว daily ทุกเดือน + รายละเอียดต่อช่องทาง (สำหรับ dashboard รายเดือน)
  const _chIds = (raw.channels || []).map(c => c.id);
  const dailyAll = (raw.daily || []).map(d => {
    const [yy, mm, dd] = String(d.date).split('-').map(Number);
    const cj = (d.channels && typeof d.channels === 'object') ? d.channels : {};
    const ch = {};
    _chIds.forEach(id => {
      const j = cj[id] || {};
      const legacyCol = DAILY_COL[id];
      ch[id] = {
        rev: Number(j.rev != null ? j.rev : (legacyCol ? d[legacyCol] : 0)) || 0,
        ord: Number(j.ord || 0), ad: Number(j.ad || 0), inq: Number(j.inq || 0),
        newC: Number(j.newC || 0), oldC: Number(j.oldC || 0),
      };
    });
    return { date: d.date, year: yy + 543, month: mm, day: dd, adSpend: Number(d.ad_spend || 0), replyMin: Number(d.avg_reply_minutes || 0), note: d.note || '', dayName: d.day_name || '', ch };
  });

  // Daily sales — แปลงเป็น dailyMonth (1-30) + dailyLog (7 ล่าสุด)
  const daily = raw.daily || [];
  const dailyMonth = daily.map((d, i) => {
    const day = parseInt(String(d.date).split('-')[2], 10);
    const rev = Number(d.shopee || 0) + Number(d.tiktok || 0) + Number(d.lazada || 0) +
                Number(d.facebook || 0) + Number(d.line_oa || 0) + Number(d.crm || 0);
    return { d: day, rev };
  });
  const dailyLog = [...daily].reverse().slice(0, 7).map(d => ({
    date: thaiDate(d.date),
    day: d.day_name,
    shopee: Number(d.shopee || 0),
    tiktok: Number(d.tiktok || 0),
    lazada: Number(d.lazada || 0),
    facebook: Number(d.facebook || 0),
    line: Number(d.line_oa || 0),
    crm: Number(d.crm || 0),
    ad: Number(d.ad_spend || 0),
    note: d.note || '',
  }));

  // Monthly history → 3 เดือนล่าสุด + YoY
  const monthly = raw.monthly || [];
  // ใช้ปี/เดือนจริง (พ.ศ.) เป็นฐาน
  const currentYear = today.yearBE;
  const currentMonth = today.month;
  const month3 = monthly
    .filter(m => m.year === currentYear && m.month >= currentMonth - 2 && m.month <= currentMonth)
    .map(m => ({
      m: m.month_th,
      actual: Number(m.actual || 0),
      proj: Number(m.projected || 0),
    }));
  // YoY: 6 เดือนของปีปัจจุบัน + ปีก่อน
  const lastYear = currentYear - 1;
  const yoy = [];
  for (let mo = 1; mo <= 6; mo++) {
    const cur = monthly.find(m => m.year === currentYear && m.month === mo);
    const prev = monthly.find(m => m.year === lastYear && m.month === mo);
    if (cur || prev) {
      yoy.push({
        m: THAI_MONTH[mo - 1],
        y25: Number(prev?.actual || 0),
        y26: Number(cur?.actual || 0),
      });
    }
  }

  // FB metrics
  const fbRaw = raw.fbMetrics || {};
  const fb = {
    revenue: Number(fbRaw.revenue || 0),
    spend: Number(fbRaw.spend || 0),
    inquiries: Number(fbRaw.inquiries || 0),
    orders: Number(fbRaw.orders || 0),
    newCust: Number(fbRaw.new_cust || 0),
    oldCust: Number(fbRaw.old_cust || 0),
    avgReplyMinutes: Number(fbRaw.avg_reply_minutes || 0),
  };
  fb.roas = fb.spend > 0 ? fb.revenue / fb.spend : 0;
  fb.acos = fb.revenue > 0 ? (fb.spend / fb.revenue) * 100 : 0;
  fb.conv = fb.inquiries > 0 ? (fb.orders / fb.inquiries) * 100 : 0;
  fb.aov = fb.orders > 0 ? fb.revenue / fb.orders : 0;
  fb.cpInq = fb.inquiries > 0 ? fb.spend / fb.inquiries : 0;
  fb.cpOrd = fb.orders > 0 ? fb.spend / fb.orders : 0;
  fb.cac = fb.newCust > 0 ? fb.spend / fb.newCust : 0;
  // FB message trend — ใช้ค่าจริงจาก column messages (กรอกผ่าน "กรอกข้อมูลย้อนหลัง")
  const fbMsgTrend = monthly
    .filter(m => m.year === currentYear && m.month <= currentMonth)
    .map(m => ({ m: m.month_th, v: Number(m.messages || 0) }));

  // Audit log
  const audit = (raw.audit || []).map(a => {
    let details = {};
    try { details = typeof a.details === 'string' ? JSON.parse(a.details) : (a.details || {}); }
    catch {}
    // type มาจาก a.action ตรงๆ (robust) — map action → หมวดที่ UI ใช้ (create/update/delete)
    const ACTION_TYPE = { create: 'create', update: 'update', delete: 'delete', purge: 'delete', restore: 'create', move: 'update', export: 'update' };
    const type = ACTION_TYPE[a.action] || (details.summary?.includes('สร้าง') ? 'create' : details.summary?.includes('ลบ') ? 'delete' : 'update');
    return {
      user: a.user_email?.split('@')[0] || 'system',
      action: a.action,
      type,
      entity: details.entityType || 'system',
      name: details.entityName || '',
      time: new Date(a.created_at).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }),
      summary: details.summary || a.action,
    };
  });

  // Duties (หน้าที่)
  const duties = (raw.duties || []).map(d => ({
    id: d.id,
    name: d.name,
    color: d.color || '#3b82f6',
    description: d.description || '',
    sortOrder: d.sort_order || 0,
  }));
  const dutyById = Object.fromEntries(duties.map(d => [d.id, d]));

  // Roles + Staff — link duty via duty_id
  const enrichedRoles = (raw.roles || []).map(r => {
    const duty = r.duty_id ? dutyById[r.duty_id] : null;
    return { ...r, dutyName: duty?.name || r.department || '', dutyColor: duty?.color || r.color };
  });
  const { roles, staff } = mapRolesAndStaff(enrichedRoles, raw.staff || []);

  // PO
  const poTracker = (raw.po || []).map(p => ({
    id: p.id,
    product: p.product,
    quantity: Number(p.quantity || 0),
    orderDate: thaiDate(p.order_date),
    arrivalDate: thaiDate(p.arrival_date),
    status: p.status || 'Pending',
  }));

  // Color/Size mix
  const colorMix = (raw.colorMix || []).map(c => ({
    name: c.name, hex: c.hex, pct: Number(c.pct || 0),
  }));
  const sizeMix = (raw.sizeMix || []).map(s => ({
    s: s.size, pct: Number(s.pct || 0),
  }));

  // Computed aggregates
  const MTD = channels.reduce((s, c) => s + c.actual, 0);
  const ORD = channels.reduce((s, c) => s + c.orders, 0);
  // ค่าแอดรวมจาก daily จริง (fallback เป็นผลรวม per-channel ถ้าไม่มี daily)
  const AD  = dailyAdTotal || channels.reduce((s, c) => s + c.ad, 0);
  const NEW_REV = channels.reduce((s, c) => s + c.newRev, 0);
  const OLD_REV = channels.reduce((s, c) => s + c.oldRev, 0);
  const NEW_C = channels.reduce((s, c) => s + c.newCust, 0);
  const OLD_C = channels.reduce((s, c) => s + c.oldCust, 0);
  const PACE_TGT = Math.round((TARGET / DAYS) * DAY);
  const PACE_PCT = PACE_TGT > 0 ? (MTD / PACE_TGT) * 100 : 0;
  const RUN = DAY > 0 ? Math.round((MTD / DAY) * DAYS) : 0;
  const AOV = ORD > 0 ? MTD / ORD : 0;
  const ACOS_TOT = MTD > 0 ? (AD / MTD) * 100 : 0;
  const CAC = NEW_C > 0 ? AD / NEW_C : 0;
  // CLV เฉลี่ย — weighted avg ของ avg_clv แต่ละ segment ตามจำนวนลูกค้า (0 ถ้ายังไม่มี segment)
  const _segs = raw.segments || [];
  const _segCount = _segs.reduce((s, x) => s + Number(x.count || 0), 0);
  const CLV = _segCount > 0 ? Math.round(_segs.reduce((s, x) => s + Number(x.avg_clv || 0) * Number(x.count || 0), 0) / _segCount) : 0;

  // raw monthly สำหรับ quarter view (target/actual จริงต่อเดือน/ปี)
  const monthlyRaw = monthly.map(m => ({
    month: Number(m.month), year: Number(m.year), monthTh: m.month_th,
    target: Number(m.target || 0), actual: Number(m.actual || 0),
    projected: Number(m.projected || 0), orders: Number(m.orders || 0),
    adSpend: Number(m.ad_spend || 0), newCust: Number(m.new_cust || 0),
    messages: Number(m.messages || 0), meta: m.meta || {},
  }));

  return {
    consts: { TARGET, DAY, DAYS, ACOS_CEIL, AD_BUDGET, current_month: currentMonth, current_year: currentYear },
    channels, campaigns, tasks, products, dailyMonth, dailyLog, month3, yoy, monthly: monthlyRaw, dailyAll,
    colorMix, sizeMix, staff, poTracker, fb, fbMsgTrend, audit, roles, duties,
    adCampaigns: (raw.adCamps || []).map(c => ({
      id: c.id,
      name: c.name,
      platform: c.platform,
      budget: Number(c.budget || 0),
      spent: Number(c.spent || 0),
      roas: Number(c.roas || 0),
      status: c.status || 'live',
      startDate: c.start_date || null,
      endDate: c.end_date || null,
    })),
    segments: (raw.segments || []).map(s => ({
      name: s.name,
      count: Number(s.count || 0),
      revPct: Number(s.rev_pct || 0),
      color: s.color,
      clv: Number(s.avg_clv || 0),
    })),
    computed: { MTD, ORD, AD, NEW_REV, OLD_REV, NEW_C, OLD_C, PACE_TGT, PACE_PCT, RUN, AOV, ACOS_TOT, CAC, CLV },
  };
}

const _ABBR = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

// แคมเปญแอดอยู่ในเดือนที่เลือกหรือไม่ (ช่วงวันที่ทับซ้อนเดือน) — ไม่มีวันที่ = แสดงทุกเดือน
export function adCampaignInMonth(c, monthIdx0, yearBE) {
  if (!c.startDate && !c.endDate) return true;
  const yearCE = yearBE - 543;
  const mStart = new Date(yearCE, monthIdx0, 1);
  const mEnd = new Date(yearCE, monthIdx0 + 1, 0, 23, 59, 59);
  const s = c.startDate ? new Date(c.startDate) : mStart;
  const e = c.endDate ? new Date(c.endDate) : mEnd;
  return s <= mEnd && e >= mStart;
}
// คำนวณข้อมูลของ "เดือนที่เลือก" จาก TMK.dailyAll + TMK.monthly + TMK.channels
// ใช้ใน SalesView เพื่อให้เปลี่ยนเดือนแล้วข้อมูลเปลี่ยนตาม (อดีต/ปัจจุบัน/อนาคต)
export function computeMonth(monthIdx0, yearBE) {
  const monthNum = monthIdx0 + 1;
  const today = getToday();
  const isCurrent = yearBE === today.yearBE && monthNum === today.month;
  const isFuture = yearBE > today.yearBE || (yearBE === today.yearBE && monthNum > today.month);
  const DAYS = new Date(yearBE - 543, monthNum, 0).getDate();
  const DAY = isCurrent ? today.day : isFuture ? 0 : DAYS;

  const rows = (TMK.dailyAll || []).filter(r => r.year === yearBE && r.month === monthNum);
  const mRow = (TMK.monthly || []).find(m => m.year === yearBE && m.month === monthNum);
  const meta = (mRow && mRow.meta) || {};
  const TARGET = Number(mRow?.target || 0);
  const AD_BUDGET = Number(meta.adBudget || 0);
  const ACOS_CEIL = Number(meta.acosCeil || 25);

  const channels = (TMK.channels || []).map(base => {
    let rev = 0, ord = 0, ad = 0, newC = 0, oldC = 0, inq = 0;
    rows.forEach(r => { const c = r.ch[base.id]; if (c) { rev += c.rev; ord += c.ord; ad += c.ad; newC += c.newC; oldC += c.oldC; inq += (c.inq || 0); } });
    return { ...base, actual: rev, orders: ord, ad, newCust: newC, oldCust: oldC, inq, newRev: 0, oldRev: 0,
      target: Number((meta.channelTargets && meta.channelTargets[base.id]) || 0) };
  });

  const MTD = channels.reduce((s, c) => s + c.actual, 0);
  const ORD = channels.reduce((s, c) => s + c.orders, 0);
  const AD = rows.reduce((s, r) => s + r.adSpend, 0);
  const NEW_C = channels.reduce((s, c) => s + c.newCust, 0);
  const OLD_C = channels.reduce((s, c) => s + c.oldCust, 0);
  const AOV = ORD > 0 ? MTD / ORD : 0;
  const PACE_TGT = (DAYS > 0 && DAY > 0) ? Math.round((TARGET / DAYS) * DAY) : 0;
  const PACE_PCT = PACE_TGT > 0 ? (MTD / PACE_TGT) * 100 : 0;
  const RUN = DAY > 0 ? Math.round((MTD / DAY) * DAYS) : 0;
  const ACOS_TOT = MTD > 0 ? (AD / MTD) * 100 : 0;
  const CAC = NEW_C > 0 ? AD / NEW_C : 0;

  const dailyMonth = rows.map(r => ({ d: r.day, rev: Object.values(r.ch).reduce((s, c) => s + c.rev, 0) }));
  const dailyLog = [...rows].sort((a, b) => b.day - a.day).slice(0, 7).map(r => ({
    date: `${r.day} ${_ABBR[monthNum - 1]}`, day: r.dayName,
    shopee: r.ch.shopee?.rev || 0, tiktok: r.ch.tiktok?.rev || 0, lazada: r.ch.lazada?.rev || 0,
    facebook: r.ch.facebook?.rev || 0, line: r.ch.line?.rev || 0, crm: r.ch.crm?.rev || 0,
    ad: r.adSpend, note: r.note,
  }));

  // FB deep-dive ของเดือนที่เลือก — มาจากช่องทาง facebook รายวันของเดือนนั้น
  const fbCh = channels.find(c => c.id === 'facebook') || { actual: 0, orders: 0, ad: 0, newCust: 0, oldCust: 0, inq: 0 };
  const fb = {
    revenue: fbCh.actual, spend: fbCh.ad, inquiries: fbCh.inq || 0, orders: fbCh.orders,
    newCust: fbCh.newCust, oldCust: fbCh.oldCust,
    roas: fbCh.ad > 0 ? fbCh.actual / fbCh.ad : 0,
    acos: fbCh.actual > 0 ? (fbCh.ad / fbCh.actual) * 100 : 0,
    conv: (fbCh.inq || 0) > 0 ? (fbCh.orders / fbCh.inq) * 100 : 0,
    aov: fbCh.orders > 0 ? fbCh.actual / fbCh.orders : 0,
    cpInq: (fbCh.inq || 0) > 0 ? fbCh.ad / fbCh.inq : 0,
    cpOrd: fbCh.orders > 0 ? fbCh.ad / fbCh.orders : 0,
    cac: fbCh.newCust > 0 ? fbCh.ad / fbCh.newCust : 0,
    // เวลาตอบแชทเฉลี่ย = เฉลี่ยจากค่าที่กรอกรายวันของเดือนนั้น (นับเฉพาะวันที่กรอก > 0)
    avgReplyMinutes: (() => {
      const v = rows.map(r => r.replyMin).filter(x => x > 0);
      return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
    })(),
  };

  return {
    consts: { TARGET, DAY, DAYS, ACOS_CEIL, AD_BUDGET },
    channels, dailyMonth, dailyLog, enteredDays: rows.length, isCurrent, isFuture, fb,
    computed: { MTD, ORD, AD, NEW_REV: 0, OLD_REV: 0, NEW_C, OLD_C, PACE_TGT, PACE_PCT, RUN, AOV, ACOS_TOT, CAC, CLV: TMK.computed.CLV || 0 },
  };
}

// Mutate TMK in-place — views ที่ import TMK จะเห็นค่าใหม่
function mutateTMK(mapped) {
  // Replace nested objects
  Object.assign(TMK.consts, mapped.consts);
  Object.assign(TMK.computed, mapped.computed);
  Object.assign(TMK.fb, mapped.fb);
  // Replace arrays (length = 0 + push)
  ['channels','campaigns','tasks','products','dailyMonth','dailyLog','month3','yoy','monthly','dailyAll',
   'colorMix','sizeMix','staff','poTracker','fbMsgTrend','audit','roles','duties',
   'adCampaigns','segments'].forEach(key => {
    if (!TMK[key]) TMK[key] = [];
    TMK[key].length = 0;
    TMK[key].push(...(mapped[key] || []));
  });
}

export function DataProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0); // bump on reload → forces re-render
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      setError('Supabase ยังไม่ได้ตั้งค่า');
      return;
    }
    try {
      setLoading(true);
      const raw = await loadAllTables();
      if (!mountedRef.current) return;
      const mapped = mapToTMK(raw);
      mutateTMK(mapped);
      setError(null);
      setVersion(v => v + 1);
      console.log('✅ Loaded from Supabase:', {
        channels: TMK.channels.length,
        campaigns: TMK.campaigns.length,
        tasks: TMK.tasks.length,
        products: TMK.products.length,
        daily: TMK.dailyMonth.length,
        target: TMK.consts.TARGET,
        MTD: TMK.computed.MTD,
      });
    } catch (e) {
      console.error('❌ Load failed:', e);
      if (mountedRef.current) setError(e.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();

    // Realtime subscription
    let timer = null;
    const channel = supabase?.channel('tmk-realtime');
    if (channel) {
      [
        'tmk_channels','tmk_campaigns','tmk_tasks','tmk_products','tmk_settings',
        'tmk_user_roles','tmk_staff','tmk_duties','tmk_daily_sales','tmk_ad_campaigns',
        'tmk_customer_segments','tmk_fb_metrics','tmk_monthly_history',
        'tmk_color_mix','tmk_size_mix','tmk_purchase_orders','tmk_audit_logs',
      ].forEach(t => {
        channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => {
          clearTimeout(timer);
          timer = setTimeout(load, 300);
        });
      });
      channel.subscribe();
    }

    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [load]);

  return (
    <DataContext.Provider value={{ loading, error, version, reload: load }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  return useContext(DataContext);
}
