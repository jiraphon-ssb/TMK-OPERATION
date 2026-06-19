# TMK Operation — วิจัย & แผนยกระดับ Mobile UX/UX

> เอกสารวิจัย+ออดิตเชิงลึก สำหรับทำให้ TMK ใช้งานบนมือถือ "ง่ายจริง" (โฟกัสจอ ~360–390px / พนักงานภาคสนาม)
> วิธีทำ: วิจัย best-practice จากแหล่งจริง (NN/g · Material 3 · Apple HIG · web.dev · Baymard · WCAG) **6 ด้าน** + ออดิตโค้ดจริงของแอป **5 ด้าน** → สังเคราะห์เป็นข้อเสนอจัดลำดับ
> สถานะ: **เฟสวิจัย/เสนอ — ยังไม่แก้โค้ด** (รออนุมัติว่าจะลุยเฟสไหนก่อน)

---

## 1. สรุปผู้บริหาร (Executive Summary)

TMK **ไม่ใช่เว็บ desktop ย่อส่วน** — มี mobile shell จริงที่ทำมาถูกหลักพอสมควรแล้ว: bottom tab bar ในโซนนิ้วโป้ง, FAB, drawer, modal เต็มจอบนมือถือ, ตารางเลื่อนแนวนอน + sticky thead, code-split + ErrorBoundary, ปุ่มถ่ายรูป AI ที่บีบรูปก่อนส่ง. โครงดีอยู่แล้ว

แต่มี **"กับดักมือถือคลาสสิก" ที่ยังค้าง** ซึ่งกระทบการใช้งานจริงทุกวัน — 3 อย่างที่เจ็บสุดและแก้ง่ายสุด:

1. 🔴 **ลากไม่ได้บนนิ้ว** — kanban (ออเดอร์/งาน) + การเรียงแคมเปญ/ช่องทาง ใช้ HTML5 drag ที่ไม่ยิง event บน touch → พนักงานมือถือย้ายสถานะ/เรียงลำดับด้วยการลากไม่ได้เลย
2. 🔴 **จอซูมเด้งทุกครั้งที่แตะช่องกรอก** — input ฟอนต์ 14.5px (< 16px) → iOS Safari auto-zoom ทุกช่อง ในฟอร์มที่มี input 37+ ช่อง = กวนใจตลอดเวลา
3. 🔴 **ปุ่มเล็กกว่ามาตรฐานแตะ** — ปุ่มไอคอน 38px, ปุ่มเล็ก 28px (มาตรฐาน 44–48px) → กดพลาดบ่อยบนจอแคบ

ทั้ง 3 อย่างนี้แก้ด้วย CSS/โค้ดไม่กี่บรรทัด และให้ผลลัพธ์ที่ผู้ใช้ "รู้สึกได้ทันที" — เป็นเฟส 1 ที่คุ้มที่สุด

---

## 2. ✅ สิ่งที่ทำดีอยู่แล้ว (ไม่ต้องแตะ)

จากออดิตโค้ดจริง — แอปทำสิ่งเหล่านี้ถูกหลัก mobile-first แล้ว:

