import {
  DONATION_BASE_CURRENCY,
  getGatewayCheckoutCurrency,
  isSupportedDonationCurrency,
  normalizeDonationCurrency,
  roundMoney,
  type DonationGateway,
  type DonationQuoteSummary,
} from '@/lib/donations';
import {
  convertBaseCurrencyToPaystack,
  convertDonationAmountToBaseCurrency,
} from '@/lib/currency-beacon';

export async function createDonationQuote({
  amount,
  donorCurrency,
  gateway,
}: {
  amount: number;
  donorCurrency: string;
  gateway: DonationGateway;
}): Promise<DonationQuoteSummary> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid amount');
  }

  const normalizedDonorCurrency = normalizeDonationCurrency(donorCurrency);

  if (!isSupportedDonationCurrency(normalizedDonorCurrency)) {
    throw new Error(`Unsupported donation currency: ${normalizedDonorCurrency}`);
  }

  const donorAmount = roundMoney(amount);
  const baseAmount = normalizedDonorCurrency === DONATION_BASE_CURRENCY
    ? donorAmount
    : await convertDonationAmountToBaseCurrency(donorAmount, normalizedDonorCurrency);
  const gatewayCurrency = getGatewayCheckoutCurrency(gateway);
  const gatewayAmount = gatewayCurrency === normalizedDonorCurrency
    ? donorAmount
    : gateway === 'PAYSTACK'
      ? await convertBaseCurrencyToPaystack(baseAmount)
      : baseAmount;

  return {
    donorAmount,
    donorCurrency: normalizedDonorCurrency,
    baseAmount,
    baseCurrency: DONATION_BASE_CURRENCY,
    gatewayAmount,
    gatewayCurrency,
    gateway,
  };
}