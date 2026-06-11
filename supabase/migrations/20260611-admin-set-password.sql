-- ============================================================
-- Admin ตั้ง/รีเซ็ตรหัสผ่านให้ผู้ใช้ในเว็บ
-- ============================================================
-- โมเดล: แอดมินเป็นคนตั้งรหัสให้ (ไม่มี self sign-up/ลืมรหัสในหน้า login)
-- - สร้างบัญชี auth ใหม่ = ทำใน Supabase Dashboard (Authentication > Users)
-- - ฟังก์ชันนี้ = "รีเซ็ตรหัส" ของ user ที่มีบัญชีอยู่แล้ว (UPDATE auth.users เท่านั้น
--   ไม่แตะ schema/INSERT → ไม่เปราะข้ามเวอร์ชัน GoTrue)
-- ความปลอดภัย: enforce ที่ DB จริง — เฉพาะ caller ที่เป็น admin ใน tmk_user_roles
-- รันใน Supabase SQL Editor ครั้งเดียว (idempotent — create or replace)
-- ============================================================
create extension if not exists pgcrypto with schema extensions;

create or replace function public.tmk_admin_set_password(p_email text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  caller   text := lower(coalesce(auth.jwt() ->> 'email', ''));
  is_admin boolean;
  target   uuid;
begin
  -- caller ต้องเป็น admin ที่ยังไม่ถูกลบ
  select exists(
    select 1 from public.tmk_user_roles
    where lower(email) = caller and role = 'admin' and deleted_at is null
  ) into is_admin;
  if not is_admin then
    return json_build_object('ok', false, 'error', 'forbidden');
  end if;

  if length(coalesce(p_password, '')) < 6 then
    return json_build_object('ok', false, 'error', 'too_short');
  end if;

  select id into target from auth.users where lower(email) = lower(p_email) limit 1;
  if target is null then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at         = now()
   where id = target;

  return json_build_object('ok', true);
end;
$$;

-- เรียกได้เฉพาะผู้ล็อกอินแล้ว (ตรวจ admin ภายในฟังก์ชันอีกชั้น) — ห้าม anon
revoke all on function public.tmk_admin_set_password(text, text) from public, anon;
grant execute on function public.tmk_admin_set_password(text, text) to authenticated;
