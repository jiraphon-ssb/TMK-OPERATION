-- ============================================================
-- กันตัดสต็อกซ้ำตอน "ส่งออเดอร์" (idempotent fulfill)
-- ============================================================
-- ปัญหาเดิม: tmk_fulfill_order อัปเดตสต็อก/บันทึกขายก่อน แล้วค่อยเปลี่ยนสถานะออเดอร์
--   โดยไม่เช็คว่าออเดอร์ถูกส่งไปแล้วหรือยัง → ถ้ากดส่งซ้ำ / ส่งจาก 2 อุปกรณ์ /
--   realtime หน่วง อาจตัดสต็อก + บวก actual_units ซ้ำ (สต็อกหาย, ยอดเพี้ยน)
-- แก้: เปลี่ยนสถานะออเดอร์ "ก่อน" พร้อมเงื่อนไข status <> 'shipped' แล้วเช็คว่ามีแถวถูกแก้จริง
--   ถ้าไม่ (แปลว่าส่งไปแล้ว) → return ทันที ไม่แตะสต็อก/ยอดขายซ้ำ
-- รันใน Supabase SQL Editor ครั้งเดียว (create or replace — ทับฟังก์ชันเดิมได้เลย)
-- ============================================================

create or replace function public.tmk_fulfill_order(
  p_order_id   text,
  p_status     text,
  p_status_log jsonb,
  p_updates    jsonb,
  p_sales      jsonb default '[]'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare item jsonb; s jsonb; v_updated int;
begin
  update public.tmk_orders
    set status = p_status, status_log = p_status_log, updated_at = now()
  where id = p_order_id and status is distinct from 'shipped';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return; -- ออเดอร์ถูกส่ง/ตัดสต็อกไปแล้ว → ไม่ทำซ้ำ
  end if;
  for item in select value from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) loop
    update public.tmk_products
      set lots          = item->'lots',
          stock_on_hand = coalesce((item->>'stock_on_hand')::numeric, 0),
          reservations  = item->'reservations',
          actual_units  = coalesce((item->>'actual_units')::numeric, 0),
          updated_at    = now()
    where id = item->>'id';
  end loop;
  for s in select value from jsonb_array_elements(coalesce(p_sales, '[]'::jsonb)) loop
    insert into public.tmk_sales (id, sale_date, product_id, product_name, category, channel, qty, amount, cost, source, order_code, lines)
    values (s->>'id', coalesce((s->>'sale_date')::date, current_date), s->>'product_id', s->>'product_name', s->>'category', s->>'channel',
            coalesce((s->>'qty')::numeric, 0), coalesce((s->>'amount')::numeric, 0), coalesce((s->>'cost')::numeric, 0),
            coalesce(s->>'source', 'order'), s->>'order_code', coalesce(s->'lines', '[]'::jsonb))
    on conflict (id) do nothing;
  end loop;
end;
$$;

grant execute on function public.tmk_fulfill_order(text, text, jsonb, jsonb, jsonb) to anon, authenticated;
