import { describe, it, expect } from 'vitest';
import { createEventDedup } from '../eventDedup.js';

describe('eventDedup — bounded dedup (§11.2)', () => {
  it('add แล้ว seen เป็น true · id ที่ไม่เคย = false', () => {
    const d = createEventDedup();
    expect(d.seen('e1')).toBe(false);
    d.add('e1');
    expect(d.seen('e1')).toBe(true);
    expect(d.has('e1')).toBe(true);
  });
  it('evict LRU เมื่อเกิน max', () => {
    const d = createEventDedup({ max: 3 });
    ['a', 'b', 'c', 'd'].forEach(d.add);
    expect(d.size()).toBe(3);
    expect(d.seen('a')).toBe(false); // เก่าสุดถูก evict
    expect(d.seen('d')).toBe(true);
  });
  it('re-add ดัน recency (ไม่ถูก evict ก่อน)', () => {
    const d = createEventDedup({ max: 3 });
    ['a', 'b', 'c'].forEach(d.add);
    d.add('a');        // a กลับไปท้าย (recent)
    d.add('e');        // เกิน max → evict เก่าสุด = b (ไม่ใช่ a)
    expect(d.seen('a')).toBe(true);
    expect(d.seen('b')).toBe(false);
  });
  it('TTL — id หมดอายุ → seen=false (inject now)', () => {
    let t = 1000;
    const d = createEventDedup({ ttlMs: 100, now: () => t });
    d.add('e1');
    expect(d.seen('e1')).toBe(true);
    t = 1101; // เกิน ttl
    expect(d.seen('e1')).toBe(false);
  });
  it('prune ล้าง id หมดอายุ', () => {
    let t = 0;
    const d = createEventDedup({ ttlMs: 50, now: () => t });
    d.add('a'); d.add('b');
    t = 100;
    d.prune();
    expect(d.size()).toBe(0);
  });
  it('null id ไม่ crash / ไม่จด', () => {
    const d = createEventDedup();
    d.add(null); d.add(undefined);
    expect(d.size()).toBe(0);
  });
});
