/* ============================================================
   useSaleRealtime — subscribe ตารางฝั่งส่งยอด (tmk_sale_receipts / tmk_sales_funnel)
   เพื่อให้ทีมเห็นสด. teardown แพทเทิร์น PART 46 (null-ก่อน-remove + stale-guard) กัน recursion.
   ก่อนรัน migration 20260706 = ไม่มี event ยิงมา (ช่องเปิดแต่เงียบ) → ไม่พัง.
   แยกเป็น lib เล็ก — กัน perf-view ลากทั้ง views-sale-submit (pdf/HealthHub) เข้า chunk
   ============================================================ */
import { useEffect, useRef } from 'react';
import { supabase } from './supabaseClient.js';

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
  cbRef.current = onChange;
  useEffect(() => {
    let channel = null, timer = null, alive = true;
    const fire = () => { clearTimeout(timer); timer = setTimeout(() => { if (alive) cbRef.current?.(); }, 400); };
    const fireFor = (table) => { if (isOwnEcho(table)) return; fire(); }; // ข้าม echo ของ own-write
    const ch = supabase.channel('sale-live-' + Math.random().toString(36).slice(2, 8));
    channel = ch;
    tables.forEach(t => ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => fireFor(t)));
    ch.subscribe();
    return () => {
      alive = false; clearTimeout(timer);
      if (!channel) return;
      const c = channel; channel = null;
      try { supabase.removeChannel(c); } catch { /* ignore */ }
    };
  }, [tables.join(',')]); // eslint-disable-line
}
