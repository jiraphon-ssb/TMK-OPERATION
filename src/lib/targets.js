/* ============================================================
   TMK Operation — เป้าขาย + คอมมิชชั่นต่อเซลล์ (PART 12 / T3)
   ============================================================
   - graceful: ตาราง tmk_targets ยังไม่ migrate → คืน [] / เงียบ (ไม่ทำแอปพัง)
   - key = "<salesperson>::<YYYY-MM>" (salesperson = ชื่อหลัง alias ให้ตรง bySalesperson.key)
   ============================================================ */
import { supabase } from './supabaseClient.js';

export const targetId = (salesperson, month) => `${salesperson}::${month}`;

/** ดึงเป้าทั้งหมดของเดือนหนึ่ง → [] ถ้าตารางยังไม่มี/error */
export async function fetchTargets(month) {
  if (!month) return [];
  try {
    const { data, error } = await supabase
      .from('tmk_targets')
      .select('id,salesperson,month,sales_target,commission_rate,tiers,note')
      .eq('month', month);
    if (error) return [];
    return data || [];
  } catch { return []; }
}

/** upsert เป้า 1 แถว — โยน error กลับให้ caller โชว์ toast (ตรวจ relation-missing เองที่ caller) */
export async function saveTarget({ salesperson, month, sales_target = 0, commission_rate = 0, tiers = null, note = '' }) {
  const row = {
    id: targetId(salesperson, month),
    salesperson, month,
    sales_target: Number(sales_target) || 0,
    commission_rate: Number(commission_rate) || 0,
    tiers: tiers || null,
    note: note || '',
    updated_at: new Date().toISOString(),
  };
  return supabase.from('tmk_targets').upsert(row, { onConflict: 'id' });
}

/** ลบเป้า (ตั้งค่ากลับเป็น 0 = ลบแถว) */
export async function deleteTarget(salesperson, month) {
  return supabase.from('tmk_targets').delete().eq('id', targetId(salesperson, month));
}

/**
 * คำนวณคอมมิชชั่น (บาท) จากยอดขาย + config เป้า
 * - tiers (ขั้นบันได) ถ้ามี: หา rate ของขั้นสูงสุดที่ sales ถึง (min ≤ sales)
 * - ไม่งั้น flat: sales * commission_rate/100
 */
export function commissionFor(sales, target) {
  const s = Number(sales) || 0;
  if (!target) return 0;
  if (Array.isArray(target.tiers) && target.tiers.length) {
    const sorted = [...target.tiers].filter(t => t && t.rate != null).sort((a, b) => (b.min || 0) - (a.min || 0));
    const hit = sorted.find(t => s >= (Number(t.min) || 0));
    return hit ? s * (Number(hit.rate) || 0) / 100 : 0;
  }
  return s * (Number(target.commission_rate) || 0) / 100;
}

/**
 * ตัดสินใจการ "แสดงคอม/เป้า" ต่อเซลล์ 1 คน (แยก decision จาก JSX ให้ test ได้)
 * row = { target (sales_target บาท), comm (คอมบาท), tgt (object เป้า มี commission_rate/tiers) }
 * → mode 'target'   = มีเป้ายอด → โชว์แถบเป้า+%+คอม
 *   mode 'commOnly' = ไม่มีเป้ายอด แต่ตั้ง %คอม → โชว์คอมล้วน + rateLabel
 *   mode 'none'     = ไม่มีทั้งคู่ → ปุ่มตั้งค่า
 */
export function commissionDisplay(row) {
  const target = Number(row?.target) || 0;
  const comm = Number(row?.comm) || 0;
  if (target > 0) return { mode: 'target', comm };
  if (comm > 0) {
    const t = row?.tgt;
    const tier = !!(t && Array.isArray(t.tiers) && t.tiers.length);
    return { mode: 'commOnly', comm, rateLabel: tier ? 'ขั้นบันได' : `เรต ${Number(t?.commission_rate) || 0}%` };
  }
  return { mode: 'none' };
}

/** map salesperson → target object สำหรับ lookup เร็วใน leaderboard */
export function targetsByPerson(rows) {
  const m = new Map();
  for (const r of (rows || [])) m.set(r.salesperson, r);
  return m;
}
