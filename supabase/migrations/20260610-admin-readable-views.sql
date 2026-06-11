-- ============================================================
-- TMK Operation — ชั้นอ่านสำหรับแอดมิน (Thai Views + คำอธิบาย)
-- ============================================================
-- รัน 1 ครั้งใน Supabase SQL Editor (idempotent — รันซ้ำได้)
-- แทนที่ view ชุดเก่าจาก 20260608-readable-views.sql (ชื่ออังกฤษ ขาด filter ลบ)
--
-- ⚠️ ไฟล์นี้ "ไม่แตะข้อมูล" แม้แต่แถวเดียว:
--   - มีแต่ DROP VIEW (สูตรเก่า) / CREATE VIEW (สูตรใหม่) / COMMENT (ป้ายอธิบาย) / GRANT
--   - ไม่มี UPDATE / DELETE / ALTER TABLE / DROP TABLE ใดๆ ทั้งสิ้น
--
-- หลังรัน: Supabase → Table Editor → ดูที่รายการ Views (กลุ่ม v_*)
-- ============================================================

-- ---------- 0) ลบ view ชุดเก่า (เป็นแค่สูตร SELECT ไม่มีข้อมูลข้างใน) ----------
drop view if exists public.v_monthly_overview;
drop view if exists public.v_daily_by_channel;
drop view if exists public.v_daily_totals;

-- ============================================================
-- 1) v_ขายรายวัน_ช่องทาง — 1 แถว = วัน × ช่องทาง (ละเอียดสุด)
--    แตกจาก tmk_daily_sales.channels (jsonb) + ชื่อช่องทางจริงจาก tmk_channels
--    แถวเก่าที่ไม่มี jsonb → ใช้ยอดจากคอลัมน์เดิม (ไม่ตกหล่น)
-- ============================================================
create or replace view public."v_ขายรายวัน_ช่องทาง"
with (security_invoker = on) as
select
  d.date                                as "วันที่",
  d.day_name                            as "วัน",
  coalesce(c.name, x.ch_id)             as "ช่องทาง",
  coalesce((x.val->>'rev')::numeric, 0) as "ยอดขาย (บาท)",
  coalesce((x.val->>'ord')::int, 0)     as "ออร์เดอร์",
  coalesce((x.val->>'ad')::numeric, 0)  as "ค่าแอด (บาท)",
  coalesce((x.val->>'inq')::int, 0)     as "คนทัก",
  coalesce((x.val->>'newC')::int, 0)    as "ลูกค้าใหม่",
  coalesce((x.val->>'oldC')::int, 0)    as "ลูกค้าเก่า",
  x.ch_id                               as "รหัสช่องทาง"
from public.tmk_daily_sales d
cross join lateral jsonb_each(
  coalesce(
    nullif(d.channels, '{}'::jsonb),
    jsonb_build_object(
      'facebook', jsonb_build_object('rev', d.facebook),
      'tiktok',   jsonb_build_object('rev', d.tiktok),
      'shopee',   jsonb_build_object('rev', d.shopee),
      'crm',      jsonb_build_object('rev', d.crm),
      'lazada',   jsonb_build_object('rev', d.lazada),
      'line',     jsonb_build_object('rev', d.line_oa))
  )
) as x(ch_id, val)
left join public.tmk_channels c on c.id = x.ch_id
where d.deleted_at is null
  and ( coalesce((x.val->>'rev')::numeric, 0) <> 0
     or coalesce((x.val->>'ord')::int, 0)     <> 0
     or coalesce((x.val->>'ad')::numeric, 0)  <> 0
     or coalesce((x.val->>'inq')::int, 0)     <> 0
     or coalesce((x.val->>'newC')::int, 0)    <> 0
     or coalesce((x.val->>'oldC')::int, 0)    <> 0 )
order by d.date desc, coalesce((x.val->>'rev')::numeric, 0) desc;

