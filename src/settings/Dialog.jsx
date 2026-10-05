import { useEffect } from 'react';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock.js';
import { useBackToClose } from '../hooks/useBackToClose.js';

// A small app dialog for the ⚙ menu's windows (SPEC.md 21): Esc and a click
// outside close it.
export default function Dialog({ className = '', labelledBy, onClose, children }) {
  useBackToClose(onClose); // SPEC.md 26.1
  useBodyScrollLock();
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal confirm-modal ${className}`} role="dialog" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>
  );
}
