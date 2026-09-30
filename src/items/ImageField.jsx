import { useId, useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import ImageLightbox from './ImageLightbox.jsx';
import { sizedImageUrl, THUMB_IMAGE_WIDTH, FULL_IMAGE_WIDTH } from './imageUrl.js';

// A file input's `capture` attribute is what tells mobile browsers to open
// the camera directly - but on iOS, once the app is installed to the home
// screen (standalone mode), a file input with `capture` set silently fails
// to open anything at all (a known WebKit bug - see TEST_PLAN.md REG-008).
// Exported so this decision is unit-testable without a real device - see
// tests/unit/image-capture.spec.js.
export function shouldOmitCameraCapture(nav) {
  const isIos = /iP(hone|od|ad)/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  return isIos && nav.standalone === true;
}

// SPEC.md section 10: fit within 1600x2400 (never upscaled) and re-encode as
// JPEG before it ever reaches state, keeping uploads well under 1MB while
// staying sharp enough to inspect an artwork when enlarged.
const MAX_WIDTH = 1600;
const MAX_HEIGHT = 2400;
const JPEG_QUALITY = 0.8;

function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('the file could not be decoded as an image'));
      img.onload = () => {
        const scale = Math.min(1, MAX_WIDTH / img.width, MAX_HEIGHT / img.height);
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        // JPEG has no transparency - without a fill, transparent pixels
        // come out black.
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// `pending`: this photo is saved but not uploaded yet (SPEC.md section 10).
// `onBusyChange`: the form locks "save" while a photo is still being
// processed, so a save mid-processing can't drop the chosen photo.
export default function ImageField({ value, onChange, pending, onBusyChange }) {
  const { t } = useI18n();
  const [zoomed, setZoomed] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const cameraId = useId();
  const galleryId = useId();

  async function handleFile(e) {
    const input = e.target;
    const file = input.files[0];
    input.value = ''; // so choosing the same file again still fires onChange
    if (!file) return;
    setError('');
    setProcessing(true);
    onBusyChange?.(true);
    try {
      // Test-only hook (tests/e2e/image-field.spec.js), like __testSlowSave
      // in ItemForm: widens the processing window so it can be observed.
      if (typeof window !== 'undefined' && window.__testSlowImageProcessing) {
        await new Promise((resolve) => setTimeout(resolve, window.__testSlowImageProcessing));
      }
      onChange(await resizeImageFile(file));
    } catch (err) {
      console.error('[image] could not read the chosen file', err);
      setError(t('image.unreadable'));
    } finally {
      setProcessing(false);
      onBusyChange?.(false);
    }
  }

  const isLocal = typeof value === 'string' && value.startsWith('data:');

  return (
    <div className="image-field">
      <div
        className="image-preview"
        onClick={value && !processing ? () => setZoomed(true) : undefined}
        style={{ cursor: value && !processing ? 'zoom-in' : 'default' }}
      >
        {value ? (
          <img src={isLocal ? value : sizedImageUrl(value, THUMB_IMAGE_WIDTH)} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span style={{ fontSize: '1.4rem' }}>🖼️</span>
        )}
        {processing && <div className="image-processing" role="status">{t('image.processing')}</div>}
        {pending && !processing && <span className="pending-badge">{t('image.pendingUpload')}</span>}
      </div>
      {zoomed && (
        <ImageLightbox src={isLocal ? value : sizedImageUrl(value, FULL_IMAGE_WIDTH)} onClose={() => setZoomed(false)} />
      )}
      <div className="image-controls">
        <span className="image-label">{t('fields.image')}</span>
        {/* The app's own buttons in the app's language - the browser's file
            control shows its text in the browser's language. Same two
            buttons on every device (SPEC.md section 10): on a computer,
            browsers ignore `capture` and both open the file dialog. */}
        <div className="image-buttons">
          <input
            id={cameraId}
            type="file"
            accept="image/*"
            className="visually-hidden"
            disabled={processing}
            {...(shouldOmitCameraCapture(navigator) ? {} : { capture: 'environment' })}
            onChange={handleFile}
          />
          <label htmlFor={cameraId} className="btn">{t('image.takePhoto')}</label>
          <input
            id={galleryId}
            type="file"
            accept="image/*"
            className="visually-hidden"
            disabled={processing}
            onChange={handleFile}
          />
          <label htmlFor={galleryId} className="btn">{t('image.choose')}</label>
          {value && !processing && (
            <button type="button" onClick={() => onChange(null)} className="btn">
              {t('actions.removeImage')}
            </button>
          )}
        </div>
        {error && <p className="image-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
