'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, Locale } from './i18n-translations';

interface LanguageContextProps {
  locale: Locale;
  setLocale: (newLocale: Locale) => void;
  t: (key: keyof typeof translations['en']) => string;
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export function LanguageProvider({
  children,
  initialLocale = 'en',
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    // Write cookie so server is aligned
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
    // Trigger router reload to refresh page and server data
    window.location.reload();
  };

  const t = (key: keyof typeof translations['en']): string => {
    const activeTranslations = translations[locale] || translations['en'];
    return activeTranslations[key] || translations['en'][key] || String(key);
  };

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
}
