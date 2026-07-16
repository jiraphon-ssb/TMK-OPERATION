/* ============================================================
   saleOverrides.js — logic รวมของชั้น "override ระดับออเดอร์" + resolve ชื่อลาย
   เดิม copy-paste เหมือนกันใน saleDashboard (procOrders) + views-2 (ordersM)
   และ salePerf "ลืมทำ" → เซลล์/ยอดที่แก้หายจาก leaderboard. รวมมาที่เดียว (pure).
   ============================================================ */
import { resolveJobType } from './saleData.js';

// key override ระดับออเดอร์ — source + order_no (เสถียรข้าม reimport)
export const ORDER_OV_KEY = (o) => `${o.source || ''}:${o.order_no}`;

// override ชนะเมื่อมีค่าจริง (คอลัมน์ใหม่ · เก่าไม่มี = undefined/'' → ใช้ค่าไฟล์)
const _num = (a, b) => (a != null && a !== '' ? Number(a) : b);
const _str = (a, b) => (a != null && a !== '' ? a : b);

/* merge override ระดับออเดอร์ทับค่า frozen (job_type/ลูกค้า/เซลล์/ช่อง/ยอด/จำนวน/จังหวัด/วันที่/COD)
   note → re-derive job_type (DFT จากหมายเหตุ) · แนบ _ov ไว้อ้างต้นฉบับ */
export function mergeOrderOverrides(orders, ovMap) {
  if (!orders) return orders;
  if (!ovMap || !Object.keys(ovMap).length) return orders;
  return orders.map(o => {
    const ov = ovMap[ORDER_OV_KEY(o)]; if (!ov) return o;
    const note = ov.note != null && ov.note !== '' ? ov.note : o.note;
    return {
      ...o,
      job_type: resolveJobType(ov.job_type || o.job_type, note),
      customer_name: ov.customer_name || o.customer_name,
      customer_type: ov.customer_type || o.customer_type,
      salesperson: ov.salesperson || o.salesperson,
      channel: _str(ov.channel, o.channel),
      payment_type: _str(ov.payment_type, o.payment_type),
      sales: _num(ov.sales, o.sales),
      qty: _num(ov.qty, o.qty),
      province: _str(ov.province, o.province),
      order_date: _str(ov.order_date, o.order_date),
      cod_amount: _num(ov.cod_amount, o.cod_amount),
      customer_phone: _str(ov.customer_phone, o.customer_phone),
      customer_social: _str(ov.customer_social, o.customer_social),
      note,
      _ov: ov,
    };
  });
}

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
