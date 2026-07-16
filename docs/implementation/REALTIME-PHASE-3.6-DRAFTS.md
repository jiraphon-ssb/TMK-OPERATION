# REALTIME Phase 3.6 — Draft migrations (B) · ต้องรัน/ผูก consumer เอง

สถานะ: **draft** · Claude แตะ prod ไม่ได้ → พี่รัน migration เอง + verify. เรียงตาม "พร้อมรัน" → "ต้อง consumer ก่อน".

---

## B1 · Idempotency keys — ✅ พร้อมรัน (standalone · ZERO-RISK)
ไฟล์: `supabase/migrations/20260717-idempotency-keys.sql`

- เพิ่ม `idempotency_key text` (nullable) + **partial unique index** (`where idempotency_key is not null`) บน `tmk_mp_orders` + `tmk_sale_receipts`
- แถวเดิมทั้งหมด key = NULL → ไม่ชน · insert เดิมที่ไม่ส่ง key ทำงานปกติ = graceful
- **FE wire (ทำหลังรัน · ยังไม่บังคับ):** submit path (`receiptSubmit.js` batch · `ManualSaleSheet`) สร้าง `crypto.randomUUID()` 1 ค่าต่อการกดบันทึก → เก็บใน state → `insert(...).onConflict('idempotency_key')` · รีทรัย/เน็ตหลุดกดซ้ำ = ใช้ key เดิม = แถวเดิม (ไม่เกิดยอดเบิ้ล)
- ทำไม migration แยกจาก FE: ต้องมีคอลัมน์ก่อน FE ถึงเขียน key ได้ · FE graceful (ตรวจ error 42703 แล้ว insert ไม่มี key) ได้ถ้าอยากปล่อยก่อน

---

## B2 · CRM summary tables — ⏸ design (ผูกกับ C — ลด browser aggregate)
**เหตุผล defer:** ตอนนี้ CRM คำนวณสด client-side จากออเดอร์ทั้งก้อน (saleCrm.jsx live-aggregate). summary table มีค่า**ต่อเมื่อ**เปลี่ยน FE ให้อ่านจาก table แทนดึงออเดอร์ทั้งหมด → เขียน table เปล่าที่ไม่มีใครอ่าน = dead migration.

**SQL sketch (ยังไม่รัน · ต้องรีวิว aggregate shape ก่อน):**
```sql
-- ตารางสรุปต่อลูกค้า (1 แถว/customer_code) — refresh ผ่าน trigger บน tmk_mp_orders
create table if not exists public.tmk_crm_summary (
  customer_code   text primary key,
  order_count     int  not null default 0,
  total_sales     numeric not null default 0,
  first_order_at  timestamptz,
  last_order_at   timestamptz,
  updated_at      timestamptz not null default now()
);
-- ทางเลือก refresh: (a) trigger AFTER INSERT/UPDATE/DELETE บน tmk_mp_orders upsert สรุป
--                  (b) materialized view + refresh ตามเวลา (egress ต่ำกว่าแต่ค่าหน่วง)
-- ⚠️ ต้องตัดสิน: นับเฉพาะ status='active'? · dedupe มาร์เก็ตเพลส? · masked customer_code?
```
**ต้องทำคู่:** เปลี่ยน `buildCrm` ให้ query `tmk_crm_summary` (fallback คำนวณสดถ้า table ว่าง) — งาน FE จริง ต้อง test.

---

## B3 · Scoped Broadcast + private-channel RLS — ⏸ design (ผูกกับ C — scoped channels)
**เหตุผล defer:** private channel + `realtime.messages` RLS มีค่า**ต่อเมื่อ** dataContext เลิก 1 global channel `*` แล้วแยกเป็น scoped topic (งานของ C). ใส่ RLS ก่อนมี scoped channel = ไม่มีอะไรใช้ + เสี่ยงบล็อก realtime เดิม.

**SQL sketch (ยังไม่รัน · ต้อง Supabase Realtime Authorization enabled ก่อน):**
```sql
-- อนุญาต authenticated อ่าน broadcast บน topic ที่ตั้งชื่อ scoped (เช่น 'orders:2026-07')
create policy "auth read scoped broadcast" on realtime.messages
  for select to authenticated using ( true );  -- ⚠️ ควรแคบกว่านี้: ผูก topic ↔ สิทธิ์ผู้ใช้จริง
create policy "auth send scoped broadcast" on realtime.messages
  for insert to authenticated with check ( true );
-- ต้องออกแบบ: naming convention topic (orders:{month} · flow:{id}) + map ↔ locked_sections/role
```
**ต้องทำคู่:** C (scoped channel registry ใน dataContext) + เปลี่ยน publish จาก postgres_changes `*` → broadcast ต่อ topic. งานสถาปัตย์ · ต้อง 2 users พิสูจน์.

---

### สรุป
- **รันได้เลย:** B1 (idempotency) — ปลอดภัย standalone
- **รอ C + รีวิว:** B2/B3 — SQL sketch พร้อม แต่ห้ามรันจนมี consumer (กัน dead/รั่ว)
