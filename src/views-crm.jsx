/* ============================================================
   views-crm.jsx — CRM 360 (section แยก · shadcn ล้วน · PART P2)
   ============================================================
   3 หน้า: ภาพรวม (segment) · ลูกค้า 360 (directory + drawer รวมทุกช่อง) · งานติดตาม
   soft-link รวมลูกค้าทุกช่อง (crmAgg) · RFM (rfmTiers) · tags + followups (graceful)
   ไม่แตะระบบอื่น — อ่านลูกค้าเดิม + เพิ่มชั้น tag/followup ด้วย customer_key
   ============================================================ */
import React, { useState, useEffect, useMemo } from 'react';
import { TMK } from './data.js';
import { useData } from './dataContext.jsx';
import { B, N, Icon, useBeatOn, PageSkeleton, SkelTable } from './components.jsx';
import { SideSheet } from './modals.jsx';
import { supabase } from './lib/supabaseClient.js';
import { logAudit } from './lib/audit.js';
import { thaiDate, todayISO } from './lib/dateUtils.js';
import { loadUnifiedCustomers, normPhone } from './lib/crmAgg.js';
import { RFM_TIERS } from './lib/saleAgg.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const genId = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const isMissingTable = (err) => /relation .* does not exist|does not exist|schema cache|PGRST205|42P01/i.test(err?.message || err?.code || '');
const tierMeta = (t) => RFM_TIERS.find(x => x.key === t) || RFM_TIERS[3];
const guardEdit = () => { if (!window.__canEdit) { window.__toast?.('สิทธิ์ "ดูอย่างเดียว"', 'warn'); return false; } return true; };

function TierBadge({ tier }) {
  const m = tierMeta(tier);
  return <Badge variant="outline" style={{ borderColor: m.color, color: m.color }}>{tier}</Badge>;
}
function FlagBadge({ flag }) {
  if (!flag) return null;
  const c = flag === 'เสี่ยงหลุด' ? 'var(--bad)' : flag === 'ใหม่' ? 'var(--good)' : 'var(--accent)';
  return <Badge variant="outline" style={{ borderColor: c, color: c }}>{flag}</Badge>;
}

