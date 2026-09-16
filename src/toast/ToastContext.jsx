import { createContext, useCallback, useContext, useRef, useState } from 'react';

// UI_STANDARD_GAP_ANALYSIS.md ACT-03/MSG-06: a success confirmation
// dismisses itself automatically; an error one stays until the user
// closes it (MSG-06). MSG-07: never more than one floating message at
// once - a new toast replaces whatever is currently showing rather than
// stacking.
const ToastContext = createContext(null);
const DEFAULT_DURATION = 3500;

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null); // { message, type: 'success' | 'error' }
  const timerRef = useRef(null);

  const dismissToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(null);
  }, []);

  const showToast = useCallback((message, { type = 'success', duration = DEFAULT_DURATION } = {}) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, type });
    if (type !== 'error') {
      timerRef.current = setTimeout(() => setToast(null), duration);
    }
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {toast && (
        <div className="toast-wrap">
          <div className={`toast${toast.type === 'error' ? ' error' : ''}`} role="status">
            <span>{toast.message}</span>
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
