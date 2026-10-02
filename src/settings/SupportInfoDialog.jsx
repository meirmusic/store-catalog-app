import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useIdentity } from '../identity/IdentityContext.jsx';
import { useTeamMember } from '../identity/TeamMemberContext.jsx';
import { db } from '../db/db.js';
import { FAILURE_THRESHOLD } from '../sync/syncEngine.js';
import { useSyncRecord } from '../sync/syncRecord.js';
import { APP_VERSION, getRecentErrors } from '../errors/errorReporting.js';
import { formatWhen } from '../items/formatWhen.js';
import { currentDevice } from './deviceInfo.js';
import Dialog from './Dialog.jsx';

// SPEC.md 21.4 / 22.7: everything support needs, each field saying exactly
// what it claims. Never a password, a reset code or item data.
export default function SupportInfoDialog({ isOnline, onClose }) {
  const { t } = useI18n();
  const { user } = useIdentity();
  const { member } = useTeamMember();
  const { lastPullAt, lastPushAt, server } = useSyncRecord();
  // Both live (a stuck count that only refreshed on open was stale).
  const pending = useLiveQuery(() => db.pendingChanges.count(), [], null);
  const stuck = useLiveQuery(() => db.pendingChanges.filter((c) => (c.attempts || 0) >= FAILURE_THRESHOLD).count(), [], null);
  const [copied, setCopied] = useState(false);
  const textRef = useRef(null);
  const errors = getRecentErrors();
  const device = currentDevice();
  const when = (iso) => formatWhen(iso, t);

  let serverText = t('support.notChecked');
  if (server) {
    const stateText = { ok: t('support.serverOk'), error: t('support.serverError'), unreachable: t('support.serverDown') }[server.state] || server.state;
    serverText = [stateText, `${t('support.checked')} ${when(server.at)}`, server.state !== 'ok' && server.message].filter(Boolean).join(' · ');
  }
  let pendingText = t('support.loading');
  if (pending != null && stuck != null) pendingText = stuck ? `${pending} (${t('support.stuck')}: ${stuck})` : String(pending);
  const deviceText = [device.device, device.os, device.browser, device.installed ? t('support.installed') : t('support.inBrowser')].join(' · ');

  const rows = [
    [t('app.version'), APP_VERSION],
    [t('support.account'), user?.email || '—'],
    [t('support.member'), member || '—'],
    [t('support.internet'), isOnline ? t('sync.online') : t('sync.offline')],
    [t('support.server'), serverText],
    [t('support.lastPull'), lastPullAt ? when(lastPullAt) : t('support.neverPulled')],
    [t('support.lastPush'), lastPushAt ? when(lastPushAt) : t('support.neverPushed')],
    [t('support.pending'), pendingText],
    [t('support.device'), `${deviceText} ${t('support.asReported')}`],
  ];

  const errorLine = (e) => [when(e.at), e.code || '—', e.action, e.message, e.logged === false ? t('support.notLogged') : ''].filter(Boolean).join(' · ');
  const text = [
    ...rows.map(([label, value]) => `${label}: ${value}`),
    `User agent: ${navigator.userAgent}`,
    `${t('support.recentErrors')}:`,
    ...(errors.length ? errors.map(errorLine) : [t('support.noErrors')]),
  ].join('\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // clipboard blocked - select the text for a manual copy
      const range = document.createRange();
      range.selectNodeContents(textRef.current);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  return (
    <Dialog className="support-info" labelledBy="support-title" onClose={onClose}>
      <h2 className="serif" id="support-title">{t('support.title')}</h2>
      <div ref={textRef} className="support-body">
        <dl className="support-rows">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd dir="auto">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="support-errors">
          <div className="value-title">{t('support.recentErrors')}</div>
          {errors.length ? (
            <ul>
              {errors.map((e) => (
                <li key={`${e.action}|${e.message}`}>
                  <span>
                    {when(e.at)} · <bdi>{e.code || '—'}</bdi> · {e.action}
                    {e.logged === false && <span className="support-not-logged"> · {t('support.notLogged')}</span>}
                  </span>
                  <bdi dir="ltr" className="support-error-message">{e.message}</bdi>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sub">{t('support.noErrors')}</p>
          )}
        </div>
      </div>
      <div className="confirm-actions">
        <button type="button" onClick={onClose}>{t('actions.close')}</button>
        <button type="button" className="primary" onClick={copy}>
          {copied ? t('actions.copied') : t('support.copy')}
        </button>
      </div>
    </Dialog>
  );
}
