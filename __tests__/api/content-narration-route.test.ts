/** @jest-environment node */

import { GET } from '@/app/api/content/[contentId]/narration/route';
import { getDonorAccessState } from '@/lib/book-access';
import { createPresignedNarrationObjectUrl } from '@/lib/narration-storage';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}));

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('@/lib/book-access', () => ({
  getDonorAccessState: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    supplementaryContent: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@/lib/narration-storage', () => ({
  createPresignedNarrationObjectUrl: jest.fn(),
  getNarrationStorageProvider: jest.fn(() => 's3'),
  getNarrationStorageProviderLabel: jest.fn(() => 'S3'),
  isNarrationStorageConfigured: jest.fn(() => true),
}));

jest.mock('@/lib/content-narration-sync', () => ({
  getContentNarrationSourceHash: jest.fn(() => 'content-hash-1'),
  getContentNarrationSyncSummary: jest.fn(() => ({
    syncState: 'READY',
    message: 'Narration is current.',
  })),
  hasTrackedContentNarrationSourceHash: jest.fn(() => true),
  isContentNarrationCurrent: jest.fn(() => true),
}));

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockGetDonorAccessState = getDonorAccessState as jest.MockedFunction<typeof getDonorAccessState>;
const mockCreatePresignedNarrationObjectUrl = createPresignedNarrationObjectUrl as jest.MockedFunction<typeof createPresignedNarrationObjectUrl>;
const mockFindContent = prisma.supplementaryContent.findUnique as jest.MockedFunction<any>;

const publishedContent = {
  id: 'content-1',
  title: 'The Fire Inside',
  type: 'POEM',
  status: 'PUBLISHED',
  summary: 'A short poem.',
  content: 'Burn bright.',
  author: 'OMR',
  narrationEnabled: true,
  narrationSourceHash: 'content-hash-1',
  narrations: [
    {
      id: 'narration-1',
      status: 'READY',
      active: true,
      storageProvider: 'S3',
      audioObjectKey: 'narration/content-1/classic/track.mp3',
      audioMimeType: 'audio/mpeg',
      durationMs: 91000,
      sourceHash: 'content-hash-1',
      updatedAt: new Date('2026-05-13T08:00:00.000Z'),
      errorMessage: null,
      voice: {
        id: 'voice-1',
        name: 'Classic Narrator',
        slug: 'classic-narrator',
        provider: 'manual-seed',
        language: 'en',
      },
    },
  ],
};

describe('content narration route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindContent.mockResolvedValue(publishedContent);
    mockGetServerSession.mockResolvedValue(null);
    mockGetDonorAccessState.mockResolvedValue({
      hasAccess: false,
      isDonor: false,
      isRecurringDonor: false,
      donorTier: 'NONE',
      isPrivileged: false,
      isSignedIn: false,
      requiresDonation: true,
    });
    mockCreatePresignedNarrationObjectUrl.mockResolvedValue('https://signed.example/narration/content-1/classic/track.mp3');
  });

  it('returns a sign-in-required payload to anonymous visitors before exposing narration assets', async () => {
    const response = await GET(new Request('http://localhost/api/content/content-1/narration'), {
      params: Promise.resolve({ contentId: 'content-1' }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      available: false,
      reason: 'sign-in-required',
      voices: [],
    });
    expect(mockCreatePresignedNarrationObjectUrl).not.toHaveBeenCalled();
  });

  it('returns a donor-required payload to signed-in non-donors', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1', role: 'USER' } } as any);
    mockGetDonorAccessState.mockResolvedValue({
      hasAccess: false,
      isDonor: false,
      isRecurringDonor: false,
      donorTier: 'NONE',
      isPrivileged: false,
      isSignedIn: true,
      requiresDonation: true,
    });

    const response = await GET(new Request('http://localhost/api/content/content-1/narration'), {
      params: Promise.resolve({ contentId: 'content-1' }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      available: false,
      reason: 'donor-required',
      voices: [],
    });
    expect(mockCreatePresignedNarrationObjectUrl).not.toHaveBeenCalled();
  });

  it('returns signed donor narration metadata to donors', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1', role: 'USER' } } as any);
    mockGetDonorAccessState.mockResolvedValue({
      hasAccess: true,
      isDonor: true,
      isRecurringDonor: false,
      donorTier: 'ONE_TIME',
      isPrivileged: false,
      isSignedIn: true,
      requiresDonation: false,
    });

    const response = await GET(new Request('http://localhost/api/content/content-1/narration'), {
      params: Promise.resolve({ contentId: 'content-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      available: true,
      reason: 'ready',
      message: 'Donor narration for “The Fire Inside” is ready to play.',
      defaultVoiceSlug: 'classic-narrator',
      voices: [
        expect.objectContaining({
          narrationId: 'narration-1',
          audioUrl: 'https://signed.example/narration/content-1/classic/track.mp3',
        }),
      ],
    });
    expect(mockCreatePresignedNarrationObjectUrl).toHaveBeenCalledWith(
      'narration/content-1/classic/track.mp3',
      's3'
    );
  });

  it('keeps narration unavailable for video content even when the viewer is a donor', async () => {
    mockFindContent.mockResolvedValue({
      ...publishedContent,
      type: 'VIDEO',
      title: 'Library Trailer',
    });
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1', role: 'USER' } } as any);
    mockGetDonorAccessState.mockResolvedValue({
      hasAccess: true,
      isDonor: true,
      isRecurringDonor: false,
      donorTier: 'ONE_TIME',
      isPrivileged: false,
      isSignedIn: true,
      requiresDonation: false,
    });

    const response = await GET(new Request('http://localhost/api/content/content-1/narration'), {
      params: Promise.resolve({ contentId: 'content-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      available: false,
      reason: 'unsupported-type',
      voices: [],
    });
    expect(mockCreatePresignedNarrationObjectUrl).not.toHaveBeenCalled();
  });
});