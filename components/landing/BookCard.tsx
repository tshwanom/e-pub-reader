import Link from 'next/link';
import Image from 'next/image';
import BookReadLink from '@/components/BookReadLink';
import {
  isDonorRestrictedBook,
  isRecurringDonorBook,
  resolveBookDonorAccessLevel,
} from '@/lib/book-access-config';

interface BookCardProps {
  id: string;
  title: string;
  author: string;
  description: string;
  coverUrl: string;
  donorAccessLevel?: string | null;
  donorOnly?: boolean;
  isAccessible?: boolean;
  readingProgress?: number | null; // 0–100
}

export default function BookCard({
  id,
  title,
  author,
  description,
  coverUrl,
  donorAccessLevel,
  donorOnly = false,
  isAccessible,
  readingProgress,
}: BookCardProps) {
  const bookDonorAccessLevel = resolveBookDonorAccessLevel({ donorAccessLevel, donorOnly });
  const isRestrictedBook = isDonorRestrictedBook(bookDonorAccessLevel);
  const requiresRecurringSupport = isRecurringDonorBook(bookDonorAccessLevel);
  const resolvedAccessibility = typeof isAccessible === 'boolean'
    ? isAccessible
    : !isRestrictedBook;
  const ctaLabel = !isRestrictedBook
    ? 'Read free'
    : resolvedAccessibility
      ? requiresRecurringSupport
        ? 'Open recurring edition'
        : 'Open donor edition'
      : requiresRecurringSupport
        ? 'Monthly donor access'
        : 'Donor access';

  const hasProgress = resolvedAccessibility && readingProgress != null && readingProgress > 0;

  return (
    <article className="group surface-card flex h-full flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      {/* Book Cover */}
      <div className="relative aspect-[2/3] overflow-hidden bg-gradient-to-br from-landing-accent/10 to-landing-bg">
        {isRestrictedBook && (
          <div className="absolute left-3 top-3 z-10 rounded-full border border-white/40 bg-black/55 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-sm">
            {resolvedAccessibility
              ? requiresRecurringSupport
                ? 'Recurring edition'
                : 'Donor edition'
              : requiresRecurringSupport
                ? 'Recurring donors'
                : 'All donors'}
          </div>
        )}

        {coverUrl && coverUrl !== '/placeholder-cover.jpg' ? (
          <Image
            src={coverUrl}
            alt={title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              className="h-20 w-20 text-landing-accent/30"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
            </svg>
          </div>
        )}

        {/* Reading progress bar overlay on cover */}
        {hasProgress && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
            <div
              className="h-full bg-landing-accent"
              style={{ width: `${readingProgress}%` }}
              role="progressbar"
              aria-valuenow={readingProgress ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${Math.round(readingProgress ?? 0)}% read`}
            />
          </div>
        )}
      </div>

      {/* Book Info */}
      <div className="flex flex-1 flex-col p-6">
        {isRestrictedBook && (
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-landing-accent">
            {resolvedAccessibility
              ? requiresRecurringSupport
                ? 'Unlocked for recurring supporters'
                : 'Unlocked for donors'
              : requiresRecurringSupport
                ? 'Reserved for recurring supporters'
                : 'Reserved for donors'}
          </p>
        )}
        <h3 className="line-clamp-2 font-inter text-xl font-semibold text-landing-text">
          {title}
        </h3>
        <p className="mt-2 font-inter text-sm text-landing-text-muted">
          {author}
        </p>
        <p className="mb-5 mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-landing-text-muted">
          {description}
        </p>

        {/* CTAs */}
        <div className="flex items-center gap-3">
          <Link
            href={`/books/${id}`}
            className="inline-flex items-center text-sm font-semibold text-landing-accent transition-colors duration-200 hover:text-landing-accent-secondary"
          >
            {ctaLabel}
            <svg
              className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </Link>

          {hasProgress && resolvedAccessibility && (
            <BookReadLink
              bookId={id}
              className="ml-auto rounded-lg bg-landing-accent/10 px-3 py-1.5 text-xs font-semibold text-landing-accent transition hover:bg-landing-accent hover:text-white"
            >
              Resume {Math.round(readingProgress ?? 0)}%
            </BookReadLink>
          )}
        </div>
      </div>
    </article>
  );
}
