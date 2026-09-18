// ============================================================
// realtimePatch — realtime 1 event ต้องแก้เฉพาะแถวนั้น ไม่ใช่ดึงทั้งตาราง
// ============================================================
// ปัญหาที่แก้ (18 ก.ย. 69): egress ทะลุโควตา 120% (6.02/5 GB) ทั้งที่ฐานข้อมูลมีแค่ 48 MB
// dataContext เดิม: มี event → refreshTables → รัน QUERIES[k]() = select ทั้งตารางใหม่
// → คนหนึ่งลากการ์ด 1 ใบ อีก 6 เครื่องดาวน์โหลด tmk_tasks ใหม่ทั้งตาราง
//
// กติกาเหล็ก: patch ได้เฉพาะเมื่อ "มั่นใจ 100%" — กรณีอื่นคืน null ให้ผู้เรียกดึงทั้งตารางเหมือนเดิม
// ข้อมูลผิดแย่กว่า egress เปลือง
// ============================================================
import { describe, it, expect } from 'vitest';
import { patchTableRows, PATCH_CFG } from '../realtimePatch.js';

const ev = (eventType, newRow, oldRow) => ({ eventType, new: newRow, old: oldRow });
const task = (id, date, extra = {}) => ({ id, date, title: `งาน ${id}`, deleted_at: null, ...extra });

describe('กติกาความปลอดภัย — ไม่มั่นใจต้องคืน null (ให้ดึงทั้งตาราง)', () => {
  const rows = [task(1, '2026-09-01')];
  it('ตารางที่ไม่อยู่ในลิสต์ → null', () => {
    expect(patchTableRows(rows, 'tmk_settings', ev('UPDATE', { id: 'main' }))).toBeNull();
    expect(patchTableRows(rows, 'tmk_task_comments', ev('INSERT', { id: 9 }))).toBeNull();
  });
  it('payload ว่าง/ไม่มี eventType → null', () => {
    expect(patchTableRows(rows, 'tmk_tasks', null)).toBeNull();
    expect(patchTableRows(rows, 'tmk_tasks', {})).toBeNull();
  });
  it('แถวไม่มี id → null (ชี้ไม่ได้ว่าแถวไหน)', () => {
    expect(patchTableRows(rows, 'tmk_tasks', ev('INSERT', { date: '2026-09-02' }))).toBeNull();
    expect(patchTableRows(rows, 'tmk_tasks', ev('DELETE', null, {}))).toBeNull();
  });
  it('ของเดิมไม่ใช่ array (ยังไม่โหลด) → null', () => {
    expect(patchTableRows(null, 'tmk_tasks', ev('INSERT', task(2, '2026-09-02')))).toBeNull();
    expect(patchTableRows(undefined, 'tmk_tasks', ev('INSERT', task(2, '2026-09-02')))).toBeNull();
  });
  it('⛔ payload.errors (Supabase ตัดทิ้งเพราะแถวใหญ่เกิน 1 MB) → null ห้ามเชื่อของที่ไม่ครบ', () => {
    const bad = { eventType: 'UPDATE', new: task(1, '2026-09-09'), errors: ['Error 413: Payload Too Large'] };
    expect(patchTableRows(rows, 'tmk_tasks', bad)).toBeNull();
  });
  it('eventType แปลก → null', () => {
    expect(patchTableRows(rows, 'tmk_tasks', ev('TRUNCATE', null, null))).toBeNull();
  });
});

