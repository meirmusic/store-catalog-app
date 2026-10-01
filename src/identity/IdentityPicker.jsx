import { useState } from 'react';
import { useBlocksAutoUpdate } from '../pwa/typingGuard.js';
import { useIdentity } from './IdentityContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import ForgotPasswordPanel from './ForgotPasswordPanel.jsx';
import { reportError } from '../errors/errorReporting.js';
import ErrorDetails from '../errors/ErrorDetails.jsx';

export default function IdentityPicker() {
  const { user, signInWithPassword } = useIdentity();
  const { t } = useI18n();
  useBlocksAutoUpdate(); // SPEC.md 9: no automatic app update while this is open
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordInfo, setPasswordInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState('login'); // 'login' | 'forgot'

  if (user) return null;

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setPasswordError('');
    setSubmitting(true);
    const result = await signInWithPassword(email.trim(), password);
    setSubmitting(false);
    if (result.ok) return;
    if (result.reason === 'wrong') {
      setPasswordError({ message: t('identity.wrongCredentials') });
    } else {
      setPasswordError({ message: t('identity.serverUnreachable'), ...reportError('login', result.error, { log: navigator.onLine }) });
    }
  }

  function handleResetDone(resetEmail) {
    setEmail(resetEmail);
    setPassword('');
    setPasswordError('');
    setPasswordInfo(t('identity.resetSuccessLoginNow'));
    setView('login');
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20, 20, 18, .45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: 'var(--wall)',
          borderRadius: 16,
          padding: 28,
          maxWidth: 380,
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,.25)',
        }}
      >
        <h2 className="serif" style={{ margin: '0 0 6px', fontSize: '1.3rem' }}>
          {t('identity.title')}
        </h2>
        <p style={{ color: 'var(--ink-dim)', fontSize: '.88rem', margin: '0 0 18px' }}>
          {t('identity.subtitle')}
        </p>

        {view === 'forgot' ? (
          <ForgotPasswordPanel defaultEmail={email} onDone={handleResetDone} onCancel={() => setView('login')} />
        ) : (
          <>
            {passwordInfo && (
              <p style={{ color: 'var(--ink)', fontSize: '.85rem', marginBottom: 10 }}>{passwordInfo}</p>
            )}
            <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                type="email"
                required
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={t('identity.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', fontSize: '1rem' }}
              />
              <input
                type="password"
                required
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={t('identity.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', fontSize: '1rem' }}
              />
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: '12px 18px',
                  borderRadius: 12,
                  border: 'none',
                  background: 'var(--ink)',
                  color: 'var(--wall)',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: submitting ? 'default' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {t('identity.passwordSubmit')}
              </button>
            </form>
            {passwordError && (
              <div className="inline-error" style={{ marginTop: 10 }} role="alert">
                <span>{passwordError.message}</span>
                <ErrorDetails code={passwordError.code} details={passwordError.details} />
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setPasswordError('');
                setPasswordInfo('');
                setView('forgot');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--ink-dim)',
                fontSize: '.85rem',
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: 0,
                marginTop: 14,
              }}
            >
              {t('identity.forgotPassword')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
