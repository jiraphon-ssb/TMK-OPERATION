/* ============================================================
   views-settings-catalog.jsx — แท็บ "แบรนด์" + "ช่องทางการขาย" (PART 84 REFACTOR-1 · แยกจาก views-settings-tabs)
   ============================================================
   catalog config (BrandsView + ChannelsView · CRUD+logo+color+reorder) · behavior-preserving · re-export กลับ
   ============================================================ */
import { useState } from 'react';
import { TMK } from './data.js';
import { Icon, ColorPicker } from './components.jsx';
import { useData } from './dataContext.jsx';
import { supabase } from './lib/supabaseClient.js';
import { logAudit } from './lib/audit.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox as ShadcnCheckbox } from '@/components/ui/checkbox';
import { guardEdit } from './saleWidgets.jsx';

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
