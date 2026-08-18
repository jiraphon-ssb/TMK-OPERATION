/* ============================================================
   saleOverrides.js — logic รวมของชั้น "override ระดับออเดอร์" + resolve ชื่อลาย
   เดิม copy-paste เหมือนกันใน saleDashboard (procOrders) + views-2 (ordersM)
   และ salePerf "ลืมทำ" → เซลล์/ยอดที่แก้หายจาก leaderboard. รวมมาที่เดียว (pure).
   ============================================================ */
// ORDER_OV_KEY + mergeOrderOverrides = สูตร canonical ร่วมกับ edge (daily-sale-report)
//   → นิยามอยู่ที่ _shared/saleFormulas.js (แหล่งเดียว กัน drift) แล้ว re-export ต่อ (P2-4)
//   (mergeOrderOverrides: merge override ทับค่า frozen · note→re-derive job_type · แนบ _ov — logic เดิม)
import { ORDER_OV_KEY, mergeOrderOverrides } from '../../supabase/functions/_shared/saleFormulas.js';
export { ORDER_OV_KEY, mergeOrderOverrides };

/* ── REALTIME C2 de-risk: payload-patch ระดับ order (พิสูจน์ patch == refetch) ──
   mergeOrderOverrides เป็น per-order independent (map แต่ละแถวแยกกัน ไม่มี cross-order agg)
   → patch 1 แถวใน list == refetch+remerge ทั้งตาราง (พิสูจน์ด้วย characterization test)
   ใช้ตอน wire scoped subscription: event order.updated → applyOrderRowPatch แทน refetch ทั้งชุด */

// UPDATE/INSERT: merge override เฉพาะ rawRow แล้ววางแทนที่ใน list (คง ref แถวอื่น) · ไม่เจอ = prepend (row ใหม่)
export function applyOrderRowPatch(orders, rawRow, ovMap) {
  if (!rawRow) return orders;
  const merged = mergeOrderOverrides([rawRow], ovMap)[0];
  const key = ORDER_OV_KEY(rawRow);
  const list = orders || [];
  let found = false;
  const out = list.map(o => { if (ORDER_OV_KEY(o) === key) { found = true; return merged; } return o; });
  return found ? out : [merged, ...out];
}

// DELETE: เอา order ออกจาก list ตาม key (source:order_no)
export function removeOrderRow(orders, key) {
  return (orders || []).filter(o => ORDER_OV_KEY(o) !== key);
}

/* resolve ชื่อลาย/รหัสสด ด้วย resolver (จาก makeSkuResolver) — คง color/size เดิม
   opts.deriveColorSize: ถ้า override เปลี่ยน product_code → derive สี/ไซซ์ใหม่จากรหัส
   (ส่งฟังก์ชัน deriveColorSize จาก mpReport เข้ามาเฉพาะหน้าที่ต้องใช้ — กันดึง mpReport เข้าทุก chunk) */
export function resolveSkuDesigns(rawSkus, resolver, { deriveColorSize } = {}) {
  if (!rawSkus) return rawSkus;
  return rawSkus.map(x => {
    const r = resolver(x);
    const s2 = { ...x, design: r.design || x.design, product_code: r.product_code || x.product_code, _resolveSrc: r.source };
    if (deriveColorSize && r.source === 'override' && r.product_code) {
      const cs = deriveColorSize('', r.product_code);
      if (cs.color) s2.color = cs.color;
      if (cs.size) s2.size = cs.size;
    }
    return s2;
  });
}
