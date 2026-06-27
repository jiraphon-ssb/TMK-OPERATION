# สถาปัตยกรรมระบบ Sale — ภาพรวม · Data Flow · Anti-reimport · Future-proof 3–4 ปี

> เอกสารนี้คือคำตอบของ PART 8 ข้อ "flow ของระบบทั้งหมด + คิดเผื่ออนาคต 3–4 ปี"
> อัปเดต: หลังจบ PART 8 (geo drill-down + hero redesign + WhatsNew→หน้า)

---

## 1. ภาพรวมระดับสูง (เข้าใจใน 30 วินาที)

```
ไฟล์ขาย (Shipnity / Shopee / TikTok)  +  เซลล์กรอกเอง
        │
        ▼   นำเข้า (import) — เกิดครั้งเดียวต่อรอบ
┌─────────────────────────── Supabase (ฐานข้อมูล) ───────────────────────────┐
│  baseline (frozen ตอน import)              override (แก้มือในเว็บ ภายหลัง)   │
│  • tmk_mp_orders     1 แถว/ออเดอร์          • tmk_order_overrides             │
│  • tmk_mp_skus       1 แถว/บรรทัดสินค้า     • tmk_sku_overrides               │
│  master + mapping                          • tmk_mp_aliases (term→ลาย/รหัส)  │
│  • tmk_shirt_catalog (เสื้อ: ชื่อ/รูป/หมวด/กลุ่ม)                            │
│  • ข้อมูลลูกค้า / funnel / sale_entries                                       │
└──────────────────────────────────────────────────────────────────────────┘
        │
        ▼   อ่าน + cache (saleData.js · paginate ครบทุกแถว)
   procOrders / procSkus   ← LIVE-RESOLVE: override ทับ frozen, alias สด, catalog by code
        │
        ▼   aggregate (saleAgg.js)
   compute() → kpi + มิติ 1D (byProvince/byDesign/byColor/…)
   geoBreakdown() → ต้นไม้ 3 ชั้น จังหวัด→ลาย→สี
        │
        ▼
   หน้าจอ: รายงานขาย · ออเดอร์ · แคตตาล็อก · CRM · Leaderboard
```

**หลักคิดเดียวที่ทำให้ทั้งระบบไม่พัง:** *baseline แตะไม่ได้ · override คือชั้นบนที่แก้ในเว็บ · แสดงผล = merge ตอนอ่าน* → re-import เขียนทับแค่ baseline ไม่แตะของที่แก้มือ

---

## 2. Data Flow แบบละเอียด (import → จอ)

### 2.1 ขาเข้า (import — เกิดเป็นครั้งคราว)
- **แหล่ง:** ไฟล์ Shipnity (ฐานหลัก), Shopee/TikTok (เสริม), แคตตาล็อกเสื้อ, การกรอกของเซลล์
- **ปลายทาง:**
  - `tmk_mp_orders` — 1 แถว/ออเดอร์ · ฟิลด์ระดับออเดอร์: `order_no`, `province`, `salesperson`, `customer_*`, `sales`, `job_type`, `marketplace_id`, `order_date`
  - `tmk_mp_skus` — 1 แถว/บรรทัดสินค้า · `order_no` (FK), `design`, `color`, `size`, `qty`, `product_code`, `raw_sku_or_name`, `match_how`
- ตอน import จะ "จับคู่ลาย" ผ่าน `buildMatchers` + `resolveDesign` (mpReport.js) แล้ว **freeze** ค่าลง `design`/`product_code`
- ⚠️ ค่า frozen นี้คือต้นเหตุเดิมของการต้อง re-import — แก้ด้วย override layer (ดูข้อ 4)

### 2.2 ขาอ่าน (ทุกครั้งที่เปิดหน้า)
1. `saleData.js` → `cachedFetchRange()` ดึง orders+skus+catalog+alias+override ตามช่วงวันที่ (paginate ครบทุกแถว, cache ในหน่วยความจำ)
2. `procOrders` / `procSkus` — **live-resolve**:
   - `tmk_order_overrides` / `tmk_sku_overrides` ทับค่า frozen (ถ้ามี)
   - ชื่อลาย resolve ใหม่: override → catalog by `product_code` → alias สด → golden → frozen (fallback)
