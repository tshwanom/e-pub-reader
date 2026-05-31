/** @jest-environment node */

import { POST } from '@/app/api/donations/route';
import { createDonationQuote } from '@/lib/donation-quote';
import {
  createPaystackPlan,
  createPayPalOrder,
  createPayPalSubscription,
  initializePaystackTransaction,
  resolvePublicAppOrigin,
} from '@/lib/donation-payments';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}));

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('@/lib/donation-quote', () => ({
  createDonationQuote: jest.fn(),
}));

jest.mock('@/lib/donation-payments', () => ({
  buildPaystackReference: jest.fn(() => 'omr-don-test-reference'),
  createPaystackPlan: jest.fn(),
  createPayPalOrder: jest.fn(),
  createPayPalSubscription: jest.fn(),
  initializePaystackTransaction: jest.fn(),
  resolvePublicAppOrigin: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    book: {
      findUnique: jest.fn(),
    },
    donation: {
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockCreateDonationQuote = createDonationQuote as jest.MockedFunction<typeof createDonationQuote>;
const mockCreatePaystackPlan = createPaystackPlan as jest.MockedFunction<typeof createPaystackPlan>;
const mockCreatePayPalOrder = createPayPalOrder as jest.MockedFunction<typeof createPayPalOrder>;
const mockCreatePayPalSubscription = createPayPalSubscription as jest.MockedFunction<typeof createPayPalSubscription>;
const mockInitializePaystackTransaction = initializePaystackTransaction as jest.MockedFunction<typeof initializePaystackTransaction>;
const mockResolvePublicAppOrigin = resolvePublicAppOrigin as jest.MockedFunction<typeof resolvePublicAppOrigin>;
const mockFindBook = prisma.book.findUnique as jest.MockedFunction<any>;
const mockCreateDonation = prisma.donation.create as jest.MockedFunction<any>;
const mockUpdateDonation = prisma.donation.update as jest.MockedFunction<any>;

describe('donations route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'reader@example.com',
        role: 'READER',
      },
    } as any);
    mockFindBook.mockResolvedValue({
      id: 'book-1',
      title: 'Test Book',
      donorOnly: false,
      donorAccessLevel: 'PUBLIC',
      status: 'PUBLISHED',
    });
    mockCreateDonationQuote.mockResolvedValue({
      donorAmount: 182.5,
      donorCurrency: 'ZAR',
      baseAmount: 10,
      baseCurrency: 'USD',
      gatewayAmount: 10,
      gatewayCurrency: 'USD',
      gateway: 'PAYPAL',
    });
    mockResolvePublicAppOrigin.mockReturnValue('https://1manrevolution.com');
    mockCreateDonation.mockResolvedValue({ id: 'donation-1' });
    mockUpdateDonation.mockResolvedValue({ id: 'donation-1' });
    mockCreatePaystackPlan.mockResolvedValue({
      planCode: 'PLN-PLAN-1',
    });
    mockCreatePayPalOrder.mockResolvedValue({
      orderId: 'PAYPAL-ORDER-1',
      approvalUrl: 'https://paypal.example.com/order/PAYPAL-ORDER-1',
    });
    mockCreatePayPalSubscription.mockResolvedValue({
      subscriptionId: 'I-SUBSCRIPTION-1',
      planId: 'P-PLAN-1',
      approvalUrl: 'https://paypal.example.com/subscription/I-SUBSCRIPTION-1',
    });
    mockInitializePaystackTransaction.mockResolvedValue({
      authorizationUrl: 'https://paystack.example.com/checkout',
      reference: 'omr-don-test-reference',
    });
  });

  it('creates a pending donation and starts a monthly Paystack subscription checkout', async () => {
    mockCreateDonationQuote.mockResolvedValue({
      donorAmount: 182.5,
      donorCurrency: 'ZAR',
      baseAmount: 10,
      baseCurrency: 'USD',
      gatewayAmount: 182.5,
      gatewayCurrency: 'ZAR',
      gateway: 'PAYSTACK',
    });

    const response = await POST(
      new Request('http://localhost/api/donations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: 'book-1',
          amount: 182.5,
          currency: 'ZAR',
          gateway: 'PAYSTACK',
          frequency: 'MONTHLY',
          donorEmail: 'reader@example.com',
        }),
      }) as any
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      checkoutUrl: 'https://paystack.example.com/checkout',
      gateway: 'PAYSTACK',
      frequency: 'MONTHLY',
      baseAmount: 10,
      baseCurrency: 'USD',
      gatewayAmount: 182.5,
      gatewayCurrency: 'ZAR',
    });

    expect(mockCreateDonation).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        donorEmail: 'reader@example.com',
        bookId: 'book-1',
        amount: 10,
        currency: 'USD',
        donorAmount: 182.5,
        donorCurrency: 'ZAR',
        gateway: 'PAYSTACK',
        frequency: 'MONTHLY',
        gatewayAmount: 182.5,
        gatewayCurrency: 'ZAR',
        status: 'PENDING',
      },
      select: {
        id: true,
      },
    });

    expect(mockCreatePaystackPlan).toHaveBeenCalledWith({
      amount: 182.5,
      name: 'One Man Revolution Monthly Support · Test Book',
      description: 'Monthly support for “Test Book” · Donation donation-1',
    });

    expect(mockInitializePaystackTransaction).toHaveBeenCalledWith({
      amount: 182.5,
      email: 'reader@example.com',
      reference: 'omr-don-test-reference',
      description: 'Monthly support for “Test Book”',
      callbackUrl: 'https://1manrevolution.com/api/donations/paystack/callback?donationId=donation-1&frequency=MONTHLY',
      planCode: 'PLN-PLAN-1',
      metadata: {
        donationId: 'donation-1',
        bookId: 'book-1',
        donorAmount: '182.50',
        donorCurrency: 'ZAR',
        baseAmount: '10.00',
        baseCurrency: 'USD',
        frequency: 'MONTHLY',
        gateway: 'PAYSTACK',
        paystackPlanCode: 'PLN-PLAN-1',
      },
    });

    expect(mockUpdateDonation).toHaveBeenCalledWith({
      where: { id: 'donation-1' },
      data: {
        paystackReference: 'omr-don-test-reference',
        paystackPlanCode: 'PLN-PLAN-1',
      },
    });
  });

  it('creates a pending donation and starts a monthly PayPal subscription', async () => {
    const response = await POST(
      new Request('http://localhost/api/donations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: 'book-1',
          amount: 182.5,
          currency: 'ZAR',
          gateway: 'PAYPAL',
          frequency: 'MONTHLY',
        }),
      }) as any
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      checkoutUrl: 'https://paypal.example.com/subscription/I-SUBSCRIPTION-1',
      gateway: 'PAYPAL',
      frequency: 'MONTHLY',
      baseAmount: 10,
      baseCurrency: 'USD',
      gatewayAmount: 10,
      gatewayCurrency: 'USD',
    });

    expect(mockCreateDonation).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        donorEmail: 'reader@example.com',
        bookId: 'book-1',
        amount: 10,
        currency: 'USD',
        donorAmount: 182.5,
        donorCurrency: 'ZAR',
        gateway: 'PAYPAL',
        frequency: 'MONTHLY',
        gatewayAmount: 10,
        gatewayCurrency: 'USD',
        status: 'PENDING',
      },
      select: {
        id: true,
      },
    });

    expect(mockCreatePayPalSubscription).toHaveBeenCalledWith({
      amount: 10,
      description: 'Monthly support for “Test Book”',
      returnUrl: 'https://1manrevolution.com/api/donations/success?donationId=donation-1&frequency=MONTHLY',
      cancelUrl: 'https://1manrevolution.com/api/donations/cancel?donationId=donation-1&frequency=MONTHLY',
      customId: 'donation-1',
      subscriberEmail: 'reader@example.com',
    });

    expect(mockUpdateDonation).toHaveBeenCalledWith({
      where: { id: 'donation-1' },
      data: {
        paypalId: 'I-SUBSCRIPTION-1',
      },
    });
  });

  it('rejects one-time checkout attempts for recurring-donor books', async () => {
    mockFindBook.mockResolvedValueOnce({
      id: 'book-1',
      title: 'Recurring Support Edition',
      donorOnly: true,
      donorAccessLevel: 'RECURRING_DONORS',
      status: 'PUBLISHED',
    });

    const response = await POST(
      new Request('http://localhost/api/donations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: 'book-1',
          amount: 25,
          currency: 'USD',
          gateway: 'PAYPAL',
          frequency: 'ONE_TIME',
        }),
      }) as any
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'This book is reserved for recurring donors. Please choose monthly support to unlock it.',
    });
    expect(mockCreateDonation).not.toHaveBeenCalled();
  });

  it('requires an email address before starting unauthenticated recurring support checkouts', async () => {
    mockGetServerSession.mockResolvedValueOnce(null as any);
    mockFindBook.mockResolvedValueOnce({
      id: 'book-1',
      title: 'Recurring Support Edition',
      donorOnly: true,
      donorAccessLevel: 'RECURRING_DONORS',
      status: 'PUBLISHED',
    });

    const response = await POST(
      new Request('http://localhost/api/donations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: 'book-1',
          amount: 25,
          currency: 'USD',
          gateway: 'PAYPAL',
          frequency: 'MONTHLY',
        }),
      }) as any
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'An email address is required before guest checkout can begin.',
    });
    expect(mockCreateDonation).not.toHaveBeenCalled();
  });
});