comment on view public."v_ขายรายวัน_ช่องทาง" is
  'อ่านอย่างเดียว: ยอดขายรายวันแยกตามช่องทาง (1 แถว = วัน×ช่องทาง) แตกจาก tmk_daily_sales.channels — ซ่อนแถวที่ทุกค่าเป็น 0 และวันที่ถูกลบ (deleted_at)';

-- ============================================================
-- 2) v_ขายรายวัน_สรุป — 1 แถว = 1 วัน (ยอดรวม + ยอดต่อช่องทาง)
-- ============================================================
create or replace view public."v_ขายรายวัน_สรุป"
with (security_invoker = on) as
select
  d.date                  as "วันที่",
  d.day_name              as "วัน",
  t.tot_rev               as "ยอดรวม (บาท)",
  t.tot_ord               as "ออร์เดอร์รวม",
  case when t.tot_ad > 0 then t.tot_ad else d.ad_spend end as "ค่าแอดรวม (บาท)",
  t.tot_inq               as "คนทักรวม",
  t.tot_new               as "ลูกค้าใหม่รวม",
  t.tot_old               as "ลูกค้าเก่ารวม",
  coalesce((d.channels->'facebook'->>'rev')::numeric, d.facebook) as "Facebook",
  coalesce((d.channels->'tiktok'->>'rev')::numeric,   d.tiktok)   as "TikTok",
  coalesce((d.channels->'shopee'->>'rev')::numeric,   d.shopee)   as "Shopee",
  coalesce((d.channels->'crm'->>'rev')::numeric,      d.crm)      as "CRM",
  coalesce((d.channels->'lazada'->>'rev')::numeric,   d.lazada)   as "Lazada",
  coalesce((d.channels->'line'->>'rev')::numeric,     d.line_oa)  as "LINE OA",
  d.avg_reply_minutes     as "เวลาตอบแชท (นาที)",
  d.note                  as "โน้ต"
from public.tmk_daily_sales d
left join lateral (
  select
    coalesce(sum((v.value->>'rev')::numeric), 0) as tot_rev,
    coalesce(sum((v.value->>'ord')::int), 0)     as tot_ord,
    coalesce(sum((v.value->>'ad')::numeric), 0)  as tot_ad,
    coalesce(sum((v.value->>'inq')::int), 0)     as tot_inq,
    coalesce(sum((v.value->>'newC')::int), 0)    as tot_new,
    coalesce(sum((v.value->>'oldC')::int), 0)    as tot_old
  from jsonb_each(
    coalesce(
      nullif(d.channels, '{}'::jsonb),
      jsonb_build_object(
        'facebook', jsonb_build_object('rev', d.facebook),
        'tiktok',   jsonb_build_object('rev', d.tiktok),
        'shopee',   jsonb_build_object('rev', d.shopee),
        'crm',      jsonb_build_object('rev', d.crm),
        'lazada',   jsonb_build_object('rev', d.lazada),
        'line',     jsonb_build_object('rev', d.line_oa))
    )
  ) v
) t on true
where d.deleted_at is null
order by d.date desc;

comment on view public."v_ขายรายวัน_สรุป" is
  'อ่านอย่างเดียว: สรุปยอดขายรายวัน 1 แถว = 1 วัน (ยอดรวม/ออร์เดอร์/แอด/คนทัก/ลูกค้า + ยอดแยก 6 ช่องทาง) — ไม่รวมวันที่ถูกลบ';

