/* ============================================================
   appShellParts.jsx — ชิ้นส่วนตกแต่งของ App shell (แยกจาก App.jsx)
   - LoadingScreen / DataErrorScreen / SyncIndicator / ErrorBoundary / RealtimeStatus
   - ยกมาทั้งดุ้น ไม่แก้เนื้อใน · ไม่ผูกกับ state ของ AppInner (รับ props ล้วน)
   ============================================================ */
import React, { useState, useEffect } from 'react';
import { Icon } from './components.jsx';
import { isRealtimeDown, onConnectionChange } from './realtime/channelRegistry.js';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import tmkLogo from './assets/tmk-logo.png';

// ข้อความสลับบนจอโหลด — ย้ายมา module level (ค่าคงที่ · ไม่ต้องสร้างใหม่ทุก render + เป็น dep ของ interval ไม่ได้)
const LOADING_TIPS = [
  'กำลังเชื่อมต่อฐานข้อมูล TMK…',
  'กำลังดึงยอดขายและข้อมูลรายวัน…',
  'กำลังเตรียมแดชบอร์ด…',
];
export function LoadingScreen() {
  const tips = LOADING_TIPS;
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI(v => (v + 1) % LOADING_TIPS.length), 1400);
    return () => clearInterval(id);
  }, []);
  
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center space-y-6">
        <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-muted/30 shadow-sm border">
          <img src={tmkLogo} alt="TMK" className="h-10 w-10 object-contain" />
        </div>
        
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex items-center space-x-2 text-lg font-semibold tracking-tight">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span>กำลังโหลดข้อมูล</span>
          </div>
          <p className="text-sm text-muted-foreground min-h-[20px] animate-pulse">
            {tips[i]}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---- Error screen (โหลดครั้งแรกล้มเหลว) ---- */
export function DataErrorScreen({ error, onRetry }) {
  const [busy, setBusy] = useState(false);
  const retry = async () => { setBusy(true); try { await onRetry?.(); } finally { setBusy(false); } };
  return (
    <div className="tmk-splash">
      <div className="splash-logo" style={{ animation: 'none' }}><img src={tmkLogo} alt="TMK" /></div>
      <div style={{ textAlign: 'center', maxWidth: 360, padding: '0 20px' }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--bad-soft, rgba(255,90,90,0.14))', color: 'var(--bad, #ff5a5a)', display: 'grid', placeItems: 'center', margin: '0 auto 14px', fontSize: 26, fontWeight: 800 }}>
          !
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>โหลดข้อมูลไม่สำเร็จ</div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 8, lineHeight: 1.7 }}>
          เชื่อมต่อฐานข้อมูลไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง
        </div>
        {error && <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 8, wordBreak: 'break-word' }}>{String(error)}</div>}
        <Button onClick={retry} disabled={busy} style={{ marginTop: 18 }}>
          {busy ? 'กำลังลองใหม่…' : 'ลองใหม่อีกครั้ง'}
        </Button>
      </div>
    </div>
  );
}

/* ---- Sync chip (ซิงค์ realtime หลังโหลดครั้งแรก) ---- */
export function SyncIndicator() {
  return (
    <>
      <div className="tmk-syncbar" aria-hidden="true"></div>
      <div className="tmk-syncchip-wrap"><div className="tmk-syncchip"><span className="sync-dot"></span>กำลังซิงค์ข้อมูล…</div></div>
    </>
  );
}

// กันจอขาว: ถ้า render throw → แสดง error + ปุ่มลองใหม่ (แทนจอว่างถาวร)
//  variant="section" (PART 95) = การ์ดเล็กในเนื้อหา → หน้าเดียวพัง ที่เหลือ (sidebar/เมนู) ยังใช้ได้
//  resetKey เปลี่ยน (เช่น สลับหน้า) → เคลียร์ error อัตโนมัติ ให้ลองใหม่เอง
export class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error(this.props.scope ? `Section "${this.props.scope}" crashed:` : 'App crashed:', err); }
  componentDidUpdate(prev) {
    if (this.state.err && prev.resetKey !== this.props.resetKey) this.setState({ err: null });
  }
  render() {
    if (this.state.err) {
      if (this.props.variant === 'section') {
        return (
          <div className="grid place-items-center px-4 py-16">
            <Card className="w-full max-w-[380px] p-6 text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full [&_svg]:size-5" style={{ background: 'var(--warn-soft, #fdf2d0)', color: 'var(--warn, #d99e16)' }}>
                <Icon name="alertTriangle" />
              </div>
              <h2 className="mb-1.5 text-base font-bold" style={{ color: 'var(--ink)' }}>หน้านี้สะดุดชั่วคราว</h2>
              <p className="mb-4 text-[13px] leading-relaxed" style={{ color: 'var(--ink-4)' }}>เมนูและหน้าอื่นยังใช้งานได้ตามปกติ — ลองเปิดหน้านี้ใหม่อีกครั้ง</p>
              <div className="flex justify-center gap-2.5">
                <Button variant="outline" size="sm" onClick={() => this.setState({ err: null })}>ลองใหม่</Button>
                <Button size="sm" onClick={() => location.reload()}>รีเฟรชทั้งหน้า</Button>
              </div>
            </Card>
          </div>
        );
      }
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg, #f3f6fb)', color: 'var(--ink, #10203a)' }}>
          <Card className="w-full max-w-[420px] p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full [&_svg]:size-7" style={{ background: 'var(--warn-soft, #fdf2d0)', color: 'var(--warn, #d99e16)' }}>
              <Icon name="alertTriangle" />
            </div>
            <h2 className="mb-2 text-lg font-bold" style={{ color: 'var(--ink)' }}>เกิดข้อผิดพลาด</h2>
            <p className="mb-6 text-[13px] leading-relaxed" style={{ color: 'var(--ink-4)' }}>ระบบสะดุดชั่วคราว — ลองรีเฟรช หรือล้างข้อมูลเข้าสู่ระบบแล้วเริ่มใหม่</p>
            <div className="flex justify-center gap-2.5">
              <Button variant="outline" onClick={() => location.reload()}>รีเฟรช</Button>
              <Button onClick={() => { try { localStorage.removeItem('tmk-user'); } catch { /* ignore */ } location.reload(); }}>ล้างข้อมูล &amp; เข้าใหม่</Button>
            </div>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}


// PART 95: ป้ายเล็ก "กำลังเชื่อมต่อใหม่…" เมื่อ realtime ฝั่ง Sale หลุด (แทนค้างเงียบ)
// โผล่เฉพาะตอนอยู่หน้าที่ subscribe แล้วสายหลุด · หายเองเมื่อต่อกลับ (ตอนนั้น resync จะ refetch ให้)
export function RealtimeStatus() {
  const [down, setDown] = useState(isRealtimeDown());
  useEffect(() => onConnectionChange(setDown), []);
  if (!down) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-[70] -translate-x-1/2 rounded-full border px-3.5 py-1.5 text-[12px] font-medium shadow-md"
      style={{ background: 'var(--warn-soft, #fdf2d0)', color: 'var(--warn, #b8860b)', borderColor: 'var(--warn, #d99e16)' }}>
      <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full align-middle" style={{ background: 'var(--warn, #d99e16)' }} />
      กำลังเชื่อมต่อใหม่…
    </div>
  );
}
