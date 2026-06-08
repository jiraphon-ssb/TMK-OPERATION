-- ============================================================
-- TMK Operation — Readable VIEWS (ดูข้อมูลง่ายๆ ใน Supabase)
-- ============================================================
-- รัน 1 ครั้งใน Supabase SQL Editor (idempotent — create or replace)
-- View เป็นแบบอ่านอย่างเดียว (read-only) ไม่กระทบการทำงานของแอป
-- เปิดดูได้ที่ Supabase → Table Editor (เลือกที่ schema/รายการ Views) หรือ SQL Editor
--   เป้าช่องทาง/งบแอด ที่เดิมอยู่ใน meta(jsonb) จะถูกแตกเป็นคอลัมน์
-- ============================================================

-- 1) สรุปรายเดือน + เป้าต่อช่องทาง + งบแอด (แตกจาก meta jsonb)
create or replace view public.v_monthly_overview as
select
  m.year,
  m.month,
  m.month_th,
  m.target                                            as total_target,    -- เป้ารวมทั้งเดือน
  m.actual                                            as actual,           -- ยอดจริง (เดือนปิดแล้ว)
  m.orders                                            as orders,
  m.ad_spend                                          as ad_spend,
  m.new_cust                                          as new_cust,
  m.messages                                          as messages,
  -- เป้าต่อช่องทาง (channelTargets)
  (m.meta->'channelTargets'->>'shopee')::numeric      as target_shopee,
  (m.meta->'channelTargets'->>'tiktok')::numeric      as target_tiktok,
  (m.meta->'channelTargets'->>'lazada')::numeric      as target_lazada,
  (m.meta->'channelTargets'->>'facebook')::numeric    as target_facebook,
  (m.meta->'channelTargets'->>'line')::numeric        as target_line,
  (m.meta->'channelTargets'->>'crm')::numeric         as target_crm,
  -- งบโฆษณาต่อช่องทาง (adChannels)
  (m.meta->>'adBudget')::numeric                      as ad_budget_total,
  (m.meta->'adChannels'->>'shopee')::numeric          as adbudget_shopee,
  (m.meta->'adChannels'->>'facebook')::numeric        as adbudget_facebook,
  (m.meta->'adChannels'->>'tiktok')::numeric          as adbudget_tiktok,
  (m.meta->'adChannels'->>'lazada')::numeric          as adbudget_lazada,
  -- อื่นๆ
  (m.meta->>'acosCeil')::numeric                      as acos_ceil,
  (m.meta->>'newCustTarget')::numeric                 as new_cust_target
from public.tmk_monthly_history m
order by m.year, m.month;

-- 2) ยอดขายรายวัน แยกตามช่องทาง (1 แถว = 1 วัน × 1 ช่องทาง) — กรองง่าย
create or replace view public.v_daily_by_channel as
select
  d.date,
  d.day_name,
  ch.key                          as channel,
  (ch.value->>'rev')::numeric     as revenue,
  (ch.value->>'ord')::int         as orders,
  (ch.value->>'ad')::numeric      as ad_spend,
  (ch.value->>'inq')::int         as inquiries,
  (ch.value->>'newC')::int        as new_cust,
  (ch.value->>'oldC')::int        as old_cust
from public.tmk_daily_sales d
cross join lateral jsonb_each(coalesce(d.channels, '{}'::jsonb)) ch
order by d.date, ch.key;

-- 3) ยอดขายรายวัน รวมทุกช่องทาง (1 แถว = 1 วัน) — ภาพรวมรายวัน
create or replace view public.v_daily_totals as
select
  d.date,
  d.day_name,
  coalesce(sum((ch.value->>'rev')::numeric), 0) as total_revenue,
  coalesce(sum((ch.value->>'ord')::int), 0)     as total_orders,
  coalesce(sum((ch.value->>'newC')::int), 0)    as new_cust,
  coalesce(sum((ch.value->>'oldC')::int), 0)    as old_cust,
  d.ad_spend,
  d.avg_reply_minutes,
  d.note
from public.tmk_daily_sales d
left join lateral jsonb_each(coalesce(d.channels, '{}'::jsonb)) ch on true
group by d.date, d.day_name, d.ad_spend, d.avg_reply_minutes, d.note
order by d.date;

-- ให้สิทธิ์อ่าน view (สอดคล้องกับ RLS แบบ permissive ของระบบ)
grant select on public.v_monthly_overview, public.v_daily_by_channel, public.v_daily_totals to anon, authenticated;
