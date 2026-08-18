/* Spotlight (⌘K command palette) — แยกจาก App god-file (PART 84 REFACTOR-1) */
import { useState, useEffect, useRef, useMemo } from 'react';
import { TMK } from './data.js';
import { ROW_LIMITS } from './dataContext.jsx';
import { Icon, B, Bk, N } from './components.jsx';

/* ---- Spotlight Search ---- */

// ---- Spotlight recents (localStorage) — boost รายการที่ใช้ล่าสุด ----
const SPOT_RECENT_KEY = 'tmk-spotlight-recent';
const readSpotRecents = () => { try { return JSON.parse(localStorage.getItem(SPOT_RECENT_KEY)) || []; } catch { return []; } };
const pushSpotRecent = (item) => {
  try {
    const list = readSpotRecents().filter(r => !(r.label === item.label && r.cat === item.cat));
    list.unshift({ cat: item.cat, icon: item.icon, label: item.label, sub: item.sub, color: item.color, go: item.go });
    localStorage.setItem(SPOT_RECENT_KEY, JSON.stringify(list.slice(0, 6)));
  } catch { /* ignore quota/parse */ }
};

export function Spotlight({ onClose, onGo }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);
  const recents = useMemo(() => readSpotRecents(), []);

  useEffect(() => { inputRef.current?.focus(); }, []);
  // เปลี่ยนคำค้น → reset ตัวเลือกเป็นรายการแรก (ทำตอนพิมพ์ ไม่ใช่ใน effect → กัน re-render ซ้ำ)
  const onQuery = (v) => { setQ(v); setIdx(0); };

  const ql = q.toLowerCase().trim();
  const results = [];

  // Helper — safe lowercase (handles null/undefined/non-string)
  const lc = (v) => String(v || '').toLowerCase();

  // เปิดรายการ + จำไว้เป็น "ล่าสุด" (go = [section, sub] แบบ serialize ได้)
  const fire = (r) => { pushSpotRecent(r); onGo(r.go[0], r.go[1]); onClose(); };

  if (ql) {
    // Tasks
    (TMK.tasks || []).filter(t => lc(t.title).includes(ql) || lc(t.detail).includes(ql)).slice(0, 5).forEach(t => {
      const c = (TMK.campaigns || []).find(x => x.id === t.camp);
      results.push({ cat: 'งาน', icon: 'listChecks', label: t.title, sub: `${t.date} · ${c?.name || ''}`, color: c?.color, go: ['flows', 'kanban'] });
    });
    // Products
    (TMK.products || []).filter(p => lc(p.name).includes(ql)).slice(0, 3).forEach(p => {
      results.push({ cat: 'สินค้า', icon: 'bag', label: p.name, sub: `${B(p.price)} · ขาย ${N(p.units)} ตัว`, color: 'var(--accent)', go: ['catalog', 'products'] });
    });
    // Campaigns
    (TMK.campaigns || []).filter(c => lc(c.name).includes(ql)).slice(0, 3).forEach(c => {
      results.push({ cat: 'แคมเปญ', icon: 'megaphone', label: c.name, sub: `${c.start}–${c.end}`, color: c.color, go: ['settings', 'campaigns'] });
    });
    // Staff
    (TMK.staff || []).filter(s => lc(s.name).includes(ql) || lc(s.role).includes(ql)).forEach(s => {
      results.push({ cat: 'ทีม', icon: 'users', label: s.name, sub: s.role, color: s.color, go: ['settings', 'roles'] });
    });
    // Channels
    (TMK.channels || []).filter(c => lc(c.name).includes(ql)).forEach(c => {
      results.push({ cat: 'ช่องทาง', icon: 'layers', label: c.name, sub: `เป้า ${Bk(c.target)}`, color: c.hex, go: ['sales', 'channels'] });
    });
    // Orders (ค้นด้วยรหัสออเดอร์ / ชื่อลูกค้า)
    (TMK.orders || []).filter(o => lc(o.code).includes(ql) || lc(o.customerName).includes(ql)).slice(0, 4).forEach(o => {
      results.push({ cat: 'ออเดอร์', icon: 'listChecks', label: o.code || o.customerName || 'ออเดอร์', sub: `${o.customerName || ''} · ${B(o.total)}`, color: 'var(--accent-2)', go: ['catalog', 'orders'] });
    });
    // Customers (ค้นด้วยชื่อ / เบอร์ / รหัส)
    (TMK.customers || []).filter(c => lc(c.name).includes(ql) || lc(c.phone).includes(ql) || lc(c.code).includes(ql)).slice(0, 4).forEach(c => {
      results.push({ cat: 'ลูกค้า', icon: 'users', label: c.name || c.code || 'ลูกค้า', sub: `${c.phone || ''}${c.orderCount ? ' · ' + c.orderCount + ' ออเดอร์' : ''}`, color: 'var(--info)', go: ['catalog', 'customers'] });
    });
    // Navigation
    [{ l: 'หน้าหลัก', s: 'home' }, { l: 'ยอดขาย', s: 'sales', sub: 'overview' }, { l: 'ปฏิทิน', s: 'flows', sub: 'calendar' }, { l: 'Kanban', s: 'flows', sub: 'kanban' }, { l: 'ไทม์ไลน์', s: 'flows', sub: 'timeline' }, { l: 'สินค้า', s: 'catalog', sub: 'products' }, { l: 'แคมเปญ', s: 'settings', sub: 'campaigns' }]
      .filter(n => lc(n.l).includes(ql)).forEach(n => {
        results.push({ cat: 'นำทาง', icon: 'arrowR', label: `ไปที่ ${n.l}`, sub: '', color: 'var(--ink-3)', go: [n.s, n.sub] });
      });
  } else {
    // ไม่มีคำค้น → โชว์ "ล่าสุด" ที่เคยเปิด (recent boost)
    recents.forEach(r => results.push({ ...r, cat: 'ล่าสุด' }));
  }

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[idx]) { fire(results[idx]); }
    else if (e.key === 'Escape') { onClose(); }
  };

  // Group by cat
  const grouped = {};
  results.forEach((r, i) => { r._i = i; grouped[r.cat] = grouped[r.cat] || []; grouped[r.cat].push(r); });

  return (
    <div className="spotlight-scrim" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', width: '100%', maxWidth: 580, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--sh-pop)', overflow: 'hidden', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
        {/* Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <span style={{ width: 20, height: 20, flexShrink: 0, color: 'var(--ink-3)' }}><Icon name="search" /></span>
          <input ref={inputRef} value={q} onChange={e => onQuery(e.target.value)} onKeyDown={onKey}
            placeholder="ค้นหา"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 'var(--fs-h3)', fontWeight: 500, color: 'var(--ink)', fontFamily: 'var(--font)' }} />
          <kbd style={{ fontFamily: 'var(--mono)', fontSize: 'var(--fs-micro)', color: 'var(--ink-3)', border: '1px solid var(--line)', borderRadius: 5, padding: '2px 6px', background: 'var(--surface-2)' }}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {!ql && results.length === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink-3)' }}>
              <div style={{ fontSize: 'var(--fs-sm)', marginBottom: 4 }}>พิมพ์เพื่อค้นหา</div>
              <div className="cap">งาน · สินค้า · แคมเปญ · ทีม · ช่องทาง · นำทาง</div>
            </div>
          )}
          {ql && results.length === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink-3)' }}>
              <div style={{ fontSize: 'var(--fs-sm)' }}>ไม่พบผลลัพธ์สำหรับ "{q}"</div>
              {/* บอกขอบเขตการค้นหาให้ชัด — ออเดอร์/ลูกค้าถูกตัดที่ N รายล่าสุด
                  ผู้ใช้ค้นของเก่าไม่เจอแล้วนึกว่า "ระบบไม่มีข้อมูล" = เสียความเชื่อมั่น */}
              <div className="cap" style={{ marginTop: 8, lineHeight: 1.7 }}>
                ค้นหาด่วนครอบคลุมออเดอร์ {ROW_LIMITS.orders} รายล่าสุด และลูกค้า {ROW_LIMITS.customers} รายล่าสุด
                <br />ถ้าเป็นข้อมูลเก่ากว่านั้น ให้ค้นในหน้าออเดอร์ หรือหน้าลูกค้าโดยตรง
              </div>
            </div>
          )}
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <div className="eyebrow" style={{ padding: '10px 20px 4px' }}>{cat}</div>
              {items.map(r => (
                <button key={r._i} onClick={() => fire(r)} onMouseEnter={() => setIdx(r._i)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 20px', border: 'none', background: idx === r._i ? 'var(--accent-soft)' : 'transparent', color: 'var(--ink)', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font)', transition: 'background 0.08s' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 'var(--r-sm)', background: (r.color || 'var(--ink-3)') + '18', color: r.color || 'var(--ink-3)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name={r.icon} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="sm" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
                    {r.sub && <div className="cap" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sub}</div>}
                  </div>
                  {idx === r._i && <span className="cap" style={{ flexShrink: 0 }}>↵ เปิด</span>}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div style={{ padding: '8px 20px', borderTop: '1px solid var(--line)', display: 'flex', gap: 16, justifyContent: 'center' }}>
            <span className="cap row" style={{ gap: 4 }}><kbd style={{ fontFamily: 'var(--mono)', fontSize: 9, border: '1px solid var(--line)', borderRadius: 3, padding: '1px 4px' }}>↑↓</kbd> เลือก</span>
            <span className="cap row" style={{ gap: 4 }}><kbd style={{ fontFamily: 'var(--mono)', fontSize: 9, border: '1px solid var(--line)', borderRadius: 3, padding: '1px 4px' }}>↵</kbd> เปิด</span>
            <span className="cap row" style={{ gap: 4 }}><kbd style={{ fontFamily: 'var(--mono)', fontSize: 9, border: '1px solid var(--line)', borderRadius: 3, padding: '1px 4px' }}>esc</kbd> ปิด</span>
          </div>
        )}
      </div>
    </div>
  );
}
