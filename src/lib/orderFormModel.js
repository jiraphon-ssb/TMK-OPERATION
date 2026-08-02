/* ============================================================
   orderFormModel.js — โมเดล/คำนวณของฟอร์มออเดอร์กลาง (PART 88.4) · pure ล้วน เทสต์ได้
   ============================================================
   line model = unit price (ราคา/ตัว) · ยอดบรรทัด = qty × price
   B1 กัน round-trip drift: บรรทัดจาก sku เดิม เก็บ _ls0/_qty0/_price0 ไว้ →
   ถ้า "จำนวน+ราคาไม่ถูกแก้" คืนยอดเดิมเป๊ะ (ไม่ให้ปัดเศษทำยอดขยับเองตอนเปิด-บันทึกเฉยๆ)
   ============================================================ */
export const N = (v) => Number(v) || 0;

// บรรทัดเปล่า (โหมด "เลือกจากสินค้า" เป็นค่าเริ่ม)
export const blankLine = () => ({ mode: 'pick', id: null, raw: '', design: '', code: '', color: '', size: '', qty: '1', price: '', _design0: '', _code0: '' });

// ยอดบรรทัด (round-trip safe): sku เดิมที่ยังไม่แตะจำนวน/ราคา → คืน line_sales เดิมเป๊ะ · ไม่งั้น qty×price
export const lineAmount = (l) => {
  if (l._ls0 != null && String(l.qty) === String(l._qty0) && String(l.price) === String(l._price0)) return N(l._ls0);
  return N(l.qty) * N(l.price);
};
export const sumLines = (lines) => (lines || []).reduce((s, l) => s + lineAmount(l), 0);
export const sumQty = (lines) => (lines || []).reduce((s, l) => s + N(l.qty), 0);

// แปลง sku เดิม → บรรทัดฟอร์มกลาง · known = ลายอยู่ในแคตตาล็อกไหม (ไม่อยู่ → เปิดโหมด "พิมพ์เอง" B3)
export const skuToLine = (s, known = true) => {
  const qty = N(s.qty), ls = N(s.price != null ? s.price * qty : s.line_sales);
  const price = qty > 0 ? Math.round((ls / qty) * 100) / 100 : ls;
  return {
    mode: known ? 'pick' : 'manual', id: s.id || null, raw: s.raw_sku_or_name || '',
    design: s.design || '', code: s.product_code || '', color: s.color || '', size: s.size || '',
    qty: String(s.qty ?? ''), price: String(price),
    _design0: s.design || '', _code0: s.product_code || '',
    _ls0: N(s.line_sales), _qty0: String(s.qty ?? ''), _price0: String(price),
  };
};

// ยอดขายที่ใช้จริง: กรอกเอง (>0) หรือผลรวมรายการ
export const effectiveTotal = (f) => N(f.total) > 0 ? N(f.total) : sumLines(f.lines);
