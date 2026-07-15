/* ============================================================
   TMK Operation — App shell, navigation, routing
   ============================================================ */
import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { TMK } from './data.js';
import { Icon, PageSkeleton, useMinSplash, FlowIcon } from './components.jsx';
import { ConfirmHost } from './ui-confirm.jsx';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton, SidebarFooter, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup } from '@/components/ui/dropdown-menu';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';
import { Loader2 } from 'lucide-react';
import tmkLogo from './assets/tmk-logo.png';
import { HomeView, SalesView } from './views-1.jsx';
import { Spotlight } from './Spotlight.jsx';
import { PublicTrackPage } from './PublicTrackPage.jsx';
// Heavy views — code-split เป็น chunk แยก ลด main bundle (~330 kB)
// views-1 (Home + Sales) คงเดิม เพราะ Home เป็นหน้าแรกหลัง login ต้องเร็ว
const PlannerView  = lazy(() => import('./views-planner.jsx').then(m => ({ default: m.PlannerView  })));
const CatalogView  = lazy(() => import('./views-catalog.jsx').then(m => ({ default: m.CatalogView  })));
const SettingsView = lazy(() => import('./views-settings.jsx').then(m => ({ default: m.SettingsView })));
const EntryView    = lazy(() => import('./views-entry.jsx').then(m => ({ default: m.EntryView })));
const FlowsView    = lazy(() => import('./views-flows.jsx').then(m => ({ default: m.FlowsView })));
const NotificationsCenter = lazy(() => import('./views-notifications.jsx').then(m => ({ default: m.NotificationsCenter })));
const SaleDataHub = lazy(() => import('./views-sale-submit.jsx').then(m => ({ default: m.SaleDataHub })));
const SalePerfView = lazy(() => import('./salePerf.jsx').then(m => ({ default: m.SalePerfView })));
const LogView = lazy(() => import('./views-log.jsx').then(m => ({ default: m.LogView })));
const PublicFlowShare = lazy(() => import('./views-flows.jsx').then(m => ({ default: m.PublicFlowShare })));
// dialogs — lazy per split file (PART 79 · ดึงออกจาก index · LoginScreen คง eager = auth gate)
const RecordSalesModal     = lazy(() => import('./modals-sale.jsx').then(m => ({ default: m.RecordSalesModal })));
const HistoricalEntryModal = lazy(() => import('./modals-sale.jsx').then(m => ({ default: m.HistoricalEntryModal })));
const TaskModal            = lazy(() => import('./modals-task.jsx').then(m => ({ default: m.TaskModal })));
const ProductModal         = lazy(() => import('./modals-catalog.jsx').then(m => ({ default: m.ProductModal })));
const OrderModal           = lazy(() => import('./modals-order.jsx').then(m => ({ default: m.OrderModal })));
const CampaignModal        = lazy(() => import('./modals-ads.jsx').then(m => ({ default: m.CampaignModal })));
const MonthlyTargetModal   = lazy(() => import('./modals-ads.jsx').then(m => ({ default: m.MonthlyTargetModal })));
const AdCampaignModal      = lazy(() => import('./modals-ads.jsx').then(m => ({ default: m.AdCampaignModal })));
const CustomerSegmentModal = lazy(() => import('./modals-ads.jsx').then(m => ({ default: m.CustomerSegmentModal })));
import { LoginScreen } from './LoginScreen.jsx';
import { LangProvider, useLang } from './i18n.jsx';
import { ToastProvider, useToast } from './toast.jsx';
import { supabase } from './lib/supabaseClient.js';
import { logAudit } from './lib/audit.js';
import { pushNotify, emailOfName, notify, stableNotifId, emailsForAudience } from './lib/notify.js';
import { initNotifStore, teardownNotifStore, prefOn as notifPrefOn } from './lib/notifStore.js';
import { NotifBell, NotifNavBadge } from './notif-bell.jsx';
import { parseTaskDate, todayISO, thaiDate } from './lib/dateUtils.js';
import { DataProvider, useData } from './dataContext.jsx';
import { UserProvider, useUser } from './userContext.jsx';
import { UpdateBanner, useUnseenVersion } from './WhatsNew.jsx';

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
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center space-y-6">
        <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-muted/30 shadow-sm border">
          <img src={tmkLogo} alt="TMK" className="h-10 w-10 object-contain" />
        </div>
        
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex items-center space-x-2 text-lg font-semibold tracking-tight">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span>กำลังโหลดข้อมูล</span>
          </div>
          <p className="text-sm text-muted-foreground min-h-[20px] animate-pulse">
            {tips[i]}
          </p>
        </div>
      </div>
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
        <Button onClick={retry} disabled={busy} style={{ marginTop: 18 }}>
          {busy ? 'กำลังลองใหม่…' : 'ลองใหม่อีกครั้ง'}
        </Button>
      </div>
    </div>
  );
}

/* ---- Sync chip (ซิงค์ realtime หลังโหลดครั้งแรก) ---- */
function SyncIndicator() {
  return (
    <>
      <div className="tmk-syncbar" aria-hidden="true"></div>
      <div className="tmk-syncchip-wrap"><div className="tmk-syncchip"><span className="sync-dot"></span>กำลังซิงค์ข้อมูล…</div></div>
    </>
  );
}


const NAV_DEF = [
  { id: 'home', labelKey: 'navHome', icon: 'home' },
  { id: 'sales', labelKey: 'navSales', icon: 'sales', subs: [
    { id: 'overview', labelKey: 'subOverview', icon: 'sales' },
    { id: 'channels', labelKey: 'subChannels', icon: 'layers' },
    { id: 'ads', labelKey: 'subAds', icon: 'zap' },
    { id: 'customers', labelKey: 'subCustomers', icon: 'users' },
    { id: 'monthly', labelKey: 'subMonthly', icon: 'pencil' },
  ]},
  // โครงการ (วางแผนงาน) — อยู่ใต้ยอดขาย
  { id: 'flows', labelKey: 'navFlows', icon: 'grid', subs: [
    { id: 'overview', labelKey: 'subFlowBoard', icon: 'grid' },
    { id: 'mytasks', labelKey: 'subMyTasks', icon: 'user' },
    { id: 'calendar', labelKey: 'subCalendar', icon: 'calendarDays' },
    { id: 'kanban', labelKey: 'subKanban', icon: 'listChecks' },
    { id: 'timeline', labelKey: 'subTimeline', icon: 'route' },
    { id: 'list', labelKey: 'subFlowList', icon: 'menu' },
    { id: 'history', labelKey: 'subFlowHistory', icon: 'clock' },
  ]},
  { id: 'catalog', labelKey: 'navCatalog', icon: 'sales', subs: [
    // เรียงตาม workflow: ดูข้อมูล (รายงาน→ออเดอร์→ลูกค้า) → กรอกข้อมูล (ส่งยอด→บันทึกขาย) → ฐานข้อมูล (แคตตาล็อก)
    { id: 'report', labelKey: 'subReport', icon: 'sales' },
    { id: 'perf', labelKey: 'subPerf', icon: 'flame' },
    { id: 'orders', labelKey: 'subOrders', icon: 'listChecks' },
    { id: 'crm', labelKey: 'subCrm', icon: 'users' },
    { id: 'data', labelKey: 'subDataHub', icon: 'checkCheck' },
    { id: 'shirts', labelKey: 'subShirts', icon: 'bag' },
  ]},
  // บันทึกกิจกรรม / Log — คุมสิทธิ์รายคนผ่าน locked_sections (LockPicker) เหมือนหน้าอื่น (default เข้าได้ · admin ล็อกรายคน)
  { id: 'logs', labelKey: 'navLogs', icon: 'clock' },
];
// Resolve labels from i18n at render time
function useNav() {
  const { t } = useLang();
  return NAV_DEF.map(n => ({
    ...n, label: t(n.labelKey), badge: n.badgeKey ? t(n.badgeKey) : undefined,
    subs: n.subs?.map(s => ({ ...s, label: t(s.labelKey) })),
  }));
}
const DEFAULT_SUB = { flows: 'overview', sales: 'overview', planner: 'calendar', catalog: 'report', settings: 'general', notifications: 'all' };

