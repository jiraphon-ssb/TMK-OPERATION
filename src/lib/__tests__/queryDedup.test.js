// ============================================================
// กันดึงข้อมูลชุดเดิมซ้ำ (18 ก.ย. 69 — ต่อจากรอบลด egress)
// ============================================================
// วัดจริงบนแอป: ล้าง cache แล้วเข้าหน้า CRM 1 ครั้ง →
//   tmk_sales_funnel ×6 · tmk_crm_targets ×6 · tmk_mp_orders ×3 · tmk_daily_sales ×4
// สาเหตุ 2 อย่าง:
//   (1) หลาย component ยิง supabase.from() ตรง ๆ ไม่ผ่าน cache กลาง → mount ทีไรก็ดึงใหม่
//   (2) tmk_mp_orders ถูกดึง "2 ชุดคอลัมน์" (ORDERS_SEL กับ ORDERS_CRM_SEL)
//       cache คีย์ด้วย `table|sel` → คนละช่อง = โหลดทั้งตารางซ้ำอีกรอบเต็ม ๆ
// ============================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ORDERS_SEL } from '../saleData.js';

const cols = (s) => s.split(',').map(x => x.trim()).filter(Boolean);

describe('tmk_mp_orders ต้องมีชุดคอลัมน์เดียวทั้งระบบ', () => {
  it('⛔ ห้ามมี select ชุดอื่นของ tmk_mp_orders นอกจาก ORDERS_SEL', () => {
    const src = readFileSync('src/saleCrm.jsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    // เดิมไฟล์นี้ประกาศ ORDERS_CRM_SEL ของตัวเอง → cache คนละช่องกับหน้าอื่น
    expect(src).not.toMatch(/const ORDERS_CRM_SEL\s*=/);
    expect(src).toMatch(/cachedFetchAll\('tmk_mp_orders', ORDERS_SEL/);
  });

  it('ORDERS_SEL ต้องครอบทุกคอลัมน์ที่หน้า CRM ใช้ (ไม่งั้นข้อมูลขาด)', () => {
    const needed = ['order_no', 'source', 'customer_code', 'customer_name', 'customer_social',
      'customer_phone', 'channel', 'salesperson', 'province', 'sales', 'qty', 'order_date',
      'status', 'payment_type', 'cod_amount', 'customer_type', 'note', 'job_type'];
    const have = new Set(cols(ORDERS_SEL));
    expect(needed.filter(c => !have.has(c))).toEqual([]);
  });
});

describe('query ที่ยิงบ่อยต้องผ่าน cache กลาง', () => {
  const noComments = (p) => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  it('⛔ tmk_sales_funnel ห้ามยิงด้วย supabase.from() ตรง ๆ (ไม่มี cache = mount ทีไรดึงใหม่)', () => {
    for (const f of ['src/homeView.jsx', 'src/salePerf.jsx', 'src/lib/mergedMonth.js']) {
      expect(noComments(f), `${f} ยังยิง tmk_sales_funnel ตรง ๆ`)
        .not.toMatch(/supabase\s*\.from\(\s*['"]tmk_sales_funnel['"]\s*\)/);
    }
  });

  it('tmk_crm_targets ต้องอ่านผ่านชั้น cache (เรียกจากหลายหน้าพร้อมกัน)', () => {
    expect(noComments('src/lib/crmTargets.js')).toMatch(/cachedFetchEq\(/);
  });
});
