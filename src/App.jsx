import { useState } from 'react'
import { useI18n } from './i18n/I18nContext.jsx'
import LanguageSwitcher from './i18n/LanguageSwitcher.jsx'
import { IdentityProvider, useIdentity } from './identity/IdentityContext.jsx'
import IdentityPicker from './identity/IdentityPicker.jsx'
import { TeamMemberProvider, useTeamMember } from './identity/TeamMemberContext.jsx'
import TeamMemberPicker from './identity/TeamMemberPicker.jsx'
import { ItemsProvider } from './items/ItemsContext.jsx'
import ItemList from './items/ItemList.jsx'
import { useSyncStatus } from './sync/useSyncStatus.js'
import ConfigManager from './config/ConfigManager.jsx'
import { ToastProvider } from './toast/ToastContext.jsx'
import './items/items.css'

function Header() {
  const { t } = useI18n()
  const { signOut } = useIdentity()
  const { member, clearMember } = useTeamMember()
  const { isOnline, syncing, lastSyncedAt, pendingCount, syncProblem, stale, refresh } = useSyncStatus()
  const [managingLists, setManagingLists] = useState(false)

  function signOutOfSharedAccount() {
    if (window.confirm(t('identity.signOutGoogleConfirm'))) signOut()
  }

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
        {stale && (
          <span className="chip" style={{ borderColor: 'var(--sold)', color: 'var(--sold)' }}>
            {t('sync.staleSince')}
            {lastSyncedAt ? ` ${lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
          </span>
        )}
        {pendingCount > 0 && (
          <span className="chip" style={syncProblem ? { borderColor: 'var(--sold)', color: 'var(--sold)' } : undefined}>
            ⏳ {pendingCount} {t('sync.pending')}
          </span>
        )}
        <button className={`icon-btn${syncing ? ' spin' : ''}`} onClick={refresh} title={t('actions.refresh')}>⟳</button>
        <button className="icon-btn" onClick={() => setManagingLists(true)} title={t('config.manageLists')}>⚙</button>
        <button className="icon-btn" onClick={signOutOfSharedAccount} title={t('actions.signOutGoogle')}>🔐</button>
        <LanguageSwitcher />
        {member && (
          <span className="chip user" onClick={clearMember} title={t('actions.switchUser')}>
            👤 {member}
          </span>
        )}
      </div>
      {managingLists && <ConfigManager onClose={() => setManagingLists(false)} />}
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
      <TeamMemberProvider>
        <ToastProvider>
          <ItemsProvider>
            <IdentityGate />
          </ItemsProvider>
        </ToastProvider>
      </TeamMemberProvider>
    </IdentityProvider>
  )
}

// Two gates: first the shared office Google account (real access control -
// verified server-side against the Config sheet's allowlist), then "who are
// you" (attribution only, no security weight of its own - see task #28 v2).
function IdentityGate() {
  const { user } = useIdentity()
  const { member } = useTeamMember()
  if (!user) return <IdentityPicker />
  if (!member) return <TeamMemberPicker />
  return <AppShell />
}

export default App
