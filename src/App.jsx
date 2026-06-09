/* ============================================================
   TMK Operation — App shell, navigation, routing
   ============================================================ */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TMK } from './data.js';
import { Icon, B, Bk, N, Avatar, UserIcon } from './components.jsx';
import tmkLogo from './assets/tmk-logo.png';
import { HomeView, SalesView } from './views-1.jsx';
import { PlannerView, CatalogView, SettingsView, ProfileView } from './views-2.jsx';
import { Onboarding, HelpCenter, GuideOverlay } from './onboarding.jsx';
import { EntryView } from './views-entry.jsx';
import { RecordSalesModal, TaskModal, ProductModal, CampaignModal, POModal, MonthlyTargetModal, AdCampaignModal, CustomerSegmentModal, HistoricalEntryModal, LoginScreen } from './modals.jsx';
import { LangProvider, useLang } from './i18n.jsx';
import { ToastProvider, useToast, ConfirmDialog } from './toast.jsx';
import { supabase } from './lib/supabaseClient.js';
import { logAudit } from './lib/audit.js';
import { THAI_MONTHS, parseTaskDate, todayISO } from './lib/dateUtils.js';
import { DataProvider, useData } from './dataContext.jsx';
import { UserProvider, useUser } from './userContext.jsx';

/* ---- Loading splash (โหลดข้อมูลครั้งแรก) ---- */
function LoadingScreen() {
  const tips = [
    'กำลังเชื่อมต่อฐานข้อมูล TMK…',
    'กำลังดึงยอดขายและข้อมูลรายวัน…',
    'กำลังเตรียมแดชบอร์ด…',
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI(v => (v + 1) % tips.length), 1400);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="tmk-splash">
      <div className="splash-logo"><img src={tmkLogo} alt="TMK" /></div>
      <div className="splash-ring" aria-hidden="true"></div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>กำลังโหลดข้อมูล</div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 6, minHeight: 18 }}>{tips[i]}</div>
      </div>
      <div className="splash-bar" aria-hidden="true"></div>
    </div>
  );
}

/* ---- Error screen (โหลดครั้งแรกล้มเหลว) ---- */
function DataErrorScreen({ error, onRetry }) {
  const [busy, setBusy] = useState(false);
  const retry = async () => { setBusy(true); try { await onRetry?.(); } finally { setBusy(false); } };
  return (
    <div className="tmk-splash">
      <div className="splash-logo" style={{ animation: 'none' }}><img src={tmkLogo} alt="TMK" /></div>
      <div style={{ textAlign: 'center', maxWidth: 360, padding: '0 20px' }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--bad-soft, rgba(255,90,90,0.14))', color: 'var(--bad, #ff5a5a)', display: 'grid', placeItems: 'center', margin: '0 auto 14px', fontSize: 26, fontWeight: 800 }}>
          !
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>โหลดข้อมูลไม่สำเร็จ</div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 8, lineHeight: 1.7 }}>
          เชื่อมต่อฐานข้อมูลไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง
        </div>
        {error && <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 8, wordBreak: 'break-word' }}>{String(error)}</div>}
        <button className="btn btn-primary" onClick={retry} disabled={busy} style={{ marginTop: 18 }}>
          {busy ? 'กำลังลองใหม่…' : 'ลองใหม่อีกครั้ง'}
        </button>
      </div>
    </div>
  );
}

/* ---- Sync chip (ซิงค์ realtime หลังโหลดครั้งแรก) ---- */
function SyncIndicator() {
  return (
    <>
      <div className="tmk-syncbar" aria-hidden="true"></div>
      <div className="tmk-syncchip"><span className="splash-ring"></span>กำลังซิงค์ข้อมูล…</div>
    </>
  );
}

/* ---- Spotlight Search ---- */
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
const modKey = isMac ? '⌘' : 'Ctrl+';

