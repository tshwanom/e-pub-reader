const PRIORITY_CURRENCIES = [
  'USD',
  'ZAR',
  'EUR',
  'GBP',
  'NGN',
  'KES',
  'GHS',
  'UGX',
  'TZS',
  'CAD',
  'AUD',
  'NZD',
  'CHF',
  'JPY',
  'CNY',
  'INR',
  'AED',
  'SAR',
  'BWP',
  'NAD',
] as const;

type IntlWithSupportedValuesOf = typeof Intl & {
  supportedValuesOf?: (key: string) => string[];
};

export const DONATION_BASE_CURRENCY = 'USD';
export const PAYSTACK_CHECKOUT_CURRENCY = 'ZAR';
export const DEFAULT_DONATION_CURRENCY = DONATION_BASE_CURRENCY;
export const DEFAULT_DONATION_GATEWAY = 'PAYPAL';

export type DonationGateway = 'PAYPAL' | 'PAYSTACK';

export const DONATION_GATEWAYS = [
  {
    id: 'PAYPAL',
    label: 'PayPal',
    description: 'PayPal checkout is created in USD after we normalize the donation amount.',
    checkoutCurrency: DONATION_BASE_CURRENCY,
  },
  {
    id: 'PAYSTACK',
    label: 'Paystack',
    description: 'Paystack checkout is created in ZAR after a live conversion from the system USD base.',
    checkoutCurrency: PAYSTACK_CHECKOUT_CURRENCY,
  },
] as const satisfies ReadonlyArray<{
  id: DonationGateway;
  label: string;
  description: string;
  checkoutCurrency: string;
}>;

function buildDonationCurrencyOptions() {
  const displayNames = typeof Intl.DisplayNames !== 'undefined'
    ? new Intl.DisplayNames(['en'], { type: 'currency' })
    : null;
  const supportedValuesOf = (Intl as IntlWithSupportedValuesOf).supportedValuesOf;
  const intlCurrencies = supportedValuesOf
    ? supportedValuesOf('currency').map((currency) => currency.toUpperCase())
    : [];

  const orderedCodes = Array.from(
    new Set([
      ...PRIORITY_CURRENCIES,
      ...intlCurrencies.sort((left, right) => left.localeCompare(right)),
    ])
  );

  return orderedCodes.map((code) => ({
    code,
    name: displayNames?.of(code) ?? code,
  }));
}

export const DONATION_CURRENCY_OPTIONS = buildDonationCurrencyOptions();

const DONATION_CURRENCY_SET = new Set(
  DONATION_CURRENCY_OPTIONS.map((currency) => currency.code)
);

export function normalizeDonationCurrency(currency?: string | null) {
  const normalized = currency?.trim().toUpperCase();
  return normalized || DONATION_BASE_CURRENCY;
}

export function isDonationGateway(value?: string | null): value is DonationGateway {
  return value === 'PAYPAL' || value === 'PAYSTACK';
}

export function isSupportedDonationCurrency(currency?: string | null) {
  return DONATION_CURRENCY_SET.has(normalizeDonationCurrency(currency));
}

export function getGatewayCheckoutCurrency(gateway: DonationGateway) {
  return gateway === 'PAYSTACK' ? PAYSTACK_CHECKOUT_CURRENCY : DONATION_BASE_CURRENCY;
}

export function formatDonationGatewayLabel(gateway?: string | null) {
  switch (gateway) {
    case 'PAYPAL':
      return 'PayPal';
    case 'PAYSTACK':
      return 'Paystack';
    default:
      return gateway?.trim() || '';
  }
}

export function roundMoney(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function formatCurrencyAmount(amount: number, currency: string, locale = 'en-US') {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: normalizeDonationCurrency(currency),
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${normalizeDonationCurrency(currency)} ${roundMoney(amount).toFixed(2)}`;
  }
}