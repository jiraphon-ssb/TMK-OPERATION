import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, ResponsiveContainer,
  Tooltip, Cell, PieChart, Pie, AreaChart, Area, CartesianGrid, Legend,
} from 'recharts';
import {
  TrendingUp, AlertTriangle, Target, Users, Package,
  ArrowUpRight, ArrowDownRight, ShoppingBag, Wallet, Pencil,
  CalendarDays, MessageSquare, Plus, Copy, Save, ChevronUp,
  BarChart3, Zap, Activity, UserPlus, UserCheck, Eye,
} from 'lucide-react';

/* ================================================================
   MOCK DATA — ตรง JUNTAKARN
   ================================================================ */
const TARGET = 1000000, DAY = 18, DAYS = 30, ACOS_CEIL = 25;

const CH = [
  { id: 'shopee',   name: 'Shopee',   color: '#ee6a3a', target: 300000, mtd: 178000, orders: 312, newRev: 124600, oldRev: 53400, newCust: 196, oldCust: 71, ad: 28000, hasAd: true },
  { id: 'tiktok',   name: 'Tiktok',   color: '#46c8d4', target: 220000, mtd: 134000, orders: 248, newRev: 104500, oldRev: 29500, newCust: 168, oldCust: 39, ad: 31000, hasAd: true },
  { id: 'lazada',   name: 'Lazada',   color: '#6b5ce0', target: 180000, mtd: 89000,  orders: 151, newRev: 66750,  oldRev: 22250, newCust: 92,  oldCust: 28, ad: 15000, hasAd: true },
  { id: 'facebook', name: 'Facebook', color: '#4a8be0', target: 160000, mtd: 78000,  orders: 119, newRev: 56160,  oldRev: 21840, newCust: 64,  oldCust: 24, ad: 42000, hasAd: true },
  { id: 'line',     name: 'Line',     color: '#06c755', target: 90000,  mtd: 50000,  orders: 58,  newRev: 17500,  oldRev: 32500, newCust: 12,  oldCust: 34, ad: 0,     hasAd: false },
  { id: 'crm',      name: 'CRM',      color: '#d9a441', target: 50000,  mtd: 29000,  orders: 31,  newRev: 3480,   oldRev: 25520, newCust: 4,   oldCust: 32, ad: 0,     hasAd: false },
];

const dailyMonth = [26,24,28,30,35,38,27,25,31,33,29,28,31,30,38,42,29,33].map((v,i) => ({ d: i+1, rev: v*1000 }));
const month3 = [{ m: 'เม.ย.', actual: 920000, proj: 0 },{ m: 'พ.ค.', actual: 968000, proj: 0 },{ m: 'มิ.ย.', actual: 558000, proj: 372000 }];
const yoy = [
  { m: 'ม.ค.', y25: 720000, y26: 880000 },{ m: 'ก.พ.', y25: 740000, y26: 910000 },
  { m: 'มี.ค.', y25: 780000, y26: 945000 },{ m: 'เม.ย.', y25: 760000, y26: 920000 },
  { m: 'พ.ค.', y25: 810000, y26: 968000 },{ m: 'มิ.ย.', y25: 690000, y26: 558000 },
];

const fb = { revenue: 78000, spend: 42000, inquiries: 420, orders: 119, newCust: 78, oldCust: 41 };
fb.roas = fb.revenue / fb.spend; fb.acos = (fb.spend / fb.revenue) * 100; fb.conv = (fb.orders / fb.inquiries) * 100;
fb.aov = fb.revenue / fb.orders; fb.cpInq = fb.spend / fb.inquiries; fb.cpOrd = fb.spend / fb.orders; fb.cac = fb.spend / fb.newCust;
const fbWeekly = [{ w: 'Wk1', inq: 128, ord: 36 },{ w: 'Wk2', inq: 142, ord: 40 },{ w: 'Wk3', inq: 150, ord: 43 }];
const fbDaily = [3.8,3.5,4.0,4.2,4.8,5.2,3.9,3.6,4.3,4.6,4.0,3.5,4.1,3.9,4.9,5.4,3.6,4.7].map((v,i) => ({ d: i+1, rev: Math.round(v*1000) }));
const fbMonth3 = [{ m: 'เม.ย.', actual: 92000 },{ m: 'พ.ค.', actual: 98000 },{ m: 'มิ.ย.', actual: 78000 }];
const fbMsgTrend = [{ m: 'ม.ค.', v: 780 },{ m: 'ก.พ.', v: 840 },{ m: 'มี.ค.', v: 910 },{ m: 'เม.ย.', v: 880 },{ m: 'พ.ค.', v: 980 },{ m: 'มิ.ย.', v: 420 }];

const products = [
  { rank: 1, name: 'เสื้อโปโล Signature', units: 1180, rev: 165200, stock: 'low' },
  { rank: 2, name: 'เสื้อยืด Cotton Comfort', units: 920, rev: 110400, stock: 'ok' },
  { rank: 3, name: 'เสื้อเชิ้ตลินินลำลอง', units: 380, rev: 95000, stock: 'ok' },
  { rank: 4, name: 'กางเกงขาสั้น Chino', units: 540, rev: 75600, stock: 'low' },
  { rank: 5, name: 'เสื้อแจ็คเก็ตกันลม', units: 165, rev: 66000, stock: 'out' },
  { rank: 6, name: 'เสื้อโปโล Basic', units: 480, rev: 52800, stock: 'ok' },
];
const colors = [{ name: 'ดำ', pct: 28, hex: '#1c1c1c' },{ name: 'กรมท่า', pct: 22, hex: '#23395b' },{ name: 'ขาว', pct: 18, hex: '#e8e4da' },{ name: 'เทา', pct: 14, hex: '#8a8276' },{ name: 'เขียวขุ่น', pct: 10, hex: '#5a6e54' },{ name: 'ครีม', pct: 8, hex: '#d8c9a8' }];
const sizes = [{ s: 'S', pct: 8 },{ s: 'M', pct: 24 },{ s: 'L', pct: 31 },{ s: 'XL', pct: 22 },{ s: '2XL', pct: 11 },{ s: '3XL', pct: 4 }];

