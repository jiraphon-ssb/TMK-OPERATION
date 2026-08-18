# UX & Performance Audit — TMK Operation

> ตรวจเมื่อ 2026-08-11
> เป้าหมายของ user: ใช้งานลื่นที่สุด · ไม่กระตุก · โหลด/รีเฟรชน้อยที่สุด · UI ไปทางเดียวกัน · ผู้ใช้ไม่งง ไม่ลังเลว่าระบบบันทึกจริงไหม

---

## ⚑ สถานะการลงมือ (อัปเดต 2026-08-11)

branch `worktree-ux-perf-phase12` — **Phase 1 + Phase 2 (บางส่วน) ทำแล้ว**

การตัดสินใจของ user ที่ใช้เป็นกรอบ:
| คำถาม | คำตอบ |
|---|---|
| จอ splash 5.5 วิ | ตอนแรกบอก "ตั้งใจไว้" → **ภายหลังสั่งให้ลบ** → ลบแล้ว |
| skeleton ปลอมตอนสลับเมนู | **ลบทิ้ง เข้าหน้าทันที** → ทำแล้ว |
| เฟสไหนก่อน | **Phase 1+2 รวดเดียว** |
| limit ที่ตัดข้อมูล | **ใส่ป้ายบอกก่อน** → ทำแล้ว |

### ✅ ทำแล้ว
- **ลบจอโหลดบังคับ 5.5 วินาที** (`useMinSplash`) → เข้าแอปทันทีที่ข้อมูลพร้อม ไม่หน่วงเปล่า
- **ลบ `useBeat`/`useBeatOn` ทั้งหมด (9 หน้า)** + ลบ skeleton ที่กลายเป็น dead code 3 ตัว → สลับเมนูเข้าหน้าทันที
- **`window.confirm` → AlertDialog ของแอป** (4 จุด รวมจุดยืนยันยอดเงินใน `modals-sale`)
- **ลบ CSS rule ที่ไม่มีใครใช้ 41 rule (24 คลาส)** → `index.css` build 119KB → **116.25KB**
- **`ROW_LIMITS` + ป้ายบอกขอบเขตข้อมูล** — Spotlight (ตอนไม่พบผลลัพธ์) + ดรอปดาวน์ลูกค้าใน OrderModal
- **memo `mapToTMK` ต่อส่วน** — เซฟ 1 ครั้งไม่ต้อง map ใหม่ทุกตารางอีกต่อไป (+ เทสต์ใหม่ 7 เคส)
- **`react-hooks/static-components` 23 → 0** — เลิก remount subtree (dropdown ปิดเอง/โฟกัสหลุด/การ์ดกระพริบ)
- **`set-state-in-effect` จุด prop-sync 3 จุด** → ปรับ state ระหว่าง render แทน (ตัด render รอบสอง)

ตัวเลข verify: **eslint 0 errors** (warnings 131 → **99**) · **vitest 338/338** (เดิม 331 + ใหม่ 7) · **vite build ผ่าน**

### ✅ รอบเพิ่มเติม — "เร็วขึ้นจริง" (ไม่ใช่แค่ซ่อน skeleton)
- **register `public/sw.js`** — service worker เขียนไว้ครบแล้วแต่**ไม่เคยถูก register** จึงไม่เคยทำงานเลย
  เปิดใช้แล้ว → เข้าเว็บครั้งที่ 2 เป็นต้นไป `/assets/*` (~1.5MB) อ่านจาก cache ไม่ยิงเน็ต
- **prefetch chunk ตอนเบราว์เซอร์ว่าง** — เดิม chunk ของแต่ละเมนูโหลด "ตอนกดครั้งแรก" เท่านั้น
  (กด Sale ครั้งแรก = รอ `views-catalog` 291KB + `vendor-charts` 430KB) · ตอนนี้โหลดล่วงหน้าหลังข้อมูลชุดแรกมา
  → กดเมนูครั้งแรกไม่ต้องรอ JS อีก

> **หมายเหตุสำคัญเรื่อง skeleton:** skeleton ที่เหลือ **ลบเพิ่มไม่ได้ทำให้เร็วขึ้น**
> เพราะมันไม่ได้กินเวลา — มันคือ "สิ่งที่แสดงระหว่างรอ" ลบทิ้งก็แค่เห็นจอว่างแทน (รอเท่าเดิมแต่ดูแย่กว่า)
> ของหลอกถูกลบไปหมดแล้วในรอบแรก · ที่เหลือทุกตัวผูกกับการโหลดจริง (`loading &&` / `useDelayedFlag` / `skus === null`)
> ทางที่ถูกคือ **ทำให้ "การรอ" สั้นลงหรือหายไป** = sw.js + prefetch ข้างบน

