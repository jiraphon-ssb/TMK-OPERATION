/* ============================================================
   TMK — ปุ่มสแกนรูปด้วย AI (reusable)
   ============================================================
   วางในหัว modal ไหนก็ได้: <ScanButton task="receipt" hint={...} onResult={fn} />
   - มือถือกดแล้วเปิดกล้อง (capture=environment)
   - อ่านสำเร็จ → เรียก onResult(data) ให้ modal เอาไปเติมฟอร์ม (ไม่ auto-save)
   - ล้มเหลว → toast แจ้ง แล้วผู้ใช้พิมพ์เองได้ (ไม่บล็อก)
   ============================================================ */
import { useRef, useState } from 'react';
import { Icon } from './components.jsx';
import { Button } from '@/components/ui/button';
import { aiExtractFromImage } from './lib/aiExtract.js';

export function ScanButton({ task, hint, onResult, label = 'สแกนรูปด้วย AI' }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // ให้เลือกไฟล์เดิมซ้ำได้
    if (!file) return;
    setBusy(true);
    try {
      const res = await aiExtractFromImage(task, file, hint);
      onResult?.(res.data, res);
      window.__toast?.('อ่านรูปแล้ว — ตรวจสอบให้ครบก่อนบันทึก', 'success');
    } catch (err) {
      window.__toast?.(String(err?.message || err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => ref.current?.click()}
        title="ถ่าย/เลือกรูป แล้วให้ AI กรอกให้ (ตรวจสอบก่อนบันทึก)">
        <Icon name={busy ? 'refresh' : 'image'} /> {busy ? 'กำลังอ่านรูป…' : label}
      </Button>
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={pick} />
    </>
  );
}
