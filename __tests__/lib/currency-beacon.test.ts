describe('CurrencyBeacon conversions', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.CURRENCYBEACON_API_KEY;

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;

    if (typeof originalApiKey === 'string') {
      process.env.CURRENCYBEACON_API_KEY = originalApiKey;
    } else {
      delete process.env.CURRENCYBEACON_API_KEY;
    }
  });

  it('skips the network when no conversion is needed', async () => {
    process.env.CURRENCYBEACON_API_KEY = 'test-key';
    global.fetch = jest.fn() as jest.Mock;

    const { convertCurrencyAmount } = await import('@/lib/currency-beacon');

    await expect(
      convertCurrencyAmount({ amount: 10.239, from: 'usd', to: 'USD' })
    ).resolves.toBe(10.24);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('parses conversion results from the CurrencyBeacon payload', async () => {
    process.env.CURRENCYBEACON_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 18.245 }),
    } as Response) as jest.Mock;

    const { convertCurrencyAmount } = await import('@/lib/currency-beacon');

    await expect(
      convertCurrencyAmount({ amount: 1, from: 'USD', to: 'ZAR' })
    ).resolves.toBe(18.25);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('api.currencybeacon.com/convert'),
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('throws a clear error when the api key is missing', async () => {
    delete process.env.CURRENCYBEACON_API_KEY;

    const { convertCurrencyAmount } = await import('@/lib/currency-beacon');

    await expect(
      convertCurrencyAmount({ amount: 1, from: 'USD', to: 'ZAR' })
    ).rejects.toThrow('CurrencyBeacon API key is not configured');
  });
});