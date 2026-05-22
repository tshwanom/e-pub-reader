import { createHmac } from 'crypto';
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
const PAYPAL_DONATION_PRODUCT_ID = process.env.PAYPAL_DONATION_PRODUCT_ID?.trim() || null;
const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID?.trim() || null;

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_API_BASE = 'https://api.paystack.co';

const EXPLICIT_PUBLIC_URL_ENV_KEYS = [
  'APP_URL',
  'SITE_URL',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_APP_URL',
] as const;

let payPalDonationProductIdPromise: Promise<string> | null = null;

type PayPalLink = {
  href?: string;
  rel?: string;
  method?: string;
};

export type PayPalCaptureResponse = {
  status?: string;
  payer?: {
    email_address?: string;
  };
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

export type PayPalSubscriptionResponse = {
  id?: string;
  status?: string;
  links?: PayPalLink[];
  subscriber?: {
    email_address?: string;
  };
  billing_info?: {
    last_payment?: {
      amount?: {
        currency_code?: string;
        value?: string;
      };
    };
  };
  plan?: {
    billing_cycles?: Array<{
      tenure_type?: string;
      pricing_scheme?: {
        fixed_price?: {
          currency_code?: string;
          value?: string;
        };
      };
    }>;
  };
};

type PaystackMetadata = Record<string, unknown> & {
  donationId?: string;
};

type PaystackCustomerDetails = {
  email?: string;
  customer_code?: string;
};

type PaystackPlanReference = string | {
  plan_code?: string;
  amount?: number;
  interval?: string;
};

type PaystackSubscriptionReference = string | {
  subscription_code?: string;
  email_token?: string;
  status?: string;
  customer?: PaystackCustomerDetails;
  plan?: PaystackPlanReference;
};

export type PaystackVerificationResponse = {
  status?: boolean;
  message?: string;
  data?: {
    status?: string;
    amount?: number;
    currency?: string;
    reference?: string;
    email?: string;
    metadata?: PaystackMetadata | null;
    customer?: PaystackCustomerDetails;
    plan?: PaystackPlanReference;
    subscription?: PaystackSubscriptionReference;
  };
};

export type PaystackWebhookEvent = {
  event?: string;
  data?: {
    status?: string;
    amount?: number;
    currency?: string;
    reference?: string;
    email?: string;
    customer_code?: string;
    subscription_code?: string;
    email_token?: string;
    paid?: boolean | number;
    metadata?: PaystackMetadata | null;
    customer?: PaystackCustomerDetails;
    plan?: PaystackPlanReference;
    subscription?: PaystackSubscriptionReference;
  };
};

export type PayPalWebhookEvent = {
  id?: string;
  event_type?: string;
  summary?: string;
  resource?: {
    id?: string;
    status?: string;
    custom_id?: string;
    billing_agreement_id?: string;
    email_address?: string;
    payer_email?: string;
    subscriber?: {
      email_address?: string;
    };
    payer?: {
      email_address?: string;
    };
  };
};

function assertPaystackConfigured() {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error('Paystack secret key is not configured. Add PAYSTACK_SECRET_KEY to continue.');
  }

  return PAYSTACK_SECRET_KEY;
}

function assertPayPalWebhookConfigured() {
  if (!PAYPAL_WEBHOOK_ID) {
    throw new Error('PayPal webhook ID is not configured. Add PAYPAL_WEBHOOK_ID to continue.');
  }

  return PAYPAL_WEBHOOK_ID;
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

function buildPayPalRequestId(prefix: string) {
  const randomPart = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `omr-${prefix}-${randomPart}`;
}

function getPayPalApprovalUrl(links?: PayPalLink[]) {
  return links?.find((link) => link.rel === 'approve')?.href || null;
}

function normalizePayPalMoneyValue(value?: string | null) {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return value?.trim() || null;
  }

  return roundMoney(parsedValue).toFixed(2);
}

