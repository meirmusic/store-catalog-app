import { useI18n } from './i18n/I18nContext.jsx'
import LanguageSwitcher from './i18n/LanguageSwitcher.jsx'

function App() {
  const { t } = useI18n()

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div style={{ position: 'absolute', top: 16, insetInlineEnd: 16 }}>
        <LanguageSwitcher />
      </div>

      <h1 className="serif" style={{ fontSize: '1.9rem', margin: 0 }}>
        {t('app.title')}
      </h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: 220 }}>
        <hr className="rule" style={{ flex: 1 }} />
        <span className="caption">{t('app.subtitle')}</span>
        <hr className="rule" style={{ flex: 1 }} />
      </div>

      <p style={{ color: 'var(--ink-dim)', fontSize: '0.85rem', margin: '18px 0 0' }}>
        השלד של האפליקציה מוכן - המסכים האמיתיים בבנייה.
      </p>
    </div>
  )
}

export default App
