/* ============================================================
   ศูนย์แจ้งเตือน (Notification Center) — PART 29
   - ส่วนตัว: tmk_notifications (อ่าน/เก็บ/ลบ รายตัว + กรอง + ค้นหา)
   - ระบบ/กิจกรรม: tmk_audit_logs (read-only feed ข้ามทุก section)
   - ตั้งค่าเปิด/ปิดแต่ละชนิด (localStorage tmk-notif-*)
   ============================================================ */
import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { TMK } from './data.js';
import { useData } from './dataContext.jsx';
import { Icon, Avatar, useBeatOn, PageSkeleton } from './components.jsx';
import { setNotifRead, archiveNotif, unarchiveNotif, deleteNotif } from './lib/notify.js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchInput } from '@/components/ui/search-input';
import { Switch } from '@/components/ui/switch';

const KIND_META = {
  mention:     { label: 'ถูกกล่าวถึง', icon: 'chat', color: 'var(--accent)' },
  assign:      { label: 'มอบหมายงาน', icon: 'user', color: 'var(--good)' },
  reply:       { label: 'ตอบกลับ', icon: 'reply', color: 'var(--info)' },
  comment:     { label: 'คอมเมนต์', icon: 'chat', color: 'var(--info)' },
  status:      { label: 'เปลี่ยนสถานะ', icon: 'circle', color: 'var(--accent)' },
  due:         { label: 'ใกล้ครบกำหนด', icon: 'clock', color: 'var(--warn)' },
  overdue:     { label: 'เลยกำหนด', icon: 'zap', color: 'var(--bad)' },
  flow_member: { label: 'สมาชิกโครงการ', icon: 'users', color: 'var(--accent)' },
};
const kindMeta = (n) => {
  const base = KIND_META[n.kind] || { label: 'แจ้งเตือน', icon: 'bell', color: 'var(--accent)' };
  const sev = { urgent: 'var(--bad)', warn: 'var(--warn)', success: 'var(--good)' }[n.severity];
  return { ...base, color: sev || base.color };
};

function timeAgo(iso) {
  if (!iso) return '';
  const sec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (sec < 60) return 'เมื่อสักครู่';
  if (sec < 3600) return Math.floor(sec / 60) + ' นาทีที่แล้ว';
  if (sec < 86400) return Math.floor(sec / 3600) + ' ชม.ที่แล้ว';
  if (sec < 604800) return Math.floor(sec / 86400) + ' วันที่แล้ว';
  return String(iso).slice(0, 10);
}
function dateBucket(iso) {
  if (!iso) return 'ก่อนหน้า';
  const d = new Date(iso), now = new Date();
  const day = (x) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (day(d) === day(now)) return 'วันนี้';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (day(d) === day(y)) return 'เมื่อวาน';
  return 'ก่อนหน้า';
}

const PREFS = [
  { k: 'mention', label: 'ถูก @แท็กในคอมเมนต์' },
  { k: 'assign', label: 'ได้รับมอบหมายงาน' },
  { k: 'reply', label: 'ตอบกลับคอมเมนต์ของฉัน' },
  { k: 'comment', label: 'คอมเมนต์ในงานที่ฉันรับผิดชอบ' },
  { k: 'status', label: 'เปลี่ยนสถานะงานของฉัน' },
  { k: 'flow_member', label: 'เพิ่ม/นำออกจากสมาชิกโครงการ' },
  { k: 'overdue', label: 'งานใกล้ครบ / เลยกำหนด' },
  { k: 'daily', label: 'เตือนกรอกยอดขายรายวัน' },
  { k: 'stock', label: 'สต็อกใกล้หมด / หมด' },
  { k: 'sales', label: 'สัญญาณยอดขาย / ค่าแอด' },
  { k: 'orders', label: 'ออเดอร์ค้างนาน' },
  { k: 'po', label: 'PO ครบกำหนดรับ' },
];

const EXT_COLS = 'id,kind,title,body,flow_id,task_id,actor,read,created_at,read_at,archived_at,severity,entity_type,action,url';
const BASE_SEL = 'id,kind,title,body,flow_id,task_id,actor,read,created_at';

const AUDIT_ACTION = {
  create: { l: 'สร้าง', c: 'var(--good)' }, update: { l: 'แก้ไข', c: 'var(--info)' },
  delete: { l: 'ลบ', c: 'var(--bad)' }, purge: { l: 'ลบถาวร', c: 'var(--bad)' },
  restore: { l: 'กู้คืน', c: 'var(--good)' }, move: { l: 'ย้าย', c: 'var(--accent)' }, export: { l: 'ส่งออก', c: 'var(--info)' }, return: { l: 'รับคืน', c: 'var(--warn)' },
};

