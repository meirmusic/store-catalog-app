import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import ImageLightbox from './ImageLightbox.jsx';
import { displayImage, sizedImageUrl, THUMB_IMAGE_WIDTH, FULL_IMAGE_WIDTH } from './imageUrl.js';
import { formatWhen } from './formatWhen.js';

export default function ItemCard({ item, onClick, onShare, showModified = false, highlight = false }) {
  const { t } = useI18n();
  const sold = item.availability_status === 'sold';
  const [zoomed, setZoomed] = useState(false);
  const photo = displayImage(item);
  const isPending = Boolean(item.pending_image);

  return (
    <article className={`card${sold ? ' sold' : ''}${highlight ? ' just-saved' : ''}`} data-row-id={item.row_id} onClick={onClick}>
      <div className="thumb">
        {photo ? (
          <>
            {/* referrerPolicy="no-referrer" (REG-015, real user report): a
                photo that loaded fine when opened directly in its own tab
                still failed to render embedded here - some browser privacy
                extensions specifically block third-party embedded images
                that carry a referrer back to the embedding page. Sending
                none removes that as a reason to block it. */}
            <img src={isPending ? photo : sizedImageUrl(photo, THUMB_IMAGE_WIDTH)} alt={item.name} loading="lazy" referrerPolicy="no-referrer" />
            {isPending && <span className="pending-badge">{t('image.pendingUpload')}</span>}
            {/* A dedicated zoom control, not the whole thumbnail, so
                clicking the photo (a large part of the card) still opens
                the edit form like the rest of the card does - only this
                small button opens the lightbox instead. */}
            <button
              type="button"
              className="thumb-zoom"
              onClick={(e) => { e.stopPropagation(); setZoomed(true); }}
              aria-label={t('actions.zoomImage')}
              title={t('actions.zoomImage')}
            >
              🔍
            </button>
          </>
        ) : (
          <span style={{ fontSize: '1.6rem' }}>🖼️</span>
        )}
        {sold && <div className="ribbon">{t('filters.sold')}</div>}
      </div>
      {zoomed && (
        <ImageLightbox
          src={isPending ? photo : sizedImageUrl(photo, FULL_IMAGE_WIDTH)}
          alt={item.name}
          onClose={() => setZoomed(false)}
        />
      )}
      <div className="body">
        <div className="name">{item.name}</div>
        <div className="meta">
          {item.size}
          {item.location ? ` · ${item.location}` : ''}
        </div>
        {/* SPEC.md 19.7/19.8: "sold" is the ribbon only; no "available" or
            "missing" labels - missing details are found through the filter. */}
        {(item.type || item.physical_status) && (
          <div className="badges">
            {item.type && <span className="badge">{item.type}</span>}
            {item.physical_status && <span className="badge">{item.physical_status}</span>}
          </div>
        )}
        <div className="idline">
          <span>
            {item.sku ? `${t('fields.sku')} ${item.sku}` : ''}
            {item.serial_number ? ` #${item.serial_number}` : ''}
          </span>
          <span className="idline-end">
            {item.price != null && item.price !== '' && (
              <span className="price">${Number(item.price).toLocaleString()}</span>
            )}
            {/* SPEC.md 23.2: share straight from the list. */}
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
          </span>
        </div>
        {showModified && item.last_modified_at && (
          <div className="modified-line">{item.last_modified_by ? `${item.last_modified_by} · ` : ''}{formatWhen(item.last_modified_at, t)}</div>
        )}
      </div>
    </article>
  );
}
