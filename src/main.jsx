import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// กันจอ error ตอน deploy ใหม่ระหว่างเปิดแอปค้าง — chunk เดิมหาย (hash เปลี่ยน) → โหลดหน้าใหม่ดึง chunk ล่าสุด
// guard ด้วย sessionStorage กัน reload วนถ้าโหลดไม่ได้จริง (เน็ตหลุด)
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  if (!sessionStorage.getItem('tmk-chunk-reloaded')) {
    sessionStorage.setItem('tmk-chunk-reloaded', '1');
    window.location.reload();
  }
});
// เคลียร์ flag เมื่อโหลดหน้าสำเร็จ → ถ้ามี deploy รอบถัดไปในแท็บเดิม ยัง recover (reload) ได้ ไม่ค้าง
window.addEventListener('load', () => { try { sessionStorage.removeItem('tmk-chunk-reloaded'); } catch { /* ignore */ } });

// PART 95: ดัก error แบบ async (promise rejection / error นอก React render) ที่เดิมเงียบหมด
// → log ไว้ (throttle กัน spam) เพื่อให้ debug ได้ · ไม่ reload/รบกวนผู้ใช้ · ErrorBoundary จัดการ render error แยก
let _lastGlobalLog = 0;
const logGlobal = (label, detail) => {
  const now = Date.now();
  if (now - _lastGlobalLog < 1000) return; // throttle: อย่างมาก 1 log/วินาที
  _lastGlobalLog = now;
  console.error(`[global] ${label}:`, detail);
};
window.addEventListener('unhandledrejection', (e) => { logGlobal('unhandled promise rejection', e.reason); });
window.addEventListener('error', (e) => { if (e?.message) logGlobal('uncaught error', e.error || e.message); });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
