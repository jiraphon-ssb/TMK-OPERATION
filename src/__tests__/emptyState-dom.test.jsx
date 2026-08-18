// @vitest-environment jsdom
/* ============================================================
   emptyState-dom.test.jsx — EmptyState ต้องแยก 3 สถานะให้ผู้ใช้เห็นต่างกันจริง
   ============================================================
   เหตุผลที่ต้องมีเทสต์: จุดประสงค์ทั้งหมดของคอมโพเนนต์นี้คือให้ผู้ใช้
   "แยกออก" ว่าว่างเพราะยังไม่มีข้อมูล / ตัวกรองไม่ตรง / โหลดพลาด
   ถ้าวันหน้ามีคนแก้จนสามโหมดหน้าตาเหมือนกันหมด = เสียจุดประสงค์ทั้งหมด
   ============================================================ */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { EmptyState } from '../components/EmptyState.jsx';

afterEach(cleanup);

describe('EmptyState', () => {
  it('empty: แสดงหัวข้อ + คำอธิบาย + ปุ่มสร้าง', () => {
    const onClick = vi.fn();
    render(<EmptyState title="ยังไม่มีสินค้า" hint="เพิ่มเองก็ได้" action={{ label: 'เพิ่มสินค้า', onClick }} />);
    expect(screen.getByText('ยังไม่มีสินค้า')).toBeInTheDocument();
    expect(screen.getByText('เพิ่มเองก็ได้')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /เพิ่มสินค้า/ })).toBeInTheDocument();
  });

  it('filtered: มีปุ่มล้างตัวกรอง และไม่มีปุ่มลองใหม่', () => {
    render(<EmptyState mode="filtered" title="ไม่พบรายการ" onClear={() => {}} />);
    expect(screen.getByRole('button', { name: /ล้างตัวกรอง/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ลองใหม่/ })).toBeNull();
  });

  it('error: มีปุ่มลองใหม่ และใช้โทนสีเตือน (ไม่ใช่โทนเดียวกับว่างปกติ)', () => {
    const { container } = render(<EmptyState mode="error" title="โหลดไม่สำเร็จ" onRetry={() => {}} />);
    expect(screen.getByRole('button', { name: /ลองใหม่/ })).toBeInTheDocument();
    expect(container.querySelector('.text-\\[var\\(--bad\\)\\]')).toBeTruthy();
  });

  it('inline: ไม่มีกรอบประ (ใช้ในฟอร์ม/การ์ดเล็ก)', () => {
    const { container } = render(<EmptyState size="inline" title="ยังไม่มี alias" />);
    expect(container.querySelector('.border-dashed')).toBeNull();
    expect(screen.getByText(/ยังไม่มี alias/)).toBeInTheDocument();
  });

  it('inline + hint: ต่อท้ายด้วย — เพื่อให้อ่านเป็นบรรทัดเดียว', () => {
    render(<EmptyState size="inline" title="ยังไม่มี alias" hint="กดผูกลายจากตาราง" />);
    expect(screen.getByText('ยังไม่มี alias — กดผูกลายจากตาราง')).toBeInTheDocument();
  });
});
