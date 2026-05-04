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

const TOUR_STEPS = [
  {
    title: 'Turn Pages',
    body: 'Swipe left or right to move between pages. On desktop, use the arrow buttons on each side of the screen.',
    icon: (
      <svg className="mx-auto h-10 w-10 text-landing-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7l-4 5 4 5M16 7l4 5-4 5" />
      </svg>
    ),
  },
  {
    title: 'Reading Controls',
    body: 'Tap the menu icon at the top-right any time to change theme, font size, or browse the table of contents.',
    icon: (
      <svg className="mx-auto h-10 w-10 text-landing-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
  },
  {
    title: 'Auto-Saved Progress',
    body: 'Your exact reading position is saved automatically. Pick up right where you left off next time.',
    icon: (
      <svg className="mx-auto h-10 w-10 text-landing-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
];

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
  const [showMenu, setShowMenu] = useState(false);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [selectedText, setSelectedText] = useState<{ cfi: string; text: string } | null>(null);
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [twoPage, setTwoPage] = useState(false);

  const locationTimeout = useRef<NodeJS.Timeout | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const currentCfiRef = useRef<string | null>(null);

  // ── First-time tour ──────────────────────────────────────────────
  useEffect(() => {
    const seen = localStorage.getItem('reader-tour-seen');
    if (!seen) setShowTour(true);
  }, []);

  const dismissTour = () => {
    localStorage.setItem('reader-tour-seen', '1');
    setShowTour(false);
    setTourStep(0);
  };

  // ── Keyboard navigation ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isReady) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') renditionRef.current?.next();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') renditionRef.current?.prev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isReady]);

  // ── Swipe helpers (called from epub.js rendition events, not React) ──
  const onIframeTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const onIframeTouchEnd = (e: TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 44) {
      if (dx < 0) renditionRef.current?.next();
      else renditionRef.current?.prev();
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

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

    let destroyed = false;
    let renditionInstance: Rendition | null = null;

    const initBook = async () => {
      // Pre-fetch as ArrayBuffer so epub.js doesn't misdetect the URL as a
      // directory (it triggers directory mode when the URL has no .epub extension)
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch epub: ${response.status}`);
      const buffer = await response.arrayBuffer();

      if (destroyed || !viewerRef.current) return;

      const book = ePub(buffer as any) as unknown as Book;
      bookRef.current = book;

      // Use explicit pixel dimensions so epub.js paginates correctly
      const container = viewerRef.current!;
      const rendition = book.renderTo(container, {
        width: container.clientWidth || window.innerWidth,
        height: container.clientHeight || window.innerHeight,
        flow: 'paginated',
        spread: twoPage ? 'auto' : 'none',
      }) as Rendition;

      renditionInstance = rendition;
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

      // Display book — resume position when two-page mode changes
      const resumeAt = currentCfiRef.current ?? initialLocation;
      const displayPromise = resumeAt
        ? rendition.display(resumeAt)
        : rendition.display();

      displayPromise.then(() => {
        if (!destroyed) setIsReady(true);
      }).catch(console.error);

      // Swipe navigation via epub.js relay (works across the iframe boundary)
      rendition.on('touchstart', onIframeTouchStart);
      rendition.on('touchend', onIframeTouchEnd);

      // Handle text selection
      rendition.on('selected', (cfiRange: string) => {
        const iframe = viewerRef.current?.querySelector('iframe');
        const text = iframe?.contentWindow?.getSelection()?.toString() || '';
        if (text) {
          setSelectedText({ cfi: cfiRange, text });
        }
      });

      // Track location changes
      rendition.on('relocated', (location: any) => {
        if (locationTimeout.current) clearTimeout(locationTimeout.current);
        currentCfiRef.current = location.start.cfi;

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
    };

    initBook().catch(console.error);

    return () => {
      destroyed = true;
      if (locationTimeout.current) clearTimeout(locationTimeout.current);
      renditionInstance?.destroy();
    };
  }, [url, twoPage]); // Re-initialize if URL or page-spread mode changes

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

  // ResizeObserver: keep epub.js pagination in sync with the CSS-sized book container
  useEffect(() => {
    if (!isReady || !viewerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) renditionRef.current?.resize(width, height);
    });
    ro.observe(viewerRef.current);
    return () => ro.disconnect();
  }, [isReady]);

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

  const progressPct = totalPages ? (currentPage / totalPages) * 100 : 0;

  return (
    <div className="relative h-screen w-full overflow-hidden">
      {/* ── Reading area: gutters with arrows flank the book canvas ─── */}
      <div className="absolute inset-0 flex items-stretch bg-landing-bg">

        {/* Left gutter — desktop arrow */}
        <div className="hidden md:flex w-20 shrink-0 items-center justify-center">
          <button
            onClick={() => renditionRef.current?.prev()}
            disabled={!isReady}
            aria-label="Previous page"
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-landing-accent/80 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-landing-accent disabled:pointer-events-none disabled:opacity-25"
          >
            <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Book canvas — portrait aspect ratio, centered */}
        <div className="flex flex-1 min-h-0 items-center justify-center overflow-hidden p-2 md:p-5">
          <div
            ref={viewerRef}
            className="overflow-hidden rounded-xl border border-landing-border bg-white shadow-2xl"
            style={{
              width: '100%',
              maxWidth: twoPage ? '1100px' : '560px',
              maxHeight: '100%',
              aspectRatio: twoPage ? '4 / 3' : '2 / 3',
            }}
          />
        </div>

        {/* Right gutter — desktop arrow */}
        <div className="hidden md:flex w-20 shrink-0 items-center justify-center">
          <button
            onClick={() => renditionRef.current?.next()}
            disabled={!isReady}
            aria-label="Next page"
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-landing-accent/80 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-landing-accent disabled:pointer-events-none disabled:opacity-25"
          >
            <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

      </div>

      {/* ── Floating hamburger (top-right, always visible) ────────────── */}
      <button
        onClick={() => setShowMenu(true)}
        className="absolute right-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-black/25 text-white shadow-md backdrop-blur-sm transition-all hover:bg-black/45 focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2"
        aria-label="Open reading menu"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* ── Page counter pill (top-left, always visible) ──────────────── */}
      <div
        aria-live="polite"
        className="absolute left-4 top-4 z-30 rounded-full bg-black/25 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm"
      >
        {currentPage} / {totalPages || '—'}
      </div>

      {/* ── Thin progress strip (bottom edge, always visible) ─────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-30 h-1 bg-black/10">
        <div
          className="h-full bg-landing-accent transition-[width] duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* ── Slide-in reader menu (right panel) ───────────────────────── */}
      {showMenu && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
          onClick={() => setShowMenu(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-72 transform border-l border-landing-border bg-white shadow-2xl transition-transform duration-300 ease-in-out ${
          showMenu ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Reading controls"
      >
        <div className="flex h-full flex-col p-5">
          {/* Panel header */}
          <div className="mb-6 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
              Reader Options
            </span>
            <button
              onClick={() => setShowMenu(false)}
              className="rounded-full p-2 text-landing-text-muted transition-colors hover:bg-landing-surface-muted hover:text-landing-text focus-visible:ring-2 focus-visible:ring-landing-accent"
              aria-label="Close menu"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Back to library */}
          <button
            onClick={() => window.history.back()}
            className="mb-3 flex items-center gap-2 rounded-xl border border-landing-border bg-landing-surface-muted px-4 py-3 text-sm font-medium text-landing-text transition-colors hover:border-landing-accent/40 hover:text-landing-accent"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Library
          </button>

          {/* Table of contents */}
          <button
            onClick={() => { setShowMenu(false); setShowToc(true); }}
            className="mb-5 flex items-center gap-2 rounded-xl bg-landing-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-landing-accent-secondary"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10" />
            </svg>
            Table of Contents
          </button>

          <div className="mb-4 border-t border-landing-border" />

          {/* Theme */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
            Theme
          </p>
          <div className="mb-5 flex gap-2">
            {(['light', 'dark', 'sepia'] as Theme[]).map((t) => (
              <button
                key={t}
                onClick={() => changeTheme(t)}
                className={`flex-1 rounded-xl border py-2 text-xs font-medium capitalize transition-all ${
                  theme === t
                    ? 'border-landing-accent bg-landing-accent text-white'
                    : 'border-landing-border text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-text'
                }`}
              >
                {t === 'light' ? '☀ Light' : t === 'dark' ? '🌙 Dark' : '📄 Sepia'}
              </button>
            ))}
          </div>

          {/* Layout: single vs two-page */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
            Layout
          </p>
          <div className="mb-5 flex gap-2">
            <button
              onClick={() => setTwoPage(false)}
              className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-all ${
                !twoPage
                  ? 'border-landing-accent bg-landing-accent text-white'
                  : 'border-landing-border text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-text'
              }`}
            >
              Single Page
            </button>
            <button
              onClick={() => setTwoPage(true)}
              className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-all ${
                twoPage
                  ? 'border-landing-accent bg-landing-accent text-white'
                  : 'border-landing-border text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-text'
              }`}
            >
              Two Pages
            </button>
          </div>

          {/* Font size */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
            Font Size
          </p>
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-landing-border bg-landing-surface-muted px-4 py-2">
            <button
              onClick={() => changeFontSize(-10)}
              className="text-base font-semibold text-landing-text-muted transition hover:text-landing-text"
              aria-label="Decrease font size"
            >
              A-
            </button>
            <span className="flex-1 text-center text-sm font-medium text-landing-text">
              {fontSize}%
            </span>
            <button
              onClick={() => changeFontSize(10)}
              className="text-base font-semibold text-landing-text-muted transition hover:text-landing-text"
              aria-label="Increase font size"
            >
              A+
            </button>
          </div>

          <div className="flex-1" />

          {/* Replay tour */}
          <button
            onClick={() => { setShowMenu(false); setTourStep(0); setShowTour(true); }}
            className="text-xs text-landing-text-muted underline-offset-2 transition hover:text-landing-accent hover:underline"
          >
            Replay reader tour
          </button>
        </div>
      </div>

      {/* ── Table of Contents sidebar (left) ─────────────────────────── */}
      {showToc && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setShowToc(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={`fixed left-0 top-0 z-50 h-full w-80 transform border-r border-landing-border bg-white shadow-2xl transition-transform duration-300 ease-in-out ${
          showToc ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-landing-border px-4 py-4">
            <h2 className="text-base font-semibold text-landing-text">Table of Contents</h2>
            <button
              onClick={() => setShowToc(false)}
              className="rounded-full p-2 text-landing-text-muted transition-colors hover:bg-landing-surface-muted hover:text-landing-text focus-visible:ring-2 focus-visible:ring-landing-accent"
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
                onClick={() => { renditionRef.current?.display(item.href); setShowToc(false); }}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-landing-text-muted transition-colors hover:bg-landing-accent/10 hover:text-landing-accent"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Highlight picker ──────────────────────────────────────────── */}
      {selectedText && (
        <div className="fixed left-1/2 top-1/2 z-50 w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-landing-border bg-white p-4 shadow-2xl">
          <p className="mb-3 text-sm text-landing-text-muted">Highlight selected text:</p>
          <div className="mb-3 flex gap-2">
            {[
              { color: 'yellow', bg: '#f8e16f' },
              { color: 'green', bg: '#99d98c' },
              { color: 'blue', bg: '#90caf9' },
            ].map(({ color, bg }) => (
              <button
                key={color}
                onClick={() => addHighlight(color)}
                className="h-10 w-10 rounded-full border border-black/10 transition hover:scale-105"
                style={{ backgroundColor: bg }}
                title={color}
              />
            ))}
          </div>
          <button
            onClick={() => setSelectedText(null)}
            className="w-full rounded-xl border border-landing-border bg-landing-surface-muted px-4 py-2 text-sm text-landing-text-muted transition-colors hover:text-landing-text"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── First-time reader tour ────────────────────────────────────── */}
      {showTour && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-3xl border border-landing-border bg-white p-8 shadow-2xl">
            {/* Step dots */}
            <div className="mb-6 flex justify-center gap-2">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    i === tourStep ? 'w-6 bg-landing-accent' : 'w-2 bg-landing-border'
                  }`}
                />
              ))}
            </div>

            {/* Icon */}
            <div className="mb-4">{TOUR_STEPS[tourStep].icon}</div>

            {/* Content */}
            <h3 className="mb-2 text-center text-lg font-semibold text-landing-text">
              {TOUR_STEPS[tourStep].title}
            </h3>
            <p className="mb-8 text-center text-sm leading-relaxed text-landing-text-muted">
              {TOUR_STEPS[tourStep].body}
            </p>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={dismissTour}
                className="flex-1 rounded-xl border border-landing-border py-2.5 text-sm text-landing-text-muted transition hover:border-landing-accent/40 hover:text-landing-text"
              >
                Skip
              </button>
              <button
                onClick={() => {
                  if (tourStep < TOUR_STEPS.length - 1) setTourStep(tourStep + 1);
                  else dismissTour();
                }}
                className="flex-1 rounded-xl bg-landing-accent py-2.5 text-sm font-semibold text-white transition hover:bg-landing-accent-secondary"
              >
                {tourStep < TOUR_STEPS.length - 1 ? 'Next' : 'Start Reading'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
