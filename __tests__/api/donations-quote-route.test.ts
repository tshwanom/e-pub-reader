/** @jest-environment node */

import { GET } from '@/app/api/donations/quote/route';
import { createDonationQuote } from '@/lib/donation-quote';

jest.mock('@/lib/donation-quote', () => ({
  createDonationQuote: jest.fn(),
}));

const mockCreateDonationQuote = createDonationQuote as jest.MockedFunction<typeof createDonationQuote>;

describe('donation quote route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a live quote for valid requests', async () => {
    mockCreateDonationQuote.mockResolvedValue({
      donorAmount: 100,
      donorCurrency: 'ZAR',
      baseAmount: 5.43,
      baseCurrency: 'USD',
      gatewayAmount: 100,
      gatewayCurrency: 'ZAR',
      gateway: 'PAYSTACK',
    });

    const response = await GET(new Request('http://localhost/api/donations/quote?amount=100&currency=ZAR&gateway=PAYSTACK'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      donorAmount: 100,
      donorCurrency: 'ZAR',
      baseAmount: 5.43,
      gatewayAmount: 100,
      gatewayCurrency: 'ZAR',
      gateway: 'PAYSTACK',
      quotedAt: expect.any(String),
    });
    expect(mockCreateDonationQuote).toHaveBeenCalledWith({
      amount: 100,
      donorCurrency: 'ZAR',
      gateway: 'PAYSTACK',
    });
  });

  it('rejects unsupported currencies before conversion starts', async () => {
    const response = await GET(new Request('http://localhost/api/donations/quote?amount=100&currency=ZZZ&gateway=PAYPAL'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Unsupported donation currency: ZZZ',
    });
    expect(mockCreateDonationQuote).not.toHaveBeenCalled();
  });
});