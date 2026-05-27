import Link from 'next/link';
import { HeartHandshake, Lock } from 'lucide-react';
import {
  type BookDonorAccessLevel,
  getBookDonorRequirementText,
  getBookLockedAudienceLabel,
  getBookSupportCallToAction,
} from '@/lib/book-access-config';

type DonorAccessLockProps = {
  accessLevel: BookDonorAccessLevel;
  isSignedIn: boolean;
  loginHref: string;
  supportHref: string;
  title?: string;
  message?: string;
  supportLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  className?: string;
};

export default function DonorAccessLock({
  accessLevel,
  isSignedIn,
  loginHref,
  supportHref,
  title = 'Donor-only content',
  message,
  supportLabel,
  secondaryHref,
  secondaryLabel,
  className = '',
}: DonorAccessLockProps) {
  const defaultMessage = `This content is reserved for ${getBookLockedAudienceLabel(accessLevel)}. Unlock it after ${getBookDonorRequirementText(accessLevel)} on your account.`;
  const primaryHref = isSignedIn ? supportHref : loginHref;
  const primaryLabel = isSignedIn
    ? (supportLabel || getBookSupportCallToAction(accessLevel))
    : 'Sign in to unlock';

  return (
    <div className={`rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-900 ring-1 ring-amber-100 ${className}`.trim()}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-xl bg-amber-100 p-2 text-amber-700" aria-hidden="true">
          <Lock className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-amber-950">{title}</p>
            <span className="inline-flex rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700 ring-1 ring-amber-200">
              <HeartHandshake className="mr-1 h-3.5 w-3.5" />
              {getBookLockedAudienceLabel(accessLevel)}
            </span>
          </div>

          <p className="mt-2 leading-6 text-amber-800">{message || defaultMessage}</p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href={primaryHref} className="brand-button px-4 py-2.5 text-center text-sm">
              {primaryLabel}
            </Link>

            {secondaryHref && secondaryLabel ? (
              <Link href={secondaryHref} className="ghost-button px-4 py-2.5 text-center text-sm">
                {secondaryLabel}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}