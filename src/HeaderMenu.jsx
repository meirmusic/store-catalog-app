import { useEffect, useRef, useState } from 'react';
import { useI18n } from './i18n/I18nContext.jsx';

// SPEC.md 19.10: ⚙ is a small menu - "manage lists" and "sign out" - so a
// rarely used sign-out button doesn't take a permanent place in the header.
// Closes on a click outside or Esc.
export default function HeaderMenu({ onManageLists, onSignOut }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

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

  function choose(action) {
    setOpen(false);
    action();
  }

  return (
    <div className="header-menu" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setOpen((o) => !o)}
        title={t('menu.title')}
        aria-label={t('menu.title')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⚙
      </button>
      {open && (
        <div className="header-menu-list" role="menu">
          <button type="button" role="menuitem" onClick={() => choose(onManageLists)}>{t('config.manageLists')}</button>
          <button type="button" role="menuitem" onClick={() => choose(onSignOut)}>{t('identity.signOutConfirm')}</button>
        </div>
      )}
    </div>
  );
}
