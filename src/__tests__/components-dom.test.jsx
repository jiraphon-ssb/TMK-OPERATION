// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SourceBadge, InfoTip } from '../components.jsx';

// TEST-1 — smoke component/DOM test (พิสูจน์ jsdom + RTL ทำงาน) · ครอบ SourceBadge (KPI-1) + InfoTip tooltip
afterEach(cleanup);

describe('SourceBadge (component · KPI-1)', () => {
  it('kind=truth → ป้าย "ยอดจริง (การเงิน)"', () => {
    const { container } = render(<SourceBadge kind="truth" />);
    expect(container.textContent).toContain('ยอดจริง (การเงิน)');
    expect(container.textContent).toContain('แหล่ง');
  });
  it('kind=analytics → ป้าย "วิเคราะห์จากออเดอร์"', () => {
    const { container } = render(<SourceBadge kind="analytics" />);
    expect(container.textContent).toContain('วิเคราะห์จากออเดอร์');
  });
});

describe('InfoTip (component · tooltip toggle)', () => {
  it('คลิก ⓘ → แสดง tooltip · คลิกซ้ำ → ซ่อน', () => {
    render(<InfoTip text="คำอธิบายทดสอบ" label="ทดสอบ" />);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /คำอธิบาย/ });
    fireEvent.click(btn);
    expect(screen.getByRole('tooltip')).toHaveTextContent('คำอธิบายทดสอบ');
    fireEvent.click(btn);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
  it('ไม่มี text → ไม่ render อะไร', () => {
    const { container } = render(<InfoTip text="" />);
    expect(container).toBeEmptyDOMElement();
  });
});
