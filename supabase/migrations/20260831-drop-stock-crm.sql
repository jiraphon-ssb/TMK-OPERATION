-- 20260831-drop-stock-crm.sql · PART 35 — ลบระบบ "คลัง/สต็อก" และ "CRM" (section) ออกถาวร
-- ⚠️ DESTRUCTIVE: ลบตารางทิ้งพร้อมข้อมูล กู้คืนไม่ได้ · idempotent (drop if exists) · รันใน Supabase SQL Editor
-- ไม่แตะตารางที่แชร์: tmk_products / tmk_customers / tmk_customer_totals / tmk_mp_* / tmk_orders
-- และไม่ลบคอลัมน์ supplier_id/reorder_qty/lead_time_days บน tmk_products (แคตตาล็อกยังอ่าน supplier)

-- ===== CRM section =====
drop table if exists public.tmk_crm_customer_tags cascade;
drop table if exists public.tmk_crm_tags         cascade;
drop table if exists public.tmk_crm_followups    cascade;
drop table if exists public.tmk_crm_activities   cascade;
drop table if exists public.tmk_crm_deals        cascade;
drop table if exists public.tmk_crm_merge        cascade;
drop table if exists public.tmk_crm_campaigns    cascade;

-- ===== คลัง/สต็อก (ops) section =====
drop table if exists public.tmk_stock_counts   cascade;
drop table if exists public.tmk_returns        cascade;
drop table if exists public.tmk_locations      cascade;
drop table if exists public.tmk_channel_events cascade;
drop table if exists public.tmk_suppliers      cascade;

-- ===== PO (จัดการอยู่ใน section คลัง เท่านั้น — ลบพร้อมกัน) =====
drop table if exists public.tmk_purchase_orders cascade;
