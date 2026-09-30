import { useRegisterSW } from 'virtual:pwa-register/react';
import { useI18n } from '../i18n/I18nContext.jsx';

// SPEC.md section 9: a new version is offered, never forced - a silent
// reload could land mid-form and lose what the user typed. Also checks
// hourly, since an app left open all day would otherwise never notice.
const UPDATE_CHECK_MS = 60 * 60 * 1000;

export default function UpdateBanner() {
  const { t } = useI18n();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      setInterval(() => {
        registration.update().catch(() => {}); // offline - try again next hour
      }, UPDATE_CHECK_MS);
    },
  });

  if (!needRefresh) return null;
  return (
    <div className="update-banner" role="status">
      <span>{t('update.available')}</span>
      <button type="button" className="btn primary" onClick={() => updateServiceWorker(true)}>
        {t('update.reload')}
      </button>
    </div>
  );
}
