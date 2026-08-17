'use client';

import React from 'react';

interface ReaderGoToModalProps {
  isOpen: boolean;
  onClose: () => void;
  goToInput: string;
  onGoToInputChange: (val: string) => void;
  onGoToLocation: () => void;
}

export default function ReaderGoToModal({
  isOpen,
  onClose,
  goToInput,
  onGoToInputChange,
  onGoToLocation,
}: ReaderGoToModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-72 rounded-2xl border border-landing-border bg-white p-6 shadow-2xl">
        <h3 className="mb-1 text-base font-semibold text-landing-text">Go to Location</h3>
        <p className="mb-4 text-xs text-landing-text-muted">Enter a percentage (0–100) to jump to that position in the book.</p>
        <input
          autoFocus
          type="number"
          min={0}
          max={100}
          value={goToInput}
          onChange={(e) => onGoToInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onGoToLocation();
            if (e.key === 'Escape') onClose();
          }}
          placeholder="e.g. 50"
          className="mb-4 w-full rounded-xl border border-landing-border bg-landing-surface-muted px-4 py-2.5 text-sm text-landing-text outline-none focus:border-landing-accent focus:ring-1 focus:ring-landing-accent"
        />
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-landing-border py-2 text-sm text-landing-text-muted transition hover:border-landing-accent/40"
          >
            Cancel
          </button>
          <button
            onClick={onGoToLocation}
            className="flex-1 rounded-xl bg-landing-accent py-2 text-sm font-semibold text-white transition hover:bg-landing-accent-secondary"
          >
            Go
          </button>
        </div>
      </div>
    </div>
  );
}
