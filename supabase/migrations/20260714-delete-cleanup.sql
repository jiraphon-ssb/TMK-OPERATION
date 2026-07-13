-- ============================================================
-- PART 72 — เสถียรภาพข้อมูล: ลบ orphan sku_overrides ตอนลบออเดอร์ + คอลัมน์ override เพิ่ม (กัน reimport ย้อนค่า)
-- ------------------------------------------------------------
-- idempotent · grant anon,authenticated · ไม่แตะ RLS (ปิดทั้งแอปตามดีไซน์)
-- graceful: ถ้ายังไม่รัน → client fallback ลบ sku_overrides ได้ · override ช่องใหม่ retry ตัดคอลัมน์ (ไม่พัง)
-- ============================================================

-- 1B — ทับ tmk_delete_orders ให้ลบ tmk_sku_overrides ด้วย (กัน override ลายบรรทัดค้างเป็น orphan → เด้งกลับมาทับตอน order_no ถูกใช้ซ้ำ)
create or replace function public.tmk_delete_orders(
  p_order_nos text[],
  p_source text default '',
  p_override_ids text[] default '{}'
) returns void
language plpgsql
security definer
as $$
begin
  delete from public.tmk_mp_skus where order_no = any(p_order_nos) and (coalesce(p_source,'') = '' or source = p_source);
  delete from public.tmk_mp_orders where order_no = any(p_order_nos) and (coalesce(p_source,'') = '' or source = p_source);
  -- override ลายบรรทัด (keyed by order_no) — ลบเสมอ กัน orphan
  delete from public.tmk_sku_overrides where order_no = any(p_order_nos);
  if array_length(p_override_ids, 1) is not null then
    delete from public.tmk_order_overrides where order_id = any(p_override_ids);
  end if;
  -- ลบใบเสร็จเฉพาะกลุ่ม shipnity (หรือไม่ระบุ source) — กันลบใบเสร็จข้าม source ที่ order_no ชนกันบังเอิญ
  if coalesce(p_source, '') = '' or p_source = 'shipnity' then
    delete from public.tmk_sale_receipts where order_no = any(p_order_nos);
  end if;
end;
$$;

grant execute on function public.tmk_delete_orders(text[], text, text[]) to anon, authenticated;

-- 1C — คอลัมน์ override เพิ่ม: mirror ทุกช่องที่แก้ในหน้าออเดอร์ (กัน reimport มาร์เก็ตเพลสย้อนค่า channel/ยอด/จำนวน/จังหวัด/วันที่/การชำระ)
alter table public.tmk_order_overrides add column if not exists channel text;
alter table public.tmk_order_overrides add column if not exists payment_type text;
alter table public.tmk_order_overrides add column if not exists sales numeric;
alter table public.tmk_order_overrides add column if not exists qty integer;
alter table public.tmk_order_overrides add column if not exists province text;
alter table public.tmk_order_overrides add column if not exists order_date text;
alter table public.tmk_order_overrides add column if not exists cod_amount numeric;
