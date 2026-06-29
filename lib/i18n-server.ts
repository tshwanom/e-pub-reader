import { cookies } from 'next/headers';
import { translations, Locale } from './i18n-translations';

export async function getLocale(): Promise<Locale> {
  try {
    const cookieStore = await cookies();
    const locale = cookieStore.get('NEXT_LOCALE')?.value as Locale;
    if (locale && translations[locale]) {
      return locale;
    }
  } catch (e) {
    // Ignore errors when cookies are not available (e.g. static generation)
  }
  return 'en';
}

export async function getTranslations() {
  const locale = await getLocale();
  return {
    t: (key: keyof typeof translations['en']): string => {
      const activeTranslations = translations[locale] || translations['en'];
      return activeTranslations[key] || translations['en'][key] || String(key);
    },
    locale,
  };
}