-- ============================================================
-- 3) v_เป้ารายเดือน — แตก meta (jsonb) เป็นคอลัมน์อ่านได้
--    + คอลัมน์ "ยอดจากรายวัน" คำนวณสดจาก tmk_daily_sales (เทียบกับยอดที่บันทึก)
-- ============================================================
create or replace view public."v_เป้ารายเดือน"
with (security_invoker = on) as
select
  m.year     as "ปี (พ.ศ.)",
  m.month    as "เดือนที่",
  m.month_th as "เดือน",
  m.target   as "เป้ารวม (บาท)",
  m.actual   as "ยอดที่บันทึก (บาท)",
  dd.tot_rev as "ยอดจากรายวัน (บาท)",
  case
    when m.month = extract(month from (now() at time zone 'Asia/Bangkok'))::int
     and m.year  = extract(year  from (now() at time zone 'Asia/Bangkok'))::int + 543
      then 'เดือนปัจจุบัน — ยอดจริงใช้ "ยอดจากรายวัน" (ยอดที่บันทึกเป็น 0 โดยตั้งใจ ไม่ใช่ข้อมูลหาย)'
    when coalesce(m.meta->>'entryMode', '') = 'monthly'
      then 'ใช้ยอดรวมรายเดือน (ยอดที่บันทึก)'
    else 'ใช้ผลรวมจากรายวัน'
  end as "หมายเหตุ",
  coalesce(m.meta->>'entryMode', 'daily')              as "โหมดข้อมูล",
  m.orders   as "ออร์เดอร์",
  m.ad_spend as "ค่าแอด (บาท)",
  m.new_cust as "ลูกค้าใหม่",
  m.messages as "คนทัก",
  (m.meta->'channelTargets'->>'facebook')::numeric     as "เป้า Facebook",
  (m.meta->'channelTargets'->>'tiktok')::numeric       as "เป้า TikTok",
  (m.meta->'channelTargets'->>'shopee')::numeric       as "เป้า Shopee",
  (m.meta->'channelTargets'->>'crm')::numeric          as "เป้า CRM",
  (m.meta->'channelTargets'->>'lazada')::numeric       as "เป้า Lazada",
  (m.meta->'channelTargets'->>'line')::numeric         as "เป้า LINE OA",
  (m.meta->>'adBudget')::numeric                       as "งบแอดรวม (บาท)",
  (m.meta->'adChannels'->>'facebook')::numeric         as "งบแอด Facebook",
  (m.meta->'adChannels'->>'tiktok')::numeric           as "งบแอด TikTok",
  (m.meta->'adChannels'->>'shopee')::numeric           as "งบแอด Shopee",
  (m.meta->'adChannels'->>'crm')::numeric              as "งบแอด CRM",
  (m.meta->'adChannels'->>'lazada')::numeric           as "งบแอด Lazada",
  (m.meta->'adChannels'->>'line')::numeric             as "งบแอด LINE OA",
  (m.meta->>'acosCeil')::numeric                       as "เพดาน ACOS (%)",
  (m.meta->>'cogsPct')::numeric                        as "ต้นทุนสินค้า (%)",
  (m.meta->>'otherExpense')::numeric                   as "ค่าใช้จ่ายอื่น (บาท)",
  (m.meta->>'newCustTarget')::numeric                  as "เป้าลูกค้าใหม่"
from public.tmk_monthly_history m
left join lateral (
  select coalesce(sum((v.value->>'rev')::numeric), 0) as tot_rev
  from public.tmk_daily_sales ds
  cross join lateral jsonb_each(
    coalesce(
      nullif(ds.channels, '{}'::jsonb),
      jsonb_build_object(
        'facebook', jsonb_build_object('rev', ds.facebook),
        'tiktok',   jsonb_build_object('rev', ds.tiktok),
        'shopee',   jsonb_build_object('rev', ds.shopee),
        'crm',      jsonb_build_object('rev', ds.crm),
        'lazada',   jsonb_build_object('rev', ds.lazada),
        'line',     jsonb_build_object('rev', ds.line_oa))
    )
  ) v
  where ds.deleted_at is null
    and extract(year from ds.date)::int + 543 = m.year
    and extract(month from ds.date)::int      = m.month
) dd on true
order by m.year desc, m.month desc;

comment on view public."v_เป้ารายเดือน" is
  'อ่านอย่างเดียว: เป้า+ผลรายเดือน แตกจาก tmk_monthly_history.meta — เดือนปัจจุบัน "ยอดที่บันทึก"=0 โดยตั้งใจ (ระบบคำนวณสดจากรายวัน ดูคอลัมน์ "ยอดจากรายวัน")';

