/* ============================================================
   views-settings-tabs.jsx — sub-view แท็บของหน้า "ตั้งค่า" (PART 84 REFACTOR-1 · แยกจาก views-settings god-file)
   ============================================================
   SettingsBody (views-settings.jsx) เป็น orchestrator เรียก sub-view เหล่านี้ · behavior-preserving file-split
   ============================================================ */
import React, { useState, useEffect, useMemo } from 'react';
import { TMK } from './data.js';
import { Icon, ColorPicker } from './components.jsx';
import { useData, computeMonth } from './dataContext.jsx';
import { MonthPicker } from './components/MonthPicker.jsx';
import { supabase } from './lib/supabaseClient.js';
import { logAudit } from './lib/audit.js';
import { useNotifications, prefOn as notifStorePrefOn, setPref as notifStoreSetPref } from './lib/notifStore.js';
import { fetchTargets, saveTarget } from './lib/targets.js';
import { APP_VERSION } from './changelog.js';
import { getToday, todayISO, THAI_MONTHS as MONTHS_TH_SHORT } from './lib/dateUtils.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch as ShadcnSwitch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox as ShadcnCheckbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { DD, guardEdit, guardAdmin } from './saleWidgets.jsx';
import { buildAllCsv, buildMonthlyReportCsv } from './lib/csv.js';

