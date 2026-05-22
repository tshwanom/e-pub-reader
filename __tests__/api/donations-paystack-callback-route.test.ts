/** @jest-environment node */

import { GET } from '@/app/api/donations/paystack/callback/route';
import { verifyPaystackTransaction } from '@/lib/donation-payments';
import { prisma } from '@/lib/prisma';

jest.mock('@/lib/donation-payments', () => {
  const actual = jest.requireActual('@/lib/donation-payments');

  return {
    ...actual,
    verifyPaystackTransaction: jest.fn(),
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

const mockVerifyPaystackTransaction = verifyPaystackTransaction as jest.MockedFunction<typeof verifyPaystackTransaction>;
const mockFindDonation = prisma.donation.findFirst as jest.MockedFunction<any>;
const mockUpdateDonation = prisma.donation.update as jest.MockedFunction<any>;

function createMockRequest(url: string) {
  return {
    url,
    nextUrl: new URL(url),
    headers: new Headers(),
  } as Parameters<typeof GET>[0];
}

describe('Paystack donation callback route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindDonation.mockResolvedValue({
      id: 'donation-1',
      bookId: 'book-1',
      status: 'PENDING',
      gateway: 'PAYSTACK',
      frequency: 'MONTHLY',
      gatewayAmount: 182.5,
      gatewayCurrency: 'ZAR',
      donorEmail: null,
      paystackReference: 'omr-don-ref',
      paystackPlanCode: 'PLN_123',
      paystackSubscriptionCode: null,
      paystackCustomerCode: null,
    });
  });

  it('marks a recurring Paystack donation completed and stores the customer context after verification', async () => {
    mockVerifyPaystackTransaction.mockResolvedValue({
      status: true,
      data: {
        status: 'success',
        amount: 18250,
        currency: 'ZAR',
        reference: 'omr-don-ref',
        customer: {
          email: 'reader@example.com',
          customer_code: 'CUS_123',
        },
        plan: 'PLN_123',
      },
    });

    const response = await GET(
      createMockRequest('https://1manrevolution.com/api/donations/paystack/callback?donationId=donation-1&reference=omr-don-ref')
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://1manrevolution.com/books/book-1?donation=success');
    expect(mockVerifyPaystackTransaction).toHaveBeenCalledWith('omr-don-ref');
    expect(mockUpdateDonation).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'donation-1' },
      data: expect.objectContaining({
        status: 'COMPLETED',
        paystackReference: 'omr-don-ref',
        donorEmail: 'reader@example.com',
        paystackPlanCode: 'PLN_123',
        paystackCustomerCode: 'CUS_123',
      }),
    }));
  });

  it('marks the donation failed when Paystack verification does not match the stored checkout', async () => {
    mockVerifyPaystackTransaction.mockResolvedValue({
      status: true,
      data: {
        status: 'success',
        amount: 19000,
        currency: 'ZAR',
        reference: 'omr-don-ref',
      },
    });

    const response = await GET(
      createMockRequest('https://1manrevolution.com/api/donations/paystack/callback?donationId=donation-1&reference=omr-don-ref')
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://1manrevolution.com/books/book-1?donation=failed');
    expect(mockUpdateDonation).toHaveBeenCalledWith({
      where: { id: 'donation-1' },
      data: { status: 'FAILED' },
    });
  });
});