-- ============================================================
-- 4) v_ประวัติการใช้งาน — log อ่านได้ทันที (แตกจาก details JSON)
-- ============================================================
create or replace view public."v_ประวัติการใช้งาน"
with (security_invoker = on) as
select
  to_char(a.created_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI:SS') as "เวลา (ไทย)",
  a.user_email as "ผู้ใช้",
  case a.action
    when 'create'  then 'สร้าง'
    when 'update'  then 'แก้ไข'
    when 'delete'  then 'ลบ'
    when 'restore' then 'กู้คืน'
    when 'purge'   then 'ลบถาวร'
    when 'move'    then 'ย้าย'
    when 'export'  then 'ส่งออก'
    when 'login'   then 'เข้าสู่ระบบ'
    when 'logout'  then 'ออกจากระบบ'
    when 'sale'    then 'ขาย'
    else a.action
  end as "การกระทำ",
  case j.dj->>'entityType'
    when 'daily'    then 'ยอดขายรายวัน'
    when 'monthly'  then 'เป้า/ข้อมูลรายเดือน'
    when 'task'     then 'งาน'
    when 'product'  then 'สินค้า'
    when 'order'    then 'ออเดอร์'
    when 'customer' then 'ลูกค้า'
    when 'campaign' then 'แคมเปญ'
    when 'channel'  then 'ช่องทาง'
    when 'duty'     then 'หน้าที่'
    when 'user'     then 'ผู้ใช้'
    when 'po'       then 'ใบสั่งซื้อ'
    when 'ad'       then 'โฆษณา'
    when 'segment'  then 'กลุ่มลูกค้า'
    when 'settings' then 'ตั้งค่า'
    when 'auth'     then 'ระบบ'
    else coalesce(j.dj->>'entityType', '-')
  end as "ประเภท",
  j.dj->>'entityName' as "รายการ",
  j.dj->>'summary'    as "สรุป",
  ( select string_agg((f->>'label') || ' = ' || (f->>'value'), '  |  ')
    from jsonb_array_elements(
      case when jsonb_typeof(j.dj->'fields') = 'array' then j.dj->'fields' else '[]'::jsonb end
    ) f
  ) as "ค่าที่บันทึก",
  ( select string_agg((c->>'label') || ': ' || (c->>'from') || ' → ' || (c->>'to'), '  |  ')
    from jsonb_array_elements(
      case when jsonb_typeof(j.dj->'changes') = 'array' then j.dj->'changes' else '[]'::jsonb end
    ) c
  ) as "ก่อน→หลัง",
  a.created_at as "เวลาเต็ม (UTC)"
from public.tmk_audit_logs a
cross join lateral (
  select case
    when a.details ~ '^\s*\{' then a.details::jsonb
    else jsonb_build_object('summary', a.details)
  end as dj
) j
order by a.created_at desc;

comment on view public."v_ประวัติการใช้งาน" is
  'อ่านอย่างเดียว: ประวัติการใช้งานแบบอ่านได้ทันที — แตก details(JSON) เป็น ประเภท/รายการ/สรุป/ค่าที่บันทึก/ก่อน→หลัง (เวลาโซนไทย)';

-- ---------- ให้สิทธิ์อ่าน view (เท่ากับตารางจริงที่เปิดอยู่แล้ว) ----------
grant select on
  public."v_ขายรายวัน_ช่องทาง",
  public."v_ขายรายวัน_สรุป",
  public."v_เป้ารายเดือน",
  public."v_ประวัติการใช้งาน"
to anon, authenticated;

-- ============================================================
-- 5) คำอธิบายภาษาไทย (COMMENT) — โชว์ใน Table Editor ใต้ชื่อตาราง/คอลัมน์
--    เป็น metadata ล้วนๆ ไม่กระทบข้อมูล/แอป
-- ============================================================

