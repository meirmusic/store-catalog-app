import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useIdentity } from '../identity/IdentityContext.jsx';
import { useTeamMember } from '../identity/TeamMemberContext.jsx';
import { db } from '../db/db.js';
import { countStuckChanges } from '../sync/syncEngine.js';
import { APP_VERSION, getRecentErrors } from '../errors/errorReporting.js';
import { formatWhen } from '../items/formatWhen.js';
import Dialog from './Dialog.jsx';

// SPEC.md 21.4: everything support needs, on one screen and in one copy.
// Never a password, a reset code or item data.
export default function SupportInfoDialog({ isOnline, lastSyncedAt, onClose }) {
  const { t } = useI18n();
  const { user } = useIdentity();
  const { member } = useTeamMember();
  const pending = useLiveQuery(() => db.pendingChanges.count(), [], 0);
  const [stuck, setStuck] = useState(0);
  const [copied, setCopied] = useState(false);
  const textRef = useRef(null);
  const errors = getRecentErrors();

  useEffect(() => {
    countStuckChanges().then(setStuck).catch(() => {});
  }, [pending]);

  const rows = [
    [t('app.version'), APP_VERSION],
    [t('support.account'), user?.email || '—'],
    [t('support.member'), member || '—'],
    [t('support.connection'), isOnline ? t('sync.online') : t('sync.offline')],
    [t('support.lastSync'), lastSyncedAt ? formatWhen(lastSyncedAt.toISOString(), t) : t('support.notYet')],
    [t('support.pending'), stuck ? `${pending} (${t('support.stuck')}: ${stuck})` : String(pending)],
    [t('support.device'), navigator.userAgent],
  ];

  const text = [
    ...rows.map(([label, value]) => `${label}: ${value}`),
    `${t('support.recentErrors')}:`,
    ...(errors.length
      ? errors.map((e) => `${formatWhen(e.at, t)} · ${e.code} · ${e.action} · ${e.message}`)
      : [t('support.noErrors')]),
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
                <li key={e.code}>
                  <span>{formatWhen(e.at, t)} · <bdi>{e.code}</bdi> · {e.action}</span>
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
