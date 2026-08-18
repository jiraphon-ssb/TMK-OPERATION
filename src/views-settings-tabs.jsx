/* ============================================================
   views-settings-tabs.jsx — sub-view แท็บของหน้า "ตั้งค่า" (PART 84 REFACTOR-1 · แยกจาก views-settings god-file)
   ============================================================
   SettingsBody (views-settings.jsx) เป็น orchestrator เรียก sub-view เหล่านี้ · behavior-preserving file-split
   ============================================================ */
import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from './components.jsx';
import { useData } from './dataContext.jsx';
import { MonthPicker } from './components/MonthPicker.jsx';
import { supabase } from './lib/supabaseClient.js';
import { logAudit, diffFields } from './lib/audit.js';
import { fetchTargets, saveTarget } from './lib/targets.js';
import { normCutoffDay, DEFAULT_CUTOFF_DAY } from './lib/commissionCycle.js';
import { fetchCrmTargets, saveCrmTarget } from './lib/crmTargets.js';
import { APP_VERSION } from './changelog.js';
import { todayISO } from './lib/dateUtils.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch as ShadcnSwitch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { DD, guardEdit, guardAdmin } from './saleWidgets.jsx';
import { toast, confirm, openModal } from './lib/appBus.js';

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
    if (!await confirm({ title: 'ลบแคมเปญ', body: msg, danger: true, confirmText: 'ลบ' })) return;
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
      toast('ย้ายแคมเปญไปถังขยะแล้ว', 'success', 6000, {
        label: 'เลิกทำ',
        onClick: async () => {
          try {
            await supabase.from('tmk_campaigns').update({ deleted_at: null }).eq('id', c.id);
            if (refresh) await refresh(['tmk_campaigns']); else if (reload) await reload();
            toast('กู้คืนแคมเปญแล้ว', 'success');
          } catch (e) { toast('กู้คืนไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
        },
      });
    } catch (err) {
      toast('ลบไม่สำเร็จ: ' + err.message, 'error');
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
          toast('ต้อง alter table เพิ่ม sort_order ก่อน — รัน SQL migration ใหม่', 'warn');
        } else throw failed.error;
      } else toast('เรียงลำดับใหม่เรียบร้อย', 'success');
      if (refresh) await refresh(['tmk_campaigns']); else if (reload) await reload();
    } catch (err) {
      toast('เลื่อนไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="text-sm text-muted-foreground font-medium">
          {campaigns.length} แคมเปญ · เรียงลำดับได้ (ลากบนคอม / ปุ่ม ▲▼ บนมือถือ)
        </div>
        <Button onClick={() => openModal('campaign')}>
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
                    <h3 className="font-bold text-[15px] leading-snug line-clamp-2 hover:underline cursor-pointer min-w-0 flex-1" title={c.name} onClick={() => openModal('campaign', { ...c, channels: c.channels || [] })}>
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
                    <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); openModal('campaign', { ...c, channels: c.channels || [] }); }} title="แก้ไขแคมเปญ">
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
  // วันตัดรอบค่าคอม (ค่าเดียวทั้งทีม · ใช้ใน popup "ค่าคอมรอบตัด") — null = คอลัมน์ยังไม่ migrate
  const [cutoffDay, setCutoffDay] = useState(DEFAULT_CUTOFF_DAY);
  const [cutoffReady, setCutoffReady] = useState(false);

  // โหลดค่า setting วันตัด async ครั้งเดียวตอน mount
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { data, error } = await supabase.from('tmk_settings').select('commission_cutoff_day').eq('id', 'main').maybeSingle();
        if (!live) return;
        if (!error) { setCutoffDay(normCutoffDay(data?.commission_cutoff_day)); setCutoffReady(true); }
      } catch { /* คอลัมน์ยังไม่ migrate → โชว์ default อ่านอย่างเดียว */ }
    })();
    return () => { live = false; };
  }, []);

  const saveCutoffDay = async (v) => {
    const day = normCutoffDay(v);
    const prev = cutoffDay;
    setCutoffDay(day); // optimistic
    const { error } = await supabase.from('tmk_settings').update({ commission_cutoff_day: day }).eq('id', 'main');
    if (error) { setCutoffDay(prev); toast('เซฟวันตัดไม่ได้ — รัน migration 20260813-commission-cutoff.sql ก่อน', 'error'); return; }
    logAudit({ action: 'update', entityType: 'target', entityName: 'วันตัดรอบค่าคอม', summary: `ตั้งวันตัดรอบค่าคอม: ทุกวันที่ ${day}`, changes: [{ label: 'วันตัด', before: String(prev), after: String(day) }] });
    toast(`ตั้งวันตัดรอบค่าคอมเป็นวันที่ ${day} แล้ว`, 'success');
  };

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
    const [targets, crmTargets] = await Promise.all([fetchTargets(month), fetchCrmTargets(month)]);
    const map = {};
    targets.forEach(t => { map[t.salesperson] = { ...(map[t.salesperson] || {}), sales_target: t.sales_target ?? 0, commission_rate: t.commission_rate ?? 0 }; });
    crmTargets.forEach(t => { map[t.salesperson] = { ...(map[t.salesperson] || {}), crm_target: t.sales_target ?? 0 }; });
    // เป้าที่บันทึกไว้แต่คนนั้นยังไม่ส่งใบเสร็จเดือนนี้ → orphan (โผล่เมื่อกด "แสดง" · กันเป้าหาย · รวมคนที่ตั้งแต่เป้า CRM)
    const orphans = [...new Set([...targets.map(t => t.salesperson), ...crmTargets.map(t => t.salesperson)].filter(n => n && !recSet.has(n)))];
    setReceiptNames([...recSet]);
    setOrphanNames(orphans);
    setRows(map);
    setBaseline(JSON.parse(JSON.stringify(map)));
    setLoading(false);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- โหลดข้อมูลเป้า async ตอนเปลี่ยนเดือน (pattern ปกติ) · load ถูกสร้างใหม่ทุก render ใส่เป็น dep จะยิง query รัวๆ
  useEffect(() => { load(); }, [month]);

  // รายชื่อที่แสดง = ส่งใบเสร็จเดือนนี้ + เพิ่มเอง (+ orphan เมื่อกดแสดง)
  const people = useMemo(() => {
    const s = new Set([...receiptNames, ...manualNames]);
    if (showOrphans) orphanNames.forEach(n => s.add(n));
    return [...s].sort((a, b) => a.localeCompare(b, 'th'));
  }, [receiptNames, manualNames, orphanNames, showOrphans]);

  const isDirty = (name) => numOf(rows[name], 'sales_target') !== numOf(baseline[name], 'sales_target')
    || numOf(rows[name], 'commission_rate') !== numOf(baseline[name], 'commission_rate')
    || numOf(rows[name], 'crm_target') !== numOf(baseline[name], 'crm_target');
  const dirtyNames = people.filter(isDirty);

  const setField = (name, field, val) => setRows(p => ({ ...p, [name]: { ...(p[name] || {}), [field]: val } }));

  const persist = async (name) => {
    const r = rows[name] || {};
    const { error } = await saveTarget({ salesperson: name, month, sales_target: r.sales_target, commission_rate: r.commission_rate });
    if (error) {
      const miss = /relation .* does not exist|tmk_targets|schema cache/i.test(error.message || '');
      toast(miss ? 'ต้องรัน migration 20260701-targets.sql ใน Supabase ก่อน' : 'บันทึกไม่สำเร็จ: ' + error.message, 'error');
      return false;
    }
    // เป้า CRM แยกตาราง (tmk_crm_targets) — บันทึกเฉพาะเมื่อเปลี่ยน · ตารางยังไม่ migrate → toast ชี้ migration
    if (numOf(r, 'crm_target') !== numOf(baseline[name], 'crm_target')) {
      const { error: ce } = await saveCrmTarget({ salesperson: name, month, sales_target: r.crm_target });
      if (ce) {
        const miss = /relation .* does not exist|tmk_crm_targets|schema cache/i.test(ce.message || '');
        toast(miss ? 'ต้องรัน migration 20260731-crm-targets-notes.sql ใน Supabase ก่อน' : 'บันทึกเป้า CRM ไม่สำเร็จ: ' + ce.message, 'error');
        return false;
      }
    }
    const tChanges = diffFields(baseline[name], { sales_target: numOf(r, 'sales_target'), commission_rate: numOf(r, 'commission_rate'), crm_target: numOf(r, 'crm_target') }, [['sales_target', 'เป้ายอด'], ['commission_rate', 'เรตคอม %'], ['crm_target', 'เป้า CRM']]);
    logAudit({ action: 'update', entityType: 'target', entityName: name, summary: `ตั้งเป้า/คอม ${name} เดือน ${month}`, changes: tChanges.length ? tChanges : null });
    setBaseline(b => ({ ...b, [name]: { sales_target: numOf(r, 'sales_target'), commission_rate: numOf(r, 'commission_rate'), crm_target: numOf(r, 'crm_target') } }));
    return true;
  };

  // auto-save: บันทึกเมื่อโฟกัสออกจากการ์ด (blur) เฉพาะที่มีการแก้จริง — ไม่ต้องกดปุ่มรายคน
  const [savedKey, setSavedKey] = useState(null);   // แฟลช "บันทึกแล้ว ✓"
  const saveIfDirty = async (name) => {
    if (!isDirty(name) || savingKey === name) return;
    setSavingKey(name);
    const ok = await persist(name);
    setSavingKey(null);
    if (ok) { setSavedKey(name); setTimeout(() => setSavedKey(k => (k === name ? null : k)), 1600); }
  };


  const saveAll = async () => {
    if (!dirtyNames.length) return;
    setSavingAll(true);
    let ok = 0;
    for (const name of dirtyNames) { if (await persist(name)) ok++; }
    setSavingAll(false);
    if (ok) toast(`บันทึกเป้า ${ok} คน เดือนนี้แล้ว`, 'success');
  };

  const addPerson = () => {
    const n = addName.trim();
    if (n && !people.includes(n)) setManualNames(p => [...p, n]);
    setAddName('');
  };

  /* UI มินิมอล (user: "ข้อมูลไม่จำเป็นเยอะเกิน") — เหลือ: หัวบรรทัดเดียว (เดือน+วันตัด) + ตารางชื่อ/3ช่อง
     กรอกแล้วออกจากแถว = บันทึกเอง (ไอคอนเล็กข้างชื่อ: ●แก้ค้าง →✓บันทึกแล้ว) · ไม่มีแถบสรุป/คำอธิบาย/ปุ่มช่วย */
  return (
    <Card>
      <CardContent className="pt-5 space-y-3">
        {/* หัว: ชื่อ + เดือน + วันตัดรอบ (บรรทัดเดียว) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold inline-flex items-center gap-2"><Icon name="target" className="size-4" /> เป้า & คอมมิชชั่น</span>
          <span className="ml-auto flex items-center gap-2">
            <MonthPicker value={month} onChange={setMonth} className="h-8" />
            <span className="text-xs text-muted-foreground" title={`รอบค่าคอม: วันที่ ${cutoffDay} เดือนก่อน – วันที่ ${Math.max(cutoffDay - 1, 1)} เดือนนี้ · ใช้ในป๊อปอัพ "ค่าคอมรอบตัด"`}>ตัดรอบ</span>
            <Select value={String(cutoffDay)} onValueChange={saveCutoffDay} disabled={!cutoffReady}>
              <SelectTrigger className="h-8 w-[64px]"><SelectValue /></SelectTrigger>
              <SelectContent>{Array.from({ length: 28 }, (_, i) => i + 1).map(d => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">กำลังโหลด…</p>
        ) : people.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">ยังไม่มีเซลล์เดือนนี้ — พิมพ์ชื่อด้านล่างเพื่อตั้งเป้าล่วงหน้า</div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            {/* หัวคอลัมน์ */}
            <div className="grid grid-cols-[minmax(72px,1.1fr)_1fr_76px_1fr] gap-2 items-center px-3 py-1.5 bg-muted/40 text-[11px] text-muted-foreground">
              <span>เซลล์</span><span className="text-right">เป้ายอด (บาท)</span><span className="text-right">คอม %</span><span className="text-right">เป้า CRM (บาท)</span>
            </div>
            <div className="divide-y">
              {people.map(name => {
                const r = rows[name] || {};
                const dirty = isDirty(name);
                return (
                  <div key={name} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) saveIfDirty(name); }}
                    className="grid grid-cols-[minmax(72px,1.1fr)_1fr_76px_1fr] gap-2 items-center px-3 py-1.5">
                    <span className="text-sm font-medium truncate inline-flex items-center gap-1.5">
                      {name}
                      {savingKey === name ? <span className="size-2 rounded-full bg-[var(--accent)] animate-pulse shrink-0" title="กำลังบันทึก" />
                        : savedKey === name ? <Icon name="check" className="size-3.5 text-emerald-600 shrink-0" />
                        : dirty ? <span className="size-2 rounded-full bg-amber-500 shrink-0" title="ยังไม่บันทึก — ออกจากแถวแล้วบันทึกเอง" /> : null}
                    </span>
                    <Input type="number" inputMode="numeric" value={r.sales_target ?? ''} onChange={e => setField(name, 'sales_target', e.target.value)} className="h-8 text-right min-w-0" placeholder="0" />
                    <Input type="number" inputMode="decimal" step="0.1" value={r.commission_rate ?? ''} onChange={e => setField(name, 'commission_rate', e.target.value)} className="h-8 text-right min-w-0" placeholder="0" />
                    <Input type="number" inputMode="numeric" value={r.crm_target ?? ''} onChange={e => setField(name, 'crm_target', e.target.value)} className="h-8 text-right min-w-0" placeholder="0" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ท้าย: เพิ่มเซลล์ (ซ้าย) · บันทึกทั้งหมดเผื่อกรอกหลายคน (ขวา · โผล่เมื่อมีแก้ค้าง) */}
        <div className="flex flex-wrap items-center gap-2">
          <Input value={addName} onChange={e => setAddName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addPerson(); }} placeholder="+ เพิ่มเซลล์" className="h-8 w-[150px]" />
          {addName.trim() && <Button variant="outline" size="sm" className="h-8" onClick={addPerson}>เพิ่ม</Button>}
          {!loading && orphanNames.length > 0 && (
            <button type="button" onClick={() => setShowOrphans(v => !v)} className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2">
              {showOrphans ? 'ซ่อนคนที่ยังไม่ส่งใบเสร็จ' : `+${orphanNames.length} คนที่มีเป้าแต่ยังไม่ส่งใบเสร็จ`}
            </button>
          )}
          {dirtyNames.length > 0 && (
            <Button size="sm" className="h-8 ml-auto" disabled={savingAll} onClick={saveAll}>
              {savingAll ? 'กำลังบันทึก…' : `บันทึก (${dirtyNames.length})`}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function GeneralSettings({ dark, setDark }) {
  
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

/* BrandsView + ChannelsView แยกไป views-settings-catalog.jsx (REFACTOR-1) — re-export กัน consumer แก้ */
export { BrandsView, ChannelsView } from './views-settings-catalog.jsx';

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
      toast(`กู้คืน "${it.name}" แล้ว`, 'success');
      await load();
      if (refresh) await refresh(it.meta.table === 'tmk_user_roles' ? [it.meta.table, 'tmk_staff'] : [it.meta.table]); else if (reload) await reload();
    } catch (err) {
      toast('กู้คืนไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const purge = async (it) => {
    if (!guardEdit()) return;
    if ((it.meta.table === 'tmk_user_roles' || it.meta.table === 'tmk_staff') && !guardAdmin()) return; // ผู้ใช้/สิทธิ์ = admin
    if (busy) return;
    if (!await confirm({ title: 'ลบถาวร', body: `ลบถาวร "${it.name}"?\nลบแล้วกู้คืนไม่ได้อีก`, danger: true, confirmText: 'ลบถาวร' })) return;
    setBusy(true);
    try {
      const { error } = await supabase.from(it.meta.table).delete().eq(it.meta.key, it.id);
      if (error) throw error;
      if (it.meta.table === 'tmk_user_roles') {
        const { error: e2 } = await supabase.from('tmk_staff').delete().eq('email', it.id);
        if (e2) throw e2;
      }
      logAudit({ action: 'purge', entityType: it.meta.type, entityName: it.name, summary: `ลบถาวร${it.meta.type} "${it.name}"` });
      toast(`ลบถาวร "${it.name}" แล้ว`, 'success');
      await load();
    } catch (err) {
      toast('ลบถาวรไม่สำเร็จ: ' + err.message, 'error');
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


