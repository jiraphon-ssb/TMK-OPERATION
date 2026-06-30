/* ============================================================
   ศูนย์แจ้งเตือน (Notification Center) — PART 34 (รื้อใหม่)
   - กล่องข้อความ (Inbox): tmk_notifications ผ่าน store เดียว — อ่าน/เลื่อน/เก็บ/ลบ + กรอง + ค้นหา
   - สัญญาณ (Signals): เงื่อนไขระบบคำนวณสด (สต็อก/ยอด/ออเดอร์/PO) — แยกโซน ไม่ปนกับ inbox
   - ระบบ (Activity): tmk_audit_logs read-only ข้ามทุก section
   - ตั้งค่า: เปิด/ปิดต่อชนิด เก็บลง DB (sync ทุกเครื่อง) ผ่าน store
   ============================================================ */
import { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { useData } from './dataContext.jsx';
import { Icon, useBeatOn, PageSkeleton } from './components.jsx';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchInput } from '@/components/ui/search-input';
import { Switch } from '@/components/ui/switch';
import { useNotifications, isSnoozed } from './lib/notifStore.js';
import { computeSignals } from './lib/notifSignals.js';
import { timeAgo, dateBucket, BUCKET_ORDER, displayName } from './lib/notifRegistry.js';
import { NotifRow } from './notif-bell.jsx';

// ตั้งค่าเปิด/ปิด — แยก 2 กลุ่มตามโซน
const PREF_INBOX = [
  { k: 'mention', label: 'ถูก @แท็กในคอมเมนต์' },
  { k: 'assign', label: 'ได้รับมอบหมายงาน' },
  { k: 'reply', label: 'ตอบกลับคอมเมนต์ของฉัน' },
  { k: 'comment', label: 'คอมเมนต์ในงานที่ฉันรับผิดชอบ' },
  { k: 'status', label: 'เปลี่ยนสถานะงานของฉัน' },
  { k: 'flow_member', label: 'เพิ่ม/นำออกจากสมาชิกโครงการ' },
  { k: 'overdue', label: 'งานใกล้ครบ / เลยกำหนด' },
];
const PREF_SIGNALS = [
  { k: 'daily', label: 'เตือนกรอกยอดขายรายวัน' },
  { k: 'monthly', label: 'ยังไม่สรุปยอดเดือนก่อน' },
  { k: 'sales', label: 'สัญญาณยอดขาย / ค่าแอด' },
  { k: 'orders', label: 'ออเดอร์ค้างนาน' },
  { k: 'po', label: 'PO ครบกำหนดรับ' },
  { k: 'stock', label: 'สต็อกใกล้หมด / หมด' },
];

const AUDIT_ACTION = {
  create: { l: 'สร้าง', c: 'var(--good)' }, update: { l: 'แก้ไข', c: 'var(--info)' },
  delete: { l: 'ลบ', c: 'var(--bad)' }, purge: { l: 'ลบถาวร', c: 'var(--bad)' },
  restore: { l: 'กู้คืน', c: 'var(--good)' }, move: { l: 'ย้าย', c: 'var(--accent)' }, export: { l: 'ส่งออก', c: 'var(--info)' }, return: { l: 'รับคืน', c: 'var(--warn)' },
};

