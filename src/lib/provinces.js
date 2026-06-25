/* ============================================================
   provinces.js — 77 จังหวัดไทย: ชื่อมาตรฐาน + พิกัด + ภาค + ตัวทำความสะอาดชื่อ
   ข้อมูลดิบมีทั้งอังกฤษ/ไทย/มี prefix (จังหวัด/ตำบล/เทศบาลนคร) → normalizeProvince() รวมเป็นจังหวัดเดียว
   region: N เหนือ · C กลาง · NE อีสาน · E ตะวันออก · W ตะวันตก · S ใต้
   ============================================================ */
// [th, en, lat, lng, region, ...aliasesEN(สะกดแปลกที่เจอในข้อมูล)]
const RAW = [
  ['กรุงเทพมหานคร', 'Bangkok', 13.75, 100.50, 'C', 'krungthep', 'bkk', 'bangkokmetropolis'],
  ['สมุทรปราการ', 'Samut Prakan', 13.60, 100.60, 'C'],
  ['นนทบุรี', 'Nonthaburi', 13.86, 100.51, 'C'],
  ['ปทุมธานี', 'Pathum Thani', 14.02, 100.53, 'C'],
  ['พระนครศรีอยุธยา', 'Ayutthaya', 14.35, 100.58, 'C', 'phranakhonsiayutthaya'],
  ['อ่างทอง', 'Ang Thong', 14.59, 100.46, 'C'],
  ['ลพบุรี', 'Lopburi', 14.80, 100.65, 'C'],
  ['สิงห์บุรี', 'Sing Buri', 14.89, 100.40, 'C'],
  ['ชัยนาท', 'Chai Nat', 15.19, 100.12, 'C', 'chainart'],
  ['สระบุรี', 'Saraburi', 14.53, 100.91, 'C'],
  ['นครนายก', 'Nakhon Nayok', 14.21, 101.21, 'C'],
  ['นครปฐม', 'Nakhon Pathom', 13.82, 100.06, 'C'],
  ['สุพรรณบุรี', 'Suphanburi', 14.47, 100.12, 'C', 'suphanburi'],
  ['สมุทรสาคร', 'Samut Sakhon', 13.55, 100.27, 'C'],
  ['สมุทรสงคราม', 'Samut Songkhram', 13.41, 100.00, 'C'],
  // เหนือ
  ['เชียงใหม่', 'Chiang Mai', 18.79, 98.99, 'N'],
  ['เชียงราย', 'Chiang Rai', 19.91, 99.83, 'N'],
  ['ลำปาง', 'Lampang', 18.29, 99.49, 'N'],
  ['ลำพูน', 'Lamphun', 18.57, 99.01, 'N'],
  ['แม่ฮ่องสอน', 'Mae Hong Son', 19.30, 97.97, 'N', 'maehongsorn'],
  ['น่าน', 'Nan', 18.78, 100.77, 'N'],
  ['พะเยา', 'Phayao', 19.17, 99.90, 'N'],
  ['แพร่', 'Phrae', 18.14, 100.14, 'N'],
  ['อุตรดิตถ์', 'Uttaradit', 17.62, 100.09, 'N'],
  // ภาคกลางตอนบน/ล่างเหนือ
  ['พิษณุโลก', 'Phitsanulok', 16.82, 100.27, 'C', 'phisanulok'],
  ['สุโขทัย', 'Sukhothai', 17.01, 99.82, 'C'],
  ['เพชรบูรณ์', 'Phetchabun', 16.42, 101.16, 'C', 'phetchaboon'],
  ['พิจิตร', 'Phichit', 16.44, 100.35, 'C'],
  ['กำแพงเพชร', 'Kamphaeng Phet', 16.48, 99.52, 'C'],
  ['นครสวรรค์', 'Nakhon Sawan', 15.70, 100.12, 'C', 'nakornsawan'],
  ['อุทัยธานี', 'Uthai Thani', 15.38, 100.02, 'C'],
  // ตะวันตก
  ['ตาก', 'Tak', 16.88, 99.13, 'W'],
  ['ราชบุรี', 'Ratchaburi', 13.53, 99.81, 'W'],
  ['กาญจนบุรี', 'Kanchanaburi', 14.02, 99.53, 'W'],
  ['เพชรบุรี', 'Phetchaburi', 13.11, 99.94, 'W'],
  ['ประจวบคีรีขันธ์', 'Prachuap Khiri Khan', 11.81, 99.80, 'W', 'prachuapkhiriikhan'],
  // ตะวันออก
  ['ชลบุรี', 'Chonburi', 13.36, 100.98, 'E'],
  ['ระยอง', 'Rayong', 12.68, 101.28, 'E'],
  ['จันทบุรี', 'Chanthaburi', 12.61, 102.10, 'E', 'chantaburi'],
  ['ตราด', 'Trat', 12.24, 102.51, 'E'],
  ['ฉะเชิงเทรา', 'Chachoengsao', 13.69, 101.07, 'E', 'chachongsao'],
  ['ปราจีนบุรี', 'Prachinburi', 14.05, 101.37, 'E'],
  ['สระแก้ว', 'Sa Kaeo', 13.82, 102.07, 'E', 'srakaeo'],
  // อีสาน
  ['นครราชสีมา', 'Nakhon Ratchasima', 14.97, 102.10, 'NE', 'nakornratchasima', 'korat'],
  ['บุรีรัมย์', 'Buriram', 14.99, 103.10, 'NE', 'burirum'],
  ['สุรินทร์', 'Surin', 14.88, 103.49, 'NE'],
  ['ศรีสะเกษ', 'Sisaket', 15.12, 104.32, 'NE'],
  ['อุบลราชธานี', 'Ubon Ratchathani', 15.24, 104.85, 'NE'],
  ['ยโสธร', 'Yasothon', 15.79, 104.15, 'NE', 'yasothorn'],
  ['ชัยภูมิ', 'Chaiyaphum', 15.81, 102.03, 'NE'],
  ['อำนาจเจริญ', 'Amnat Charoen', 15.86, 104.63, 'NE', 'amnartcharoen'],
  ['หนองบัวลำภู', 'Nong Bua Lam Phu', 17.20, 102.44, 'NE'],
  ['ขอนแก่น', 'Khon Kaen', 16.44, 102.84, 'NE'],
  ['อุดรธานี', 'Udon Thani', 17.41, 102.79, 'NE', 'udonthani'],
  ['เลย', 'Loei', 17.49, 101.72, 'NE'],
  ['หนองคาย', 'Nong Khai', 17.88, 102.74, 'NE'],
  ['มหาสารคาม', 'Maha Sarakham', 16.18, 103.30, 'NE'],
  ['ร้อยเอ็ด', 'Roi Et', 16.05, 103.65, 'NE'],
  ['กาฬสินธุ์', 'Kalasin', 16.43, 103.51, 'NE'],
  ['สกลนคร', 'Sakon Nakhon', 17.16, 104.15, 'NE', 'sakonnakorn'],
  ['นครพนม', 'Nakhon Phanom', 17.41, 104.78, 'NE'],
  ['มุกดาหาร', 'Mukdahan', 16.54, 104.72, 'NE'],
  ['บึงกาฬ', 'Bueng Kan', 18.36, 103.65, 'NE'],
  // ใต้
  ['นครศรีธรรมราช', 'Nakhon Si Thammarat', 8.43, 99.96, 'S', 'nakornsrithammarat'],
  ['กระบี่', 'Krabi', 8.09, 98.91, 'S'],
  ['พังงา', 'Phang Nga', 8.45, 98.53, 'S', 'phangnga'],
  ['ภูเก็ต', 'Phuket', 7.88, 98.39, 'S'],
  ['สุราษฎร์ธานี', 'Surat Thani', 9.14, 99.33, 'S'],
  ['ระนอง', 'Ranong', 9.96, 98.64, 'S'],
  ['ชุมพร', 'Chumphon', 10.49, 99.18, 'S'],
  ['สงขลา', 'Songkhla', 7.20, 100.60, 'S'],
  ['สตูล', 'Satun', 6.62, 100.07, 'S'],
  ['ตรัง', 'Trang', 7.56, 99.61, 'S'],
  ['พัทลุง', 'Phatthalung', 7.62, 100.08, 'S'],
  ['ปัตตานี', 'Pattani', 6.87, 101.25, 'S'],
  ['ยะลา', 'Yala', 6.54, 101.28, 'S'],
  ['นราธิวาส', 'Narathiwat', 6.43, 101.82, 'S'],
];

