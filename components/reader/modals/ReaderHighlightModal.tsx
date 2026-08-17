'use client';

import React from 'react';
import type { Highlight } from '../types';

interface ReaderHighlightModalProps {
  selectedText: { cfi: string; text: string } | null;
  pendingColor: string;
  pendingNote: string;
  onSetPendingColor: (color: string) => void;
  onSetPendingNote: (note: string) => void;
  onCancelSelection: () => void;
  onSaveHighlight: () => void;
  onShareQuote: (text: string) => void;

  editingHighlight: Highlight | null;
  editNote: string;
  onSetEditNote: (note: string) => void;
  onCancelEditHighlight: () => void;
  onSaveHighlightNote: () => void;
  onDeleteHighlight: (id: string, cfi: string) => void;
}

export default function ReaderHighlightModal({
  selectedText,
  pendingColor,
  pendingNote,
  onSetPendingColor,
  onSetPendingNote,
  onCancelSelection,
  onSaveHighlight,
  onShareQuote,
  editingHighlight,
  editNote,
  onSetEditNote,
  onCancelEditHighlight,
  onSaveHighlightNote,
  onDeleteHighlight,
}: ReaderHighlightModalProps) {
  return (
    <>
      {/* ── Highlight picker — colour + note in one step ─────────────── */}
      {selectedText && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) onCancelSelection();
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-landing-border bg-white shadow-2xl overflow-hidden">
            {/* Colour strip header */}
            <div
              className="px-5 pt-5 pb-4 transition-colors duration-200"
              style={{
                backgroundColor:
                  pendingColor === 'yellow' ? '#fefce8' : pendingColor === 'green' ? '#f0fdf4' : '#eff6ff',
              }}
            >
              <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-landing-text-muted">
                Highlight
              </p>
              <p className="line-clamp-2 text-sm font-medium text-landing-text leading-snug">
                &ldquo;{selectedText.text}&rdquo;
              </p>
            </div>

            <div className="px-5 py-4">
              {/* Colour swatches */}
              <div className="mb-4 flex items-center gap-2">
                {[
                  { color: 'yellow', bg: '#f8e16f', ring: '#ca8a04' },
                  { color: 'green', bg: '#99d98c', ring: '#16a34a' },
                  { color: 'blue', bg: '#90caf9', ring: '#2563eb' },
                ].map(({ color, bg, ring }) => (
                  <button
                    key={color}
                    onClick={() => onSetPendingColor(color)}
                    aria-label={`${color} highlight`}
                    aria-pressed={pendingColor === color}
                    className="relative h-9 w-9 rounded-full border-2 transition-transform duration-150 hover:scale-110 focus-visible:outline-none"
                    style={{
                      backgroundColor: bg,
                      borderColor: pendingColor === color ? ring : 'transparent',
                      boxShadow: pendingColor === color ? `0 0 0 3px ${ring}33` : undefined,
                    }}
                  >
                    {pendingColor === color && (
                      <svg className="absolute inset-0 m-auto h-4 w-4" fill="none" stroke="#fff" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
                <span className="ml-auto text-xs capitalize text-landing-text-muted">{pendingColor}</span>
              </div>

              {/* Note textarea */}
              <textarea
                value={pendingNote}
                onChange={(e) => onSetPendingNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSaveHighlight();
                }}
                placeholder="Add a note… (optional)"
                rows={3}
                className="mb-4 w-full resize-none rounded-xl border border-landing-border bg-landing-surface-muted px-4 py-2.5 text-sm text-landing-text outline-none placeholder:text-landing-text-muted/60 focus:border-landing-accent focus:ring-1 focus:ring-landing-accent"
              />

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={onCancelSelection}
                  className="rounded-xl border border-landing-border px-3 py-2.5 text-sm text-landing-text-muted transition hover:border-landing-accent/40 hover:text-landing-text"
                >
                  Cancel
                </button>
                <button
                  onClick={() => onShareQuote(selectedText.text)}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-landing-accent/30 bg-landing-accent/10 px-3 py-2.5 text-sm font-semibold text-landing-accent transition hover:bg-landing-accent/20"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  <span>Share Quote</span>
                </button>
                <button
                  onClick={onSaveHighlight}
                  className="flex-1 rounded-xl bg-landing-accent py-2.5 text-sm font-semibold text-white transition hover:bg-landing-accent-secondary"
                >
                  Save Highlight
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Highlight note editor (opened by tapping a highlight in the book) ── */}
      {editingHighlight && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) onCancelEditHighlight();
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-landing-border bg-white shadow-2xl overflow-hidden">
            {/* Colour header */}
            <div
              className="px-5 pt-5 pb-4"
              style={{
                backgroundColor:
                  editingHighlight.color === 'yellow'
                    ? '#fefce8'
                    : editingHighlight.color === 'green'
                    ? '#f0fdf4'
                    : '#eff6ff',
              }}
            >
              <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-landing-text-muted">
                Highlight
              </p>
              <p className="line-clamp-2 text-sm font-medium text-landing-text leading-snug">
                &ldquo;{editingHighlight.text}&rdquo;
              </p>
            </div>
            <div className="px-5 py-4">
              <label className="mb-1.5 block text-xs font-semibold text-landing-text-muted">Your note</label>
              <textarea
                autoFocus
                value={editNote}
                onChange={(e) => onSetEditNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSaveHighlightNote();
                  if (e.key === 'Escape') onCancelEditHighlight();
                }}
                placeholder="Write a note…"
                rows={4}
                className="mb-4 w-full resize-none rounded-xl border border-landing-border bg-landing-surface-muted px-4 py-2.5 text-sm text-landing-text outline-none placeholder:text-landing-text-muted/60 focus:border-landing-accent focus:ring-1 focus:ring-landing-accent"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => onDeleteHighlight(editingHighlight.id, editingHighlight.cfi)}
                  className="rounded-xl border border-red-200 px-3 py-2.5 text-sm text-red-500 transition hover:bg-red-50"
                >
                  Delete
                </button>
                <button
                  onClick={onCancelEditHighlight}
                  className="flex-1 rounded-xl border border-landing-border py-2.5 text-sm text-landing-text-muted transition hover:border-landing-accent/40"
                >
                  Cancel
                </button>
                <button
                  onClick={onSaveHighlightNote}
                  className="flex-1 rounded-xl bg-landing-accent py-2.5 text-sm font-semibold text-white transition hover:bg-landing-accent-secondary"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
