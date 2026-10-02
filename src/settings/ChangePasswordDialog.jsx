import { useI18n } from '../i18n/I18nContext.jsx';
import { useIdentity } from '../identity/IdentityContext.jsx';
import { useToast } from '../toast/ToastContext.jsx';
import { useBlocksAutoUpdate } from '../pwa/typingGuard.js';
import ForgotPasswordPanel from '../identity/ForgotPasswordPanel.jsx';
import Dialog from './Dialog.jsx';

// SPEC.md 21.3: the same code-by-email flow as "forgot password". This
// device keeps working with the new password; others are asked to sign in.
export default function ChangePasswordDialog({ onClose }) {
  const { t } = useI18n();
  const { user, updateStoredPassword } = useIdentity();
  const { showToast } = useToast();
  useBlocksAutoUpdate();

  function done(email, newPassword) {
    updateStoredPassword(email, newPassword);
    showToast(t('menu.passwordChanged'));
    onClose();
  }

  return (
    <Dialog className="change-password" labelledBy="change-password-title" onClose={onClose}>
      <h2 className="serif" id="change-password-title">{t('menu.changePassword')}</h2>
      <ForgotPasswordPanel defaultEmail={user?.email} onDone={done} onCancel={onClose} cancelLabel={t('actions.cancel')} />
    </Dialog>
  );
}
