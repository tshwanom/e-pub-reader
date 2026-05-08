import {
  buildPaystackReference,
  isSuccessfulPayPalCapture,
  isSuccessfulPaystackVerification,
  toPaystackMinorUnits,
  type PayPalCaptureResponse,
  type PaystackVerificationResponse,
} from '@/lib/donation-payments';

describe('donation payment helpers', () => {
  it('builds a Paystack reference using only supported characters', () => {
    const reference = buildPaystackReference();

    expect(reference).toMatch(/^[-.=A-Za-z0-9]+$/);
    expect(reference).not.toContain('_');
    expect(reference).toContain('omr-don-');
  });

  it('converts Paystack amounts into minor currency units', () => {
    expect(toPaystackMinorUnits(18.245)).toBe(1825);
    expect(toPaystackMinorUnits(18.2)).toBe(1820);
  });

  it('validates a completed PayPal capture against the stored donation amount', () => {
    const captureData: PayPalCaptureResponse = {
      status: 'COMPLETED',
      purchase_units: [
        {
          payments: {
            captures: [
              {
                status: 'COMPLETED',
                amount: {
                  currency_code: 'USD',
                  value: '10.00',
                },
              },
            ],
          },
        },
      ],
    };

    expect(
      isSuccessfulPayPalCapture({
        captureData,
        expectedAmount: 10,
        expectedCurrency: 'USD',
      })
    ).toBe(true);

    expect(
      isSuccessfulPayPalCapture({
        captureData,
        expectedAmount: 10,
        expectedCurrency: 'ZAR',
      })
    ).toBe(false);
  });

  it('requires matching amount, currency, and reference for Paystack verification', () => {
    const verification: PaystackVerificationResponse = {
      status: true,
      data: {
        status: 'success',
        amount: 1825,
        currency: 'ZAR',
        reference: 'omr-don-test-123',
      },
    };

    expect(
      isSuccessfulPaystackVerification({
        verification,
        expectedAmountMinor: 1825,
        expectedCurrency: 'ZAR',
        expectedReference: 'omr-don-test-123',
      })
    ).toBe(true);

    expect(
      isSuccessfulPaystackVerification({
        verification,
        expectedAmountMinor: 1826,
        expectedCurrency: 'ZAR',
        expectedReference: 'omr-don-test-123',
      })
    ).toBe(false);

    expect(
      isSuccessfulPaystackVerification({
        verification,
        expectedAmountMinor: 1825,
        expectedCurrency: 'USD',
        expectedReference: 'omr-don-test-123',
      })
    ).toBe(false);

    expect(
      isSuccessfulPaystackVerification({
        verification,
        expectedAmountMinor: 1825,
        expectedCurrency: 'ZAR',
        expectedReference: 'omr-don-other-456',
      })
    ).toBe(false);
  });
});