function Spotlight({ onClose, onGo }) {
  const { t } = useLang();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setIdx(0); }, [q]);

  const ql = q.toLowerCase().trim();
  const results = [];

  // Helper — safe lowercase (handles null/undefined/non-string)
  const lc = (v) => String(v || '').toLowerCase();

  if (ql) {
    // Tasks
    (TMK.tasks || []).filter(t => lc(t.title).includes(ql) || lc(t.detail).includes(ql)).slice(0, 5).forEach(t => {
      const c = (TMK.campaigns || []).find(x => x.id === t.camp);
      results.push({ cat: 'งาน', icon: 'listChecks', label: t.title, sub: `${t.date} · ${c?.name || ''}`, color: c?.color, action: () => { onGo('planner', 'kanban'); onClose(); } });
    });
    // Products
    (TMK.products || []).filter(p => lc(p.name).includes(ql)).slice(0, 3).forEach(p => {
      results.push({ cat: 'สินค้า', icon: 'bag', label: p.name, sub: `${B(p.price)} · ขาย ${N(p.units)} ชิ้น`, color: 'var(--accent)', action: () => { onGo('catalog', 'products'); onClose(); } });
    });
    // Campaigns
    (TMK.campaigns || []).filter(c => lc(c.name).includes(ql)).slice(0, 3).forEach(c => {
      results.push({ cat: 'แคมเปญ', icon: 'megaphone', label: c.name, sub: `${c.start}–${c.end}`, color: c.color, action: () => { onGo('catalog', 'campaigns'); onClose(); } });
    });
    // Staff
    (TMK.staff || []).filter(s => lc(s.name).includes(ql) || lc(s.role).includes(ql)).forEach(s => {
      results.push({ cat: 'ทีม', icon: 'users', label: s.name, sub: s.role, color: s.color, action: () => { onGo('settings', 'roles'); onClose(); } });
    });
    // Channels
    (TMK.channels || []).filter(c => lc(c.name).includes(ql)).forEach(c => {
      results.push({ cat: 'ช่องทาง', icon: 'layers', label: c.name, sub: `เป้า ${Bk(c.target)}`, color: c.hex, action: () => { onGo('sales', 'channels'); onClose(); } });
    });
    // Navigation
    [{ l: 'หน้าหลัก', s: 'home' }, { l: 'ยอดขาย', s: 'sales', sub: 'overview' }, { l: 'ปฏิทิน', s: 'planner', sub: 'calendar' }, { l: 'Kanban', s: 'planner', sub: 'kanban' }, { l: 'ไทม์ไลน์', s: 'planner', sub: 'timeline' }, { l: 'สินค้า', s: 'catalog', sub: 'products' }, { l: 'แคมเปญ', s: 'settings', sub: 'campaigns' }]
      .filter(n => lc(n.l).includes(ql)).forEach(n => {
        results.push({ cat: 'นำทาง', icon: 'arrowR', label: `ไปที่ ${n.l}`, sub: '', color: 'var(--ink-3)', action: () => { onGo(n.s, n.sub); onClose(); } });
      });
  }

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[idx]) { results[idx].action(); }
    else if (e.key === 'Escape') { onClose(); }
  };

  // Group by cat
  const grouped = {};
  results.forEach((r, i) => { r._i = i; grouped[r.cat] = grouped[r.cat] || []; grouped[r.cat].push(r); });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', justifyContent: 'center', paddingTop: '12vh' }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,18,32,0.45)', backdropFilter: 'blur(8px)' }}></div>
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', width: '100%', maxWidth: 580, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--sh-pop)', overflow: 'hidden', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
        {/* Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <span style={{ width: 20, height: 20, flexShrink: 0, color: 'var(--ink-3)' }}><Icon name="search" /></span>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="ค้นหางาน สินค้า แคมเปญ ทีม..."
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 'var(--fs-h3)', fontWeight: 500, color: 'var(--ink)', fontFamily: 'var(--font)' }} />
          <kbd style={{ fontFamily: 'var(--mono)', fontSize: 'var(--fs-micro)', color: 'var(--ink-3)', border: '1px solid var(--line)', borderRadius: 5, padding: '2px 6px', background: 'var(--surface-2)' }}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {!ql && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink-3)' }}>
              <div style={{ fontSize: 'var(--fs-sm)', marginBottom: 4 }}>พิมพ์เพื่อค้นหา</div>
              <div className="cap">งาน · สินค้า · แคมเปญ · ทีม · ช่องทาง · นำทาง</div>
            </div>
          )}
          {ql && results.length === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink-3)' }}>
              <div style={{ fontSize: 'var(--fs-sm)' }}>ไม่พบผลลัพธ์สำหรับ "{q}"</div>
            </div>
          )}
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <div className="eyebrow" style={{ padding: '10px 20px 4px' }}>{cat}</div>
              {items.map(r => (
                <button key={r._i} onClick={r.action} onMouseEnter={() => setIdx(r._i)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 20px', border: 'none', background: idx === r._i ? 'var(--accent-soft)' : 'transparent', color: 'var(--ink)', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font)', transition: 'background 0.08s' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 'var(--r-sm)', background: (r.color || 'var(--ink-3)') + '18', color: r.color || 'var(--ink-3)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name={r.icon} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="sm" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
                    {r.sub && <div className="cap" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sub}</div>}
                  </div>
                  {idx === r._i && <span className="cap" style={{ flexShrink: 0 }}>↵ เปิด</span>}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div style={{ padding: '8px 20px', borderTop: '1px solid var(--line)', display: 'flex', gap: 16, justifyContent: 'center' }}>
            <span className="cap row" style={{ gap: 4 }}><kbd style={{ fontFamily: 'var(--mono)', fontSize: 9, border: '1px solid var(--line)', borderRadius: 3, padding: '1px 4px' }}>↑↓</kbd> เลือก</span>
            <span className="cap row" style={{ gap: 4 }}><kbd style={{ fontFamily: 'var(--mono)', fontSize: 9, border: '1px solid var(--line)', borderRadius: 3, padding: '1px 4px' }}>↵</kbd> เปิด</span>
            <span className="cap row" style={{ gap: 4 }}><kbd style={{ fontFamily: 'var(--mono)', fontSize: 9, border: '1px solid var(--line)', borderRadius: 3, padding: '1px 4px' }}>esc</kbd> ปิด</span>
          </div>
        )}
      </div>
    </div>
  );
}

const NAV_DEF = [
  { id: 'home', labelKey: 'navHome', icon: 'home' },
  { id: 'sales', labelKey: 'navSales', icon: 'sales', subs: [
    { id: 'overview', labelKey: 'subOverview', icon: 'sales' },
    { id: 'channels', labelKey: 'subChannels', icon: 'layers' },
    { id: 'ads', labelKey: 'subAds', icon: 'zap' },
    { id: 'customers', labelKey: 'subCustomers', icon: 'users' },
    { id: 'daily', labelKey: 'subDaily', icon: 'pencil' },
    { id: 'monthly', labelKey: 'subMonthly', icon: 'target' },
    { id: 'status', labelKey: 'subStatus', icon: 'listChecks' },
  ]},
  { id: 'planner', labelKey: 'navPlanner', icon: 'planner', subs: [
    { id: 'calendar', labelKey: 'subCalendar', icon: 'calendarDays' },
    { id: 'kanban', labelKey: 'subKanban', icon: 'listChecks' },
    { id: 'timeline', labelKey: 'subTimeline', icon: 'route' },
  ]},
  { id: 'catalog', labelKey: 'navCatalog', icon: 'catalog', subs: [
    { id: 'products', labelKey: 'subProducts', icon: 'bag' },
    { id: 'po', labelKey: 'subPO', icon: 'box' },
  ]},
];
// Resolve labels from i18n at render time
function useNav() {
  const { t } = useLang();
  return NAV_DEF.map(n => ({
    ...n, label: t(n.labelKey),
    subs: n.subs?.map(s => ({ ...s, label: t(s.labelKey) })),
  }));
}
const DEFAULT_SUB = { sales: 'overview', planner: 'calendar', catalog: 'products', settings: 'general' };
const ACCENTS = { '#0a5aa0': '#033f78', '#b07d33': '#946614', '#1f8a5b': '#176c47', '#b8543a': '#97432d' };

// Hardcoded defaults (no tweaks panel)
const navStyle = 'panel';
const accent = '#0a5aa0';
const mobilePreview = false;

export default function App() {
  return (
    <LangProvider>
      <ToastProvider>
        <DataProvider>
          <AppShellWithUser />
        </DataProvider>
      </ToastProvider>
    </LangProvider>
  );
}

// Session หมดอายุหลังไม่ได้ใช้งานครบ 7 วัน → ต้อง login ใหม่
const SESSION_MAX_DAYS = 7;
function loadValidSession() {
  try {
    const saved = localStorage.getItem('tmk-user');
    if (!saved) return null;
    const u = JSON.parse(saved);
    if (u?.loginAt) {
      const ageMs = Date.now() - new Date(u.loginAt).getTime();
      if (ageMs > SESSION_MAX_DAYS * 86400000) {
        localStorage.removeItem('tmk-user'); // ไม่ได้เปิดใช้ครบ 7 วัน → ล้าง session (คงอีเมลที่จำไว้)
        return null;
      }
    }
    // sliding window: ต่ออายุทุกครั้งที่เปิดใช้ → หมดอายุเฉพาะเมื่อไม่ได้เปิดเลยครบ 7 วัน
    const refreshed = { ...u, loginAt: new Date().toISOString() };
    try { localStorage.setItem('tmk-user', JSON.stringify(refreshed)); } catch {}
    return refreshed;
  } catch { return null; }
}

function AppShellWithUser() {
  const { version } = useData();
  return (
    <UserProvider version={version}>
      <AppInner />
    </UserProvider>
  );
}

function AppInner() {
  const { t, lang, setLang } = useLang();
  const { toast } = useToast();
  const { loading: dataLoading, error: dataError, version: dataVersion, reload: dataReload } = useData();
  const { user: currentUserCtx } = useUser() || {};
  // version bumps when Supabase data arrives → force re-render of all views
  const NAV = useNav();

  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('tmk-dark') === 'true'; } catch { return false; }
  });
  // Session persist: load from localStorage (หมดอายุ 7 วัน → loadValidSession คืน null)
  const [currentUser, setCurrentUser] = useState(() => loadValidSession());
  const [authed, setAuthed] = useState(() => Boolean(loadValidSession()));
  const [modal, setModal] = useState(null);
  const [confirmClose, setConfirmClose] = useState(null); // for unsaved changes
  const [spotlight, setSpotlight] = useState(false);
  // Persist section + subMap → กด refresh แล้วอยู่หน้าเดิม
  const [section, setSection] = useState(() => {
    try { return localStorage.getItem('tmk-section') || 'home'; } catch { return 'home'; }
  });
  const [subMap, setSubMap] = useState(() => {
    try {
      const saved = localStorage.getItem('tmk-submap');
      return saved ? { ...DEFAULT_SUB, ...JSON.parse(saved) } : DEFAULT_SUB;
    } catch { return DEFAULT_SUB; }
  });
  const [tasks, setTasks] = useState(TMK.tasks);
  // Sync local tasks state เมื่อ Supabase data update (version bump)
  useEffect(() => {
    setTasks([...(TMK.tasks || [])]);
  }, [dataVersion]);

  // Persist section + subMap ทุกครั้งที่เปลี่ยน → refresh แล้วอยู่หน้าเดิม
  useEffect(() => {
    try { localStorage.setItem('tmk-section', section); } catch {}
  }, [section]);
  useEffect(() => {
    try { localStorage.setItem('tmk-submap', JSON.stringify(subMap)); } catch {}
  }, [subMap]);
  const [drawer, setDrawer] = useState(false);
  const [notif, setNotif] = useState(false);
  const [menu, setMenu] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [guide, setGuide] = useState(null); // { topicId, steps, current, onDone }
  const contentRef = useRef(null);

  const nav = NAV.find(n => n.id === section);
  // Settings/profile/help ไม่อยู่ใน NAV แต่มี sub-tabs — อ่านจาก subMap ตรง
  const SECTIONS_WITH_SUBS = ['settings'];
  const sub = (nav?.subs || SECTIONS_WITH_SUBS.includes(section)) ? subMap[section] : null;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', !!dark);
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-2', dark ? `color-mix(in srgb, ${accent} 48%, white)` : (ACCENTS[accent] || accent));
    try { localStorage.setItem('tmk-dark', dark ? 'true' : 'false'); } catch {}
  }, [dark]);

  // สิทธิ์แก้ไข: 'viewer' = ดูอย่างเดียว (เจ้าของ/แอดมิน/ผู้แก้ไข = แก้ได้) — default viewer ถ้าไม่อยู่ในระบบ
  const canEdit = (currentUserCtx?.role || 'viewer') !== 'viewer';
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;
  if (typeof window !== 'undefined') window.__canEdit = canEdit; // ให้ view อื่น (kanban drag, settings) เช็คได้

  useEffect(() => {
    window.__openModal = (type, data) => {
      if (!canEditRef.current) { toast('บัญชีนี้เป็นสิทธิ์ "ดูอย่างเดียว" — แก้ไขข้อมูลไม่ได้ (ติดต่อแอดมินเพื่อขอสิทธิ์)', 'warn'); return; }
      setModal({ type, data });
    };
    window.__toast = toast;
    window.__goSection = (sec, s) => go(sec, s);
    window.__startGuide = (topicId, steps, onDone) => {
      // Navigate to first step
      const first = steps[0];
      if (first.nav) go(first.nav[0], first.nav[1]);
      setGuide({ topicId, steps, current: 0, onDone });
    };
  }, [toast]);

  // Show onboarding on first login
  useEffect(() => {
    if (authed) {
      try {
        const seen = localStorage.getItem('tmk-onboarded');
        if (!seen) setShowOnboarding(true);
      } catch {}
    }
  }, [authed]);

  const completeOnboarding = useCallback(() => {
    setShowOnboarding(false);
    try { localStorage.setItem('tmk-onboarded', 'true'); } catch {}
  }, []);
  useEffect(() => {
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSpotlight(s => !s); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const closeModal = () => { setModal(null); setConfirmClose(null); };
  const logout = () => {
    try { const u = JSON.parse(localStorage.getItem('tmk-user') || 'null'); if (u?.email) logAudit({ action: 'logout', entityType: 'auth', entityName: u.email, summary: `ออกจากระบบ (${u.email})` }); } catch {}
    setMenu(false); setDrawer(false); setAuthed(false); setCurrentUser(null);
    setSection('home'); setSubMap(DEFAULT_SUB);
    try {
      localStorage.removeItem('tmk-user');
      localStorage.removeItem('tmk-section');
      localStorage.removeItem('tmk-submap');
    } catch {}
    window.dispatchEvent(new Event('tmk-user-change'));
  };

  // Called by LoginScreen — persists user + flips authed
  const handleLogin = (email, remember) => {
    const userEmail = email || 'jiraphon.e@tmk.co';
    const user = { email: userEmail, loginAt: new Date().toISOString() };
    try {
      localStorage.setItem('tmk-user', JSON.stringify(user));
      // จำการเข้าสู่ระบบ → เก็บอีเมลไว้เติมให้อัตโนมัติครั้งถัดไป
      if (remember) { localStorage.setItem('tmk-remember', 'true'); localStorage.setItem('tmk-remember-email', userEmail); }
      else { localStorage.removeItem('tmk-remember'); localStorage.removeItem('tmk-remember-email'); }
    } catch {}
    setCurrentUser(user);
    setAuthed(true);
    window.dispatchEvent(new Event('tmk-user-change'));
    logAudit({ action: 'login', entityType: 'auth', entityName: userEmail, summary: `เข้าสู่ระบบ (${userEmail})` });
  };

  const go = (sec, s) => {
    setSection(sec);
    if (s) setSubMap(m => ({ ...m, [sec]: s }));
    setDrawer(false); setNotif(false); setMenu(false);
    if (contentRef.current) contentRef.current.scrollTop = 0;
  };

  // ===== แจ้งเตือน — แยก 3 แบบ: วันนี้ / ตามวันที่ / เดือนที่แล้ว =====
  // เฉพาะงานของหน้าที่ผู้ใช้ปัจจุบัน (admin เห็นทั้งหมด) — ข้อมูลจริงจาก Supabase
  const readFlag = (k) => { try { return localStorage.getItem(k) !== 'false'; } catch { return true; } };
  const notifOn = readFlag('tmk-notif-overdue');
  const todayDay = TMK.consts.DAY; // วันจริง
  const myDuty = currentUserCtx?.name || '';
  const myDept = currentUserCtx?.department || '';
  const seeAll = currentUserCtx?.role === 'admin';
  const isMine = (tk) => seeAll || (tk.responsible || []).some(r => r === myDuty || r === myDept);
  // ผลต่างวันแบบวันที่จริง (รองรับข้ามเดือน/ปี) — ไม่ใช่แค่เลขวัน
  const _todayIso = todayISO();
  const diffOf = (x) => { const iso = x.dateISO || parseTaskDate(x.date); if (!iso) return null; return Math.round((new Date(iso + 'T00:00:00') - new Date(_todayIso + 'T00:00:00')) / 86400000); };
  const openTasks = notifOn ? tasks.filter(x => x.status !== 'done' && isMine(x)) : [];

  // 1) วันนี้
  const notifsToday = openTasks.filter(x => diffOf(x) === 0)
    .map(x => ({ ...x, kind: 'task', sev: 'today', txt: t('dueToday') }));
  // 2) ตามวันที่ (เกินกำหนด + ใกล้ถึง ภายใน reminderDays)
  const notifsDated = openTasks.filter(x => { const d = diffOf(x); return d != null && d !== 0; })
    .map(x => { const diff = diffOf(x); return { ...x, kind: 'task', sev: diff < 0 ? 'overdue' : 'soon', txt: diff < 0 ? t('overdueBy', -diff) : t('dueIn', diff), _diff: diff }; })
    .filter(n => n.sev === 'overdue' || n._diff <= (n.reminderDays || 1))
    .sort((a, b) => a._diff - b._diff);
  // 2.5) ยังไม่ได้กรอกยอดขายวันนี้
  const notifsTodaySales = (notifOn && !((TMK.dailyMonth || []).some(d => d.d === todayDay)))
    ? [{ id: 'today-sales', kind: 'todaysales', title: 'ยังไม่ได้กรอกยอดขายวันนี้', txt: 'กรอกเลย' }]
    : [];
  // 3) เดือนที่แล้ว — เตือนถ้ายังไม่ได้สรุปยอดเดือนก่อน (จาก monthly_history จริง)
  const notifsLastMonth = (() => {
    if (!notifOn) return [];
    const cm = TMK.consts.current_month, cy = TMK.consts.current_year;
    const pm = cm === 1 ? 12 : cm - 1;
    const py = cm === 1 ? cy - 1 : cy;
    const rec = (TMK.monthly || []).find(m => m.month === pm && m.year === py);
    if (rec && rec.actual > 0) return [];
    return [{ id: 'lastmonth', kind: 'lastmonth', title: `ยังไม่ได้สรุปยอดเดือน${THAI_MONTHS[pm - 1]}`, txt: 'กรอกย้อนหลัง' }];
  })();

  const notifGroups = [
    { key: 'todaysales', label: 'บันทึกวันนี้', items: notifsTodaySales, color: 'var(--accent)' },
    { key: 'today', label: 'วันนี้', items: notifsToday, color: 'var(--warn)' },
    { key: 'dated', label: 'ตามวันที่', items: notifsDated, color: 'var(--info)' },
    { key: 'lastmonth', label: 'เดือนที่แล้ว', items: notifsLastMonth, color: 'var(--bad)' },
  ].filter(g => g.items.length > 0);
  const notifs = [...notifsTodaySales, ...notifsToday, ...notifsDated, ...notifsLastMonth];

  const onNotifClick = (n) => {
    setNotif(false);
    if (n.kind === 'todaysales') { window.__openModal('record', { date: todayISO() }); return; }
    if (n.kind === 'lastmonth') { go('sales', 'status'); setTimeout(() => window.__openModal('historical'), 100); return; }
    go('planner', 'kanban');
    setTimeout(() => window.__openModal('task', { ...n, channel: Array.isArray(n.channel) ? n.channel : [n.channel] }), 100);
  };

  const renderView = () => {
    switch (section) {
      case 'home': return <HomeView go={go} />;
      case 'sales': return ['daily','monthly','status'].includes(sub) ? <EntryView sub={sub} /> : <SalesView sub={sub} />;
      case 'planner': return <PlannerView sub={sub} tasks={tasks} setTasks={setTasks} />;
      case 'catalog': return <CatalogView sub={sub} />;
      case 'settings': return <SettingsView sub={sub} dark={dark} setDark={setDark} />;
      case 'profile': return <ProfileView tasks={tasks} />;
      default: return null;
    }
  };

  const counts = { kanban: tasks.filter(x => x.status !== 'done').length };

  // Special sections not in NAV (profile, settings, help)
  const SPECIAL_LABELS = { profile: 'โปรไฟล์', settings: 'ตั้งค่า' };
  const subLabel = nav?.subs?.find(s => s.id === sub)?.label || SPECIAL_LABELS[section];
  const topnav = navStyle === 'topnav';

  const Shell = ({ forced }) => (
    <div className={'app' + (forced ? ' force-mobile' : '')}>
      {spotlight && <Spotlight onClose={() => setSpotlight(false)} onGo={go} />}
      {/* ---------- Icon Rail (desktop) ---------- */}
      <nav className="rail desktop-only">
        <div className="rail-brand"><img src={tmkLogo} alt="TMK" /></div>
        <div className="rail-items">
          {NAV.map(n => (
            <button key={n.id} className={'rail-btn' + (section === n.id ? ' active' : '')} onClick={() => go(n.id)}>
              <Icon name={n.icon} />
              <span className="rail-btn-label">{n.label}</span>
            </button>
          ))}
        </div>
        <div className="rail-foot">
          <button className="rail-icon-sm" onClick={() => setShowHelp(true)} title="ช่วยเหลือ">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
          <div style={{ position: 'relative' }}>
            <RailAvatar onClick={() => setMenu(m => !m)} />
            {menu && <ProfileMenu go={go} dark={dark} setDark={setDark} close={() => setMenu(false)} onLogout={logout} />}
          </div>
        </div>
      </nav>

      {/* ---------- Context Panel (panel variation) ---------- */}
      {!topnav && nav?.subs && (
        <aside className="panel desktop-only">
          <div className="panel-head">
            <div className="panel-title">{nav.label}</div>
            <div className="panel-sub">{t(nav.id === 'sales' ? 'panelSalesSub' : nav.id === 'planner' ? 'panelPlannerSub' : nav.id === 'catalog' ? 'panelCatalogSub' : 'panelSystemSub')}</div>
          </div>
          <div className="panel-group">
            {nav.subs.map(s => (
              <button key={s.id} className={'panel-item' + (sub === s.id ? ' active' : '')} onClick={() => go(nav.id, s.id)}>
                <Icon name={s.icon} />{s.label}
                {counts[s.id] != null && <span className="count">{counts[s.id]}</span>}
              </button>
            ))}
          </div>
        </aside>
      )}

      {/* ---------- Main ---------- */}
      <div className="main">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setDrawer(true)}><Icon name="menu" /></button>
          <div className="topbar-titles">
            {!forced && nav?.subs && <div className="topbar-crumb desktop-only">{nav.label} <Icon name="chevR" /> {subLabel}</div>}
            <div className="topbar-title">{subLabel || nav?.label || SPECIAL_LABELS[section] || ''}</div>
          </div>
          <div className="topbar-spacer"></div>
          <div className="topbar-actions">
            {!canEdit && <span className="chip" title="บัญชีนี้แก้ไขข้อมูลไม่ได้ — ติดต่อแอดมินเพื่อขอสิทธิ์" style={{ background: 'var(--warn-soft)', color: 'var(--warn)', fontWeight: 600 }}><Icon name="eye" /> ดูอย่างเดียว</span>}
            <button className="search desktop-only" onClick={() => setSpotlight(true)} style={{ cursor: 'pointer' }}>
              <Icon name="search" /><span style={{ flex: 1, color: 'var(--ink-3)', fontSize: 'var(--fs-sm)' }}>{t('search')}...</span><kbd>{modKey}K</kbd>
            </button>
            <button className="icon-btn" onClick={() => setNotif(n => !n)}>
              <Icon name="bell" />{notifs.length > 0 && <span className="dot"></span>}
            </button>
          </div>
        </header>

        {/* sub tabs inside .content */}
        <div className="content" ref={contentRef}>
          {topnav && nav?.subs && (
            <div className="desktop-only content-inner" style={{ marginBottom: 16 }}>
              <div className="segbar" style={{ display: 'inline-flex', maxWidth: '100%' }}>
                {nav.subs.map(s => (
                  <button key={s.id} className={'seg' + (sub === s.id ? ' active' : '')} onClick={() => go(nav.id, s.id)}>
                    <Icon name={s.icon} />{s.label}
                    {counts[s.id] != null && <span className="chip" style={{ marginLeft: 2 }}>{counts[s.id]}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
          {nav?.subs && (
            <div className="mobile-only content-inner" style={{ marginBottom: 16 }}>
              <div className="segbar">
                {nav.subs.map(s => (
                  <button key={s.id} className={'seg' + (sub === s.id ? ' active' : '')} onClick={() => go(nav.id, s.id)}>
                    <Icon name={s.icon} />{s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {renderView()}
        </div>
      </div>

      {/* notifications — click navigates to task */}
      {notif && (
        <>
          <div className="scrim" style={{ background: 'transparent' }} onClick={() => setNotif(false)}></div>
          <div className="notif-pop">
            <div className="row between" style={{ padding: '6px 10px 10px' }}>
              <span className="h3">{t('notifications')}</span><span className="chip chip-accent">{notifs.length}</span>
            </div>
            {notifGroups.length === 0 && (
              <div className="cap" style={{ padding: '16px 10px', textAlign: 'center', color: 'var(--ink-4)' }}>ไม่มีการแจ้งเตือน</div>
            )}
            {notifGroups.map(g => (
              <div key={g.key} style={{ marginBottom: 6 }}>
                <div className="cap" style={{ padding: '6px 10px 2px', fontWeight: 700, color: g.color }}>{g.label} ({g.items.length})</div>
                {g.items.map(n => (
                  <div key={n.id} className="row" onClick={() => onNotifClick(n)} style={{ gap: 10, padding: '9px 10px', borderRadius: 'var(--r-sm)', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: g.color, flexShrink: 0 }}></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="sm" style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</div>
                      {Array.isArray(n.responsible) && n.responsible.length > 0 && <div className="cap">{n.responsible.join(', ')}</div>}
                    </div>
                    <span className="cap" style={{ color: g.color, fontWeight: 600 }}>{n.txt}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {/* mobile drawer */}
      {drawer && (
        <>
          <div className="scrim" onClick={() => setDrawer(false)}></div>
          <div className="drawer">
            <div className="row between" style={{ marginBottom: 18, padding: '0 6px' }}>
              <div className="row" style={{ gap: 10 }}>
                <div className="rail-brand" style={{ margin: 0, width: 38, height: 38 }}><img src={tmkLogo} alt="TMK" /></div>
                <div><div className="h3">TMK Operation</div><div className="cap">ศูนย์ปฏิบัติการ</div></div>
              </div>
              <button className="icon-btn" onClick={() => setDrawer(false)}><Icon name="x" /></button>
            </div>
            {NAV.map(n => (
              <div key={n.id} style={{ marginBottom: 2 }}>
                <button className={'panel-item' + (section === n.id ? ' active' : '')} onClick={() => go(n.id)}>
                  <Icon name={n.icon} />{n.label}
                </button>
                {section === n.id && n.subs && (
                  <div style={{ paddingLeft: 16 }}>
                    {n.subs.map(s => (
                      <button key={s.id} className={'panel-item' + (sub === s.id ? ' active' : '')} onClick={() => go(n.id, s.id)} style={{ fontSize: 'var(--fs-sm)' }}>
                        <Icon name={s.icon} />{s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="divider" style={{ margin: '12px 0' }}></div>
            <button className="panel-item" onClick={() => go('profile')}><Icon name="users" />โปรไฟล์</button>
            <button className="panel-item" onClick={() => go('settings', 'general')}><Icon name="system" />ตั้งค่า</button>
            <button className="panel-item" onClick={() => { setDrawer(false); setShowHelp(true); }}><svg className="ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>ช่วยเหลือ</button>
            <button className="panel-item" style={{ color: 'var(--bad)' }} onClick={logout}><Icon name="external" />ออกจากระบบ</button>
          </div>
        </>
      )}

      {/* mobile bottom tab bar */}
      <nav className="tabbar mobile-only">
        <div className="tabbar-inner">
          {NAV.map(n => (
            <button key={n.id} className={'tab' + (section === n.id ? ' active' : '')} onClick={() => go(n.id)}>
              <Icon name={n.icon} /><span className="tab-label">{n.label}</span>
            </button>
          ))}
        </div>
      </nav>
      {canEdit && <button className="fab mobile-only" onClick={() => { go('planner', 'kanban'); setTimeout(() => window.__openModal('task'), 100); }}><Icon name="plus" /></button>}
    </div>
  );

  // สถานะโหลดข้อมูล: version===0 = ยังไม่เคยโหลดสำเร็จ (ครั้งแรก)
  const firstError = authed && dataVersion === 0 && !!dataError;
  const firstLoading = authed && dataVersion === 0 && dataLoading && !dataError;
  const showShell = authed && !firstError && !firstLoading;
  const syncing = authed && dataVersion >= 1 && dataLoading; // realtime reload หลังโหลดครั้งแรก

  return (
    <>
      {!authed && <LoginScreen onLogin={handleLogin} />}
      {firstLoading && <LoadingScreen />}
      {firstError && <DataErrorScreen error={dataError} onRetry={dataReload} />}
      {showShell && Shell({ forced: false })}
      {syncing && <SyncIndicator />}

      {/* Onboarding tour */}
      {showShell && showOnboarding && <Onboarding onComplete={completeOnboarding} />}

      {/* Help Center popup */}
      {authed && showHelp && !guide && (
        <div className="modal-scrim" onClick={() => setShowHelp(false)} style={{ zIndex: 9980 }}>
          <div onClick={e => e.stopPropagation()} style={{
            position: 'relative', width: '90%', maxWidth: 640, maxHeight: '80vh',
            background: 'var(--surface)', borderRadius: 'var(--r-xl)',
            boxShadow: 'var(--sh-pop)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'grid', placeItems: 'center' }}>
                <Icon name="sparkle" />
              </span>
              <div style={{ flex: 1 }}><div className="h3">ช่วยเหลือ</div><div className="cap">คู่มือการใช้งาน TMK Operation</div></div>
              <button className="icon-btn" onClick={() => setShowHelp(false)}><Icon name="x" /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              <HelpCenter onStartGuide={(topicId, steps, onDone) => {
                setShowHelp(false);
                const first = steps[0];
                if (first.nav) go(first.nav[0], first.nav[1]);
                setGuide({ topicId, steps, current: 0, onDone });
              }} />
            </div>
          </div>
        </div>
      )}

      {/* Interactive Guide Overlay */}
      {authed && guide && (
        <GuideOverlay
          steps={guide.steps}
          current={guide.current}
          onNext={() => {
            const nextIdx = guide.current + 1;
            if (nextIdx < guide.steps.length) {
              const nextStep = guide.steps[nextIdx];
              if (nextStep.nav) go(nextStep.nav[0], nextStep.nav[1]);
              setGuide({ ...guide, current: nextIdx });
            }
          }}
          onPrev={() => {
            if (guide.current > 0) {
              const prevIdx = guide.current - 1;
              const prevStep = guide.steps[prevIdx];
              if (prevStep.nav) go(prevStep.nav[0], prevStep.nav[1]);
              setGuide({ ...guide, current: prevIdx });
            }
          }}
          onClose={() => { setGuide(null); setShowHelp(true); }}
          onDone={() => { if (guide.onDone) guide.onDone(); setGuide(null); setShowHelp(true); }}
        />
      )}

      {/* Help button removed — now in rail */}

      {/* Confirm dialog for unsaved changes */}
      {confirmClose && (
        <ConfirmDialog
          title={t('unsavedTitle')}
          message={t('unsavedMsg')}
          confirmLabel={t('discardClose')}
          cancelLabel={t('goBack')}
          onConfirm={() => { closeModal(); }}
          onCancel={() => setConfirmClose(null)}
          danger
        />
      )}

      {authed && modal && (
        modal.type === 'record' ? <RecordSalesModal data={modal.data} onClose={closeModal} />
        : modal.type === 'task' ? <TaskModal data={modal.data} onClose={closeModal}
            onDelete={async (task) => {
              setTasks(ts => ts.filter(x => x.id !== task.id)); // optimistic remove
              closeModal();
              try {
                const { error } = await supabase.from('tmk_tasks').update({ deleted_at: new Date().toISOString() }).eq('id', task.id);
                if (error) throw error;
                logAudit({ action: 'delete', entityType: 'task', entityName: task.title, summary: `ลบงาน "${task.title}"` });
                if (dataReload) await dataReload();
                toast('ย้ายงานไปถังขยะแล้ว', 'success');
              } catch (err) {
                console.error('Task delete failed:', err);
                toast('ลบไม่สำเร็จ: ' + err.message, 'error');
              }
            }}
            onSubmit={async (task) => {
              // 1. Optimistic local update — เห็นทันที
              setTasks(ts => modal.data?.id ? ts.map(x => x.id === task.id ? task : x) : [task, ...ts]);
              closeModal();

              // 2. แปลง task → DB format + บันทึก Supabase
              try {
                // แปลงวันที่ Thai "18 มิ.ย." → ISO (ใช้ helper ร่วมจาก lib/dateUtils)
                const isoDate = parseTaskDate(task.date) || todayISO();
                const responsibleStr = Array.isArray(task.responsible) ? task.responsible.join(', ') : String(task.responsible || '');
                const channelStr = Array.isArray(task.channel) ? task.channel.join(', ') : String(task.channel || '');
                const dbTask = {
                  id: task.id,
                  date: isoDate,
                  camp: task.camp || null,
                  title: task.title || '',
                  detail: task.detail || '',
                  responsible: responsibleStr,
                  channel: channelStr,
                  status: task.status || 'todo',
                  priority: task.priority || 'medium',
                  reminder_days: Number(task.reminderDays || 1),
                };
                const { error } = await supabase.from('tmk_tasks').upsert(dbTask);
                if (error) throw error;
                // รายละเอียดประวัติ: สร้าง = ค่าที่กรอก / แก้ไข = ก่อน→หลัง
                const _stTH = { todo: 'รอทำ', inprogress: 'กำลังทำ', review: 'รอตรวจ', done: 'เสร็จ' };
                const _campName = (id) => (TMK.campaigns.find(c => c.id === id)?.name) || (id ? '-' : 'ไม่มี');
                const _norm = (t) => ({
                  'หัวข้อ': t?.title || '',
                  'วันที่': t?.dateISO || parseTaskDate(t?.date) || t?.date || '',
                  'สถานะ': _stTH[t?.status] || t?.status || '',
                  'แคมเปญ': _campName(t?.camp),
                  'ช่องทาง': (Array.isArray(t?.channel) ? t.channel : String(t?.channel || '').split(',').map(s => s.trim()).filter(Boolean)).join(', ') || 'ไม่มี',
                  'ผู้รับผิดชอบ': (Array.isArray(t?.responsible) ? t.responsible : String(t?.responsible || '').split(',').map(s => s.trim()).filter(Boolean)).join(', ') || '—',
                });
                const _after = _norm(task);
                let _fields = null, _changes = null;
                if (modal.data?.id) {
                  const _before = _norm(modal.data);
                  _changes = Object.keys(_after).filter(k => _before[k] !== _after[k]).map(k => ({ label: k, from: _before[k] || '—', to: _after[k] || '—' }));
                } else {
                  _fields = Object.entries(_after).map(([k, v]) => ({ label: k, value: v }));
                }
                logAudit({ action: modal.data?.id ? 'update' : 'create', entityType: 'task', entityName: task.title,
                  summary: `${modal.data?.id ? 'แก้ไข' : 'สร้าง'}งาน "${task.title}"`, fields: _fields, changes: _changes });
                // Reload data so calendar/kanban show latest from Supabase
                if (dataReload) await dataReload();
                toast(t('toastSaved'), 'success');
              } catch (err) {
                console.error('Task save failed:', err);
                toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
              }
            }} />
        : modal.type === 'product' ? <ProductModal data={modal.data} onClose={closeModal} />
        : modal.type === 'campaign' ? <CampaignModal data={modal.data} onClose={closeModal} />
        : modal.type === 'po' ? <POModal data={modal.data} onClose={closeModal} />
        : modal.type === 'monthlyTarget' ? <MonthlyTargetModal data={modal.data} onClose={closeModal} />
        : modal.type === 'adCampaign' ? <AdCampaignModal data={modal.data} onClose={closeModal} />
        : modal.type === 'customerSegment' ? <CustomerSegmentModal onClose={closeModal} />
        : modal.type === 'historical' ? <HistoricalEntryModal onClose={closeModal} />
        : null
      )}
    </>
  );
}

function RailAvatar({ onClick }) {
  const { user } = useUser() || {};
  return (
    <button className="rail-avatar" onClick={onClick}
      style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}>
      <UserIcon size={34} radius={10} />
    </button>
  );
}

function ProfileMenu({ go, dark, setDark, close, onLogout }) {
  const { user } = useUser() || {};
  return (
    <>
      <div className="scrim" style={{ background: 'transparent', zIndex: 94 }} onClick={close}></div>
      <div className="menu-pop">
        <div className="row" style={{ gap: 10, padding: '8px 10px 12px' }}>
          <UserIcon size={38} radius={10} />
          <div>
            <div className="sm" style={{ fontWeight: 700 }}>{user?.name || 'มัง'}</div>
            <div className="cap">{user?.email || 'jiraphon.e@tmk.co'}</div>
          </div>
        </div>
        <div className="divider"></div>
        <button className="menu-row" onClick={() => go('profile')}><Icon name="users" />โปรไฟล์</button>
        <button className="menu-row" onClick={() => go('settings', 'general')}><Icon name="system" />ตั้งค่า</button>
        <div className="divider"></div>
        <button className="menu-row danger" onClick={onLogout}><Icon name="external" />ออกจากระบบ</button>
      </div>
    </>
  );
}
