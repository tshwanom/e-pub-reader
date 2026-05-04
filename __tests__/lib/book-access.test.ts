import { isPrivilegedUser, getBookAccessState } from '@/lib/book-access';

// Mock prisma so we don't hit the database
jest.mock('@/lib/prisma', () => ({
  prisma: {
    donation: {
      findFirst: jest.fn(),
    },
  },
}));

const { prisma } = jest.requireMock('@/lib/prisma') as {
  prisma: { donation: { findFirst: jest.MockedFunction<any> } };
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
