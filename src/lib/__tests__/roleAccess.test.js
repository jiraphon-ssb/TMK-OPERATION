import { describe, it, expect } from 'vitest';
import { isAdmin, myNamesOf, canSeeTeam, orderVisibleTo } from '../roleAccess.js';

// Characterization tests — ล็อกสิทธิ์ตาม role (security-critical: ใครเห็นออเดอร์/ทั้งทีมได้บ้าง)
const admin = { role: 'admin', name: 'แอดมิน', email: 'admin@tmk.co' };
const seller = { role: 'editor', name: 'แอน', email: 'ann@tmk.co' };
const viewer = { role: 'viewer', name: 'บี', email: 'bee@tmk.co' };

describe('isAdmin / canSeeTeam', () => {
  it('role=admin → true', () => { expect(isAdmin(admin)).toBe(true); expect(canSeeTeam(admin)).toBe(true); });
  it('role อื่น → false', () => {
    expect(isAdmin(seller)).toBe(false);
    expect(isAdmin(viewer)).toBe(false);
    expect(canSeeTeam(seller)).toBe(false);
  });
  it('user null/undefined → false (ไม่ล็อกอิน = ไม่ใช่ admin)', () => {
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
    expect(isAdmin({})).toBe(false);
  });
});

describe('myNamesOf', () => {
  it('คืน [name, email] ที่ไม่ว่าง', () => {
    expect(myNamesOf(seller)).toEqual(['แอน', 'ann@tmk.co']);
    expect(myNamesOf({ name: 'X' })).toEqual(['X']);
    expect(myNamesOf({ email: 'y@z.co' })).toEqual(['y@z.co']);
    expect(myNamesOf({})).toEqual([]);
    expect(myNamesOf(null)).toEqual([]);
  });
});

describe('orderVisibleTo — admin เห็นทุกใบ · คนอื่นเห็นเฉพาะของตัวเอง', () => {
  it('admin เห็นทุกออเดอร์ (แม้ salesperson คนอื่น)', () => {
    expect(orderVisibleTo({ salesperson: 'แอน' }, admin)).toBe(true);
    expect(orderVisibleTo({ salesperson: 'ใครก็ไม่รู้' }, admin)).toBe(true);
    expect(orderVisibleTo({ salesperson: '' }, admin)).toBe(true);
  });
  it('seller เห็นเฉพาะออเดอร์ที่ salesperson = ชื่อ หรือ อีเมลตัวเอง', () => {
    expect(orderVisibleTo({ salesperson: 'แอน' }, seller)).toBe(true);        // ชื่อ
    expect(orderVisibleTo({ salesperson: 'ann@tmk.co' }, seller)).toBe(true); // อีเมล
    expect(orderVisibleTo({ salesperson: 'บี' }, seller)).toBe(false);        // คนอื่น
    expect(orderVisibleTo({ salesperson: '' }, seller)).toBe(false);          // ไม่ระบุเซลล์
    expect(orderVisibleTo({}, seller)).toBe(false);                          // ไม่มี salesperson
  });
  it('viewer ก็เห็นเฉพาะของตัวเอง (เหมือน seller · non-admin)', () => {
    expect(orderVisibleTo({ salesperson: 'บี' }, viewer)).toBe(true);
    expect(orderVisibleTo({ salesperson: 'แอน' }, viewer)).toBe(false);
  });
  it('user null → เห็นเฉพาะออเดอร์ salesperson ว่าง? ไม่ — myNames ว่าง จึงไม่เห็นอะไร', () => {
    expect(orderVisibleTo({ salesperson: 'แอน' }, null)).toBe(false);
    expect(orderVisibleTo({ salesperson: '' }, null)).toBe(false); // '' ไม่อยู่ใน [] ว่าง
  });
});
