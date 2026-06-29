/* ============================================================
   crmAgg.js — CRM 360 (ระบบคลัง/ปฏิบัติการ) + RFM (PART P2/P3)
   ============================================================
   *** ใช้ข้อมูลของระบบ "คลัง + CRM" เท่านั้น — ไม่ดึงจากระบบ Sale/มาร์เก็ตเพลส (tmk_mp_*) ***
   แหล่ง: tmk_customers (ลูกค้าหน้าร้าน) + tmk_customer_totals (ยอด/จำนวนออเดอร์) + tmk_orders (วันออเดอร์ล่าสุด)
   soft-merge: tmk_crm_merge (รวมลูกค้าซ้ำ) · reuse rfmTiers() จาก saleAgg เพื่อจัด tier/flag
   ============================================================ */
import { supabase } from './supabaseClient.js';
import { TMK } from '../data.js';
import { rfmTiers } from './saleAgg.js';

export const normPhone = (s) => (s || '').toString().replace(/\D/g, '').replace(/^66/, '0');
const keyOf = (name, phone) => normPhone(phone) || ('n:' + (name || '').toString().trim().toLowerCase());
const maxDate = (a, b) => (!a ? b : !b ? a : (a > b ? a : b));
const minDate = (a, b) => (!a ? b : !b ? a : (a < b ? a : b));

/** โหลด + รวมลูกค้า (เฉพาะข้อมูลระบบคลัง/CRM) + RFM */
export async function loadUnifiedCustomers() {
  // ลูกค้าหน้าร้าน (graceful)
  let shop = [], totals = {};
  try {
    const { data } = await supabase.from('tmk_customers').select('id,code,name,phone,line,address,created_at').is('deleted_at', null).limit(3000);
    shop = data || [];
    const ids = shop.map(s => s.id);
    if (ids.length) {
      const { data: ct } = await supabase.from('tmk_customer_totals').select('customer_id,order_count,total_spent').in('customer_id', ids);
      (ct || []).forEach(t => { if (t.customer_id) totals[t.customer_id] = { count: Number(t.order_count || 0), spent: Number(t.total_spent || 0) }; });
    }
  } catch { /* ตารางยังไม่มี → ข้าม */ }

  // วันออเดอร์ล่าสุดต่อลูกค้า จากออเดอร์จัดส่ง (tmk_orders ที่โหลดไว้ในแอป) → ใช้คิด recency
  const lastByCust = new Map();
  (TMK.orders || []).forEach(o => { if (o.customerId) { const d = (o.createdAt || '').slice(0, 10); const cur = lastByCust.get(o.customerId); if (!cur || d > cur) lastByCust.set(o.customerId, d); } });

  // soft-merge: รวมลูกค้าซ้ำตาม tmk_crm_merge (from_key → to_key) — ไม่ลบของจริง (graceful)
  const mergeMap = new Map();
  try {
    const { data } = await supabase.from('tmk_crm_merge').select('from_key,to_key');
    (data || []).forEach(m => { if (m.from_key && m.to_key) mergeMap.set(m.from_key, m.to_key); });
  } catch { /* ตารางยังไม่มี → ไม่ merge */ }
  const resolveKey = (k) => { let cur = k, hop = 0; while (mergeMap.has(cur) && hop++ < 10) cur = mergeMap.get(cur); return cur; };

  const byKey = new Map();
  const baseU = (k) => ({ key: k, name: '', phone: '', line: '', social: '', province: '', address: '', owner: '', since: '', last: '', sales: 0, count: 0, channels: new Set(), shopId: '' });

  shop.forEach(s => {
    const k = resolveKey(keyOf(s.name, s.phone)); const u = byKey.get(k) || baseU(k);
    u.name = u.name || s.name || ''; u.phone = u.phone || s.phone || ''; u.line = u.line || s.line || ''; u.address = u.address || s.address || '';
    const t = totals[s.id] || { count: 0, spent: 0 };
    u.sales += t.spent; u.count += t.count; u.channels.add('หน้าร้าน'); u.shopId = s.id;
    u.since = minDate(u.since, (s.created_at || '').slice(0, 10));
    u.last = maxDate(u.last, lastByCust.get(s.id) || '');
    byKey.set(k, u);
  });

  // rfmTiers ใช้ c.orders เป็น Frequency → alias จาก count
  const list = [...byKey.values()].map(u => ({ ...u, channels: [...u.channels], orders: u.count }));
  const asOf = new Date().toISOString().slice(0, 10);
  const { rows, summary } = rfmTiers(list, asOf);
  return { customers: rows.sort((a, b) => (b.sales || 0) - (a.sales || 0)), summary, asOf };
}
