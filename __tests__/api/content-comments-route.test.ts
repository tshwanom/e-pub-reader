/** @jest-environment node */

import { GET, POST } from '@/app/api/content/[contentId]/comments/route';
import { getContentAccessState } from '@/lib/book-access';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}));

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('@/lib/book-access', () => ({
  getContentAccessState: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    supplementaryContent: {
      findUnique: jest.fn(),
    },
    contentComment: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
  },
}));

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockGetContentAccessState = getContentAccessState as jest.MockedFunction<typeof getContentAccessState>;
const mockFindContent = prisma.supplementaryContent.findUnique as jest.MockedFunction<any>;
const mockFindComments = prisma.contentComment.findMany as jest.MockedFunction<any>;
const mockCountComments = prisma.contentComment.count as jest.MockedFunction<any>;
const mockCreateComment = prisma.contentComment.create as jest.MockedFunction<any>;

const videoContent = {
  id: 'content-1',
  title: 'A Watchful Fire',
  type: 'VIDEO',
  status: 'PUBLISHED',
  donorOnly: false,
  donorAccessLevel: 'PUBLIC',
};

const storedComment = {
  id: 'comment-1',
  userId: 'user-1',
  body: 'A thoughtful contribution.',
  createdAt: new Date('2026-05-27T10:00:00.000Z'),
  updatedAt: new Date('2026-05-27T10:00:00.000Z'),
  user: {
    name: 'Reader One',
    email: 'reader@example.com',
  },
};

describe('content comments route', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockGetServerSession.mockResolvedValue(null);
    mockFindContent.mockResolvedValue(videoContent);
    mockGetContentAccessState.mockResolvedValue({
      hasAccess: true,
      isDonor: false,
      isRecurringDonor: false,
      isPrivileged: false,
      isPublished: true,
      donorTier: 'NONE',
      requiresDonation: false,
      requiresRecurringDonation: false,
      isSignedIn: false,
      contentDonorAccessLevel: 'PUBLIC',
    } as any);
    mockFindComments.mockResolvedValue([storedComment]);
    mockCountComments.mockResolvedValue(1);
    mockCreateComment.mockResolvedValue(storedComment);
  });

  it('returns serialized comments for accessible published video content', async () => {
    const response = await GET(new Request('http://localhost/api/content/content-1/comments') as any, {
      params: Promise.resolve({ contentId: 'content-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      count: 1,
      comments: [
        expect.objectContaining({
          id: 'comment-1',
          authorName: 'Reader One',
          authorInitial: 'R',
        }),
      ],
    });
  });

  it('requires sign-in before allowing comment creation', async () => {
    const response = await POST(new Request('http://localhost/api/content/content-1/comments', {
      method: 'POST',
      body: JSON.stringify({ body: 'Hello there' }),
      headers: { 'Content-Type': 'application/json' },
    }) as any, {
      params: Promise.resolve({ contentId: 'content-1' }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'Unauthorized' });
    expect(mockCreateComment).not.toHaveBeenCalled();
  });

  it('posts a new comment for signed-in viewers with access', async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: 'user-1',
        role: 'READER',
      },
    } as any);

    const response = await POST(new Request('http://localhost/api/content/content-1/comments', {
      method: 'POST',
      body: JSON.stringify({ body: 'A thoughtful contribution.' }),
      headers: { 'Content-Type': 'application/json' },
    }) as any, {
      params: Promise.resolve({ contentId: 'content-1' }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: 'comment-1',
      isCurrentUser: true,
    });
    expect(mockCreateComment).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        body: 'A thoughtful contribution.',
        contentId: 'content-1',
        userId: 'user-1',
      },
    }));
  });

  it('blocks comment reads when a donor-locked video is not unlocked', async () => {
    mockFindContent.mockResolvedValue({
      ...videoContent,
      donorOnly: true,
      donorAccessLevel: 'ALL_DONORS',
    });
    mockGetContentAccessState.mockResolvedValue({
      hasAccess: false,
      isDonor: false,
      isRecurringDonor: false,
      isPrivileged: false,
      isPublished: true,
      donorTier: 'NONE',
      requiresDonation: true,
      requiresRecurringDonation: false,
      isSignedIn: false,
      contentDonorAccessLevel: 'ALL_DONORS',
    } as any);

    const response = await GET(new Request('http://localhost/api/content/content-1/comments') as any, {
      params: Promise.resolve({ contentId: 'content-1' }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Comments for this video unlock with the video access tier.',
    });
  });
});