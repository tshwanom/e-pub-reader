import {
  DONATION_PRESET_BASE_AMOUNTS,
  detectDonationCurrencyFromLocale,
  formatDonationFrequencyLabel,
  formatDonationGatewayLabel,
  formatCurrencyAmount,
  getDefaultDonationAmount,
  getGatewayCheckoutCurrency,
  getSuggestedDonationAmounts,
  isDonationFrequency,
  isSupportedDonationCurrency,
  normalizeDonationCurrency,
  roundMoney,
} from '@/lib/donations';

describe('donation helpers', () => {
  it('normalizes donation currencies and recognizes supported ISO codes', () => {
    expect(normalizeDonationCurrency('zar')).toBe('ZAR');
    expect(normalizeDonationCurrency(undefined)).toBe('USD');
    expect(isSupportedDonationCurrency('usd')).toBe(true);
    expect(isSupportedDonationCurrency('ZAR')).toBe(true);
    expect(isSupportedDonationCurrency('ZZZ')).toBe(false);
    expect(detectDonationCurrencyFromLocale(['en-ZA', 'en-US'])).toBe('ZAR');
    expect(detectDonationCurrencyFromLocale('de-DE')).toBe('EUR');
    expect(detectDonationCurrencyFromLocale(undefined)).toBe('USD');
  });

  it('maps each gateway to its checkout currency', () => {
    expect(getGatewayCheckoutCurrency('PAYPAL')).toBe('USD');
    expect(getGatewayCheckoutCurrency('PAYSTACK')).toBe('ZAR');
    expect(formatDonationGatewayLabel('PAYPAL')).toBe('PayPal');
    expect(formatDonationGatewayLabel('PAYSTACK')).toBe('Paystack');
    expect(isDonationFrequency('ONE_TIME')).toBe(true);
    expect(isDonationFrequency('MONTHLY')).toBe(true);
    expect(isDonationFrequency('YEARLY')).toBe(false);
    expect(formatDonationFrequencyLabel('MONTHLY')).toBe('Monthly');
  });

  it('rounds and formats canonical USD values consistently', () => {
    expect(roundMoney(10.235)).toBe(10.24);
    expect(formatCurrencyAmount(25, 'USD')).toContain('$');
  });

  it('returns the canonical USD donation tiers and defaults', () => {
    expect(DONATION_PRESET_BASE_AMOUNTS).toEqual([5, 10, 25, 50]);
    expect(getSuggestedDonationAmounts('USD')).toEqual([5, 10, 25, 50]);
    expect(getSuggestedDonationAmounts('zar')).toEqual([5, 10, 25, 50]);
    expect(getDefaultDonationAmount('USD')).toBe(10);
    expect(getDefaultDonationAmount('ZAR')).toBe(10);
  });
});