# PHASE LINT-1 REPORT — Dead-code Cleanup (no-unused-vars)

> Branch `audit-remediation` · 2026-07-15 · **ยังไม่ commit** (รอสั่ง) · dead-code ล้วน (ไม่แตะพฤติกรรม)

## ทำอะไร
กวาด `no-unused-vars` ทั้ง `src/` (baseline **97** จุด / 16 ไฟล์) — ลบ import ที่ไม่ใช้ + ฟังก์ชัน/ค่าคงที่ที่ตายแล้ว (เศษจาก refactor เก่า) + prop/ตัวแปรใน component ที่ไม่ถูกอ่าน · ทุกจุด verify ว่า initializer ไม่มี side-effect ก่อนลบ

## ผลลัพธ์
| | ก่อน | หลัง |
|---|---|---|
| no-unused-vars (ทั้ง src) | 97 | **26** (เหลือเฉพาะ 2 ไฟล์ที่ตั้งใจข้าม) |
| no-undef | 0 | **0** |

**ลบจริง 71 จุด · 15 ไฟล์** — เด่น:
- **dead functions ก้อนใหญ่:** `AuditView` (views-settings · **208 บรรทัด**) · `RailAvatar`/`ProfileMenu` (App) · `FunnelCard`/`GoalCard`/`DailyPanel` (salePerf) — เศษจากการ redesign เก่า ไม่เคย render
- **cascade cleanup:** ลบ dead function แล้วเผย helper/const/import ที่เคยรองรับมันเท่านั้น → ลบต่อ (`nextTierOf`/`PACE_META`/`TH_DAY`/`Gauge` ใน salePerf · `ACTION_META`/`actionMeta`/`ACTION_GROUP`/`ENTITY_TH`/`SearchInput`/`DatePicker`/`N` ใน settings · `UserIcon`/`isMac` ใน App · `LOG_META`/`LOG_FILTERS`/`SEV_COLOR` ใน views-1)
- **unused imports** ~35 จุด (shadcn/lucide/react hooks ที่เลิกใช้)
- **props/locals ไม่ถูกอ่าน:** ตัด prop ออกจาก destructure (`onEdit`/`pct`/`month`×3) · `const [, setX]` แทน `[x, setX]` ที่ค่าไม่ถูกอ่าน · `catch {}` แทน `catch (e)` ที่ไม่ใช้ e

## ตั้งใจข้าม (26 จุด · documented)
- **`saleDashboard.jsx` (18):** หน้านี้กำลังจะ repurpose เป็น **Ads** (Q1 decision) — ไม่ทำ dead-code บนของที่จะ rewrite (หลัก "ไม่แตะของที่จะเปลี่ยน scope")
- **`modals-import.jsx` (8):** helper import เก่า (`cleanCell`/`tokenize`/`parseNum`/`detectHeader`/`IMPORT_FIELDS`/`IMPORT_STATUS`/`csvCell`/`downloadTextFile`) สลับบรรทัดกับ `smartDecodeCSV` ที่ยังใช้ + มี cascade (NULL_TOKENS/THAI_DIGITS) → เสี่ยง · คุณค่าต่ำ · defer

## ไม่แตะ (advisory เชิงสถาปัตยกรรม — ไม่ใช่ dead code)
`react-refresh/only-export-components` (78) · `react-hooks/*` (exhaustive-deps/set-state-in-effect/…) — "แก้" ต้องขยับโครงสร้าง/เปลี่ยนพฤติกรรม hooks = เสี่ยง regress ผิดหลัก behavior-preserving · ไม่อยู่ใน scope dead-code

## หลักฐาน
- `npm run build` → ✓ 1.26s
- `npm test` → **125 passed** (ไม่กระทบ — ลบ dead code)
- `node scripts/test-receipts.mjs` → **36 ใบ · พัง 0 · ยอดไม่ตรง 0**
- `eslint src` → **no-undef 0** · no-unused-vars 97→26 (คงเหลือ = defer ตามข้างบน)
- **Preview สด** (localhost:5173): หน้าหลัก / รายงานขาย / ประสิทธิภาพเซลล์ / ส่งยอด&ข้อมูล — เรนเดอร์ครบ · **0 console error** ทุกหน้า

## ไฟล์ที่แตะ (15)
App.jsx · views-1.jsx · views-settings.jsx · salePerf.jsx · views-orders.jsx · views-planner.jsx · views-flows.jsx · views-health.jsx · views-sale-submit.jsx · saleCatalog.jsx · LoginScreen.jsx · WhatsNew.jsx · components.jsx · components/DataTableParts.jsx · lib/saleTime.js

## Rollback
`git revert` commit เดียว (dead-code ล้วน — ไม่มี dependency)

## Next
- (ถ้าต้องการ) modals-import 8 จุด + saleDashboard 18 จุด ทำตอน Ads repurpose
- react-hooks advisory = งานแยก (ต้องการ characterization test ต่อ component ก่อนแตะ)
