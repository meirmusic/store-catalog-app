import { useEffect } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';

// SPEC.md section 9: asked when closing the item form with unsaved edits.
// Deliberately not window.confirm - its buttons are in the browser's
// language, and its "Cancel" would mean "stay", the opposite of the form's
// own "Cancel". Each button here says exactly what it does.
export default function DiscardConfirm({ onSave, onDiscard, onKeepEditing }) {
  const { t } = useI18n();

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onKeepEditing();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onKeepEditing]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onKeepEditing()}>
      <div className="modal confirm-modal discard-confirm" role="alertdialog" aria-labelledby="discard-title">
        <h2 className="serif" id="discard-title">{t('form.unsavedTitle')}</h2>
        <p className="sub">{t('form.unsavedQuestion')}</p>
        <div className="confirm-actions">
          <button type="button" className="primary" onClick={onSave}>{t('actions.save')}</button>
          <button type="button" className="danger" onClick={onDiscard}>{t('form.discard')}</button>
          <button type="button" onClick={onKeepEditing} autoFocus>{t('form.keepEditing')}</button>
        </div>
      </div>
    </div>
  );
}
