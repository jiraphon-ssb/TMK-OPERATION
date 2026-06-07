/* ============================================================
   TMK Operation — Onboarding tour + Help system
   ============================================================ */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from './components.jsx';
import { useLang } from './i18n.jsx';

const TOUR_STEPS = [
  {
    target: '.rail-btn:nth-child(1)',
    titleKey: 'navHome',
    descKey: 'tourStep1',
    position: 'right',
  },
  {
    target: '.rail-btn:nth-child(2)',
    titleKey: 'navSales',
    descKey: 'tourStep2',
    position: 'right',
  },
  {
    target: '.rail-btn:nth-child(3)',
    titleKey: 'navPlanner',
    descKey: 'tourStep3',
    position: 'right',
  },
  {
    target: '.rail-btn:nth-child(4)',
    titleKey: 'navCatalog',
    descKey: 'tourStep4',
    position: 'right',
  },
  {
    target: '.search.desktop-only',
    titleKey: 'search',
    descKey: 'tourStep5',
    descArgs: ['Ctrl+K / ⌘K'],
    position: 'bottom',
  },
];

/* ---- Welcome modal (shown on first visit) ---- */
export function WelcomeModal({ onStart, onSkip }) {
  const { t } = useLang();
  return (
    <div className="modal-scrim" style={{ zIndex: 9990 }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: 'var(--r-xl)',
        padding: '36px 32px', maxWidth: 440, width: '90%',
        boxShadow: 'var(--sh-pop)', textAlign: 'center',
      }}>
        <div style={{ width: 56, height: 56, margin: '0 auto 16px', background: 'var(--accent-soft)', borderRadius: 16, display: 'grid', placeItems: 'center', color: 'var(--accent)' }}>
          <Icon name="sparkle" />
        </div>
        <h2 className="h1" style={{ marginBottom: 8 }}>{t('onboardTitle')}</h2>
        <div className="sm" style={{ color: 'var(--ink-2)', marginBottom: 24, lineHeight: 1.6 }}>
          {t('onboardSub')}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button className="btn" onClick={onSkip}>{t('onboardSkip')}</button>
          <button className="btn btn-primary" onClick={onStart}>
            {t('onboardStart')} <Icon name="arrowR" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Tour spotlight overlay ---- */
export function TourOverlay({ step, total, current, onNext, onPrev, onClose }) {
  const { t } = useLang();
  const [rect, setRect] = useState(null);
  const tooltipRef = useRef(null);

  useEffect(() => {
    const el = document.querySelector(step.target);
    if (el) {
      const r = el.getBoundingClientRect();
      setRect(r);
      // Scroll into view if needed
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [step.target]);

  if (!rect) return null;

  const pad = 8;
  const holeStyle = {
    position: 'fixed',
    left: rect.left - pad,
    top: rect.top - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
    borderRadius: 12,
    boxShadow: '0 0 0 9999px rgba(8,18,32,0.55)',
    zIndex: 9991,
    pointerEvents: 'none',
    transition: 'all 0.35s cubic-bezier(0.4,0,0.2,1)',
  };

  // Tooltip position
  let tooltipStyle = {
    position: 'fixed', zIndex: 9992,
    background: 'var(--surface)', borderRadius: 'var(--r-lg)',
    padding: '18px 22px', maxWidth: 320, width: 'max-content',
    boxShadow: 'var(--sh-pop)', border: '1px solid var(--line)',
  };

  if (step.position === 'right') {
    tooltipStyle.left = rect.right + pad + 16;
    tooltipStyle.top = rect.top + rect.height / 2 - 50;
  } else if (step.position === 'bottom') {
    tooltipStyle.left = Math.max(16, rect.left + rect.width / 2 - 160);
    tooltipStyle.top = rect.bottom + pad + 12;
  } else if (step.position === 'left') {
    tooltipStyle.right = window.innerWidth - rect.left + pad + 16;
    tooltipStyle.top = rect.top + rect.height / 2 - 50;
  }

  const descArgs = step.descArgs || [];
  const desc = t(step.descKey, ...descArgs);

  return (
    <>
      {/* Backdrop click to close */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 9990 }} onClick={onClose}></div>

      {/* Spotlight hole */}
      <div style={holeStyle}></div>

      {/* Tooltip */}
      <div ref={tooltipRef} style={tooltipStyle} onClick={e => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 8 }}>
          <span className="chip chip-accent" style={{ fontSize: 10 }}>{current + 1}/{total}</span>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', width: 16, height: 16 }} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="h3" style={{ marginBottom: 4 }}>{t(step.titleKey)}</div>
        <div className="sm" style={{ color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 14 }}>{desc}</div>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {Array.from({ length: total }, (_, i) => (
            <div key={i} style={{
              width: i === current ? 18 : 6, height: 6, borderRadius: 3,
              background: i === current ? 'var(--accent)' : 'var(--surface-3)',
              transition: 'all 0.25s',
            }}></div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {current > 0 && (
            <button className="btn btn-sm" onClick={onPrev}>{t('onboardPrev')}</button>
          )}
          {current < total - 1 ? (
            <button className="btn btn-sm btn-primary" onClick={onNext}>{t('onboardNext')} <Icon name="arrowR" /></button>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={onClose}>{t('onboardFinish')} <Icon name="check" /></button>
          )}
        </div>
      </div>
    </>
  );
}

/* ---- Main Onboarding controller ---- */
export function Onboarding({ onComplete }) {
  const [phase, setPhase] = useState('welcome'); // 'welcome' | 'tour' | null
  const [step, setStep] = useState(0);

  const startTour = () => { setPhase('tour'); setStep(0); };
  const skip = () => { setPhase(null); onComplete(); };
  const next = () => { if (step < TOUR_STEPS.length - 1) setStep(s => s + 1); else skip(); };
  const prev = () => { if (step > 0) setStep(s => s - 1); };

  if (phase === 'welcome') {
    return <WelcomeModal onStart={startTour} onSkip={skip} />;
  }

  if (phase === 'tour') {
    return (
      <TourOverlay
        step={TOUR_STEPS[step]}
        total={TOUR_STEPS.length}
        current={step}
        onNext={next}
        onPrev={prev}
        onClose={skip}
      />
    );
  }

  return null;
}

/* ---- Help button (floating) ---- */
export function HelpButton({ onClick }) {
  const { t } = useLang();
  return (
    <button onClick={onClick} title={t('helpBtn')} style={{
      position: 'fixed', bottom: 80, right: 24, zIndex: 900,
      width: 44, height: 44, borderRadius: '50%',
      background: 'var(--accent)', color: '#fff',
      border: 'none', cursor: 'pointer',
      display: 'grid', placeItems: 'center',
      boxShadow: '0 4px 16px rgba(10,90,160,0.3)',
      transition: 'transform 0.2s, box-shadow 0.2s',
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    </button>
  );
}

/* ====================  HELP CENTER  ==================== */
const HELP_SECTIONS = [
  {
    id: 'overview', icon: 'home', title: 'ภาพรวมระบบ',
    topics: [
      { id: 'intro', title: 'TMK Operation คืออะไร?', level: 'new',
        content: 'TMK Operation Operations Hub คือศูนย์กลางบริหารธุรกิจแฟชั่นแบรนด์ TMK ครบจบในที่เดียว',
        guide: [
          { nav: ['home'], target: '.content-inner', title: 'หน้าหลัก (Dashboard)', desc: 'นี่คือหน้าสรุปภาพรวมทั้งหมด — ยอดขาย, สถานะงาน, KPI, และข้อมูลสำคัญรวมไว้ในที่เดียว' },
          { nav: ['home'], target: '.grid.g4', title: 'KPI 4 ตัวสำคัญ', desc: 'ออร์เดอร์รวม / AOV / ค่าแอด / ลูกค้าใหม่ — กดที่การ์ดเพื่อไปดูรายละเอียดของแต่ละ KPI ได้เลย' },
        ]},
      { id: 'nav', title: 'วิธีใช้เมนูนำทาง', level: 'new',
        content: 'แถบซ้ายมือคือเมนูหลัก กดที่ไอคอนเพื่อสลับหน้า',
        guide: [
          { nav: ['home'], target: '.rail', title: 'แถบเมนูหลัก', desc: 'แถบซ้ายคือเมนูหลัก: หน้าหลัก → ยอดขาย → วางแผน → แคตตาล็อก กดที่ไอคอนเพื่อสลับหน้า' },
          { nav: ['sales', 'overview'], target: '.panel', title: 'เมนูย่อย', desc: 'เมื่อเลือกหน้าที่มีเมนูย่อย จะเห็นแผงด้านซ้ายแสดงตัวเลือก เช่น ยอดขาย → ภาพรวม/ช่องทาง/โฆษณา/ลูกค้า/บันทึก' },
          { nav: ['home'], target: '.search.desktop-only', title: 'ค้นหาด่วน (⌘K)', desc: 'กด ⌘K (Mac) หรือ Ctrl+K เพื่อค้นหาทุกอย่าง: งาน สินค้า แคมเปญ ทีม ช่องทาง' },
        ]},
      { id: 'spotlight', title: 'Spotlight Search (⌘K)', level: 'new',
        content: 'ค้นหาได้ทุกอย่างในระบบ',
        guide: [
          { nav: ['home'], target: '.search.desktop-only', title: 'ปุ่มค้นหา', desc: 'กดที่นี่ หรือกด ⌘K / Ctrl+K เพื่อเปิด Spotlight Search' },
        ]},
      { id: 'darkmode', title: 'โหมดมืด', level: 'used',
        content: 'เปิดโหมดมืดได้ที่ ตั้งค่า → ทั่วไป',
        guide: [
          { nav: ['settings', 'general'], target: '.content-inner .card:first-child', title: 'ธีมและการแสดงผล', desc: 'กดปุ่ม "ปิดอยู่/เปิดอยู่" เพื่อเปลี่ยนโหมดมืด ระบบจะจำการตั้งค่าไว้แม้ปิดหน้าเว็บ' },
        ]},
    ]
  },
  {
    id: 'sales', icon: 'sales', title: 'ยอดขาย',
    topics: [
      { id: 'sales-overview', title: 'ภาพรวมยอดขาย', level: 'new',
        content: 'ดูยอดขายเดือนนี้ทุกมุมมอง',
        guide: [
          { nav: ['sales', 'overview'], target: '.content-inner .card:first-child', title: 'ยอดขาย MTD', desc: 'ยอดขายตั้งแต่ต้นเดือนจนถึงวันนี้ เทียบกับเป้า + แสดง progress bar ว่าถึงกี่ % แล้ว' },
          { nav: ['sales', 'overview'], target: '.content-inner .grid.g4', title: 'KPI เปรียบเทียบเดือนก่อน', desc: 'รายได้ / ออร์เดอร์ / AOV / ค่าแอด — แต่ละตัวเทียบกับเดือนก่อน (▲ สูงขึ้น ▼ ลดลง)' },
          { nav: ['sales', 'overview'], target: '.content-inner .grid.g3', title: 'กราฟวิเคราะห์', desc: 'ยอดขายรายวัน / 3 เดือนล่าสุด / เทียบปีก่อน (YoY) — ดูแนวโน้มได้ทันที' },
        ]},
      { id: 'sales-channels', title: 'ช่องทางการขาย', level: 'new',
        content: '6 ช่องทาง เจาะลึกแต่ละช่อง',
        guide: [
          { nav: ['sales', 'channels'], target: '.content-inner .grid.g3', title: '6 ช่องทางการขาย', desc: 'Shopee / TikTok / Lazada / Facebook / LINE OA / CRM — แต่ละการ์ดแสดง ยอดขาย + Progress Ring + ออร์เดอร์ + AOV + P&L + ROAS/ACOS' },
          { nav: ['sales', 'channels'], target: '.content-inner .grid.g3 .card:first-child', title: 'รายละเอียดช่องทาง', desc: 'ด้านบน: ยอดขาย + % เทียบเป้า, กลาง: ออร์เดอร์/AOV/สัดส่วนลูกค้าใหม่, ล่าง: P&L (รายได้-ค่าแอด-ค่าแพลตฟอร์ม=กำไร) + ROAS/ACOS' },
        ]},
      { id: 'sales-ads', title: 'โฆษณาและแชท', level: 'new',
        content: 'จัดการงบโฆษณาและวิเคราะห์ผล',
        guide: [
          { nav: ['sales', 'ads'], target: '.content-inner .card:first-child', title: 'งบโฆษณา', desc: 'งบทั้งหมด / ใช้ไปแล้ว / คงเหลือ / Burn rate ต่อวัน — มี progress bar แสดงว่าใช้งบไปกี่ % แล้ว เทียบกับเวลาที่ผ่านไป' },
          { nav: ['sales', 'ads'], target: '.content-inner .card:nth-child(3)', title: 'แคมเปญแอด', desc: 'ตารางแคมเปญโฆษณาทั้งหมด: ชื่อ / แพลตฟอร์ม / งบ / ใช้ไป / ROAS / สถานะ — กด "+ สร้างแคมเปญแอด" เพื่อเพิ่มใหม่' },
        ]},
      { id: 'sales-cust', title: 'ลูกค้า', level: 'used',
        content: 'วิเคราะห์กลุ่มลูกค้าและ CLV',
        guide: [
          { nav: ['sales', 'customers'], target: '.content-inner .grid.g4', title: '4 กลุ่มลูกค้า', desc: 'VIP (35% รายได้) / Regular (40%) / At-risk (15%) / Churned (10%) — กด "อัปเดตกลุ่มลูกค้า" เพื่อปรับข้อมูลรายเดือน' },
          { nav: ['sales', 'customers'], target: '.content-inner .grid.g2', title: 'CLV + ลูกค้าใหม่ vs เก่า', desc: 'Ring แสดงสัดส่วนลูกค้าใหม่ (เขียว) vs เก่า (ฟ้า) + CLV เฉลี่ย ฿2,850 ต่อคน' },
        ]},
      { id: 'record-sales', title: 'บันทึกยอดขายรายวัน', level: 'new',
        content: 'กรอกยอดทุกวัน 2 ขั้นตอน',
        guide: [
          { nav: ['sales', 'daily'], target: '.content-inner .card:nth-child(2)', title: 'ปุ่มบันทึกยอด', desc: 'กดที่นี่เพื่อเริ่มกรอกยอดขายประจำวัน — กรอกทุกช่องทาง (Shopee/TikTok/Lazada/Facebook/LINE/CRM)' },
          { nav: ['sales', 'daily'], target: '.content-inner .card:nth-child(3)', title: 'ปฏิทินการกรอก', desc: 'เขียว = กรอกแล้ว, ส้ม = วันนี้ (ยังไม่กรอก), เทา = ยังไม่ถึง — เห็นภาพรวมว่ากรอกครบกี่วันแล้ว' },
        ]},
      { id: 'monthly-setup', title: 'ตั้งค่ารายเดือน', level: 'used',
        content: 'ตั้งเป้า 5 รายการทุกเดือน',
        guide: [
          { nav: ['sales', 'monthly'], target: '.content-inner .grid.g2', title: '5 การ์ดตั้งค่า', desc: 'เป้าหมายเดือน / งบโฆษณา / แคมเปญแอด / กลุ่มลูกค้า / ข้อมูลย้อนหลัง — กดปุ่ม "แก้ไข" หรือ "ตั้งค่า" ในแต่ละการ์ด' },
        ]},
      { id: 'month-nav', title: 'การนำทางเดือน + ไตรมาส', level: 'used',
        content: 'เลื่อนดูเดือนอื่นและ Quarter View',
        guide: [
          { nav: ['sales', 'daily'], target: '.content-inner .card:first-child', title: 'Month Navigator', desc: 'ลูกศรซ้าย/ขวาเปลี่ยนเดือน กดชื่อเดือนเพื่อ Quick Jump เลือกเดือนจาก grid 12 เดือน กดปุ่ม "ดูรายไตรมาส" ดูภาพรวม Q1-Q4' },
        ]},
    ]
  },
  {
    id: 'planner', icon: 'planner', title: 'วางแผน',
    topics: [
      { id: 'calendar', title: 'ปฏิทินปฏิบัติงาน', level: 'new',
        content: 'ปฏิทินรายเดือน + sidebar งาน',
        guide: [
          { nav: ['planner', 'calendar'], target: '.card-head', title: 'ปฏิทิน', desc: 'ปฏิทินรายเดือน เริ่มวันอาทิตย์ แสดงงานสูงสุด 3 รายการ + ไอคอนแพลตฟอร์ม กดวันเพื่อดูรายละเอียดในแถบขวา ใช้ลูกศรเปลี่ยนเดือน' },
          { nav: ['planner', 'calendar'], target: '.content-inner .eyebrow', title: 'รายละเอียดวัน', desc: 'แถบขวาแสดงงานของวันที่เลือก — กดที่การ์ดงานเพื่อแก้ไข กด "+ เพิ่ม" เพื่อสร้างงานใหม่ในวันนั้น' },
        ]},
      { id: 'kanban', title: 'บอร์ดคุมงาน (Kanban)', level: 'new',
        content: 'ลากย้ายสถานะงาน',
        guide: [
          { nav: ['planner', 'kanban'], target: '.content-inner .grid.g4', title: '4 คอลัมน์สถานะ', desc: 'รอดำเนินการ → กำลังทำ → รอตรวจ → เสร็จแล้ว — ลากการ์ดข้ามคอลัมน์เพื่อเปลี่ยนสถานะ กดการ์ดเพื่อดู/แก้ไข กด "+ เพิ่มงาน" ด้านล่างแต่ละคอลัมน์' },
        ]},
      { id: 'timeline', title: 'ไทม์ไลน์แคมเปญ', level: 'new',
        content: 'ดูงานเรียงตามเวลา',
        guide: [
          { nav: ['planner', 'timeline'], target: '.content-inner .grid.g3', title: 'แคมเปญ Progress', desc: 'การ์ดแคมเปญด้านบน — แสดง progress ring ว่าแต่ละแคมเปญเสร็จกี่ % แล้ว กดเพื่อ filter เฉพาะแคมเปญนั้น' },
          { nav: ['planner', 'timeline'], target: '.content-inner .card:last-child', title: 'Timeline แนวตั้ง', desc: 'งานเรียงตามวันที่ วันนี้ highlight สีน้ำเงิน งานเกินกำหนดเด่นสีแดง กดที่การ์ดงานเพื่อดู/แก้ไข' },
        ]},
      { id: 'filters', title: 'การ Filter งาน', level: 'used',
        content: 'กรองงานตามเงื่อนไข',
        guide: [
          { nav: ['planner', 'calendar'], target: '.card.card-pad-sm', title: 'Filter Controls', desc: 'ใช้ร่วมกันทั้ง 3 มุมมอง: กรองตามสถานะ (ทั้งหมด/กำลังทำ/เสร็จแล้ว) + กรองตามแคมเปญ + ค้นหาด้วยคำ ทุก filter เปลี่ยนพร้อมกันทุกแท็บ' },
        ]},
    ]
  },
  {
    id: 'catalog', icon: 'catalog', title: 'แคตตาล็อก',
    topics: [
      { id: 'products', title: 'สินค้า', level: 'new',
        content: 'ตารางสินค้าขายดี',
        guide: [
          { nav: ['catalog', 'products'], target: '.content-inner .card:first-child', title: 'ตารางสินค้า', desc: 'เรียงตาม rank: ชื่อ/ราคา/ขายแล้ว/รายได้/คงเหลือ/สถานะสต็อก กดแถวเพื่อแก้ไข กด "+ เพิ่มสินค้า" เพื่อเพิ่มใหม่' },
          { nav: ['catalog', 'products'], target: '.content-inner .grid.g2', title: 'สีและไซส์ขายดี', desc: 'กราฟสีขายดี (ดำ 28% / กรมท่า 22% / ขาว 18%...) และไซส์ขายดี (L 31% / M 24% / XL 22%...)' },
        ]},
      { id: 'po', title: 'PO / สต็อก', level: 'used',
        content: 'ใบสั่งผลิตจากโรงงาน',
        guide: [
          { nav: ['catalog', 'po'], target: '.content-inner .card', title: 'ตาราง PO', desc: 'สินค้า / จำนวน / วันสั่ง / กำหนดเข้า / สถานะ (กำลังผลิต/ของเข้าแล้ว) — กด "เปิด PO ใหม่" เพื่อสั่งผลิตเพิ่ม' },
        ]},
    ]
  },
  {
    id: 'settings', icon: 'system', title: 'ตั้งค่า',
    topics: [
      { id: 'profile', title: 'โปรไฟล์', level: 'new',
        content: 'แก้ไขชื่อและรูปโปรไฟล์',
        guide: [
          { nav: ['profile'], target: '.content-inner .card:first-child', title: 'โปรไฟล์ของคุณ', desc: 'แก้ชื่อที่แสดง + อัปโหลดรูป — ชื่อนี้ลิงก์กับงาน เมื่อเปลี่ยนจะอัปเดตใน task/kanban/ปฏิทิน/timeline อัตโนมัติ' },
          { nav: ['profile'], target: '.segbar', title: 'งานและประวัติของฉัน', desc: 'แท็บ "งานของฉัน" ดูงานที่ได้รับมอบหมาย + สถานะ แท็บ "ประวัติของฉัน" ดูสิ่งที่เราเปลี่ยนแปลงในระบบ' },
        ]},
      { id: 'roles', title: 'สิทธิ์ผู้ใช้', level: 'used',
        content: 'จัดการสิทธิ์ทีม',
        guide: [
          { nav: ['settings', 'general'], target: '.content-inner', title: 'ตั้งค่าระบบ', desc: 'กดแท็บ "สิทธิ์ผู้ใช้" เพื่อจัดการ — 3 ระดับ: ผู้ดูแลระบบ / แก้ไขได้ / ดูอย่างเดียว กดปุ่มดินสอเพื่อแก้ชื่อ/รูป/สิทธิ์' },
        ]},
      { id: 'audit-help', title: 'ประวัติการใช้งาน', level: 'expert',
        content: 'ดูทุกการเปลี่ยนแปลง',
        guide: [
          { nav: ['settings', 'general'], target: '.content-inner', title: 'ประวัติการใช้งาน', desc: 'กดแท็บ "ประวัติการใช้งาน" — บันทึกทุกการเปลี่ยนแปลง: สร้าง/แก้ไข/ลบ ใครทำอะไรเมื่อไหร่ ใช้ filter ดูเฉพาะประเภท' },
        ]},
      { id: 'updates-help', title: 'อัปเดตระบบ', level: 'expert',
        content: 'ดูประวัติ changelog',
        guide: [
          { nav: ['settings', 'general'], target: '.content-inner', title: 'อัปเดตระบบ', desc: 'กดแท็บ "อัปเดต" ดูเวอร์ชันปัจจุบัน + ประวัติฟีเจอร์ใหม่/ปรับปรุง/แก้ไขทั้งหมด' },
        ]},
    ]
  },
];

const LEVELS = [
  { id: 'new', label: 'ผู้ใช้ใหม่', desc: 'แนะนำทุกระบบ ทุกฟังก์ชัน แบบละเอียด', icon: 'userPlus', color: 'var(--accent)' },
  { id: 'used', label: 'เคยใช้บ้าง', desc: 'เน้นฟีเจอร์ขั้นสูง + เคล็ดลับ', icon: 'users', color: 'var(--good)' },
  { id: 'expert', label: 'ใช้เป็นแล้ว', desc: 'เฉพาะตั้งค่าระบบ + ฟีเจอร์ซ่อน', icon: 'userCheck', color: 'var(--warn)' },
];

/* ---- Interactive Guide Overlay (navigate + highlight) ---- */
function GuideOverlay({ steps, current, onNext, onPrev, onClose, onDone }) {
  const [rect, setRect] = useState(null);
  const step = steps[current];

  useEffect(() => {
    // Small delay to let the page render after navigation
    const timer = setTimeout(() => {
      const el = document.querySelector(step.target);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect(r);
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        setRect(null);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [current, step.target]);

  const pad = 10;
  const isLast = current === steps.length - 1;

  return (
    <>
      {/* Backdrop */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 9990 }} onClick={onClose}></div>

      {/* Spotlight hole — blocks clicks on highlighted area */}
      {rect && (
        <div onClick={e => e.stopPropagation()} style={{
          position: 'fixed',
          left: rect.left - pad, top: rect.top - pad,
          width: rect.width + pad * 2, height: rect.height + pad * 2,
          borderRadius: 14,
          boxShadow: '0 0 0 9999px rgba(8,18,32,0.5)',
          border: '2px solid var(--accent)',
          zIndex: 9991, pointerEvents: 'auto', cursor: 'default',
          transition: 'all 0.4s cubic-bezier(0.4,0,0.2,1)',
        }}></div>
      )}

      {/* Tooltip */}
      <div style={{
        position: 'fixed', zIndex: 9992,
        bottom: 24, left: '50%', transform: 'translateX(-50%)',
        background: 'var(--surface)', borderRadius: 'var(--r-xl)',
        padding: '20px 24px', maxWidth: 480, width: '90%',
        boxShadow: '0 12px 48px rgba(0,0,0,0.25)', border: '1px solid var(--line)',
      }} onClick={e => e.stopPropagation()}>
        {/* Step indicator */}
        <div className="row between" style={{ marginBottom: 10 }}>
          <div className="row" style={{ gap: 6 }}>
            {steps.map((_, i) => (
              <div key={i} style={{
                width: i === current ? 20 : 6, height: 6, borderRadius: 3,
                background: i === current ? 'var(--accent)' : i < current ? 'var(--good)' : 'var(--surface-3)',
                transition: 'all 0.25s',
              }}></div>
            ))}
          </div>
          <span className="cap">{current + 1}/{steps.length}</span>
        </div>

        <div className="h3" style={{ marginBottom: 4 }}>{step.title}</div>
        <div className="sm" style={{ color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 16 }}>{step.desc}</div>

        <div className="row between">
          <div className="row" style={{ gap: 8 }}>
            {current > 0 && (
              <button className="btn btn-sm" onClick={onPrev}>
                <Icon name="chevR" className="flip-h" /> ก่อนหน้า
              </button>
            )}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-sm" onClick={onClose}>ปิด</button>
            {isLast ? (
              <button className="btn btn-sm btn-primary" onClick={onDone}>
                <Icon name="check" /> เข้าใจแล้ว
              </button>
            ) : (
              <button className="btn btn-sm btn-primary" onClick={onNext}>
                ถัดไป <Icon name="arrowR" />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export function HelpCenter({ onStartGuide }) {
  const [level, setLevel] = useState(() => {
    try { return localStorage.getItem('tmk-help-level') || null; } catch { return null; }
  });
  const [openSection, setOpenSection] = useState(null);
  const [openTopic, setOpenTopic] = useState(null);
  const [completed, setCompleted] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tmk-help-done') || '[]'); } catch { return []; }
  });

  const selectLevel = (l) => {
    setLevel(l);
    try { localStorage.setItem('tmk-help-level', l); } catch {}
  };

  const markDone = (topicId) => {
    const next = completed.includes(topicId) ? completed.filter(x => x !== topicId) : [...completed, topicId];
    setCompleted(next);
    try { localStorage.setItem('tmk-help-done', JSON.stringify(next)); } catch {}
  };

  // Filter topics by level — ให้ตรงกับจำนวนที่แสดงบนการ์ดเลือกระดับ
  //  new = ทุกหัวข้อ · used = ไม่รวม expert · expert = เฉพาะ expert
  const visibleTopics = (topics) => {
    if (!level || level === 'new') return topics;
    if (level === 'expert') return topics.filter(t => t.level === 'expert');
    return topics.filter(t => t.level !== 'expert'); // used
  };

  // Start interactive guide for a topic
  const startGuide = (topic) => {
    if (!topic.guide || topic.guide.length === 0) return;
    if (onStartGuide) {
      onStartGuide(topic.id, topic.guide, () => markDone(topic.id));
    }
  };

  const totalTopics = HELP_SECTIONS.reduce((a, s) => a + visibleTopics(s.topics).length, 0);
  const doneTopics = HELP_SECTIONS.reduce((a, s) => a + visibleTopics(s.topics).filter(t => completed.includes(t.id)).length, 0);
  const pct = totalTopics > 0 ? Math.round((doneTopics / totalTopics) * 100) : 0;

  // Level selection screen
  if (!level) {
    return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, margin: '0 auto 12px', background: 'var(--accent-soft)', borderRadius: 16, display: 'grid', placeItems: 'center', color: 'var(--accent)' }}>
            <Icon name="sparkle" />
          </div>
          <h1 className="h1" style={{ marginBottom: 6 }}>ศูนย์ช่วยเหลือ TMK Operation</h1>
          <div className="sm" style={{ color: 'var(--ink-2)' }}>เลือกระดับของคุณเพื่อดูคู่มือที่เหมาะสม</div>
        </div>
        <div className="grid g3" style={{ maxWidth: 800, margin: '0 auto' }}>
          {LEVELS.map(l => (
            <button key={l.id} className="card" onClick={() => selectLevel(l.id)}
              style={{ padding: 24, textAlign: 'center', cursor: 'pointer', border: '2px solid transparent', transition: 'all 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = l.color}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}>
              <div style={{ width: 48, height: 48, margin: '0 auto 12px', background: l.color + '18', borderRadius: 14, display: 'grid', placeItems: 'center', color: l.color }}>
                <Icon name={l.icon} />
              </div>
              <div className="h3" style={{ marginBottom: 6 }}>{l.label}</div>
              <div className="cap" style={{ lineHeight: 1.5 }}>{l.desc}</div>
              <div className="cap" style={{ marginTop: 8, color: l.color, fontWeight: 600 }}>
                {l.id === 'new' ? HELP_SECTIONS.reduce((a, s) => a + s.topics.length, 0) + ' หัวข้อ' : l.id === 'used' ? HELP_SECTIONS.reduce((a, s) => a + s.topics.filter(t => t.level !== 'expert').length, 0) + ' หัวข้อ' : HELP_SECTIONS.reduce((a, s) => a + s.topics.filter(t => t.level === 'expert').length, 0) + ' หัวข้อ'}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header + progress */}
      <div className="card" style={{ padding: 20, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <h2 className="h2">คู่มือการใช้งาน</h2>
            <span className="chip" style={{ background: LEVELS.find(l => l.id === level)?.color + '18', color: LEVELS.find(l => l.id === level)?.color }}>
              {LEVELS.find(l => l.id === level)?.label}
            </span>
            <button className="btn btn-sm btn-ghost" onClick={() => { setLevel(null); }} style={{ marginLeft: 'auto' }}>เปลี่ยนระดับ</button>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <div className="bar" style={{ flex: 1, height: 8, borderRadius: 4 }}>
              <span style={{ width: `${pct}%`, background: pct === 100 ? 'var(--good)' : 'var(--accent)', transition: 'width 0.6s' }}></span>
            </div>
            <span className="cap" style={{ fontWeight: 600, color: pct === 100 ? 'var(--good)' : 'var(--ink-2)' }}>{doneTopics}/{totalTopics} ({pct}%)</span>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {HELP_SECTIONS.map(section => {
          const topics = visibleTopics(section.topics);
          if (topics.length === 0) return null;
          const isOpen = openSection === section.id;
          const sectionDone = topics.filter(t => completed.includes(t.id)).length;

          return (
            <div key={section.id} className="card" style={{ overflow: 'hidden' }}>
              <button onClick={() => setOpenSection(isOpen ? null : section.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '16px 20px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left' }}>
                <span style={{ width: 36, height: 36, borderRadius: 'var(--r-sm)', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Icon name={section.icon} />
                </span>
                <div style={{ flex: 1 }}>
                  <div className="h3">{section.title}</div>
                  <div className="cap">{sectionDone}/{topics.length} หัวข้อ</div>
                </div>
                {sectionDone === topics.length && <span className="chip chip-good">เสร็จ</span>}
                <span style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.2s', color: 'var(--ink-3)', width: 16, height: 16 }}>
                  <Icon name="chevR" />
                </span>
              </button>

              {isOpen && (
                <div style={{ borderTop: '1px solid var(--line)', padding: '4px 0' }}>
                  {topics.map(topic => {
                    const isDone = completed.includes(topic.id);
                    const isTopicOpen = openTopic === topic.id;
                    const levelMeta = { new: { l: 'พื้นฐาน', c: 'var(--accent)' }, used: { l: 'ขั้นสูง', c: 'var(--good)' }, expert: { l: 'ผู้เชี่ยวชาญ', c: 'var(--warn)' } };
                    const lm = levelMeta[topic.level];

                    return (
                      <div key={topic.id}>
                        <button onClick={() => { if (topic.guide && topic.guide.length > 0) { startGuide(topic); } else { setOpenTopic(isTopicOpen ? null : topic.id); } }}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 20px 12px 28px', border: 'none', background: isTopicOpen ? 'var(--surface-2)' : 'transparent', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left', transition: 'background 0.1s' }}>
                          <span onClick={e => { e.stopPropagation(); markDone(topic.id); }} style={{
                            width: 22, height: 22, borderRadius: 6, border: `2px solid ${isDone ? 'var(--good)' : 'var(--line)'}`,
                            background: isDone ? 'var(--good)' : 'transparent',
                            display: 'grid', placeItems: 'center', flexShrink: 0, cursor: 'pointer', color: '#fff', transition: 'all 0.15s',
                          }}>
                            {isDone && <Icon name="check" />}
                          </span>
                          <div style={{ flex: 1 }}>
                            <div className="sm" style={{ fontWeight: 600, textDecoration: isDone ? 'line-through' : 'none', color: isDone ? 'var(--ink-3)' : 'var(--ink)' }}>{topic.title}</div>
                          </div>
                          <span className="cap" style={{ color: lm.c, fontWeight: 600, flexShrink: 0 }}>{lm.l}</span>
                          <span style={{ transform: isTopicOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s', color: 'var(--ink-4)', width: 14, height: 14 }}>
                            <Icon name="chevR" />
                          </span>
                        </button>
                        {isTopicOpen && (
                          <div style={{ padding: '8px 28px 16px 60px', lineHeight: 1.7 }}>
                            <div className="sm" style={{ color: 'var(--ink-2)' }}>{topic.content}</div>
                            {!isDone && (
                              <button className="btn btn-sm btn-outline" style={{ marginTop: 10 }} onClick={() => markDone(topic.id)}>
                                <Icon name="check" /> เข้าใจแล้ว
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Export GuideOverlay for App-level rendering ---- */
export { GuideOverlay };

/* ---- Tooltip wrapper ---- */
export function Tooltip({ text, children, position = 'top' }) {
  const [show, setShow] = useState(false);
  const posStyle = {
    top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6 },
    bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6 },
    left: { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: 6 },
    right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: 6 },
  };
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <span style={{
          position: 'absolute', ...posStyle[position],
          background: 'var(--ink)', color: '#fff',
          padding: '5px 10px', borderRadius: 6,
          fontSize: 'var(--fs-micro)', fontWeight: 500,
          whiteSpace: 'nowrap', zIndex: 999,
          pointerEvents: 'none',
          animation: 'toastIn 0.15s ease-out',
          fontFamily: 'var(--font)',
        }}>
          {text}
        </span>
      )}
    </span>
  );
}
