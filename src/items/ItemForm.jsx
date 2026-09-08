import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useItems } from './ItemsContext.jsx';
import ImageField from './ImageField.jsx';

function ConfigSelect({ list, value, onChange, config, addConfigValue, label }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  async function confirmAdd() {
    const added = await addConfigValue(list, draft);
    if (added) {
      onChange(added);
      setDraft('');
      setAdding(false);
    }
  }

  return (
    <div className="field">
      <label>{label}</label>
      <div className="select-with-add">
        <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {(config[list] || []).map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <button type="button" className="add-btn" onClick={() => setAdding((a) => !a)}>+</button>
      </div>
      {adding && (
        <div className="inline-add">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), confirmAdd())}
            autoFocus
          />
          <button type="button" className="btn" onClick={confirmAdd}>+</button>
        </div>
      )}
    </div>
  );
}

export default function ItemForm({ item, onClose, onRequestDelete, onSaved }) {
  const { t } = useI18n();
  const { config, saveItem, addConfigValue, queueImageUpload } = useItems();
  const isNew = !item;

  const [name, setName] = useState(item?.name || '');
  const [size, setSize] = useState(item?.size || '');
  const [sku, setSku] = useState(item?.sku || '');
  const [type, setType] = useState(item?.type || '');
  const [location, setLocation] = useState(item?.location || '');
  const [status, setStatus] = useState(item?.physical_status || '');
  const [price, setPrice] = useState(item?.price ?? '');
  const [serial, setSerial] = useState(item?.serial_number || '');
  const [notes, setNotes] = useState(item?.notes || '');
  const [availability, setAvailability] = useState(item?.availability_status || 'available');
  const [imageUrl, setImageUrl] = useState(item?.image_url || null);
  const [error, setError] = useState('');

  function generateSerial() {
    let code = '';
    for (let i = 0; i < 6; i++) code += Math.floor(Math.random() * 10);
    setSerial(code);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('errors.nameRequired'));
      return;
    }
    // A freshly-picked photo is a data: URL - too big to write straight
    // into the Sheet's image_url column (and not what that column is
    // for). Keep the row's previous image_url untouched and upload the
    // new photo separately; the sync engine swaps in the real Drive URL
    // once the upload succeeds.
    const isNewPhoto = imageUrl && imageUrl.startsWith('data:');
    const row_id = await saveItem(
      {
        name: name.trim(),
        size: size.trim() || null,
        sku: sku.trim() || null,
        type: type || null,
        location: location || null,
        physical_status: status || null,
        price: price === '' ? null : Number(price),
        serial_number: serial.trim() || null,
        notes: notes.trim() || null,
        availability_status: availability,
        image_url: isNewPhoto ? (item?.image_url || null) : imageUrl,
      },
      item?.row_id,
    );
    if (isNewPhoto) await queueImageUpload(row_id, imageUrl);
    onSaved();
  }

  return (
    <div className="overlay" id="item-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2 className="serif">{isNew ? t('actions.newItem').replace('+ ', '') : item.name}</h2>
        {!isNew && (
          <p className="sub">
            {item.last_modified_by} · {item.last_modified_at ? new Date(item.last_modified_at).toLocaleString() : ''}
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <ImageField value={imageUrl} onChange={setImageUrl} />
          </div>

          <div className="field">
            <label>{t('fields.name')}</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div className="row2">
            <div className="field">
              <label>{t('fields.size')}</label>
              <input type="text" value={size} onChange={(e) => setSize(e.target.value)} placeholder="91X132" />
            </div>
            <div className="field">
              <label>{t('fields.sku')}</label>
              <input type="text" value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
          </div>

          <div className="row2">
            <ConfigSelect list="type" label={t('filters.type')} value={type} onChange={setType} config={config} addConfigValue={addConfigValue} />
            <ConfigSelect list="location" label={t('filters.location')} value={location} onChange={setLocation} config={config} addConfigValue={addConfigValue} />
          </div>

          <div className="row2">
            <ConfigSelect list="physical_status" label={t('fields.status')} value={status} onChange={setStatus} config={config} addConfigValue={addConfigValue} />
            <div className="field">
              <label>{t('fields.price')}</label>
              <input type="number" min="0" step="1" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>{t('fields.serialNumber')}</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="text" value={serial} onChange={(e) => setSerial(e.target.value)} style={{ flex: 1 }} />
              <button type="button" className="btn" onClick={generateSerial}>{t('actions.generateSerial')}</button>
            </div>
          </div>

          <div className="field">
            <label>{t('filters.availability')}</label>
            <div className="avail-toggle">
              <button
                type="button"
                className={availability === 'available' ? 'on available' : ''}
                onClick={() => setAvailability('available')}
              >
                {t('filters.available')}
              </button>
              <button
                type="button"
                className={availability === 'sold' ? 'on sold' : ''}
                onClick={() => setAvailability('sold')}
              >
                {t('filters.sold')}
              </button>
            </div>
          </div>

          <div className="field">
            <label>{t('fields.notes')}</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && <p style={{ color: 'var(--sold)', fontSize: '.85rem' }}>{error}</p>}

          <div className="modal-actions">
            <div className="left-actions">
              <button type="button" className="btn" onClick={onClose}>{t('actions.cancel')}</button>
              <button type="submit" className="btn primary">{t('actions.save')}</button>
            </div>
            {!isNew && (
              <button type="button" className="danger-link" onClick={() => onRequestDelete(item)}>
                {t('actions.deleteItem')}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
