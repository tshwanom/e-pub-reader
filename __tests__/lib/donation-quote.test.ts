import { createDonationQuote } from '@/lib/donation-quote';
import {
  convertBaseCurrencyToPaystack,
  convertDonationAmountToBaseCurrency,
} from '@/lib/currency-beacon';

jest.mock('@/lib/currency-beacon', () => ({
  convertDonationAmountToBaseCurrency: jest.fn(),
  convertBaseCurrencyToPaystack: jest.fn(),
}));

const mockConvertDonationAmountToBaseCurrency = convertDonationAmountToBaseCurrency as jest.MockedFunction<typeof convertDonationAmountToBaseCurrency>;
const mockConvertBaseCurrencyToPaystack = convertBaseCurrencyToPaystack as jest.MockedFunction<typeof convertBaseCurrencyToPaystack>;

describe('createDonationQuote', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps PayPal USD donations in the base currency without extra conversion', async () => {
    await expect(
      createDonationQuote({
        amount: 10,
        donorCurrency: 'usd',
        gateway: 'PAYPAL',
      })
    ).resolves.toEqual({
      donorAmount: 10,
      donorCurrency: 'USD',
      baseAmount: 10,
      baseCurrency: 'USD',
      gatewayAmount: 10,
      gatewayCurrency: 'USD',
      gateway: 'PAYPAL',
    });

    expect(mockConvertDonationAmountToBaseCurrency).not.toHaveBeenCalled();
    expect(mockConvertBaseCurrencyToPaystack).not.toHaveBeenCalled();
  });

  it('keeps the entered ZAR amount for Paystack while still normalizing records to USD', async () => {
    mockConvertDonationAmountToBaseCurrency.mockResolvedValue(2.75);

    await expect(
      createDonationQuote({
        amount: 50,
        donorCurrency: 'ZAR',
        gateway: 'PAYSTACK',
      })
    ).resolves.toEqual({
      donorAmount: 50,
      donorCurrency: 'ZAR',
      baseAmount: 2.75,
      baseCurrency: 'USD',
      gatewayAmount: 50,
      gatewayCurrency: 'ZAR',
      gateway: 'PAYSTACK',
    });

    expect(mockConvertDonationAmountToBaseCurrency).toHaveBeenCalledWith(50, 'ZAR');
    expect(mockConvertBaseCurrencyToPaystack).not.toHaveBeenCalled();
  });

  it('converts non-ZAR Paystack donations through the USD base amount', async () => {
    mockConvertDonationAmountToBaseCurrency.mockResolvedValue(10);
    mockConvertBaseCurrencyToPaystack.mockResolvedValue(182.5);

    await expect(
      createDonationQuote({
        amount: 9,
        donorCurrency: 'EUR',
        gateway: 'PAYSTACK',
      })
    ).resolves.toEqual({
      donorAmount: 9,
      donorCurrency: 'EUR',
      baseAmount: 10,
      baseCurrency: 'USD',
      gatewayAmount: 182.5,
      gatewayCurrency: 'ZAR',
      gateway: 'PAYSTACK',
    });

    expect(mockConvertDonationAmountToBaseCurrency).toHaveBeenCalledWith(9, 'EUR');
    expect(mockConvertBaseCurrencyToPaystack).toHaveBeenCalledWith(10);
  });
});