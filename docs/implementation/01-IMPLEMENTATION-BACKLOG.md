# 01 — IMPLEMENTATION BACKLOG

> จาก audit 110 ไฟล์ + cross-check โค้ดจริง (2026-07-15). สถานะ: `STILL-VALID` = ยังค้าง · `NEEDS-DECISION` = รอ business/access · `VERIFY-ONLY` = แก้แล้ว ยืนยันบน prod
> **ยังไม่เริ่มแก้** — รอ approve Phase 1

---

## 🔴 CRITICAL

### SEC-1 · SECURITY DEFINER functions ขาด `set search_path`
- **Severity:** Critical (security) · **สถานะ:** STILL-VALID
- **หลักฐาน:** `supabase/migrations/20260713-sale-rpc.sql` (`tmk_delete_orders`, `tmk_void_receipts`, `tmk_restore_receipts`, `tmk_crm_directory`) และ `20260714-delete-cleanup.sql` (`tmk_delete_orders`) ประกาศ `security definer` **ไม่มี** `set search_path`. ฟังก์ชัน definer อื่น (`20260610/20260611/20260615`) ตั้ง search_path ถูก → 2 ไฟล์นี้เป็นข้อยกเว้น
- **Impact:** Security = search-path hijack บน RPC สิทธิ์สูง (ลบ/void/restore ออเดอร์/ใบเสร็จ) · Data = ถ้าถูก exploit อาจเรียกฟังก์ชันปลอม · Business = ท่อลบ/คืนออเดอร์
- **แนวทางแก้:** สร้าง migration ใหม่ `CREATE OR REPLACE FUNCTION … SET search_path = public` ทั้ง 5 ฟังก์ชัน (ไม่แก้ไฟล์เดิม · idempotent)
- **Acceptance:** ทุก definer function มี `proconfig` ที่มี search_path (verify SQL ด้านล่าง)
- **Test/Verify SQL:** `select proname, proconfig from pg_proc where prosecdef and proname like 'tmk_%';` → ทุกแถวมี `search_path=public`
- **Migration:** ใช่ (create-or-replace) · **Rollback:** create-or-replace กลับเป็นนิยามเดิม (เก็บ diff)
- **Dependency:** ต้องรู้ signature เดิมเป๊ะ (อ่านจาก 2 ไฟล์) · **Complexity:** ต่ำ (mechanical) · **DB run:** ผู้ใช้รันบน prod เอง

### SALES-1 · Dual Source-of-Truth ยอดขาย (Operational vs Imported)
- **Severity:** Critical · **สถานะ:** NEEDS-DECISION (strategic)
- **หลักฐาน:** operational (`src/lib/saleAgg.js` + `src/data.js`/`views-1.jsx` monthly calc จาก `tmk_daily_sales`/`tmk_sales`/targets) vs imported analytics (`src/saleDashboard.jsx` + `saleAgg.js` จาก `tmk_mp_orders`/`tmk_sale_receipts`/`tmk_sales_funnel`). สอง path คำนวณอิสระ
- **Impact:** Business = ตัวเลขยอดขายอาจต่างกันโดยไม่มี reconciliation
- **แนวทางแก้ (บล็อกจนกว่าจะตัดสินใจ):** กำหนด **metric contract** ต่อ KPI (grain, วันที่, กรอง cancel/return, gross/net/paid, กันซ้ำ) + หน้าไหน = financial truth vs operational estimate + reconciliation report — **ห้ามรวม 2 แหล่งจนกว่าจะกำหนด (กฎภารกิจ)**
- **Acceptance:** มีเอกสาร metric contract + characterization tests ครอบสูตรเดิมก่อนแตะ · **Migration:** ไม่ · **Complexity:** สูง (Phase 2)

---

## 🟠 HIGH

### RT-1 · `tmk_audit_logs` subscribe แต่ไม่อยู่ใน realtime publication
- **Severity:** High · **สถานะ:** STILL-VALID
- **หลักฐาน:** `src/views-log.jsx:222` subscribe INSERT บน `tmk_audit_logs` แต่ไม่มี migration ไหน `alter publication supabase_realtime add table tmk_audit_logs` (grep = ว่าง) — ต่างจาก `tmk_task_comments`/`tmk_notifications` ที่ publish แล้ว
- **Impact:** หน้า "บันทึกกิจกรรม" ไม่ได้รับ event สด (เงียบ · degrade)
- **แนวทางแก้:** migration ใหม่ idempotent `if not exists (…pg_publication_tables…) then alter publication supabase_realtime add table tmk_audit_logs`
- **Verify SQL:** `select * from pg_publication_tables where pubname='supabase_realtime' and tablename='tmk_audit_logs';` → 1 แถว
- **Migration:** ใช่ · **Rollback:** `alter publication … drop table tmk_audit_logs` · **Complexity:** ต่ำ

### SEC-2 · XLSX export escape formula-injection → ❌ NOT-APPLICABLE
- **Severity:** — · **สถานะ:** NOT-APPLICABLE (ปิด · Phase 1 ตรวจแล้ว)
- **ผลตรวจ:** แอป **ไม่มี XLSX export/write เลย** (`grep XLSX.writeFile|json_to_sheet|aoa_to_sheet|book_append_sheet` = ว่าง) — `XLSX` ใช้เฉพาะ **อ่าน/import** (`modals-import.jsx:114` `XLSX.read`). export ทั้งหมดเป็น CSV ซึ่ง escape แล้ว (`saleWidgets.jsx:263` `_csvEsc`). ไม่มีช่องโหว่ → ไม่ต้องแก้

