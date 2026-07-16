# 01 — IMPLEMENTATION BACKLOG

> จาก audit 110 ไฟล์ + cross-check โค้ดจริง (2026-07-15). สถานะ: `STILL-VALID` = ยังค้าง · `NEEDS-DECISION` = รอ business/access · `VERIFY-ONLY` = แก้แล้ว ยืนยันบน prod
> **ยังไม่เริ่มแก้** — รอ approve Phase 1

---

## 🔴 CRITICAL

### SEC-1 · SECURITY DEFINER functions ขาด `set search_path`
- **Severity:** Critical (security) · **สถานะ:** ✅ **DONE + VERIFIED บน prod** (Q2 C1: definer funcs ทุกตัวมี `search_path` ครบ · `tmk_admin_set_password` ตรวจแล้ว = ปลอดภัย: revoke anon + admin-check ในฟังก์ชัน)
- **หลักฐาน:** `supabase/migrations/20260713-sale-rpc.sql` (`tmk_delete_orders`, `tmk_void_receipts`, `tmk_restore_receipts`, `tmk_crm_directory`) และ `20260714-delete-cleanup.sql` (`tmk_delete_orders`) ประกาศ `security definer` **ไม่มี** `set search_path`. ฟังก์ชัน definer อื่น (`20260610/20260611/20260615`) ตั้ง search_path ถูก → 2 ไฟล์นี้เป็นข้อยกเว้น
- **Impact:** Security = search-path hijack บน RPC สิทธิ์สูง (ลบ/void/restore ออเดอร์/ใบเสร็จ) · Data = ถ้าถูก exploit อาจเรียกฟังก์ชันปลอม · Business = ท่อลบ/คืนออเดอร์
- **แนวทางแก้:** สร้าง migration ใหม่ `CREATE OR REPLACE FUNCTION … SET search_path = public` ทั้ง 5 ฟังก์ชัน (ไม่แก้ไฟล์เดิม · idempotent)
- **Acceptance:** ทุก definer function มี `proconfig` ที่มี search_path (verify SQL ด้านล่าง)
- **Test/Verify SQL:** `select proname, proconfig from pg_proc where prosecdef and proname like 'tmk_%';` → ทุกแถวมี `search_path=public`
- **Migration:** ใช่ (create-or-replace) · **Rollback:** create-or-replace กลับเป็นนิยามเดิม (เก็บ diff)
- **Dependency:** ต้องรู้ signature เดิมเป๊ะ (อ่านจาก 2 ไฟล์) · **Complexity:** ต่ำ (mechanical) · **DB run:** ผู้ใช้รันบน prod เอง

### SALES-1 · Dual Source-of-Truth ยอดขาย (Operational vs Imported)
- **Severity:** Critical · **สถานะ:** ✅ **CLOSED** (Q1 decided + metric contract `04-SALES-METRIC-CONTRACT.md` + characterization tests ครบ 2 แหล่ง · เหลือ Ads repurpose ที่ต้อง requirement แยก)
- **หลักฐาน:** operational (`src/lib/saleAgg.js` + `src/data.js`/`views-1.jsx` monthly calc จาก `tmk_daily_sales`/`tmk_sales`/targets) vs imported analytics (`src/saleDashboard.jsx` + `saleAgg.js` จาก `tmk_mp_orders`/`tmk_sale_receipts`/`tmk_sales_funnel`). สอง path คำนวณอิสระ
- **Impact:** Business = ตัวเลขยอดขายอาจต่างกันโดยไม่มี reconciliation
- **แนวทางแก้ (บล็อกจนกว่าจะตัดสินใจ):** กำหนด **metric contract** ต่อ KPI (grain, วันที่, กรอง cancel/return, gross/net/paid, กันซ้ำ) + หน้าไหน = financial truth vs operational estimate + reconciliation report — **ห้ามรวม 2 แหล่งจนกว่าจะกำหนด (กฎภารกิจ)**
- **Acceptance:** มีเอกสาร metric contract + characterization tests ครอบสูตรเดิมก่อนแตะ · **Migration:** ไม่ · **Complexity:** สูง (Phase 2)

