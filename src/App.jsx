/* ============================================================
   TMK Operation — App shell, navigation, routing
   ============================================================ */
import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { TMK } from './data.js';
import { Icon, B, Bk, N, UserIcon, ORDER_STATUSES, orderStatusIndex, PageSkeleton, useMinSplash } from './components.jsx';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton, SidebarFooter, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup } from '@/components/ui/dropdown-menu';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator, BreadcrumbEllipsis } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';
import { Loader2 } from 'lucide-react';
import tmkLogo from './assets/tmk-logo.png';
import { HomeView, SalesView } from './views-1.jsx';
// Heavy views — code-split เป็น chunk แยก ลด main bundle (~330 kB)
// views-1 (Home + Sales) คงเดิม เพราะ Home เป็นหน้าแรกหลัง login ต้องเร็ว
const PlannerView  = lazy(() => import('./views-2.jsx').then(m => ({ default: m.PlannerView  })));
const CatalogView  = lazy(() => import('./views-2.jsx').then(m => ({ default: m.CatalogView  })));
const SettingsView = lazy(() => import('./views-2.jsx').then(m => ({ default: m.SettingsView })));
const EntryView    = lazy(() => import('./views-entry.jsx').then(m => ({ default: m.EntryView })));
import { RecordSalesModal, TaskModal, ProductModal, SellModal, StockAdjustModal, ReceiveModal, QuickFindModal, LabelModal, ReservationModal, MovementLedgerModal, OrderModal, CustomerModal, CampaignModal, POModal, MonthlyTargetModal, AdCampaignModal, CustomerSegmentModal, HistoricalEntryModal, ImportProductsModal, LoginScreen } from './modals.jsx';
import { LangProvider, useLang } from './i18n.jsx';
import { ToastProvider, useToast } from './toast.jsx';
import { supabase } from './lib/supabaseClient.js';
import { logAudit } from './lib/audit.js';
import { THAI_MONTHS, parseTaskDate, todayISO, thaiDate } from './lib/dateUtils.js';
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

/* ---- Spotlight Search ---- */
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
const modKey = isMac ? '⌘' : 'Ctrl+';

// ---- Spotlight recents (localStorage) — boost รายการที่ใช้ล่าสุด ----
const SPOT_RECENT_KEY = 'tmk-spotlight-recent';
const readSpotRecents = () => { try { return JSON.parse(localStorage.getItem(SPOT_RECENT_KEY)) || []; } catch { return []; } };
const pushSpotRecent = (item) => {
  try {
    const list = readSpotRecents().filter(r => !(r.label === item.label && r.cat === item.cat));
    list.unshift({ cat: item.cat, icon: item.icon, label: item.label, sub: item.sub, color: item.color, go: item.go });
    localStorage.setItem(SPOT_RECENT_KEY, JSON.stringify(list.slice(0, 6)));
  } catch { /* ignore quota/parse */ }
};

