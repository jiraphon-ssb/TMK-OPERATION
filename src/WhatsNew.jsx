/* ============================================================
   TMK Operation — What's New (การ์ดเดียวจบ, มุมขวาล่าง)
   ============================================================
   - ปุ่มลอยมุมขวาล่าง = ทางเข้าเดียว กดเปิด/ปิดการ์ดได้ตลอด (จุดแดงตอนมีเวอร์ชันใหม่)
   - การ์ดเดียวเก็บทุกอย่าง: เวอร์ชันล่าสุดเด่นบนสุด + ไทม์ไลน์ย้อนหลังเลื่อนดูในตัว
   - ปุ่มมีแค่ ✕ (+ Esc / คลิกปุ่มลอย) — ไม่มีลิงก์ไปหน้าอื่น (ไม่มีหน้าอัปเดตแยกแล้ว)
   ============================================================ */
import { useState, useEffect, useCallback, useRef } from 'react';
import { CHANGELOG, APP_VERSION } from './changelog.js';
import { Icon } from './components.jsx';

/* ---------- แถบ "มีเวอร์ชันใหม่" (แบบ A — นุ่ม) ----------
   เช็ค version.json บนเซิร์ฟเวอร์ทุก ~3 นาที + ตอนกลับมาที่แท็บ
   ถ้าเวอร์ชันที่ deploy ≠ เวอร์ชันที่รันอยู่ → เด้งแถบบนสุด กดอัปเดตเอง (ไม่บังคับ reload) */
export function UpdateBanner() {
  const [newVer, setNewVer] = useState(null);
  const [hidden, setHidden] = useState(false);
  const hiddenUntil = useRef(0);
  useEffect(() => {
    let alive = true;
    const base = import.meta.env.BASE_URL || '/';
    const check = async () => {
      try {
        const res = await fetch(`${base}version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!alive || !data || !data.version) return;
        if (data.version !== APP_VERSION) {
          setNewVer(data.version);
          if (Date.now() >= hiddenUntil.current) setHidden(false); // เด้งซ้ำหลังเงียบครบเวลา
        } else {
          setNewVer(null); // เซิร์ฟเวอร์ตรงกับที่รันแล้ว → เคลียร์แถบ (กันค้างกรณี rollback)
        }
      } catch { /* ออฟไลน์/หาไฟล์ไม่เจอ → เงียบ */ }
    };
    check();
    const id = setInterval(() => { if (document.visibilityState === 'visible') check(); }, 180000);
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  if (!newVer || hidden) return null;
  const dismiss = () => { setHidden(true); hiddenUntil.current = Date.now() + 600000; }; // เงียบ 10 นาที แล้วเด้งซ้ำ
  return (
    <div className="update-banner" role="alert">
      <span className="update-banner-ico">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="22 4 22 10 16 10" />
          <path d="M19.5 15a8.5 8.5 0 1 1-2-9L22 10" />
        </svg>
      </span>
      <div className="update-banner-txt">
        <div className="update-banner-title">มีเวอร์ชันใหม่ — v{newVer}</div>
        <div className="update-banner-sub">อัปเดตเพื่อรับฟีเจอร์ล่าสุด + แก้บั๊ก</div>
      </div>
      <button className="update-banner-cta" style={{ background: 'var(--rail)', color: '#fff' }} onClick={() => window.location.reload()}>อัปเดตเดี๋ยวนี้</button>
      <button className="update-banner-x" onClick={dismiss} aria-label="ภายหลัง"><Icon name="x" /></button>
    </div>
  );
}

const TYPE_META = {
  feature:     { c: 'var(--good)',     l: 'ฟีเจอร์ใหม่' },
  improvement: { c: 'var(--accent-2)', l: 'ปรับปรุง' },
  fix:         { c: 'var(--info)',     l: 'อัปเดต & แก้บั๊ก' },
  release:     { c: 'var(--warn)',     l: 'เปิดตัว' },
};
const SEEN_KEY = 'tmk-seen-version';
const getSeen = () => { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } };

export function WhatsNew() {
  const latest = CHANGELOG[0];
  const [unseen, setUnseen] = useState(() => getSeen() !== APP_VERSION);
  const [open, setOpen] = useState(() => getSeen() !== APP_VERSION); // เด้งเองครั้งเดียวเมื่อมีเวอร์ชันใหม่

  const markSeen = useCallback(() => { try { localStorage.setItem(SEEN_KEY, APP_VERSION); } catch { /* ignore */ } setUnseen(false); }, []);
  const close = useCallback(() => { setOpen(false); markSeen(); }, [markSeen]);
  const toggle = () => setOpen(o => { const next = !o; if (next) markSeen(); return next; });

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!latest) return null;
  const meta = TYPE_META[latest.type] || TYPE_META.fix;
  const items = latest.items || [];
  const history = CHANGELOG.slice(1, 8);

  return (
    <div className="whatsnew">
      {open && (
        <div className="whatsnew-card" role="dialog" aria-label="มีอะไรใหม่">
          <div className="whatsnew-head whatsnew-head-navy" style={{ background: 'var(--surface-2)' }}>
            <span className="whatsnew-badge" style={{ background: 'var(--ink)', color: '#fff' }}><Icon name="help" /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="cap" style={{ color: 'var(--ink-3)', fontWeight: 700 }}>มีอะไรใหม่</div>
              <div className="row" style={{ gap: 7, alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>เวอร์ชัน {latest.ver}</span>
                <span className="whatsnew-chip" style={{ background: meta.c }}>{meta.l}</span>
              </div>
            </div>
            <button className="whatsnew-x" onClick={close} aria-label="ปิด"><Icon name="x" /></button>
          </div>
          <div className="whatsnew-scroll">
            <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 11 }}>{latest.date}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((it, i) => (
                <div key={i} className="row" style={{ gap: 9, alignItems: 'flex-start' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.c, marginTop: 6, flexShrink: 0 }} />
                  <span className="sm" style={{ lineHeight: 1.5 }}>{it}</span>
                </div>
              ))}
            </div>
            {history.length > 0 && (
              <>
                <div className="whatsnew-sep"><span /><span className="cap">เวอร์ชันก่อนหน้า</span><span /></div>
                <div className="whatsnew-timeline">
                  {history.map((u, i) => {
                    const m = TYPE_META[u.type] || TYPE_META.fix;
                    return (
                      <div key={i} className="whatsnew-tl-row">
                        <span className="whatsnew-tl-dot" style={{ background: m.c }} />
                        <div style={{ minWidth: 0 }}>
                          <div className="row" style={{ gap: 7, alignItems: 'baseline' }}>
                            <span className="sm" style={{ fontWeight: 700 }}>v{u.ver}</span>
                            <span className="cap" style={{ color: 'var(--ink-4)' }}>{u.date}</span>
                          </div>
                          <div className="cap" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(u.items && u.items[0]) || ''}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <button className={'whatsnew-fab' + (open ? ' active' : '')} onClick={toggle} aria-label="มีอะไรใหม่" title="มีอะไรใหม่">
        <Icon name="help" />
        {unseen && !open && <span className="whatsnew-dot" />}
      </button>
    </div>
  );
}
