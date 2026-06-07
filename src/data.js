/* ============================================================
   TMK Operation — Mock data
   Derived from the real TMK domain: Thai fashion brand ops hub
   ============================================================ */
const TARGET = 1000000, DAY = 18, DAYS = 30, ACOS_CEIL = 25;

const channels = [
  { id: 'shopee',   name: 'Shopee',   color: 'var(--ch-shopee)',   hex: '#ee6a3a', target: 300000, actual: 178000, orders: 312, newRev: 124600, oldRev: 53400, newCust: 196, oldCust: 71, ad: 28000, hasAd: true },
  { id: 'tiktok',   name: 'TikTok',   color: 'var(--ch-tiktok)',   hex: '#18a0ab', target: 220000, actual: 134000, orders: 248, newRev: 104500, oldRev: 29500, newCust: 168, oldCust: 39, ad: 31000, hasAd: true },
  { id: 'lazada',   name: 'Lazada',   color: 'var(--ch-lazada)',   hex: '#6b5ce0', target: 180000, actual: 89000,  orders: 151, newRev: 66750,  oldRev: 22250, newCust: 92,  oldCust: 28, ad: 15000, hasAd: true },
  { id: 'facebook', name: 'Facebook', color: 'var(--ch-facebook)', hex: '#4a8be0', target: 160000, actual: 78000,  orders: 119, newRev: 56160,  oldRev: 21840, newCust: 64,  oldCust: 24, ad: 42000, hasAd: true },
  { id: 'line',     name: 'LINE OA',  color: 'var(--ch-line)',     hex: '#06c755', target: 90000,  actual: 50000,  orders: 58,  newRev: 17500,  oldRev: 32500, newCust: 12,  oldCust: 34, ad: 0,     hasAd: false },
  { id: 'crm',      name: 'CRM',      color: 'var(--ch-crm)',      hex: '#c08a3e', target: 50000,  actual: 29000,  orders: 31,  newRev: 3480,   oldRev: 25520, newCust: 4,   oldCust: 32, ad: 0,     hasAd: false },
];

const dailyMonth = [26,24,28,30,35,38,27,25,31,33,29,28,31,30,38,42,29,33].map((v,i) => ({ d: i+1, rev: v*1000 }));
const month3 = [{ m: 'เม.ย.', actual: 920000, proj: 0 },{ m: 'พ.ค.', actual: 968000, proj: 0 },{ m: 'มิ.ย.', actual: 558000, proj: 372000 }];
const yoy = [
  { m: 'ม.ค.', y25: 720000, y26: 880000 },{ m: 'ก.พ.', y25: 740000, y26: 910000 },
  { m: 'มี.ค.', y25: 780000, y26: 945000 },{ m: 'เม.ย.', y25: 760000, y26: 920000 },
  { m: 'พ.ค.', y25: 810000, y26: 968000 },{ m: 'มิ.ย.', y25: 690000, y26: 558000 },
];

const products = [
  { rank: 1, name: 'เสื้อโปโล Signature', price: 590, units: 1180, rev: 165200, stock: 'low', onHand: 84, reorder: 100, strategy: 'สินค้าเรือธง ดันต่อเนื่อง' },
  { rank: 2, name: 'เสื้อยืด Cotton Comfort', price: 320, units: 920, rev: 110400, stock: 'ok', onHand: 540, reorder: 200, strategy: 'ฐานยอดหลัก' },
  { rank: 3, name: 'เสื้อเชิ้ตลินินลำลอง', price: 690, units: 380, rev: 95000, stock: 'ok', onHand: 220, reorder: 80, strategy: 'มาร์จิ้นสูง โปรโมตคู่ลุค' },
  { rank: 4, name: 'กางเกงขาสั้น Chino', price: 450, units: 540, rev: 75600, stock: 'low', onHand: 60, reorder: 120, strategy: 'จับคู่เซ็ต' },
  { rank: 5, name: 'แจ็คเก็ตกันลม', price: 890, units: 165, rev: 66000, stock: 'out', onHand: 0, reorder: 50, strategy: 'รอ PO รอบใหม่' },
  { rank: 6, name: 'เสื้อโปโล Basic', price: 390, units: 480, rev: 52800, stock: 'ok', onHand: 310, reorder: 150, strategy: 'ราคาเข้าถึงง่าย' },
];

