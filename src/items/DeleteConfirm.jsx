import { useEffect } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock.js';
import { useBackToClose } from '../hooks/useBackToClose.js';

// SPEC.md section 11: Esc and clicking outside cancel; "cancel" starts
// focused, so the safe choice is the default one.
export default function DeleteConfirm({ item, onCancel, onConfirm }) {
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
      <div className="modal confirm-modal" role="alertdialog" aria-labelledby="delete-title">
        <h2 className="serif" id="delete-title">{t('delete.title')}</h2>
        <p className="sub">{item.name}</p>
        <div className="confirm-actions">
          <button type="button" onClick={onCancel} autoFocus>{t('actions.cancel')}</button>
          <button type="button" className="danger" onClick={onConfirm}>{t('delete.confirm')}</button>
        </div>
      </div>
    </div>
  );
}