### ⏸ ยังไม่ทำ (ตั้งใจเว้น — เหตุผลอยู่ในหัวข้อ 6)
- `saveRow` ใช้ `.upsert().select()` แทน refetch — เสี่ยงลำดับแถวเพี้ยน และตอนนี้ refetch ไม่บล็อก UI แล้ว
- แยก `Shell()` เป็น `<Shell />` + `React.memo` — ต้อง stabilize `go` + ส่ง closure ~30 ตัวเป็น props ในไฟล์ 1,000 บรรทัด เสี่ยงสูง ผลได้จำกัด
- `set-state-in-effect` ที่เหลือ 29 จุด — **ส่วนใหญ่เป็นการใช้ effect ที่ถูกต้อง** (reset ก่อน async fetch) กฎ lint จับรวมหมด ไม่ควรไล่แก้ยกชุด
- Phase 3 ทั้งหมด (EmptyState กลาง · inline style 1,877 จุด · hex 346 จุด)

---

## 0. สรุปสั้น (TL;DR)

**ข่าวดี:** ชั้นข้อมูล (data layer) ของโปรเจกต์นี้ทำมาดีกว่าโปรเจกต์ทั่วไปมาก — เลือกคอลัมน์เอง ไม่ใช้ `select *`, มี per-table refresh, deferred tables, cache 5 นาที, pagination, echo-suppression, realtime + poll fallback. **ปัญหาที่ user รู้สึกไม่ได้มาจากการดึงข้อมูล**

**ข่าวร้าย:** ความรู้สึก "ช้า / กระตุก / เหมือนรีโหลด" มาจาก **การหน่วงที่เขียนไว้เองในโค้ด** และ **การ re-render ทั้งแอป** ไม่ใช่จากเน็ตหรือ DB

| # | ปัญหา | ผลกระทบต่อความรู้สึก | แรง |
|---|-------|---------------------|-----|
| P1 | จอ splash บังคับ **5.5 วินาที** ทุกครั้งที่เข้าแอป | "เว็บช้ามาก" | 🔴 สูงสุด · ✅ ลบแล้ว |
| P2 | Skeleton ปลอม 320–350ms ทุกครั้งที่สลับเมนู (9 หน้า) | "เหมือนรีโหลดตลอด" | 🔴 สูง |
| P3 | เซฟ 1 ครั้ง → remap **ทุกตาราง** → re-render ทั้งแอป | "กดเซฟแล้วหน้ากระตุก" | 🔴 สูง |
| P4 | มี 2 ปรัชญา loading ในแอปเดียว (`useBeat` vs `useDelayedFlag`) | "หน้าตาไม่เหมือนกัน" | 🟠 กลาง |
| P5 | inline `style={{}}` **1,877 จุด** + hex สีตายตัว **346 จุด** | "UI ไม่ไปทางเดียวกัน" | 🟠 กลาง |
| P6 | `window.confirm` ของเบราว์เซอร์ 4 จุด (1 จุดเป็นเรื่องเงิน) | "หน้าตาแปลกๆ ไม่น่าเชื่อถือ" | 🟠 กลาง |
| P7 | ไม่มี `<EmptyState>` กลาง — ข้อความ "ไม่มีข้อมูล" กระจัดกระจาย ~60 แบบ | "งงว่าคือ error หรือว่างจริง" | 🟡 ต่ำ |

---

## 1. ความเร็วที่ "รู้สึกได้" (Perceived performance)

### P1 — จอโหลดบังคับ 5.5 วินาที · ✅ **ลบแล้ว**

`src/App.jsx:874`
```js
const firstLoading = useMinSplash(authed, dataVersion >= 1 || firstError, 5500);
```

`src/components.jsx:563` — คอมเมนต์ในโค้ดบอกเจตนาตรงๆ:
```
รับประกันเห็นจอโหลด 5-6 วิ แม้ข้อมูลจะมาไว (cache อุ่น)
```

**นี่คือการจงใจหน่วง** ถ้าข้อมูลมาใน 600ms ผู้ใช้ก็ยังต้องนั่งดูจอโหลดอีก ~4.9 วินาที ทุกครั้งที่เปิดแอป

- ทุกวัน พนักงานเปิดแอป 10 ครั้ง = เสียเวลาเปล่า ~55 วิ/คน/วัน
- นี่คือ "first impression" ของระบบ — 5.5 วิ ทำให้ระบบถูกตัดสินว่า "ช้า" ทันที ก่อนจะได้เห็นอะไรเลย

