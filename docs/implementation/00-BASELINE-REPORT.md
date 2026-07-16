# 00 — BASELINE REPORT

> จัดทำ: 2026-07-15 · Branch: `audit-remediation` (แยกจาก `main` @ `a73aa6d`)
> วิธีการ: ตรวจ Repository จริง + cross-check เอกสาร audit/technical/planning ทั้ง 110 ไฟล์ (เอเจนต์ 4 ตัว)
> **ยังไม่แตะ production logic/DB** — รายงานอย่างเดียวตามคำสั่ง

## 1. Environment

| รายการ | ค่า |
|---|---|
| Package | `tmk-plan` `4.0.0` |
| Node | v24.14.0 · npm 11.9.0 |
| engines | (ไม่กำหนดใน package.json) |
| Stack | React 19 · Vite · Supabase-js · Tailwind · Radix/shadcn · Recharts · XLSX · pdf.js |
| Scripts | `dev` `build` `lint`(eslint .) `preview` `test`(vitest run) `test:watch` |
| Lockfile | `package-lock.json` (มี · 206 KB) |
| Type check | ไม่มี (โปรเจกต์ JS/JSX ล้วน · ไม่มี tsc script) |

**หมายเหตุ node_modules:** มิได้ `rm -rf node_modules && npm ci` เพราะ (1) เป็น repo จริงบนเครื่อง darwin ไม่ใช่ ZIP ข้ามแพลตฟอร์ม (2) มี Vite dev server รันอยู่ (localhost:5173) — การลบจะทำ preview ล่ม (3) build/test เขียวอยู่แล้ว → baseline เชื่อถือได้. แนะนำทำ clean `npm ci` ใน CI แยกต่างหาก (ทำให้ได้ถ้าสั่ง).

## 2. Baseline results (คำสั่งที่รันจริง)

```
npm run build   → ✓ built in 1.35s (no error)
npm test        → Test Files 6 passed · Tests 55 passed
npx eslint .    → 311 problems (278 errors, 33 warnings)
node scripts/test-receipts.mjs → 36 ใบ · พังจริง 0 · ยอดไม่ตรง 0 · ฟิลด์ไม่ตรง 0
```

**Bundle (top 5, gzipped chunks บน disk):** vendor-charts 432K · pdf 416K · xlsx 416K · index 324K · views-catalog 256K (recharts/pdf.js/xlsx เป็น vendor หนักตามคาด · lazy-split แล้ว)

### Lint 278 errors แยกตาม rule
| จำนวน | rule | ประเภท |
|---|---|---|
| 97 | `no-unused-vars` | dead vars/imports (cleanup) |
| 78 | `react-refresh/only-export-components` | HMR advisory (ไม่กระทบ runtime) |
| 32 | `react-hooks/exhaustive-deps` | advisory |
| 27 | `react-hooks/set-state-in-effect` | advisory (React Compiler ปิด) |
| 23 | `react-hooks/static-components` | advisory |
| 13+ | purity/refs/memo/immutability | advisory |
| 5 | regex/whitespace/escape | เล็กน้อย |
| **1** | **`no-undef`** | **`tailwind.config.js:97` ใช้ `require` (config CommonJS — ไม่ใช่บั๊ก runtime)** |

**สรุป lint:** ไม่มี `no-undef` ในโค้ดแอปจริง (ตัวเดียวคือ config CommonJS) → ไม่มีบั๊ก correctness จาก lint. 278 errors ส่วนใหญ่เป็น dead-code + advisory style ที่ไม่กระทบการทำงาน (ควรทยอยเก็บใน Phase หลัง).

## 3. Migration inventory (67 ไฟล์)

