/* ============================================================
   ConfirmHost — กล่องยืนยันแบบ shadcn (AlertDialog) ใช้แทน window.confirm
   - mount ที่ App root · เปิดผ่าน window.__confirm({title,body,confirmText,cancelText,danger}) → Promise<bool>
   - graceful: ถ้ายังไม่ mount โค้ดเก่า fallback ไป confirm() ปกติ
   ============================================================ */
import { useState, useRef, useEffect } from 'react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';

export function ConfirmHost() {
  const [opts, setOpts] = useState(null);
  const resolver = useRef(null);

  useEffect(() => {
    window.__confirm = (o = {}) => new Promise((resolve) => { resolver.current = resolve; setOpts(o); });
    return () => { if (window.__confirm) delete window.__confirm; };
  }, []);

  const close = (val) => { setOpts(null); const r = resolver.current; resolver.current = null; r?.(val); };

  return (
    <AlertDialog open={!!opts} onOpenChange={(o) => { if (!o) close(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{opts?.title || 'ยืนยัน'}</AlertDialogTitle>
          {opts?.body && <AlertDialogDescription className="whitespace-pre-line">{opts.body}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>{opts?.cancelText || 'ยกเลิก'}</AlertDialogCancel>
          <AlertDialogAction onClick={() => close(true)} className={opts?.danger ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive' : ''}>
            {opts?.confirmText || 'ยืนยัน'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
