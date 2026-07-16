import { describe, it, expect } from 'vitest';
import { reduceCommentList } from '../commentThread.js';

const T = [{ id: 'a', text: 'hi' }, { id: 'b', text: 'yo', reactions: [] }];

describe('reduceCommentList — realtime thread patch (เก่า→ใหม่)', () => {
  it('INSERT → append ท้าย thread', () => {
    const out = reduceCommentList(T, { eventType: 'INSERT', new: { id: 'c', text: 'new' } });
    expect(out.map(c => c.id)).toEqual(['a', 'b', 'c']);
  });
  it('INSERT ซ้ำ id (echo ของ optimistic) → ไม่ append ซ้ำ · ref เดิม', () => {
    expect(reduceCommentList(T, { eventType: 'INSERT', new: { id: 'a' } })).toBe(T);
  });
  it('UPDATE → patch reaction/edit by id (merge)', () => {
    const out = reduceCommentList(T, { eventType: 'UPDATE', new: { id: 'b', reactions: [{ emoji: '👍', users: ['x'] }] } });
    expect(out.find(c => c.id === 'b').reactions).toHaveLength(1);
    expect(out.find(c => c.id === 'b').text).toBe('yo'); // field เดิมคงอยู่
  });
  it('UPDATE id ที่ไม่มี → ref เดิม', () => {
    expect(reduceCommentList(T, { eventType: 'UPDATE', new: { id: 'zzz' } })).toBe(T);
  });
  it('DELETE → remove by old.id', () => {
    expect(reduceCommentList(T, { eventType: 'DELETE', old: { id: 'a' } }).map(c => c.id)).toEqual(['b']);
  });
  it('DELETE id ไม่มี / type แปลก / payload ว่าง → ref เดิม', () => {
    expect(reduceCommentList(T, { eventType: 'DELETE', old: { id: 'z' } })).toBe(T);
    expect(reduceCommentList(T, { eventType: 'X' })).toBe(T);
    expect(reduceCommentList(T, {})).toBe(T);
  });
});
