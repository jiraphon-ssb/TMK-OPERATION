# 04 — SALES METRIC CONTRACT (SALES-1 acceptance)

> Branch `audit-remediation` · 2026-07-15 · จากโค้ดจริง (`computeMonthPure.js`, `saleAgg.js`) + Q1 decision ([[03-SALES-IMPLEMENTATION-DECISIONS]])
> **สัญญาเมตริก** — นิยามแต่ละ KPI ระดับ contract (grain · date basis · filter · gross/net · dedup · แหล่ง) เพื่อ (1) ป้องกันการรวม 2 แหล่งผิด (2) เป็นฐานให้ KPI-1 (label แหล่งข้อมูล) (3) ล็อกสูตรก่อนแตะ (กฎภารกิจ "ห้ามเปลี่ยนสูตรยอดขายโดยไม่มี test")

## หลักการ (จาก Q1 · ห้ามฝ่าฝืน)
- **แหล่ง A = Operational (computeMonth)** = **FINANCIAL TRUTH** — ยอดขายจริงทางการเงิน
- **แหล่ง B = Imported analytics (saleAgg.compute)** = **operational estimate / จะ repurpose เป็น Ads** — ไม่ใช่ยอดการเงิน
- **ห้าม reconcile/บังคับให้ 2 แหล่งเท่ากัน** (คนละบทบาท · คนละ grain · คนละ date basis) — ถ้าจะเทียบ ทำเป็น report แยก

---

## แหล่ง A — Operational (FINANCIAL TRUTH)
`computeMonthPure(monthIdx0, yearBE, {dailyAll, monthly, channels, clv, today})` · [src/lib/computeMonthPure.js](../../src/lib/computeMonthPure.js) · wrapper `computeMonth` ([src/dataContext.jsx](../../src/dataContext.jsx))
**ใช้ที่:** หน้าหลัก (Home cockpit) + **ยอดขาย** (SalesView · [src/views-1.jsx](../../src/views-1.jsx)) — Home↔Sales ตรงกันเพราะ compute เดียวกัน
**แหล่ง DB:** `tmk_daily_sales` (ต่อวัน·ช่อง jsonb: rev/ord/ad/newC/oldC) + `tmk_monthly_history` (target/meta/actual รายเดือน) + `tmk_channels`

| KPI | สูตร (ref) | grain | date basis | cancel/return | gross/net | dedup |
|---|---|---|---|---|---|---|
| **MTD (ยอดขาย)** | เดือนอดีต+`monthly.actual>0`+`entryMode≠daily` → `monthly.actual` · ไม่งั้น Σ `channels[].actual` (daily) | เดือน | `year`+`month` (BE) ของแถว daily | **ไม่มี filter** — ทีมกรอกยอด net เอง | **net** (ยอดที่กรอก = หลังหักแล้ว · 1 ตัวเลข) | 1 แถว/วัน (PK by date) · แก้ทับ |
| **ORD (ออเดอร์)** | `monthly.orders` (fallback) · ไม่งั้น Σ `channels[].orders` | เดือน | เดียวกับ MTD | ตามยอด | นับ | เดียวกัน |
| **AOV** | `MTD / ORD` (0 ถ้า ORD=0) | เดือน | — | — | net | — |
| **AD (ค่าแอด)** | `monthly.adSpend` (fallback) · ไม่งั้น Σ `rows[].adSpend` | เดือน | เดียวกับ MTD | — | — | 1/วัน |
| **PACE_TGT** | `(TARGET/DAYS)*DAY` — DAY=วันนี้(ปัจจุบัน)/เต็มเดือน(อดีต)/0(อนาคต) | เดือน→วัน | ปฏิทิน | — | — | — |
| **PACE_PCT** | `MTD / PACE_TGT × 100` | เดือน | — | — | — | — |
| **RUN (run rate)** | `(MTD/DAY)*DAYS` (คาดการณ์ทั้งเดือน) | เดือน | — | — | net | — |
| **ACOS_TOT** | `AD / MTD × 100` | เดือน | — | — | — | — |
| **NEW_C / OLD_C** | Σ `channels[].newCust/oldCust` (จำนวนลูกค้า) | เดือน | — | — | นับคน | — |
| **% ปิด** | `ORD / (NEW_C+OLD_C) × 100` (คนทัก = ลูกค้าใหม่+เก่า) | เดือน | — | — | — | — |
| **ต่อช่อง (channels[])** | Σ ต่อ `base.id` จาก daily · target/adBudget จาก `meta.channelTargets/adChannels` | ช่อง×เดือน | — | — | net | — |
| **fb.* (ROAS/ACOS/conv/cac)** | จาก channel `facebook` (revenue/spend/inq/orders/newCust) | ช่อง×เดือน | — | — | net | — |
| **custWeekly.returningPct** | `oldC/(newC+oldC)×100` ต่อสัปดาห์ (Math.ceil(day/7)) | สัปดาห์ | day ของเดือน | — | นับคน | — |

**Test:** ✅ [computeMonthPure.test.js](../../src/lib/__tests__/computeMonthPure.test.js) (12 — daily-sum/monthly-fallback+entryMode/pace-run ปัจจุบัน/อนาคต/ว่าง)

---

## แหล่ง B — Imported analytics (→ ADS future · ไม่ใช่ยอดการเงิน)
`saleAgg.compute(orders, skus, f)` · [src/lib/saleAgg.js:42](../../src/lib/saleAgg.js)
**ใช้ที่:** รายงานขาย (SaleDataView) + **ประสิทธิภาพเซลล์** (salePerf · `buildPerf`) + ออเดอร์ + CRM
**แหล่ง DB:** `tmk_mp_orders` (grain=ออเดอร์) + `tmk_mp_skus` (line) + `tmk_order_overrides` · `source` แยก shipnity/mp