**สรุป: ลบแล้ว** — ถอด `useMinSplash` ออกทั้งฟังก์ชัน แทนด้วยเงื่อนไขตรงๆ:
```js
// App.jsx — โชว์จอโหลด "เท่าที่โหลดจริง" เท่านั้น
const firstLoading = authed && !(dataVersion >= 1 || firstError);
```
พฤติกรรมเทียบเท่าของเดิมทุกกรณี ยกเว้นตัดเพดานเวลาขั้นต่ำทิ้ง:
ยังไม่ login = ไม่โชว์ · ข้อมูลยังไม่มา = โชว์ · ข้อมูลมาแล้ว = เข้าแอปทันที (เดิมต้องรอครบ 5.5 วิ)

---

### P2 — Skeleton ปลอมตอนสลับเมนู 🔴

`src/components.jsx:601`
```js
export function useBeat(ms = 350) {
  const [on, setOn] = useState(true);
  useEffect(() => { const t = setTimeout(() => setOn(false), ms); return () => clearTimeout(t); }, []);
  return on;
}
```

ใช้ที่ **9 หน้า**: `views-entry` `views-settings` `views-flows` `views-planner` `views-sales` `views-log` `views-sale-submit` `salePerf` `views-1`

รูปแบบที่ใช้คือ:
```js
if (beat) return <PageSkeleton />;
```

**ปัญหา:** ข้อมูลอยู่ใน `TMK` singleton ในหน่วยความจำอยู่แล้ว — **ไม่มีการโหลดจริงเลย** แต่ยังโชว์ skeleton 350ms
→ ผู้ใช้กดเมนู → เห็นโครงเทาวาบ → เนื้อหาเด้งเข้ามา = **"เหมือนรีโหลดใหม่ทุกครั้ง"** ตรงตามที่ user บ่นเป๊ะ

ยิ่ง `useBeatOn(sub)` ใน `views-flows.jsx:141` ยิงซ้ำทุกครั้งที่เปลี่ยน **หน้าย่อย** ด้วย

**ข้อเสนอ:** ลบ `useBeat`/`useBeatOn` ทิ้ง → ถ้าข้อมูลพร้อมแล้ว **render ทันที** ถ้ายังไม่พร้อมค่อยใช้ `useDelayedFlag` (ซึ่งมีอยู่แล้วและถูกต้อง)

---

### P4 — สองปรัชญา loading ในแอปเดียว 🟠

แอปนี้มี 2 วิธีคิดเรื่อง loading ที่ **ขัดกัน** อยู่คนละฝั่งของโปรเจกต์:

| | `useBeat` (ผิด) | `useDelayedFlag` (ถูก) |
|---|---|---|
| แนวคิด | โชว์ skeleton **เสมอ** 350ms | โชว์ skeleton **เฉพาะเมื่อโหลดจริงเกิน 120ms** |
| ข้อมูลพร้อมแล้ว | ยังโชว์ skeleton (หลอก) | เข้าเนื้อหาทันที |
| ใช้ที่ | 9 หน้าเก่า | 4 หน้า Sale: `saleDashboard` `saleCrm` `saleCatalog` `views-orders` |

`useDelayedFlag` (`components.jsx:578`) คือของดีอยู่แล้ว — delay 120ms กันกระพริบ + อยู่อย่างน้อย 300ms กันวาบหาย
**หน้า Sale จึงรู้สึกลื่นกว่าหน้าอื่นอย่างชัดเจน** → นี่คือสาเหตุที่ user รู้สึกว่า "UI ไม่ไปทางเดียวกัน"

**ข้อเสนอ:** ยึด `useDelayedFlag` เป็นมาตรฐานเดียวทั้งแอป แล้วลบ `useBeat` ออก

นอกจากนี้ Suspense fallback ยังมี 4 แบบไม่เหมือนกัน:
- `fallback={null}` (3 จุด)
- `fallback={<PageSkeleton />}` (1 จุด)
- `<div className="py-10 text-center…">กำลังโหลด…</div>` (1 จุด)
- `<div className="min-h-screen grid place-items-center…">กำลังโหลด…</div>` (1 จุด)

---

## 2. เซฟแล้วทำไมหน้ากระตุก (P3) 🔴

### สายโซ่ที่เกิดขึ้นจริงตอนกด "บันทึก" 1 ครั้ง

