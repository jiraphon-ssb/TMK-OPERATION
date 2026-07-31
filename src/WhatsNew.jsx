/* ============================================================
   TMK Operation — What's New (หน้าเต็มในเมนูโปรไฟล์)
   ============================================================
   - ไม่มีปุ่มลอย (FAB) แล้ว — changelog เป็น "หน้า" เข้าจากเมนูโปรไฟล์ใน sidebar
   - UpdateBanner (แถบ poll เวอร์ชันใหม่) ยังคงไว้
   - จุดแดง "ยังไม่อ่าน" sync ข้าม component ด้วย CustomEvent (useUnseenVersion)
   ============================================================ */
import { useState, useEffect } from 'react';
import { CHANGELOG, APP_VERSION } from './changelog.js';
import { Icon } from './components.jsx';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/* ---------- แถบ "มีเวอร์ชันใหม่" (แบบ A — นุ่ม) ----------
   เช็ค version.json บนเซิร์ฟเวอร์ทุก ~3 นาที + ตอนกลับมาที่แท็บ
   ถ้าเวอร์ชันที่ deploy ≠ เวอร์ชันที่รันอยู่ → เด้งแถบบนสุด กดอัปเดตเอง (ไม่บังคับ reload)
   กดปิด = ปิดเลย "ต่อเวอร์ชันนั้น" (จำใน localStorage) — ไม่เด้งซ้ำกวนใจ · เด้งใหม่เฉพาะมี deploy เวอร์ชันใหม่กว่า */
const UPD_DISMISS_KEY = 'tmk-update-dismissed';
export function UpdateBanner() {
  const [newVer, setNewVer] = useState(null);
  const [dismissedVer, setDismissedVer] = useState(() => { try { return localStorage.getItem(UPD_DISMISS_KEY) || ''; } catch { return ''; } });
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
          setNewVer(data.version); // เด้งเฉพาะเมื่อยังไม่เคยกดปิดเวอร์ชันนี้ (เช็คตอน render)
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
  if (!newVer || newVer === dismissedVer) return null;
  const dismiss = () => { setDismissedVer(newVer); try { localStorage.setItem(UPD_DISMISS_KEY, newVer); } catch { /* ignore */ } };
  return (
    <div className="update-banner" role="alert">
      <span className="update-banner-ico">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="22 4 22 10 16 10" />
          <path d="M19.5 15a8.5 8.5 0 1 1-2-9L22 10" />
        </svg>
      </span>
      <div className="update-banner-txt">
        <div className="update-banner-title">มีเวอร์ชันใหม่ <span className="update-banner-ver">v{newVer}</span></div>
        <div className="update-banner-sub">อัปเดตเพื่อรับฟีเจอร์ล่าสุด + แก้บั๊ก</div>
      </div>
      <button className="update-banner-cta" onClick={() => window.location.reload()}>อัปเดต</button>
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
const SEEN_EVT = 'tmk-version-seen';
const getSeen = () => { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } };

// ทำเครื่องหมาย "อ่านแล้ว" + แจ้งทุก component (จุดแดงหายพร้อมกัน)
export function markVersionSeen() {
  try { localStorage.setItem(SEEN_KEY, APP_VERSION); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(SEEN_EVT)); } catch { /* ignore */ }
}

// hook: มีเวอร์ชันใหม่ที่ยังไม่อ่านหรือยัง (sync ข้าม component ด้วย CustomEvent + storage)
export function useUnseenVersion() {
  const [unseen, setUnseen] = useState(() => getSeen() !== APP_VERSION);
  useEffect(() => {
    const refresh = () => setUnseen(getSeen() !== APP_VERSION);
    window.addEventListener(SEEN_EVT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(SEEN_EVT, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  return unseen;
}

// หน้าเต็ม changelog (ใน Settings > มีอะไรใหม่) — timeline ทุกเวอร์ชัน + mark seen ตอนเปิด
export function WhatsNewPage() {
  useEffect(() => { markVersionSeen(); }, []);
  if (!CHANGELOG.length) return null;
  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 760 }}>
      <div>
        <div className="row" style={{ gap: 9, alignItems: 'center' }}>
          <span className="grid size-9 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex-none"><Icon name="sparkle" /></span>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>มีอะไรใหม่</h2>
            <div className="cap" style={{ color: 'var(--ink-4)' }}>ประวัติการอัปเดตทั้งหมด · เวอร์ชันปัจจุบัน v{APP_VERSION}</div>
          </div>
        </div>
      </div>
      {CHANGELOG.map((u, i) => {
        const m = TYPE_META[u.type] || TYPE_META.fix;
        const items = u.items || [];
        const isLatest = i === 0;
        return (
          <Card key={u.ver + '-' + i} className="p-[18px]" style={isLatest ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent-soft)' } : undefined}>
            <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: items.length ? 12 : 0 }}>
              <span style={{ fontWeight: 800, fontSize: 16 }}>เวอร์ชัน {u.ver}</span>
              <Badge variant="outline" className="rounded-full font-semibold" style={{ background: m.c, color: '#fff', borderColor: 'transparent' }}>{m.l}</Badge>
              {isLatest && <Badge variant="secondary" className="rounded-full">ล่าสุด</Badge>}
              <span className="cap" style={{ color: 'var(--ink-4)', marginLeft: 'auto' }}>{u.date}</span>
            </div>
            {items.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {items.map((it, j) => {
                  // item รองรับ 2 แบบ: string (แบบเก่า มี emoji นำ) หรือ { icon, text } (แบบใหม่ ใช้ไอคอน)
                  const obj = it && typeof it === 'object';
                  const text = obj ? it.text : it;
                  return (
                    <div key={j} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                      {obj && it.icon ? (
                        <span className="grid place-items-center rounded-md flex-none" style={{ width: 22, height: 22, marginTop: 1, background: `color-mix(in srgb, ${m.c} 14%, transparent)`, color: m.c }}>
                          <Icon name={it.icon} className="size-3.5" />
                        </span>
                      ) : (
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: m.c, marginTop: 6, flexShrink: 0 }} />
                      )}
                      <span className="sm" style={{ lineHeight: 1.55 }}>{text}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
