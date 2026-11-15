import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Language = 'en' | 'ko';

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  pick: <T>(en: T, ko: T) => T;
}

const STORAGE_KEY = 'mars_app_lang';

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ko') return saved;
  } catch {
    // ignore storage errors
  }
  return 'en';
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // ignore storage errors
    }
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((prev) => (prev === 'en' ? 'ko' : 'en'));
  }, []);

  const pick = useCallback(
    <T,>(en: T, ko: T): T => (language === 'en' ? en : ko),
    [language]
  );

  const value = useMemo(
    () => ({ language, setLanguage, toggleLanguage, pick }),
    [language, setLanguage, toggleLanguage, pick]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}
