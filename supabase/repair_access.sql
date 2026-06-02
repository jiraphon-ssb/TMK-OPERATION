-- Run this in the Supabase SQL Editor for the project used by the web app.
-- It repairs table access after a restore so the browser client can read TMK data.

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

alter table public.tmk_campaigns disable row level security;
alter table public.tmk_channels disable row level security;
alter table public.tmk_products disable row level security;
alter table public.tmk_tasks disable row level security;
alter table public.tmk_task_checklist disable row level security;
alter table public.tmk_task_comments disable row level security;
alter table public.tmk_task_attachments disable row level security;
alter table public.tmk_purchase_orders disable row level security;
alter table public.tmk_settings disable row level security;
alter table public.tmk_user_roles disable row level security;
alter table public.tmk_audit_logs disable row level security;

select 'tmk_campaigns' as table_name, count(*) as row_count from public.tmk_campaigns
union all select 'tmk_channels', count(*) from public.tmk_channels
union all select 'tmk_products', count(*) from public.tmk_products
union all select 'tmk_tasks', count(*) from public.tmk_tasks
union all select 'tmk_task_checklist', count(*) from public.tmk_task_checklist
union all select 'tmk_purchase_orders', count(*) from public.tmk_purchase_orders
union all select 'tmk_settings', count(*) from public.tmk_settings
union all select 'tmk_user_roles', count(*) from public.tmk_user_roles
union all select 'tmk_audit_logs', count(*) from public.tmk_audit_logs;
