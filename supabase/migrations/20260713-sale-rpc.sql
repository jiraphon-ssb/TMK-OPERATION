-- ============================================================
-- PART 70 — RPC ธุรกรรม (atomic) สำหรับลบ/void/restore ออเดอร์ใบเสร็จ + CRM aggregate
-- ------------------------------------------------------------
-- idempotent (create or replace) · grant anon,authenticated · ไม่แตะ RLS (ปิดทั้งแอปตามดีไซน์)
-- graceful: ถ้ายังไม่รัน → client fallback batch เดิม (ไม่พัง)
-- key convention: mp_orders.id ของใบเสร็จ = 'shipnity:'+order_no · overrides.order_id = source:order_no
-- ============================================================

-- ลบออเดอร์หลายใบ (skus + orders + overrides + receipts) ในธุรกรรมเดียว
create or replace function public.tmk_delete_orders(
  p_order_nos text[],
  p_source text default '',
  p_override_ids text[] default '{}'
) returns void
language plpgsql
security definer
as $$
begin
  delete from public.tmk_mp_skus where order_no = any(p_order_nos) and (coalesce(p_source,'') = '' or source = p_source);
  delete from public.tmk_mp_orders where order_no = any(p_order_nos) and (coalesce(p_source,'') = '' or source = p_source);
  if array_length(p_override_ids, 1) is not null then
    delete from public.tmk_order_overrides where order_id = any(p_override_ids);
  end if;
  -- ลบใบเสร็จเฉพาะกลุ่ม shipnity (หรือไม่ระบุ source) — กันลบใบเสร็จข้าม source ที่ order_no ชนกันบังเอิญ
  if coalesce(p_source, '') = '' or p_source = 'shipnity' then
    delete from public.tmk_sale_receipts where order_no = any(p_order_nos);
  end if;
end;
$$;

-- ยกเลิก (void) ใบเสร็จหลายใบ: receipts→void · orders(id=shipnity:no)→cancelled · ลบ skus
create or replace function public.tmk_void_receipts(
  p_order_nos text[],
  p_by text default '',
  p_reason text default ''
) returns void
language plpgsql
security definer
as $$
begin
  update public.tmk_sale_receipts
     set status = 'void', void_by = p_by, void_reason = p_reason, void_at = now(), updated_at = now()
   where order_no = any(p_order_nos);
  update public.tmk_mp_orders
     set status = 'cancelled', updated_at = now()
   where id = any(select 'shipnity:' || o from unnest(p_order_nos) o);
  delete from public.tmk_mp_skus where source = 'shipnity' and order_no = any(p_order_nos);
end;
$$;

-- นำกลับ (restore) ใบเสร็จหลายใบ: receipts→confirmed · orders→active · ลบ+insert skus จาก p_skus (client build)
-- p_skus = jsonb array ของแถว tmk_mp_skus (คอลัมน์ตรงตาราง) · ทั้งหมดในธุรกรรมเดียว
create or replace function public.tmk_restore_receipts(
  p_order_nos text[],
  p_skus jsonb default '[]'
) returns void
language plpgsql
security definer
as $$
begin
  update public.tmk_sale_receipts
     set status = 'confirmed', void_by = null, void_reason = null, void_at = null, updated_at = now()
   where order_no = any(p_order_nos);
  update public.tmk_mp_orders
     set status = 'active', updated_at = now()
   where id = any(select 'shipnity:' || o from unnest(p_order_nos) o);
  delete from public.tmk_mp_skus where source = 'shipnity' and order_no = any(p_order_nos);
  if jsonb_array_length(coalesce(p_skus, '[]'::jsonb)) > 0 then
    insert into public.tmk_mp_skus
    select * from jsonb_populate_recordset(null::public.tmk_mp_skus, p_skus);
  end if;
end;
$$;

-- CRM directory aggregate — คืน per-customer rollup (แทนโหลด orders ทั้งตาราง all-time)
-- client เอาไปผสม profiles + คิด tier/RFM เอง (logic เดิม) · ประวัติออเดอร์ต่อคนโหลดตอนเปิด drawer
create or replace function public.tmk_crm_directory()
returns table (
  key text, name text, social text, province text, salesperson text,
  sales numeric, cnt integer, qty numeric, first_date text, last_date text,
  main_channel text
)
language sql
stable
security definer
as $$
  with base as (
    select
      case
        when o.customer_name ~ '\*{2,}' or o.customer_code ~ '\*{2,}' then null
        when coalesce(trim(o.customer_code),'') <> '' then trim(o.customer_code)
        when coalesce(trim(o.customer_name),'') <> '' then 'N' || left(trim(o.customer_name), 60)
        else null
      end as k,
      o.*
    from public.tmk_mp_orders o
    where o.status is distinct from 'cancelled'
  ),
  agg as (
    select
      k,
      max(customer_name) filter (where customer_name is not null) as name,
      max(customer_social) filter (where customer_social is not null) as social,
      max(province) filter (where province is not null) as province,
      max(salesperson) filter (where salesperson is not null) as salesperson,
      sum(coalesce(sales,0)) as sales,
      count(*)::int as cnt,
      sum(coalesce(qty,0)) as qty,
      min(order_date) as first_date,
      max(order_date) as last_date
    from base where k is not null
    group by k
  ),
  ch as (
    select k, channel, count(*) c,
           row_number() over (partition by k order by count(*) desc) rn
    from base where k is not null and coalesce(channel,'') <> ''
    group by k, channel
  )
  select a.k, a.name, a.social, a.province, a.salesperson,
         a.sales, a.cnt, a.qty, a.first_date, a.last_date,
         (select channel from ch where ch.k = a.k and ch.rn = 1) as main_channel
  from agg a;
$$;

grant execute on function public.tmk_delete_orders(text[], text, text[]) to anon, authenticated;
grant execute on function public.tmk_void_receipts(text[], text, text) to anon, authenticated;
grant execute on function public.tmk_restore_receipts(text[], jsonb) to anon, authenticated;
grant execute on function public.tmk_crm_directory() to anon, authenticated;
