/** @jest-environment node */

import { POST } from '@/app/api/donations/paystack/webhook/route';
import {
  getPaystackDonorEmail,
  verifyPaystackWebhookSignature,
} from '@/lib/donation-payments';
import { prisma } from '@/lib/prisma';

jest.mock('@/lib/donation-payments', () => {
  const actual = jest.requireActual('@/lib/donation-payments');

  return {
    ...actual,
    getPaystackDonorEmail: jest.fn(),
    verifyPaystackWebhookSignature: jest.fn(),
  };
});

jest.mock('@/lib/prisma', () => ({
  prisma: {
    donation: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const DONATION_SELECT = {
  id: true,
  status: true,
  donorEmail: true,
  paystackReference: true,
  paystackPlanCode: true,
  paystackSubscriptionCode: true,
  paystackCustomerCode: true,
} as const;

const mockVerifyPaystackWebhookSignature = verifyPaystackWebhookSignature as jest.MockedFunction<typeof verifyPaystackWebhookSignature>;
const mockGetPaystackDonorEmail = getPaystackDonorEmail as jest.MockedFunction<typeof getPaystackDonorEmail>;
const mockFindDonation = prisma.donation.findFirst as jest.MockedFunction<any>;
const mockUpdateDonation = prisma.donation.update as jest.MockedFunction<any>;

describe('Paystack donation webhook route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyPaystackWebhookSignature.mockReturnValue(true);
    mockGetPaystackDonorEmail.mockReturnValue('reader@example.com');
    mockUpdateDonation.mockResolvedValue({
      id: 'donation-1',
      status: 'COMPLETED',
      donorEmail: 'reader@example.com',
      paystackReference: 'omr-don-ref',
      paystackPlanCode: 'PLN_123',
      paystackSubscriptionCode: 'SUB_123',
      paystackCustomerCode: 'CUS_123',
    });
  });

  it('binds a recurring Paystack subscription to the donation when the subscription is created', async () => {
    mockFindDonation
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'donation-1',
        status: 'PENDING',
        donorEmail: null,
        paystackReference: 'omr-don-ref',
        paystackPlanCode: 'PLN_123',
        paystackSubscriptionCode: null,
        paystackCustomerCode: null,
      });

    const response = await POST(
      new Request('http://localhost/api/donations/paystack/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'subscription.create',
          data: {
            status: 'active',
            subscription_code: 'SUB_123',
            customer: {
              email: 'reader@example.com',
              customer_code: 'CUS_123',
            },
            plan: {
              plan_code: 'PLN_123',
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

    expect(mockVerifyPaystackWebhookSignature).toHaveBeenCalled();
    expect(mockFindDonation).toHaveBeenNthCalledWith(1, {
      where: {
        gateway: 'PAYSTACK',
        paystackSubscriptionCode: 'SUB_123',
      },
      select: DONATION_SELECT,
    });
    expect(mockFindDonation).toHaveBeenNthCalledWith(2, {
      where: {
        gateway: 'PAYSTACK',
        paystackPlanCode: 'PLN_123',
      },
      select: DONATION_SELECT,
    });
    expect(mockUpdateDonation).toHaveBeenCalledWith({
      where: { id: 'donation-1' },
      data: {
        status: 'COMPLETED',
        paystackSubscriptionCode: 'SUB_123',
        paystackCustomerCode: 'CUS_123',
        donorEmail: 'reader@example.com',
      },
      select: DONATION_SELECT,
    });
  });

  it('revokes recurring donor status when Paystack disables the subscription', async () => {
    mockFindDonation.mockResolvedValue({
      id: 'donation-1',
      status: 'COMPLETED',
      donorEmail: 'reader@example.com',
      paystackReference: 'omr-don-ref',
      paystackPlanCode: 'PLN_123',
      paystackSubscriptionCode: 'SUB_123',
      paystackCustomerCode: 'CUS_123',
    });
    mockUpdateDonation.mockResolvedValue({
      id: 'donation-1',
      status: 'FAILED',
      donorEmail: 'reader@example.com',
      paystackReference: 'omr-don-ref',
      paystackPlanCode: 'PLN_123',
      paystackSubscriptionCode: 'SUB_123',
      paystackCustomerCode: 'CUS_123',
    });

    const response = await POST(
      new Request('http://localhost/api/donations/paystack/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'subscription.disable',
          data: {
            status: 'cancelled',
            subscription_code: 'SUB_123',
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
      select: DONATION_SELECT,
    });
  });

  it('rejects webhook deliveries that fail Paystack signature verification', async () => {
    mockVerifyPaystackWebhookSignature.mockReturnValue(false);

    const response = await POST(
      new Request('http://localhost/api/donations/paystack/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'subscription.create',
          data: {
            subscription_code: 'SUB_123',
          },
        }),
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid Paystack webhook signature.',
    });
    expect(mockFindDonation).not.toHaveBeenCalled();
    expect(mockUpdateDonation).not.toHaveBeenCalled();
  });

  it('ignores unrelated Paystack webhook events without touching donations', async () => {
    const response = await POST(
      new Request('http://localhost/api/donations/paystack/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'transfer.success',
          data: {
            reference: 'TRF_123',
          },
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      ignored: true,
    });
    expect(mockVerifyPaystackWebhookSignature).not.toHaveBeenCalled();
    expect(mockFindDonation).not.toHaveBeenCalled();
    expect(mockUpdateDonation).not.toHaveBeenCalled();
  });
});