| KPI | สูตร (ref) | grain | date basis | cancel/return | gross/net | dedup |
|---|---|---|---|---|---|---|
| **sales** | Σ `o.sales` ของ `orderPass` | ออเดอร์ | `order_date` ∈ `[f.from,f.to]` | **ตัด `status='cancelled'`** (เว้น `includeCancelled`) | ยอดที่ import | `order_no` unique + `source` |
| **orders** | `ords.length` | ออเดอร์ | เดียวกัน | เดียวกัน | นับ | เดียวกัน |
| **qty** | Σ `o.qty` | ออเดอร์ | เดียวกัน | เดียวกัน | นับ | — |
| **AOV** | `sales/orders` | ออเดอร์ | — | — | — | — |
| **attrSales/attrQty** (เมื่อกรอง SKU) | Σ `sk.line_sales`/`sk.qty` (attributed ระดับลาย) | SKU line | order_date | join ผ่าน order ที่ผ่านฟิลเตอร์ | — | order_no+design |
| **newC/oldC/newPct** | นับ `customer_type` | ออเดอร์ | — | — | นับออเดอร์ | — |
| **codO/codPct** | `cod_amount>0 \|\| payment_type='COD'` | ออเดอร์ | — | — | — | — |
| **mpSales/mpPct** | Σ sales ช่อง Shopee/Lazada/TikTok | ออเดอร์ | — | — | — | — |
| **byChannel/Province/Salesperson/…** | `ordDim` group + share=`g.sales/total` | ออเดอร์ | — | ตัด cancelled | — | — |
| **byDesign/Color/Size/Type** | `skuDim` (Σ line_sales/qty · orders=Set(order_no).size · share=qty/tot) | SKU line | — | — | — | order_no set |
| **buildPerf (leaderboard)** | ต่อเซลล์: sales/orders/qty/AOV/leads/%ปิด/comm/pace · ตัด cancelled · [salePerfAgg.js](../../src/lib/salePerfAgg.js) | ออเดอร์×เซลล์×เดือน | order_date เดือนนั้น | ตัด cancelled | — | order_no→salesperson |

**Test:** ✅ [saleAgg.test.js](../../src/lib/__tests__/saleAgg.test.js) (13) + [salePerfAgg.test.js](../../src/lib/__tests__/salePerfAgg.test.js) (11)

---

## แหล่ง C — แกนคู่ (คนละมิติ · อย่าปนกับยอดขาย)
| เมตริก | แหล่ง | grain | หมายเหตุ |
|---|---|---|---|
| **คนทัก (leads/funnel)** | `tmk_sales_funnel` (jsonb leads {plat:{new,old}}) | เซลล์×วัน | แกนคนละอันกับยอด · %ปิด = orders÷leads (B) หรือ orders÷ลูกค้า (A) — **นิยามต่างกันตามแหล่ง** |
| **Targets/คอม** | A: `tmk_monthly_history.target/meta` · B/perf: `tmk_targets` (ต่อเซลล์) | เดือน / เซลล์×เดือน | 2 ชุดเป้าคนละ scope |
| **Receipts** | `tmk_sale_receipts` (เซลล์=คนอัปโหลด) → สร้างออเดอร์ `tmk_mp_orders` source='shipnity' | ใบ | ป้อนเข้า B |
| **CRM totals** | live-aggregate จาก `tmk_mp_orders` (customerKeyOf) | ลูกค้า | ไม่มี lifetime cache |

---

## ⚠️ กับดักที่ contract นี้ป้องกัน
1. **% ปิด นิยามต่างกัน 2 แหล่ง** — A ใช้ orders÷(ลูกค้าใหม่+เก่า) · B/perf ใช้ orders÷leads(funnel) → **อย่าเทียบข้ามแหล่ง**
2. **date basis ต่างกัน** — A = เดือนปฏิทิน(BE) จาก daily · B = `order_date` ช่วงเลือก → ยอด "เดือนนี้" 2 หน้าไม่ต้องเท่ากัน (คนละนิยาม)
3. **cancel handling ต่างกัน** — A ไม่มี (net ที่กรอก) · B ตัด `cancelled` → grain+policy ต่าง
4. **mp vs shipnity** — B รวมทั้ง 2 source; แยกด้วย `source` column · **ห้าม TRUNCATE ตารางร่วม** (ใช้ DELETE WHERE source · [[shared-orders-source-column]])
5. **SKU-filter KPI** — เมื่อกรองลาย B จะจำกัดออเดอร์เหลือที่มี SKU ผ่าน (skuFilterActive) แล้วโชว์ attrSales — ไม่งั้น KPI คิดทั้งร้าน = เข้าใจผิด

## Acceptance (SALES-1) — ✅ ครบ
- [x] metric contract ต่อ KPI (เอกสารนี้)
- [x] characterization tests ครอบสูตรทั้ง 2 แหล่ง (computeMonthPure 12 + saleAgg 13 + salePerfAgg 11)
- [x] decision source-of-truth (Q1 · doc 03) — ไม่ต้อง reconcile
- **ผล:** SALES-1 จาก CRITICAL/NEEDS-DECISION → **ปิด** (เหลือแค่ Ads repurpose ที่ต้อง requirement แยก)

## Next (ผูกกับ contract นี้)
- **KPI-1:** badge "แหล่งข้อมูล" ต่อ surface (ยอดจริง/operational vs วิเคราะห์นำเข้า) — ตอนนี้ tile มี InfoTip นิยามสูตรแล้ว เหลือ badge แยกแหล่ง (งาน UI เล็ก · เว้น saleDashboard ที่จะเป็น Ads)
