-- ============================================================
-- jk_ads_daily_facts (แก้รอบที่ 2) — ให้ตัวเลขตรงกับหน้า "รายงานขาย" ของเว็บ TMK เป๊ะ
-- แก้ 3 เรื่องที่พบตอนรีวิวความถูกต้อง 18 ก.ย. 2569:
--   1) status: เว็บเทียบแบบไม่สนตัวพิมพ์ (String(o.status||'').toLowerCase() !== 'cancelled')
--      แต่ SQL เดิมเทียบ status <> 'cancelled' ตรงตัว → แถวที่เป็น 'Cancelled' ถูกนับเป็นออเดอร์ active
--      ทั้งที่เว็บตัดออก → ยอดสองหน้าไม่ตรง
--   2) channel ว่าง (''): isChatOrder ของเว็บใช้ !!ch → ช่องว่างไม่นับเป็นออเดอร์แชท
--      แต่ SQL เดิมใช้ channel is not null → นับเข้ายอด → ROAS ของ JK สูงกว่าที่ TMK รายงาน
--   3) เลิกคืน avg_reply_minutes: ฝั่ง ads ไม่ได้ขอคอลัมน์นี้แล้ว และมีด่าน jkExtraColumns
--      ที่จะหยุดการเขียนทั้งรอบถ้าเจอคอลัมน์เกิน — ตัดที่ต้นทางปลอดภัยกว่าพึ่ง select ของ PostgREST
-- ต้อง drop ก่อน create เพราะชุดคอลัมน์ที่คืน (OUT params) เปลี่ยน · idempotent
-- รันใน Supabase SQL Editor ของโปรเจกต์ TMK
-- ============================================================
drop function if exists public.jk_ads_daily_facts(date, date);

create or replace function public.jk_ads_daily_facts(p_from date, p_to date)
returns table (
  day date, inquiries numeric, inq_by_channel jsonb, inquiry_filled boolean,
  orders numeric, orders_new numeric, sales numeric, sales_new numeric, ord_by_channel jsonb,
  cancelled numeric, cancelled_value numeric
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
      lower(coalesce(o.status, 'active'))                                 as status,
      coalesce(o.source, '')                                              as source
    from public.tmk_mp_orders o
    left join public.tmk_order_overrides ov on ov.order_id = coalesce(o.source, '') || ':' || o.order_no
  ),
  chat as (
    select * from merged
    where source = 'shipnity'
      and nullif(channel, '') is not null
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
    coalesce(ord.cancelled_value, 0)                             as cancelled_value
  from days
  left join ord         on ord.d = days.d
  left join ord_ch      on ord_ch.d = days.d
  left join funnel      on funnel.d = days.d
  left join funnel_days on funnel_days.d = days.d
  order by days.d;
$$;

-- เรียกได้เฉพาะ service_role (ฝั่ง ads เรียกด้วย secret key) — anon/authenticated ของเว็บ TMK เรียกไม่ได้
revoke all on function public.jk_ads_daily_facts(date, date) from public, anon, authenticated;
grant execute on function public.jk_ads_daily_facts(date, date) to service_role;

comment on function public.jk_ads_daily_facts(date, date) is
  'สรุปยอดรายวันให้ระบบ ads ของ SSB — เฉพาะออเดอร์ช่องแชท ตามวันที่ออเดอร์ · merge override · ไม่คืนข้อมูลลูกค้า';

-- ============================================================
-- VERIFY
--   select * from public.jk_ads_daily_facts(current_date - 16, current_date);
--   -- ต้องได้ 17 แถว · ไม่มีคอลัมน์ avg_reply_minutes แล้ว
--   -- ยอดรวมต้องตรงกับหน้า "รายงานขาย" ของ TMK เมื่อกรองเฉพาะช่องแชท
--   select sum(sales) as sales_17d, sum(orders) as orders_17d, sum(inquiries) as inq_17d
--   from public.jk_ads_daily_facts(current_date - 16, current_date);
--   -- เช็คว่ามีแถวที่ status ตัวพิมพ์ใหญ่ / channel ว่าง อยู่จริงไหม (ถ้ามี = การแก้นี้เปลี่ยนยอด)
--   select count(*) filter (where status <> lower(status))   as mixed_case_status,
--          count(*) filter (where source = 'shipnity' and channel = '') as empty_channel
--   from public.tmk_mp_orders;
--
-- ROLLBACK (กลับไปเวอร์ชันเดิมที่มี avg_reply_minutes)
--   ใช้ไฟล์ 20260918-jk-ads-daily-facts.sql รันซ้ำ หลัง drop function ตัวนี้
--
-- จดว่ารันแล้ว (กติกาของ repo นี้)
--   select public.tmk_migration_applied('20260918b-jk-ads-daily-facts-fix.sql');
-- ============================================================
