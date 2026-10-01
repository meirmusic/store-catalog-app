import { useEffect } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useToast } from '../toast/ToastContext.jsx';

// SPEC.md section 17: an error no action caught (a bug anywhere) still gets
// a message with its code and details, and is logged. "Script error." is a
// cross-origin error with no details at all (e.g. from a browser extension)
// - nothing useful to show or log.
const IGNORED = [/^Script error\.?$/i, /ResizeObserver loop/i];

export default function GlobalErrorCatcher() {
  const { t } = useI18n();
  const { showErrorToast } = useToast();

  useEffect(() => {
    function handle(error) {
      const text = error instanceof Error ? error.message : String(error);
      if (IGNORED.some((re) => re.test(text))) return;
      showErrorToast(t('errors.unexpected'), 'unexpected', error);
    }
    const onError = (e) => handle(e.error || e.message);
    const onRejection = (e) => handle(e.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [t, showErrorToast]);

  return null;
}