const retTrend = [{ w: 'Wk1', pct: 29 },{ w: 'Wk2', pct: 31 },{ w: 'Wk3', pct: 33 }];
const dailyLog = [
  { date: '18 มิ.ย.', Shopee: 11000, Tiktok: 8500, Lazada: 4800, Facebook: 4200, Line: 2800, CRM: 1700, ad: 7000, note: 'ไลฟ์เย็น 1 รอบ' },
  { date: '17 มิ.ย.', Shopee: 9200, Tiktok: 7800, Lazada: 4100, Facebook: 3600, Line: 2900, CRM: 1400, ad: 6100, note: '' },
  { date: '16 มิ.ย.', Shopee: 14000, Tiktok: 10500, Lazada: 6200, Facebook: 5400, Line: 3600, CRM: 2300, ad: 7800, note: 'อาทิตย์ ยอดพีค' },
  { date: '15 มิ.ย.', Shopee: 12800, Tiktok: 9600, Lazada: 5700, Facebook: 4900, Line: 3100, CRM: 1900, ad: 7400, note: 'เสาร์' },
  { date: '14 มิ.ย.', Shopee: 9800, Tiktok: 7400, Lazada: 4200, Facebook: 3900, Line: 2700, CRM: 1900, ad: 6800, note: '' },
  { date: '13 มิ.ย.', Shopee: 10200, Tiktok: 7900, Lazada: 4400, Facebook: 4100, Line: 2700, CRM: 1700, ad: 6500, note: 'ปล่อย LE drop' },
  { date: '12 มิ.ย.', Shopee: 8900, Tiktok: 7100, Lazada: 3900, Facebook: 3500, Line: 2600, CRM: 1300, ad: 6200, note: '' },
];

/* computed */
const MTD = CH.reduce((s,c) => s+c.mtd, 0);
const ORD = CH.reduce((s,c) => s+c.orders, 0);
const AD = CH.reduce((s,c) => s+c.ad, 0);
const NEW_REV = CH.reduce((s,c) => s+c.newRev, 0);
const OLD_REV = CH.reduce((s,c) => s+c.oldRev, 0);
const NEW_C = CH.reduce((s,c) => s+c.newCust, 0);
const OLD_C = CH.reduce((s,c) => s+c.oldCust, 0);
const PACE_TGT = Math.round((TARGET/DAYS)*DAY);
const PACE_PCT = (MTD/PACE_TGT)*100;
const RUN = Math.round((MTD/DAY)*DAYS);
const GAP = TARGET - RUN;
const AOV = MTD/ORD;
const ACOS_TOT = (AD/MTD)*100;
const CAC = AD/NEW_C;
const OLD_PCT = (OLD_REV/MTD)*100;

/* helpers */
const B = n => '฿'+Math.round(n).toLocaleString('th-TH');
const Bk = n => n>=1e6?'฿'+(n/1e6).toFixed(1)+'M':n>=1000?'฿'+(n/1000).toFixed(0)+'k':'฿'+n;
const P = n => n.toFixed(1)+'%';
const ps = p => p>=95?{c:'var(--success)',l:'ทันเป้า',d:'🟢'}:p>=80?{c:'var(--warning)',l:'ตามเป้าช้า',d:'🟡'}:{c:'var(--danger)',l:'หลุดเป้า',d:'🔴'};
const stColor = s => s==='out'?'var(--danger)':s==='low'?'var(--warning)':'var(--success)';
const stLabel = s => s==='out'?'หมดสต็อก':s==='low'?'ใกล้หมด':'ปกติ';
const status = ps(PACE_PCT);
const tip = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 'var(--text-small)', padding: '8px 12px' };

function useCountUp(t, ms=800) {
  const [v,setV]=useState(0);
  useEffect(()=>{let r,s;const step=t2=>{if(!s)s=t2;const p=Math.min((t2-s)/ms,1);setV(t*(1-Math.pow(1-p,3)));if(p<1)r=requestAnimationFrame(step);};r=requestAnimationFrame(step);return()=>cancelAnimationFrame(r);},[t,ms]);
  return v;
}

/* ================================================================
   STYLES
   ================================================================ */
