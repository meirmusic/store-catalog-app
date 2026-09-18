import { useEffect } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock.js';

// Full-size view of an item's photo - staff need to actually inspect an
// artwork's condition/detail, not just recognize it from a small card
// thumbnail. Opened from ItemCard's thumbnail and from ImageField's
// preview in the edit form; closes on backdrop click, the close button,
// or Escape.
export default function ImageLightbox({ src, alt, onClose }) {
  const { t } = useI18n();
  useBodyScrollLock();

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="lightbox-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <button type="button" className="lightbox-close" onClick={onClose} aria-label={t('actions.close')} title={t('actions.close')}>
        ×
      </button>
      <img src={src} alt={alt || ''} referrerPolicy="no-referrer" className="lightbox-img" />
    </div>
  );
}
