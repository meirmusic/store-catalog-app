import { useEffect, useState } from 'react'
import { useI18n } from './i18n/I18nContext.jsx'
import { IdentityProvider, useIdentity } from './identity/IdentityContext.jsx'
import IdentityPicker from './identity/IdentityPicker.jsx'
import { TeamMemberProvider, useTeamMember } from './identity/TeamMemberContext.jsx'
import TeamMemberPicker from './identity/TeamMemberPicker.jsx'
import { ItemsProvider } from './items/ItemsContext.jsx'
import ItemList from './items/ItemList.jsx'
import { useSyncStatus } from './sync/useSyncStatus.js'
import { getStuckChangeLabels, getStuckChangeError, onSyncNotice } from './sync/syncEngine.js'
import { isNetworkError, APP_VERSION } from './errors/errorReporting.js'
import ConfigManager from './config/ConfigManager.jsx'
import { ToastProvider, useToast } from './toast/ToastContext.jsx'
import UpdateBanner from './pwa/UpdateBanner.jsx'
import SignOutConfirm from './identity/SignOutConfirm.jsx'
import HeaderMenu from './HeaderMenu.jsx'
import { formatWhen } from './items/formatWhen.js'
import ChangePasswordDialog from './settings/ChangePasswordDialog.jsx'
import SupportInfoDialog from './settings/SupportInfoDialog.jsx'
import ReloadDataDialog from './settings/ReloadDataDialog.jsx'
import FeedbackDialog from './settings/FeedbackDialog.jsx'
import GlobalErrorCatcher from './errors/GlobalErrorCatcher.jsx'
import { markSignInShown } from './telemetry/usage.js'
import Icon from './ui/Icon.jsx'
import { useVisibleItems } from './items/visibleItems.js'
import { downloadItemsCsv } from './items/exportCsv.js'
import './items/items.css'

