'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const OFFLINE_PAGE_CACHE_NAME = 'omr-offline-pages-v1';
const OFFLINE_ASSET_CACHE_NAME = 'omr-offline-assets-v1';
const OFFLINE_ELIGIBLE_ROUTE_PATTERN = /^\/(?:$|library\/?$|books\/[^/]+\/?$|read\/[^/]+\/?$)/;
const LOCAL_DEVELOPMENT_HOSTNAME_PATTERN = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i;

function isLocalDevelopmentHost(hostname: string) {
  return LOCAL_DEVELOPMENT_HOSTNAME_PATTERN.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^10\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
}

async function resetOfflineSupportForLocalDevelopment() {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  if (typeof caches !== 'undefined') {
    await Promise.all([
      caches.delete(OFFLINE_PAGE_CACHE_NAME),
      caches.delete(OFFLINE_ASSET_CACHE_NAME),
    ]);
  }
}

async function warmOfflinePage(pathname: string) {
  if (!pathname || typeof caches === 'undefined' || !OFFLINE_ELIGIBLE_ROUTE_PATTERN.test(pathname)) {
    return;
  }

  try {
    const response = await fetch(pathname);
    const contentType = response.headers.get('content-type') || '';

    if (!response.ok || !contentType.includes('text/html')) {
      return;
    }

    const cache = await caches.open(OFFLINE_PAGE_CACHE_NAME);
    await cache.put(pathname, response.clone());
  } catch {
    // Ignore warm-up failures; the network page is already on screen.
  }
}

export default function OfflineSupport() {
  const pathname = usePathname();
  const isLocalDevelopment = typeof window !== 'undefined' && isLocalDevelopmentHost(window.location.hostname);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    if (isLocalDevelopment) {
      void resetOfflineSupportForLocalDevelopment().catch(() => undefined);
      return;
    }

    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, [isLocalDevelopment]);

  useEffect(() => {
    if (!pathname || isLocalDevelopment) {
      return;
    }

    void warmOfflinePage(pathname);
  }, [isLocalDevelopment, pathname]);

  return null;
}
