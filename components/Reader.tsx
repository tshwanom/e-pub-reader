'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ePub, { Book, Rendition } from 'epubjs';
import { loadBookBinary } from '@/lib/book-client-cache';
import { applyReaderContentStyles } from '@/lib/reader-content-styles';

// Reader sub-modules
import type {
  Flow,
  FontFamily,
  LineSpacing,
  ReaderProps,
  SidePanel,
  Theme,
} from './reader/types';
import {
  READING_SPEED_WPM,
} from './reader/utils';
import { useReaderAnnotations } from './reader/hooks/useReaderAnnotations';
import { useReaderNarration } from './reader/hooks/useReaderNarration';
import { useReaderSearch } from './reader/hooks/useReaderSearch';

import ReaderTopBar from './reader/toolbars/ReaderTopBar';
import ReaderOptionsDrawer from './reader/drawers/ReaderOptionsDrawer';
import ReaderSidePanel from './reader/sidepanels/ReaderSidePanel';
import ReaderNarrationPlayerBar from './reader/narration/ReaderNarrationPlayerBar';

import ReaderShareModal from './reader/modals/ReaderShareModal';
import ReaderLockBarrier from './reader/modals/ReaderLockBarrier';
import ReaderDonationPrompt from './reader/modals/ReaderDonationPrompt';
import ReaderHighlightModal from './reader/modals/ReaderHighlightModal';
import ReaderSearchModal from './reader/modals/ReaderSearchModal';
import ReaderGoToModal from './reader/modals/ReaderGoToModal';
import ReaderQuickNoteModal from './reader/modals/ReaderQuickNoteModal';
import ReaderNarrationModal from './reader/modals/ReaderNarrationModal';
import ReaderTourModal from './reader/modals/ReaderTourModal';