const S = {
  wrap: { fontFamily: 'var(--font-family)', color: 'var(--text-main)' },
  g2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  g3: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 },
  g4: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 },
  pnl: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 },
  pnlSm: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 },
  lbl: { fontSize: 'var(--text-xs)', color: 'var(--text-caption)', fontWeight: 'var(--fw-bold)', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' },
  big: { fontSize: 'var(--text-hero-lg)', fontWeight: 'var(--fw-bold)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' },
  mid: { fontSize: 'var(--text-hero)', fontWeight: 'var(--fw-bold)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' },
  sm: { fontSize: 'var(--text-title)', fontWeight: 'var(--fw-semibold)', fontVariantNumeric: 'tabular-nums' },
  cap: { fontSize: 'var(--text-small)', color: 'var(--text-caption)' },
  chip: c => ({ fontSize: 'var(--text-xs)', fontWeight: 'var(--fw-bold)', padding: '2px 9px', borderRadius: 20, background: c+'1a', color: c, display: 'inline-block' }),
  dot: c => ({ width: 10, height: 10, borderRadius: '50%', background: c, flexShrink: 0 }),
  th: { padding: '8px 12px', fontSize: 'var(--text-xs)', color: 'var(--text-caption)', fontWeight: 'var(--fw-bold)', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap', borderBottom: '2px solid var(--border)' },
  td: { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-body)' },
  warn: { display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--warning-light)', border: '1px solid var(--warning)', borderRadius: 10, padding: '10px 14px', fontSize: 'var(--text-small-md)', lineHeight: 1.5 },
};

/* ================================================================
   MODAL
   ================================================================ */
function EntryModal({ onClose }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0,10));
  const [rows, setRows] = useState(CH.map(c => ({ id:c.id, rev:'', ord:'', ad:'', inq:'' })));
  const [note, setNote] = useState('');
  const up = (i,k,v) => { const c=[...rows]; c[i]={...c[i],[k]:v}; setRows(c); };

  const sum = useMemo(() => {
    const tRev=rows.reduce((s,r)=>s+(+r.rev||0),0), tOrd=rows.reduce((s,r)=>s+(+r.ord||0),0), tAd=rows.reduce((s,r)=>s+(+r.ad||0),0), tInq=rows.reduce((s,r)=>s+(+r.inq||0),0);
    const aov=tOrd>0?tRev/tOrd:0, acos=tRev>0?(tAd/tRev)*100:0, newMtd=MTD+tRev, pPct=((newMtd)/((TARGET/DAYS)*(DAY+1)))*100, rr=Math.round(newMtd/(DAY+1)*DAYS), need=(DAYS-DAY-1)>0?Math.ceil((TARGET-newMtd)/(DAYS-DAY-1)):0;
    const avg=dailyMonth.reduce((s,d)=>s+d.rev,0)/dailyMonth.length, vsAvg=avg>0?((tRev-avg)/avg)*100:0;
    const tips=[];
    if(tRev<=0) return {tRev,tOrd,tAd,tInq,aov,acos,newMtd,pPct,rr,need,vsAvg,tips,ok:false};
    if(vsAvg>20) tips.push({i:'🚀',c:'var(--success)',m:`ยอดสูงกว่าค่าเฉลี่ย ${Math.abs(vsAvg).toFixed(0)}%`});
    else if(vsAvg<-20) tips.push({i:'📉',c:'var(--danger)',m:`ยอดต่ำกว่าค่าเฉลี่ย ${Math.abs(vsAvg).toFixed(0)}%`});
    if(acos>40) tips.push({i:'🔴',c:'var(--danger)',m:`ACOS ${acos.toFixed(1)}% สูงมาก — pause แคมเปญที่ไม่คุ้ม`});
    else if(acos>ACOS_CEIL) tips.push({i:'🟡',c:'var(--warning)',m:`ACOS ${acos.toFixed(1)}% เกินเพดาน — ทบทวน targeting`});
    else if(tAd>0) tips.push({i:'✅',c:'var(--success)',m:`ACOS ${acos.toFixed(1)}% ดี`});
    if(pPct>=95) tips.push({i:'🎯',c:'var(--success)',m:`Pace ${pPct.toFixed(0)}% ทันเป้า! Run Rate ${B(rr)}`});
    else tips.push({i:'⚡',c:'var(--warning)',m:`ต้องเฉลี่ย ${B(need)}/วัน ที่เหลือถึงจะถึงเป้า`});
    rows.forEach(r=>{const ch=CH.find(c=>c.id===r.id);if(ch?.hasAd&&(+r.rev)>0&&(+r.ad)>0){const a=((+r.ad)/(+r.rev))*100;if(a>50)tips.push({i:'⚠️',c:'var(--danger)',m:`${ch.name}: ACOS ${a.toFixed(0)}% — เกินครึ่งยอดขาย`});}});
    return {tRev,tOrd,tAd,tInq,aov,acos,newMtd,pPct,rr,need,vsAvg,tips,ok:true};
  },[rows]);

  return (
    <div style={{ position:'fixed',inset:0,zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center' }} onClick={onClose}>
      <div style={{ position:'absolute',inset:0,background:'rgba(0,0,0,0.45)',backdropFilter:'blur(4px)' }}/>
      <div style={{ position:'relative',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:24,width:'92%',maxWidth:720,maxHeight:'92vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18 }}>
          <div style={{ display:'flex',alignItems:'center',gap:10 }}>
            <div style={{ width:36,height:36,borderRadius:10,background:'var(--primary)18',display:'flex',alignItems:'center',justifyContent:'center' }}><Pencil size={18} color="var(--primary)"/></div>
            <div><div style={{ fontSize:'var(--text-title)',fontWeight:'var(--fw-bold)' }}>บันทึกยอดขายประจำวัน</div><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)' }}>กรอกยอดทุกช่องทางแล้วกดบันทึก</div></div>
          </div>
          <button onClick={onClose} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--text-caption)',fontSize:22,padding:4 }}>✕</button>
        </div>
        <div style={{ display:'flex',gap:8,marginBottom:16 }}>
          <input type="date" className="form-input" value={date} onChange={e=>setDate(e.target.value)} style={{ width:160 }}/>
          <button className="btn btn-secondary" style={{ display:'flex',alignItems:'center',gap:4,fontSize:'var(--text-small)' }}><Copy size={12}/> เมื่อวาน</button>
        </div>
        <table style={{ width:'100%',borderCollapse:'collapse' }}>
          <thead><tr>{['ช่องทาง','ยอดขาย (฿)','ออร์เดอร์','ค่าแอด (฿)','แชท'].map((h,i)=><th key={h} style={{...S.th,textAlign:i===0?'left':'right'}}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r,i)=>{const ch=CH.find(c=>c.id===r.id);return(
            <tr key={r.id}>
              <td style={S.td}><div style={{ display:'flex',alignItems:'center',gap:6 }}><div style={S.dot(ch?.color)}/>{ch?.name}</div></td>
              <td style={{...S.td,padding:'4px 8px'}}><input type="number" className="form-input" style={{ textAlign:'right',width:110 }} placeholder="0" value={r.rev} onChange={e=>up(i,'rev',e.target.value)}/></td>
              <td style={{...S.td,padding:'4px 8px'}}><input type="number" className="form-input" style={{ textAlign:'right',width:75 }} placeholder="0" value={r.ord} onChange={e=>up(i,'ord',e.target.value)}/></td>
              <td style={{...S.td,padding:'4px 8px'}}><input type="number" className="form-input" style={{ textAlign:'right',width:110 }} placeholder={ch?.hasAd?'0':'—'} disabled={!ch?.hasAd} value={r.ad} onChange={e=>up(i,'ad',e.target.value)}/></td>
              <td style={{...S.td,padding:'4px 8px'}}><input type="number" className="form-input" style={{ textAlign:'right',width:75 }} placeholder="0" value={r.inq} onChange={e=>up(i,'inq',e.target.value)}/></td>
            </tr>);})}</tbody>
        </table>
        {sum.ok&&(<div style={{ marginTop:16,background:'var(--surface-accent)',border:'1px solid var(--border)',borderRadius:12,padding:14 }}>
          <div style={S.lbl}>สรุปวันนี้</div>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:4,marginBottom:sum.tips.length?12:0 }}>
            {[{l:'ยอดรวม',v:B(sum.tRev),c:'var(--primary)',s:`${sum.vsAvg>=0?'▲':'▼'}${Math.abs(sum.vsAvg).toFixed(0)}% vs avg`},{l:'ออร์เดอร์',v:String(sum.tOrd),c:'var(--kpi-blue)',s:`AOV ${B(sum.aov)}`},{l:'ค่าแอด',v:B(sum.tAd),c:'var(--text-caption)',s:`ACOS ${sum.acos.toFixed(1)}%`},{l:'MTD ใหม่',v:B(sum.newMtd),c:'var(--text-heading)',s:P((sum.newMtd/TARGET)*100)},{l:'Run Rate',v:B(sum.rr),c:sum.rr>=TARGET?'var(--success)':'var(--warning)',s:`${ps(sum.pPct).d} ${P(sum.pPct)}`}].map(x=>(<div key={x.l} style={{ textAlign:'center',padding:'6px 2px' }}><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)',marginBottom:2 }}>{x.l}</div><div style={{ fontSize:'var(--text-title)',fontWeight:'var(--fw-bold)',color:x.c,fontVariantNumeric:'tabular-nums' }}>{x.v}</div><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)' }}>{x.s}</div></div>))}
          </div>
          {sum.tips.length>0&&(<div style={{ display:'flex',flexDirection:'column',gap:6 }}>
            <div style={S.lbl}>คำแนะนำ</div>
            {sum.tips.map((t,i)=>(<div key={i} style={{ display:'flex',alignItems:'flex-start',gap:8,padding:'6px 10px',borderRadius:8,background:t.c+'0d',borderLeft:`3px solid ${t.c}` }}><span>{t.i}</span><span style={{ fontSize:'var(--text-small)',lineHeight:1.5 }}>{t.m}</span></div>))}
          </div>)}
        </div>)}
        <div style={{ marginTop:14 }}><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)',marginBottom:4 }}>NOTE</div><input type="text" className="form-input" placeholder="ไลฟ์เย็น 1 รอบ, Flash Sale..." value={note} onChange={e=>setNote(e.target.value)} style={{ width:'100%' }}/></div>
        <div style={{ display:'flex',justifyContent:'flex-end',gap:8,marginTop:18 }}>
          <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" style={{ display:'flex',alignItems:'center',gap:6 }}><Save size={14}/> บันทึก</button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   MAIN
   ================================================================ */
