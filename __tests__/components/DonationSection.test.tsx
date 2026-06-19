'use client';

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DonationSection from '@/components/DonationSection';

const originalLanguage = window.navigator.language;
const originalLanguages = window.navigator.languages;
const USD_PRESETS = [5, 10, 25, 50] as const;

function setNavigatorLanguage(language: string, languages: ReadonlyArray<string> = [language]) {
  Object.defineProperty(window.navigator, 'language', {
    configurable: true,
    value: language,
  });
  Object.defineProperty(window.navigator, 'languages', {
    configurable: true,
    value: Array.from(languages),
  });
}

function buildQuoteResponse({
  amount,
  currency,
  gateway,
}: {
  amount: number;
  currency: string;
  gateway: string;
}) {
  const baseAmount = currency === 'USD'
    ? amount
    : currency === 'ZAR'
      ? Number((amount / 18.25).toFixed(2))
      : 5.5;
  const gatewayCurrency = gateway === 'PAYSTACK' ? 'ZAR' : 'USD';
  const gatewayAmount = gateway === 'PAYSTACK'
    ? currency === 'ZAR'
      ? amount
      : Number((baseAmount * 18.25).toFixed(2))
    : baseAmount;

  return {
    donorAmount: amount,
    donorCurrency: currency,
    baseAmount,
    baseCurrency: 'USD',
    gatewayAmount,
    gatewayCurrency,
    gateway,
    quotedAt: '2026-05-21T12:00:00.000Z',
  };
}

function buildPresetOptionsResponse(currency: string) {
  const suggestedAmounts = currency === 'USD'
    ? [...USD_PRESETS]
    : currency === 'ZAR'
      ? USD_PRESETS.map((amount) => Number((amount * 18.25).toFixed(2)))
      : [...USD_PRESETS];

  return {
    donorCurrency: currency,
    baseCurrency: 'USD',
    baseSuggestedAmounts: [...USD_PRESETS],
    suggestedAmounts,
    defaultAmount: suggestedAmounts[1],
    quotedAt: '2026-05-21T12:00:00.000Z',
  };
}

async function chooseCurrencyWithSearch(user: ReturnType<typeof userEvent.setup>, searchTerm: string, optionName: RegExp) {
  await user.click(screen.getByLabelText(/Your currency/i));
  await user.type(screen.getByRole('combobox', { name: /Search currencies/i }), searchTerm);
  await user.click(await screen.findByRole('option', { name: optionName }));
}

async function openDonationModal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Support the work|Support to unlock/i }));

  await waitFor(() => {
    expect(screen.getByRole('dialog', { name: /Support “Test Book”/i })).toBeInTheDocument();
  });
}

