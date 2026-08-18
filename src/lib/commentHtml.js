// เรนเดอร์คอมเมนต์งาน → HTML แบบปลอดภัย (ใช้กับ dangerouslySetInnerHTML ใน modals-task.jsx)
// แยกออกมาเป็นไฟล์ pure เพื่อเขียน test ได้ + เลี่ยง react-refresh (ไม่ export non-component จากไฟล์ component)
//
// ⚠️ ความปลอดภัย: escHtml ต้อง escape เครื่องหมายคำพูดด้วย — ไม่งั้น URL ที่มี " จะแหกออกจาก
//    attribute href="..." แล้วยัด event handler (onmouseover=...) เข้ามารันได้ = Stored XSS
export const escHtml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function renderCommentHtml(text) {
  let h = escHtml(text);
  h = h.replace(/`([^`\n]+)`/g, '<code class="px-1 py-0.5 rounded bg-muted text-[0.85em] font-mono">$1</code>');
  h = h.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  h = h.replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>');
  // autolink เฉพาะ http/https เท่านั้น (regex จับ https?:// อยู่แล้ว → javascript:/data: เข้าไม่ได้)
  // URL ถูก escHtml มาก่อน → " ในลิงก์กลายเป็น &quot; แหกออกจาก href ไม่ได้
  h = h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-primary underline">$1</a>');
  h = h.replace(/(^|\s)(@[฀-๿A-Za-z0-9_.-]+)/g, '$1<span class="text-primary font-medium">$2</span>');
  return h.replace(/\n/g, '<br/>');
}
