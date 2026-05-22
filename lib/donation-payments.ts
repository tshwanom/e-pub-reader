import type { NextRequest } from 'next/server';
import {
  DONATION_BASE_CURRENCY,
  PAYSTACK_CHECKOUT_CURRENCY,
  normalizeDonationCurrency,
  roundMoney,
} from '@/lib/donations';

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';
const PAYPAL_API_BASE =
  PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_API_BASE = 'https://api.paystack.co';

const EXPLICIT_PUBLIC_URL_ENV_KEYS = [
  'APP_URL',
  'SITE_URL',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_APP_URL',
] as const;

export type PayPalCaptureResponse = {
  status?: string;
  purchase_units?: Array<{
    amount?: {
      currency_code?: string;
      value?: string;
    };
    payments?: {
      captures?: Array<{
        status?: string;
        amount?: {
          currency_code?: string;
          value?: string;
        };
      }>;
    };
  }>;
};

export type PaystackVerificationResponse = {
  status?: boolean;
  message?: string;
  data?: {
    status?: string;
    amount?: number;
    currency?: string;
    reference?: string;
  };
};

function assertPaystackConfigured() {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error('Paystack secret key is not configured. Add PAYSTACK_SECRET_KEY to continue.');
  }

  return PAYSTACK_SECRET_KEY;
}

function toOrigin(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

function getPrimaryHeaderValue(value: string | null) {
  return value?.split(',')[0]?.trim() || null;
}

function isLocalHostname(hostname: string) {
  const normalizedHostname = hostname.toLowerCase();

  return (
    normalizedHostname === 'localhost' ||
    normalizedHostname === '127.0.0.1' ||
    normalizedHostname === '0.0.0.0' ||
    normalizedHostname === '::1' ||
    normalizedHostname === '[::1]' ||
    normalizedHostname.endsWith('.localhost')
  );
}

function isLocalOrigin(origin: string) {
  try {
    return isLocalHostname(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function buildOriginFromRequestHeaders(request: NextRequest) {
  const forwardedHost = getPrimaryHeaderValue(request.headers.get('x-forwarded-host'));
  const host = forwardedHost || getPrimaryHeaderValue(request.headers.get('host'));

  if (!host) {
    return null;
  }

  const forwardedProto = getPrimaryHeaderValue(request.headers.get('x-forwarded-proto'));
  const forwardedPort = getPrimaryHeaderValue(request.headers.get('x-forwarded-port'));
  const requestProtocol = request.nextUrl.protocol.replace(/:$/, '') || 'https';
  const protocol = forwardedProto || requestProtocol;
  const isUsingForwardedHost = Boolean(forwardedHost);

  let normalizedHost = host;
  const hasExplicitPort = normalizedHost.startsWith('[')
    ? normalizedHost.includes(']:')
    : normalizedHost.split(':').length > 1;

  if (
    !isUsingForwardedHost &&
    !hasExplicitPort &&
    forwardedPort &&
    forwardedPort !== '80' &&
    forwardedPort !== '443'
  ) {
    normalizedHost = `${normalizedHost}:${forwardedPort}`;
  }

  return toOrigin(`${protocol}://${normalizedHost}`);
}

export function resolvePublicAppOrigin(request: NextRequest) {
  const explicitEnvOrigins = EXPLICIT_PUBLIC_URL_ENV_KEYS
    .map((key) => toOrigin(process.env[key]))
    .filter((origin): origin is string => Boolean(origin));
  const headerOrigin = buildOriginFromRequestHeaders(request);
  const requestOrigin = toOrigin(request.nextUrl.origin) || toOrigin(request.url);
  const nextAuthOrigin = toOrigin(process.env.NEXTAUTH_URL);

  const candidates = [
    ...explicitEnvOrigins,
    headerOrigin,
    requestOrigin,
    nextAuthOrigin,
  ].filter((origin): origin is string => Boolean(origin));

  return candidates.find((origin) => !isLocalOrigin(origin)) || candidates[0] || request.nextUrl.origin;
}

export function buildDonationDestination(
  request: NextRequest,
  bookId?: string | null,
  status: 'success' | 'failed' = 'success'
) {
  const pathname = bookId ? `/books/${bookId}` : '/library';
  return new URL(`${pathname}?donation=${status}`, resolvePublicAppOrigin(request));
}

export async function getPayPalAccessToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error('PayPal credentials are not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to continue.');
  }

  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');

  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error('Failed to authenticate with PayPal.');
  }

  const data = await response.json();

  if (!data?.access_token) {
    throw new Error('PayPal access token missing from authentication response.');
  }

  return data.access_token as string;
}

export async function createPayPalOrder({
  amount,
  description,
  returnUrl,
  cancelUrl,
}: {
  amount: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
}) {
  const accessToken = await getPayPalAccessToken();

  const orderResponse = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code: DONATION_BASE_CURRENCY,
            value: roundMoney(amount).toFixed(2),
          },
          description,
        },
      ],
      application_context: {
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    }),
  });

  const orderData = await orderResponse.json();

  if (!orderResponse.ok) {
    throw new Error(orderData?.message || 'Failed to create PayPal order.');
  }

  const approvalUrl = orderData?.links?.find((link: any) => link.rel === 'approve')?.href;

  if (!orderData?.id || !approvalUrl) {
    throw new Error('PayPal approval URL missing from response.');
  }

  return {
    orderId: orderData.id as string,
    approvalUrl: approvalUrl as string,
  };
}

