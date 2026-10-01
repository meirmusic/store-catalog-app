import { useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { APP_VERSION } from './errorReporting.js';

// SPEC.md section 17: under an error message - the error code (also in the
// Sheet's ErrorLog), the exact technical error, the app version (SPEC.md 9,
// REG-035) and a copy button that copies all three.
export default function ErrorDetails({ code, details }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const textRef = useRef(null);
  if (!code && !details) return null;
  const text = [code, details, `${t('app.version')} ${APP_VERSION}`].filter(Boolean).join(' · ');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Some devices block the clipboard - select the text for a manual copy.
      const range = document.createRange();
      range.selectNodeContents(textRef.current);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  return (
    <div className="error-details">
      <span ref={textRef} className="error-text">
        {code && (
          <span className="error-code">
            {t('errors.code')}: <bdi>{code}</bdi>
          </span>
        )}
        {details && (
          <span className="error-tech">
            {t('errors.details')}: <bdi dir="ltr">{details}</bdi>
          </span>
        )}
        <span className="error-version">
          {t('app.version')} <bdi dir="ltr">{APP_VERSION}</bdi>
        </span>
      </span>
      <button type="button" className="error-copy" onClick={copy}>
        {copied ? t('actions.copied') : t('actions.copy')}
      </button>
    </div>
  );
}
