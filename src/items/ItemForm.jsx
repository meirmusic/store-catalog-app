import { useEffect, useRef, useState } from 'react';
import { useBlocksAutoUpdate } from '../pwa/typingGuard.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useItems } from './ItemsContext.jsx';
import { useToast } from '../toast/ToastContext.jsx';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock.js';
import { useBackToClose } from '../hooks/useBackToClose.js';
import ImageField from './ImageField.jsx';
import DiscardConfirm from './DiscardConfirm.jsx';
import ShareDialog from './ShareDialog.jsx';
import DuplicateConfirm from './DuplicateConfirm.jsx';
import { findDuplicates } from './duplicateCheck.js';
import { formatDateTime } from './formatWhen.js';
import { saveDraft, clearDraft } from './drafts.js';

const DRAFT_DELAY_MS = 500;
// The form's fields, in the order of `currentValues` below.
const FIELDS = ['name', 'size', 'sku', 'type', 'location', 'status', 'price', 'serial', 'notes', 'availability', 'imageUrl'];

function ConfigSelect({ list, value, onChange, config, addConfigValue, label }) {
  const { t } = useI18n();
  const { showToast, showErrorToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  async function confirmAdd() {
    try {
      const result = await addConfigValue(list, draft);
      if (result) {
        onChange(result.value);
        setDraft('');
        setAdding(false);
        showToast(t(result.added ? 'toast.valueAdded' : 'toast.valueExists'));
      }
    } catch (err) {
      showErrorToast(t('errors.addValueFailed'), `add-value:${list}`, err);
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
          <button type="button" className="btn" onClick={confirmAdd} disabled={!draft.trim()}>+</button>
        </div>
      )}
    </div>
  );
}

const SAVE_DELAY_NOTICE_MS = 5000;

