/* ============================================================
   ด่านสุดท้ายตอนบันทึก — ใบที่ไม่มีวันที่ห้ามลงฐานข้อมูล (บั๊ก L3822 · 17 ต.ค. 69)
   ============================================================
   หน้าตรวจบล็อกแล้วก็จริง แต่ด่านนี้กันทางอื่นที่ไม่ผ่านหน้าตรวจ (คีย์มือ / แก้ใบหลังส่ง)
   ต้องตัดก่อนแตะ supabase เลย — เพราะถ้าเขียนใบเสร็จลงไปแล้ว ตัวกันซ้ำจะบล็อกการส่งใหม่ทันที
   ============================================================ */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ตัวจำลองแบบ "ต่อ chain ได้ทุกเมธอด" — แค่จดว่าถูกเรียก (บางโมดูลแตะ supabase ตอนโหลดไฟล์ จึงห้ามโยน error)
const chain = () => new Proxy(function () {}, { get: (_t, k) => (k === 'then' ? undefined : chain()), apply: () => chain() });
const from = vi.fn(() => chain());
vi.mock('../supabaseClient.js', () => ({ supabase: { from: (...a) => from(...a) }, isSupabaseConfigured: true }));
vi.mock('../audit.js', () => ({ logAudit: vi.fn() }));

const { confirmReceipts, editReceipt } = await import('../receiptSubmit.js');

const item = (over = {}) => ({
  order_no: 'L3822', order_date: '', customer_name: 'ลูกค้า', province: 'กรุงเทพ', channel: 'facebook',
  total: 9000, lines: [{ code: 'JSK111', name: 'ลาย', amount: 9000, qty: 30 }], ...over,
});

beforeEach(() => from.mockClear());

describe('confirmReceipts — ใบไม่มีวันที่', () => {
  it('ข้ามใบนั้นพร้อมเหตุผล และไม่แตะฐานข้อมูลเลย', async () => {
    const r = await confirmReceipts([item()], { email: 'a@tmk.co', name: 'Marry' });
    expect(r.ok).toEqual([]);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].order_no).toBe('L3822');
    expect(r.skipped[0].reason).toMatch(/วันที่/);
    expect(from).not.toHaveBeenCalled();
  });
});

describe('editReceipt — แก้ใบจนไม่มีวันที่', () => {
  it('ไม่ยอมบันทึก และไม่แตะฐานข้อมูลเลย', async () => {
    const orig = { order_no: 'L3822', salesperson: 'Marry', uploader_email: 'a@tmk.co', confirmed: {}, history: [] };
    await expect(editReceipt(orig, item(), { email: 'admin@tmk.co', name: 'แอดมิน' })).rejects.toThrow(/วันที่/);
    expect(from).not.toHaveBeenCalled();
  });
});