---

## 🟠 HIGH

### RT-1 · `tmk_audit_logs` subscribe แต่ไม่อยู่ใน realtime publication
- **Severity:** High · **สถานะ:** ✅ **DONE + VERIFIED บน prod** (Q2 D: publication มี `tmk_audit_logs` จริง)
- **หลักฐาน:** `src/views-log.jsx:222` subscribe INSERT บน `tmk_audit_logs` แต่ไม่มี migration ไหน `alter publication supabase_realtime add table tmk_audit_logs` (grep = ว่าง) — ต่างจาก `tmk_task_comments`/`tmk_notifications` ที่ publish แล้ว
- **Impact:** หน้า "บันทึกกิจกรรม" ไม่ได้รับ event สด (เงียบ · degrade)
- **แนวทางแก้:** migration ใหม่ idempotent `if not exists (…pg_publication_tables…) then alter publication supabase_realtime add table tmk_audit_logs`
- **Verify SQL:** `select * from pg_publication_tables where pubname='supabase_realtime' and tablename='tmk_audit_logs';` → 1 แถว
- **Migration:** ใช่ · **Rollback:** `alter publication … drop table tmk_audit_logs` · **Complexity:** ต่ำ

### SEC-2 · Import/export file safety (escape + malformed-file)
- **Severity:** Low · **สถานะ:** ✅ **DONE** (export N/A + import validation เพิ่มแล้ว)
- **ครึ่ง export (NOT-APPLICABLE):** แอป **ไม่มี XLSX export/write เลย** — `XLSX` ใช้เฉพาะอ่าน/import (`modals-import.jsx` `XLSX.read`). export เป็น CSV ที่ escape formula-injection แล้ว (`lib/csv.js:12` `csvEsc` · มี test `csv.test.js`)
- **ครึ่ง import (DONE · SEC-2b · จาก audit gap `39-SECURITY-REVIEW.md:16/26`):** `mpFileToGrid` เพิ่ม guard — size cap 25MB + try/catch `XLSX.read` (กันไฟล์เสีย/ปลอม crash ทั้งการนำเข้า) + เช็คไม่มีชีต

### SEC-3 · หมุน credential (anon key) — `.env` แจกใน ZIP docs
- **Severity:** High (security) · **สถานะ:** ⚠️ **ACTION-REQUIRED (ops · ผู้ใช้ทำเอง)** — จาก audit gap `docs/technical/39-SECURITY-REVIEW.md:24`
- **หลักฐาน:** เอกสารเตือนว่า `.env` เคยรวมอยู่ใน ZIP documentation snapshot → ถ้ามีความเสี่ยงรั่ว ควร **rotate anon key + ตรวจว่าไม่มี service-role key หลุด** (หมายเหตุ: ZIP ที่ส่งมารอบนี้ไม่มีไฟล์ `.env` จริง — scope การรั่วยังไม่ยืนยัน แต่คำแนะนำยังคงอยู่)
- **แนวทาง:** ผู้ใช้หมุน anon key ใน Supabase dashboard + อัปเดต `.env`/deploy env (Claude แตะ credential ไม่ได้) · anon key ออกแบบให้เปิดเผยฝั่ง client ได้อยู่แล้ว (RLS เป็นด่านจริง) → ถ้า RLS แน่น ความเสี่ยงต่ำ แต่หมุนเพื่อความปลอดภัยได้
- **Migration:** ไม่ · **Complexity:** ต่ำ (ops)