| ด้าน | ทำไว้ดี | อ้างอิง |
|---|---|---|
| นำทาง | bottom tab bar 4 แท็บ (≤5 ตามแนะนำ) ในโซนนิ้วโป้ง + label สั้นพอดีจอ 360px | [App.jsx:855](src/App.jsx:855), [index.css:604](src/index.css:604) |
| notch | `.tabbar` มี `padding-bottom: env(safe-area-inset-bottom)` แล้ว | [index.css:610](src/index.css:610) |
| FAB | 56px มุมขวาล่าง พ้น tabbar พอดี อยู่ในนิ้วโป้ง | [index.css:621](src/index.css:621) |
| ฟอร์ม | modal เต็มจอบนมือถือ + ปุ่มบันทึกอยู่ใน footer นอก scroll (sticky โดยพฤตินัย เห็นเหนือคีย์บอร์ดเสมอ) | [index.css:737](src/index.css:737) |
| ตาราง | overflow-x + sticky thead (เงาแทน border) + opt-in sticky คอลัมน์แรก + บังคับกริด inline เป็น 1 คอลัมน์ | [index.css:442](src/index.css:442),[649](src/index.css:649) |
| ล้นแนวนอน | segbar/chiprow เลื่อนได้ + mask fade บอก "ปัดได้" | [index.css:296](src/index.css:296) |
| ลดการพิมพ์ | chips เลือกไซส์/สี, segmented, select native, ปุ่ม "คัดลอกเมื่อวาน", flow 2 สเต็ป | modals.jsx |
| กล้อง/AI | ScanButton `capture="environment"` + บีบรูป 1568px ก่อนส่ง + barcode scan มี cleanup ปิดกล้องครบ | [ScanButton.jsx:39](src/ScanButton.jsx:39), [aiExtract.js:15](src/lib/aiExtract.js:15) |
| เสถียร | lazy chunk + Suspense + ปุ่มรีเฟรชถ้าค้าง 8 วิ + ErrorBoundary กันจอขาว | [App.jsx:85](src/App.jsx:85) |
| สถานะ | section/sub persist ลง localStorage — refresh แล้วอยู่หน้าเดิม | [App.jsx:435](src/App.jsx:435) |

---

## 3. 📚 สรุปงานวิจัย best-practice (6 ด้าน)

