# PHASE 6 REPORT — God-file Refactor (REFACTOR-1)

> Branch `audit-remediation` · 2026-07-15 · **ยังไม่ commit** (รอสั่ง) · behavior-preserving (ไม่แตะ business logic)

## ทำอะไร
แยกฟังก์ชัน aggregation แบบ pure `buildPerf` (leaderboard "ประสิทธิภาพเซลล์") ออกจาก god-file `src/salePerf.jsx` → ไฟล์ lib ใหม่ `src/lib/salePerfAgg.js` ที่เทสต์ได้ — ตามหลัก "extract pure core + characterization test ล็อกพฤติกรรมก่อน" (ต่อจาก Phase 8 ที่วาง test net ไว้)

**ทำไม salePerf ไม่ใช่ saleDashboard:** saleDashboard กำลังจะถูก repurpose เป็นหน้า Ads (Q1 decision) — ไม่ควร refactor ของที่จะเปลี่ยน scope · salePerf เป็น operational truth ที่นิ่งแล้ว + buildPerf เป็น pure function ที่แยกง่าย

## เปลี่ยนอะไร
| ไฟล์ | เปลี่ยน |
|---|---|
| `src/lib/salePerfAgg.js` (ใหม่) | ย้าย `buildPerf` + pure helpers (`NO_SELLER`/`curMonth`/`daysInMonth`/`dayOf`/`isCancelled`/`spOf`/`deltaPct`) — คัดลอกเป๊ะ · import `funnelTotal/funnelBreakdown/funnelNewOld` (saleData) + `commissionFor` (targets) |
| `src/salePerf.jsx` | ลบ def ทั้ง 8 ตัว (buildPerf + 7 helper) · import กลับจาก salePerfAgg.js · ตัด `funnelBreakdown` ที่ไม่ได้ใช้แล้วออกจาก import saleData (เหลือใช้แค่ใน buildPerf ที่ย้ายไป) |
| `src/lib/__tests__/salePerfAgg.test.js` (ใหม่) | 11 characterization tests: helper edge + buildPerf (aggregate/ตัด cancelled/target·comm·pace/funnel·closeRate·channelClose/design join·funnel-only seller/receipt void·dSales/empty) |

**ไม่แตะ:** logic การคำนวณทุกบรรทัด (คัดลอกเหมือนเดิม 100%) · component render · helper ที่เป็น UI/format (fmtB/monthLabel/monthOptions/prevMonthOf/TH_MON/MEDAL/closeTone/dPill คงใน salePerf)

## หลักฐาน
- `npm test` → **10 files · 113 tests passed** (เดิม 102 → +11) · ไม่มี fail
- `npm run build` → ✓ 1.23s · index bundle 329.70 kB (ไม่โต — logic ย้ายไม่ใช่เพิ่ม)
- `eslint salePerf.jsx + salePerfAgg.js` → **no-undef = 0** (ไม่มี reference ค้างถึง const ที่ลบ) · เหลือแต่ no-unused-vars เดิม (LINT-1 backlog แยกต่างหาก)
- **Preview สด** (localhost:5173 seed): หน้าประสิทธิภาพเซลล์เรนเดอร์เหมือนเดิมเป๊ะ
  - Team: ยอดรวม ฿9,893 · 15 ออเดอร์ · AOV ฿660 (9,743+150=9,893 · 14+1=15 ✓)
  - การ์ดเซลล์เรียงตามยอด + เหรียญ + share% + sparkline (TUKTA 98% · FAH 2%)
  - Drill-down TUKTA: donut ช่องทาง Facebook 100% · ลายขายดี (design join) · รายวัน · funnel — ครบ
  - 0 console error

## Acceptance
- ✅ pure function แยกออกมาเทสต์ได้ (คู่กับ Phase 8 test net)
- ✅ พฤติกรรมเดิมถูกล็อกด้วย characterization test ก่อน+หลังย้าย (11 เคส)
- ✅ tests เดิม 102 ไม่พัง · build เขียว · preview identical
- ✅ ไม่รวม refactor กับ feature change (constraint: 1 issue = 1 commit)

## Rollback
1. ลบ `src/lib/salePerfAgg.js` + `src/lib/__tests__/salePerfAgg.test.js`
2. คืน 8 def + import `funnelBreakdown` ใน `src/salePerf.jsx` (git revert commit เดียว)

---

## Phase 6.2 — extract computeMonth (operational truth ตัวจริง)

### ทำอะไร
แยก `computeMonth` (ยอดขายจริงรายเดือน = financial truth ที่ Q1 กำหนด) ออกจาก `src/dataContext.jsx` → `src/lib/computeMonthPure.js` — เดิมอ่าน TMK singleton + `getToday()` ตรง ๆ → เปลี่ยนเป็น pure `computeMonthPure(monthIdx0, yearBE, ctx)` ที่ inject `ctx = { dailyAll, monthly, channels, clv, today }` เข้ามา · `dataContext.computeMonth` เหลือเป็น thin wrapper ส่ง `TMK.* + getToday()`

### เปลี่ยนอะไร
| ไฟล์ | เปลี่ยน |
|---|---|
| `src/lib/computeMonthPure.js` (ใหม่) | ย้าย body ทั้งหมด (คัดลอกเป๊ะ) · แทน `TMK.dailyAll/monthly/channels/computed.CLV`→ctx · `getToday()`→`today` param · import `THAI_MONTHS` (dateUtils) · copy `round2` |
| `src/dataContext.jsx` | `computeMonth` → wrapper 6 บรรทัด · import `computeMonthPure` · ลบ `const _ABBR` (ย้ายไป lib แล้ว unused) |
| `src/lib/__tests__/computeMonthPure.test.js` (ใหม่) | 12 tests: อดีต(รวม daily)/monthly-fallback + entryMode/ปัจจุบัน(pace·run)/อนาคต(DAY=0)/ว่าง/CLV pass-through |

**หมายเหตุ characterization:** test แรกจับ assertion ผมเขียนผิด (OLD_C คิดเป็น 1 แต่จริง = 2 จาก shopee+fb) → พิสูจน์ว่า test ล็อกพฤติกรรม*จริง*ของโค้ด ไม่ใช่สมมติฐานผม

### หลักฐาน
- `npm test` → **11 files · 125 tests passed** (113 → +12) · ไม่มี fail
- `npm run build` → ✓ 1.16s
- `eslint dataContext.jsx + computeMonthPure.js` → **no-undef = 0** · เหลือ 6 advisory เดิม (react-refresh + React Compiler memo/refs — ทั้งโค้ดเบสมี ไม่เกี่ยว refactor)
- **Preview สด** หน้ายอดขาย (SalesView = consumer หลักของ computeMonth): เรนเดอร์เหมือนเดิม — MTD ฿411,989.25 (15/31) · Run rate ฿851,444.45 · 865 ออเดอร์ · AOV ฿476.29 · gauge 74% pace · แผนภูมิรายวัน stacked+projection · ตารางเป้า/ผลงาน/ROAS ต่อแพลตฟอร์ม · **0 console error**

### Rollback
คืน body computeMonth เดิม + `const _ABBR` · ลบ `computeMonthPure.js` + test (git revert commit เดียว)

## Next
- computeMonth มี pure core + test แล้ว → ถ้าจะแก้สูตรยอดขายในอนาคต มี guard (ตาม constraint "ห้ามเปลี่ยนสูตรยอดขายโดยไม่มี unit test")
- LINT-1 dead-code cleanup (commit แยก) · รอพี่รัน Q2 SQL (RLS/MIG) · ads repurpose (ต้อง requirement)
