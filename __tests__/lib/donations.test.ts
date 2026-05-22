import {
  detectDonationCurrencyFromLocale,
  formatDonationGatewayLabel,
  formatCurrencyAmount,
  getDefaultDonationAmount,
  getGatewayCheckoutCurrency,
  getSuggestedDonationAmounts,
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
  });

  it('rounds and formats canonical USD values consistently', () => {
    expect(roundMoney(10.235)).toBe(10.24);
    expect(formatCurrencyAmount(25, 'USD')).toContain('$');
  });

  it('returns currency-aware donation presets and defaults', () => {
    expect(getSuggestedDonationAmounts('USD')).toEqual([5, 10, 25, 50]);
    expect(getSuggestedDonationAmounts('zar')).toEqual([50, 100, 250, 500]);
    expect(getDefaultDonationAmount('USD')).toBe(10);
    expect(getDefaultDonationAmount('ZAR')).toBe(100);
  });
});