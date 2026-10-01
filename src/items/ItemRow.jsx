import { useI18n } from '../i18n/I18nContext.jsx';
import { displayImage, sizedImageUrl } from './imageUrl.js';
import { formatWhen } from './formatWhen.js';

// SPEC.md 19.6: the list view - one compact row per artwork, for scanning
// many quickly. Tapping it opens the form, like a card.
const ROW_IMAGE_WIDTH = 160;

export default function ItemRow({ item, onClick, showModified = false }) {
  const { t } = useI18n();
  const sold = item.availability_status === 'sold';
  const photo = displayImage(item);
  const ids = [item.sku ? `${t('fields.sku')} ${item.sku}` : '', item.serial_number ? `#${item.serial_number}` : '']
    .filter(Boolean)
    .join(' ');

  return (
    <article className={`item-row${sold ? ' sold' : ''}`} onClick={onClick}>
      <div className="row-thumb">
        {photo ? (
          <img src={item.pending_image ? photo : sizedImageUrl(photo, ROW_IMAGE_WIDTH)} alt="" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <span>🖼️</span>
        )}
      </div>
      <div className="row-main">
        <div className="name">{item.name}</div>
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
      </div>
    </article>
  );
}
