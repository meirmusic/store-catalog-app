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
import { getStuckChangeLabels } from './sync/syncEngine.js'
import ConfigManager from './config/ConfigManager.jsx'
import { ToastProvider, useToast } from './toast/ToastContext.jsx'
import UpdateBanner from './pwa/UpdateBanner.jsx'
import './items/items.css'

function Header() {
  const { t } = useI18n()
  const { signOut } = useIdentity()
  const { member, clearMember } = useTeamMember()
  const { isOnline, syncing, lastSyncedAt, pendingCount, syncProblem, stale, refresh } = useSyncStatus()
  const [managingLists, setManagingLists] = useState(false)
  const { showToast } = useToast()

  function signOutOfSharedAccount() {
    if (window.confirm(t('identity.signOutGoogleConfirm'))) signOut()
  }

  async function explainSyncProblem() {
    const labels = await getStuckChangeLabels()
    const shown = labels.slice(0, 3).join(', ')
    const more = labels.length > 3 ? ` +${labels.length - 3}` : ''
    showToast(`${t('sync.problemIntro')} ${shown}${more}. ${t('sync.problemHelp')}`, { type: 'error' })
  }

  return (
    <header className="top">
      <div className="brand">
        {/* Kept as a real (visually-hidden) heading, not just the image's alt
            text, so screen readers get a proper page title and the i18n
            switcher still has something to translate here (TC-I18N-001..003) -
            the logo image itself is the gallery's own fixed design, same in
            every language. */}
        <h1 className="serif visually-hidden">{t('app.title')}</h1>
        <span className="brand-logo-plate">
          <img src="./logo-header.png" alt={t('app.title')} className="brand-logo" />
        </span>
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
        {pendingCount > 0 && (syncProblem ? (
          <button
            type="button"
            className="chip chip-problem"
            onClick={explainSyncProblem}
            title={t('sync.problemDetails')}
            aria-label={t('sync.problemDetails')}
          >
            ⏳ {pendingCount} {t('sync.pending')}
          </button>
        ) : (
          <span className="chip">
            ⏳ {pendingCount} {t('sync.pending')}
          </span>
        ))}
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
    <>
      <UpdateBanner />
      <IdentityProvider>
        <TeamMemberProvider>
          <ToastProvider>
            <ItemsProvider>
              <IdentityGate />
            </ItemsProvider>
          </ToastProvider>
        </TeamMemberProvider>
      </IdentityProvider>
    </>
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
