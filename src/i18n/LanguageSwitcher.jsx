import { useEffect, useRef, useState } from 'react';
import { LANGUAGES } from './translations';
import { useI18n } from './I18nContext';

export default function LanguageSwitcher() {
  const { language, setLanguage } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const current = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];
  const others = LANGUAGES.filter((l) => l.code !== language);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={current.label}
        aria-label={current.label}
        aria-expanded={open}
        className="chip"
        style={{ cursor: 'pointer', gap: 4 }}
      >
        <span style={{ fontSize: '1.05rem', lineHeight: 1 }}>{current.flag}</span>
        <span style={{ fontSize: '.7rem', color: 'var(--ink-dim)' }}>▾</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            insetInlineStart: 0,
            background: 'var(--wall)',
            border: '1px solid var(--line)',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,.15)',
            overflow: 'hidden',
            zIndex: 50,
            minWidth: 120,
          }}
        >
          {others.map(({ code, label, flag }) => (
            <button
              key={code}
              type="button"
              onClick={() => { setLanguage(code); setOpen(false); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '9px 12px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: '.88rem',
                color: 'var(--ink)',
                textAlign: 'start',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--wall-2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontSize: '1.05rem', lineHeight: 1 }}>{flag}</span>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
