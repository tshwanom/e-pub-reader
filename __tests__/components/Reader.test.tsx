'use client';

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Reader from '@/components/Reader';

const mockDisplay = jest.fn().mockResolvedValue(undefined);
const mockPrev = jest.fn();
const mockNext = jest.fn();
const mockDestroy = jest.fn();
const mockThemesSelect = jest.fn();
const mockThemesFontSize = jest.fn();
const mockThemesRegister = jest.fn();
const mockThemesFont = jest.fn();
const mockThemesOverride = jest.fn();
const mockOn = jest.fn();
const mockResize = jest.fn();
const mockAnnotationsHighlight = jest.fn();
const mockAnnotationsRemove = jest.fn();
const mockGetContents = jest.fn(() => []);

const renditionEventHandlers: Record<string, (...args: any[]) => void> = {};

const mockRendition = {
  display: mockDisplay,
  prev: mockPrev,
  next: mockNext,
  destroy: mockDestroy,
  resize: mockResize,
  getContents: mockGetContents,
  themes: {
    select: mockThemesSelect,
    fontSize: mockThemesFontSize,
    register: mockThemesRegister,
    font: mockThemesFont,
    override: mockThemesOverride,
  },
  on: mockOn,
  annotations: {
    highlight: mockAnnotationsHighlight,
    remove: mockAnnotationsRemove,
  },
};

const mockRenderTo = jest.fn().mockReturnValue(mockRendition);
const mockBook = {
  renderTo: mockRenderTo,
  navigation: {
    toc: [{ href: 'Text/chapter-1.xhtml', label: 'Opening' }],
  },
  ready: Promise.resolve(),
  spine: {
    each: jest.fn(),
    spineItems: [],
  },
  load: jest.fn(),
};

jest.mock('epubjs', () =>
  jest.fn(() => mockBook)
);

const mockEpubFactory = jest.requireMock('epubjs') as jest.Mock;

const epubArrayBytes = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);

function cloneArrayBuffer(value?: ArrayBuffer | null) {
  return value ? value.slice(0) : new ArrayBuffer(0);
}

function createMockResponse({
  status = 200,
  body,
  headers = {},
  json,
}: {
  status?: number;
  body?: ArrayBuffer;
  headers?: Record<string, string>;
  json?: unknown;
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
    json: jest.fn().mockResolvedValue(json),
    clone: jest.fn(() => createMockResponse({
      status,
      body: cloneArrayBuffer(body),
      headers,
      json,
    })),
  } as unknown as Response;
}

