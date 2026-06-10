-- ============================================================
-- Atomic order fulfillment (เฟส 1: อุดช่องโหว่ข้อมูล)
-- ตัดสต็อกหลายสินค้า + อัปเดตสถานะออเดอร์ ใน transaction เดียว (all-or-nothing)
-- JS คำนวณ lots/stock_on_hand/reservations/actual_units ใหม่ต่อสินค้าแล้วส่ง batch (p_updates) มา
-- ถ้าสินค้าตัวใดตัวหนึ่งล้มเหลว → rollback ทั้งหมด (ไม่มีสต็อกตัดครึ่งๆ)
-- รันใน Supabase SQL Editor ครั้งเดียว (idempotent — create or replace)
-- ============================================================
create or replace function public.tmk_fulfill_order(
  p_order_id   text,
  p_status     text,
  p_status_log jsonb,
  p_updates    jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare item jsonb;
begin
  for item in select value from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) loop
    update public.tmk_products
      set lots          = item->'lots',
          stock_on_hand = coalesce((item->>'stock_on_hand')::numeric, 0),
          reservations  = item->'reservations',
          actual_units  = coalesce((item->>'actual_units')::numeric, 0),
          updated_at    = now()
    where id = item->>'id';
  end loop;

  update public.tmk_orders
    set status = p_status, status_log = p_status_log, updated_at = now()
  where id = p_order_id;
end;
$$;

grant execute on function public.tmk_fulfill_order(text, text, jsonb, jsonb) to anon, authenticated;