`src/modals-core.jsx:32` — `saveRow()`
```js
await supabase.from(table).upsert(row);   // 1. เขียน DB
window.__refresh?.([table]);              // 2. ดึงตารางนั้นใหม่ทั้งตาราง
toast(label + 'สำเร็จ', 'success');
```

แล้วใน `src/dataContext.jsx:211` — `refreshTables()`
```js
const results = await Promise.all(keys.map(k => QUERIES[k]()));  // 3. fetch ใหม่
rawRef.current[keys[i]] = r.data;
const mapped = mapToTMK(rawRef.current);   // 4. ⚠️ remap "ทุกตาราง" ไม่ใช่แค่ตารางที่เปลี่ยน
mutateTMK(mapped);
setVersion(v => v + 1);                    // 5. ⚠️ re-render ทั้งแอป
```

**จุดที่แพง:**

| ขั้น | ปัญหา |
|---|---|
| 2 | เปลี่ยน 1 แถว แต่ดึงกลับมาทั้งตาราง (เช่น `tmk_daily_sales` = ~1,100 แถว) |
| 4 | `mapToTMK` (31KB, มี map/filter/reduce **54 จุด**) ประมวลผล **ทุกตาราง** ใหม่หมด ทั้งที่เปลี่ยนตารางเดียว |
| 5 | `setVersion` → `AppInner` re-render → ทุก view re-render |

**ผลที่ผู้ใช้เห็น:** กดบันทึก → toast เด้ง → แต่หน้าจอ "สะดุด" 1 ครั้ง เพราะทั้งแอปวาดใหม่ → รู้สึกเหมือน "มันไปดึงอะไรมาอีกแล้ว" → **ไม่มั่นใจว่าเซฟติดจริงหรือเปล่า**

**ข้อเสนอ (เรียงตามความคุ้ม):**
1. **Optimistic UI** — อัปเดตค่าในหน้าจอทันทีที่กดเซฟ แล้วค่อย reconcile ตอน response กลับ (ตอนนี้ `lib/optimisticUpdate.js` มีของครบแล้ว แต่ใช้แค่ `orderDrawer.jsx` + `views-planner.jsx` เท่านั้น — ขยายไปที่อื่น)
2. **mapToTMK แบบ incremental** — รับ `changedKeys` แล้ว map เฉพาะตารางนั้น + ตารางที่ derive ต่อ
3. **ตัด refetch ทิ้งเมื่อไม่จำเป็น** — `upsert().select()` คืนแถวที่เขียนกลับมาอยู่แล้ว เอามาแทนในแคชได้เลย ไม่ต้องยิง query รอบสอง

---

### P3b — `AppInner` คือรากของการ re-render ทั้งหมด

`src/App.jsx:336`
```js
const { loading, error, version: dataVersion, reload, refresh, ensureLoaded } = useData();
```

- `AppInner` ถือ state ~16 ตัว + กิน `version` โดยตรง
- `src/App.jsx:869` เรียก Shell แบบ **ฟังก์ชัน** ไม่ใช่ component:
  ```js
  {showShell && Shell()}
  ```
  → ไม่มี component boundary → **memo ไม่ได้เลย** ทุกอย่าง render รวดเดียวกันหมด
- ไม่มี `React.memo` ที่ view ไหนเลย
- มี **20 ไฟล์** ที่เรียก `useData()`

ทุก realtime event / ทุก poll 120 วิ / ทุกการเซฟ = วาดใหม่ทั้งต้นไม้

---

### P3c — คำเตือนจาก ESLint ที่บอกอาการนี้ตรงๆ

`npx eslint .` → **0 errors, 131 warnings** โดยกลุ่มที่เกี่ยวกับความกระตุกโดยตรง:

| กฎ | จำนวน | แปลว่า |
|---|---|---|
| `react-hooks/static-components` | **23** | ประกาศ component ซ้อนใน component → **remount ทั้ง subtree ทุก render** = state หาย, ช่องกรอกหลุด focus, ภาพกระพริบ |
| `react-hooks/set-state-in-effect` | **32** | setState ใน effect → render 2 รอบทุกครั้ง |
| `react-hooks/exhaustive-deps` | 32 | deps ไม่ครบ → ข้อมูลค้าง/effect ยิงเกิน |
| `react-hooks/purity` | 13 | render ไม่ pure |
| `react-hooks/refs` | 11 | ใช้ ref ผิดจังหวะ |

**`static-components` 23 จุดคือตัวร้ายที่สุด** — กระจุกที่:
`modals-task.jsx` (6) · `saleWidgets.jsx` (5) · `views-mytasks.jsx` (5) · `orderCard.jsx` (4) · `views-settings-people.jsx` (3)

