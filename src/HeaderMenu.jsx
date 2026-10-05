import { useEffect, useRef, useState } from 'react';
import { useI18n } from './i18n/I18nContext.jsx';
import { LANGUAGES } from './i18n/translations';
import { BackStep } from './hooks/useBackToClose.js';

// SPEC.md 19.10 / 21: ⚙ holds what's done rarely, in three groups -
// work, account, support. Closes on a click outside or Esc.
export default function HeaderMenu({ onManageLists, onSwitchUser, onChangePassword, onSignOut, onSupportInfo, onReloadData }) {
  const { t, language, setLanguage } = useI18n();
  const [open, setOpen] = useState(false);
  const [languagesOpen, setLanguagesOpen] = useState(false);
  const ref = useRef(null);
  const current = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function toggle() {
    setLanguagesOpen(false);
    setOpen((o) => !o);
  }

  function choose(action) {
    setOpen(false);
    action();
  }

  return (
    <div className="header-menu" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        onClick={toggle}
        title={t('menu.title')}
        aria-label={t('menu.title')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⚙
      </button>
      {open && <BackStep onClose={() => setOpen(false)} />}
      {open && (
        <div className="header-menu-list" role="menu">
          <button type="button" role="menuitem" onClick={() => choose(onManageLists)}>{t('config.manageLists')}</button>
          <button
            type="button"
            role="menuitem"
            className="menu-language"
            aria-expanded={languagesOpen}
            onClick={() => setLanguagesOpen((o) => !o)}
          >
            {t('menu.language')}: {current.flag} {current.label} <span className="chevron">{languagesOpen ? '▴' : '▸'}</span>
          </button>
          {languagesOpen && (
            <div className="menu-languages">
              {LANGUAGES.map(({ code, label, flag }) => (
                <button
                  key={code}
                  type="button"
                  role="menuitemradio"
                  aria-checked={code === language}
                  onClick={() => choose(() => setLanguage(code))}
                >
                  {flag} {label}{code === language ? ' ✓' : ''}
                </button>
              ))}
            </div>
          )}
          <hr />
          <button type="button" role="menuitem" onClick={() => choose(onSwitchUser)}>{t('actions.switchUser')}</button>
          <button type="button" role="menuitem" onClick={() => choose(onChangePassword)}>{t('menu.changePassword')}</button>
          <button type="button" role="menuitem" onClick={() => choose(onSignOut)}>{t('identity.signOutConfirm')}</button>
          <hr />
          <button type="button" role="menuitem" onClick={() => choose(onSupportInfo)}>{t('support.title')}</button>
          <button type="button" role="menuitem" onClick={() => choose(onReloadData)}>{t('reload.menu')}</button>
        </div>
      )}
    </div>
  );
}
