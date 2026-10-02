import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useToast } from '../toast/ToastContext.jsx';
import { useDevicePreference } from '../hooks/useDevicePreference.js';
import { displayImage, sizedImageUrl, FULL_IMAGE_WIDTH, THUMB_IMAGE_WIDTH } from './imageUrl.js';
import { buildShareText } from './shareText.js';
import { prepareShareImage } from './shareImage.js';
import { buildShareCard } from './shareCard.js';
import { currentDevice } from '../settings/deviceInfo.js';

// SPEC.md section 23: share an artwork with a client - the designed card
// (23.5) or the photo itself, and a clean caption, in two taps.
//
// iPhone only opens the share sheet straight from the tap, so the photo is
// prepared as soon as this window opens - never after "share" is pressed.
const OFFER_LINK_AFTER_MS = 6000;

export default function ShareDialog({ item, onClose }) {
  const { t } = useI18n();
  const { showToast, showErrorToast } = useToast();
  const [lang, setLang] = useDevicePreference('gallery_share_lang', 'he', ['he', 'en']);
  const [priceChoice, setPriceChoice] = useDevicePreference('gallery_share_price', '1', ['1', '0']);
  const [format, setFormat] = useDevicePreference('gallery_share_format', 'card', ['card', 'photo']);
  const sold = item.availability_status === 'sold';
  const includePrice = priceChoice === '1';
  const caption = buildShareText(item, { lang, includePrice });

  const hasPhoto = Boolean(displayImage(item));
  const [image, setImage] = useState({ state: hasPhoto ? 'loading' : 'none', file: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const [slow, setSlow] = useState(false);
  const photoLink = item.image_url ? sizedImageUrl(item.image_url, FULL_IMAGE_WIDTH) : null;
  const canShareSheet = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const device = useMemo(() => currentDevice(), []);
  const isApple = device.device === 'iPhone' || device.device === 'iPad';

  useEffect(() => {
    if (!hasPhoto) return undefined;
    let cancelled = false;
    setImage({ state: 'loading', file: null, error: null });
    setSlow(false);
    const slowTimer = setTimeout(() => !cancelled && setSlow(true), OFFER_LINK_AFTER_MS);
    prepareShareImage(item)
      .then((file) => !cancelled && setImage(file ? { state: 'ready', file, error: null } : { state: 'none', file: null, error: null }))
      .catch((error) => !cancelled && setImage({ state: 'failed', file: null, error }));
    return () => { cancelled = true; clearTimeout(slowTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.row_id, item.image_url, item.pending_image, attempt]);

  // The card is built as soon as the photo is ready, and again when the
  // language or price changes - always before "share" is pressed (23.3).
  // A card that can't be built is an error, never silently swapped for the
  // photo (SPEC.md 23.5): the client gets what the user saw and chose.
  const [card, setCard] = useState({ state: 'idle', file: null });
  const [cardAttempt, setCardAttempt] = useState(0);
  // Card mode from the first moment: while the photo is still coming, the
  // card's frame is shown - not the plain photo, which would then be
  // replaced by the card (a flash of something that won't be sent).
  const cardMode = format === 'card' && (image.state === 'loading' || image.state === 'ready');
  const wantCard = cardMode && Boolean(image.file);
  useEffect(() => {
    if (!wantCard) {
      setCard({ state: 'idle', file: null });
      return undefined;
    }
    let cancelled = false;
    setCard({ state: 'loading', file: null });
    buildShareCard(image.file, item, { lang, includePrice })
      .then((file) => !cancelled && setCard({ state: 'ready', file }))
      .catch((error) => {
        if (cancelled) return;
        showErrorToast(t('errors.cardFailed'), 'shareCard', error);
        setCard({ state: 'failed', file: null });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantCard, image.file, lang, includePrice, item.name, item.size, item.type, item.price, item.availability_status, cardAttempt]);

  const useCard = cardMode;
  const cardFailed = useCard && card.state === 'failed';
  const shareFile = useCard ? card.file : image.file;
  const shownFile = useCard ? card.file : image.file;
  const previewSrc = useMemo(() => {
    if (shownFile) return URL.createObjectURL(shownFile);
    if (useCard) return null; // the card is on its way
    const photo = displayImage(item);
    if (!photo) return null;
    return photo.startsWith('data:') ? photo : sizedImageUrl(photo, THUMB_IMAGE_WIDTH);
  }, [shownFile, useCard, item]);
  useEffect(() => () => { if (shownFile && previewSrc) URL.revokeObjectURL(previewSrc); }, [shownFile, previewSrc]);

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

  function copy(text, message) {
    return navigator.clipboard.writeText(text).then(
      () => message && showToast(message),
      () => {}, // clipboard blocked - nothing more to do
    );
  }

  // Everything up to navigator.share() is synchronous: no waiting between
  // the tap and the share sheet (iPhone requirement, SPEC.md 23.3).
  function share() {
    const withFile = shareFile && navigator.canShare?.({ files: [shareFile] });
    const text = !withFile && photoLink ? `${caption}\n${photoLink}` : caption;
    if (!canShareSheet) {
      copy(text, t('share.copied'));
      return;
    }
    // WhatsApp on iPhone sometimes drops the caption next to a photo - it's
    // on the clipboard too, ready to paste.
    if (withFile) navigator.clipboard?.writeText(caption).catch(() => {});
    navigator.share(withFile ? { files: [shareFile], text } : { text })
      .then(() => {
        onClose();
        if (withFile && isApple) showToast(t('share.iosHint'));
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return; // closed the share sheet - not a failure
        showErrorToast(t('errors.shareFailed'), 'share', err);
      });
  }

  function download() {
    const url = URL.createObjectURL(shareFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = shareFile.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const loading = image.state === 'loading';
  const cardPending = useCard && !cardFailed && card.state !== 'ready';
  let status = null;
  if (image.state === 'none') status = <p className="share-note">{t('share.noPhoto')}</p>;
  if (loading) status = <p className="share-note" role="status">{t('share.preparing')}</p>;
  if (cardPending) status = <p className="share-note" role="status">{t('share.preparingCard')}</p>;
  if (cardFailed) {
    status = (
      <p className="share-note share-failed" role="status">
        {t('share.cardFailed')}{' '}
        <button type="button" className="link-btn" onClick={() => setCardAttempt((a) => a + 1)}>{t('share.retry')}</button>
      </p>
    );
  }
  if (image.state === 'failed') {
    status = (
      <p className="share-note share-failed" role="status">
        {t('share.photoFailed')}{' '}
        <button type="button" className="link-btn" onClick={() => setAttempt((a) => a + 1)}>{t('share.retry')}</button>
      </p>
    );
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal confirm-modal share-dialog" role="dialog" aria-labelledby="share-title">
        <h2 className="serif" id="share-title">{t('share.title')}</h2>

        {(image.state === 'loading' || image.state === 'ready') && (
          <div className="share-format" role="group" aria-label={t('share.format')}>
            <button type="button" className={format === 'card' ? 'on' : ''} aria-pressed={format === 'card'} onClick={() => setFormat('card')}>{t('share.formatCard')}</button>
            <button type="button" className={format === 'photo' ? 'on' : ''} aria-pressed={format === 'photo'} onClick={() => setFormat('photo')}>{t('share.formatPhoto')}</button>
          </div>
        )}

        <div className="share-preview-card">
          {previewSrc && <img src={previewSrc} alt="" className={useCard ? 'share-preview-img share-card-img' : 'share-preview-img'} referrerPolicy="no-referrer" />}
          {useCard && !previewSrc && <div className="share-card-placeholder" aria-hidden="true" />}
          <pre className="share-preview" dir={lang === 'he' ? 'rtl' : 'ltr'}>{caption}</pre>
        </div>
        {status}

        <div className="share-options">
          <div className="share-lang" role="group" aria-label={t('share.language')}>
            <span>{t('share.language')}:</span>
            <button type="button" className={lang === 'he' ? 'on' : ''} aria-pressed={lang === 'he'} onClick={() => setLang('he')}>עברית</button>
            <button type="button" className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
          </div>
          {!sold && (
            <label className="share-price">
              <input type="checkbox" checked={includePrice} onChange={(e) => setPriceChoice(e.target.checked ? '1' : '0')} />
              {t('share.includePrice')}
            </label>
          )}
        </div>

        <div className="confirm-actions">
          <button type="button" onClick={onClose}>{t('actions.cancel')}</button>
          {canShareSheet ? (
            <button type="button" className="primary" onClick={share} disabled={(loading && !slow) || (!loading && (cardPending || cardFailed))} autoFocus>
              {loading && !slow ? t('share.preparing') : loading ? t('share.withoutWaiting') : cardPending ? t('share.preparingCard') : t('actions.share')}
            </button>
          ) : (
            shareFile && <button type="button" className="primary" onClick={download}>{useCard ? t('share.downloadCard') : t('share.download')}</button>
          )}
        </div>
        <button type="button" className="link-btn share-copy" onClick={() => copy(!image.file && photoLink ? `${caption}\n${photoLink}` : caption, t('share.captionCopied'))}>
          {t('share.copyCaption')}
        </button>
      </div>
    </div>
  );
}