3. `compute(orders, skus, filter)` (saleAgg.js) → `kpi`, `_ords`, `_skus`, มิติ 1D
4. `geoBreakdown(A._ords, A._skus)` → ต้นไม้ จังหวัด→ลาย→สี (รับแถว**ที่กรองแล้ว** ไม่ rerun filter ซ้ำ)
5. Component render (saleDashboard.jsx, views-2.jsx, saleCrm.jsx, …)

### 2.3 ขาแก้ (เขียนกลับโดยไม่ต้อง re-import)
- แก้ใน OrderDrawer / แคตตาล็อก → upsert ลง `tmk_*_overrides` หรือ `tmk_shirt_catalog`
- รอบอ่านถัดไป live-resolve หยิบค่าใหม่ทันที

---

## 3. กระดูกสันหลังของการเชื่อมข้อมูล (อะไรเชื่ออะไร)

| คีย์ | เชื่อม | ใช้ทำอะไร | เสถียรข้าม re-import? |
|---|---|---|---|
| **`order_no`** | order ↔ sku ↔ override ทั้งสองฝั่ง | แกนกลางทั้งระบบ | ✅ ใช่ (onConflict id) |
| **`product_code`** | sku → `tmk_shirt_catalog` | ดึงชื่อ/รูป/หมวด/กลุ่มเสื้อ **สด** | ✅ |
| **`salesperson`** | order → Leaderboard / CRM | อันดับเซลล์ + เป้า (มี alias เซลล์) | ✅ |
| **`customer_code`** | order → CRM / RFM / ซื้อซ้ำ | วิเคราะห์ลูกค้า + ต่อยอด | ✅ |
| **`marketplace_id`** | สะพานมาร์เก็ตเพลส | กัน double-count กับยอดเซลล์กรอกเอง | ✅ |
| **`province`** | อยู่บน order เท่านั้น | geo drill-down (join sku ผ่าน order_no) | ✅ |

> หลักการ: **ลายในจอต้อง resolve ผ่าน `product_code` → catalog เสมอ** ไม่พึ่งค่า frozen (ทำแล้ว PART 2) → แก้ชื่อในแคตตาล็อก ออเดอร์เปลี่ยนตามทันที

---

## 4. ทำไมไม่ต้อง re-import บ่อย (ชั้นที่ ship แล้ว)

ทั้ง 3 ชั้นนี้อยู่ใน production แล้ว ([[override-layer]]):

1. **Override layer** — แก้ job_type / ชื่อลูกค้า / เซลล์ / ลายรายบรรทัด ในเว็บ → เก็บลง `tmk_*_overrides` → re-import เขียนทับแค่ baseline ของแก้มืออยู่รอด
2. **Live-resolve** — ชื่อ/รหัส/ลาย resolve ตอนแสดงผลจาก catalog+alias สด ไม่ใช่ค่าแช่แข็ง
3. **Re-match** — ปุ่ม "อัปเดตการจับคู่ลายใหม่" ดันการจับคู่ใหม่ลงข้อมูลเก่าแบบถาวร โดยไม่ต้องอัปไฟล์

**ผลลัพธ์:** re-import เหลือทำเฉพาะเมื่อ *"มีออเดอร์ใหม่ / ยอดในไฟล์ต้นทางเปลี่ยน"* เท่านั้น — การจับคู่ ชื่อ ประเภท ลูกค้า แก้ในเว็บแล้วถาวร

---

## 5. Future-proof 3–4 ปี (เฟสถัดไป — ส่วนใหญ่ต้อง migration; ผู้ใช้รันเอง, โค้ด graceful fallback)

