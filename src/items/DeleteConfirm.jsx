import { useI18n } from '../i18n/I18nContext.jsx';

export default function DeleteConfirm({ item, onCancel, onConfirm }) {
  const { t } = useI18n();
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal confirm-modal">
        <h2 className="serif">{t('delete.title')}</h2>
        <p className="sub">{item.name}</p>
        <div className="confirm-actions">
          <button onClick={onCancel}>{t('actions.cancel')}</button>
          <button className="danger" onClick={onConfirm}>{t('delete.confirm')}</button>
        </div>
      </div>
    </div>
  );
}
