'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef } from 'react';
import { warmBookOfflineCache } from '@/lib/book-client-cache';
import { getBookReadPath } from '@/lib/book-paths';

interface BookReadLinkProps {
  bookId: string;
  bookSlug?: string | null;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  prefetchOnMount?: boolean;
}

export default function BookReadLink({
  bookId,
  bookSlug,
  children,
  className,
  ariaLabel,
  prefetchOnMount = false,
}: BookReadLinkProps) {
  const hasWarmedRef = useRef(false);

  const warmBookCache = useCallback(() => {
    if (hasWarmedRef.current) {
      return;
    }

    hasWarmedRef.current = true;

    void warmBookOfflineCache(`/api/books/${bookId}/file`).catch(() => {
      hasWarmedRef.current = false;
    });
  }, [bookId]);

  useEffect(() => {
    if (!prefetchOnMount) {
      return;
    }

    warmBookCache();
  }, [prefetchOnMount, warmBookCache]);

  return (
    <Link
      href={getBookReadPath({ id: bookId, slug: bookSlug })}
      className={className}
      aria-label={ariaLabel}
      onMouseEnter={warmBookCache}
      onFocus={warmBookCache}
      onTouchStart={warmBookCache}
    >
      {children}
    </Link>
  );
}