| ฟีเจอร์ | ทำอะไร | ต้อง migration |
|---|---|---|
| **Audit log** (`tmk_audit`) | track ใครแก้อะไรเมื่อไร (override layer เปิดทางแล้ว) | ✅ ตารางใหม่ |
| **สต๊อก/พร้อมขาย** (`qty_on_hand`) | badge "ใกล้หมด" ในแคตตาล็อก/ออเดอร์ | ✅ คอลัมน์ |
| **เป้า/คอมมิชชั่นต่อเซลล์** (config table) | ขยาย Leaderboard pace ที่มีแล้ว | ✅ ตารางใหม่ |
| **Soft-delete + ถังขยะ/undo ทุกที่** | กัน hard-delete (มี undo บางจุดแล้ว — [[phase-b-ux-export]]) | บางส่วน |
| **Schema-tolerant import** | เก็บคอลัมน์ที่ไม่รู้จักใน `attrs` jsonb → ไฟล์เพิ่มคอลัมน์ไม่ทำ import พัง | ใช้ attrs เดิม |
| **Versioned golden catalog** | เก็บประวัติชื่อ/ราคา → รายงานย้อนหลังไม่เพี้ยนเมื่อแก้ catalog | ✅ ตารางใหม่ |
| **Monthly rollup table** | สรุปต่อเดือนล่วงหน้า → dashboard เร็วขึ้นเมื่อข้อมูลโตหลายปี | ✅ ตารางใหม่ |

**ลำดับแนะนำ:** Schema-tolerant import (กัน import พังก่อน) → Audit log → Monthly rollup (เมื่อข้อมูลเริ่มช้า) → ที่เหลือตามความต้องการธุรกิจ

---

## 6. ไฟล์สำคัญ (ชี้ตำแหน่งโค้ด)

| งาน | ไฟล์ |
|---|---|
| ดึง+cache ข้อมูล | `src/lib/saleData.js` |
| live-resolve ชื่อลาย | `src/lib/shirtCatalog.js`, `procSkus` |
| aggregate + KPI | `src/lib/saleAgg.js` (`compute`, `geoBreakdown`) |
| เวลา/ช่วงเทียบ | `src/lib/saleTime.js` (`prevCalendarMonth`, `isFullCalendarMonth`) |
| แดชบอร์ดรายงานขาย | `src/saleDashboard.jsx` (`GeoPanel`, hero) |
| ออเดอร์ + OrderDrawer + override UI | `src/views-2.jsx` |
| แคตตาล็อก | `src/saleCatalog.jsx` |
| changelog หน้าเต็ม | `src/WhatsNew.jsx` (`WhatsNewPage`, `UpdateBanner`) |
| migration ค้างรัน (ก้อนเดียว) | `supabase/migrations/20260629-pending-bundle.sql` |

---

## 7. สรุป PART 8 ที่เพิ่งจบ

- **8A/8B Geo drill-down:** `geoBreakdown()` + GeoPanel 3 การ์ด — แผนที่+อันดับจังหวัด → คลิกจังหวัดเห็นลาย→สี (ออเดอร์/ตัว/ยอด, reconcile ตรง) + ตาราง pivot จังหวัด→ลาย→สี กางได้ + export CSV
- **8C:** ลบแท็บ "ลาย" — ยุบมุมมองลายทั้งประเทศ (Pareto/ดาวรุ่ง-ดาวร่วง/ตารางลาย) เข้าแท็บ "พื้นที่" เป็นมุมมองเริ่มต้นเมื่อยังไม่เลือกจังหวัด
- **8D Hero:** เทียบ "เดือนปฏิทินก่อนหน้า" จริง (มิ.ย. vs พ.ค.) ป้ายเดือนตรง · Progress (shadcn) แทน bar มือเขียน · วันนับ UTC ไม่ off-by-one
- **8E WhatsNew:** ย้าย changelog จากปุ่มลอย (FAB) → หน้าเต็มในเมนูโปรไฟล์ (Settings › มีอะไรใหม่) · จุดแดง unseen sync ข้าม component · เอา FAB ออก · คง UpdateBanner
