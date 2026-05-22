import { formatCurrencyAmount } from '@/lib/donations';
import type { ActivePaystackSubscriptionSnapshot } from '@/lib/donation-subscriptions';

function getSubscriptionFlashMessage(status?: string | null) {
  switch (status) {
    case 'manage-email-sent':
      return {
        tone: 'success' as const,
        message: 'A secure Paystack management link is on its way to your inbox.',
      };
    case 'manage-link-failed':
      return {
        tone: 'warning' as const,
        message: 'We could not open the Paystack management page just now. Please try again or request the email link instead.',
      };
    case 'manage-email-failed':
      return {
        tone: 'warning' as const,
        message: 'We could not send the Paystack management email just now. Please try again in a moment.',
      };
    case 'manage-unavailable':
      return {
        tone: 'warning' as const,
        message: 'We could not find an active Paystack monthly subscription to manage on this account.',
      };
    default:
      return null;
  }
}

export default function PaystackSubscriptionManager({
  subscription,
  returnTo,
  status,
}: {
  subscription: ActivePaystackSubscriptionSnapshot;
  returnTo: string;
  status?: string | null;
}) {
  const flashMessage = getSubscriptionFlashMessage(status);
  const manageHref = `/api/donations/paystack/manage?${new URLSearchParams({
    returnTo,
    donationId: subscription.id,
  }).toString()}`;
  const formattedAmount = subscription.gatewayAmount && subscription.gatewayCurrency
    ? formatCurrencyAmount(subscription.gatewayAmount, subscription.gatewayCurrency)
    : null;

  return (
    <section className="surface-card p-6 sm:p-8" aria-labelledby="paystack-support-manager-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">
            Paystack monthly support
          </p>
          <h2 id="paystack-support-manager-title" className="mt-2 font-playfair text-2xl font-semibold text-landing-text sm:text-3xl">
            Manage your recurring support
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-landing-text-muted sm:text-base">
            Your Paystack subscription is active{formattedAmount ? ` at ${formattedAmount} per month` : ''}.
            Use Paystack&rsquo;s secure portal to update your saved card or cancel the subscription.
          </p>
          {subscription.book ? (
            <p className="mt-3 text-xs uppercase tracking-[0.14em] text-landing-text-muted">
              Started from “{subscription.book.title}”
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-landing-border bg-white/70 px-4 py-3 text-sm text-landing-text-muted shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
            Current cadence
          </p>
          <p className="mt-2 text-base font-semibold text-landing-text">
            Monthly · Paystack
          </p>
          <p className="mt-1 text-xs leading-5 text-landing-text-muted">
            Open the secure portal to update the card or stop future renewals.
          </p>
        </div>
      </div>

      {flashMessage ? (
        <div
          className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
            flashMessage.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50/80 text-emerald-800'
              : 'border-amber-200 bg-amber-50/90 text-amber-800'
          }`}
        >
          {flashMessage.message}
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <a href={manageHref} className="brand-button px-5 py-3 text-center">
          Update card or cancel on Paystack
        </a>

        <form action="/api/donations/paystack/manage-email" method="post" className="sm:inline-flex">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="donationId" value={subscription.id} />
          <button type="submit" className="ghost-button w-full px-5 py-3 sm:w-auto">
            Email me the secure link
          </button>
        </form>
      </div>

      <p className="mt-4 text-xs leading-5 text-landing-text-muted">
        The hosted Paystack page is the safest place to manage this subscription. If the portal does not open, use the email option and Paystack will send the secure link directly to you.
      </p>
    </section>
  );
}