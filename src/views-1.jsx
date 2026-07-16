/* ============================================================
   TMK Operation — Views part 1: Home (cockpit) + Sales
   ============================================================ */
import { useState, useEffect } from 'react';
import { TMK } from './data.js';
import { B, P, Icon, Avatar, Ring, Skel, useBeat } from './components.jsx';
import { useUser } from './userContext.jsx';
import { getToday, THAI_MONTHS, THAI_MONTHS_FULL, todayISO } from './lib/dateUtils.js';
import { computeMonth } from './dataContext.jsx';
import { supabase } from './lib/supabaseClient.js';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const THAI_WEEKDAYS = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];

const D = TMK;
// ❌ ไม่ destructure constants เพราะ primitive snapshot จะค้างที่ 0
// ✅ ใช้ TMK.consts.X inline เพื่อให้อัปเดตจาก Supabase ทันที
// chipVar/getAdCampaigns/getSegments ย้ายไป views-sales.jsx (ใช้เฉพาะ Sales · REFACTOR-1)

/* ============================================================
   HOME — Executive cockpit
   ============================================================ */
/* ---------- ทีมวันนี้ — ออนไลน์/ออฟไลน์ จาก tmk_presence (heartbeat) ---------- */
const ONLINE_MS = 150000; // 2.5 นาที — heartbeat ทุก 45 วิ ให้ margin พอ
const PAGE_LABEL = { home: 'หน้าหลัก', sales: 'ยอดขาย', planner: 'แผนงาน', catalog: 'สินค้า', settings: 'ตั้งค่า' };

