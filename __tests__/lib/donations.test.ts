import {
  formatDonationGatewayLabel,
  formatCurrencyAmount,
  getGatewayCheckoutCurrency,
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
});