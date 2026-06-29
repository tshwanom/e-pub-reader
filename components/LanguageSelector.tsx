'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n-client';
import { Locale } from '@/lib/i18n-translations';
import { Globe } from 'lucide-react';

const languages: { code: Locale; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'ar', name: 'العربية' },
];

export default function LanguageSelector() {
  const { locale, setLocale } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentLanguageName = languages.find((lang) => lang.code === locale)?.name || 'English';

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="ghost-button flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Globe className="h-4 w-4 text-landing-accent" />
        <span className="hidden sm:inline">{currentLanguageName}</span>
        <span className="inline sm:hidden">{locale.toUpperCase()}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-40 origin-top-right rounded-2xl border border-landing-border bg-white p-1.5 shadow-xl ring-1 ring-black/5 focus:outline-none z-50">
          <div className="py-1" role="menu" aria-orientation="vertical">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => {
                  setLocale(lang.code);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-xs font-medium transition-colors ${
                  lang.code === locale
                    ? 'bg-landing-accent/10 text-landing-accent font-semibold'
                    : 'text-landing-text-muted hover:bg-landing-surface-muted hover:text-landing-text'
                }`}
                role="menuitem"
              >
                {lang.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
