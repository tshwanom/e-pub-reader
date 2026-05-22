import {
  DONATION_PRESET_BASE_AMOUNTS,
  DONATION_BASE_CURRENCY,
  getGatewayCheckoutCurrency,
  isSupportedDonationCurrency,
  normalizeDonationCurrency,
  roundMoney,
  type DonationPresetOptions,
  type DonationGateway,
  type DonationQuoteSummary,
} from '@/lib/donations';
import {
  convertBaseCurrencyToDonationCurrency,
  convertBaseCurrencyToPaystack,
  convertDonationAmountToBaseCurrency,
} from '@/lib/currency-beacon';

export async function createDonationPresetOptions({
  donorCurrency,
}: {
  donorCurrency: string;
}): Promise<DonationPresetOptions> {
  const normalizedDonorCurrency = normalizeDonationCurrency(donorCurrency);

  if (!isSupportedDonationCurrency(normalizedDonorCurrency)) {
    throw new Error(`Unsupported donation currency: ${normalizedDonorCurrency}`);
  }

  const suggestedAmounts = normalizedDonorCurrency === DONATION_BASE_CURRENCY
    ? [...DONATION_PRESET_BASE_AMOUNTS]
    : await Promise.all(
        DONATION_PRESET_BASE_AMOUNTS.map((amount) =>
          convertBaseCurrencyToDonationCurrency(amount, normalizedDonorCurrency)
        )
      );

  return {
    donorCurrency: normalizedDonorCurrency,
    baseCurrency: DONATION_BASE_CURRENCY,
    baseSuggestedAmounts: [...DONATION_PRESET_BASE_AMOUNTS],
    suggestedAmounts: suggestedAmounts.map((amount) => roundMoney(amount)),
    defaultAmount: roundMoney(suggestedAmounts[1] ?? suggestedAmounts[0] ?? DONATION_PRESET_BASE_AMOUNTS[1]),
  };
}

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