export const REGIONS = { N: 'ภาคเหนือ', C: 'ภาคกลาง', NE: 'ภาคอีสาน', E: 'ภาคตะวันออก', W: 'ภาคตะวันตก', S: 'ภาคใต้' };
export const PROVINCES = RAW.map(([th, en, lat, lng, region]) => ({ th, en, lat, lng, region }));
export const TH_BBOX = { latMin: 5.6, latMax: 20.5, lngMin: 97.3, lngMax: 105.7 };

const norm = (s) => String(s || '').toLowerCase().replace(/[\s\-.'`"]/g, '').replace(/ฯ/g, '').trim();
const stripPrefix = (s) => String(s || '').replace(/^(จังหวัด|ตำบล\s*|อำเภอ\s*|กิ่งอำเภอ\s*|เทศบาลนคร|เทศบาลเมือง|เทศบาลตำบล|อบต\.?\s*|เมือง)\s*/g, '').trim();

const IDX = {};
RAW.forEach(([th, en, lat, lng, region, ...aliases]) => {
  const p = { th, en, lat, lng, region };
  [th, en, ...aliases].forEach(a => { IDX[norm(a)] = p; });
});
// กรุงเทพ variants
IDX[norm('กรุงเทพ')] = IDX[norm('กรุงเทพมหานคร')];

function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
const KEYS = Object.keys(IDX);

// raw → {th,en,lat,lng,region} | null (จับคู่ไม่ได้)
export function matchProvince(raw) {
  const cleaned = stripPrefix(raw);
  const k = norm(cleaned);
  if (!k || /unknown|ไม่ระบุ|ว่าง/.test(k)) return null;
  if (IDX[k]) return IDX[k];
  // fuzzy: เทียบ key ที่ยาวใกล้กัน Levenshtein ≤2 (กันสะกดเพี้ยน)
  let best = null, bd = 3;
  for (const kk of KEYS) { if (Math.abs(kk.length - k.length) > 2) continue; const d = lev(k, kk); if (d < bd) { bd = d; best = IDX[kk]; } }
  return best;
}
export const normalizeProvince = (raw) => { const p = matchProvince(raw); return p ? p.th : null; };