const colorMix = [
  { name: 'ดำ', pct: 28, hex: '#1c1c1c' },{ name: 'กรมท่า', pct: 22, hex: '#23395b' },
  { name: 'ขาว', pct: 18, hex: '#e8e4da' },{ name: 'เทา', pct: 14, hex: '#8a8276' },
  { name: 'เขียวขุ่น', pct: 10, hex: '#5a6e54' },{ name: 'ครีม', pct: 8, hex: '#d8c9a8' },
];
const sizeMix = [{ s:'S', pct:8 },{ s:'M', pct:24 },{ s:'L', pct:31 },{ s:'XL', pct:22 },{ s:'2XL', pct:11 },{ s:'3XL', pct:4 }];

const campaigns = [
  { id: 'c1', name: 'Mid-Month Flash', color: '#ee6a3a', start: '12 มิ.ย.', end: '18 มิ.ย.', status: 'live',     channels: ['shopee','tiktok','lazada'], tasks: 6 },
  { id: 'c2', name: 'Payday Push',      color: '#6b5ce0', start: '25 มิ.ย.', end: '30 มิ.ย.', status: 'upcoming', channels: ['shopee','facebook','line'], tasks: 4 },
  { id: 'c3', name: 'Linen Summer Drop',color: '#2f9e6e', start: '20 มิ.ย.', end: '05 ก.ค.', status: 'upcoming', channels: ['tiktok','facebook'], tasks: 5 },
  { id: 'c4', name: 'CRM Win-back',     color: '#c08a3e', start: '10 มิ.ย.', end: '24 มิ.ย.', status: 'live',     channels: ['line','crm'], tasks: 3 },
  { id: 'c5', name: '6.6 Mega Sale',    color: '#4a8be0', start: '01 มิ.ย.', end: '06 มิ.ย.', status: 'done',     channels: ['shopee','tiktok','lazada','facebook'], tasks: 8 },
];

const staff = [
  { name: 'มัง',     role: 'Owner',   color: '#b07d33' },
  { name: 'MKT',     role: 'Marketing', color: '#4a8be0' },
  { name: 'Graphic', role: 'Content', color: '#6b5ce0' },
  { name: 'Admin',   role: 'Backoffice', color: '#2f9e6e' },
];

