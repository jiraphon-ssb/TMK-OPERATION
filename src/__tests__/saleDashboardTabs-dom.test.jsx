// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { VariantTab, FunnelTab } from '../saleDashboardTabs.jsx';

/* ============================================================
   smoke test แท็บที่แยกออกจาก saleDashboard.jsx (Wave 5 · PART 99)
   ============================================================
   ทำไมต้องมี: build/lint จับได้แค่ "ตัวแปรไม่มีอยู่" — จับ "แม่ลืมส่ง prop" ไม่ได้
   (ลูก destructure จาก ctx แล้วได้ undefined → พังตอน runtime เท่านั้น)
   เทสนี้เรนเดอร์แท็บจริงด้วยข้อมูลจำลองขั้นต่ำ → ถ้าใครแก้ ctx แล้วลืมส่งค่า จะแดงทันที
   (เลือกแท็บที่ไม่พึ่ง supabase/context: VariantTab, FunnelTab)
   ============================================================ */
afterEach(cleanup);

// jsdom ไม่มี ResizeObserver — recharts <ResponsiveContainer> เรียกใช้ตอน mount → ต้อง polyfill
// (ข้อจำกัดของ test env ล้วน ไม่เกี่ยวกับโค้ดแอป)
globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };

// ข้อมูลจำลองขั้นต่ำ — โครงตรงกับที่ saleAgg คืนจริง (byColor/bySize/bySalesperson = array ของ {key, sales, qty})
const fakeA = {
  _skus: [{ order_no: 'A1', design: 'JSK111', color: 'ดำ', size: 'M', qty: 2, line_sales: 500 }],
  _ords: [{ order_no: 'A1', salesperson: 'TUKTA', channel: 'Facebook', sales: 500, qty: 2, order_date: '2026-08-01', status: 'confirmed' }],
  byColor: [{ key: 'ดำ', sales: 500, qty: 2 }],
  bySize: [{ key: 'M', sales: 500, qty: 2 }],
  bySalesperson: [{ key: 'TUKTA', sales: 500, qty: 2, orders: 1 }],
};
const fakeF = { design: [], salesperson: [], channel: [], province: [], color: [], size: [] };

describe('saleDashboardTabs — แท็บที่แยกไฟล์แล้วต้องเรนเดอร์ได้จริง', () => {
  it('VariantTab เรนเดอร์ผ่าน (สินค้า: สี/ไซซ์)', () => {
    const { container } = render(<VariantTab ctx={{ A: fakeA, f: fakeF }} />);
    expect(container.firstChild).toBeTruthy();
  });

  it('FunnelTab เรนเดอร์ผ่าน (คนทัก & ปิดการขาย) แม้ยังไม่มีข้อมูล funnel', () => {
    const { container } = render(
      <FunnelTab ctx={{ A: fakeA, f: fakeF, funnel: [], range: { from: '2026-08-01', to: '2026-08-31' }, gran: 'day' }} />
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('FunnelTab รับข้อมูลคนทักจริง (jsonb leads) ได้ ไม่ throw', () => {
    const funnel = [{ date: '2026-08-01', salesperson: 'TUKTA', leads: { Facebook: { new: 5, old: 3 } } }];
    const { container } = render(
      <FunnelTab ctx={{ A: fakeA, f: fakeF, funnel, range: { from: '2026-08-01', to: '2026-08-31' }, gran: 'day' }} />
    );
    expect(container.firstChild).toBeTruthy();
  });
});
