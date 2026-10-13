import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useToast } from '../toast/ToastContext.jsx';
import { useTeamMember } from '../identity/TeamMemberContext.jsx';
import { sendFeedback } from '../api/client.js';
import { submitFeedback, FEEDBACK_MAX_LENGTH } from '../telemetry/feedback.js';
import { isNetworkError, describeError } from '../errors/errorReporting.js';
import Dialog from './Dialog.jsx';

// SPEC.md 29.8: "💡 a suggestion or problem" - one free-text box. It goes
// to the Feedback tab under the sender's name (said here, before sending),
// with the screens they were on, the app version and the device type.
// Without internet it's kept and sent later - never lost. dir="auto": an
// English sentence keeps its "?" at its end inside the right-to-left layout.
export default function FeedbackDialog({ onClose }) {
  const { t } = useI18n();
  const { showToast, showErrorToast } = useToast();
  const { member } = useTeamMember();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    let outcome;
    try {
      outcome = await submitFeedback(text, member, sendFeedback);
    } catch (err) {
      // not even kept on the device - the text stays in the box
      showErrorToast(t('errors.feedbackFailed'), 'feedback', err);
      setBusy(false);
      return;
    }
    onClose();
    if (outcome.result === 'sent') showToast(t('feedback.sent'));
    else if (!navigator.onLine || isNetworkError(describeError(outcome.error))) showToast(t('feedback.queued'));
    // kept, but the server refused it (e.g. not updated yet) - say so, with a code
    else showErrorToast(t('feedback.queuedServer'), 'sendFeedback', outcome.error);
  }

  return (
    <Dialog className="feedback-dialog" labelledBy="feedback-title" onClose={onClose}>
      <h2 className="serif" id="feedback-title">{t('feedback.title')}</h2>
      <label className="feedback-label" htmlFor="feedback-text" dir="auto">{t('feedback.question')}</label>
      <textarea
        id="feedback-text"
        className="feedback-text"
        value={text}
        maxLength={FEEDBACK_MAX_LENGTH}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        dir="auto"
        autoFocus
      />
      <p className="sub feedback-name" dir="auto">{t('feedback.byName').replace('{name}', member || '')}</p>
      <div className="confirm-actions">
        <button type="button" onClick={onClose}>{t('actions.cancel')}</button>
        <button type="button" className="primary" onClick={send} disabled={busy || !text.trim()}>{t('feedback.send')}</button>
      </div>
    </Dialog>
  );
}
