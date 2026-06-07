-- ============================================================
-- TMK Operation — Duties System (หน้าที่/ตำแหน่ง)
-- ============================================================
-- แยกแนวคิด:
--   USER = บุคคล (มี email + ชื่อ + สิทธิ์เข้าถึง)
--   DUTY = หน้าที่/ตำแหน่ง (CEO, MKT, Graphic, ...) — เพิ่ม/แก้/ลบได้
--   TASK responsible = หน้าที่ที่ได้รับมอบหมาย (ไม่ใช่บุคคล)
--
-- ความสัมพันธ์:
--   USER 1:N DUTY (ผู้ใช้ 1 คนมี 1 หน้าที่)
--   TASK responsible = ชื่อหน้าที่ (text, รองรับหลายหน้าที่ comma-separated)
-- ============================================================

-- 1. สร้างตาราง tmk_duties
create table if not exists public.tmk_duties (
  id text primary key,
  name text not null unique,
  color text not null default '#3b82f6',
  description text default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger touch updated_at
drop trigger if exists tmk_duties_touch_updated_at on public.tmk_duties;
create trigger tmk_duties_touch_updated_at before update on public.tmk_duties
  for each row execute function public.tmk_touch_updated_at();

-- RLS + realtime + grants
alter table public.tmk_duties replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'tmk_duties') then
    alter publication supabase_realtime add table public.tmk_duties;
  end if;
end $$;
grant select, insert, update, delete on public.tmk_duties to anon, authenticated;
alter table public.tmk_duties disable row level security;

-- 2. เพิ่ม duty_id ใน tmk_user_roles (FK)
alter table public.tmk_user_roles add column if not exists duty_id text references public.tmk_duties(id) on delete set null;

-- 3. Seed duties เริ่มต้น 5 หน้าที่
insert into public.tmk_duties (id, name, color, description, sort_order) values
('ceo',     'CEO',      '#b07d33', 'ผู้บริหารระดับสูง / เจ้าของแบรนด์',  1),
('headmkt', 'Head MKT', '#0a5aa0', 'หัวหน้าทีมการตลาด',                  2),
('admin',   'Admin',    '#2f9e6e', 'แอดมินหลังบ้าน / Operations',        3),
('mkt',     'MKT',      '#4a8be0', 'ทีมการตลาด / Performance',           4),
('graphic', 'Graphic',  '#6b5ce0', 'ทีมกราฟิก / Content Creator',        5)
on conflict (id) do update set
  name = excluded.name,
  color = excluded.color,
  description = excluded.description,
  sort_order = excluded.sort_order;

-- 4. Migrate department text → duty_id
update public.tmk_user_roles set duty_id = 'ceo'     where department = 'CEO';
update public.tmk_user_roles set duty_id = 'headmkt' where department = 'Head MKT';
update public.tmk_user_roles set duty_id = 'admin'   where department = 'Admin';
update public.tmk_user_roles set duty_id = 'mkt'     where department = 'MKT';
update public.tmk_user_roles set duty_id = 'graphic' where department = 'Graphic';

-- ============================================================
-- ตรวจสอบผลลัพธ์
-- ============================================================
select 'duties' as t, count(*) from public.tmk_duties
union all select 'users', count(*) from public.tmk_user_roles;

select d.name as duty, count(u.email) as users
from public.tmk_duties d
left join public.tmk_user_roles u on u.duty_id = d.id
group by d.id, d.name, d.sort_order
order by d.sort_order;
