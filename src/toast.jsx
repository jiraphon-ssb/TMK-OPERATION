/* ============================================================
   TMK Operation — Toast notification system
   ============================================================ */
import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Icon } from './components.jsx';

const ToastContext = createContext();

const ICONS = { success: 'check', error: 'x', info: 'sparkle', warn: 'flame' };
const COLORS = {
  success: { bg: 'var(--good-soft)', border: 'var(--good)', color: 'var(--good)' },
  error:   { bg: 'var(--bad-soft)',  border: 'var(--bad)',  color: 'var(--bad)' },
  info:    { bg: 'var(--accent-soft)', border: 'var(--accent)', color: 'var(--accent)' },
  warn:    { bg: 'var(--warn-soft)', border: 'var(--warn)', color: 'var(--warn)' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const toast = useCallback((message, type = 'success', duration = 3000) => {
    const id = ++idRef.current;
    setToasts(ts => [...ts, { id, message, type }]);
    setTimeout(() => {
      setToasts(ts => ts.filter(t => t.id !== id));
    }, duration);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts(ts => ts.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        display: 'flex', flexDirection: 'column-reverse', gap: 8,
        pointerEvents: 'none', maxWidth: 380,
      }}>
        {toasts.map(t => {
          const c = COLORS[t.type] || COLORS.info;
          return (
            <div key={t.id} className="rise" style={{
              background: c.bg, border: `1px solid ${c.border}`,
              borderLeft: `4px solid ${c.border}`,
              borderRadius: 'var(--r)', padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 10,
              boxShadow: 'var(--sh-pop)', pointerEvents: 'auto',
              animation: 'toastIn 0.3s ease-out',
              fontFamily: 'var(--font)',
            }}>
              <span style={{ color: c.color, flexShrink: 0, width: 20, height: 20 }}>
                <Icon name={ICONS[t.type] || 'sparkle'} />
              </span>
              <span className="sm" style={{ flex: 1, fontWeight: 500, color: 'var(--ink)' }}>
                {t.message}
              </span>
              <button onClick={() => dismiss(t.id)} style={{
                background: 'none', border: 'none', padding: 2, cursor: 'pointer',
                color: 'var(--ink-3)', flexShrink: 0, width: 16, height: 16,
              }}>
                <Icon name="x" />
              </button>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/* ---- Confirmation dialog ---- */
export function ConfirmDialog({ title, message, onConfirm, onCancel, confirmLabel, cancelLabel, danger }) {
  return (
    <div className="modal-scrim" onClick={onCancel} style={{ zIndex: 10000 }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: 'var(--r-xl)',
        padding: '24px 28px', maxWidth: 400, width: '90%',
        boxShadow: 'var(--sh-pop)',
      }}>
        <div className="h3" style={{ marginBottom: 8 }}>{title}</div>
        <div className="sm" style={{ color: 'var(--ink-2)', marginBottom: 20, lineHeight: 1.5 }}>{message}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onCancel}>{cancelLabel || 'ยกเลิก'}</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel || 'ยืนยัน'}
          </button>
        </div>
      </div>
    </div>
  );
}
