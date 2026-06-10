-- ============================================================
-- tmk_sales — เก็บ "การขายจริง" ลงตาราง (แทนการพึ่ง audit log อย่างเดียว)
-- ตัดสต็อก + บันทึกการขาย atomic ใน tmk_fulfill_order (เน็ตหลุด/ log fail แล้วยอดไม่หาย)
-- รันใน Supabase SQL Editor ครั้งเดียว (idempotent)
-- ============================================================
create table if not exists public.tmk_sales (
  id           text primary key,
  sale_date    date not null default current_date,
  product_id   text,
  product_name text,
  category     text,
  channel      text,
  qty          numeric not null default 0,
  amount       numeric not null default 0,   -- มูลค่าขาย (รายได้)
  cost         numeric not null default 0,   -- ต้นทุน (COGS)
  source       text not null default 'order',-- order | sell | adjust
  order_code   text,
  lines        jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists tmk_sales_date_idx on public.tmk_sales(sale_date);
grant select, insert, update, delete on public.tmk_sales to anon, authenticated;
alter table public.tmk_sales disable row level security;
-- realtime (ไม่บังคับ — รายงานโหลดเองตอนเปิด)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tmk_sales') then
    alter publication supabase_realtime add table public.tmk_sales;
  end if;
end $$;

-- ขยาย tmk_fulfill_order: เพิ่ม p_sales → insert การขายลง tmk_sales ใน transaction เดียว (atomic)
drop function if exists public.tmk_fulfill_order(text, text, jsonb, jsonb);
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
declare item jsonb; s jsonb;
begin
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
  update public.tmk_orders
    set status = p_status, status_log = p_status_log, updated_at = now()
  where id = p_order_id;
end;
$$;
grant execute on function public.tmk_fulfill_order(text, text, jsonb, jsonb, jsonb) to anon, authenticated;
