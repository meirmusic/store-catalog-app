import { useEffect } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock.js';
import { useBackToClose } from '../hooks/useBackToClose.js';

// SPEC.md section 15: the app's own dialog, not window.confirm (whose
// buttons are in the browser's language). Signing out affects this device
// only. Esc and clicking outside cancel; "cancel" starts focused.
export default function SignOutConfirm({ onCancel, onConfirm }) {
  useBackToClose(onCancel); // SPEC.md 26.1 - "back" = the safe choice
  const { t } = useI18n();
  useBodyScrollLock();

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal confirm-modal signout-confirm" role="alertdialog" aria-labelledby="signout-title">
        <h2 className="serif" id="signout-title">{t('identity.signOutTitle')}</h2>
        <p className="sub">{t('identity.signOutHint')}</p>
        <div className="confirm-actions">
          <button type="button" onClick={onCancel} autoFocus>{t('actions.cancel')}</button>
          <button type="button" className="danger" onClick={onConfirm}>{t('identity.signOutConfirm')}</button>
        </div>
      </div>
    </div>
  );
}
