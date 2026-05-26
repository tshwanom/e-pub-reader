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

const CURRENCY_FLAG_OVERRIDES = {
  AED: '🇦🇪',
  AUD: '🇦🇺',
  BWP: '🇧🇼',
  CAD: '🇨🇦',
  CHF: '🇨🇭',
  CNY: '🇨🇳',
  EUR: '🇪🇺',
  GBP: '🇬🇧',
  GHS: '🇬🇭',
  INR: '🇮🇳',
  JPY: '🇯🇵',
  KES: '🇰🇪',
  NAD: '🇳🇦',
  NGN: '🇳🇬',
  NZD: '🇳🇿',
  SAR: '🇸🇦',
  TZS: '🇹🇿',
  UGX: '🇺🇬',
  USD: '🇺🇸',
  ZAR: '🇿🇦',
} as const satisfies Partial<Record<string, string>>;

export const DONATION_PRESET_BASE_AMOUNTS = [5, 10, 25, 50] as const;

const LOCALE_REGION_TO_CURRENCY = {
  AE: 'AED',
  AT: 'EUR',
  AU: 'AUD',
  BE: 'EUR',
  BW: 'BWP',
  CA: 'CAD',
  CH: 'CHF',
  CN: 'CNY',
  CY: 'EUR',
  DE: 'EUR',
  EE: 'EUR',
  ES: 'EUR',
  FI: 'EUR',
  FR: 'EUR',
  GB: 'GBP',
  GH: 'GHS',
  GR: 'EUR',
  IE: 'EUR',
  IN: 'INR',
  IT: 'EUR',
  JP: 'JPY',
  KE: 'KES',
  LT: 'EUR',
  LU: 'EUR',
  LV: 'EUR',
  MT: 'EUR',
  NA: 'NAD',
  NG: 'NGN',
  NL: 'EUR',
  NZ: 'NZD',
  PT: 'EUR',
  SA: 'SAR',
  SI: 'EUR',
  SK: 'EUR',
  TZ: 'TZS',
  UG: 'UGX',
  US: 'USD',
  ZA: 'ZAR',
} as const satisfies Record<string, string>;

type IntlWithSupportedValuesOf = typeof Intl & {
  supportedValuesOf?: (key: string) => string[];
};

export const DONATION_BASE_CURRENCY = 'USD';
export const PAYSTACK_CHECKOUT_CURRENCY = 'ZAR';
export const DEFAULT_DONATION_CURRENCY = DONATION_BASE_CURRENCY;
export const DEFAULT_DONATION_GATEWAY = 'PAYPAL';
export const DEFAULT_DONATION_FREQUENCY = 'ONE_TIME';
export const POPULAR_DONATION_CURRENCIES = PRIORITY_CURRENCIES.slice(0, 10);

export type DonationGateway = 'PAYPAL' | 'PAYSTACK';
export type DonationFrequency = 'ONE_TIME' | 'MONTHLY';

export interface DonationCurrencyOption {
  code: string;
  name: string;
  territories: string[];
  territoryCodes: string[];
  flag: string;
}

export interface DonationQuoteSummary {
  donorAmount: number;
  donorCurrency: string;
  baseAmount: number;
  baseCurrency: string;
  gatewayAmount: number;
  gatewayCurrency: string;
  gateway: DonationGateway;
}

export interface DonationPresetOptions {
  donorCurrency: string;
  baseCurrency: string;
  baseSuggestedAmounts: number[];
  suggestedAmounts: number[];
  defaultAmount: number;
}

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

export const DONATION_FREQUENCY_OPTIONS = [
  {
    id: 'ONE_TIME',
    label: 'One-time',
    description: 'A single donation today.',
  },
  {
    id: 'MONTHLY',
    label: 'Monthly',
    description: 'Recurring monthly support through PayPal or Paystack.',
  },
] as const satisfies ReadonlyArray<{
  id: DonationFrequency;
  label: string;
  description: string;
}>;