const readyNarrationPayload = {
  feature: 'narration',
  donorOnly: true,
  available: true,
  reason: 'ready',
  message: 'Donor narration for “Test Book” is ready to stream.',
  storageProvider: 's3',
  defaultVoiceSlug: 'classic-narrator',
  manifestUrl: 'https://signed.example/narration/book_123/voice_classic/manifest.json',
  bookHasLegacyAudiobook: false,
  manifest: {
    version: 1,
    bookId: 'test-book-id',
    narrationId: 'narration-1',
    generatedAt: '2026-05-07T10:00:00.000Z',
    totalDurationMs: 221000,
    chapterCount: 1,
    storage: {
      provider: 's3',
      manifestObjectKey: 'narration/test-book-id/classic/manifest.json',
    },
    voice: {
      id: 'voice-1',
      name: 'Classic Narrator',
      slug: 'classic-narrator',
      provider: 'manual-seed',
      language: 'en',
    },
    chapters: [
      {
        id: 'chapter-1',
        chapterIndex: 0,
        title: 'Opening',
        spineHref: 'Text/chapter-1.xhtml',
        durationMs: 221000,
        audio: {
          objectKey: 'narration/test-book-id/classic/chapters/0.mp3',
          mimeType: 'audio/mpeg',
          url: 'https://signed.example/narration/test-book-id/classic/chapters/0.mp3',
        },
        cueCount: 1,
        cues: [
          {
            sequence: 0,
            startMs: 0,
            endMs: 5400,
            targetHref: 'Text/chapter-1.xhtml#p1',
            targetElementId: 'p1',
            targetCfi: '/6/2[p1]',
            excerpt: 'In the beginning',
          },
        ],
      },
    ],
  },
  voices: [
    {
      narrationId: 'narration-1',
      active: true,
      totalDurationMs: 221000,
      chapterCount: 1,
      manifestUrl: 'https://signed.example/narration/book_123/voice_classic/manifest.json',
      voice: {
        id: 'voice-1',
        name: 'Classic Narrator',
        slug: 'classic-narrator',
        provider: 'manual-seed',
        language: 'en',
      },
      manifest: {
        version: 1,
        bookId: 'test-book-id',
        narrationId: 'narration-1',
        generatedAt: '2026-05-07T10:00:00.000Z',
        totalDurationMs: 221000,
        chapterCount: 1,
        storage: {
          provider: 's3',
          manifestObjectKey: 'narration/test-book-id/classic/manifest.json',
        },
        voice: {
          id: 'voice-1',
          name: 'Classic Narrator',
          slug: 'classic-narrator',
          provider: 'manual-seed',
          language: 'en',
        },
        chapters: [
          {
            id: 'chapter-1',
            chapterIndex: 0,
            title: 'Opening',
            spineHref: 'Text/chapter-1.xhtml',
            durationMs: 221000,
            audio: {
              objectKey: 'narration/test-book-id/classic/chapters/0.mp3',
              mimeType: 'audio/mpeg',
              url: 'https://signed.example/narration/test-book-id/classic/chapters/0.mp3',
            },
            cueCount: 1,
            cues: [
              {
                sequence: 0,
                startMs: 0,
                endMs: 5400,
                targetHref: 'Text/chapter-1.xhtml#p1',
                targetElementId: 'p1',
                targetCfi: '/6/2[p1]',
                excerpt: 'In the beginning',
              },
            ],
          },
        ],
      },
    },
    {
      narrationId: 'narration-2',
      active: false,
      totalDurationMs: 219000,
      chapterCount: 1,
      manifestUrl: 'https://signed.example/narration/book_123/voice_studio/manifest.json',
      voice: {
        id: 'voice-2',
        name: 'Studio Voice',
        slug: 'studio-narrator',
        provider: 'manual-seed',
        language: 'en',
      },
      manifest: {
        version: 1,
        bookId: 'test-book-id',
        narrationId: 'narration-2',
        generatedAt: '2026-05-07T11:00:00.000Z',
        totalDurationMs: 219000,
        chapterCount: 1,
        storage: {
          provider: 's3',
          manifestObjectKey: 'narration/test-book-id/studio/manifest.json',
        },
        voice: {
          id: 'voice-2',
          name: 'Studio Voice',
          slug: 'studio-narrator',
          provider: 'manual-seed',
          language: 'en',
        },
        chapters: [
          {
            id: 'chapter-2',
            chapterIndex: 0,
            title: 'Opening',
            spineHref: 'Text/chapter-1.xhtml',
            durationMs: 219000,
            audio: {
              objectKey: 'narration/test-book-id/studio/chapters/0.mp3',
              mimeType: 'audio/mpeg',
              url: 'https://signed.example/narration/test-book-id/studio/chapters/0.mp3',
            },
            cueCount: 1,
            cues: [
              {
                sequence: 0,
                startMs: 0,
                endMs: 5200,
                targetHref: 'Text/chapter-1.xhtml#p1',
                targetElementId: 'p1',
                targetCfi: '/6/2[p1]',
                excerpt: 'In the beginning',
              },
            ],
          },
        ],
      },
    },
  ],
};

const DEFAULT_PROPS = {
  url: '/api/books/test-book-id/file',
  bookId: 'test-book-id',
  initialLocation: null,
};

function buildFetchMock({
  narrationPayload,
  narrationPreferenceStatus = 200,
}: {
  narrationPayload?: typeof readyNarrationPayload;
  narrationPreferenceStatus?: number;
} = {}) {
  return jest.fn((url: string) => {
    if (typeof url === 'string' && url.includes('/file')) {
      return Promise.resolve(createMockResponse({
        status: 200,
        body: epubArrayBytes.slice().buffer,
        headers: {
          ETag: '"reader-test-book"',
          'Content-Type': 'application/epub+zip',
        },
      }));
    }

    if (typeof url === 'string' && /highlights|bookmarks|notes/.test(url)) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);
    }

    if (typeof url === 'string' && url.includes('/narration')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(narrationPayload ?? readyNarrationPayload),
      } as Response);
    }

    if (typeof url === 'string' && url.includes('/api/reader/preferences')) {
      return Promise.resolve(createMockResponse({
        status: narrationPreferenceStatus,
        json: narrationPreferenceStatus >= 200 && narrationPreferenceStatus < 300
          ? { preferences: {} }
          : { error: narrationPreferenceStatus === 404 ? 'User not found' : 'Preference sync failed' },
      }));
    }

    if (typeof url === 'string' && url.includes('/progress')) {
      return Promise.resolve({ ok: true } as Response);
    }

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);
  });
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