- **Non-timestamped / bundle (ต้องระวัง rerun):** `20260629-pending-bundle.sql` · `20260706-stock-crm-all.sql` · `BUNDLE-flows-comments-notifications.sql` · `MP-SALES-SYSTEM-ALL.sql` — ตรวจแล้ว **idempotent** (ใช้ `if not exists` / `on conflict do nothing`)
- **Future/Unverified (ลงวันหลัง snapshot · deploy-state ไม่ยืนยัน):** `20260730-task-extend` · `20260731-task-comments` · `20260801-task-comment-extend` · `20260802-notifications` · `20260805-notifications-plus` · `20260808-task-brands` · `20260830-notif-rebuild` · **`20260831-drop-stock-crm` (DESTRUCTIVE — `drop table cascade` กู้ไม่ได้)**
- **Deploy-state:** ยืนยันไม่ได้จาก repo — ต้องดู `schema_migrations` / `pg_policies` / `pg_publication_tables` บน production จริง (ไม่มี access ในขั้นนี้)

## 4. ความขัดแย้ง เอกสาร vs โค้ดจริง (สำคัญ)

1. **เอกสาร ~70% เป็น template ซ้ำ (boilerplate)** — จาก 110 ไฟล์ มีเนื้อหาจริงเพียง ~12 ไฟล์ (67, 72, 39, 23, 25, 40, 41, 55, 58, 60, 77, 84, 12, 13, 103-105, master). ไฟล์ชื่อ RLS-REGISTER / FEATURE-REALITY-MATRIX / NAVIGATION / CRM-PLAN / UX-PLAN ฯลฯ **เป็นแม่แบบเปล่า ไม่มี finding เฉพาะ**
2. **Metrics ในเอกสาร stale/เกินจริง** — เอกสารอ้าง 126 src files / 31,786 บรรทัด / **247 test files**; จริง = **86 src files / ~28,029 บรรทัด / 6 test files** (247 น่าจะนับ node_modules)
3. **หลาย finding แก้ไปแล้ว** (เอกสารทำจาก snapshot เก่า): realtime targeted-invalidation ✓ · `.env` gitignored ✓ · ไม่มี service-role key ใน FE ✓ · RPC fulfill idempotent ✓ · empty/loading/error states ✓ · estimate labels ✓ · CSV formula-escaping ✓ · god-file split บางส่วน (index/views-2 แยกแล้ว)

## 5. ของจริงที่ยังค้าง (นำเข้า Backlog — ดู `01-IMPLEMENTATION-BACKLOG.md`)

- 🔴 **SEC-1** SECURITY DEFINER 5 ฟังก์ชันขาด `search_path` (`20260713-sale-rpc.sql`, `20260714-delete-cleanup.sql`)
- 🟠 **RT-1** `tmk_audit_logs` subscribe แต่ไม่อยู่ใน realtime publication
- 🟠 **SEC-2** XLSX export ไม่ยืนยันว่า escape formula-injection (CSV แก้แล้ว)
- 🟡 **ENV-1** ไม่มี startup validation ของ env vars ที่จำเป็น
- 🟡 **KPI-1** dashboard ขาด label แหล่งข้อมูล + tooltip นิยาม KPI ต่อ tile
- 🟠 **TEST-1** ไม่มี component/integration/E2E test (มีแค่ 6 unit pure-fn)
- 🟠 **ARCH-1 / REFACTOR-1** `dataContext` singleton mutation + god files (Phase 6, behavior-preserving)
- 🔴 **SALES-1 (strategic)** dual source-of-truth ยอดขาย — ต้องมี metric contract ก่อนแตะสูตร
- 🔴 **RLS-1 / MIG-1 (strategic)** ตรวจ RLS ต่อ role + deploy-state migration — ต้องใช้ production access

## 6. ต้องการ Business Decision (ห้ามตัดสินเอง)

1. **Sales source-of-truth / metric contract:** หน้าไหน = financial truth, หน้าไหน = operational estimate; กติกา reconciliation (บล็อกการแก้สูตรยอดขายทุกกรณี)
2. **Production access / schema dump** สำหรับตรวจ RLS + migration deploy-state (ผมตรวจจาก repo อย่างเดียวไม่ได้)
3. **`.env` ที่มากับ ZIP ถูกแชร์ออกภายนอกหรือไม่** → ถ้าใช่ ต้อง rotate Supabase keys
4. **Workflow/branch:** ผมสร้าง `audit-remediation` แล้ว (ตามคำสั่งห้ามทำบน production branch) — เดิมโปรเจกต์ commit ลง `main` ตรง; ยืนยันให้ทำงาน remediation บน branch นี้