### RLS-1 · ตรวจ RLS ต่อ role จริง (ไม่ใช่แค่ซ่อน UI)
- **Severity:** 🔴 **Critical (ยืนยันแล้ว)** · **สถานะ:** ✅ **CLOSED — Tier 1 + Tier 2 DEPLOYED บน prod** (2026-07-16 · verify Tier 1 3/3 + Tier 2 4/4 · เทสจริง: anon อ่าน/เขียนถูกบล็อก 401 · RPC track/share ทำงาน · login เห็นข้อมูลครบ)
- **ผลตรวจ prod (Q2 section A):** `rls_enabled = false` **ทุกตาราง tmk_*** → สิทธิ์ทั้งหมดเป็น client-side ล้วน · anon key (สาธารณะใน bundle) อ่าน/เขียนทุกตารางผ่าน REST ได้ตรง = ข้อมูลลูกค้า/ยอดขายเปิดโล่งระดับ DB
- **Tier 1 (✅ รันแล้ว · verify ผ่าน 3/3):** `20260716-enable-rls-tier1.sql` — เปิด RLS ทุกตาราง (RLS ปิด=0 · policy authenticated 50 ตาราง · RPC สาธารณะ 2 ตัว) + views `security_invoker` + `tmk_public_track`/`tmk_public_flow_bundle` แทน anon อ่านตรง · FE (dataContext session-gated + track/share RPC-fallback) deploy บน main แล้ว
- **Tier 2 (ร่างแล้ว · ปิด privilege-escalation):** `20260716-rls-tier2-permission-tables.sql` — user ที่ล็อกอิน (role ไหนก็ได้) เคย UPDATE `tmk_user_roles` ตรงเพื่อยกตัวเป็น admin ได้ → เพิ่ม `tmk_is_admin()` (SECURITY DEFINER กัน recursion) + policy บน `tmk_user_roles`/`tmk_staff`: **อ่าน=authenticated · เขียน=admin เท่านั้น** · **FE ไม่ต้องแก้** (write ทุกจุดอยู่ใน views-settings-tabs ที่ guardAdmin() คุมอยู่แล้ว = defense in depth) · รันได้เลย (ไม่ต้อง deploy FE ก่อน)
- **Tier 3 (ภายหลัง · optional):** policy ต่อ role ครบทุกตาราง (editor/viewer เขียนเฉพาะขอบเขตตัวเอง) — ต้อง test matrix ต่อตาราง×role

### MIG-1 · Migration deploy-state + destructive drop
- **Severity:** High · **สถานะ:** ✅ **CLOSED + VERIFIED** (Q2 E2: ตาราง stock-crm ทั้งหมด **ไม่มีแล้ว** = `20260831-drop-stock-crm.sql` deploy ไปแล้ว · ไม่มี migration destructive ค้าง · Q2 G: schema-tolerant columns ครบ)

### TEST-1 · ไม่มี component/integration/E2E test
- **Severity:** High · **สถานะ:** PARTIAL (unit/characterization 6→11 ไฟล์ · 55→125 · ครอบ money+วันที่+ยอดขาย 2 แหล่ง · Phase 8+6 · เหลือ component/E2E env)
- **หลักฐาน:** มี 6 unit test (pure fn) ใน `src/lib/__tests__/` เท่านั้น (55 cases) · ไม่มี Playwright/Cypress/component test
- **แนวทางแก้:** เพิ่มทีละชั้น — (a) characterization tests สูตรยอดขาย (Phase 2) (b) smoke E2E critical path: อัปโหลดใบเสร็จ→บันทึก→ออเดอร์ · role visibility · **Complexity:** สูง (ทยอย)

### ARCH-1 · `dataContext` singleton `TMK` mutation
- **Severity:** High · **สถานะ:** PARTIAL (computeMonth แยก pure core `computeMonthPure.js` inject ctx แทนอ่าน TMK ตรง · Phase 6.2 · mutateTMK ยังอยู่)
- **หลักฐาน:** `src/dataContext.jsx:710` `mutateTMK` แก้ module-level `TMK` (`src/data.js`) in-place + version bump; views `import { TMK }` ตรง (facade บางส่วน · pattern เดิมยังอยู่)
- **แนวทางแก้:** ค่อยๆ ลด coupling → selectors (Phase 6 · behavior-preserving + tests ก่อน · **ห้ามรวมกับ feature change**) · **Complexity:** สูง

