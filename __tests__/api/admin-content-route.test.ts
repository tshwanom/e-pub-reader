/** @jest-environment node */

import { POST as createContent } from '@/app/api/admin/content/route';
import { PATCH as updateContent } from '@/app/api/admin/content/[contentId]/route';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}));

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('@/lib/content-narration-sync', () => ({
  buildContentNarrationSourceHash: jest.fn(() => 'content-hash'),
}));

jest.mock('@/lib/content-narration-jobs', () => ({
  backfillContentNarrationSourceHashes: jest.fn(() => Promise.resolve()),
  scheduleContentNarrationAutoSync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    supplementaryContent: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockFindUnique = prisma.supplementaryContent.findUnique as jest.MockedFunction<any>;
const mockCreate = prisma.supplementaryContent.create as jest.MockedFunction<any>;
const mockUpdate = prisma.supplementaryContent.update as jest.MockedFunction<any>;

describe('admin content routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockGetServerSession.mockResolvedValue({
      user: {
        id: 'admin-1',
        role: 'ADMIN',
      },
    } as any);

    mockCreate.mockResolvedValue({ id: 'content-1' });
    mockUpdate.mockResolvedValue({ id: 'content-1' });
  });

  it('allows YouTube URLs for embedded video creation', async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const response = await createContent(new Request('http://localhost/api/admin/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'VIDEO',
        status: 'DRAFT',
        title: 'Embedded video',
        url: 'https://www.youtube.com/watch?v=mU0HKpYVppE',
      }),
    }) as any);

    expect(response.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'VIDEO',
        url: 'https://www.youtube.com/watch?v=mU0HKpYVppE',
      }),
    }));
  });

  it('allows direct video URLs for clean-player video creation', async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const response = await createContent(new Request('http://localhost/api/admin/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'VIDEO',
        status: 'DRAFT',
        title: 'Direct video',
        url: 'https://cdn.example.com/videos/direct-video.mp4',
      }),
    }) as any);

    expect(response.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'VIDEO',
        url: 'https://cdn.example.com/videos/direct-video.mp4',
      }),
    }));
  });

  it('allows Vimeo URLs when updating video content', async () => {
    mockFindUnique
      .mockResolvedValueOnce({
        id: 'content-1',
        type: 'VIDEO',
        title: 'Existing video',
        summary: null,
        content: null,
        author: null,
        status: 'DRAFT',
        publishedAt: null,
        narrationSourceHash: null,
      })
      .mockResolvedValueOnce(null);

    const response = await updateContent(new Request('http://localhost/api/admin/content/content-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'VIDEO',
        status: 'DRAFT',
        title: 'Existing video',
        url: 'https://vimeo.com/123456789',
      }),
    }) as any, {
      params: Promise.resolve({ contentId: 'content-1' }),
    });

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'VIDEO',
        url: 'https://vimeo.com/123456789',
      }),
    }));
  });
});