import {
  buildContentNarrationSourceHash,
  getContentNarrationSyncSummary,
  isContentNarrationCurrent,
} from '@/lib/content-narration-sync';

const baseContent = {
  id: 'content_123',
  type: 'ARTICLE',
  title: 'The Quiet Rebellion',
  summary: 'A short editorial summary.',
  content: 'This is the body that becomes narration.',
  author: 'One Man Revolution',
} as const;

describe('content narration sync helpers', () => {
  it('changes the source hash when the transcript changes', () => {
    const initialHash = buildContentNarrationSourceHash(baseContent);
    const changedHash = buildContentNarrationSourceHash({
      ...baseContent,
      content: 'This is the updated body that becomes narration.',
    });

    expect(initialHash).not.toBe(changedHash);
  });

  it('treats matching tracked narration as current', () => {
    const currentSourceHash = buildContentNarrationSourceHash(baseContent);

    expect(
      isContentNarrationCurrent(
        {
          status: 'READY',
          audioObjectKey: 'narration/content/audio.wav',
          sourceHash: currentSourceHash,
        },
        {
          currentSourceHash,
          hasTrackedSourceHash: true,
        }
      )
    ).toBe(true);
  });

  it('reports processing when a fresh sync is running and old ready audio exists', () => {
    const currentSourceHash = buildContentNarrationSourceHash(baseContent);

    expect(
      getContentNarrationSyncSummary({
        currentSourceHash,
        hasTrackedSourceHash: true,
        narrations: [
          {
            status: 'READY',
            audioObjectKey: 'narration/content/old.wav',
            sourceHash: 'old-hash',
          },
          {
            status: 'PROCESSING',
            audioObjectKey: null,
            sourceHash: currentSourceHash,
          },
        ],
      })
    ).toMatchObject({
      syncState: 'PROCESSING',
      staleReadyCount: 1,
      currentProcessingCount: 1,
    });
  });

  it('keeps legacy ready narration available before tracking is attached', () => {
    expect(
      getContentNarrationSyncSummary({
        currentSourceHash: buildContentNarrationSourceHash(baseContent),
        hasTrackedSourceHash: false,
        narrations: [
          {
            status: 'READY',
            audioObjectKey: 'narration/content/legacy.wav',
            sourceHash: null,
          },
        ],
      })
    ).toMatchObject({
      syncState: 'CURRENT',
      hasTrackedSourceHash: false,
    });
  });
});
