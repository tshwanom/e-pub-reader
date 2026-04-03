'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import ePub from 'epubjs';
import type { Book, Rendition } from 'epubjs';

interface ReaderProps {
  url: string;
  initialLocation?: string | null;
  bookId: string;
}

interface Highlight {
  id: string;
  cfi: string;
  text: string;
  color: string;
  note?: string;
}

type Theme = 'light' | 'dark' | 'sepia';

export default function Reader({ url, initialLocation, bookId }: ReaderProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const bookRef = useRef<Book | null>(null);
  
  const [isReady, setIsReady] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [theme, setTheme] = useState<Theme>('light');
  const [fontSize, setFontSize] = useState(100);
  const [showToc, setShowToc] = useState(false);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [selectedText, setSelectedText] = useState<{cfi: string; text: string} | null>(null);
  
  const locationTimeout = useRef<NodeJS.Timeout | null>(null);

  // Save progress
  const saveProgress = useCallback(async (cfi: string, percentage: number) => {
    try {
      await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, cfi, progress: percentage * 100 }),
      });
    } catch (error) {
      console.error('Failed to save progress', error);
    }
  }, [bookId]);

  // Load highlights
  useEffect(() => {
    const loadHighlights = async () => {
      try {
        const res = await fetch(`/api/highlights?bookId=${bookId}`);
        if (res.ok) {
          const data = await res.json();
          setHighlights(data);
        }
      } catch (error) {
        console.error('Failed to load highlights', error);
      }
    };
    loadHighlights();
  }, [bookId]);

  // Initialize book - only once!
  useEffect(() => {
    if (!viewerRef.current) return;

    const book = ePub(url) as unknown as Book;
    bookRef.current = book;

    const rendition = book.renderTo(viewerRef.current, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      manager: 'default',
      snap: true,
      minSpreadWidth: 800,
      spread: 'auto',
    }) as Rendition;
    
    renditionRef.current = rendition;

    // Register themes
    rendition.themes.register('light', {
      body: { background: '#ffffff', color: '#000000' },
    });
    rendition.themes.register('dark', {
      body: { background: '#1a1a1a', color: '#e0e0e0' },
    });
    rendition.themes.register('sepia', {
      body: { background: '#f4ecd8', color: '#5c4a3a' },
    });
    
    rendition.themes.select(theme);
    rendition.themes.fontSize(`${fontSize}%`);

    // Display book
    const displayPromise = initialLocation
      ? rendition.display(initialLocation)
      : rendition.display();

    displayPromise.then(() => {
      setIsReady(true);
    });

    // Handle text selection
    rendition.on('selected', (cfiRange: string) => {
      // Get text from the iframe's window
      const iframe = viewerRef.current?.querySelector('iframe');
      const text = iframe?.contentWindow?.getSelection()?.toString() || '';
      if (text) {
        setSelectedText({ cfi: cfiRange, text });
      }
    });

    // Track location changes
    rendition.on('relocated', (location: any) => {
      if (locationTimeout.current) clearTimeout(locationTimeout.current);
      
      const currentLocation = location.start.index || 0;
      setCurrentPage(currentLocation + 1);
      
      if (location.end && location.end.index) {
        setTotalPages(location.end.index + 1);
      }
      
      locationTimeout.current = setTimeout(() => {
        const percentage = location.start.percentage || 0;
        saveProgress(location.start.cfi, percentage);
      }, 1000);
    });

    return () => {
      if (locationTimeout.current) clearTimeout(locationTimeout.current);
      rendition.destroy();
    };
  }, [url]); // Only re-initialize if URL changes!

  // Load and apply highlights separately
  useEffect(() => {
    if (!renditionRef.current || highlights.length === 0) return;
    
    highlights.forEach((h) => {
      renditionRef.current?.annotations.highlight(
        h.cfi,
        {},
        () => {
          alert(h.note || 'Highlight');
        }, 'hl-' + h.color, { fill: h.color, 'fill-opacity': '0.3' });
    });
  }, [highlights]);

  // Theme switching
  const changeTheme = useCallback((newTheme: Theme) => {
    setTheme(newTheme);
    renditionRef.current?.themes.select(newTheme);
  }, []);

  // Font size
  const changeFontSize = useCallback((delta: number) => {
    const newSize = Math.max(80, Math.min(150, fontSize + delta));
    setFontSize(newSize);
    renditionRef.current?.themes.fontSize(`${newSize}%`);
  }, [fontSize]);

  // Add highlight
  const addHighlight = async (color: string) => {
    if (!selectedText) return;
    
    try {
      const res = await fetch('/api/highlights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId,
          cfi: selectedText.cfi,
          text: selectedText.text,
          color,
        }),
      });
      
      if (res.ok) {
        const newHighlight = await res.json();
        setHighlights([...highlights, newHighlight]);
        renditionRef.current?.annotations.highlight(
          newHighlight.cfi,
          {},
          () => {},
          'hl-' + color,
          { fill: color, 'fill-opacity': '0.3' }
        );
      }
    } catch (error) {
      console.error('Failed to add highlight', error);
    }
    
    setSelectedText(null);
  };

  return (
    <div className="relative h-screen w-full bg-landing-bg text-landing-text">
      {/* Table of Contents Sidebar */}
      <div
        className={`fixed top-0 left-0 z-50 h-full w-80 transform border-r border-landing-border bg-white/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-in-out ${
          showToc ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-landing-border px-4 py-4">
            <h2 className="text-base font-semibold text-landing-text">Table of Contents</h2>
            <button
              onClick={() => setShowToc(false)}
              className="rounded-full p-2 text-landing-text-muted transition-colors hover:bg-landing-surface-muted hover:text-landing-text"
              aria-label="Close table of contents"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 space-y-1 overflow-y-auto p-4">
            {bookRef.current?.navigation?.toc?.map((item: any, index: number) => (
              <button
                key={index}
                onClick={() => {
                  renditionRef.current?.display(item.href);
                  setShowToc(false);
                }}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-landing-text-muted transition-colors hover:bg-landing-accent/10 hover:text-landing-accent"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showToc && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setShowToc(false)}
        />
      )}

      {/* Top Controls */}
      <div className="absolute left-0 right-0 top-0 z-30 border-b border-landing-border bg-white/90 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1320px] items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => window.history.back()}
              className="inline-flex items-center gap-2 rounded-xl border border-landing-border bg-white px-4 py-2 text-sm font-medium text-landing-text transition-colors hover:border-landing-accent/40 hover:text-landing-accent"
              title="Back to book details"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back
            </button>
            
            <button
              onClick={() => setShowToc(!showToc)}
              className="rounded-xl bg-landing-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-landing-accent-secondary"
            >
              Contents
            </button>
            
            <div className="flex items-center gap-1 rounded-xl border border-landing-border bg-landing-surface-muted p-1">
              <button
                onClick={() => changeTheme('light')}
                className={`rounded-lg px-3 py-1 text-sm transition ${theme === 'light' ? 'bg-white text-landing-accent shadow-sm' : 'text-landing-text-muted hover:text-landing-text'}`}
                title="Light"
              >
                ☀️
              </button>
              <button
                onClick={() => changeTheme('dark')}
                className={`rounded-lg px-3 py-1 text-sm transition ${theme === 'dark' ? 'bg-white text-landing-accent shadow-sm' : 'text-landing-text-muted hover:text-landing-text'}`}
                title="Dark"
              >
                🌙
              </button>
              <button
                onClick={() => changeTheme('sepia')}
                className={`rounded-lg px-3 py-1 text-sm transition ${theme === 'sepia' ? 'bg-white text-landing-accent shadow-sm' : 'text-landing-text-muted hover:text-landing-text'}`}
                title="Sepia"
              >
                📄
              </button>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-landing-border bg-landing-surface-muted px-3 py-2">
              <button
                onClick={() => changeFontSize(-10)}
                className="rounded px-2 py-1 text-sm font-semibold text-landing-text-muted transition hover:bg-white hover:text-landing-text"
                title="Decrease font size"
              >
                A-
              </button>
              <span className="text-sm text-landing-text-muted">{fontSize}%</span>
              <button
                onClick={() => changeFontSize(10)}
                className="rounded px-2 py-1 text-sm font-semibold text-landing-text-muted transition hover:bg-white hover:text-landing-text"
                title="Increase font size"
              >
                A+
              </button>
            </div>
          </div>

          <div className="text-sm text-landing-text-muted">
            Page {currentPage} of {totalPages || '--'}
          </div>
        </div>
      </div>

      {/* Viewer */}
      <div className="absolute bottom-[78px] left-0 right-0 top-[74px] flex items-center justify-center bg-landing-bg px-3 py-3 sm:px-6 sm:py-5">
        <div ref={viewerRef} className="h-full w-full max-w-6xl overflow-hidden rounded-2xl border border-landing-border bg-white shadow-sm" />
      </div>

      {/* Bottom Navigation */}
      <div className="absolute bottom-0 left-0 right-0 z-30 border-t border-landing-border bg-white/90 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1320px] items-center gap-3 sm:gap-4">
          <button
            onClick={() => renditionRef.current?.prev()}
            disabled={!isReady}
            className="rounded-xl border border-landing-border bg-white px-5 py-2 text-sm text-landing-text transition-colors hover:border-landing-accent/40 hover:text-landing-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            ← Previous
          </button>

          <div className="flex-1">
            <div className="h-2 w-full rounded-full bg-landing-surface-muted">
              <div
                className="h-2 rounded-full bg-landing-accent transition-all"
                style={{ width: `${totalPages ? (currentPage / totalPages) * 100 : 0}%` }}
              />
            </div>
          </div>

          <button
            onClick={() => renditionRef.current?.next()}
            disabled={!isReady}
            className="rounded-xl bg-landing-accent px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-landing-accent-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Highlight Menu */}
      {selectedText && (
        <div className="fixed left-1/2 top-1/2 z-50 w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-landing-border bg-white p-4 shadow-2xl">
          <p className="mb-3 text-sm text-landing-text-muted">Highlight this text:</p>
          <div className="mb-3 flex gap-2">
            <button
              onClick={() => addHighlight('yellow')}
              className="h-10 w-10 rounded-full border border-black/10 transition hover:scale-105"
              style={{ backgroundColor: '#f8e16f' }}
              title="Yellow"
            />
            <button
              onClick={() => addHighlight('green')}
              className="h-10 w-10 rounded-full border border-black/10 transition hover:scale-105"
              style={{ backgroundColor: '#99d98c' }}
              title="Green"
            />
            <button
              onClick={() => addHighlight('blue')}
              className="h-10 w-10 rounded-full border border-black/10 transition hover:scale-105"
              style={{ backgroundColor: '#90caf9' }}
              title="Blue"
            />
          </div>
          <button
            onClick={() => setSelectedText(null)}
            className="w-full rounded-xl border border-landing-border bg-landing-surface-muted px-4 py-2 text-sm text-landing-text-muted transition-colors hover:text-landing-text"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
