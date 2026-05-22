/** @jest-environment node */

import { POST } from '@/app/api/donations/paystack/manage-email/route';
import { getServerSession } from 'next-auth';
import { getUserActivePaystackSubscriptionById } from '@/lib/donation-subscriptions';
import {
  resolvePublicAppOrigin,
  sendPaystackSubscriptionManageEmail,
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
  resolvePublicAppOrigin: jest.fn(),
  sendPaystackSubscriptionManageEmail: jest.fn(),
}));

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockGetUserActivePaystackSubscriptionById = getUserActivePaystackSubscriptionById as jest.MockedFunction<typeof getUserActivePaystackSubscriptionById>;
const mockResolvePublicAppOrigin = resolvePublicAppOrigin as jest.MockedFunction<typeof resolvePublicAppOrigin>;
const mockSendPaystackSubscriptionManageEmail = sendPaystackSubscriptionManageEmail as jest.MockedFunction<typeof sendPaystackSubscriptionManageEmail>;

function createMockRequest({
  url,
  returnTo = '/library',
  donationId = 'donation-1',
}: {
  url: string;
  returnTo?: string;
  donationId?: string;
}) {
  return {
    url,
    nextUrl: new URL(url),
    headers: new Headers(),
    formData: async () => {
      const formData = new FormData();
      formData.set('returnTo', returnTo);
      formData.set('donationId', donationId);
      return formData;
    },
  } as Parameters<typeof POST>[0];
}

describe('Paystack manage email route', () => {
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
    mockSendPaystackSubscriptionManageEmail.mockResolvedValue({
      message: 'Email successfully sent',
    });
  });

  it('emails the manage link and redirects back with a success flag', async () => {
    const response = await POST(
      createMockRequest({
        url: 'https://1manrevolution.com/api/donations/paystack/manage-email',
        returnTo: '/books/book-1',
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://1manrevolution.com/books/book-1?subscription=manage-email-sent');
    expect(mockGetUserActivePaystackSubscriptionById).toHaveBeenCalledWith({
      user: {
        id: 'user-1',
        email: 'reader@example.com',
      },
      donationId: 'donation-1',
    });
    expect(mockSendPaystackSubscriptionManageEmail).toHaveBeenCalledWith('SUB_123');
  });

  it('returns a friendly unavailable status when no active subscription is found', async () => {
    mockGetUserActivePaystackSubscriptionById.mockResolvedValue(null);

    const response = await POST(
      createMockRequest({
        url: 'https://1manrevolution.com/api/donations/paystack/manage-email',
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://1manrevolution.com/library?subscription=manage-unavailable');
    expect(mockSendPaystackSubscriptionManageEmail).not.toHaveBeenCalled();
  });

  it('redirects back with a failure flag when emailing the link fails', async () => {
    mockSendPaystackSubscriptionManageEmail.mockRejectedValue(new Error('Paystack is unavailable'));

    const response = await POST(
      createMockRequest({
        url: 'https://1manrevolution.com/api/donations/paystack/manage-email',
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://1manrevolution.com/library?subscription=manage-email-failed');
  });
});
