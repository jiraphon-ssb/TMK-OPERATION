# PHASE REFACTOR-1 REPORT — extract pure CSV logic → lib/csv.js

> Branch `audit-remediation` · 2026-07-15 · **ยังไม่ commit** (รอสั่ง) · behavior-preserving (คัดลอกโค้ดเป๊ะ)

## ทำอะไร
แยก **logic บริสุทธิ์ (สร้าง CSV string)** ออกจาก 2 ที่ที่วางผิด → lib pure ที่เทสต์ได้ · ลด god-file `views-settings.jsx`
- `_csvEsc` (formula-injection escaper · **security**) เดิมอยู่ใน `saleWidgets.jsx` (JSX)
- `exportAllCSV` / `exportMonthlyReportCSV` (สร้าง CSV รายงาน) เดิมฝัง logic ปนกับ download ใน god-file

## เปลี่ยนอะไร
| ไฟล์ | เปลี่ยน |
|---|---|
| `src/lib/csv.js` (ใหม่ · 77 บรรทัด) | `csvEsc` (ย้ายมา) + `buildAllCsv(data)` + `buildMonthlyReportCsv({...})` — pure ล้วน คืน string |
| `src/saleWidgets.jsx` | `_csvEsc` → import `csvEsc` จาก lib + re-export (back-compat · consumer เดิมไม่พัง) |
| `src/views-settings.jsx` | `exportAllCSV`/`exportMonthlyReportCSV` เรียก builder จาก lib สำหรับ CSV string · **คง side-effect** (Blob/download/logAudit/toast) ที่ view · **2432→2379 บรรทัด (−53)** |
| `src/lib/__tests__/csv.test.js` (ใหม่) | 8 characterization tests: csvEsc(formula-injection/เลขลบ) + buildAllCsv(8 section·พ.ศ.→ค.ศ.·inq derive) + buildMonthlyReportCsv(ROAS·filter เดือน) |

**หลักการ:** logic บริสุทธิ์ (string) แยกออกมา · side-effect (I/O) คงที่ view — ตาม pattern เดียวกับ buildPerf/computeMonthPure

## หมายเหตุ characterization
- test จับความต่างจริง 2 builder: `buildAllCsv` esc **ทุกคอลัมน์** (quoted หมด) · `buildMonthlyReportCsv` esc **เฉพาะชื่อช่อง** (ตัวเลขดิบ) — ล็อกพฤติกรรมเดิมไว้เป๊ะ
- ครอบ **security behavior**: `=+@`/tab/CR นำหน้า → เติม `'` กัน Excel รันสูตร · แต่เลขลบคงเป็นตัวเลข (SUM ได้)

## หลักฐาน
- `npm test` → **12 files · 137 passed** (129 → +8)
- `npm run build` → ✓ 1.13s
- `eslint` (3 ไฟล์) → no-undef 0 · no-unused-vars 0
- ไม่แตะ prod logic (คัดลอกเป๊ะ · side-effect เดิม) · export CSV เป็น admin-only + download → ยืนยันด้วย unit test (pure)

## Acceptance (REFACTOR-1 increment)
- ✅ extract behavior-preserving + characterization test
- ✅ commit เล็ก · ไม่รวม feature
- ✅ ลด god-file (views-settings −53) + ย้าย pure logic ออกจาก JSX (saleWidgets)

## Rollback
คืน `_csvEsc` + 2 export functions เดิมใน saleWidgets/views-settings · ลบ lib/csv.js + test (git revert commit เดียว)

## Next (REFACTOR-1 ต่อ — งานใหญ่แยก session)
- views-settings ยัง 2379 — sub-view ใหญ่ (RolesView 517 · ChannelsView 414 · DutiesView 286 · BrandsView 284) split เป็นไฟล์ต่อโดเมน (PART 79-style file-split · ต้อง verify แต่ละ tab render)
- goldenGrid.js 1626 · views-1.jsx 1458 (SalesView · computeMonth แยกแล้ว) · App.jsx (ลด LINT-1 แล้ว)