export default function Reader({
  url,
  initialLocation,
  bookId,
  bookSlug,
  title,
  author,
  canonicalBookPath,
  progressSaveEndpoint,
  initialNarrationPlayerExpanded,
  narrationPlayerPreferenceEndpoint,
  narrationAccess,
  previewConfig,
  translations = [],
}: ReaderProps) {
  // Reading state
  const [theme, setTheme] = useState<Theme>('light');
  const [fontSize, setFontSize] = useState<number>(100);
  const [fontFamily, setFontFamily] = useState<FontFamily>('Crimson Pro');
  const [lineSpacing, setLineSpacing] = useState<LineSpacing>(1.6);
  const [flow, setFlow] = useState<Flow>('paginated');
  const [twoPage, setTwoPage] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [readerLoadError, setReaderLoadError] = useState<string | null>(null);
  const [isFading, setIsFading] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [showMobileToolbar, setShowMobileToolbar] = useState(false);
  const [currentHref, setCurrentHref] = useState<string | null>(null);

  // Preview & Sharing states
  const isPreviewMode = Boolean(previewConfig?.isPreviewMode);
  const previewLimitType = previewConfig?.limitType || 'CHAPTERS';
  const previewLimitValue = previewConfig?.limitValue ?? 2;
  const [isPreviewLocked, setIsPreviewLocked] = useState(false);
  const [showDonationPrompt, setShowDonationPrompt] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareQuoteText, setShareQuoteText] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  // Tour state
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  // Refs
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const currentCfiRef = useRef<string | null>(null);
  const currentHrefRef = useRef<string | null>(null);
  const currentChapterIndexRef = useRef<number>(0);
  const pagesReadSessionRef = useRef<number>(0);
  const locationTimeout = useRef<NodeJS.Timeout | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const dragWrapperRef = useRef<HTMLDivElement>(null);
  const swipeCommittedRef = useRef(false);
  const isFirstRelocate = useRef(true);
  const toolbarHideTimer = useRef<NodeJS.Timeout | null>(null);
  const themeRef = useRef(theme);
  const fontSizeRef = useRef(fontSize);
  const fontFamilyRef = useRef(fontFamily);
  const lineSpacingRef = useRef(lineSpacing);

  useEffect(() => { themeRef.current = theme; }, [theme]);
  useEffect(() => { fontSizeRef.current = fontSize; }, [fontSize]);
  useEffect(() => { fontFamilyRef.current = fontFamily; }, [fontFamily]);
  useEffect(() => { lineSpacingRef.current = lineSpacing; }, [lineSpacing]);

  // First-time tour
  useEffect(() => {
    const seen = localStorage.getItem('reader-tour-seen');
    if (!seen) setShowTour(true);
  }, []);

  const dismissTour = () => {
    localStorage.setItem('reader-tour-seen', '1');
    setShowTour(false);
    setTourStep(0);
  };

  const revealToolbar = useCallback(() => {
    setShowMobileToolbar(true);
    if (toolbarHideTimer.current) clearTimeout(toolbarHideTimer.current);
    toolbarHideTimer.current = setTimeout(() => setShowMobileToolbar(false), 3000);
  }, []);

  // Canonical Book URL for Sharing
  const bookUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://1manrevolution.com';
    if (canonicalBookPath) {
      return `${origin}${canonicalBookPath}`;
    }
    return `${origin}/books/${bookSlug || bookId}`;
  }, [canonicalBookPath, bookSlug, bookId]);

  const handleShare = useCallback(
    (platform: 'twitter' | 'facebook' | 'whatsapp' | 'linkedin' | 'copy', quote?: string | null) => {
      const textToShare = quote
        ? `“${quote}” — ${title || 'Book'}${author ? ` by ${author}` : ''}`
        : `Read “${title || 'Book'}”${author ? ` by ${author}` : ''} on One Man Revolution`;

      if (platform === 'copy') {
        const fullText = quote ? `${textToShare}\n\n${bookUrl}` : bookUrl;
        navigator.clipboard?.writeText(fullText);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2500);
        return;
      }

      let shareUrl = '';
      if (platform === 'twitter') {
        shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(textToShare)}&url=${encodeURIComponent(bookUrl)}`;
      } else if (platform === 'facebook') {
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(bookUrl)}&quote=${encodeURIComponent(textToShare)}`;
      } else if (platform === 'whatsapp') {
        shareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(`${textToShare}\n\n${bookUrl}`)}`;
      } else if (platform === 'linkedin') {
        shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(bookUrl)}`;
      }

      if (shareUrl) {
        window.open(shareUrl, '_blank', 'noopener,noreferrer,width=600,height=500');
      }
    },
    [title, author, bookUrl]
  );

  // Navigation handlers with Preview Boundary checking
  const handleNextPage = useCallback(() => {
    if (isPreviewLocked) return;
    if (isPreviewMode) {
      if (previewLimitType === 'CHAPTERS' && currentChapterIndexRef.current >= previewLimitValue - 1) {
        const loc = (renditionRef.current as any)?.location;
        if (loc && loc.atEnd) {
          setIsPreviewLocked(true);
          return;
        }
      } else if (previewLimitType === 'PERCENTAGE' && progressPct >= previewLimitValue) {
        setIsPreviewLocked(true);
        return;
      }
    }
    renditionRef.current?.next();
  }, [isPreviewLocked, isPreviewMode, previewLimitType, previewLimitValue, progressPct]);

  const handlePrevPage = useCallback(() => {
    if (isPreviewLocked) {
      setIsPreviewLocked(false);
    }
    renditionRef.current?.prev();
  }, [isPreviewLocked]);

  const handleDisplayLocation = useCallback(
    (target: string, chapterIndex?: number) => {
      if (
        isPreviewMode &&
        previewLimitType === 'CHAPTERS' &&
        typeof chapterIndex === 'number' &&
        chapterIndex >= previewLimitValue
      ) {
        setIsPreviewLocked(true);
        return;
      }
      setIsPreviewLocked(false);
      renditionRef.current?.display(target);
    },
    [isPreviewMode, previewLimitType, previewLimitValue]
  );

  // Progress Save
  const saveProgress = useCallback(
    async (cfi: string, percentage: number) => {
      if (!progressSaveEndpoint || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
        return;
      }
      try {
        await fetch(progressSaveEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookId, cfi, progress: percentage * 100 }),
        });
      } catch (error) {
        console.error('Failed to save progress', error);
      }
    },
    [bookId, progressSaveEndpoint]
  );

  useEffect(() => {
    const handleOnline = () => {
      const currentCfi = currentCfiRef.current;
      if (currentCfi) void saveProgress(currentCfi, progressPct / 100);
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [progressPct, saveProgress]);

  // Touch handlers for swipe navigation
  const onIframeTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    if (dragWrapperRef.current) dragWrapperRef.current.style.transition = 'none';
  };

  const onIframeTouchMove = (e: TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && dragWrapperRef.current) {
      const damped = dx * 0.6;
      dragWrapperRef.current.style.transform = `translateX(${damped}px)`;
    }
  };

  const onIframeTouchEnd = (e: TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const isHorizontal = Math.abs(dx) > Math.abs(dy);
    const committed = isHorizontal && Math.abs(dx) > 44;

    if (committed && dragWrapperRef.current) {
      swipeCommittedRef.current = true;
      const snapX = dx < 0 ? -window.innerWidth : window.innerWidth;
      dragWrapperRef.current.style.transition = 'transform 0.22s ease-in';
      dragWrapperRef.current.style.transform = `translateX(${snapX}px)`;
      setTimeout(() => {
        if (dragWrapperRef.current) {
          dragWrapperRef.current.style.transition = 'none';
          dragWrapperRef.current.style.transform = 'translateX(0)';
        }
        if (dx < 0) handleNextPage();
        else handlePrevPage();
      }, 220);
    } else if (!committed && dragWrapperRef.current) {
      dragWrapperRef.current.style.transition = 'transform 0.25s ease-out';
      dragWrapperRef.current.style.transform = 'translateX(0)';
    }

    if (!committed && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      revealToolbar();
    }

    touchStartX.current = null;
    touchStartY.current = null;
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        handleNextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        handlePrevPage();
      } else if (e.key === 'Escape') {
        setShowMenu(false);
        setSidePanel(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNextPage, handlePrevPage]);

  // Hook 1: Annotations
  const annotations = useReaderAnnotations(
    bookId,
    renditionRef as any,
    bookRef,
    currentCfiRef,
    currentPage
  );

  // Hook 2: Narration
  const narration = useReaderNarration({
    bookId,
    narrationAccess,
    initialNarrationPlayerExpanded,
    narrationPlayerPreferenceEndpoint,
    renditionRef: renditionRef as any,
    currentHref,
    currentCfiRef,
    currentHrefRef,
  });

  // Hook 3: In-book search & goto
  const search = useReaderSearch(bookRef, renditionRef as any);

  // Embedded stylesheet injection helper
  const ensureReaderEmbeddedContentStyles = useCallback(() => {
    const contents = (renditionRef.current as any)?.getContents?.() ?? [];
    contents.forEach((content: any) => {
      applyReaderContentStyles(content?.document as Document | undefined);
    });
  }, []);

  // Theme & font modifiers
  const changeTheme = useCallback((newTheme: Theme) => {
    setTheme(newTheme);
    renditionRef.current?.themes.select(newTheme);
  }, []);

  const changeFontSize = useCallback((delta: number) => {
    const newSize = Math.max(80, Math.min(150, fontSize + delta));
    setFontSize(newSize);
    renditionRef.current?.themes.fontSize(`${newSize}%`);
  }, [fontSize]);

  const changeFontFamily = useCallback((family: FontFamily) => {
    setFontFamily(family);
    renditionRef.current?.themes.font(family);
  }, []);

  const changeLineSpacing = useCallback((spacing: LineSpacing) => {
    setLineSpacing(spacing);
    renditionRef.current?.themes.override('line-height', String(spacing));
  }, []);

  // Initialize EPUB rendition
  useEffect(() => {
    if (!viewerRef.current) return;

    let destroyed = false;
    let renditionInstance: Rendition | null = null;

    setIsReady(false);
    setReaderLoadError(null);

    const resetRenderedBook = () => {
      renditionInstance?.destroy();
      renditionInstance = null;
      renditionRef.current = null;
      bookRef.current = null;
    };

    const initializeBookFromBinary = async (bookSource: ArrayBuffer) => {
      const book = ePub(bookSource, { openAs: 'binary' }) as unknown as Book;
      bookRef.current = book;

      const container = viewerRef.current!;
      const rendition = book.renderTo(container, {
        width: container.clientWidth || window.innerWidth,
        height: container.clientHeight || window.innerHeight,
        flow: flow === 'scrolled' ? 'scrolled' : 'paginated',
        spread: twoPage ? 'auto' : 'none',
      }) as Rendition;

      renditionInstance = rendition;
      renditionRef.current = rendition;

      rendition.themes.default?.({
        body: {
          'box-shadow': 'none !important',
          border: 'none !important',
          'border-radius': '0 !important',
          margin: '0 !important',
          'max-width': 'none !important',
        },
      });

      rendition.themes.register('light', {
        body: { background: '#ffffff', color: '#000000' },
      });
      rendition.themes.register('dark', {
        body: { background: '#1a1a1a', color: '#e0e0e0' },
      });
      rendition.themes.register('sepia', {
        body: { background: '#f4ecd8', color: '#5c4a3a' },
      });

      rendition.themes.select(themeRef.current);
      rendition.themes.fontSize(`${fontSizeRef.current}%`);
      rendition.themes.font(fontFamilyRef.current);
      rendition.themes.override('line-height', String(lineSpacingRef.current));

      const localCfi = typeof window !== 'undefined' ? localStorage.getItem(`reader-progress-${bookId}`) : null;
      const resumeAt = currentCfiRef.current ?? localCfi ?? initialLocation;

      try {
        if (resumeAt) {
          await rendition.display(resumeAt);
        } else {
          await rendition.display();
        }
      } catch (error) {
        if (!resumeAt) throw error;
        console.error('Failed to resume saved location, falling back to start', error);
        await rendition.display();
      }

      ensureReaderEmbeddedContentStyles();

      if (!destroyed) {
        setReaderLoadError(null);
        setIsReady(true);
        isFirstRelocate.current = true;
      }

      // Calculate word count in idle time
      const scheduleWordCount = (cb: () => void) => {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(cb, { timeout: 5000 });
        } else {
          setTimeout(cb, 500);
        }
      };

      scheduleWordCount(async () => {
        if (destroyed) return;
        try {
          const spineItems = (book as any).spine?.spineItems as any[] | undefined;
          if (!spineItems?.length) return;

          let total = 0;
          for (const item of spineItems) {
            if (destroyed) return;
            await item.load((book as any).load.bind(book));
            const text: string = item.document?.body?.textContent ?? '';
            total += text.split(/\s+/).filter(Boolean).length;
            item.unload();
          }

          if (!destroyed) setWordCount(total);
        } catch (err) {
          console.warn('Word count calculation failed', err);
        }
      });

      // Swipe navigation listeners
      rendition.on('touchstart', onIframeTouchStart);
      rendition.on('touchmove', onIframeTouchMove);
      rendition.on('touchend', onIframeTouchEnd);
      rendition.on('rendered', () => {
        ensureReaderEmbeddedContentStyles();
        narration.ensureNarrationCueStyles();
        annotations.applyHighlightsToRendition();
      });

      // Text selection
      rendition.on('selected', (cfiRange: string) => {
        const iframe = viewerRef.current?.querySelector('iframe');
        const text = iframe?.contentWindow?.getSelection()?.toString() || '';
        if (text) {
          annotations.setSelectedText({ cfi: cfiRange, text });
        }
      });

      // Relocated handler
      rendition.on('relocated', (location: any) => {
        if (locationTimeout.current) clearTimeout(locationTimeout.current);
        currentCfiRef.current = location.start.cfi;
        const nextHref = location?.start?.href ? location.start.href.split('#')[0] : null;
        currentHrefRef.current = nextHref;
        setCurrentHref(nextHref);

        try {
          localStorage.setItem(`reader-progress-${bookId}`, location.start.cfi);
        } catch (_) {}

        const currentLocation = location.start.index || 0;
        currentChapterIndexRef.current = currentLocation;
        setCurrentPage(currentLocation + 1);

        if (location.end && location.end.index) {
          setTotalPages(location.end.index + 1);
        }

        const pct = location.start.percentage || 0;
        const pct100 = pct * 100;
        setProgressPct(pct100);

        if (isPreviewMode) {
          const isLocked =
            previewLimitType === 'PERCENTAGE'
              ? pct100 > previewLimitValue
              : currentLocation >= previewLimitValue;
          setIsPreviewLocked(isLocked);
        }

        // Reading session milestone prompt trigger
        if (!isFirstRelocate.current) {
          pagesReadSessionRef.current += 1;
          if (
            !previewConfig?.isDonor &&
            (pagesReadSessionRef.current === 12 || pagesReadSessionRef.current === 35)
          ) {
            try {
              const dismissed = sessionStorage.getItem(`omr-donation-prompt-${bookId}`);
              if (!dismissed) setShowDonationPrompt(true);
            } catch (_) {}
          }
        }

        annotations.setCurrentBookmark(null);

        if (!isFirstRelocate.current && !swipeCommittedRef.current) {
          setIsFading(true);
          setTimeout(() => setIsFading(false), 120);
        }
        swipeCommittedRef.current = false;
        isFirstRelocate.current = false;

        if (!isPreviewLocked) {
          locationTimeout.current = setTimeout(() => {
            saveProgress(location.start.cfi, pct);
          }, 1000);
        }
      });
    };

    const initBook = async () => {
      if (destroyed || !viewerRef.current) return;

      let loadedBookSource: 'cache' | 'network' | null = null;

      const loadAndInitializeBook = async (options?: { forceNetwork?: boolean }) => {
        let loadedBook;

        try {
          loadedBook = await loadBookBinary(url, options);
        } catch (error) {
          console.error('Failed to load the EPUB file for the reader', error);
          throw error;
        }

        loadedBookSource = loadedBook.source;

        try {
          await initializeBookFromBinary(loadedBook.buffer);
        } catch (error) {
          if (loadedBookSource === 'cache') {
            console.warn(
              'Cached EPUB failed to initialize. Clearing the saved copy and retrying from the network.',
              error
            );
            await loadAndInitializeBook({ forceNetwork: true });
            return;
          }

          throw error;
        }
      };

      try {
        await loadAndInitializeBook();
      } catch (err: any) {
        if (!destroyed) {
          console.error('Failed to load EPUB file', err);
          setReaderLoadError(err?.message || 'Unable to open this book right now.');
        }
      }
    };

    void initBook();

    return () => {
      destroyed = true;
      resetRenderedBook();
    };
  }, [bookId, flow, twoPage, url]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resize listener
  useEffect(() => {
    if (!viewerRef.current || !isReady) return;
    const ro = new ResizeObserver(() => {
      const container = viewerRef.current;
      if (container && renditionRef.current) {
        renditionRef.current.resize(
          container.clientWidth || window.innerWidth,
          container.clientHeight || window.innerHeight
        );
      }
    });
    ro.observe(viewerRef.current);
    return () => ro.disconnect();
  }, [isReady]);

  // Estimates
  const wordsRemaining = wordCount > 0 ? wordCount * (1 - progressPct / 100) : 0;
  const minutesRemaining = wordsRemaining > 0 ? Math.ceil(wordsRemaining / READING_SPEED_WPM) : 0;
  const isToolbarVisible =
    showMobileToolbar ||
    Boolean(sidePanel) ||
    showMenu ||
    search.showSearch ||
    search.showGoTo ||
    narration.showNarrationModal;

  return (
    <div className="reader-shell relative h-screen w-full overflow-hidden">
      {/* ── Reading area ──────────────────────────────────────────────── */}
      <div className={`absolute inset-0 flex items-stretch bg-landing-bg ${narration.readerViewportInsetClass}`}>
        <div className="flex flex-1 min-h-0 items-stretch justify-center overflow-hidden md:p-5 md:items-stretch">
          <div
            ref={dragWrapperRef}
            className="flex w-full h-full min-h-0 items-stretch justify-center md:items-stretch"
            style={{ willChange: 'transform' }}
          >
            <div
              className={`reader-viewport overflow-hidden flex flex-col w-full h-full bg-white transition-opacity duration-150 ${
                isFading ? 'opacity-0' : 'opacity-100'
              }`}
              style={
                flow === 'scrolled'
                  ? { maxWidth: '680px' }
                  : { maxWidth: twoPage ? '1100px' : '560px', height: '100%' }
              }
            >
              <div ref={viewerRef} className="h-full w-full" />

              {(!isReady || readerLoadError) && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/88 px-6 text-center backdrop-blur-[1px]">
                  <div className="surface-card max-w-sm px-6 py-5 sm:px-7">
                    {readerLoadError ? (
                      <>
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-500">
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 9v4m0 4h.01M5.93 19h12.14c1.54 0 2.5-1.67 1.73-3L13.73 5c-.77-1.33-2.69-1.33-3.46 0L4.2 16c-.77 1.33.19 3 1.73 3z"
                            />
                          </svg>
                        </div>
                        <h2 className="mt-4 text-base font-semibold text-landing-text">The page needs another try</h2>
                        <p className="mt-2 text-sm leading-relaxed text-landing-text-muted">{readerLoadError}</p>
                      </>
                    ) : (
                      <>
                        <div className="mx-auto h-11 w-11 animate-spin rounded-full border-2 border-landing-border border-t-landing-accent motion-reduce:animate-none" />
                        <h2 className="mt-4 text-base font-semibold text-landing-text">Loading your book</h2>
                        <p className="mt-2 text-sm leading-relaxed text-landing-text-muted">
                          We&apos;re opening {title ?? 'your book'} and restoring your place. Once it&apos;s open, it stays
                          ready on this device for faster offline reading next time.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Desktop pagination arrows ─────────────────────────────────── */}
      {flow === 'paginated' && (
        <>
          <button
            onClick={handlePrevPage}
            disabled={!isReady}
            aria-label="Previous page"
            className="absolute left-4 top-1/2 z-20 hidden -translate-y-1/2 md:flex h-14 w-14 items-center justify-center rounded-full border border-landing-border bg-white/90 text-landing-accent shadow-lg backdrop-blur-sm transition-all hover:bg-landing-accent hover:text-white hover:border-landing-accent disabled:pointer-events-none disabled:opacity-30"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={handleNextPage}
            disabled={!isReady || isPreviewLocked}
            aria-label="Next page"
            className="absolute right-4 top-1/2 z-20 hidden -translate-y-1/2 md:flex h-14 w-14 items-center justify-center rounded-full border border-landing-border bg-white/90 text-landing-accent shadow-lg backdrop-blur-sm transition-all hover:bg-landing-accent hover:text-white hover:border-landing-accent disabled:pointer-events-none disabled:opacity-30"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* ── Top Toolbar ───────────────────────────────────────────────── */}
      <ReaderTopBar
        isToolbarVisible={isToolbarVisible}
        currentPage={currentPage}
        totalPages={totalPages}
        minutesRemaining={minutesRemaining}
        isPreviewMode={isPreviewMode}
        previewLimitType={previewLimitType}
        previewLimitValue={previewLimitValue}
        sidePanel={sidePanel}
        narrationFeatureEnabled={narration.narrationFeatureEnabled}
        narrationHasReadyPlayer={narration.narrationHasReadyPlayer}
        narrationAccess={narrationAccess}
        isNarrationPlaying={narration.isNarrationPlaying}
        onOpenSearch={() => search.setShowSearch(true)}
        onOpenGoTo={() => search.setShowGoTo(true)}
        onOpenShare={() => {
          setShareQuoteText(null);
          setShowShareModal(true);
        }}
        onToggleToc={() => setSidePanel(sidePanel === 'toc' ? null : 'toc')}
        onToggleNarrationPlayback={() => void narration.toggleNarrationPlayback()}
        onOpenNarrationModal={narration.openNarrationModal}
        onOpenMenu={() => setShowMenu(true)}
      />

      {/* ── Hidden HTML5 Audio Element ───────────────────────────────── */}
      {narration.narrationFeatureEnabled && (
        <audio
          ref={narration.audioRef}
          preload="metadata"
          data-testid="narration-audio"
          className="hidden"
          controlsList="nodownload"
          onContextMenu={(e) => e.preventDefault()}
        />
      )}

      {/* ── Floating Narration Player Bar ────────────────────────────── */}
      {narration.narrationHasReadyPlayer && narration.activeNarrationChapter && (
        <ReaderNarrationPlayerBar
          isNarrationPlayerExpanded={narration.isNarrationPlayerExpanded}
          isNarrationPlaying={narration.isNarrationPlaying}
          activeNarrationChapter={narration.activeNarrationChapter}
          narrationChapterIndex={narration.narrationChapterIndex}
          narrationChapters={narration.narrationChapters}
          activeNarrationVoiceName={narration.activeNarrationVoiceName}
          followNarrationText={narration.followNarrationText}
          narrationPlayerTitle={narration.narrationPlayerTitle}
          narrationPlayerMessage={narration.narrationPlayerMessage}
          narrationCurrentTime={narration.narrationCurrentTime}
          narrationPlaybackMax={narration.narrationPlaybackMax}
          narrationPlaybackProgressPct={narration.narrationPlaybackProgressPct}
          activeNarrationCue={narration.activeNarrationCue}
          narrationPlaybackRate={narration.narrationPlaybackRate}
          narrationVoiceOptions={narration.narrationVoiceOptions}
          activeNarrationVoiceOption={narration.activeNarrationVoiceOption}
          onTogglePlayback={() => void narration.toggleNarrationPlayback()}
          onSkipChapter={narration.skipNarrationChapter}
          onExpandPlayer={() => narration.expandNarrationPlayer()}
          onCollapsePlayer={() => narration.collapseNarrationPlayer()}
          onToggleFollowText={() => narration.setFollowNarrationText((val) => !val)}
          onOpenNarrationModal={narration.openNarrationModal}
          onSeek={narration.handleNarrationSeek}
          onSetPlaybackRate={narration.setNarrationPlaybackRate}
          onVoiceChange={narration.handleNarrationVoiceChange}
        />
      )}

      {/* ── Progress strip (bottom edge) ──────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-30 h-1 bg-black/10">
        <div
          className="h-full bg-landing-accent transition-[width] duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* ── Reader Options Menu (Drawer) ─────────────────────────────── */}
      <ReaderOptionsDrawer
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        bookId={bookId}
        translations={translations}
        theme={theme}
        onChangeTheme={changeTheme}
        flow={flow}
        onSetFlow={setFlow}
        twoPage={twoPage}
        onSetTwoPage={setTwoPage}
        fontFamily={fontFamily}
        onChangeFontFamily={changeFontFamily}
        fontSize={fontSize}
        onChangeFontSize={changeFontSize}
        lineSpacing={lineSpacing}
        onChangeLineSpacing={changeLineSpacing}
        onOpenShare={() => {
          setShareQuoteText(null);
          setShowShareModal(true);
        }}
        onOpenSidePanel={(panel) => setSidePanel(panel)}
        onReplayTour={() => {
          setTourStep(0);
          setShowTour(true);
        }}
        narrationFeatureEnabled={narration.narrationFeatureEnabled}
        narrationHasReadyPlayer={narration.narrationHasReadyPlayer}
        narrationAccess={narrationAccess}
        narrationVoiceOptions={narration.narrationVoiceOptions}
        activeNarrationVoiceOption={narration.activeNarrationVoiceOption}
        isNarrationPlaying={narration.isNarrationPlaying}
        onVoiceChange={narration.handleNarrationVoiceChange}
        onToggleNarrationPlayback={() => void narration.toggleNarrationPlayback()}
        onOpenNarrationModal={narration.openNarrationModal}
      />

      {/* ── Left Side Panel (TOC / Highlights / Notes / Bookmarks) ────── */}
      <ReaderSidePanel
        sidePanel={sidePanel}
        onSetSidePanel={setSidePanel}
        toc={(bookRef.current as any)?.navigation?.toc || []}
        isPreviewMode={isPreviewMode}
        previewLimitType={previewLimitType}
        previewLimitValue={previewLimitValue}
        onDisplayTocItem={handleDisplayLocation}
        highlights={annotations.highlights}
        inlinePanelEditId={annotations.inlinePanelEditId}
        inlinePanelNote={annotations.inlinePanelNote}
        onSetInlinePanelEditId={annotations.setInlinePanelEditId}
        onSetInlinePanelNote={annotations.setInlinePanelNote}
        onSaveHighlightNote={annotations.saveHighlightNoteFromPanel}
        onDeleteHighlight={annotations.deleteHighlight}
        onDisplayCfi={(cfi) => {
          renditionRef.current?.display(cfi);
        }}
        standaloneNotes={annotations.standaloneNotes}
        editingNoteId={annotations.editingNoteId}
        editingNoteText={annotations.editingNoteText}
        onSetEditingNoteId={annotations.setEditingNoteId}
        onSetEditingNoteText={annotations.setEditingNoteText}
        onOpenQuickNote={() => {
          annotations.setShowQuickNote(true);
          annotations.setQuickNoteText('');
        }}
        onUpdateStandaloneNote={annotations.updateStandaloneNote}
        onDeleteStandaloneNote={annotations.deleteStandaloneNote}
        bookmarks={annotations.bookmarks}
      />

      {/* ── In-Book Search Overlay ────────────────────────────────────── */}
      <ReaderSearchModal
        isOpen={search.showSearch}
        onClose={() => search.setShowSearch(false)}
        searchQuery={search.searchQuery}
        onSearchQueryChange={search.setSearchQuery}
        onRunSearch={search.runSearch}
        isSearching={search.isSearching}
        searchResults={search.searchResults}
        onSelectResult={search.selectSearchResult}
      />

      {/* ── Go To Location Modal ──────────────────────────────────────── */}
      <ReaderGoToModal
        isOpen={search.showGoTo}
        onClose={() => search.setShowGoTo(false)}
        goToInput={search.goToInput}
        onGoToInputChange={search.setGoToInput}
        onGoToLocation={search.goToLocation}
      />

      {/* ── Quick Note Modal ─────────────────────────────────────────── */}
      <ReaderQuickNoteModal
        isOpen={annotations.showQuickNote}
        onClose={() => {
          annotations.setShowQuickNote(false);
          annotations.setQuickNoteText('');
        }}
        quickNoteText={annotations.quickNoteText}
        onQuickNoteTextChange={annotations.setQuickNoteText}
        onSaveQuickNote={annotations.saveQuickNote}
      />

      {/* ── Narration Access & Voice Modal ───────────────────────────── */}
      <ReaderNarrationModal
        isOpen={narration.showNarrationModal}
        onClose={() => narration.setShowNarrationModal(false)}
        narrationAccess={narrationAccess}
        narrationStatus={narration.narrationStatus}
        narrationError={narration.narrationError}
        isCheckingNarration={narration.isCheckingNarration}
        narrationHasReadyPlayer={narration.narrationHasReadyPlayer}
        isNarrationPlaying={narration.isNarrationPlaying}
        activeNarrationVoiceName={narration.activeNarrationVoiceName}
        narrationManifest={narration.narrationManifest}
        narrationVoiceOptions={narration.narrationVoiceOptions}
        activeNarrationVoiceOption={narration.activeNarrationVoiceOption}
        onVoiceChange={narration.handleNarrationVoiceChange}
        onTogglePlayback={() => void narration.toggleNarrationPlayback()}
        onRefreshStatus={() => void narration.loadNarrationStatus(true)}
      />

      {/* ── Highlight Selection Color Picker & Note Editor ───────────── */}
      <ReaderHighlightModal
        selectedText={annotations.selectedText}
        pendingColor={annotations.pendingColor}
        pendingNote={annotations.pendingNote}
        onSetPendingColor={annotations.setPendingColor}
        onSetPendingNote={annotations.setPendingNote}
        onCancelSelection={() => {
          annotations.setSelectedText(null);
          annotations.setPendingNote('');
          annotations.setPendingColor('yellow');
        }}
        onSaveHighlight={annotations.addHighlight}
        onShareQuote={(text) => {
          annotations.setSelectedText(null);
          setShareQuoteText(text);
          setShowShareModal(true);
        }}
        editingHighlight={annotations.editingHighlight}
        editNote={annotations.editNote}
        onSetEditNote={annotations.setEditNote}
        onCancelEditHighlight={() => annotations.setEditingHighlight(null)}
        onSaveHighlightNote={annotations.saveHighlightNote}
        onDeleteHighlight={annotations.deleteHighlight}
      />

      {/* ── First-Time Reader Tour ────────────────────────────────────── */}
      <ReaderTourModal
        isOpen={showTour}
        tourStep={tourStep}
        onSetTourStep={setTourStep}
        onDismissTour={dismissTour}
      />

      {/* ── Social Share Modal (Book & Quote) ────────────────────────── */}
      <ReaderShareModal
        isOpen={showShareModal}
        onClose={() => {
          setShowShareModal(false);
          setShareQuoteText(null);
        }}
        title={title}
        author={author}
        bookUrl={bookUrl}
        shareQuoteText={shareQuoteText}
        shareCopied={shareCopied}
        onShare={handleShare}
      />

      {/* ── In-Reading Dismissible Donation Prompt ─────────────────────── */}
      <ReaderDonationPrompt
        isVisible={showDonationPrompt && !isPreviewLocked}
        title={title}
        bookId={bookId}
        previewConfig={previewConfig}
        onDismiss={() => {
          setShowDonationPrompt(false);
          try {
            sessionStorage.setItem(`omr-donation-prompt-${bookId}`, 'dismissed');
          } catch (_) {}
        }}
      />

      {/* ── Supporter Lock Barrier Overlay ───────────────────────────── */}
      <ReaderLockBarrier
        isLocked={isPreviewLocked}
        title={title}
        previewConfig={previewConfig}
        onReturnToSample={handlePrevPage}
      />
    </div>
  );
}
