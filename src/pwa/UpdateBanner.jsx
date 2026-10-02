import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  // SPEC.md 9 (REG-037): while installing by itself, say so quietly - never
  // the "update" button, which used to flash for a second and vanish.
  const [applying, setApplying] = useState(false);
  if (!updaterRef.current) {
    updaterRef.current = createAutoUpdater({
      apply: () => {
        setApplying(true);
        updateRef.current?.();
      },
    });
  }
  // Test-only hooks (tests/e2e/update-banner.spec.js), like __testSlowSave:
  // the real service worker doesn't run in the dev server the tests use.
  const [testNeedRefresh, setTestNeedRefresh] = useState(() => typeof window !== 'undefined' && Boolean(window.__testNeedRefresh));

  const {
    needRefresh: [swNeedRefresh],
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

  const needRefresh = swNeedRefresh || testNeedRefresh;

  async function update() {
    try {
      if (typeof window !== 'undefined' && window.__testOnUpdate) window.__testOnUpdate();
      else await updateServiceWorker(true);
    } catch (err) {
      setApplying(false); // back to the banner with its button
      showErrorToast(t('errors.updateFailed'), 'app-update', err);
    }
  }
  updateRef.current = update;

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.__testTriggerNeedRefresh = () => setTestNeedRefresh(true);
    return () => { delete window.__testTriggerNeedRefresh; };
  }, []);

  // Layout effects: the decision is made before the screen is painted, so
  // the banner is never shown for a version that installs by itself.
  useLayoutEffect(() => {
    const updater = updaterRef.current;
    updater.setBusy(isTyping());
    updater.arm(); // the app was just opened
    return onTypingChange((typing) => updater.setBusy(typing));
  }, []);

  useLayoutEffect(() => {
    updaterRef.current.setNeedRefresh(needRefresh);
  }, [needRefresh]);

  if (applying) {
    return (
      <div className="update-banner updating" role="status">
        <span>{t('update.applying')}</span>
      </div>
    );
  }
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
