/* ============================================================
   TMK Operation — Sales views UI helpers (แยก logic บริสุทธิ์จาก views-sales.jsx · Wave 3)
   ============================================================
   helper ระดับ module ที่ pure (รับ arg → คืนค่า · ไม่มี hook/state/props)
   ============================================================ */

// แปลง chip CSS class → shadcn Badge variant (ค่า default = 'secondary')
export const chipVar = (cls) => ({ 'chip-good': 'success', 'chip-warn': 'warning', 'chip-bad': 'danger', 'chip-accent': 'accent' }[cls] || 'secondary');