const tasks = [
  { id: 't1', title: 'ถ่ายคอนเทนต์ Linen Summer', detail: 'เซ็ตภาพ 12 ลุค + คลิปรีล 3 ตัว', date: '20 มิ.ย.', responsible: ['Graphic','มัง'], camp: 'c3', status: 'inprogress', channel: 'TikTok Shop' },
  { id: 't2', title: 'ตั้งแคมเปญ Flash หลังบ้าน Shopee', detail: 'ตั้งโค้ดส่วนลด + แบนเนอร์', date: '17 มิ.ย.', responsible: ['Admin'], camp: 'c1', status: 'done', channel: 'หลังบ้าน' },
  { id: 't3', title: 'ยิงแอด Payday ล่วงหน้า', detail: 'เตรียมครีเอทีฟ 4 ชุด งบ 15k', date: '24 มิ.ย.', responsible: ['MKT'], camp: 'c2', status: 'todo', channel: 'FB Post' },
  { id: 't4', title: 'Live สด TikTok เย็นนี้', detail: 'รอบ 19:00 ดันโปโล Signature', date: '18 มิ.ย.', responsible: ['มัง','MKT'], camp: 'c1', status: 'review', channel: 'TikTok Shop' },
  { id: 't5', title: 'Broadcast LINE win-back', detail: 'กลุ่มลูกค้าเงียบ 60 วัน', date: '21 มิ.ย.', responsible: ['Admin','MKT'], camp: 'c4', status: 'todo', channel: 'Line Broadcast' },
  { id: 't6', title: 'ออกแบบ KV 6.6 สรุปผล', detail: 'รีพอร์ตภาพรวมแคมเปญ', date: '07 มิ.ย.', responsible: ['Graphic'], camp: 'c5', status: 'done', channel: 'ทุกแพลตฟอร์ม' },
  { id: 't7', title: 'เปิด PO แจ็คเก็ตกันลม', detail: 'รอบผลิตใหม่ 500 ตัว', date: '19 มิ.ย.', responsible: ['Admin'], camp: 'c3', status: 'inprogress', channel: 'หลังบ้าน' },
  { id: 't8', title: 'รีวิวฟีด Lazada', detail: 'จัดเรียงสินค้าขายดีขึ้นบน', date: '22 มิ.ย.', responsible: ['MKT'], camp: 'c1', status: 'todo', channel: 'หลังบ้าน' },
  { id: 't9', title: 'สรุปยอด Flash รายวัน', detail: 'อัปเดตเข้าระบบทุก 21:00', date: '18 มิ.ย.', responsible: ['Admin'], camp: 'c1', status: 'review', channel: 'หลังบ้าน' },
  { id: 't10', title: 'เตรียมภาพ 6.6 Mega Sale', detail: 'ถ่ายสินค้า + ตัดต่อ', date: '02 มิ.ย.', responsible: ['Graphic'], camp: 'c5', status: 'done', channel: 'ทุกแพลตฟอร์ม' },
  { id: 't11', title: 'เปิดร้าน 6.6 ทุกแพลตฟอร์ม', detail: 'ตั้งแคมเปญ Shopee Lazada TikTok', date: '01 มิ.ย.', responsible: ['Admin','MKT'], camp: 'c5', status: 'done', channel: 'หลังบ้าน' },
  { id: 't12', title: 'ยิงแอด 6.6 รอบแรก', detail: 'งบ 20k FB + TikTok', date: '03 มิ.ย.', responsible: ['MKT'], camp: 'c5', status: 'done', channel: 'FB Post' },
  { id: 't13', title: 'สรุปยอด 6.6 รายวัน', detail: 'อัปเดตทีมทุกเย็น', date: '05 มิ.ย.', responsible: ['Admin'], camp: 'c5', status: 'done', channel: 'หลังบ้าน' },
  { id: 't14', title: 'ถ่ายรีวิว Cotton Comfort', detail: 'คลิปรีวิว 30 วิ x 3 ตัว', date: '10 มิ.ย.', responsible: ['Graphic','มัง'], camp: 'c4', status: 'done', channel: 'TikTok Shop' },
  { id: 't15', title: 'เช็คสต็อก Mid-Month', detail: 'เช็คของก่อน Flash Sale', date: '11 มิ.ย.', responsible: ['Admin'], camp: 'c1', status: 'done', channel: 'หลังบ้าน' },
  { id: 't16', title: 'ประชุมทีม Weekly', detail: 'สรุปยอดสัปดาห์ + วางแผนถัดไป', date: '09 มิ.ย.', responsible: ['มัง','MKT','Admin'], camp: 'c1', status: 'done', channel: 'หลังบ้าน' },
  { id: 't17', title: 'อัปเดตแบนเนอร์ Shopee', detail: 'เปลี่ยนแบนเนอร์หน้าร้าน', date: '14 มิ.ย.', responsible: ['Graphic'], camp: 'c1', status: 'done', channel: 'หลังบ้าน' },
  { id: 't18', title: 'วางแผน Payday Push', detail: 'ประชุมวางกลยุทธ์ 25-30 มิ.ย.', date: '15 มิ.ย.', responsible: ['มัง','MKT'], camp: 'c2', status: 'done', channel: 'หลังบ้าน' },
  { id: 't19', title: 'เช็คแอด Facebook เช้า', detail: 'ปรับ bid ตาม performance', date: '18 มิ.ย.', responsible: ['MKT'], camp: 'c1', status: 'inprogress', channel: 'FB Post' },
  { id: 't20', title: 'อัปเดตราคา Shopee', detail: 'ปรับราคา Flash Sale', date: '18 มิ.ย.', responsible: ['Admin'], camp: 'c1', status: 'todo', channel: 'หลังบ้าน' },
  { id: 't21', title: 'ตอบแชท LINE ลูกค้า VIP', detail: 'Follow up 10 ราย', date: '18 มิ.ย.', responsible: ['Admin','MKT'], camp: 'c4', status: 'inprogress', channel: 'Line Broadcast' },
  { id: 't22', title: 'ถ่ายสินค้าใหม่ 3 SKU', detail: 'เสื้อโปโล 3 สี', date: '20 มิ.ย.', responsible: ['Graphic'], camp: 'c3', status: 'todo', channel: 'ทุกแพลตฟอร์ม' },
];

