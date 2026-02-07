'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import ePub from 'epubjs';
import type { Book, Rendition, Contents } from 'epubjs';

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
  const [currentCfi, setCurrentCfi] = useState<string | null>(null);
  
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
      setCurrentCfi(location.start.cfi);
      
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

  // Navigation
  const prevPage = () => renditionRef.current?.prev();
  const nextPage = () => renditionRef.current?.next();

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
    <div className="relative w-full h-screen bg-gray-100">
      {/* Table of Contents Sidebar */}
      <div
        className={`fixed top-0 left-0 h-full w-80 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          showToc ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col">
          {/* TOC Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-lg font-semibold">Table of Contents</h2>
            <button
              onClick={() => setShowToc(false)}
              className="p-2 hover:bg-gray-100 rounded-full transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* TOC Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {bookRef.current?.navigation?.toc?.map((item: any, index: number) => (
              <button
                key={index}
                onClick={() => {
                  renditionRef.current?.display(item.href);
                  setShowToc(false);
                }}
                className="block w-full text-left px-3 py-2 hover:bg-indigo-50 rounded transition text-sm mb-1"
              >
                <span className="text-indigo-600 font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Overlay */}
      {showToc && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setShowToc(false)}
        />
      )}

      {/* Top Controls */}
      <div className="absolute top-0 left-0 right-0 bg-white shadow-md z-30 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded transition flex items-center gap-2"
            title="Back to book details"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </button>
          
          <button
            onClick={() => setShowToc(!showToc)}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition"
          >
            Contents
          </button>
          
          <div className="flex items-center gap-2 bg-gray-100 rounded px-3 py-2">
            <button
              onClick={() => changeTheme('light')}
              className={`px-3 py-1 rounded transition ${theme === 'light' ? 'bg-white shadow' : 'hover:bg-gray-200'}`}
              title="Light"
            >
              ☀️
            </button>
            <button
              onClick={() => changeTheme('dark')}
              className={`px-3 py-1 rounded transition ${theme === 'dark' ? 'bg-white shadow' : 'hover:bg-gray-200'}`}
              title="Dark"
            >
              🌙
            </button>
            <button
              onClick={() => changeTheme('sepia')}
              className={`px-3 py-1 rounded transition ${theme === 'sepia' ? 'bg-white shadow' : 'hover:bg-gray-200'}`}
              title="Sepia"
            >
              📄
            </button>
          </div>

          <div className="flex items-center gap-2 bg-gray-100 rounded px-3 py-2">
            <button
              onClick={() => changeFontSize(-10)}
              className="px-2 py-1 hover:bg-gray-200 rounded transition font-semibold"
              title="Decrease font size"
            >
              A-
            </button>
            <span className="text-sm text-gray-600">{fontSize}%</span>
            <button
              onClick={() => changeFontSize(10)}
              className="px-2 py-1 hover:bg-gray-200 rounded transition font-semibold"
              title="Increase font size"
            >
              A+
            </button>
          </div>
        </div>

        <div className="text-sm text-gray-600">
          Page {currentPage} of {totalPages}
        </div>
      </div>

      {/* Viewer */}
      <div className="absolute top-16 left-0 right-0 bottom-16 bg-gray-100 flex items-center justify-center">
        <div ref={viewerRef} className="w-full h-full max-w-5xl bg-white shadow-lg" />
      </div>

      {/* Bottom Navigation */}
      <div className="absolute bottom-0 left-0 right-0 bg-white shadow-md z-30 px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => renditionRef.current?.prev()}
          disabled={!isReady}
          className="px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Previous
        </button>

        <div className="flex-1 mx-4">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all"
              style={{ width: `${(currentPage / totalPages) * 100}%` }}
            />
          </div>
        </div>

        <button
          onClick={() => renditionRef.current?.next()}
          disabled={!isReady}
          className="px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next →
        </button>
      </div>

      {/* Highlight Menu */}
      {selectedText && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-2xl p-4 z-50">
          <p className="text-sm text-gray-600 mb-3">Highlight this text:</p>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => addHighlight('yellow')}
              className="w-10 h-10 rounded-full bg-yellow-300 hover:bg-yellow-400 transition"
              title="Yellow"
            />
            <button
              onClick={() => addHighlight('green')}
              className="w-10 h-10 rounded-full bg-green-300 hover:bg-green-400 transition"
              title="Green"
            />
            <button
              onClick={() => addHighlight('blue')}
              className="w-10 h-10 rounded-full bg-blue-300 hover:bg-blue-400 transition"
              title="Blue"
            />
          </div>
          <button
            onClick={() => setSelectedText(null)}
            className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded transition text-sm"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
