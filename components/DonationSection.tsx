'use client';

import { useMemo, useState } from 'react';
import {
  DEFAULT_DONATION_CURRENCY,
  DEFAULT_DONATION_GATEWAY,
  DONATION_BASE_CURRENCY,
  DONATION_CURRENCY_OPTIONS,
  DONATION_GATEWAYS,
  formatCurrencyAmount,
  type DonationGateway,
} from '@/lib/donations';

interface DonationSectionProps {
  bookId: string;
  bookTitle: string;
  message?: string | null;
  goal?: any; // Decimal type from Prisma
  currentUserEmail?: string | null;
}

export default function DonationSection({
  bookId,
  bookTitle,
  message,
  goal,
  currentUserEmail,
}: DonationSectionProps) {
  const [amount, setAmount] = useState('10');
  const [currency, setCurrency] = useState(DEFAULT_DONATION_CURRENCY);
  const [gateway, setGateway] = useState<DonationGateway>(DEFAULT_DONATION_GATEWAY);
  const [donorEmail, setDonorEmail] = useState(currentUserEmail ?? '');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const suggestedAmounts = useMemo(
    () => ['5', '10', '25', '50'].map((preset) => ({
      value: preset,
      label: formatCurrencyAmount(Number(preset), currency),
    })),
    [currency]
  );

  const selectedGateway = DONATION_GATEWAYS.find((option) => option.id === gateway) ?? DONATION_GATEWAYS[0];
  const requiresPaystackEmail = gateway === 'PAYSTACK' && !currentUserEmail;
  const numericAmount = Number(amount);
  const hasValidAmount = Number.isFinite(numericAmount) && numericAmount >= 1;

  const handleDonate = async () => {
    if (!hasValidAmount) {
      setErrorMessage('Please enter at least 1 unit in your chosen currency.');
      return;
    }

    if (requiresPaystackEmail && !donorEmail.trim()) {
      setErrorMessage('Paystack needs an email address before checkout can begin.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/donations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId,
          amount: numericAmount,
          currency,
          gateway,
          donorEmail: donorEmail.trim() || undefined,
        }),
      });

      const payload = await res.json().catch(() => null);

      if (res.ok && payload?.checkoutUrl) {
        window.location.assign(payload.checkoutUrl as string);
        return;
      }

      setErrorMessage(payload?.error || 'Failed to initiate donation.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'An unexpected error occurred.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="surface-card p-6 sm:p-8">
      <h2 className="font-playfair text-3xl font-semibold text-landing-text mb-2">
        Support “{bookTitle}”
      </h2>
      <p className="text-sm text-landing-text-muted mb-5">
        Help keep the library independent and fund future releases.
      </p>

      {message && (
        <p className="mb-4 whitespace-pre-wrap leading-relaxed text-landing-text-muted">
          {message}
        </p>
      )}

      {goal && (
        <div className="mb-4">
          <div className="mb-1 flex justify-between text-sm text-landing-text-muted">
            <span>Funding Goal</span>
            <span>{formatCurrencyAmount(Number(goal), DONATION_BASE_CURRENCY)}</span>
          </div>
          {/* TODO: Show actual progress from donations */}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-landing-text">
            Payment gateway
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {DONATION_GATEWAYS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={gateway === option.id}
                onClick={() => setGateway(option.id)}
                className={`rounded-2xl border px-4 py-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2 ${
                  gateway === option.id
                    ? 'border-landing-accent bg-landing-accent/8 shadow-sm'
                    : 'border-landing-border bg-white hover:border-landing-accent/35'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-landing-text">{option.label}</span>
                  <span className="rounded-full bg-landing-surface-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-landing-text-muted">
                    {option.checkoutCurrency}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-landing-text-muted">
                  {option.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="donation-currency" className="mb-2 block text-sm font-medium text-landing-text">
            Donation currency
          </label>
          <select
            id="donation-currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            className="w-full rounded-xl border border-landing-border bg-white px-4 py-3 text-landing-text focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/30"
          >
            {DONATION_CURRENCY_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.code} — {option.name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs leading-5 text-landing-text-muted">
            We store every donation in {DONATION_BASE_CURRENCY}. PayPal is charged in USD, while Paystack is charged in ZAR after live conversion.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {suggestedAmounts.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => setAmount(preset.value)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              amount === preset.value
                ? 'bg-landing-accent text-white'
                : 'border border-landing-border bg-white text-landing-text hover:border-landing-accent/40 hover:text-landing-accent'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <div>
          <label htmlFor="donation-amount" className="mb-2 block text-sm font-medium text-landing-text">
            Amount in {currency}
          </label>
          <input
            id="donation-amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="1"
            step="0.01"
            className="w-full rounded-xl border border-landing-border bg-white px-4 py-3 text-landing-text focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/30"
            placeholder={`Custom amount in ${currency}`}
          />
        </div>

        {requiresPaystackEmail ? (
          <div>
            <label htmlFor="donor-email" className="mb-2 block text-sm font-medium text-landing-text">
              Email for Paystack
            </label>
            <input
              id="donor-email"
              type="email"
              value={donorEmail}
              onChange={(event) => setDonorEmail(event.target.value)}
              className="w-full rounded-xl border border-landing-border bg-white px-4 py-3 text-landing-text focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/30"
              placeholder="you@example.com"
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-landing-border bg-white/70 px-4 py-3 text-sm leading-6 text-landing-text-muted">
            {currentUserEmail
              ? `Signed in as ${currentUserEmail}. We'll use that for receipts and Paystack verification if you choose it.`
              : 'PayPal can start immediately. If you switch to Paystack, we’ll ask for an email before redirecting you.'}
          </div>
        )}

        <button
          type="button"
          onClick={handleDonate}
          disabled={loading || !hasValidAmount || (requiresPaystackEmail && !donorEmail.trim())}
          className="brand-button px-8 py-3 disabled:cursor-not-allowed disabled:opacity-60 md:self-end"
        >
          {loading ? 'Preparing checkout…' : `Continue to ${selectedGateway.label}`}
        </button>
      </div>

      {errorMessage && (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      <p className="mt-4 text-center text-xs leading-5 text-landing-text-muted">
        {gateway === 'PAYPAL'
          ? `We’ll convert ${currency} to ${DONATION_BASE_CURRENCY} before redirecting you to PayPal.`
          : `We’ll normalize ${currency} to ${DONATION_BASE_CURRENCY}, then convert it to ZAR before redirecting you to Paystack.`}
      </p>
    </div>
  );
}
