-- ============================================================
-- TMK PLAN: Fix RLS (Row Level Security) - ให้ publishable key อ่านข้อมูลได้
-- ============================================================
-- วิธีใช้: คัดลอก SQL ทั้งหมดนี้ไปวางใน Supabase Dashboard → SQL Editor → แล้วกด Run
-- ============================================================

-- วิธีที่ 1: ปิด RLS ทั้งหมด (เหมาะสำหรับระบบภายในที่ใช้ Supabase Auth อยู่แล้ว)
ALTER TABLE public.tmk_campaigns DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmk_channels DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmk_products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmk_tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmk_task_checklist DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmk_task_comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmk_task_attachments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmk_purchase_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmk_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmk_user_roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmk_audit_logs DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- วิธีที่ 2 (ทางเลือก): ถ้าต้องการ RLS enabled แต่ให้ authenticated users อ่าน/เขียนได้
-- ให้ comment วิธีที่ 1 ด้านบนออก แล้ว uncomment ด้านล่างนี้
-- ============================================================

/*
-- เปิด RLS
ALTER TABLE public.tmk_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmk_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmk_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmk_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmk_task_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmk_task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmk_task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmk_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmk_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmk_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmk_audit_logs ENABLE ROW LEVEL SECURITY;

-- สร้าง Policy: authenticated users สามารถทำได้ทุกอย่าง
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tmk_campaigns', 'tmk_channels', 'tmk_products', 'tmk_tasks',
    'tmk_task_checklist', 'tmk_task_comments', 'tmk_task_attachments',
    'tmk_purchase_orders', 'tmk_settings', 'tmk_user_roles', 'tmk_audit_logs'
  ]
  LOOP
    -- Allow SELECT for authenticated
    EXECUTE format(
      'CREATE POLICY IF NOT EXISTS %I ON public.%I FOR SELECT TO authenticated USING (true)',
      t || '_select_auth', t
    );
    -- Allow INSERT for authenticated
    EXECUTE format(
      'CREATE POLICY IF NOT EXISTS %I ON public.%I FOR INSERT TO authenticated WITH CHECK (true)',
      t || '_insert_auth', t
    );
    -- Allow UPDATE for authenticated
    EXECUTE format(
      'CREATE POLICY IF NOT EXISTS %I ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
      t || '_update_auth', t
    );
    -- Allow DELETE for authenticated
    EXECUTE format(
      'CREATE POLICY IF NOT EXISTS %I ON public.%I FOR DELETE TO authenticated USING (true)',
      t || '_delete_auth', t
    );
  END LOOP;
END $$;
*/

-- ============================================================
-- ตรวจสอบผลลัพธ์: RLS status ของแต่ละตาราง
-- ============================================================
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename LIKE 'tmk_%'
ORDER BY tablename;