export function NotificationsCenter() {
  const { version } = useData() || {};
  const beat = useBeatOn('notif-center');
  const { list, prefs, prefOn, actions } = useNotifications();
  const [audit, setAudit] = useState([]);
  const [tab, setTab] = useState('all'); // all | unread | mention | assign | snoozed | archived | signals | system
  const [query, setQuery] = useState('');
  const [prefsOpen, setPrefsOpen] = useState(false);

  // โหลด audit เฉพาะตอนเปิดแท็บ "ระบบ"
  useEffect(() => {
    if (tab !== 'system' || !supabase) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.from('tmk_audit_logs').select('*').order('created_at', { ascending: false }).limit(80);
        if (alive && Array.isArray(data)) setAudit(data);
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [tab, version]);

  // แยกโซน (กรอง prefs ฝั่งผู้รับ)
  const active = useMemo(() => list.filter(n => !n.archived_at && !isSnoozed(n) && prefOn(n.kind)), [list, prefs]); // eslint-disable-line react-hooks/exhaustive-deps
  const snoozed = useMemo(() => list.filter(n => !n.archived_at && isSnoozed(n)), [list]);
  const archived = useMemo(() => list.filter(n => !!n.archived_at), [list]);
  const { signalGroups, count: sigCount } = useMemo(() => computeSignals(prefOn), [version, prefs]); // eslint-disable-line react-hooks/exhaustive-deps
  const unreadCount = active.filter(n => !n.read).length;

  const counts = {
    all: active.length, unread: unreadCount,
    mention: active.filter(n => n.kind === 'mention').length,
    assign: active.filter(n => n.kind === 'assign').length,
    snoozed: snoozed.length, archived: archived.length, signals: sigCount,
  };

  const filtered = useMemo(() => {
    let src = tab === 'archived' ? archived : tab === 'snoozed' ? snoozed : active;
    if (tab === 'unread') src = src.filter(n => !n.read);
    else if (tab === 'mention') src = src.filter(n => n.kind === 'mention');
    else if (tab === 'assign') src = src.filter(n => n.kind === 'assign');
    const q = query.trim().toLowerCase();
    if (q) src = src.filter(n => `${n.title || ''} ${n.body || ''}`.toLowerCase().includes(q));
    return src;
  }, [active, archived, snoozed, tab, query]);

  const groups = useMemo(() => {
    const m = new Map();
    filtered.forEach(n => { const b = dateBucket(n.created_at); if (!m.has(b)) m.set(b, []); m.get(b).push(n); });
    return BUCKET_ORDER.filter(b => m.has(b)).map(b => ({ label: b, items: m.get(b) }));
  }, [filtered]);

  const onMarkAll = () => actions.markRead(active.filter(n => !n.read).map(n => n.id), true);

  const TABS = [
    { id: 'all', label: 'ทั้งหมด', n: counts.all },
    { id: 'unread', label: 'ยังไม่อ่าน', n: counts.unread },
    { id: 'mention', label: '@แท็ก', n: counts.mention },
    { id: 'assign', label: 'มอบหมาย', n: counts.assign },
    { id: 'signals', label: 'สัญญาณ', n: counts.signals },
    { id: 'snoozed', label: 'เลื่อนไว้', n: counts.snoozed },
    { id: 'archived', label: 'คลัง', n: counts.archived },
    { id: 'system', label: 'ระบบ' },
  ];

  if (beat) return <PageSkeleton />;

  return (
    <div className="content-inner rise flex flex-col gap-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2"><Icon name="bell" className="size-5" /> การแจ้งเตือน {unreadCount > 0 && <Badge variant="secondary">{unreadCount} ใหม่</Badge>}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">กล่องข้อความของคุณ · สัญญาณภาพรวม · กิจกรรมทั้งระบบ</p>
        </div>
        <div className="flex items-center gap-2">
          <SearchInput value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหา…" className="w-full sm:w-52" />
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onMarkAll} disabled={!unreadCount}><Icon name="checkCheck" className="size-4" /> อ่านทั้งหมด</Button>
          <Button variant={prefsOpen ? 'secondary' : 'outline'} size="icon" className="size-9" title="ตั้งค่าการแจ้งเตือน" aria-label="ตั้งค่าการแจ้งเตือน" onClick={() => setPrefsOpen(o => !o)}><Icon name="system" className="size-4" /></Button>
        </div>
      </div>

      {prefsOpen && (
        <div className="rounded-xl border bg-card p-4">
          <div className="font-semibold text-sm mb-3 flex items-center gap-2"><Icon name="system" className="size-4" /> เปิด/ปิด การแจ้งเตือนแต่ละชนิด</div>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
            <PrefGroup title="กล่องข้อความ" items={PREF_INBOX} prefOn={prefOn} setPref={actions.setPref} />
            <PrefGroup title="สัญญาณภาพรวม" items={PREF_SIGNALS} prefOn={prefOn} setPref={actions.setPref} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">* การตั้งค่านี้ sync ทุกเครื่องของคุณ</p>
        </div>
      )}

      {/* tabs */}
      <div className="flex items-center gap-1.5 flex-wrap" role="tablist">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`h-8 px-3 rounded-full text-xs font-medium border transition-colors ${tab === t.id ? 'bg-primary text-primary-foreground border-transparent' : 'bg-card hover:bg-muted/50 border-border text-muted-foreground'}`}>
            {t.label}{typeof t.n === 'number' && t.n > 0 ? ` (${t.n})` : ''}
          </button>
        ))}
      </div>

      {/* body */}
      {tab === 'signals' ? (
        signalGroups.length === 0 ? <EmptyState icon="zap" text="ไม่มีสัญญาณตอนนี้" />
          : signalGroups.map(g => (
            <div key={g.key} className="flex flex-col gap-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">{g.label}</div>
              <div className="rounded-xl border bg-card divide-y overflow-hidden">
                {g.items.map(it => <NotifRow key={it.id} n={{ ...it, _color: g.color }} signal />)}
              </div>
            </div>
          ))
      ) : tab === 'system' ? (
        <div className="rounded-xl border bg-card divide-y">
          {audit.length === 0 ? <div className="py-14 text-center text-sm text-muted-foreground">— ไม่มีกิจกรรม —</div> : audit.map((a, i) => {
            let d = {}; try { d = typeof a.details === 'string' ? JSON.parse(a.details) : (a.details || {}); } catch { /* ignore */ }
            const am = AUDIT_ACTION[a.action] || { l: a.action, c: 'var(--ink-3)' };
            const who = displayName(a.user_email) || 'ระบบ';
            return (
              <div key={a.id || i} className="flex items-start gap-3 px-4 py-2.5">
                <span className="size-2 rounded-full mt-1.5 shrink-0" style={{ background: am.c }} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm"><span className="font-medium">{who}</span> <span style={{ color: am.c }}>{am.l}</span> {d.entityName || d.summary || a.entity_type || ''}</div>
                  {d.summary && d.entityName ? <div className="text-xs text-muted-foreground truncate">{d.summary}</div> : null}
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0 whitespace-nowrap">{timeAgo(a.created_at)}</span>
              </div>
            );
          })}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState icon="bell" text={tab === 'archived' ? 'ยังไม่มีรายการในคลัง' : tab === 'snoozed' ? 'ไม่มีรายการที่เลื่อนไว้' : query ? 'ไม่พบการแจ้งเตือนที่ค้นหา' : 'ไม่มีการแจ้งเตือน'} />
      ) : groups.map(g => (
        <div key={g.label} className="flex flex-col gap-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">{g.label}</div>
          <div className="rounded-xl border bg-card divide-y overflow-hidden">
            {g.items.map(n => <NotifRow key={n.id} n={n} actions={actions} archivedView={tab === 'archived'} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function PrefGroup({ title, items, prefOn, setPref }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</div>
      <div className="flex flex-col">
        {items.map(p => (
          <div key={p.k} className="flex items-center justify-between gap-3 py-1.5 text-sm">
            <span>{p.label}</span>
            <Switch checked={prefOn(p.k)} onCheckedChange={(v) => setPref(p.k, v)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div className="border-2 border-dashed rounded-xl py-16 text-center text-muted-foreground">
      <Icon name={icon} className="size-8 mx-auto opacity-30 mb-2" />
      <p className="text-sm">{text}</p>
    </div>
  );
}
