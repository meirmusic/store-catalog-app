import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { requestPasswordReset, resetPassword } from '../api/client.js';

const inputStyle = { padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', fontSize: '1rem' };
const primaryButtonStyle = {
  padding: '12px 18px',
  borderRadius: 12,
  border: 'none',
  background: 'var(--ink)',
  color: 'var(--wall)',
  fontSize: '1rem',
  fontWeight: 600,
  cursor: 'pointer',
};
const linkButtonStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--ink-dim)',
  fontSize: '.85rem',
  textDecoration: 'underline',
  cursor: 'pointer',
  padding: 0,
};

// Self-service "forgot password" (task #28 v4) - a one-time code emailed to
// the office inbox, exchanged here for a new password. Two steps in one
// panel: request the code, then submit it with the new password. The
// request step's response is deliberately generic either way (see
// Code.gs's handleRequestPasswordReset) so this UI never reveals whether
// the typed email was the right one.
export default function ForgotPasswordPanel({ defaultEmail, onDone, onCancel }) {
  const { t } = useI18n();
  const [email, setEmail] = useState(defaultEmail || '');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [codeRequested, setCodeRequested] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleRequestCode(e) {
    e.preventDefault();
    setError('');
    setRequesting(true);
    try {
      await requestPasswordReset(email.trim());
      setCodeRequested(true);
    } catch {
      setError(t('identity.signInFailed'));
    } finally {
      setRequesting(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError(t('identity.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('identity.passwordMismatch'));
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(email.trim(), code.trim(), newPassword);
      onDone(email.trim());
    } catch {
      setError(t('identity.resetCodeInvalid'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <p style={{ color: 'var(--ink-dim)', fontSize: '.88rem', margin: '0 0 14px' }}>
        {t('identity.forgotSubtitle')}
      </p>

      <form onSubmit={handleRequestCode} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          type="email"
          required
          autoComplete="username"
          placeholder={t('identity.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        <button type="submit" disabled={requesting} style={{ ...primaryButtonStyle, opacity: requesting ? 0.7 : 1 }}>
          {codeRequested ? t('identity.resendCode') : t('identity.sendCode')}
        </button>
      </form>

      {codeRequested && (
        <>
          <p style={{ color: 'var(--ink-dim)', fontSize: '.85rem', margin: '14px 0 10px' }}>
            {t('identity.codeSentInfo')}
          </p>
          <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              type="text"
              inputMode="numeric"
              required
              placeholder={t('identity.codePlaceholder')}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              style={inputStyle}
            />
            <input
              type="password"
              required
              autoComplete="new-password"
              placeholder={t('identity.newPasswordPlaceholder')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={inputStyle}
            />
            <input
              type="password"
              required
              autoComplete="new-password"
              placeholder={t('identity.confirmPasswordPlaceholder')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={inputStyle}
            />
            <button type="submit" disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.7 : 1 }}>
              {t('identity.resetSubmit')}
            </button>
          </form>
        </>
      )}

      {error && <p style={{ color: 'var(--sold)', fontSize: '.85rem', marginTop: 10 }}>{error}</p>}

      <button type="button" onClick={onCancel} style={{ ...linkButtonStyle, marginTop: 14 }}>
        {t('identity.backToLogin')}
      </button>
    </div>
  );
}