const kanbanMeta = [
  { id: 'todo',       label: 'รอดำเนินการ',   en: 'To-Do' },
  { id: 'inprogress', label: 'กำลังทำ',       en: 'In Progress' },
  { id: 'review',     label: 'รอตรวจ',        en: 'Review' },
  { id: 'done',       label: 'เสร็จแล้ว',     en: 'Done' },
];

const poTracker = [
  { id: 'po1', product: 'แจ็คเก็ตกันลม', quantity: 500, orderDate: '15 มิ.ย.', arrivalDate: '02 ก.ค.', status: 'Pending' },
  { id: 'po2', product: 'เสื้อโปโล Signature', quantity: 800, orderDate: '10 มิ.ย.', arrivalDate: '24 มิ.ย.', status: 'Pending' },
  { id: 'po3', product: 'กางเกงขาสั้น Chino', quantity: 400, orderDate: '05 มิ.ย.', arrivalDate: '18 มิ.ย.', status: 'Completed' },
  { id: 'po4', product: 'เสื้อยืด Cotton Comfort', quantity: 1000, orderDate: '01 มิ.ย.', arrivalDate: '14 มิ.ย.', status: 'Completed' },
];

const fb = { revenue: 78000, spend: 42000, inquiries: 420, orders: 119, newCust: 78, oldCust: 41 };
fb.roas = fb.revenue / fb.spend; fb.acos = (fb.spend / fb.revenue) * 100; fb.conv = (fb.orders / fb.inquiries) * 100;
fb.aov = fb.revenue / fb.orders; fb.cpInq = fb.spend / fb.inquiries; fb.cpOrd = fb.spend / fb.orders; fb.cac = fb.spend / fb.newCust;
const fbMsgTrend = [{ m:'ม.ค.', v:780 },{ m:'ก.พ.', v:840 },{ m:'มี.ค.', v:910 },{ m:'เม.ย.', v:880 },{ m:'พ.ค.', v:980 },{ m:'มิ.ย.', v:420 }];

const dailyLog = [
  { date: '18 มิ.ย.', day: 'อ', shopee: 11000, tiktok: 8500, lazada: 4800, facebook: 4200, line: 2800, crm: 1700, ad: 7000, note: 'ไลฟ์เย็น 1 รอบ' },
  { date: '17 มิ.ย.', day: 'จ', shopee: 9200,  tiktok: 7800, lazada: 4100, facebook: 3600, line: 2900, crm: 1400, ad: 6100, note: '' },
  { date: '16 มิ.ย.', day: 'อา', shopee: 14000, tiktok: 10500, lazada: 6200, facebook: 5400, line: 3600, crm: 2300, ad: 7800, note: 'ยอดพีค' },
  { date: '15 มิ.ย.', day: 'ส', shopee: 12800, tiktok: 9600, lazada: 5700, facebook: 4900, line: 3100, crm: 1900, ad: 7400, note: 'เสาร์' },
  { date: '14 มิ.ย.', day: 'ศ', shopee: 9800,  tiktok: 7400, lazada: 4200, facebook: 3900, line: 2700, crm: 1900, ad: 6800, note: '' },
  { date: '13 มิ.ย.', day: 'พฤ', shopee: 10200, tiktok: 7900, lazada: 4400, facebook: 4100, line: 2700, crm: 1700, ad: 6500, note: 'ปล่อย LE drop' },
  { date: '12 มิ.ย.', day: 'พ', shopee: 8900,  tiktok: 7100, lazada: 3900, facebook: 3500, line: 2600, crm: 1300, ad: 6200, note: '' },
];