### RLS-1 · ตรวจ RLS ต่อ role จริง (ไม่ใช่แค่ซ่อน UI)
- **Severity:** High (security) · **สถานะ:** NEEDS-DECISION (ต้อง prod access)
- **หลักฐาน:** สิทธิ์ฝั่ง client = `window.__canEdit`/`__isAdmin` + `lockedSections` (UI gate). เอกสาร `43-RLS-POLICY-REGISTER` เป็น boilerplate ไม่ระบุ policy จริง → ยืนยันจาก repo ไม่ได้ว่าแต่ละตาราง `tmk_*` เปิด RLS + policy ต่อ role ครบ
- **แนวทางแก้:** ต้องมี `pg_policies` dump จาก prod + ทดสอบ API ต่อ role · **Migration:** อาจต้องเพิ่ม policy ถ้าพบช่อง · **Complexity:** สูง (Phase 1 verification)

### MIG-1 · Migration deploy-state + destructive drop
- **Severity:** High · **สถานะ:** NEEDS-DECISION (ต้อง prod access)
- **หลักฐาน:** 8 ไฟล์ future/unverified รวม `20260831-drop-stock-crm.sql` (`drop table cascade` กู้ไม่ได้ · แต่ FE ไม่อ้าง `tmk_purchase_orders`/stock-crm แล้ว = สอดคล้อง)
- **แนวทางแก้:** เทียบ `schema_migrations` prod + backup ก่อนตัดสินใจ deploy drop · **ห้ามรัน migration ในขั้นนี้** · **Complexity:** กลาง (verification)

### TEST-1 · ไม่มี component/integration/E2E test
- **Severity:** High · **สถานะ:** STILL-VALID
- **หลักฐาน:** มี 6 unit test (pure fn) ใน `src/lib/__tests__/` เท่านั้น (55 cases) · ไม่มี Playwright/Cypress/component test
- **แนวทางแก้:** เพิ่มทีละชั้น — (a) characterization tests สูตรยอดขาย (Phase 2) (b) smoke E2E critical path: อัปโหลดใบเสร็จ→บันทึก→ออเดอร์ · role visibility · **Complexity:** สูง (ทยอย)

### ARCH-1 · `dataContext` singleton `TMK` mutation
- **Severity:** High · **สถานะ:** STILL-VALID
- **หลักฐาน:** `src/dataContext.jsx:710` `mutateTMK` แก้ module-level `TMK` (`src/data.js`) in-place + version bump; views `import { TMK }` ตรง (facade บางส่วน · pattern เดิมยังอยู่)
- **แนวทางแก้:** ค่อยๆ ลด coupling → selectors (Phase 6 · behavior-preserving + tests ก่อน · **ห้ามรวมกับ feature change**) · **Complexity:** สูง

### REFACTOR-1 · God files
- **Severity:** High (tech debt) · **สถานะ:** STILL-VALID (partial)
- **หลักฐาน (wc -l ปัจจุบัน):** `views-settings.jsx` 2666 · `goldenGrid.js` 1626 · `views-1.jsx` 1458 · `saleDashboard.jsx` 1383 · `App.jsx` 1281 · `views-flows.jsx` 1164 · `salePerf.jsx` 964 · `dataContext.jsx` 953 · `views-planner.jsx` 943 · `views-orders.jsx` 864
- **แนวทางแก้:** extract behavior-preserving + characterization tests · commit เล็ก · **ห้ามรวม feature** (Phase 6) · **Complexity:** สูง

---

## 🟡 MEDIUM / LOW

### ENV-1 · ไม่มี startup validation ของ env vars
- **Severity:** Medium · **สถานะ:** STILL-VALID
- **หลักฐาน:** `src/lib/supabaseClient.js` อ่าน `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` โดยไม่ throw ถ้าขาด
- **แนวทางแก้:** guard + error ที่อ่านง่ายเมื่อ env ขาด · **Migration:** ไม่ · **Complexity:** ต่ำ

### KPI-1 · Dashboard ขาด label แหล่งข้อมูล + tooltip นิยาม KPI
- **Severity:** Medium · **สถานะ:** STILL-VALID (partial)
- **หลักฐาน:** `saleDashboard.jsx`/`salePerf.jsx`/`views-1.jsx` KPI tile ไม่มี data-source label/นิยาม (มี estimate label แล้ว)
- **แนวทางแก้:** เพิ่ม tooltip นิยาม + badge แหล่งข้อมูลต่อ tile (ผูกกับ SALES-1 metric contract) · **Complexity:** กลาง

### LINT-1 · เก็บ dead-code + lint (278 errors)
- **Severity:** Low-Medium · **สถานะ:** STILL-VALID
- **หลักฐาน:** 97 `no-unused-vars` (dead) + 78 react-refresh + hooks advisories · ไม่มี no-undef จริง
- **แนวทางแก้:** ทยอยลบ unused + จูน hooks (ไม่กระทบ behavior) · **Complexity:** ต่ำ-กลาง (Phase หลัง)

---

## ✅ VERIFY-ONLY (เอกสารว่าเป็นปัญหา แต่โค้ดแก้แล้ว — ยืนยันบน prod พอ)
realtime targeted-invalidation (dataContext) · `.env` gitignored · ไม่มี service-role key ใน FE · RPC fulfill idempotent (`20260615`) · bundle migrations idempotent · empty/loading/error states · estimate/projection labels · CSV formula-escaping · realtime idempotent-by-refetch

## ❌ ไม่มีของให้ทำ (เอกสารเป็น template เปล่า)
FEATURE-REALITY-MATRIX / NAVIGATION-MAP / CRM-PLAN / ORDER-PLAN / UX-PLAN / MOBILE-PLAN / RLS-REGISTER ฯลฯ = boilerplate ไม่มี finding เฉพาะ → ไม่มีรายการ CRM/order/UX/mobile ที่ดึงได้จากเอกสาร (ต้อง requirement จริงจากพี่ถ้าจะทำ)
