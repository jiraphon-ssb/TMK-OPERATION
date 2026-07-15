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

---

## REFACTOR-1.2 — split sub-view views-settings → views-settings-tabs.jsx (PART 79-style)

### ทำอะไร
แยก **sub-view แท็บทั้งหมด** ออกจาก god-file `views-settings.jsx` → ไฟล์ใหม่ `views-settings-tabs.jsx` · เหลือ `views-settings.jsx` เป็น orchestrator (SettingsView/SettingsBody) ที่ import sub-view กลับ · behavior-preserving file-split

### เปลี่ยนอะไร
| ไฟล์ | เปลี่ยน |
|---|---|
| `src/views-settings-tabs.jsx` (ใหม่ · ~2300) | ย้าย CampaignsView/TargetsView/GeneralSettings/BrandsView/ChannelsView/DutiesView/RolesView/TrashView + helper (NotifToggle/exportAllCSV/exportMonthlyReportCSV/TRASH_TABLES) · export 8 sub-view |
| `src/views-settings.jsx` | **2379→111 บรรทัด** · เหลือ SettingsView/SettingsBody + import sub-view จากไฟล์ใหม่ · prune unused imports |

### เทคนิค (safety net)
- **eslint no-undef=0** หลัง split = การันตี *ทุก reference resolve* (import ครบ) แบบ static — จับ import ขาดก่อน runtime
- prune unused imports 62→0 ทั้ง 2 ไฟล์ (import block ซ้ำ · แต่ละไฟล์ใช้ subset) ด้วยสคริปต์ตาม eslint
- **GOTCHA:** HMR console โชว์ `csvEsc is not defined` (module timestamped เก่า `?t=...`) = stale buffer ([[part74-75-perf-refine]]) — build ผ่าน + ทุก tab render จริง = ไม่ใช่บั๊ก

### หลักฐาน
- `npm run build` → ✓ · `npm test` → 137 passed (ไม่กระทบ)
- eslint (2 ไฟล์) → no-undef 0 · unused 0
- **Preview สด (admin):** ทั้ง 4 tab ใหญ่ที่ย้าย render สมบูรณ์ — ทั่วไป(GeneralSettings+Export CSV) · ช่องทาง(6 ช่อง) · สิทธิ์ผู้ใช้(13 ผู้ใช้+roles) · ถังขยะ(52 · restore/delete) · no-undef การันตี tab ที่เหลือ (Brands/Campaigns/Duties/Targets/WhatsNew)

## Next (REFACTOR-1 ต่อ)
- goldenGrid.js 1626 (data · แยกง่าย) · views-1.jsx 1458 (SalesView) · App.jsx
