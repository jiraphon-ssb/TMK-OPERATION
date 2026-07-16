/* ============================================================
   realtime/diagnostics.js — Phase 0 Instrumentation (REALTIME-BASELINE)
   ============================================================
   วัด baseline ของสถาปัตยกรรม realtime ปัจจุบัน "โดยไม่เปลี่ยน behavior"
   - dev-only: prod build (import.meta.env.DEV === false) → ทุก method เป็น no-op (early return · zero overhead)
   - bounded: counter/Set เท่านั้น ไม่มี array โตไม่จำกัด (กัน memory leak)
   - อ่านผลผ่าน window.__rtDiag.snapshot() ใน dev console
   ============================================================
   metrics (ตาม blueprint §32):
     activeChannels · eventsByTable · refetchByTable(+rows) · queryByTable(+rows,+cacheHits)
     reconnects · rendersByScreen
   ============================================================ */

// factory → instance (export แยกเพื่อให้ test สร้าง instance ที่ enabled ได้ทุก env)
export function createDiag({ enabled = true, maxKeys = 300 } = {}) {
  const ch = new Set();                 // topic ของ channel ที่เปิดอยู่
  const events = new Map();             // table → จำนวน realtime event ที่รับ
  const refetch = new Map();            // table → { count, rows } (full/table refetch)
  const query = new Map();              // table → { count, rows, cacheHits } (snapshot query)
  const renders = new Map();            // screen → จำนวน render
  let reconnects = 0;

  // เพิ่มค่าใน Map แบบ bounded (กัน key ระเบิด) — สร้าง entry ใหม่เฉพาะเมื่อยังไม่เต็ม
  const ensure = (map, key, init) => {
    let v = map.get(key);
    if (v === undefined) { if (map.size >= maxKeys) return null; v = init(); map.set(key, v); }
    return v;
  };

  return {
    get enabled() { return enabled; },

    channelOpen(topic) { if (enabled && topic != null) ch.add(String(topic)); },
    channelClose(topic) { if (enabled && topic != null) ch.delete(String(topic)); },

    event(table) {
      if (!enabled) return;
      const v = ensure(events, String(table), () => 0);
      if (v !== null) events.set(String(table), events.get(String(table)) + 1);
    },
    refetch(table, rows = 0) {
      if (!enabled) return;
      const v = ensure(refetch, String(table), () => ({ count: 0, rows: 0 }));
      if (v) { v.count += 1; v.rows += Number(rows) || 0; }
    },
    query(table, rows = 0, cached = false) {
      if (!enabled) return;
      const v = ensure(query, String(table), () => ({ count: 0, rows: 0, cacheHits: 0 }));
      if (v) { if (cached) v.cacheHits += 1; else { v.count += 1; v.rows += Number(rows) || 0; } }
    },
    reconnect() { if (enabled) reconnects += 1; },
    render(screen) {
      if (!enabled) return;
      const v = ensure(renders, String(screen), () => 0);
      if (v !== null) renders.set(String(screen), renders.get(String(screen)) + 1);
    },

    snapshot() {
      return {
        activeChannels: ch.size,
        channels: [...ch].sort(),
        eventsByTable: Object.fromEntries([...events].sort((a, b) => b[1] - a[1])),
        refetchByTable: Object.fromEntries([...refetch].map(([k, v]) => [k, { ...v }])),
        queryByTable: Object.fromEntries([...query].map(([k, v]) => [k, { ...v }])),
        reconnects,
        rendersByScreen: Object.fromEntries([...renders].sort((a, b) => b[1] - a[1])),
      };
    },
    reset() { ch.clear(); events.clear(); refetch.clear(); query.clear(); renders.clear(); reconnects = 0; },
  };
}

// singleton — เปิดเฉพาะ dev (prod = no-op ทั้งหมด · ไม่กระทบ behavior/perf)
const _dev = (() => { try { return !!import.meta.env?.DEV; } catch { return false; } })();
export const rtDiag = createDiag({ enabled: _dev });

// exposed ให้ dev console: window.__rtDiag.snapshot() / .reset()
if (_dev && typeof window !== 'undefined') {
  window.__rtDiag = rtDiag;
}
