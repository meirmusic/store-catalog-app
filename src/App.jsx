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
        gap: 8,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div style={{ position: 'absolute', top: 16, insetInlineEnd: 16 }}>
        <LanguageSwitcher />
      </div>
      <h1 className="serif" style={{ fontSize: '1.8rem', margin: 0 }}>
        {t('app.title')}
      </h1>
      <p style={{ color: 'var(--ink-dim)', margin: 0 }}>{t('app.subtitle')}</p>
      <p style={{ color: 'var(--ink-dim)', fontSize: '0.85rem', margin: 0 }}>
        השלד של האפליקציה מוכן - המסכים האמיתיים בבנייה.
      </p>
    </div>
  )
}

export default App
