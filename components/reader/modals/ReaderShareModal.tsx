'use client';

import React from 'react';

interface ReaderShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  author?: string | null;
  bookUrl: string;
  shareQuoteText: string | null;
  shareCopied: boolean;
  onShare: (platform: 'twitter' | 'facebook' | 'whatsapp' | 'linkedin' | 'copy', quote?: string | null) => void;
}

export default function ReaderShareModal({
  isOpen,
  onClose,
  title,
  author,
  bookUrl,
  shareQuoteText,
  shareCopied,
  onShare,
}: ReaderShareModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md rounded-3xl border border-landing-border bg-white p-6 sm:p-7 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-landing-border/80">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-landing-accent/10 text-landing-accent">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </div>
            <h3 className="font-playfair text-lg font-semibold text-landing-text">
              {shareQuoteText ? 'Share Excerpt' : 'Share Book'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-landing-text-muted hover:bg-landing-surface-muted hover:text-landing-text"
          >
            ✕
          </button>
        </div>

        {shareQuoteText ? (
          <div className="mt-4 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 text-sm italic leading-relaxed text-landing-text">
            &ldquo;{shareQuoteText}&rdquo;
            <p className="mt-2 text-right text-xs font-semibold not-italic text-landing-text-muted">
              — {title}{author ? ` · ${author}` : ''}
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-landing-border bg-landing-surface-muted p-4">
            <p className="font-semibold text-sm text-landing-text">{title}</p>
            {author && <p className="text-xs text-landing-text-muted mt-0.5">{author}</p>}
            <p className="text-xs text-landing-accent mt-2 font-mono truncate">{bookUrl}</p>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button
            onClick={() => onShare('twitter', shareQuoteText)}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-landing-border p-3.5 text-xs font-semibold text-landing-text transition hover:border-landing-accent hover:bg-landing-accent/5"
          >
            <span className="text-lg">𝕏</span>
            <span>X (Twitter)</span>
          </button>
          <button
            onClick={() => onShare('facebook', shareQuoteText)}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-landing-border p-3.5 text-xs font-semibold text-landing-text transition hover:border-landing-accent hover:bg-landing-accent/5"
          >
            <span className="text-lg text-blue-600 font-bold">f</span>
            <span>Facebook</span>
          </button>
          <button
            onClick={() => onShare('whatsapp', shareQuoteText)}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-landing-border p-3.5 text-xs font-semibold text-landing-text transition hover:border-landing-accent hover:bg-landing-accent/5"
          >
            <span className="text-lg text-emerald-600">💬</span>
            <span>WhatsApp</span>
          </button>
          <button
            onClick={() => onShare('linkedin', shareQuoteText)}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-landing-border p-3.5 text-xs font-semibold text-landing-text transition hover:border-landing-accent hover:bg-landing-accent/5"
          >
            <span className="text-lg text-blue-700 font-bold">in</span>
            <span>LinkedIn</span>
          </button>
        </div>

        <div className="mt-4">
          <button
            onClick={() => onShare('copy', shareQuoteText)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-landing-border bg-landing-surface-muted py-2.5 text-sm font-semibold text-landing-text transition hover:border-landing-accent/40"
          >
            {shareCopied ? (
              <>
                <span className="text-emerald-600">✓</span>
                <span className="text-emerald-700 font-medium">Copied link to clipboard!</span>
              </>
            ) : (
              <>
                <span>🔗</span>
                <span>Copy {shareQuoteText ? 'Quote & Link' : 'Link'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
