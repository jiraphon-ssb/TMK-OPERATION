-- ============================================================================
-- 20260717-idempotency-keys.sql — REALTIME Phase 3.6 (B): idempotency keys กันบันทึกซ้ำ
-- ============================================================================
-- blueprint §: หลายคน/รีทรัยเน็ตหลุด → insert ออเดอร์/ใบเสร็จซ้ำ 2 แถว = ยอดเบิ้ล
-- แก้: เพิ่ม idempotency_key (nullable) + partial unique index (เฉพาะแถวที่มี key)
--   client สร้าง key ต่อ 1 การกดบันทึก → รีทรัยด้วย key เดิม = แถวเดิม (onConflict) ไม่เกิดซ้ำ
-- ⚠️ ADDITIVE + ZERO-RISK: แถวเดิมทั้งหมด key = NULL → partial index ไม่แตะ → insert เดิมทำงานปกติ
--   (unique เฉพาะ key not null · การกรอกที่ไม่ส่ง key ยังบันทึกได้เหมือนเดิม = graceful ก่อน wire FE)
-- ทำ 2 ตาราง: tmk_mp_orders (ออเดอร์/แมนวล) · tmk_sale_receipts (ส่งยอดใบเสร็จ)
-- FE wire (ทำแยกหลังรัน · ยังไม่บังคับ): submit path สร้าง key = uuid ต่อ batch → insert onConflict idempotency_key
-- ============================================================================

begin;

-- ── §1 เพิ่มคอลัมน์ idempotency_key (nullable · ไม่ default) ─────────────────
alter table public.tmk_mp_orders     add column if not exists idempotency_key text;
alter table public.tmk_sale_receipts add column if not exists idempotency_key text;

-- ── §2 partial unique index (เฉพาะ key not null → แถวเดิม NULL ไม่ชน) ────────
create unique index if not exists tmk_mp_orders_idem_uk
  on public.tmk_mp_orders (idempotency_key) where idempotency_key is not null;
create unique index if not exists tmk_sale_receipts_idem_uk
  on public.tmk_sale_receipts (idempotency_key) where idempotency_key is not null;

commit;

-- ── VERIFY (ทุกบรรทัดต้อง ✅) ────────────────────────────────────────────────
select 'คอลัมน์ idempotency_key (ต้อง = 2)' as check_item, count(*)::text as result,
       case when count(*) = 2 then '✅' else '❌' end as status
from information_schema.columns
where table_schema = 'public' and column_name = 'idempotency_key'
  and table_name in ('tmk_mp_orders', 'tmk_sale_receipts')
union all
select 'partial unique index (ต้อง = 2)', count(*)::text,
       case when count(*) = 2 then '✅' else '❌' end
from pg_indexes where schemaname = 'public'
  and indexname in ('tmk_mp_orders_idem_uk', 'tmk_sale_receipts_idem_uk');

-- ── ROLLBACK (ถอยได้ปลอดภัย — แค่ลบคอลัมน์/index เสริม) ───────────────────────
-- begin;
--   drop index if exists public.tmk_mp_orders_idem_uk;
--   drop index if exists public.tmk_sale_receipts_idem_uk;
--   alter table public.tmk_mp_orders     drop column if exists idempotency_key;
--   alter table public.tmk_sale_receipts drop column if exists idempotency_key;
-- commit;
