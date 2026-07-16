# PHASE 8 REPORT — Test Coverage (TEST-1)

> Branch `audit-remediation` · 2026-07-15 · **ยังไม่ commit** (รอสั่ง) · additive ล้วน (ไม่แตะ logic เดิม)

## ทำอะไร
เพิ่ม characterization/unit tests สำหรับ pure business-logic ที่ยังไม่มี test (money + วันที่ = ความเสี่ยงสูงถ้าแตะ) — ล็อกพฤติกรรมปัจจุบันก่อน refactor Phase 6

## Test เพิ่ม (55 → **102** · 6 → **9 ไฟล์**)
| ไฟล์ | ครอบ | เคสสำคัญ |
|---|---|---|
| `src/lib/__tests__/targets.test.js` | `commissionFor` (💰 คอมมิชชั่น), `targetsByPerson`, `targetId` | flat rate · tiers เลือก tier สูงสุดที่ถึง min · ต่ำกว่า min→0 · ข้าม rate=null |
| `src/lib/__tests__/saleTime.test.js` | `presetRange`, `bucketKey`, `enumerateBuckets`, `autoGran`, `diffDays`, `addDays`, `inRange`, `quarterOf`, `weekStart` | preset 7 แบบ + clamp dataMin + race no-today · granularity thresholds · bucket ต่อเนื่อง |
| `src/lib/__tests__/mpReportPure.test.js` | `qtyBand`, `deriveColorSize`, `isDftNote` | ขอบ band (1/3/10/50/51) · แยกสี-ไซซ์จากวงเล็บ+suffix รหัส · DFT word-boundary |

## หลักฐาน
- `npm test` → **Test Files 9 passed · Tests 102 passed** (เดิม 55) · ไม่มี fail
- `npm run build` → ✓ 1.16s · parser 36/0/0 · ไม่แตะ production logic (เพิ่มไฟล์ test เท่านั้น)

## Acceptance
- ✅ สูตรคอมมิชชั่น (money) มี test ครอบ tier/flat/edge
- ✅ logic วันที่/ช่วง (ใช้ทั่วรายงาน) มี test
- ✅ tests เดิม 55 ไม่พัง

## ยังไม่ครอบ (งานต่อ)
- **computeMonth** (operational truth) — ต้อง extract pure core จาก TMK singleton ก่อน (Phase 6 refactor + test คู่กัน)
- **component/integration/E2E** (form/table/permission/mobile) — ต้องเพิ่ม test env (jsdom/RTL) — Phase ถัดไปถ้าต้องการ

## Rollback
ลบ 3 ไฟล์ test ใหม่ (ไม่กระทบอะไร — additive)

## Next
- รอพี่รัน Q2 SQL (RLS/MIG) · หรือเลือก phase ถัดไป (god-file refactor Phase 6 = ตอนนี้มี test เป็นฐานแล้ว / component test env / ads repurpose)