### 3.1 โครงสร้างนำทาง (Navigation)
- **bottom tab bar 3–5 แท็บ** = มาตรฐานที่ NN/g + Material 3 + Apple HIG ตรงกัน; visible nav ถูกใช้ ~1.5 เท่าของ hamburger และเสร็จงานเร็วกว่า ~2.5 วิ/งาน
- **อย่าซ่อนปลายทางหลักใน hamburger** — drawer ไว้เก็บ "ของรอง" (โปรไฟล์/ออกระบบ/ตั้งค่าลึก) เท่านั้น
- **thumb-zone-first**: บนจอ 6.5"+ การแตะกระจุกที่ครึ่งล่างจอ ~78% → วาง primary action/nav ไว้ล่าง, ดัน destructive ขึ้นบน/overflow
- **FAB 1 ตัว/หน้า** สำหรับ action หลัก-เป็นการสร้าง
- **back ต้องปิด modal ก่อน** ไม่ใช่เด้งออกแอป (push history state ตอนเปิด modal)
- 🔗 [NN/g navigation](https://www.nngroup.com/articles/mobile-navigation-patterns/) · [find-navigation/hamburger](https://www.nngroup.com/articles/find-navigation-mobile-even-hamburger/) · [Material navigation-bar](https://m3.material.io/components/navigation-bar/guidelines) · [Apple tab-bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)

### 3.2 Touch ergonomics
- **48px เป็น baseline** (ไม่ใช่ 44) — 44px (Apple) คือ "ขั้นต่ำสุด"; Material 48dp ครอบคลุมทั้ง Apple+WCAG AAA; ภาคสนาม (มือสั่น/แดดจ้า) ยิ่งต้องเผื่อ
- **gap ระหว่างปุ่ม ≥ 8px** (กดบ่อย 16px+); ปลายจอบน/ล่างแม่นน้อยกว่า → ต้องการ 42–46px
- **row ที่กดได้ ≥ 48px และทำทั้งแถวเป็น tap target** (ไม่ใช่แค่ข้อความ)
- **hit-slop**: ไอคอนเล็ก 20–24px ขยาย touch area เป็น 48px ด้วย padding/`::after` โดยไม่ดัน layout
- **แยกปุ่มอันตรายจากปุ่มปลอดภัย** — อย่าวางลบ/ยืนยันชิดกัน
- 🔗 [NN/g touch-target](https://www.nngroup.com/articles/touch-target-size/) · [Smashing tap-targets/rage-taps](https://www.smashingmagazine.com/2023/04/accessible-tap-target-sizes-rage-taps-clicks/) · [thumb-zone](https://www.smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users/)

### 3.3 ฟอร์มกรอกข้อมูล (สำคัญสุดของแอปนี้)
- **font-size input ≥ 16px** กัน iOS auto-zoom (15px ก็เด้งแล้ว) — ห้ามแก้ด้วย `maximum-scale=1` (เสีย a11y)
- **inputmode/type ให้ถูก**: เงิน = `inputmode="decimal"`, จำนวน = `inputmode="numeric"`, เบอร์ = `type="tel"` — **เลี่ยง `type="number"`** กับ SKU/เบอร์ (มี spinner, ตัด 0 นำหน้า, ค่าเพี้ยน)
- **single-column** กรอกเร็วกว่า; **ไม่แตกช่อง** (เบอร์/วันที่ช่องเดียว)
- **ลดการพิมพ์**: stepper (+/-) + ช่องพิมพ์ควบคู่, segmented (2–5 ตัวเลือก), chips, smart default (วันนี้/ผู้ใช้ปัจจุบัน)
- **multi-step เมื่อเกิน 6–7 ช่อง** + progress "ขั้น 2/3"
- **sticky CTA ต้องไม่โดนคีย์บอร์ดบัง** — `env(keyboard-inset-height)` หรือ `visualViewport` API
- **grid สี×ไซซ์บนจอแคบ** → แปลงเป็น card-per-สี (label ไซซ์กำกับทุกช่อง) ดีกว่าตารางเลื่อนแนวนอน
- 🔗 [web.dev forms](https://web.dev/articles/payment-and-address-form-best-practices) · [Baymard keyboard-types](https://baymard.com/labs/touch-keyboard-types) · [Baymard single-input](https://baymard.com/blog/mobile-form-usability-single-input-fields) · [NN/g steppers](https://www.nngroup.com/articles/input-steppers/) · [16px stops iOS zoom](https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/)

### 3.4 ตาราง/ข้อมูลแน่นบนจอแคบ
- **table → card transform** ที่ <768px (เลือก render List/Table ตาม viewport ใน React, อย่ายุบ `<table>` ด้วย CSS ล้วน เพื่อคุม a11y)
- **priority columns**: โชว์ 2–4 คอลัมน์สำคัญ ที่เหลือ progressive disclosure (แตะดู detail)
- **sticky first column + sticky header** เมื่อต้องคงตาราง (cross-reference คือหัวใจ)
- **scroll-shadow** เป็น affordance บอกว่าเลื่อนต่อได้ (scrollbar มือถือถูกซ่อน)
- **summary-first / KPI cards ก่อน detail** (≤3–4 ใบ/จอแคบ, metric หลักใหญ่กว่า secondary 2–3×)
- **kanban บนมือถือ = 1 คอลัมน์/จอ + ปัดสลับ** หรือใช้ปุ่มเปลี่ยนสถานะแทนลาก
- 🔗 [UXmatters mobile-tables](https://www.uxmatters.com/mt/archives/2020/07/designing-mobile-tables.php) · [NN/g big-tables-small-screens](https://www.nngroup.com/videos/big-tables-small-screens/) · [sticky header+first column](https://css-tricks.com/a-table-with-both-a-sticky-header-and-a-sticky-first-column/)

### 3.5 ความเร็วที่รู้สึกได้ + feedback
- **งบตอบสนอง**: input ภายใน 100ms (RAIL); INP "ดี" ≤ 200ms; long task > 50ms ต้องตัด
- **Optimistic UI** สำหรับ action ที่สำเร็จเกือบ 100% (บันทึกยอด/ติ๊กจัดของ) — แต่ **อย่าใช้กับค่าที่ server เดาไม่ได้** (เลขเอกสาร gen, ATP clamp) → โชว์ pending แทน
- **skeleton เฉพาะโหลด 2–10s** (< 500ms ใส่แล้วรู้สึกช้าลงเพราะมี flash; หน่วง 200–300ms ก่อนแสดง)
- **toast ล่างจอ** (โซนนิ้วโป้ง) duration 3–4s (success) / 6s (มี undo) / error สำคัญไม่ auto-dismiss
- **debounce filter ~250–300ms** + virtualization สำหรับ list ยาว
- **queue + retry เมื่อเน็ตหลุด** (field เน็ตไม่นิ่ง) + idempotency key กัน double-submit
- 🔗 [NN/g skeleton](https://www.nngroup.com/articles/skeleton-screens/) · [NN/g response-times](https://www.nngroup.com/articles/response-times-3-important-limits/) · [web.dev optimize-INP](https://web.dev/articles/optimize-inp)

### 3.6 PWA + กล้อง + ภาคสนาม
- **installable PWA** (manifest + SW + icons 192/512/maskable) → กดทีเดียวเข้าจากโฮม, standalone ได้พื้นที่จอเพิ่ม
- **iOS ไม่มี `beforeinstallprompt`** → ต้องใส่ `apple-touch-icon` 180px + `apple-mobile-web-app-*` + การ์ดสอนติดตั้ง
- **`viewport-fit=cover` + `env(safe-area-inset-*)`** — ถ้าไม่ใส่ inset = 0 เสมอ (notch/home-indicator บังของ)
- **font-size ≥ 16px** กัน zoom เด้ง (ย้ำจาก 3.3)
- **`<input capture="environment">`** เปิดกล้องตรง + ต้องมี fallback file picker (capture เป็นแค่ hint)
- **บีบรูปฝั่ง client** กว้าง ~1600–2000px (ไม่ต่ำกว่า 1280px เพื่อ OCR), JPEG q0.7–0.85 → ประหยัด egress + AI ไวขึ้น
- 🔗 [web.dev manifest](https://web.dev/learn/pwa/web-app-manifest) · [MDN capture](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture) · [safe-area-inset guide](https://polypane.app/blog/using-safe-area-inset-to-build-mobile-safe-layouts/) · [PWA iOS limitations](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)

---

## 4. 🔎 ปัญหาที่เจอจากออดิตโค้ดจริง (จัดลำดับ)

### 🔴 P0 — กระทบใช้งานจริงทุกวัน / ต้องแก้ก่อน

**P0-1 · Kanban + การลากเรียง ใช้ได้แค่เมาส์ — ลากบนนิ้วไม่ได้เลย**
ออเดอร์/งาน kanban + เรียงแคมเปญ + เรียงช่องทาง ใช้ HTML5 native drag (`draggable`/`onDragStart`/`onDrop`) ล้วน ไม่มี `onTouchStart`/`onPointerDown` เลย → บน touch ไม่ยิง event
📍 [views-2.jsx:1271](src/views-2.jsx:1271) (orders), [:368](src/views-2.jsx:368) (planner), [:1483](src/views-2.jsx:1483) (campaign), [:2321](src/views-2.jsx:2321) (channel)
✅ **แก้**: Orders มี `<select>` เปลี่ยนสถานะอยู่แล้ว → ใช้เป็นทางหลักบนมือถือ + เพิ่ม `<select>` แบบเดียวกันให้ Planner; แคมเปญ/ช่องทางเพิ่มปุ่ม ▲▼ เรียก `reorderCampaign/reorderChannel` ที่มีอยู่แล้ว; ซ่อนข้อความ "ลากเพื่อเรียง" บน ≤900px. ระยะยาว → `@dnd-kit/core` (รองรับ touch)

**P0-2 · input ฟอนต์ 14.5px → iOS Safari ซูมเด้งทุกครั้งที่แตะช่อง**
`.input` ใช้ `--fs-body` = 14.5px (< 16px) + viewport ไม่ล็อกซูม → ทุกครั้งที่โฟกัส input/select/textarea (37 number + 20 select) จอซูมเข้าแล้วไม่ออก
📍 [index.css:55](src/index.css:55),[:770](src/index.css:770)
✅ **แก้**: `@media (max-width:900px){ .input, input, select, textarea, .search input { font-size:16px } }` + cell input ในตารางสี×ไซซ์ ([modals.jsx:834](src/modals.jsx:834)). **ห้าม** `maximum-scale=1`

**P0-3 · ปุ่ม/แท็บส่วนใหญ่ < 44px (กดพลาดบนจอแคบ)**
`.icon-btn` 38px (ปุ่มเมนู/กระดิ่ง topbar), `.btn-sm` ~28px (รวมปุ่ม ScanButton "ถ่ายใบส่งของ"), `.seg`/`.pick`/`.filt-seg-btn` ~30–35px
📍 [index.css:336](src/index.css:336),[:335](src/index.css:335),[:528](src/index.css:528)
✅ **แก้**: `@media (max-width:900px){ .btn,.seg,.icon-btn,.tab,.filt-seg-btn,.pick { min-height:44px } .icon-btn{ width:44px;height:44px } }` (หรือเพิ่ม hit-area ด้วย `::after` คงหน้าตาเดิม)

### 🟡 P1 — ปรับแล้วใช้ง่ายขึ้นชัด

**P1-4 · viewport ขาด `viewport-fit=cover` → safe-area ไม่ทำงาน**
`env(safe-area-inset-*)` คืน 0 ถ้าไม่ใส่ `viewport-fit=cover` → tabbar/modal-foot/fab เสี่ยงโดน home-indicator บน iPhone บัง (ทั้งที่ tabbar เผื่อ inset ไว้แล้วแต่ไม่มีผล)
📍 [index.html:6](index.html), [index.css:610](src/index.css:610),[:747](src/index.css:747)
✅ **แก้**: viewport เป็น `width=device-width, initial-scale=1, viewport-fit=cover` + `.content`/`.fab`/`.modal-foot` ใช้ `calc(... + env(safe-area-inset-bottom))` + เพิ่ม `<meta name="theme-color">` (light/dark) + `apple-mobile-web-app-*`

**P1-5 · ค้นหา global เข้าไม่ถึงบนมือถือเลย**
`.topbar .search { display:none }` + Spotlight ผูก Cmd/Ctrl+K เท่านั้น → มือถือไม่มีคีย์บอร์ดลัด = ใช้ค้นหาไม่ได้
📍 [index.css:641](src/index.css:641), [App.jsx:546](src/App.jsx:546)
✅ **แก้**: เพิ่มปุ่มไอคอนแว่นขยายใน topbar มือถือ (ข้างกระดิ่ง) → `onClick={()=>setSpotlight(true)}` (Spotlight รองรับ touch อยู่แล้ว)

**P1-6 · Settings + สลับธีม อยู่แค่ใน hamburger (เอื้อมยาก)**
bottom bar มี 4 แท็บ ไม่มี "ตั้งค่า"; toggle ธีมไม่มีใน drawer มือถือ (desktop กดจาก ProfileMenu ได้)
📍 [App.jsx:855](src/App.jsx:855),[:820](src/App.jsx:820)
✅ **แก้**: เพิ่มแท็บที่ 5 "เพิ่มเติม" ที่เปิด bottom-sheet รวม Settings + ค้นหา + สลับธีม + โปรไฟล์ (โซนนิ้วโป้ง) ; หรืออย่างน้อยเพิ่ม toggle ธีมท้าย drawer

**P1-7 · OrderModal รายการสินค้า = grid 4 คอลัมน์ตายตัว → ใช้ไม่ได้ที่ 360px**
`gridTemplateColumns:'1fr 1fr 1fr 1fr'` (สี/ไซซ์/จำนวน/ราคา) ไม่มี media query → ~73px/คอลัมน์ select ถูกตัด
📍 [modals.jsx:2217](src/modals.jsx:2217)
✅ **แก้**: `@media (max-width:560px)` → 2 คอลัมน์ (เลียนแบบ SellModal [:1198](src/modals.jsx:1198) ที่ทำดีแล้ว)

**P1-8 · ตารางมี `.table-sticky-first` แต่ไม่มีตารางไหนเรียกใช้**
StockView/ProductsView/CustomersView เลื่อนแนวนอนแล้วคอลัมน์ชื่อสินค้า/ลูกค้าเลื่อนหาย (จำไม่ได้ว่าแถวไหนคืออะไร) — CSS รองรับแล้วแต่ลืมใส่ class
📍 [index.css:449](src/index.css:449) (มี), [views-2.jsx:725](src/views-2.jsx:725),[:592](src/views-2.jsx:592),[:1385](src/views-2.jsx:1385) (ไม่ใส่)
✅ **แก้**: เติม `className="table-wrap table-sticky-first"` ให้ตารางที่กว้างเกินจอ

**P1-9 · ช่องตัวเลขใช้ `type="number"` 37 จุด แทน inputMode**
คีย์แพดมี e/+/-/. ปน, ยอมพิมพ์ค่าติดลบทั้งที่ min=0, ล้อเลื่อนเปลี่ยนค่าเอง
📍 [modals.jsx:475](src/modals.jsx:475),[:2324](src/modals.jsx:2324) (cell ที่ [:947](src/modals.jsx:947) ทำถูกแล้ว)
✅ **แก้**: จำนวนเต็ม → `inputMode="numeric"`, เงิน/ราคา → `inputMode="decimal"` + sanitize ค่าเอง (เหมือน cell สี×ไซซ์)

**P1-10 · ไม่มี PWA manifest → ติดตั้งลงโฮมไม่ได้**
ไม่มี manifest.webmanifest/SW; public/ มีแค่โลโก้ → ไม่ installable, ไม่ standalone, เปิดผ่าน address bar กินจอ
📍 [index.html](index.html), public/
✅ **แก้**: เพิ่ม manifest (name/short_name/start_url/display:standalone/icons 192+512/maskable สีกรม) + `apple-touch-icon` 180px → ทางลัด `vite-plugin-pwa` (ทำ SW precache app shell + version.json no-cache)

**P1-11 · ไม่มี chunk-load-error retry → deploy ระหว่างเปิดค้าง = จอ error**
`lazy()` ไม่ดัก `vite:preloadError` → เปิดแอปค้างทั้งวัน, มี deploy ใหม่ (hash เปลี่ยน), กดเข้าหน้า lazy → chunk หาย → ErrorBoundary โชว์ error แต่ผู้ใช้ไม่รู้ว่าแค่ต้องรีเฟรช
📍 [App.jsx:11](src/App.jsx:11)
✅ **แก้**: `window.addEventListener('vite:preloadError', e => { e.preventDefault(); location.reload(); })` ใน [main.jsx](src/main.jsx)

### 🟢 P2 — ขัดเงา

| # | ปัญหา | ไฟล์ | แก้ |
|---|---|---|---|
| P2-12 | card/modal padding คงที่ 22px กินจอ 360px; ไม่มี breakpoint ~380px | [index.css:350](src/index.css:350) | `@media(max-width:600px){.card{padding:16px}}` + breakpoint 380px ลด content padding 12px |
| P2-13 | FAB เปิด TaskModal เสมอ ทุกหน้า (ผิด context) | [App.jsx:864](src/App.jsx:864) | context-aware ตาม section/sub (products→product modal, sales→record ฯลฯ) |
| P2-14 | Planner kanban = 2 คอลัมน์อัดบนมือถือ (ต่างจาก Orders ที่ scroll) | [views-2.jsx:349](src/views-2.jsx:349) | `@media(max-width:900px)` → flex scroll คอลัมน์ละ 240px |
| P2-15 | กฎยุบ grid `.content .grid[style*=...]` จับกว้างไป → ทำ month-picker 4 คอลัมน์พังเป็น 12 แถว | [index.css:649](src/index.css:649) | scope เป็น `.content-inner > .grid` หรือ `:not(.keep-cols)` |
| P2-16 | `.modal-foot` ไม่เผื่อ safe-area → ปุ่มบันทึกชน home-indicator | [index.css:747](src/index.css:747) | `padding-bottom: calc(15px + env(safe-area-inset-bottom))` |
| P2-17 | `.audit-range` date input 130px คงที่ → ล้นจอ 360px | [index.css:792](src/index.css:792) | `@media(max-width:560px){flex-wrap:wrap; input{flex:1}}` |
| P2-18 | HEIC จากคลังภาพ iPhone เปิดไม่ได้ → error งง "รูปเสีย" | [components.jsx:26](src/components.jsx:26) | แยกข้อความ HEIC ("ลองถ่ายใหม่/ตั้งกล้องเป็น Most Compatible") ; ระยะยาว heic2any |
| P2-19 | dead code `.force-mobile` (ใส่ className แต่ไม่มี CSS) | [App.jsx:723](src/App.jsx:723) | ลบทิ้ง (ไม่ได้ใช้) |
| P2-20 | breakpoint กระจาย (560/600/620/760/900) maintain ยาก | index.css | รวมเป็น 2 ระดับชัดเจน (600/900) + doc |

---

## 5. 🗺️ แผนทำเป็นเฟส

> เรียงตาม **ผลลัพธ์ที่ผู้ใช้รู้สึกได้ ÷ แรงที่ลง** — เฟส 1 คือ "quick win" CSS/โค้ดเล็กแต่ impact สูง

**เฟส 1 — P0 quick wins (S, ~ครึ่งวัน · impact สูงสุด)**
input 16px กันซูม · ปุ่ม ≥44px · viewport-fit + safe-area · ปุ่มค้นหาบนมือถือ
→ แทบทั้งหมดเป็น CSS ใน `@media (max-width:900px)` + แก้ index.html 1 บรรทัด + ปุ่ม 1 อัน

**เฟส 2 — แก้ "ลากไม่ได้" + ฟอร์มสำคัญ (M)**
select เปลี่ยนสถานะใน Planner kanban + ปุ่ม ▲▼ เรียงแคมเปญ/ช่องทาง · OrderModal 2 คอลัมน์ · sticky คอลัมน์แรกตาราง · inputMode ช่องตัวเลข

**เฟส 3 — โครง mobile + เสถียร (M)**
แท็บ "เพิ่มเติม"/bottom-sheet (Settings+ค้นหา+ธีม) · PWA manifest + icons (installable) · chunk-load retry

**เฟส 4 — ขัดเงา (S–M)**
padding 380px · FAB context-aware · Planner kanban scroll · scope กฎ grid · safe-area modal-foot · HEIC message · ลบ dead code

---

## 6. 📌 หมายเหตุ / ของแถม

- **ส่วนใหญ่ของ P0 = CSS ล้วน** — เพิ่มใน `@media (max-width:900px)` ที่ [index.css:633](src/index.css:633) ที่มีอยู่แล้ว ไม่ต้องรื้อโครง
- **มี infra พร้อมใช้ที่ยังไม่ได้เรียก**: `.table-sticky-first` (CSS เขียนแล้ว), `reorderCampaign/reorderChannel` (ฟังก์ชันมีแล้ว), `setSpotlight` (component รองรับ touch แล้ว) → หลายข้อแค่ "ต่อสาย"
- **สอดคล้องของเดิม**: บีบรูปก่อนส่ง AI + ลด egress (ทำแล้ว) เข้ากับแนวภาคสนามเน็ตช้า; ฟีเจอร์ AI ถ่ายใบส่งของใช้ `capture="environment"` ถูกแล้ว
- **ข้อควรระวัง**: อย่าแก้ซูมด้วย `maximum-scale=1`/`user-scalable=no` (ผิด WCAG 2.1); optimistic UI อย่าใช้กับ ATP/เลขเอกสารที่ server เดาไม่ได้

---

*สร้างโดย workflow วิจัย 11 เอเจ้นต์ (วิจัยเว็บ 6 + ออดิตโค้ด 5) + สังเคราะห์ · อ้างอิงแหล่งจริงในแต่ละหัวข้อ*
