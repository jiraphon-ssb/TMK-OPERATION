/* AUTO-GEN จาก "ตารางรายละเอียดลายเสื้อ.xlsx" (1,608 SKU → รวมเป็น 47 ลาย) + ราคา/หมวดจาก catalogMeta
   ใช้: นำเข้าแคตตาล็อกเสื้อ + เป็นฐาน resolver จับคู่ข้อมูลขาย (ชื่อลาย/สี/ไซซ์) */

// ลายเสื้อทั้งหมด (รหัส base · ชื่อลาย · หมวด · ราคาปลีก · สีที่มี · ไซซ์ที่มี)
export const GOLDEN_DESIGNS = [
  {"code":"JSK01","name":"สิริกานต์","type":"เสื้อโปโล","price":279,"colors":["ขาว","ดำ","กรมท่า"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JTCM111","name":"TRICOT ชาย","type":"เสื้อโปโล","price":320,"colors":["ดำ"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JTCW111","name":"TRICOT หญิง","type":"เสื้อโปโล","price":320,"colors":["ดำ"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JSR111","name":"สิริราช","type":"เสื้อโปโล","price":299,"colors":["ดำ","ฟ้า","ชมพู","ม่วง","โอรส"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JDB111","name":"ดอกบัว","type":"เสื้อโปโล","price":299,"colors":["ขาว","ดำ","กรมท่า","ฟ้า","เขียว","เหลือง","ชมพู","ม่วง","โอรส"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JDM111","name":"DIAMOND","type":"เสื้อโปโล","price":299,"colors":["ฟ้า","ชมพู","ม่วง"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JSP111","name":"SPLASH","type":"เสื้อโปโล","price":299,"colors":["ขาว","ฟ้า","ชมพู"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JAN001","name":"อนงค์ กระเป๋า","type":"กระเป๋า","price":320,"colors":["ดำ","กรม"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JCB111","name":"ชบา","type":"เสื้อโปโล","price":299,"colors":["ดำ","กรม","เขียว","แดง"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JGL111","name":"พวงมาลัย","type":"เสื้อโปโล","price":299,"colors":["ฟ้า"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JML111","name":"มะลิ","type":"เสื้อโปโล","price":299,"colors":["ฟ้า"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"CB1","name":"กระเป๋าผ้า แบบที่ 1","type":"กระเป๋า","price":0,"colors":[],"sizes":[]},
  {"code":"CB2","name":"กระเป๋าผ้า แบบที่ 2","type":"กระเป๋า","price":0,"colors":[],"sizes":[]},
  {"code":"CB3","name":"กระเป๋าผ้า แบบที่ 3","type":"กระเป๋า","price":0,"colors":[],"sizes":[]},
  {"code":"JBF111","name":"บุญบั้งไฟ","type":"เสื้อโปโล","price":320,"colors":["ฟ้า","น้ำเงิน","แดง","ชมพู"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JPK111","name":"พิกุล","type":"เสื้อโปโล","price":0,"colors":["กรม","เขียว","เหลือง","ชมพู"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JSN111","name":"มะเส็ง","type":"เสื้อโปโล","price":0,"colors":["ขาว","แดง"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JAN111","name":"อนงค์","type":"เสื้อโปโล","price":349,"colors":["กรม","ฟ้า","ชมพู","ครีม"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JLK111","name":"ลอยกระทง","type":"เสื้อโปโล","price":349,"colors":["ขาว","ฟ้า","ชมพู"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JRP-111","name":"ราษภักดี (สีขาว)","type":"เสื้อโปโล","price":349,"colors":["ดำ","น้ำเงิน","เขียว","เหลือง","แดง"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL","6XL","7XL"]},
  {"code":"JYP111","name":"หยาดเพชร","type":"เสื้อโปโล","price":349,"colors":["ขาว","ฟ้า","เขียว","เหลือง","ชมพู","ม่วง","ส้ม"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL","6XL","7XL"]},
  {"code":"JRP112","name":"ราษภักดี-อปท","type":"เสื้อโปโล","price":0,"colors":["ฟ้า","เขียว","เหลือง","โอรส"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JSC2","name":"ถุงเท้า","type":"ถุงเท้า","price":0,"colors":[],"sizes":[]},
  {"code":"JRP211","name":"ราษภักดี แขนยาว","type":"เสื้อโปโล","price":0,"colors":["ฟ้า","โอรส"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JJK211","name":"จันทร์ แขนยาว","type":"เสื้อโปโล","price":0,"colors":["กรม","เหลือง"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JTT021","name":"เสื้อกล้าม","type":"เสื้อกล้าม","price":50,"colors":[],"sizes":["S","M","L","XL","2XL"]},
  {"code":"JRP116","name":"ราษฎร์ภักดี 72 ปี","type":"เสื้อโปโล","price":0,"colors":["เหลือง"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JHP111","name":"หัวใจ","type":"เสื้อโปโล","price":349,"colors":["ขาว","น้ำเงิน","เหลือง","ชมพู","ม่วง"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JRP111","name":"ราษฎร์ภักดี","type":"เสื้อโปโล","price":349,"colors":["กรม","ฟ้า","เขียว","เหลือง","ชมพู","ม่วง","ส้ม"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JSK131","name":"สาดสี คอวี","type":"เสื้อโปโล","price":299,"colors":[],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JSK121","name":"สาดสี คอกลม","type":"เสื้อโปโล","price":0,"colors":[],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JSK111","name":"สาดสี คอปก","type":"เสื้อโปโล","price":0,"colors":[],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JDA116","name":"ดารากานต์ 72 ปี","type":"เสื้อโปโล","price":0,"colors":["เหลือง"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JDR116","name":"ดอกรัก 72 ปี","type":"เสื้อโปโล","price":0,"colors":["เหลือง"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JDG111","name":"กนกมังกร ปก","type":"เสื้อโปโล","price":349,"colors":["ขาว","กรม","แดง"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JDA112","name":"ดารากานต์-อปท","type":"เสื้อโปโล","price":349,"colors":["กรม","ฟ้า","ชมพู","ส้ม"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JDA111","name":"ดารากานต์","type":"เสื้อโปโล","price":349,"colors":["กรม","ฟ้า","แดง","ชมพู","ส้ม"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JDR112","name":"ดอกรัก-อปท","type":"เสื้อโปโล","price":349,"colors":["ขาว","กรมท่า","ฟ้า","เหลือง","ม่วง","ส้ม"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JDR111","name":"ดอกรัก","type":"เสื้อโปโล","price":0,"colors":["ขาว","กรมท่า","ฟ้า","เขียว","เหลือง","แดง","ชมพู","ม่วง","ส้ม"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JJK112","name":"จันทร์-อปท","type":"เสื้อโปโล","price":0,"colors":["ขาว","กรม","ฟ้า","เขียว","เหลือง","แดง","ชมพู","ม่วง"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JNKO111","name":"ขอใหม่","type":"เสื้อโปโล","price":0,"colors":["ดำ","ฟ้า","เขียว","เหลือง","ชมพู","ม่วง","ส้ม"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JYM112","name":"ยาม-อปท","type":"เสื้อโปโล","price":0,"colors":["กรมท่า","ฟ้า","เหลือง","แดง","ชมพู","ม่วง","ส้ม"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JKN112","name":"กนก-อปท","type":"เสื้อโปโล","price":0,"colors":["ดำ","ฟ้า","เขียว","เหลือง","ชมพู","ม่วง","ส้ม"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JKD111","name":"ขิด","type":"เสื้อโปโล","price":0,"colors":["ดำ","ฟ้า","เหลือง","แดง","ม่วง"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JJK111","name":"จันทร์","type":"เสื้อโปโล","price":299,"colors":["ขาว","ดำ","กรม","ฟ้า","เขียว","เหลือง","แดง","ชมพู","ม่วง","ส้ม"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JYM111","name":"ยาม","type":"เสื้อโปโล","price":299,"colors":["ขาว","ดำ","กรมท่า","ฟ้า","เขียว","เหลือง","แดง","ชมพู","ม่วง","ส้ม"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JKN111","name":"กนก","type":"เสื้อโปโล","price":299,"colors":["ดำ","ฟ้า","เขียว","เหลือง","ชมพู","ม่วง","ส้ม"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"OEM-ORG","name":"OEM/สกรีนองค์กร","type":"OEM","price":0,"colors":["ดำ"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL","6XL","7XL"]},
  // ลายใหม่ที่เจอในออเดอร์ — รหัส/ราคาตรงตาม catalogMeta แล้ว (JPD111/JDJ121/JPJ121 ฿249)
  {"code":"JPD111","name":"พรรณวดี","type":"เสื้อโปโล","price":249,"colors":["ม่วง","ชมพู"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JDJ121","name":"ดวงใจ","type":"เสื้อโปโล","price":249,"colors":["ดำ"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  {"code":"JPJ121","name":"พิมพ์ใจ","type":"เสื้อโปโล","price":249,"colors":["ดำ"],"sizes":["XS","S","M","L","XL","2XL","3XL","4XL","5XL"]},
  // หมวด "ของแถม" สังเคราะห์ (เหมือน OEM) — กระเป๋าผ้าแถม/ของแถมโปรโมชัน ไม่นับเป็นลายเสื้อขาย
  {"code":"GIFT","name":"ของแถม","type":"ของแถม","price":0,"colors":[],"sizes":[]}
];

// สีไทย → โค้ดสีในรหัสสินค้า (เชื่อชื่อไทยเป็นหลัก — โค้ด WH ในตารางใช้มั่ว)
export const COLOR_TH2CODE = { 'ขาว':'WH','ดำ':'BK','กรม':'N','กรมท่า':'N','ฟ้า':'S','น้ำเงิน':'B','เขียว':'G','เหลือง':'Y','แดง':'RD','ชมพู':'PK','ม่วง':'PP','ส้ม':'OR','โอรส':'OR','ครีม':'C' };

// รหัส Shopee/MP เก่าที่ตารางลายเสื้อไม่มี → ชื่อลาย (เติมเองเพิ่มได้) — เฉพาะที่มั่นใจ
export const LEGACY_CODE_ALIAS = { 'FTC111':'TRICOT ชาย','C01':'จันทร์','C03':'กนก','C04':'ชบา','C06':'ดอกบัว','B01':'จันทร์','B03':'กนก','B04':'ชบา','B05':'สิริราช','A02':'ยาม','JJK110':'จันทร์-อปท' };

// คำพ้อง/สะกดต่าง ที่ "ชัวร์" → ลายมาตรฐานใน GOLDEN_DESIGNS (ใช้ทั้ง UI resolver และ import matcher)
//   term  = คำที่ลูกค้า/มาร์เก็ตเพลสพิมพ์ (ที่ catalog ไม่รู้จัก), design = ชื่อลายเป้าหมาย (ต้องตรง name ใน GOLDEN_DESIGNS)
//   ใช้เป็น fallback หลังลองจับคู่ catalog ตรงๆ ก่อน — รหัส SKU เต็มจะถูกยืมจากลายเป้าหมายตอน buildMatchers
export const BUILTIN_DESIGN_ALIASES = [
  { term: 'จันทกานต์', design: 'จันทร์' },          // แบรนด์ Juntakarn — ชื่อทางการของลาย "จันทร์"
  { term: 'Juntakarn', design: 'จันทร์' },
  { term: 'Jantakan',  design: 'จันทร์' },
  { term: 'Tricot',    design: 'TRICOT ชาย' },      // bare "Tricot" → ชาย (ตัวหลัก); "TRICOT หญิง" ยัง match catalog ตรงก่อน
  { term: 'TRICOT',    design: 'TRICOT ชาย' },
  { term: 'สาดสี กลม', design: 'สาดสี คอกลม' },     // ตกคำ "คอ"
  { term: 'สาดสี ปก', design: 'สาดสี คอปก' },       // ตกคำ "คอ"
  { term: 'ลายขอ รุ่นใหม่', design: 'ขอใหม่' },
  { term: 'สีดำ-',     design: 'OEM/สกรีนองค์กร' }, // catch-all งานสกรีนองค์กร: สีดำ-อปท / สีดำ-กระทรวง / สีดำ-อสม / สีดำ-สพฐ
  { term: 'ราษฎ์ภักดี แขนยาว', design: 'ราษภักดี แขนยาว' }, // สะกดตก "ร" (ราษฎ์→ราษฎร์) + ระบุแขนยาว → JRP211
  { term: 'กระเป๋าผ้า', design: 'ของแถม' },         // "กระเป๋าผ้า" เปล่า = ของแถม (ระบุ "แบบที่ N" จะ match CB1-3 ก่อนเพราะ kw ยาวกว่า)
  { term: 'แถม05',     design: 'ของแถม' },          // ของแถมโปรโมชัน
];

const _norm = s => (s||'').toString().trim().toLowerCase().replace(/\s+/g,'').replace(/[()"']/g,'');
const _designKeys = GOLDEN_DESIGNS.map(d => [_norm(d.name), d]).sort((a,b)=>b[0].length-a[0].length);
const _designByName = Object.fromEntries(GOLDEN_DESIGNS.map(d => [d.name, d]));
// คำพ้อง (normalize ไว้ล่วงหน้า) เรียงยาวสุดก่อน — ใช้เป็น fallback หลังลอง catalog ตรงๆ
const _aliasKeys = BUILTIN_DESIGN_ALIASES.map(a => [_norm(a.term), a.design]).sort((a,b)=>b[0].length-a[0].length);
// หาลายจากข้อความ (ชื่อสินค้า/variation/รายการขาย) — คืน design object หรือ null
export function resolveDesign(text) {
  const t = _norm(text); if (!t) return null;
  for (const [k,d] of _designKeys) if (k.length>=3 && t.includes(k)) return d;          // จับคู่ catalog ตรงก่อน
  for (const [k,name] of _aliasKeys) if (k.length>=3 && t.includes(k)) { const d=_designByName[name]; if (d) return d; } // แล้วค่อย fallback คำพ้อง
  return null;
}
// แกะสีไทยจากข้อความ → คืน {color, code} หรือ null
export function resolveColor(text) {
  const t = (text||'').toString();
  for (const th of Object.keys(COLOR_TH2CODE)) if (t.includes(th)) return { color: th, code: COLOR_TH2CODE[th] };
  return null;
}
// แกะไซซ์ (S..7XL) จากข้อความ
export function resolveSize(text) {
  const m = (text||'').toString().toUpperCase().match(/\b(XS|[2-7]XL|XL|S|M|L)\b/);
  return m ? m[1] : null;
}
// แนะนำลายใกล้เคียง (สะกดต่าง เช่น ดารารัตน์→ดารากานต์) — bigram Dice + โบนัสตัวขึ้นต้น
// คืน {name,code,...,score} ถ้ามั่นใจพอ (>=0.45) — ใช้เป็น "คำแนะนำ" ให้คนกดยืนยัน ไม่ auto บังคับ
function _bigrams(s){ const a=[]; for(let i=0;i<s.length-1;i++)a.push(s.slice(i,i+2)); return a; }
export function suggestDesign(text) {
  const t = _norm(text); if (t.length < 3) return null;
  const tb = _bigrams(t); if (!tb.length) return null;
  let best=null, score=0;
  for (const d of GOLDEN_DESIGNS) {
    const k = _norm(d.name); const kb = _bigrams(k); if (!kb.length) continue;
    const setk = new Set(kb); let inter=0; for (const g of tb) if (setk.has(g)) inter++;
    const dice = 2*inter/(tb.length+kb.length);
    const pref = t.slice(0,4) === k.slice(0,4) ? 0.15 : 0;   // ขึ้นต้นเหมือนกัน → น่าใช่
    const s = dice + pref;
    if (s > score) { score = s; best = d; }
  }
  return score >= 0.45 ? { ...best, score } : null;
}
