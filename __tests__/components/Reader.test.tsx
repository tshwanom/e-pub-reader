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

const epubArrayBuffer = new ArrayBuffer(8);

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

function buildFetchMock({ narrationPayload }: { narrationPayload?: typeof readyNarrationPayload } = {}) {
  return jest.fn((url: string) => {
    if (typeof url === 'string' && url.includes('/file')) {
      return Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(epubArrayBuffer),
      } as Response);
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
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ preferences: {} }),
      } as Response);
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
    mockOn.mockImplementation((event: string, handler: (...args: any[]) => void) => {
      renditionEventHandlers[event] = handler;
    });
    mockDisplay.mockResolvedValue(undefined);
    mockGetContents.mockReturnValue([]);
    localStorage.clear();
    localStorage.setItem('reader-tour-seen', '1');
    global.fetch = buildFetchMock() as jest.Mock;
  });

  it('renders the current reader chrome and loads the epub file as an ArrayBuffer', async () => {
    render(<Reader {...DEFAULT_PROPS} />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/books/test-book-id/file'));
    expect(screen.getByLabelText('Search in book')).toBeInTheDocument();
    expect(screen.getByLabelText('Open reading menu')).toBeInTheDocument();
    expect(screen.getByLabelText('Table of contents')).toBeInTheDocument();
    expect(mockRenderTo).toHaveBeenCalled();
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
