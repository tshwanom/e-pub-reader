'use client';

import React from 'react';
import type {
  NarrationManifest,
  NarrationStatusPayload,
  ReaderNarrationAccess,
} from '../types';
import {
  formatMediaTime,
  formatNarrationVoiceName,
} from '../utils';

interface ReaderNarrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  narrationAccess?: ReaderNarrationAccess;
  narrationStatus: NarrationStatusPayload | null;
  narrationError: string | null;
  isCheckingNarration: boolean;
  narrationHasReadyPlayer: boolean;
  isNarrationPlaying: boolean;
  activeNarrationVoiceName: string;
  narrationManifest: NarrationManifest | null;
  narrationVoiceOptions: any[];
  activeNarrationVoiceOption: any;
  onVoiceChange: (slug: string) => void;
  onTogglePlayback: () => void;
  onRefreshStatus: () => void;
}

export default function ReaderNarrationModal({
  isOpen,
  onClose,
  narrationAccess,
  narrationStatus,
  narrationError,
  isCheckingNarration,
  narrationHasReadyPlayer,
  isNarrationPlaying,
  activeNarrationVoiceName,
  narrationManifest,
  narrationVoiceOptions,
  activeNarrationVoiceOption,
  onVoiceChange,
  onTogglePlayback,
  onRefreshStatus,
}: ReaderNarrationModalProps) {
  if (!isOpen || !narrationAccess) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-landing-border bg-white shadow-2xl">
        <div className="bg-landing-surface-muted px-5 pb-4 pt-5">
          <div className="mb-1 flex items-center gap-2">
            <svg className="h-4 w-4 text-landing-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M4.5 12a7.5 7.5 0 1115 0v4.25A1.75 1.75 0 0117.75 18H16a1 1 0 01-1-1v-3.5a1 1 0 011-1h3.5m-15 0H8a1 1 0 011 1V17a1 1 0 01-1 1H6.25A1.75 1.75 0 014.5 16.25V12z"
              />
            </svg>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-landing-accent">Narrated mode</p>
          </div>
          <h3 className="text-base font-semibold text-landing-text">
            {narrationAccess.hasAccess ? 'Narration status' : 'Narrated mode is reserved for supporters'}
          </h3>
        </div>

        <div className="px-5 py-4">
          {!narrationAccess.hasAccess ? (
            <>
              <p className="text-sm leading-relaxed text-landing-text-muted">
                {narrationAccess.isSignedIn
                  ? 'Due to the cost of running narration, this feature is reserved for supporters only. Support the mission with a once-off contribution to unlock it on your account.'
                  : 'Due to the cost of running narration, this feature is reserved for supporters only. Sign in to unlock it with your support.'}
              </p>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-landing-border py-2.5 text-sm text-landing-text-muted transition hover:border-landing-accent/40"
                >
                  Keep reading
                </button>
                <a
                  href={narrationAccess.manageHref}
                  className="brand-button flex-1 px-4 py-2.5 text-center text-sm"
                >
                  {narrationAccess.isSignedIn ? 'Support to unlock' : 'Sign in to unlock'}
                </a>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-landing-border bg-landing-surface-muted px-4 py-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">
                    {narrationHasReadyPlayer ? 'Ready to stream' : 'Supporter unlocked'}
                  </span>
                  <span className="rounded-full border border-landing-border bg-white px-2.5 py-1 text-landing-text-muted">
                    {(narrationStatus?.storageProvider || 'signed').toUpperCase()} delivery
                  </span>
                  {narrationHasReadyPlayer && (
                    <span className="rounded-full border border-landing-border bg-white px-2.5 py-1 text-landing-text-muted">
                      {activeNarrationVoiceName}
                    </span>
                  )}
                  {narrationHasReadyPlayer && narrationManifest && (
                    <span className="rounded-full border border-landing-border bg-white px-2.5 py-1 text-landing-text-muted">
                      {narrationManifest.chapterCount} chapter{narrationManifest.chapterCount === 1 ? '' : 's'}
                    </span>
                  )}
                  {narrationVoiceOptions.length > 1 && (
                    <span className="rounded-full border border-landing-border bg-white px-2.5 py-1 text-landing-text-muted">
                      {narrationVoiceOptions.length} voices available
                    </span>
                  )}
                  {narrationStatus?.bookHasLegacyAudiobook && (
                    <span className="rounded-full border border-landing-border bg-white px-2.5 py-1 text-landing-text-muted">
                      Legacy audiobook on file
                    </span>
                  )}
                </div>

                <p className="mt-3 text-sm leading-relaxed text-landing-text-muted">
                  {isCheckingNarration
                    ? 'Checking whether this book’s narrated assets are ready…'
                    : narrationStatus?.message || narrationError || 'Donor narration is unlocked on your account. Check back soon for the first narrated release.'}
                </p>

                {narrationHasReadyPlayer && narrationManifest && (
                  <p className="mt-2 text-xs leading-relaxed text-landing-text-muted">
                    {narrationManifest.totalDurationMs
                      ? `${formatMediaTime(narrationManifest.totalDurationMs / 1000)} total runtime across ${narrationManifest.chapterCount} chapter${narrationManifest.chapterCount === 1 ? '' : 's'}.`
                      : `Signed narration assets are ready across ${narrationManifest.chapterCount} chapter${narrationManifest.chapterCount === 1 ? '' : 's'}.`}
                  </p>
                )}

                {narrationVoiceOptions.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-landing-text-muted">
                        Available voices
                      </p>
                      {narrationVoiceOptions.length > 1 && (
                        <span className="text-[11px] text-landing-text-muted">
                          Tap a voice to switch instantly
                        </span>
                      )}
                    </div>

                    <div className="grid gap-2">
                      {narrationVoiceOptions.map((voiceOption) => {
                        const isSelected = activeNarrationVoiceOption?.voice.slug === voiceOption.voice.slug;
                        const runtimeLabel = voiceOption.totalDurationMs
                          ? formatMediaTime(voiceOption.totalDurationMs / 1000)
                          : `${voiceOption.chapterCount} chapter${voiceOption.chapterCount === 1 ? '' : 's'}`;

                        return (
                          <button
                            key={voiceOption.voice.slug}
                            onClick={() => onVoiceChange(voiceOption.voice.slug)}
                            className={`rounded-2xl border px-3.5 py-3 text-left transition-colors ${
                              isSelected
                                ? 'border-landing-accent bg-white shadow-sm'
                                : 'border-landing-border bg-white/80 hover:border-landing-accent/40 hover:bg-white'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-landing-text">
                                  {formatNarrationVoiceName(voiceOption.voice.name)}
                                </p>
                                <p className="mt-1 text-xs leading-relaxed text-landing-text-muted">
                                  {runtimeLabel}
                                  {voiceOption.active ? ' • Default voice' : ''}
                                </p>
                              </div>

                              <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                                isSelected
                                  ? 'bg-landing-accent text-white'
                                  : 'border border-landing-border bg-white text-landing-text-muted'
                              }`}>
                                {isSelected ? 'Selected' : 'Choose'}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-landing-border py-2.5 text-sm text-landing-text-muted transition hover:border-landing-accent/40"
                >
                  Close
                </button>
                {narrationHasReadyPlayer ? (
                  <button
                    onClick={() => {
                      onClose();
                      onTogglePlayback();
                    }}
                    className="flex-1 rounded-xl bg-landing-accent py-2.5 text-sm font-semibold text-white transition hover:bg-landing-accent-secondary"
                  >
                    {isNarrationPlaying ? 'Pause narration' : 'Start narration'}
                  </button>
                ) : (
                  <button
                    onClick={onRefreshStatus}
                    disabled={isCheckingNarration}
                    className="flex-1 rounded-xl bg-landing-accent py-2.5 text-sm font-semibold text-white transition hover:bg-landing-accent-secondary disabled:opacity-50"
                  >
                    {isCheckingNarration ? 'Checking…' : 'Refresh status'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