// รายการโครงการสำหรับ sidebar (งานทั่วไป + โครงการจริง · ไม่นับ config row/archived/private ของคนอื่น)
function sidebarFlows() {
  const me = window.__userEmail || '';
  const r = (TMK.flows || []).find(f => f.id === '__general__');
  const general = { id: '__general__', name: r?.name || 'งานทั่วไป', icon: r?.icon || '📋', defaultView: r?.defaultView || 'kanban', isGeneral: true };
  const real = (TMK.flows || []).filter(f => f.id !== '__general__' && !f.archived && (f.visibility !== 'private' || f.owner === me))
    .map(f => ({ id: f.id, name: f.name, icon: f.icon || '📋', defaultView: f.defaultView || 'kanban' }));
  return [general, ...real];
}
// เมนู "โครงการ" ใน sidebar — โชว์โครงการเป็นรายการ (แบบ Projects ของ Oripio)
function FlowsNav({ n, section, sub, go, activeFlow, pickFlow }) {
  const flows = sidebarFlows();
  const onBoard = section === 'flows' && sub !== 'overview' && sub !== 'mytasks';
  return (
    <Collapsible asChild defaultOpen={section === 'flows'} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={n.label} isActive={section === 'flows' && sub === 'overview'} onClick={() => go('flows', 'overview')}>
            <Icon name={n.icon} /><span>{n.label}</span>
            <span className="ml-auto inline-flex shrink-0 items-center justify-center transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"><Icon name="chevR" /></span>
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            <SidebarMenuSubItem>
              <SidebarMenuSubButton asChild isActive={section === 'flows' && sub === 'overview'}>
                <button onClick={() => go('flows', 'overview')}><Icon name="grid" className="size-3.5" /><span>ภาพรวมโครงการ</span></button>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
            <SidebarMenuSubItem>
              <SidebarMenuSubButton asChild isActive={section === 'flows' && sub === 'mytasks'}>
                <button onClick={() => go('flows', 'mytasks')}><Icon name="user" className="size-3.5" /><span>งานของฉัน</span></button>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
            {flows.map(f => (
              <SidebarMenuSubItem key={f.id}>
                <SidebarMenuSubButton asChild isActive={onBoard && activeFlow === f.id}>
                  <button onClick={() => pickFlow(f)}>
                    <FlowIcon icon={f.icon} className="size-4 shrink-0" />
                    <span className="truncate">{f.name}</span>
                  </button>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
            <SidebarMenuSubItem>
              <SidebarMenuSubButton asChild>
                <button onClick={() => { if (window.__createFlow) window.__createFlow(); else go('flows', 'overview'); }}><Icon name="plus" className="size-3.5" /><span>สร้างโครงการ</span></button>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
const ACCENTS = { '#4f46e5': '#4338ca', '#0a5aa0': '#033f78', '#b07d33': '#946614', '#1f8a5b': '#176c47', '#b8543a': '#97432d' };

const accent = '#4f46e5'; // indigo-600 — แบรนด์ active/selected/icon

// กันจอขาว: ถ้า render throw → แสดงหน้า error + ปุ่มล้างข้อมูลเข้าใหม่ (แทนจอว่างถาวร)
class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error('App crashed:', err); }
  render() {
    if (this.state.err) {
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg, #f3f6fb)', color: 'var(--ink, #10203a)' }}>
          <Card className="w-full max-w-[420px] p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full [&_svg]:size-7" style={{ background: 'var(--warn-soft, #fdf2d0)', color: 'var(--warn, #d99e16)' }}>
              <Icon name="alertTriangle" />
            </div>
            <h2 className="mb-2 text-lg font-bold" style={{ color: 'var(--ink)' }}>เกิดข้อผิดพลาด</h2>
            <p className="mb-6 text-[13px] leading-relaxed" style={{ color: 'var(--ink-4)' }}>ระบบสะดุดชั่วคราว — ลองรีเฟรช หรือล้างข้อมูลเข้าสู่ระบบแล้วเริ่มใหม่</p>
            <div className="flex justify-center gap-2.5">
              <Button variant="outline" onClick={() => location.reload()}>รีเฟรช</Button>
              <Button onClick={() => { try { localStorage.removeItem('tmk-user'); } catch { /* ignore */ } location.reload(); }}>ล้างข้อมูล &amp; เข้าใหม่</Button>
            </div>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}


export default function App() {
  // ลูกค้าเปิดลิงก์ ?track=<code> → หน้าติดตามสาธารณะ (ไม่ต้องล็อกอิน, ไม่โหลดข้อมูลร้าน)
  const trackCode = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('track') : null;
  if (trackCode != null) {
    return (
      <ErrorBoundary>
        <LangProvider><ToastProvider><PublicTrackPage code={trackCode} /></ToastProvider></LangProvider>
      </ErrorBoundary>
    );
  }
  // เปิดลิงก์ ?share=<token> → หน้าโครงการสาธารณะ อ่านอย่างเดียว (ไม่ต้องล็อกอิน · ไม่โหลดข้อมูลร้านทั้งหมด)
  const shareToken = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('share') : null;
  if (shareToken) {
    return (
      <ErrorBoundary>
        <LangProvider><ToastProvider>
          <Suspense fallback={<div className="min-h-screen grid place-items-center text-muted-foreground text-sm">กำลังโหลด…</div>}>
            <PublicFlowShare token={shareToken} />
          </Suspense>
        </ToastProvider></LangProvider>
      </ErrorBoundary>
    );
  }
  return (
    <ErrorBoundary>
      <LangProvider>
        <ToastProvider>
          <DataProvider>
            <AppShellWithUser />
          </DataProvider>
        </ToastProvider>
      </LangProvider>
    </ErrorBoundary>
  );
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
  const { t } = useLang();
  const { toast } = useToast();
  const { loading: dataLoading, error: dataError, version: dataVersion, reload: dataReload, refresh: dataRefresh, ensureLoaded: dataEnsure } = useData();
  const { user: currentUserCtx } = useUser() || {};
  // version bumps when Supabase data arrives → force re-render of all views
  const NAV = useNav();
  const unseenVersion = useUnseenVersion(); // จุดแดง "มีอะไรใหม่" บนเมนูโปรไฟล์

  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('tmk-dark') === 'true'; } catch { return false; }
  });
  // Auth จริง: session มาจาก Supabase Auth (persist/refresh ให้เองใน localStorage)
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false); // เช็ค session แรกเสร็จหรือยัง (กันจอ login กระพริบตอน restore)
  const authed = !!session;
  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; } // ยังไม่ตั้งค่า Supabase → ข้าม (กัน crash, DataProvider แจ้ง error เอง)
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) { setSession(data.session); setAuthReady(true); } });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (alive) setSession(s); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);
  const [modal, setModal] = useState(null);
  const [spotlight, setSpotlight] = useState(false);
  // Persist section + subMap → กด refresh แล้วอยู่หน้าเดิม
  const [section, setSection] = useState(() => {
    try { const s = localStorage.getItem('tmk-section') || 'home'; return s === 'planner' ? 'flows' : s; } catch { return 'home'; } // planner ถูกแทนด้วย flows (multi-flow)
  });
  const [subMap, setSubMap] = useState(() => {
    try {
      const saved = localStorage.getItem('tmk-submap');
      const merged = saved ? { ...DEFAULT_SUB, ...JSON.parse(saved) } : { ...DEFAULT_SUB };
      // migrate stale sub ids (เช่น sales 'daily'/'status' ที่ถูกรวมไปแล้ว) → กัน sub-nav ไม่มี active + breadcrumb ว่าง
      const valid = {}; NAV_DEF.forEach(n => { if (n.subs) valid[n.id] = n.subs.map(s => s.id); });
      Object.keys(merged).forEach(sec => { if (valid[sec] && !valid[sec].includes(merged[sec])) merged[sec] = DEFAULT_SUB[sec] || valid[sec][0]; });
      return merged;
    } catch { return DEFAULT_SUB; }
  });
  // โครงการที่เปิดอยู่ — single source of truth ที่ App (ไม่พึ่ง window.__activeFlow ที่ lag) → sidebar/breadcrumb/board อัปเดตพร้อมกันคลิกเดียว
  const [activeFlow, setActiveFlow] = useState(() => { try { return localStorage.getItem('tmk-flow') || '__general__'; } catch { return '__general__'; } });
  useEffect(() => { try { localStorage.setItem('tmk-flow', activeFlow); } catch { /* ignore */ } if (typeof window !== 'undefined') window.__activeFlow = activeFlow; }, [activeFlow]);
  useEffect(() => { if (typeof window !== 'undefined') window.__setFlow = (id) => setActiveFlow(id || '__general__'); }, []);
  // โครงการที่เปิดอยู่หาย (ถูกลบ/archive/ซ่อน) → กลับ "งานทั่วไป"
  useEffect(() => { if (activeFlow !== '__general__' && !sidebarFlows().find(f => f.id === activeFlow)) setActiveFlow('__general__'); }, [activeFlow, dataVersion]);
  const [tasks, setTasks] = useState(TMK.tasks);
  // Sync local tasks state เมื่อ Supabase data update (version bump)
  // ปรับ state ตอน render เมื่อ version เปลี่ยน (pattern ที่ React แนะนำ) แทน setState ใน effect → ไม่ render ซ้ำ
  const [tasksVer, setTasksVer] = useState(dataVersion);
  if (tasksVer !== dataVersion) {
    setTasksVer(dataVersion);
    setTasks([...(TMK.tasks || [])]);
  }

  // Persist section + subMap ทุกครั้งที่เปลี่ยน → refresh แล้วอยู่หน้าเดิม
  useEffect(() => {
    try { localStorage.setItem('tmk-section', section); } catch { /* ignore */ }
  }, [section]);
  useEffect(() => {
    try { localStorage.setItem('tmk-submap', JSON.stringify(subMap)); } catch { /* ignore */ }
  }, [subMap]);
  const [drawer, setDrawer] = useState(false);
  const [, setMenu] = useState(false);
  const contentRef = useRef(null);

  const nav = NAV.find(n => n.id === section);
  // Settings ไม่อยู่ใน NAV แต่มี sub-tabs — อ่านจาก subMap ตรง
  const SECTIONS_WITH_SUBS = ['settings'];
  const sub = (nav?.subs || SECTIONS_WITH_SUBS.includes(section)) ? subMap[section] : null;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', !!dark);
    root.style.setProperty('--accent', dark ? `color-mix(in srgb, ${accent} 62%, white)` : accent);
    root.style.setProperty('--accent-2', dark ? `color-mix(in srgb, ${accent} 40%, white)` : (ACCENTS[accent] || accent));
    try { localStorage.setItem('tmk-dark', dark ? 'true' : 'false'); } catch { /* ignore */ }
  }, [dark]);

  // สิทธิ์แก้ไข: 'viewer' = ดูอย่างเดียว (เจ้าของ/แอดมิน/ผู้แก้ไข = แก้ได้) — default viewer ถ้าไม่อยู่ในระบบ
  const canEdit = (currentUserCtx?.role || 'viewer') !== 'viewer';
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;
  if (typeof window !== 'undefined') {
    window.__canEdit = canEdit; // ให้ view อื่น (kanban drag, settings) เช็คได้
    window.__isAdmin = currentUserCtx?.role === 'admin'; // จัดการผู้ใช้/สิทธิ์ = admin เท่านั้น
    window.__userEmail = currentUserCtx?.email || ''; // ผู้ทำรายการ (created_by/by) ในระบบคลัง/CRM
    window.__lockedSections = currentUserCtx?.lockedSections || []; // หน้าใหญ่ที่ถูกล็อกของ user นี้ (admin = [] เสมอ)
  }

  useEffect(() => {
    window.__openModal = (type, data) => {
      if (!canEditRef.current) { toast('บัญชีนี้เป็นสิทธิ์ "ดูอย่างเดียว" — แก้ไขข้อมูลไม่ได้ (ติดต่อแอดมินเพื่อขอสิทธิ์)', 'warn'); return; }
      setModal({ type, data });
    };
    window.__toast = toast;
    window.__reload = dataReload; // full reload (ใช้เฉพาะที่จำเป็นจริง — retry/มาแก้ทั้งระบบ)
    window.__refresh = (tables) => (dataRefresh ? dataRefresh(tables) : dataReload?.()); // per-table refresh — ลด egress: หลังบันทึกดึงเฉพาะตารางที่เปลี่ยน
    window.__ensureLoaded = (keys) => dataEnsure?.(keys); // โหลดตาราง deferred (Sales/Settings) ตอนกดเข้า section
    window.__goSection = (sec, s) => go(sec, s);
  }, [toast]);

  // กันล้อเมาส์เปลี่ยนค่า input[type=number] เงียบๆ ตอน scroll ฟอร์มกรอกยอด/สินค้า
  // (Chrome/Firefox: focus ค้าง + scroll → ค่าเพิ่ม/ลด → ยอดเพี้ยนถูกเซฟจริงได้)
  useEffect(() => {
    const onWheel = (e) => {
      const t = e.target;
      if (t && t.tagName === 'INPUT' && t.type === 'number' && document.activeElement === t) t.blur();
    };
    document.addEventListener('wheel', onWheel, { passive: true });
    return () => document.removeEventListener('wheel', onWheel);
  }, []);

  // ===== Presence heartbeat — บันทึก "ออนไลน์" ของผู้ใช้ปัจจุบัน =====
  // upsert แถวของตัวเองทุก ~45 วิ ระหว่างแท็บเปิดอยู่ (+ ตอนเปิด/กลับมาที่แท็บ)
  // การ์ด "ทีมวันนี้" หน้าหลักอ่าน tmk_presence ทุก 30 วิ → online = last_seen ภายใน ~2.5 นาที
  // page/name อ่านผ่าน ref → effect ไม่ rerun ทุกครั้งที่เปลี่ยนหน้า (ไม่ทิ้ง/ตั้ง interval ใหม่)
  const presenceMetaRef = useRef({ page: section, name: currentUserCtx?.name || '' });
  presenceMetaRef.current = { page: section, name: currentUserCtx?.name || '' };
  useEffect(() => {
    const email = session?.user?.email;
    if (!email) return;
    const key = email.toLowerCase();
    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      const nowIso = new Date().toISOString();
      supabase.from('tmk_presence').upsert(
        { email: key, name: presenceMetaRef.current.name, page: presenceMetaRef.current.page, last_seen_at: nowIso, updated_at: nowIso },
        { onConflict: 'email' }
      ).then(() => {}, () => {}); // เงียบถ้าตารางยังไม่ถูกสร้าง (ยังไม่รัน migration)
    };
    beat();
    const id = setInterval(beat, 45000);
    const onVis = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [session]);

  useEffect(() => {
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSpotlight(s => !s); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const closeModal = () => { setModal(null); };
  const logout = async () => {
    const email = session?.user?.email;
    if (email) {
      logAudit({ action: 'logout', entityType: 'auth', entityName: email, summary: `ออกจากระบบ (${email})` });
      // mark offline ทันที — ตั้ง last_seen ย้อน 10 นาที (พ้นหน้าต่าง online แต่ยังนับเป็น "วันนี้")
      // ใช้ update (ไม่ใช่ upsert) → แก้แค่ 2 คอลัมน์ ไม่ทับ name/page ให้เป็น null
      supabase.from('tmk_presence').update(
        { last_seen_at: new Date(Date.now() - 600000).toISOString(), updated_at: new Date().toISOString() }
      ).eq('email', email.toLowerCase()).then(() => {}, () => {});
    }
    setMenu(false); setDrawer(false);
    setSection('home'); setSubMap(DEFAULT_SUB);
    try {
      localStorage.removeItem('tmk-section');
      localStorage.removeItem('tmk-submap');
    } catch { /* ignore */ }
    await supabase.auth.signOut(); // → onAuthStateChange เคลียร์ session → authed=false
  };

  // Called by LoginScreen หลัง signIn/signUp สำเร็จ — auth จริงทำใน LoginScreen, session เปลี่ยนเองผ่าน onAuthStateChange
  const handleLogin = (email) => {
    const userEmail = email || '';
    logAudit({ action: 'login', entityType: 'auth', entityName: userEmail, summary: `เข้าสู่ระบบ (${userEmail})` });
  };

  // ล็อกหน้าของ user นี้ — จุดคุมเดียวที่ go() ครอบทุกทางเข้า (sidebar/drawer/tabbar/breadcrumb/Spotlight/__goSection)
  // รองรับทั้ง section ใหญ่ (id) และหน้าย่อย (composite "section:sub" เช่น catalog:orders) เก็บใน locked_sections เดียวกัน
  const isLocked = (sec, s) => { const L = currentUserCtx?.lockedSections || []; return L.includes(sec) || (!!s && L.includes(sec + ':' + s)); };
  // หน้าย่อยแรกที่เข้าได้ของ section (null = ล็อกหมดทุกหน้าย่อย)
  const firstAllowedSub = (sec) => (NAV_DEF.find(n => n.id === sec)?.subs || []).map(x => x.id).find(id => !isLocked(sec, id)) || null;
  const go = (sec, s) => {
    if (isLocked(sec)) { toast('ไม่มีสิทธิ์เข้าหน้านี้ — ติดต่อแอดมิน', 'warn'); return; } // section ใหญ่ล็อก
    if (s && isLocked(sec, s)) { toast('ไม่มีสิทธิ์เข้าหน้านี้ — ติดต่อแอดมิน', 'warn'); return; } // หน้าย่อยที่ระบุถูกล็อก
    let target = s;
    const hasSubs = (NAV_DEF.find(n => n.id === sec)?.subs || []).length > 0;
    if (!target && hasSubs) { // คลิก header — ใช้ default; ถ้า default ล็อก → หน้าย่อยแรกที่เข้าได้
      const def = subMap[sec] || DEFAULT_SUB[sec];
      target = def && !isLocked(sec, def) ? def : firstAllowedSub(sec);
      if (!target) { toast('ไม่มีสิทธิ์เข้าหน้านี้ — ติดต่อแอดมิน', 'warn'); return; } // ล็อกทุกหน้าย่อย
    }
    setSection(sec);
    if (target) setSubMap(m => ({ ...m, [sec]: target }));
    setDrawer(false); setMenu(false);
    if (contentRef.current) contentRef.current.scrollTop = 0;
  };
  // section/หน้าย่อยปัจจุบันโดนล็อก (restore จาก localStorage / โดนล็อกสดผ่าน realtime) → เด้งออก
  // ก่อน roles โหลด lockedSections = [] จึงไม่ redirect มั่ว
  useEffect(() => {
    if (isLocked(section)) { setSection('home'); return; }
    if (sub && isLocked(section, sub)) { const alt = firstAllowedSub(section); alt ? setSubMap(m => ({ ...m, [section]: alt })) : setSection('home'); }
  }, [currentUserCtx?.lockedSections, section, sub]); // eslint-disable-line react-hooks/exhaustive-deps
  // เลือกโครงการ + ไปบอร์ด (คลิกเดียว · setActiveFlow ทำให้ sidebar/breadcrumb/board re-render พร้อมกัน)
  const pickFlow = (f) => { setActiveFlow(f.id); go('flows', f.defaultView && f.defaultView !== 'settings' ? f.defaultView : 'kanban'); };

  const myEmail = session?.user?.email || '';

  // เปิด store แจ้งเตือน (list + prefs + realtime "ช่องเดียว") ครั้งเดียวต่ออีเมล — กระดิ่ง+ศูนย์ใช้ store นี้ร่วมกัน
  useEffect(() => { if (myEmail) initNotifStore(myEmail); else teardownNotifStore(); }, [myEmail]);

  // due-sweep (PART 34): บันทึก "ใกล้ครบ/เลยกำหนด" ลง Inbox ถาวร 1 ครั้ง/เซสชัน — เฉพาะงานที่ "ฉัน" ได้รับมอบหมาย
  // เคารพ pref 'overdue' (ฝั่งผู้รับ) · stable id กันซ้ำข้ามวัน · งาน due ย้ายมาอยู่ Inbox แล้ว (เลิกซ้ำกับสัญญาณ)
  const dueSweptRef = useRef(false);
  useEffect(() => {
    if (dueSweptRef.current || dataVersion < 1 || !myEmail) return;
    if (!notifPrefOn('overdue')) return; // ปิดเตือนงาน → ไม่ต้องเขียน
    const allTasks = TMK.tasks || [];
    if (!allTasks.length) return;
    dueSweptRef.current = true;
    const today = todayISO();
    // เสร็จแล้ว = ตามสถานะ "done" ของโฟลว์นั้น (custom statuses) ไม่ใช่ hardcode 'done'
    const isDone = (t) => {
      const flow = (TMK.flows || []).find(f => (f.scopeId ?? f.id) === (t.flow || ''));
      const statuses = (flow?.statuses && flow.statuses.length) ? flow.statuses : null;
      return statuses ? statuses.filter(s => s.done).some(s => s.id === t.status) : t.status === 'done';
    };
    allTasks.forEach(t => {
      if (isDone(t)) return;
      const dueISO = t.dateEnd || t.dateISO || '';
      if (!dueISO) return;
      const diff = Math.round((new Date(dueISO + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
      const sev = diff < 0 ? 'overdue' : (diff >= 0 && diff <= (t.reminderDays || 1) ? 'due' : null);
      if (!sev) return;
      // เฉพาะงานที่ฉัน (ตามชื่อ/บทบาท/หน้าที่ที่ resolve เป็นอีเมล) ได้รับมอบหมาย
      if (!emailsForAudience(t.responsible || []).includes(myEmail)) return;
      const txt = sev === 'overdue' ? `เลยกำหนด ${-diff} วัน` : (diff === 0 ? 'ครบกำหนดวันนี้' : `ใกล้ครบ อีก ${diff} วัน`);
      notify({ recipients: [myEmail], selfOk: true, actor: '', id: stableNotifId('due', t.id, dueISO), kind: sev, severity: sev === 'overdue' ? 'urgent' : 'warn', title: `${t.title} — ${txt}`, flowId: t.flow ?? '', taskId: t.id, entityType: 'task' });
    });
  }, [dataVersion, myEmail]);

  // lazy-load (PART 33): โหลดตาราง deferred (adCamps/colorMix/sizeMix/fbMetrics) ตอนกดเข้า section ที่ใช้ — Sales/แคตตาล็อก/ตั้งค่า(export+คุมแอด)
  useEffect(() => {
    if (dataVersion < 1) return;
    if (section === 'sales' || section === 'catalog' || section === 'settings') dataEnsure?.(['adCamps', 'colorMix', 'sizeMix', 'fbMetrics']);
  }, [section, dataVersion, dataEnsure]);

  const renderView = () => {
    // Home + Sales (views-1) ไม่ lazy เพราะเป็นหน้าแรกหลัง login — ต้องเร็ว
    if (section === 'home') return <HomeView go={go} />;
    if (section === 'sales' && !['daily','monthly','status'].includes(sub)) return <SalesView sub={sub} />;
    // Heavy chunks — ห่อด้วย Suspense
    return (
      <Suspense fallback={<PageSkeleton />}>
        {/* sub submit/io = ลิงก์เก่า (ก่อนรวมเป็น Data Hub) → หน้าเดียวกัน */}
        {section === 'catalog' && sub === 'perf' ? <SalePerfView />
          : section === 'catalog' && (sub === 'data' || sub === 'submit' || sub === 'io' || sub === 'entry') ? <SaleDataHub />
          : section === 'sales' ? <EntryView sub={sub} />
          : section === 'notifications' ? <NotificationsCenter />
          : section === 'logs' ? <LogView />
          : section === 'flows' ? <FlowsView sub={sub} tasks={tasks} setTasks={setTasks} activeFlow={activeFlow} />
          : section === 'planner' ? <PlannerView sub={sub} tasks={tasks} setTasks={setTasks} />
          : section === 'catalog' ? <CatalogView sub={sub} />
          : section === 'settings' ? <SettingsView sub={sub} dark={dark} setDark={setDark} />
          : null}
      </Suspense>
    );
  };

  const counts = { kanban: tasks.filter(x => x.status !== 'done').length };

  // Special sections not in NAV (settings)
  const SPECIAL_LABELS = { settings: 'ตั้งค่า', notifications: 'การแจ้งเตือน' };
  const subLabel = nav?.subs?.find(s => s.id === sub)?.label || SPECIAL_LABELS[section];

  const isMobile = useIsMobile();
  const Shell = () => (
    <SidebarProvider className="app">
      {spotlight && <Spotlight onClose={() => setSpotlight(false)} onGo={go} />}
      {/* ---------- Desktop Sidebar ---------- */}
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-white text-sidebar-primary-foreground">
                  <img src={tmkLogo} alt="TMK" className="size-6 object-contain" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold text-[15px]">TMK Operation</span>
                  <span className="text-xs text-muted-foreground font-medium">ศูนย์ปฏิบัติการ</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup label="เมนู">
            <SidebarMenu>
              {NAV.map(n => (
                // หน้าโดนล็อก → เมนูแบน จาง + กุญแจ (ข้าม Collapsible/FlowsNav กัน subs กาง) · คลิกผ่าน go() ให้ toast
                isLocked(n.id) ? (
                  <SidebarMenuItem key={n.id}>
                    <SidebarMenuButton className="opacity-50" tooltip="ไม่มีสิทธิ์เข้าหน้านี้" onClick={() => go(n.id)}>
                      <Icon name={n.icon} />
                      <span>{n.label}</span>
                      <Icon name="lock" className="ml-auto size-3.5" />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : n.id === 'flows' ? (
                  <FlowsNav key={n.id} n={n} section={section} sub={sub} go={go} activeFlow={activeFlow} pickFlow={pickFlow} />
                ) : n.subs ? (
                  <Collapsible
                    key={n.id}
                    asChild
                    defaultOpen={section === n.id}
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={n.label} isActive={section === n.id && !sub} onClick={() => go(n.id)}>
                          <Icon name={n.icon} />
                          <span>{n.label}</span>
                          {n.badge && <span className="ml-2 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 whitespace-nowrap">{n.badge}</span>}
                          <span className="ml-auto inline-flex shrink-0 items-center justify-center transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"><Icon name="chevR" /></span>
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {n.subs.map(s => { const subLocked = isLocked(n.id, s.id); return (
                            <SidebarMenuSubItem key={s.id}>
                              <SidebarMenuSubButton asChild isActive={section === n.id && sub === s.id} className={subLocked ? 'opacity-50' : undefined}>
                                <button onClick={() => go(n.id, s.id)}>
                                  <span>{s.label}</span>
                                  {subLocked ? <Icon name="lock" className="ml-auto size-3 shrink-0" />
                                    : counts[s.id] != null && counts[s.id] > 0 ? (
                                      <span className="ml-auto bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full">{counts[s.id]}</span>
                                    ) : null}
                                </button>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ); })}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                ) : (
                  <SidebarMenuItem key={n.id}>
                    <SidebarMenuButton isActive={section === n.id} onClick={() => go(n.id)} tooltip={n.label}>
                      <Icon name={n.icon} />
                      <span>{n.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={section === 'notifications'} tooltip={t('navNotif')} onClick={() => go('notifications')}>
                <Icon name="bell" />
                <span>{t('navNotif')}</span>
                <NotifNavBadge />
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={section === 'settings' && sub === 'updates'} className={isLocked('settings') ? 'opacity-50' : undefined} tooltip={isLocked('settings') ? 'ไม่มีสิทธิ์เข้าหน้านี้' : 'มีอะไรใหม่'} onClick={() => go('settings', 'updates')}>
                <Icon name="sparkle" />
                <span>มีอะไรใหม่</span>
                {isLocked('settings') ? <Icon name="lock" className="ml-auto size-3.5" /> : unseenVersion && <span className="ml-auto inline-block size-2 rounded-full" style={{ background: 'var(--bad, #ef4444)' }} aria-label="มีเวอร์ชันใหม่" />}
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground outline-none"
                  >
                    <span className="relative">
                      <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarFallback className="rounded-lg font-semibold" style={{ backgroundColor: currentUserCtx?.color || '#e2e8f0', color: currentUserCtx?.color ? '#fff' : '#334155' }}>
                          {currentUserCtx?.name ? currentUserCtx.name.substring(0, 2).toUpperCase() : 'GR'}
                        </AvatarFallback>
                      </Avatar>
                      {unseenVersion && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-[var(--sidebar,#fff)]" style={{ background: 'var(--bad, #ef4444)' }} aria-hidden="true" />}
                    </span>
                    <div className="flex flex-col gap-0.5 leading-none flex-1 text-left">
                      <span className="font-semibold text-sm">{currentUserCtx?.name || 'Graphic'}</span>
                      <span className="text-xs text-muted-foreground">{currentUserCtx?.email || 'graphic@tmk.co'}</span>
                    </div>
                    <Icon name="chevD" className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg" side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                      <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarFallback className="rounded-lg font-semibold" style={{ backgroundColor: currentUserCtx?.color || '#e2e8f0', color: currentUserCtx?.color ? '#fff' : '#334155' }}>
                          {currentUserCtx?.name ? currentUserCtx.name.substring(0, 2).toUpperCase() : 'GR'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col gap-0.5 leading-none flex-1 text-left">
                        <span className="font-semibold text-sm">{currentUserCtx?.name || 'Graphic'}</span>
                        <span className="text-xs text-muted-foreground">{currentUserCtx?.email || 'graphic@tmk.co'}</span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => go('settings', 'general')} className="cursor-pointer">
                      <Icon name="system" className="size-4 mr-2 text-muted-foreground" />
                      ตั้งค่า
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive">
                    <Icon name="external" className="size-4 mr-2" />
                    ออกจากระบบ
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      {/* ---------- Main Inset ---------- */}
      <SidebarInset>
        <div className="main">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4 lg:h-[60px] lg:px-6">
            <SidebarTrigger className="-ml-1" />
            <div className="flex flex-1 items-center gap-2 overflow-hidden">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    {section === 'flows' ? (() => {
                      // breadcrumb ของ flows = สลับ "โครงการ + ภาพรวม" · อ่าน activeFlow จาก state (reactive · ไม่ lag)
                      const flows = sidebarFlows();
                      const cur = flows.find(f => f.id === activeFlow);
                      const pick = (f) => pickFlow(f);
                      return (
                        <DropdownMenu>
                          <DropdownMenuTrigger className="flex items-center gap-1.5 focus:outline-none">
                            {sub === 'overview' ? <Icon name="grid" className="size-4 opacity-70" /> : sub === 'mytasks' ? <Icon name="user" className="size-4 opacity-70" /> : <FlowIcon icon={cur?.icon} className="size-4" />}
                            <span className="truncate max-w-[180px]">{sub === 'overview' ? 'โครงการทั้งหมด' : sub === 'mytasks' ? 'งานของฉัน' : (cur?.name || 'โครงการ')}</span>
                            <Icon name="down" className="size-3 ml-0.5 opacity-50" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-56">
                            <DropdownMenuItem onClick={() => go('flows', 'overview')} className="cursor-pointer gap-2"><Icon name="grid" className="size-4" /><span className="flex-1">ภาพรวมโครงการ</span>{sub === 'overview' && <Icon name="check" className="size-4 text-primary" />}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => go('flows', 'mytasks')} className="cursor-pointer gap-2"><Icon name="user" className="size-4" /><span className="flex-1">งานของฉัน</span>{sub === 'mytasks' && <Icon name="check" className="size-4 text-primary" />}</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {flows.map(f => (
                              <DropdownMenuItem key={f.id} onClick={() => pick(f)} className="cursor-pointer gap-2">
                                <FlowIcon icon={f.icon} className="size-4 shrink-0" /><span className="flex-1 truncate">{f.name}</span>
                                {sub !== 'overview' && sub !== 'mytasks' && activeFlow === f.id && <Icon name="check" className="size-4 text-primary" />}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      );
                    })() : nav?.subs ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="flex items-center gap-1 focus:outline-none">
                          {nav.label}
                          <Icon name="down" className="size-3 ml-1 opacity-50" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {nav.subs.map(sub => (
                            <DropdownMenuItem key={sub.id} onClick={() => go(section, sub.id)} className="cursor-pointer">
                              {sub.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <BreadcrumbPage>{nav?.label || SPECIAL_LABELS[section] || ''}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                  {nav?.subs && subLabel && !(section === 'flows' && (sub === 'overview' || sub === 'mytasks')) && (
                    <>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbPage>{subLabel}</BreadcrumbPage>
                      </BreadcrumbItem>
                    </>
                  )}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            
            <div className="flex items-center gap-2">
              {!canEdit && (
                <Badge variant="secondary" className="cursor-pointer bg-amber-100 text-amber-800 hover:bg-amber-200" onClick={() => { const admins = (TMK.roles || []).filter(r => r.role === 'admin').map(r => `${r.name} (${r.email})`); toast(admins.length ? `ขอสิทธิ์แก้ไขได้ที่แอดมิน: ${admins.join(', ')}` : 'ยังไม่มีแอดมินในระบบ', 'warn'); }} title="คลิกดูแอดมินที่ขอสิทธิ์ได้">
                  <Icon name="eye" className="size-3 mr-1" /><span className="hidden sm:inline">ดูอย่างเดียว</span>
                </Badge>
              )}
              
              <Button variant="outline" className="relative h-9 w-9 p-0 xl:h-9 xl:w-60 xl:justify-start xl:px-3 xl:py-2 text-muted-foreground" onClick={() => setSpotlight(true)} title={t('search')}>
                <Icon name="search" className="size-4 xl:mr-2" />
                <span className="hidden xl:inline flex-1 text-left">{t('search')}...</span>
                <kbd className="pointer-events-none hidden xl:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </Button>
              
              <NotifBell />
            </div>
          </header>

          <div className={'content' + (section === 'catalog' ? ' sale-section' : '')} ref={contentRef}>
            {/* คอลัมน์เนื้อหากลางเดียว (max 1280 · จัดกึ่งกลาง) — ทุกหน้าอยู่ตรงกลางเท่ากันไม่ว่าจะพับ sidebar หรือไม่ */}
            <div className="content-inner">
              {renderView()}
            </div>
          </div>
        </div>
      </SidebarInset>


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
              <Button variant="ghost" size="icon" onClick={() => setDrawer(false)}><Icon name="x" /></Button>
            </div>
            {NAV.map(n => (
              <div key={n.id} style={{ marginBottom: 2 }}>
                <button className={'panel-item' + (section === n.id ? ' active' : '')} style={isLocked(n.id) ? { opacity: .5 } : undefined} onClick={() => go(n.id)}>
                  <Icon name={n.icon} />{n.label}{isLocked(n.id) && <span style={{ marginLeft: 'auto', display: 'inline-flex' }}><Icon name="lock" className="size-3.5" /></span>}
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
            <button className="panel-item" style={isLocked('settings') ? { opacity: .5 } : undefined} onClick={() => go('settings', 'general')}><Icon name="system" />ตั้งค่า{isLocked('settings') && <span style={{ marginLeft: 'auto', display: 'inline-flex' }}><Icon name="lock" className="size-3.5" /></span>}</button>
            <button className="panel-item" onClick={() => setDark(d => !d)}><Icon name={dark ? 'sun' : 'moon'} />{dark ? 'โหมดสว่าง' : 'โหมดมืด'}</button>
            <button className="panel-item" style={{ color: 'var(--bad)' }} onClick={logout}><Icon name="external" />ออกจากระบบ</button>
          </div>
        </>
      )}

      {/* mobile bottom tab bar */}
      <nav className="tabbar mobile-only">
        <div className="tabbar-inner">
          {NAV.map(n => (
            <button key={n.id} className={'tab' + (section === n.id ? ' active' : '')} style={isLocked(n.id) ? { opacity: .45 } : undefined} onClick={() => go(n.id)}>
              <Icon name={isLocked(n.id) ? 'lock' : n.icon} /><span className="tab-label">{n.label}</span>
            </button>
          ))}
        </div>
      </nav>
      {canEdit && <button className="fab mobile-only" title="เพิ่มรายการ" onClick={() => {
        if (section === 'catalog') {
          const m = { orders: 'order' }[sub] || 'product';
          window.__openModal(m); return;
        }
        if (section === 'sales') { window.__openModal('record', { date: todayISO() }); return; }
        if (isLocked('flows')) { go('flows', 'kanban'); return; } // go() toast เอง — กัน modal เด้งทั้งที่เข้าหน้าไม่ได้
        go('flows', 'kanban'); setTimeout(() => window.__openModal('task'), 100);
      }}><Icon name="plus" /></button>}
    </SidebarProvider>
  );

  // สถานะโหลดข้อมูล: version===0 = ยังไม่เคยโหลดสำเร็จ (ครั้งแรก)
  const firstError = authed && dataVersion === 0 && !!dataError;
  // จอโหลดแรก: arm ตอน login เสร็จ, done เมื่อโหลดข้อมูลครั้งแรกเสร็จ/พลาด, ค้างขั้นต่ำ ~5.5 วิ
  const firstLoading = useMinSplash(authed, dataVersion >= 1 || firstError, 5500);
  const showShell = authed && !firstError && !firstLoading;
  const syncing = authed && dataVersion >= 1 && dataLoading; // realtime reload หลังโหลดครั้งแรก

  return (
    <>
      {!authReady && <LoadingScreen />}
      {authReady && !authed && <LoginScreen onLogin={handleLogin} />}
      {firstLoading && !firstError && <LoadingScreen />}
      {firstError && <DataErrorScreen error={dataError} onRetry={dataReload} />}
      {showShell && Shell()}
      {syncing && <SyncIndicator />}

      {/* แถบ "มีเวอร์ชันใหม่" — เด้งบนสุดเมื่อ deploy บิลด์ใหม่ (changelog ย้ายไปหน้า Settings > มีอะไรใหม่) */}
      {showShell && <UpdateBanner />}

      {/* กล่องยืนยันแบบ shadcn (window.__confirm) — แทน window.confirm ทั้งแอป */}
      <ConfirmHost />

      {authed && modal && (
        <Suspense fallback={null}>{
        modal.type === 'record' ? <RecordSalesModal data={modal.data} onClose={closeModal} />
        : modal.type === 'task' ? <TaskModal data={modal.data} onClose={closeModal}
            onDelete={async (task) => {
              setTasks(ts => ts.filter(x => x.id !== task.id)); // optimistic remove
              closeModal();
              try {
                const { error } = await supabase.from('tmk_tasks').update({ deleted_at: new Date().toISOString() }).eq('id', task.id);
                if (error) throw error;
                logAudit({ action: 'delete', entityType: 'task', entityName: task.title, summary: `ลบงาน "${task.title}"`, flowId: task.flow ?? task.flow_id ?? '' });
                if (dataRefresh) await dataRefresh(['tmk_tasks']); else if (dataReload) await dataReload();
                toast('ย้ายงานไปถังขยะแล้ว', 'success', 6000, {
                  label: 'เลิกทำ',
                  onClick: async () => {
                    try {
                      const { error: e2 } = await supabase.from('tmk_tasks').update({ deleted_at: null }).eq('id', task.id);
                      if (e2) throw e2;
                      if (dataRefresh) await dataRefresh(['tmk_tasks']); else if (dataReload) await dataReload();
                      toast('กู้คืนงานแล้ว', 'success');
                    } catch (e) { toast('กู้คืนไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
                  },
                });
              } catch (err) {
                console.error('Task delete failed:', err);
                toast('ลบไม่สำเร็จ: ' + err.message, 'error');
                if (dataRefresh) await dataRefresh(['tmk_tasks']); else if (dataReload) await dataReload(); // คืนงานที่ลบ optimistic กลับจาก DB (กันบอร์ดเพี้ยน)
              }
            }}
            onSubmit={async (task) => {
              // แปลงวันที่ฟอร์ม (ISO จาก <input type=date>) → ISO + ไทย (กัน kanban โชว์ ISO ชั่วคราว)
              const isoDate = parseTaskDate(task.date) || todayISO();
              const optimistic = { ...task, date: thaiDate(isoDate) || task.date, dateISO: isoDate };
              // 1. Optimistic local update — เห็นทันที (รูปแบบเดียวกับที่ mapToTMK ให้)
              setTasks(ts => modal.data?.id ? ts.map(x => x.id === task.id ? optimistic : x) : [optimistic, ...ts]);
              closeModal();

              // 2. แปลง task → DB format + บันทึก Supabase
              try {
                const responsibleStr = Array.isArray(task.responsible) ? task.responsible.join(', ') : String(task.responsible || '');
                const channelStr = Array.isArray(task.channel) ? task.channel.join(', ') : String(task.channel || '');
                const dbTask = {
                  id: task.id,
                  date: isoDate,
                  date_end: task.dateEnd || null,  // วันสิ้นสุด (ช่วง)
                  camp: task.camp || null,
                  title: task.title || '',
                  detail: task.detail || '',
                  responsible: responsibleStr,
                  channel: channelStr,
                  status: task.status || 'todo',
                  priority: task.priority || 'medium',
                  reminder_days: Number(task.reminderDays || 1),
                  flow_id: task.flow_id || null, // โครงการที่งานสังกัด (graceful ถ้าคอลัมน์ยังไม่ migrate)
                  tags: Array.isArray(task.tags) ? task.tags : [], // แท็ก (graceful ถ้าคอลัมน์ tags ยังไม่ migrate)
                  subtasks: Array.isArray(task.subtasks) ? task.subtasks : [], // เช็คลิสต์/งานย่อย (graceful · migration 20260730)
                  sort_order: Number(task.sortOrder || 0), // ลำดับการ์ดในคอลัมน์ (graceful · migration 20260730)
                  brand_ids: Array.isArray(task.brandIds) ? task.brandIds : [], // แบรนด์ของงาน (graceful · migration 20260808)
                };
                let { error } = await supabase.from('tmk_tasks').upsert(dbTask);
                // graceful: ถ้าคอลัมน์เสริม (flow_id/tags/date_end/subtasks/sort_order/brand_ids) ยังไม่ migrate → ตัดเฉพาะที่ขาดแล้วลองใหม่
                if (error && /(flow_id|tags|date_end|subtasks|sort_order|brand_ids)/.test(error.message || '')) {
                  const retry = { ...dbTask };
                  if (/flow_id/.test(error.message)) delete retry.flow_id;
                  if (/tags/.test(error.message)) delete retry.tags;
                  if (/date_end/.test(error.message)) delete retry.date_end;
                  if (/subtasks/.test(error.message)) delete retry.subtasks;
                  if (/sort_order/.test(error.message)) delete retry.sort_order;
                  if (/brand_ids/.test(error.message)) delete retry.brand_ids;
                  ({ error } = await supabase.from('tmk_tasks').upsert(retry));
                }
                if (error) throw error;
                // รายละเอียดประวัติ: สร้าง = ค่าที่กรอก / แก้ไข = ก่อน→หลัง
                const _stTH = { todo: 'รอทำ', inprogress: 'กำลังทำ', review: 'รอตรวจ', done: 'เสร็จ' };
                const _campName = (id) => (TMK.campaigns.find(c => c.id === id)?.name) || (id ? '-' : 'ไม่มี');
                const _prioTH = { high: 'สูง', medium: 'กลาง', low: 'ต่ำ' };
                const _sub = (t) => (Array.isArray(t?.subtasks) ? t.subtasks : []);
                const _norm = (t) => ({
                  'หัวข้อ': t?.title || '',
                  'วันที่': t?.dateISO || parseTaskDate(t?.date) || t?.date || '',
                  'วันสิ้นสุด': t?.dateEnd || t?.date_end || '—',
                  'สถานะ': _stTH[t?.status] || t?.status || '',
                  'ความสำคัญ': _prioTH[t?.priority] || t?.priority || '—',
                  'แคมเปญ': _campName(t?.camp),
                  'ช่องทาง': (Array.isArray(t?.channel) ? t.channel : String(t?.channel || '').split(',').map(s => s.trim()).filter(Boolean)).join(', ') || 'ไม่มี',
                  'ผู้รับผิดชอบ': (Array.isArray(t?.responsible) ? t.responsible : String(t?.responsible || '').split(',').map(s => s.trim()).filter(Boolean)).join(', ') || '—',
                  'แท็ก': (Array.isArray(t?.tags) ? t.tags : []).join(', ') || '—',
                  'เช็คลิสต์': _sub(t).length ? `${_sub(t).filter(s => s.done).length}/${_sub(t).length}` : '—',
                });
                const _after = _norm(task);
                let _fields = null, _changes = null;
                if (modal.data?.id) {
                  const _before = _norm(modal.data);
                  _changes = Object.keys(_after).filter(k => _before[k] !== _after[k]).map(k => ({ label: k, from: _before[k] || '—', to: _after[k] || '—' }));
                } else {
                  _fields = Object.entries(_after).map(([k, v]) => ({ label: k, value: v }));
                }
                logAudit({ action: modal.data?.id ? 'update' : 'create', entityType: 'task', entityName: task.title, entityId: task.id,
                  summary: `${modal.data?.id ? 'แก้ไข' : 'สร้าง'}งาน "${task.title}"`, fields: _fields, changes: _changes, flowId: task.flow_id ?? task.flow ?? '' });
                // แจ้งเตือนผู้ที่เพิ่งถูกมอบหมาย (assignee ใหม่ที่ไม่มีในงานเดิม)
                const _oldResp = modal.data?.id ? (Array.isArray(modal.data.responsible) ? modal.data.responsible : String(modal.data.responsible || '').split(',').map(s => s.trim()).filter(Boolean)) : [];
                const _newAssignees = (Array.isArray(task.responsible) ? task.responsible : []).filter(n => !_oldResp.includes(n));
                if (_newAssignees.length) {
                  const _ems = [...new Set(_newAssignees.map(emailOfName).filter(Boolean))];
                  pushNotify(_ems.map(em => ({ user_email: em, kind: 'assign', title: `คุณได้รับมอบหมายงาน "${task.title}"`, flow_id: task.flow_id ?? task.flow ?? '', task_id: task.id })));
                }
                // Reload data so calendar/kanban show latest from Supabase
                if (dataRefresh) await dataRefresh(['tmk_tasks']); else if (dataReload) await dataReload();
                toast(t('toastSaved'), 'success');
              } catch (err) {
                console.error('Task save failed:', err);
                toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
              }
            }} />
        : modal.type === 'product' ? <ProductModal data={modal.data} onClose={closeModal} />
        : modal.type === 'order' ? <OrderModal data={modal.data} onClose={closeModal} />
        : modal.type === 'campaign' ? <CampaignModal data={modal.data} onClose={closeModal} />
        : modal.type === 'monthlyTarget' ? <MonthlyTargetModal data={modal.data} onClose={closeModal} />
        : modal.type === 'adCampaign' ? <AdCampaignModal data={modal.data} onClose={closeModal} />
        : modal.type === 'customerSegment' ? <CustomerSegmentModal onClose={closeModal} />
        : modal.type === 'historical' ? <HistoricalEntryModal onClose={closeModal} data={modal.data} />
        : null
      }</Suspense>
      )}
    </>
  );
}
