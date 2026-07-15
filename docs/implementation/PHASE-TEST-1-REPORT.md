# PHASE TEST-1 REPORT — Component/DOM test env (jsdom + RTL)

> Branch `audit-remediation` · 2026-07-15 · **ยังไม่ commit** (รอสั่ง) · additive (ไม่แตะ prod logic)

## ทำอะไร
ตั้ง **environment สำหรับ component/DOM test** (ที่เดิมไม่มี — มีแต่ pure unit) + smoke test พิสูจน์ว่าเรนเดอร์ component จริงได้ → เปิดทางเขียน E2E/critical-path test ต่อ

## เปลี่ยนอะไร
| ไฟล์ | เปลี่ยน |
|---|---|
| `package.json` (devDeps) | +`jsdom` +`@testing-library/react` +`@testing-library/jest-dom` (3 ตัว · เฉพาะ test env) |
| `vitest.config.js` | include `.test.jsx` เพิ่ม · resolve.alias `@`→`./src` (ให้ตรง vite.config · resolve `@/components/ui/*`) · คง `environment: 'node'` เป็น default (pure tests เร็วเท่าเดิม) |
| `src/__tests__/components-dom.test.jsx` (ใหม่) | smoke: `SourceBadge`(KPI-1) 2 เคส + `InfoTip` tooltip toggle/empty · หัวไฟล์ `// @vitest-environment jsdom` (jsdom เฉพาะไฟล์นี้) + `@testing-library/jest-dom/vitest` |

## เทคนิค/gotcha
- **jsdom เฉพาะไฟล์** ผ่าน docblock `// @vitest-environment jsdom` (ไม่ใช้ global env → pure `.test.js` ยังรัน node เร็วสุด · vitest 4 เลิก `environmentMatchGlobs`)
- **alias** — vitest.config แยกจาก vite.config → ต้องประกาศ `@` เอง ไม่งั้น resolve `@/components/ui/skeleton` ไม่เจอ
- **jest-dom** — import `@testing-library/jest-dom/vitest` (ผูก expect ของ vitest) ไม่ใช่ path ปกติ (ไม่งั้น `expect is not defined`)
- เลือก component ที่ isolated (components.jsx import แค่ react/lucide/shadcn/data.js(pure)) → ไม่ลาก supabase/dataContext chain

## หลักฐาน
- `npm test` → **12 files · 129 passed** (125 → +4 · pure 125 ไม่พัง)
- component test → 4/4 (render SourceBadge/InfoTip · fireEvent click tooltip · assert DOM)
- `npm run build` → ✓ 1.20s (deps เป็น devDeps · ไม่กระทบ bundle prod)

## Acceptance
- ✅ มี component/DOM test env ที่รันได้ (jsdom + RTL)
- ✅ smoke test พิสูจน์ render + interaction (click) + assertion
- ✅ pure tests เดิมไม่ช้าลง/ไม่พัง (แยก env ต่อไฟล์)

## Rollback
ลบ 3 devDeps + คืน vitest.config เดิม + ลบ test file (additive ล้วน)

## Next (ต่อยอดได้)
- component test หน้า/ฟอร์มจริง (OrderDrawer/ReviewRow/FunnelCard role) — ต้อง mock supabase/userContext
- smoke E2E critical path (อัปโหลดใบเสร็จ→บันทึก→ออเดอร์ · role visibility) — พิจารณา Playwright ถ้าต้อง browser จริง
