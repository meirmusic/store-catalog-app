import { useI18n } from '../i18n/I18nContext.jsx';

// Resizes to a max width and re-encodes as JPEG before it ever reaches
// state - see SPEC.md "תמונות": keeps upload payloads small on a
// spotty connection instead of shipping a multi-MB phone photo.
function resizeImageFile(file, maxWidth = 900, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function ImageField({ value, onChange }) {
  const { t } = useI18n();

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await resizeImageFile(file);
    onChange(dataUrl);
    e.target.value = '';
  }

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <div
        style={{
          width: 76,
          height: 96,
          borderRadius: 8,
          overflow: 'hidden',
          background: 'var(--stone)',
          border: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '0 0 auto',
        }}
      >
        {value ? (
          <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: '1.4rem' }}>🖼️</span>
        )}
      </div>
      <div style={{ flex: 1 }}>
        <label style={{ display: 'block', fontSize: '.8rem', color: 'var(--ink-dim)', marginBottom: 5 }}>
          {t('fields.image')}
        </label>
        <input type="file" accept="image/*" capture="environment" onChange={handleFile} />
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="btn"
            style={{ marginTop: 6, display: 'block' }}
          >
            {t('actions.removeImage')}
          </button>
        )}
      </div>
    </div>
  );
}
