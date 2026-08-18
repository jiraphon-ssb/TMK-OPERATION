import { describe, it, expect } from 'vitest';
import { chipVar } from '../salesViewsUi.js';

describe('chipVar', () => {
  it('แปลง chip class เป็น badge variant ที่ถูกต้อง', () => {
    expect(chipVar('chip-good')).toBe('success');
    expect(chipVar('chip-warn')).toBe('warning');
    expect(chipVar('chip-bad')).toBe('danger');
    expect(chipVar('chip-accent')).toBe('accent');
  });

  it('class ที่ไม่รู้จัก → secondary', () => {
    expect(chipVar('')).toBe('secondary');
    expect(chipVar('chip-unknown')).toBe('secondary');
    expect(chipVar(undefined)).toBe('secondary');
    expect(chipVar(null)).toBe('secondary');
  });
});