export function CampaignsView() {
  const { reload, refresh } = useData() || {};
  const stMeta = { live: { l: 'กำลังดำเนินการ', cls: 'chip-good' }, upcoming: { l: 'กำลังจะมา', cls: 'chip-accent' }, paused: { l: 'หยุดชั่วคราว', cls: 'chip-warn' }, cancelled: { l: 'ยกเลิก', cls: '' }, done: { l: 'จบแล้ว', cls: '' } };
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const campaigns = DD.campaigns || [];

  // ลบแคมเปญ — ตรวจว่ามี task ผูกอยู่ก่อน
  const deleteCampaign = async (c) => {
    if (!guardEdit()) return;
    const linkedTasks = (DD.tasks || []).filter(t => t.camp === c.id).length;
    const msg = linkedTasks > 0
      ? `แคมเปญ "${c.name}" มี ${linkedTasks} งานผูกอยู่ — ลบจะปลด link ไปไม่มีแคมเปญ ยืนยัน?`
      : `ลบแคมเปญ "${c.name}"?`;
    if (!await window.__confirm?.({ title: 'ลบแคมเปญ', body: msg, danger: true, confirmText: 'ลบ' })) return;
    setBusy(true);
    try {
      // ปลด link tasks (set camp = NULL) ก่อน
      if (linkedTasks > 0) {
        await supabase.from('tmk_tasks').update({ camp: null }).eq('camp', c.id);
      }
      // ลบ campaign → ถังขยะ (soft delete)
      const { error } = await supabase.from('tmk_campaigns').update({ deleted_at: new Date().toISOString() }).eq('id', c.id);
      if (error) throw error;
      logAudit({ action: 'delete', entityType: 'campaign', entityName: c.name, summary: `ลบแคมเปญ "${c.name}"` });
      if (refresh) await refresh(['tmk_campaigns', 'tmk_tasks']); else if (reload) await reload();
      if (window.__toast) window.__toast('ย้ายแคมเปญไปถังขยะแล้ว', 'success', 6000, {
        label: 'เลิกทำ',
        onClick: async () => {
          try {
            await supabase.from('tmk_campaigns').update({ deleted_at: null }).eq('id', c.id);
            if (refresh) await refresh(['tmk_campaigns']); else if (reload) await reload();
            window.__toast?.('กู้คืนแคมเปญแล้ว', 'success');
          } catch (e) { window.__toast?.('กู้คืนไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
        },
      });
    } catch (err) {
      if (window.__toast) window.__toast('ลบไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  // เลื่อนแคมเปญ — บันทึก sort_order ไป Supabase
  const reorderCampaign = async (fromId, toId) => {
    if (!guardEdit()) return;
    if (fromId === toId) return;
    const fromIdx = campaigns.findIndex(c => c.id === fromId);
    const toIdx = campaigns.findIndex(c => c.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;

    const reordered = [...campaigns];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    setBusy(true);
    try {
      // อัปเดต sort_order ทุกแคมเปญตาม index ใหม่
      const updates = reordered.map((c, i) =>
        supabase.from('tmk_campaigns').update({ sort_order: i + 1 }).eq('id', c.id)
      );
      const results = await Promise.all(updates);
      const failed = results.find(r => r.error);
      if (failed) {
        // ถ้า column sort_order ไม่มี → แจ้ง user ให้รัน migration
        if (/sort_order/i.test(failed.error.message)) {
          if (window.__toast) window.__toast('ต้อง alter table เพิ่ม sort_order ก่อน — รัน SQL migration ใหม่', 'warn');
        } else throw failed.error;
      } else if (window.__toast) window.__toast('เรียงลำดับใหม่เรียบร้อย', 'success');
      if (refresh) await refresh(['tmk_campaigns']); else if (reload) await reload();
    } catch (err) {
      if (window.__toast) window.__toast('เลื่อนไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="text-sm text-muted-foreground font-medium">
          {campaigns.length} แคมเปญ · เรียงลำดับได้ (ลากบนคอม / ปุ่ม ▲▼ บนมือถือ)
        </div>
        <Button onClick={() => window.__openModal('campaign')}>
          <Icon name="plus" className="size-4 mr-2" /> สร้างแคมเปญ
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {campaigns.length === 0 && (
          <div className="col-span-full py-16 text-center text-muted-foreground border-2 border-dashed rounded-lg bg-muted/10">
            <p className="text-sm">ยังไม่มีแคมเปญ — กด "+ สร้างแคมเปญ" เพื่อเริ่ม</p>
          </div>
        )}
        {campaigns.map((c, idx) => {
          const isOver = dragOver === c.id;
          const statusMeta = stMeta[c.status] || stMeta.done;

          // ความคืบหน้างาน — นับงานที่เสร็จ / ทั้งหมด ของแคมเปญนี้
          const linked = (DD.tasks || []).filter(t => t.camp === c.id);
          const total = linked.length;
          const done = linked.filter(t => t.status === 'done').length;
          const pct = total ? Math.round((done / total) * 100) : 0;

          // สถานะเวลา — นับถอยหลังจากวันเริ่ม/วันจบ เทียบวันนี้
          const today = todayISO();
          const diffDays = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
          let time;
          if (c.endISO && today > c.endISO) {
            time = { label: 'จบแล้ว', tone: 'done' };
          } else if (c.startISO && today < c.startISO) {
            const d = diffDays(today, c.startISO);
            time = { label: d <= 1 ? 'เริ่มพรุ่งนี้' : `เริ่มในอีก ${d} วัน`, tone: 'upcoming' };
          } else if (c.endISO) {
            const d = diffDays(today, c.endISO);
            time = d === 0 ? { label: 'วันสุดท้าย', tone: 'urgent' } : { label: `เหลืออีก ${d} วัน`, tone: d <= 3 ? 'urgent' : 'live' };
          } else {
            time = { label: 'กำลังดำเนินการ', tone: 'live' };
          }
          const timeCls = time.tone === 'upcoming' ? 'bg-primary/10 text-primary'
            : time.tone === 'urgent' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            : time.tone === 'live' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'bg-muted text-muted-foreground';

          return (
            <Card key={c.id}
              draggable
              onDragStart={() => setDragId(c.id)}
              onDragEnd={() => { setDragId(null); setDragOver(null); }}
              onDragOver={(e) => { e.preventDefault(); if (dragId && dragId !== c.id) setDragOver(c.id); }}
              onDragLeave={() => setDragOver(o => o === c.id ? null : o)}
              onDrop={() => { if (dragId) reorderCampaign(dragId, c.id); setDragId(null); setDragOver(null); }}
              className="flex flex-col transition-all overflow-hidden"
              style={{
                borderLeftWidth: '4px',
                borderLeftColor: c.color || 'var(--border)',
                cursor: busy ? 'wait' : 'grab',
                transform: isOver ? 'scale(1.02)' : 'scale(1)',
                boxShadow: isOver ? '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' : undefined,
                background: isOver ? 'hsl(var(--accent)/0.1)' : undefined,
                opacity: dragId === c.id ? 0.4 : 1,
              }}>
              <CardContent className="p-4 flex-1 flex flex-col gap-3">
                {/* หัวการ์ด: handle + ชื่อเต็ม + ป้ายสถานะ */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex gap-2 min-w-0 flex-1">
                    <div className="hidden sm:flex shrink-0 text-muted-foreground/40 mt-0.5" title="ลากเพื่อเรียงลำดับ">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="9" cy="6" r="1.5" fill="currentColor" /><circle cx="9" cy="12" r="1.5" fill="currentColor" /><circle cx="9" cy="18" r="1.5" fill="currentColor" />
                        <circle cx="15" cy="6" r="1.5" fill="currentColor" /><circle cx="15" cy="12" r="1.5" fill="currentColor" /><circle cx="15" cy="18" r="1.5" fill="currentColor" />
                      </svg>
                    </div>
                    {/* สำหรับมือถือ */}
                    <div className="flex sm:hidden flex-col gap-1 shrink-0 mt-0.5" onClick={e => e.stopPropagation()}>
                      <button className="text-muted-foreground disabled:opacity-30 p-0.5 text-[10px] leading-none" disabled={idx === 0 || busy} onClick={() => reorderCampaign(c.id, campaigns[idx - 1].id)}>▲</button>
                      <button className="text-muted-foreground disabled:opacity-30 p-0.5 text-[10px] leading-none" disabled={idx === campaigns.length - 1 || busy} onClick={() => reorderCampaign(c.id, campaigns[idx + 1].id)}>▼</button>
                    </div>
                    <h3 className="font-bold text-[15px] leading-snug line-clamp-2 hover:underline cursor-pointer min-w-0 flex-1" title={c.name} onClick={() => window.__openModal('campaign', { ...c, channels: c.channels || [] })}>
                      {c.name}
                    </h3>
                  </div>
                  <Badge variant="outline" className={`shrink-0 ${statusMeta.cls === 'chip-good' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : statusMeta.cls === 'chip-accent' ? 'bg-primary/10 text-primary border-primary/20' : statusMeta.cls === 'chip-warn' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : ''}`}>
                    {statusMeta.l}
                  </Badge>
                </div>

                {/* ช่วงเวลา + นับถอยหลัง */}
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-muted-foreground tabular-nums">{c.start} – {c.end}</span>
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium ${timeCls}`}>
                    <Icon name="clock" className="size-3" />{time.label}
                  </span>
                </div>

                {/* ความคืบหน้างาน */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground"><Icon name="listChecks" className="size-3.5" />ความคืบหน้างาน</span>
                    <span className="font-semibold tabular-nums">{total ? <>{done}/{total} <span className="text-muted-foreground font-normal">({pct}%)</span></> : <span className="text-muted-foreground font-normal">ยังไม่มีงาน</span>}</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>

                {/* ฐานการ์ด: ช่องทาง + ปุ่มแก้/ลบ */}
                <div className="mt-auto flex items-center justify-between gap-2 pt-3 border-t border-border/50">
                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    {(c.channels || []).length === 0
                      ? <span className="text-[11px] text-muted-foreground/60">ไม่มีช่องทาง</span>
                      : (c.channels || []).map(id => {
                          const ch = DD.channels.find(x => x.id === id);
                          return ch ? <span key={id} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><span className="size-2.5 rounded-full" style={{ background: ch.hex }} />{ch.name}</span> : null;
                        })}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); window.__openModal('campaign', { ...c, channels: c.channels || [] }); }} title="แก้ไขแคมเปญ">
                      <Icon name="pencil" className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); deleteCampaign(c); }} disabled={busy} title="ลบแคมเปญ">
                      <Icon name="trash" className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}


// ===== เป้าขาย + คอมมิชชั่นต่อเซลล์ (PART 12 / T3) =====
// graceful: ตาราง tmk_targets ยังไม่ migrate → Save แจ้งให้รัน migration (ไม่พัง)
export function TargetsView() {
  const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const money = (n) => (Number(n) || 0).toLocaleString('th-TH');
  const numOf = (r, f) => Number((r || {})[f]) || 0;

  const [month, setMonth] = useState(thisMonth);
  const [receiptNames, setReceiptNames] = useState([]);   // เซลล์ที่ส่งใบเสร็จ "เดือนนี้" เท่านั้น
  const [orphanNames, setOrphanNames] = useState([]);     // มีเป้าเดือนนี้แต่ยังไม่ส่งใบเสร็จ (ซ่อนไว้ก่อน · opt-in)
  const [manualNames, setManualNames] = useState([]);     // เพิ่มเองในเซสชัน (ตั้งเป้าล่วงหน้า)
  const [showOrphans, setShowOrphans] = useState(false);
  const [rows, setRows] = useState({});                   // name -> { sales_target, commission_rate }
  const [baseline, setBaseline] = useState({});           // ค่าที่บันทึกแล้ว (เทียบหาแถวที่แก้ค้าง)
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [savingAll, setSavingAll] = useState(false);
  const [addName, setAddName] = useState('');

  const load = async () => {
    setLoading(true);
    setManualNames([]); setShowOrphans(false);
    // รายชื่อ = คนที่ส่งใบเสร็จ "เดือนนี้" เท่านั้น (order_month = เดือนที่เลือก · ตัด void)
    const recSet = new Set();
    const add = (v) => { const n = String(v || '').trim(); if (n && n !== 'ไม่ระบุเซลล์') recSet.add(n); };
    try {
      const { data } = await supabase.from('tmk_sale_receipts').select('salesperson').eq('order_month', month).neq('status', 'void');
      (data || []).forEach(r => add(r.salesperson));
    } catch { /* ตารางใบเสร็จ optional */ }
    const targets = await fetchTargets(month);
    const map = {};
    targets.forEach(t => { map[t.salesperson] = { sales_target: t.sales_target ?? 0, commission_rate: t.commission_rate ?? 0 }; });
    // เป้าที่บันทึกไว้แต่คนนั้นยังไม่ส่งใบเสร็จเดือนนี้ → orphan (โผล่เมื่อกด "แสดง" · กันเป้าหาย)
    const orphans = [...new Set(targets.map(t => t.salesperson).filter(n => n && !recSet.has(n)))];
    setReceiptNames([...recSet]);
    setOrphanNames(orphans);
    setRows(map);
    setBaseline(JSON.parse(JSON.stringify(map)));
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [month]);

  // รายชื่อที่แสดง = ส่งใบเสร็จเดือนนี้ + เพิ่มเอง (+ orphan เมื่อกดแสดง)
  const people = useMemo(() => {
    const s = new Set([...receiptNames, ...manualNames]);
    if (showOrphans) orphanNames.forEach(n => s.add(n));
    return [...s].sort((a, b) => a.localeCompare(b, 'th'));
  }, [receiptNames, manualNames, orphanNames, showOrphans]);

  const isDirty = (name) => numOf(rows[name], 'sales_target') !== numOf(baseline[name], 'sales_target')
    || numOf(rows[name], 'commission_rate') !== numOf(baseline[name], 'commission_rate');
  const dirtyNames = people.filter(isDirty);

  // สรุปจากค่าที่บันทึกแล้ว (baseline รวม orphan → "ตั้งเป้าแล้ว" = เป้าจริงทั้งเดือน)
  const summary = useMemo(() => {
    let setCount = 0, totalTarget = 0;
    Object.values(baseline).forEach(b => { const t = numOf(b, 'sales_target'); if (t > 0 || numOf(b, 'commission_rate') > 0) setCount++; totalTarget += t; });
    return { setCount, totalTarget };
  }, [baseline]);

  const setField = (name, field, val) => setRows(p => ({ ...p, [name]: { ...(p[name] || {}), [field]: val } }));

  const persist = async (name) => {
    const r = rows[name] || {};
    const { error } = await saveTarget({ salesperson: name, month, sales_target: r.sales_target, commission_rate: r.commission_rate });
    if (error) {
      const miss = /relation .* does not exist|tmk_targets|schema cache/i.test(error.message || '');
      window.__toast?.(miss ? 'ต้องรัน migration 20260701-targets.sql ใน Supabase ก่อน' : 'บันทึกไม่สำเร็จ: ' + error.message, 'error');
      return false;
    }
    logAudit({ action: 'update', entityType: 'target', entityName: name, summary: `ตั้งเป้า/คอม ${name} เดือน ${month}` });
    setBaseline(b => ({ ...b, [name]: { sales_target: numOf(r, 'sales_target'), commission_rate: numOf(r, 'commission_rate') } }));
    return true;
  };

  const saveRow = async (name) => {
    setSavingKey(name);
    const ok = await persist(name);
    setSavingKey(null);
    if (ok) window.__toast?.(`บันทึกเป้า ${name} แล้ว`, 'success');
  };

  const saveAll = async () => {
    if (!dirtyNames.length) return;
    setSavingAll(true);
    let ok = 0;
    for (const name of dirtyNames) { if (await persist(name)) ok++; }
    setSavingAll(false);
    if (ok) window.__toast?.(`บันทึกเป้า ${ok} คน เดือนนี้แล้ว`, 'success');
  };

  const addPerson = () => {
    const n = addName.trim();
    if (n && !people.includes(n)) setManualNames(p => [...p, n]);
    setAddName('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Icon name="target" className="size-5" /> เป้าขาย & คอมมิชชั่นต่อเซลล์</CardTitle>
        <CardDescription>ตั้งเป้ายอดขาย (บาท) และอัตราคอม (%) แยกรายคน รายเดือน → โชว์ความคืบหน้า + คอมคำนวณในหน้า “ยอดขาย → เซลล์”</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* แถวควบคุมเดือน + เพิ่มเซลล์ */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">เดือน</Label>
            <div className="flex items-center gap-2">
              <MonthPicker value={month} onChange={setMonth} className="h-9" />
              {month !== thisMonth() && <Button variant="ghost" size="sm" onClick={() => setMonth(thisMonth())}>เดือนนี้</Button>}
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">เพิ่มเซลล์เอง (ตั้งเป้าล่วงหน้า)</Label>
              <Input value={addName} onChange={e => setAddName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addPerson(); }} placeholder="ชื่อเซลล์" className="w-[190px]" />
            </div>
            <Button variant="outline" size="sm" onClick={addPerson}><Icon name="plus" className="size-4" /> เพิ่ม</Button>
          </div>
        </div>

        {/* แถบสรุปเดือนนี้ */}
        {!loading && people.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border bg-muted/40 px-4 py-2.5 text-sm">
            <span><span className="text-muted-foreground">เซลล์เดือนนี้</span> <b>{people.length}</b> คน</span>
            <span><span className="text-muted-foreground">ตั้งเป้าแล้ว</span> <b>{summary.setCount}</b> คน</span>
            <span><span className="text-muted-foreground">เป้ารวม</span> <b>฿{money(summary.totalTarget)}</b></span>
            {dirtyNames.length > 0 && (
              <Button size="sm" className="ml-auto" disabled={savingAll} onClick={saveAll}>
                {savingAll ? 'กำลังบันทึก…' : <><Icon name="check" className="size-4" /> บันทึกทั้งหมด ({dirtyNames.length})</>}
              </Button>
            )}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">กำลังโหลด…</p>
        ) : people.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            ยังไม่มีเซลล์ส่งใบเสร็จในเดือนนี้ — พอมีคนส่งยอดจะขึ้นเอง หรือ “เพิ่มเซลล์เอง” ด้านบนเพื่อตั้งเป้าล่วงหน้า
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>เซลล์</TableHead>
                <TableHead className="text-right">เป้ายอดขาย (บาท)</TableHead>
                <TableHead className="text-right">คอม (%)</TableHead>
                <TableHead className="text-right hidden sm:table-cell">คอมเมื่อถึงเป้า</TableHead>
                <TableHead className="text-right w-[110px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map(name => {
                const r = rows[name] || {};
                const dirty = isDirty(name);
                const commAtTarget = numOf(r, 'sales_target') * numOf(r, 'commission_rate') / 100;
                const isOrphan = orphanNames.includes(name) && !receiptNames.includes(name);
                return (
                  <TableRow key={name} className={dirty ? 'bg-amber-500/5' : undefined}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1.5">
                        {name}
                        {dirty && <span className="size-1.5 rounded-full bg-amber-500" title="ยังไม่บันทึก" />}
                        {isOrphan && <span className="text-[10px] text-muted-foreground">(ยังไม่ส่งใบเสร็จ)</span>}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input type="number" inputMode="numeric" value={r.sales_target ?? ''} onChange={e => setField(name, 'sales_target', e.target.value)} className="w-[140px] ml-auto text-right" placeholder="0" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input type="number" inputMode="decimal" step="0.1" value={r.commission_rate ?? ''} onChange={e => setField(name, 'commission_rate', e.target.value)} className="w-[90px] ml-auto text-right" placeholder="0" />
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell text-muted-foreground">
                      {commAtTarget > 0 ? `฿${money(Math.round(commAtTarget))}` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant={dirty ? 'default' : 'secondary'} disabled={savingKey === name} onClick={() => saveRow(name)}>
                        {savingKey === name ? 'กำลังบันทึก…' : 'บันทึก'}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* เป้าที่บันทึกไว้ให้คนที่ยังไม่ส่งใบเสร็จเดือนนี้ (opt-in · กันเป้าหาย) */}
        {!loading && orphanNames.length > 0 && (
          <button type="button" onClick={() => setShowOrphans(v => !v)} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
            {showOrphans ? 'ซ่อนคนที่ยังไม่ส่งใบเสร็จ' : `มีเป้าบันทึกไว้ให้อีก ${orphanNames.length} คนที่ยังไม่ส่งใบเสร็จเดือนนี้ · แสดง/แก้`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// เปิด/ปิดแจ้งเตือน — เก็บลง DB ผ่าน store (sync ทุกเครื่อง) · ตรงกับ panel ในศูนย์แจ้งเตือน
function NotifToggle({ storeKey, label }) {
  const kind = storeKey.replace(/^tmk-notif-/, '');
  const { prefs } = useNotifications(); // re-render เมื่อ pref เปลี่ยน
  void prefs;
  return <ShadcnSwitch checked={notifStorePrefOn(kind)} onCheckedChange={(v) => notifStoreSetPref(kind, v)} aria-label={label || 'เปิด/ปิดการแจ้งเตือน'} />;
}

// Export ข้อมูลทั้งหมดเป็น CSV (multi-section, BOM สำหรับภาษาไทยใน Excel)
function exportAllCSV() {
  // CSV building (pure) → lib/csv.js · ที่นี่คง side-effect (download/audit/toast)
  const csv = buildAllCsv(TMK);
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  a.download = `tmk-export-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
  logAudit({ action: 'export', entityType: 'data', entityName: 'CSV', summary: 'ส่งออกข้อมูลทั้งหมดเป็น CSV' });
  if (window.__toast) window.__toast('ส่งออก CSV เรียบร้อย', 'success');
}

// รายงานรายเดือน (CSV) — สรุปต่อช่องทาง (เป้า/ยอด/ค่าแอด/ROAS) + ยอดรายวันต่อช่องทาง (สำหรับส่งผู้บริหาร)
// pickMonth: 1-12 (ค่า default = เดือนปัจจุบัน), pickYearBE: ปี พ.ศ.
function exportMonthlyReportCSV(pickMonth, pickYearBE) {
  const t = getToday();
  const month = pickMonth || t.month;
  const yearBE = pickYearBE || t.yearBE;
  const md = computeMonth(month - 1, yearBE);
  const monthTH = MONTHS_TH_SHORT[month - 1];
  const channelNameById = Object.fromEntries((TMK.channels || []).map(c => [c.id, c.name]));
  // CSV building (pure) → lib/csv.js · ที่นี่คง side-effect
  const csv = buildMonthlyReportCsv({ md, dailyAll: TMK.dailyAll || [], channelNameById, monthTH, yearBE, month });
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tmk-report-${yearBE}-${String(month).padStart(2, '0')}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
  logAudit({ action: 'export', entityType: 'data', entityName: `รายงาน ${monthTH} ${yearBE}`, summary: `ส่งออกรายงานรายเดือน ${monthTH} ${yearBE}` });
  if (window.__toast) window.__toast(`ส่งออกรายงาน ${monthTH} ${yearBE} เรียบร้อย`, 'success');
}

export function GeneralSettings({ dark, setDark }) {
  // เลือกเดือน-ปีสำหรับรายงาน (default = เดือนปัจจุบัน, ย้อนหลังได้ 5 ปี)
  const _t = getToday();
  const [reportMonth, setReportMonth] = useState(_t.month);
  const [reportYear, setReportYear] = useState(_t.yearBE);
  const yearOptions = [0, 1, 2, 3, 4, 5].map(d => _t.yearBE - d);
  
  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      {/* Appearance */}
      <Card>
        <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon name={dark ? 'moon' : 'sun'} className="size-5 text-muted-foreground" /> ธีมและการแสดงผล
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm">โหมดมืด</div>
              <div className="text-sm text-muted-foreground mt-1">เปลี่ยนธีมสีของระบบ</div>
            </div>
            <ShadcnSwitch checked={dark} onCheckedChange={setDark} aria-label="โหมดมืด" />
          </div>
        </CardContent>
      </Card>

      {/* Notification settings */}
      <Card>
        <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon name="bell" className="size-5 text-muted-foreground" /> การแจ้งเตือน
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 divide-y divide-border/50">
          <div className="flex items-center justify-between py-4">
            <div>
              <div className="font-semibold text-sm">แจ้งเตือนงาน &amp; สรุปเดือน</div>
              <div className="text-sm text-muted-foreground mt-1">เตือนงานวันนี้/เกินกำหนด/ใกล้ถึง และเตือนสรุปยอดเดือนที่แล้ว</div>
            </div>
            <NotifToggle storeKey="tmk-notif-overdue" label="เปิด/ปิดแจ้งเตือนงาน" />
          </div>
          <div className="flex items-center justify-between py-4">
            <div>
              <div className="font-semibold text-sm">เตือนกรอกยอดขายวันนี้</div>
              <div className="text-sm text-muted-foreground mt-1">เตือนเมื่อยังไม่ได้บันทึกยอดขายของวันนี้</div>
            </div>
            <NotifToggle storeKey="tmk-notif-daily" label="เปิด/ปิดเตือนกรอกยอดขาย" />
          </div>
          <div className="flex items-center justify-between py-4">
            <div>
              <div className="font-semibold text-sm">เตือนยอดขาย &amp; ค่าแอด</div>
              <div className="text-sm text-muted-foreground mt-1">เตือนเมื่อ ACOS เกินเพดาน, ใช้งบแอดเกินที่ตั้ง, ยอดช้ากว่าแผน หรือ pace ลูกค้าใหม่ช้า</div>
            </div>
            <NotifToggle storeKey="tmk-notif-sales" label="เปิด/ปิดเตือนยอดขาย" />
          </div>
          <div className="flex items-center justify-between py-4">
            <div>
              <div className="font-semibold text-sm">เตือนออเดอร์ค้าง</div>
              <div className="text-sm text-muted-foreground mt-1">เตือนเมื่อออเดอร์สถานะ "รอ/กำลังเตรียม" นานเกิน 2 วัน (กันลืมส่ง)</div>
            </div>
            <NotifToggle storeKey="tmk-notif-orders" label="เปิด/ปิดเตือนออเดอร์" />
          </div>
        </CardContent>
      </Card>

      {/* Data */}
      <Card>
        <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon name="layers" className="size-5 text-muted-foreground" /> ข้อมูลและการซิงค์
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 divide-y divide-border/50">
          <div className="flex items-center justify-between py-4">
            <div>
              <div className="font-semibold text-sm">ซิงค์ข้อมูลอัตโนมัติ</div>
              <div className="text-sm text-muted-foreground mt-1">ซิงค์อัตโนมัติผ่าน Supabase Realtime</div>
            </div>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">เปิด</Badge>
          </div>
          <div className="flex items-center justify-between py-4">
            <div>
              <div className="font-semibold text-sm">Export ข้อมูล</div>
              <div className="text-sm text-muted-foreground mt-1">ดาวน์โหลดข้อมูลทั้งหมดเป็น CSV (รองรับภาษาไทยใน Excel)</div>
            </div>
            <Button variant="outline" size="sm" onClick={exportAllCSV}>
              <Icon name="external" className="mr-2 size-4" /> Export
            </Button>
          </div>
          <div className="py-4">
            <div className="mb-4">
              <div className="font-semibold text-sm">รายงานยอดขายรายเดือน</div>
              <div className="text-sm text-muted-foreground mt-1">สรุปต่อช่องทาง (เป้า/ยอด/ROAS) + ยอดรายวันต่อช่องทาง — เลือกเดือนย้อนหลังได้</div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Select value={String(reportMonth)} onValueChange={(val) => setReportMonth(Number(val))}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="เลือกเดือน" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS_TH_SHORT.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              
              <Select value={String(reportYear)} onValueChange={(val) => setReportYear(Number(val))}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="เลือกปี" />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}{y === _t.yearBE ? ' (ปีนี้)' : ''}</SelectItem>)}
                </SelectContent>
              </Select>
              
              <Button onClick={() => exportMonthlyReportCSV(reportMonth, reportYear)}>
                <Icon name="external" className="mr-2 size-4" /> ดาวน์โหลด CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon name="sparkle" className="size-5 text-muted-foreground" /> เกี่ยวกับระบบ
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 divide-y divide-border/50">
          <div className="flex items-center justify-between py-4">
            <div>
              <div className="font-semibold text-sm">เวอร์ชัน</div>
              <div className="text-sm text-muted-foreground mt-1">ดูอัปเดตที่ป้าย "มีอะไรใหม่" มุมขวาล่าง</div>
            </div>
            <Badge variant="secondary">v{APP_VERSION}</Badge>
          </div>
          <div className="flex items-center justify-between py-4">
            <div>
              <div className="font-semibold text-sm">แหล่งข้อมูล</div>
              <div className="text-sm text-muted-foreground mt-1">ทุกหน้าดึงข้อมูลจริงจาก Supabase แบบเรียลไทม์ ไม่มีข้อมูลจำลอง</div>
            </div>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Supabase</Badge>
          </div>
          <div className="flex items-center justify-between py-4">
            <div>
              <div className="font-semibold text-sm">ข้อมูลแยกตามเดือน</div>
              <div className="text-sm text-muted-foreground mt-1">ทุกหน้าที่มีตัวเลือกเดือนแสดงข้อมูลของเดือนที่เลือก (อดีต/ปัจจุบัน/อนาคต)</div>
            </div>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">เปิด</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---- Updates / Changelog ---- */

/* ====================  BRANDS VIEW (แบรนด์ — จัดกลุ่ม/ป้ายกำกับโครงการ)  ==================== */
// เลียนแบบ ChannelsView (CRUD + logo upload + color + drag-reorder + soft-delete+undo + graceful)
// ตาราง tmk_brands ยังไม่ migrate → โชว์ป้ายเตือน (MigrationNotice) แทน
export function BrandsView() {
  const { reload, refresh } = useData() || {};
  const PALETTE = ['#6b5ce0', '#4a8be0', '#18a0ab', '#06c755', '#2f9e6e', '#c08a3e', '#ee6a3a', '#ec4899', '#cf4d5c', '#0a5aa0'];
  const brands = (TMK.brands || []);

  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  // add
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLogo, setNewLogo] = useState('');
  const [newTagline, setNewTagline] = useState('');
  const [newColor, setNewColor] = useState(PALETTE[0]);
  // edit
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [editLogo, setEditLogo] = useState('');
  const [editTagline, setEditTagline] = useState('');
  const [editColor, setEditColor] = useState('');

  const isMissing = (err) => /relation .* does not exist|does not exist|schema cache|PGRST205|42P01/i.test(err?.message || err?.code || '');
  const [need, setNeed] = useState(false);

  const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
    if (!file) return reject('no file');
    if (file.size > 500 * 1024) return reject('ไฟล์ใหญ่เกิน 500KB');
    const r = new FileReader();
    r.onload = ev => resolve(ev.target.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  const addBrand = async () => {
    if (!guardEdit()) return;
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const baseId = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || ('brand-' + Date.now());
      let id = baseId, counter = 1;
      while (brands.find(b => b.id === id)) id = `${baseId}_${counter++}`;
      const maxOrder = Math.max(0, ...brands.map(b => b.sortOrder || 0));
      const { error } = await supabase.from('tmk_brands').insert({ id, name, color: newColor, logo_url: newLogo, tagline: newTagline.trim(), sort_order: maxOrder + 1 });
      if (error) { if (isMissing(error)) { setNeed(true); throw new Error('ยังไม่ได้รัน migration — รัน 20260710-flows-brands.sql ก่อน'); } throw error; }
      logAudit({ action: 'create', entityType: 'brand', entityName: name, summary: `เพิ่มแบรนด์ "${name}"` });
      if (refresh) await refresh(['tmk_brands']); else if (reload) await reload();
      setNewName(''); setNewLogo(''); setNewTagline(''); setNewColor(PALETTE[0]); setShowAdd(false);
      window.__toast?.('เพิ่มแบรนด์เรียบร้อย', 'success');
    } catch (err) { window.__toast?.('เพิ่มไม่สำเร็จ: ' + err.message, 'error'); } finally { setBusy(false); }
  };

  const startEdit = (b) => { setEditing(b.id); setEditName(b.name); setEditLogo(b.logoUrl || ''); setEditTagline(b.tagline || ''); setEditColor(b.color || PALETTE[0]); };

  const saveEdit = async () => {
    if (!guardEdit()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('tmk_brands').update({ name: editName.trim(), color: editColor, logo_url: editLogo, tagline: editTagline.trim() }).eq('id', editing);
      if (error) throw error;
      logAudit({ action: 'update', entityType: 'brand', entityName: editName.trim(), summary: `แก้ไขแบรนด์ "${editName.trim()}"` });
      if (refresh) await refresh(['tmk_brands']); else if (reload) await reload();
      setEditing(null);
      window.__toast?.('อัปเดตแบรนด์เรียบร้อย', 'success');
    } catch (err) { window.__toast?.('บันทึกไม่สำเร็จ: ' + err.message, 'error'); } finally { setBusy(false); }
  };

  const deleteBrand = async (b) => {
    if (!guardEdit()) return;
    const linked = (TMK.flows || []).filter(f => (f.brandIds || []).includes(b.id) || f.brandId === b.id).length;
    if (!await window.__confirm?.({ title: 'ลบแบรนด์', body: linked > 0 ? `แบรนด์ "${b.name}" ผูกกับ ${linked} โครงการ — ลบจะปลดป้ายแบรนด์ออก` : `ลบแบรนด์ "${b.name}"?`, danger: true, confirmText: 'ลบ' })) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('tmk_brands').update({ deleted_at: new Date().toISOString() }).eq('id', b.id);
      if (error) throw error;
      logAudit({ action: 'delete', entityType: 'brand', entityName: b.name, summary: `ลบแบรนด์ "${b.name}"` });
      if (refresh) await refresh(['tmk_brands']); else if (reload) await reload();
      setEditing(null);
      window.__toast?.('ย้ายแบรนด์ไปถังขยะแล้ว', 'success', 6000, {
        label: 'เลิกทำ',
        onClick: async () => {
          try { await supabase.from('tmk_brands').update({ deleted_at: null }).eq('id', b.id); if (refresh) await refresh(['tmk_brands']); else if (reload) await reload(); window.__toast?.('กู้คืนแบรนด์แล้ว', 'success'); }
          catch (e) { window.__toast?.('กู้คืนไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
        },
      });
    } catch (err) { window.__toast?.('ลบไม่สำเร็จ: ' + err.message, 'error'); } finally { setBusy(false); }
  };

  const reorderBrand = async (fromId, toId) => {
    if (!guardEdit()) return;
    if (fromId === toId) return;
    const fromIdx = brands.findIndex(b => b.id === fromId), toIdx = brands.findIndex(b => b.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const reordered = [...brands];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setBusy(true);
    try {
      const results = await Promise.all(reordered.map((b, i) => supabase.from('tmk_brands').update({ sort_order: i + 1 }).eq('id', b.id)));
      const failed = results.find(r => r.error);
      if (failed) throw failed.error;
      if (refresh) await refresh(['tmk_brands']); else if (reload) await reload();
      window.__toast?.('เรียงลำดับใหม่เรียบร้อย', 'success');
    } catch (err) { window.__toast?.('เลื่อนไม่สำเร็จ: ' + err.message, 'error'); } finally { setBusy(false); }
  };

  if (need || (brands.length === 0)) {
    // ยังไม่มีแบรนด์ — ถ้าตารางหาย โชว์ป้าย migration, ถ้าตารางมีแต่ว่าง โชว์ empty + ปุ่มเพิ่ม
    // (เรนเดอร์ต่อ — empty state อยู่ในลิสต์ด้านล่างแล้ว ยกเว้นตารางหายจริง)
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <Card className="bg-primary/5 border-l-4 border-l-primary shadow-none">
        <CardContent className="p-5 flex gap-4 items-start">
          <Icon name="store" className="size-6 text-primary mt-1" />
          <div>
            <h3 className="text-lg font-bold mb-1 text-foreground">แบรนด์</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              จัดการรายชื่อแบรนด์ — แต่ละโครงการ (board วางแผนงาน) เลือกแบรนด์มาใช้เป็นป้ายกำกับได้ · เพิ่ม/ลบ/แก้โลโก้/สี และจัดเรียงลำดับ
            </p>
          </div>
        </CardContent>
      </Card>

      {need ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-2">
            <Icon name="store" className="size-12 opacity-20" />
            <div className="font-semibold">ยังไม่ได้รัน migration</div>
            <div className="text-sm text-muted-foreground">รัน <code className="px-1.5 py-0.5 rounded bg-muted">20260710-flows-brands.sql</code> ใน Supabase → SQL Editor ก่อน แล้วรีเฟรช</div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50 bg-muted/20">
            <CardTitle className="text-lg flex items-center gap-2">
              <Icon name="store" className="size-5 text-muted-foreground" /> แบรนด์ทั้งหมด ({brands.length})
            </CardTitle>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Icon name="plus" className="size-4 mr-2" /> เพิ่มแบรนด์
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex flex-col">
              {brands.length === 0 && (
                <div className="p-10 text-center text-muted-foreground">
                  <p className="text-sm">ยังไม่มีแบรนด์ — กด "เพิ่มแบรนด์" เพื่อเริ่ม</p>
                </div>
              )}
              {brands.map((b, idx) => {
                const isOver = dragOver === b.id;
                return (
                  <div key={b.id}
                    draggable
                    onDragStart={() => setDragId(b.id)}
                    onDragEnd={() => { setDragId(null); setDragOver(null); }}
                    onDragOver={(e) => { e.preventDefault(); if (dragId && dragId !== b.id) setDragOver(b.id); }}
                    onDragLeave={() => setDragOver(o => o === b.id ? null : o)}
                    onDrop={() => { if (dragId) reorderBrand(dragId, b.id); setDragId(null); setDragOver(null); }}
                    className="flex items-center gap-3 p-4 border-b border-border/50 last:border-b-0 cursor-move transition-colors"
                    style={{ background: isOver ? 'hsl(var(--accent)/0.1)' : 'transparent', opacity: dragId === b.id ? 0.4 : 1 }}>
                    <div className="hidden sm:flex shrink-0 text-muted-foreground/50" title="ลากเพื่อเรียงลำดับ">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="9" cy="6" r="1.5" fill="currentColor" /><circle cx="9" cy="12" r="1.5" fill="currentColor" /><circle cx="9" cy="18" r="1.5" fill="currentColor" />
                        <circle cx="15" cy="6" r="1.5" fill="currentColor" /><circle cx="15" cy="12" r="1.5" fill="currentColor" /><circle cx="15" cy="18" r="1.5" fill="currentColor" />
                      </svg>
                    </div>
                    <div className="flex sm:hidden flex-col gap-1 shrink-0 px-1" onClick={e => e.stopPropagation()}>
                      <button className="text-muted-foreground disabled:opacity-30 p-1" disabled={idx === 0 || busy} onClick={() => reorderBrand(b.id, brands[idx - 1].id)}>▲</button>
                      <button className="text-muted-foreground disabled:opacity-30 p-1" disabled={idx === brands.length - 1 || busy} onClick={() => reorderBrand(b.id, brands[idx + 1].id)}>▼</button>
                    </div>
                    {b.logoUrl ? (
                      <img src={b.logoUrl} alt={b.name} className="w-10 h-10 rounded-lg object-contain shrink-0 border bg-white" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold shrink-0" style={{ background: (b.color || '#666') + '18', color: b.color || '#666' }}>
                        {b.name?.[0] || '?'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-foreground text-base truncate">{b.name}</div>
                      {b.tagline && <div className="text-xs text-muted-foreground truncate">{b.tagline}</div>}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => startEdit(b)} title="แก้ไข">
                      <Icon name="pencil" className="size-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) { setShowAdd(false); setNewName(''); setNewLogo(''); setNewTagline(''); setNewColor(PALETTE[0]); } }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Icon name="store" className="size-5" /> เพิ่มแบรนด์</DialogTitle>
            <DialogDescription>แบรนด์ใช้เป็นป้ายกำกับ/จัดกลุ่มโครงการ</DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
              {newLogo ? <img src={newLogo} alt="" className="size-10 rounded object-contain bg-white" /> : <div className="size-10 rounded flex items-center justify-center shrink-0 text-white font-bold" style={{ background: newColor }}>{newName.trim()?.[0] || '?'}</div>}
              <div className="min-w-0"><div className="font-semibold text-base truncate">{newName.trim() || 'ชื่อแบรนด์'}</div>{newTagline.trim() && <div className="text-xs text-muted-foreground truncate">{newTagline.trim()}</div>}</div>
            </div>
            <div className="grid gap-2">
              <Label>ชื่อแบรนด์ <span className="text-destructive">*</span></Label>
              <Input placeholder="เช่น TMK, สายเกรซ, OEM" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newName.trim() && !busy) addBrand(); }} />
            </div>
            <div className="grid gap-2">
              <Label>คำโปรย (ออปชัน)</Label>
              <Input placeholder="เช่น เสื้อยืดพรีเมียม" value={newTagline} onChange={e => setNewTagline(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>โลโก้ (PNG/SVG)</Label>
              <div className="flex items-start gap-4">
                <label className="flex flex-col items-center justify-center w-20 h-20 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 overflow-hidden relative" style={newLogo ? { background: '#fff' } : {}}>
                  {newLogo ? <img src={newLogo} alt="" className="w-full h-full object-contain" /> : (
                    <div className="flex flex-col items-center justify-center text-muted-foreground"><Icon name="image" className="size-6 mb-1 opacity-50" /><span className="text-[10px] uppercase font-semibold">Upload</span></div>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={async e => { try { setNewLogo(await readFileAsBase64(e.target.files?.[0])); } catch (err) { window.__toast?.(String(err), 'error'); } }} />
                </label>
                {newLogo && <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setNewLogo('')}>ลบรูป</Button>}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>สีประจำแบรนด์</Label>
              <ColorPicker value={newColor} onChange={setNewColor} presets={PALETTE} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} disabled={busy}>ยกเลิก</Button>
            <Button onClick={addBrand} disabled={!newName.trim() || busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-[425px]">
          {editing && (() => {
            const b = brands.find(x => x.id === editing);
            if (!b) return null;
            return (
              <>
                <DialogHeader><DialogTitle className="flex items-center gap-2"><Icon name="store" className="size-5" /> แก้ไขแบรนด์: {b.name}</DialogTitle></DialogHeader>
                <div className="grid gap-6 py-4">
                  <div className="grid gap-2"><Label>ชื่อแบรนด์ <span className="text-destructive">*</span></Label><Input value={editName} onChange={e => setEditName(e.target.value)} /></div>
                  <div className="grid gap-2"><Label>คำโปรย</Label><Input value={editTagline} onChange={e => setEditTagline(e.target.value)} /></div>
                  <div className="grid gap-2">
                    <Label>โลโก้</Label>
                    <div className="flex items-start gap-4">
                      <label className="flex flex-col items-center justify-center w-20 h-20 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 overflow-hidden relative" style={editLogo ? { background: '#fff' } : {}}>
                        {editLogo ? <img src={editLogo} alt="" className="w-full h-full object-contain" /> : (
                          <div className="flex flex-col items-center justify-center text-muted-foreground"><Icon name="image" className="size-6 mb-1 opacity-50" /><span className="text-[10px] uppercase font-semibold">Upload</span></div>
                        )}
                        <input type="file" accept="image/*" className="hidden" onChange={async e => { try { setEditLogo(await readFileAsBase64(e.target.files?.[0])); } catch (err) { window.__toast?.(String(err), 'error'); } }} />
                      </label>
                      {editLogo && <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setEditLogo('')}>ลบรูป</Button>}
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>สีประจำแบรนด์</Label>
                    <ColorPicker value={editColor} onChange={setEditColor} presets={PALETTE} />
                  </div>
                </div>
                <DialogFooter className="flex-row justify-between sm:justify-between">
                  <Button variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteBrand(b)} disabled={busy}><Icon name="trash" className="size-4 mr-1" /> ลบ</Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>ยกเลิก</Button>
                    <Button onClick={saveEdit} disabled={!editName.trim() || busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
                  </div>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ====================  CHANNELS VIEW (ช่องทางการขาย)  ==================== */
export function ChannelsView() {
  const { reload, refresh } = useData() || {};
  const PALETTE = ['#ee6a3a', '#18a0ab', '#6b5ce0', '#4a8be0', '#06c755', '#c08a3e', '#ec4899', '#2f9e6e', '#cf4d5c', '#0a5aa0'];

  const channels = (TMK.channels || []);

  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [editLogo, setEditLogo] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editFee, setEditFee] = useState(0);
  const [editHasAd, setEditHasAd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLogo, setNewLogo] = useState('');
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [newHasAd, setNewHasAd] = useState(false);

  // Helper: read file → base64
  const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
    if (!file) return reject('no file');
    if (file.size > 500 * 1024) return reject('ไฟล์ใหญ่เกิน 500KB');
    const r = new FileReader();
    r.onload = ev => resolve(ev.target.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  const startEdit = (c) => {
    setEditing(c.id);
    setEditName(c.name);
    setEditLogo(c.logoUrl || c.icon || '');
    setEditColor(c.hex || c.color || PALETTE[0]);
    setEditFee(c.platformFeePct || 0);
    setEditHasAd(!!c.hasAd);
  };

  const saveEdit = async () => {
    if (!guardEdit()) return;
    setBusy(true);
    try {
      const payload = {
        name: editName.trim(),
        color: editColor,
        has_ad: !!editHasAd, // เปิด/ปิดช่องค่าโฆษณาของช่องทางนี้
      };
      // ลอง update รวม logo_url + platform_fee_pct; ถ้า column ยังไม่มี (ยังไม่รัน migration) → บันทึกฟิลด์หลักแทน
      const full = { ...payload, logo_url: editLogo, platform_fee_pct: Math.min(100, Math.max(0, Number(editFee) || 0)) }; // clamp 0–100 (พิมพ์/วางเกินช่วงทำ P&L เพี้ยน)
      const { error } = await supabase.from('tmk_channels').update(full).eq('id', editing);
      if (error) {
        if (/column .* does not exist/i.test(error.message)) {
          // migration ยังไม่รัน → บันทึกเฉพาะ name/color/has_ad
          const { error: e2 } = await supabase.from('tmk_channels').update(payload).eq('id', editing);
          if (e2) throw e2; // ล้มเหลวจริง → ไป outer catch (ไม่ขึ้น "สำเร็จ")
          if (window.__toast) window.__toast('บันทึกแล้ว — แต่โลโก้/ค่าธรรมเนียมต้องรัน SQL migration ก่อน', 'warn');
        } else {
          throw error; // error อื่น → ไป outer catch (แสดง "บันทึกไม่สำเร็จ")
        }
      }
      logAudit({ action: 'update', entityType: 'channel', entityName: editName.trim(), summary: `แก้ไขช่องทาง "${editName.trim()}"` });
      if (refresh) await refresh(['tmk_channels']); else if (reload) await reload();
      setEditing(null);
      if (window.__toast) window.__toast('อัปเดตช่องทางเรียบร้อย', 'success');
    } catch (err) {
      if (window.__toast) window.__toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const deleteChannel = async (c) => {
    if (!guardEdit()) return;
    // กันยอดหาย: ถ้าช่องทางมีประวัติยอดขาย การลบจะทำให้ยอดเก่าหายจากรายงาน → บล็อก
    const hasHistory = (TMK.dailyAll || []).some(r => { const cc = r.ch?.[c.id]; return cc && ((cc.rev || 0) > 0 || (cc.ord || 0) > 0); });
    if (hasHistory) { if (window.__toast) window.__toast(`ลบ "${c.name}" ไม่ได้ — มีประวัติยอดขายอยู่ (ยอดเก่าจะหายจากรายงาน) ถ้าไม่ใช้แล้วให้เปลี่ยนชื่อ/ลดลำดับแทน`, 'error'); return; }
    if (!await window.__confirm?.({ title: 'ลบช่องทาง', body: `ลบช่องทาง "${c.name}"?`, danger: true, confirmText: 'ลบ' })) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('tmk_channels').update({ deleted_at: new Date().toISOString() }).eq('id', c.id);
      if (error) throw error;
      logAudit({ action: 'delete', entityType: 'channel', entityName: c.name, summary: `ลบช่องทาง "${c.name}"` });
      if (refresh) await refresh(['tmk_channels']); else if (reload) await reload();
      setEditing(null);
      if (window.__toast) window.__toast('ย้ายช่องทางไปถังขยะแล้ว', 'success', 6000, {
        label: 'เลิกทำ',
        onClick: async () => {
          try {
            await supabase.from('tmk_channels').update({ deleted_at: null }).eq('id', c.id);
            if (refresh) await refresh(['tmk_channels']); else if (reload) await reload();
            window.__toast?.('กู้คืนช่องทางแล้ว', 'success');
          } catch (e) { window.__toast?.('กู้คืนไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
        },
      });
    } catch (err) {
      if (window.__toast) window.__toast('ลบไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const addChannel = async () => {
    if (!guardEdit()) return;
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      // Generate ID from name (lowercase, alphanumeric)
      const baseId = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || ('ch-' + Date.now());
      let id = baseId;
      let counter = 1;
      while (channels.find(c => c.id === id)) {
        id = `${baseId}_${counter++}`;
      }
      const maxOrder = Math.max(0, ...channels.map(c => c.sortOrder || 0));
      const basePayload = {
        id,
        name,
        color: newColor,
        actual: 0,
        sort_order: maxOrder + 1,
      };
      let { error } = await supabase.from('tmk_channels').insert({ ...basePayload, logo_url: newLogo, has_ad: !!newHasAd });
      if (error && /(logo_url|has_ad)/.test(error.message)) {
        // fallback ถ้า column ไหนยังไม่มี → ตัดเฉพาะตัวที่ขาดแล้วลองใหม่
        const retry = { ...basePayload };
        if (!/logo_url/.test(error.message)) retry.logo_url = newLogo;
        if (!/has_ad/.test(error.message)) retry.has_ad = !!newHasAd;
        const res = await supabase.from('tmk_channels').insert(retry);
        if (res.error) throw res.error;
        if (window.__toast) window.__toast('บางค่าไม่ได้บันทึก — ต้องรัน SQL migration', 'warn');
      } else if (error) throw error;
      logAudit({ action: 'create', entityType: 'channel', entityName: name, summary: `เพิ่มช่องทาง "${name}"` });
      if (refresh) await refresh(['tmk_channels']); else if (reload) await reload();
      setNewName(''); setNewLogo(''); setNewColor(PALETTE[0]); setNewHasAd(false); setShowAdd(false);
      if (window.__toast) window.__toast('เพิ่มช่องทางเรียบร้อย', 'success');
    } catch (err) {
      if (window.__toast) window.__toast('เพิ่มไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const reorderChannel = async (fromId, toId) => {
    if (!guardEdit()) return;
    if (fromId === toId) return;
    const fromIdx = channels.findIndex(c => c.id === fromId);
    const toIdx = channels.findIndex(c => c.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const reordered = [...channels];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setBusy(true);
    try {
      const updates = reordered.map((c, i) =>
        supabase.from('tmk_channels').update({ sort_order: i + 1 }).eq('id', c.id)
      );
      const results = await Promise.all(updates);
      const failed = results.find(r => r.error);
      if (failed) throw failed.error;
      if (refresh) await refresh(['tmk_channels']); else if (reload) await reload();
      if (window.__toast) window.__toast('เรียงลำดับใหม่เรียบร้อย', 'success');
    } catch (err) {
      if (window.__toast) window.__toast('เลื่อนไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <Card className="bg-primary/5 border-l-4 border-l-primary shadow-none">
        <CardContent className="p-5 flex gap-4 items-start">
          <Icon name="layers" className="size-6 text-primary mt-1" />
          <div>
            <h3 className="text-lg font-bold mb-1 text-foreground">ช่องทางการขาย</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              จัดการรายการช่องทางที่ใช้บันทึกยอดขาย — เพิ่ม/ลบ/แก้ไอคอน/สี/เป้าหมาย และจัดเรียงลำดับได้ ข้อมูลเก็บใน Supabase
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50 bg-muted/20">
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon name="layers" className="size-5 text-muted-foreground" /> ช่องทางทั้งหมด ({channels.length})
          </CardTitle>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Icon name="plus" className="size-4 mr-2" /> เพิ่มช่องทางใหม่
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex flex-col">
            {channels.length === 0 && (
              <div className="p-10 text-center text-muted-foreground">
                <p className="text-sm">ยังไม่มีช่องทาง — กด "เพิ่มช่องทางใหม่" เพื่อเริ่ม</p>
              </div>
            )}
            {channels.map((c, idx) => {
              const isOver = dragOver === c.id;
              return (
                <div key={c.id}
                  draggable
                  onDragStart={() => setDragId(c.id)}
                  onDragEnd={() => { setDragId(null); setDragOver(null); }}
                  onDragOver={(e) => { e.preventDefault(); if (dragId && dragId !== c.id) setDragOver(c.id); }}
                  onDragLeave={() => setDragOver(o => o === c.id ? null : o)}
                  onDrop={() => { if (dragId) reorderChannel(dragId, c.id); setDragId(null); setDragOver(null); }}
                  className="flex items-center gap-3 p-4 border-b border-border/50 cursor-move transition-colors"
                  style={{
                    background: isOver ? 'hsl(var(--accent)/0.1)' : 'transparent',
                    opacity: dragId === c.id ? 0.4 : 1,
                  }}>
                  <div className="hidden sm:flex shrink-0 text-muted-foreground/50" title="ลากเพื่อเรียงลำดับ">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="9" cy="6" r="1.5" fill="currentColor" /><circle cx="9" cy="12" r="1.5" fill="currentColor" /><circle cx="9" cy="18" r="1.5" fill="currentColor" />
                      <circle cx="15" cy="6" r="1.5" fill="currentColor" /><circle cx="15" cy="12" r="1.5" fill="currentColor" /><circle cx="15" cy="18" r="1.5" fill="currentColor" />
                    </svg>
                  </div>
                  {/* สำหรับมือถือ */}
                  <div className="flex sm:hidden flex-col gap-1 shrink-0 px-1" onClick={e => e.stopPropagation()}>
                    <button className="text-muted-foreground disabled:opacity-30 p-1" disabled={idx === 0 || busy} onClick={() => reorderChannel(c.id, channels[idx - 1].id)}>▲</button>
                    <button className="text-muted-foreground disabled:opacity-30 p-1" disabled={idx === channels.length - 1 || busy} onClick={() => reorderChannel(c.id, channels[idx + 1].id)}>▼</button>
                  </div>
                  
                  {c.logoUrl ? (
                    <img src={c.logoUrl} alt={c.name} className="w-10 h-10 rounded-lg object-contain shrink-0 border" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold shrink-0" 
                      style={{ background: (c.hex || c.color || '#666') + '18', color: c.hex || c.color || '#666' }}>
                      {c.icon || c.name?.[0] || '?'}
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-foreground text-base truncate">{c.name}</div>
                  </div>
                  
                  <Button variant="ghost" size="icon" onClick={() => startEdit(c)} title="แก้ไข">
                    <Icon name="pencil" className="size-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* เพิ่มช่องทางใหม่ Dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => {
        if (!open) {
          setShowAdd(false); setNewName(''); setNewLogo(''); setNewColor(PALETTE[0]); setNewHasAd(false);
        }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="layers" className="size-5" /> เพิ่มช่องทางใหม่
            </DialogTitle>
            <DialogDescription>
              ช่องทางที่ใช้บันทึกยอดขายและค่าโฆษณา
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-6 py-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
              {newLogo ? (
                <img src={newLogo} alt="" className="size-10 rounded object-contain bg-white" />
              ) : (
                <div className="size-10 rounded flex items-center justify-center shrink-0" style={{ background: newColor }}></div>
              )}
              <div className="font-semibold text-lg flex-1 truncate">{newName.trim() || 'ชื่อช่องทาง'}</div>
              {newHasAd && <Badge variant="secondary">มีโฆษณา</Badge>}
            </div>

            <div className="grid gap-2">
              <Label>ชื่อช่องทาง <span className="text-destructive">*</span></Label>
              <Input placeholder="เช่น Shopee, Instagram, TikTok" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newName.trim() && !busy) addChannel(); }} />
            </div>

            <div className="grid gap-2">
              <Label>โลโก้ (PNG/SVG)</Label>
              <div className="flex items-start gap-4">
                <label className="flex flex-col items-center justify-center w-20 h-20 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 overflow-hidden relative" style={newLogo ? { background: '#fff' } : {}}>
                  {newLogo ? (
                    <img src={newLogo} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <div className="flex flex-col items-center justify-center pt-5 pb-6 text-muted-foreground">
                      <Icon name="image" className="size-6 mb-1 opacity-50" />
                      <span className="text-[10px] uppercase font-semibold">Upload</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={async e => {
                    try { setNewLogo(await readFileAsBase64(e.target.files?.[0])); }
                    catch (err) { if (window.__toast) window.__toast(String(err), 'error'); }
                  }} />
                </label>
                {newLogo && (
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setNewLogo('')}>ลบรูป</Button>
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>สีประจำช่องทาง</Label>
              <ColorPicker value={newColor} onChange={setNewColor} presets={PALETTE} />
            </div>

            <div className="flex items-center space-x-2">
              <ShadcnCheckbox id="newHasAd" checked={newHasAd} onCheckedChange={setNewHasAd} />
              <Label htmlFor="newHasAd" className="font-normal text-muted-foreground">มีโฆษณา — เปิดช่องกรอกค่าแอด &amp; แสดงในตารางโฆษณา</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} disabled={busy}>ยกเลิก</Button>
            <Button onClick={addChannel} disabled={!newName.trim() || busy}>
              {busy ? <Icon name="loader" className="mr-2 size-4 animate-spin" /> : <Icon name="check" className="mr-2 size-4" />}
              {busy ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* แก้ไขช่องทาง Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-[425px]">
          {editing && (() => {
            const c = channels.find(x => x.id === editing);
            if (!c) return null;
            const hasLogo = editLogo && editLogo.startsWith('data:');
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Icon name="layers" className="size-5" /> แก้ไขช่องทาง: {c.name}
                  </DialogTitle>
                </DialogHeader>
                
                <div className="grid gap-6 py-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                    {hasLogo ? (
                      <img src={editLogo} alt="" className="size-10 rounded object-contain bg-white" />
                    ) : (
                      <div className="size-10 rounded flex items-center justify-center shrink-0" style={{ background: editColor }}></div>
                    )}
                    <div className="font-semibold text-lg flex-1 truncate">{editName.trim() || 'ชื่อช่องทาง'}</div>
                    {editHasAd && <Badge variant="secondary">มีโฆษณา</Badge>}
                  </div>

                  <div className="grid gap-2">
                    <Label>ชื่อช่องทาง <span className="text-destructive">*</span></Label>
                    <Input value={editName} onChange={e => setEditName(e.target.value)} />
                  </div>

                  <div className="grid gap-2">
                    <Label>โลโก้ (PNG/SVG)</Label>
                    <div className="flex items-start gap-4">
                      <label className="flex flex-col items-center justify-center w-20 h-20 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 overflow-hidden relative" style={hasLogo ? { background: '#fff' } : {}}>
                        {hasLogo ? (
                          <img src={editLogo} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <div className="flex flex-col items-center justify-center pt-5 pb-6 text-muted-foreground">
                            <Icon name="image" className="size-6 mb-1 opacity-50" />
                            <span className="text-[10px] uppercase font-semibold">Upload</span>
                          </div>
                        )}
                        <input type="file" accept="image/*" className="hidden" onChange={async e => {
                          try { setEditLogo(await readFileAsBase64(e.target.files?.[0])); }
                          catch (err) { if (window.__toast) window.__toast(String(err), 'error'); }
                        }} />
                      </label>
                      {editLogo && (
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setEditLogo('')}>ลบรูป</Button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>สีประจำช่องทาง</Label>
                    <ColorPicker value={editColor} onChange={setEditColor} presets={PALETTE} />
                  </div>

                  <div className="grid gap-2">
                    <Label>ค่าธรรมเนียมแพลตฟอร์ม (%)</Label>
                    <Input type="number" min="0" max="100" step="0.01" value={editFee} onChange={e => setEditFee(e.target.value)} placeholder="0" className="w-1/2" />
                    <p className="text-xs text-muted-foreground mt-1">เช่น Shopee ~5–10%, ช่องทางตัวเอง (CRM) = 0</p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <ShadcnCheckbox id="editHasAd" checked={editHasAd} onCheckedChange={setEditHasAd} />
                    <Label htmlFor="editHasAd" className="font-normal text-muted-foreground">มีโฆษณา — เปิดช่องกรอกค่าแอด &amp; แสดงในตารางโฆษณา</Label>
                  </div>
                </div>

                <DialogFooter className="flex-row sm:justify-between">
                  <Button variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteChannel(c)} disabled={busy}>
                    <Icon name="trash" className="mr-2 size-4" /> ลบ
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>ยกเลิก</Button>
                    <Button onClick={saveEdit} disabled={!editName.trim() || busy}>
                      {busy ? <Icon name="loader" className="mr-2 size-4 animate-spin" /> : <Icon name="check" className="mr-2 size-4" />}
                      {busy ? 'กำลังบันทึก…' : 'บันทึก'}
                    </Button>
                  </div>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* DutiesView + RolesView แยกไป views-settings-people.jsx (REFACTOR-1) — re-export กัน consumer แก้ */
export { DutiesView, RolesView } from './views-settings-people.jsx';

const TRASH_TABLES = [
  { table: 'tmk_tasks',             type: 'งาน',        nameCol: 'title',   key: 'id' },
  { table: 'tmk_campaigns',         type: 'แคมเปญ',     nameCol: 'name',    key: 'id' },
  { table: 'tmk_channels',          type: 'ช่องทาง',    nameCol: 'name',    key: 'id' },
  { table: 'tmk_products',          type: 'สินค้า',      nameCol: 'name',    key: 'id' },
  { table: 'tmk_duties',            type: 'หน้าที่',     nameCol: 'name',    key: 'id' },
  { table: 'tmk_ad_campaigns',      type: 'แคมเปญแอด',  nameCol: 'name',    key: 'id' },
  { table: 'tmk_customer_segments', type: 'กลุ่มลูกค้า', nameCol: 'name',    key: 'id' },
  { table: 'tmk_user_roles',        type: 'ผู้ใช้',      nameCol: 'name',    key: 'email' },
  { table: 'tmk_daily_sales',       type: 'ยอดรายวัน',   nameCol: 'date',    key: 'id' },
];

export function TrashView() {
  const { reload, refresh } = useData() || {};
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const aliveRef = React.useRef(true);
  // ไม่ setLoading(true) ตอนต้น: ครั้งแรก state เริ่มเป็น true อยู่แล้ว / ตอน refetch (restore/purge) ปล่อยรายการเดิมค้างไว้ไม่ให้กระพริบ (มี busy คุมปุ่มแล้ว)
  const load = async () => {
    try {
      const results = await Promise.all(
        TRASH_TABLES.map(t => {
          // ดึงเฉพาะคอลัมน์ที่ list ใช้จริง (key + ชื่อ + deleted_at) — ตัด jsonb หนัก (lots/items/status_log…) ออกจาก egress
          const sel = [...new Set([t.key, t.nameCol, 'deleted_at'])].join(',');
          return supabase.from(t.table).select(sel).not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
        })
      );
      if (!aliveRef.current) return; // กัน setState หลัง unmount
      const all = [];
      results.forEach((r, i) => {
        if (r.error || !r.data) return;
        const meta = TRASH_TABLES[i];
        r.data.forEach(row => all.push({
          meta,
          id: row[meta.key],
          name: row[meta.nameCol] || row[meta.key] || '(ไม่มีชื่อ)',
          deletedAt: row.deleted_at,
        }));
      });
      all.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
      setItems(all);
    } catch (e) {
      console.error('Trash load failed:', e);
    } finally { if (aliveRef.current) setLoading(false); }
  };

  useEffect(() => {
    aliveRef.current = true;
    (async () => { await load(); })(); // setState เกิดหลัง await ภายใน load → ไม่ใช่ synchronous ใน effect
    return () => { aliveRef.current = false; };
  }, []);

  const restore = async (it) => {
    if (!guardEdit()) return;
    if ((it.meta.table === 'tmk_user_roles' || it.meta.table === 'tmk_staff') && !guardAdmin()) return; // ผู้ใช้/สิทธิ์ = admin
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from(it.meta.table).update({ deleted_at: null }).eq(it.meta.key, it.id);
      if (error) throw error;
      // user: กู้ tmk_staff ด้วย
      if (it.meta.table === 'tmk_user_roles') {
        await supabase.from('tmk_staff').update({ deleted_at: null }).eq('email', it.id);
      }
      logAudit({ action: 'restore', entityType: it.meta.type, entityName: it.name, summary: `กู้คืน${it.meta.type} "${it.name}"` });
      if (window.__toast) window.__toast(`กู้คืน "${it.name}" แล้ว`, 'success');
      await load();
      if (refresh) await refresh(it.meta.table === 'tmk_user_roles' ? [it.meta.table, 'tmk_staff'] : [it.meta.table]); else if (reload) await reload();
    } catch (err) {
      if (window.__toast) window.__toast('กู้คืนไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const purge = async (it) => {
    if (!guardEdit()) return;
    if ((it.meta.table === 'tmk_user_roles' || it.meta.table === 'tmk_staff') && !guardAdmin()) return; // ผู้ใช้/สิทธิ์ = admin
    if (busy) return;
    if (!await window.__confirm?.({ title: 'ลบถาวร', body: `ลบถาวร "${it.name}"?\nลบแล้วกู้คืนไม่ได้อีก`, danger: true, confirmText: 'ลบถาวร' })) return;
    setBusy(true);
    try {
      const { error } = await supabase.from(it.meta.table).delete().eq(it.meta.key, it.id);
      if (error) throw error;
      if (it.meta.table === 'tmk_user_roles') {
        const { error: e2 } = await supabase.from('tmk_staff').delete().eq('email', it.id);
        if (e2) throw e2;
      }
      logAudit({ action: 'purge', entityType: it.meta.type, entityName: it.name, summary: `ลบถาวร${it.meta.type} "${it.name}"` });
      if (window.__toast) window.__toast(`ลบถาวร "${it.name}" แล้ว`, 'success');
      await load();
    } catch (err) {
      if (window.__toast) window.__toast('ลบถาวรไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const fmtDate = (s) => { try { return new Date(s).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

  if (!loading && items.length === 0) {
    return (
      <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
        <Card className="border-dashed bg-muted/10">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Icon name="trash" className="size-16 opacity-20 mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">ถังขยะว่างเปล่า</h3>
            <p className="text-sm text-muted-foreground">รายการที่ลบจะถูกเก็บไว้ที่นี่ · กู้คืนได้ตลอด</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between pb-4 border-b border-border/50 bg-muted/20">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Icon name="trash" className="size-5 text-destructive" /> ถังขยะ <span className="text-sm text-muted-foreground font-normal">({items.length})</span>
            </CardTitle>
            <CardDescription className="mt-1.5">กู้คืนได้ · หรือลบถาวร</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="bg-amber-500/10 border-l-4 border-amber-500 p-3 m-4 rounded-r-md">
            <p className="text-sm text-amber-700 font-medium">หมายเหตุ: กู้คืนแคมเปญแล้ว งานที่เคยผูกจะไม่กลับมาผูกอัตโนมัติ (ต้องเลือกแคมเปญใหม่ในแต่ละงาน)</p>
          </div>

          <div className="flex flex-col divide-y divide-border/50">
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <Icon name="loader" className="size-6 animate-spin opacity-50" />
                <p className="text-sm">กำลังโหลด…</p>
              </div>
            ) : items.map((it, i) => (
              <div key={it.meta.table + it.id + i} className="flex flex-wrap sm:flex-nowrap items-center gap-4 p-4 hover:bg-muted/20 transition-colors">
                <Badge variant="outline" className="bg-muted shrink-0 text-xs py-1">
                  {it.meta.type}
                </Badge>
                
                <div className="flex-1 min-w-[200px]">
                  <div className="font-semibold text-sm truncate text-foreground">{it.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">ลบเมื่อ {fmtDate(it.deletedAt)}</div>
                </div>
                
                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end mt-2 sm:mt-0">
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => restore(it)}>
                    <Icon name="refreshCcw" className="size-4 mr-2" /> กู้คืน
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" disabled={busy} onClick={() => purge(it)}>
                    <Icon name="trash" className="size-4 mr-2" /> ลบถาวร
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


