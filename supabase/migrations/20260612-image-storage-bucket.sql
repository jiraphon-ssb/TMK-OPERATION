-- ============================================================
-- รูปสินค้า/อวตาร → Supabase Storage (เลิกเก็บ base64 ในแถว DB)
-- ============================================================
-- ปัญหาเดิม: pickImage เก็บ data URL (base64 ~80kB) ลงคอลัมน์ image_url
--          ที่ 500 สินค้า = 30-75 MB ต่อ reload 1 ครั้ง × ทีม 11 คน × ทุกเซฟ
-- ใหม่: รูปอยู่ใน Storage bucket 'tmk-images' — DB เก็บแค่ public URL
--      → แถวกลับมาเล็ก, browser cache รูปเอง (cacheControl: 3600 ใน client),
--      reload ไม่โหลดรูปซ้ำ
-- รันใน Supabase SQL Editor ครั้งเดียว (idempotent — ON CONFLICT DO NOTHING)
-- ============================================================

-- 1. สร้าง bucket แบบ public (อ่านได้โดยไม่ต้อง auth — กรณีลิงก์ติดตามออเดอร์/แชร์รูปสินค้า)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tmk-images', 'tmk-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Policy: อ่านได้ทุกคน (public bucket)
drop policy if exists "tmk-images public read" on storage.objects;
create policy "tmk-images public read"
  on storage.objects for select
  using (bucket_id = 'tmk-images');

-- 3. Policy: อัปโหลด/ลบได้เฉพาะผู้ล็อกอินที่อยู่ใน tmk_user_roles (ไม่ใช่ viewer)
drop policy if exists "tmk-images write authed editors" on storage.objects;
create policy "tmk-images write authed editors"
  on storage.objects for insert
  with check (
    bucket_id = 'tmk-images'
    and exists (
      select 1 from public.tmk_user_roles
      where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and role in ('admin','editor')
        and deleted_at is null
    )
  );

drop policy if exists "tmk-images update authed editors" on storage.objects;
create policy "tmk-images update authed editors"
  on storage.objects for update
  using (
    bucket_id = 'tmk-images'
    and exists (
      select 1 from public.tmk_user_roles
      where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and role in ('admin','editor')
        and deleted_at is null
    )
  );

drop policy if exists "tmk-images delete admin only" on storage.objects;
create policy "tmk-images delete admin only"
  on storage.objects for delete
  using (
    bucket_id = 'tmk-images'
    and exists (
      select 1 from public.tmk_user_roles
      where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and role = 'admin'
        and deleted_at is null
    )
  );