const audit = [
  { user: 'มัง',     action: 'แก้ไขเป้าหมาย', type: 'update', entity: 'เป้าหมาย', name: 'เป้ารวมเดือน มิ.ย.', time: '5 นาทีที่แล้ว', summary: 'ปรับเป้ารวมเป็น ฿1,000,000' },
  { user: 'Admin',   action: 'บันทึกยอดขาย',  type: 'update', entity: 'ยอดขาย', name: '18 มิ.ย.', time: '32 นาทีที่แล้ว', summary: 'บันทึกยอด 6 ช่องทาง ฿32,000' },
  { user: 'MKT',     action: 'สร้างแคมเปญ',   type: 'create', entity: 'แคมเปญ', name: 'Payday Push', time: '2 ชม.ที่แล้ว', summary: 'เพิ่มแคมเปญใหม่ 25–30 มิ.ย.' },
  { user: 'Graphic', action: 'ย้ายสถานะงาน',  type: 'update', entity: 'งาน', name: 'ถ่ายคอนเทนต์ Linen', time: '3 ชม.ที่แล้ว', summary: 'รอดำเนินการ → กำลังทำ' },
  { user: 'Admin',   action: 'รับสินค้า PO',  type: 'update', entity: 'PO', name: 'Chino 400 ตัว', time: 'เมื่อวาน 16:20', summary: 'กำลังผลิต → ของเข้าแล้ว' },
  { user: 'มัง',     action: 'ลบงาน',         type: 'delete', entity: 'งาน', name: 'ทดสอบระบบ', time: 'เมื่อวาน 11:05', summary: 'ย้ายไปถังขยะ' },
  { user: 'มัง',     action: 'ตั้งสิทธิ์ผู้ใช้', type: 'create', entity: 'สิทธิ์ผู้ใช้', name: 'mkt@tmk.co', time: '2 วันก่อน', summary: 'ตั้งสิทธิ์เป็น Editor' },
];

const roles = [
  { email: 'jiraphon.e@tmk.co', name: 'มัง (เจ้าของ)', role: 'admin' },
  { email: 'mkt@tmk.co',        name: 'ทีมการตลาด',    role: 'editor' },
  { email: 'graphic@tmk.co',    name: 'กราฟิก',        role: 'editor' },
  { email: 'admin@tmk.co',      name: 'แอดมินหลังบ้าน', role: 'editor' },
  { email: 'viewer@tmk.co',     name: 'ผู้บริหารร่วม',  role: 'viewer' },
];

const promoChannels = ['หลังบ้าน', 'Line Broadcast', 'FB Post', 'TikTok Shop', 'ทุกแพลตฟอร์ม'];

// ---- computed ----
const MTD = channels.reduce((s,c)=>s+c.actual,0);
const ORD = channels.reduce((s,c)=>s+c.orders,0);
const AD  = channels.reduce((s,c)=>s+c.ad,0);
const NEW_REV = channels.reduce((s,c)=>s+c.newRev,0);
const OLD_REV = channels.reduce((s,c)=>s+c.oldRev,0);
const NEW_C = channels.reduce((s,c)=>s+c.newCust,0);
const OLD_C = channels.reduce((s,c)=>s+c.oldCust,0);
const PACE_TGT = Math.round((TARGET/DAYS)*DAY);
const PACE_PCT = (MTD/PACE_TGT)*100;
const RUN = Math.round((MTD/DAY)*DAYS);
const AOV = MTD/ORD;
const ACOS_TOT = (AD/MTD)*100;
const CAC = AD/NEW_C;

export const TMK = {
  consts: { TARGET, DAY, DAYS, ACOS_CEIL },
  channels, dailyMonth, month3, yoy, products, colorMix, sizeMix,
  campaigns, staff, tasks, kanbanMeta, poTracker, fb, fbMsgTrend, dailyLog, audit, roles, promoChannels,
  computed: { MTD, ORD, AD, NEW_REV, OLD_REV, NEW_C, OLD_C, PACE_TGT, PACE_PCT, RUN, AOV, ACOS_TOT, CAC },
};
