'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Bookmark, Highlight, StandaloneNote } from '../types';

export function useReaderAnnotations(
  bookId: string,
  renditionRef: React.MutableRefObject<any>,
  bookRef: React.MutableRefObject<any>,
  currentCfiRef: React.MutableRefObject<string | null>,
  currentPage: number,
) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [standaloneNotes, setStandaloneNotes] = useState<StandaloneNote[]>([]);
  const [currentBookmark, setCurrentBookmark] = useState<string | null>(null);

  // Selected text popover state
  const [selectedText, setSelectedText] = useState<{ cfi: string; text: string } | null>(null);
  const [pendingColor, setPendingColor] = useState('yellow');
  const [pendingNote, setPendingNote] = useState('');

  // Edit existing highlight state
  const [editingHighlight, setEditingHighlight] = useState<Highlight | null>(null);
  const [editNote, setEditNote] = useState('');

  // Quick note modal state
  const [showQuickNote, setShowQuickNote] = useState(false);
  const [quickNoteText, setQuickNoteText] = useState('');

  // Side panel inline editing states
  const [inlinePanelEditId, setInlinePanelEditId] = useState<string | null>(null);
  const [inlinePanelNote, setInlinePanelNote] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  const registeredHighlightCfis = useRef<Set<string>>(new Set());
  const highlightsRef = useRef(highlights);
  highlightsRef.current = highlights;

  // Load annotations on mount
  useEffect(() => {
    fetch(`/api/highlights?bookId=${bookId}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setHighlights(data);
      })
      .catch((err) => console.error('Failed to load highlights', err));

    fetch(`/api/bookmarks?bookId=${bookId}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setBookmarks(data);
      })
      .catch((err) => console.error('Failed to load bookmarks', err));

    fetch(`/api/notes?bookId=${bookId}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setStandaloneNotes(data);
      })
      .catch((err) => console.error('Failed to load notes', err));
  }, [bookId]);

  // Apply highlights to rendition
  const applyHighlightsToRendition = useCallback(() => {
    if (!renditionRef.current) return;
    highlights.forEach((h) => {
      if (registeredHighlightCfis.current.has(h.cfi)) return;
      registeredHighlightCfis.current.add(h.cfi);
      renditionRef.current?.annotations.highlight(
        h.cfi,
        {},
        () => {
          const current = highlightsRef.current.find((x) => x.id === h.id);
          if (current) {
            setEditingHighlight(current);
            setEditNote(current.note || '');
          }
        },
        'hl-' + h.color,
        { fill: h.color, 'fill-opacity': '0.3' }
      );
    });
  }, [highlights, renditionRef]);

  const addHighlight = useCallback(async () => {
    if (!selectedText) return;
    const color = pendingColor;
    const note = pendingNote.trim() || undefined;

    try {
      const res = await fetch('/api/highlights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId,
          cfi: selectedText.cfi,
          text: selectedText.text,
          color,
          note,
        }),
      });

      if (res.ok) {
        const newHighlight = await res.json();
        setHighlights((prev) => [...prev, newHighlight]);
        renditionRef.current?.annotations.highlight(
          newHighlight.cfi,
          {},
          () => {
            const current = highlightsRef.current.find((x) => x.id === newHighlight.id);
            if (current) {
              setEditingHighlight(current);
              setEditNote(current.note || '');
            }
          },
          'hl-' + color,
          { fill: color, 'fill-opacity': '0.3' }
        );
      }
    } catch (error) {
      console.error('Failed to add highlight', error);
    }

    setSelectedText(null);
    setPendingNote('');
    setPendingColor('yellow');
  }, [selectedText, pendingColor, pendingNote, bookId, renditionRef]);

  const saveHighlightNote = useCallback(async () => {
    if (!editingHighlight) return;
    try {
      const res = await fetch(`/api/highlights/${editingHighlight.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: editNote }),
      });
      if (res.ok) {
        setHighlights((prev) =>
          prev.map((h) => (h.id === editingHighlight.id ? { ...h, note: editNote } : h))
        );
      }
    } catch (error) {
      console.error('Failed to save note', error);
    }
    setEditingHighlight(null);
  }, [editingHighlight, editNote]);

  const saveHighlightNoteFromPanel = useCallback(async (id: string, note: string) => {
    try {
      const res = await fetch(`/api/highlights/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note || null }),
      });
      if (res.ok) {
        setHighlights((prev) =>
          prev.map((x) => (x.id === id ? { ...x, note: note || undefined } : x))
        );
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const deleteHighlight = useCallback(
    async (id: string, cfi: string) => {
      try {
        await fetch(`/api/highlights?id=${id}`, { method: 'DELETE' });
        setHighlights((prev) => prev.filter((h) => h.id !== id));
        renditionRef.current?.annotations.remove(cfi, 'highlight');
        registeredHighlightCfis.current.delete(cfi);
      } catch (error) {
        console.error('Failed to delete highlight', error);
      }
      setEditingHighlight(null);
    },
    [renditionRef]
  );

  const saveQuickNote = useCallback(async () => {
    const cfi = currentCfiRef.current;
    const text = quickNoteText.trim();
    if (!cfi || !text) return;
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, cfi, content: text }),
      });
      if (res.ok) {
        const note = await res.json();
        setStandaloneNotes((prev) => [note, ...prev]);
      }
    } catch (e) {
      console.error(e);
    }
    setShowQuickNote(false);
    setQuickNoteText('');
  }, [bookId, currentCfiRef, quickNoteText]);

  const updateStandaloneNote = useCallback(async (id: string, content: string) => {
    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        setStandaloneNotes((prev) => prev.map((n) => (n.id === id ? { ...n, content } : n)));
      }
    } catch (e) {
      console.error(e);
    }
    setEditingNoteId(null);
  }, []);

  const deleteStandaloneNote = useCallback(async (id: string) => {
    try {
      await fetch(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setStandaloneNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      console.error(e);
    }
  }, []);

  const toggleBookmark = useCallback(async () => {
    const cfi = currentCfiRef.current;
    if (!cfi) return;
    const existing = bookmarks.find((b) => b.cfi === cfi);
    if (existing) {
      try {
        await fetch(`/api/bookmarks?id=${existing.id}`, { method: 'DELETE' });
        setBookmarks((prev) => prev.filter((b) => b.id !== existing.id));
        setCurrentBookmark(null);
      } catch (e) {
        console.error(e);
      }
    } else {
      try {
        const chapterLabel =
          (bookRef.current as any)?.navigation?.toc?.find(
            (item: any) => item.href && cfi.includes(item.href.split('#')[0])
          )?.label || '';
        const res = await fetch('/api/bookmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookId,
            cfi,
            chapter: chapterLabel,
            label: `Page ${currentPage}`,
          }),
        });
        if (res.ok) {
          const b = await res.json();
          setBookmarks((prev) => [...prev, b]);
          setCurrentBookmark(cfi);
        }
      } catch (e) {
        console.error(e);
      }
    }
  }, [bookId, bookmarks, currentCfiRef, currentPage, bookRef]);

  return {
    highlights,
    setHighlights,
    bookmarks,
    setBookmarks,
    standaloneNotes,
    setStandaloneNotes,
    currentBookmark,
    setCurrentBookmark,
    selectedText,
    setSelectedText,
    pendingColor,
    setPendingColor,
    pendingNote,
    setPendingNote,
    editingHighlight,
    setEditingHighlight,
    editNote,
    setEditNote,
    showQuickNote,
    setShowQuickNote,
    quickNoteText,
    setQuickNoteText,
    inlinePanelEditId,
    setInlinePanelEditId,
    inlinePanelNote,
    setInlinePanelNote,
    editingNoteId,
    setEditingNoteId,
    editingNoteText,
    setEditingNoteText,
    applyHighlightsToRendition,
    addHighlight,
    saveHighlightNote,
    saveHighlightNoteFromPanel,
    deleteHighlight,
    saveQuickNote,
    updateStandaloneNote,
    deleteStandaloneNote,
    toggleBookmark,
  };
}
