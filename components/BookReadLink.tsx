'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef } from 'react';
import { warmBookOfflineCache } from '@/lib/book-client-cache';

interface BookReadLinkProps {
  bookId: string;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  prefetchOnMount?: boolean;
}

export default function BookReadLink({
  bookId,
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
      href={`/read/${bookId}`}
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
