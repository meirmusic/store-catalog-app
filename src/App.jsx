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
import { getStuckChangeLabels, getStuckChangeError } from './sync/syncEngine.js'
import { isNetworkError } from './errors/errorReporting.js'
import ConfigManager from './config/ConfigManager.jsx'
import { ToastProvider, useToast } from './toast/ToastContext.jsx'
import UpdateBanner from './pwa/UpdateBanner.jsx'
import SignOutConfirm from './identity/SignOutConfirm.jsx'
import GlobalErrorCatcher from './errors/GlobalErrorCatcher.jsx'
import './items/items.css'

function Header() {
  const { t } = useI18n()
  const { signOut } = useIdentity()
  const { member, clearMember } = useTeamMember()
  const { isOnline, syncing, lastSyncedAt, pendingCount, syncProblem, stale, staleError, authExpired, refresh } = useSyncStatus()
  const [managingLists, setManagingLists] = useState(false)
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)
  const { showToast, showErrorToast } = useToast()

  async function explainSyncProblem() {
    try {
      const labels = await getStuckChangeLabels()
      const lastError = await getStuckChangeError()
      const shown = labels.slice(0, 3).join(', ')
      const more = labels.length > 3 ? ` +${labels.length - 3}` : ''
      // SPEC.md 18.2: no connection gets its own, actionable explanation.
      const help = isNetworkError(lastError) ? t('sync.noConnection') : t('sync.problemHelp')
      showToast(`${t('sync.problemIntro')} ${shown}${more}. ${help}`, { type: 'error', details: lastError || undefined })
    } catch (err) {
      showErrorToast(t('errors.unexpected'), 'sync-problem-details', err)
    }
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
          // SPEC.md section 17: tapping explains why fresh data couldn't be
          // fetched - the exact error and its code.
          <button
            type="button"
            className="chip chip-problem"
            onClick={() => showToast(isNetworkError(staleError?.details) ? t('sync.noConnection') : t('sync.staleExplain'), { type: 'error', code: staleError?.code, details: staleError?.details })}
            title={t('sync.problemDetails')}
          >
            {t('sync.staleSince')}
            {lastSyncedAt ? ` ${lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
          </button>
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
        <button className="icon-btn" onClick={() => setConfirmingSignOut(true)} title={t('actions.signOutGoogle')}>🔐</button>
        <LanguageSwitcher />
        {member && (
          <span className="chip user" onClick={clearMember} title={t('actions.switchUser')}>
            👤 {member}
          </span>
        )}
      </div>
      {managingLists && <ConfigManager onClose={() => setManagingLists(false)} />}
      {confirmingSignOut && <SignOutConfirm onCancel={() => setConfirmingSignOut(false)} onConfirm={signOut} />}
      {/* SPEC.md section 9: signing out here keeps the local data and the
          change queue - after signing back in, queued changes go out. */}
      {authExpired && (
        <div className="auth-banner" role="alert">
          <span>{t('sync.authExpired')}</span>
          <button type="button" className="btn primary" onClick={signOut}>
            {t('sync.signInAgain')}
          </button>
        </div>
      )}
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
      <IdentityProvider>
        <TeamMemberProvider>
          <ToastProvider>
            <GlobalErrorCatcher />
            <UpdateBanner />
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
