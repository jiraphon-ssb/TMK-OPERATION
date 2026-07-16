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

// key → { channel, refs, handlers:Set }
const registry = new Map();

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
    channel.subscribe();
    rtDiag.channelOpen(key);
    entry = { channel, refs: 0, handlers };
    registry.set(key, entry);
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
      registry.delete(key);
      rtDiag.channelClose(key);
      try { supabase.removeChannel(entry.channel); } catch { /* ignore */ }
    }
  };
}

// dev/diagnostic helpers
export function activeChannelKeys() { return [...registry.keys()].sort(); }
export function channelRefs(key) { return registry.get(key)?.refs || 0; }
