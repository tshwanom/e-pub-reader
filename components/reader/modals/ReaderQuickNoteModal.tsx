'use client';

import React from 'react';

interface ReaderQuickNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  quickNoteText: string;
  onQuickNoteTextChange: (text: string) => void;
  onSaveQuickNote: () => void;
}

export default function ReaderQuickNoteModal({
  isOpen,
  onClose,
  quickNoteText,
  onQuickNoteTextChange,
  onSaveQuickNote,
}: ReaderQuickNoteModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-landing-border bg-white shadow-2xl">
        {/* Header */}
        <div className="bg-[#f0f9fa] px-5 pb-4 pt-5">
          <div className="mb-1 flex items-center gap-2">
            <svg className="h-4 w-4 text-landing-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-landing-accent">Note at this position</p>
          </div>
          <p className="text-xs text-landing-text-muted">This note will be pinned to your current reading location.</p>
        </div>

        <div className="px-5 py-4">
          <textarea
            autoFocus
            value={quickNoteText}
            onChange={(e) => onQuickNoteTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSaveQuickNote();
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Write your note… (⌘↵ to save)"
            rows={5}
            className="mb-4 w-full resize-none rounded-xl border border-landing-border bg-landing-surface-muted px-4 py-2.5 text-sm text-landing-text outline-none placeholder:text-landing-text-muted/60 focus:border-landing-accent focus:ring-1 focus:ring-landing-accent"
          />
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-landing-border py-2.5 text-sm text-landing-text-muted transition hover:border-landing-accent/40"
            >
              Cancel
            </button>
            <button
              onClick={onSaveQuickNote}
              disabled={!quickNoteText.trim()}
              className="flex-1 rounded-xl bg-landing-accent py-2.5 text-sm font-semibold text-white transition hover:bg-landing-accent-secondary disabled:opacity-40"
            >
              Save Note
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
