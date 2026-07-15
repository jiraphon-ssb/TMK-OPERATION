# 03 — SALES IMPLEMENTATION DECISIONS (Phase 2)

> Branch `audit-remediation` · 2026-07-15 · จาก data-lineage โค้ดจริง + decision ของเจ้าของระบบ
> **ยังไม่แตะสูตรยอดขาย** — เอกสารตัดสินใจ + lineage เพื่อรองรับงานถัดไป

## 🎯 DECISION (จากเจ้าของระบบ · Q1)

| ระบบ | บทบาท (ตัดสินแล้ว) |
|---|---|
| **Operational sales** (`computeMonth` จาก `tmk_daily_sales` + `tmk_monthly_history`) | **✅ FINANCIAL TRUTH** — ตัวเลขยอดขายจริงทางการเงิน (หน้าหลัก + Sales view) |
| **Imported analytics** (`saleAgg.compute` จาก `tmk_mp_orders`) — หน้า "ยอดขาย"/saleDashboard | **→ REPURPOSE เป็นหน้าดู ADS** ในอนาคต (ไม่ใช่ source ยอดขายทางการเงินอีกต่อไป) |

**ผลของ decision:** ไม่ต้อง reconcile 2 แหล่งให้เท่ากัน (คนละบทบาท) · **ห้ามรวม/บังคับให้ยอด 2 ที่ตรงกัน** · การแก้สูตร operational = ต้องมี characterization test ก่อน (กฎภารกิจ)

## 📊 DATA LINEAGE (จากโค้ดจริง)

### A. Operational sales = TRUTH · `computeMonth(monthIdx0, yearBE)` (`dataContext.jsx:587`)
- **แหล่ง:** `tmk_daily_sales` (ต่อวัน · `channels` jsonb: rev/ord/ad/newC/oldC ต่อช่อง shopee/tiktok/lazada/facebook/line_oa/crm) + `tmk_monthly_history` (target, meta, actual รายเดือนสำหรับเดือนอดีต)
- **วันที่:** `year`+`month` ของแถว daily · เดือนปัจจุบัน = MTD ถึงวันนี้ · เดือนอนาคต = 0 · อดีต = ทั้งเดือน
- **ยอด (MTD):** ถ้าเป็นเดือนอดีตที่มี `monthly.actual>0` และ `meta.entryMode≠'daily'` → ใช้ `monthly.actual` (ยอดรวมรายเดือน) · ไม่งั้น Σ ยอดรายวันต่อช่อง (`channels[].actual`)
- **Cancel/Return:** ไม่มี filter — ทีมกรอกยอด **net** รายวันเอง (ยอดที่กรอก = ยอดจริงหลังหักแล้ว)
- **Gross/Net/Paid:** ไม่แยก — 1 ตัวเลข = ยอดขายจริงที่ทีมกรอก
- **กันซ้ำ:** 1 แถว/วัน (`tmk_daily_sales` PK by date) · แก้ทับได้
- **ใช้ที่:** หน้าหลัก (Home KPI) + Sales view (`views-1.jsx`) — **Home↔Sales ตรงกันเพราะ compute เดียวกัน**
- **Test:** ❌ ยังไม่มี (computeMonth ผูก singleton `TMK` — ต้อง extract pure core ก่อนเทสต์ → Phase 6)

### B. Imported analytics → ADS (future) · `saleAgg.compute(orders, skus, f)` (`lib/saleAgg.js:42`)
- **แหล่ง:** `tmk_mp_orders` (grain = ออเดอร์) + skus · overrides (`tmk_order_overrides`)
- **วันที่:** `order_date` (filter ช่วง `f.from`–`f.to`)
- **ยอด:** Σ `sales` ของออเดอร์ที่ **ไม่ยกเลิก** (`orderPass`: ตัด `status==='cancelled'` เว้น includeCancelled) · แยกมิติ ช่อง/เซลล์/สี/จังหวัด/ชำระ/ลูกค้า
- **กันซ้ำ import:** `order_no` unique + `source` column (shipnity vs mp) · confirmReceipts กัน order_no ซ้ำ
- **ใช้ที่:** saleDashboard.jsx (หน้า "ยอดขาย") + salePerf.jsx (ประสิทธิภาพเซลล์) + receipts/funnel/CRM
- **Test:** ✅ มี characterization (`saleAgg.test.js`: ตัดยกเลิก · byChannel · geo invariant · new/old · COD)

### C. อื่นๆ (แหล่งที่เกี่ยวข้อง)
- **Targets/คอม:** `tmk_monthly_history.target/meta` (operational) + `tmk_targets` (per-เซลล์ · salePerf)
- **CRM customer totals:** live-aggregate จาก `tmk_mp_orders` ผ่าน `customerKeyOf` (ผูก customer_code) — ไม่มี lifetime_* cache
- **Receipts:** `tmk_sale_receipts` (เซลล์=คนอัปโหลด) → สร้างออเดอร์ใน `tmk_mp_orders` (source='shipnity')
- **คนทัก (leads):** `tmk_sales_funnel` (1 แถว/เซลล์/วัน · jsonb leads) — คนละแกนกับยอดขาย

## ✅ สรุป Financial truth vs Operational estimate
- **Financial truth = A (computeMonth · daily/monthly operational)** — ตัวเลขที่ใช้ตัดสินใจการเงิน
- **B (mp_orders analytics)** = จะกลายเป็นหน้า Ads · **ไม่ใช่ยอดขายทางการเงิน**
- **ไม่มี reconciliation ที่ต้องบังคับ** (คนละบทบาทตาม decision) — ถ้าต้องเทียบ ให้ทำเป็น report แยก ไม่ใช่บังคับ merge

## 🚧 งานถัดไปที่เกิดจาก decision นี้ (ต้อง scope requirement)
1. **Repurpose หน้า "ยอดขาย" → Ads** (saleDashboard.jsx) — เป็น feature ใหญ่: ต้องรู้ว่าจะดู ads metric อะไร (จาก `tmk_ad_campaigns`/`tmk_fb_metrics`/daily ad_spend?), layout, ชื่อเมนู. **ต้องการ requirement จากพี่** ก่อนเริ่ม
2. **Characterization tests computeMonth** (ก่อน refactor/แตะสูตร operational) — extract pure core → Phase 6
3. **KPI-1:** เพิ่ม label แหล่งข้อมูล + tooltip นิยาม บนแต่ละ tile (ผูกกับ lineage นี้)

## ❓ DECISION REQUIRED (เหลือ)
- **ไม่มี blocker สำหรับ source-of-truth** (Q1 ตอบแล้ว)
- แต่ **การ repurpose ยอดขาย→ads ต้องการ requirement** (ข้อ 1 ข้างบน) ก่อนลงมือ — ยังไม่เริ่มจนกว่าพี่ระบุ
