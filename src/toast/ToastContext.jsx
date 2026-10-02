import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { reportError } from '../errors/errorReporting.js';
import ErrorDetails from '../errors/ErrorDetails.jsx';

// UI_STANDARD_GAP_ANALYSIS.md ACT-03/MSG-06: a success confirmation
// dismisses itself automatically; an error one stays until the user
// closes it (MSG-06). MSG-07: never more than one floating message at
// once - a new toast replaces whatever is currently showing rather than
// stacking.
const ToastContext = createContext(null);
const DEFAULT_DURATION = 3500;
// SPEC.md 22.3: a message the user caused stays at least this long before a
// background one ("synced") may replace it - that one waits instead.
const MIN_VISIBLE_MS = 1500;

export function ToastProvider({ children }) {
  const [toast, setToastState] = useState(null); // { message, type: 'success' | 'error', action?: { label, onClick } }
  const toastRef = useRef(null);
  const timerRef = useRef(null);
  const shownAtRef = useRef(0);
  const pendingBackgroundRef = useRef(null);

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
  const showToast = useCallback(function show(message, options = {}) {
    const { type = 'success', duration = DEFAULT_DURATION, background = false, action, code, details } = options;
    if (background && (toastRef.current?.type === 'error' || toastRef.current?.action)) return;
    if (pendingBackgroundRef.current) {
      clearTimeout(pendingBackgroundRef.current);
      pendingBackgroundRef.current = null;
    }
    if (background && toastRef.current && !toastRef.current.background) {
      const shownFor = Date.now() - shownAtRef.current;
      if (shownFor < MIN_VISIBLE_MS) {
        pendingBackgroundRef.current = setTimeout(() => {
          pendingBackgroundRef.current = null;
          show(message, options);
        }, MIN_VISIBLE_MS - shownFor);
        return;
      }
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    shownAtRef.current = Date.now();
    setToast({ message, type, action, code, details, background });
    if (type !== 'error') {
      timerRef.current = setTimeout(() => setToast(null), duration);
    }
  }, [setToast]);

  // SPEC.md section 17: a failed action shows its message plus the error code
  // and the exact technical error, and the error is queued for the ErrorLog.
  const showErrorToast = useCallback((message, actionName, error, { log = true } = {}) => {
    const { code, details } = reportError(actionName, error, { log });
    showToast(message, { type: 'error', code, details });
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, showErrorToast, dismissToast }}>
      {children}
      {toast && (
        <div className="toast-wrap">
          <div className={`toast${toast.type === 'error' ? ' error' : ''}`} role="status">
            <div className="toast-body">
              <span>{toast.message}</span>
              {(toast.code || toast.details) && <ErrorDetails code={toast.code} details={toast.details} />}
            </div>
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
