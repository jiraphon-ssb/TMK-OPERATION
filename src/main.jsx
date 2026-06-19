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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
