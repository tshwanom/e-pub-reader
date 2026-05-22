/** @jest-environment node */

import { GET, PATCH } from '@/app/api/reader/preferences/route';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}));

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockFindUser = prisma.user.findUnique as jest.MockedFunction<any>;
const mockUpdateUser = prisma.user.update as jest.MockedFunction<any>;

describe('reader preferences route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1', role: 'READER' } } as any);
    mockFindUser.mockResolvedValue({
      readerPreferences: {
        narrationPlayerExpanded: false,
      },
    });
    mockUpdateUser.mockResolvedValue({
      id: 'user-1',
      readerPreferences: {
        narrationPlayerExpanded: true,
      },
    });
  });

  it('returns 401 when the session does not include a usable user id', async () => {
    mockGetServerSession.mockResolvedValue({ user: { role: 'READER' } } as any);

    const response = await PATCH(
      new Request('http://localhost/api/reader/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ narrationPlayerExpanded: true }),
      }) as any,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockFindUser).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('returns 404 instead of throwing when the session user record no longer exists', async () => {
    mockFindUser.mockResolvedValue(null);

    const response = await PATCH(
      new Request('http://localhost/api/reader/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ narrationPlayerExpanded: true }),
      }) as any,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'User not found' });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('returns the saved preferences for valid users', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      preferences: {
        narrationPlayerExpanded: false,
      },
    });
    expect(mockFindUser).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { readerPreferences: true },
    });
  });
});
