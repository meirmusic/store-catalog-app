import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useToast } from '../toast/ToastContext.jsx';
import { createAutoUpdater } from './autoUpdate.js';
import { isTyping, onTypingChange } from './typingGuard.js';

// SPEC.md section 9 (REG-035): checks for a new version on opening, on every
// return to the app and hourly. One found on opening/returning installs by
// itself unless the user is typing (then right after that screen closes);
// otherwise the banner offers it. Data is safe either way - every save,
// queued ones included, lives on the device and survives the reload.
const UPDATE_CHECK_MS = 60 * 60 * 1000;

export default function UpdateBanner() {
  const { t } = useI18n();
  const { showErrorToast } = useToast();
  const updateRef = useRef(null);
  const updaterRef = useRef(null);
  if (!updaterRef.current) {
    updaterRef.current = createAutoUpdater({ apply: () => updateRef.current?.() });
  }

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const check = () => registration.update().catch(() => {}); // offline - try again later
      setInterval(check, UPDATE_CHECK_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        updaterRef.current.arm();
        check();
      });
    },
  });

  async function update() {
    try {
      await updateServiceWorker(true);
    } catch (err) {
      showErrorToast(t('errors.updateFailed'), 'app-update', err);
    }
  }
  updateRef.current = update;

  useEffect(() => {
    const updater = updaterRef.current;
    updater.setBusy(isTyping());
    updater.arm(); // the app was just opened
    return onTypingChange((typing) => updater.setBusy(typing));
  }, []);

  useEffect(() => {
    updaterRef.current.setNeedRefresh(needRefresh);
  }, [needRefresh]);

  if (!needRefresh) return null;
  return (
    <div className="update-banner" role="status">
      <span>{t('update.available')}</span>
      <button type="button" className="btn primary" onClick={update}>
        {t('update.reload')}
      </button>
    </div>
  );
}
