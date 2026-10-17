// @vitest-environment jsdom
// ============================================================
// DatePicker — กดวันที่ที่เลือกอยู่แล้วซ้ำ ต้องไม่ล้างค่า (บั๊ก L3822 · 17 ต.ค. 69)
// ============================================================
// react-day-picker (mode="single") กดวันที่เลือกอยู่ซ้ำ = "ยกเลิกการเลือก" → onSelect(undefined)
// เดิมส่งต่อเป็น onChange('') ตรง ๆ → เซลล์กดวันที่ 17 ซ้ำเพื่อ "ยืนยัน" วันที่ระบบเติมให้
// แต่ได้วันที่ว่างแทน → ใบเสร็จบันทึกแบบไม่มีวันที่ → ออเดอร์หายจากทุกหน้าที่กรองตามวันที่
// ล้างวันที่ได้ทางเดียว = ปุ่ม "ล้างวันที่" (ตั้งใจกด ไม่ใช่เผลอ)
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DatePicker } from '@/components/ui/date-picker';

afterEach(cleanup);

const open = (value, onChange) => {
  render(<DatePicker value={value} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button'));
};
const dayButton = (n) => [...document.querySelectorAll('button[name="day"], .rdp-day')]
  .find(b => b.textContent.trim() === String(n) && !b.classList.contains('rdp-day_outside') && !b.className.includes('outside'));

describe('DatePicker — กดวันเดิมซ้ำไม่ล้างค่า', () => {
  it('กดวันที่ที่เลือกอยู่แล้วซ้ำ → ไม่ส่งค่าว่าง (วันที่ต้องยังอยู่)', () => {
    const onChange = vi.fn();
    open('2026-10-17', onChange);
    fireEvent.click(dayButton(17));
    expect(onChange).not.toHaveBeenCalledWith('');
  });

  it('กดวันอื่น → ได้วันที่ใหม่ (ฟังก์ชันปกติยังทำงาน)', () => {
    const onChange = vi.fn();
    open('2026-10-17', onChange);
    fireEvent.click(dayButton(18));
    expect(onChange).toHaveBeenCalledWith('2026-10-18');
  });

  it('ปุ่ม "ล้างวันที่" → ยังล้างได้ (ทางตั้งใจ)', () => {
    const onChange = vi.fn();
    open('2026-10-17', onChange);
    fireEvent.click(screen.getByText('ล้างวันที่'));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
