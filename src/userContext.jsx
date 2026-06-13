/* ============================================================
   TMK Operation — Current User Context
   ============================================================
   ตัวตนผู้ใช้ปัจจุบันจาก Supabase Auth session (email)
   แล้ว enrich profile/role จาก tmk_user_roles + tmk_staff ตามอีเมล
   ============================================================ */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { TMK } from './data.js';
import { supabase } from './lib/supabaseClient.js';

const UserContext = createContext();

export function UserProvider({ children, version }) {
  // อีเมลที่ล็อกอินจริง — มาจาก Supabase Auth session (persist/refresh ให้เอง)
  const [authEmail, setAuthEmail] = useState(null);
  useEffect(() => {
    if (!supabase) return; // ยังไม่ตั้งค่า Supabase → ข้าม (กัน TypeError ตอน mount)
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) setAuthEmail(data.session?.user?.email || null); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (alive) setAuthEmail(s?.user?.email || null); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  // Enrich อีเมล → profile จาก Supabase (tmk_staff + tmk_user_roles)
  const enriched = React.useMemo(() => {
    if (!authEmail || typeof authEmail !== 'string') return null;
    // 1. หาใน tmk_staff ตามอีเมล
    const staffByEmail = (TMK.staff || []).find(s => s.email === authEmail);
    // 2. หาใน tmk_user_roles ตามอีเมล
    const role = (TMK.roles || []).find(r => r.email === authEmail);
    // 3. ถ้ามี role → ลองหา staff ตามชื่อด้วย
    const staffByName = role ? (TMK.staff || []).find(s => s.name === role.name) : null;
    const staff = staffByEmail || staffByName;

    // เคสพิเศษ: jiraphon.e@tmk.co = เจ้าของ — default ชื่อ "มัง" ถ้าไม่มีใน DB
    const isOwner = authEmail === 'jiraphon.e@tmk.co' || authEmail === 'jiraphon.e@saisabuygroup.co';
    const fallbackName = isOwner ? 'มัง' : authEmail.split('@')[0];
    const fallbackRole = isOwner ? 'admin' : 'viewer';

    return {
      email: authEmail,
      name: staff?.name || role?.name || fallbackName,
      role: role?.role || (staff?.role === 'Owner' ? 'admin' : null) || fallbackRole,
      department: role?.department || role?.dutyName || staff?.role || '',
      color: staff?.color || (isOwner ? '#b07d33' : '#3b82f6'),
      avatarUrl: staff?.avatarUrl || '',
    };
  }, [authEmail, version]);

  return (
    <UserContext.Provider value={{ user: enriched }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
