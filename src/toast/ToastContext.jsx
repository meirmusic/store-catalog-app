import { createContext, useCallback, useContext, useRef, useState } from 'react';

// UI_STANDARD_GAP_ANALYSIS.md ACT-03/MSG-06: a success confirmation
// dismisses itself automatically; an error one stays until the user
// closes it (MSG-06). MSG-07: never more than one floating message at
// once - a new toast replaces whatever is currently showing rather than
// stacking.
const ToastContext = createContext(null);
const DEFAULT_DURATION = 3500;

export function ToastProvider({ children }) {
  const [toast, setToastState] = useState(null); // { message, type: 'success' | 'error', action?: { label, onClick } }
  const toastRef = useRef(null);
  const timerRef = useRef(null);

  const setToast = useCallback((value) => {
    toastRef.current = value;
    setToastState(value);
  }, []);

  const dismissToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(null);
  }, [setToast]);

  // `background`: a message the user didn't directly trigger (e.g. "synced")
  // - it must never replace an error still waiting to be read, or a message
  // that offers an action (e.g. undo a delete) while it's still offered.
  // `action`: { label, onClick } - a button in the message (SPEC.md 11).
  const showToast = useCallback((message, { type = 'success', duration = DEFAULT_DURATION, background = false, action } = {}) => {
    if (background && (toastRef.current?.type === 'error' || toastRef.current?.action)) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, type, action });
    if (type !== 'error') {
      timerRef.current = setTimeout(() => setToast(null), duration);
    }
  }, [setToast]);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {toast && (
        <div className="toast-wrap">
          <div className={`toast${toast.type === 'error' ? ' error' : ''}`} role="status">
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => { const { onClick } = toast.action; dismissToast(); onClick(); }}
              >
                {toast.action.label}
              </button>
            )}
            {toast.type === 'error' && (
              <button type="button" className="toast-close" onClick={dismissToast} aria-label="סגור">×</button>
            )}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
