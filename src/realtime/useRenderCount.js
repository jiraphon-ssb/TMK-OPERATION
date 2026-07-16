import { useEffect } from 'react';
import { rtDiag } from './diagnostics.js';

/* นับจำนวน render (commit) ของหน้าหลัก — Phase 0 baseline (dev-only · no-op ใน prod)
   useEffect ไม่มี deps → รันหลังทุก commit render → สะท้อน rerender ที่เกิดจริง (เช่น global version bump) */
export function useRenderCount(screen) {
  useEffect(() => { rtDiag.render(screen); });
}