/* ---------- ลูกค้า 360 drawer ---------- */
function CustomerDrawer({ cust, onClose }) {
  const [tags, setTags] = useState([]);          // tags ของลูกค้านี้ [{id,tag_id,name,color}]
  const [allTags, setAllTags] = useState([]);    // master tags
  const [followups, setFollowups] = useState([]);
  const [need, setNeed] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [fu, setFu] = useState({ title: '', due_date: '' });
  const [orders, setOrders] = useState(null);
  const [acts, setActs] = useState([]);
  const [act, setAct] = useState({ kind: 'note', body: '' });

  const load = async () => {
    // tags
    try {
      const [{ data: master, error: e1 }, { data: links }] = await Promise.all([
        supabase.from('tmk_crm_tags').select('id,name,color'),
        supabase.from('tmk_crm_customer_tags').select('id,tag_id').eq('customer_key', cust.key),
      ]);
      if (e1 && isMissingTable(e1)) { setNeed(true); }
      setAllTags(master || []);
      const mById = new Map((master || []).map(t => [t.id, t]));
      setTags((links || []).map(l => ({ ...l, ...(mById.get(l.tag_id) || { name: '?', color: 'slate' }) })));
    } catch { /* graceful */ }
    // followups
    try {
      const { data, error } = await supabase.from('tmk_crm_followups').select('id,title,due_date,status,note').eq('customer_key', cust.key).order('due_date');
      if (error && isMissingTable(error)) setNeed(true);
      setFollowups(data || []);
    } catch { /* graceful */ }
    // activities timeline
    try {
      const { data } = await supabase.from('tmk_crm_activities').select('id,kind,body,at,by').eq('customer_key', cust.key).order('at', { ascending: false }).limit(50);
      setActs(data || []);
    } catch { /* graceful */ }
    // ประวัติออเดอร์ — เฉพาะออเดอร์จัดส่ง (tmk_orders) ของระบบคลัง · ไม่ดึงจากมาร์เก็ตเพลส
    try {
      const out = [];
      if (cust.shopId) {
        (TMK.orders || []).filter(o => o.customerId === cust.shopId).forEach(o => out.push({ id: o.code, ch: 'หน้าร้าน', date: (o.createdAt || '').slice(0, 10), sales: Number(o.total) || 0, qty: Number(o.qty) || 0 }));
      }
      setOrders(out.sort((a, b) => String(b.date).localeCompare(String(a.date))));
    } catch { setOrders([]); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [cust.key]);

  const addTag = async (name) => {
    if (!guardEdit()) return;
    const nm = (name || '').trim(); if (!nm) return;
    let tag = allTags.find(t => t.name.toLowerCase() === nm.toLowerCase());
    try {
      if (!tag) { tag = { id: genId('tag'), name: nm, color: 'slate' }; const { error } = await supabase.from('tmk_crm_tags').insert(tag); if (error) throw error; setAllTags(a => [...a, tag]); }
      if (tags.some(t => t.tag_id === tag.id)) { setNewTag(''); return; }
      const link = { id: genId('ct'), customer_key: cust.key, tag_id: tag.id };
      const { error } = await supabase.from('tmk_crm_customer_tags').insert(link); if (error) throw error;
      setTags(t => [...t, { ...link, name: tag.name, color: tag.color }]); setNewTag('');
    } catch (e) { window.__toast?.(isMissingTable(e) ? 'ต้องรัน migration 20260706-stock-crm-all.sql ก่อน' : 'ติด tag ไม่สำเร็จ', 'error'); }
  };
  const removeTag = async (link) => {
    if (!guardEdit()) return;
    try { await supabase.from('tmk_crm_customer_tags').delete().eq('id', link.id); setTags(t => t.filter(x => x.id !== link.id)); } catch { /* */ }
  };
  const addFollowup = async () => {
    if (!guardEdit()) return;
    if (!fu.title.trim()) { window.__toast?.('ใส่หัวข้อก่อน', 'warn'); return; }
    const row = { id: genId('fu'), customer_key: cust.key, customer_name: cust.name, title: fu.title.trim(), due_date: fu.due_date || null, status: 'open', created_by: window.__userEmail || '', updated_at: new Date().toISOString() };
    try {
      const { error } = await supabase.from('tmk_crm_followups').insert(row); if (error) throw error;
      logAudit({ action: 'create', entityType: 'followup', entityName: cust.name, summary: `นัดติดตาม "${row.title}" — ${cust.name}` });
      setFollowups(f => [...f, row]); setFu({ title: '', due_date: '' }); window.__toast?.('เพิ่มงานติดตามแล้ว', 'success');
    } catch (e) { window.__toast?.(isMissingTable(e) ? 'ต้องรัน migration 20260706-stock-crm-all.sql ก่อน' : 'เพิ่มไม่สำเร็จ', 'error'); }
  };
  const toggleFollowup = async (f) => {
    const status = f.status === 'done' ? 'open' : 'done';
    try { await supabase.from('tmk_crm_followups').update({ status }).eq('id', f.id); setFollowups(list => list.map(x => x.id === f.id ? { ...x, status } : x)); } catch { /* */ }
  };
  const addActivity = async () => {
    if (!guardEdit()) return;
    if (!act.body.trim()) { window.__toast?.('พิมพ์รายละเอียดก่อน', 'warn'); return; }
    const row = { id: genId('act'), customer_key: cust.key, kind: act.kind, body: act.body.trim(), at: new Date().toISOString(), by: window.__userEmail || '' };
    try {
      const { error } = await supabase.from('tmk_crm_activities').insert(row); if (error) throw error;
      setActs(a => [row, ...a]); setAct({ kind: 'note', body: '' });
    } catch (e) { window.__toast?.(isMissingTable(e) ? 'ต้องรัน migration 20260706-stock-crm-all.sql ก่อน' : 'บันทึกไม่สำเร็จ', 'error'); }
  };
  const ACT_KINDS = { call: 'โทร', chat: 'แชท', note: 'โน้ต', meeting: 'นัด' };

  return (
    <SideSheet icon="users" title={cust.name || '(ไม่มีชื่อ)'} sub={`${cust.channels.join(' · ')} · ${cust.phone || '-'}`} onClose={onClose} size="lg"
      footer={<Button variant="outline" onClick={onClose}>ปิด</Button>}>
      <div className="space-y-4">
        {/* สรุป */}
        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">ยอดซื้อรวม</div><div className="num text-lg font-bold">{B(cust.sales)}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">ออเดอร์</div><div className="num text-lg font-bold">{N(cust.count)}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">กลุ่ม</div><div className="mt-1 flex gap-1 flex-wrap"><TierBadge tier={cust.tier} /><FlagBadge flag={cust.flag} /></div></CardContent></Card>
        </div>
        <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
          {cust.line && <span>LINE: {cust.line}</span>}{cust.social && <span>โซเชียล: {cust.social}</span>}
          {cust.province && <span>จังหวัด: {cust.province}</span>}{cust.since && <span>ลูกค้าตั้งแต่: {thaiDate(cust.since) || cust.since}</span>}
          {cust.last && <span>ซื้อล่าสุด: {thaiDate(cust.last) || cust.last} {cust.recency != null && `(${cust.recency} วันก่อน)`}</span>}
          {cust.address && <span className="w-full">ที่อยู่: {cust.address}</span>}
        </div>

        {/* Tags */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">ป้ายกำกับ (tags)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {tags.map(t => <Badge key={t.id} variant="secondary" className="gap-1">{t.name}<button onClick={() => removeTag(t)} className="ml-0.5"><Icon name="x" className="size-3" /></button></Badge>)}
              {tags.length === 0 && <span className="text-xs text-muted-foreground">ยังไม่มี tag</span>}
            </div>
            <div className="flex gap-2">
              <Input value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTag(newTag); }} placeholder="เพิ่ม tag (เช่น VIP, ขายส่ง)" className="h-8" list="crm-tag-list" />
              <datalist id="crm-tag-list">{allTags.map(t => <option key={t.id} value={t.name} />)}</datalist>
              <Button size="sm" variant="outline" onClick={() => addTag(newTag)}>เพิ่ม</Button>
            </div>
            {need && <div className="text-xs text-amber-600">ต้องรัน migration 20260706-stock-crm-all.sql เพื่อใช้ tags/ติดตาม</div>}
          </CardContent>
        </Card>

        {/* Follow-ups */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">งานติดตาม</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {followups.length > 0 && followups.map(f => (
              <div key={f.id} className="flex items-center gap-2 text-sm border-b pb-1.5">
                <button onClick={() => toggleFollowup(f)} title="ทำเสร็จ/ยังไม่เสร็จ"><Icon name={f.status === 'done' ? 'check' : 'circle'} className="size-4" style={{ color: f.status === 'done' ? 'var(--good)' : 'var(--ink-4)' }} /></button>
                <span className={'flex-1 ' + (f.status === 'done' ? 'line-through text-muted-foreground' : '')}>{f.title}</span>
                {f.due_date && <span className="text-xs text-muted-foreground">{thaiDate(f.due_date) || f.due_date}</span>}
              </div>
            ))}
            <div className="flex gap-2">
              <Input value={fu.title} onChange={e => setFu({ ...fu, title: e.target.value })} placeholder="นัดติดตาม เช่น โทรเสนอโปร" className="h-8 flex-1" />
              <DatePicker value={fu.due_date} onChange={(v) => setFu({ ...fu, due_date: v })} placeholder="วันครบกำหนด" className="h-8 w-[160px]" />
              <Button size="sm" variant="outline" onClick={addFollowup}>เพิ่ม</Button>
            </div>
          </CardContent>
        </Card>

        {/* Timeline กิจกรรม */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">บันทึกกิจกรรม (timeline)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Select value={act.kind} onValueChange={v => setAct({ ...act, kind: v })}>
                <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ACT_KINDS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
              <Input value={act.body} onChange={e => setAct({ ...act, body: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') addActivity(); }} placeholder="รายละเอียด เช่น โทรเสนอโปรโมชั่น" className="h-8 flex-1" />
              <Button size="sm" variant="outline" onClick={addActivity}>เพิ่ม</Button>
            </div>
            {acts.length > 0 && (
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {acts.map(a => (
                  <div key={a.id} className="text-sm border-l-2 pl-2.5 py-0.5" style={{ borderColor: 'var(--accent)' }}>
                    <span className="font-medium">{ACT_KINDS[a.kind] || a.kind}</span> · <span>{a.body}</span>
                    <div className="text-xs text-muted-foreground">{(() => { try { return new Date(a.at).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } })()}{a.by ? ' · ' + a.by : ''}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* สต็อกที่จองไว้ (เชื่อมคลัง) */}
        {(() => {
          const reserved = (TMK.products || []).flatMap(p => (p.reservations || []).filter(r => r.customer && r.customer === cust.name).map(r => ({ product: p.name, items: r.items || [], date: r.date, note: r.note })));
          if (!reserved.length) return null;
          return (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Icon name="clock" className="size-4" style={{ color: 'var(--accent)' }} /> สต็อกที่จองไว้ ({reserved.length})</CardTitle></CardHeader>
              <CardContent className="space-y-1.5">
                {reserved.map((r, i) => (
                  <div key={(r.product || '') + '#' + i} className="text-sm border-b pb-1.5"><span className="font-medium">{r.product}</span><div className="text-xs text-muted-foreground">{r.items.map(it => `${it.color} ${it.size}×${it.qty}`).join(', ')}{r.date ? ' · ' + (thaiDate(r.date) || r.date) : ''}{r.note ? ' · ' + r.note : ''}</div></div>
                ))}
              </CardContent>
            </Card>
          );
        })()}

        {/* ประวัติซื้อข้ามช่อง */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">ประวัติซื้อ (ทุกช่อง)</CardTitle></CardHeader>
          <CardContent>
            {orders === null ? <div className="py-1"><SkelTable cols={4} rows={4} /></div>
              : orders.length === 0 ? <div className="text-sm text-muted-foreground py-2 text-center">ไม่มีประวัติ</div>
              : <div className="rounded-md border overflow-x-auto max-h-[260px] overflow-y-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>วันที่</TableHead><TableHead>ช่อง</TableHead><TableHead className="text-right">ตัว</TableHead><TableHead className="text-right">ยอด</TableHead></TableRow></TableHeader>
                    <TableBody>{orders.map((o, i) => (
                      <TableRow key={(o.id || '') + '#' + i}><TableCell className="text-xs">{thaiDate(o.date) || o.date}</TableCell><TableCell className="text-xs">{o.ch}</TableCell><TableCell className="num text-right">{N(o.qty)}</TableCell><TableCell className="num text-right font-medium">{B(o.sales)}</TableCell></TableRow>
                    ))}</TableBody>
                  </Table>
                </div>}
          </CardContent>
        </Card>
      </div>
    </SideSheet>
  );
}

/* ---------- ภาพรวม CRM ---------- */
function CrmOverview({ data, onPick }) {
  if (!data) return <div className="text-center py-10 text-muted-foreground">กำลังโหลด…</div>;
  const { customers, summary } = data;
  const risk = customers.filter(c => c.flag === 'เสี่ยงหลุด').length;
  const fresh = customers.filter(c => c.flag === 'ใหม่').length;
  const vip = customers.filter(c => c.tier === 'เพชร' || c.tier === 'ทอง').length;
  const max = Math.max(1, ...summary.map(s => s.count));
  const Stat = ({ label, value, tone }) => <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="num text-2xl font-bold mt-1" style={tone ? { color: tone } : undefined}>{value}</div></CardContent></Card>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="ลูกค้าทั้งหมด" value={N(customers.length)} />
        <Stat label="VIP (เพชร+ทอง)" value={N(vip)} tone="var(--accent)" />
        <Stat label="ลูกค้าใหม่" value={N(fresh)} tone="var(--good)" />
        <Stat label="เสี่ยงหลุด" value={N(risk)} tone={risk ? 'var(--bad)' : undefined} />
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">แบ่งกลุ่มลูกค้า (RFM)</CardTitle><CardDescription>จัดอัตโนมัติจาก ความสดใหม่ + ความถี่ + ยอดซื้อ</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {summary.map(s => (
            <div key={s.key} className="flex items-center gap-3">
              <span className="w-16 font-semibold" style={{ color: s.color }}>{s.key}</span>
              <Progress value={s.count / max * 100} indicatorColor={s.color} className="flex-1" />
              <span className="num text-xs w-32 text-right text-muted-foreground">{N(s.count)} คน · {B(s.sales)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">ลูกค้ายอดสูงสุด</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>ลูกค้า</TableHead><TableHead>กลุ่ม</TableHead><TableHead className="text-right">ออเดอร์</TableHead><TableHead className="text-right">ยอดซื้อ</TableHead></TableRow></TableHeader>
              <TableBody>{customers.slice(0, 12).map(c => (
                <TableRow key={c.key} onClick={() => onPick(c)} className="cursor-pointer">
                  <TableCell><div className="font-medium">{c.name || '(ไม่มีชื่อ)'}</div><div className="text-xs text-muted-foreground">{c.channels.join(' · ')}</div></TableCell>
                  <TableCell><div className="flex gap-1 flex-wrap"><TierBadge tier={c.tier} /><FlagBadge flag={c.flag} /></div></TableCell>
                  <TableCell className="num text-right">{N(c.count)}</TableCell>
                  <TableCell className="num text-right font-bold">{B(c.sales)}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- directory ---------- */
function CrmDirectory({ data, onPick }) {
  const [q, setQ] = useState('');
  const [tier, setTier] = useState('all');
  const [limit, setLimit] = useState(60);
  if (!data) return <div className="text-center py-10 text-muted-foreground">กำลังโหลด…</div>;
  const ql = q.trim().toLowerCase();
  const list = data.customers.filter(c =>
    (tier === 'all' || c.tier === tier) &&
    (!ql || `${c.name} ${c.phone} ${c.social} ${c.line}`.toLowerCase().includes(ql)));
  const shown = list.slice(0, limit);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 flex-wrap space-y-0">
        <CardTitle className="flex items-center gap-2 text-base"><span style={{ color: 'var(--accent)' }}><Icon name="users" /></span> ลูกค้า 360 <span className="text-sm font-normal text-muted-foreground">({N(list.length)})</span></CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 flex-wrap items-center">
          <Input value={q} onChange={e => { setQ(e.target.value); setLimit(60); }} placeholder="ค้นหา ชื่อ / เบอร์ / LINE / โซเชียล" className="flex-1 min-w-[220px]" />
          <ToggleGroup type="single" value={tier} onValueChange={v => v && setTier(v)} variant="outline" size="sm">
            <ToggleGroupItem value="all">ทั้งหมด</ToggleGroupItem>
            {RFM_TIERS.map(t => <ToggleGroupItem key={t.key} value={t.key}>{t.key}</ToggleGroupItem>)}
          </ToggleGroup>
        </div>
        {list.length === 0 ? <div className="text-center py-6 text-muted-foreground">ไม่พบลูกค้า</div> : <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>ลูกค้า</TableHead><TableHead>ติดต่อ</TableHead><TableHead>ช่อง</TableHead><TableHead>กลุ่ม</TableHead><TableHead className="text-right">ออเดอร์</TableHead><TableHead className="text-right">ยอดซื้อ</TableHead></TableRow></TableHeader>
              <TableBody>{shown.map(c => (
                <TableRow key={c.key} onClick={() => onPick(c)} className="cursor-pointer">
                  <TableCell className="font-medium">{c.name || '(ไม่มีชื่อ)'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{[c.phone, c.line && ('LINE ' + c.line)].filter(Boolean).join(' · ') || '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.channels.join(' · ')}</TableCell>
                  <TableCell><div className="flex gap-1 flex-wrap"><TierBadge tier={c.tier} /><FlagBadge flag={c.flag} /></div></TableCell>
                  <TableCell className="num text-right">{N(c.count)}</TableCell>
                  <TableCell className="num text-right font-bold">{B(c.sales)}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
          {list.length > limit && <div className="flex justify-center py-2"><Button size="sm" variant="outline" onClick={() => setLimit(l => l + 60)}>แสดงเพิ่ม ({N(list.length - limit)})</Button></div>}
        </>}
      </CardContent>
    </Card>
  );
}

/* ---------- งานติดตาม (รวมทุกลูกค้า) ---------- */
function CrmFollowups() {
  const [rows, setRows] = useState(null);
  const [need, setNeed] = useState(false);
  const [tab, setTab] = useState('open');
  const load = async () => {
    try {
      const { data, error } = await supabase.from('tmk_crm_followups').select('id,customer_name,title,due_date,status,note').order('due_date').limit(300);
      if (error) { if (isMissingTable(error)) setNeed(true); setRows([]); return; }
      setRows(data || []);
    } catch { setRows([]); }
  };
  useEffect(() => { load(); }, []);
  const toggle = async (f) => { const status = f.status === 'done' ? 'open' : 'done'; try { await supabase.from('tmk_crm_followups').update({ status }).eq('id', f.id); setRows(list => list.map(x => x.id === f.id ? { ...x, status } : x)); } catch { /* */ } };
  const list = (rows || []).filter(r => tab === 'all' || r.status === tab);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 flex-wrap space-y-0">
        <CardTitle className="flex items-center gap-2 text-base"><span style={{ color: 'var(--accent)' }}><Icon name="clock" /></span> งานติดตามลูกค้า {list.length > 0 && <span className="text-sm font-normal text-muted-foreground">({N(list.length)})</span>}</CardTitle>
        <ToggleGroup type="single" value={tab} onValueChange={v => v && setTab(v)} variant="outline" size="sm">
          <ToggleGroupItem value="open">ค้างอยู่</ToggleGroupItem><ToggleGroupItem value="done">เสร็จ</ToggleGroupItem><ToggleGroupItem value="all">ทั้งหมด</ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent>
        {need ? <div className="text-center py-8 text-muted-foreground">ต้องรัน migration <code className="px-1 bg-muted rounded">20260706-stock-crm-all.sql</code> ก่อน · เพิ่มงานติดตามได้จากหน้าลูกค้า 360</div>
          : rows === null ? <div className="text-center py-6 text-muted-foreground">กำลังโหลด…</div>
          : list.length === 0 ? <div className="text-center py-6 text-muted-foreground">ไม่มีงานติดตาม</div>
          : <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead className="w-10" /><TableHead>งาน</TableHead><TableHead>ลูกค้า</TableHead><TableHead className="text-right">กำหนด</TableHead></TableRow></TableHeader>
                <TableBody>{list.map(f => (
                  <TableRow key={f.id}>
                    <TableCell><button onClick={() => toggle(f)}><Icon name={f.status === 'done' ? 'check' : 'circle'} className="size-4" style={{ color: f.status === 'done' ? 'var(--good)' : 'var(--ink-4)' }} /></button></TableCell>
                    <TableCell className={f.status === 'done' ? 'line-through text-muted-foreground' : 'font-medium'}>{f.title}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{f.customer_name || '—'}</TableCell>
                    <TableCell className="num text-right text-xs">{f.due_date ? (thaiDate(f.due_date) || f.due_date) : '—'}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>}
      </CardContent>
    </Card>
  );
}

/* ---------- Pipeline ดีล (C2) ---------- */
const DEAL_STAGES = [
  { id: 'lead', label: 'ลีด', color: 'var(--ink-3)' }, { id: 'qualified', label: 'คัดกรอง', color: 'var(--info)' },
  { id: 'proposal', label: 'เสนอราคา', color: 'var(--warn)' }, { id: 'won', label: 'ปิดได้', color: 'var(--good)' }, { id: 'lost', label: 'หลุด', color: 'var(--bad)' },
];
function CrmPipeline() {
  const [deals, setDeals] = useState(null);
  const [need, setNeed] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [add, setAdd] = useState(null);   // {title,value,customer_name}
  const load = async () => {
    try { const { data, error } = await supabase.from('tmk_crm_deals').select('*').order('updated_at', { ascending: false }).limit(500); if (error) { if (isMissingTable(error)) setNeed(true); setDeals([]); return; } setDeals(data || []); } catch { setDeals([]); }
  };
  useEffect(() => { load(); }, []);
  const move = async (id, stage) => { const d = (deals || []).find(x => x.id === id); if (!d || d.stage === stage || !guardEdit()) return; try { await supabase.from('tmk_crm_deals').update({ stage, updated_at: new Date().toISOString() }).eq('id', id); setDeals(list => list.map(x => x.id === id ? { ...x, stage } : x)); } catch { /* */ } };
  const save = async () => {
    if (!guardEdit() || !add.title?.trim()) { window.__toast?.('ใส่ชื่อดีลก่อน', 'warn'); return; }
    const row = { id: genId('deal'), title: add.title.trim(), value: Number(add.value) || 0, customer_name: add.customer_name || '', stage: 'lead', updated_at: new Date().toISOString() };
    try { const { error } = await supabase.from('tmk_crm_deals').insert(row); if (error) throw error; setDeals(d => [row, ...d]); setAdd(null); window.__toast?.('เพิ่มดีลแล้ว', 'success'); }
    catch (e) { window.__toast?.(isMissingTable(e) ? 'ต้องรัน migration 20260706-stock-crm-all.sql ก่อน' : 'เพิ่มไม่สำเร็จ', 'error'); }
  };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 flex-wrap space-y-0">
        <CardTitle className="flex items-center gap-2 text-base"><span style={{ color: 'var(--accent)' }}><Icon name="route" /></span> Pipeline ขาย</CardTitle>
        {!need && <Button size="sm" onClick={() => setAdd({ title: '', value: '', customer_name: '' })}><Icon name="plus" /> เพิ่มดีล</Button>}
      </CardHeader>
      <CardContent>
        {need ? <div className="text-center py-8 text-muted-foreground">ต้องรัน migration <code className="px-1 bg-muted rounded">20260706-stock-crm-all.sql</code> ก่อน</div> : (<>
          {add && (
            <div className="rounded-md border p-3 mb-3 bg-muted/30 flex gap-2 flex-wrap items-end">
              <Input value={add.title} onChange={e => setAdd({ ...add, title: e.target.value })} placeholder="ชื่อดีล *" className="flex-1 min-w-[160px]" />
              <Input value={add.customer_name} onChange={e => setAdd({ ...add, customer_name: e.target.value })} placeholder="ลูกค้า" className="w-[160px]" />
              <Input type="number" value={add.value} onChange={e => setAdd({ ...add, value: e.target.value })} placeholder="มูลค่า" className="w-[120px]" />
              <Button size="sm" variant="ghost" onClick={() => setAdd(null)}>ยกเลิก</Button><Button size="sm" onClick={save}>บันทึก</Button>
            </div>
          )}
          {deals === null ? <div className="text-center py-6 text-muted-foreground">กำลังโหลด…</div> : (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {DEAL_STAGES.map(col => { const list = (deals || []).filter(d => d.stage === col.id); const sum = list.reduce((a, d) => a + (Number(d.value) || 0), 0); return (
                <div key={col.id} onDragOver={e => e.preventDefault()} onDrop={() => { move(dragId, col.id); setDragId(null); }} className="shrink-0 w-56 rounded-md bg-muted/50 p-2">
                  <div className="flex items-center justify-between mb-2 px-1"><span className="font-bold" style={{ color: col.color }}>{col.label}</span><span className="text-xs text-muted-foreground">{list.length} · {B(sum)}</span></div>
                  {list.map(d => (
                    <div key={d.id} draggable onDragStart={() => setDragId(d.id)} onDragEnd={() => setDragId(null)} className="bg-background border rounded-md px-2.5 py-2 mb-1.5 cursor-grab" style={{ borderLeft: `3px solid ${col.color}` }}>
                      <div className="font-medium text-sm">{d.title}</div>
                      <div className="text-xs text-muted-foreground">{d.customer_name || '—'}{d.value ? ' · ' + B(d.value) : ''}</div>
                    </div>
                  ))}
                  {list.length === 0 && <div className="text-xs text-center text-muted-foreground py-3">—</div>}
                </div>
              ); })}
            </div>
          )}
        </>)}
      </CardContent>
    </Card>
  );
}

/* ---------- รวม/ลบลูกค้าซ้ำ (C3) ---------- */
function CrmDedup({ data }) {
  const [busy, setBusy] = useState('');
  if (!data) return <div className="text-center py-10 text-muted-foreground">กำลังโหลด…</div>;
  // กลุ่มซ้ำ: เบอร์เดียวกัน (ปกติ unify ด้วย normPhone อยู่แล้ว) → หาชื่อซ้ำที่คนละ key (เบอร์ต่าง/ไม่มีเบอร์)
  const byName = new Map();
  data.customers.forEach(c => { const n = (c.name || '').trim().toLowerCase(); if (!n) return; if (!byName.has(n)) byName.set(n, []); byName.get(n).push(c); });
  const groups = [...byName.values()].filter(g => g.length > 1).sort((a, b) => b.length - a.length);
  const merge = async (group) => {
    if (!guardEdit()) return;
    const canonical = [...group].sort((a, b) => (b.sales || 0) - (a.sales || 0))[0];
    setBusy(canonical.key);
    try {
      const rows = group.filter(c => c.key !== canonical.key).map(c => ({ id: genId('mg'), from_key: c.key, to_key: canonical.key, updated_at: new Date().toISOString() }));
      const { error } = await supabase.from('tmk_crm_merge').insert(rows); if (error) throw error;
      window.__toast?.(`รวม ${group.length} โปรไฟล์เป็น "${canonical.name}" แล้ว — รีเฟรชเพื่อเห็นผล`, 'success');
    } catch (e) { window.__toast?.(isMissingTable(e) ? 'ต้องรัน migration 20260706-stock-crm-all.sql ก่อน' : 'รวมไม่สำเร็จ', 'error'); }
    setBusy('');
  };
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><span style={{ color: 'var(--accent)' }}><Icon name="users" /></span> ลูกค้าซ้ำ ({groups.length} กลุ่ม)</CardTitle><CardDescription>ชื่อเดียวกันแต่คนละโปรไฟล์ (เบอร์ต่าง/ไม่มีเบอร์) → รวมเป็นรายเดียว (soft-merge ไม่ลบของจริง)</CardDescription></CardHeader>
      <CardContent className="space-y-2">
        {groups.length === 0 ? <div className="text-center py-6 text-muted-foreground">ไม่พบลูกค้าซ้ำ 🎉</div> : groups.slice(0, 50).map((g, i) => (
          <div key={(g[0]?.key || '') + '#' + i} className="rounded-md border p-2.5 flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <div className="font-medium">{g[0].name} <span className="text-xs text-muted-foreground">· {g.length} โปรไฟล์</span></div>
              <div className="text-xs text-muted-foreground">{g.map(c => `${c.phone || 'ไม่มีเบอร์'} (${B(c.sales)})`).join(' · ')}</div>
            </div>
            <Button size="sm" variant="outline" disabled={busy === g[0].key} onClick={() => merge(g)}>รวมเป็นรายเดียว</Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ---------- บรอดแคสต์ LINE OA (C4) ---------- */
function CrmBroadcast({ data }) {
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState(null);
  const load = async () => { try { const { data } = await supabase.from('tmk_crm_campaigns').select('id,message,recipients,status,created_at').order('created_at', { ascending: false }).limit(20); setHistory(data || []); } catch { setHistory([]); } };
  useEffect(() => { load(); }, []);
  const send = async () => {
    if (!guardEdit()) return;
    if (!msg.trim()) { window.__toast?.('พิมพ์ข้อความก่อน', 'warn'); return; }
    if (!await window.__confirm?.({ title: 'ส่งบรอดแคสต์', body: 'ส่งบรอดแคสต์ถึงผู้ติดตาม LINE OA ทั้งหมด?', confirmText: 'ส่ง' })) return;
    setSending(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('line-broadcast', { body: { message: msg.trim() } });
      if (error || res?.error) throw new Error(res?.error || error?.message || 'ส่งไม่สำเร็จ');
      const row = { id: genId('camp'), name: msg.trim().slice(0, 40), channel: 'line', message: msg.trim(), recipients: 0, sent: 1, status: 'sent', created_by: window.__userEmail || '', created_at: new Date().toISOString() };
      try { await supabase.from('tmk_crm_campaigns').insert(row); } catch { /* ตารางยังไม่มี → ข้าม */ }
      logAudit({ action: 'create', entityType: 'campaign', entityName: 'LINE broadcast', summary: `บรอดแคสต์ LINE: ${row.name}` });
      window.__toast?.('ส่งบรอดแคสต์แล้ว', 'success'); setMsg(''); load();
    } catch (e) {
      const m = /Function not found|not deployed|Failed to send|404|FunctionsFetchError/i.test(e?.message || '') ? 'ยังไม่ได้ deploy edge function line-broadcast (ดู README)' : (e?.message || 'ส่งไม่สำเร็จ');
      window.__toast?.(m, 'error');
    }
    setSending(false);
  };
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><span style={{ color: 'var(--accent)' }}><Icon name="megaphone" /></span> บรอดแคสต์ LINE OA</CardTitle><CardDescription>ส่งข้อความถึงผู้ติดตาม LINE OA ทั้งหมด (ต้อง deploy edge fn + ใส่ LINE token)</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={4} maxLength={4900} placeholder="พิมพ์ข้อความบรอดแคสต์…" className="w-full rounded-md border bg-background p-2.5 text-sm" />
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs text-muted-foreground">{data ? `${N(data.customers.length)} ลูกค้าในระบบ · ` : ''}ส่งถึงผู้ติดตาม LINE OA ทั้งหมด · เจาะ segment ต้องมี LINE userId (เฟสถัดไป)</span>
          <Button disabled={sending} onClick={send}>{sending ? 'กำลังส่ง…' : 'ส่งบรอดแคสต์'}</Button>
        </div>
        {history && history.length > 0 && (
          <div className="rounded-md border divide-y">
            {history.map(h => (<div key={h.id} className="flex items-center justify-between px-3 py-2 text-sm"><span className="truncate">{h.message}</span><Badge variant="secondary" className="shrink-0 ml-2">{h.status === 'sent' ? 'ส่งแล้ว' : h.status}</Badge></div>))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ====================  Section  ==================== */
export function CrmSection({ sub }) {
  useData();
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null);
  useEffect(() => { let alive = true; loadUnifiedCustomers().then(d => { if (alive) setData(d); }); return () => { alive = false; }; }, []);
  // เชื่อมข้อมูล: ออเดอร์/ที่อื่นสั่งเปิดลูกค้าใน CRM ผ่าน window.__crmTarget {name,shopId,phone}
  useEffect(() => {
    if (!data) return;
    const t = window.__crmTarget; if (!t) return;
    window.__crmTarget = null;
    const tp = normPhone(t.phone);
    const found = data.customers.find(c => (t.shopId && c.shopId === t.shopId) || (tp && normPhone(c.phone) === tp) || (t.name && c.name === t.name));
    if (found) setSel(found); else window.__toast?.('ไม่พบลูกค้านี้ใน CRM', 'info');
  }, [data]);

  const beat = useBeatOn(sub); // skeleton สั้นๆ ตอนสลับหน้าย่อย
  if (beat) return <PageSkeleton />;
  return (
    <div className="p-4 md:p-6 max-w-[1300px] mx-auto w-full rise">
      {sub === 'directory' ? <CrmDirectory data={data} onPick={setSel} />
        : sub === 'followups' ? <CrmFollowups />
        : sub === 'pipeline' ? <CrmPipeline />
        : sub === 'dedup' ? <CrmDedup data={data} />
        : sub === 'broadcast' ? <CrmBroadcast data={data} />
        : <CrmOverview data={data} onPick={setSel} />}
      {sel && <CustomerDrawer cust={sel} onClose={() => setSel(null)} />}
    </div>
  );
}