// `template`: a new item's starting values when duplicating (SPEC.md 19.3).
// `restore`: a draft's changed fields, put back on top (SPEC.md 26.2).
export default function ItemForm({ item, template = null, restore = null, onClose, onRequestDelete, onSaved, onDuplicate, isHiddenByFilters }) {
  const { t } = useI18n();
  useBlocksAutoUpdate(); // SPEC.md 9: no automatic app update while this is open
  const { items, config, saveItem, addConfigValue, queueImageUpload } = useItems();
  const { showToast, showErrorToast } = useToast();
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

  // String(): an item stored before REG-028's fix may still hold a numeric
  // SKU/serial from the Sheet; the form treats every field as text.
  const text = (v) => (v == null ? '' : String(v));
  const start = item || template || {};
  // A saved photo still waiting to upload is what the item shows (SPEC.md
  // section 10), so the form starts from it too.
  const pendingPhoto = item?.pending_image || null;
  const base = {
    name: text(start.name),
    size: text(start.size),
    sku: text(start.sku),
    type: text(start.type),
    location: text(start.location),
    status: text(start.physical_status),
    price: start.price ?? '',
    serial: text(start.serial_number),
    notes: text(start.notes),
    availability: start.availability_status || 'available',
    imageUrl: pendingPhoto || item?.image_url || null,
  };
  const first = restore ? { ...base, ...restore } : base;
  const [name, setName] = useState(first.name);
  const [size, setSize] = useState(first.size);
  const [sku, setSku] = useState(first.sku);
  const [type, setType] = useState(first.type);
  const [location, setLocation] = useState(first.location);
  const [status, setStatus] = useState(first.status);
  const [price, setPrice] = useState(first.price);
  const [serial, setSerial] = useState(first.serial);
  const [notes, setNotes] = useState(first.notes);
  const [availability, setAvailability] = useState(first.availability);
  const [imageUrl, setImageUrl] = useState(first.imageUrl);
  const [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState(''); // not about one field - shown at the bottom
  // SPEC.md 26.4: a field's error shows next to it, and the cursor goes there.
  const [fieldErrors, setFieldErrors] = useState({});
  const nameRef = useRef(null);
  const priceRef = useRef(null);
  function fieldError(field, message, ref) {
    setFieldErrors({ [field]: message });
    ref.current?.scrollIntoView({ block: 'center' });
    ref.current?.focus({ preventScroll: true });
  }
  // A new item: the cursor starts in the name. Not when editing - the
  // phone's keyboard shouldn't jump up for someone just looking.
  useEffect(() => {
    if (isNew) nameRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SPEC.md section 9: closing with unsaved edits asks first. Compared as
  // strings so e.g. a price of 100 vs '100' isn't mistaken for an edit.
  const currentValues = [name, size, sku, type, location, status, price, serial, notes, availability, imageUrl];
  // Compared against the item's own values - a restored draft counts as changes.
  const initialValuesRef = useRef(FIELDS.map((f) => String(base[f])));
  const isDirty = currentValues.some((v, i) => String(v) !== initialValuesRef.current[i]);

  // SPEC.md 26.2: keep a draft while there are unsaved changes.
  const draftTimer = useRef(null);
  const draftKey = currentValues.map(String).join('\u0001');
  useEffect(() => {
    clearTimeout(draftTimer.current);
    if (!isDirty) return undefined;
    draftTimer.current = setTimeout(() => {
      const changes = {};
      FIELDS.forEach((f, i) => {
        if (String(currentValues[i]) !== initialValuesRef.current[i]) changes[f] = currentValues[i];
      });
      saveDraft({ row_id: item?.row_id || null, name: name.trim() || item?.name || '', changes }).catch(() => {});
    }, DRAFT_DELAY_MS);
    return () => clearTimeout(draftTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, isDirty]);
  // The form closed the normal way: the draft is no longer needed.
  function dropDraft() {
    clearTimeout(draftTimer.current);
    clearDraft().catch(() => {});
  }

  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [duplicates, setDuplicates] = useState(null); // SPEC.md 20.1

  // SPEC.md 19.3: a new item with this one's details - but never its name,
  // SKU, serial number or photo (those belong to this artwork only).
  function duplicate() {
    setError('');
    if (isDirty) {
      setError(t('errors.saveBeforeDuplicate'));
      return;
    }
    onDuplicate({
      size: item.size,
      type: item.type,
      location: item.location,
      physical_status: item.physical_status,
      price: item.price,
      notes: item.notes,
      sourceName: item.name,
    });
  }

  // Returns false when the form stays open (it asked about unsaved changes).
  function requestClose() {
    // Mid-save the edits are already on their way to being stored.
    if (isDirty && !saving) {
      setConfirmingDiscard(true);
      return false;
    }
    if (!saving) dropDraft();
    onClose();
    return true;
  }
  useBackToClose(requestClose); // SPEC.md 26.1: "back" = "cancel"

  function saveFromDiscardConfirm() {
    setConfirmingDiscard(false);
    handleSubmit({ preventDefault: () => {} }); // same path as the form's own save, validation included
  }

  function generateSerial() {
    let code = '';
    for (let i = 0; i < 6; i++) code += Math.floor(Math.random() * 10);
    setSerial(code);
  }

  async function handleSubmit(e, { skipDuplicateCheck = false } = {}) {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    if (!name.trim()) {
      fieldError('name', t('errors.nameRequired'), nameRef);
      return;
    }
    if (price !== '' && !(Number(price) >= 0)) {
      fieldError('price', t('errors.priceInvalid'), priceRef);
      return;
    }
    if (!skipDuplicateCheck) {
      const found = findDuplicates(items, {
        rowId: item?.row_id,
        serial,
        sku,
        serialChanged: String(serial) !== initialValuesRef.current[7],
        skuChanged: String(sku) !== initialValuesRef.current[2],
      });
      if (found.length) {
        setDuplicates(found);
        return;
      }
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
      const saved = {
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
      };
      const row_id = await saveItem(
        saved,
        item?.row_id,
        // Removing a photo that was still waiting to upload also cancels that
        // upload - otherwise it would bring the photo back once it finished.
        { discardPendingPhoto: Boolean(pendingPhoto && !imageUrl) },
      );
      if (isNewPhoto) await queueImageUpload(row_id, imageUrl);
      // ACT-03/MSG-06 (UI_STANDARD_GAP_ANALYSIS.md): local save is what
      // just actually happened - "נשמר מקומית" is accurate whether or
      // not the background sync to the server has finished yet.
      dropDraft();
      // SPEC.md 26.5: say so when the current search / filters hide it.
      showToast(t(isHiddenByFilters?.({ ...saved, row_id }) ? 'sync.savedLocalHidden' : 'sync.savedLocal'));
      if (mountedRef.current) onSaved(row_id);
    } catch (err) {
      // Real user report: a local write (e.g. IndexedDB blocked/full on
      // that specific device) used to fail silently here - the button
      // looked like it simply did nothing, with no way to tell the local
      // save itself (not just the background sync) never happened.
      showErrorToast(t('errors.saveFailed'), 'save', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="overlay" id="item-overlay" onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
        <div className="modal">
          <h2 className="serif">
            {!isNew ? item.name : template ? t('item.duplicateOf').replace('{name}', template.sourceName ?? '') : t('actions.newItem').replace('+ ', '')}
          </h2>
          {!isNew && (
            <p className="sub">
              {item.last_modified_by} · {formatDateTime(item.last_modified_at)}
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
              <label htmlFor="item-name">
                {t('fields.name')} <span className="required-mark" aria-hidden="true">*</span>
              </label>
              {/* No native `required` here on purpose: the browser's own
                  validation tooltip would pre-empt this submit handler and
                  show in the browser's language, not the app's chosen one
                  (see TEST_PLAN.md / task #15) - errors.nameRequired below
                  is what users actually see, in he/en/da. */}
              <input
                id="item-name"
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setFieldErrors((fe) => ({ ...fe, name: undefined })); }}
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? 'item-name-error' : undefined}
              />
              {fieldErrors.name && <p className="field-error" id="item-name-error" role="alert">{fieldErrors.name}</p>}
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
                <input
                  ref={priceRef}
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => { setPrice(e.target.value); setFieldErrors((fe) => ({ ...fe, price: undefined })); }}
                  aria-invalid={Boolean(fieldErrors.price)}
                  aria-describedby={fieldErrors.price ? 'item-price-error' : undefined}
                />
                {fieldErrors.price && <p className="field-error" id="item-price-error" role="alert">{fieldErrors.price}</p>}
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
                <div className="right-actions">
                  <button type="button" className="btn" onClick={() => setSharing(true)}>{t('actions.share')}</button>
                  <button type="button" className="btn" onClick={duplicate}>{t('actions.duplicate')}</button>
                  <button type="button" className="danger-btn" onClick={() => onRequestDelete(item)}>
                    {t('actions.deleteItem')}
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>
      </div>
      {sharing && <ShareDialog item={item} onClose={() => setSharing(false)} />}
      {duplicates && (
        <DuplicateConfirm
          duplicates={duplicates}
          onBack={() => setDuplicates(null)}
          onSaveAnyway={() => {
            setDuplicates(null);
            handleSubmit({ preventDefault: () => {} }, { skipDuplicateCheck: true });
          }}
        />
      )}
      {confirmingDiscard && (
        <DiscardConfirm
          onSave={saveFromDiscardConfirm}
          onDiscard={() => { dropDraft(); onClose(); }}
          onKeepEditing={() => setConfirmingDiscard(false)}
        />
      )}
    </>
  );
}
