import { TEAM_NAMES } from '../config/seed';
import { useIdentity } from './IdentityContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function IdentityPicker() {
  const { user, setUser } = useIdentity();
  const { t } = useI18n();

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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
          {TEAM_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setUser(name)}
              style={{
                padding: '12px 18px',
                borderRadius: 12,
                border: '1px solid var(--line)',
                background: 'var(--stone)',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: 'pointer',
                minWidth: 96,
              }}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
