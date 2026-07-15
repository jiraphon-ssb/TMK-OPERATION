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

---

## TEST-1.2 — extract role-access → lib/roleAccess.js + test (security-critical)

### ทำอะไร
แทนที่จะ component-test ฟอร์มหนัก (FunnelCard/OrderDrawer ลาก supabase + **pdf.js** chain · mock ใหญ่/เสี่ยง) → **extract ตรรกะสิทธิ์ตาม role เป็น pure helper** ที่เทสต์ได้ตรง ๆ (แนะนำเอง · ปลอดภัยกว่า) · view เรียก helper = พิสูจน์ว่า role-gate ถูก

### เปลี่ยนอะไร
| ไฟล์ | เปลี่ยน |
|---|---|
| `src/lib/roleAccess.js` (ใหม่) | `isAdmin` · `myNamesOf` · `canSeeTeam` · `orderVisibleTo` — single source ของ role security (เดิม inline ซ้ำ 2 view) |
| `src/views-orders.jsx` | `canSeeAll = isAdmin(user)` · filter `orderVisibleTo(o, user)` (แทน inline `canSeeAll || myNames.includes(...)`) |
| `src/views-sale-submit.jsx` | `canSeeTeam = isAdmin(user)` (funnel/ใบเสร็จ ทั้งทีม = admin) |
| `src/lib/__tests__/roleAccess.test.js` (ใหม่) | 8 tests: admin เห็นทุกใบ · seller/viewer เห็นเฉพาะ salesperson=ชื่อ/อีเมลตัวเอง · user null → ไม่เห็น · canSeeTeam=admin เท่านั้น |

### หลักฐาน
- `npm test` → **13 files · 145 passed** (137 → +8)
- `npm run build` → ✓ · eslint (3 ไฟล์) no-undef 0 · unused 0
- **Preview:** orders page (admin=Graphic) เห็นทุกออเดอร์หลายเซลล์ = orderVisibleTo admin-path ถูก (behavior-preserving)

### ทำไมไม่ทำ component test ฟอร์มเต็ม
FunnelCard/OrderDrawer อยู่ในโมดูลที่ import `receiptParse→pdf.js` + supabase + realtime → ต้อง vi.mock หลายชั้น (pdf.js อาจ fail ใน jsdom) = setup ใหญ่/เปราะ · การ extract role-logic เป็น pure + test ให้ security guarantee เดียวกันด้วยความเสี่ยงต่ำกว่า

## Next (ต่อยอดได้)
- component test ฟอร์มจริง (ถ้าต้อง) — ตั้ง vi.mock supabaseClient + pdf.js stub ก่อน
- smoke E2E critical path (อัปโหลดใบเสร็จ→บันทึก→ออเดอร์) — Playwright ถ้าต้อง browser จริง
