-- ============================================================
-- jk_ads_daily_facts + jk_ads_monthly_goal — เปลี่ยนฐานเป็น "Facebook ช่องเดียว"
-- ข้อตกลง 21 ก.ย. 2569 (แทนข้อตกลง 18 ก.ย. ที่ใช้ "ทุกช่องแชท"):
--   ยอด · เป้า · คนทัก ของ JUNTAKARN บนหน้า ads นับเฉพาะ channel = 'Facebook'
--   เหตุผล: หน้า ads วัดผลค่าแอด Meta ที่ยิงลงเพจ Facebook — ตัวตั้งกับตัวหารต้องเป็นช่องเดียวกัน
--   ผลที่ตามมา: ยอด 1–21 ก.ย. เปลี่ยนจาก ฿217,627 (FB+LINE+โทร) เป็น ฿189,601 (FB)
--              ตรงกับการ์ด "Facebook" ในหน้ารายงานขายของ TMK เป๊ะ
--
-- ที่ "ไม่" เปลี่ยน:
--   · ad_budget ยังเป็น Facebook + Instagram = งบแอด Meta (ฝั่ง ads ดึงค่าแอดจริงจาก Meta API
--     ซึ่งรวม placement ของ Instagram ในแคมเปญเดียวกัน ตัด IG ออกจะได้ตัวหารที่ไม่ตรงกับค่าแอดจริง)
--   · source = 'shipnity' ยังเป็นเงื่อนไขเดิม (ออเดอร์ที่ import จากไฟล์มาร์เก็ตเพลสไม่ใช่ยอดจากแชท)
--   · inquiry_filled ยังหมายถึง "วันนั้นทีมกรอกตารางคนทักไหม" ไม่ใช่ "มีคนทัก FB ไหม"
--
-- ⚠️ ต้อง backfill ฝั่ง ads หลังรันไฟล์นี้ — ข้อมูลเก่าใน business_daily_facts ยังเป็นฐาน FB+LINE+โทร
--    (หน้า Sync › ดึงย้อนหลัง ทีละเดือน ตั้งแต่ มิ.ย. 69 ถึงเดือนปัจจุบัน)
-- idempotent · ชุดคอลัมน์ที่คืนไม่เปลี่ยน จึงไม่ต้อง drop ก่อน
-- รันใน Supabase SQL Editor ของโปรเจกต์ TMK
-- ============================================================

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
  -- เทียบตรงตัว 'Facebook' ไม่ใช่ lower() — ให้ตรงกับการ์ดช่องทางของหน้ารายงานขายที่จัดกลุ่มด้วยชื่อตรงตัว
  -- (ถ้าเทียบแบบไม่สนตัวพิมพ์ จะกวาดแถวที่หน้า TMK แสดงแยกเป็น "ช่องทางอื่น" เข้ามาด้วย → สองหน้าไม่ตรงกันอีก)
  chat as (
    select * from merged
    where source = 'shipnity'
      and channel = 'Facebook'
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
  -- คนทักก็ต้องเป็นฐานเดียวกับยอด — เอาเฉพาะ Facebook ไม่งั้น %ปิดการขายจะหารด้วยคนทักของช่องที่ไม่ได้นับยอด
  funnel_ch as (
    select fr.d, e.key as channel, sum((e.value#>>'{}')::numeric) as n
    from funnel_rows fr
    cross join lateral jsonb_each(fr.by_channel) e
    where e.key = 'Facebook'
    group by fr.d, e.key
  ),
  funnel as (
    select d, sum(n) as inquiries, jsonb_object_agg(channel, n) as inq_by_channel
    from funnel_ch
    group by d
  ),
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

comment on function public.jk_ads_daily_facts(date, date) is
  'สรุปยอดรายวันให้ระบบ ads ของ SSB — เฉพาะออเดอร์ช่องทาง Facebook จากใบเสร็จ Shipnity ตามวันที่ออเดอร์ · merge override · ไม่คืนข้อมูลลูกค้า';

-- ============================================================

create or replace function public.jk_ads_monthly_goal(p_months date[])
returns table (
  month date, sales_target numeric, ad_budget numeric,
  sales_target_all numeric, ad_budget_all numeric, has_row boolean
)
language sql
security definer
set search_path = ''
as $$
  with want as (
    select distinct date_trunc('month', m)::date as d from unnest(coalesce(p_months, '{}'::date[])) as m
  ),
  row_of as (
    select w.d, r.target, r.meta, coalesce(r.found, false) as found
    from want w
    left join lateral (
      select h.target, h.meta, true as found
      from public.tmk_monthly_history h
      where h.month = extract(month from w.d)::int
        and h.year  = extract(year  from w.d)::int + 543
      order by h.updated_at desc nulls last
      limit 1
    ) r on true
  ),
  -- เป้ายอด = ช่อง 'Facebook' ช่องเดียว (ฐานเดียวกับยอดที่ RPC ด้านบนนับ)
  -- sales_target_all ยังเป็นผลรวมทุกช่อง ไว้ให้ฝั่ง ads เทียบได้ว่าตัดออกไปเท่าไหร่
  fb as (
    select r.d,
      coalesce(sum(case when e.key = 'Facebook'
        then case when (e.value#>>'{}') ~ '^-?[0-9]+(\.[0-9]+)?$' then (e.value#>>'{}')::numeric else 0 end
        else 0 end), 0)                                                          as sales_target,
      coalesce(sum(case when (e.value#>>'{}') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (e.value#>>'{}')::numeric else 0 end), 0)                           as sales_target_all
    from row_of r
    left join lateral jsonb_each(
      case when jsonb_typeof(r.meta->'channelTargetsV2') = 'object' then r.meta->'channelTargetsV2' else '{}'::jsonb end
    ) e on true
    group by r.d
  ),
  ads as (
    select r.d,
      coalesce(sum(case when e.key in ('Facebook', 'Instagram')
        then case when (e.value#>>'{}') ~ '^-?[0-9]+(\.[0-9]+)?$' then (e.value#>>'{}')::numeric else 0 end
        else 0 end), 0)                                                          as ad_budget,
      coalesce(sum(case when (e.value#>>'{}') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (e.value#>>'{}')::numeric else 0 end), 0)                           as ad_budget_all
    from row_of r
    left join lateral jsonb_each(
      case when jsonb_typeof(r.meta->'adChannelsV2') = 'object' then r.meta->'adChannelsV2' else '{}'::jsonb end
    ) e on true
    group by r.d
  )
  select r.d                                       as month,
    coalesce(fb.sales_target, 0)                   as sales_target,
    coalesce(ads.ad_budget, 0)                     as ad_budget,
    coalesce(fb.sales_target_all, 0)               as sales_target_all,
    coalesce(ads.ad_budget_all, 0)                 as ad_budget_all,
    r.found                                        as has_row
  from row_of r
  left join fb   on fb.d  = r.d
  left join ads  on ads.d = r.d
  order by r.d;
$$;

comment on function public.jk_ads_monthly_goal(date[]) is
  'เป้าเดือนของ JUNTAKARN ให้ระบบ ads ของ SSB — เป้ายอดช่อง Facebook + งบแอด Meta (Facebook/Instagram) · ไม่คืนข้อมูลลูกค้า';

-- create or replace ไม่ล้าง grant เดิม แต่ประกาศซ้ำให้ไฟล์นี้อ่านจบในตัว (และกันกรณีมีคน drop ไปก่อน)
revoke all on function public.jk_ads_daily_facts(date, date)  from public, anon, authenticated;
revoke all on function public.jk_ads_monthly_goal(date[])     from public, anon, authenticated;
grant execute on function public.jk_ads_daily_facts(date, date) to service_role;
grant execute on function public.jk_ads_monthly_goal(date[])    to service_role;

-- ============================================================
-- VERIFY (ต้องได้ตรงกับการ์ด "Facebook" ในหน้ารายงานขาย เมื่อเลือกช่วง 1–21 ก.ย.)
--   select sum(sales) as fb_sales, sum(orders) as fb_orders, sum(inquiries) as fb_inq
--   from public.jk_ads_daily_facts('2026-09-01', '2026-09-21');
--   -- คาดว่า sales = 189,601 (ของเดิมฐานทุกช่องแชท = 217,627)
--
--   select * from public.jk_ads_monthly_goal(array['2026-09-01'::date]);
--   -- คาดว่า sales_target = 380,000 · sales_target_all = 800,000 · ad_budget = 95,000
--
-- ROLLBACK (กลับไปฐาน "ทุกช่องแชท")
--   รันไฟล์ 20260918b-jk-ads-daily-facts-fix.sql และ 20260919-jk-ads-monthly-goal.sql ซ้ำ
--
-- จดว่ารันแล้ว (กติกาของ repo นี้)
--   select public.tmk_migration_applied('20260921-jk-facebook-only.sql');
-- ============================================================
