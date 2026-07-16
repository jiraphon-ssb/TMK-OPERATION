/* ============================================================
   ConflictMergeHost — Phase 3.5 (realtime scale §9.1): เลือกค่ารายช่องเมื่อ merge ชน
   - mount ที่ App root · เปิดผ่าน window.__resolveConflict({entity, conflicts}) → Promise<null | {field:'mine'|'theirs'}>
   - แสดงเฉพาะ critical field ที่ชนจริง (auto-merge ช่องอื่นไปแล้ว) · default = ค่าของเรา
   - "โหลดล่าสุด" → resolve(null) = ทิ้งที่แก้ · "บันทึกตามที่เลือก" → resolve(picks)
   ============================================================ */
import { useState, useRef, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { fieldLabelTH } from './lib/optimisticUpdate.js';

// แสดงค่าให้อ่านง่าย (ว่าง/ยาว)
function fmtVal(v) {
  if (v == null || v === '') return '(ว่าง)';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '(ว่าง)';
  const s = String(v);
  return s.length > 80 ? s.slice(0, 80) + '…' : s;
}

export function ConflictMergeHost() {
  const [state, setState] = useState(null); // { entity, conflicts }
  const [picks, setPicks] = useState({});
  const resolver = useRef(null);

  useEffect(() => {
    window.__resolveConflict = ({ entity, conflicts } = {}) => new Promise((resolve) => {
      resolver.current = resolve;
      setPicks(Object.fromEntries((conflicts || []).map(c => [c.field, 'mine']))); // default = ของเรา
      setState({ entity: entity || 'ข้อมูลนี้', conflicts: conflicts || [] });
    });
    return () => { if (window.__resolveConflict) delete window.__resolveConflict; };
  }, []);

  const finish = (val) => { setState(null); const r = resolver.current; resolver.current = null; r?.(val); };

  const conflicts = state?.conflicts || [];
  return (
    <Dialog open={!!state} onOpenChange={(o) => { if (!o) finish(null); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>รวมการแก้ไข{state?.entity} — มีช่องที่ชนกัน</DialogTitle>
          <DialogDescription>
            คนอื่นแก้{state?.entity}นี้พร้อมคุณ · ช่องอื่นรวมให้อัตโนมัติแล้ว เหลือช่องสำคัญด้านล่างให้เลือกว่าจะเก็บค่าไหน
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1 max-h-[52vh] overflow-y-auto">
          {conflicts.map((c) => {
            const sel = picks[c.field] || 'mine';
            return (
              <div key={c.field} className="rounded-lg border p-3">
                <div className="text-[12px] font-semibold text-muted-foreground mb-2">{fieldLabelTH(c.field)}</div>
                <div className="grid grid-cols-2 gap-2">
                  {[['mine', 'ของคุณ', c.mine], ['theirs', 'ของคนอื่น', c.theirs]].map(([key, label, val]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPicks(p => ({ ...p, [c.field]: key }))}
                      className={
                        'text-left rounded-md border px-3 py-2 transition ' +
                        (sel === key
                          ? 'border-primary ring-1 ring-primary bg-primary/5'
                          : 'border-border hover:bg-muted/50')
                      }
                    >
                      <div className="text-[11px] text-muted-foreground">{label}</div>
                      <div className="text-[13px] font-medium break-words">{fmtVal(val)}</div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => finish(null)}>โหลดล่าสุด (ทิ้งที่แก้)</Button>
          <Button onClick={() => finish(picks)}>บันทึกตามที่เลือก</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
