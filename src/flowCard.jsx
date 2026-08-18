/* ============================================================
   flowCard.jsx — การ์ดโครงการในหน้ารวม (แยกจาก views-flows.jsx)
   - FlowCard ยกมาทั้งดุ้น ไม่แก้เนื้อใน · รับ flow/tasks/onOpen/onSettings เป็น props เหมือนเดิม
   ============================================================ */
import { TMK } from './data.js';
import { Icon, Avatar, FlowIcon } from './components.jsx';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { doneSetOf, flowBrands } from './flowsShared.js';

/* ---- การ์ดโครงการ ---- */
export function FlowCard({ flow, tasks, onOpen, onSettings }) {
  const doneSet = doneSetOf(flow);
  const total = tasks.length;
  const done = tasks.filter(t => doneSet.has(t.status)).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const brands = flowBrands(flow);
  const members = (flow.members || []).slice(0, 4);
  const color = flow.color || '#64748b';
  return (
    <Card className="flex flex-col overflow-hidden hover:shadow-md transition-shadow pt-0 gap-0">
      {/* ปก: รูปแนวนอน หรือ แถบสีโครงการ + ชื่อ (กดเปิดบอร์ด) */}
      <button type="button" onClick={onOpen} title={flow.name}
        className="relative block w-full aspect-[16/7] overflow-hidden text-left group">
        {flow.coverUrl
          ? <img src={flow.coverUrl} alt="" className="absolute inset-0 size-full object-cover transition-transform group-hover:scale-[1.03]" />
          : <span className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}cc 60%, ${color}99 100%)` }} />}
        <span className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
        <span className="absolute left-3 bottom-2.5 right-3 flex items-center gap-2 text-white">
          <FlowIcon icon={flow.icon} className="size-5 shrink-0 drop-shadow" />
          <span className="font-bold text-[15px] leading-snug line-clamp-2 drop-shadow">{flow.name}</span>
        </span>
      </button>
      <CardContent className="p-4 flex-1 flex flex-col gap-3" style={{ borderTop: `3px solid ${color}` }}>
        <div className="flex items-center gap-1.5 flex-wrap min-h-5">
          {brands.map(b => <Badge key={b.id} variant="outline" className="gap-1 text-[11px]"><span className="size-2 rounded-full" style={{ background: b.color }} />{b.name}</Badge>)}
          {flow.visibility === 'private' && <Badge variant="secondary" className="gap-1 text-[11px]"><Icon name="shield" className="size-3" /> ส่วนตัว</Badge>}
          {flow.shareEnabled && <Badge variant="secondary" className="gap-1 text-[11px]"><Icon name="layers" className="size-3" /> แชร์อยู่</Badge>}
          {flow.isGeneral && <Badge variant="secondary" className="text-[11px]">ทั่วไป</Badge>}
          {brands.length === 0 && !flow.isGeneral && flow.visibility !== 'private' && !flow.shareEnabled && <span className="text-[11px] text-muted-foreground/50">ยังไม่มีแบรนด์</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground"><Icon name="listChecks" className="size-3.5" />ความคืบหน้า</span>
            <span className="font-semibold tabular-nums">{total ? <>{done}/{total} <span className="text-muted-foreground font-normal">({pct}%)</span></> : <span className="text-muted-foreground font-normal">ยังไม่มีงาน</span>}</span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-3 border-t border-border/50">
          <div className="flex items-center -space-x-1.5">
            {members.length === 0 ? <span className="text-[11px] text-muted-foreground/60">ไม่มีสมาชิก</span>
              : members.map(m => { const s = (TMK.staff || []).find(x => x.name === m) || { color: '#888' }; return <Avatar key={m} name={m} color={s.color} size={22} />; })}
            {(flow.members || []).length > 4 && <span className="text-[11px] text-muted-foreground ml-2">+{flow.members.length - 4}</span>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" onClick={onSettings} title="ตั้งค่าโครงการ"><Icon name="system" className="size-3.5" /></Button>
            <Button variant="outline" size="sm" className="h-7" onClick={onOpen}>เปิด <Icon name="chevR" className="size-3.5 ml-0.5" /></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
