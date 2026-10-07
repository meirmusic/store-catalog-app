import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useToast } from '../toast/ToastContext.jsx';
import { useDevicePreference } from '../hooks/useDevicePreference.js';
import { displayImage } from './imageUrl.js';
import { INSTAGRAM_URL } from './shareText.js';
import { prepareShareImage } from './shareImage.js';
import { buildShareCard } from './shareCard.js';
import { currentDevice } from '../settings/deviceInfo.js';
import { useBackToClose } from '../hooks/useBackToClose.js';

// SPEC.md 28.1: one way to share - the designed card as a picture, with the
// link to Yossi Bitton's Instagram. The only choice: include the price.
//
// iPhone only opens the share sheet straight from the tap, so the card is
// built as soon as this window opens - never after "share" is pressed.
// Nothing is ever sent in the card's place (no caption, no photo link).
export default function ShareDialog({ item, onClose }) {
  useBackToClose(onClose); // SPEC.md 26.1
  const { t } = useI18n();
  const { showToast, showErrorToast } = useToast();
  const [priceChoice, setPriceChoice] = useDevicePreference('gallery_share_price', '1', ['1', '0']);
  const sold = item.availability_status === 'sold';
  const includePrice = priceChoice === '1' && !sold;

  const hasPhoto = Boolean(displayImage(item));
  const [photo, setPhoto] = useState({ state: hasPhoto ? 'loading' : 'none', file: null });
  const [photoAttempt, setPhotoAttempt] = useState(0);
  const [card, setCard] = useState({ state: 'idle', file: null });
  const [cardAttempt, setCardAttempt] = useState(0);
  const canShareSheet = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const device = useMemo(() => currentDevice(), []);
  const isApple = device.device === 'iPhone' || device.device === 'iPad';

  // The artwork's photo: from the device, or the server (SPEC.md 23.3).
  useEffect(() => {
    if (!hasPhoto) return undefined;
    let cancelled = false;
    setPhoto({ state: 'loading', file: null });
    prepareShareImage(item)
      .then((file) => !cancelled && setPhoto(file ? { state: 'ready', file } : { state: 'none', file: null }))
      .catch((error) => {
        if (cancelled) return;
        showErrorToast(t('errors.sharePhotoFailed'), 'sharePhoto', error, { log: navigator.onLine });
        setPhoto({ state: 'failed', file: null });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.row_id, item.image_url, item.pending_image, photoAttempt]);

  // The card - built again when the price choice changes.
  useEffect(() => {
    if (!photo.file) {
      setCard({ state: 'idle', file: null });
      return undefined;
    }
    let cancelled = false;
    setCard({ state: 'loading', file: null });
    buildShareCard(photo.file, item, { includePrice })
      .then((file) => !cancelled && setCard({ state: 'ready', file }))
      .catch((error) => {
        if (cancelled) return;
        showErrorToast(t('errors.cardFailed'), 'shareCard', error);
        setCard({ state: 'failed', file: null });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.file, includePrice, item.name, item.name_en, item.size, item.type, item.price, item.availability_status, cardAttempt]);

  const previewSrc = useMemo(() => (card.file ? URL.createObjectURL(card.file) : null), [card.file]);
  useEffect(() => () => { if (previewSrc) URL.revokeObjectURL(previewSrc); }, [previewSrc]);

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

  const ready = card.state === 'ready' && card.file;
  const canShareFile = ready && canShareSheet && (navigator.canShare?.({ files: [card.file] }) ?? false);

  // Everything up to navigator.share() is synchronous: no waiting between
  // the tap and the share sheet (iPhone requirement, SPEC.md 23.3).
  function share() {
    // WhatsApp on iPhone sometimes drops the text next to a picture - the
    // link is on the clipboard too, ready to paste.
    navigator.clipboard?.writeText(INSTAGRAM_URL).catch(() => {});
    navigator.share({ files: [card.file], text: INSTAGRAM_URL })
      .then(() => {
        onClose();
        if (isApple) showToast(t('share.iosHint'));
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return; // closed the share sheet - not a failure
        showErrorToast(t('errors.shareFailed'), 'share', err);
      });
  }

  function download() {
    const url = URL.createObjectURL(card.file);
    const a = document.createElement('a');
    a.href = url;
    a.download = card.file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function copyLink() {
    navigator.clipboard.writeText(INSTAGRAM_URL).then(() => showToast(t('share.linkCopied')), () => {});
  }

  let status = null;
  if (photo.state === 'none') status = <p className="share-note share-failed" role="status">{t('share.noPhoto')}</p>;
  else if (photo.state === 'failed') {
    status = (
      <p className="share-note share-failed" role="status">
        {t('share.photoFailed')}{' '}
        <button type="button" className="link-btn" onClick={() => setPhotoAttempt((a) => a + 1)}>{t('share.retry')}</button>
      </p>
    );
  } else if (card.state === 'failed') {
    status = (
      <p className="share-note share-failed" role="status">
        {t('share.cardFailed')}{' '}
        <button type="button" className="link-btn" onClick={() => setCardAttempt((a) => a + 1)}>{t('share.retry')}</button>
      </p>
    );
  } else if (!ready) status = <p className="share-note" role="status">{t('share.preparingCard')}</p>;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal confirm-modal share-dialog" role="dialog" aria-labelledby="share-title">
        <h2 className="serif" id="share-title">{t('share.title')}</h2>

        {hasPhoto && (
          <div className="share-preview-card">
            {previewSrc ? (
              <img src={previewSrc} alt="" className="share-preview-img share-card-img" />
            ) : (
              <div className="share-card-placeholder" aria-hidden="true" />
            )}
          </div>
        )}
        {status}
        {ready && <p className="share-note share-with-link">{t('share.withLink')}</p>}

        {!sold && hasPhoto && (
          <label className="share-price">
            <input type="checkbox" checked={includePrice} onChange={(e) => setPriceChoice(e.target.checked ? '1' : '0')} />
            {t('share.includePrice')}
          </label>
        )}

        <div className="confirm-actions">
          <button type="button" onClick={onClose}>{t('actions.cancel')}</button>
          {canShareSheet && (!ready || canShareFile) ? (
            <button type="button" className="primary" onClick={share} disabled={!canShareFile} autoFocus>
              {t('actions.share')}
            </button>
          ) : (
            <button type="button" className="primary" onClick={download} disabled={!ready}>{t('share.downloadCard')}</button>
          )}
        </div>
        {ready && !canShareFile && (
          <button type="button" className="link-btn share-copy" onClick={copyLink}>{t('share.copyLink')}</button>
        )}
      </div>
    </div>
  );
}
