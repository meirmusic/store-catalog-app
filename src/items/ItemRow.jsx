import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import ImageLightbox from './ImageLightbox.jsx';
import { displayImage, sizedImageUrl, FULL_IMAGE_WIDTH } from './imageUrl.js';
import { formatWhen } from './formatWhen.js';

// SPEC.md 19.6: the list view - one compact row per artwork, for scanning
// many quickly. Tapping it opens the form, like a card; tapping the photo
// enlarges it (SPEC.md 24.1) - the whole photo, as a 🔍 inside a 56px
// thumbnail would be too small for a finger.
const ROW_IMAGE_WIDTH = 160;

export default function ItemRow({ item, onClick, onShare, showModified = false }) {
  const { t } = useI18n();
  const sold = item.availability_status === 'sold';
  const photo = displayImage(item);
  const isPending = Boolean(item.pending_image);
  const [zoomed, setZoomed] = useState(false);
  const ids = [item.sku ? `${t('fields.sku')} ${item.sku}` : '', item.serial_number ? `#${item.serial_number}` : '']
    .filter(Boolean)
    .join(' ');

  return (
    <article className={`item-row${sold ? ' sold' : ''}`} onClick={onClick}>
      {photo ? (
        <button
          type="button"
          className="row-thumb row-zoom"
          onClick={(e) => { e.stopPropagation(); setZoomed(true); }}
          aria-label={t('actions.zoomImage')}
          title={t('actions.zoomImage')}
        >
          <img src={isPending ? photo : sizedImageUrl(photo, ROW_IMAGE_WIDTH)} alt="" loading="lazy" referrerPolicy="no-referrer" />
          <span className="row-zoom-mark" aria-hidden="true">🔍</span>
        </button>
      ) : (
        <div className="row-thumb"><span>🖼️</span></div>
      )}
      {zoomed && (
        <ImageLightbox
          src={isPending ? photo : sizedImageUrl(photo, FULL_IMAGE_WIDTH)}
          alt={item.name}
          onClose={() => setZoomed(false)}
        />
      )}
      <div className="row-main">
        <div className="name">{item.name}</div>
        {/* SPEC.md 24.2: as on the card - the photo isn't on the server yet.
            Next to the name, not on the photo: the photo is too small for it. */}
        {isPending && <span className="pending-badge">{t('image.pendingUpload')}</span>}
        <div className="meta">
          {[item.size, item.location].filter(Boolean).join(' · ')}
          {ids ? <span className="row-ids">{ids}</span> : null}
        </div>
        {showModified && item.last_modified_at && (
          <div className="modified-line">{item.last_modified_by ? `${item.last_modified_by} · ` : ''}{formatWhen(item.last_modified_at, t)}</div>
        )}
      </div>
      <div className="row-end">
        {sold ? (
          <span className="row-sold">{t('filters.sold')}</span>
        ) : (
          item.price != null && item.price !== '' && <span className="price">${Number(item.price).toLocaleString()}</span>
        )}
        {onShare && (
          <button
            type="button"
            className="share-icon-btn"
            onClick={(e) => { e.stopPropagation(); onShare(item); }}
            aria-label={t('share.shareArtwork')}
            title={t('share.shareArtwork')}
          >
            ⤴
          </button>
        )}
      </div>
    </article>
  );
}
