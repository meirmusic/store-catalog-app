import { useI18n } from './i18n/I18nContext.jsx'
import LanguageSwitcher from './i18n/LanguageSwitcher.jsx'
import { IdentityProvider, useIdentity } from './identity/IdentityContext.jsx'
import IdentityPicker from './identity/IdentityPicker.jsx'
import { ItemsProvider } from './items/ItemsContext.jsx'
import ItemList from './items/ItemList.jsx'
import { useSyncStatus } from './sync/useSyncStatus.js'
import './items/items.css'

function Header() {
  const { t } = useI18n()
  const { user, clearUser } = useIdentity()
  const { isOnline, syncing, pendingCount, syncProblem, refresh } = useSyncStatus()

  return (
    <header className="top">
      <div className="brand">
        <h1 className="serif">{t('app.title')}</h1>
      </div>
      <div className="status-cluster">
        <span className="chip">
          <span className={`dot ${isOnline ? 'on' : 'off'}`} />
          {isOnline ? t('sync.online') : t('sync.offline')}
        </span>
        {pendingCount > 0 && (
          <span className="chip" style={syncProblem ? { borderColor: 'var(--sold)', color: 'var(--sold)' } : undefined}>
            ⏳ {pendingCount} {t('sync.pending')}
          </span>
        )}
        <button className={`icon-btn${syncing ? ' spin' : ''}`} onClick={refresh} title={t('actions.refresh')}>⟳</button>
        <LanguageSwitcher />
        {user && (
          <span className="chip user" onClick={clearUser}>👤 {user}</span>
        )}
      </div>
    </header>
  )
}

function AppShell() {
  return (
    <div className="page-wrap">
      <Header />
      <ItemList />
    </div>
  )
}

function App() {
  return (
    <IdentityProvider>
      <ItemsProvider>
        <IdentityGate />
      </ItemsProvider>
    </IdentityProvider>
  )
}

function IdentityGate() {
  const { user } = useIdentity()
  if (!user) return <IdentityPicker />
  return <AppShell />
}

export default App
