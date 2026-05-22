/** @jest-environment node */

import { POST } from '@/app/api/donations/paypal/webhook/route';
import {
  getPayPalDonorEmail,
  isPayPalSubscriptionId,
  verifyPayPalWebhookSignature,
} from '@/lib/donation-payments';
import { prisma } from '@/lib/prisma';

jest.mock('@/lib/donation-payments', () => ({
  getPayPalDonorEmail: jest.fn(),
  isPayPalSubscriptionId: jest.fn((value?: string | null) => Boolean(value?.startsWith('I-'))),
  verifyPayPalWebhookSignature: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    donation: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mockVerifyPayPalWebhookSignature = verifyPayPalWebhookSignature as jest.MockedFunction<typeof verifyPayPalWebhookSignature>;
const mockGetPayPalDonorEmail = getPayPalDonorEmail as jest.MockedFunction<typeof getPayPalDonorEmail>;
const mockIsPayPalSubscriptionId = isPayPalSubscriptionId as jest.MockedFunction<typeof isPayPalSubscriptionId>;
const mockFindDonation = prisma.donation.findFirst as jest.MockedFunction<any>;
const mockUpdateDonation = prisma.donation.update as jest.MockedFunction<any>;

describe('PayPal donation webhook route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyPayPalWebhookSignature.mockResolvedValue(true);
    mockGetPayPalDonorEmail.mockReturnValue('reader@example.com');
    mockFindDonation.mockResolvedValue({
      id: 'donation-1',
      status: 'PENDING',
      paypalId: 'I-SUBSCRIPTION-1',
      donorEmail: null,
    });
    mockUpdateDonation.mockResolvedValue({
      id: 'donation-1',
      status: 'COMPLETED',
      paypalId: 'I-SUBSCRIPTION-1',
      donorEmail: 'reader@example.com',
    });
  });

  it('marks a recurring donation completed when PayPal activates the subscription', async () => {
    const response = await POST(
      new Request('http://localhost/api/donations/paypal/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'WH-1',
          event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
          resource: {
            id: 'I-SUBSCRIPTION-1',
            custom_id: 'donation-1',
            status: 'ACTIVE',
            subscriber: {
              email_address: 'reader@example.com',
            },
          },
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      received: true,
      processed: true,
      donationId: 'donation-1',
      status: 'COMPLETED',
    });

    expect(mockVerifyPayPalWebhookSignature).toHaveBeenCalled();
    expect(mockFindDonation).toHaveBeenCalledWith({
      where: {
        gateway: 'PAYPAL',
        OR: [
          { id: 'donation-1' },
          { paypalId: 'I-SUBSCRIPTION-1' },
        ],
      },
      select: {
        id: true,
        status: true,
        paypalId: true,
        donorEmail: true,
      },
    });
    expect(mockUpdateDonation).toHaveBeenCalledWith({
      where: { id: 'donation-1' },
      data: {
        status: 'COMPLETED',
        donorEmail: 'reader@example.com',
      },
      select: {
        id: true,
        status: true,
        paypalId: true,
        donorEmail: true,
      },
    });
  });

  it('revokes recurring donor status when PayPal reports a cancellation', async () => {
    mockFindDonation.mockResolvedValue({
      id: 'donation-1',
      status: 'COMPLETED',
      paypalId: 'I-SUBSCRIPTION-1',
      donorEmail: 'reader@example.com',
    });
    mockUpdateDonation.mockResolvedValue({
      id: 'donation-1',
      status: 'FAILED',
      paypalId: 'I-SUBSCRIPTION-1',
      donorEmail: 'reader@example.com',
    });

    const response = await POST(
      new Request('http://localhost/api/donations/paypal/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'WH-2',
          event_type: 'BILLING.SUBSCRIPTION.CANCELLED',
          resource: {
            id: 'I-SUBSCRIPTION-1',
            status: 'CANCELLED',
          },
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      received: true,
      processed: true,
      donationId: 'donation-1',
      status: 'FAILED',
    });
    expect(mockUpdateDonation).toHaveBeenCalledWith({
      where: { id: 'donation-1' },
      data: {
        status: 'FAILED',
      },
      select: {
        id: true,
        status: true,
        paypalId: true,
        donorEmail: true,
      },
    });
  });

  it('rejects webhook deliveries that fail PayPal signature verification', async () => {
    mockVerifyPayPalWebhookSignature.mockResolvedValue(false);

    const response = await POST(
      new Request('http://localhost/api/donations/paypal/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'WH-3',
          event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
          resource: {
            id: 'I-SUBSCRIPTION-1',
          },
        }),
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid PayPal webhook signature.',
    });
    expect(mockFindDonation).not.toHaveBeenCalled();
    expect(mockUpdateDonation).not.toHaveBeenCalled();
  });

  it('ignores unrelated PayPal webhook events without touching donations', async () => {
    const response = await POST(
      new Request('http://localhost/api/donations/paypal/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'WH-4',
          event_type: 'CHECKOUT.ORDER.APPROVED',
          resource: {
            id: 'ORDER-1',
          },
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      ignored: true,
    });
    expect(mockVerifyPayPalWebhookSignature).not.toHaveBeenCalled();
    expect(mockFindDonation).not.toHaveBeenCalled();
    expect(mockUpdateDonation).not.toHaveBeenCalled();
    expect(mockIsPayPalSubscriptionId).not.toHaveBeenCalled();
  });
});