> อาการที่ผู้ใช้เจอ: พิมพ์ในช่องค้นหาแล้วเคอร์เซอร์หลุด, การ์ดกระพริบตอนอัปเดต, dropdown ปิดเอง

---

## 3. การดึงข้อมูล — อันนี้ทำมาดีแล้ว ✅

ส่วนนี้ **ไม่ต้องแก้อะไรมาก** เพราะทำมาถูกทางแล้ว:

| สิ่งที่ทำแล้ว | ที่ไหน |
|---|---|
| เลือกคอลัมน์เอง ไม่ใช้ `select *` | `dataContext.jsx:31` `QUERIES`, `saleData.js` `ORDERS_SEL/SKUS_SEL/CUST_SEL` |
| Deferred tables (โหลดตอนกดเข้าหน้า) | `DEFERRED = {adCamps, colorMix, sizeMix, fbMetrics}` |
| Per-table refresh (ไม่ full reload) | `refreshTables()` |
| Server-side date range | `cachedFetchRange()` |
| Cache 5 นาที + dedupe inflight | `saleData.js` `cache`/`inflight` |
| Pagination 1,000/หน้า | `paginate()` |
| Echo suppression หลังเซฟ | `lastRefreshAtRef` (< 800ms ข้าม event ตัวเอง) |
| Realtime → backoff → poll 120s → กลับมา realtime | `connectRealtime()`/`startPolling()`/`retryRealtime()` |
| Schema-tolerant (42703 → ตัดคอลัมน์) | `selectAll()` |

**จุดที่ยังปรับได้ (เล็กน้อย):**

1. `mapToTMK` remap ทุกตาราง — ดู P3 ข้อ 2
2. `POLL_TABLES` = 10 ตาราง ทุก 120 วิ ตอน realtime ล่ม → พิจารณาลดเหลือเฉพาะตารางของหน้าที่เปิดอยู่
3. **Limit ตายตัวที่อาจซ่อนข้อมูลเงียบๆ** — ตรงนี้กระทบ "ความมั่นใจในระบบ" โดยตรง:
   - `audit` limit 200
   - `customers` limit 150 (คอมเมนต์ในโค้ดเขียนว่า 300 — **คอมเมนต์ไม่ตรงกับโค้ด**, `dataContext.jsx:51`)
   - `orders` limit 200
   → ถ้าเกิน ผู้ใช้ไม่รู้เลยว่าข้อมูลถูกตัด **ควรมีป้ายบอก** "แสดง 200 รายการล่าสุด"
4. `recordInventorySnapshot()` เขียน DB ทุกครั้งที่ full load (มี guard เทียบค่าแล้ว แต่ยังเป็น write ตอน "แค่เข้ามาดู")

---

## 4. UI/UX consistency

### 4a. shadcn adoption — ดีกว่าที่คิด ✅

| Component | ใช้ shadcn | ใช้ tag ดิบ | สัดส่วน |
|---|---|---|---|
| Button | **284** | 108 `<button>` | 72% ✅ |
| Select | **158** | 1 `<select>` | 99% ✅ |
| Input | **124** | 21 `<input>` | 86% ✅ |
| Card | **276** | — | ✅ |
| Dialog | 62 | — | ✅ |

มี shadcn components ครบ 32 ตัวใน `src/components/ui/` — **ไม่ใช่ปัญหา**
เหลือ `<button>` ดิบ 108 จุดที่ควรค่อยๆ ย้าย (ส่วนใหญ่คือปุ่มไอคอนเล็กๆ)

---

### 4b. Custom CSS — นี่คือตัวปัญหาจริง 🟠

| ตัวชี้วัด | จำนวน | หมายเหตุ |
|---|---|---|
| **inline `style={{...}}`** | **1,877 จุด** | ⚠️ ตัวหลัก |
| hex สีตายตัวใน JSX | **346 จุด** | ข้ามระบบ token → ธีมเพี้ยน |
| custom class ใน `index.css` | 214 (top-level) / 378 (รวม nested) | |
| class ที่ประกาศแต่ไม่มีใครใช้ | **24** | โค้ดตาย |
| `index.css` | 1,105 บรรทัด / 67KB → **build 119KB** | โหลด eager ทุกหน้า |

**inline style 1,877 จุด กระจุกที่:**

