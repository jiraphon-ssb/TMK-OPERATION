// กระดิ่งแจ้งเตือนบน header + NotifRow ใช้ร่วม (PART 34)
// ใช้ store เดียว (useNotifications) · registry เดียว (meta/นำทาง) · signals แยกโซน
import { useState, useMemo } from 'react';
import { useData } from './dataContext.jsx';
import { Icon } from './components.jsx';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useNotifications, isSnoozed } from './lib/notifStore.js';
import { computeSignals, navigateSignal } from './lib/notifSignals.js';
import { kindMeta, timeAgo, navigateNotif, displayName, SIGNAL_ICON } from './lib/notifRegistry.js';

// ---------- แถวแจ้งเตือน (ใช้ทั้งกระดิ่งแบบ compact และศูนย์แจ้งเตือนแบบเต็ม) ----------
export function NotifRow({ n, signal, compact, archivedView, actions, onClose }) {
  const m = kindMeta(signal ? { kind: n.kind, color: n._color, icon: SIGNAL_ICON[n.kind] || 'zap' } : n);
  const unread = !signal && !n.read;
  const onClick = () => {
    if (signal) navigateSignal(n);
    else { if (unread) actions?.markRead?.([n.id], true); navigateNotif(n); }
    onClose?.();
  };
  const stop = (e) => e.stopPropagation();
  return (
    <div role="button" tabIndex={0} onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className="group flex items-start gap-3 px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-muted/40"
      style={{ background: unread ? 'var(--accent-soft)' : undefined, borderLeft: `3px solid ${unread ? m.color : 'transparent'}` }}>
      <span className="grid place-items-center shrink-0 rounded-full mt-0.5" style={{ width: 30, height: 30, background: `color-mix(in srgb, ${m.color} 16%, transparent)`, color: m.color }}>
        <Icon name={m.icon} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-sm leading-snug ${unread ? 'font-semibold' : 'font-medium'}`}>{n.title || m.label}</div>
        {n.body ? <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</div> : null}
        <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
          {signal
            ? <span className="inline-flex items-center gap-0.5 text-[color:var(--accent-2)]">{n.txt} <Icon name="arrowR" className="size-3" /></span>
            : <>
                {n.actor ? <><span>{displayName(n.actor)}</span><span>·</span></> : null}
                <span>{timeAgo(n.created_at)}</span>
                {isSnoozed(n) ? <><span>·</span><span className="inline-flex items-center gap-0.5 text-[color:var(--warn)]"><Icon name="clock" className="size-3" /> เลื่อนแล้ว</span></> : null}
              </>}
        </div>
      </div>
      {!signal && !compact && actions ? (
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity" onClick={stop}>
          <RowBtn icon={n.read ? 'dot' : 'check'} title={n.read ? 'ทำเป็นยังไม่อ่าน' : 'อ่านแล้ว'} onClick={() => actions.markRead([n.id], !n.read)} />
          {!archivedView && (isSnoozed(n)
            ? <RowBtn icon="refresh" title="ยกเลิกการเลื่อน" onClick={() => actions.unsnooze([n.id])} />
            : <RowBtn icon="clock" title="เลื่อนเตือน 1 วัน" onClick={() => actions.snooze([n.id], new Date(Date.now() + 86400000))} />)}
          {archivedView
            ? <RowBtn icon="up" title="เอาออกจากคลัง" onClick={() => actions.unarchive([n.id])} />
            : <RowBtn icon="archive" title="เก็บเข้าคลัง" onClick={() => actions.archive([n.id])} />}
          <RowBtn icon="trash" title="ลบ" danger onClick={() => actions.remove([n.id])} />
        </div>
      ) : null}
    </div>
  );
}
function RowBtn({ icon, title, onClick, danger }) {
  return (
    <button className={`size-7 grid place-items-center rounded text-muted-foreground hover:bg-muted ${danger ? 'hover:text-destructive hover:bg-destructive/10' : ''}`}
      title={title} aria-label={title} onClick={onClick}><Icon name={icon} className="size-4" /></button>
  );
}

// ---------- กระดิ่งบน header ----------
export function NotifBell() {
  const { version } = useData() || {};
  const { list, prefs, prefOn, actions } = useNotifications();
  const [open, setOpen] = useState(false);

  const inbox = useMemo(
    () => list.filter(n => !n.archived_at && !isSnoozed(n) && prefOn(n.kind)),
    [list, prefs], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const unread = inbox.filter(n => !n.read).length;
  const { signalGroups, count: sigCount } = useMemo(() => computeSignals(prefOn), [version, prefs]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => setOpen(false);
  const markAll = () => actions.markRead(inbox.filter(n => !n.read).map(n => n.id), true);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full" aria-label={unread > 0 ? `การแจ้งเตือน ${unread} ใหม่` : 'การแจ้งเตือน'}>
          <Icon name="bell" className="size-5" />
          {unread > 0 && <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 grid place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: 'var(--bad)' }}>{unread > 99 ? '99+' : unread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[384px] p-0 overflow-hidden">
        <Tabs defaultValue="inbox">
          <div className="flex items-center justify-between gap-2 px-3 pt-3">
            <span className="font-bold text-sm flex items-center gap-1.5"><Icon name="bell" className="size-4" /> การแจ้งเตือน</span>
            <button className="text-[11px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40" disabled={!unread} onClick={markAll}>อ่านทั้งหมด</button>
          </div>
          <TabsList className="grid grid-cols-2 mx-3 mt-2">
            <TabsTrigger value="inbox" className="gap-1.5">กล่องข้อความ {unread > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{unread}</Badge>}</TabsTrigger>
            <TabsTrigger value="signals" className="gap-1.5">สัญญาณ {sigCount > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{sigCount}</Badge>}</TabsTrigger>
          </TabsList>

          <TabsContent value="inbox" className="mt-2 max-h-[60vh] overflow-y-auto divide-y">
            {inbox.length === 0
              ? <Empty icon="bell" text="ไม่มีการแจ้งเตือน" />
              : inbox.slice(0, 15).map(n => <NotifRow key={n.id} n={n} compact actions={actions} onClose={close} />)}
          </TabsContent>

          <TabsContent value="signals" className="mt-2 max-h-[60vh] overflow-y-auto">
            {signalGroups.length === 0
              ? <Empty icon="zap" text="ไม่มีสัญญาณตอนนี้" />
              : signalGroups.map(g => (
                  <div key={g.key}>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-3.5 pt-2 pb-1">{g.label}</div>
                    <div className="divide-y">{g.items.map(it => <NotifRow key={it.id} n={{ ...it, _color: g.color }} signal compact onClose={close} />)}</div>
                  </div>
                ))}
          </TabsContent>

          <div className="border-t px-3 py-2 text-right">
            <button className="text-xs font-bold text-[color:var(--accent-2)]" onClick={() => { close(); window.__goSection?.('notifications', 'all'); }}>ดูทั้งหมด →</button>
          </div>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
// badge นับ "ยังไม่อ่าน" บนเมนู sidebar — ใช้ store เดียวกับกระดิ่ง
export function NotifNavBadge() {
  const { list, prefs, prefOn } = useNotifications();
  const unread = useMemo(
    () => list.filter(n => !n.read && !n.archived_at && !isSnoozed(n) && prefOn(n.kind)).length,
    [list, prefs], // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!unread) return null;
  return <span className="ml-auto min-w-4 h-4 px-1 grid place-items-center text-[9px] font-bold text-white rounded-full" style={{ background: 'var(--bad, #ef4444)' }}>{unread > 9 ? '9+' : unread}</span>;
}

function Empty({ icon, text }) {
  return (
    <div className="py-12 text-center text-muted-foreground">
      <Icon name={icon} className="size-7 mx-auto opacity-30 mb-1.5" />
      <p className="text-sm">{text}</p>
    </div>
  );
}
