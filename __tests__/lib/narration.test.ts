import {
  buildNarrationManifest,
  createNarrationFeatureResponse,
  parseNarrationUpsertPayload,
  signNarrationManifestAssets,
  toNarrationObjectStorageProvider,
  toPersistedNarrationStorageProvider,
} from '@/lib/narration';

describe('narration contract helpers', () => {
  it('builds a manifest from narration records', () => {
    const manifest = buildNarrationManifest('book_123', {
      id: 'narration_123',
      totalDurationMs: 482000,
      manifestObjectKey: 'narration/book_123/voice_classic/manifest.json',
      updatedAt: '2026-05-07T10:00:00.000Z',
      voice: {
        id: 'voice_classic',
        name: 'Classic Narrator',
        slug: 'classic-narrator',
        provider: 'coqui',
        language: 'en',
      },
      chapters: [
        {
          id: 'chapter_1',
          chapterIndex: 0,
          title: 'Opening',
          spineHref: 'Text/chapter-1.xhtml',
          durationMs: 221000,
          audioObjectKey: 'narration/book_123/voice_classic/chapters/0.mp3',
          audioMimeType: 'audio/mpeg',
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
    });

    expect(manifest).toEqual({
      version: 1,
      bookId: 'book_123',
      narrationId: 'narration_123',
      generatedAt: '2026-05-07T10:00:00.000Z',
      totalDurationMs: 482000,
      chapterCount: 1,
      storage: {
        provider: 'local',
        manifestObjectKey: 'narration/book_123/voice_classic/manifest.json',
      },
      voice: {
        id: 'voice_classic',
        name: 'Classic Narrator',
        slug: 'classic-narrator',
        provider: 'coqui',
        language: 'en',
      },
      chapters: [
        {
          id: 'chapter_1',
          chapterIndex: 0,
          title: 'Opening',
          spineHref: 'Text/chapter-1.xhtml',
          durationMs: 221000,
          audio: {
            objectKey: 'narration/book_123/voice_classic/chapters/0.mp3',
            mimeType: 'audio/mpeg',
            url: null,
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
    });
  });

  it('creates a consistent narration feature response envelope', () => {
    expect(
      createNarrationFeatureResponse({
        available: false,
        reason: 'processing',
        message: 'Narration is being generated.',
        manifest: null,
        manifestUrl: null,
        bookHasLegacyAudiobook: true,
      })
    ).toEqual({
      feature: 'narration',
      donorOnly: true,
      available: false,
      reason: 'processing',
      message: 'Narration is being generated.',
      storageProvider: 'local',
      defaultVoiceSlug: null,
      voices: [],
      manifest: null,
      manifestUrl: null,
      bookHasLegacyAudiobook: true,
    });
  });

  it('derives voice options from the manifest when a ready response does not provide them explicitly', () => {
    const manifest = buildNarrationManifest('book_123', {
      id: 'narration_123',
      totalDurationMs: 482000,
      manifestObjectKey: 'narration/book_123/voice_classic/manifest.json',
      updatedAt: '2026-05-07T10:00:00.000Z',
      voice: {
        id: 'voice_classic',
        name: 'Classic Narrator',
        slug: 'classic-narrator',
        provider: 'coqui',
        language: 'en',
      },
      chapters: [],
    });

    expect(
      createNarrationFeatureResponse({
        available: true,
        reason: 'ready',
        message: 'Narration is ready.',
        manifest,
        manifestUrl: 'https://signed.example/narration/book_123/voice_classic/manifest.json',
        bookHasLegacyAudiobook: false,
      })
    ).toMatchObject({
      defaultVoiceSlug: 'classic-narrator',
      voices: [
        {
          narrationId: 'narration_123',
          active: true,
          chapterCount: 0,
          manifestUrl: 'https://signed.example/narration/book_123/voice_classic/manifest.json',
          voice: {
            slug: 'classic-narrator',
          },
        },
      ],
    });
  });

  it('supports provider-aware manifests and response envelopes', () => {
    const manifest = buildNarrationManifest(
      'book_123',
      {
        id: 'narration_123',
        totalDurationMs: 482000,
        manifestObjectKey: 'narration/book_123/voice_classic/manifest.json',
        updatedAt: '2026-05-07T10:00:00.000Z',
        voice: {
          id: 'voice_classic',
          name: 'Classic Narrator',
          slug: 'classic-narrator',
          provider: 'coqui',
          language: 'en',
        },
        chapters: [],
      },
      'local'
    );

    expect(manifest.storage.provider).toBe('local');
    expect(
      createNarrationFeatureResponse({
        available: false,
        reason: 'storage-not-configured',
        message: 'Provider wiring is incomplete.',
        storageProvider: 'local',
        manifest: null,
        manifestUrl: null,
        bookHasLegacyAudiobook: false,
      }).storageProvider
    ).toBe('local');
  });

  it('maps persisted and runtime storage provider formats', () => {
    expect(toPersistedNarrationStorageProvider('r2')).toBe('R2');
    expect(toPersistedNarrationStorageProvider('local')).toBe('LOCAL');
    expect(toPersistedNarrationStorageProvider('hybrid')).toBe('HYBRID');
    expect(toNarrationObjectStorageProvider('B2')).toBe('local');
    expect(toNarrationObjectStorageProvider('S3')).toBe('local');
    expect(toNarrationObjectStorageProvider('R2')).toBe('r2');
    expect(toNarrationObjectStorageProvider('LOCAL')).toBe('local');
    expect(toNarrationObjectStorageProvider('HYBRID')).toBe('hybrid');
  });

  it('parses and normalizes narration upsert payloads', () => {
    expect(
      parseNarrationUpsertPayload({
        voice: {
          slug: 'classic-narrator',
          name: 'Classic Narrator',
          provider: 'manual-seed',
          language: 'en',
          description: '  Warm voice  ',
          sampleText: '',
        },
        narration: {
          status: 'READY',
          storageProvider: 'local',
          manifestObjectKey: ' narration/book/manifest.json ',
          totalDurationMs: 482000,
          active: true,
          readyAt: '2026-05-07T10:00:00.000Z',
        },
        chapters: [
          {
            chapterIndex: 1,
            title: 'Chapter 2',
            spineHref: 'Text/chapter-2.xhtml',
            status: 'READY',
            audioObjectKey: 'audio/chapter-2.mp3',
            durationMs: 120000,
            cues: [
              {
                sequence: 1,
                startMs: 1500,
                endMs: 3000,
                targetHref: 'Text/chapter-2.xhtml#p2',
              },
            ],
          },
          {
            chapterIndex: 0,
            title: 'Chapter 1',
            spineHref: 'Text/chapter-1.xhtml',
            status: 'READY',
            audioObjectKey: 'audio/chapter-1.mp3',
            durationMs: 100000,
            cues: [
              {
                sequence: 0,
                startMs: 0,
                endMs: 1400,
                targetHref: 'Text/chapter-1.xhtml#p1',
              },
            ],
          },
        ],
      })
    ).toMatchObject({
      voice: {
        slug: 'classic-narrator',
        description: 'Warm voice',
        sampleText: null,
      },
      narration: {
        status: 'READY',
        storageProvider: 'LOCAL',
        manifestObjectKey: 'narration/book/manifest.json',
        audioMimeType: 'audio/mpeg',
        active: true,
        totalDurationMs: 482000,
      },
      chapters: [
        expect.objectContaining({ chapterIndex: 0 }),
        expect.objectContaining({ chapterIndex: 1 }),
      ],
    });
  });

  it('signs manifest and chapter audio URLs through a provided signer', async () => {
    const manifest = buildNarrationManifest('book_123', {
      id: 'narration_123',
      totalDurationMs: 482000,
      manifestObjectKey: 'narration/book_123/voice_classic/manifest.json',
      updatedAt: '2026-05-07T10:00:00.000Z',
      voice: {
        id: 'voice_classic',
        name: 'Classic Narrator',
        slug: 'classic-narrator',
        provider: 'coqui',
        language: 'en',
      },
      chapters: [
        {
          id: 'chapter_1',
          chapterIndex: 0,
          title: 'Opening',
          spineHref: 'Text/chapter-1.xhtml',
          durationMs: 221000,
          audioObjectKey: 'narration/book_123/voice_classic/chapters/0.mp3',
          audioMimeType: 'audio/mpeg',
          cues: [],
        },
      ],
    });

    const signer = jest.fn(async (objectKey: string) => `https://signed.example/${objectKey}`);

    await expect(signNarrationManifestAssets(manifest, signer)).resolves.toEqual({
      manifest: {
        ...manifest,
        chapters: [
          {
            ...manifest.chapters[0],
            audio: {
              ...manifest.chapters[0].audio,
              url: 'https://signed.example/narration/book_123/voice_classic/chapters/0.mp3',
            },
          },
        ],
      },
      manifestUrl: 'https://signed.example/narration/book_123/voice_classic/manifest.json',
    });

    expect(signer).toHaveBeenCalledWith('narration/book_123/voice_classic/chapters/0.mp3');
    expect(signer).toHaveBeenCalledWith('narration/book_123/voice_classic/manifest.json');
  });
});
