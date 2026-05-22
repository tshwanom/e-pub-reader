import {
  DONATION_BASE_CURRENCY,
  PAYSTACK_CHECKOUT_CURRENCY,
  isSupportedDonationCurrency,
  normalizeDonationCurrency,
  roundMoney,
} from '@/lib/donations';

const CURRENCYBEACON_API_BASE = 'https://api.currencybeacon.com';
const CURRENCYBEACON_API_KEY = process.env.CURRENCYBEACON_API_KEY;
const CURRENCYBEACON_API_VERSIONED_BASE = `${CURRENCYBEACON_API_BASE}/v1/`;

function assertCurrencyBeaconConfigured() {
  if (!CURRENCYBEACON_API_KEY) {
    throw new Error('CurrencyBeacon API key is not configured. Add CURRENCYBEACON_API_KEY to continue.');
  }

  return CURRENCYBEACON_API_KEY;
}

function extractConversionResult(payload: any) {
  return Number(
    payload?.result ??
      payload?.response?.result ??
      payload?.data?.result ??
      payload?.value
  );
}

export async function convertCurrencyAmount({
  amount,
  from,
  to,
}: {
  amount: number;
  from: string;
  to: string;
}) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Conversion amount must be greater than zero.');
  }

  const normalizedFrom = normalizeDonationCurrency(from);
  const normalizedTo = normalizeDonationCurrency(to);

  if (!isSupportedDonationCurrency(normalizedFrom) || !isSupportedDonationCurrency(normalizedTo)) {
    throw new Error(`Unsupported currency conversion: ${normalizedFrom} -> ${normalizedTo}.`);
  }

  if (normalizedFrom === normalizedTo) {
    return roundMoney(amount);
  }

  const apiKey = assertCurrencyBeaconConfigured();

  const url = new URL('convert', CURRENCYBEACON_API_VERSIONED_BASE);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('from', normalizedFrom);
  url.searchParams.set('to', normalizedTo);
  url.searchParams.set('amount', amount.toString());

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null);
  const result = extractConversionResult(payload);

  if (!response.ok || !Number.isFinite(result)) {
    throw new Error(
      payload?.message ||
        `Currency conversion failed for ${normalizedFrom} -> ${normalizedTo}.`
    );
  }

  return roundMoney(result);
}

export function convertDonationAmountToBaseCurrency(amount: number, donorCurrency: string) {
  return convertCurrencyAmount({
    amount,
    from: donorCurrency,
    to: DONATION_BASE_CURRENCY,
  });
}

export function convertBaseCurrencyToPaystack(amount: number) {
  return convertCurrencyAmount({
    amount,
    from: DONATION_BASE_CURRENCY,
    to: PAYSTACK_CHECKOUT_CURRENCY,
  });
}