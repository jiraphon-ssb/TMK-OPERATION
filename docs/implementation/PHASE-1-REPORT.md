# PHASE 1 REPORT — Critical Production Safety

> Branch: `audit-remediation` · 2026-07-15 · **ยังไม่ commit** (รอสั่ง) · **ยังไม่รัน migration บน production**

## สิ่งที่ตรวจ
Phase 1 list ในภารกิจ (ข้อมูลสูญหาย / RLS เปิดกว้าง / secret leak / migration ทำลายข้อมูล / duplicate import / คำนวณยอดผิด / error ระบบหลัก / soft-delete ไม่ปลอดภัย / realtime ซ้ำ-stale) — cross-check โค้ดจริง

## สิ่งที่แก้ (3 issue · code-doable ไม่ต้อง decision)

### ✅ SEC-1 — SECURITY DEFINER ขาด search_path
- **Root cause:** `tmk_delete_orders`/`tmk_void_receipts`/`tmk_restore_receipts`/`tmk_crm_directory` (จาก 20260713/20260714) `security definer` แต่ไม่ตั้ง `search_path` → search-path hijack
- **Fix:** migration ใหม่ `supabase/migrations/20260715-fix-secdef-search-path.sql` — `ALTER FUNCTION … SET search_path=public` (ไม่แตะ body/logic) · idempotent · guard if-exists
- **Verify SQL + Rollback:** อยู่ท้ายไฟล์ migration
- **สถานะ:** โค้ดพร้อม · **รอพี่รันบน Supabase (ห้ามรัน prod เอง)**

### ✅ RT-1 — tmk_audit_logs ไม่อยู่ใน realtime publication
- **Root cause:** `views-log.jsx:222` subscribe แต่ไม่มี migration เพิ่มเข้า publication → หน้า log ไม่สด
- **Fix:** migration ใหม่ `20260715-fix-audit-log-realtime.sql` — เพิ่มเข้า publication · idempotent · guard · degrade ปลอดภัย
- **สถานะ:** โค้ดพร้อม · **รอพี่รันบน Supabase**

### ✅ ENV-1 — ไม่มี startup validation ของ env
- **Fix:** `src/lib/supabaseClient.js` — `console.error` ชัดเมื่อ `VITE_SUPABASE_URL`/`ANON_KEY` ขาด (ไม่ throw · เงียบใน Node/test)
- **สถานะ:** เสร็จ (code)

### ❌ SEC-2 — XLSX export escaping → NOT-APPLICABLE
ตรวจแล้ว: แอปไม่มี XLSX export (มีแค่ import) · export ทั้งหมดเป็น CSV ที่ escape แล้ว → ไม่มีช่องโหว่

## สิ่งที่ยังไม่แก้ (รอ decision / Phase ถัดไป)
- **SALES-1** dual source-of-truth — รอ metric contract (Phase 2)
- **RLS-1 / MIG-1** — รอ production access (pg_policies + schema_migrations dump)
- **TEST-1** component/E2E — Phase 2+
- **ARCH-1 / REFACTOR-1** singleton + god files — Phase 6 (หลังมี test)
- **KPI-1 / LINT-1** — Phase หลัง

## Commits / Tests / Build
- Commits: **ยังไม่ commit** (รอสั่ง · standing rule)
- `npm run build` → ✓ 1.44s · `npm test` → 55/55 · `eslint src/lib/supabaseClient.js` → clean
- Parser 36/0/0 (ไม่แตะ)

## Migration (✅ พี่รันบน Supabase แล้ว 2026-07-15)
| ไฟล์ | ทำอะไร | idempotent | verify | rollback |
|---|---|---|---|---|
| `20260715-fix-secdef-search-path.sql` | ALTER 4 definer func +search_path | ✓ | ท้ายไฟล์ | reset search_path |
| `20260715-fix-audit-log-realtime.sql` | add tmk_audit_logs → publication | ✓ | ท้ายไฟล์ | drop table from pub |

**สถานะ deploy:** พี่รัน SQL ทั้ง 2 ไฟล์บน production Supabase แล้ว · แนะนำรัน verify SQL ท้ายไฟล์เพื่อยืนยัน proconfig/publication

**Deploy checklist:** (1) backup ไม่จำเป็น (ไม่แตะ data/schema · แค่ config+publication) (2) รันใน Supabase SQL editor (3) รัน verify SQL (4) ถ้าผิด → rollback SQL

## Known regressions / Risks
- ไม่มี regression (build/test เขียว · ENV-1 เป็น no-op เมื่อ env ครบ · migration ไม่แตะ data)
- Risk: migration ต้องรันบน prod โดยพี่ · SEC-1 ต้อง match signature (ยืนยันจาก 20260713/20260714 แล้ว)

## Rollback (ทั้ง Phase)
- Code: `git checkout main -- src/lib/supabaseClient.js` (หรือลบ 2 migration file)
- DB: rollback SQL ในแต่ละ migration

## ขั้นตอนถัดไป
1. พี่ตอบ 4 decisions (โดยเฉพาะ metric contract + prod access)
2. พี่รัน 2 migration บน Supabase → รัน verify SQL → แจ้งผล
3. อนุมัติ commit Phase 1 → เริ่ม Phase 2 (Sales lineage + characterization tests · **ไม่แตะสูตรจนมี contract**)
