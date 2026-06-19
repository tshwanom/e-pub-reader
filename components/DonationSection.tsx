'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { signIn } from 'next-auth/react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
  getBookDonorRequirementText,
  getBookSupportCallToAction,
  isDonorRestrictedBook,
  isRecurringDonorBook,
  resolveBookDonorAccessLevel,
} from '@/lib/book-access-config';
import CurrencyPicker from '@/components/CurrencyPicker';
import {
  DEFAULT_DONATION_CURRENCY,
  DEFAULT_DONATION_FREQUENCY,
  DEFAULT_DONATION_GATEWAY,
  DONATION_BASE_CURRENCY,
  DONATION_CURRENCY_OPTIONS,
  DONATION_FREQUENCY_OPTIONS,
  DONATION_GATEWAYS,
  detectDonationCurrencyFromLocale,
  formatCurrencyAmount,
  formatDonationFrequencyLabel,
  getDefaultDonationAmount,
  getSuggestedDonationAmounts,
  isSupportedDonationCurrency,
  normalizeDonationCurrency,
  type DonationFrequency,
  type DonationPresetOptions,
  type DonationGateway,
  type DonationQuoteSummary,
} from '@/lib/donations';

const DONATION_CURRENCY_STORAGE_KEY = 'omr:donation:currency';

function isAbortError(error: unknown) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'name' in error &&
      (error as { name?: string }).name === 'AbortError'
  );
}

interface DonationSectionProps {
  bookId?: string | null;
  bookTitle?: string;
  bookDonorAccessLevel?: string | null;
  donorOnly?: boolean;
  message?: string | null;
  goal?: any; // Decimal type from Prisma
  currentUserEmail?: string | null;
  triggerVariant?: 'card' | 'button';
  triggerLabel?: string;
  triggerClassName?: string;
  modalTitle?: string;
  modalDescription?: string;
  modalBadgeLabel?: string;
  initialFrequency?: DonationFrequency;
}

type DonationPresetOptionsResponse = DonationPresetOptions & {
  quotedAt: string;
};

