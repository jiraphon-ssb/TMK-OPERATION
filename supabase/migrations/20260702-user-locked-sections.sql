-- ============================================================
-- ล็อกหน้าใหญ่ต่อผู้ใช้ (deny-list) — PART 37
-- ค่าเป็น array ของ section id: ['sales','flows','catalog','settings']
-- ว่าง = เข้าได้ทุกหน้า · admin ไม่ถูกล็อก (บังคับฝั่งโค้ด)
-- โค้ด graceful ใช้ได้ก่อนรันไฟล์นี้ (อ่าน = ไม่มีใครโดนล็อก · เขียน = ตัดคอลัมน์แล้ว retry)
-- ============================================================
alter table public.tmk_user_roles add column if not exists locked_sections jsonb default '[]'::jsonb;
