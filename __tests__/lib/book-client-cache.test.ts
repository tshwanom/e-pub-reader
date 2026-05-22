import {
  BOOK_FILE_CACHE_NAME,
  loadBookBinary,
  warmBookOfflineCache,
} from '@/lib/book-client-cache';

function cloneArrayBuffer(value?: ArrayBuffer | null) {
  return value ? value.slice(0) : new ArrayBuffer(0);
}

function createMockResponse({
  status = 200,
  body,
  headers = {},
}: {
  status?: number;
  body?: ArrayBuffer;
  headers?: Record<string, string>;
} = {}): Response {
  const normalizedHeaders = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name: string) {
        return normalizedHeaders.get(name.toLowerCase()) ?? null;
      },
    },
    arrayBuffer: jest.fn().mockResolvedValue(cloneArrayBuffer(body)),
    clone: jest.fn(() => createMockResponse({
      status,
      body: cloneArrayBuffer(body),
      headers,
    })),
  } as unknown as Response;
}

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

function createCacheStorageMock() {
  const stores = new Map<string, Map<string, Response>>();

  return {
    async open(name: string) {
      if (!stores.has(name)) {
        stores.set(name, new Map());
      }

      const store = stores.get(name)!;

      return {
        async match(request: string | Request) {
          const key = typeof request === 'string' ? request : request.url;
          return store.get(key)?.clone();
        },
        async delete(request: string | Request) {
          const key = typeof request === 'string' ? request : request.url;
          return store.delete(key);
        },
        async put(request: string | Request, response: Response) {
          const key = typeof request === 'string' ? request : request.url;
          store.set(key, response.clone());
        },
      };
    },
    async seed(name: string, request: string, response: Response) {
      const cache = await this.open(name);
      await cache.put(request, response);
    },
  };
}

function createHangingCacheStorageMock() {
  return {
    async open() {
      return {
        async match() {
          return undefined;
        },
        async put() {
          return new Promise(() => {});
        },
      };
    },
  };
}

describe('book client cache', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    setNavigatorOnline(true);
    (global as any).caches = createCacheStorageMock();
  });

  afterEach(() => {
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      Reflect.deleteProperty(global, 'fetch');
    }

    Reflect.deleteProperty(global, 'caches');
  });

  it('warms a book into cache and serves it offline afterwards', async () => {
    const binary = new Uint8Array([1, 2, 3, 4]).buffer;
    global.fetch = jest.fn().mockResolvedValue(
      createMockResponse({
        status: 200,
        body: binary,
        headers: {
          ETag: '"book-cache-1"',
          'Content-Type': 'application/epub+zip',
        },
      })
    ) as jest.Mock;

    await expect(warmBookOfflineCache('/api/books/test-book/file')).resolves.toBe('network');

    setNavigatorOnline(false);
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as jest.Mock;

    const result = await loadBookBinary('/api/books/test-book/file');

    expect(result.source).toBe('cache');
    expect(Array.from(new Uint8Array(result.buffer))).toEqual([1, 2, 3, 4]);
  });

  it('revalidates a cached book with its ETag before downloading again', async () => {
    const cacheStorageMock = createCacheStorageMock();
    (global as any).caches = cacheStorageMock;
    await cacheStorageMock.seed(
      BOOK_FILE_CACHE_NAME,
      '/api/books/test-book/file',
      createMockResponse({
        status: 200,
        headers: {
          ETag: '"book-cache-2"',
          'Content-Type': 'application/epub+zip',
        },
        body: new Uint8Array([9, 8, 7]).buffer,
      })
    );

    global.fetch = jest.fn().mockResolvedValue(createMockResponse({ status: 304 })) as jest.Mock;

    await expect(warmBookOfflineCache('/api/books/test-book/file')).resolves.toBe('cache');
    expect(global.fetch).toHaveBeenCalledWith('/api/books/test-book/file', {
      headers: {
        'If-None-Match': '"book-cache-2"',
      },
    });
  });

  it('ignores a cached non-EPUB response and refreshes the book from the network', async () => {
    const cacheStorageMock = createCacheStorageMock();
    (global as any).caches = cacheStorageMock;
    await cacheStorageMock.seed(
      BOOK_FILE_CACHE_NAME,
      '/api/books/test-book/file',
      createMockResponse({
        status: 200,
        headers: {
          ETag: '"bad-cache"',
          'Content-Type': 'text/html; charset=utf-8',
        },
        body: new Uint8Array([60, 104, 116, 109, 108, 62]).buffer,
      })
    );

    global.fetch = jest.fn().mockResolvedValue(
      createMockResponse({
        status: 200,
        body: new Uint8Array([7, 7, 7, 7]).buffer,
        headers: {
          ETag: '"book-cache-4"',
          'Content-Type': 'application/epub+zip',
        },
      })
    ) as jest.Mock;

    const result = await loadBookBinary('/api/books/test-book/file');

    expect(result.source).toBe('network');
    expect(Array.from(new Uint8Array(result.buffer))).toEqual([7, 7, 7, 7]);
    expect(global.fetch).toHaveBeenCalledWith('/api/books/test-book/file');

    setNavigatorOnline(false);
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as jest.Mock;

    const offlineResult = await loadBookBinary('/api/books/test-book/file');

    expect(offlineResult.source).toBe('cache');
    expect(Array.from(new Uint8Array(offlineResult.buffer))).toEqual([7, 7, 7, 7]);
  });

  it('throws a specific error when offline reading is requested before a book is cached', async () => {
    setNavigatorOnline(false);

    await expect(loadBookBinary('/api/books/missing/file')).rejects.toMatchObject({
      code: 'BOOK_CACHE_MISS_OFFLINE',
    });
  });

  it('returns the downloaded EPUB bytes without waiting for cache persistence to finish', async () => {
    (global as any).caches = createHangingCacheStorageMock();
    global.fetch = jest.fn().mockResolvedValue(
      createMockResponse({
        status: 200,
        body: new Uint8Array([4, 3, 2, 1]).buffer,
        headers: {
          ETag: '"book-cache-3"',
          'Content-Type': 'application/epub+zip',
        },
      })
    ) as jest.Mock;

    const result = await loadBookBinary('/api/books/test-book/file');

    expect(result.source).toBe('network');
    expect(Array.from(new Uint8Array(result.buffer))).toEqual([4, 3, 2, 1]);
  });
});
