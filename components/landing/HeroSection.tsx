'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n-client';

export default function HeroSection() {
  const { t } = useTranslation();
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-fade-in');
          }
        });
      },
      { threshold: 0.1 }
    );

    if (heroRef.current) {
      const elements = heroRef.current.querySelectorAll('.fade-in-element');
      elements.forEach((el) => observer.observe(el));
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={heroRef}
      className="relative flex min-h-[86vh] items-center justify-center overflow-hidden bg-gradient-to-b from-white to-landing-bg px-6 pt-20"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(61,115,122,0.12),transparent_65%)]" />

      <div className="mx-auto flex w-full max-w-5xl flex-col items-center space-y-8 text-center">
        <span className="fade-in-element inline-flex items-center rounded-full border border-landing-border bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-landing-accent">
          {t('decodingMatrix')}
        </span>

        <h1 className="fade-in-element font-playfair text-5xl font-semibold leading-tight text-landing-text md:text-6xl lg:text-7xl">
          {t('heroTitle1')}
          <br />
          {t('heroTitle2')}
        </h1>

        <p className="fade-in-element mx-auto max-w-3xl text-lg leading-relaxed text-landing-text-muted md:text-2xl md:leading-relaxed">
          {t('heroDescription')}
        </p>

        <p className="fade-in-element mx-auto max-w-2xl whitespace-pre-line font-crimson text-lg italic text-landing-text-muted md:text-xl">
          {t('heroMotto')}
        </p>

        <div className="fade-in-element flex flex-wrap items-center justify-center gap-3 pt-3">
          <Link
            href="/library"
            className="brand-button min-w-[10rem]"
          >
            {t('exploreLibrary')}
          </Link>
          <Link
            href="/support"
            className="ghost-button min-w-[10rem]"
          >
            {t('supportTitle')}
          </Link>
        </div>

        <p className="fade-in-element text-sm text-landing-text-muted">
          {t('heroFootnote')}
        </p>
      </div>
    </section>
  );
}
