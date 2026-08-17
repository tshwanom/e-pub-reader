'use client';

import React from 'react';
import type { ReaderPreviewConfig } from '../types';

interface ReaderDonationPromptProps {
  isVisible: boolean;
  title?: string;
  bookId: string;
  previewConfig?: ReaderPreviewConfig;
  onDismiss: () => void;
}

export default function ReaderDonationPrompt({
  isVisible,
  title,
  bookId,
  previewConfig,
  onDismiss,
}: ReaderDonationPromptProps) {
  if (!isVisible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-lg items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-white/95 p-4 shadow-xl backdrop-blur-md ring-1 ring-amber-100 dark:bg-zinc-900/95 dark:border-amber-500/30">
        <div className="flex items-start gap-3 min-w-0">
          <span className="mt-0.5 text-lg">✨</span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-landing-accent">
              Reader-Supported Mission
            </p>
            <p className="mt-0.5 text-sm leading-snug text-landing-text">
              Enjoying “{title || 'this book'}”? Support our quiet rebellion to keep knowledge free.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={previewConfig?.bookCanonicalPath ? `${previewConfig.bookCanonicalPath}#support-this-book` : '/support'}
            className="brand-button whitespace-nowrap px-3.5 py-1.5 text-xs font-semibold"
          >
            Support
          </a>
          <button
            onClick={onDismiss}
            className="flex h-7 w-7 items-center justify-center rounded-full text-landing-text-muted hover:bg-landing-surface-muted hover:text-landing-text"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
