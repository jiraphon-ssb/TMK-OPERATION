// @vitest-environment jsdom
/* ============================================================
   multiSelect-dom.test.jsx — ชิปตัวกรองกลาง (เดิมมีสำเนา 6 ชุด)
   ============================================================
   ตัวนี้ตอนนี้ถูกใช้ร่วมกัน 6 หน้า (ออเดอร์ · CRM · รายงานขาย · ประสิทธิภาพเซล ·
   แคตตาล็อก · บันทึกกิจกรรม) → ถ้าพังจะพังพร้อมกันหมด จึงต้องมีเทสต์คุม
   สำคัญ: ต้องรองรับ options ทั้งแบบ string[] และ {value,label}[] เพราะของเดิม
   แต่ละหน้าส่งไม่เหมือนกัน (views-log ส่ง object + render เอง)
   ============================================================ */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MultiSelect } from '../components/MultiSelect.jsx';

afterEach(cleanup);

// Radix DropdownMenu เปิดด้วย pointerdown (ไม่ใช่ click) — jsdom ต้องยิง event ตรงนี้เอง
const openMenu = (label) => fireEvent.pointerDown(
  screen.getByRole('button', { name: label }), { button: 0, ctrlKey: false, pointerType: 'mouse' }
);

describe('MultiSelect (ตัวกลาง)', () => {
  it('ยังไม่เลือก → ไม่มีตัวเลขนับบนปุ่ม', () => {
    render(<MultiSelect label="ช่องทาง" options={['Facebook', 'TikTok']} value={[]} onChange={() => {}} />);
    const btn = screen.getByRole('button', { name: /ช่องทาง/ });
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).not.toMatch(/\d/);
  });

  it('เลือกแล้ว → โชว์จำนวนที่เลือกบนปุ่ม', () => {
    render(<MultiSelect label="ช่องทาง" options={['Facebook', 'TikTok']} value={['Facebook']} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /ช่องทาง/ }).textContent).toMatch(/1/);
  });

  it('options เป็น string[] → กดแล้วส่งค่ากลับถูกต้อง', () => {
    const onChange = vi.fn();
    render(<MultiSelect label="ช่องทาง" options={['Facebook', 'TikTok']} value={[]} onChange={onChange} />);
    openMenu(/ช่องทาง/);
    fireEvent.click(screen.getByText('TikTok'));
    expect(onChange).toHaveBeenCalledWith(['TikTok']);
  });

  it('options เป็น {value,label}[] → โชว์ label แต่ส่งกลับเป็น value (แบบที่ views-log ใช้)', () => {
    const onChange = vi.fn();
    render(
      <MultiSelect
        label="ประเภท"
        options={[{ value: 'create', label: 'สร้าง' }, { value: 'delete', label: 'ลบ' }]}
        value={[]}
        onChange={onChange}
      />
    );
    openMenu(/ประเภท/);
    fireEvent.click(screen.getByText('สร้าง'));
    expect(onChange).toHaveBeenCalledWith(['create']);
  });

  it('กดค่าที่เลือกอยู่ซ้ำ → ถอดออก', () => {
    const onChange = vi.fn();
    render(<MultiSelect label="ช่องทาง" options={['Facebook']} value={['Facebook']} onChange={onChange} />);
    openMenu(/ช่องทาง/);
    fireEvent.click(screen.getByText('Facebook'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('ปุ่ม "ล้าง" โผล่เฉพาะตอนมีตัวเลือกอยู่ และล้างทั้งหมด', () => {
    const onChange = vi.fn();
    render(<MultiSelect label="ช่องทาง" options={['Facebook']} value={['Facebook']} onChange={onChange} />);
    openMenu(/ช่องทาง/);
    fireEvent.click(screen.getByText('ล้าง'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('ไม่มีตัวเลือกเลย → บอก "ไม่มีข้อมูล" (ไม่ใช่เมนูว่างเปล่าให้งง)', () => {
    render(<MultiSelect label="ช่องทาง" options={[]} value={[]} onChange={() => {}} />);
    openMenu(/ช่องทาง/);
    expect(screen.getByText('ไม่มีข้อมูล')).toBeInTheDocument();
  });
});