| ไฟล์ | จำนวน |
|---|---|
| `saleDashboard.jsx` | 293 |
| `views-sales.jsx` | 265 |
| `saleCrm.jsx` | 127 |
| `views-entry.jsx` | 104 |
| `modals-sale.jsx` | 67 |
| `views-planner.jsx` | 60 |
| `saleCatalog.jsx` | 56 |

**ทำไมมันแย่ 2 ชั้น:**
1. **UX** — ค่า padding/สี/ขนาด ถูกกำหนดมือทีละจุด → แต่ละหน้าเลยเพี้ยนกันนิดๆ = "หน้าตาไม่ไปทางเดียวกัน" ตรงตามที่ user รู้สึก
2. **Performance** — `style={{...}}` สร้าง **object ใหม่ทุก render** → prop เปลี่ยนเสมอ → `React.memo` ใช้ไม่ได้เลยแม้จะใส่ไป (ซ้ำเติม P3)

**hex ตายตัว 346 จุด** กระจุกที่ `components.jsx` (52) · `views-flows.jsx` (31) · `saleDashboard.jsx` (28) · `App.jsx` (28) · `charts.jsx` (27)
ทั้งที่มีระบบ token อยู่แล้ว (`--accent/--good/--warn/--bad/--info/--ink-2..4`)

**class ตาย 24 ตัว:**
`audit-range` `card-pad-sm` `entry-action-row` `entry-empty` `entry-section` `entry-section-title` `entry-success-flash` `filterbar` `hero-exec` `icon-btn` `io-grid` `large` `login-art` `menu-pop` `menu-row` `mobile-topbtn` `modal-body` `modal-foot` `modal-head` `modal-scrim` `mrow-qty` `mrow2` `rail-avatar` `topbar-title`

---

### 4c. `window.confirm` ของเบราว์เซอร์ 🟠

แอปมีกล่องยืนยันสวยๆ ของตัวเองอยู่แล้ว (`window.__confirm` + `ConfirmHost` — ใช้ 27 จุด) แต่ยังมี **4 จุดที่หลุดไปใช้ของเบราว์เซอร์**:

| ที่ | เรื่อง |
|---|---|
| `modals-core.jsx:26` | `guardClose` — เตือนก่อนปิดตอนยังไม่เซฟ |
| `modals-core.jsx:81` | `useAnimatedClose` — เตือนก่อนปิด |
| **`modals-sale.jsx:87`** | ⚠️ **ยืนยันยอดขายที่สูงผิดปกติ — เรื่องเงินโดยตรง** |
| `modals-sale.jsx:346` | เตือนก่อนเปลี่ยนวันที่ |

`modals-sale.jsx:87` คือจุดที่แย่ที่สุด:
```js
if (!window.confirm(`⚠️ ยอดวันนี้ ${bahtStr(_tot)} สูงกว่าค่าเฉลี่ยรายวัน ${x} เท่า …`)) return;
```
กล่องเทาๆ ของเบราว์เซอร์ ขึ้นชื่อโดเมนกำกับ ไม่มีธีมของแอป — **โผล่ตอนกำลังยืนยันตัวเลขเงิน** = ทำลายความเชื่อมั่นในระบบมากที่สุดในบรรดาทั้งหมด

> หมายเหตุเสริม: `window.confirm` บล็อก event loop ทั้งเส้น — ถ้ามี realtime event เข้ามาระหว่างนั้นจะค้างคิว

---

### 4d. Empty state ไม่มีมาตรฐาน 🟡

**ไม่มี `<EmptyState>` component กลางเลย** — ข้อความ "ว่าง" เขียนมือกระจาย ~60 จุด ด้วยถ้อยคำต่างกัน:

`ไม่มีข้อมูล` (19) · `ยังไม่มี…` (15) · `ยังไม่มีข้อมูล` (4) · `ไม่พบผลลัพธ์สำหรับ` (2) · `ไม่พบ` (2) · `ยังไม่มีแบรนด์` (5) · `ยังไม่มีแคมเปญ` (3) · ฯลฯ

**ปัญหาต่อผู้ใช้:** แยกไม่ออกว่า "ว่างเพราะยังไม่มีข้อมูล" / "ว่างเพราะตัวกรองไม่ตรง" / "ว่างเพราะโหลดพลาด" → ทำให้ **งงและไม่มั่นใจ**

ควรมี component เดียวที่มี 3 โหมด: `ยังไม่มีข้อมูล` (+ ปุ่มสร้าง) · `ไม่ตรงตัวกรอง` (+ ปุ่มล้างตัวกรอง) · `โหลดไม่สำเร็จ` (+ ปุ่มลองใหม่)

---

