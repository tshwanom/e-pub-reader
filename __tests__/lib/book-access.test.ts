import { isPrivilegedUser, getBookAccessState, getDonorAccessState, getDonorFeatureAccessState } from '@/lib/book-access';

// Mock prisma so we don't hit the database
jest.mock('@/lib/prisma', () => ({
  prisma: {
    donation: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

const { prisma } = jest.requireMock('@/lib/prisma') as {
  prisma: { donation: { findFirst: jest.MockedFunction<any>; updateMany: jest.MockedFunction<any> } };
};

const publishedFreeBook = { status: 'PUBLISHED', donorOnly: false };
const publishedDonorBook = { status: 'PUBLISHED', donorOnly: true };
const draftBook = { status: 'DRAFT', donorOnly: false };

describe('isPrivilegedUser', () => {
  it('returns true for ADMIN role', () => {
    expect(isPrivilegedUser({ role: 'ADMIN' })).toBe(true);
  });

  it('returns true for EDITOR role', () => {
    expect(isPrivilegedUser({ role: 'EDITOR' })).toBe(true);
  });

  it('returns false for USER role', () => {
    expect(isPrivilegedUser({ role: 'USER' })).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isPrivilegedUser(null)).toBe(false);
    expect(isPrivilegedUser(undefined)).toBe(false);
  });

  it('returns false when role is missing', () => {
    expect(isPrivilegedUser({})).toBe(false);
  });
});

describe('getBookAccessState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.donation.findFirst.mockResolvedValue(null); // default: not a donor
    prisma.donation.updateMany.mockResolvedValue({ count: 0 });
  });

  it('grants access to a published free book for anonymous users', async () => {
    const result = await getBookAccessState(publishedFreeBook, null);
    expect(result.hasAccess).toBe(true);
    expect(result.isPublished).toBe(true);
    expect(result.requiresDonation).toBe(false);
  });

  it('denies access to a draft book for anonymous users', async () => {
    const result = await getBookAccessState(draftBook, null);
    expect(result.hasAccess).toBe(false);
    expect(result.isPublished).toBe(false);
  });

  it('denies access to a donor-only book for non-donors', async () => {
    prisma.donation.findFirst.mockResolvedValue(null);
    const result = await getBookAccessState(publishedDonorBook, { id: 'user1', role: 'USER' });
    expect(result.hasAccess).toBe(false);
    expect(result.requiresDonation).toBe(true);
    expect(result.isDonor).toBe(false);
  });

  it('grants access to a donor-only book for donors', async () => {
    prisma.donation.findFirst.mockResolvedValue({ id: 'donation1' });
    const result = await getBookAccessState(publishedDonorBook, { id: 'user1', role: 'USER' });
    expect(result.hasAccess).toBe(true);
    expect(result.isDonor).toBe(true);
  });

  it('grants access to draft books for ADMINs', async () => {
    const result = await getBookAccessState(draftBook, { id: 'admin1', role: 'ADMIN' });
    expect(result.hasAccess).toBe(true);
    expect(result.isPrivileged).toBe(true);
  });

  it('grants access to donor-only books for ADMINs without checking donations', async () => {
    // donation check should NOT be called since admin is privileged
    prisma.donation.findFirst.mockResolvedValue(null);
    const result = await getBookAccessState(publishedDonorBook, { id: 'admin1', role: 'ADMIN' });
    expect(result.hasAccess).toBe(true);
    expect(prisma.donation.findFirst).not.toHaveBeenCalled();
  });
});

describe('getDonorFeatureAccessState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.donation.findFirst.mockResolvedValue(null); // default: not a donor
    prisma.donation.updateMany.mockResolvedValue({ count: 0 });
  });

  it('denies donor features to anonymous readers of free books', async () => {
    const result = await getDonorFeatureAccessState(publishedFreeBook, null);
    expect(result.hasBookAccess).toBe(true);
    expect(result.hasAccess).toBe(false);
    expect(result.requiresBookAccess).toBe(false);
    expect(result.requiresDonation).toBe(true);
    expect(result.isSignedIn).toBe(false);
  });

  it('grants donor features to donors on published free books', async () => {
    prisma.donation.findFirst.mockResolvedValue({ id: 'donation1' });
    const result = await getDonorFeatureAccessState(publishedFreeBook, {
      id: 'user1',
      role: 'USER',
      email: 'reader@example.com',
    });
    expect(result.hasBookAccess).toBe(true);
    expect(result.hasAccess).toBe(true);
    expect(result.requiresDonation).toBe(false);
    expect(result.isDonor).toBe(true);
    expect(prisma.donation.updateMany).toHaveBeenCalledWith({
      where: {
        userId: null,
        status: 'COMPLETED',
        donorEmail: {
          equals: 'reader@example.com',
          mode: 'insensitive',
        },
      },
      data: {
        userId: 'user1',
      },
    });
  });

  it('keeps donor features locked when the user cannot open a donor-only book', async () => {
    const result = await getDonorFeatureAccessState(publishedDonorBook, { id: 'user1', role: 'USER' });
    expect(result.hasBookAccess).toBe(false);
    expect(result.hasAccess).toBe(false);
    expect(result.requiresBookAccess).toBe(true);
    expect(result.requiresDonation).toBe(true);
  });

  it('grants donor features to privileged users without donation checks', async () => {
    const result = await getDonorFeatureAccessState(draftBook, { id: 'admin1', role: 'ADMIN' });
    expect(result.hasBookAccess).toBe(true);
    expect(result.hasAccess).toBe(true);
    expect(result.requiresDonation).toBe(false);
    expect(prisma.donation.findFirst).not.toHaveBeenCalled();
  });
});

describe('getDonorAccessState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.donation.findFirst.mockResolvedValue(null); // default: not a donor
    prisma.donation.updateMany.mockResolvedValue({ count: 0 });
  });

  it('keeps donor narration locked for anonymous visitors', async () => {
    const result = await getDonorAccessState(null);

    expect(result.hasAccess).toBe(false);
    expect(result.isSignedIn).toBe(false);
    expect(result.requiresDonation).toBe(true);
  });

  it('grants donor narration access to donors', async () => {
    prisma.donation.findFirst.mockResolvedValue({ id: 'donation1' });

    const result = await getDonorAccessState({
      id: 'user1',
      role: 'USER',
      email: 'reader@example.com',
    });

    expect(result.hasAccess).toBe(true);
    expect(result.isDonor).toBe(true);
    expect(result.requiresDonation).toBe(false);
  });

  it('recognizes completed guest donations again after the user signs in with the same email', async () => {
    prisma.donation.findFirst.mockResolvedValue({ id: 'donation-email-linked' });

    const result = await getDonorAccessState({
      id: 'user-linked',
      role: 'USER',
      email: 'guest@example.com',
    });

    expect(result.hasAccess).toBe(true);
    expect(result.isDonor).toBe(true);
    expect(prisma.donation.findFirst).toHaveBeenCalledWith({
      where: {
        status: 'COMPLETED',
        OR: [
          { userId: 'user-linked' },
          {
            donorEmail: {
              equals: 'guest@example.com',
              mode: 'insensitive',
            },
          },
        ],
      },
      select: {
        id: true,
      },
    });
  });

  it('grants donor narration access to privileged users without donation checks', async () => {
    const result = await getDonorAccessState({ id: 'admin1', role: 'ADMIN' });

    expect(result.hasAccess).toBe(true);
    expect(result.isPrivileged).toBe(true);
    expect(prisma.donation.findFirst).not.toHaveBeenCalled();
  });
});
