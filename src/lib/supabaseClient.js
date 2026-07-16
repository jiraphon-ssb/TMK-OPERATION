import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
// SEC-3: รองรับ publishable key ใหม่ (sb_publishable_…) ก่อน · fallback legacy anon key (JWT) เพื่อ migrate แบบไม่มี downtime
// ทั้งสองเป็น "client key" ปลอดภัยที่จะอยู่ใน bundle เมื่อเปิด RLS แล้ว (ห้ามใช้ secret/service_role ที่นี่)
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

// ENV-1 (audit remediation): แจ้งเตือนชัดเมื่อ env ที่จำเป็นขาด แทนที่จะล้มเงียบตอนเรียก supabase.*
// ไม่ throw (กันแอปทั้งตัวล่มถ้า env หลุดชั่วคราวบน prod) · เงียบใน Node/test (typeof window)
if (!isSupabaseConfigured && typeof window !== 'undefined') {
  console.error(
    '[supabase] ตั้งค่าไม่ครบ: ต้องมี VITE_SUPABASE_URL และ VITE_SUPABASE_PUBLISHABLE_KEY (หรือ VITE_SUPABASE_ANON_KEY เดิม) ' +
    '(ดู .env.example) — การเชื่อมต่อฐานข้อมูลจะไม่ทำงานจนกว่าจะตั้งค่าครบ' +
    (supabaseUrl ? '' : ' · ขาด VITE_SUPABASE_URL') +
    (supabaseKey ? '' : ' · ขาด VITE_SUPABASE_PUBLISHABLE_KEY/ANON_KEY'),
  );
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey)
  : null;
