'use client';

import React from 'react';
import type {
  Bookmark,
  Highlight,
  SidePanel,
  StandaloneNote,
} from '../types';

interface ReaderSidePanelProps {
  sidePanel: SidePanel;
  onSetSidePanel: (panel: SidePanel) => void;
  toc: any[];
  isPreviewMode?: boolean;
  previewLimitType?: 'CHAPTERS' | 'PERCENTAGE';
  previewLimitValue?: number;
  onDisplayTocItem: (href: string, index: number) => void;

  highlights: Highlight[];
  inlinePanelEditId: string | null;
  inlinePanelNote: string;
  onSetInlinePanelEditId: (id: string | null) => void;
  onSetInlinePanelNote: (note: string) => void;
  onSaveHighlightNote: (id: string, note: string) => Promise<void>;
  onDeleteHighlight: (id: string, cfi: string) => void;
  onDisplayCfi: (cfi: string) => void;

  standaloneNotes: StandaloneNote[];
  editingNoteId: string | null;
  editingNoteText: string;
  onSetEditingNoteId: (id: string | null) => void;
  onSetEditingNoteText: (text: string) => void;
  onOpenQuickNote: () => void;
  onUpdateStandaloneNote: (id: string, content: string) => Promise<void>;
  onDeleteStandaloneNote: (id: string) => Promise<void>;

  bookmarks: Bookmark[];
}

