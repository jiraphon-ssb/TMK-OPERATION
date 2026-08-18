/* ============================================================
   flowHistory.jsx — ประวัติกิจกรรมต่อโครงการ (แยกจาก views-flows.jsx)
   - FlowHistoryView + ตารางแปลชื่อ action/entity ยกมาทั้งดุ้น ไม่แก้เนื้อใน
   ============================================================ */
import { useState, useEffect } from 'react';
import { TMK } from './data.js';
import { supabase } from './lib/supabaseClient.js';
import { Icon, Avatar, SkelTable } from './components.jsx';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from './components/EmptyState.jsx';

/* ============================================================
   ประวัติกิจกรรมต่อโครงการ (per-flow activity history)
   - วิวที่ 6 ในบอร์ด + แท็บใน FlowSettingsPage (compact)
   - กรองจาก tmk_audit_logs ด้วย flow_id = scopeKey (general='' · real=id)
   - graceful: คอลัมน์ flow_id ยังไม่ migrate → fallback ilike บน details ("flowId":"…")
   ============================================================ */
const AUDIT_ACTION_META = {
  create: { l: 'สร้าง', c: '#16a34a' }, update: { l: 'แก้ไข', c: '#2563eb' },
  delete: { l: 'ลบ', c: '#dc2626' }, purge: { l: 'ลบถาวร', c: '#dc2626' },
  restore: { l: 'กู้คืน', c: '#16a34a' }, move: { l: 'ย้าย', c: '#7c3aed' }, export: { l: 'ส่งออก', c: '#0891b2' },
};
const AUDIT_ENTITY_TH = { task: 'งาน', flow: 'โครงการ', campaign: 'แคมเปญ', brand: 'แบรนด์', comment: 'คอมเมนต์' };

export function FlowHistoryView({ flow, compact = false }) {
  const PAGE = compact ? 20 : 40;
  const scopeKey = flow?.scopeId ?? flow?.id ?? '';
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- reset หน้าเมื่อสลับโครงการ (sync จาก props · รื้อเป็น derived เสี่ยงกว่าประโยชน์)
  useEffect(() => { setPage(0); }, [scopeKey]);

  useEffect(() => {
    let cancel = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag ก่อน async fetch
    setLoading(true);
    (async () => {
      const sel = () => supabase.from('tmk_audit_logs').select('*', { count: 'exact' })
        .order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
      let { data, count, error } = await sel().eq('flow_id', scopeKey);
      // graceful: ยังไม่ได้รัน 20260718-audit-flow.sql (คอลัมน์ flow_id หาย) → กรองจาก details JSON
      if (error && /flow_id|column|42703|does not exist/i.test(error.message || error.code || '')) {
        ({ data, count, error } = await sel().ilike('details', `%"flowId":"${scopeKey}"%`));
      }
      if (cancel) return;
      if (error) { setRows([]); setTotal(0); } else { setRows(data || []); setTotal(count || 0); }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [scopeKey, page, PAGE]);

  const mapped = rows.map(r => {
    let d = {};
    try { d = typeof r.details === 'string' ? JSON.parse(r.details) : (r.details || {}); } catch { /* ignore */ }
    return {
      action: r.action || '', entity: d.entityType || '', user: r.user_email || 'system',
      name: d.entityName || '', summary: d.summary || r.action || '',
      changes: Array.isArray(d.changes) ? d.changes : null,
      fields: Array.isArray(d.fields) ? d.fields : null,
      time: new Date(r.created_at).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }),
    };
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE));

  const Body = (
    <div className="flex flex-col divide-y divide-border/50">
      {loading && <div className="p-4"><SkelTable cols={4} rows={compact ? 6 : 10} /></div>}
      {!loading && mapped.length === 0 && (
        <EmptyState className="m-4" icon="clock" title="ยังไม่มีประวัติของโครงการนี้" hint="สร้าง/แก้ไข/ย้าย/ลบงานในโครงการนี้ จะถูกบันทึกไว้ที่นี่" />
      )}
      {!loading && mapped.map((a, i) => {
        const s = (TMK.staff || []).find(x => x.name === a.user || x.email === a.user) || { color: '#888' };
        const m = AUDIT_ACTION_META[a.action] || { l: a.action, c: '#64748b' };
        return (
          <div key={i} className="flex gap-3 p-3.5 hover:bg-muted/20 transition-colors">
            <div className="shrink-0 mt-0.5"><Avatar name={a.user} color={s.color} size={32} /></div>
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-foreground text-sm">{(a.user || '').split('@')[0]}</span>
                <span className="text-muted-foreground text-xs font-medium">· {AUDIT_ENTITY_TH[a.entity] || a.entity}</span>
              </div>
              <div className="text-sm text-foreground/90">{a.summary}</div>
              {a.changes && a.changes.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {a.changes.map((c, j) => (
                    <Badge key={j} variant="secondary" className="text-xs font-normal bg-muted/50">
                      <span className="opacity-70 mr-1">{c.label}:</span>
                      <span className="line-through opacity-50 mr-1">{c.from}</span>
                      <span className="text-muted-foreground text-[10px] mx-0.5">→</span>
                      <span className="text-primary font-semibold ml-1">{c.to}</span>
                    </Badge>
                  ))}
                </div>
              )}
              {a.fields && a.fields.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {a.fields.map((fld, j) => (
                    <Badge key={j} variant="secondary" className="text-xs font-normal bg-muted/50">
                      <span className="opacity-70 mr-1">{fld.label}:</span>
                      <span className="font-semibold text-foreground/90">{fld.value}</span>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <Badge variant="outline" className="font-medium shrink-0" style={{ background: m.c + '15', color: m.c, borderColor: m.c + '30' }}>{m.l}</Badge>
              <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{a.time}</span>
            </div>
          </div>
        );
      })}
    </div>
  );

  const Pager = total > PAGE && (
    <div className="flex items-center justify-center gap-4 p-3 border-t border-border/50 bg-muted/10">
      <Button variant="outline" size="sm" disabled={page <= 0 || loading} onClick={() => setPage(p => Math.max(0, p - 1))}><Icon name="chevL" className="size-4 mr-1" /> ก่อนหน้า</Button>
      <span className="text-sm text-muted-foreground font-medium tabular-nums">หน้า {page + 1} <span className="opacity-50">/</span> {totalPages}</span>
      <Button variant="outline" size="sm" disabled={page >= totalPages - 1 || loading} onClick={() => setPage(p => p + 1)}>ถัดไป <Icon name="chevR" className="size-4 ml-1" /></Button>
    </div>
  );

  // compact = แท็บในตั้งค่า (ไม่มี Card chrome ใหญ่)
  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon name="clock" className="size-4" /> ประวัติกิจกรรมของโครงการนี้ <span className="font-semibold tabular-nums">({total})</span>
        </div>
        <div className="rounded-lg border overflow-hidden">{Body}{Pager}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-4xl w-full mx-auto">
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/50 bg-muted/20">
            <div className="flex items-center gap-2 font-semibold">
              <Icon name="clock" className="size-5 text-primary" /> ประวัติกิจกรรม
              <span className="text-sm text-muted-foreground font-normal">({total})</span>
            </div>
            <span className="text-xs text-muted-foreground">เฉพาะโครงการ "{flow?.name}"</span>
          </div>
          {Body}{Pager}
        </CardContent>
      </Card>
    </div>
  );
}
