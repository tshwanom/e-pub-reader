/** @jest-environment node */

import { GET } from '@/app/api/donations/paystack/manage/route';
import { getServerSession } from 'next-auth';
import { getUserActivePaystackSubscriptionById } from '@/lib/donation-subscriptions';
import {
  getPaystackSubscriptionManageLink,
  resolvePublicAppOrigin,
} from '@/lib/donation-payments';

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}));

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('@/lib/donation-subscriptions', () => ({
  getUserActivePaystackSubscriptionById: jest.fn(),
}));

jest.mock('@/lib/donation-payments', () => ({
  getPaystackSubscriptionManageLink: jest.fn(),
  resolvePublicAppOrigin: jest.fn(),
}));

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockGetUserActivePaystackSubscriptionById = getUserActivePaystackSubscriptionById as jest.MockedFunction<typeof getUserActivePaystackSubscriptionById>;
const mockGetPaystackSubscriptionManageLink = getPaystackSubscriptionManageLink as jest.MockedFunction<typeof getPaystackSubscriptionManageLink>;
const mockResolvePublicAppOrigin = resolvePublicAppOrigin as jest.MockedFunction<typeof resolvePublicAppOrigin>;

function createMockRequest(url: string) {
  return {
    url,
    nextUrl: new URL(url),
    headers: new Headers(),
  } as Parameters<typeof GET>[0];
}

describe('Paystack manage route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolvePublicAppOrigin.mockReturnValue('https://1manrevolution.com');
    mockGetServerSession.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'reader@example.com',
      },
    } as any);
    mockGetUserActivePaystackSubscriptionById.mockResolvedValue({
      id: 'donation-1',
      donorEmail: 'reader@example.com',
      gatewayAmount: 182.5,
      gatewayCurrency: 'ZAR',
      paystackSubscriptionCode: 'SUB_123',
      createdAt: new Date('2026-05-22T10:00:00.000Z'),
      book: {
        id: 'book-1',
        title: 'Test Book',
      },
    });
    mockGetPaystackSubscriptionManageLink.mockResolvedValue('https://paystack.example.com/manage/SUB_123');
  });

  it('redirects the signed-in user to the hosted Paystack management page', async () => {
    const response = await GET(
      createMockRequest('https://1manrevolution.com/api/donations/paystack/manage?returnTo=%2Flibrary&donationId=donation-1')
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://paystack.example.com/manage/SUB_123');
    expect(mockGetUserActivePaystackSubscriptionById).toHaveBeenCalledWith({
      user: {
        id: 'user-1',
        email: 'reader@example.com',
      },
      donationId: 'donation-1',
    });
    expect(mockGetPaystackSubscriptionManageLink).toHaveBeenCalledWith('SUB_123');
  });

  it('redirects guests to sign in first', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const response = await GET(
      createMockRequest('https://1manrevolution.com/api/donations/paystack/manage?returnTo=%2Fbooks%2Fbook-1')
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://1manrevolution.com/login?callbackUrl=https%3A%2F%2F1manrevolution.com%2Fbooks%2Fbook-1'
    );
    expect(mockGetUserActivePaystackSubscriptionById).not.toHaveBeenCalled();
  });

  it('returns to the caller with a status when no active Paystack subscription is available', async () => {
    mockGetUserActivePaystackSubscriptionById.mockResolvedValue(null);

    const response = await GET(
      createMockRequest('https://1manrevolution.com/api/donations/paystack/manage?returnTo=%2Flibrary&donationId=donation-1')
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://1manrevolution.com/library?subscription=manage-unavailable');
    expect(mockGetPaystackSubscriptionManageLink).not.toHaveBeenCalled();
  });
});
