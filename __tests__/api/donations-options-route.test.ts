/** @jest-environment node */

import { GET } from '@/app/api/donations/options/route';
import { createDonationPresetOptions } from '@/lib/donation-quote';

jest.mock('@/lib/donation-quote', () => ({
  createDonationPresetOptions: jest.fn(),
}));

const mockCreateDonationPresetOptions = createDonationPresetOptions as jest.MockedFunction<typeof createDonationPresetOptions>;

describe('donation options route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns live converted donation presets for valid requests', async () => {
    mockCreateDonationPresetOptions.mockResolvedValue({
      donorCurrency: 'ZAR',
      baseCurrency: 'USD',
      baseSuggestedAmounts: [5, 10, 25, 50],
      suggestedAmounts: [91.25, 182.5, 456.25, 912.5],
      defaultAmount: 182.5,
    });

    const response = await GET(new Request('http://localhost/api/donations/options?currency=ZAR'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      donorCurrency: 'ZAR',
      baseCurrency: 'USD',
      baseSuggestedAmounts: [5, 10, 25, 50],
      suggestedAmounts: [91.25, 182.5, 456.25, 912.5],
      defaultAmount: 182.5,
      quotedAt: expect.any(String),
    });
    expect(mockCreateDonationPresetOptions).toHaveBeenCalledWith({
      donorCurrency: 'ZAR',
    });
  });

  it('rejects unsupported currencies before preset conversion begins', async () => {
    const response = await GET(new Request('http://localhost/api/donations/options?currency=ZZZ'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Unsupported donation currency: ZZZ',
    });
    expect(mockCreateDonationPresetOptions).not.toHaveBeenCalled();
  });
});
