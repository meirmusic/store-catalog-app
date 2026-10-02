import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useToast } from '../toast/ToastContext.jsx';
import { db } from '../db/db.js';
import { reloadAllData, PendingChangesError } from '../sync/syncEngine.js';
import Dialog from './Dialog.jsx';

// SPEC.md 21.5: a troubleshooting tool - only with nothing waiting to be
// sent, and the device's copy is replaced only after the fresh one arrived.
export default function ReloadDataDialog({ isOnline, onClose }) {
  const { t } = useI18n();
  const { showToast, showErrorToast } = useToast();
  const pending = useLiveQuery(() => db.pendingChanges.count(), [], null);
  const [busy, setBusy] = useState(false);

  let blocker = '';
  if (!isOnline) blocker = t('reload.needsInternet');
  else if (pending) blocker = t('reload.pendingFirst').replace('{n}', pending);

  async function reload() {
    setBusy(true);
    try {
      const count = await reloadAllData();
      showToast(t('reload.done').replace('{n}', count));
      onClose();
    } catch (err) {
      if (err instanceof PendingChangesError) {
        setBusy(false);
        return; // the message above already says why
      }
      showErrorToast(t('errors.reloadFailed'), 'reload-data', err);
      setBusy(false);
    }
  }

  return (
    <Dialog className="reload-data" labelledBy="reload-title" onClose={onClose}>
      <h2 className="serif" id="reload-title">{t('reload.title')}</h2>
      <p className="sub">{t('reload.explain')}</p>
      {blocker && <p className="reload-blocker" role="status">{blocker}</p>}
      <div className="confirm-actions">
        <button type="button" onClick={onClose} autoFocus>{t('actions.cancel')}</button>
        <button type="button" className="primary" onClick={reload} disabled={busy || pending == null || Boolean(blocker)}>
          {busy ? t('reload.busy') : t('reload.confirm')}
        </button>
      </div>
    </Dialog>
  );
}