### 4e. Skeleton ก็ไม่มีมาตรฐานเหมือนกัน 🟡

มี skeleton อยู่ **5 ตระกูล** ที่หน้าตาไม่เหมือนกัน:
`PageSkeleton` · `CardGridSkeleton` · `SkelTable` · `Skel` · `CatalogSkeleton` (เฉพาะ `saleCatalog`) · `PlannerSkeleton` (เฉพาะ `views-planner`)
ส่วน shadcn `<Skeleton>` ตัวจริงถูกเรียกตรงๆ แค่ **4 ครั้ง**

---

## 5. Bundle / ขนาดไฟล์

Code splitting ทำไว้ดีแล้ว (`vite.config.js` `advancedChunks` แยก vendor ถูกต้อง มีคอมเมนต์อธิบายว่าทำไมไม่ใช้ `manualChunks`) แต่ยังมีก้อนใหญ่:

| ไฟล์ | ขนาด | หมายเหตุ |
|---|---|---|
| `pdf.worker` | **2.2 MB** | dynamic แล้ว ✅ โหลดเฉพาะตอนอ่านใบเสร็จ |
| `vendor-charts` (recharts) | 430 KB | โหลดเฉพาะหน้ามีกราฟ ✅ |
| `pdf` | 425 KB | dynamic ✅ |
| `index.js` | 351 KB | ⚠️ eager — ทุกคนโหลด |
| `views-catalog` | 291 KB | `goldenGrid.js` 98KB อยู่ในนี้ |
| `vendor-react` | 219 KB | |
| `vendor-supabase` | 200 KB | ⚠️ eager |
| `ProductPicker` | 179 KB | |
| **`index.css`** | **119 KB** | ⚠️ eager + render-blocking |

**ควรดู:** `index.css` 119KB เป็น render-blocking ทุกหน้า — ส่วนใหญ่มาจาก custom class 378 ตัว (ดู 4b) ถ้าย้ายไป Tailwind utility + ลบ class ตาย น่าจะลดได้มาก

---

## 6. แผนงานที่แนะนำ (เรียงตาม ผลลัพธ์ ÷ ความเสี่ยง)

### Phase 1 — "เร็วขึ้นทันตา" (ครึ่งวัน · เสี่ยงต่ำมาก · ไม่แตะ business logic)

| # | งาน | ไฟล์ | ผล |
|---|---|---|---|
| 1.1 | ลด `useMinSplash` 5500 → 0–400ms | `App.jsx:874` | **เข้าแอปเร็วขึ้น ~5 วิ** |
| 1.2 | ลบ `useBeat`/`useBeatOn` ออกจาก 9 หน้า | `views-*.jsx` `salePerf.jsx` | สลับเมนู **ทันที** ไม่มี skeleton หลอก |
| 1.3 | ย้าย 4 `window.confirm` → `window.__confirm` | `modals-core.jsx` `modals-sale.jsx` | เลิกเห็นกล่องเบราว์เซอร์ |
| 1.4 | ลบ CSS class ตาย 24 ตัว | `index.css` | CSS เล็กลง |
| 1.5 | แก้คอมเมนต์ `customers` 300→150 ให้ตรงโค้ด | `dataContext.jsx:51` | กันเข้าใจผิด |

> Phase 1 อย่างเดียวน่าจะแก้ความรู้สึก "ช้า/เหมือนรีโหลด" ได้ **เกินครึ่ง**

---

### Phase 2 — "เซฟแล้วไม่กระตุก" (1–2 วัน · เสี่ยงกลาง · ต้องมีเทสต์คุม)

| # | งาน | ผล |
|---|---|---|
| 2.1 | `mapToTMK(raw, changedKeys)` — map เฉพาะตารางที่เปลี่ยน | ตัดงาน CPU ตอนเซฟลงมาก |
| 2.2 | `saveRow` ใช้ `.upsert().select()` เอาแถวที่ได้กลับมาแทนในแคชเลย ไม่ต้อง refetch | ตัด round-trip 1 รอบ/การเซฟ |
| 2.3 | ขยาย optimistic UI (`lib/optimisticUpdate.js`) ไปที่ modal เซฟหลักๆ | กดปุ๊บเห็นผลปั๊บ |
| 2.4 | แยก `Shell()` เป็น `<Shell />` จริง + `React.memo` ที่ view | ตัด re-render ทั้งต้นไม้ |
| 2.5 | เก็บ `react-hooks/static-components` 23 จุด | เลิกกระพริบ/เคอร์เซอร์หลุด |
| 2.6 | เก็บ `react-hooks/set-state-in-effect` 32 จุด | ตัด render รอบสอง |

