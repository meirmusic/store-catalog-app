import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import ImageLightbox from './ImageLightbox.jsx';

export default function ItemCard({ item, onClick }) {
  const { t } = useI18n();
  const sold = item.availability_status === 'sold';
  const [zoomed, setZoomed] = useState(false);

  return (
    <article className={`card${sold ? ' sold' : ''}`} onClick={onClick}>
      <div className="thumb">
        {item.image_url ? (
          <>
            <img src={item.image_url} alt={item.name} loading="lazy" />
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
      {zoomed && <ImageLightbox src={item.image_url} alt={item.name} onClose={() => setZoomed(false)} />}
      <div className="body">
        <div className="name">{item.name}</div>
        <div className="meta">
          {item.size}
          {item.location ? ` · ${item.location}` : ''}
        </div>
        <div className="badges">
          <span className={`badge ${sold ? 'sold' : 'available'}`}>
            {sold ? t('filters.sold') : t('filters.available')}
          </span>
          {item.type && <span className="badge">{item.type}</span>}
          {item.physical_status && <span className="badge">{item.physical_status}</span>}
          {!item.serial_number && <span className="badge missing">{t('filters.missingSerial')}</span>}
          {!item.sku && <span className="badge missing">{t('filters.missingSku')}</span>}
        </div>
        <div className="idline">
          <span>
            {item.sku ? `${t('fields.sku')} ${item.sku}` : ''}
            {item.serial_number ? ` #${item.serial_number}` : ''}
          </span>
          {item.price != null && item.price !== '' ? (
            <span className="price">₪{Number(item.price).toLocaleString()}</span>
          ) : (
            <span className="badge missing">{t('filters.missingPrice')}</span>
          )}
        </div>
      </div>
    </article>
  );
}