export async function capturePayPalOrder(orderId: string) {
  const accessToken = await getPayPalAccessToken();

  const captureResponse = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const captureData = await captureResponse.json();

  if (!captureResponse.ok) {
    throw new Error(captureData?.message || 'Failed to capture PayPal order.');
  }

  return captureData as PayPalCaptureResponse;
}

export function buildPaystackReference() {
  const timestamp = Date.now().toString(36);
  const uniqueSuffix = globalThis.crypto?.randomUUID?.()
    ?.replace(/-/g, '')
    .slice(0, 12)
    .toLowerCase() || Math.random().toString(36).slice(2, 14);

  return `omr-don-${timestamp}-${uniqueSuffix}`;
}

export function toPaystackMinorUnits(amount: number) {
  return Math.round(roundMoney(amount) * 100);
}

function getCompletedPayPalAmount(captureData: PayPalCaptureResponse) {
  const completedCapture = captureData.purchase_units?.[0]?.payments?.captures?.find(
    (capture) => capture?.status === 'COMPLETED'
  );
  const fallbackCapture = captureData.purchase_units?.[0]?.payments?.captures?.[0];
  const amount = completedCapture?.amount || fallbackCapture?.amount || captureData.purchase_units?.[0]?.amount;

  return {
    currency: normalizeDonationCurrency(amount?.currency_code),
    value: amount?.value,
  };
}

export function isSuccessfulPayPalCapture({
  captureData,
  expectedAmount,
  expectedCurrency,
}: {
  captureData: PayPalCaptureResponse;
  expectedAmount: number;
  expectedCurrency: string;
}) {
  if (captureData.status !== 'COMPLETED') {
    return false;
  }

  const expectedValue = roundMoney(expectedAmount).toFixed(2);
  const resolvedAmount = getCompletedPayPalAmount(captureData);

  return (
    resolvedAmount.value === expectedValue &&
    resolvedAmount.currency === normalizeDonationCurrency(expectedCurrency)
  );
}

export function isSuccessfulPaystackVerification({
  verification,
  expectedAmountMinor,
  expectedCurrency,
  expectedReference,
}: {
  verification: PaystackVerificationResponse;
  expectedAmountMinor: number;
  expectedCurrency: string;
  expectedReference: string;
}) {
  return Boolean(
    verification.status &&
      verification.data?.status === 'success' &&
      verification.data?.amount === expectedAmountMinor &&
      normalizeDonationCurrency(verification.data?.currency) === normalizeDonationCurrency(expectedCurrency) &&
      verification.data?.reference === expectedReference
  );
}

export async function initializePaystackTransaction({
  amount,
  email,
  reference,
  description,
  callbackUrl,
  metadata,
}: {
  amount: number;
  email: string;
  reference: string;
  description: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}) {
  const secretKey = assertPaystackConfigured();

  const response = await fetch(`${PAYSTACK_API_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount: toPaystackMinorUnits(amount),
      currency: PAYSTACK_CHECKOUT_CURRENCY,
      callback_url: callbackUrl,
      reference,
      metadata: {
        description,
        ...metadata,
      },
    }),
  });

  const payload = await response.json();

  if (!response.ok || !payload?.status) {
    throw new Error(payload?.message || 'Failed to initialize Paystack transaction.');
  }

  const authorizationUrl = payload?.data?.authorization_url;
  const resolvedReference = payload?.data?.reference ?? reference;

  if (!authorizationUrl) {
    throw new Error('Paystack authorization URL missing from response.');
  }

  return {
    authorizationUrl: authorizationUrl as string,
    reference: resolvedReference as string,
  };
}

export async function verifyPaystackTransaction(reference: string) {
  const secretKey = assertPaystackConfigured();

  const response = await fetch(`${PAYSTACK_API_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.message || 'Failed to verify Paystack transaction.');
  }

  return payload as PaystackVerificationResponse;
}