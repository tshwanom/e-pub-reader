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

interface Bookmark {
  id: string;
  cfi: string;
  chapter?: string;
  label: string;
}

interface SearchResult {
  cfi: string;
  excerpt: string;
}

type Theme = 'light' | 'dark' | 'sepia';
type Flow = 'paginated' | 'scrolled';
type FontFamily = 'Crimson Pro' | 'Inter' | 'Georgia';
type LineSpacing = 1.4 | 1.6 | 1.9;
type SidePanel = 'toc' | 'highlights' | 'bookmarks' | null;

const FONT_FAMILIES: { label: string; value: FontFamily }[] = [
  { label: 'Serif', value: 'Crimson Pro' },
  { label: 'Sans', value: 'Inter' },
  { label: 'Classic', value: 'Georgia' },
];

const LINE_SPACINGS: { label: string; value: LineSpacing }[] = [
  { label: 'Compact', value: 1.4 },
  { label: 'Normal', value: 1.6 },
  { label: 'Relaxed', value: 1.9 },
];

const READING_SPEED_WPM = 250; // avg adult reading speed

const TOUR_STEPS = [
  {
    title: 'Turn Pages',
    body: 'Swipe left or right to move between pages. On desktop, use the arrow buttons or keyboard arrow keys.',
    icon: (
      <svg className="mx-auto h-10 w-10 text-landing-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7l-4 5 4 5M16 7l4 5-4 5" />
      </svg>
    ),
  },
  {
    title: 'Reading Controls',
    body: 'Tap the menu icon at the top-right any time to change theme, font, size, or browse the table of contents.',
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
  const [fontFamily, setFontFamily] = useState<FontFamily>('Crimson Pro');
  const [lineSpacing, setLineSpacing] = useState<LineSpacing>(1.6);
  const [flow, setFlow] = useState<Flow>('paginated');
  const [showMenu, setShowMenu] = useState(false);
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [selectedText, setSelectedText] = useState<{ cfi: string; text: string } | null>(null);
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [twoPage, setTwoPage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [editingHighlight, setEditingHighlight] = useState<Highlight | null>(null);
  const [editNote, setEditNote] = useState('');
  const [isFading, setIsFading] = useState(false);
  const [goToInput, setGoToInput] = useState('');
  const [showGoTo, setShowGoTo] = useState(false);
  const [currentBookmark, setCurrentBookmark] = useState<string | null>(null); // cfi of bookmark at current location

  const locationTimeout = useRef<NodeJS.Timeout | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const currentCfiRef = useRef<string | null>(null);
  const isFirstRelocate = useRef(true);

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
      if (showSearch || showGoTo) return; // don't intercept while typing
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') renditionRef.current?.next();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') renditionRef.current?.prev();
      if (e.key === 'f' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setShowSearch(true); }
      if (e.key === 'Escape') { setShowSearch(false); setShowGoTo(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isReady, showSearch, showGoTo]);

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

  // Load highlights and bookmarks
  useEffect(() => {
    const loadAnnotations = async () => {
      try {
        const [hRes, bRes] = await Promise.all([
          fetch(`/api/highlights?bookId=${bookId}`),
          fetch(`/api/bookmarks?bookId=${bookId}`),
        ]);
        if (hRes.ok) setHighlights(await hRes.json());
        if (bRes.ok) setBookmarks(await bRes.json());
      } catch (error) {
        console.error('Failed to load annotations', error);
      }
    };
    loadAnnotations();
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
        flow: flow === 'scrolled' ? 'scrolled' : 'paginated',
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
      rendition.themes.font(fontFamily);
      rendition.themes.override({ 'line-height': String(lineSpacing) });

      // Display book — resume position when two-page/flow mode changes
      const resumeAt = currentCfiRef.current ?? initialLocation;
      const displayPromise = resumeAt
        ? rendition.display(resumeAt)
        : rendition.display();

      displayPromise.then(() => {
        if (!destroyed) {
          setIsReady(true);
          isFirstRelocate.current = true;
        }
      }).catch(console.error);

      // Estimate word count for time-to-finish
      book.ready.then(() => {
        let total = 0;
        book.spine.each((item: any) => {
          item.load(book.load.bind(book)).then((doc: Document) => {
            total += (doc.body?.textContent || '').split(/\s+/).filter(Boolean).length;
            setWordCount(total);
          }).catch(() => {});
        });
      });

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

        const pct = location.start.percentage || 0;
        setProgressPct(pct * 100);

        // Update current bookmark state
        setCurrentBookmark(null);

        // Page turn crossfade (skip the very first display)
        if (!isFirstRelocate.current) {
          setIsFading(true);
          setTimeout(() => setIsFading(false), 120);
        }
        isFirstRelocate.current = false;

        locationTimeout.current = setTimeout(() => {
          saveProgress(location.start.cfi, pct);
        }, 1000);
      });
    };

    initBook().catch(console.error);

    return () => {
      destroyed = true;
      if (locationTimeout.current) clearTimeout(locationTimeout.current);
      renditionInstance?.destroy();
    };
  }, [url, twoPage, flow]); // Re-initialize if URL, page-spread, or flow mode changes

  // Load and apply highlights separately
  useEffect(() => {
    if (!renditionRef.current || highlights.length === 0) return;
    
    highlights.forEach((h) => {
      renditionRef.current?.annotations.highlight(
        h.cfi,
        {},
        () => {
          setEditingHighlight(h);
          setEditNote(h.note || '');
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

  // Font family
  const changeFontFamily = useCallback((family: FontFamily) => {
    setFontFamily(family);
    renditionRef.current?.themes.font(family);
  }, []);

  // Line spacing
  const changeLineSpacing = useCallback((spacing: LineSpacing) => {
    setLineSpacing(spacing);
    renditionRef.current?.themes.override({ 'line-height': String(spacing) });
  }, []);

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
          () => {
            setEditingHighlight(newHighlight);
            setEditNote(newHighlight.note || '');
          },
          'hl-' + color,
          { fill: color, 'fill-opacity': '0.3' }
        );
      }
    } catch (error) {
      console.error('Failed to add highlight', error);
    }
    
    setSelectedText(null);
  };

  // Save highlight note
  const saveHighlightNote = async () => {
    if (!editingHighlight) return;
    try {
      const res = await fetch(`/api/highlights/${editingHighlight.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: editNote }),
      });
      if (res.ok) {
        setHighlights(highlights.map(h =>
          h.id === editingHighlight.id ? { ...h, note: editNote } : h
        ));
      }
    } catch (error) {
      console.error('Failed to save note', error);
    }
    setEditingHighlight(null);
  };

  // Delete highlight
  const deleteHighlight = async (id: string, cfi: string) => {
    try {
      await fetch(`/api/highlights?id=${id}`, { method: 'DELETE' });
      setHighlights(highlights.filter(h => h.id !== id));
      renditionRef.current?.annotations.remove(cfi, 'highlight');
    } catch (error) {
      console.error('Failed to delete highlight', error);
    }
    setEditingHighlight(null);
  };

  // Toggle bookmark at current location
  const toggleBookmark = async () => {
    const cfi = currentCfiRef.current;
    if (!cfi) return;
    const existing = bookmarks.find(b => b.cfi === cfi);
    if (existing) {
      // Remove
      try {
        await fetch(`/api/bookmarks?id=${existing.id}`, { method: 'DELETE' });
        setBookmarks(bookmarks.filter(b => b.id !== existing.id));
        setCurrentBookmark(null);
      } catch (e) { console.error(e); }
    } else {
      // Add
      try {
        const chapterLabel = (bookRef.current as any)?.navigation?.toc?.find(
          (item: any) => item.href && cfi.includes(item.href.split('#')[0])
        )?.label || '';
        const res = await fetch('/api/bookmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookId, cfi, chapter: chapterLabel, label: `Page ${currentPage}` }),
        });
        if (res.ok) {
          const b = await res.json();
          setBookmarks([...bookmarks, b]);
          setCurrentBookmark(cfi);
        }
      } catch (e) { console.error(e); }
    }
  };

  // In-book search
  const runSearch = useCallback(async (query: string) => {
    if (!query.trim() || !bookRef.current) return;
    setIsSearching(true);
    setSearchResults([]);
    try {
      const results: SearchResult[] = [];
      await Promise.all(
        (bookRef.current.spine as any).spineItems.map(async (item: any) => {
          const doc = await item.load((bookRef.current as any).load.bind(bookRef.current));
          const text = doc.body?.textContent || '';
          const lower = text.toLowerCase();
          const q = query.toLowerCase();
          let idx = 0;
          while ((idx = lower.indexOf(q, idx)) !== -1) {
            const excerpt = text.slice(Math.max(0, idx - 40), idx + query.length + 40).trim();
            // Generate a rough CFI — navigate to item start, user gets close enough
            results.push({ cfi: item.cfiFromElement(doc.body) || item.href, excerpt: `…${excerpt}…` });
            idx += query.length;
            if (results.length >= 30) break;
          }
          item.unload();
        })
      );
      setSearchResults(results);
    } catch (e) {
      console.error('Search failed', e);
    }
    setIsSearching(false);
  }, []);

  // Go to location by % or chapter index
  const goToLocation = () => {
    const val = goToInput.trim();
    if (!val) return;
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0 && num <= 100) {
      // Navigate by percentage using spine
      const spine = (bookRef.current as any)?.spine?.spineItems;
      if (spine && spine.length) {
        const idx = Math.min(Math.floor((num / 100) * spine.length), spine.length - 1);
        renditionRef.current?.display(spine[idx].href);
      }
    }
    setShowGoTo(false);
    setGoToInput('');
  };

  // Time-to-finish estimate
  const wordsRemaining = wordCount > 0 ? wordCount * (1 - progressPct / 100) : 0;
  const minutesRemaining = wordsRemaining > 0 ? Math.ceil(wordsRemaining / READING_SPEED_WPM) : 0;

  const isBookmarkedHere = bookmarks.some(b => b.cfi === currentCfiRef.current);

  return (
    <div className="relative h-screen w-full overflow-hidden">

      {/* ── Reading area ──────────────────────────────────────────────── */}
      <div className="absolute inset-0 flex items-stretch bg-landing-bg">

        {/* Left gutter — desktop prev arrow (hidden in scroll mode) */}
        {flow === 'paginated' && (
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
        )}

        {/* Book canvas */}
        <div className="flex flex-1 min-h-0 items-center justify-center overflow-hidden p-2 md:p-5">
          <div
            ref={viewerRef}
            className={`overflow-hidden rounded-xl border border-landing-border bg-white shadow-2xl transition-opacity duration-150 ${isFading ? 'opacity-0' : 'opacity-100'}`}
            style={flow === 'scrolled' ? {
              width: '100%',
              maxWidth: '680px',
              height: '100%',
            } : {
              width: '100%',
              maxWidth: twoPage ? '1100px' : '560px',
              maxHeight: '100%',
              aspectRatio: twoPage ? '4 / 3' : '2 / 3',
            }}
          />
        </div>

        {/* Right gutter — desktop next arrow (hidden in scroll mode) */}
        {flow === 'paginated' && (
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
        )}
      </div>

      {/* ── Top toolbar ───────────────────────────────────────────────── */}
      <div className="absolute left-0 right-0 top-0 z-30 flex items-center justify-between px-4 py-3 pointer-events-none">
        {/* Left: page counter + time estimate */}
        <div className="pointer-events-auto flex items-center gap-2">
          <div
            aria-live="polite"
            className="rounded-full bg-black/25 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm"
          >
            {currentPage} / {totalPages || '—'}
          </div>
          {minutesRemaining > 0 && (
            <div className="rounded-full bg-black/20 px-3 py-1 text-xs text-white/80 backdrop-blur-sm">
              {minutesRemaining < 60
                ? `${minutesRemaining} min left`
                : `${Math.floor(minutesRemaining / 60)}h ${minutesRemaining % 60}m left`}
            </div>
          )}
        </div>

        {/* Right: search, bookmark, go-to, menu */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Search */}
          <button
            onClick={() => setShowSearch(true)}
            aria-label="Search in book"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm transition hover:bg-black/45 focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </button>

          {/* Go to location */}
          <button
            onClick={() => setShowGoTo(true)}
            aria-label="Go to location"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm transition hover:bg-black/45 focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          {/* Bookmark toggle */}
          <button
            onClick={toggleBookmark}
            aria-label={isBookmarkedHere ? 'Remove bookmark' : 'Add bookmark'}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm transition hover:bg-black/45 focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2"
          >
            <svg className="h-4 w-4" fill={isBookmarkedHere ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4V5z" />
            </svg>
          </button>

          {/* Hamburger menu */}
          <button
            onClick={() => setShowMenu(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/25 text-white shadow-md backdrop-blur-sm transition hover:bg-black/45 focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2"
            aria-label="Open reading menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Progress strip (bottom edge) ──────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-30 h-1 bg-black/10">
        <div
          className="h-full bg-landing-accent transition-[width] duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* ── Reader Options menu (right slide-in) ──────────────────────── */}
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
        <div className="flex h-full flex-col overflow-y-auto p-5">
          <div className="mb-6 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Reader Options</span>
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

          <button
            onClick={() => window.history.back()}
            className="mb-3 flex items-center gap-2 rounded-xl border border-landing-border bg-landing-surface-muted px-4 py-3 text-sm font-medium text-landing-text transition-colors hover:border-landing-accent/40 hover:text-landing-accent"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Library
          </button>

          <button
            onClick={() => { setShowMenu(false); setSidePanel('toc'); }}
            className="mb-5 flex items-center gap-2 rounded-xl bg-landing-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-landing-accent-secondary"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10" />
            </svg>
            Table of Contents
          </button>

          <div className="mb-4 border-t border-landing-border" />

          {/* Theme */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Theme</p>
          <div className="mb-5 flex gap-2">
            {(['light', 'dark', 'sepia'] as Theme[]).map((t) => (
              <button
                key={t}
                onClick={() => changeTheme(t)}
                className={`flex-1 rounded-xl border py-2 text-xs font-medium capitalize transition-all ${
                  theme === t ? 'border-landing-accent bg-landing-accent text-white' : 'border-landing-border text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-text'
                }`}
              >
                {t === 'light' ? '☀ Light' : t === 'dark' ? '🌙 Dark' : '📄 Sepia'}
              </button>
            ))}
          </div>

          {/* Flow mode */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Reading Mode</p>
          <div className="mb-5 flex gap-2">
            {(['paginated', 'scrolled'] as Flow[]).map((f) => (
              <button
                key={f}
                onClick={() => setFlow(f)}
                className={`flex-1 rounded-xl border py-2 text-xs font-medium capitalize transition-all ${
                  flow === f ? 'border-landing-accent bg-landing-accent text-white' : 'border-landing-border text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-text'
                }`}
              >
                {f === 'paginated' ? 'Pages' : 'Scroll'}
              </button>
            ))}
          </div>

          {/* Layout: single vs two-page (only relevant in paginated mode) */}
          {flow === 'paginated' && (
            <>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Layout</p>
              <div className="mb-5 flex gap-2">
                <button
                  onClick={() => setTwoPage(false)}
                  className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-all ${!twoPage ? 'border-landing-accent bg-landing-accent text-white' : 'border-landing-border text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-text'}`}
                >
                  Single
                </button>
                <button
                  onClick={() => setTwoPage(true)}
                  className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-all ${twoPage ? 'border-landing-accent bg-landing-accent text-white' : 'border-landing-border text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-text'}`}
                >
                  Two Pages
                </button>
              </div>
            </>
          )}

          {/* Font family */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Font</p>
          <div className="mb-5 flex gap-2">
            {FONT_FAMILIES.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => changeFontFamily(value)}
                className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-all ${
                  fontFamily === value ? 'border-landing-accent bg-landing-accent text-white' : 'border-landing-border text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Font size */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Font Size</p>
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-landing-border bg-landing-surface-muted px-4 py-2">
            <button onClick={() => changeFontSize(-10)} className="text-base font-semibold text-landing-text-muted transition hover:text-landing-text" aria-label="Decrease font size">A-</button>
            <span className="flex-1 text-center text-sm font-medium text-landing-text">{fontSize}%</span>
            <button onClick={() => changeFontSize(10)} className="text-base font-semibold text-landing-text-muted transition hover:text-landing-text" aria-label="Increase font size">A+</button>
          </div>

          {/* Line spacing */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Line Spacing</p>
          <div className="mb-5 flex gap-2">
            {LINE_SPACINGS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => changeLineSpacing(value)}
                className={`flex-1 rounded-xl border py-2 text-xs font-medium transition-all ${
                  lineSpacing === value ? 'border-landing-accent bg-landing-accent text-white' : 'border-landing-border text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          <button
            onClick={() => { setShowMenu(false); setTourStep(0); setShowTour(true); }}
            className="text-xs text-landing-text-muted underline-offset-2 transition hover:text-landing-accent hover:underline"
          >
            Replay reader tour
          </button>
        </div>
      </div>

      {/* ── Left side panel (TOC / Highlights / Bookmarks) ────────────── */}
      {sidePanel && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setSidePanel(null)}
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
            {(['toc', 'highlights', 'bookmarks'] as SidePanel[]).map((panel) => (
              <button
                key={panel!}
                onClick={() => setSidePanel(panel)}
                className={`flex-1 rounded-t-lg py-2.5 text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
                  sidePanel === panel
                    ? 'border-b-2 border-landing-accent text-landing-accent'
                    : 'text-landing-text-muted hover:text-landing-text'
                }`}
              >
                {panel === 'toc' ? 'Contents' : panel === 'highlights' ? 'Highlights' : 'Bookmarks'}
              </button>
            ))}
            <button
              onClick={() => setSidePanel(null)}
              className="ml-2 rounded-full p-2 text-landing-text-muted transition hover:bg-landing-surface-muted hover:text-landing-text focus-visible:ring-2 focus-visible:ring-landing-accent"
              aria-label="Close panel"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* TOC */}
          {sidePanel === 'toc' && (
            <div className="flex-1 space-y-0.5 overflow-y-auto p-3">
              {bookRef.current?.navigation?.toc?.map((item: any, index: number) => (
                <button
                  key={index}
                  onClick={() => { renditionRef.current?.display(item.href); setSidePanel(null); }}
                  className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-landing-text-muted transition-colors hover:bg-landing-accent/10 hover:text-landing-accent"
                >
                  {item.label}
                </button>
              ))}
              {(!bookRef.current?.navigation?.toc || bookRef.current.navigation.toc.length === 0) && (
                <p className="px-3 py-8 text-center text-sm text-landing-text-muted">No table of contents available.</p>
              )}
            </div>
          )}

          {/* Highlights */}
          {sidePanel === 'highlights' && (
            <div className="flex-1 overflow-y-auto p-3">
              {highlights.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-landing-text-muted">No highlights yet. Select text to highlight it.</p>
              ) : (
                <div className="space-y-2">
                  {highlights.map((h) => (
                    <div
                      key={h.id}
                      className="rounded-xl border border-landing-border p-3"
                      style={{ borderLeftWidth: 4, borderLeftColor: h.color === 'yellow' ? '#f8e16f' : h.color === 'green' ? '#99d98c' : '#90caf9' }}
                    >
                      <p className="mb-1 text-sm text-landing-text line-clamp-3">"{h.text}"</p>
                      {h.note && <p className="mb-2 text-xs text-landing-text-muted italic">{h.note}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={() => { renditionRef.current?.display(h.cfi); setSidePanel(null); }}
                          className="text-xs text-landing-accent hover:underline"
                        >
                          Jump to
                        </button>
                        <button
                          onClick={() => { setEditingHighlight(h); setEditNote(h.note || ''); }}
                          className="text-xs text-landing-text-muted hover:text-landing-text"
                        >
                          Edit note
                        </button>
                        <button
                          onClick={() => deleteHighlight(h.id, h.cfi)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Bookmarks */}
          {sidePanel === 'bookmarks' && (
            <div className="flex-1 overflow-y-auto p-3">
              {bookmarks.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-landing-text-muted">No bookmarks yet. Use the bookmark icon to save your place.</p>
              ) : (
                <div className="space-y-1">
                  {bookmarks.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => { renditionRef.current?.display(b.cfi); setSidePanel(null); }}
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

      {/* ── In-book search overlay ─────────────────────────────────────── */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setShowSearch(false); }}>
          <div className="mx-auto mt-16 w-full max-w-lg rounded-2xl border border-landing-border bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 border-b border-landing-border px-4 py-3">
              <svg className="h-5 w-5 shrink-0 text-landing-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runSearch(searchQuery); if (e.key === 'Escape') setShowSearch(false); }}
                placeholder="Search in book…"
                className="flex-1 bg-transparent text-sm text-landing-text outline-none placeholder:text-landing-text-muted"
              />
              <button
                onClick={() => runSearch(searchQuery)}
                className="rounded-lg bg-landing-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-landing-accent-secondary"
              >
                {isSearching ? 'Searching…' : 'Search'}
              </button>
              <button onClick={() => setShowSearch(false)} className="text-landing-text-muted hover:text-landing-text" aria-label="Close search">
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
                  onClick={() => { renditionRef.current?.display(r.cfi); setShowSearch(false); }}
                  className="block w-full border-b border-landing-border px-4 py-3 text-left text-sm text-landing-text-muted transition-colors hover:bg-landing-accent/5 hover:text-landing-text last:border-0"
                >
                  {r.excerpt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Go to location dialog ─────────────────────────────────────── */}
      {showGoTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setShowGoTo(false); }}>
          <div className="w-72 rounded-2xl border border-landing-border bg-white p-6 shadow-2xl">
            <h3 className="mb-1 text-base font-semibold text-landing-text">Go to Location</h3>
            <p className="mb-4 text-xs text-landing-text-muted">Enter a percentage (0–100) to jump to that position in the book.</p>
            <input
              autoFocus
              type="number"
              min={0}
              max={100}
              value={goToInput}
              onChange={(e) => setGoToInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') goToLocation(); if (e.key === 'Escape') setShowGoTo(false); }}
              placeholder="e.g. 50"
              className="mb-4 w-full rounded-xl border border-landing-border bg-landing-surface-muted px-4 py-2.5 text-sm text-landing-text outline-none focus:border-landing-accent focus:ring-1 focus:ring-landing-accent"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowGoTo(false)} className="flex-1 rounded-xl border border-landing-border py-2 text-sm text-landing-text-muted transition hover:border-landing-accent/40">Cancel</button>
              <button onClick={goToLocation} className="flex-1 rounded-xl bg-landing-accent py-2 text-sm font-semibold text-white transition hover:bg-landing-accent-secondary">Go</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Highlight picker ──────────────────────────────────────────── */}
      {selectedText && (
        <div className="fixed left-1/2 top-1/2 z-50 w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-landing-border bg-white p-4 shadow-2xl">
          <p className="mb-1 text-sm font-medium text-landing-text">Highlight selected text</p>
          <p className="mb-3 line-clamp-2 text-xs text-landing-text-muted">"{selectedText.text}"</p>
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
                title={`${color} highlight`}
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

      {/* ── Highlight note editor ─────────────────────────────────────── */}
      {editingHighlight && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-landing-border bg-white p-6 shadow-2xl">
            <h3 className="mb-1 text-base font-semibold text-landing-text">Note</h3>
            <p className="mb-3 line-clamp-2 text-xs text-landing-text-muted">"{editingHighlight.text}"</p>
            <textarea
              autoFocus
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder="Add a note…"
              rows={4}
              className="mb-4 w-full resize-none rounded-xl border border-landing-border bg-landing-surface-muted px-4 py-2.5 text-sm text-landing-text outline-none focus:border-landing-accent focus:ring-1 focus:ring-landing-accent"
            />
            <div className="flex gap-2">
              <button
                onClick={() => deleteHighlight(editingHighlight.id, editingHighlight.cfi)}
                className="rounded-xl border border-red-200 px-3 py-2 text-sm text-red-500 transition hover:bg-red-50"
              >
                Delete
              </button>
              <button onClick={() => setEditingHighlight(null)} className="flex-1 rounded-xl border border-landing-border py-2 text-sm text-landing-text-muted transition hover:border-landing-accent/40">Cancel</button>
              <button onClick={saveHighlightNote} className="flex-1 rounded-xl bg-landing-accent py-2 text-sm font-semibold text-white transition hover:bg-landing-accent-secondary">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── First-time reader tour ────────────────────────────────────── */}
      {showTour && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-3xl border border-landing-border bg-white p-8 shadow-2xl">
            <div className="mb-6 flex justify-center gap-2">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-2 rounded-full transition-all duration-300 ${i === tourStep ? 'w-6 bg-landing-accent' : 'w-2 bg-landing-border'}`}
                />
              ))}
            </div>
            <div className="mb-4">{TOUR_STEPS[tourStep].icon}</div>
            <h3 className="mb-2 text-center text-lg font-semibold text-landing-text">{TOUR_STEPS[tourStep].title}</h3>
            <p className="mb-8 text-center text-sm leading-relaxed text-landing-text-muted">{TOUR_STEPS[tourStep].body}</p>
            <div className="flex items-center gap-3">
              <button
                onClick={dismissTour}
                className="flex-1 rounded-xl border border-landing-border py-2.5 text-sm text-landing-text-muted transition hover:border-landing-accent/40 hover:text-landing-text"
              >
                Skip
              </button>
              <button
                onClick={() => { if (tourStep < TOUR_STEPS.length - 1) setTourStep(tourStep + 1); else dismissTour(); }}
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