export default function ReaderSidePanel({
  sidePanel,
  onSetSidePanel,
  toc,
  isPreviewMode,
  previewLimitType,
  previewLimitValue = 2,
  onDisplayTocItem,
  highlights,
  inlinePanelEditId,
  inlinePanelNote,
  onSetInlinePanelEditId,
  onSetInlinePanelNote,
  onSaveHighlightNote,
  onDeleteHighlight,
  onDisplayCfi,
  standaloneNotes,
  editingNoteId,
  editingNoteText,
  onSetEditingNoteId,
  onSetEditingNoteText,
  onOpenQuickNote,
  onUpdateStandaloneNote,
  onDeleteStandaloneNote,
  bookmarks,
}: ReaderSidePanelProps) {
  return (
    <>
      {sidePanel && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => onSetSidePanel(null)}
          aria-hidden="true"
        />
      )}
      <div
        className={`fixed left-0 top-0 z-50 h-full w-80 transform border-r border-landing-border bg-white shadow-2xl transition-transform duration-300 ease-in-out ${
          sidePanel ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Book navigation"
      >
        <div className="flex h-full flex-col">
          {/* Tab bar */}
          <div className="flex items-center border-b border-landing-border px-2 pt-2">
            {(['toc', 'highlights', 'notes', 'bookmarks'] as SidePanel[]).map((panel) => {
              const label =
                panel === 'toc'
                  ? 'Contents'
                  : panel === 'highlights'
                  ? 'Highlights'
                  : panel === 'notes'
                  ? 'Notes'
                  : 'Bookmarks';
              const badge =
                panel === 'notes'
                  ? standaloneNotes.length + highlights.filter((h) => h.note).length
                  : panel === 'highlights'
                  ? highlights.length
                  : panel === 'bookmarks'
                  ? bookmarks.length
                  : 0;

              const getIcon = (p: SidePanel) => {
                switch (p) {
                  case 'toc':
                    return (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10" />
                      </svg>
                    );
                  case 'highlights':
                    return (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a4 4 0 01-1.414.94l-3.535.884.884-3.535a4 4 0 01.94-1.414z" />
                      </svg>
                    );
                  case 'notes':
                    return (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    );
                  case 'bookmarks':
                    return (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" />
                      </svg>
                    );
                  default:
                    return null;
                }
              };

              return (
                <button
                  key={panel!}
                  onClick={() => onSetSidePanel(panel)}
                  title={label}
                  className={`relative flex flex-1 items-center justify-center rounded-t-lg py-3 transition-colors ${
                    sidePanel === panel
                      ? 'border-b-2 border-landing-accent text-landing-accent'
                      : 'text-landing-text-muted hover:text-landing-text hover:bg-landing-surface-muted/50'
                  }`}
                >
                  {getIcon(panel)}
                  {badge > 0 && (
                    <span className="absolute top-1 right-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-landing-accent px-1 text-[10px] font-bold text-white">
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
            <button
              onClick={() => onSetSidePanel(null)}
              className="ml-2 flex h-8 w-8 items-center justify-center rounded-full text-landing-text-muted transition hover:bg-landing-surface-muted hover:text-landing-text focus-visible:ring-2 focus-visible:ring-landing-accent"
              aria-label="Close panel"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* TOC */}
          {sidePanel === 'toc' && (
            <div className="flex-1 space-y-0.5 overflow-y-auto p-3">
              {toc?.map((item: any, index: number) => {
                const isChapterLocked =
                  isPreviewMode && previewLimitType === 'CHAPTERS' && index >= previewLimitValue;

                return (
                  <button
                    key={index}
                    onClick={() => {
                      onDisplayTocItem(item.href, index);
                      onSetSidePanel(null);
                    }}
                    className={`flex items-center justify-between w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                      isChapterLocked
                        ? 'text-landing-text-muted/60 hover:bg-amber-500/10'
                        : 'text-landing-text-muted hover:bg-landing-accent/10 hover:text-landing-accent'
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                    {isChapterLocked && (
                      <span className="ml-2 shrink-0 text-xs text-amber-600 dark:text-amber-400 font-medium">
                        🔒 Supporter
                      </span>
                    )}
                  </button>
                );
              })}
              {(!toc || toc.length === 0) && (
                <p className="px-3 py-8 text-center text-sm text-landing-text-muted">No table of contents available.</p>
              )}
            </div>
          )}

          {/* Highlights */}
          {sidePanel === 'highlights' && (
            <div className="flex-1 overflow-y-auto">
              {highlights.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-12 text-center">
                  <svg className="mb-3 h-10 w-10 text-landing-border" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a4 4 0 01-1.414.94l-3.535.884.884-3.535a4 4 0 01.94-1.414z" />
                  </svg>
                  <p className="text-sm font-medium text-landing-text">No highlights yet</p>
                  <p className="mt-1 text-xs text-landing-text-muted">Select any text while reading to highlight it.</p>
                </div>
              ) : (
                <div className="divide-y divide-landing-border">
                  {highlights.map((h) => {
                    const accentColor = h.color === 'yellow' ? '#ca8a04' : h.color === 'green' ? '#16a34a' : '#2563eb';
                    const bgColor = h.color === 'yellow' ? '#fefce8' : h.color === 'green' ? '#f0fdf4' : '#eff6ff';
                    const isEditing = inlinePanelEditId === h.id;

                    return (
                      <div key={h.id} className="group px-4 py-4">
                        {/* Quoted text with colour bar */}
                        <div className="mb-2 flex gap-2.5">
                          <div className="mt-0.5 w-1 shrink-0 rounded-full" style={{ backgroundColor: accentColor }} />
                          <p className="text-sm leading-relaxed text-landing-text">&ldquo;{h.text}&rdquo;</p>
                        </div>

                        {/* Note display / inline edit */}
                        {isEditing ? (
                          <div className="mb-2 ml-3.5">
                            <textarea
                              autoFocus
                              value={inlinePanelNote}
                              onChange={(e) => onSetInlinePanelNote(e.target.value)}
                              onKeyDown={async (e) => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                  await onSaveHighlightNote(h.id, inlinePanelNote.trim());
                                  onSetInlinePanelEditId(null);
                                }
                                if (e.key === 'Escape') onSetInlinePanelEditId(null);
                              }}
                              placeholder="Write a note…"
                              rows={3}
                              className="w-full resize-none rounded-xl border border-landing-border bg-landing-surface-muted px-3 py-2 text-xs text-landing-text outline-none focus:border-landing-accent focus:ring-1 focus:ring-landing-accent"
                            />
                            <div className="mt-1.5 flex gap-2">
                              <button
                                onClick={() => onSetInlinePanelEditId(null)}
                                className="rounded-lg border border-landing-border px-3 py-1 text-xs text-landing-text-muted transition hover:border-landing-accent/40"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={async () => {
                                  await onSaveHighlightNote(h.id, inlinePanelNote.trim());
                                  onSetInlinePanelEditId(null);
                                }}
                                className="rounded-lg bg-landing-accent px-3 py-1 text-xs font-semibold text-white transition hover:bg-landing-accent-secondary"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : h.note ? (
                          <div
                            className="mb-2 ml-3.5 cursor-text rounded-lg px-3 py-2 text-xs leading-relaxed text-landing-text transition-colors hover:bg-landing-surface-muted"
                            style={{ borderLeft: `2px solid ${accentColor}33`, backgroundColor: bgColor }}
                            onClick={() => {
                              onSetInlinePanelEditId(h.id);
                              onSetInlinePanelNote(h.note || '');
                            }}
                            title="Click to edit note"
                          >
                            {h.note}
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              onSetInlinePanelEditId(h.id);
                              onSetInlinePanelNote('');
                            }}
                            className="mb-2 ml-3.5 flex items-center gap-1 text-xs text-landing-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-landing-accent"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add note
                          </button>
                        )}

                        {/* Action row */}
                        <div className="ml-3.5 flex items-center gap-3">
                          <button
                            onClick={() => {
                              onDisplayCfi(h.cfi);
                              onSetSidePanel(null);
                            }}
                            className="flex items-center gap-1 text-xs font-medium text-landing-accent transition hover:text-landing-accent-secondary"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            Jump to
                          </button>
                          <button
                            onClick={() => onDeleteHighlight(h.id, h.cfi)}
                            className="text-xs text-landing-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {sidePanel === 'notes' &&
            (() => {
              const highlightNoteItems = highlights
                .filter((h) => h.note)
                .map((h) => ({
                  type: 'highlight' as const,
                  id: h.id,
                  content: h.note!,
                  quote: h.text,
                  color: h.color,
                  cfi: h.cfi,
                  createdAt: '',
                }));
              const standaloneItems = standaloneNotes.map((n) => ({
                type: 'note' as const,
                id: n.id,
                content: n.content,
                quote: '',
                color: '',
                cfi: n.cfi,
                createdAt: n.createdAt,
              }));
              const all = [...highlightNoteItems, ...standaloneItems];

              return (
                <div className="flex-1 overflow-y-auto">
                  {all.length === 0 ? (
                    <div className="flex flex-col items-center px-6 py-12 text-center">
                      <svg className="mb-3 h-10 w-10 text-landing-border" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      <p className="text-sm font-medium text-landing-text">No notes yet</p>
                      <p className="mt-1 text-xs leading-relaxed text-landing-text-muted">
                        Use the pencil button in the toolbar to write a note at any position, or add notes to your highlights.
                      </p>
                      <button
                        onClick={onOpenQuickNote}
                        className="mt-4 rounded-xl bg-landing-accent px-4 py-2 text-xs font-semibold text-white transition hover:bg-landing-accent-secondary"
                      >
                        Write a note
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-landing-border">
                      {/* Quick-add note button at top */}
                      <button
                        onClick={onOpenQuickNote}
                        className="flex w-full items-center gap-2 px-4 py-3 text-xs font-semibold text-landing-accent transition hover:bg-landing-accent/5"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add note at current position
                      </button>

                      {all.map((item) => {
                        const accentColor =
                          item.type === 'highlight'
                            ? item.color === 'yellow'
                              ? '#ca8a04'
                              : item.color === 'green'
                              ? '#16a34a'
                              : '#2563eb'
                            : '#3D737A';
                        const isEditing = editingNoteId === item.id;

                        return (
                          <div key={`${item.type}-${item.id}`} className="group px-4 py-4">
                            {/* Source label */}
                            <div className="mb-2 flex items-center gap-1.5">
                              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: accentColor }} />
                              <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: accentColor }}>
                                {item.type === 'highlight' ? 'Highlight note' : 'Note'}
                              </span>
                            </div>

                            {/* Quoted text (highlight notes only) */}
                            {item.quote && (
                              <p className="mb-2 border-l-2 pl-3 text-xs italic leading-relaxed text-landing-text-muted" style={{ borderColor: accentColor }}>
                                &ldquo;{item.quote}&rdquo;
                              </p>
                            )}

                            {/* Note content — inline editable */}
                            {isEditing ? (
                              <div className="mb-2">
                                <textarea
                                  autoFocus
                                  value={editingNoteText}
                                  onChange={(e) => onSetEditingNoteText(e.target.value)}
                                  onKeyDown={async (e) => {
                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                      if (item.type === 'note') {
                                        await onUpdateStandaloneNote(item.id, editingNoteText.trim());
                                      } else {
                                        await onSaveHighlightNote(item.id, editingNoteText.trim());
                                      }
                                      onSetEditingNoteId(null);
                                    }
                                    if (e.key === 'Escape') onSetEditingNoteId(null);
                                  }}
                                  rows={3}
                                  className="w-full resize-none rounded-xl border border-landing-border bg-landing-surface-muted px-3 py-2 text-xs text-landing-text outline-none focus:border-landing-accent focus:ring-1 focus:ring-landing-accent"
                                />
                                <div className="mt-1.5 flex gap-2">
                                  <button
                                    onClick={() => onSetEditingNoteId(null)}
                                    className="rounded-lg border border-landing-border px-3 py-1 text-xs text-landing-text-muted transition hover:border-landing-accent/40"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (item.type === 'note') {
                                        await onUpdateStandaloneNote(item.id, editingNoteText.trim());
                                      } else {
                                        await onSaveHighlightNote(item.id, editingNoteText.trim());
                                      }
                                      onSetEditingNoteId(null);
                                    }}
                                    className="rounded-lg bg-landing-accent px-3 py-1 text-xs font-semibold text-white transition hover:bg-landing-accent-secondary"
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                className="mb-2 cursor-text rounded-lg px-3 py-2 text-xs leading-relaxed text-landing-text transition-colors hover:bg-landing-surface-muted"
                                style={{ backgroundColor: '#f0f9fa', borderLeft: '2px solid #3D737A' }}
                                onClick={() => {
                                  onSetEditingNoteId(item.id);
                                  onSetEditingNoteText(item.content);
                                }}
                                title="Click to edit"
                              >
                                {item.content}
                              </div>
                            )}

                            {/* Action row */}
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => {
                                  onDisplayCfi(item.cfi);
                                  onSetSidePanel(null);
                                }}
                                className="flex items-center gap-1 text-xs font-medium text-landing-accent transition hover:text-landing-accent-secondary"
                              >
                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                                Jump to
                              </button>
                              <button
                                onClick={() => {
                                  if (item.type === 'note') {
                                    void onDeleteStandaloneNote(item.id);
                                  } else {
                                    void onSaveHighlightNote(item.id, '');
                                  }
                                }}
                                className="text-xs text-landing-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

          {/* Bookmarks */}
          {sidePanel === 'bookmarks' && (
            <div className="flex-1 overflow-y-auto p-3">
              {bookmarks.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-landing-text-muted">
                  No bookmarks yet. Use the bookmark icon to save your place.
                </p>
              ) : (
                <div className="space-y-1">
                  {bookmarks.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => {
                        onDisplayCfi(b.cfi);
                        onSetSidePanel(null);
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-landing-accent/10"
                    >
                      <svg className="h-4 w-4 shrink-0 text-landing-accent" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4V5z" />
                      </svg>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-landing-text">{b.label}</p>
                        {b.chapter && <p className="truncate text-xs text-landing-text-muted">{b.chapter}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