describe('INSERT', () => {
  it('แถวใหม่ถูกใส่เข้าไป + เรียงตาม order ของ query (tasks = date)', () => {
    const rows = [task(1, '2026-09-01'), task(3, '2026-09-05')];
    const out = patchTableRows(rows, 'tmk_tasks', ev('INSERT', task(2, '2026-09-03')));
    expect(out.map(r => r.id)).toEqual([1, 2, 3]);
  });
  it('ไม่แก้ array เดิม (immutable — React ต้องเห็น reference ใหม่)', () => {
    const rows = [task(1, '2026-09-01')];
    const out = patchTableRows(rows, 'tmk_tasks', ev('INSERT', task(2, '2026-09-02')));
    expect(rows).toHaveLength(1);
    expect(out).not.toBe(rows);
  });
  it('⛔ แถวใหม่ที่ถูกลบอ่อนมาแล้ว (deleted_at) ต้องไม่โผล่ — query กรอง is(deleted_at,null)', () => {
    const rows = [task(1, '2026-09-01')];
    const out = patchTableRows(rows, 'tmk_tasks', ev('INSERT', task(2, '2026-09-02', { deleted_at: '2026-09-02T10:00:00Z' })));
    expect(out.map(r => r.id)).toEqual([1]);
  });
});

describe('UPDATE', () => {
  it('ทับค่าของแถวเดิม (ไม่เพิ่มแถว)', () => {
    const rows = [task(1, '2026-09-01'), task(2, '2026-09-02')];
    const out = patchTableRows(rows, 'tmk_tasks', ev('UPDATE', task(2, '2026-09-02', { title: 'แก้แล้ว' })));
    expect(out).toHaveLength(2);
    expect(out.find(r => r.id === 2).title).toBe('แก้แล้ว');
  });
  it('⛔ ลบอ่อน (ตั้ง deleted_at) → ต้องหายจากลิสต์ ไม่ใช่ค้างอยู่', () => {
    const rows = [task(1, '2026-09-01'), task(2, '2026-09-02')];
    const out = patchTableRows(rows, 'tmk_tasks', ev('UPDATE', task(2, '2026-09-02', { deleted_at: '2026-09-02T10:00:00Z' })));
    expect(out.map(r => r.id)).toEqual([1]);
  });
  it('กู้คืน (deleted_at กลับเป็น null) → กลับเข้าลิสต์ตามลำดับ', () => {
    const rows = [task(1, '2026-09-01'), task(3, '2026-09-05')];
    const out = patchTableRows(rows, 'tmk_tasks', ev('UPDATE', task(2, '2026-09-03')));
    expect(out.map(r => r.id)).toEqual([1, 2, 3]);
  });
  it('ย้ายวันแล้วลำดับต้องขยับตาม', () => {
    const rows = [task(1, '2026-09-01'), task(2, '2026-09-02'), task(3, '2026-09-03')];
    const out = patchTableRows(rows, 'tmk_tasks', ev('UPDATE', task(1, '2026-09-09')));
    expect(out.map(r => r.id)).toEqual([2, 3, 1]);
  });
});

describe('DELETE (ลบจริง)', () => {
  it('ลบด้วย id จาก payload.old', () => {
    const rows = [task(1, '2026-09-01'), task(2, '2026-09-02')];
    const out = patchTableRows(rows, 'tmk_tasks', ev('DELETE', null, { id: 2 }));
    expect(out.map(r => r.id)).toEqual([1]);
  });
  it('id เป็น string/number ต้องจับคู่กันได้ (Postgres ส่ง number · บางที่เก็บ string)', () => {
    const rows = [{ ...task(1, '2026-09-01'), id: '1' }];
    const out = patchTableRows(rows, 'tmk_tasks', ev('DELETE', null, { id: 1 }));
    expect(out).toEqual([]);
  });
  it('ลบแถวที่ไม่มีอยู่แล้ว → ลิสต์เท่าเดิม ไม่ throw', () => {
    const rows = [task(1, '2026-09-01')];
    expect(patchTableRows(rows, 'tmk_tasks', ev('DELETE', null, { id: 99 })).map(r => r.id)).toEqual([1]);
  });
});

