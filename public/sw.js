/* TMK Operation — Service Worker (PWA offline shell)
 *
 * กลยุทธ์ cache (สรุป):
 * 1) Navigation / HTML  → network-first
 *      ดึงจากเน็ตก่อนเสมอ เพื่อกัน bundle เก่าค้าง (index.html ใหม่ชี้ไป /assets/*.hash ล่าสุด)
 *      ถ้าเน็ตหลุด → fallback เป็น index.html ที่ cache ไว้ (offline shell)
 * 2) Static assets (/assets/*, ฟอนต์, ไอคอน, รูป) → cache-first
 *      ไฟล์เหล่านี้มี hash/immutable อยู่แล้ว โหลดครั้งเดียวพอ → เร็ว + ประหยัดเน็ต
 *      ถ้าไม่มีใน cache ค่อยไปเน็ต แล้วเก็บลง cache (runtime caching)
 * 3) cache versioning
 *      ชื่อ cache ฝัง VERSION ไว้ → พอ deploy เวอร์ชันใหม่ activate จะลบ cache เก่าทิ้ง
 *      กันข้อมูลค้างข้ามเวอร์ชัน
 *
 * หมายเหตุ: จัดการเฉพาะ GET + same-origin เท่านั้น
 *   request ที่ไม่ใช่ GET (POST ส่งยอด ฯลฯ) และ cross-origin (Supabase API/Storage)
 *   ปล่อยผ่านไปเน็ตตรง ๆ ไม่แตะ cache — กันข้อมูลสด/ธุรกรรมเพี้ยน
 */

// VERSION ถูกแทนตอน build (vite plugin tmk-sw-version) = APP_VERSION + hash ของ asset
//   → เปลี่ยนทุก release (bump changelog) หรือทุกครั้งที่ build output เปลี่ยน
//   → ชื่อ cache เปลี่ยน → activate ลบ cache เก่าจริง (public asset URL คงที่ = fonts/logo ไม่ค้าง)
// dev: ค่านี้เป็น placeholder ตรงๆ แต่ SW register เฉพาะ PROD (main.jsx) จึงไม่ถูกใช้
const VERSION = '__SW_VERSION__';
const APP_SHELL_CACHE = `tmk-shell-${VERSION}`;   // index.html (offline fallback)
const ASSET_CACHE = `tmk-assets-${VERSION}`;      // static assets (cache-first)
const OFFLINE_URL = '/index.html';

// รายชื่อ cache ที่ "ยังใช้อยู่" ในเวอร์ชันนี้ — activate จะลบตัวที่ไม่อยู่ในลิสต์
const CURRENT_CACHES = [APP_SHELL_CACHE, ASSET_CACHE];

// install: pre-cache offline shell (index.html) ไว้ล่วงหน้า
// skipWaiting() → SW ใหม่ขึ้นทำงานทันทีไม่ต้องรอปิดทุกแท็บ (update ไม่รบกวน user)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
      .catch(() => { /* pre-cache พลาดก็ไม่เป็นไร รอ runtime เก็บทีหลัง */ })
  );
});

// activate: ลบ cache เวอร์ชันเก่า + ยึดครอง client ทันที
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('tmk-') && !CURRENT_CACHES.includes(k))
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// เช็คว่าเป็น static asset ที่ควร cache-first ไหม
function isStaticAsset(url) {
  if (url.pathname.startsWith('/assets/')) return true;
  return /\.(?:js|css|woff2?|ttf|otf|eot|png|jpe?g|svg|gif|webp|ico)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // แตะเฉพาะ GET เท่านั้น (POST/PUT ส่งยอด ฯลฯ ปล่อยผ่าน)
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // cross-origin (Supabase API/Storage, ฟอนต์ภายนอก ฯลฯ) → ไม่แตะ ปล่อยเน็ตจัดการเอง
  if (url.origin !== self.location.origin) return;

  // 1) navigation / HTML → network-first + offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          // เก็บสำเนา index.html ล่าสุดไว้เป็น offline shell
          const copy = resp.clone();
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put(OFFLINE_URL, copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(OFFLINE_URL).then((cached) => cached || caches.match(request)))
    );
    return;
  }

  // 2) static assets → cache-first (มี hash อยู่แล้ว โหลดครั้งเดียวพอ)
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((resp) => {
          // เก็บลง cache เฉพาะ response ที่ใช้ได้ (กัน opaque/บั๊ก error ค้าง)
          if (resp && resp.ok && resp.type === 'basic') {
            const copy = resp.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return resp;
        });
      })
    );
    return;
  }

  // อื่น ๆ (same-origin GET ที่ไม่เข้าข่าย) → ปล่อยผ่านตามปกติ
});

// รับสัญญาณจากหน้าเว็บให้ activate ทันที (เผื่ออนาคตอยากมีปุ่ม "อัปเดตเลย")
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
