/** @jest-environment node */

import { GET } from '@/app/api/books/[bookId]/narration/route';
import { getDonorFeatureAccessState } from '@/lib/book-access';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}));

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('@/lib/book-access', () => ({
  getDonorFeatureAccessState: jest.fn(),
}));

jest.mock('@/lib/book-narration-jobs', () => ({
  ensureBookNarrationBackgroundProcessing: jest.fn(),
}));

jest.mock('@/lib/narration-storage', () => ({
  createPresignedNarrationObjectUrl: jest.fn(),
  getNarrationStorageProvider: jest.fn(() => 's3'),
  getNarrationStorageProviderLabel: jest.fn(() => 'S3'),
  isNarrationStorageConfigured: jest.fn(() => true),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    book: {
      findUnique: jest.fn(),
    },
    bookNarration: {
      findMany: jest.fn(),
    },
  },
}));

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockGetDonorFeatureAccessState = getDonorFeatureAccessState as jest.MockedFunction<typeof getDonorFeatureAccessState>;
const mockFindBook = prisma.book.findUnique as jest.MockedFunction<any>;
const mockFindNarrations = prisma.bookNarration.findMany as jest.MockedFunction<any>;

describe('book narration route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue(null);
    mockFindBook.mockResolvedValue({
      id: 'book-1',
      title: 'Test Book',
      status: 'PUBLISHED',
      donorOnly: false,
      donorAccessLevel: 'PUBLIC',
      audiobook: null,
    });
    mockFindNarrations.mockResolvedValue([]);
  });

  it('blocks signed-in non-donors from donor narration', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1', role: 'USER' } } as any);
    mockGetDonorFeatureAccessState.mockResolvedValueOnce({
      hasAccess: false,
      hasBookAccess: true,
      isDonor: false,
      isRecurringDonor: false,
      donorTier: 'NONE',
      isPrivileged: false,
      isPublished: true,
      isSignedIn: true,
      bookDonorAccessLevel: 'PUBLIC',
      requiresDonation: true,
      requiresRecurringDonation: false,
      requiresBookAccess: false,
    });

    const response = await GET(new Request('http://localhost/api/books/book-1/narration'), {
      params: Promise.resolve({ bookId: 'book-1' }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      available: false,
      reason: 'donor-required',
      message: 'Due to the cost of running narration, this feature is reserved for donors only. Make one completed donation to unlock it on your account.',
    });
    expect(mockFindNarrations).not.toHaveBeenCalled();
  });

  it('lets donors check narration readiness', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1', role: 'USER' } } as any);
    mockGetDonorFeatureAccessState.mockResolvedValueOnce({
      hasAccess: true,
      hasBookAccess: true,
      isDonor: true,
      isRecurringDonor: false,
      donorTier: 'ONE_TIME',
      isPrivileged: false,
      isPublished: true,
      isSignedIn: true,
      bookDonorAccessLevel: 'PUBLIC',
      requiresDonation: false,
      requiresRecurringDonation: false,
      requiresBookAccess: false,
    });

    const response = await GET(new Request('http://localhost/api/books/book-1/narration'), {
      params: Promise.resolve({ bookId: 'book-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      available: false,
      reason: 'not-generated',
      message: 'Donor narration is enabled for “Test Book”, but the narrated assets have not been generated yet.',
    });
    expect(mockFindNarrations).toHaveBeenCalledWith({
      where: { bookId: 'book-1' },
      orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
      select: expect.any(Object),
    });
  });
});