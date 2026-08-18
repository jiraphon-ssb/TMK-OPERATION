/* ============================================================
   useSaleRealtime — subscribe ตารางฝั่งส่งยอด (tmk_sale_receipts / tmk_sales_funnel)
   เพื่อให้ทีมเห็นสด. teardown แพทเทิร์น PART 46 (null-ก่อน-remove + stale-guard) กัน recursion.
   ก่อนรัน migration 20260706 = ไม่มี event ยิงมา (ช่องเปิดแต่เงียบ) → ไม่พัง.
   แยกเป็น lib เล็ก — กัน perf-view ลากทั้ง views-sale-submit (pdf/HealthHub) เข้า chunk
   ============================================================ */
import { useEffect, useRef } from 'react';
import { subscribeChanges, isRealtimeDown, onConnectionChange } from '../realtime/channelRegistry.js';

/* echo-skip: หลังเซฟเอง ผู้เขียนเรียก markSaleWrite(tables) → event echo ของตารางนั้นภายใน 900ms
   ถูกข้าม (เพราะผู้เขียน reload เองแล้ว) กันโหลดซ้ำ 2× · event ของคนอื่น (ไม่ถูก mark) ยังยิงปกติ.
   invalidateSaleCache() เรียกตัวนี้ให้อัตโนมัติ → ครอบทุก write ที่ล้าง cache (orders/skus/customers ฯลฯ) */
const _writeTs = new Map(); // table -> ts (ms)
const SKIP_MS = 900;
export function markSaleWrite(tables) {
  const now = Date.now();
  (Array.isArray(tables) ? tables : [tables]).forEach(t => { if (t) _writeTs.set(String(t), now); });
}
const isOwnEcho = (table) => { const ts = _writeTs.get(String(table)); return ts != null && (Date.now() - ts) < SKIP_MS; };

export function useSaleRealtime(tables, onChange) {
  const cbRef = useRef(onChange);
  // เก็บ callback ล่าสุดใส่ ref ใน effect (ห้ามเขียน ref ตอน render) — effect นี้ประกาศก่อน effect subscribe
  // จึงรันก่อนเสมอ · ตัว fire() อ่าน cbRef.current ตอนถูกเรียก (ใน setTimeout) → ได้ callback ล่าสุดเหมือนเดิม
  useEffect(() => { cbRef.current = onChange; });
  useEffect(() => {
    let timer = null, alive = true;
    const fire = () => { clearTimeout(timer); timer = setTimeout(() => { if (alive) cbRef.current?.(); }, 400); };
    // Phase 2: subscribe ผ่าน channel registry (dedup ตาม table-set · refcount · cleanup อัตโนมัติ)
    // key stable จาก sorted table-set → view หลายตัวที่ฟังชุดเดียวกัน share channel เดียว (เลิก sale-live-random)
    const key = 'sale-live:' + [...tables].sort().join(',');
    const unsub = subscribeChanges({
      key,
      bindings: tables.map(t => ({ table: t })),
      // ข้าม echo ของ own-write เดิม · {__resync} (table=null) หลังรีจอย → ผ่าน (isOwnEcho(null)=false) → refetch
      onEvent: (_payload, table) => { if (isOwnEcho(table)) return; fire(); },
    });
    // PART 95: กันข้อมูลค้างต้อง F5 —
    //  (1) กลับมาที่แท็บ → refetch (socket อาจถูกพักตอนอยู่พื้นหลัง)
    const onVis = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible' && alive) fire(); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
    //  (2) poll สำรองเฉพาะช่วง realtime หลุด (เบา · หยุดเองเมื่อต่อกลับ · resync จะ refetch อีกทีตอนรีจอย)
    let pollTimer = null;
    const startPoll = () => { if (!pollTimer) pollTimer = setInterval(() => { if (alive && isRealtimeDown()) fire(); }, 30000); };
    const stopPoll = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };
    if (isRealtimeDown()) startPoll();
    const unsubConn = onConnectionChange((down) => { if (down) startPoll(); else stopPoll(); });
    return () => { alive = false; clearTimeout(timer); stopPoll(); unsubConn(); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis); unsub(); };
  }, [tables.join(',')]); // eslint-disable-line
}