---

### Phase 3 — "UI ไปทางเดียวกัน" (ทยอยทำ · เสี่ยงต่ำ แต่จำนวนเยอะ)

| # | งาน | ผล |
|---|---|---|
| 3.1 | สร้าง `<EmptyState>` กลาง (3 โหมด) แล้วแทนที่ ~60 จุด | ผู้ใช้เลิกงงว่า error หรือว่าง |
| 3.2 | รวม skeleton 5 ตระกูล → ชุดเดียว + ใช้ `useDelayedFlag` เป็นมาตรฐาน | จังหวะโหลดเหมือนกันทั้งแอป |
| 3.3 | แทน hex ตายตัว 346 จุด ด้วย CSS token | ธีมคุมได้จุดเดียว |
| 3.4 | ทยอยยุบ inline style 1,877 จุด → Tailwind / class กลาง (เริ่มจาก `saleDashboard` 293 + `views-sales` 265 = 30%) | UI สม่ำเสมอ + memo ทำงานได้ |
| 3.5 | ย้าย `<button>` ดิบ 108 จุด → `<Button>` | โฟกัส/สถานะ disabled สม่ำเสมอ |
| 3.6 | ป้ายบอกเมื่อข้อมูลถูกตัด (limit 150/200) | ผู้ใช้เชื่อใจตัวเลข |
| 3.7 | Suspense fallback ให้เหลือแบบเดียว | เลิกวาบต่างรูปแบบ |

---

## 7. คำถามถึงคุณ — ✅ ตอบครบแล้ว (เก็บไว้เป็นบันทึกการตัดสินใจ)

1. **จอโหลด 5.5 วิ ตั้งใจไว้เพื่อโชว์โลโก้ / branding หรือเปล่า?**
   ถ้าใช่ ผมเสนอทางกลาง: โชว์โลโก้แค่ **≤800ms** และตัดทิ้งทันทีเมื่อข้อมูลพร้อม — ได้ทั้ง branding และความเร็ว

2. **Skeleton ตอนสลับเมนู (350ms) ตั้งใจให้ "รู้สึกว่าระบบกำลังทำงาน" หรือเปล่า?**
   ถ้าใช่ ผมเสนอเปลี่ยนเป็น transition จางๆ 120ms แทน skeleton เต็มหน้า — ยังรู้สึกว่าเปลี่ยนหน้า แต่ไม่รู้สึกว่า "โหลดใหม่"

3. **อยากให้เริ่มจากอะไรก่อน** — Phase 1 (เร็วขึ้นทันตา) หรือ Phase 3 (UI ให้ไปทางเดียวกัน)?

4. **limit ที่ตัดข้อมูล** (`customers` 150 / `orders` 200 / `audit` 200) — อยากให้ *เพิ่ม limit*, *ทำ infinite scroll*, หรือแค่ *ใส่ป้ายบอกว่าโดนตัด*?

5. Phase 2 แตะไฟล์ที่ "เส้นเงินวิ่งผ่าน" (`saleDashboard` / `modals-sale`) — ให้ทำ **ทีละไฟล์แล้วรันเทสต์** หรือทำรวดเดียวแล้ว verify ทีเดียว?

---

## ภาคผนวก — ตัวเลขที่วัดได้

| ตัวชี้วัด | ก่อน | หลัง Phase 1+2 |
|---|---|---|
| ESLint errors | 0 | **0** |
| ESLint warnings | 131 | **99** |
| เวลาเห็นจอโหลดตอนเข้าแอป | อย่างน้อย 5.5 วิ (บังคับ) | **เท่าที่โหลดจริง** |
| — `static-components` | 23 | **0** |
| — `set-state-in-effect` | 32 | **29** (ที่เหลือเป็นการใช้ effect ที่ถูกต้อง) |
| Tests | 331 / 32 files | **338 / 33 files** |
| `index.css` (build) | 119 KB | **116.25 KB** |
| custom CSS class ที่ไม่มีใครใช้ | 24 | **0** |
| `useBeat` call site (skeleton หลอก) | 9 หน้า | **0** |
| `window.confirm` (กล่องเบราว์เซอร์) | 4 จุด | **1** (fallback เท่านั้น) |

ยังเหมือนเดิม — เป็นงาน Phase 3:
```
inline style={{}} 1,877 จุด
hex ตายตัวใน JSX   346 จุด
useData() callers 20 ไฟล์
EmptyState กลาง    ยังไม่มี (~60 จุดเขียนมือ)
```
