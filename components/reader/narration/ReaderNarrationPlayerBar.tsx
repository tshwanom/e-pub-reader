'use client';

import React from 'react';
import type { NarrationPlaybackRate } from '../types';
import {
  NARRATION_PLAYBACK_RATES,
  formatMediaTime,
  formatNarrationVoiceName,
} from '../utils';

interface ReaderNarrationPlayerBarProps {
  isNarrationPlayerExpanded: boolean;
  isNarrationPlaying: boolean;
  activeNarrationChapter: any;
  narrationChapterIndex: number;
  narrationChapters: any[];
  activeNarrationVoiceName: string;
  followNarrationText: boolean;
  narrationPlayerTitle: string;
  narrationPlayerMessage: string;
  narrationCurrentTime: number;
  narrationPlaybackMax: number;
  narrationPlaybackProgressPct: number;
  activeNarrationCue: any;
  narrationPlaybackRate: NarrationPlaybackRate;
  narrationVoiceOptions: any[];
  activeNarrationVoiceOption: any;

  onTogglePlayback: () => void;
  onSkipChapter: (direction: -1 | 1) => void;
  onExpandPlayer: () => void;
  onCollapsePlayer: () => void;
  onToggleFollowText: () => void;
  onOpenNarrationModal: () => void;
  onSeek: (seconds: number) => void;
  onSetPlaybackRate: (rate: NarrationPlaybackRate) => void;
  onVoiceChange: (slug: string) => void;
}