describe('DonationSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    setNavigatorLanguage('en-US');

    global.fetch = jest.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (url.startsWith('/api/donations/quote')) {
        const parsedUrl = new URL(url, 'http://localhost');

        return {
          ok: true,
          json: async () => buildQuoteResponse({
            amount: Number(parsedUrl.searchParams.get('amount')),
            currency: parsedUrl.searchParams.get('currency') ?? 'USD',
            gateway: parsedUrl.searchParams.get('gateway') ?? 'PAYPAL',
          }),
        } as Response;
      }

      if (url.startsWith('/api/donations/options')) {
        const parsedUrl = new URL(url, 'http://localhost');

        return {
          ok: true,
          json: async () => buildPresetOptionsResponse(parsedUrl.searchParams.get('currency') ?? 'USD'),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({}),
      } as Response;
    }) as jest.Mock;
  });

  afterAll(() => {
    setNavigatorLanguage(originalLanguage, originalLanguages);
  });

  it('starts as a compact CTA and opens the donation flow in a modal', async () => {
    const user = userEvent.setup();

    const { container } = render(<DonationSection bookId="book-1" bookTitle="Test Book" />);

    expect(screen.getByRole('button', { name: /Support the work/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Amount in USD/i)).not.toBeInTheDocument();

    await openDonationModal(user);

    expect(screen.getByLabelText(/Amount in USD/i)).toBeInTheDocument();
    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
    expect(document.body.querySelector('[role="dialog"]')).toBeInTheDocument();
  });

  it('prefers the detected South African currency and requests a live quote immediately', async () => {
    const user = userEvent.setup();

    setNavigatorLanguage('en-ZA', ['en-ZA', 'en']);

    render(<DonationSection bookId="book-1" bookTitle="Test Book" />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await openDonationModal(user);

    await waitFor(() => {
      expect(screen.getByLabelText(/Your currency/i)).toHaveTextContent('ZAR');
      expect(screen.getByLabelText(/Your currency/i)).toHaveTextContent('🇿🇦');
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/donations/options?currency=ZAR'),
        expect.objectContaining({ cache: 'no-store' })
      );
    });

    expect(screen.getByLabelText(/Amount in ZAR/i)).toHaveValue(182.5);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/donations/quote?amount=182.5&currency=ZAR&gateway=PAYPAL'),
        expect.objectContaining({ cache: 'no-store' })
      );
    });
  });

  it('shows popular currencies and supports keyboard arrow selection in the picker', async () => {
    const user = userEvent.setup();

    render(<DonationSection bookId="book-1" bookTitle="Test Book" />);

    await openDonationModal(user);

    expect(screen.getByLabelText(/Your currency/i)).toHaveTextContent('🇺🇸');

    await user.click(screen.getByLabelText(/Your currency/i));

    expect(screen.getByText(/Popular currencies/i)).toBeInTheDocument();

    const searchInput = screen.getByRole('combobox', { name: /Search currencies/i });
    await user.type(searchInput, 'south africa');
    await user.keyboard('{ArrowDown}{Enter}');

    await waitFor(() => {
      expect(screen.getByLabelText(/Your currency/i)).toHaveTextContent('🇿🇦');
      expect(screen.getByLabelText(/Your currency/i)).toHaveTextContent('ZAR');
    });
  });

  it('lets the user search by country name and posts the selected currency in the checkout payload', async () => {
    const user = userEvent.setup();

    render(<DonationSection bookId="book-1" bookTitle="Test Book" />);

    await openDonationModal(user);

    await chooseCurrencyWithSearch(user, 'south africa', /ZAR/i);

    await waitFor(() => {
      expect(screen.getByLabelText(/Your currency/i)).toHaveTextContent('ZAR');
    });

    await user.type(screen.getByLabelText(/Your email address/i), 'reader@example.com');
    await user.click(screen.getByRole('button', { name: /Continue to PayPal/i }));

    const postCall = await waitFor(() => {
      const call = (global.fetch as jest.Mock).mock.calls.find(([, request]) => request?.method === 'POST');
      expect(call).toBeDefined();
      return call;
    });

    const request = postCall?.[1];
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(request.body)).toEqual({
      bookId: 'book-1',
      amount: 182.5,
      currency: 'ZAR',
      frequency: 'ONE_TIME',
      gateway: 'PAYPAL',
      donorEmail: 'reader@example.com',
    });
  });

  it('requires an email before starting a guest checkout', async () => {
    const user = userEvent.setup();

    render(<DonationSection bookId="book-1" bookTitle="Test Book" />);

    await openDonationModal(user);

    const continueButton = screen.getByRole('button', { name: /Continue to PayPal/i });

    expect(screen.getByLabelText(/Your email address/i)).toBeInTheDocument();
    expect(continueButton).toBeDisabled();
  });

  it('refreshes the live quote and includes the selected Paystack gateway and donor email in the request body', async () => {
    const user = userEvent.setup();

    render(<DonationSection bookId="book-1" bookTitle="Test Book" />);

    await openDonationModal(user);

    await chooseCurrencyWithSearch(user, 'south africa', /ZAR/i);
    await user.click(screen.getByRole('button', { name: /Paystack payment gateway/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/donations/quote?amount=182.5&currency=ZAR&gateway=PAYSTACK'),
        expect.objectContaining({ cache: 'no-store' })
      );
    });

    await user.type(screen.getByLabelText(/Your email address/i), 'reader@example.com');
    await user.clear(screen.getByLabelText(/Amount in ZAR/i));
    await user.type(screen.getByLabelText(/Amount in ZAR/i), '150');
    await user.click(screen.getByRole('button', { name: /Continue to Paystack/i }));

    const postCall = await waitFor(() => {
      const call = (global.fetch as jest.Mock).mock.calls.find(([, request]) => request?.method === 'POST');
      expect(call).toBeDefined();
      return call;
    });

    const request = postCall?.[1];
    expect(JSON.parse(request.body)).toEqual({
      bookId: 'book-1',
      amount: 150,
      currency: 'ZAR',
      frequency: 'ONE_TIME',
      gateway: 'PAYSTACK',
      donorEmail: 'reader@example.com',
    });
  });

  it('lets the donor switch to monthly support and keeps recurring checkout on PayPal', async () => {
    const user = userEvent.setup();

    render(<DonationSection bookId="book-1" bookTitle="Test Book" />);

    await openDonationModal(user);

    await user.click(screen.getByRole('button', { name: /Monthly support cadence/i }));

    expect(screen.getByText(/Monthly recurring support is available through both PayPal and Paystack/i)).toBeInTheDocument();

    const paystackGatewayButton = screen.getByRole('button', { name: /Paystack payment gateway/i });
    expect(paystackGatewayButton).toBeEnabled();

    await user.type(screen.getByLabelText(/Your email address/i), 'reader@example.com');
    await user.click(screen.getByRole('button', { name: /Start monthly support with PayPal/i }));

    const postCall = await waitFor(() => {
      const call = (global.fetch as jest.Mock).mock.calls.find(([, request]) => request?.method === 'POST');
      expect(call).toBeDefined();
      return call;
    });

    expect(JSON.parse(postCall?.[1].body)).toEqual({
      bookId: 'book-1',
      amount: 10,
      currency: 'USD',
      frequency: 'MONTHLY',
      gateway: 'PAYPAL',
      donorEmail: 'reader@example.com',
    });
  });

  it('supports a landing-page button trigger and omits bookId for general donations', async () => {
    const user = userEvent.setup();

    render(
      <DonationSection
        bookTitle="One Man Revolution"
        triggerVariant="button"
        triggerLabel="Support the Revolution"
        modalTitle="Support the Work"
      />
    );

    await user.click(screen.getByRole('button', { name: /Support the Revolution/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Support the Work/i })).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Your email address/i), 'reader@example.com');
    await user.click(screen.getByRole('button', { name: /Continue to PayPal/i }));

    const postCall = await waitFor(() => {
      const call = (global.fetch as jest.Mock).mock.calls.find(([, request]) => request?.method === 'POST');
      expect(call).toBeDefined();
      return call;
    });

    expect(JSON.parse(postCall?.[1].body)).toEqual({
      amount: 10,
      currency: 'USD',
      frequency: 'ONE_TIME',
      gateway: 'PAYPAL',
      donorEmail: 'reader@example.com',
    });
  });
});