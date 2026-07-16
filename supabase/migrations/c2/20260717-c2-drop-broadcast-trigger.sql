-- ============================================================================
-- 20260717-c2-drop-broadcast-trigger.sql — ปิด broadcast trigger (เก็บ table/policy ไว้)
-- ============================================================================
-- ใช้เมื่อ: รัน c2-realtime-all.sql ไปแล้ว แต่ FE C2 ยังไม่ wired → ปิด trigger กัน
--   broadcast ยิงเปล่า (topic ที่ยังไม่มีใครฟัง = DB overhead เปล่า)
-- ปลอดภัย: ลบเฉพาะ trigger · คง tmk_domain_events / helper fns / CRM summary / RLS ไว้
--   → ตอน wire FE เสร็จ แค่ create trigger กลับ (ดูท้ายไฟล์) ไม่ต้องรัน migration ซ้ำ
-- ============================================================================

drop trigger if exists tmk_mp_orders_broadcast on public.tmk_mp_orders;

-- ── VERIFY (ต้อง ✅) ─────────────────────────────────────────────────────────
select 'broadcast trigger (ต้อง = 0 = ปิดแล้ว)' as check_item, count(*)::text as result,
       case when count(*) = 0 then '✅' else '❌' end as status
from pg_trigger where tgname = 'tmk_mp_orders_broadcast' and not tgisinternal;

-- ── เปิดกลับตอน FE C2 wired แล้ว (copy ไปรัน · ⚠️ ตรวจ signature realtime.send ก่อน) ──
-- create trigger tmk_mp_orders_broadcast
--   after insert or update or delete on public.tmk_mp_orders
--   for each row execute function public.tmk_broadcast_order_event();
