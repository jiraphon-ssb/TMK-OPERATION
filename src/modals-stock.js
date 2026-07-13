/* ============================================================
   modals-stock.js — optimistic-lock stock mutators (cross-domain: catalog ↔ order)
   แยกไฟล์กัน circular import (PART 79)
   ============================================================ */
import { supabase } from './lib/supabaseClient.js';

// optimistic-lock ทั่วไปสำหรับแก้แถวสินค้า (lots / stock_on_hand / actual_units / reservations)
// กัน 2 เครื่องเขียนทับกันแล้วข้อมูลอีกเครื่องหาย (lost update)
// compute(freshRow) => patchObject | null  — return null เพื่อยกเลิกแบบไม่ error (เช่น สต็อกหมดไปแล้ว)
export async function mutateProductRow(productId, compute, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    const { data: cur, error: selErr } = await supabase
      .from('tmk_products').select('lots, stock_on_hand, actual_units, reservations, updated_at').eq('id', productId).maybeSingle();
    if (selErr) return { error: selErr };
    if (!cur) return { error: { message: 'ไม่พบสินค้า' } };
    const patch = compute(cur);
    if (!patch) return { aborted: true };
    let q = supabase.from('tmk_products')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', productId);
    q = (cur.updated_at == null) ? q.is('updated_at', null) : q.eq('updated_at', cur.updated_at);
    const { data: upd, error: updErr } = await q.select('id');
    if (updErr) return { error: updErr };
    if (upd && upd.length) return { ok: true };
    // 0 แถว = มีเครื่องอื่นเขียนแทรกหลังเราอ่าน → วน re-fetch + re-compute กับค่าล่าสุด
  }
  return { error: { message: 'แก้ไขชนกับอุปกรณ์อื่น — รีโหลดแล้วลองใหม่' } };
}
// helper เฉพาะ reservations (append/filter) — เรียกผ่าน mutateProductRow
export async function mutateProductReservations(productId, transform, attempts = 4) {
  return mutateProductRow(productId, (cur) => ({ reservations: transform(Array.isArray(cur.reservations) ? cur.reservations : []) }), attempts);
}
