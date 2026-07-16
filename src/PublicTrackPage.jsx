/* PublicTrackPage — หน้าติดตามสถานะออเดอร์ (สาธารณะ) แยกจาก App god-file (PART 84 REFACTOR-1) */
import { useState, useEffect, useCallback } from 'react';
import { Icon, B, ORDER_STATUSES, orderStatusIndex } from './components.jsx';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import tmkLogo from './assets/tmk-logo.png';
import { supabase } from './lib/supabaseClient.js';

// ดึงออเดอร์สาธารณะ (anon) — ลอง RPC ก่อน (post-RLS: SECURITY DEFINER คืนเฉพาะออเดอร์ที่ code ตรง)
// → ถ้า RPC ยังไม่มี (ก่อนรัน migration 20260716) fallback อ่านตาราง (RLS ปิดยังอ่านได้เหมือนเดิม)
async function fetchTrackOrder(c) {
  const { data, error } = await supabase.rpc('tmk_public_track', { p_code: c });
  if (!error) return (Array.isArray(data) ? data[0] : data) || null;
  const { data: d2 } = await supabase.from('tmk_orders')
    .select('code,customer_name,items,total,status,tracking_no,carrier,status_log,created_at')
    .eq('code', c).maybeSingle();
  return d2 || null;
}

/* ---- หน้าติดตามสถานะออเดอร์ (สาธารณะ — ลูกค้าเปิดเองไม่ต้องล็อกอิน) ---- */
export function PublicTrackPage({ code }) {
  const [input, setInput] = useState(code || '');
  const [order, setOrder] = useState(code ? undefined : null); // undefined=loading, null=ว่าง/ไม่พบ
  const [searched, setSearched] = useState(Boolean(code));     // เคยกดค้นหรือยัง (คุมข้อความ)

  // ดึงออเดอร์ตามรหัส — เรียกจาก event (ปุ่ม/Enter) หรือโหลดครั้งแรกจากลิงก์ ?track=
  const fetchOrder = useCallback(async (codeStr) => {
    const c = String(codeStr || '').trim().toUpperCase();
    setSearched(Boolean(c));
    if (!c) { setOrder(null); return; }
    setOrder(undefined);
    setOrder(await fetchTrackOrder(c));
  }, []);

  // โหลดครั้งแรกถ้าเปิดด้วยลิงก์ ?track=<code> — state เริ่มต้นเป็น loading อยู่แล้ว จึง fetch แบบ async ล้วน (ไม่ setState ก่อน await)
  useEffect(() => {
    if (!code) return;
    let cancel = false;
    (async () => {
      const o = await fetchTrackOrder(String(code).trim().toUpperCase());
      if (!cancel) setOrder(o);
    })();
    return () => { cancel = true; };
  }, [code]);

  const isCancelled = order && order.status === 'cancelled';
  const curIdx = order ? orderStatusIndex(order.status) : 0;
  const doSearch = () => fetchOrder(input);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper,#f4f6fb)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px', fontFamily: 'var(--font)' }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <img src={tmkLogo} alt="TMK" style={{ height: 44, marginBottom: 8 }} />
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--ink)' }}>ติดตามสถานะออเดอร์</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Input style={{ flex: 1 }} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()} placeholder="กรอกรหัสออเดอร์ (เช่น ORD-260609-AB12)" />
          <Button onClick={doSearch}><Icon name="search" /> ค้นหา</Button>
        </div>

        {order === undefined && <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--ink-4)' }}>กำลังค้นหา…</div>}
        {order === null && searched && <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--ink-4)' }}>ไม่พบออเดอร์รหัสนี้ — ตรวจสอบรหัสอีกครั้ง</div>}
        {order === null && !searched && <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--ink-4)' }}>กรอกรหัสออเดอร์เพื่อดูสถานะ</div>}

        {order && (
          <div className="card">
            <div className="row between" style={{ marginBottom: 4 }}>
              <span style={{ fontWeight: 800, fontSize: 16 }}>{order.code}</span>
              {isCancelled && <Badge variant="destructive">ยกเลิกแล้ว</Badge>}
            </div>
            <div className="cap" style={{ marginBottom: 16 }}>{order.customer_name || ''} · {new Date(order.created_at || Date.now()).toLocaleDateString('th-TH')}</div>

            {!isCancelled && (
              <div style={{ marginBottom: 18 }}>
                {ORDER_STATUSES.map((s, i) => {
                  const done = i < curIdx, active = i === curIdx;
                  return (
                    <div key={s.id} className="row" style={{ gap: 12, alignItems: 'flex-start', minHeight: 38 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', alignSelf: 'stretch' }}>
                        <span style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: done || active ? s.color : 'var(--surface-2)', color: '#fff', border: done || active ? 'none' : '2px solid var(--line)', fontSize: 12, fontWeight: 800 }}>{done ? '✓' : active ? '•' : ''}</span>
                        {i < ORDER_STATUSES.length - 1 && <span style={{ width: 2, flex: 1, minHeight: 16, background: done ? s.color : 'var(--line)' }} />}
                      </div>
                      <div style={{ paddingBottom: 10 }}>
                        <div style={{ fontWeight: active ? 800 : done ? 600 : 400, color: active ? s.color : done ? 'var(--ink)' : 'var(--ink-4)' }}>{s.label}{active && ' ← ตอนนี้'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {order.tracking_no && <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: '10px 12px', marginBottom: 12 }}><div className="cap">เลขพัสดุ {order.carrier ? `· ${order.carrier}` : ''}</div><div style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>{order.tracking_no}</div></div>}

            <div className="eyebrow" style={{ marginBottom: 8 }}>รายการ</div>
            {(order.items || []).map((it, i) => (
              <div key={i} className="row between" style={{ padding: '4px 0', fontSize: 'var(--fs-sm)' }}>
                <span>{it.name} · {it.color} {it.size} ×{it.qty}</span><span className="num">{B((it.qty || 0) * (it.price || 0))}</span>
              </div>
            ))}
            <div className="row between" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)', fontWeight: 800 }}><span>ยอดรวม</span><span className="num">{B(order.total)}</span></div>
          </div>
        )}
        <div className="cap" style={{ textAlign: 'center', marginTop: 16, color: 'var(--ink-4)' }}>TMK Operation</div>
      </div>
    </div>
  );
}
