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
        department: r.department || s?.role || '',
        color: r.color || s?.color || '#3b82f6',
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
    channels:    supabase.from('tmk_channels').select('*').order('sort_order'),
    campaigns:   supabase.from('tmk_campaigns').select('*').order('start_date'),
    tasks:       supabase.from('tmk_tasks').select('*').order('date'),
    products:    supabase.from('tmk_products').select('*').order('created_at'),
    po:          supabase.from('tmk_purchase_orders').select('*').order('arrival_date'),
    audit:       supabase.from('tmk_audit_logs').select('*').order('created_at', { ascending: false }).limit(50),
    roles:       supabase.from('tmk_user_roles').select('*'),
    staff:       supabase.from('tmk_staff').select('*').order('joined_at'),
    daily:       supabase.from('tmk_daily_sales').select('*').order('date'),
    adCamps:     supabase.from('tmk_ad_campaigns').select('*').order('start_date'),
    segments:    supabase.from('tmk_customer_segments').select('*').order('sort_order'),
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
  const TARGET = Number(settings.total_target || 1000000);
  const DAY = Number(settings.current_day || 18);
  const DAYS = Number(settings.days_in_month || 30);
  const ACOS_CEIL = Number(settings.acos_ceil || 25);
  const AD_BUDGET = Number(settings.ad_budget_total || 150000);

  // Channels
  const channels = (raw.channels || []).map(ch => ({
    id: ch.id,
    name: ch.name,
    color: `var(--ch-${(ch.id || '').toLowerCase()})`,
    hex: ch.color,
    target: Number(ch.percentage || 0),
    actual: Number(ch.actual || 0),
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
    channel: t.channel || 'หลังบ้าน',
  }));

  // Products
  const products = (raw.products || []).map((p, i) => ({
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
  // 3 เดือนล่าสุด (4, 5, 6 ของปีปัจจุบัน)
  const currentYear = Number(settings.current_year || 2569);
  const currentMonth = Number(settings.current_month || 6);
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
  };
  fb.roas = fb.spend > 0 ? fb.revenue / fb.spend : 0;
  fb.acos = fb.revenue > 0 ? (fb.spend / fb.revenue) * 100 : 0;
  fb.conv = fb.inquiries > 0 ? (fb.orders / fb.inquiries) * 100 : 0;
  fb.aov = fb.orders > 0 ? fb.revenue / fb.orders : 0;
  fb.cpInq = fb.inquiries > 0 ? fb.spend / fb.inquiries : 0;
  fb.cpOrd = fb.orders > 0 ? fb.spend / fb.orders : 0;
  fb.cac = fb.newCust > 0 ? fb.spend / fb.newCust : 0;
  // FB message trend จาก monthly_history
  const fbMsgTrend = monthly
    .filter(m => m.year === currentYear && m.month <= currentMonth)
    .map(m => ({ m: m.month_th, v: Math.round(Number(m.orders || 0) * 0.55) })); // estimate

  // Audit log
  const audit = (raw.audit || []).map(a => {
    let details = {};
    try { details = typeof a.details === 'string' ? JSON.parse(a.details) : (a.details || {}); }
    catch {}
    return {
      user: a.user_email?.split('@')[0] || 'system',
      action: a.action,
      type: details.entityType === 'task' ? 'update' : details.summary?.includes('สร้าง') ? 'create' : details.summary?.includes('ลบ') ? 'delete' : 'update',
      entity: details.entityType || 'system',
      name: details.entityName || '',
      time: new Date(a.created_at).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }),
      summary: details.summary || a.action,
    };
  });

  // Roles + Staff
  const { roles, staff } = mapRolesAndStaff(raw.roles || [], raw.staff || []);

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
  const AD  = channels.reduce((s, c) => s + c.ad, 0);
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

  return {
    consts: { TARGET, DAY, DAYS, ACOS_CEIL },
    channels, campaigns, tasks, products, dailyMonth, dailyLog, month3, yoy,
    colorMix, sizeMix, staff, poTracker, fb, fbMsgTrend, audit, roles,
    adCampaigns: (raw.adCamps || []).map(c => ({
      id: c.id,
      name: c.name,
      platform: c.platform,
      budget: Number(c.budget || 0),
      spent: Number(c.spent || 0),
      roas: Number(c.roas || 0),
      status: c.status || 'live',
    })),
    segments: (raw.segments || []).map(s => ({
      name: s.name,
      count: Number(s.count || 0),
      revPct: Number(s.rev_pct || 0),
      color: s.color,
      clv: Number(s.avg_clv || 0),
    })),
    computed: { MTD, ORD, AD, NEW_REV, OLD_REV, NEW_C, OLD_C, PACE_TGT, PACE_PCT, RUN, AOV, ACOS_TOT, CAC },
  };
}

// Mutate TMK in-place — views ที่ import TMK จะเห็นค่าใหม่
function mutateTMK(mapped) {
  // Replace nested objects
  Object.assign(TMK.consts, mapped.consts);
  Object.assign(TMK.computed, mapped.computed);
  Object.assign(TMK.fb, mapped.fb);
  // Replace arrays (length = 0 + push)
  ['channels','campaigns','tasks','products','dailyMonth','dailyLog','month3','yoy',
   'colorMix','sizeMix','staff','poTracker','fbMsgTrend','audit','roles'].forEach(key => {
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
        'tmk_user_roles','tmk_staff','tmk_daily_sales','tmk_ad_campaigns',
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