### REFACTOR-1 · God files
- **Severity:** High (tech debt) · **สถานะ:** PARTIAL (extract `salePerfAgg.js`(buildPerf)+`computeMonthPure.js` · ลบ dead ~450 บรรทัด(LINT-1) · Phase 6+LINT-1 · god-file ใหญ่ยังเหลือ)
- **หลักฐาน (wc -l อัปเดต 2026-07-15):** ~~views-settings 2666~~→**~88** (+`views-settings-tabs.jsx`) · ~~views-1 1458~~→**432** (+`views-sales.jsx`) · ~~views-flows 1164~~→**938** (+`views-mytasks.jsx`) · `goldenGrid.js` 1626 (=data · N/A) · `App.jsx` 1281 · `saleDashboard.jsx` 1383 (→ads) · `salePerf.jsx` (buildPerf→`salePerfAgg.js`) · `dataContext.jsx` (computeMonth→`computeMonthPure.js`) · `views-planner.jsx` 941 · `views-orders.jsx` 864
- **⚠️ caveat (จาก audit):** `views-settings-tabs.jsx` = **ย้ายเนื้อ ไม่ได้ decompose ตามความรับผิดชอบ** (ยังใหญ่) — orchestrator แยกแล้ว แต่ decompose tab ต่อเป็นงานถัดไป
- **แนวทางแก้:** extract behavior-preserving + characterization tests · commit เล็ก · **ห้ามรวม feature** (Phase 6) · **Complexity:** สูง

---

## 🟡 MEDIUM / LOW

### ENV-1 · ไม่มี startup validation ของ env vars
- **Severity:** Medium · **สถานะ:** ✅ **DONE** (guard+console.error ใน `supabaseClient.js` · Phase 1)
- **หลักฐาน:** `src/lib/supabaseClient.js` อ่าน `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` โดยไม่ throw ถ้าขาด
- **แนวทางแก้:** guard + error ที่อ่านง่ายเมื่อ env ขาด · **Migration:** ไม่ · **Complexity:** ต่ำ

### KPI-1 · Dashboard ขาด label แหล่งข้อมูล + tooltip นิยาม KPI
- **Severity:** Medium · **สถานะ:** STILL-VALID (partial)
- **หลักฐาน:** `saleDashboard.jsx`/`salePerf.jsx`/`views-1.jsx` KPI tile ไม่มี data-source label/นิยาม (มี estimate label แล้ว)
- **แนวทางแก้:** เพิ่ม tooltip นิยาม + badge แหล่งข้อมูลต่อ tile (ผูกกับ SALES-1 metric contract) · **Complexity:** กลาง

### LINT-1 · เก็บ dead-code + lint (278 errors)
- **Severity:** Low-Medium · **สถานะ:** ✅ **DONE** (no-unused-vars 97→26 · ลบ dead 71 จุด/15 ไฟล์ · `PHASE-LINT-1-REPORT.md` · เหลือ 26 = defer saleDashboard/modals-import; react-hooks advisory = งานแยก)
- **หลักฐาน:** 97 `no-unused-vars` (dead) + 78 react-refresh + hooks advisories · ไม่มี no-undef จริง
- **แนวทางแก้:** ทยอยลบ unused + จูน hooks (ไม่กระทบ behavior) · **Complexity:** ต่ำ-กลาง (Phase หลัง)

---

## ✅ VERIFY-ONLY (เอกสารว่าเป็นปัญหา แต่โค้ดแก้แล้ว — ยืนยันบน prod พอ)
realtime targeted-invalidation (dataContext) · `.env` gitignored · ไม่มี service-role key ใน FE · RPC fulfill idempotent (`20260615`) · bundle migrations idempotent · empty/loading/error states · estimate/projection labels · CSV formula-escaping · realtime idempotent-by-refetch

## ❌ ไม่มีของให้ทำ (เอกสารเป็น template เปล่า)
FEATURE-REALITY-MATRIX / NAVIGATION-MAP / CRM-PLAN / ORDER-PLAN / UX-PLAN / MOBILE-PLAN / RLS-REGISTER ฯลฯ = boilerplate ไม่มี finding เฉพาะ → ไม่มีรายการ CRM/order/UX/mobile ที่ดึงได้จากเอกสาร (ต้อง requirement จริงจากพี่ถ้าจะทำ)
