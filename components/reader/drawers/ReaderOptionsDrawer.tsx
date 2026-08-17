'use client';

import React from 'react';
import type {
  Flow,
  FontFamily,
  LineSpacing,
  ReaderNarrationAccess,
  SidePanel,
  Theme,
} from '../types';
import {
  FONT_FAMILIES,
  LINE_SPACINGS,
  formatNarrationVoiceName,
} from '../utils';

interface ReaderOptionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  bookId: string;
  translations?: {
    id: string;
    slug: string | null;
    language: string | null;
  }[];

  theme: Theme;
  onChangeTheme: (theme: Theme) => void;

  flow: Flow;
  onSetFlow: (flow: Flow) => void;

  twoPage: boolean;
  onSetTwoPage: (twoPage: boolean) => void;

  fontFamily: FontFamily;
  onChangeFontFamily: (font: FontFamily) => void;

  fontSize: number;
  onChangeFontSize: (delta: number) => void;

  lineSpacing: LineSpacing;
  onChangeLineSpacing: (spacing: LineSpacing) => void;

  onOpenShare: () => void;
  onOpenSidePanel: (panel: SidePanel) => void;
  onReplayTour: () => void;

  narrationFeatureEnabled: boolean;
  narrationHasReadyPlayer: boolean;
  narrationAccess?: ReaderNarrationAccess;
  narrationVoiceOptions: any[];
  activeNarrationVoiceOption: any;
  isNarrationPlaying: boolean;
  onVoiceChange: (slug: string) => void;
  onToggleNarrationPlayback: () => void;
  onOpenNarrationModal: () => void;
}