function normalizeDonorEmail(email?: string | null) {
  const normalizedEmail = email?.trim().toLowerCase();
  return normalizedEmail || null;
}

function getPaystackSubscriptionDetails(value?: PaystackSubscriptionReference | null) {
  if (!value || typeof value === 'string') {
    return null;
  }

  return value;
}

function getHeaderValue(headers: Headers, name: string) {
  return headers.get(name)?.trim() || null;
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

export function isPayPalSubscriptionId(value?: string | null) {
  const normalizedValue = value?.trim();
  return Boolean(normalizedValue && normalizedValue.startsWith('I-'));
}

export function getPayPalDonorEmail(
  payload?: PayPalCaptureResponse | PayPalSubscriptionResponse | PayPalWebhookEvent | null
) {
  if (!payload) {
    return null;
  }

  return normalizeDonorEmail(
    ('subscriber' in payload ? payload.subscriber?.email_address : undefined)
    || ('payer' in payload ? payload.payer?.email_address : undefined)
    || ('resource' in payload ? payload.resource?.subscriber?.email_address : undefined)
    || ('resource' in payload ? payload.resource?.payer?.email_address : undefined)
    || ('resource' in payload ? payload.resource?.email_address : undefined)
    || ('resource' in payload ? payload.resource?.payer_email : undefined)
  );
}

export function getPaystackMetadataDonationId(metadata?: PaystackMetadata | null) {
  const donationId = typeof metadata?.donationId === 'string'
    ? metadata.donationId.trim()
    : '';

  return donationId || null;
}

export function getPaystackPlanCode(value?: PaystackPlanReference | null) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value.trim() || null;
  }

  return value.plan_code?.trim() || null;
}

export function getPaystackSubscriptionCode(value?: PaystackSubscriptionReference | null) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value.trim() || null;
  }

  return value.subscription_code?.trim() || null;
}

export function getPaystackCustomerCode(customer?: PaystackCustomerDetails | null) {
  return customer?.customer_code?.trim() || null;
}

export function getPaystackDonorEmail(
  payload?: PaystackVerificationResponse | PaystackWebhookEvent | null
) {
  if (!payload) {
    return null;
  }

  const subscriptionCustomer = getPaystackSubscriptionDetails(payload.data?.subscription)?.customer;

  return normalizeDonorEmail(
    payload.data?.customer?.email
    || payload.data?.email
    || subscriptionCustomer?.email
  );
}

