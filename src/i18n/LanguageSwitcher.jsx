import { LANGUAGES } from './translations';
import { useI18n } from './I18nContext';

export default function LanguageSwitcher() {
  const { language, setLanguage } = useI18n();

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {LANGUAGES.map(({ code, label, flag }) => (
        <button
          key={code}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={language === code}
          onClick={() => setLanguage(code)}
          style={{
            fontSize: '1.1rem',
            lineHeight: 1,
            padding: '6px 8px',
            borderRadius: 999,
            border: `1px solid ${language === code ? 'var(--bronze)' : 'var(--line)'}`,
            background: language === code ? 'var(--wall-2)' : 'var(--wall)',
            cursor: 'pointer',
          }}
        >
          {flag}
        </button>
      ))}
    </div>
  );
}