export function NotificationsCenter() {
  const { version } = useData() || {};
  const me = window.__userEmail || '';
  const beat = useBeatOn('notif-center');
  const [list, setList] = useState([]);
  const [audit, setAudit] = useState([]);
  const [tab, setTab] = useState('all'); // all | unread | mention | assign | system | archived
  const [query, setQuery] = useState('');
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [, bump] = useState(0);
  const hasExtRef = useRef(true);

  const load = async () => {
    if (!supabase || !me) return;
    let { data, error } = await supabase.from('tmk_notifications').select(EXT_COLS).eq('user_email', me).order('created_at', { ascending: false }).limit(300);
    if (error && /(read_at|archived_at|severity|entity_type|action|url|column|PGRST204)/i.test(error.message || error.code || '')) {
      hasExtRef.current = false;
      ({ data, error } = await supabase.from('tmk_notifications').select(BASE_SEL).eq('user_email', me).order('created_at', { ascending: false }).limit(300));
    }
    if (!error && Array.isArray(data)) setList(data);
  };
  useEffect(() => {
    load();
    if (!supabase || !me) return;
    let ch = null;
    try { ch = supabase.channel('notifc-' + me).on('postgres_changes', { event: '*', schema: 'public', table: 'tmk_notifications', filter: `user_email=eq.${me}` }, () => load()).subscribe(); } catch { /* ignore */ }
    return () => { if (ch) { try { supabase.removeChannel(ch); } catch { /* ignore */ } } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

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

  const active = useMemo(() => list.filter(n => !n.archived_at), [list]);
  const archived = useMemo(() => list.filter(n => !!n.archived_at), [list]);
  const unreadCount = active.filter(n => !n.read).length;

  const counts = { all: active.length, unread: unreadCount, mention: active.filter(n => n.kind === 'mention').length, assign: active.filter(n => n.kind === 'assign').length, archived: archived.length };

  const filtered = useMemo(() => {
    let src = tab === 'archived' ? archived : active;
    if (tab === 'unread') src = src.filter(n => !n.read);
    else if (tab === 'mention') src = src.filter(n => n.kind === 'mention');
    else if (tab === 'assign') src = src.filter(n => n.kind === 'assign');
    const q = query.trim().toLowerCase();
    if (q) src = src.filter(n => `${n.title || ''} ${n.body || ''}`.toLowerCase().includes(q));
    return src;
  }, [active, archived, tab, query]);

  const groups = useMemo(() => {
    const m = new Map();
    filtered.forEach(n => { const b = dateBucket(n.created_at); if (!m.has(b)) m.set(b, []); m.get(b).push(n); });
    return ['วันนี้', 'เมื่อวาน', 'ก่อนหน้า'].filter(b => m.has(b)).map(b => ({ label: b, items: m.get(b) }));
  }, [filtered]);

  // mutations — optimistic + supabase (graceful)
  const patch = (ids, fn) => setList(p => p.map(n => ids.includes(n.id) ? fn(n) : n));
  const onRead = (n, read = true) => { patch([n.id], x => ({ ...x, read, read_at: read ? new Date().toISOString() : null })); setNotifRead([n.id], read); };
  const onArchive = (n) => { patch([n.id], x => ({ ...x, archived_at: new Date().toISOString(), read: true })); archiveNotif([n.id]); };
  const onUnarchive = (n) => { patch([n.id], x => ({ ...x, archived_at: null })); unarchiveNotif([n.id]); };
  const onDelete = (n) => { setList(p => p.filter(x => x.id !== n.id)); deleteNotif([n.id]); };
  const onMarkAll = () => { const ids = active.filter(n => !n.read).map(n => n.id); if (!ids.length) return; patch(ids, x => ({ ...x, read: true, read_at: new Date().toISOString() })); setNotifRead(ids, true); };

  const navTo = (n) => {
    if (!n.read) onRead(n, true);
    if (n.task_id) { const tk = (TMK.tasks || []).find(x => x.id === n.task_id); if (tk) { window.__setFlow?.(tk.flow || '__general__'); window.__goSection?.('flows', 'kanban'); setTimeout(() => window.__openModal?.('task', { ...tk, channel: Array.isArray(tk.channel) ? tk.channel : [tk.channel] }), 80); return; } }
    if (n.flow_id != null) { window.__setFlow?.(n.flow_id || '__general__'); window.__goSection?.('flows', 'kanban'); }
  };

  const togglePref = (k) => { try { const cur = localStorage.getItem('tmk-notif-' + k) !== 'false'; localStorage.setItem('tmk-notif-' + k, cur ? 'false' : 'true'); } catch { /* ignore */ } bump(x => x + 1); };
  const prefOn = (k) => { try { return localStorage.getItem('tmk-notif-' + k) !== 'false'; } catch { return true; } };

  const TABS = [
    { id: 'all', label: 'ทั้งหมด', n: counts.all },
    { id: 'unread', label: 'ยังไม่อ่าน', n: counts.unread },
    { id: 'mention', label: '@แท็ก', n: counts.mention },
    { id: 'assign', label: 'มอบหมาย', n: counts.assign },
    { id: 'system', label: 'ระบบ' },
    { id: 'archived', label: 'คลัง', n: counts.archived },
  ];

  if (beat) return <PageSkeleton />;

  return (
    <div className="content-inner rise flex flex-col gap-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2"><Icon name="bell" className="size-5" /> การแจ้งเตือน {unreadCount > 0 && <Badge variant="secondary">{unreadCount} ใหม่</Badge>}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">รวมการแจ้งเตือนของคุณ + กิจกรรมทั่วทั้งระบบ</p>
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
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
            {PREFS.map(p => (
              <label key={p.k} className="flex items-center justify-between gap-3 py-1.5 cursor-pointer text-sm">
                <span>{p.label}</span>
                <Switch checked={prefOn(p.k)} onCheckedChange={() => togglePref(p.k)} />
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">* การตั้งค่าเก็บในเครื่องนี้ (ต่อเบราว์เซอร์)</p>
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
      {tab === 'system' ? (
        <div className="rounded-xl border bg-card divide-y">
          {audit.length === 0 ? <div className="py-14 text-center text-sm text-muted-foreground">— ไม่มีกิจกรรม —</div> : audit.map((a, i) => {
            let d = {}; try { d = typeof a.details === 'string' ? JSON.parse(a.details) : (a.details || {}); } catch { /* ignore */ }
            const am = AUDIT_ACTION[a.action] || { l: a.action, c: 'var(--ink-3)' };
            const who = (TMK.staff || []).find(s => s.email === a.user_email)?.name || (a.user_email || '').replace(/@.*/, '') || 'ระบบ';
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
        <div className="border-2 border-dashed rounded-xl py-16 text-center text-muted-foreground">
          <Icon name="bell" className="size-8 mx-auto opacity-30 mb-2" />
          <p className="text-sm">{tab === 'archived' ? 'ยังไม่มีรายการในคลัง' : query ? 'ไม่พบการแจ้งเตือนที่ค้นหา' : 'ไม่มีการแจ้งเตือน'}</p>
        </div>
      ) : groups.map(g => (
        <div key={g.label} className="flex flex-col gap-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">{g.label}</div>
          <div className="rounded-xl border bg-card divide-y overflow-hidden">
            {g.items.map(n => <NotifRow key={n.id} n={n} onNav={navTo} onRead={onRead} onArchive={onArchive} onUnarchive={onUnarchive} onDelete={onDelete} archivedView={tab === 'archived'} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function NotifRow({ n, onNav, onRead, onArchive, onUnarchive, onDelete, archivedView }) {
  const m = kindMeta(n);
  const actorName = (TMK.staff || []).find(s => s.email === n.actor)?.name || (n.actor || '').replace(/@.*/, '');
  return (
    <div role="button" tabIndex={0} onClick={() => onNav(n)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNav(n); } }}
      className="group flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/40" style={{ background: n.read ? undefined : 'var(--accent-soft)', borderLeft: `3px solid ${n.read ? 'transparent' : m.color}` }}>
      <span className="size-8 rounded-full grid place-items-center shrink-0 mt-0.5" style={{ background: `color-mix(in srgb, ${m.color} 16%, transparent)`, color: m.color }}>
        <Icon name={m.icon} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-snug">{n.title || m.label}</div>
        {n.body ? <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</div> : null}
        <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5">
          {actorName ? <><span>{actorName}</span><span>·</span></> : null}<span>{timeAgo(n.created_at)}</span>
          {n.read && n.read_at ? <><span>·</span><span className="inline-flex items-center gap-0.5"><Icon name="check" className="size-3" /> อ่านแล้ว</span></> : null}
        </div>
      </div>
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        {!archivedView && <button className="size-7 grid place-items-center rounded hover:bg-muted text-muted-foreground" title={n.read ? 'ทำเป็นยังไม่อ่าน' : 'ทำเป็นอ่านแล้ว'} aria-label={n.read ? 'ทำเป็นยังไม่อ่าน' : 'ทำเป็นอ่านแล้ว'} onClick={() => onRead(n, !n.read)}><Icon name={n.read ? 'dot' : 'check'} className="size-4" /></button>}
        {archivedView
          ? <button className="size-7 grid place-items-center rounded hover:bg-muted text-muted-foreground" title="เอาออกจากคลัง" aria-label="เอาออกจากคลัง" onClick={() => onUnarchive(n)}><Icon name="up" className="size-4" /></button>
          : <button className="size-7 grid place-items-center rounded hover:bg-muted text-muted-foreground" title="เก็บเข้าคลัง" aria-label="เก็บเข้าคลัง" onClick={() => onArchive(n)}><Icon name="archive" className="size-4" /></button>}
        <button className="size-7 grid place-items-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title="ลบ" aria-label="ลบ" onClick={() => onDelete(n)}><Icon name="trash" className="size-4" /></button>
      </div>
    </div>
  );
}
