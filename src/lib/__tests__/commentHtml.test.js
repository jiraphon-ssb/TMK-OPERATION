import { describe, it, expect } from 'vitest';
import { escHtml, renderCommentHtml } from '../commentHtml.js';

describe('escHtml', () => {
  it('escape อักขระ HTML ครบทั้ง 5 ตัว รวมเครื่องหมายคำพูด', () => {
    expect(escHtml('& < > " \'')).toBe('&amp; &lt; &gt; &quot; &#39;');
  });
});

describe('renderCommentHtml — กัน XSS', () => {
  it('URL ที่มี " แหกออกจาก href ไม่ได้ (ไม่มี event handler หลุดเป็น attribute)', () => {
    const payload = 'https://x.co/"onmouseover="alert(document.cookie)';
    const out = renderCommentHtml(payload);
    // ต้องไม่มี attribute onmouseover จริง (ตามด้วย = ที่รันได้)
    expect(out).not.toMatch(/\sonmouseover\s*=/i);
    // quote ในลิงก์ต้องถูก escape เป็น &quot; แล้วอยู่ใน text/href เท่านั้น
    expect(out).toContain('&quot;');
  });

  it('แท็ก HTML ตรงๆ ถูก escape ไม่รันเป็น element', () => {
    const out = renderCommentHtml('<img src=x onerror=alert(1)>');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('ไม่ autolink สคีมอันตราย (javascript:) เป็น <a href>', () => {
    const out = renderCommentHtml('javascript:alert(1)');
    expect(out).not.toContain('<a ');
  });

  it('ยังทำงานปกติ: ลิงก์ปลอดภัย + bold + @mention', () => {
    const out = renderCommentHtml('ดู https://tmk.co งาน **ด่วน** @สมชาย');
    expect(out).toContain('href="https://tmk.co"');
    expect(out).toContain('<strong>ด่วน</strong>');
    expect(out).toContain('@สมชาย');
  });
});
