'use client';

import React from 'react';
import type { ReaderNarrationAccess, SidePanel } from '../types';

interface ReaderTopBarProps {
  isToolbarVisible: boolean;
  currentPage: number;
  totalPages: number;
  minutesRemaining: number;
  isPreviewMode?: boolean;
  previewLimitType?: 'CHAPTERS' | 'PERCENTAGE';
  previewLimitValue?: number;
  sidePanel: SidePanel;
  narrationFeatureEnabled: boolean;
  narrationHasReadyPlayer: boolean;
  narrationAccess?: ReaderNarrationAccess;
  isNarrationPlaying: boolean;

  onOpenSearch: () => void;
  onOpenGoTo: () => void;
  onOpenShare: () => void;
  onToggleToc: () => void;
  onToggleNarrationPlayback: () => void;
  onOpenNarrationModal: () => void;
  onOpenMenu: () => void;
}

export default function ReaderTopBar({
  isToolbarVisible,
  currentPage,
  totalPages,
  minutesRemaining,
  isPreviewMode,
  previewLimitType,
  previewLimitValue = 2,
  sidePanel,
  narrationFeatureEnabled,
  narrationHasReadyPlayer,
  narrationAccess,
  isNarrationPlaying,
  onOpenSearch,
  onOpenGoTo,
  onOpenShare,
  onToggleToc,
  onToggleNarrationPlayback,
  onOpenNarrationModal,
  onOpenMenu,
}: ReaderTopBarProps) {
  return (
    <div
      className={`absolute left-0 right-0 top-0 z-30 flex items-center justify-between px-4 py-3 pointer-events-none transition-[opacity,transform] duration-300 ease-out md:opacity-100 md:translate-y-0 ${
        isToolbarVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full'
      }`}
    >
      <div className="pointer-events-auto flex items-center gap-2">
        <div
          aria-live="polite"
          className="flex items-center justify-center rounded-full bg-landing-surface-muted/80 border border-landing-border px-3 py-1.5 text-xs font-semibold text-landing-text shadow-sm backdrop-blur-md"
        >
          {currentPage} / {totalPages || '—'}
        </div>
        {minutesRemaining > 0 && (
          <div className="flex items-center justify-center rounded-full bg-landing-surface-muted/80 border border-landing-border px-3 py-1.5 text-xs font-medium text-landing-text-muted shadow-sm backdrop-blur-md">
            {minutesRemaining < 60
              ? `${minutesRemaining} min left`
              : `${Math.floor(minutesRemaining / 60)}h ${minutesRemaining % 60}m left`}
          </div>
        )}
        {isPreviewMode && (
          <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 shadow-sm backdrop-blur-md">
            <span>★</span>
            <span>
              Free Sample (Up to{' '}
              {previewLimitType === 'PERCENTAGE' ? `${previewLimitValue}%` : `Ch. ${previewLimitValue}`})
            </span>
          </div>
        )}
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        <button
          onClick={onOpenSearch}
          aria-label="Search in book"
          title="Search in book"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-landing-surface-muted/80 border border-landing-border text-landing-text shadow-sm backdrop-blur-md transition hover:bg-landing-border/40 hover:text-landing-accent focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
        </button>

        <button
          onClick={onOpenGoTo}
          aria-label="Go to location"
          title="Go to location"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-landing-surface-muted/80 border border-landing-border text-landing-text shadow-sm backdrop-blur-md transition hover:bg-landing-border/40 hover:text-landing-accent focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>

        <button
          onClick={onOpenShare}
          aria-label="Share book"
          title="Share book"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-landing-surface-muted/80 border border-landing-border text-landing-text shadow-sm backdrop-blur-md transition hover:bg-landing-border/40 hover:text-landing-accent focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        </button>

        <button
          onClick={onToggleToc}
          aria-label="Table of contents"
          title="Table of contents"
          aria-pressed={sidePanel === 'toc'}
          className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm backdrop-blur-md transition focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2 ${
            sidePanel === 'toc'
              ? 'bg-landing-accent border-landing-accent text-white'
              : 'bg-landing-surface-muted/80 border-landing-border text-landing-text hover:bg-landing-border/40 hover:text-landing-accent'
          }`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10" />
          </svg>
        </button>

        {narrationFeatureEnabled && (
          <button
            onClick={narrationHasReadyPlayer ? onToggleNarrationPlayback : onOpenNarrationModal}
            aria-label={
              narrationHasReadyPlayer
                ? isNarrationPlaying
                  ? 'Pause narration'
                  : 'Play narration'
                : narrationAccess?.hasAccess
                ? 'Open narrated mode status'
                : 'Narrated mode reserved for donors'
            }
            title={
              narrationHasReadyPlayer
                ? isNarrationPlaying
                  ? 'Pause narration'
                  : 'Play narration'
                : narrationAccess?.hasAccess
                ? 'Open narrated mode status'
                : 'Narrated mode reserved for donors'
            }
            className={`relative flex h-10 w-10 items-center justify-center rounded-full border shadow-sm backdrop-blur-md transition focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2 ${
              narrationHasReadyPlayer || narrationAccess?.hasAccess
                ? 'bg-landing-accent border-landing-accent text-white hover:bg-landing-accent-secondary'
                : 'bg-landing-surface-muted/80 border-landing-border text-landing-text hover:bg-landing-border/40 hover:text-landing-accent'
            }`}
          >
            {narrationHasReadyPlayer && isNarrationPlaying ? (
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 6h3v12H8zM13 6h3v12h-3z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M4.5 12a7.5 7.5 0 1115 0v4.25A1.75 1.75 0 0117.75 18H16a1 1 0 01-1-1v-3.5a1 1 0 011-1h3.5m-15 0H8a1 1 0 011 1V17a1 1 0 01-1 1H6.25A1.75 1.75 0 014.5 16.25V12z"
                />
              </svg>
            )}
            <span
              className={`absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-white text-[9px] font-bold ${
                narrationHasReadyPlayer || narrationAccess?.hasAccess
                  ? 'bg-white text-landing-accent'
                  : 'bg-amber-400 text-amber-950 border-amber-100'
              }`}
            >
              {narrationHasReadyPlayer ? '▶' : narrationAccess?.hasAccess ? '✓' : '★'}
            </span>
          </button>
        )}

        <button
          onClick={onOpenMenu}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-landing-surface-muted/80 border border-landing-border text-landing-text shadow-sm backdrop-blur-md transition hover:bg-landing-border/40 hover:text-landing-accent focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2"
          aria-label="Open reading menu"
          title="Reader Options"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}
