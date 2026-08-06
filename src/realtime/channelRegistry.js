/* ============================================================
   realtime/channelRegistry.js — Phase 2: central channel registry (blueprint §20)
   ============================================================
   ปัญหาเดิม: แต่ละ hook/component สร้าง supabase.channel() เอง (ชื่อ random) →
   หลาย channel ซ้ำ topic เดียวกัน + ไม่มี refcount + cleanup กระจาย
   registry นี้: dedup ตาม key · refcount · subscribe once · removeChannel เมื่อ subscriber = 0
   - Phase 2 ยังใช้ Postgres Changes (bindings) — เปลี่ยนแค่ "ใครถือ channel" ไม่เปลี่ยน event source
   - ไม่แตะ dataContext global channel (เสี่ยง) — ใช้กับ scoped channels ก่อน (saleRealtime ฯลฯ)
   ============================================================ */
import { supabase } from '../lib/supabaseClient.js';
import { rtDiag } from './diagnostics.js';

// key → { channel, refs, handlers:Set, errored, closing }
const registry = new Map();

/* ---- สถานะการเชื่อมต่อรวม (สำหรับ poll-while-down + indicator "กำลังเชื่อมต่อใหม่") ----
   supabase-js ต่อ socket กลับเองอัตโนมัติ แต่ช่วงหลุด event ที่เกิดจะ "พลาด" ไป →
   เมื่อ channel รีจอย (SUBSCRIBED หลัง errored) เรายิง {__resync} ให้ทุก handler refetch ชดเชย */
let _down = false;
const _connListeners = new Set();
function _recomputeDown() {
  let any = false;
  for (const e of registry.values()) { if (e.errored) { any = true; break; } }
  if (any !== _down) { _down = any; _connListeners.forEach((fn) => { try { fn(_down); } catch { /* ignore */ } }); }
}
export function isRealtimeDown() { return _down; }
export function onConnectionChange(fn) { _connListeners.add(fn); return () => _connListeners.delete(fn); }

/**
 * subscribe ผ่าน registry (dedup + refcount)
 * @param {object} o
 *   key: string — logical channel (reuse ถ้าซ้ำ · ควร derive จาก table-set ให้ stable)
 *   bindings: Array<{ table, event?, filter? }> — postgres_changes (ใช้ตอนสร้าง channel ครั้งแรกเท่านั้น)
 *   onEvent: (payload, table) => void
 * @returns () => void — unsubscribe (refcount-- · removeChannel เมื่อถึง 0)
 */
export function subscribeChanges({ key, bindings = [], onEvent }) {
  if (!key || typeof onEvent !== 'function') return () => {};
  let entry = registry.get(key);
  if (!entry) {
    if (!supabase) return () => {};
    const handlers = new Set();
    const channel = supabase.channel(key);
    bindings.forEach((b) => {
      channel.on(
        'postgres_changes',
        { event: b.event || '*', schema: 'public', table: b.table, ...(b.filter ? { filter: b.filter } : {}) },
        (payload) => {
          rtDiag.event(b.table);
          handlers.forEach((h) => { try { h(payload, b.table); } catch { /* ignore handler error */ } });
        },
      );
    });
    entry = { channel, refs: 0, handlers, errored: false, closing: false };
    registry.set(key, entry);
    // status callback: ตรวจหลุด/ต่อกลับ → อัปเดตสถานะรวม + resync หลังรีจอย
    channel.subscribe((status) => {
      if (entry.closing) return; // ปิดเอง (removeChannel) → เมิน CLOSED กัน recompute หลังลบ
      if (status === 'SUBSCRIBED') {
        const wasErrored = entry.errored;
        entry.errored = false;
        rtDiag.channelOpen(key);
        _recomputeDown();
        if (wasErrored) {
          // รีจอยหลังหลุด → refetch ชดเชย event ที่พลาดช่วง socket หลุด (กันข้อมูลค้างต้อง F5)
          entry.handlers.forEach((h) => { try { h({ __resync: true }, null); } catch { /* ignore */ } });
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        entry.errored = true;
        rtDiag.channelClose(key);
        _recomputeDown();
      }
    });
  }
  entry.refs += 1;
  entry.handlers.add(onEvent);
  let done = false;
  return () => {
    if (done) return; // กัน unsubscribe ซ้ำ (refcount ไม่เพี้ยน)
    done = true;
    entry.handlers.delete(onEvent);
    entry.refs -= 1;
    if (entry.refs <= 0) {
      entry.closing = true; // กัน status callback (CLOSED) เข้ามา recompute หลังลบ (PART 46 pattern)
      registry.delete(key);
      rtDiag.channelClose(key);
      try { supabase.removeChannel(entry.channel); } catch { /* ignore */ }
      _recomputeDown();
    }
  };
}

// dev/diagnostic helpers
export function activeChannelKeys() { return [...registry.keys()].sort(); }
export function channelRefs(key) { return registry.get(key)?.refs || 0; }
