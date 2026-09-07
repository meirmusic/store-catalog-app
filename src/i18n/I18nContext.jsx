import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { translations, DEFAULT_LANGUAGE } from './translations';

const STORAGE_KEY = 'gallery_lang';

const I18nContext = createContext(null);

function readStoredLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && translations[stored]) return stored;
  } catch {
    // localStorage unavailable (private browsing etc.) - fall back silently
  }
  return DEFAULT_LANGUAGE;
}

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(readStoredLanguage);

  useEffect(() => {
    // Layout direction stays RTL always (see SPEC.md section 8) - only
    // the `lang` attribute follows the chosen language, for accessibility.
    document.documentElement.lang = language;
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // ignore
    }
  }, [language]);

  const value = useMemo(() => {
    const dict = translations[language] || translations[DEFAULT_LANGUAGE];
    const fallback = translations[DEFAULT_LANGUAGE];
    return {
      language,
      setLanguage: (code) => {
        if (translations[code]) setLanguageState(code);
      },
      t: (key) => dict[key] ?? fallback[key] ?? key,
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider');
  return ctx;
}