export async function verifyPayPalWebhookSignature({
  eventBody,
  headers,
}: {
  eventBody: string;
  headers: Headers;
}) {
  const webhookId = assertPayPalWebhookConfigured();
  const transmissionId = getHeaderValue(headers, 'paypal-transmission-id');
  const transmissionTime = getHeaderValue(headers, 'paypal-transmission-time');
  const certUrl = getHeaderValue(headers, 'paypal-cert-url');
  const authAlgo = getHeaderValue(headers, 'paypal-auth-algo');
  const transmissionSig = getHeaderValue(headers, 'paypal-transmission-sig');

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    throw new Error('PayPal webhook verification headers are incomplete.');
  }

  const accessToken = await getPayPalAccessToken();
  const verificationBody = [
    '{',
    `"transmission_id":${JSON.stringify(transmissionId)},`,
    `"transmission_time":${JSON.stringify(transmissionTime)},`,
    `"cert_url":${JSON.stringify(certUrl)},`,
    `"auth_algo":${JSON.stringify(authAlgo)},`,
    `"transmission_sig":${JSON.stringify(transmissionSig)},`,
    `"webhook_id":${JSON.stringify(webhookId)},`,
    `"webhook_event":${eventBody}`,
    '}',
  ].join('');

  const response = await fetch(`${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: verificationBody,
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message || 'Failed to verify the PayPal webhook signature.');
  }

  return payload?.verification_status === 'SUCCESS';
}

export function verifyPaystackWebhookSignature({
  eventBody,
  headers,
}: {
  eventBody: string;
  headers: Headers;
}) {
  const secretKey = assertPaystackConfigured();
  const signature = getHeaderValue(headers, 'x-paystack-signature');

  if (!signature) {
    return false;
  }

  const expectedSignature = createHmac('sha512', secretKey)
    .update(eventBody)
    .digest('hex');

  return signature.toLowerCase() === expectedSignature.toLowerCase();
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

async function createPayPalDonationProduct() {
  const accessToken = await getPayPalAccessToken();

  const response = await fetch(`${PAYPAL_API_BASE}/v1/catalogs/products`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'PayPal-Request-Id': buildPayPalRequestId('product'),
    },
    body: JSON.stringify({
      name: 'One Man Revolution Donor Support',
      description: 'Recurring donor support for the One Man Revolution library.',
      type: 'SERVICE',
      category: 'SOFTWARE',
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || 'Failed to create the PayPal donation product.');
  }

  if (!data?.id) {
    throw new Error('PayPal donation product id missing from response.');
  }

  return data.id as string;
}

async function getPayPalDonationProductId() {
  if (PAYPAL_DONATION_PRODUCT_ID) {
    return PAYPAL_DONATION_PRODUCT_ID;
  }

  if (!payPalDonationProductIdPromise) {
    payPalDonationProductIdPromise = createPayPalDonationProduct().catch((error) => {
      payPalDonationProductIdPromise = null;
      throw error;
    });
  }

  return payPalDonationProductIdPromise;
}

async function createPayPalSubscriptionPlan({
  amount,
  description,
}: {
  amount: number;
  description: string;
}) {
  const accessToken = await getPayPalAccessToken();
  const productId = await getPayPalDonationProductId();
  const normalizedAmount = roundMoney(amount).toFixed(2);

  const response = await fetch(`${PAYPAL_API_BASE}/v1/billing/plans`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'PayPal-Request-Id': buildPayPalRequestId('plan'),
    },
    body: JSON.stringify({
      product_id: productId,
      name: `One Man Revolution Monthly Support · ${DONATION_BASE_CURRENCY} ${normalizedAmount}`,
      description,
      status: 'ACTIVE',
      billing_cycles: [
        {
          frequency: {
            interval_unit: 'MONTH',
            interval_count: 1,
          },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: {
              value: normalizedAmount,
              currency_code: DONATION_BASE_CURRENCY,
            },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        payment_failure_threshold: 3,
      },
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || 'Failed to create the PayPal subscription plan.');
  }

  if (!data?.id) {
    throw new Error('PayPal subscription plan id missing from response.');
  }

  return data.id as string;
}

export async function createPayPalSubscription({
  amount,
  description,
  returnUrl,
  cancelUrl,
  customId,
  subscriberEmail,
}: {
  amount: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  customId?: string;
  subscriberEmail?: string;
}) {
  const accessToken = await getPayPalAccessToken();
  const planId = await createPayPalSubscriptionPlan({
    amount,
    description,
  });

  const response = await fetch(`${PAYPAL_API_BASE}/v1/billing/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'PayPal-Request-Id': buildPayPalRequestId('subscription'),
    },
    body: JSON.stringify({
      plan_id: planId,
      custom_id: customId,
      ...(subscriberEmail
        ? {
            subscriber: {
              email_address: subscriberEmail,
            },
          }
        : {}),
      application_context: {
        brand_name: 'One Man Revolution',
        locale: 'en-US',
        user_action: 'SUBSCRIBE_NOW',
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || 'Failed to create the PayPal subscription.');
  }

  const approvalUrl = getPayPalApprovalUrl(data?.links);

  if (!data?.id || !approvalUrl) {
    throw new Error('PayPal subscription approval URL missing from response.');
  }

  return {
    subscriptionId: data.id as string,
    planId,
    approvalUrl,
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

export async function getPayPalSubscription(subscriptionId: string) {
  const accessToken = await getPayPalAccessToken();

  const response = await fetch(`${PAYPAL_API_BASE}/v1/billing/subscriptions/${subscriptionId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message || 'Failed to fetch the PayPal subscription.');
  }

  return payload as PayPalSubscriptionResponse;
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

export async function createPaystackPlan({
  amount,
  name,
  description,
  interval = 'monthly',
  invoiceLimit,
}: {
  amount: number;
  name: string;
  description?: string;
  interval?: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'biannually' | 'annually';
  invoiceLimit?: number;
}) {
  const secretKey = assertPaystackConfigured();

  const response = await fetch(`${PAYSTACK_API_BASE}/plan`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      interval,
      amount: toPaystackMinorUnits(amount),
      ...(description ? { description } : {}),
      ...(typeof invoiceLimit === 'number' ? { invoice_limit: invoiceLimit } : {}),
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.status) {
    throw new Error(payload?.message || 'Failed to create the Paystack subscription plan.');
  }

  const planCode = payload?.data?.plan_code;

  if (!planCode) {
    throw new Error('Paystack plan code missing from response.');
  }

  return {
    planCode: planCode as string,
  };
}

export async function getPaystackSubscriptionManageLink(subscriptionCode: string) {
  const secretKey = assertPaystackConfigured();

  const response = await fetch(`${PAYSTACK_API_BASE}/subscription/${encodeURIComponent(subscriptionCode)}/manage/link`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.status) {
    throw new Error(payload?.message || 'Failed to generate the Paystack subscription management link.');
  }

  const manageLink = payload?.data?.link;

  if (!manageLink) {
    throw new Error('Paystack subscription management link missing from response.');
  }

  return manageLink as string;
}

export async function sendPaystackSubscriptionManageEmail(subscriptionCode: string) {
  const secretKey = assertPaystackConfigured();

  const response = await fetch(`${PAYSTACK_API_BASE}/subscription/${encodeURIComponent(subscriptionCode)}/manage/email`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      Accept: 'application/json',
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.status) {
    throw new Error(payload?.message || 'Failed to email the Paystack subscription management link.');
  }

  return {
    message: (payload?.message as string | undefined) || 'Email successfully sent',
  };
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

function getPayPalSubscriptionAmount(subscriptionData: PayPalSubscriptionResponse) {
  const lastPaymentAmount = subscriptionData.billing_info?.last_payment?.amount;
  const regularBillingCycle = subscriptionData.plan?.billing_cycles?.find(
    (billingCycle) => billingCycle?.tenure_type === 'REGULAR'
  );
  const fallbackBillingCycle = subscriptionData.plan?.billing_cycles?.[0];
  const amount = lastPaymentAmount
    || regularBillingCycle?.pricing_scheme?.fixed_price
    || fallbackBillingCycle?.pricing_scheme?.fixed_price;

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
    normalizePayPalMoneyValue(resolvedAmount.value) === expectedValue &&
    resolvedAmount.currency === normalizeDonationCurrency(expectedCurrency)
  );
}

export function isSuccessfulPayPalSubscription({
  subscriptionData,
  expectedAmount,
  expectedCurrency,
}: {
  subscriptionData: PayPalSubscriptionResponse;
  expectedAmount: number;
  expectedCurrency: string;
}) {
  if (subscriptionData.status !== 'ACTIVE') {
    return false;
  }

  const expectedValue = roundMoney(expectedAmount).toFixed(2);
  const resolvedAmount = getPayPalSubscriptionAmount(subscriptionData);

  return (
    normalizePayPalMoneyValue(resolvedAmount.value) === expectedValue &&
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
  planCode,
  metadata,
}: {
  amount: number;
  email: string;
  reference: string;
  description: string;
  callbackUrl: string;
  planCode?: string;
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
      ...(planCode ? { plan: planCode } : {}),
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