export default function ReaderNarrationPlayerBar({
  isNarrationPlayerExpanded,
  isNarrationPlaying,
  activeNarrationChapter,
  narrationChapterIndex,
  narrationChapters,
  activeNarrationVoiceName,
  followNarrationText,
  narrationPlayerTitle,
  narrationPlayerMessage,
  narrationCurrentTime,
  narrationPlaybackMax,
  narrationPlaybackProgressPct,
  activeNarrationCue,
  narrationPlaybackRate,
  narrationVoiceOptions,
  activeNarrationVoiceOption,
  onTogglePlayback,
  onSkipChapter,
  onExpandPlayer,
  onCollapsePlayer,
  onToggleFollowText,
  onOpenNarrationModal,
  onSeek,
  onSetPlaybackRate,
  onVoiceChange,
}: ReaderNarrationPlayerBarProps) {
  if (!activeNarrationChapter) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 sm:px-4">
      <div
        className={`pointer-events-auto w-full overflow-hidden rounded-2xl border border-landing-border bg-white/92 shadow-xl backdrop-blur-xl transition-all duration-200 ${
          isNarrationPlayerExpanded ? 'max-w-2xl' : 'max-w-xl'
        }`}
      >
        {isNarrationPlayerExpanded ? (
          <div className="px-3.5 py-3 sm:px-4">
            <div className="flex items-start gap-2.5 sm:gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onSkipChapter(-1)}
                  disabled={narrationChapterIndex === 0}
                  aria-label="Previous narration chapter"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-landing-border bg-white text-landing-text transition-colors hover:border-landing-accent/40 hover:text-landing-accent disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={onTogglePlayback}
                  aria-label={isNarrationPlaying ? 'Pause narration' : 'Play narration'}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-landing-accent text-white shadow-sm transition-colors hover:bg-landing-accent-secondary"
                >
                  {isNarrationPlaying ? (
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 6h3v12H8zM13 6h3v12h-3z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => onSkipChapter(1)}
                  disabled={narrationChapterIndex >= narrationChapters.length - 1}
                  aria-label="Next narration chapter"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-landing-border bg-white text-landing-text transition-colors hover:border-landing-accent/40 hover:text-landing-accent disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                      Donor narration
                    </span>
                    <span className="rounded-full border border-landing-border bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-landing-text-muted">
                      {activeNarrationVoiceName}
                    </span>
                    <span className="rounded-full border border-landing-border bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-landing-text-muted">
                      {narrationChapterIndex + 1}/{narrationChapters.length}
                    </span>
                    <button
                      onClick={onToggleFollowText}
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                        followNarrationText
                          ? 'bg-landing-accent text-white'
                          : 'border border-landing-border bg-white text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-accent'
                      }`}
                    >
                      Follow {followNarrationText ? 'on' : 'off'}
                    </button>
                  </div>

                  <button
                    onClick={onCollapsePlayer}
                    aria-label="Collapse narration player"
                    aria-expanded={true}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-landing-border bg-white text-landing-text-muted transition-colors hover:border-landing-accent/40 hover:text-landing-accent"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 15l-7-7-7 7" />
                    </svg>
                  </button>
                </div>

                <div className="mt-1.5 flex items-center gap-2">
                  <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-landing-text">
                    {narrationPlayerTitle}
                  </h3>
                  <button
                    onClick={onOpenNarrationModal}
                    className="hidden rounded-full border border-landing-border bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-landing-text-muted transition-colors hover:border-landing-accent/40 hover:text-landing-accent sm:inline-flex"
                  >
                    Details
                  </button>
                </div>

                <p className="mt-1 truncate text-[11px] leading-relaxed text-landing-text-muted">
                  {narrationPlayerMessage}
                </p>
              </div>
            </div>

            <div className="mt-3">
              <input
                type="range"
                min={0}
                max={narrationPlaybackMax}
                step={0.1}
                value={Math.min(narrationCurrentTime, narrationPlaybackMax)}
                onChange={(event) => onSeek(Number(event.target.value))}
                aria-label="Narration playback position"
                className="w-full accent-landing-accent"
              />
              <div className="mt-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-landing-text-muted">
                <span>{formatMediaTime(narrationCurrentTime)}</span>
                <span>{activeNarrationCue ? 'Cue synced' : 'Awaiting cue'}</span>
                <span>{formatMediaTime(narrationPlaybackMax)}</span>
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {NARRATION_PLAYBACK_RATES.map((rate: NarrationPlaybackRate) => (
                <button
                  key={rate}
                  onClick={() => onSetPlaybackRate(rate)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    narrationPlaybackRate === rate
                      ? 'bg-landing-accent text-white'
                      : 'border border-landing-border bg-white text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-accent'
                  }`}
                >
                  {rate}×
                </button>
              ))}
              {narrationVoiceOptions.length > 1 &&
                narrationVoiceOptions.map((voiceOption) => {
                  const isSelected = activeNarrationVoiceOption?.voice.slug === voiceOption.voice.slug;

                  return (
                    <button
                      key={voiceOption.voice.slug}
                      onClick={() => onVoiceChange(voiceOption.voice.slug)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        isSelected
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'border border-landing-border bg-white text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-accent'
                      }`}
                    >
                      {formatNarrationVoiceName(voiceOption.voice.name)}
                    </button>
                  );
                })}
              <button
                onClick={onOpenNarrationModal}
                className="rounded-full border border-landing-border bg-white px-2.5 py-1 text-[11px] font-semibold text-landing-text-muted transition-colors hover:border-landing-accent/40 hover:text-landing-accent sm:hidden"
              >
                Details
              </button>
            </div>
          </div>
        ) : (
          <div className="px-3 py-2.5 sm:px-3.5">
            <div className="flex items-center gap-2.5">
              <button
                onClick={onTogglePlayback}
                aria-label={isNarrationPlaying ? 'Pause narration' : 'Play narration'}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-landing-accent text-white shadow-sm transition-colors hover:bg-landing-accent-secondary"
              >
                {isNarrationPlaying ? (
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 6h3v12H8zM13 6h3v12h-3z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              <button
                type="button"
                onClick={onExpandPlayer}
                aria-label="Expand narration player"
                aria-expanded={false}
                className="min-w-0 flex-1 rounded-xl px-1 text-left transition-colors hover:bg-landing-surface-muted/80"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                        Donor narration
                      </span>
                      <span className="rounded-full border border-landing-border bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-landing-text-muted">
                        {activeNarrationVoiceName}
                      </span>
                      <span className="rounded-full border border-landing-border bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-landing-text-muted">
                        {narrationChapterIndex + 1}/{narrationChapters.length}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-landing-text">
                        {narrationPlayerTitle}
                      </h3>
                      <span className="shrink-0 text-[11px] font-semibold text-landing-text-muted">
                        {formatMediaTime(narrationCurrentTime)} / {formatMediaTime(narrationPlaybackMax)}
                      </span>
                    </div>
                  </div>

                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-landing-border bg-white text-landing-text-muted transition-colors">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 15l-7-7-7 7" />
                    </svg>
                  </span>
                </div>
              </button>
            </div>

            <div className="mt-2 h-1 overflow-hidden rounded-full bg-landing-border/80">
              <div
                className="h-full rounded-full bg-landing-accent transition-[width] duration-200"
                style={{ width: `${narrationPlaybackProgressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