-- ตารางหลัก
comment on table public.tmk_daily_sales      is 'ยอดขายรายวัน (1 แถว = 1 วัน) — อ่านง่ายที่ view: v_ขายรายวัน_สรุป / v_ขายรายวัน_ช่องทาง';
comment on table public.tmk_monthly_history  is 'เป้า+ผลรายเดือน (ปี พ.ศ.) — เป้าต่อช่อง/งบแอดอยู่ใน meta อ่านง่ายที่ view: v_เป้ารายเดือน';
comment on table public.tmk_audit_logs       is 'ประวัติการใช้งานทุกการกระทำ — อ่านง่ายที่ view: v_ประวัติการใช้งาน';
comment on table public.tmk_channels         is 'ช่องทางการขาย 6 ช่องทาง + ยอดสะสมเดือนปัจจุบัน (sync จากยอดรายวัน)';
comment on table public.tmk_settings         is 'ค่าตั้งระบบ (แถวเดียว id=main)';
comment on table public.tmk_tasks            is 'งาน/การ์ดในหน้าวางแผน (มี soft delete: deleted_at)';
comment on table public.tmk_task_checklist   is 'เช็คลิสต์ย่อยของงาน';
comment on table public.tmk_task_comments    is 'คอมเมนต์ในงาน';
comment on table public.tmk_task_attachments is 'ไฟล์แนบของงาน';
comment on table public.tmk_campaigns        is 'แคมเปญการตลาด';
comment on table public.tmk_ad_campaigns     is 'แคมเปญโฆษณา (งบ/ใช้จริง/ROAS/ACOS)';
comment on table public.tmk_products         is 'สินค้า + สต็อก';
comment on table public.tmk_purchase_orders  is 'ใบสั่งซื้อ (PO)';
comment on table public.tmk_customer_segments is 'กลุ่มลูกค้า (segment)';
comment on table public.tmk_user_roles       is 'ผู้ใช้ระบบ + สิทธิ์';
comment on table public.tmk_staff            is 'ทีมงาน';
comment on table public.tmk_duties           is 'หน้าที่/แผนก';
comment on table public.tmk_orders           is 'ออเดอร์ (ระบบจัดการออเดอร์ — ยิงยอดเข้าสต็อกผ่าน RPC tmk_fulfill_order)';
comment on table public.tmk_customers        is 'ลูกค้า (เชื่อมกับออเดอร์ กันซ้ำด้วยเบอร์โทร)';
comment on table public.tmk_sales            is 'รายการขายจริง (บันทึกอัตโนมัติตอนปิดออเดอร์ ตัดสต็อกแบบ atomic)';

-- ตารางที่เลิกใช้แล้ว (ว่างเปล่า — รอลบในอนาคต)
comment on table public.tmk_fb_metrics is '[เลิกใช้] ตัวเลข Facebook แบบเก่า — ฟีเจอร์ถูกถอดแล้ว ตารางว่าง รอลบ';
comment on table public.tmk_color_mix  is '[เลิกใช้] สัดส่วนสีขายดี — การ์ดถูกถอดออกจากหน้าเว็บแล้ว ตารางว่าง รอลบ';
comment on table public.tmk_size_mix   is '[เลิกใช้] สัดส่วนไซส์ขายดี — การ์ดถูกถอดออกจากหน้าเว็บแล้ว ตารางว่าง รอลบ';

