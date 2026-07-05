/* ============================================================
   useSaleRealtime — subscribe ตารางฝั่งส่งยอด (tmk_sale_receipts / tmk_sales_funnel)
   เพื่อให้ทีมเห็นสด. teardown แพทเทิร์น PART 46 (null-ก่อน-remove + stale-guard) กัน recursion.
   ก่อนรัน migration 20260706 = ไม่มี event ยิงมา (ช่องเปิดแต่เงียบ) → ไม่พัง.
   แยกเป็น lib เล็ก — กัน perf-view ลากทั้ง views-sale-submit (pdf/HealthHub) เข้า chunk
   ============================================================ */
import { useEffect, useRef } from 'react';
import { supabase } from './supabaseClient.js';

export function useSaleRealtime(tables, onChange) {
  const cbRef = useRef(onChange);
  cbRef.current = onChange;
  useEffect(() => {
    let channel = null, timer = null, alive = true;
    const fire = () => { clearTimeout(timer); timer = setTimeout(() => { if (alive) cbRef.current?.(); }, 400); };
    const ch = supabase.channel('sale-live-' + Math.random().toString(36).slice(2, 8));
    channel = ch;
    tables.forEach(t => ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, fire));
    ch.subscribe();
    return () => {
      alive = false; clearTimeout(timer);
      if (!channel) return;
      const c = channel; channel = null;
      try { supabase.removeChannel(c); } catch { /* ignore */ }
    };
  }, [tables.join(',')]); // eslint-disable-line
}