export default function SalesDashboard() {
  const [modal, setModal] = useState(false);
  const [sub, setSub] = useState('overview');
  const TABS = [
    { k:'overview', l:'ภาพรวม', i:BarChart3 },
    { k:'channels', l:'ช่องทาง', i:Zap },
    { k:'ads',      l:'โฆษณา & FB', i:MessageSquare },
    { k:'products', l:'สินค้า', i:Package },
    { k:'customers',l:'ลูกค้า', i:Users },
    { k:'log',      l:'บันทึกรายวัน', i:CalendarDays },
  ];
  const tabS = a => ({ padding:'7px 16px',borderRadius:8,fontSize:'var(--text-small)',fontWeight:'var(--fw-bold)',cursor:'pointer',border:'none',display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap',background:a?'var(--primary)':'var(--surface-hover)',color:a?'#fff':'var(--text-caption)',transition:'all 0.2s' });
  const mtdAnim = useCountUp(MTD);
  const paceAnim = useCountUp(PACE_PCT);

  return (
    <div style={S.wrap}>
      {/* Header */}
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:10 }}>
        <div><div style={{ fontSize:'var(--text-hero)',fontWeight:'var(--fw-bold)' }}>Sales Dashboard</div><div style={S.cap}>กลางเดือน วันที่ {DAY} จาก {DAYS} | เป้ารวม {B(TARGET)}/เดือน</div></div>
        <button className="btn btn-primary" onClick={()=>setModal(true)} style={{ display:'flex',alignItems:'center',gap:6 }}><Plus size={14}/> บันทึกยอดขาย</button>
      </div>
      {modal && <EntryModal onClose={()=>setModal(false)}/>}

      {/* Sub tabs */}
      <div style={{ display:'flex',gap:6,marginBottom:16,flexWrap:'wrap' }}>{TABS.map(t=><button key={t.k} style={tabS(sub===t.k)} onClick={()=>setSub(t.k)}><t.i size={14}/>{t.l}</button>)}</div>

      {/* ====== OVERVIEW ====== */}
      {sub==='overview'&&(<>
        {/* Hero: big MTD + pace donut */}
        <div style={{ ...S.g2, marginBottom:16 }}>
          <div style={S.pnl}>
            <div style={S.lbl}>ยอดขาย MTD</div>
            <div style={{ ...S.big, color:'var(--primary)', fontSize: 36 }}>{B(Math.round(mtdAnim))}</div>
            <div style={{ ...S.cap, marginTop:6 }}>เป้า {B(TARGET)} | ขาดอีก {B(TARGET-MTD)}</div>
            <div style={{ display:'flex',gap:16,marginTop:12 }}>
              <div><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)' }}>Run Rate</div><div style={{ ...S.sm, color: GAP>0?'var(--warning)':'var(--success)' }}>{B(RUN)}</div></div>
              <div><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)' }}>Orders</div><div style={S.sm}>{ORD.toLocaleString()}</div></div>
              <div><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)' }}>AOV</div><div style={S.sm}>{B(AOV)}</div></div>
              <div><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)' }}>YoY พ.ค.</div><div style={{ ...S.sm, color:'var(--success)' }}>+{((968000-810000)/810000*100).toFixed(0)}%</div></div>
            </div>
          </div>
          <div style={{ ...S.pnl, display:'flex', alignItems:'center', gap:24 }}>
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={[{ v: Math.min(PACE_PCT,100) },{ v: Math.max(0,100-PACE_PCT) }]} cx="50%" cy="50%" innerRadius={55} outerRadius={75} startAngle={90} endAngle={-270} dataKey="v" paddingAngle={0}>
                  <Cell fill={status.c}/><Cell fill="var(--border)"/>
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position:'relative', marginLeft:-160, width:160, textAlign:'center', pointerEvents:'none' }}>
              <div style={{ fontSize:28, fontWeight:'var(--fw-bold)', color: status.c }}>{P(paceAnim)}</div>
              <div style={{ fontSize:'var(--text-xs)', color:'var(--text-caption)' }}>Pace</div>
            </div>
            <div>
              <div style={{ marginBottom:8 }}><span style={S.chip(status.c)}>{status.d} {status.l}</span></div>
              <div style={S.cap}>MTD {B(MTD)} / เป้า pace {B(PACE_TGT)}</div>
              <div style={{ ...S.cap, marginTop:4 }}>ต้องเฉลี่ย {B(Math.ceil((TARGET-MTD)/(DAYS-DAY)))}/วัน</div>
              <div style={{ display:'flex', gap:12, marginTop:10 }}>
                <div><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)' }}>Ad Spend</div><div style={S.sm}>{B(AD)}</div></div>
                <div><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)' }}>ACOS</div><div style={{ ...S.sm, color: ACOS_TOT<=ACOS_CEIL?'var(--success)':'var(--warning)' }}>{P(ACOS_TOT)}</div></div>
                <div><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)' }}>CAC</div><div style={S.sm}>{B(CAC)}</div></div>
              </div>
            </div>
          </div>
        </div>

        {/* Warnings */}
        {PACE_PCT<95&&<div style={{ ...S.warn, marginBottom:16, borderLeft:`3px solid ${status.c}` }}><AlertTriangle size={15} color={status.c}/><span>ยอดรวม {B(MTD)} — {status.l} ({P(PACE_PCT)}) ต้องเฉลี่ย {B(Math.ceil((TARGET-MTD)/(DAYS-DAY)))}/วัน ที่เหลือ {DAYS-DAY} วัน</span></div>}
        {ACOS_TOT>ACOS_CEIL&&<div style={{ ...S.warn, marginBottom:16, borderLeft:'3px solid var(--warning)' }}><AlertTriangle size={15} color="var(--warning)"/><span>ACOS รวม {P(ACOS_TOT)} เกินเพดาน {ACOS_CEIL}% — Facebook ACOS {P(fb.acos)} สูงสุด ทบทวน budget allocation</span></div>}

        {/* Channel bars */}
        <div style={{ ...S.pnl, marginBottom:16 }}>
          <div style={S.lbl}>สัดส่วนรายได้ตามช่องทาง</div>
          {CH.map(c=>{const pct=(c.mtd/MTD)*100;return(
            <div key={c.id} style={{ display:'flex',alignItems:'center',gap:10,marginBottom:8 }}>
              <div style={{ width:70,fontSize:'var(--text-small)',fontWeight:'var(--fw-semibold)',display:'flex',alignItems:'center',gap:6 }}><div style={S.dot(c.color)}/>{c.name}</div>
              <div style={{ flex:1,height:20,borderRadius:6,background:'var(--border)',overflow:'hidden',display:'flex' }}>
                <div style={{ width:`${(c.newRev/MTD)*100}%`,background:c.color,height:'100%' }}/>
                <div style={{ width:`${(c.oldRev/MTD)*100}%`,background:c.color,opacity:0.35,height:'100%' }}/>
              </div>
              <div style={{ width:70,textAlign:'right',fontSize:'var(--text-small)',fontWeight:'var(--fw-bold)' }}>{B(c.mtd)}</div>
              <div style={{ width:40,textAlign:'right',fontSize:'var(--text-xs)',color:'var(--text-caption)' }}>{pct.toFixed(0)}%</div>
            </div>
          );})}
          <div style={{ display:'flex',gap:12,marginTop:6,fontSize:'var(--text-xs)',color:'var(--text-caption)' }}>
            <span>■ สีเข้ม = ลูกค้าใหม่ ({P((NEW_REV/MTD)*100)})</span>
            <span>■ สีอ่อน = ลูกค้าเก่า ({P(OLD_PCT)})</span>
          </div>
        </div>

        {/* Charts */}
        <div style={{ ...S.g3, marginBottom:16 }}>
          <div style={S.pnl}><div style={S.lbl}>ยอดขายรายวัน</div><ResponsiveContainer width="100%" height={200}><AreaChart data={dailyMonth}><defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25}/><stop offset="100%" stopColor="var(--primary)" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/><XAxis dataKey="d" tick={{ fontSize:10,fill:'var(--text-caption)' }}/><YAxis tick={{ fontSize:10,fill:'var(--text-caption)' }} tickFormatter={Bk}/><Tooltip contentStyle={tip} formatter={v=>[B(v),'ยอด']}/><Area type="monotone" dataKey="rev" stroke="var(--primary)" fill="url(#ag)" strokeWidth={2}/></AreaChart></ResponsiveContainer></div>
          <div style={S.pnl}><div style={S.lbl}>3 เดือนล่าสุด</div><ResponsiveContainer width="100%" height={200}><BarChart data={month3}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/><XAxis dataKey="m" tick={{ fontSize:10,fill:'var(--text-caption)' }}/><YAxis tick={{ fontSize:10,fill:'var(--text-caption)' }} tickFormatter={Bk}/><Tooltip contentStyle={tip} formatter={v=>[B(v)]}/><Bar dataKey="actual" stackId="a" fill="var(--primary)" name="Actual"/><Bar dataKey="proj" stackId="a" fill="var(--primary)" fillOpacity={0.25} radius={[4,4,0,0]} name="Projected"/></BarChart></ResponsiveContainer></div>
          <div style={S.pnl}><div style={S.lbl}>Year-over-Year</div><ResponsiveContainer width="100%" height={200}><LineChart data={yoy}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/><XAxis dataKey="m" tick={{ fontSize:10,fill:'var(--text-caption)' }}/><YAxis tick={{ fontSize:10,fill:'var(--text-caption)' }} tickFormatter={Bk}/><Tooltip contentStyle={tip} formatter={v=>[B(v)]}/><Line type="monotone" dataKey="y25" stroke="var(--text-light)" strokeWidth={2} dot={{ r:3 }} name="2025"/><Line type="monotone" dataKey="y26" stroke="var(--primary)" strokeWidth={2} dot={{ r:3 }} name="2026"/><Legend wrapperStyle={{ fontSize:11 }}/></LineChart></ResponsiveContainer></div>
        </div>
      </>)}

      {/* ====== CHANNELS ====== */}
      {sub==='channels'&&(<div style={S.g3}>{CH.map(c=>{const pPct=c.target>0?(c.mtd/((c.target/DAYS)*DAY))*100:0;const st=ps(pPct);const roas=c.ad>0?c.mtd/c.ad:null;const acos=c.ad>0?(c.ad/c.mtd)*100:null;const tot=c.newCust+c.oldCust;const nPct=tot>0?(c.newCust/tot)*100:0;return(
        <div key={c.id} style={{ ...S.pnlSm, borderLeft:`3px solid ${c.color}` }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8 }}>
            <div style={{ display:'flex',alignItems:'center',gap:8 }}><div style={S.dot(c.color)}/><span style={{ fontWeight:'var(--fw-bold)' }}>{c.name}</span></div>
            <span style={S.chip(st.c)}>{st.d} {st.l}</span>
          </div>
          <div style={S.mid}>{B(c.mtd)}</div>
          <div style={{ display:'flex',alignItems:'center',gap:8,marginTop:6 }}>
            <div style={{ flex:1,height:6,borderRadius:3,background:'var(--border)',overflow:'hidden' }}><div style={{ width:`${Math.min((c.mtd/c.target)*100,100)}%`,height:'100%',borderRadius:3,background:c.color }}/></div>
            <span style={{ fontSize:'var(--text-small)',fontWeight:'var(--fw-bold)',color:c.color }}>{P((c.mtd/c.target)*100)}</span>
          </div>
          <div style={{ display:'flex',alignItems:'center',gap:4,marginTop:8,height:14,borderRadius:3,overflow:'hidden' }}>
            <div style={{ width:`${(c.newRev/c.mtd)*100}%`,background:c.color,height:'100%',borderRadius:3 }}/>
            <div style={{ width:`${(c.oldRev/c.mtd)*100}%`,background:c.color,opacity:0.3,height:'100%',borderRadius:3 }}/>
          </div>
          <div style={{ display:'flex',justifyContent:'space-between',fontSize:'var(--text-xs)',color:'var(--text-caption)',marginTop:4 }}>
            <span>ใหม่ {B(c.newRev)} ({P((c.newRev/c.mtd)*100)})</span><span>เก่า {B(c.oldRev)}</span>
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginTop:10 }}>
            <div><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)' }}>Orders</div><div style={S.sm}>{c.orders}</div></div>
            <div><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)' }}>AOV</div><div style={S.sm}>{B(c.mtd/c.orders)}</div></div>
            <div><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)' }}>ใหม่</div><div style={{ ...S.sm,color:'var(--success)' }}>{c.newCust} ({P(nPct)})</div></div>
          </div>
          {c.hasAd&&(<div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginTop:8,paddingTop:8,borderTop:'1px solid var(--border)' }}>
            <div><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)' }}>Ad</div><div style={{ ...S.sm,color:'var(--text-caption)' }}>{Bk(c.ad)}</div></div>
            <div><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)' }}>ROAS</div><div style={{ ...S.sm,color:roas>=3?'var(--success)':roas>=2?'var(--warning)':'var(--danger)' }}>{roas?.toFixed(1)}x</div></div>
            <div><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)' }}>ACOS</div><div style={{ ...S.sm,color:acos<=ACOS_CEIL?'var(--success)':acos<=40?'var(--warning)':'var(--danger)' }}>{acos?P(acos):'—'}</div></div>
          </div>)}
        </div>
      );})}</div>)}

      {/* ====== ADS & FB ====== */}
      {sub==='ads'&&(<>
        <div style={{ ...S.pnl, marginBottom:16 }}>
          <div style={S.lbl}>Ad Performance</div>
          {CH.filter(c=>c.hasAd).map(c=>{const r=c.mtd/c.ad,a=(c.ad/c.mtd)*100;return(
            <div key={c.id} style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:'1px solid var(--border)' }}>
              <div style={S.dot(c.color)}/><span style={{ flex:1,fontWeight:'var(--fw-bold)' }}>{c.name}</span>
              <div style={{ textAlign:'right',width:80 }}><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)' }}>Revenue</div><div style={S.sm}>{Bk(c.mtd)}</div></div>
              <div style={{ textAlign:'right',width:65 }}><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)' }}>Spend</div><div style={{ ...S.sm,color:'var(--text-caption)' }}>{Bk(c.ad)}</div></div>
              <div style={{ textAlign:'right',width:50 }}><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)' }}>ROAS</div><div style={{ ...S.sm,color:r>=3?'var(--success)':r>=2?'var(--warning)':'var(--danger)' }}>{r.toFixed(1)}x</div></div>
              <div style={{ textAlign:'right',width:50 }}><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)' }}>ACOS</div><div style={{ ...S.sm,color:a<=ACOS_CEIL?'var(--success)':a<=40?'var(--warning)':'var(--danger)' }}>{P(a)}</div></div>
            </div>);})}
        </div>
        {/* FB Deep Dive */}
        <div style={{ ...S.pnl, borderLeft:'3px solid #4a8be0' }}>
          <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:14 }}><MessageSquare size={18} color="#4a8be0"/><span style={{ fontSize:'var(--text-title)',fontWeight:'var(--fw-bold)' }}>Facebook Deep Dive</span></div>
          <div style={{ ...S.g4, marginBottom:14 }}>
            {[{l:'Revenue',v:B(fb.revenue)},{l:'Ad Spend',v:B(fb.spend)},{l:'ROAS',v:fb.roas.toFixed(2)+'x',c:fb.roas>=2?'var(--success)':'var(--danger)'},{l:'ACOS',v:P(fb.acos),c:fb.acos<=ACOS_CEIL?'var(--success)':'var(--danger)'}].map(x=>(<div key={x.l}><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)',textTransform:'uppercase',marginBottom:4 }}>{x.l}</div><div style={{ ...S.mid,color:x.c||'var(--text-heading)' }}>{x.v}</div></div>))}
          </div>
          <div style={{ ...S.g3, marginBottom:14 }}>
            <div style={S.pnlSm}><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)',marginBottom:6 }}>Inquiry → Order</div><div style={{ display:'flex',alignItems:'baseline',gap:6 }}><span style={{ fontSize:'var(--text-title-lg)',fontWeight:'var(--fw-bold)' }}>{fb.inquiries}</span><span style={S.cap}>แชท →</span><span style={{ fontSize:'var(--text-title-lg)',fontWeight:'var(--fw-bold)',color:'var(--success)' }}>{fb.orders}</span><span style={S.cap}>สั่งซื้อ</span></div><div style={{ height:6,borderRadius:3,background:'var(--border)',marginTop:6,overflow:'hidden' }}><div style={{ width:`${fb.conv}%`,height:'100%',borderRadius:3,background:'var(--success)' }}/></div><div style={{ fontSize:'var(--text-small)',color:'var(--success)',fontWeight:'var(--fw-bold)',marginTop:4 }}>Conv. {P(fb.conv)}</div></div>
            <div style={S.pnlSm}><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)',marginBottom:6 }}>ต้นทุน</div><div style={{ display:'flex',flexDirection:'column',gap:4 }}><div><span style={S.cap}>ต่อแชท: </span><span style={S.sm}>{B(fb.cpInq)}</span></div><div><span style={S.cap}>ต่อออร์เดอร์: </span><span style={S.sm}>{B(fb.cpOrd)}</span></div><div><span style={S.cap}>CAC: </span><span style={{ ...S.sm,color:'var(--warning)' }}>{B(fb.cac)}</span></div></div></div>
            <div style={S.pnlSm}><div style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)',marginBottom:6 }}>ลูกค้า</div><div style={{ display:'flex',gap:16 }}><div><div style={{ display:'flex',alignItems:'center',gap:4 }}><UserPlus size={12} color="var(--success)"/><span style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)' }}>ใหม่</span></div><div style={{ ...S.sm,color:'var(--success)' }}>{fb.newCust} ({P((fb.newCust/(fb.newCust+fb.oldCust))*100)})</div></div><div><div style={{ display:'flex',alignItems:'center',gap:4 }}><UserCheck size={12} color="var(--kpi-blue)"/><span style={{ fontSize:'var(--text-xs)',color:'var(--text-caption)' }}>เก่า</span></div><div style={{ ...S.sm,color:'var(--kpi-blue)' }}>{fb.oldCust}</div></div></div><div style={{ fontSize:'var(--text-small)',marginTop:8 }}>AOV: <strong>{B(fb.aov)}</strong></div></div>
          </div>
          <div style={S.g2}>
            <div><div style={S.lbl}>แชท vs สั่งซื้อ รายสัปดาห์</div><ResponsiveContainer width="100%" height={140}><BarChart data={fbWeekly} barGap={4}><XAxis dataKey="w" tick={{ fontSize:10,fill:'var(--text-caption)' }}/><YAxis tick={{ fontSize:10,fill:'var(--text-caption)' }}/><Tooltip contentStyle={tip}/><Bar dataKey="inq" fill="#4a8be0" radius={[4,4,0,0]} name="แชท"/><Bar dataKey="ord" fill="var(--success)" radius={[4,4,0,0]} name="สั่งซื้อ"/></BarChart></ResponsiveContainer></div>
            <div><div style={S.lbl}>จำนวนข้อความ (6 เดือน)</div><ResponsiveContainer width="100%" height={140}><AreaChart data={fbMsgTrend}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/><XAxis dataKey="m" tick={{ fontSize:10,fill:'var(--text-caption)' }}/><YAxis tick={{ fontSize:10,fill:'var(--text-caption)' }}/><Tooltip contentStyle={tip}/><Area type="monotone" dataKey="v" stroke="#4a8be0" fill="#4a8be022" strokeWidth={2}/></AreaChart></ResponsiveContainer></div>
          </div>
        </div>
      </>)}

      {/* ====== PRODUCTS ====== */}
      {sub==='products'&&(<>
        <div style={{ ...S.pnl, marginBottom:16 }}>
          <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:12 }}><Package size={16} color="var(--primary)"/><span style={{ fontSize:'var(--text-title)',fontWeight:'var(--fw-bold)' }}>Product Ranking</span></div>
          <table style={{ width:'100%',borderCollapse:'collapse' }}>
            <thead><tr>{['#','สินค้า','จำนวน','รายได้','สถานะ'].map((h,i)=><th key={h} style={{ ...S.th,textAlign:i<=1?'left':'right' }}>{h}</th>)}</tr></thead>
            <tbody>{products.map(p=>(<tr key={p.rank}><td style={{ ...S.td,fontWeight:'var(--fw-bold)',color:'var(--text-caption)',width:30 }}>{p.rank}</td><td style={{ ...S.td,fontWeight:'var(--fw-semibold)' }}>{p.name}</td><td style={{ ...S.td,textAlign:'right' }}>{p.units.toLocaleString()}</td><td style={{ ...S.td,textAlign:'right',fontWeight:'var(--fw-bold)' }}>{B(p.rev)}</td><td style={{ ...S.td,textAlign:'right' }}><span style={S.chip(stColor(p.stock))}>{stLabel(p.stock)}</span></td></tr>))}</tbody>
          </table>
        </div>
        <div style={S.g2}>
          <div style={S.pnl}>
            <div style={S.lbl}>สีขายดี</div>
            {colors.map(c=>(<div key={c.name} style={{ display:'flex',alignItems:'center',gap:8,marginBottom:6 }}>
              <div style={{ width:16,height:16,borderRadius:4,background:c.hex,border:'1px solid var(--border)' }}/>
              <span style={{ flex:1,fontSize:'var(--text-small)' }}>{c.name}</span>
              <div style={{ width:100,height:8,borderRadius:4,background:'var(--border)',overflow:'hidden' }}><div style={{ width:`${c.pct}%`,height:'100%',background:c.hex,borderRadius:4 }}/></div>
              <span style={{ fontSize:'var(--text-small)',fontWeight:'var(--fw-bold)',width:35,textAlign:'right' }}>{c.pct}%</span>
            </div>))}
          </div>
          <div style={S.pnl}>
            <div style={S.lbl}>ไซส์ขายดี</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={sizes} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/><XAxis type="number" tick={{ fontSize:10,fill:'var(--text-caption)' }} tickFormatter={v=>v+'%'}/><YAxis type="category" dataKey="s" tick={{ fontSize:12,fill:'var(--text-heading)',fontWeight:600 }} width={35}/><Tooltip contentStyle={tip} formatter={v=>[v+'%']}/><Bar dataKey="pct" fill="var(--primary)" radius={[0,6,6,0]}/></BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </>)}

      {/* ====== CUSTOMERS ====== */}
      {sub==='customers'&&(<>
        <div style={{ ...S.g2, marginBottom:16 }}>
          <div style={{ ...S.pnl, display:'flex', gap:20, alignItems:'center' }}>
            <ResponsiveContainer width={160} height={160}>
              <PieChart><Pie data={[{ name:'ใหม่',value:NEW_REV },{ name:'เก่า',value:OLD_REV }]} cx="50%" cy="50%" innerRadius={45} outerRadius={72} dataKey="value" paddingAngle={3}><Cell fill="var(--success)"/><Cell fill="var(--kpi-blue)"/></Pie><Tooltip contentStyle={tip} formatter={v=>[B(v)]}/></PieChart>
            </ResponsiveContainer>
            <div>
              <div style={{ marginBottom:12 }}><div style={{ display:'flex',alignItems:'center',gap:6 }}><UserPlus size={14} color="var(--success)"/><span style={S.cap}>ลูกค้าใหม่</span></div><div style={{ ...S.mid,color:'var(--success)' }}>{NEW_C} คน</div><div style={S.cap}>รายได้ {B(NEW_REV)} ({P((NEW_REV/MTD)*100)})</div><div style={S.cap}>AOV {B(NEW_REV/NEW_C)}</div></div>
              <div><div style={{ display:'flex',alignItems:'center',gap:6 }}><UserCheck size={14} color="var(--kpi-blue)"/><span style={S.cap}>ลูกค้าเก่า</span></div><div style={{ ...S.mid,color:'var(--kpi-blue)' }}>{OLD_C} คน</div><div style={S.cap}>รายได้ {B(OLD_REV)} ({P(OLD_PCT)})</div><div style={S.cap}>AOV {B(OLD_REV/OLD_C)}</div></div>
            </div>
          </div>
          <div style={S.pnl}>
            <div style={S.lbl}>สัดส่วนลูกค้าเก่า (Returning) รายสัปดาห์</div>
            <ResponsiveContainer width="100%" height={180}><LineChart data={retTrend}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/><XAxis dataKey="w" tick={{ fontSize:10,fill:'var(--text-caption)' }}/><YAxis tick={{ fontSize:10,fill:'var(--text-caption)' }} tickFormatter={v=>v+'%'} domain={[20,40]}/><Tooltip contentStyle={tip} formatter={v=>[v+'%']}/><Line type="monotone" dataKey="pct" stroke="var(--kpi-blue)" strokeWidth={2} dot={{ r:4 }}/></LineChart></ResponsiveContainer>
            <div style={{ ...S.cap, marginTop:6 }}>เป้าหมาย: เพิ่ม Returning ≥ 35% ภายในสิ้นเดือน</div>
          </div>
        </div>
        {/* Per-channel customer breakdown */}
        <div style={S.pnl}>
          <div style={S.lbl}>ลูกค้าใหม่ vs เก่า แยกตามช่องทาง</div>
          {CH.map(c=>{const t=c.newCust+c.oldCust;const nP=t>0?(c.newCust/t)*100:0;return(
            <div key={c.id} style={{ display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid var(--border)' }}>
              <div style={S.dot(c.color)}/><span style={{ width:70,fontSize:'var(--text-small)',fontWeight:'var(--fw-semibold)' }}>{c.name}</span>
              <div style={{ flex:1,height:12,borderRadius:6,background:'var(--border)',overflow:'hidden',display:'flex' }}>
                <div style={{ width:`${nP}%`,background:'var(--success)',height:'100%' }}/>
                <div style={{ width:`${100-nP}%`,background:'var(--kpi-blue)',height:'100%' }}/>
              </div>
              <span style={{ width:60,textAlign:'right',fontSize:'var(--text-xs)',color:'var(--success)',fontWeight:'var(--fw-bold)' }}>{c.newCust} ใหม่</span>
              <span style={{ width:50,textAlign:'right',fontSize:'var(--text-xs)',color:'var(--kpi-blue)',fontWeight:'var(--fw-bold)' }}>{c.oldCust} เก่า</span>
            </div>
          );})}
        </div>
      </>)}

      {/* ====== LOG ====== */}
      {sub==='log'&&(<div style={S.pnl}>
        <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:12 }}><CalendarDays size={16} color="var(--primary)"/><span style={{ fontSize:'var(--text-title)',fontWeight:'var(--fw-bold)' }}>Daily Sales Log</span></div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%',borderCollapse:'collapse' }}>
            <thead><tr>
              <th style={{ ...S.th,textAlign:'left' }}>วันที่</th>
              {CH.map(c=><th key={c.id} style={{ ...S.th,textAlign:'right',color:c.color }}>{c.name}</th>)}
              <th style={{ ...S.th,textAlign:'right' }}>รวม</th>
              <th style={{ ...S.th,textAlign:'right' }}>Ad</th>
              <th style={{ ...S.th,textAlign:'left' }}>Note</th>
            </tr></thead>
            <tbody>{dailyLog.map(d=>{const tot=CH.reduce((s,c)=>s+(d[c.name]||0),0);return(
              <tr key={d.date}>
                <td style={{ ...S.td,fontWeight:'var(--fw-semibold)',whiteSpace:'nowrap',fontSize:'var(--text-small)' }}>{d.date}</td>
                {CH.map(c=><td key={c.id} style={{ ...S.td,textAlign:'right',fontSize:'var(--text-small)' }}>{(d[c.name]||0).toLocaleString()}</td>)}
                <td style={{ ...S.td,textAlign:'right',fontWeight:'var(--fw-bold)',fontSize:'var(--text-small)' }}>{tot.toLocaleString()}</td>
                <td style={{ ...S.td,textAlign:'right',fontSize:'var(--text-small)',color:'var(--text-caption)' }}>{(d.ad||0).toLocaleString()}</td>
                <td style={{ ...S.td,fontSize:'var(--text-small)',color:'var(--text-caption)',maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{d.note||'—'}</td>
              </tr>
            );})}</tbody>
          </table>
        </div>
      </div>)}
    </div>
  );
}