-- คอลัมน์: tmk_daily_sales
comment on column public.tmk_daily_sales.id        is 'รูปแบบ d-YYYY-MM-DD (วันที่ ค.ศ.)';
comment on column public.tmk_daily_sales.date      is 'วันที่ (ค.ศ.)';
comment on column public.tmk_daily_sales.day_name  is 'ชื่อวันย่อภาษาไทย (จ อ พ พฤ ศ ส อา)';
comment on column public.tmk_daily_sales.channels  is 'ข้อมูลเต็มต่อช่องทาง: rev=ยอดขาย, ord=ออร์เดอร์, ad=ค่าแอด, inq=คนทัก, newC=ลูกค้าใหม่, oldC=ลูกค้าเก่า — นี่คือข้อมูลหลัก';
comment on column public.tmk_daily_sales.shopee    is '[มรดกเก่า] ยอดขาย Shopee — ข้อมูลเต็มดูที่คอลัมน์ channels';
comment on column public.tmk_daily_sales.tiktok    is '[มรดกเก่า] ยอดขาย TikTok — ข้อมูลเต็มดูที่คอลัมน์ channels';
comment on column public.tmk_daily_sales.lazada    is '[มรดกเก่า] ยอดขาย Lazada — ข้อมูลเต็มดูที่คอลัมน์ channels';
comment on column public.tmk_daily_sales.facebook  is '[มรดกเก่า] ยอดขาย Facebook — ข้อมูลเต็มดูที่คอลัมน์ channels';
comment on column public.tmk_daily_sales.line_oa   is '[มรดกเก่า] ยอดขาย LINE OA — ข้อมูลเต็มดูที่คอลัมน์ channels';
comment on column public.tmk_daily_sales.crm       is '[มรดกเก่า] ยอดขาย CRM — ข้อมูลเต็มดูที่คอลัมน์ channels';
comment on column public.tmk_daily_sales.ad_spend  is 'ค่าแอดรวมทั้งวัน (บาท)';
comment on column public.tmk_daily_sales.avg_reply_minutes is 'เวลาตอบแชทเฉลี่ย (นาที)';
comment on column public.tmk_daily_sales.deleted_at is 'เวลาที่ลบ (null = ยังใช้งาน) — soft delete กู้คืนได้ ไม่หายจริง';

-- คอลัมน์: tmk_monthly_history
comment on column public.tmk_monthly_history.id       is 'รูปแบบ ปีพ.ศ.-เดือน เช่น 2569-06';
comment on column public.tmk_monthly_history.month    is 'เดือนที่ 1-12';
comment on column public.tmk_monthly_history.year     is 'ปี พ.ศ. (เช่น 2569)';
comment on column public.tmk_monthly_history.target   is 'เป้ายอดขายรวมทั้งเดือน (บาท)';
comment on column public.tmk_monthly_history.actual   is 'ยอดจริงที่บันทึก — เดือนปัจจุบันเป็น 0 โดยตั้งใจ (ระบบคำนวณสดจากยอดรายวัน) ไม่ใช่ข้อมูลหาย';
comment on column public.tmk_monthly_history.orders   is 'ออร์เดอร์รวม — เดือนปัจจุบันเป็น 0 โดยตั้งใจ (คำนวณสดจากรายวัน)';
comment on column public.tmk_monthly_history.ad_spend is 'ค่าแอดรวมทั้งเดือน (บาท) — กรอกจากข้อมูลย้อนหลัง';
comment on column public.tmk_monthly_history.messages is 'จำนวนคนทักทั้งเดือน';
comment on column public.tmk_monthly_history.meta     is 'การตั้งค่าเดือน: channelTargets=เป้าต่อช่อง, adChannels=งบแอดต่อช่อง, adBudget=งบแอดรวม, acosCeil=เพดานACOS%, cogsPct=ต้นทุน%, otherExpense=ค่าใช้จ่ายอื่น, entryMode=โหมดข้อมูล(daily/monthly) — อ่านง่ายที่ v_เป้ารายเดือน';

-- คอลัมน์: tmk_audit_logs
comment on column public.tmk_audit_logs.action  is 'การกระทำ: create/update/delete/restore/purge/move/export/login/logout/sale';
comment on column public.tmk_audit_logs.details is 'JSON: entityType, entityName, summary, fields(ค่าที่บันทึก), changes(ก่อน→หลัง), data(ข้อมูลโครงสร้างสำหรับรายงาน/กู้คืน) — อ่านง่ายที่ v_ประวัติการใช้งาน';

-- คอลัมน์: tmk_settings (ตัวที่เลิกใช้)
comment on column public.tmk_settings.current_day is '[เลิกใช้] ระบบใช้วันที่จริงจากเครื่องแล้ว — คอลัมน์นี้ไม่มีผล';
