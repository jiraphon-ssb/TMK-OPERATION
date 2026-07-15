import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// ENV-1 (audit remediation): แจ้งเตือนชัดเมื่อ env ที่จำเป็นขาด แทนที่จะล้มเงียบตอนเรียก supabase.*
// ไม่ throw (กันแอปทั้งตัวล่มถ้า env หลุดชั่วคราวบน prod) · เงียบใน Node/test (typeof window)
if (!isSupabaseConfigured && typeof window !== 'undefined') {
  console.error(
    '[supabase] ตั้งค่าไม่ครบ: ต้องมี VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY ' +
    '(ดู .env.example) — การเชื่อมต่อฐานข้อมูลจะไม่ทำงานจนกว่าจะตั้งค่าครบ' +
    (supabaseUrl ? '' : ' · ขาด VITE_SUPABASE_URL') +
    (supabaseAnonKey ? '' : ' · ขาด VITE_SUPABASE_ANON_KEY'),
  );
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
