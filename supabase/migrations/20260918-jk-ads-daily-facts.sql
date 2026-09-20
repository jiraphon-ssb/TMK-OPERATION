-- ============================================================
-- jk_ads_daily_facts — สรุปยอดรายวันให้ระบบ ads ของ SSB (โปรเจกต์ lzvftqhffqefqupwulus)
-- ข้อตกลง 18 ก.ย. 2569:
--   · นับเฉพาะออเดอร์ช่องแชท — source='shipnity' และ channel ไม่ใช่ Shopee/Lazada/POS (isChatOrder)
--     เพราะ ROAS ที่ฝั่ง ads ต้องการคือของแอด Meta เท่านั้น (มาร์เก็ตเพลสลูกค้าสั่งเอง ไม่ได้มาจากแอด)
--   · ยอดลงตามวันที่ออเดอร์ (order_date)
--   · ตัดออเดอร์ยกเลิกออกจากยอด แต่รายงานจำนวน/มูลค่าที่ยกเลิกแยก
--   · merge tmk_order_overrides ก่อนคิดเสมอ (order_id = source || ':' || order_no) ไม่งั้นได้ค่าก่อนแก้มือ
-- ความปลอดภัย: คืนเฉพาะตัวเลขสรุปรายวัน — ห้ามมีชื่อ/เบอร์/รหัสลูกค้า/เลขออเดอร์/ชื่อเซลล์
--   (ฝั่ง ads ตรวจซ้ำอีกชั้นด้วย jkExtraColumns แล้วหยุดก่อนเขียนถ้าเจอคอลัมน์เกิน)
-- idempotent · รันใน Supabase SQL Editor ของโปรเจกต์ TMK
-- ============================================================
create or replace function public.jk_ads_daily_facts(p_from date, p_to date)
returns table (
  day date, inquiries numeric, inq_by_channel jsonb, inquiry_filled boolean,
  orders numeric, orders_new numeric, sales numeric, sales_new numeric, ord_by_channel jsonb,
  cancelled numeric, cancelled_value numeric, avg_reply_minutes numeric
)
language sql
security definer
set search_path = public
as $$
  with days as (
    select generate_series(p_from, p_to, interval '1 day')::date as d
  ),
  merged as (
    select
      coalesce(nullif(ov.order_date, '')::date, o.order_date)             as d,
      coalesce(nullif(ov.channel, ''), o.channel)                         as channel,
      coalesce(nullif(ov.customer_type, ''), o.customer_type)             as customer_type,
      coalesce(ov.sales, o.sales, 0)                                      as sales,
      coalesce(o.status, 'active')                                        as status,
      coalesce(o.source, '')                                              as source
    from public.tmk_mp_orders o
    left join public.tmk_order_overrides ov on ov.order_id = coalesce(o.source, '') || ':' || o.order_no
  ),
  chat as (
    select * from merged
    where source = 'shipnity'
      and channel is not null
      and channel not in ('Shopee', 'Lazada', 'POS')
      and d between p_from and p_to
  ),
  ord as (
    select d,
      count(*) filter (where status <> 'cancelled')                                                    as orders,
      count(*) filter (where status <> 'cancelled' and customer_type = 'ลูกค้าใหม่')                    as orders_new,
      coalesce(sum(sales) filter (where status <> 'cancelled'), 0)                                     as sales,
      coalesce(sum(sales) filter (where status <> 'cancelled' and customer_type = 'ลูกค้าใหม่'), 0)     as sales_new,
      count(*) filter (where status = 'cancelled')                                                     as cancelled,
      coalesce(sum(sales) filter (where status = 'cancelled'), 0)                                      as cancelled_value
    from chat
    group by d
  ),
  -- ออเดอร์ต่อช่องทาง: รวมทีละ (วัน, ช่องทาง) ก่อน แล้วค่อยยุบเป็น jsonb ต่อวัน (กันนับซ้ำ)
  ord_ch_rows as (
    select d, channel, count(*) as n
    from chat
    where status <> 'cancelled'
    group by d, channel
  ),
  ord_ch as (
    select d, jsonb_object_agg(channel, n) as ord_by_channel
    from ord_ch_rows
    group by d
  ),
  -- คนทัก: jsonb ใหม่ {ช่องทาง:{new,old}} หรือ {ช่องทาง:12} · ไม่มี jsonb ค่อยใช้ 4 คอลัมน์เก่า (ตรงกับ funnelBreakdown ของ FE)
  funnel_rows as (
    select f.date as d,
      case when f.leads is not null and jsonb_typeof(f.leads) = 'object' and f.leads <> '{}'::jsonb
        then (select coalesce(jsonb_object_agg(e.key,
                case when jsonb_typeof(e.value) = 'object'
                     then coalesce((e.value->>'new')::numeric, 0) + coalesce((e.value->>'old')::numeric, 0)
                     else coalesce(e.value#>>'{}', '0')::numeric end), '{}'::jsonb)
              from jsonb_each(f.leads) e)
        else jsonb_strip_nulls(jsonb_build_object(
               'Facebook', nullif(coalesce(f.leads_fb_new, 0) + coalesce(f.leads_fb_old, 0), 0),
               'LINE',     nullif(coalesce(f.leads_line_new, 0) + coalesce(f.leads_line_old, 0), 0)))
      end as by_channel
    from public.tmk_sales_funnel f
    where f.date between p_from and p_to
  ),
  -- แตกเป็น (วัน, ช่องทาง, จำนวน) รวมทุกเซลล์ แล้วค่อยยุบกลับเป็น jsonb ต่อวัน
  funnel_ch as (
    select fr.d, e.key as channel, sum((e.value#>>'{}')::numeric) as n
    from funnel_rows fr
    cross join lateral jsonb_each(fr.by_channel) e
    group by fr.d, e.key
  ),
  funnel as (
    select d, sum(n) as inquiries, jsonb_object_agg(channel, n) as inq_by_channel
    from funnel_ch
    group by d
  ),
  -- วันที่ทีมกรอกคนทัก (มีแถวใน tmk_sales_funnel) — ใช้ตัดสิน inquiry_filled แม้ยอดจะเป็น 0
  funnel_days as (
    select distinct date as d from public.tmk_sales_funnel where date between p_from and p_to
  ),
  reply as (
    select date as d, max(coalesce(avg_reply_minutes, 0)) as avg_reply_minutes
    from public.tmk_daily_sales
    where date between p_from and p_to and deleted_at is null
    group by date
  )
  select days.d                                                  as day,
    coalesce(funnel.inquiries, 0)                                as inquiries,
    coalesce(funnel.inq_by_channel, '{}'::jsonb)                 as inq_by_channel,
    (funnel_days.d is not null)                                  as inquiry_filled,
    coalesce(ord.orders, 0)                                      as orders,
    coalesce(ord.orders_new, 0)                                  as orders_new,
    coalesce(ord.sales, 0)                                       as sales,
    coalesce(ord.sales_new, 0)                                   as sales_new,
    coalesce(ord_ch.ord_by_channel, '{}'::jsonb)                 as ord_by_channel,
    coalesce(ord.cancelled, 0)                                   as cancelled,
    coalesce(ord.cancelled_value, 0)                             as cancelled_value,
    coalesce(reply.avg_reply_minutes, 0)                         as avg_reply_minutes
  from days
  left join ord         on ord.d = days.d
  left join ord_ch      on ord_ch.d = days.d
  left join funnel      on funnel.d = days.d
  left join funnel_days on funnel_days.d = days.d
  left join reply       on reply.d = days.d
  order by days.d;
$$;

-- เรียกได้เฉพาะ service_role (ฝั่ง ads เรียกด้วย secret key) — anon/authenticated ของเว็บ TMK เรียกไม่ได้
revoke all on function public.jk_ads_daily_facts(date, date) from public, anon, authenticated;
grant execute on function public.jk_ads_daily_facts(date, date) to service_role;

comment on function public.jk_ads_daily_facts(date, date) is
  'สรุปยอดรายวันให้ระบบ ads ของ SSB — เฉพาะออเดอร์ช่องแชท ตามวันที่ออเดอร์ · merge override · ไม่คืนข้อมูลลูกค้า';

-- ============================================================
-- VERIFY (รันหลัง create แล้วดูผล)
--   select * from public.jk_ads_daily_facts(current_date - 16, current_date);
--   -- ต้องได้ 17 แถว (ครบทุกวัน) · ยอดรวมต้องตรงกับหน้า "รายงานขาย" ของ TMK เมื่อกรองเฉพาะช่องแชท
--   select sum(sales) as sales_17d, sum(orders) as orders_17d, sum(inquiries) as inq_17d
--   from public.jk_ads_daily_facts(current_date - 16, current_date);
--
-- ROLLBACK
--   drop function if exists public.jk_ads_daily_facts(date, date);
--
-- จดว่ารันแล้ว (กติกาของ repo นี้)
--   select public.tmk_migration_applied('20260918-jk-ads-daily-facts.sql');
-- ============================================================
