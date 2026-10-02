import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useToast } from '../toast/ToastContext.jsx';
import { displayImage, sizedImageUrl, FULL_IMAGE_WIDTH } from './imageUrl.js';

// SPEC.md 19.5: share an artwork with a client - the phone's own share
// sheet (WhatsApp, email, messages...) with the photo and a ready text.
// Where the photo itself can't be attached, a link to it is sent instead;
// with no share sheet at all (some computers), the text is copied.

export function buildShareText(item, { includePrice, t }) {
  const sold = item.availability_status === 'sold';
  const details = [item.size, item.type].filter(Boolean).join(' · ');
  const hasPrice = item.price != null && item.price !== '';
  let priceLine = '';
  if (sold) priceLine = t('filters.sold');
  else if (includePrice && hasPrice) priceLine = `$${Number(item.price).toLocaleString()}`;
  return [item.name, details, priceLine].filter(Boolean).join('\n');
}

async function photoAsFile(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    return new File([blob], 'artwork.jpg', { type: blob.type });
  } catch {
    return null; // e.g. the image host doesn't allow it - a link is sent instead
  }
}

export default function ShareDialog({ item, onClose }) {
  const { t } = useI18n();
  const { showToast, showErrorToast } = useToast();
  const [includePrice, setIncludePrice] = useState(true);
  const [busy, setBusy] = useState(false);
  const text = buildShareText(item, { includePrice, t });
  const photo = displayImage(item);
  const photoUrl = photo && !photo.startsWith('data:') ? sizedImageUrl(photo, FULL_IMAGE_WIDTH) : null;

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function share() {
    setBusy(true);
    try {
      const withLink = photoUrl ? `${text}\n${photoUrl}` : text;
      if (typeof navigator.share === 'function') {
        const file = await photoAsFile(photo);
        const data = file && navigator.canShare?.({ files: [file] })
          ? { title: item.name, text, files: [file] }
          : { title: item.name, text: withLink };
        try {
          await navigator.share(data);
        } catch (err) {
          if (err?.name === 'AbortError') return; // the user closed the share sheet - not a failure
          throw err;
        }
        onClose();
        return;
      }
      await navigator.clipboard.writeText(withLink);
      showToast(t('share.copied'));
      onClose();
    } catch (err) {
      showErrorToast(t('errors.shareFailed'), 'share', err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal confirm-modal share-dialog" role="dialog" aria-labelledby="share-title">
        <h2 className="serif" id="share-title">{t('share.title')}</h2>
        <pre className="share-preview" dir="auto">{text}</pre>
        <label className="share-price">
          <input type="checkbox" checked={includePrice} onChange={(e) => setIncludePrice(e.target.checked)} />
          {t('share.includePrice')}
        </label>
        <div className="confirm-actions">
          <button type="button" onClick={onClose}>{t('actions.cancel')}</button>
          <button type="button" className="primary" onClick={share} disabled={busy} autoFocus>
            {t('actions.share')}
          </button>
        </div>
      </div>
    </div>
  );
}
