import { useEffect } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useBackToClose } from '../hooks/useBackToClose.js';

// SPEC.md 20.1: a warning, not a block - sometimes a shared value is right
// (e.g. one SKU for prints of the same artwork). "Back to editing" is the
// default; Esc and a click outside do the same.
export default function DuplicateConfirm({ duplicates, onSaveAnyway, onBack }) {
  useBackToClose(onBack); // SPEC.md 26.1 - "back" = the safe choice
  const { t } = useI18n();

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onBack();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onBack]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onBack()}>
      <div className="modal confirm-modal duplicate-confirm" role="alertdialog" aria-labelledby="duplicate-title">
        <h2 className="serif" id="duplicate-title">{t('duplicate.title')}</h2>
        {duplicates.map((d) => (
          <p className="sub" key={d.field}>
            {t(d.field === 'sku' ? 'duplicate.sku' : 'duplicate.serial').replace('{value}', d.value).replace('{name}', d.name ?? '')}
          </p>
        ))}
        <div className="confirm-actions">
          <button type="button" className="primary" onClick={onBack} autoFocus>{t('duplicate.back')}</button>
          <button type="button" onClick={onSaveAnyway}>{t('duplicate.saveAnyway')}</button>
        </div>
      </div>
    </div>
  );
}
