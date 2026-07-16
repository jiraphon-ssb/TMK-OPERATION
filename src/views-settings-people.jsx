/* ============================================================
   views-settings-people.jsx — แท็บ "หน้าที่/ตำแหน่ง" + "ผู้ใช้/สิทธิ์" (PART 84 REFACTOR-1 · แยกจาก views-settings-tabs)
   ============================================================
   admin people-management (DutiesView + RolesView) · behavior-preserving file-split · re-export กลับที่ views-settings-tabs
   ============================================================ */
import { useState } from 'react';
import { TMK } from './data.js';
import { Icon, Avatar } from './components.jsx';
import { useData } from './dataContext.jsx';
import { supabase } from './lib/supabaseClient.js';
import { logAudit, diffFields } from './lib/audit.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { guardEdit, guardAdmin } from './saleWidgets.jsx';

/* ====================  DUTIES VIEW (หน้าที่/ตำแหน่ง)  ==================== */
export function DutiesView() {
  const { reload, refresh } = useData() || {};
  const PALETTE = ['#b07d33', '#0a5aa0', '#2f9e6e', '#4a8be0', '#6b5ce0', '#c08a3e', '#ee6a3a', '#cf4d5c'];
  const [editing, setEditing] = useState(null); // duty id
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [busy, setBusy] = useState(false);

  // New duty form
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [newDesc, setNewDesc] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const duties = TMK.duties || [];

  // นับผู้ใช้ในแต่ละหน้าที่
  const userCount = (dutyId) => (TMK.roles || []).filter(r => r.dutyId === dutyId).length;

  const startEdit = (d) => {
    setEditing(d.id);
    setEditName(d.name);
    setEditColor(d.color);
    setEditDesc(d.description || '');
  };

  const saveEdit = async () => {
    if (!guardEdit()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('tmk_duties').update({
        name: editName.trim(),
        color: editColor,
        description: editDesc.trim(),
      }).eq('id', editing);
      if (error) throw error;
      logAudit({ action: 'update', entityType: 'duty', entityName: editName.trim(), summary: `แก้ไขหน้าที่ "${editName.trim()}"` });
      if (refresh) await refresh(['tmk_duties', 'tmk_user_roles']); else if (reload) await reload();
      setEditing(null);
      if (window.__toast) window.__toast('อัปเดตหน้าที่เรียบร้อย', 'success');
    } catch (err) {
      if (window.__toast) window.__toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const deleteDuty = async (duty) => {
    if (!guardEdit()) return;
    const count = userCount(duty.id);
    if (count > 0) {
      if (window.__toast) window.__toast(`ลบไม่ได้ — ยังมีผู้ใช้ ${count} คนใช้หน้าที่นี้`, 'warn');
      return;
    }
    if (!await window.__confirm?.({ title: 'ลบหน้าที่', body: `ลบหน้าที่ "${duty.name}"?`, danger: true, confirmText: 'ลบ' })) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('tmk_duties').update({ deleted_at: new Date().toISOString() }).eq('id', duty.id);
      if (error) throw error;
      logAudit({ action: 'delete', entityType: 'duty', entityName: duty.name, summary: `ลบหน้าที่ "${duty.name}"` });
      if (refresh) await refresh(['tmk_duties', 'tmk_user_roles']); else if (reload) await reload();
      setEditing(null);
      if (window.__toast) window.__toast('ย้ายหน้าที่ไปถังขยะแล้ว', 'success', 6000, {
        label: 'เลิกทำ',
        onClick: async () => {
          try {
            await supabase.from('tmk_duties').update({ deleted_at: null }).eq('id', duty.id);
            if (refresh) await refresh(['tmk_duties', 'tmk_user_roles']); else if (reload) await reload();
            window.__toast?.('กู้คืนหน้าที่แล้ว', 'success');
          } catch (e) { window.__toast?.('กู้คืนไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
        },
      });
    } catch (err) {
      if (window.__toast) window.__toast('ลบไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const addDuty = async () => {
    if (!guardEdit()) return;
    const name = newName.trim();
    if (!name) return;
    if (duties.find(d => d.name === name)) {
      if (window.__toast) window.__toast('หน้าที่นี้มีอยู่แล้ว', 'warn');
      return;
    }
    setBusy(true);
    try {
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || ('d-' + Date.now());
      const maxOrder = Math.max(0, ...duties.map(d => d.sortOrder || 0));
      // upsert + deleted_at:null → ถ้าชื่อนี้เคยถูกลบ (soft-delete) จะกู้กลับมาแทนที่จะชน PK
      const { error } = await supabase.from('tmk_duties').upsert({
        id,
        name,
        color: newColor,
        description: newDesc.trim(),
        sort_order: maxOrder + 1,
        deleted_at: null,
      });
      if (error) throw error;
      logAudit({ action: 'create', entityType: 'duty', entityName: name, summary: `เพิ่มหน้าที่ "${name}"` });
      if (refresh) await refresh(['tmk_duties', 'tmk_user_roles']); else if (reload) await reload();
      setNewName(''); setNewColor(PALETTE[0]); setNewDesc(''); setShowAdd(false);
      if (window.__toast) window.__toast('เพิ่มหน้าที่เรียบร้อย', 'success');
    } catch (err) {
      if (window.__toast) window.__toast('เพิ่มไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <Card className="bg-primary/5 border-l-4 border-l-primary shadow-none">
        <CardContent className="p-5 flex gap-4 items-start">
          <Icon name="sparkle" className="size-6 text-primary mt-1" />
          <div>
            <h3 className="text-lg font-bold mb-1 text-foreground">หน้าที่ / ตำแหน่ง</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              จัดการรายการหน้าที่ที่ใช้มอบหมายงาน — แต่ละผู้ใช้จะมี 1 หน้าที่ และในการสร้าง task คุณเลือก "ผู้รับผิดชอบ" จากหน้าที่เหล่านี้
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50 bg-muted/20">
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon name="shield" className="size-5 text-muted-foreground" /> หน้าที่ทั้งหมด ({duties.length})
          </CardTitle>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Icon name="plus" className="size-4 mr-2" /> เพิ่มหน้าที่ใหม่
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex flex-col">
            {duties.length === 0 && (
              <div className="p-10 text-center text-muted-foreground">
                <p className="text-sm">ยังไม่มีหน้าที่ — กด "เพิ่มหน้าที่ใหม่" เพื่อเริ่ม</p>
              </div>
            )}
            {duties.map(d => {
              const count = userCount(d.id);

              return (
                <div key={d.id} className="flex items-center gap-3 p-4 border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <div className="size-4 rounded-sm shrink-0" style={{ background: d.color }}></div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-foreground text-sm">{d.name}</div>
                    {d.description && <div className="text-xs text-muted-foreground mt-0.5 truncate">{d.description}</div>}
                  </div>
                  <Badge variant="outline" className="font-semibold" style={{ background: d.color + '10', color: d.color, borderColor: d.color + '30' }}>
                    {count} คน
                  </Badge>
                  <Button variant="ghost" size="icon" onClick={() => startEdit(d)} title="แก้ไข">
                    <Icon name="pencil" className="size-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* เพิ่มหน้าที่ใหม่ Dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => {
        if (!open) {
          setShowAdd(false); setNewName(''); setNewColor(PALETTE[0]); setNewDesc('');
        }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="shield" className="size-5" /> เพิ่มหน้าที่ใหม่
            </DialogTitle>
            <DialogDescription>
              ใช้มอบหมายงานและจัดกลุ่มผู้รับผิดชอบ
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-6 py-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
              <div className="size-4 rounded-full shrink-0" style={{ background: newColor }}></div>
              <div className="font-semibold text-lg truncate flex-1">
                {newName.trim() || 'ชื่อหน้าที่'}
                {newDesc.trim() && <span className="text-sm font-normal text-muted-foreground ml-2">· {newDesc.trim()}</span>}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>ชื่อหน้าที่ <span className="text-destructive">*</span></Label>
              <Input autoFocus placeholder="เช่น Logistics, Customer Service" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newName.trim() && !busy) addDuty(); }} />
            </div>

            <div className="grid gap-2">
              <Label>สีประจำหน้าที่</Label>
              <div className="flex flex-wrap gap-2">
                {PALETTE.map(c => (
                  <button key={c} type="button" className={`size-8 rounded-full flex items-center justify-center transition-all ${newColor === c ? 'ring-2 ring-offset-2 ring-ring' : 'hover:scale-110'}`} 
                    onClick={() => setNewColor(c)} style={{ background: c }}>
                    {newColor === c && <Icon name="check" className="size-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>คำอธิบาย</Label>
              <Input placeholder="เช่น ทีมจัดส่งสินค้า / แพ็คของ" value={newDesc} onChange={e => setNewDesc(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newName.trim() && !busy) addDuty(); }} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} disabled={busy}>ยกเลิก</Button>
            <Button onClick={addDuty} disabled={!newName.trim() || busy}>
              {busy ? <Icon name="loader" className="mr-2 size-4 animate-spin" /> : <Icon name="check" className="mr-2 size-4" />}
              {busy ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* แก้ไขหน้าที่ Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-[425px]">
          {editing && (() => {
            const d = duties.find(x => x.id === editing);
            if (!d) return null;
            const count = userCount(d.id);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Icon name="shield" className="size-5" /> แก้ไขหน้าที่: {d.name}
                  </DialogTitle>
                </DialogHeader>
                
                <div className="grid gap-6 py-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                    <div className="size-4 rounded-full shrink-0" style={{ background: editColor }}></div>
                    <div className="font-semibold text-lg truncate flex-1">
                      {editName.trim() || 'ชื่อหน้าที่'}
                      {editDesc.trim() && <span className="text-sm font-normal text-muted-foreground ml-2">· {editDesc.trim()}</span>}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>ชื่อหน้าที่ <span className="text-destructive">*</span></Label>
                    <Input value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && editName.trim() && !busy) saveEdit(); }} />
                  </div>

                  <div className="grid gap-2">
                    <Label>สีประจำหน้าที่</Label>
                    <div className="flex flex-wrap gap-2">
                      {PALETTE.map(c => (
                        <button key={c} type="button" className={`size-8 rounded-full flex items-center justify-center transition-all ${editColor === c ? 'ring-2 ring-offset-2 ring-ring' : 'hover:scale-110'}`} 
                          onClick={() => setEditColor(c)} style={{ background: c }}>
                          {editColor === c && <Icon name="check" className="size-4 text-white" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>คำอธิบาย</Label>
                    <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && editName.trim() && !busy) saveEdit(); }} />
                  </div>
                </div>

                <DialogFooter className="flex-row sm:justify-between">
                  <Button variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteDuty(d)} disabled={busy}>
                    <Icon name="trash" className="mr-2 size-4" /> ลบ {count > 0 && `(${count} คน)`}
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

export function RolesView() {
  const { reload, refresh } = useData() || {};
  const roleMeta = {
    admin: { l: 'ผู้ดูแลระบบ', cls: 'chip-accent', icon: 'shield', d: 'จัดการได้ทุกอย่าง รวมถึงสิทธิ์ผู้ใช้' },
    editor: { l: 'แก้ไขได้', cls: 'chip-good', icon: 'pencil', d: 'บันทึกยอดขาย จัดการงาน แก้ไขข้อมูล' },
    viewer: { l: 'ดูอย่างเดียว', cls: '', icon: 'eye', d: 'เปิดดูข้อมูลได้ แต่แก้ไขไม่ได้' }
  };
  // หน้าที่ล็อกได้ต่อคน (deny-list) — หน้าหลัก/การแจ้งเตือนเข้าได้เสมอ · admin ไม่โดนล็อก
  // Sale มีหน้าย่อย → ล็อกทั้งหมด หรือเลือกล็อกเฉพาะหน้าย่อย (composite "catalog:<sub>") ได้
  const LOCK_SECTIONS = [
    { id: 'sales', label: 'ยอดขาย', icon: 'sales' },
    { id: 'flows', label: 'โครงการ', icon: 'grid' },
    { id: 'catalog', label: 'Sale', icon: 'box', subs: [
      { id: 'report', label: 'รายงานขาย' },
      { id: 'perf', label: 'ประสิทธิภาพเซลล์' },
      { id: 'orders', label: 'ออเดอร์' },
      { id: 'crm', label: 'ลูกค้า (CRM)' },
      { id: 'data', label: 'ส่งยอด & ข้อมูล' },
      { id: 'shirts', label: 'สินค้า' },
    ] },
    { id: 'logs', label: 'บันทึกกิจกรรม', icon: 'clock' },
    { id: 'settings', label: 'ตั้งค่า', icon: 'system' },
  ];
  // กลุ่มชิปเลือกหน้าที่จะล็อก — ใช้ทั้ง modal แก้ไข + dialog เพิ่มผู้ใช้ (admin = ซ่อน เข้าได้ทุกหน้า)
  const LockPicker = ({ role, locks, setLocks }) => role === 'admin' ? null : (
    <div className="grid gap-2">
      <Label>การเข้าถึงหน้า <span className="text-xs font-normal text-muted-foreground">(ติ๊ก = ล็อกไม่ให้เข้า)</span></Label>
      <div className="flex flex-col gap-2">
        {LOCK_SECTIONS.map(s => { const on = locks.includes(s.id); return (
          <div key={s.id} className="flex flex-col gap-1.5">
            <button type="button" onClick={() => setLocks(on ? locks.filter(x => x !== s.id) : [...locks, s.id])}
              className={`w-fit flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-colors ${on ? 'bg-destructive/10 border-destructive/40 text-destructive font-medium' : 'bg-background hover:bg-muted'}`}>
              <Icon name={on ? 'lock' : s.icon} className="size-3.5" />{s.label}
            </button>
            {/* หน้าย่อย — เลือกล็อกเฉพาะบางหน้าได้ · ล็อกทั้ง Sale แล้ว = ล็อกหมด (จาง กดไม่ได้) */}
            {s.subs && (
              <div className="flex flex-wrap gap-1.5 pl-4">
                {s.subs.map(sub => { const key = `${s.id}:${sub.id}`; const subOn = on || locks.includes(key); return (
                  <button key={key} type="button" disabled={on}
                    onClick={() => setLocks(locks.includes(key) ? locks.filter(x => x !== key) : [...locks, key])}
                    className={`flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-full border transition-colors ${on ? 'opacity-40 cursor-not-allowed border-dashed' : subOn ? 'bg-destructive/10 border-destructive/40 text-destructive font-medium' : 'bg-background hover:bg-muted'}`}>
                    <Icon name={subOn ? 'lock' : 'chevR'} className="size-3" />{sub.label}
                  </button>
                ); })}
              </div>
            )}
          </div>
        ); })}
      </div>
      <p className="text-xs text-muted-foreground">หน้าที่ล็อกจะโชว์จาง + กุญแจในเมนู กดแล้วแจ้งไม่มีสิทธิ์ · ล็อก “Sale” ทั้งหมด หรือเลือกเฉพาะหน้าย่อยได้ · หน้าหลัก/การแจ้งเตือนเข้าได้เสมอ</p>
    </div>
  );
  // หน้าที่ — ดึงจาก tmk_duties (Supabase) — เพิ่ม/แก้/ลบได้ใน tab "หน้าที่"
  const DUTIES = TMK.duties || [];

  // dropdown ย่อ (แทนชิปเยอะๆ) — ใช้ร่วมทั้ง add + edit · Radix Select ห้าม value="" → ใช้ '__none__'
  const DutySelect = ({ value, onChange }) => (
    <Select value={value || '__none__'} onValueChange={(v) => onChange(v === '__none__' ? '' : v)}>
      <SelectTrigger className="bg-background"><SelectValue placeholder="— ไม่ระบุ —" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— ไม่ระบุ —</SelectItem>
        {DUTIES.map(d => (
          <SelectItem key={d.id} value={d.id}>
            <span className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: d.color }} />{d.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const RoleSelect = ({ value, onChange }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
      <SelectContent>
        {Object.entries(roleMeta).map(([k, v]) => (
          <SelectItem key={k} value={k}>
            <span className="flex items-center gap-2"><Icon name={v.icon} className="size-4" />{v.l}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  // ใช้ TMK.roles + TMK.staff โดยตรง (re-render เมื่อ Supabase อัปเดต)
  const users = (TMK.roles || []).map(r => {
    const s = (TMK.staff || []).find(st => st.email === r.email);
    return {
      ...r,
      department: r.department || s?.role || '',
      color: r.color || s?.color || '#3b82f6',
      avatar: r.avatarUrl || s?.avatarUrl || '',
    };
  });

  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('viewer');
  const [editDutyId, setEditDutyId] = useState('');
  const [editLocks, setEditLocks] = useState([]); // หน้าที่ล็อกของ user ที่กำลังแก้
  const [busy, setBusy] = useState(false);
  // ตั้ง/รีเซ็ตรหัสผ่านเข้าระบบ (แอดมินเท่านั้น)
  const [pwInput, setPwInput] = useState('');
  const [pwShow, setPwShow] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  // New user form
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('editor');
  const [newDutyId, setNewDutyId] = useState(DUTIES[0]?.id || '');
  const [newLocks, setNewLocks] = useState([]);

  const startEdit = (u) => {
    setEditing(u.email);
    setEditName(u.name);
    setEditRole(u.role);
    setEditDutyId(u.dutyId || '');
    setEditLocks(Array.isArray(u.lockedSections) ? u.lockedSections : []);
    setPwInput(''); setPwShow(false);
  };

  // สุ่มรหัสผ่านชั่วคราวให้แอดมินส่งต่อ
  const genPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let s = '';
    const arr = new Uint32Array(12);
    (window.crypto || window.msCrypto).getRandomValues(arr);
    for (let i = 0; i < 12; i++) s += chars[arr[i] % chars.length];
    setPwInput(s); setPwShow(true);
  };

  // ตั้ง/รีเซ็ตรหัสผ่านเข้าระบบของ user (ผ่าน RPC tmk_admin_set_password — enforce admin ที่ DB)
  const resetPassword = async (email) => {
    if (!guardAdmin()) return;
    if (pwInput.length < 6) { if (window.__toast) window.__toast('รหัสผ่านอย่างน้อย 6 ตัวอักษร', 'error'); return; }
    setPwBusy(true);
    try {
      const { data, error } = await supabase.rpc('tmk_admin_set_password', { p_email: email, p_password: pwInput });
      if (error) throw error;
      if (!data?.ok) {
        const m = { forbidden: 'เฉพาะแอดมินเท่านั้น', too_short: 'รหัสผ่านอย่างน้อย 6 ตัวอักษร', not_found: 'ยังไม่มีบัญชีเข้าระบบของอีเมลนี้ — สร้างใน Supabase Dashboard ก่อน' }[data?.error] || ('ตั้งรหัสไม่สำเร็จ' + (data?.error ? ': ' + data.error : ''));
        if (window.__toast) window.__toast(m, 'error');
        return;
      }
      logAudit({ action: 'update', entityType: 'user', entityName: email, summary: `รีเซ็ตรหัสผ่าน ${email}` }); // ไม่ log ตัวรหัส
      if (window.__toast) window.__toast(`ตั้งรหัสผ่านให้ ${email} แล้ว — ส่งรหัสนี้ให้ผู้ใช้`, 'success');
      setPwInput(''); setPwShow(false);
    } catch (err) {
      if (window.__toast) window.__toast('ตั้งรหัสไม่สำเร็จ: ' + (err.message || ''), 'error');
    } finally {
      setPwBusy(false);
    }
  };

  // Save edit ลง Supabase จริง — defensive: ลอง column ใหม่ก่อน → fallback
  const saveEdit = async () => {
    if (!guardAdmin()) return;
    setBusy(true);
    try {
      const duty = DUTIES.find(d => d.id === editDutyId);

      // === 1. Update tmk_user_roles ===
      // ลองรวม duty_id + locked_sections ก่อน (ถ้า migration รันแล้ว)
      const rolePayload = {
        email: editing,
        role: editRole,
        name: editName,
        department: duty?.name || '',
        duty_id: editDutyId || null,
        locked_sections: editRole === 'admin' ? [] : editLocks, // admin ไม่โดนล็อกเสมอ (20260702 · graceful)
      };
      let { error: e1 } = await supabase.from('tmk_user_roles').upsert(rolePayload);
      // คอลัมน์ locked_sections ยังไม่ migrate → ตัดออกแล้วลองใหม่ (คง name/duty ไว้)
      if (e1 && /locked_sections/i.test(e1.message || '')) {
        delete rolePayload.locked_sections;
        ({ error: e1 } = await supabase.from('tmk_user_roles').upsert(rolePayload));
      }
      // ถ้า column ไม่มี (duty_id หรืออื่น) → ลองแบบไม่มี
      if (e1 && /column .* does not exist/i.test(e1.message)) {
        console.warn('Falling back: duty_id column missing', e1.message);
        const { error: e1b } = await supabase.from('tmk_user_roles').upsert({
          email: editing,
          role: editRole,
        });
        if (e1b) throw e1b;
      } else if (e1) throw e1;

      // === 2. Update tmk_staff (รูป + ชื่อ + สี) ===
      const existingStaff = (TMK.staff || []).find(s => s.email === editing);
      const staffId = existingStaff?.id || ('s-' + editing.replace(/[^a-z0-9]/gi, '').toLowerCase());
      const { error: e2 } = await supabase.from('tmk_staff').upsert({
        id: staffId,
        name: editName,
        role: duty?.name || existingStaff?.role || 'Staff',
        email: editing,
        color: duty?.color || existingStaff?.color || '#3b82f6',
      });
      if (e2) {
        // log แต่ไม่ throw — let user_roles save succeed
        console.error('tmk_staff upsert failed:', e2);
        if (window.__toast) window.__toast('บันทึกรูป/ชื่อใน staff ไม่สำเร็จ: ' + e2.message, 'warn');
      }

      // before→after สิทธิ์ (security-critical) — role + หน้าที่ล็อก
      const before = users.find(x => x.email === editing) || {};
      const lockLabel = (arr) => (Array.isArray(arr) && arr.length ? `${arr.length} หน้า (${arr.join(', ')})` : 'ไม่ล็อก');
      const roleChanges = diffFields(
        { role: before.role, locks: before.lockedSections || [] },
        { role: editRole, locks: editRole === 'admin' ? [] : editLocks },
        [['role', 'สิทธิ์'], { key: 'locks', label: 'หน้าที่ล็อก', fmt: lockLabel }],
      );
      logAudit({
        action: 'update', entityType: 'user', entityName: editing,
        severity: roleChanges.some(c => c.label === 'สิทธิ์') ? 'warn' : undefined, // เปลี่ยน role = สำคัญ
        summary: `แก้ไขผู้ใช้ ${editName} (${editing})`,
        changes: roleChanges.length ? roleChanges : null,
      });

      // === 3. Force reload data (in case realtime doesn't fire) ===
      if (refresh) await refresh(['tmk_user_roles', 'tmk_staff']); else if (reload) await reload();

      setEditing(null);
      if (window.__toast) window.__toast('อัปเดตผู้ใช้เรียบร้อย', 'success');
    } catch (err) {
      console.error(err);
      if (window.__toast) window.__toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const cancelEdit = () => { setEditing(null); setPwInput(''); setPwShow(false); };

  // Delete user ลบจาก Supabase
  const deleteUser = async (email) => {
    if (!guardAdmin()) return;
    if (!await window.__confirm?.({ title: 'ลบผู้ใช้', body: `ลบผู้ใช้ ${email}?`, danger: true, confirmText: 'ลบ' })) return;
    setBusy(true);
    try {
      const ts = new Date().toISOString();
      const { error: er1 } = await supabase.from('tmk_user_roles').update({ deleted_at: ts }).eq('email', email);
      if (er1) throw er1;
      await supabase.from('tmk_staff').update({ deleted_at: ts }).eq('email', email);
      logAudit({ action: 'delete', entityType: 'user', entityName: email, summary: `ลบผู้ใช้ ${email}` });
      if (refresh) await refresh(['tmk_user_roles', 'tmk_staff']); else if (reload) await reload();
      setEditing(null);
      if (window.__toast) window.__toast('ย้ายผู้ใช้ไปถังขยะแล้ว', 'success', 6000, {
        label: 'เลิกทำ',
        onClick: async () => {
          if (!guardAdmin()) return;
          try {
            await supabase.from('tmk_user_roles').update({ deleted_at: null }).eq('email', email);
            await supabase.from('tmk_staff').update({ deleted_at: null }).eq('email', email);
            logAudit({ action: 'restore', entityType: 'user', entityName: email, summary: `กู้คืนผู้ใช้ ${email}` });
            if (refresh) await refresh(['tmk_user_roles', 'tmk_staff']); else if (reload) await reload();
            window.__toast?.('กู้คืนผู้ใช้แล้ว', 'success');
          } catch (e) { window.__toast?.('กู้คืนไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
        },
      });
    } catch (err) {
      if (window.__toast) window.__toast('ลบไม่สำเร็จ: ' + err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // Add user ลง Supabase จริง
  const addUser = async () => {
    if (!guardAdmin()) return;
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if (window.__toast) window.__toast('รูปแบบอีเมลไม่ถูกต้อง', 'error'); return; }
    if (users.find(u => u.email === email)) {
      if (window.__toast) window.__toast('อีเมลนี้มีอยู่แล้ว', 'warn');
      return;
    }
    setBusy(true);
    try {
      const name = newName.trim() || email.split('@')[0];
      const duty = DUTIES.find(d => d.id === newDutyId);
      const dutyColor = duty?.color || '#3b82f6';

      // 1. Upsert tmk_user_roles (+ deleted_at:null → กู้คืนถ้าเคยลบ แทน error PK)
      const rolePayload = {
        email,
        role: newRole,
        name,
        department: duty?.name || '',
        duty_id: newDutyId || null,
        color: dutyColor,
        created_by: 'system',
        deleted_at: null,
        locked_sections: newRole === 'admin' ? [] : newLocks, // admin ไม่โดนล็อกเสมอ (20260702 · graceful)
      };
      let { error: e1 } = await supabase.from('tmk_user_roles').upsert(rolePayload);
      // คอลัมน์ locked_sections ยังไม่ migrate → ตัดออกแล้วลองใหม่
      if (e1 && /locked_sections/i.test(e1.message || '')) {
        delete rolePayload.locked_sections;
        ({ error: e1 } = await supabase.from('tmk_user_roles').upsert(rolePayload));
      }
      if (e1) throw e1;

      // 2. Upsert tmk_staff (+ deleted_at:null)
      const staffId = 's-' + email.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const { error: e2 } = await supabase.from('tmk_staff').upsert({
        id: staffId,
        name,
        role: duty?.name || 'Staff',
        email,
        color: dutyColor,
        deleted_at: null,
      });
      if (e2) throw e2;

      logAudit({ action: 'create', entityType: 'user', entityName: email, summary: `เพิ่มผู้ใช้ ${name} (${email})` });
      setNewEmail(''); setNewName(''); setNewRole('editor'); setNewDutyId(DUTIES[0]?.id || ''); setNewLocks([]); setShowAdd(false);
      if (refresh) await refresh(['tmk_user_roles', 'tmk_staff']); else if (reload) await reload();
      if (window.__toast) window.__toast('เพิ่มผู้ใช้เรียบร้อย', 'success');
    } catch (err) {
      console.error(err);
      if (window.__toast) window.__toast('เพิ่มไม่สำเร็จ: ' + err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // นับ tasks ที่ user รับผิดชอบ — match by name หรือ duty
  const taskCount = (name, dutyName) => (TMK.tasks || []).filter(t => {
    const resp = Array.isArray(t.responsible) ? t.responsible : String(t.responsible || '').split(',').map(s => s.trim());
    return resp.includes(name) || (dutyName && resp.includes(dutyName));
  }).length;

  const closeAdd = () => { setShowAdd(false); setNewEmail(''); setNewName(''); setNewRole('editor'); setNewDutyId(DUTIES[0]?.id || ''); setNewLocks([]); };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50 bg-muted/20">
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon name="shield" className="size-5 text-primary" /> สิทธิ์ผู้ใช้ ({users.length})
          </CardTitle>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Icon name="userPlus" className="size-4 mr-2" /> เพิ่มผู้ใช้ใหม่
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          <div className="flex flex-col">
            {users.map(u => {
              const tasks = taskCount(u.name, u.department);
              const meta = roleMeta[u.role] || { l: u.role, cls: '' };
              
              return (
                <div key={u.email} className="flex flex-wrap items-center gap-4 p-4 border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <Avatar name={u.name} color={u.color || '#888'} size={40} />
                  <div className="flex-1 min-w-[150px]">
                    <div className="font-bold text-foreground text-sm truncate">{u.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">{u.email}</div>
                  </div>
                  
                  <div className="flex items-center justify-end gap-3 flex-wrap ml-auto">
                    {u.department && (
                      <Badge variant="outline" className="font-semibold" style={{ background: (u.color || '#666') + '10', color: u.color || '#666', borderColor: (u.color || '#666') + '30' }}>
                        {u.department}
                      </Badge>
                    )}
                    {tasks > 0 && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{tasks} งาน</span>
                    )}
                    {(u.lockedSections || []).length > 0 && (
                      <Badge variant="outline" className="whitespace-nowrap text-muted-foreground gap-1"><Icon name="lock" className="size-3" />ล็อก {u.lockedSections.length} หน้า</Badge>
                    )}
                    <Badge variant="outline" className={`whitespace-nowrap ${meta.cls === 'chip-good' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : meta.cls === 'chip-accent' ? 'bg-primary/10 text-primary border-primary/20' : ''}`}>
                      {meta.l}
                    </Badge>
                    <Button variant="ghost" size="icon" onClick={() => startEdit(u)} title="แก้ไข" className="shrink-0">
                      <Icon name="pencil" className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* เพิ่มผู้ใช้ใหม่ Dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) closeAdd(); }}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="userPlus" className="size-5" /> เพิ่มผู้ใช้ใหม่
            </DialogTitle>
            <DialogDescription className="sr-only">เพิ่มสมาชิกใหม่เข้าทีม</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-3 max-h-[70vh] overflow-y-auto px-1">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>อีเมล <span className="text-destructive">*</span></Label>
                <Input type="email" placeholder="name@tmk.co" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>ชื่อที่แสดง</Label>
                <Input placeholder="เว้นว่าง = ใช้ชื่อหน้าอีเมล" value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>หน้าที่ / แผนก</Label>
                <DutySelect value={newDutyId} onChange={setNewDutyId} />
              </div>
              <div className="grid gap-1.5">
                <Label>สิทธิ์การเข้าถึง</Label>
                <RoleSelect value={newRole} onChange={(v) => { setNewRole(v); if (v === 'admin') setNewLocks([]); }} />
              </div>
            </div>

            <LockPicker role={newRole} locks={newLocks} setLocks={setNewLocks} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeAdd} disabled={busy}>ยกเลิก</Button>
            <Button onClick={addUser} disabled={!newEmail.trim() || busy}>
              {busy ? <Icon name="loader" className="mr-2 size-4 animate-spin" /> : <Icon name="userPlus" className="mr-2 size-4" />}
              {busy ? 'กำลังบันทึก…' : 'เพิ่มผู้ใช้'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* แก้ไขผู้ใช้ Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) cancelEdit(); }}>
        <DialogContent className="sm:max-w-[640px]">
          {editing && (() => {
            const u = users.find(x => x.email === editing);
            if (!u) return null;
            const tasks = taskCount(u.name, u.department);
            
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Icon name="pencil" className="size-5" /> แก้ไขผู้ใช้
                  </DialogTitle>
                  <DialogDescription className="truncate">
                    {u.email}
                  </DialogDescription>
                </DialogHeader>
                
                <div className="grid gap-4 py-3 max-h-[72vh] overflow-y-auto px-1">
                  <div className="flex gap-4 items-end">
                    <Avatar name={u.name} color={u.color || 'var(--ink-3)'} size={52} />
                    <div className="grid gap-1.5 flex-1">
                      <Label>ชื่อที่แสดง <span className="text-xs font-normal text-muted-foreground">(ลิงก์กับงาน)</span></Label>
                      <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="ชื่อที่ใช้แสดงในระบบ" className="font-semibold" />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="grid gap-1.5">
                      <Label>หน้าที่ / แผนก</Label>
                      <DutySelect value={editDutyId} onChange={setEditDutyId} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>สิทธิ์การเข้าถึง</Label>
                      <RoleSelect value={editRole} onChange={(v) => { setEditRole(v); if (v === 'admin') setEditLocks([]); }} />
                    </div>
                  </div>

                  <LockPicker role={editRole} locks={editLocks} setLocks={setEditLocks} />

                  {tasks > 0 && (
                    <div className="text-xs text-primary flex items-center gap-2 bg-primary/10 px-2.5 py-1.5 rounded">
                      <Icon name="listChecks" className="size-4 shrink-0" /> เปลี่ยนชื่อจะอัปเดตใน {tasks} งานที่เกี่ยวข้อง
                    </div>
                  )}

                  <div className="grid gap-1.5 pt-3 border-t border-dashed">
                    <Label>รหัสผ่านเข้าระบบ</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input type={pwShow ? 'text' : 'password'} value={pwInput} onChange={e => setPwInput(e.target.value)} placeholder="ตั้งรหัสใหม่ (อย่างน้อย 6 ตัว)" autoComplete="new-password" className="pr-10" />
                        <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full w-10 text-muted-foreground hover:text-foreground" onClick={() => setPwShow(!pwShow)}>
                          <Icon name="eye" className="size-4" />
                        </Button>
                      </div>
                      <Button type="button" variant="outline" size="icon" onClick={genPassword} disabled={pwBusy} title="สุ่มรหัส">
                        <Icon name="sparkle" className="size-4 text-primary" />
                      </Button>
                      <Button type="button" onClick={() => resetPassword(u.email)} disabled={pwBusy || pwInput.length < 6}>
                        {pwBusy ? 'กำลังตั้ง...' : 'ตั้งรหัส'}
                      </Button>
                    </div>
                  </div>
                </div>

                <DialogFooter className="flex-row sm:justify-between pt-2">
                  <Button variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteUser(u.email)} disabled={busy}>
                    <Icon name="trash" className="mr-2 size-4" /> ลบ
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={cancelEdit} disabled={busy}>ยกเลิก</Button>
                    <Button onClick={saveEdit} disabled={!editName.trim() || busy}>
                      {busy ? <Icon name="loader" className="mr-2 size-4 animate-spin" /> : <Icon name="check" className="mr-2 size-4" />}
                      {busy ? 'กำลังบันทึก...' : 'บันทึก'}
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
