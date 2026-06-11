-- ============================================================
-- ยอดสะสมต่อลูกค้า (รวมทุกออเดอร์ฝั่ง DB) — แก้ปัญหานับต่ำกว่าจริง
-- ============================================================
-- เดิม: client ดึงออเดอร์แค่ 500 แถวล่าสุด แล้วรวม orderCount/totalSpent เอง
--       → ลูกค้าที่มีออเดอร์รวมเกิน 500 จะนับ "ยอดสะสม/จำนวนออเดอร์" ต่ำกว่าจริง
-- ใหม่: view นี้รวมจาก "ทุกออเดอร์" ใน DB (ไม่ติด limit)
--   - order_count = นับทุกออเดอร์ (รวมที่ยกเลิก) — ตรงกับ logic เดิม c.count++
--   - total_spent = ผลรวม total เฉพาะที่ไม่ยกเลิก — ตรงกับ if (status !== 'cancelled')
-- รันใน Supabase SQL Editor ครั้งเดียว (idempotent — create or replace)
-- ============================================================
create or replace view public.tmk_customer_totals as
select
  customer_id,
  count(*)::int                                                            as order_count,
  coalesce(sum(total) filter (where status is distinct from 'cancelled'), 0) as total_spent
from public.tmk_orders
where customer_id is not null
group by customer_id;

grant select on public.tmk_customer_totals to anon, authenticated;
