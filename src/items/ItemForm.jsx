import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useItems } from './ItemsContext.jsx';
import { useToast } from '../toast/ToastContext.jsx';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock.js';
import ImageField from './ImageField.jsx';
import DiscardConfirm from './DiscardConfirm.jsx';

function ConfigSelect({ list, value, onChange, config, addConfigValue, label }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  async function confirmAdd() {
    const added = await addConfigValue(list, draft);
    if (added) {
      onChange(added);
      setDraft('');
      setAdding(false);
      showToast(t('toast.valueAdded'));
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

const SAVE_DELAY_NOTICE_MS = 5000;

export default function ItemForm({ item, onClose, onRequestDelete, onSaved }) {
  const { t } = useI18n();
  const { config, saveItem, addConfigValue, queueImageUpload } = useItems();
  const { showToast } = useToast();
  useBodyScrollLock();
  const isNew = !item;
  const [saving, setSaving] = useState(false);
  const [saveDelayed, setSaveDelayed] = useState(false);
  // Cancel stays enabled mid-save, so a slow save can finish after this
  // form is gone - it must not then close whatever form is open by then.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true; // re-set: StrictMode runs effect -> cleanup -> effect in dev
    return () => { mountedRef.current = false; };
  }, []);

  // SPEC.md section 9: a local save normally takes milliseconds. If it
  // hasn't finished after 5s, say so - without claiming it failed (it may
  // still complete) and without unlocking save (a second attempt would
  // only queue behind the stuck one).
  useEffect(() => {
    if (!saving) {
      setSaveDelayed(false);
      return undefined;
    }
    const id = setTimeout(() => setSaveDelayed(true), SAVE_DELAY_NOTICE_MS);
    return () => clearTimeout(id);
  }, [saving]);

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
  // A saved photo still waiting to upload is what the item shows (SPEC.md
  // section 10), so the form starts from it too.
  const pendingPhoto = item?.pending_image || null;
  const [imageUrl, setImageUrl] = useState(pendingPhoto || item?.image_url || null);
  const [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState('');

  // SPEC.md section 9: closing with unsaved edits asks first. Compared as
  // strings so e.g. a price of 100 vs '100' isn't mistaken for an edit.
  const currentValues = [name, size, sku, type, location, status, price, serial, notes, availability, imageUrl];
  const initialValuesRef = useRef(currentValues.map(String));
  const isDirty = currentValues.some((v, i) => String(v) !== initialValuesRef.current[i]);

  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  function requestClose() {
    // Mid-save the edits are already on their way to being stored.
    if (isDirty && !saving) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  }

  function saveFromDiscardConfirm() {
    setConfirmingDiscard(false);
    handleSubmit({ preventDefault: () => {} }); // same path as the form's own save, validation included
  }

  function generateSerial() {
    let code = '';
    for (let i = 0; i < 6; i++) code += Math.floor(Math.random() * 10);
    setSerial(code);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError(t('errors.nameRequired'));
      return;
    }
    if (price !== '' && !(Number(price) >= 0)) {
      setError(t('errors.priceInvalid'));
      return;
    }
    // ACT-04 (UI_STANDARD_GAP_ANALYSIS.md): lock the button for the
    // duration of the save so a fast double-click/double-tap can't queue
    // the item twice.
    if (saving || imageBusy) return;
    setSaving(true);
    try {
      // Test-only hook (see tests/e2e/crud.spec.js TC-ACT-005): a local
      // save normally completes fast enough that the disabled state and
      // the following unmount land in the same React commit, making the
      // lock unobservable from outside. Nothing in the real app ever sets
      // window.__testSlowSave - this exists purely to widen that window
      // on demand so the guard can be tested directly, mirroring
      // CrashTestHook's window.__testCrash in src/ErrorBoundary.jsx.
      if (typeof window !== 'undefined' && window.__testSlowSave) {
        await new Promise((resolve) => setTimeout(resolve, window.__testSlowSave));
      }
      // Test-only hook (see tests/e2e/crud.spec.js REG-016): simulates a
      // local write failure (e.g. IndexedDB blocked/full on a specific
      // device - a real user report) without needing to actually break
      // IndexedDB in the browser running the test.
      if (typeof window !== 'undefined' && window.__testForceSaveError) {
        throw new Error('forced test failure');
      }
      // A freshly-picked photo is a data: URL - too big to write straight
      // into the Sheet's image_url column (and not what that column is
      // for). Keep the row's previous image_url untouched and upload the
      // new photo separately; the sync engine swaps in the real Drive URL
      // once the upload succeeds.
      const isNewPhoto = Boolean(imageUrl && imageUrl.startsWith('data:') && imageUrl !== pendingPhoto);
      const keepsPendingPhoto = Boolean(pendingPhoto && imageUrl === pendingPhoto);
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
          image_url: isNewPhoto || keepsPendingPhoto ? (item?.image_url || null) : imageUrl,
        },
        item?.row_id,
        // Removing a photo that was still waiting to upload also cancels that
        // upload - otherwise it would bring the photo back once it finished.
        { discardPendingPhoto: Boolean(pendingPhoto && !imageUrl) },
      );
      if (isNewPhoto) await queueImageUpload(row_id, imageUrl);
      // ACT-03/MSG-06 (UI_STANDARD_GAP_ANALYSIS.md): local save is what
      // just actually happened - "נשמר מקומית" is accurate whether or
      // not the background sync to the server has finished yet.
      showToast(t('sync.savedLocal'));
      if (mountedRef.current) onSaved();
    } catch (err) {
      // Real user report: a local write (e.g. IndexedDB blocked/full on
      // that specific device) used to fail silently here - the button
      // looked like it simply did nothing, with no way to tell the local
      // save itself (not just the background sync) never happened.
      console.error('[save] item save failed', err);
      showToast(t('errors.saveFailed'), { type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="overlay" id="item-overlay" onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
        <div className="modal">
          <h2 className="serif">{isNew ? t('actions.newItem').replace('+ ', '') : item.name}</h2>
          {!isNew && (
            <p className="sub">
              {item.last_modified_by} · {item.last_modified_at ? new Date(item.last_modified_at).toLocaleString() : ''}
            </p>
          )}
          {/* noValidate: the browser must never block a save on its own -
              its tooltip shows in the browser's language, often out of view,
              and reads as "nothing happened" (REG-018). All checks are ours,
              in handleSubmit, shown as the app's own message. */}
          <form onSubmit={handleSubmit} noValidate>
            <div className="field">
              <ImageField
                value={imageUrl}
                onChange={setImageUrl}
                pending={Boolean(pendingPhoto && imageUrl === pendingPhoto)}
                onBusyChange={setImageBusy}
              />
            </div>

            <div className="field">
              <label>{t('fields.name')}</label>
              {/* No native `required` here on purpose: the browser's own
                  validation tooltip would pre-empt this submit handler and
                  show in the browser's language, not the app's chosen one
                  (see TEST_PLAN.md / task #15) - errors.nameRequired below
                  is what users actually see, in he/en/da. */}
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
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
                <input type="number" min="0" step="any" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
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
            {saveDelayed && <p className="save-delayed" role="status">{t('sync.saveDelayed')}</p>}

            <div className="modal-actions">
              <div className="left-actions">
                {/* Cancel stays available during a save (SPEC.md section 9) -
                    it's the way out if a save is stuck. */}
                <button type="button" className="btn" onClick={requestClose}>{t('actions.cancel')}</button>
                <button type="submit" className="btn primary" disabled={saving || imageBusy}>
                  {saving ? t('actions.saving') : t('actions.save')}
                </button>
              </div>
              {!isNew && (
                <button type="button" className="danger-btn" onClick={() => onRequestDelete(item)}>
                  {t('actions.deleteItem')}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
      {confirmingDiscard && (
        <DiscardConfirm
          onSave={saveFromDiscardConfirm}
          onDiscard={onClose}
          onKeepEditing={() => setConfirmingDiscard(false)}
        />
      )}
    </>
  );
}