function TeamTodayCard({ go }) {
  const [presence, setPresence] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    const fetchP = async () => {
      const { data, error } = await supabase.from('tmk_presence').select('email,name,page,last_seen_at');
      if (alive && !error && Array.isArray(data)) setPresence(data);
    };
    fetchP();
    // อ่านสด + ขยับ "now" ทุก 30 วิ → คนที่เงียบเกินหน้าต่างจะกลายเป็นออฟไลน์เอง
    const id = setInterval(() => { setNow(Date.now()); fetchP(); }, 30000);
    const onVis = () => { if (document.visibilityState === 'visible') { setNow(Date.now()); fetchP(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  const pmap = {};
  presence.forEach(p => { if (p.email) pmap[String(p.email).toLowerCase()] = p; });
  const todayStr = todayISO();
  const openTasks = (D.tasks || []).filter(t => t.status !== 'done');
  const members = (D.roles || []).map(r => {
    const p = pmap[String(r.email || '').toLowerCase()];
    const last = p?.last_seen_at ? new Date(p.last_seen_at).getTime() : 0;
    const online = !!last && (now - last) < ONLINE_MS;
    // เทียบวันแบบ "เวลาท้องถิ่น" (ไม่ใช่ UTC) — กัน heartbeat ก่อน 07:00 ไทยถูกนับเป็นเมื่อวาน
    const ld = last ? new Date(last) : null;
    const activeToday = !!ld && `${ld.getFullYear()}-${String(ld.getMonth() + 1).padStart(2, '0')}-${String(ld.getDate()).padStart(2, '0')}` === todayStr;
    const load = openTasks.filter(t => (t.responsible || []).some(x => x === r.name || x === r.department)).length;
    return { ...r, online, activeToday, page: p?.page || '', last, load };
  });
  // เรียง: ออนไลน์ก่อน → เคลื่อนไหววันนี้ → ล่าสุดใหม่สุด
  members.sort((a, b) => (b.online - a.online) || (b.activeToday - a.activeToday) || (b.last - a.last));
  const onlineCount = members.filter(m => m.online).length;
  const activeCount = members.filter(m => m.activeToday).length;

  const ago = (ts) => {
    if (!ts) return 'ยังไม่เข้าระบบ';
    const s = Math.max(0, (now - ts) / 1000);
    if (s < 60) return 'เมื่อสักครู่';
    if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
    if (s < 86400) return `${Math.floor(s / 3600)} ชม.ที่แล้ว`;
    return `${Math.floor(s / 86400)} วันก่อน`;
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="flex items-center text-base font-semibold">
            <Icon name="users" className="mr-2 h-4 w-4 text-primary" />
            ทีมวันนี้
            {members.length > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">· {onlineCount} ออนไลน์</span>}
          </CardTitle>
        </div>
        <Button variant="ghost" size="sm" onClick={() => go('settings', 'roles')} className="h-8 text-xs">
          จัดการทีม <Icon name="arrowR" className="ml-2 h-3 w-3" />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {members.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-6">ยังไม่มีสมาชิกในทีม</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">
                <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-green-500"></span>
                {onlineCount} ออนไลน์
              </Badge>
              <Badge variant="secondary" className="bg-muted text-muted-foreground hover:bg-muted">
                <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground"></span>
                {members.length - onlineCount} ออฟไลน์
              </Badge>
              <Badge variant="outline" className="text-muted-foreground">
                เคลื่อนไหววันนี้ {activeCount} คน
              </Badge>
            </div>
            {/* การ์ดสมาชิก 3 คอลัมน์/แถว — โชว์ทุกคน (สไตล์การ์ด talent · adapt ข้อมูลจริง: หน้าที่/ออนไลน์/งานค้าง) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {members.map((m, i) => (
                <div key={m.email || i} className="rounded-2xl border bg-card p-3.5 flex flex-col gap-2.5 hover:shadow-md hover:-translate-y-0.5 transition-all">
                  <div className="flex items-start justify-between gap-2">
                    {m.department
                      ? <span className="text-[11px] font-medium px-2 py-1 rounded-lg truncate max-w-[75%]" style={{ background: (m.color || '#64748b') + '1a', color: m.color || '#64748b' }}>{m.department}</span>
                      : <span className="text-[11px] font-medium px-2 py-1 rounded-lg bg-muted text-muted-foreground">สมาชิก</span>}
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 mt-0.5 ${m.online ? 'bg-green-500' : 'bg-muted-foreground/35'}`} title={m.online ? 'ออนไลน์' : 'ออฟไลน์'} />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <Avatar name={m.name} color={m.color || 'var(--ink-3)'} size={44} />
                      {m.online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-card" />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{m.name}</div>
                      <div className={`text-xs truncate ${m.online ? 'text-green-600 dark:text-green-500' : 'text-muted-foreground'}`}>
                        {m.online ? `ออนไลน์${m.page ? ` · ${PAGE_LABEL[m.page] || m.page}` : ''}` : ago(m.last)}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-auto pt-0.5">
                    {m.load > 0
                      ? <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium">งานค้าง {m.load}</span>
                      : <span className="text-[11px] px-2 py-0.5 rounded-md bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium">ไม่มีงานค้าง</span>}
                    {m.activeToday && <span className="text-[11px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground">เคลื่อนไหววันนี้</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- แคมเปญ — donut total/กำลังรัน/เสี่ยง จาก TMK.campaigns ---------- */
const CAMP_TABS = [['all', 'ทั้งหมด'], ['live', 'กำลังรัน'], ['risk', 'เสี่ยง'], ['upcoming', 'รอเริ่ม']];
function CampaignsCard({ go }) {
  const [campFilter, setCampFilter] = useState('all'); // filter เลือกดูแคมเปญตามสถานะ
  const today = todayISO();
  // ใกล้จบใน 5 วัน — คำนวณแบบ pure จาก today (เลี่ยง Date.now ระหว่าง render)
  const [_ty, _tm, _td] = today.split('-').map(Number);
  const soon = new Date(Date.UTC(_ty, _tm - 1, _td + 5)).toISOString().slice(0, 10);
  const all = (D.campaigns || []).filter(c => c.status !== 'done' && c.status !== 'cancelled'); // แคมเปญที่ยัง active (รัน/กำลังจะรัน/พัก)
  const live = all.filter(c => c.status === 'live');
  // เสี่ยง = กำลังรัน และใกล้จบ/เลยกำหนดแล้ว (ต้องตัดสินใจต่อ/สรุป) หรือถูกพักไว้
  const atRisk = all.filter(c => (c.status === 'live' && c.endISO && c.endISO <= soon) || c.status === 'paused');
  const urgent = [...atRisk].filter(c => c.endISO).sort((a, b) => a.endISO.localeCompare(b.endISO))[0] || atRisk[0];
  const total = all.length;
  const pctOf = (n) => total > 0 ? (n / total) * 100 : 0;
  // ความคืบหน้าแต่ละแคมเปญ = สัดส่วนเวลาที่ผ่านไปของช่วงแคมเปญ (pure — ไม่ใช้ Date.now)
  const dnum = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const tNum = dnum(today);
  const stMeta = { live: { l: 'กำลังรัน', c: 'var(--good)' }, upcoming: { l: 'รอเริ่ม', c: 'var(--info)' }, paused: { l: 'พัก', c: 'var(--warn)' } };
  const progressOf = (c) => { if (!c.startISO || !c.endISO) return null; const s = dnum(c.startISO), e = dnum(c.endISO); if (e <= s) return 100; return Math.max(0, Math.min(100, ((tNum - s) / (e - s)) * 100)); };

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center text-base font-semibold"><Icon name="megaphone" className="mr-2 h-4 w-4 text-primary" /> แคมเปญ</CardTitle>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => go('settings', 'campaigns')}>ดูทั้งหมด <Icon name="arrowR" className="ml-2 h-3 w-3" /></Button>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
      {total === 0 ? (
        <div style={{ textAlign: 'center', padding: '18px 0', color: 'var(--ink-4)' }}>
          <div className="cap" style={{ marginBottom: 10 }}>ยังไม่มีแคมเปญที่กำลังดำเนินอยู่</div>
          <Button variant="outline" size="sm" onClick={() => go('settings', 'campaigns')}>สร้างแคมเปญ</Button>
        </div>
      ) : (<>
        {/* KPI rings — คลิกเพื่อกรองรายการด้านล่าง */}
        <div className="grid grid-cols-4 gap-2">
          {(() => { const upc = all.filter(c => c.status === 'upcoming').length; return [
            { id: 'all', n: total, l: 'ทั้งหมด', c: 'var(--accent)', pct: 100 },
            { id: 'live', n: live.length, l: 'กำลังรัน', c: 'var(--good)', pct: pctOf(live.length) },
            { id: 'risk', n: atRisk.length, l: 'เสี่ยง', c: 'var(--warn)', pct: pctOf(atRisk.length) },
            { id: 'upcoming', n: upc, l: 'รอเริ่ม', c: 'var(--info)', pct: pctOf(upc) },
          ]; })().map(k => (
            <button key={k.id} onClick={() => setCampFilter(k.id)} title={`ดูเฉพาะ${k.l}`}
              className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl border transition-all ${campFilter === k.id ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:bg-muted/50'}`}>
              <Ring pct={k.pct} size={56} stroke={6} color={k.c}><span className="num" style={{ fontSize: 17, fontWeight: 800, color: k.id === 'risk' && k.n ? 'var(--warn)' : undefined }}>{k.n}</span></Ring>
              <span className="text-xs text-muted-foreground font-medium">{k.l}</span>
            </button>
          ))}
        </div>
        {/* ต้องดูด่วน */}
        <div className="mt-3 pt-3 border-t border-border/60">
          {urgent ? (
            <div onClick={() => go('settings', 'campaigns')} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer" style={{ background: 'color-mix(in srgb, var(--warn) 9%, transparent)' }}>
              <span className="size-2 rounded-full shrink-0" style={{ background: urgent.color || 'var(--warn)' }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate"><span style={{ color: 'var(--warn)' }}>ต้องดูด่วน</span> · {urgent.name}</div>
                <div className="text-xs text-muted-foreground truncate">{urgent.status === 'paused' ? 'ถูกพักไว้' : urgent.endISO && urgent.endISO < today ? `เลยกำหนด (จบ ${urgent.end})` : `ใกล้จบ ${urgent.end}`}</div>
              </div>
              <Icon name="arrowR" className="size-4 text-muted-foreground shrink-0" />
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--good)' }}><Icon name="check" className="size-4" /> ทุกแคมเปญอยู่ในแผน</div>
          )}
        </div>
        {/* filter + รายการความคืบหน้า (เวลาผ่านไปกี่ %) */}
        <div className="mt-3 pt-3 border-t border-border/60 flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-1.5">
            {CAMP_TABS.map(([id, label]) => {
              const n = id === 'all' ? all.length : id === 'live' ? live.length : id === 'risk' ? atRisk.length : all.filter(c => c.status === 'upcoming').length;
              return (
                <button key={id} onClick={() => setCampFilter(id)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${campFilter === id ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-muted'}`}>
                  {label} {n > 0 && <span className={campFilter === id ? 'opacity-80' : 'opacity-60'}>{n}</span>}
                </button>
              );
            })}
          </div>
          {/* รายการเลื่อนได้เมื่อแคมเปญเยอะ — ไม่ให้การ์ดสูงเกินคอลัมน์ซ้าย */}
          <div className="flex flex-col gap-2.5 overflow-y-auto pr-1 -mr-1" style={{ maxHeight: 300 }}>
          {(() => {
            const shown = all.filter(c => campFilter === 'all' ? true : campFilter === 'live' ? c.status === 'live' : campFilter === 'risk' ? atRisk.includes(c) : c.status === 'upcoming');
            if (shown.length === 0) return <div className="text-center text-xs text-muted-foreground py-2.5">ไม่มีแคมเปญในหมวดนี้</div>;
            return shown.map(c => {
              const p = progressOf(c);
              const sm = stMeta[c.status] || { l: c.status, c: 'var(--ink-3)' };
              return (
                <div key={c.id} onClick={() => go('settings', 'campaigns')} className="rounded-lg px-2 py-1.5 -mx-1 hover:bg-muted/40 cursor-pointer transition-colors">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="size-2 rounded-sm shrink-0" style={{ background: c.color || 'var(--ink-3)' }} />
                    <span className="text-sm font-semibold flex-1 truncate">{c.name}</span>
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md shrink-0 tabular-nums" style={{ background: sm.c + '1a', color: sm.c }}>{p == null ? sm.l : `${Math.round(p)}%`}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${p == null ? 0 : p}%`, background: c.color || 'var(--accent)' }} /></div>
                  <div className="text-[11px] text-muted-foreground mt-1 truncate">{sm.l}{c.start && c.end ? ` · ${c.start}–${c.end}` : ''}</div>
                </div>
              );
            });
          })()}
          </div>
        </div>
      </>)}
      </CardContent>
    </Card>
  );
}


/* Skeleton หน้าหลัก: greeting + การ์ด todo + การ์ดสรุป */
function HomeSkeleton() {
  return (
    <div className="content-inner rise">
      <div className="row between wrap" style={{ marginBottom: 20, gap: 12 }}>
        <div><Skel w={170} h={11} style={{ marginBottom: 10 }} /><Skel w={280} h={30} r={8} /></div>
        <Skel w={90} h={24} r={20} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 14 }}>
        {Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-[22px]"><div className="row" style={{ gap: 10, alignItems: 'flex-start' }}><Skel w={10} h={10} r="50%" style={{ marginTop: 4 }} /><div style={{ flex: 1 }}><Skel w="68%" h={13} /><Skel w="90%" h={9} style={{ marginTop: 9 }} /></div></div></Card>)}
      </div>
      <div className="row" style={{ gap: 14, marginTop: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Card className="p-[22px]" style={{ flex: '2 1 320px' }}><Skel w={140} h={13} style={{ marginBottom: 14 }} />{Array.from({ length: 4 }).map((_, i) => <div key={i} className="row" style={{ gap: 10, padding: '8px 0' }}><Skel w={8} h={8} r="50%" /><Skel w={`${52 + i * 8}%`} h={12} /></div>)}</Card>
        <Card className="p-[22px]" style={{ flex: '1 1 220px' }}><Skel w={120} h={13} style={{ marginBottom: 14 }} />{Array.from({ length: 3 }).map((_, i) => <div key={i} style={{ marginBottom: 14 }}><Skel w="50%" h={9} /><Skel w="75%" h={18} style={{ marginTop: 6 }} /></div>)}</Card>
      </div>
    </div>
  );
}

/* Skeleton ยอดขาย: การ์ด KPI + กราฟ */

export function HomeView({ go }) {
  const { user } = useUser() || {};
  const userName = user?.name || 'มัง';
  const beat = useBeat(350); // จังหวะ skeleton สั้นๆ ตอนเข้าหน้า ให้เหมือนหน้า Sale
  if (beat) return <HomeSkeleton />;

  // โฟกัสวันนี้ — สิ่งที่ต้องจัดการ (หลังบ้าน ไม่มียอด/เป้า) + งานวันนี้
  const todayD = getToday().day;
  const enteredToday = (D.dailyMonth || []).some(d => d.d === todayD);
  const dueTasks = (D.tasks || []).filter(t => t.status !== 'done' && t.dateISO && t.dateISO <= todayISO());
  const todayTasks = (D.tasks || []).filter(t => t.status === 'inprogress' || t.status === 'review' || t.dateISO === todayISO());
  const pendingOrders = (D.orders || []).filter(o => o.status !== 'shipped' && o.status !== 'cancelled');
  const todos = [];
  if (!enteredToday) todos.push({ c: 'var(--bad)', t: 'ยังไม่บันทึกยอดขายวันนี้', d: 'กดเพื่อกรอกยอดรายวัน', act: () => go('sales', 'monthly') });
  if (dueTasks.length) todos.push({ c: 'var(--warn)', t: `งานครบกำหนด/ค้าง ${dueTasks.length} งาน`, d: dueTasks.slice(0, 2).map(t => t.title).join(', '), act: () => go('flows', 'kanban') });
  if (pendingOrders.length) todos.push({ c: 'var(--accent-2)', t: `ออเดอร์รอจัดการ ${pendingOrders.length} รายการ`, d: 'จัดการบนบอร์ดออเดอร์', act: () => go('catalog', 'orders') });

  // สรุปเมื่อวาน — digest อ่านจบใน 10 วินาที (รองรับเมื่อวานข้ามเดือน)
  const digest = (() => {
    const td = getToday();
    let mdD, yd; // เดือนที่ "เมื่อวาน" อยู่ + เลขวันเมื่อวาน
    if (td.day > 1) { mdD = computeMonth(td.month - 1, td.yearBE); yd = td.day - 1; }
    else {
      const pm = td.month === 1 ? 12 : td.month - 1, py = td.month === 1 ? td.yearBE - 1 : td.yearBE;
      mdD = computeMonth(pm - 1, py); yd = new Date(py - 543, pm, 0).getDate();
    }
    const rows = mdD.dailyBreakdown || [];
    const yest = rows.find(x => x.d === yd) || null;
    const pool = rows.filter(x => x.d < yd).sort((a, b) => b.d - a.d).slice(0, 7);
    const avg7 = pool.length ? pool.reduce((a, x) => a + x.total, 0) / pool.length : 0;
    const top = yest && yest.channels.length ? [...yest.channels].sort((a, b) => b.rev - a.rev)[0] : null;
    const diff = yest && avg7 > 0 ? ((yest.total - avg7) / avg7) * 100 : null;
    return { yd, yest, avg7, top, diff, label: yest ? yest.label : `${yd} ${THAI_MONTHS[(td.day > 1 ? td.month : (td.month === 1 ? 12 : td.month - 1)) - 1]}` };
  })();
  const copyDigest = () => {
    if (!digest.yest) return;
    const t = `สรุปยอด TMK — เมื่อวาน (${digest.label}): ${B(digest.yest.total)}`
      + (digest.top ? ` · ช่องเด่น ${digest.top.name} ${B(digest.top.rev)} (${P(digest.top.pct, 0)})` : '')
      + (digest.diff != null ? ` · เทียบเฉลี่ย 7 วัน ${digest.diff >= 0 ? '+' : ''}${digest.diff.toFixed(0)}%` : '');
    try { navigator.clipboard.writeText(t); window.__toast && window.__toast('คัดลอกสรุปแล้ว — แปะส่งไลน์ได้เลย', 'success'); } catch { window.__toast && window.__toast('คัดลอกไม่สำเร็จ', 'error'); }
  };

  return (
    <div className="content-inner rise">
      {/* greeting */}
      <div className="row between wrap" style={{ marginBottom: 20, gap: 12 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>{(() => { const td = getToday(); return `${THAI_WEEKDAYS[new Date().getDay()]} ${td.day} ${THAI_MONTHS_FULL[td.month - 1]} ${td.yearBE}`; })()}</div>
          <h1 className="display">{(() => { const h = new Date().getHours(); return h < 12 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : h < 21 ? 'สวัสดีตอนเย็น' : 'สวัสดีตอนดึก'; })()}, {userName} {'👋'}</h1>
        </div>
        <Badge variant={navigator.onLine ? 'success' : 'warning'}><span className="dot-c" style={{ background: navigator.onLine ? 'var(--good)' : 'var(--warn)' }}></span> {navigator.onLine ? 'ออนไลน์' : 'ออฟไลน์'}</Badge>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1.5fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* โฟกัสวันนี้ */}
        <Card className="p-[22px]">
          <CardHeader className="flex-row items-center justify-between space-y-0 p-0 pb-4">
            <CardTitle className="m-0 text-lg font-semibold flex items-center gap-2"><span style={{ color: 'var(--accent)' }}><Icon name="listChecks" /></span> {'โฟกัสวันนี้'}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => go('flows', 'kanban')}>{'งานทั้งหมด'} <Icon name="arrowR" /></Button>
          </CardHeader>
          {todos.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: todayTasks.length ? 16 : 0 }}>
              {todos.map((td, i) => (
                <div key={i} className="row" onClick={td.act} style={{ gap: 10, padding: '10px 11px', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', borderLeft: `3px solid ${td.c}`, cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="sm" style={{ fontWeight: 600 }}>{td.t}</div>
                    {td.d && <div className="cap" style={{ marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{td.d}</div>}
                  </div>
                  <span style={{ flexShrink: 0, color: 'var(--ink-3)' }}><Icon name="arrowR" /></span>
                </div>
              ))}
            </div>
          ) : (
            <div className="cap" style={{ textAlign: 'center', padding: '18px 0', color: 'var(--good)', fontWeight: 600 }}><Icon name="check" /> ไม่มีอะไรค้าง — เคลียร์หมดแล้ว</div>
          )}
          {todayTasks.length > 0 && (<>
            <div className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wide">งานวันนี้ <span className="opacity-70">({todayTasks.length})</span></div>
            <div className="flex flex-col divide-y divide-border/50">
              {todayTasks.slice(0, 6).map(t => {
                const stMap = { todo: { l: 'รอทำ', c: 'var(--ink-3)' }, inprogress: { l: 'กำลังทำ', c: 'var(--info)' }, review: { l: 'รอตรวจ', c: 'var(--warn)' }, done: { l: 'เสร็จ', c: 'var(--good)' } }[t.status] || { l: '—', c: 'var(--ink-3)' };
                // ผู้รับผิดชอบ — resolve ชื่อ → staff/หน้าที่ (สี avatar)
                const names = Array.isArray(t.responsible) ? t.responsible : String(t.responsible || '').split(',').map(s => s.trim()).filter(Boolean);
                const assignees = names.map(n => { const st = (D.staff || []).find(s => s.name === n); const du = (D.duties || []).find(d => d.name === n); return { name: n, color: st?.color || du?.color || 'var(--ink-3)' }; });
                return (
                  <div key={t.id} onClick={() => window.__openModal && window.__openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] })}
                    className="flex items-center gap-3 px-2 py-2.5 -mx-1 rounded-lg hover:bg-muted/40 cursor-pointer transition-colors">
                    <span className="size-2 rounded-full shrink-0" style={{ background: stMap.c }} />
                    <span className="text-sm font-medium flex-1 truncate">{t.title}</span>
                    {assignees.length > 0 && (
                      <div className="flex -space-x-1.5 shrink-0" title={assignees.map(a => a.name).join(', ')}>
                        {assignees.slice(0, 2).map((a, i) => (
                          <span key={i} className="inline-flex rounded-full ring-2 ring-card"><Avatar name={a.name} color={a.color} size={22} /></span>
                        ))}
                        {assignees.length > 2 && <span className="inline-flex items-center justify-center size-[22px] rounded-full ring-2 ring-card bg-muted text-[10px] font-semibold text-muted-foreground">+{assignees.length - 2}</span>}
                      </div>
                    )}
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: stMap.c + '1a', color: stMap.c }}>{stMap.l}</span>
                  </div>
                );
              })}
            </div>
          </>)}
        </Card>

        {/* สรุปเมื่อวาน — digest อัตโนมัติ */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center text-base font-semibold">
              <Icon name="up" className="mr-2 h-4 w-4 text-primary" /> สรุปเมื่อวาน
              <span className="ml-2 text-xs font-normal text-muted-foreground">({digest.label})</span>
            </CardTitle>
            {digest.yest && <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={copyDigest} title="คัดลอกข้อความสรุป — แปะส่งไลน์ได้เลย">คัดลอก</Button>}
          </CardHeader>
          <CardContent>
          {digest.yest ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
                <span className="num h1">{B(digest.yest.total)}</span>
                {digest.diff != null && <span className="cap" style={{ fontWeight: 700, color: digest.diff >= 0 ? 'var(--good)' : 'var(--bad)' }}>{digest.diff >= 0 ? '▲ +' : '▼ '}{digest.diff.toFixed(0)}% {'เทียบเฉลี่ย 7 วัน'}</span>}
              </div>
              {digest.top && (
                <div className="row" style={{ gap: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: digest.top.hex, flexShrink: 0 }}></span>
                  <span className="cap">{'ช่องเด่น'}: <strong>{digest.top.name}</strong> {B(digest.top.rev)} ({P(digest.top.pct, 0)} {'ของวัน'})</span>
                </div>
              )}
              <div className="cap" style={{ color: 'var(--ink-4)' }}>{'แตะ'} "{'คัดลอก'}" {'เพื่อส่งสรุปเข้าไลน์ทีมได้ทันที'}</div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '14px 0', color: 'var(--ink-4)' }}>
              <div className="cap" style={{ marginBottom: 8 }}>{'ยังไม่มีข้อมูลเมื่อวาน'} ({digest.label})</div>
              <Button variant="outline" size="sm" onClick={() => window.__openModal && window.__openModal('record', {})}>กรอกย้อนหลัง</Button>
            </div>
          )}
          </CardContent>
        </Card>

        </div>

        {/* คอลัมน์ขวา — แคมเปญ */}
        <CampaignsCard go={go} />
      </div>

      {/* ทีมวันนี้ — การ์ดสมาชิกทุกคน (เต็มความกว้าง · 3 คอลัมน์/แถว) */}
      <div style={{ marginTop: 16 }}>
        <TeamTodayCard go={go} />
      </div>
    </div>
  );
}


/* ============================================================
   SALES — sub: overview / channels / ads / customers
   ============================================================ */

/* Shared date picker bar */

// SalesView ย้ายไป views-sales.jsx (REFACTOR-1) — re-export กัน consumer เดิม (App.jsx) พัง
export { SalesView } from './views-sales.jsx';
