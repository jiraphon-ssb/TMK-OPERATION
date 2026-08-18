/* ============================================================
   PdfViewer — เรนเดอร์ PDF ลง <canvas> ด้วย pdf.js (PART 83)
   ============================================================
   เหตุผล: <iframe src=*.pdf> พึ่งปลั๊กอิน PDF ของเบราว์เซอร์ — บาง Chromium
   (in-app browser) ไม่มี → iframe ดำ. render ด้วย pdf.js ทำงานทุกที่.
   lazy-import ตัวนี้ (React.lazy) → pdfjs โหลดเฉพาะตอนเปิดดูไฟล์ = ไม่บวม bundle หลัก
   fetch ไฟล์ครั้งเดียวตอนเปิด (public URL) = egress เท่า iframe เดิม */
import { useEffect, useRef, useState } from 'react';

let _pdfjs = null;
async function loadPdfjs() {
  if (_pdfjs) return _pdfjs;
  const lib = await import('pdfjs-dist');
  try {
    const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
    lib.GlobalWorkerOptions.workerSrc = worker.default;
  } catch { /* worker โหลดไม่ได้ → pdf.js fallback main thread */ }
  _pdfjs = lib;
  return lib;
}

export default function PdfViewer({ url }) {
  const wrapRef = useRef(null);
  const [state, setState] = useState('loading');   // loading | done | error
  useEffect(() => {
    let cancel = false;
    const wrap = wrapRef.current;
    if (wrap) wrap.innerHTML = '';
    // eslint-disable-next-line react-hooks/set-state-in-effect -- รีเซ็ตเป็น loading เมื่อ url เปลี่ยน ก่อน fetch+render async ในบล็อกเดียวกัน (คู่กับ setState('done'/'error') หลัง await)
    setState('loading');
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const buf = await (await fetch(url)).arrayBuffer();
        if (cancel) return;
        const doc = await pdfjs.getDocument({ data: buf }).promise;
        if (cancel) return;
        const containerW = wrap?.clientWidth || 700;
        for (let p = 1; p <= doc.numPages; p++) {
          const page = await doc.getPage(p);
          if (cancel) return;
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(2, Math.max(0.5, (containerW - 8) / base.width));
          const vp = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width; canvas.height = vp.height;
          canvas.style.cssText = 'width:100%;height:auto;margin-bottom:8px;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.12)';
          wrap?.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
          if (cancel) return;
        }
        setState('done');
      } catch { if (!cancel) setState('error'); }
    })();
    return () => { cancel = true; };
  }, [url]);
  return (
    <div>
      {state === 'loading' && <div className="py-10 text-center text-sm text-muted-foreground">กำลังโหลดใบเสร็จ…</div>}
      {state === 'error' && <div className="py-10 text-center text-sm text-muted-foreground">เปิดไฟล์ในหน้านี้ไม่ได้ — ลอง <a href={url} target="_blank" rel="noreferrer" className="font-medium underline" style={{ color: 'var(--accent)' }}>เปิดแท็บใหม่</a></div>}
      <div ref={wrapRef} />
    </div>
  );
}
