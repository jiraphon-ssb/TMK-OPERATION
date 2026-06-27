import { useState, useEffect } from 'react';

/* useState ที่จำค่าไว้ใน localStorage — กันตัวกรองรีเซ็ตเวลาสลับแท็บ/รีเฟรช */
export function usePersistedState(key, initial) {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s != null ? JSON.parse(s) : initial;
    } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* โควต้าเต็ม/โหมดส่วนตัว */ }
  }, [key, v]);
  return [v, setV];
}