function buildDonationCurrencyOptions() {
  const currencyDisplayNames = typeof Intl.DisplayNames !== 'undefined'
    ? new Intl.DisplayNames(['en'], { type: 'currency' })
    : null;
  const regionDisplayNames = typeof Intl.DisplayNames !== 'undefined'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;
  const supportedValuesOf = (Intl as IntlWithSupportedValuesOf).supportedValuesOf;
  const intlCurrencies = supportedValuesOf
    ? supportedValuesOf('currency').map((currency) => currency.toUpperCase())
    : [];
  const territoriesByCurrency = new Map<string, string[]>();
  const territoryCodesByCurrency = new Map<string, string[]>();

  Object.entries(LOCALE_REGION_TO_CURRENCY).forEach(([regionCode, currencyCode]) => {
    const territoryLabel = regionDisplayNames?.of(regionCode) ?? regionCode;
    const currentTerritories = territoriesByCurrency.get(currencyCode) ?? [];
    const currentTerritoryCodes = territoryCodesByCurrency.get(currencyCode) ?? [];

    if (!currentTerritories.includes(territoryLabel)) {
      currentTerritories.push(territoryLabel);
      currentTerritories.sort((left, right) => left.localeCompare(right));
      territoriesByCurrency.set(currencyCode, currentTerritories);
    }

    if (!currentTerritoryCodes.includes(regionCode)) {
      currentTerritoryCodes.push(regionCode);
      territoryCodesByCurrency.set(currencyCode, currentTerritoryCodes);
    }
  });

  const orderedCodes = Array.from(
    new Set([
      ...PRIORITY_CURRENCIES,
      ...intlCurrencies.sort((left, right) => left.localeCompare(right)),
    ])
  );

  return orderedCodes.map((code) => ({
    code,
    name: currencyDisplayNames?.of(code) ?? code,
    territories: territoriesByCurrency.get(code) ?? [],
    territoryCodes: territoryCodesByCurrency.get(code) ?? [],
    flag: CURRENCY_FLAG_OVERRIDES[code as keyof typeof CURRENCY_FLAG_OVERRIDES]
      ?? getFlagEmojiFromRegionCode(territoryCodesByCurrency.get(code)?.[0]),
  }));
}

function getFlagEmojiFromRegionCode(regionCode?: string) {
  const normalizedRegionCode = regionCode?.trim().toUpperCase();

  if (!normalizedRegionCode || !/^[A-Z]{2}$/.test(normalizedRegionCode)) {
    return '💱';
  }

  return String.fromCodePoint(
    ...normalizedRegionCode.split('').map((character) => 127397 + character.charCodeAt(0))
  );
}

export const DONATION_CURRENCY_OPTIONS = buildDonationCurrencyOptions();

const DONATION_CURRENCY_SET = new Set(
  DONATION_CURRENCY_OPTIONS.map((currency) => currency.code)
);

function getLocaleRegion(locale: string) {
  try {
    if (typeof Intl.Locale !== 'undefined') {
      const region = new Intl.Locale(locale).region?.toUpperCase();

      if (region) {
        return region;
      }
    }
  } catch {
    // Fall back to parsing the BCP 47 tag manually below.
  }

  const match = locale.match(/-([A-Za-z]{2})(?:-|$)/);
  return match?.[1]?.toUpperCase() ?? null;
}

export function normalizeDonationCurrency(currency?: string | null) {
  const normalized = currency?.trim().toUpperCase();
  return normalized || DONATION_BASE_CURRENCY;
}

export function detectDonationCurrencyFromLocale(locales?: string | ReadonlyArray<string> | null) {
  const localeList = typeof locales === 'string'
    ? [locales]
    : locales
      ? Array.from(locales).filter((locale): locale is string => Boolean(locale))
      : [];

  for (const locale of localeList) {
    const region = getLocaleRegion(locale);
    const candidate = region ? LOCALE_REGION_TO_CURRENCY[region as keyof typeof LOCALE_REGION_TO_CURRENCY] : null;

    if (candidate && DONATION_CURRENCY_SET.has(candidate)) {
      return candidate;
    }
  }

  return DEFAULT_DONATION_CURRENCY;
}

export function isDonationGateway(value?: string | null): value is DonationGateway {
  return value === 'PAYPAL' || value === 'PAYSTACK';
}

export function isDonationFrequency(value?: string | null): value is DonationFrequency {
  return value === 'ONE_TIME' || value === 'MONTHLY';
}

export function isSupportedDonationCurrency(currency?: string | null) {
  return DONATION_CURRENCY_SET.has(normalizeDonationCurrency(currency));
}

export function getSuggestedDonationAmounts(currency?: string | null) {
  return [...DONATION_PRESET_BASE_AMOUNTS];
}

export function getDefaultDonationAmount(currency?: string | null) {
  const suggestedAmounts = getSuggestedDonationAmounts(currency);
  return suggestedAmounts[1] ?? suggestedAmounts[0] ?? 10;
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

export function formatDonationFrequencyLabel(frequency?: string | null) {
  switch (frequency) {
    case 'MONTHLY':
      return 'Monthly';
    case 'ONE_TIME':
      return 'One-time';
    default:
      return frequency?.trim() || '';
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