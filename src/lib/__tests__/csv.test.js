import { describe, it, expect } from 'vitest';
import { csvEsc, buildAllCsv, buildMonthlyReportCsv } from '../csv.js';

// Characterization tests — ล็อกพฤติกรรม CSV export (security: formula-injection escape) หลัง extract จาก saleWidgets/views-settings
describe('csvEsc — formula-injection escape', () => {
  it('quote ทุกค่า + escape double-quote', () => {
    expect(csvEsc('abc')).toBe('"abc"');
    expect(csvEsc('a"b')).toBe('"a""b"');
    expect(csvEsc(null)).toBe('""');
  });
  it('นำหน้าด้วย =+@ หรือ tab/CR → เติม \' กัน Excel รันสูตร', () => {
    expect(csvEsc('=SUM(A1)')).toBe('"\'=SUM(A1)"');
    expect(csvEsc('@cmd')).toBe('"\'@cmd"');
    expect(csvEsc('+1')).toBe('"+1"');       // +ตัวเลขล้วน = ตัวเลข ไม่ escape
  });
  it('เลขติดลบ = คงเป็นตัวเลข (ไม่ทำเป็น text · Excel SUM ต้องได้)', () => {
    expect(csvEsc('-1234.56')).toBe('"-1234.56"');
    expect(csvEsc('-0.5')).toBe('"-0.5"');
    expect(csvEsc('-x')).toBe('"\'-x"');      // ลบแล้วไม่ใช่ตัวเลข → escape
  });
});

describe('buildAllCsv', () => {
  const data = {
    channels: [{ name: 'Facebook', target: 1000, actual: 800, orders: 5, ad: 100 }],
    products: [], tasks: [], campaigns: [], adCampaigns: [],
    dailyAll: [{ year: 2569, month: 3, day: 5, ch: { facebook: { rev: 800, ord: 5, ad: 100, newC: 2, oldC: 1 } } }],
    monthly: [{ year: 2569, month: 3, target: 1000, actual: 800, adSpend: 100, orders: 5, newCust: 2 }],
    audit: [{ ts: '2026-03-05', user: 'A', action: 'create', entityType: 'order', entityName: 'X1', summary: 'ทดสอบ' }],
  };
  const csv = buildAllCsv(data);
  it('มีหัว section ครบ 8 + แปลงปี พ.ศ.→ค.ศ.', () => {
    expect(csv).toContain('ช่องทาง — เดือนปัจจุบัน');
    expect(csv).toContain('ยอดรายวันต่อช่องทาง (Daily × Channel)');
    expect(csv).toContain('สรุปรายเดือน (Monthly Summary)');
    expect(csv).toContain('ประวัติการใช้งาน (Audit Log)');
    expect(csv).toContain('"2026-03-05","facebook"'); // daily row: ปีแปลงเป็น ค.ศ. + channel id (buildAllCsv esc ทุกคอลัมน์)
  });
  it('daily inq = newC+oldC (derive) · buildAllCsv quote ทุกคอลัมน์', () => {
    // แถว daily: date,channel,rev,ord,ad,inq,newC,oldC → inq=3
    const line = csv.split('\n').find(l => l.includes('facebook') && l.includes('2026-03-05'));
    expect(line).toBeTruthy();
    expect(line).toBe('"2026-03-05","facebook","800","5","100","3","2","1"');
  });
  it('data ว่าง → ยังมีหัว section (ไม่ crash)', () => {
    const c = buildAllCsv({});
    expect(c).toContain('สินค้า (Products)');
  });
});

describe('buildMonthlyReportCsv', () => {
  const md = {
    consts: { TARGET: 1000 },
    computed: { MTD: 800, ORD: 5, AD: 100, NEW_C: 2 },
    channels: [{ name: 'Facebook', target: 1000, actual: 800, orders: 5, ad: 100 }],
  };
  const dailyAll = [{ year: 2569, month: 3, day: 5, ch: { facebook: { rev: 800, ord: 5, ad: 100, newC: 2, oldC: 1 } } }];
  const csv = buildMonthlyReportCsv({ md, dailyAll, channelNameById: { facebook: 'Facebook' }, monthTH: 'มี.ค.', yearBE: 2569, month: 3 });
  it('หัวรายงาน + สรุปรวม + ROAS ต่อช่อง', () => {
    expect(csv).toContain('รายงานยอดขายเดือน มี.ค. 2569');
    expect(csv).toContain('เป้าเดือน,1000');
    expect(csv).toContain('ยอด,800');
    // ROAS = 800/100 = 8.00 · %เป้า = 80.0
    expect(csv).toContain('"Facebook",1000,800,80.0,5,100,8.00');
  });
  it('ยอดรายวัน×ช่องทาง filter เฉพาะเดือน/ปีที่ขอ', () => {
    expect(csv).toContain('2026-03-05,"Facebook",800,5,100,3,2,1');
  });
});