function Spotlight({ onClose, onGo }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);
  const recents = useMemo(() => readSpotRecents(), []);

  useEffect(() => { inputRef.current?.focus(); }, []);
  // เปลี่ยนคำค้น → reset ตัวเลือกเป็นรายการแรก (ทำตอนพิมพ์ ไม่ใช่ใน effect → กัน re-render ซ้ำ)
  const onQuery = (v) => { setQ(v); setIdx(0); };

  const ql = q.toLowerCase().trim();
  const results = [];

  // Helper — safe lowercase (handles null/undefined/non-string)
  const lc = (v) => String(v || '').toLowerCase();

  // เปิดรายการ + จำไว้เป็น "ล่าสุด" (go = [section, sub] แบบ serialize ได้)
  const fire = (r) => { pushSpotRecent(r); onGo(r.go[0], r.go[1]); onClose(); };

  if (ql) {
    // Tasks
    (TMK.tasks || []).filter(t => lc(t.title).includes(ql) || lc(t.detail).includes(ql)).slice(0, 5).forEach(t => {
      const c = (TMK.campaigns || []).find(x => x.id === t.camp);
      results.push({ cat: 'งาน', icon: 'listChecks', label: t.title, sub: `${t.date} · ${c?.name || ''}`, color: c?.color, go: ['planner', 'kanban'] });
    });
    // Products
    (TMK.products || []).filter(p => lc(p.name).includes(ql)).slice(0, 3).forEach(p => {
      results.push({ cat: 'สินค้า', icon: 'bag', label: p.name, sub: `${B(p.price)} · ขาย ${N(p.units)} ตัว`, color: 'var(--accent)', go: ['catalog', 'products'] });
    });
    // Campaigns
    (TMK.campaigns || []).filter(c => lc(c.name).includes(ql)).slice(0, 3).forEach(c => {
      results.push({ cat: 'แคมเปญ', icon: 'megaphone', label: c.name, sub: `${c.start}–${c.end}`, color: c.color, go: ['settings', 'campaigns'] });
    });
    // Staff
    (TMK.staff || []).filter(s => lc(s.name).includes(ql) || lc(s.role).includes(ql)).forEach(s => {
      results.push({ cat: 'ทีม', icon: 'users', label: s.name, sub: s.role, color: s.color, go: ['settings', 'roles'] });
    });
    // Channels
    (TMK.channels || []).filter(c => lc(c.name).includes(ql)).forEach(c => {
      results.push({ cat: 'ช่องทาง', icon: 'layers', label: c.name, sub: `เป้า ${Bk(c.target)}`, color: c.hex, go: ['sales', 'channels'] });
    });
    // Orders (ค้นด้วยรหัสออเดอร์ / ชื่อลูกค้า)
    (TMK.orders || []).filter(o => lc(o.code).includes(ql) || lc(o.customerName).includes(ql)).slice(0, 4).forEach(o => {
      results.push({ cat: 'ออเดอร์', icon: 'listChecks', label: o.code || o.customerName || 'ออเดอร์', sub: `${o.customerName || ''} · ${B(o.total)}`, color: 'var(--accent-2)', go: ['catalog', 'orders'] });
    });
    // Customers (ค้นด้วยชื่อ / เบอร์ / รหัส)
    (TMK.customers || []).filter(c => lc(c.name).includes(ql) || lc(c.phone).includes(ql) || lc(c.code).includes(ql)).slice(0, 4).forEach(c => {
      results.push({ cat: 'ลูกค้า', icon: 'users', label: c.name || c.code || 'ลูกค้า', sub: `${c.phone || ''}${c.orderCount ? ' · ' + c.orderCount + ' ออเดอร์' : ''}`, color: 'var(--info)', go: ['catalog', 'customers'] });
    });
    // Navigation
    [{ l: 'หน้าหลัก', s: 'home' }, { l: 'ยอดขาย', s: 'sales', sub: 'overview' }, { l: 'ปฏิทิน', s: 'planner', sub: 'calendar' }, { l: 'Kanban', s: 'planner', sub: 'kanban' }, { l: 'ไทม์ไลน์', s: 'planner', sub: 'timeline' }, { l: 'สินค้า', s: 'catalog', sub: 'products' }, { l: 'แคมเปญ', s: 'settings', sub: 'campaigns' }]
      .filter(n => lc(n.l).includes(ql)).forEach(n => {
        results.push({ cat: 'นำทาง', icon: 'arrowR', label: `ไปที่ ${n.l}`, sub: '', color: 'var(--ink-3)', go: [n.s, n.sub] });
      });
  } else {
    // ไม่มีคำค้น → โชว์ "ล่าสุด" ที่เคยเปิด (recent boost)
    recents.forEach(r => results.push({ ...r, cat: 'ล่าสุด' }));
  }

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[idx]) { fire(results[idx]); }
    else if (e.key === 'Escape') { onClose(); }
  };

  // Group by cat
  const grouped = {};
  results.forEach((r, i) => { r._i = i; grouped[r.cat] = grouped[r.cat] || []; grouped[r.cat].push(r); });

  return (
    <div className="spotlight-scrim" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', width: '100%', maxWidth: 580, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--sh-pop)', overflow: 'hidden', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
        {/* Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <span style={{ width: 20, height: 20, flexShrink: 0, color: 'var(--ink-3)' }}><Icon name="search" /></span>
          <input ref={inputRef} value={q} onChange={e => onQuery(e.target.value)} onKeyDown={onKey}
            placeholder="ค้นหางาน สินค้า แคมเปญ ทีม..."
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 'var(--fs-h3)', fontWeight: 500, color: 'var(--ink)', fontFamily: 'var(--font)' }} />
          <kbd style={{ fontFamily: 'var(--mono)', fontSize: 'var(--fs-micro)', color: 'var(--ink-3)', border: '1px solid var(--line)', borderRadius: 5, padding: '2px 6px', background: 'var(--surface-2)' }}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {!ql && results.length === 0 && (
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
                <button key={r._i} onClick={() => fire(r)} onMouseEnter={() => setIdx(r._i)}
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
    { id: 'monthly', labelKey: 'subMonthly', icon: 'pencil' },
  ]},
  { id: 'planner', labelKey: 'navPlanner', icon: 'planner', subs: [
    { id: 'calendar', labelKey: 'subCalendar', icon: 'calendarDays' },
    { id: 'kanban', labelKey: 'subKanban', icon: 'listChecks' },
    { id: 'timeline', labelKey: 'subTimeline', icon: 'route' },
  ]},
  { id: 'catalog', labelKey: 'navCatalog', icon: 'sales', subs: [
    { id: 'report', labelKey: 'subReport', icon: 'sales' },
    { id: 'orders', labelKey: 'subOrders', icon: 'listChecks' },
    { id: 'entry', labelKey: 'subEntry', icon: 'pencil' },
    { id: 'shirts', labelKey: 'subShirts', icon: 'bag' },
    { id: 'crm', labelKey: 'subCrm', icon: 'users' },
    { id: 'io', labelKey: 'subImport', icon: 'external' },
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
const DEFAULT_SUB = { sales: 'overview', planner: 'calendar', catalog: 'report', settings: 'general' };
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

/* ---- หน้าติดตามสถานะออเดอร์ (สาธารณะ — ลูกค้าเปิดเองไม่ต้องล็อกอิน) ---- */
function PublicTrackPage({ code }) {
  const [input, setInput] = useState(code || '');
  const [order, setOrder] = useState(code ? undefined : null); // undefined=loading, null=ว่าง/ไม่พบ
  const [searched, setSearched] = useState(Boolean(code));     // เคยกดค้นหรือยัง (คุมข้อความ)

  // ดึงออเดอร์ตามรหัส — เรียกจาก event (ปุ่ม/Enter) หรือโหลดครั้งแรกจากลิงก์ ?track=
  const fetchOrder = useCallback(async (codeStr) => {
    const c = String(codeStr || '').trim().toUpperCase();
    setSearched(Boolean(c));
    if (!c) { setOrder(null); return; }
    setOrder(undefined);
    const { data } = await supabase.from('tmk_orders')
      .select('code,customer_name,items,total,status,tracking_no,carrier,status_log,created_at')
      .eq('code', c).maybeSingle();
    setOrder(data || null);
  }, []);

  // โหลดครั้งแรกถ้าเปิดด้วยลิงก์ ?track=<code> — state เริ่มต้นเป็น loading อยู่แล้ว จึง fetch แบบ async ล้วน (ไม่ setState ก่อน await)
  useEffect(() => {
    if (!code) return;
    let cancel = false;
    (async () => {
      const { data } = await supabase.from('tmk_orders')
        .select('code,customer_name,items,total,status,tracking_no,carrier,status_log,created_at')
        .eq('code', String(code).trim().toUpperCase()).maybeSingle();
      if (!cancel) setOrder(data || null);
    })();
    return () => { cancel = true; };
  }, [code]);

  const isCancelled = order && order.status === 'cancelled';
  const curIdx = order ? orderStatusIndex(order.status) : 0;
  const doSearch = () => fetchOrder(input);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper,#f4f6fb)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px', fontFamily: 'var(--font)' }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <img src={tmkLogo} alt="TMK" style={{ height: 44, marginBottom: 8 }} />
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--ink)' }}>ติดตามสถานะออเดอร์</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Input style={{ flex: 1 }} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()} placeholder="กรอกรหัสออเดอร์ (เช่น ORD-260609-AB12)" />
          <Button onClick={doSearch}><Icon name="search" /> ค้นหา</Button>
        </div>

        {order === undefined && <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--ink-4)' }}>กำลังค้นหา…</div>}
        {order === null && searched && <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--ink-4)' }}>ไม่พบออเดอร์รหัสนี้ — ตรวจสอบรหัสอีกครั้ง</div>}
        {order === null && !searched && <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--ink-4)' }}>กรอกรหัสออเดอร์เพื่อดูสถานะ</div>}

        {order && (
          <div className="card">
            <div className="row between" style={{ marginBottom: 4 }}>
              <span style={{ fontWeight: 800, fontSize: 16 }}>{order.code}</span>
              {isCancelled && <span className="chip chip-bad">ยกเลิกแล้ว</span>}
            </div>
            <div className="cap" style={{ marginBottom: 16 }}>{order.customer_name || ''} · {new Date(order.created_at || Date.now()).toLocaleDateString('th-TH')}</div>

            {!isCancelled && (
              <div style={{ marginBottom: 18 }}>
                {ORDER_STATUSES.map((s, i) => {
                  const done = i < curIdx, active = i === curIdx;
                  return (
                    <div key={s.id} className="row" style={{ gap: 12, alignItems: 'flex-start', minHeight: 38 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', alignSelf: 'stretch' }}>
                        <span style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: done || active ? s.color : 'var(--surface-2)', color: '#fff', border: done || active ? 'none' : '2px solid var(--line)', fontSize: 12, fontWeight: 800 }}>{done ? '✓' : active ? '•' : ''}</span>
                        {i < ORDER_STATUSES.length - 1 && <span style={{ width: 2, flex: 1, minHeight: 16, background: done ? s.color : 'var(--line)' }} />}
                      </div>
                      <div style={{ paddingBottom: 10 }}>
                        <div style={{ fontWeight: active ? 800 : done ? 600 : 400, color: active ? s.color : done ? 'var(--ink)' : 'var(--ink-4)' }}>{s.label}{active && ' ← ตอนนี้'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {order.tracking_no && <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px', marginBottom: 12 }}><div className="cap">เลขพัสดุ {order.carrier ? `· ${order.carrier}` : ''}</div><div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{order.tracking_no}</div></div>}

            <div className="eyebrow" style={{ marginBottom: 8 }}>รายการ</div>
            {(order.items || []).map((it, i) => (
              <div key={i} className="row between" style={{ padding: '4px 0', fontSize: 'var(--fs-sm)' }}>
                <span>{it.name} · {it.color} {it.size} ×{it.qty}</span><span className="num">{B((it.qty || 0) * (it.price || 0))}</span>
              </div>
            ))}
            <div className="row between" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)', fontWeight: 800 }}><span>ยอดรวม</span><span className="num">{B(order.total)}</span></div>
          </div>
        )}
        <div className="cap" style={{ textAlign: 'center', marginTop: 16, color: 'var(--ink-4)' }}>TMK Operation</div>
      </div>
    </div>
  );
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
  const { loading: dataLoading, error: dataError, version: dataVersion, reload: dataReload } = useData();
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
    try { return localStorage.getItem('tmk-section') || 'home'; } catch { return 'home'; }
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
  const [notif, setNotif] = useState(false);
  const [menu, setMenu] = useState(false);
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

  // รีเฟรชเมื่อสลับ toggle แจ้งเตือน (NotifToggle dispatch 'tmk-prefs') → กระดิ่งอัปเดตทันที
  // เก็บค่า bump ไว้เป็น dep ของ useMemo notifications (Phase F memoization)
  const [prefsBump, setPrefsBump] = useState(0);
  useEffect(() => {
    const h = () => setPrefsBump(n => n + 1);
    window.addEventListener('tmk-prefs', h);
    return () => window.removeEventListener('tmk-prefs', h);
  }, []);

  // สิทธิ์แก้ไข: 'viewer' = ดูอย่างเดียว (เจ้าของ/แอดมิน/ผู้แก้ไข = แก้ได้) — default viewer ถ้าไม่อยู่ในระบบ
  const canEdit = (currentUserCtx?.role || 'viewer') !== 'viewer';
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;
  if (typeof window !== 'undefined') {
    window.__canEdit = canEdit; // ให้ view อื่น (kanban drag, settings) เช็คได้
    window.__isAdmin = currentUserCtx?.role === 'admin'; // จัดการผู้ใช้/สิทธิ์ = admin เท่านั้น
  }

  useEffect(() => {
    window.__openModal = (type, data) => {
      if (!canEditRef.current) { toast('บัญชีนี้เป็นสิทธิ์ "ดูอย่างเดียว" — แก้ไขข้อมูลไม่ได้ (ติดต่อแอดมินเพื่อขอสิทธิ์)', 'warn'); return; }
      setModal({ type, data });
    };
    window.__toast = toast;
    window.__reload = dataReload; // ให้โมดัลรีโหลดทันทีหลังบันทึก (กันค้างถ้า realtime ช้า/หลุด)
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

  const go = (sec, s) => {
    setSection(sec);
    if (s) setSubMap(m => ({ ...m, [sec]: s }));
    setDrawer(false); setNotif(false); setMenu(false);
    if (contentRef.current) contentRef.current.scrollTop = 0;
  };

  // ===== แจ้งเตือน — แยก 3 แบบ: วันนี้ / ตามวันที่ / เดือนที่แล้ว =====
  // เฉพาะงานของหน้าที่ผู้ใช้ปัจจุบัน (admin เห็นทั้งหมด) — memo เพื่อเลี่ยงคำนวณซ้ำทุก render
  // dep: tasks, dataVersion (TMK เปลี่ยน), prefsBump (toggle เตือน), currentUserCtx (สิทธิ์/หน้าที่)
  const { notifs, notifGroups } = useMemo(() => {
    const readFlag = (k) => { try { return localStorage.getItem(k) !== 'false'; } catch { return true; } };
    const notifOn = readFlag('tmk-notif-overdue');
    const todayDay = TMK.consts.DAY;
    const myDuty = currentUserCtx?.name || '';
    const myDept = currentUserCtx?.department || '';
    const seeAll = currentUserCtx?.role === 'admin';
    const isMine = (tk) => seeAll || (tk.responsible || []).some(r => r === myDuty || r === myDept);
    const _todayIso = todayISO();
    const diffOf = (x) => { const iso = x.dateISO || parseTaskDate(x.date); if (!iso) return null; return Math.round((new Date(iso + 'T00:00:00') - new Date(_todayIso + 'T00:00:00')) / 86400000); };
    const openTasks = notifOn ? tasks.filter(x => x.status !== 'done' && isMine(x)) : [];
    const notifsToday = openTasks.filter(x => diffOf(x) === 0)
      .map(x => ({ ...x, kind: 'task', sev: 'today', txt: t('dueToday') }));
    const notifsDated = openTasks.filter(x => { const d = diffOf(x); return d != null && d !== 0; })
      .map(x => { const diff = diffOf(x); return { ...x, kind: 'task', sev: diff < 0 ? 'overdue' : 'soon', txt: diff < 0 ? t('overdueBy', -diff) : t('dueIn', diff), _diff: diff }; })
      .filter(n => n.sev === 'overdue' || n._diff <= (n.reminderDays || 1))
      .sort((a, b) => a._diff - b._diff);
    const dailyNotifOn = readFlag('tmk-notif-daily');
    const notifsTodaySales = (dailyNotifOn && !((TMK.dailyMonth || []).some(d => d.d === todayDay)))
      ? [{ id: 'today-sales', kind: 'todaysales', title: 'ยังไม่ได้กรอกยอดขายวันนี้', txt: 'กรอกเลย' }]
      : [];
    const notifsLastMonth = (() => {
      if (!notifOn) return [];
      const cm = TMK.consts.current_month, cy = TMK.consts.current_year;
      const pm = cm === 1 ? 12 : cm - 1;
      const py = cm === 1 ? cy - 1 : cy;
      const rec = (TMK.monthly || []).find(m => m.month === pm && m.year === py);
      // มียอดรวมรายเดือน หรือ มีข้อมูลรายวันของเดือนนั้น = ถือว่าสรุปแล้ว (กันเตือนหลอกเมื่อกรอกแบบรายวันล้วน)
      const hasDaily = (TMK.dailyAll || []).some(d => d.year === py && d.month === pm);
      if ((rec && rec.actual > 0) || hasDaily) return [];
      return [{ id: 'lastmonth', kind: 'lastmonth', title: `ยังไม่ได้สรุปยอดเดือน${THAI_MONTHS[pm - 1]}`, txt: 'กรอกย้อนหลัง' }];
    })();
    const notifsStock = readFlag('tmk-notif-stock')
      ? (TMK.products || []).filter(p => p.stock === 'out' || p.stock === 'low')
          .map(p => ({ id: 'stock-' + p.id, kind: 'stock', title: `${p.name} ${p.stock === 'out' ? 'หมดสต็อก' : 'ใกล้หมด'}`, txt: 'ดูสินค้า' }))
      : [];
    const notifsSales = readFlag('tmk-notif-sales') ? (() => {
      const out = [];
      const ceil = TMK.consts.ACOS_CEIL || 25;
      (TMK.channels || []).forEach(c => {
        if (c.actual > 0 && c.ad > 0) {
          const acos = (c.ad / c.actual) * 100;
          if (acos > ceil) out.push({ id: 'acos-' + c.id, kind: 'sales', title: `${c.name}: ค่าแอด ${acos.toFixed(0)}% ของยอด (เพดาน ${ceil}%)`, txt: 'ดูภาพรวม' });
        }
      });
      const Cm = TMK.computed || {};
      if ((TMK.consts.TARGET || 0) > 0 && typeof Cm.PACE_PCT === 'number' && Cm.PACE_PCT < 90) {
        out.push({ id: 'pace', kind: 'sales', title: `ยอดช้ากว่าแผน — จังหวะทำยอด ${Cm.PACE_PCT.toFixed(0)}%`, txt: 'ดูภาพรวม' });
      }
      // งบโฆษณาเกิน — เตือนเมื่อใช้จริง > งบที่ตั้ง (ของเดิมมีแค่หน้าโฆษณา ไม่เด้งกระดิ่ง)
      const adBudget = Number(TMK.consts.AD_BUDGET || 0);
      if (adBudget > 0 && Number(Cm.AD || 0) > adBudget) {
        out.push({ id: 'ad-over', kind: 'sales', title: `ใช้งบโฆษณาเกินที่ตั้ง (${B(Cm.AD)} / ${B(adBudget)})`, txt: 'ดูภาพรวม' });
      }
      // pace ลูกค้าใหม่ช้ากว่าแผน — เทียบ NEW_C MTD กับเป้าตามวันที่ผ่านไป (โครงเดียวกับยอดขาย)
      const cm = TMK.consts.current_month, cy = TMK.consts.current_year;
      const curMonthRow = (TMK.monthly || []).find(m => m.month === cm && m.year === cy);
      const newCTarget = Number(curMonthRow?.meta?.newCustTarget || 0);
      if (newCTarget > 0 && TMK.consts.DAYS > 0) {
        const expected = (TMK.consts.DAY / TMK.consts.DAYS) * newCTarget;
        const newCPace = expected > 0 ? (Number(Cm.NEW_C || 0) / expected) * 100 : 100;
        if (newCPace < 90) out.push({ id: 'newc-pace', kind: 'sales', title: `ลูกค้าใหม่ช้ากว่าแผน — pace ${newCPace.toFixed(0)}% (เป้า ${N(newCTarget)} คน/เดือน)`, txt: 'ดูลูกค้า' });
      }
      return out;
    })() : [];
    // ออเดอร์ค้าง — pending/processing เกิน 2 วัน
    const notifsOrders = readFlag('tmk-notif-orders') ? (() => {
      const out = [];
      const cutoff = new Date(Date.now() - 2 * 86400000).toISOString();
      (TMK.orders || []).filter(o => ['pending','processing'].includes(o.status) && o.createdAt && o.createdAt < cutoff).forEach(o => {
        const days = Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 86400000);
        out.push({ id: 'order-' + o.id, kind: 'orders', title: `ออเดอร์ ${o.code} ค้าง ${days} วัน (${o.customerName || '—'})`, txt: 'ไปบอร์ดออเดอร์' });
      });
      return out.slice(0, 10); // จำกัด 10 รายการต่อกระดิ่ง
    })() : [];
    // PO ถึง/เลยกำหนด — arrivalDate <= วันนี้ และยังไม่รับเข้า
    const notifsPO = readFlag('tmk-notif-po') ? (() => {
      const todayStr = _todayIso;
      return (TMK.poTracker || []).filter(p => p.arrivalISO && p.arrivalISO <= todayStr && p.status !== 'received' && p.status !== 'done')
        .map(p => ({ id: 'po-' + p.id, kind: 'po', title: `PO ${p.product || ''} ${p.arrivalISO === todayStr ? 'ถึงกำหนดวันนี้' : 'เลยกำหนดแล้ว'}`, txt: 'ดู PO' }));
    })() : [];
    const groups = [
      { key: 'todaysales', label: 'บันทึกวันนี้', items: notifsTodaySales, color: 'var(--accent)' },
      { key: 'sales', label: 'ยอดขาย/แอด', items: notifsSales, color: 'var(--warn)' },
      { key: 'orders', label: 'ออเดอร์ค้าง', items: notifsOrders, color: 'var(--warn)' },
      { key: 'po', label: 'PO ถึงกำหนด', items: notifsPO, color: 'var(--bad)' },
      { key: 'today', label: 'วันนี้', items: notifsToday, color: 'var(--warn)' },
      { key: 'dated', label: 'ตามวันที่', items: notifsDated, color: 'var(--info)' },
      { key: 'stock', label: 'สต็อก', items: notifsStock, color: 'var(--info)' },
      { key: 'lastmonth', label: 'เดือนที่แล้ว', items: notifsLastMonth, color: 'var(--bad)' },
    ].filter(g => g.items.length > 0);
    const all = [...notifsTodaySales, ...notifsSales, ...notifsOrders, ...notifsPO, ...notifsToday, ...notifsDated, ...notifsStock, ...notifsLastMonth];
    return { notifs: all, notifGroups: groups };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- TMK เป็น mutable global → ใช้ dataVersion เป็น proxy
  }, [tasks, dataVersion, prefsBump, currentUserCtx, t]);

  const onNotifClick = (n) => {
    setNotif(false);
    if (n.kind === 'todaysales') { window.__openModal('record', { date: todayISO() }); return; }
    if (n.kind === 'sales') {
      // pace ลูกค้าใหม่ → ไปหน้าลูกค้า; อื่นๆ → ภาพรวม
      if (n.id === 'newc-pace') go('sales', 'customers');
      else go('sales', 'overview');
      return;
    }
    if (n.kind === 'stock') { go('catalog', 'products'); return; }
    if (n.kind === 'orders') { go('catalog', 'orders'); return; }
    if (n.kind === 'po') { go('catalog', 'po'); return; }
    if (n.kind === 'lastmonth') { go('sales', 'monthly'); setTimeout(() => window.__openModal('historical'), 100); return; }
    go('planner', 'kanban');
    setTimeout(() => window.__openModal('task', { ...n, channel: Array.isArray(n.channel) ? n.channel : [n.channel] }), 100);
  };

  const renderView = () => {
    // Home + Sales (views-1) ไม่ lazy เพราะเป็นหน้าแรกหลัง login — ต้องเร็ว
    if (section === 'home') return <HomeView go={go} />;
    if (section === 'sales' && !['daily','monthly','status'].includes(sub)) return <SalesView sub={sub} />;
    // Heavy chunks — ห่อด้วย Suspense
    return (
      <Suspense fallback={<PageSkeleton />}>
        {section === 'sales' ? <EntryView sub={sub} />
          : section === 'planner' ? <PlannerView sub={sub} tasks={tasks} setTasks={setTasks} />
          : section === 'catalog' ? <CatalogView sub={sub} />
          : section === 'settings' ? <SettingsView sub={sub} dark={dark} setDark={setDark} />
          : null}
      </Suspense>
    );
  };

  const counts = { kanban: tasks.filter(x => x.status !== 'done').length };

  // Special sections not in NAV (settings)
  const SPECIAL_LABELS = { settings: 'ตั้งค่า' };
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
                n.subs ? (
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
                          <Icon name="chevR" className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {n.subs.map(s => (
                            <SidebarMenuSubItem key={s.id}>
                              <SidebarMenuSubButton asChild isActive={section === n.id && sub === s.id}>
                                <button onClick={() => go(n.id, s.id)}>
                                  <span>{s.label}</span>
                                  {counts[s.id] != null && counts[s.id] > 0 && (
                                    <span className="ml-auto bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full">{counts[s.id]}</span>
                                  )}
                                </button>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground outline-none"
                  >
                    <span className="relative">
                      <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarImage src={currentUserCtx?.avatar} alt={currentUserCtx?.name} />
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
                        <AvatarImage src={currentUserCtx?.avatar} alt={currentUserCtx?.name} />
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
                      ตั้งค่าทั่วไป
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => go('settings', 'roles')} className="cursor-pointer">
                      <Icon name="users" className="size-4 mr-2 text-muted-foreground" />
                      จัดการทีม
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => go('settings', 'campaigns')} className="cursor-pointer">
                      <Icon name="megaphone" className="size-4 mr-2 text-muted-foreground" />
                      จัดการแคมเปญ
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => go('settings', 'audit')} className="cursor-pointer">
                      <Icon name="clock" className="size-4 mr-2 text-muted-foreground" />
                      ประวัติระบบ
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => go('settings', 'updates')} className="cursor-pointer">
                      <Icon name="sparkle" className="size-4 mr-2 text-muted-foreground" />
                      มีอะไรใหม่
                      {unseenVersion && <span className="ml-auto inline-block size-2 rounded-full" style={{ background: 'var(--bad, #ef4444)' }} aria-label="มีเวอร์ชันใหม่" />}
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
                    {nav?.subs ? (
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
                  {nav?.subs && subLabel && (
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
              
              <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full" onClick={() => setNotif(n => !n)}>
                <Icon name="bell" className="size-5" />
                {notifs.length > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-red-600 border-2 border-background"></span>}
              </Button>
            </div>
          </header>

          <div className={'content' + (section === 'catalog' ? ' sale-section' : '')} ref={contentRef}>
            {renderView()}
          </div>
        </div>
      </SidebarInset>

      {/* notifications */}
      {notif && (
        <>
          <div className="scrim" style={{ background: 'transparent' }} onClick={() => setNotif(false)}></div>
          <div className="notif-pop">
            <div className="row between" style={{ padding: '6px 10px 10px' }}>
              <span className="h3">{t('notifications')}</span><span className="badge badge-secondary">{notifs.length}</span>
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
            <button className="panel-item" onClick={() => go('settings', 'general')}><Icon name="system" />ตั้งค่า</button>
            <button className="panel-item" onClick={() => setDark(d => !d)}><Icon name={dark ? 'sun' : 'moon'} />{dark ? 'โหมดสว่าง' : 'โหมดมืด'}</button>
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
      {canEdit && <button className="fab mobile-only" title="เพิ่มรายการ" onClick={() => {
        if (section === 'catalog') {
          const m = { products: 'product', orders: 'order', customers: 'customer', po: 'po' }[sub] || 'product';
          window.__openModal(m); return;
        }
        if (section === 'sales') { window.__openModal('record', { date: todayISO() }); return; }
        go('planner', 'kanban'); setTimeout(() => window.__openModal('task'), 100);
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
                if (dataReload) await dataReload(); // คืนงานที่ลบ optimistic กลับจาก DB (กันบอร์ดเพี้ยน)
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
        : modal.type === 'import-products' ? <ImportProductsModal onClose={closeModal} />
        : modal.type === 'sell' ? <SellModal data={modal.data} onClose={closeModal} />
        : modal.type === 'adjust' ? <StockAdjustModal data={modal.data} onClose={closeModal} />
        : modal.type === 'receive' ? <ReceiveModal data={modal.data} onClose={closeModal} />
        : modal.type === 'quickfind' ? <QuickFindModal onClose={closeModal} />
        : modal.type === 'label' ? <LabelModal data={modal.data} onClose={closeModal} />
        : modal.type === 'reserve' ? <ReservationModal data={modal.data} onClose={closeModal} />
        : modal.type === 'ledger' ? <MovementLedgerModal data={modal.data} onClose={closeModal} />
        : modal.type === 'order' ? <OrderModal data={modal.data} onClose={closeModal} />
        : modal.type === 'customer' ? <CustomerModal data={modal.data} onClose={closeModal} />
        : modal.type === 'campaign' ? <CampaignModal data={modal.data} onClose={closeModal} />
        : modal.type === 'po' ? <POModal data={modal.data} onClose={closeModal} />
        : modal.type === 'monthlyTarget' ? <MonthlyTargetModal data={modal.data} onClose={closeModal} />
        : modal.type === 'adCampaign' ? <AdCampaignModal data={modal.data} onClose={closeModal} />
        : modal.type === 'customerSegment' ? <CustomerSegmentModal onClose={closeModal} />
        : modal.type === 'historical' ? <HistoricalEntryModal onClose={closeModal} data={modal.data} />
        : null
      )}
    </>
  );
}

function RailAvatar({ onClick }) {
  return (
    <button className="rail-avatar" onClick={onClick}
      style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}>
      <UserIcon size={34} radius={10} />
    </button>
  );
}

function ProfileMenu({ go, close, onLogout }) {
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
        <button className="menu-row" onClick={() => go('settings', 'general')}><Icon name="system" />ตั้งค่า</button>
        <div className="divider"></div>
        <button className="menu-row danger" onClick={onLogout}><Icon name="external" />ออกจากระบบ</button>
      </div>
    </>
  );
}