export default function DonationSection({
  bookId,
  bookTitle = 'the work',
  bookDonorAccessLevel,
  donorOnly = false,
  message,
  goal,
  currentUserEmail,
  triggerVariant = 'card',
  triggerLabel,
  triggerClassName,
  modalBadgeLabel,
  modalTitle,
  modalDescription,
  initialFrequency,
}: DonationSectionProps) {
  const normalizedBookId = typeof bookId === 'string' && bookId.trim().length > 0
    ? bookId.trim()
    : undefined;
  const hasBookContext = Boolean(normalizedBookId);
  const normalizedBookTitle = bookTitle.trim() || 'the work';
  const resolvedBookDonorAccessLevel = resolveBookDonorAccessLevel({
    donorAccessLevel: bookDonorAccessLevel,
    donorOnly,
  });
  const requiresDonorUnlock = isDonorRestrictedBook(resolvedBookDonorAccessLevel);
  const requiresRecurringUnlock = isRecurringDonorBook(resolvedBookDonorAccessLevel);
  const currencyPickerId = useId();
  const donationModalTitleId = useId();
  const donationModalDescriptionId = useId();
  const [amount, setAmount] = useState(String(getDefaultDonationAmount(DEFAULT_DONATION_CURRENCY)));
  const [currency, setCurrency] = useState(DEFAULT_DONATION_CURRENCY);
  const [detectedCurrency, setDetectedCurrency] = useState(DEFAULT_DONATION_CURRENCY);
  const [displayLocale, setDisplayLocale] = useState('en-US');
  const [isCurrencyReady, setIsCurrencyReady] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [frequency, setFrequency] = useState<DonationFrequency>(
    initialFrequency ?? (requiresRecurringUnlock ? 'MONTHLY' : DEFAULT_DONATION_FREQUENCY)
  );
  const [gateway, setGateway] = useState<DonationGateway>(DEFAULT_DONATION_GATEWAY);
  const [donorEmail, setDonorEmail] = useState(currentUserEmail ?? '');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quote, setQuote] = useState<DonationQuoteSummary | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [suggestedAmounts, setSuggestedAmounts] = useState<number[]>(
    getSuggestedDonationAmounts(DEFAULT_DONATION_CURRENCY)
  );
  const [suggestedAmountsLoading, setSuggestedAmountsLoading] = useState(false);
  const [suggestedAmountsError, setSuggestedAmountsError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    setPortalContainer(document.body);
  }, []);

  useEffect(() => {
    const browserLocales = typeof navigator === 'undefined'
      ? []
      : Array.from(navigator.languages ?? []).filter((locale): locale is string => Boolean(locale));

    if (browserLocales.length === 0 && typeof navigator !== 'undefined' && navigator.language) {
      browserLocales.push(navigator.language);
    }

    const nextDisplayLocale = browserLocales[0] ?? 'en-US';
    const nextDetectedCurrency = detectDonationCurrencyFromLocale(browserLocales);
    const savedCurrency = typeof window !== 'undefined'
      ? window.localStorage.getItem(DONATION_CURRENCY_STORAGE_KEY)
      : null;
    const hasSavedCurrency = typeof savedCurrency === 'string'
      && savedCurrency.trim().length > 0
      && isSupportedDonationCurrency(savedCurrency);
    const preferredCurrency = hasSavedCurrency
      ? normalizeDonationCurrency(savedCurrency)
      : nextDetectedCurrency;

    setDisplayLocale(nextDisplayLocale);
    setDetectedCurrency(nextDetectedCurrency);
    setCurrency(preferredCurrency);
    setAmount(String(getDefaultDonationAmount(preferredCurrency)));
    setIsCurrencyReady(true);
  }, []);

  useEffect(() => {
    if (!isCurrencyReady) {
      return;
    }

    setErrorMessage(null);
  }, [amount, currency, donorEmail, frequency, gateway, isCurrencyReady]);

  const suggestedAmountButtons = useMemo(
    () => suggestedAmounts.map((preset) => ({
      value: preset.toString(),
      label: formatCurrencyAmount(preset, currency, displayLocale),
    })),
    [currency, displayLocale, suggestedAmounts]
  );

  useEffect(() => {
    if (requiresRecurringUnlock && frequency !== 'MONTHLY') {
      setFrequency('MONTHLY');
    }
  }, [frequency, requiresRecurringUnlock]);

  const selectedGateway = DONATION_GATEWAYS.find((option) => option.id === gateway) ?? DONATION_GATEWAYS[0];
  const selectedCurrency = DONATION_CURRENCY_OPTIONS.find((option) => option.code === currency);
  const availableFrequencyOptions = requiresRecurringUnlock
    ? DONATION_FREQUENCY_OPTIONS.filter((option) => option.id === 'MONTHLY')
    : DONATION_FREQUENCY_OPTIONS;
  const requiresEmail = !currentUserEmail;
  const numericAmount = Number(amount);
  const hasValidAmount = Number.isFinite(numericAmount) && numericAmount >= 1;
  const donateButtonLabel = triggerLabel
    ?? (hasBookContext
      ? getBookSupportCallToAction(resolvedBookDonorAccessLevel)
      : 'Support the Revolution');
  const checkoutButtonLabel = frequency === 'MONTHLY'
    ? `Start monthly support with ${selectedGateway.label}`
    : `Continue to ${selectedGateway.label}`;
  const minimumEquivalentError = quote && quote.baseAmount < 1
    ? 'Minimum contribution is the equivalent of USD 1.00.'
    : null;
  const donationModalBadge = modalBadgeLabel
    ?? (hasBookContext ? 'Secure checkout' : 'Reader-supported');
  const donationModalHeading = modalTitle
    ?? (hasBookContext ? `Support “${normalizedBookTitle}”` : 'Support the Work');
  const donationModalSummary = modalDescription
    ?? (requiresRecurringUnlock
      ? `This book unlocks with ${getBookDonorRequirementText(resolvedBookDonorAccessLevel)}, so this checkout is set to monthly support.`
      : hasBookContext
        ? 'Pick one-time or monthly support, then choose the amount, currency, and checkout option.'
        : 'Choose one-time or monthly support, then set the amount, currency, and checkout option that works best for you.');
  const disableCheckout = loading
    || !hasValidAmount
    || Boolean(minimumEquivalentError)
    || (requiresEmail && !donorEmail.trim());

  useEffect(() => {
    if (!isCurrencyReady || !isModalOpen) {
      setSuggestedAmountsLoading(false);
      setSuggestedAmountsError(null);
      return;
    }

    const controller = new AbortController();
    const shouldResetAmount = amount.trim().length === 0
      || suggestedAmounts.some((preset) => preset.toString() === amount);

    const syncPresetOptions = async () => {
      setSuggestedAmountsLoading(true);
      setSuggestedAmountsError(null);

      try {
        const params = new URLSearchParams({ currency });
        const response = await fetch(`/api/donations/options?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to refresh the live donation presets.');
        }

        const options = payload as DonationPresetOptionsResponse;
        setSuggestedAmounts(options.suggestedAmounts);

        if (shouldResetAmount) {
          setAmount(String(options.defaultAmount));
        }
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        setSuggestedAmounts(getSuggestedDonationAmounts(currency));
        setSuggestedAmountsError(
          error instanceof Error
            ? error.message
            : 'Unable to refresh the live donation presets.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setSuggestedAmountsLoading(false);
        }
      }
    };

    void syncPresetOptions();

    return () => controller.abort();
  }, [currency, isCurrencyReady, isModalOpen]);

  useEffect(() => {
    if (!isCurrencyReady || !isModalOpen || !hasValidAmount) {
      setQuote(null);
      setQuoteError(null);
      setQuoteLoading(false);
      return;
    }

    const controller = new AbortController();

    const syncLiveQuote = async () => {
      setQuoteLoading(true);
      setQuoteError(null);

      try {
        const params = new URLSearchParams({
          amount: numericAmount.toString(),
          currency,
          gateway,
        });
        const response = await fetch(`/api/donations/quote?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to refresh the live conversion.');
        }

        setQuote(payload as DonationQuoteSummary);
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        setQuote(null);
        setQuoteError(
          error instanceof Error
            ? error.message
            : 'Unable to refresh the live conversion.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setQuoteLoading(false);
        }
      }
    };

    void syncLiveQuote();

    return () => controller.abort();
  }, [currency, gateway, hasValidAmount, isCurrencyReady, isModalOpen, numericAmount]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncDonationModalFromHash = () => {
      if (window.location.hash === '#support-this-book') {
        setIsModalOpen(true);
      }
    };

    syncDonationModalFromHash();
    window.addEventListener('hashchange', syncDonationModalFromHash);

    return () => {
      window.removeEventListener('hashchange', syncDonationModalFromHash);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const token = params.get('loginToken');
    const email = params.get('email');

    if (token && email) {
      setLoading(true);
      setErrorMessage(null);

      // Perform credentials auto-login
      signIn('credentials', {
        email: email.trim().toLowerCase(),
        password: token.trim(), // secure one-time verification token passed as password
        redirect: false,
      })
        .then((res) => {
          if (res?.error) {
            setErrorMessage('Auto-login failed: ' + res.error);
          } else {
            // Clean up query parameters to keep URL spotless
            const cleanUrl = window.location.pathname + window.location.search
              .replace(/[?&]loginToken=[^&]*/, '')
              .replace(/[?&]email=[^&]*/, '')
              .replace(/^&/, '?'); // ensure formatting is valid
            
            window.history.replaceState(null, '', cleanUrl);
            // Force reload to refresh server components/state with new session
            window.location.reload();
          }
        })
        .catch((err) => {
          setErrorMessage('Auto-login error occurred.');
          console.error(err);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, []);

  useEffect(() => {
    if (!isModalOpen || typeof document === 'undefined') {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isModalOpen]);

  useEffect(() => {
    if (!isModalOpen || typeof window === 'undefined') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModalOpen]);

  const openDonationModal = () => {
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const closeDonationModal = () => {
    setIsModalOpen(false);
    setErrorMessage(null);

    if (typeof window !== 'undefined' && window.location.hash === '#support-this-book') {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  };

  const handleCurrencyChange = (nextCurrencyValue: string) => {
    const nextCurrency = normalizeDonationCurrency(nextCurrencyValue);

    setCurrency(nextCurrency);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DONATION_CURRENCY_STORAGE_KEY, nextCurrency);
    }
  };

  const handleUseDetectedCurrency = () => {
    setCurrency(detectedCurrency);

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(DONATION_CURRENCY_STORAGE_KEY);
    }
  };

  const handleDonate = async () => {
    if (!hasValidAmount) {
      setErrorMessage('Please enter at least 1 unit in your chosen currency.');
      return;
    }

    if (minimumEquivalentError) {
      setErrorMessage(minimumEquivalentError);
      return;
    }

    if (requiresEmail && !donorEmail.trim()) {
      setErrorMessage('Please enter an email address before checkout can begin.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/donations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(normalizedBookId ? { bookId: normalizedBookId } : {}),
          amount: numericAmount,
          currency,
          frequency,
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

  const donationForm = (
    <>
      {message ? (
        <div className="surface-muted text-sm text-landing-text-muted p-4">
          <p className="whitespace-pre-wrap">{message}</p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
        <div className="space-y-4">
          <div className="surface-muted p-3">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                Support cadence
              </p>
              <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-landing-text-muted shadow-sm">
                {formatDonationFrequencyLabel(frequency)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {availableFrequencyOptions.map((option) => {
                const descriptionId = `${donationModalDescriptionId}-frequency-${option.id.toLowerCase()}`;

                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-label={`${option.label} support cadence`}
                    aria-describedby={descriptionId}
                    aria-pressed={frequency === option.id}
                    onClick={() => setFrequency(option.id)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2 ${
                      frequency === option.id
                        ? 'border-landing-accent bg-white shadow-sm ring-1 ring-landing-accent/10'
                        : 'border-landing-border/90 bg-white/85 hover:border-landing-accent/35 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        aria-hidden="true"
                        className={`mt-1 h-2.5 w-2.5 rounded-full transition-colors ${
                          frequency === option.id
                            ? 'bg-landing-accent'
                            : 'bg-landing-border'
                        }`}
                      />
                      <div className="min-w-0">
                        <span className="block text-sm font-semibold text-landing-text">{option.label}</span>
                        <p id={descriptionId} className="mt-1 text-[11px] leading-5 text-landing-text-muted">
                          {option.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="mt-3 text-xs leading-5 text-landing-text-muted">
              {requiresRecurringUnlock
                ? 'This title is reserved for recurring supporters, so the unlock checkout is monthly only.'
                : requiresDonorUnlock
                  ? 'Any completed contribution unlocks supporter-exclusive books on this signed-in account — or on the same email when you sign in later.'
                  : hasBookContext
                    ? 'Choose one-time or monthly support for this title.'
                    : 'Choose one-time or monthly support for the work.'}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <label htmlFor="donation-amount" className="mb-2 block text-sm font-medium text-landing-text">
                Amount in {currency}
              </label>
              <input
                id="donation-amount"
                autoFocus
                type="number"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                min="1"
                step="0.01"
                className="w-full rounded-xl border border-landing-border bg-white px-4 py-3 text-landing-text shadow-sm transition-colors focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/30"
                placeholder={`Custom amount in ${currency}`}
              />
            </div>

            <div>
              <label htmlFor={currencyPickerId} className="mb-2 block text-sm font-medium text-landing-text">
                Your currency
              </label>
              <CurrencyPicker
                id={currencyPickerId}
                value={currency}
                detectedCurrency={detectedCurrency}
                options={DONATION_CURRENCY_OPTIONS}
                onChange={handleCurrencyChange}
                onUseDetectedCurrency={handleUseDetectedCurrency}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                Live presets
              </p>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                suggestedAmountsLoading
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-white/85 text-landing-text-muted shadow-sm'
              }`}>
                {suggestedAmountsLoading ? 'Refreshing…' : 'USD 5 · 10 · 25 · 50'}
              </span>
            </div>
            <p className="text-xs leading-5 text-landing-text-muted">
              Preset buttons are the live {currency} equivalents of the fixed USD 5, 10, 25, and 50 support tiers.
            </p>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {suggestedAmountButtons.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => setAmount(preset.value)}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  amount === preset.value
                    ? 'bg-landing-accent text-white shadow-sm'
                    : 'border border-landing-border bg-white text-landing-text hover:border-landing-accent/40 hover:text-landing-accent'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          </div>

          {requiresEmail ? (
            <div>
              <label htmlFor="donor-email" className="mb-2 block text-sm font-medium text-landing-text">
                Your email address
              </label>
              <input
                id="donor-email"
                type="email"
                value={donorEmail}
                onChange={(event) => setDonorEmail(event.target.value)}
                className="w-full rounded-xl border border-landing-border bg-white px-4 py-3 text-landing-text shadow-sm transition-colors focus:border-landing-accent focus:outline-none focus:ring-2 focus:ring-landing-accent/30"
                placeholder="you@example.com"
              />
              <p className="mt-2 text-xs leading-5 text-landing-text-muted">
                Your contribution silently creates a password-free reader account, allowing you to access premium benefits automatically.
              </p>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="surface-muted p-3">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                Payment gateway
              </p>
              <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-landing-text-muted shadow-sm">
                {selectedGateway.checkoutCurrency}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {DONATION_GATEWAYS.map((option) => {
                const gatewayDisabled = false;
                const descriptionId = `${donationModalDescriptionId}-gateway-${option.id.toLowerCase()}`;

                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-label={`${option.label} payment gateway`}
                    aria-describedby={descriptionId}
                    aria-pressed={gateway === option.id}
                    aria-disabled={gatewayDisabled}
                    disabled={gatewayDisabled}
                    onClick={() => setGateway(option.id)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2 ${
                      gateway === option.id
                        ? 'border-landing-accent bg-white shadow-sm ring-1 ring-landing-accent/10'
                        : 'border-landing-border/90 bg-white/85 hover:border-landing-accent/35 hover:bg-white'
                    } ${gatewayDisabled ? 'cursor-not-allowed opacity-55 hover:border-landing-border/90 hover:bg-white/85' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className={`h-2.5 w-2.5 rounded-full transition-colors ${
                              gateway === option.id
                                ? 'bg-landing-accent'
                                : 'bg-landing-border'
                            }`}
                          />
                          <span className="truncate text-sm font-semibold text-landing-text">{option.label}</span>
                        </div>
                        <p className="mt-1 pl-[1.125rem] text-[10px] font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                          {gatewayDisabled ? 'One-time only' : option.checkoutCurrency}
                        </p>
                      </div>

                      <span id={descriptionId} className="rounded-full bg-landing-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-landing-text-muted">
                        {gatewayDisabled ? 'One-time only' : option.checkoutCurrency}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {frequency === 'MONTHLY' ? (
              <p className="mt-2 text-xs leading-5 text-landing-text-muted">
                Monthly recurring support is available through both PayPal and Paystack. Choose whichever checkout works best for you.
              </p>
            ) : null}
          </div>

          <div className="surface-muted p-3.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                Checkout total
              </p>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                quoteLoading
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}>
                {quoteLoading ? 'Refreshing…' : formatDonationFrequencyLabel(frequency)}
              </span>
            </div>

            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              <div className="rounded-xl border border-white/70 bg-white/80 px-3.5 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                  You donate
                </p>
                <p className="mt-1.5 text-lg font-semibold text-landing-text sm:text-xl">
                  {formatCurrencyAmount(hasValidAmount ? numericAmount : 0, currency, displayLocale)}
                </p>
                <p className="mt-1 text-xs text-landing-text-muted">
                  {selectedCurrency?.name ?? currency} · {frequency === 'MONTHLY' ? 'Billed every month' : 'Single contribution'}
                </p>
              </div>

              <div className="rounded-xl border border-white/70 bg-white/80 px-3.5 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                  {selectedGateway.label} checkout
                </p>
                <p className="mt-1.5 text-lg font-semibold text-landing-text sm:text-xl">
                  {quote
                    ? formatCurrencyAmount(quote.gatewayAmount, quote.gatewayCurrency, displayLocale)
                    : '—'}
                </p>
                <p className="mt-1 text-xs text-landing-text-muted">
                  {quote
                    ? frequency === 'MONTHLY'
                      ? `Billed monthly in ${quote.gatewayCurrency}`
                      : `Charged in ${quote.gatewayCurrency}`
                    : 'Waiting for rate'}
                </p>
              </div>
            </div>

            <div className="mt-2.5 space-y-2 text-xs leading-5 text-landing-text-muted">
              {suggestedAmountsError ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                  {suggestedAmountsError}
                </p>
              ) : null}
              {quoteError ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                  {quoteError}
                </p>
              ) : null}
              {minimumEquivalentError ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                  {minimumEquivalentError}
                </p>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={handleDonate}
            disabled={disableCheckout}
            className="brand-button w-full px-5 py-3 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? frequency === 'MONTHLY'
                ? 'Preparing recurring checkout…'
                : 'Preparing checkout…'
              : checkoutButtonLabel}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}
    </>
  );

  return (
    <>
      {triggerVariant === 'button' ? (
        <button
          type="button"
          onClick={openDonationModal}
          className={triggerClassName ?? 'brand-button px-4 py-2.5'}
        >
          {donateButtonLabel}
        </button>
      ) : (
        <div className="mx-auto w-full max-w-3xl rounded-2xl border border-landing-border/80 bg-white/78 px-4 py-3 shadow-sm ring-1 ring-white/65 backdrop-blur-xl sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-landing-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-landing-accent">
                  Support
                </span>
                {goal ? (
                  <span className="rounded-full bg-landing-surface-muted px-2.5 py-1 text-[11px] font-medium text-landing-text-muted">
                    Goal {formatCurrencyAmount(Number(goal), DONATION_BASE_CURRENCY, displayLocale)}
                  </span>
                ) : null}
              </div>

              <p className="mt-2 truncate text-sm font-medium text-landing-text sm:text-[15px]">
                {requiresDonorUnlock
                  ? requiresRecurringUnlock
                    ? 'Unlock this title with monthly recurring support.'
                    : 'Unlock this title in a quick donation modal.'
                  : hasBookContext
                    ? `Support “${normalizedBookTitle}” in a quick donation modal.`
                    : 'Open a quick donation modal for one-time or monthly support.'}
              </p>
            </div>

            <button
              type="button"
              onClick={openDonationModal}
              className="brand-button shrink-0 px-4 py-2.5 sm:px-5"
            >
              {donateButtonLabel}
            </button>
          </div>
        </div>
      )}

      {isModalOpen && portalContainer
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] overflow-y-auto bg-black/55 p-4 backdrop-blur-sm"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  closeDonationModal();
                }
              }}
            >
              <div className="flex min-h-full items-end justify-center sm:items-center">
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={donationModalTitleId}
                  aria-describedby={donationModalDescriptionId}
                  className="surface-card my-6 w-full max-w-4xl overflow-hidden shadow-2xl"
                >
                  <div className="flex items-start justify-between gap-4 border-b border-landing-border/70 bg-white/75 px-5 py-4 backdrop-blur-sm sm:px-6 sm:py-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-landing-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-landing-accent">
                          {donationModalBadge}
                        </span>
                        {goal ? (
                          <span className="rounded-full bg-landing-surface-muted px-2.5 py-1 text-[11px] font-medium text-landing-text-muted">
                            Goal {formatCurrencyAmount(Number(goal), DONATION_BASE_CURRENCY, displayLocale)}
                          </span>
                        ) : null}
                      </div>
                      <h2 id={donationModalTitleId} className="mt-3 font-playfair text-2xl font-semibold leading-tight text-landing-text sm:text-3xl">
                        {donationModalHeading}
                      </h2>
                      <p id={donationModalDescriptionId} className="mt-2 max-w-2xl text-xs leading-6 text-landing-text-muted sm:text-sm">
                        {donationModalSummary}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={closeDonationModal}
                      className="rounded-full border border-landing-border bg-white/90 p-1.5 text-landing-text-muted shadow-sm transition-colors hover:border-landing-accent/35 hover:text-landing-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2 sm:p-2"
                      aria-label="Close donation modal"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="max-h-[85vh] overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
                    {donationForm}
                  </div>
                </div>
              </div>
            </div>,
            portalContainer,
          )
        : null}
    </>
  );
}
