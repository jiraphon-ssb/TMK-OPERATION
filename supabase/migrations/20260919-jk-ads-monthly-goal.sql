-- ============================================================
-- jk_ads_monthly_goal — เป้าเดือนของ JUNTAKARN ให้ระบบ ads ของ SSB (โปรเจกต์ lzvftqhffqefqupwulus)
-- ข้อตกลง 18 ก.ย. 2569:
--   · sales_target = ผลรวมเป้า "ช่องแชท" ใน meta.channelTargetsV2 (ตัด Shopee · Lazada · POS)
--     ฐานเดียวกับยอดที่ ads ดึงไปแล้ว (นับเฉพาะออเดอร์จากแชท) — ถ้าใช้เป้ารวมทุกช่องทาง
--     JUNTAKARN จะดู "ต่ำกว่าเป้า" ตลอด ทั้งที่ทำได้ตามเป้าของช่องแชทจริง
--   · ad_budget = meta.adChannelsV2 เฉพาะ Facebook + Instagram = ค่าแอด Meta
--     (LINE · TikTok · Shopee · Lazada ที่ตั้งงบได้ในหน้าเดียวกัน เป็นแอดคนละแพลตฟอร์ม
--      ไม่ควรเข้าไปหาร ROAS ของหน้า ads ซึ่งคิดจากค่าแอด Meta อย่างเดียว)
--   · อ่าน key V2 เท่านั้น — channelTargets / adChannels ยุคเก่า key เป็น id ตัวเล็ก (facebook/line_oa)
--     คนละชุดกัน ถ้าปนจะได้เป้ายุคเก่ามารวมด้วย
--   · ปี พ.ศ.: tmk_monthly_history.year = ค.ศ. + 543 · month = เลขเดือน (1–12)
--   · เดือนที่ทีมยังไม่ตั้งเป้า → has_row = false ฝั่ง ads จะไม่เขียนอะไร (กันเขียนศูนย์ทับของจริง)
-- ความปลอดภัย: คืนแต่ตัวเลขเป้ารายเดือน — ไม่มีชื่อเซลล์ ลูกค้า หรือเลขออเดอร์
-- idempotent · รันใน Supabase SQL Editor ของโปรเจกต์ TMK
-- ============================================================
drop function if exists public.jk_ads_monthly_goal(date[]);

create or replace function public.jk_ads_monthly_goal(p_months date[])
returns table (
  month date, sales_target numeric, ad_budget numeric,
  sales_target_all numeric, ad_budget_all numeric, has_row boolean
)
language sql
security definer
set search_path = ''   -- body qualify public. ครบทุกตาราง (คอนเวนชันเดียวกับฟังก์ชันอื่นในระบบ)
as $$
  with want as (
    select distinct date_trunc('month', m)::date as d from unnest(coalesce(p_months, '{}'::date[])) as m
  ),
  -- หยิบแถวเป้าของเดือนนั้นครั้งเดียว (แถวล่าสุดตาม updated_at) แล้วใช้ต่อทั้ง target และ meta
  -- ถ้าแยกเป็นสอง subquery มีโอกาสได้คนละแถวเมื่อ updated_at ซ้ำกัน
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
  -- ค่าใน jsonb อาจเป็นตัวเลขหรือสตริง และอาจมีค่าที่ไม่ใช่ตัวเลขหลุดมา → ตัวไหนแปลงไม่ได้นับเป็น 0
  -- (ถ้าปล่อยให้ cast พังทั้ง query เฟสดึงเป้าฝั่ง ads จะล้มทั้งรอบเพราะค่าที่พิมพ์ผิดช่องเดียว)
  chat as (
    select r.d,
      coalesce(sum(case when e.key not in ('Shopee', 'Lazada', 'POS')
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
    coalesce(chat.sales_target, 0)                 as sales_target,
    coalesce(ads.ad_budget, 0)                     as ad_budget,
    coalesce(chat.sales_target_all, 0)             as sales_target_all,
    coalesce(ads.ad_budget_all, 0)                 as ad_budget_all,
    r.found                                        as has_row
  from row_of r
  left join chat on chat.d = r.d
  left join ads  on ads.d  = r.d
  order by r.d;
$$;

-- เรียกได้เฉพาะ service_role (ฝั่ง ads เรียกด้วย secret key) — anon/authenticated ของเว็บ TMK เรียกไม่ได้
revoke all on function public.jk_ads_monthly_goal(date[]) from public, anon, authenticated;
grant execute on function public.jk_ads_monthly_goal(date[]) to service_role;

comment on function public.jk_ads_monthly_goal(date[]) is
  'เป้าเดือนของ JUNTAKARN ให้ระบบ ads ของ SSB — เป้าช่องแชท + งบแอด Meta (Facebook/Instagram) · ไม่คืนข้อมูลลูกค้า';

-- ============================================================
-- VERIFY (รันแล้วส่งผลกลับให้เทียบกับหน้า ตั้งค่า › เป้า & คอมมิชชั่น)
--   select * from public.jk_ads_monthly_goal(array[
--     date_trunc('month', current_date)::date,
--     (date_trunc('month', current_date) - interval '1 month')::date
--   ]);
--   -- ต้องได้ 2 แถว (เดือนนี้ + เดือนก่อน)
--   -- sales_target      = ผลรวมช่อง "เป้ายอด" ทุกช่อง ยกเว้น Shopee/Lazada/POS
--   -- ad_budget         = "งบแอด" ของ Facebook + Instagram
--   -- sales_target_all  = ผลรวมเป้ายอดทุกช่อง (ไว้เทียบว่าตัดมาร์เก็ตเพลสออกไปเท่าไหร่)
--   -- has_row = false   = เดือนนั้นยังไม่มีแถวเป้าเลย (ฝั่ง ads จะไม่เขียนอะไร)
--
--   -- ดูรายช่องของเดือนนี้ว่าอันไหนถูกนับ/ไม่ถูกนับ
--   select h.meta->'channelTargetsV2' as เป้ารายช่อง, h.meta->'adChannelsV2' as งบแอดรายช่อง
--   from public.tmk_monthly_history h
--   where h.month = extract(month from current_date)::int
--     and h.year  = extract(year  from current_date)::int + 543
--   order by h.updated_at desc nulls last limit 1;
--
-- ROLLBACK
--   drop function if exists public.jk_ads_monthly_goal(date[]);
--
-- จดว่ารันแล้ว (กติกาของ repo นี้)
--   select public.tmk_migration_applied('20260919-jk-ads-monthly-goal.sql');
-- ============================================================
