/* ============================================================
   useSaleLiveReload — ครอบแพทเทิร์น "subscribe realtime → invalidate cache → reload"
   ที่เดิม copy-paste ในหน้า Sale (perf/dashboard/crm) · แต่ละหน้า invalidate ชุดต่างกัน
   แยกไฟล์กันวน import (saleData → saleRealtime อยู่แล้ว · ไฟล์นี้ import ทั้งคู่ ไม่มีขากลับ)
   ============================================================ */
import { useSaleRealtime } from './saleRealtime.js';
import { invalidateSaleCache } from './saleData.js';
import { T } from './tables.js';

// invalidate default = orders+skus (mark:false เพราะ event ของคนอื่น · own-write ถูก echo-skip แล้ว)
export function useSaleLiveReload(tables, reload, { invalidate = [T.mpOrders, T.mpSkus] } = {}) {
  useSaleRealtime(tables, () => {
    invalidate.forEach(t => invalidateSaleCache(t, { mark: false }));
    reload?.();
  });
}
