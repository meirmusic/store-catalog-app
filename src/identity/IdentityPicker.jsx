import { useEffect, useRef, useState } from 'react';
import { useIdentity } from './IdentityContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { waitForGoogleIdentityServices } from './googleAuth.js';
import { GOOGLE_CLIENT_ID } from '../api/config.js';

export default function IdentityPicker() {
  const { user, signIn } = useIdentity();
  const { t } = useI18n();
  const buttonRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) return;
    if (!GOOGLE_CLIENT_ID) {
      setError(t('identity.notConfigured'));
      return;
    }
    let cancelled = false;
    waitForGoogleIdentityServices()
      .then((googleId) => {
        if (cancelled) return;
        googleId.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            if (!signIn(response.credential)) setError(t('identity.signInFailed'));
          },
        });
        if (buttonRef.current) {
          googleId.renderButton(buttonRef.current, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            shape: 'pill',
          });
        }
      })
      .catch(() => setError(t('identity.signInFailed')));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (user) return null;

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
        <div ref={buttonRef} style={{ display: 'flex', justifyContent: 'center' }} />
        {error && (
          <p style={{ color: 'var(--sold)', fontSize: '.85rem', marginTop: 14 }}>{error}</p>
        )}
      </div>
    </div>
  );
}
