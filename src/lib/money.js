/* ============================================================
   TMK Operation — ตัวจัดรูปแบบเงินบาทกลาง (canonical money formatter)
   ============================================================
   กติกา: โชว์ทศนิยม 2 ตำแหน่ง "เฉพาะเมื่อมีเศษสตางค์"
     - จำนวนเต็ม  → ไม่มี .00 รก (฿9,743)
     - มีเศษสตางค์ → เอามาครบ 2 หลัก (฿696.43 · ฿696.50)
     - null/undefined/NaN → '—'
   ใช้ร่วมทั้งระบบ Sale (B ใน components, fmtB ใน salePerf, baht ใน dashboard/crm)
   ให้เลขเงินหน้าตาเดียวกันหมด · ไม่ตัดทศนิยมยอดขาย/AOV/คอมทิ้ง
   ============================================================ */

/** true ถ้ายอดมีเศษสตางค์ (ปัด 2 ตำแหน่งแล้วไม่ลงตัวบาท) */
export function hasSatang(n) {
  return Math.round(Math.abs(Number(n) || 0) * 100) % 100 !== 0;
}

/** format เงินบาท decimal-aware — คืน '—' ถ้าไม่ใช่ตัวเลขจำกัด */
export function fmtBaht(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  return '฿' + v.toLocaleString('en-US', {
    minimumFractionDigits: hasSatang(v) ? 2 : 0,
    maximumFractionDigits: 2,
  });
}
