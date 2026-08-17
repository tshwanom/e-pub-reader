'use client';

import { useCallback, useState } from 'react';
import type { SearchResult } from '../types';

export function useReaderSearch(
  bookRef: React.MutableRefObject<any>,
  renditionRef: React.MutableRefObject<any>,
) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [showGoTo, setShowGoTo] = useState(false);
  const [goToInput, setGoToInput] = useState('');

  const runSearch = useCallback(async (query: string) => {
    if (!query.trim() || !bookRef.current) return;
    setIsSearching(true);
    setSearchResults([]);
    try {
      const results: SearchResult[] = [];
      const book = bookRef.current as any;
      await Promise.all(
        (book.spine.spineItems as any[]).map(async (item: any) => {
          await item.load(book.load.bind(book));
          const found: Array<{ cfi: string; excerpt: string }> = item.find(query) || [];
          results.push(...found);
          item.unload();
        })
      );
      setSearchResults(results.slice(0, 50));
    } catch (e) {
      console.error('Search failed', e);
    }
    setIsSearching(false);
  }, [bookRef]);

  const goToLocation = useCallback(() => {
    const val = goToInput.trim();
    if (!val) return;
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0 && num <= 100) {
      const spine = (bookRef.current as any)?.spine?.spineItems;
      if (spine && spine.length) {
        const idx = Math.min(Math.floor((num / 100) * spine.length), spine.length - 1);
        renditionRef.current?.display(spine[idx].href);
      }
    }
    setShowGoTo(false);
    setGoToInput('');
  }, [goToInput, bookRef, renditionRef]);

  const selectSearchResult = useCallback(
    (cfi: string) => {
      renditionRef.current?.display(cfi);
      setShowSearch(false);
    },
    [renditionRef]
  );

  return {
    showSearch,
    setShowSearch,
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    runSearch,
    selectSearchResult,
    showGoTo,
    setShowGoTo,
    goToInput,
    setGoToInput,
    goToLocation,
  };
}
