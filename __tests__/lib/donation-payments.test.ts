import {
  buildPaystackReference,
  buildDonationDestination,
  getPayPalDonorEmail,
  isPayPalSubscriptionId,
  isSuccessfulPayPalCapture,
  isSuccessfulPayPalSubscription,
  isSuccessfulPaystackVerification,
  resolvePublicAppOrigin,
  toPaystackMinorUnits,
  type PayPalCaptureResponse,
  type PayPalSubscriptionResponse,
  type PaystackVerificationResponse,
} from '@/lib/donation-payments';

const PUBLIC_URL_ENV_KEYS = [
  'APP_URL',
  'SITE_URL',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_APP_URL',
  'NEXTAUTH_URL',
] as const;

const originalPublicUrlEnv = Object.fromEntries(
  PUBLIC_URL_ENV_KEYS.map((key) => [key, process.env[key]])
) as Record<(typeof PUBLIC_URL_ENV_KEYS)[number], string | undefined>;

function createMockRequest(url: string, headers?: Record<string, string>) {
  return {
    url,
    nextUrl: new URL(url),
    headers: new Headers(headers),
  } as Parameters<typeof resolvePublicAppOrigin>[0];
}

describe('donation payment helpers', () => {
  afterEach(() => {
    for (const key of PUBLIC_URL_ENV_KEYS) {
      const originalValue = originalPublicUrlEnv[key];

      if (typeof originalValue === 'undefined') {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
    }
  });

  it('builds a Paystack reference using only supported characters', () => {
    const reference = buildPaystackReference();

    expect(reference).toMatch(/^[-.=A-Za-z0-9]+$/);
    expect(reference).not.toContain('_');
    expect(reference).toContain('omr-don-');
  });

  it('detects PayPal subscription identifiers and extracts donor email addresses', () => {
    expect(isPayPalSubscriptionId('I-SUBSCRIPTION-123')).toBe(true);
    expect(isPayPalSubscriptionId('ORDER-123')).toBe(false);

    expect(
      getPayPalDonorEmail({
        payer: {
          email_address: 'Reader@Example.com',
        },
      })
    ).toBe('reader@example.com');

    expect(
      getPayPalDonorEmail({
        resource: {
          subscriber: {
            email_address: 'Subscriber@example.com',
          },
        },
      })
    ).toBe('subscriber@example.com');
  });

  it('converts Paystack amounts into minor currency units', () => {
    expect(toPaystackMinorUnits(18.245)).toBe(1825);
    expect(toPaystackMinorUnits(18.2)).toBe(1820);
  });

  it('prefers the forwarded production origin over localhost config', () => {
    process.env.NEXTAUTH_URL = 'http://localhost:3001';

    const request = createMockRequest('http://localhost:3001/api/donations', {
      host: 'localhost:3001',
      'x-forwarded-host': '1manrevolution.com',
      'x-forwarded-proto': 'https',
      'x-forwarded-port': '3001',
    });

    expect(resolvePublicAppOrigin(request)).toBe('https://1manrevolution.com');
    expect(buildDonationDestination(request, 'book-123', 'success').toString()).toBe(
      'https://1manrevolution.com/books/book-123?donation=success'
    );
  });

  it('uses an explicit app url when the request only exposes localhost', () => {
    process.env.APP_URL = 'https://1manrevolution.com';
    process.env.NEXTAUTH_URL = 'http://localhost:3001';

    const request = createMockRequest('http://localhost:3001/api/donations');

    expect(resolvePublicAppOrigin(request)).toBe('https://1manrevolution.com');
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

  it('validates an active PayPal subscription against the stored recurring amount', () => {
    const subscriptionData: PayPalSubscriptionResponse = {
      status: 'ACTIVE',
      plan: {
        billing_cycles: [
          {
            tenure_type: 'REGULAR',
            pricing_scheme: {
              fixed_price: {
                currency_code: 'USD',
                value: '10',
              },
            },
          },
        ],
      },
    };

    expect(
      isSuccessfulPayPalSubscription({
        subscriptionData,
        expectedAmount: 10,
        expectedCurrency: 'USD',
      })
    ).toBe(true);

    expect(
      isSuccessfulPayPalSubscription({
        subscriptionData: {
          ...subscriptionData,
          status: 'APPROVAL_PENDING',
        },
        expectedAmount: 10,
        expectedCurrency: 'USD',
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