describe('เรียงลำดับต้องตรงกับ .order() ของแต่ละ query', () => {
  it('sort_order จากน้อยไปมาก (channels/brands/flows/duties)', () => {
    const rows = [{ id: 1, sort_order: 1, deleted_at: null }, { id: 3, sort_order: 3, deleted_at: null }];
    const out = patchTableRows(rows, 'tmk_channels', ev('INSERT', { id: 2, sort_order: 2, deleted_at: null }));
    expect(out.map(r => r.id)).toEqual([1, 2, 3]);
  });
  it('⛔ sort_order ว่าง ต้องไปท้าย (query ใช้ nullsFirst:false)', () => {
    const rows = [{ id: 1, sort_order: 1, start_date: '2026-01-01', deleted_at: null }];
    const out = patchTableRows(rows, 'tmk_campaigns', ev('INSERT', { id: 2, sort_order: null, start_date: '2026-01-01', deleted_at: null }));
    expect(out.map(r => r.id)).toEqual([1, 2]);
  });
  it('campaigns เรียง sort_order ก่อน แล้วค่อย start_date', () => {
    const rows = [
      { id: 1, sort_order: 1, start_date: '2026-03-01', deleted_at: null },
      { id: 2, sort_order: 1, start_date: '2026-01-01', deleted_at: null },
    ];
    const out = patchTableRows(rows, 'tmk_campaigns', ev('UPDATE', { id: 1, sort_order: 1, start_date: '2026-03-01', deleted_at: null }));
    expect(out.map(r => r.id)).toEqual([2, 1]);
  });
});

describe('tmk_daily_sales — query มีขอบเขตวันที่ (gte) ไม่มี is(deleted_at)', () => {
  const opts = { dailyFrom: '2024-01-01' };
  it('วันที่อยู่ในขอบเขต → ใส่ได้', () => {
    const rows = [{ id: 1, date: '2026-09-01' }];
    const out = patchTableRows(rows, 'tmk_daily_sales', ev('INSERT', { id: 2, date: '2026-09-02' }), opts);
    expect(out.map(r => r.id)).toEqual([1, 2]);
  });
  it('⛔ วันที่เก่ากว่าขอบเขตที่ query ดึง → ต้องไม่ใส่ (ไม่งั้นมีแถวที่ full-load ไม่มี)', () => {
    const rows = [{ id: 1, date: '2026-09-01' }];
    const out = patchTableRows(rows, 'tmk_daily_sales', ev('INSERT', { id: 2, date: '2020-01-01' }), opts);
    expect(out.map(r => r.id)).toEqual([1]);
  });
  it('⛔ แถวที่ลบอ่อนแล้วต้องยังอยู่ — query นี้ไม่ได้กรอง deleted_at (หน้าเว็บกรองเอง)', () => {
    const rows = [{ id: 1, date: '2026-09-01' }];
    const out = patchTableRows(rows, 'tmk_daily_sales', ev('UPDATE', { id: 1, date: '2026-09-01', deleted_at: '2026-09-02' }), opts);
    expect(out).toHaveLength(1);
    expect(out[0].deleted_at).toBe('2026-09-02');
  });
  it('ไม่ส่ง dailyFrom มา → null (ไม่เดาขอบเขตเอง)', () => {
    expect(patchTableRows([{ id: 1, date: '2026-09-01' }], 'tmk_daily_sales', ev('INSERT', { id: 2, date: '2026-09-02' }))).toBeNull();
  });
});

describe('PATCH_CFG ต้องตรงกับ QUERIES ใน dataContext', () => {
  it('ทุกตารางที่ patch ได้ ต้องมี key ปลายทาง', () => {
    for (const [t, cfg] of Object.entries(PATCH_CFG)) {
      expect(cfg.key, `${t} ไม่มี key`).toBeTruthy();
    }
  });
  it('ไม่มี tmk_settings (maybeSingle = ไม่ใช่ array) และ tmk_task_comments (ต้องรีเฟรช view นับคอมเมนต์)', () => {
    expect(PATCH_CFG.tmk_settings).toBeUndefined();
    expect(PATCH_CFG.tmk_task_comments).toBeUndefined();
  });
});
