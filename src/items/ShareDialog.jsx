import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useToast } from '../toast/ToastContext.jsx';
import { useDevicePreference } from '../hooks/useDevicePreference.js';
import { displayImage, sizedImageUrl, FULL_IMAGE_WIDTH, THUMB_IMAGE_WIDTH } from './imageUrl.js';
import { buildShareText } from './shareText.js';
import { prepareShareImage } from './shareImage.js';
import { currentDevice } from '../settings/deviceInfo.js';

// SPEC.md section 23: share an artwork with a client - the photo itself and
// a clean caption, in two taps.
//
// iPhone only opens the share sheet straight from the tap, so the photo is
// prepared as soon as this window opens - never after "share" is pressed.
const OFFER_LINK_AFTER_MS = 6000;

export default function ShareDialog({ item, onClose }) {
  const { t } = useI18n();
  const { showToast, showErrorToast } = useToast();
  const [lang, setLang] = useDevicePreference('gallery_share_lang', 'he', ['he', 'en']);
  const [priceChoice, setPriceChoice] = useDevicePreference('gallery_share_price', '1', ['1', '0']);
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

  const previewSrc = useMemo(() => {
    if (image.file) return URL.createObjectURL(image.file);
    const photo = displayImage(item);
    if (!photo) return null;
    return photo.startsWith('data:') ? photo : sizedImageUrl(photo, THUMB_IMAGE_WIDTH);
  }, [image.file, item]);
  useEffect(() => () => { if (image.file && previewSrc) URL.revokeObjectURL(previewSrc); }, [image.file, previewSrc]);

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
    const withFile = image.file && navigator.canShare?.({ files: [image.file] });
    const text = !withFile && photoLink ? `${caption}\n${photoLink}` : caption;
    if (!canShareSheet) {
      copy(text, t('share.copied'));
      return;
    }
    // WhatsApp on iPhone sometimes drops the caption next to a photo - it's
    // on the clipboard too, ready to paste.
    if (withFile) navigator.clipboard?.writeText(caption).catch(() => {});
    navigator.share(withFile ? { files: [image.file], text } : { text })
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
    const url = URL.createObjectURL(image.file);
    const a = document.createElement('a');
    a.href = url;
    a.download = image.file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const loading = image.state === 'loading';
  let status = null;
  if (image.state === 'none') status = <p className="share-note">{t('share.noPhoto')}</p>;
  if (loading) status = <p className="share-note" role="status">{t('share.preparing')}</p>;
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

        <div className="share-preview-card">
          {previewSrc && <img src={previewSrc} alt="" className="share-preview-img" referrerPolicy="no-referrer" />}
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
            <button type="button" className="primary" onClick={share} disabled={loading && !slow} autoFocus>
              {loading && !slow ? t('share.preparing') : loading ? t('share.withoutWaiting') : t('actions.share')}
            </button>
          ) : (
            image.file && <button type="button" className="primary" onClick={download}>{t('share.download')}</button>
          )}
        </div>
        <button type="button" className="link-btn share-copy" onClick={() => copy(!image.file && photoLink ? `${caption}\n${photoLink}` : caption, t('share.captionCopied'))}>
          {t('share.copyCaption')}
        </button>
      </div>
    </div>
  );
}
