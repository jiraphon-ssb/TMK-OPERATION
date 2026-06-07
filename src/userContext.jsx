/* ============================================================
   TMK Operation — Current User Context
   ============================================================
   Provides logged-in user info to all components.
   Reads from localStorage on mount → persists across refresh.
   ============================================================ */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { TMK } from './data.js';

const UserContext = createContext();

export function UserProvider({ children, version }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('tmk-user');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  // Refresh when localStorage changes (login/logout in same tab uses storage event for cross-tab; here we listen for window event 'tmk-user-change')
  useEffect(() => {
    const onChange = () => {
      try {
        const saved = localStorage.getItem('tmk-user');
        setUser(saved ? JSON.parse(saved) : null);
      } catch { setUser(null); }
    };
    window.addEventListener('tmk-user-change', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('tmk-user-change', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  // Enrich user with profile from Supabase (tmk_staff + tmk_user_roles)
  const enriched = React.useMemo(() => {
    if (!user) return null;
    // 1. Look in tmk_staff by email
    const staffByEmail = (TMK.staff || []).find(s => s.email === user.email);
    // 2. Look in tmk_user_roles by email
    const role = (TMK.roles || []).find(r => r.email === user.email);
    // 3. If role exists, also try staff by name
    const staffByName = role ? (TMK.staff || []).find(s => s.name === role.name) : null;
    const staff = staffByEmail || staffByName;

    // Special case: jiraphon.e@tmk.co is the owner — default name "มัง" if not in DB
    const isOwner = user.email === 'jiraphon.e@tmk.co' || user.email === 'jiraphon.e@saisabuygroup.co';
    const fallbackName = isOwner ? 'มัง' : user.email.split('@')[0];
    const fallbackRole = isOwner ? 'admin' : 'viewer';

    return {
      email: user.email,
      name: user.displayName || staff?.name || role?.name || fallbackName,
      role: role?.role || (staff?.role === 'Owner' ? 'admin' : null) || fallbackRole,
      color: staff?.color || (isOwner ? '#b07d33' : '#3b82f6'),
      avatarUrl: user.avatarUrl || staff?.avatarUrl || '',
      loginAt: user.loginAt,
    };
  }, [user, version]);

  return (
    <UserContext.Provider value={{ user: enriched, rawUser: user, setUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}

// Helper for components that don't use the hook (legacy code)
export function getCurrentUser() {
  try {
    const saved = localStorage.getItem('tmk-user');
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}
