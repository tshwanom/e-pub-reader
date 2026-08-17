'use client';

import React from 'react';
import type { SearchResult } from '../types';

interface ReaderSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onRunSearch: (query: string) => void;
  isSearching: boolean;
  searchResults: SearchResult[];
  onSelectResult: (cfi: string) => void;
}

export default function ReaderSearchModal({
  isOpen,
  onClose,
  searchQuery,
  onSearchQueryChange,
  onRunSearch,
  isSearching,
  searchResults,
  onSelectResult,
}: ReaderSearchModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mx-auto mt-16 w-full max-w-lg rounded-2xl border border-landing-border bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 border-b border-landing-border px-4 py-3">
          <svg className="h-5 w-5 shrink-0 text-landing-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            autoFocus
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRunSearch(searchQuery);
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Search in book…"
            className="flex-1 bg-transparent text-sm text-landing-text outline-none placeholder:text-landing-text-muted"
          />
          <button
            onClick={() => onRunSearch(searchQuery)}
            className="rounded-lg bg-landing-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-landing-accent-secondary"
          >
            {isSearching ? 'Searching…' : 'Search'}
          </button>
          <button
            onClick={onClose}
            className="text-landing-text-muted hover:text-landing-text"
            aria-label="Close search"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {searchResults.length === 0 && !isSearching && searchQuery && (
            <p className="py-8 text-center text-sm text-landing-text-muted">No results found.</p>
          )}
          {searchResults.map((r, i) => (
            <button
              key={i}
              onClick={() => onSelectResult(r.cfi)}
              className="block w-full border-b border-landing-border px-4 py-3 text-left text-sm text-landing-text-muted transition-colors hover:bg-landing-accent/5 hover:text-landing-text last:border-0"
            >
              {r.excerpt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
