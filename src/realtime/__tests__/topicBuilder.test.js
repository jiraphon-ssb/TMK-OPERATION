import { describe, it, expect } from 'vitest';
import { topic, parseTopic } from '../topicBuilder.js';

describe('topicBuilder — scoped topics (§6)', () => {
  it('core topics', () => {
    expect(topic.user('u1')).toBe('user:u1');
    expect(topic.team('sales-a')).toBe('team:sales-a');
    expect(topic.systemAnnouncements()).toBe('system:announcements');
  });
  it('orders topics (§6.3)', () => {
    expect(topic.ordersMonth('2026-07')).toBe('orders:month:2026-07');
    expect(topic.ordersMonth('2026-07-15')).toBe('orders:month:2026-07'); // ตัดเหลือเดือน
    expect(topic.ordersChannel('facebook', '2026-07')).toBe('orders:channel:facebook:2026-07');
    expect(topic.order('ord_123')).toBe('order:ord_123');
  });
  it('sales topics (§6.2) — default channel = all', () => {
    expect(topic.salesMonth('2026-07')).toBe('sales:month:2026-07:all');
    expect(topic.salesMonth('2026-07', 'shopee')).toBe('sales:month:2026-07:shopee');
    expect(topic.salesFunnel('2026-07', 'team-x')).toBe('sales:funnel:2026-07:team-x');
  });
  it('planner/crm/catalog/presence', () => {
    expect(topic.flow('f1')).toBe('flow:f1');
    expect(topic.task('t1')).toBe('task:t1');
    expect(topic.customer('c1')).toBe('customer:c1');
    expect(topic.presenceTeam('sales-a')).toBe('presence:team:sales-a');
  });
  it('sanitize — ช่องว่าง/colon → dash · lowercase (deterministic)', () => {
    expect(topic.team('Sales A')).toBe('team:sales-a');
    expect(topic.order('a:b c')).toBe('order:a-b-c');
    expect(topic.user('')).toBe('user:_'); // ว่าง → placeholder
  });
  it('parseTopic', () => {
    expect(parseTopic('orders:month:2026-07')).toEqual({ kind: 'orders', parts: ['month', '2026-07'] });
    expect(parseTopic('order:x')).toEqual({ kind: 'order', parts: ['x'] });
  });
});