const originalPlay = HTMLMediaElement.prototype.play;
const originalPause = HTMLMediaElement.prototype.pause;
const originalLoad = HTMLMediaElement.prototype.load;

class ResizeObserverMock {
  observe = jest.fn();
  disconnect = jest.fn();
  unobserve = jest.fn();
}

describe('Reader component', () => {
  beforeAll(() => {
    (global as any).ResizeObserver = ResizeObserverMock;

    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: jest.fn().mockResolvedValue(undefined),
    });

    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      value: jest.fn(),
    });

    Object.defineProperty(HTMLMediaElement.prototype, 'load', {
      configurable: true,
      value: jest.fn(),
    });
  });

  afterAll(() => {
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: originalPlay,
    });

    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      value: originalPause,
    });

    Object.defineProperty(HTMLMediaElement.prototype, 'load', {
      configurable: true,
      value: originalLoad,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(renditionEventHandlers).forEach((key) => delete renditionEventHandlers[key]);
    mockEpubFactory.mockImplementation(() => mockBook);
    mockOn.mockImplementation((event: string, handler: (...args: any[]) => void) => {
      renditionEventHandlers[event] = handler;
    });
    mockDisplay.mockResolvedValue(undefined);
    mockGetContents.mockReturnValue([]);
    localStorage.clear();
    localStorage.setItem('reader-tour-seen', '1');
    global.fetch = buildFetchMock() as jest.Mock;
    setNavigatorOnline(true);
    Reflect.deleteProperty(global, 'caches');
  });

  it('renders the current reader chrome and loads the epub file as an ArrayBuffer', async () => {
    render(<Reader {...DEFAULT_PROPS} />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/books/test-book-id/file'));
    expect(mockEpubFactory).toHaveBeenCalledWith(expect.any(ArrayBuffer), { openAs: 'binary' });
    expect(screen.getByLabelText('Search in book')).toBeInTheDocument();
    expect(screen.getByLabelText('Open reading menu')).toBeInTheDocument();
    expect(screen.getByLabelText('Table of contents')).toBeInTheDocument();
    expect(mockRenderTo).toHaveBeenCalled();
  });

  it('loads a previously cached book while offline without refetching the epub file', async () => {
    const cacheStorageMock = createCacheStorageMock();
    (global as any).caches = cacheStorageMock;
    await cacheStorageMock.seed(
      'omr-book-files-v1',
      '/api/books/test-book-id/file',
      createMockResponse({
        status: 200,
        headers: {
          ETag: '"cached-book"',
          'Content-Type': 'application/epub+zip',
        },
        body: new Uint8Array([5, 4, 3, 2]).buffer,
      })
    );
    setNavigatorOnline(false);

    render(<Reader {...DEFAULT_PROPS} />);

    await waitFor(() => expect(mockRenderTo).toHaveBeenCalled());
    expect((global.fetch as jest.Mock).mock.calls.some(([url]) => url === '/api/books/test-book-id/file')).toBe(false);
    expect(screen.queryByText('The page needs another try')).not.toBeInTheDocument();
  });

  it('clears a corrupted cached book and retries the network copy automatically', async () => {
    const cacheStorageMock = createCacheStorageMock();
    (global as any).caches = cacheStorageMock;
    await cacheStorageMock.seed(
      'omr-book-files-v1',
      '/api/books/test-book-id/file',
      createMockResponse({
        status: 200,
        headers: {
          ETag: '"corrupted-book"',
          'Content-Type': 'application/epub+zip',
        },
        body: new Uint8Array([99, 88, 77, 66]).buffer,
      })
    );

    mockEpubFactory.mockImplementation((source: ArrayBuffer) => {
      const bytes = Array.from(new Uint8Array(source));

      if (bytes[0] === 99 && bytes[1] === 88) {
        throw new Error('Corrupted cached EPUB');
      }

      return mockBook;
    });

    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    render(<Reader {...DEFAULT_PROPS} />);

    await waitFor(() => expect(mockEpubFactory).toHaveBeenCalledTimes(2));
    expect(consoleWarn).toHaveBeenCalledWith(
      'Cached EPUB failed to initialize. Clearing the saved copy and retrying from the network.',
      expect.any(Error)
    );
    expect(Array.from(new Uint8Array(mockEpubFactory.mock.calls[0][0] as ArrayBuffer))).toEqual([99, 88, 77, 66]);
    expect(Array.from(new Uint8Array(mockEpubFactory.mock.calls[1][0] as ArrayBuffer))).toEqual(Array.from(epubArrayBytes));
    expect((global.fetch as jest.Mock).mock.calls.some(([url]) => url === '/api/books/test-book-id/file')).toBe(true);
    expect(mockRenderTo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('The page needs another try')).not.toBeInTheDocument();

    consoleWarn.mockRestore();
  });

  it('falls back to the beginning of the book when the saved reading location cannot be displayed', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockDisplay
      .mockRejectedValueOnce(new Error('bad cfi'))
      .mockResolvedValueOnce(undefined);

    render(<Reader {...DEFAULT_PROPS} initialLocation="epubcfi(/6/999!)" />);

    await waitFor(() => expect(mockDisplay).toHaveBeenCalledTimes(2));

    expect(mockDisplay.mock.calls[0]).toEqual(['epubcfi(/6/999!)']);
    expect(mockDisplay.mock.calls[1]).toEqual([]);

    consoleError.mockRestore();
  });

  it('keeps reading progress local-only when no progress endpoint is provided', async () => {
    render(<Reader {...DEFAULT_PROPS} />);

    await waitFor(() => expect(mockRenderTo).toHaveBeenCalled());
    (global.fetch as jest.Mock).mockClear();

    await act(async () => {
      renditionEventHandlers.relocated?.({
        start: {
          cfi: 'epubcfi(/6/4[p2])',
          href: 'Text/chapter-2.xhtml',
          index: 1,
          percentage: 0.5,
        },
        end: {
          index: 3,
        },
      });
    });

    await waitFor(() => expect(screen.getByText('2 / 4')).toBeInTheDocument());

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    expect((global.fetch as jest.Mock).mock.calls.some(([url]) => url === '/api/progress')).toBe(false);
  });

  it('syncs reading progress when the server provides a progress endpoint', async () => {
    render(<Reader {...DEFAULT_PROPS} progressSaveEndpoint="/api/progress" />);

    await waitFor(() => expect(mockRenderTo).toHaveBeenCalled());
    (global.fetch as jest.Mock).mockClear();

    await act(async () => {
      renditionEventHandlers.relocated?.({
        start: {
          cfi: 'epubcfi(/6/4[p2])',
          href: 'Text/chapter-2.xhtml',
          index: 1,
          percentage: 0.5,
        },
        end: {
          index: 3,
        },
      });
    });

    await waitFor(() => expect(screen.getByText('2 / 4')).toBeInTheDocument());

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/progress', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: 'test-book-id',
          cfi: 'epubcfi(/6/4[p2])',
          progress: 50,
        }),
      }));
    });
  });

  it('shows the donor narration mini-player and expands into the full controls on demand', async () => {
    const user = userEvent.setup();

    render(
      <Reader
        {...DEFAULT_PROPS}
        narrationAccess={{
          hasAccess: true,
          isSignedIn: true,
          manageHref: '/books/test-book-id#support-this-book',
          statusEndpoint: '/api/books/test-book-id/narration',
        }}
      />
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/books/test-book-id/narration', { cache: 'no-store' }));
    expect(await screen.findByText('Donor narration')).toBeInTheDocument();
    expect(screen.getByText('1/1')).toBeInTheDocument();
    expect(screen.getByText('Opening')).toBeInTheDocument();
    expect(screen.queryByLabelText('Narration playback position')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Expand narration player'));

    expect(await screen.findByLabelText('Narration playback position')).toBeInTheDocument();
    expect(screen.getByLabelText('Collapse narration player')).toBeInTheDocument();
  });

  it('restores the saved narration player expansion preference from local storage for guest visits', async () => {
    localStorage.setItem('reader-narration-player-expanded', 'true');

    render(
      <Reader
        {...DEFAULT_PROPS}
        narrationAccess={{
          hasAccess: true,
          isSignedIn: true,
          manageHref: '/books/test-book-id#support-this-book',
          statusEndpoint: '/api/books/test-book-id/narration',
        }}
      />
    );

    await screen.findByText('Donor narration');

    expect(await screen.findByLabelText('Narration playback position')).toBeInTheDocument();
    expect(screen.getByLabelText('Collapse narration player')).toBeInTheDocument();
  });

  it('uses the saved server preference when the account already has one', async () => {
    render(
      <Reader
        {...DEFAULT_PROPS}
        initialNarrationPlayerExpanded={true}
        narrationPlayerPreferenceEndpoint="/api/reader/preferences"
        narrationAccess={{
          hasAccess: true,
          isSignedIn: true,
          manageHref: '/books/test-book-id#support-this-book',
          statusEndpoint: '/api/books/test-book-id/narration',
        }}
      />
    );

    await screen.findByText('Donor narration');

    expect(await screen.findByLabelText('Narration playback position')).toBeInTheDocument();
    expect(screen.getByLabelText('Collapse narration player')).toBeInTheDocument();
  });

  it('silently keeps the local narration player preference when the account can no longer be synced', async () => {
    global.fetch = buildFetchMock({ narrationPreferenceStatus: 404 }) as jest.Mock;
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('reader-narration-player-expanded', 'true');

    render(
      <Reader
        {...DEFAULT_PROPS}
        narrationPlayerPreferenceEndpoint="/api/reader/preferences"
        narrationAccess={{
          hasAccess: true,
          isSignedIn: true,
          manageHref: '/books/test-book-id#support-this-book',
          statusEndpoint: '/api/books/test-book-id/narration',
        }}
      />
    );

    expect(await screen.findByLabelText('Narration playback position')).toBeInTheDocument();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/reader/preferences', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ narrationPlayerExpanded: true }),
      }));
    });

    expect(
      consoleError.mock.calls.filter(([message]) => message === 'Failed to sync the narration player preference')
    ).toHaveLength(0);

    consoleError.mockRestore();
  });

  it('persists the narration player preference locally and syncs it to the server when readers expand and collapse it', async () => {
    const user = userEvent.setup();

    render(
      <Reader
        {...DEFAULT_PROPS}
        narrationPlayerPreferenceEndpoint="/api/reader/preferences"
        narrationAccess={{
          hasAccess: true,
          isSignedIn: true,
          manageHref: '/books/test-book-id#support-this-book',
          statusEndpoint: '/api/books/test-book-id/narration',
        }}
      />
    );

    await screen.findByText('Donor narration');

    await user.click(screen.getByLabelText('Expand narration player'));
    expect(localStorage.getItem('reader-narration-player-expanded')).toBe('true');
    expect(global.fetch).toHaveBeenCalledWith('/api/reader/preferences', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ narrationPlayerExpanded: true }),
    }));

    await user.click(await screen.findByLabelText('Collapse narration player'));
    expect(localStorage.getItem('reader-narration-player-expanded')).toBe('false');
    expect(global.fetch).toHaveBeenCalledWith('/api/reader/preferences', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ narrationPlayerExpanded: false }),
    }));
  });

  it('plays ready narration and syncs the active cue into epub.js highlighting', async () => {
    const user = userEvent.setup();

    render(
      <Reader
        {...DEFAULT_PROPS}
        narrationAccess={{
          hasAccess: true,
          isSignedIn: true,
          manageHref: '/books/test-book-id#support-this-book',
          statusEndpoint: '/api/books/test-book-id/narration',
        }}
      />
    );

    await screen.findByText('Donor narration');
    mockDisplay.mockClear();
    mockAnnotationsHighlight.mockClear();

    const playButtons = screen.getAllByLabelText('Play narration');
    await user.click(playButtons[0]);

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();

    const audio = screen.getByTestId('narration-audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      writable: true,
      value: 1.6,
    });

    fireEvent(audio, new Event('timeupdate'));

    await waitFor(() => {
      expect(mockDisplay).toHaveBeenCalledWith('/6/2[p1]');
      expect(mockAnnotationsHighlight).toHaveBeenCalled();
    });

    expect(mockAnnotationsHighlight.mock.calls.at(-1)?.[0]).toBe('/6/2[p1]');
  });

  it('switches between ready narration voices and remembers the selection per book', async () => {
    const user = userEvent.setup();

    render(
      <Reader
        {...DEFAULT_PROPS}
        narrationAccess={{
          hasAccess: true,
          isSignedIn: true,
          manageHref: '/books/test-book-id#support-this-book',
          statusEndpoint: '/api/books/test-book-id/narration',
        }}
      />
    );

    await screen.findByText('Donor narration');
    await user.click(screen.getByLabelText('Expand narration player'));
    await user.click(screen.getAllByRole('button', { name: 'Studio Voice' })[0]);

    expect(localStorage.getItem('reader-narration-voice-test-book-id')).toBe('studio-narrator');

    await waitFor(() => {
      expect((screen.getByTestId('narration-audio') as HTMLAudioElement).getAttribute('src')).toBe(
        'https://signed.example/narration/test-book-id/studio/chapters/0.mp3'
      );
    });
  });

  it('switches to the matching narration chapter when the reader jumps chapters during playback', async () => {
    const user = userEvent.setup();
    const twoChapterManifest = {
      ...readyNarrationPayload.manifest,
      totalDurationMs: 401000,
      chapterCount: 2,
      chapters: [
        readyNarrationPayload.manifest.chapters[0],
        {
          id: 'chapter-2',
          chapterIndex: 1,
          title: 'The Crossing',
          spineHref: 'Text/chapter-2.xhtml',
          durationMs: 180000,
          audio: {
            objectKey: 'narration/test-book-id/classic/chapters/1.mp3',
            mimeType: 'audio/mpeg',
            url: 'https://signed.example/narration/test-book-id/classic/chapters/1.mp3',
          },
          cueCount: 1,
          cues: [
            {
              sequence: 0,
              startMs: 0,
              endMs: 4800,
              targetHref: 'Text/chapter-2.xhtml#p2',
              targetElementId: 'p2',
              targetCfi: '/6/4[p2]',
              excerpt: 'The river answered back',
            },
          ],
        },
      ],
    };

    global.fetch = buildFetchMock({
      narrationPayload: {
        ...readyNarrationPayload,
        manifest: twoChapterManifest,
        voices: [
          {
            ...readyNarrationPayload.voices[0],
            totalDurationMs: 401000,
            chapterCount: 2,
            manifest: twoChapterManifest,
          },
          readyNarrationPayload.voices[1],
        ],
      } as any,
    }) as jest.Mock;

    render(
      <Reader
        {...DEFAULT_PROPS}
        narrationAccess={{
          hasAccess: true,
          isSignedIn: true,
          manageHref: '/books/test-book-id#support-this-book',
          statusEndpoint: '/api/books/test-book-id/narration',
        }}
      />
    );

    await screen.findByText('Donor narration');

    const audio = screen.getByTestId('narration-audio') as HTMLAudioElement;
    expect(audio.getAttribute('src')).toBe(
      'https://signed.example/narration/test-book-id/classic/chapters/0.mp3'
    );

    await user.click(screen.getAllByLabelText('Play narration')[0]);
    fireEvent(audio, new Event('play'));

    await act(async () => {
      renditionEventHandlers.relocated?.({
        start: {
          cfi: 'epubcfi(/6/4[p2])',
          href: 'Text/chapter-2.xhtml',
          index: 1,
          percentage: 0.5,
        },
        end: {
          index: 1,
        },
      });
    });

    await waitFor(() => {
      expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
      expect(audio.getAttribute('src')).toBe(
        'https://signed.example/narration/test-book-id/classic/chapters/1.mp3'
      );
    });
  });

  it('applies the active narration cue class inside iframe-backed epub documents', async () => {
    const user = userEvent.setup();
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);

    const iframeDocument = iframe.contentDocument;
    if (!iframeDocument) {
      throw new Error('Expected iframe document to be available in the test environment.');
    }

    iframeDocument.open();
    iframeDocument.write('<!doctype html><html><head></head><body><p id="p1">In the beginning</p></body></html>');
    iframeDocument.close();

    mockGetContents.mockReturnValue([{ document: iframeDocument }] as any);

    render(
      <Reader
        {...DEFAULT_PROPS}
        narrationAccess={{
          hasAccess: true,
          isSignedIn: true,
          manageHref: '/books/test-book-id#support-this-book',
          statusEndpoint: '/api/books/test-book-id/narration',
        }}
      />
    );

    await screen.findByText('Donor narration');

    const playButtons = screen.getAllByLabelText('Play narration');
    await user.click(playButtons[0]);

    const audio = screen.getByTestId('narration-audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      writable: true,
      value: 1.2,
    });

    fireEvent(audio, new Event('timeupdate'));

    await waitFor(() => {
      expect(iframeDocument.querySelector('[data-omr-narration-wrapper="true"]')).toHaveTextContent('In the beginning');
      expect(iframeDocument.getElementById('p1')).not.toHaveClass('omr-narration-active-cue');
      expect(iframeDocument.getElementById('omr-narration-cue-style')).toBeInTheDocument();
    });

    iframe.remove();
  });

  it('prefers excerpt-based cue matching when the EPUB block has no useful id', async () => {
    const user = userEvent.setup();
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);

    const iframeDocument = iframe.contentDocument;
    if (!iframeDocument) {
      throw new Error('Expected iframe document to be available in the test environment.');
    }

    iframeDocument.open();
    iframeDocument.write(`<!doctype html><html><head></head><body>
      <h3 id="heading-1">A Matrix Disguised as Civilization</h3>
      <p>The Captured Soul Decoding the Matrix The pages before you unmask a reality so pervasive that it remains nearly invisible.</p>
    </body></html>`);
    iframeDocument.close();

    mockGetContents.mockReturnValue([{ document: iframeDocument }] as any);

    const excerptMatchedManifest = {
      ...readyNarrationPayload.manifest,
      chapters: [
        {
          ...readyNarrationPayload.manifest.chapters[0],
          cues: [
            {
              sequence: 0,
              startMs: 0,
              endMs: 5400,
              targetHref: 'Text/chapter-1.xhtml#heading-1',
              targetElementId: 'heading-1',
              targetCfi: null,
              excerpt: 'The Captured Soul Decoding the Matrix The pages before you unmask a reality so pervasive that it remains nearly invisible.',
            },
          ],
        },
      ],
    };

    global.fetch = buildFetchMock({
      narrationPayload: {
        ...readyNarrationPayload,
        manifest: excerptMatchedManifest,
        voices: [
          {
            ...readyNarrationPayload.voices[0],
            manifest: excerptMatchedManifest,
          },
          readyNarrationPayload.voices[1],
        ],
      } as any,
    }) as jest.Mock;

    render(
      <Reader
        {...DEFAULT_PROPS}
        narrationAccess={{
          hasAccess: true,
          isSignedIn: true,
          manageHref: '/books/test-book-id#support-this-book',
          statusEndpoint: '/api/books/test-book-id/narration',
        }}
      />
    );

    await screen.findByText('Donor narration');

    const playButtons = screen.getAllByLabelText('Play narration');
    await user.click(playButtons[0]);

    const audio = screen.getByTestId('narration-audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      writable: true,
      value: 1.1,
    });

    fireEvent(audio, new Event('timeupdate'));

    await waitFor(() => {
      expect(iframeDocument.querySelector('[data-omr-narration-wrapper="true"]')).toHaveTextContent(
        'The Captured Soul Decoding the Matrix The pages before you unmask a reality so pervasive that it remains nearly invisible.'
      );
      expect(iframeDocument.querySelector('p')).not.toHaveClass('omr-narration-active-cue');
      expect(iframeDocument.getElementById('heading-1')).not.toHaveClass('omr-narration-active-cue');
    });

    iframe.remove();
  });

  it('shows a recovery message if the epub fetch fails instead of crashing', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 } as Response) as jest.Mock;
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(<Reader {...DEFAULT_PROPS} />);

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(await screen.findByText('The page needs another try')).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('destroys the rendition on unmount', async () => {
    const { unmount } = render(<Reader {...DEFAULT_PROPS} />);
    await waitFor(() => expect(mockDisplay).toHaveBeenCalled());

    unmount();

    expect(mockDestroy).toHaveBeenCalled();
  });
});