function Header() {
  const { t } = useI18n()
  const { signOut } = useIdentity()
  const { member, clearMember } = useTeamMember()
  const { isOnline, syncing, lastSyncedAt, pendingCount, syncProblem, stale, staleError, authExpired, refresh } = useSyncStatus()
  const [managingLists, setManagingLists] = useState(false)
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)
  const [dialog, setDialog] = useState(null) // SPEC.md 21 / 29.8: 'password' | 'support' | 'reload' | 'feedback'
  const { showToast, showErrorToast } = useToast()
  const visibleItems = useVisibleItems() // SPEC.md 32.7: what the catalog shows now

  // SPEC.md 33.3 / 33.11: what the server said about a save, after the form
  // was long closed - shown with a code and logged, like any failure.
  useEffect(() => onSyncNotice((n) => {
    if (n.kind === 'deletedMeanwhile') {
      const text = t('sync.deletedMeanwhile').replace('{name}', n.name).replace('{by}', n.by || '?')
      showErrorToast(text, 'sync-deleted-meanwhile', new Error(`saved after it was deleted by ${n.by || '?'}`))
    } else if (n.kind === 'serialTaken') {
      const text = t('sync.serialTaken').replace('{value}', n.value).replace('{owner}', n.owner).replace('{name}', n.name)
      showErrorToast(text, 'sync-serial-taken', new Error(`serial number already taken: ${n.value}`))
    }
  }), [t, showErrorToast])

  function exportVisible() {
    try {
      downloadItemsCsv(visibleItems || [], t)
    } catch (err) {
      showErrorToast(t('errors.exportFailed'), 'export', err)
    }
  }

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
      <div className="brand" data-dead="header">
        {/* Kept as a real (visually-hidden) heading, not just the image's alt
            text, so screen readers get a proper page title and the i18n
            switcher still has something to translate here (TC-I18N-001..003) -
            the logo image itself is the gallery's own fixed design, same in
            every language. */}
        <h1 className="serif visually-hidden">{t('app.title')}</h1>
        {/* SPEC.md 25.1: the logo white on the black band, as in the catalog. */}
        <img src="./logo-white.png" alt={t('app.title')} className="brand-logo" />
      </div>
      <div className="status-cluster">
        {/* SPEC.md 19.9: only the unusual state is shown. */}
        {!isOnline && (
          <span className="chip">
            <span className="dot off" />
            {t('sync.offline')}
          </span>
        )}
        {stale && (
          // SPEC.md section 17: tapping explains why fresh data couldn't be
          // fetched - the exact error and its code.
          <button
            type="button"
            className="chip chip-problem"
            onClick={() => showToast(isNetworkError(staleError?.details) ? t('sync.noConnection') : t('sync.staleExplain'), { type: 'error', code: staleError?.code, details: staleError?.details })}
            title={t('sync.problemDetails')}
          >
            {/* SPEC.md 22.6: never a dangling "not updated since". */}
            {lastSyncedAt
              ? `${t('sync.staleSince')} ${formatWhen(lastSyncedAt.toISOString(), t, new Date(), { omitToday: true })}`
              : t('sync.neverSynced')}
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
            <Icon name="clock" size={16} /> {pendingCount} {t('sync.pending')}
          </button>
        ) : (
          <span className="chip">
            <Icon name="clock" size={16} /> {pendingCount} {t('sync.pending')}
          </span>
        ))}
        <button className={`icon-btn${syncing ? ' spin' : ''}`} data-usage="sync" onClick={refresh} title={t('actions.refresh')} aria-label={t('actions.refresh')}><Icon name="sync" /></button>
        <HeaderMenu
          onManageLists={() => setManagingLists(true)}
          onExport={exportVisible}
          exportCount={visibleItems ? visibleItems.length : 0}
          onSwitchUser={clearMember}
          onChangePassword={() => setDialog('password')}
          onSignOut={() => setConfirmingSignOut(true)}
          onSupportInfo={() => setDialog('support')}
          onReloadData={() => setDialog('reload')}
          onFeedback={() => setDialog('feedback')}
        />
        {member && (
          <span className="chip user" onClick={clearMember} title={t('actions.switchUser')}>
            <Icon name="user" size={17} /> {member}
          </span>
        )}
      </div>
      {managingLists && <ConfigManager onClose={() => setManagingLists(false)} />}
      {confirmingSignOut && <SignOutConfirm onCancel={() => setConfirmingSignOut(false)} onConfirm={signOut} />}
      {dialog === 'password' && <ChangePasswordDialog onClose={() => setDialog(null)} />}
      {dialog === 'support' && <SupportInfoDialog isOnline={isOnline} onClose={() => setDialog(null)} />}
      {dialog === 'reload' && <ReloadDataDialog isOnline={isOnline} onClose={() => setDialog(null)} />}
      {dialog === 'feedback' && <FeedbackDialog onClose={() => setDialog(null)} />}
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

// SPEC.md 25.1: the header sits on a black band across the whole screen.
// The band is its own full-width element (not a trick on the header), so
// nothing clips the ⚙ menu that opens down out of it.
function AppShell() {
  return (
    <>
      <div className="top-band">
        <div className="page-wrap">
          <Header />
        </div>
      </div>
      <div className="page-wrap">
        <ItemList />
      </div>
    </>
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
            <VersionLine />
          </ToastProvider>
        </TeamMemberProvider>
      </IdentityProvider>
    </>
  )
}

// SPEC.md section 9 (REG-035): which version this device runs, on every
// screen - so any screenshot tells.
function VersionLine() {
  const { t } = useI18n()
  return (
    <div className="app-version">
      {t('app.version')} <bdi dir="ltr">{APP_VERSION}</bdi>
    </div>
  )
}

// Two gates: first the office email + password (real access control -
// verified server-side on every request), then "who are you" (attribution
// only, no security weight of its own - see task #28 v2).
function IdentityGate() {
  const { user } = useIdentity()
  const { member } = useTeamMember()
  // SPEC.md 29.3: "opening the app" is timed only when no sign-in came first.
  if (!user || !member) markSignInShown()
  if (!user) return <IdentityPicker />
  if (!member) return <TeamMemberPicker />
  return <AppShell />
}

export default App
