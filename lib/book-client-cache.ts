export const BOOK_FILE_CACHE_NAME = 'omr-book-files-v2';

const VALID_BOOK_RESPONSE_CONTENT_TYPES = [
  'application/epub+zip',
  'application/zip',
  'application/octet-stream',
  'binary/octet-stream',
];

export type BookBinarySource = 'cache' | 'network';
export type BookLoadErrorCode = 'BOOK_CACHE_MISS_OFFLINE' | 'BOOK_FETCH_FAILED';

export interface BookBinaryLoadResult {
  buffer: ArrayBuffer;
  source: BookBinarySource;
  isOfflineReady: boolean;
}

export interface LoadBookBinaryOptions {
  forceNetwork?: boolean;
}

export type BookBinaryLoadError = Error & {
  code: BookLoadErrorCode;
  status?: number;
  cause?: unknown;
};

type PendingBookFetchResult = {
  status: number;
  buffer: ArrayBuffer | null;
  cacheWritePromise: Promise<void> | null;
};

const pendingBookFetches = new Map<string, Promise<PendingBookFetchResult>>();

function hasCacheStorage() {
  return typeof caches !== 'undefined';
}

function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

async function openBookFileCache() {
  if (!hasCacheStorage()) {
    return null;
  }

  return caches.open(BOOK_FILE_CACHE_NAME);
}

async function matchCachedBookResponse(url: string) {
  const cache = await openBookFileCache();

  if (!cache) {
    return null;
  }

  return cache.match(url);
}

async function deleteCachedBookResponse(url: string) {
  const cache = await openBookFileCache();

  if (!cache) {
    return false;
  }

  return cache.delete(url);
}

function isValidBookResponseContentType(contentType: string | null) {
  if (!contentType) {
    return true;
  }

  const normalizedContentType = contentType.toLowerCase();

  return VALID_BOOK_RESPONSE_CONTENT_TYPES.some((expectedContentType) =>
    normalizedContentType.includes(expectedContentType)
  );
}

async function getUsableCachedBookResponse(url: string) {
  const cachedResponse = await matchCachedBookResponse(url);

  if (!cachedResponse) {
    return null;
  }

  if (cachedResponse.ok && isValidBookResponseContentType(cachedResponse.headers.get('content-type'))) {
    return cachedResponse;
  }

  await deleteCachedBookResponse(url).catch(() => false);
  return null;
}

async function cacheBookResponse(url: string, response: Response) {
  const cache = await openBookFileCache();

  if (!cache) {
    return;
  }

  await cache.put(url, response);
}

export async function clearCachedBookBinary(url: string) {
  await deleteCachedBookResponse(url);
}

function createBookLoadError(
  code: BookLoadErrorCode,
  message: string,
  status?: number,
  cause?: unknown,
): BookBinaryLoadError {
  const error = new Error(message) as BookBinaryLoadError;
  error.name = 'BookBinaryLoadError';
  error.code = code;

  if (typeof status === 'number') {
    error.status = status;
  }

  if (cause !== undefined) {
    error.cause = cause;
  }

  return error;
}

function getOrCreatePendingBookFetch(
  url: string,
  factory: () => Promise<PendingBookFetchResult>,
) {
  const existingPromise = pendingBookFetches.get(url);

  if (existingPromise) {
    return existingPromise;
  }

  const nextPromise = factory().finally(() => {
    if (pendingBookFetches.get(url) === nextPromise) {
      pendingBookFetches.delete(url);
    }
  });

  pendingBookFetches.set(url, nextPromise);
  return nextPromise;
}

async function fetchAndPersistBook(url: string, etag?: string): Promise<PendingBookFetchResult> {
  let response: Response;

  try {
    response = etag
      ? await fetch(url, { headers: { 'If-None-Match': etag } })
      : await fetch(url);
  } catch (error) {
    throw createBookLoadError('BOOK_FETCH_FAILED', 'Failed to fetch the book file.', undefined, error);
  }

  if (response.status === 304) {
    return {
      status: response.status,
      buffer: null,
      cacheWritePromise: null,
    };
  }

  if (!response.ok) {
    throw createBookLoadError(
      'BOOK_FETCH_FAILED',
      `EPUB fetch failed with status ${response.status}`,
      response.status,
    );
  }

  const cacheWritePromise = cacheBookResponse(url, response.clone()).catch(() => undefined);
  const buffer = await response.arrayBuffer();

  return {
    status: response.status,
    buffer,
    cacheWritePromise,
  };
}

export async function warmBookOfflineCache(url: string) {
  const cachedResponse = await getUsableCachedBookResponse(url);

  if (cachedResponse && isOffline()) {
    return 'cache' as const;
  }

  const etag = cachedResponse?.headers.get('ETag') ?? undefined;

  try {
    const result = await getOrCreatePendingBookFetch(url, () => fetchAndPersistBook(url, etag));

    if (result.cacheWritePromise) {
      await result.cacheWritePromise;
    }

    return result.status === 304 ? 'cache' as const : 'network' as const;
  } catch (error) {
    if (cachedResponse) {
      return 'cache' as const;
    }

    throw error;
  }
}

export async function loadBookBinary(
  url: string,
  options: LoadBookBinaryOptions = {},
): Promise<BookBinaryLoadResult> {
  const cachedResponse = options.forceNetwork
    ? null
    : await getUsableCachedBookResponse(url);

  if (cachedResponse) {
    if (!isOffline()) {
      void warmBookOfflineCache(url).catch(() => undefined);
    }

    return {
      buffer: await cachedResponse.arrayBuffer(),
      source: 'cache',
      isOfflineReady: true,
    };
  }

  if (isOffline()) {
    throw createBookLoadError(
      'BOOK_CACHE_MISS_OFFLINE',
      'This book is not saved on this device yet.',
    );
  }

  const result = await getOrCreatePendingBookFetch(url, () => fetchAndPersistBook(url));

  if (result.cacheWritePromise) {
    void result.cacheWritePromise;
  }

  if (!result.buffer) {
    const cachedAfterFetch = await getUsableCachedBookResponse(url);

    if (cachedAfterFetch) {
      return {
        buffer: await cachedAfterFetch.arrayBuffer(),
        source: 'cache',
        isOfflineReady: true,
      };
    }

    throw createBookLoadError('BOOK_FETCH_FAILED', 'The book download completed without any content.');
  }

  return {
    buffer: result.buffer,
    source: 'network',
    isOfflineReady: hasCacheStorage(),
  };
}

export async function isBookAvailableOffline(url: string) {
  return Boolean(await getUsableCachedBookResponse(url));
}

export function isBookLoadErrorCode(error: unknown, code: BookLoadErrorCode): error is BookBinaryLoadError {
  return error instanceof Error && (error as Partial<BookBinaryLoadError>).code === code;
}