export default function ReaderOptionsDrawer({
  isOpen,
  onClose,
  bookId,
  translations = [],
  theme,
  onChangeTheme,
  flow,
  onSetFlow,
  twoPage,
  onSetTwoPage,
  fontFamily,
  onChangeFontFamily,
  fontSize,
  onChangeFontSize,
  lineSpacing,
  onChangeLineSpacing,
  onOpenShare,
  onOpenSidePanel,
  onReplayTour,
  narrationFeatureEnabled,
  narrationHasReadyPlayer,
  narrationAccess,
  narrationVoiceOptions,
  activeNarrationVoiceOption,
  isNarrationPlaying,
  onVoiceChange,
  onToggleNarrationPlayback,
  onOpenNarrationModal,
}: ReaderOptionsDrawerProps) {
  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-72 transform border-l border-landing-border bg-white shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Reading controls"
      >
        <div className="flex h-full flex-col overflow-y-auto p-5">
          <div className="mb-6 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
              Reader Options
            </span>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-landing-text-muted transition-colors hover:bg-landing-surface-muted hover:text-landing-text focus-visible:ring-2 focus-visible:ring-landing-accent"
              aria-label="Close menu"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <button
            onClick={() => window.history.back()}
            className="mb-3 flex items-center gap-2 rounded-xl border border-landing-border bg-landing-surface-muted px-4 py-3 text-sm font-medium text-landing-text transition-colors hover:border-landing-accent/40 hover:text-landing-accent"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Library
          </button>

          <button
            onClick={() => {
              onClose();
              onOpenShare();
            }}
            className="mb-3 flex items-center gap-2 rounded-xl border border-landing-border bg-landing-surface-muted px-4 py-3 text-sm font-medium text-landing-text transition-colors hover:border-landing-accent/40 hover:text-landing-accent"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share Book
          </button>

          <div className="mb-5 flex gap-2">
            <button
              onClick={() => {
                onClose();
                onOpenSidePanel('toc');
              }}
              className="flex flex-1 items-center gap-2 rounded-xl bg-landing-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-landing-accent-secondary"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10" />
              </svg>
              Contents
            </button>
            <button
              onClick={() => {
                onClose();
                onOpenSidePanel('notes');
              }}
              className="flex flex-1 items-center gap-2 rounded-xl border border-landing-accent px-4 py-3 text-sm font-semibold text-landing-accent transition-colors hover:bg-landing-accent/10"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              My Notes
            </button>
          </div>

          {narrationFeatureEnabled && (
            <div className="mb-5 rounded-2xl border border-landing-border bg-landing-surface-muted px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">Narrated mode</p>
                  <h3 className="mt-1 text-sm font-semibold text-landing-text">
                    {narrationHasReadyPlayer
                      ? 'Narrated mode is ready'
                      : narrationAccess?.hasAccess
                      ? 'Unlocked for your donor account'
                      : 'Reserved for donors'}
                  </h3>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                    narrationHasReadyPlayer || narrationAccess?.hasAccess
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {narrationHasReadyPlayer
                    ? 'Ready to stream'
                    : narrationAccess?.hasAccess
                    ? 'Donor unlocked'
                    : 'Donors only'}
                </span>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-landing-text-muted">
                {narrationHasReadyPlayer
                  ? 'Signed narration audio is ready. Play it here and the reader will follow the text as each cue advances.'
                  : narrationAccess?.hasAccess
                  ? 'We will stream narrated audio securely once this book’s signed narration assets are ready.'
                  : narrationAccess?.isSignedIn
                  ? 'Due to the cost of running narration, this feature is reserved for donors only. Make one completed donation to unlock it on your account.'
                  : 'Due to the cost of running narration, this feature is reserved for donors only. Sign in to unlock it with your donation.'}
              </p>

              {narrationHasReadyPlayer && narrationVoiceOptions.length > 1 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {narrationVoiceOptions.map((voiceOption) => {
                    const isSelected = activeNarrationVoiceOption?.voice.slug === voiceOption.voice.slug;

                    return (
                      <button
                        key={voiceOption.voice.slug}
                        onClick={() => onVoiceChange(voiceOption.voice.slug)}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                          isSelected
                            ? 'bg-landing-accent text-white'
                            : 'border border-landing-border bg-white text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-accent'
                        }`}
                      >
                        {formatNarrationVoiceName(voiceOption.voice.name)}
                      </button>
                    );
                  })}
                </div>
              )}

              <button
                onClick={narrationHasReadyPlayer ? onToggleNarrationPlayback : onOpenNarrationModal}
                className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                  narrationHasReadyPlayer || narrationAccess?.hasAccess
                    ? 'bg-landing-accent text-white hover:bg-landing-accent-secondary'
                    : 'border border-landing-border bg-white text-landing-text hover:border-landing-accent/40 hover:text-landing-accent'
                }`}
              >
                {narrationHasReadyPlayer
                  ? isNarrationPlaying
                    ? 'Pause narrated mode'
                    : 'Start narrated mode'
                  : narrationAccess?.hasAccess
                  ? 'Check narrated mode'
                  : narrationAccess?.isSignedIn
                  ? 'Unlock with donation'
                  : 'Sign in to unlock'}
              </button>
            </div>
          )}

          <div className="mb-4 border-t border-landing-border" />

          {/* Book Language Switcher */}
          {translations.length > 1 && (
            <>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                Book Language
              </p>
              <div className="mb-5 flex flex-wrap gap-2">
                {translations.map((t) => {
                  const isCurrent = t.id === bookId;
                  return (
                    <a
                      key={t.id}
                      href={`/read/${t.slug || t.id}`}
                      className={`flex-1 rounded-xl border py-2 text-center text-xs font-medium uppercase tracking-[0.08em] transition-all ${
                        isCurrent
                          ? 'border-landing-accent bg-landing-accent text-white font-semibold'
                          : 'border-landing-border text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-text'
                      }`}
                    >
                      {t.language ? t.language.toUpperCase() : 'UNKNOWN'}
                    </a>
                  );
                })}
              </div>
            </>
          )}

          {/* Theme */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Theme</p>
          <div className="mb-5 flex gap-2">
            {(['light', 'dark', 'sepia'] as Theme[]).map((t) => (
              <button
                key={t}
                onClick={() => onChangeTheme(t)}
                className={`flex-1 rounded-xl border py-2 text-xs font-medium capitalize transition-all ${
                  theme === t
                    ? 'border-landing-accent bg-landing-accent text-white'
                    : 'border-landing-border text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-text'
                }`}
              >
                {t === 'light' ? '☀ Light' : t === 'dark' ? '🌙 Dark' : '📄 Sepia'}
              </button>
            ))}
          </div>

          {/* Flow mode */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Reading Mode</p>
          <div className="mb-5 flex gap-2">
            {(['paginated', 'scrolled'] as Flow[]).map((f) => (
              <button
                key={f}
                onClick={() => onSetFlow(f)}
                className={`flex-1 rounded-xl border py-2 text-xs font-medium capitalize transition-all ${
                  flow === f
                    ? 'border-landing-accent bg-landing-accent text-white'
                    : 'border-landing-border text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-text'
                }`}
              >
                {f === 'paginated' ? 'Pages' : 'Scroll'}
              </button>
            ))}
          </div>

          {/* Layout: single vs two-page */}
          {flow === 'paginated' && (
            <>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Layout</p>
              <div className="mb-5 flex gap-2">
                <button
                  onClick={() => onSetTwoPage(false)}
                  className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-all ${
                    !twoPage
                      ? 'border-landing-accent bg-landing-accent text-white'
                      : 'border-landing-border text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-text'
                  }`}
                >
                  Single
                </button>
                <button
                  onClick={() => onSetTwoPage(true)}
                  className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-all ${
                    twoPage
                      ? 'border-landing-accent bg-landing-accent text-white'
                      : 'border-landing-border text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-text'
                  }`}
                >
                  Two Pages
                </button>
              </div>
            </>
          )}

          {/* Font family */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Font</p>
          <div className="mb-5 flex gap-2">
            {FONT_FAMILIES.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => onChangeFontFamily(value)}
                className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-all ${
                  fontFamily === value
                    ? 'border-landing-accent bg-landing-accent text-white'
                    : 'border-landing-border text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Font size */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Font Size</p>
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-landing-border bg-landing-surface-muted px-4 py-2">
            <button
              onClick={() => onChangeFontSize(-10)}
              className="text-base font-semibold text-landing-text-muted transition hover:text-landing-text"
              aria-label="Decrease font size"
            >
              A-
            </button>
            <span className="flex-1 text-center text-sm font-medium text-landing-text">{fontSize}%</span>
            <button
              onClick={() => onChangeFontSize(10)}
              className="text-base font-semibold text-landing-text-muted transition hover:text-landing-text"
              aria-label="Increase font size"
            >
              A+
            </button>
          </div>

          {/* Line spacing */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Line Spacing</p>
          <div className="mb-5 flex gap-2">
            {LINE_SPACINGS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => onChangeLineSpacing(value)}
                className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-all ${
                  lineSpacing === value
                    ? 'border-landing-accent bg-landing-accent text-white'
                    : 'border-landing-border text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          <button
            onClick={() => {
              onClose();
              onReplayTour();
            }}
            className="text-xs text-landing-text-muted underline-offset-2 transition hover:text-landing-accent hover:underline"
          >
            Replay reader tour
          </button>
        </div>
      </div>
    </>
  );
}
