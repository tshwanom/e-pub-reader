import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { getBookAccessState, getContentAccessStateForViewer, getDonorFeatureAccessState } from '@/lib/book-access';
import { withContentFeatureFallback } from '@/lib/content';
import { getUserActivePaystackSubscription } from '@/lib/donation-subscriptions';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getBookAccessBadgeLabel,
  getBookDonorRequirementText,
  getBookLockedAudienceLabel,
  getBookSupportCallToAction,
} from '@/lib/book-access-config';
import Link from 'next/link';
import Image from 'next/image';
import DonationSection from '@/components/DonationSection';
import PaystackSubscriptionManager from '@/components/PaystackSubscriptionManager';
import Header from '@/components/landing/Header';
import Footer from '@/components/landing/Footer';
import ContentNarrationPlayer from '@/components/ContentNarrationPlayer';
import BookReadLink from '@/components/BookReadLink';
import DonorAccessLock from '@/components/DonorAccessLock';
import { getVideoWatchPath } from '@/lib/video-source';
import { getBookPath } from '@/lib/book-paths';
import { getAbsoluteSiteAssetUrl, getSiteUrl } from '@/lib/site';
import { ArrowRight, Play } from 'lucide-react';
import { getTranslations } from '@/lib/i18n-server';

type BookPageSearchParams = Record<string, string | string[] | undefined>;

function truncatePreview(text: string | null | undefined, maxLength = 260) {
  if (!text) {
    return null;
  }

  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}...` : text;
}

function getSingleSearchParamValue(searchParams: BookPageSearchParams | undefined, key: string) {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0];
  }

  return typeof value === 'string' ? value : undefined;
}

function buildSearchParamsSuffix(searchParams: BookPageSearchParams | undefined) {
  const urlSearchParams = new URLSearchParams();

  Object.entries(searchParams || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (typeof entry === 'string') {
          urlSearchParams.append(key, entry);
        }
      });
      return;
    }

    if (typeof value === 'string') {
      urlSearchParams.append(key, value);
    }
  });

  const queryString = urlSearchParams.toString();
  return queryString ? `?${queryString}` : '';
}

function buildBookSeoDescription(book: { title: string; author: string; description?: string | null }) {
  return truncatePreview(book.description, 160)
    || `Read “${book.title}” by ${book.author} on One Man Revolution.`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bookId: string }>;
}): Promise<Metadata> {
  const { bookId } = await params;
  const book = await prisma.book.findFirst({
    where: {
      status: 'PUBLISHED',
      OR: [{ id: bookId }, { slug: bookId }],
    },
    select: {
      id: true,
      slug: true,
      title: true,
      author: true,
      description: true,
      coverUrl: true,
      publisher: true,
      language: true,
      subjects: true,
    },
  });

  if (!book) {
    return {
      title: 'Book not found | One Man Revolution',
      description: 'The requested book could not be found.',
    };
  }

  const canonicalPath = getBookPath(book);
  const description = buildBookSeoDescription(book);
  const coverImageUrl = getAbsoluteSiteAssetUrl(book.coverUrl, '/logo.png');
  const keywords = [...new Set([
    ...(book.subjects || []),
    book.author,
    book.publisher,
    book.language,
    'One Man Revolution',
  ].filter((value): value is string => Boolean(value && value.trim())))];

  return {
    title: `${book.title} by ${book.author} | One Man Revolution`,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    keywords,
    openGraph: {
      title: book.title,
      description,
      url: canonicalPath,
      siteName: 'One Man Revolution',
      type: 'website',
      images: [
        {
          url: coverImageUrl,
          alt: `${book.title} cover`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${book.title} by ${book.author}`,
      description,
      images: [coverImageUrl],
    },
  };
}

export default async function BookDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookId: string }>;
  searchParams?: Promise<BookPageSearchParams>;
}) {
  const { bookId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const session = await getServerSession(authOptions);
  const paystackSubscription = session?.user ? await getUserActivePaystackSubscription(session.user) : null;

  const book = await prisma.book.findFirst({
    where: {
      OR: [{ id: bookId }, { slug: bookId }],
    },
    include: {
      epubFile: true,
      audiobook: true,
      printLinks: true,
      readingProgress: session?.user?.id
        ? {
            where: { userId: session.user.id },
            take: 1,
          }
        : false,
    },
  });

  if (!book) {
    notFound();
  }

  const { t } = await getTranslations();

  const translations = book.translationGroupId
    ? await prisma.book.findMany({
        where: {
          translationGroupId: book.translationGroupId,
          status: 'PUBLISHED',
        },
        select: {
          id: true,
          slug: true,
          language: true,
        },
      })
    : [];

  const access = await getBookAccessState(book, session?.user);
  const donorFeatureAccess = book.narrationEnabled
    ? await getDonorFeatureAccessState(book, session?.user)
    : null;

  if (!access.isPublished && !access.isPrivileged) {
    notFound();
  }

  const canonicalBookPath = getBookPath(book);

  if (bookId !== (book.slug?.trim() || book.id)) {
    permanentRedirect(`${canonicalBookPath}${buildSearchParamsSuffix(resolvedSearchParams)}`);
  }

  const supplementaryContents = await withContentFeatureFallback(
    () => prisma.supplementaryContent.findMany({
      where: {
        bookId: book.id,
        status: 'PUBLISHED',
      },
      orderBy: {
        order: 'asc',
      },
    }),
    [],
    `book supplementary content ${book.id}`
  );

  const progress = access.hasAccess && session?.user?.id ? book.readingProgress?.[0] : null;
  const donationStatus = getSingleSearchParamValue(resolvedSearchParams, 'donation');
  const subscriptionStatus = getSingleSearchParamValue(resolvedSearchParams, 'subscription');
  const loginHref = `/login?callbackUrl=${encodeURIComponent(canonicalBookPath)}`;
  const bookRequiresDonation = access.requiresDonation;
  const bookRequiresRecurringSupport = access.requiresRecurringDonation;
  const donorRequirementText = getBookDonorRequirementText(access.bookDonorAccessLevel);
  const lockedAudienceLabel = getBookLockedAudienceLabel(access.bookDonorAccessLevel);
  const supportCallToAction = getBookSupportCallToAction(access.bookDonorAccessLevel);
  const accessBadgeLabel = getBookAccessBadgeLabel(access.bookDonorAccessLevel, access.hasAccess);
  const lockedSupportMessage = session
    ? bookRequiresRecurringSupport
      ? 'Start or keep an active monthly contribution to unlock this book and future sustainer releases.'
      : 'Support the mission with a once-off contribution to unlock this book and future supporter releases.'
    : bookRequiresRecurringSupport
      ? 'Sign in first, then start monthly support to unlock this book and the sustainer library.'
      : 'Sign in first, then support the mission to unlock this book and the supporter library.';
  const defaultUnlockMessage = bookRequiresRecurringSupport
    ? 'Start or keep an active monthly contribution to unlock this sustainer title and future sustainer releases on your account.'
    : 'Make any once-off contribution to unlock this book and future supporter releases on your account.';
  const defaultNarrationUnlockMessage = bookRequiresRecurringSupport
    ? 'Start or keep an active monthly contribution to unlock narrated mode for this title on your account.'
    : 'Support the work once to unlock narrated mode for this title on your account.';
  const donorNarrationMessage = !book.narrationEnabled || !donorFeatureAccess
    ? null
    : donorFeatureAccess.hasAccess
      ? 'Supporter narration is unlocked on your account and will appear inside the reader whenever the signed audio is ready.'
      : bookRequiresRecurringSupport
        ? 'Narrated mode follows this title’s sustainer access. Start or keep an active monthly contribution to unlock the narration player.'
        : bookRequiresDonation
          ? 'Narrated mode follows this title’s supporter access, so the narration player unlocks with the same support requirement.'
          : 'Narrated mode is reserved for supporters. Support the work once to unlock the narration player on your account.';
  const contentViewerAccess = {
    donorTier: access.donorTier,
    isPrivileged: access.isPrivileged,
    isDonor: access.isDonor,
    isRecurringDonor: access.isRecurringDonor,
    isSignedIn: Boolean(session?.user?.id),
  };
  const absoluteBookUrl = getSiteUrl(canonicalBookPath).toString();
  const absoluteCoverUrl = getAbsoluteSiteAssetUrl(book.coverUrl, '/logo.png');
  const seoDescription = buildBookSeoDescription(book);
  const bookStructuredData = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: book.title,
    url: absoluteBookUrl,
    description: seoDescription,
    image: [absoluteCoverUrl],
    author: [
      {
        '@type': 'Person',
        name: book.author,
      },
    ],
    inLanguage: book.language || 'en',
    publisher: {
      '@type': 'Organization',
      name: book.publisher || 'One Man Revolution',
    },
    datePublished: book.publishedAt?.toISOString(),
    isbn: book.isbn || undefined,
    genre: book.subjects?.length ? book.subjects : undefined,
    isAccessibleForFree: !bookRequiresDonation,
    bookFormat: 'https://schema.org/EBook',
  });

  return (
    <main className="page-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: bookStructuredData }} />
      <Header />

      <div className="page-container py-8 sm:py-12">
        <div className="w-full min-w-0">
          <Link
            href="/library"
            className="ghost-button mb-4 py-2 sm:py-1.5"
          >
            ← Back to Library
          </Link>

          <div className="grid grid-cols-1 gap-5 sm:gap-8 lg:grid-cols-3">
          {/* Left column - Cover and actions */}
          <div className="lg:col-span-1 min-w-0">
            <div className="surface-card p-4 sm:p-6 w-full max-w-sm mx-auto lg:max-w-none lg:mx-0 lg:sticky lg:top-28">
              {/* Cover */}
              <div className="relative mb-6 mx-auto w-full aspect-[2/3] overflow-hidden rounded-xl bg-gradient-to-br from-landing-accent/10 to-landing-bg">
                {book.coverUrl && book.coverUrl !== '/placeholder-cover.jpg' ? (
                  <Image
                    src={book.coverUrl}
                    alt={book.title}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg
                      className="h-24 w-24 text-landing-accent/30"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                    </svg>
                  </div>
                )}
              </div>

              {access.hasAccess ? (
                <BookReadLink
                  bookId={book.id}
                  bookSlug={book.slug}
                  prefetchOnMount
                  className="brand-button mb-4 block w-full text-center"
                >
                  {progress ? 'Continue Reading' : 'Start Reading'}
                </BookReadLink>
              ) : session ? (
                <a
                  href="#support-this-book"
                  className="brand-button mb-4 block w-full text-center"
                >
                  {supportCallToAction}
                </a>
              ) : (
                <>
                  <a
                    href="#support-this-book"
                    className="brand-button mb-3 block w-full text-center"
                  >
                    {supportCallToAction}
                  </a>
                  <p className="mb-4 text-center text-xs text-landing-text-muted">
                    Already supported?{' '}
                    <Link href={loginHref} className="font-semibold text-landing-accent hover:underline">
                      Sign in to unlock
                    </Link>
                  </p>
                </>
              )}

              {progress && (
                <div className="mb-4">
                  <div className="mb-1 flex justify-between text-sm text-landing-text-muted">
                    <span>Progress</span>
                    <span>{Math.round(progress.progress)}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-landing-surface-muted">
                    <div
                      className="h-2 rounded-full bg-landing-accent transition-all"
                      style={{ width: `${progress.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {bookRequiresDonation && (
                <div
                  className={`mb-4 rounded-2xl border px-4 py-4 ${
                    access.hasAccess
                      ? 'border-emerald-200 bg-emerald-50/70'
                      : 'border-amber-200 bg-amber-50/80'
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-landing-accent">
                    {access.hasAccess
                      ? bookRequiresRecurringSupport
                        ? 'Sustainer support active'
                        : 'Supporter access active'
                      : bookRequiresRecurringSupport
                        ? 'Sustainer title'
                        : 'Supporter title'}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-landing-text-muted">
                    {access.hasAccess
                      ? bookRequiresRecurringSupport
                        ? 'Thanks for sustaining the work monthly — this sustainer release is unlocked on your account.'
                        : 'Thanks for supporting the work — this supporter release is unlocked on your account.'
                      : lockedSupportMessage}
                  </p>
                </div>
              )}

              {book.audiobook && access.hasAccess && (
                <Link
                  href={`/listen/${book.id}`}
                  className="mb-4 block w-full rounded-xl border border-landing-border bg-white py-3 text-center font-semibold text-landing-text transition-colors hover:border-landing-accent/40 hover:text-landing-accent"
                >
                  🎧 Listen to Audiobook
                </Link>
              )}

              {(book.amazonKdpUrl || book.printLinks.length > 0) && (
                <div className="mt-6 border-t border-landing-border pt-5">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-landing-text-muted">
                    Print Editions
                  </h3>
                  {book.amazonKdpUrl && (
                    <a
                      href={book.amazonKdpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mb-2 block w-full rounded-xl border border-landing-border bg-landing-surface-muted py-2 text-center text-sm font-medium text-landing-text transition-colors hover:border-landing-accent/30 hover:text-landing-accent"
                    >
                      📚 Amazon
                    </a>
                  )}
                  {book.printLinks.map((link) => (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mb-2 block w-full rounded-xl border border-landing-border bg-landing-surface-muted py-2 text-center text-sm text-landing-text transition-colors hover:border-landing-accent/30 hover:text-landing-accent"
                    >
                      {link.provider} ({link.format})
                    </a>
                  ))}
                </div>
              )}

              {session?.user?.role === 'ADMIN' && (
                <Link
                  href={`/admin/books/${book.id}`}
                  className="mt-3 block w-full rounded-xl border border-landing-border bg-white py-2 text-center text-sm text-landing-text-muted transition-colors hover:border-landing-accent/30 hover:text-landing-accent"
                >
                  Edit (Admin)
                </Link>
              )}
            </div>
          </div>

          {/* Right column - Details */}
          <div className="space-y-6 lg:col-span-2 min-w-0">
            {donationStatus === 'success' && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-5 py-4 text-sm text-emerald-800">
                Support contribution received successfully. {bookRequiresDonation ? 'This title is now unlocked on your account.' : 'Thank you for supporting the work.'}
              </div>
            )}

            {donationStatus === 'failed' && (
              <div className="rounded-2xl border border-red-200 bg-red-50/80 px-5 py-4 text-sm text-red-700">
                We couldn't confirm the donation. Please try again, and if the payment provider already charged you, we can reconcile it from the admin side.
              </div>
            )}

            {(book.donationEnabled || bookRequiresDonation || book.narrationEnabled) && (
              <section id="support-this-book">
                {paystackSubscription ? (
                  <div className="mb-6">
                    <PaystackSubscriptionManager
                      subscription={paystackSubscription}
                      returnTo={canonicalBookPath}
                      status={subscriptionStatus}
                    />
                  </div>
                ) : null}

                  <DonationSection
                    bookId={book.id}
                    bookTitle={book.title}
                    bookDonorAccessLevel={access.bookDonorAccessLevel}
                    donorOnly={book.donorOnly}
                    currentUserEmail={session?.user?.email ?? null}
                    message={
                      book.donationMessage ||
                      (bookRequiresDonation
                        ? defaultUnlockMessage
                        : book.narrationEnabled
                          ? defaultNarrationUnlockMessage
                        : undefined)
                    }
                    goal={book.donationGoal ? Number(book.donationGoal) : undefined}
                  />
              </section>
            )}

            <div className="surface-card p-4 sm:p-6 lg:p-8 w-full">
              <h1 className="font-playfair text-3xl sm:text-4xl font-semibold text-landing-text">
                {book.title}
              </h1>
              <p className="mt-2 text-xl text-landing-text-muted">{book.author}</p>

              <div className="mb-6 mt-5 flex flex-wrap gap-2">
                <span className="rounded-full bg-landing-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-landing-accent">
                  {book.status}
                </span>
                {book.narrationEnabled && (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                      donorFeatureAccess?.hasAccess
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-sky-100 text-sky-700'
                    }`}
                  >
                    {donorFeatureAccess?.hasAccess ? 'Narration Unlocked' : 'Donor Narration'}
                  </span>
                )}
                {bookRequiresDonation && (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                      access.hasAccess
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {accessBadgeLabel}
                  </span>
                )}
                {book.language && book.language !== 'en' && (
                  <span className="rounded-full bg-landing-surface-muted px-3 py-1 text-xs text-landing-text-muted">
                    {book.language.toUpperCase()}
                  </span>
                )}
              </div>

              {translations.length > 1 && (
                <div className="mb-6 rounded-2xl border border-landing-border bg-landing-surface-muted/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-landing-text-muted">
                    {t('availableIn')}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {translations.map((tBook) => (
                      <Link
                        key={tBook.id}
                        href={`/books/${tBook.slug || tBook.id}`}
                        className={`rounded-xl px-3.5 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
                          tBook.id === book.id
                            ? 'bg-landing-accent text-white shadow-sm'
                            : 'border border-landing-border bg-white text-landing-text-muted hover:border-landing-accent/40 hover:text-landing-accent'
                        }`}
                      >
                        {tBook.language ? tBook.language.toUpperCase() : 'UNKNOWN'}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-6 flex flex-wrap gap-2">
                {book.publisher && (
                  <span className="rounded-full bg-landing-surface-muted px-3 py-1 text-xs text-landing-text-muted">
                    {book.publisher}
                  </span>
                )}
                {book.publishedAt && (
                  <span className="rounded-full bg-landing-surface-muted px-3 py-1 text-xs text-landing-text-muted">
                    {new Date(book.publishedAt).getFullYear()}
                  </span>
                )}
                {book.isbn && (
                  <span className="rounded-full bg-landing-surface-muted px-3 py-1 font-mono text-xs text-landing-text-muted">
                    ISBN: {book.isbn}
                  </span>
                )}
              </div>

              {book.subjects && book.subjects.length > 0 && (
                <div className="mb-6">
                  <h3 className="mb-2 text-sm font-semibold text-landing-text-muted">Categories</h3>
                  <div className="flex flex-wrap gap-2">
                    {book.subjects.map((subject, index) => (
                      <span
                        key={index}
                        className="rounded-full border border-landing-border bg-white px-3 py-1 text-xs text-landing-text-muted"
                      >
                        {subject}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {book.description && (
                <div>
                  <h3 className="mb-2 text-lg font-semibold text-landing-text">About this book</h3>
                  <p className="whitespace-pre-wrap leading-relaxed text-landing-text-muted">
                    {book.description}
                  </p>
                </div>
              )}

              {book.narrationEnabled && donorNarrationMessage ? (
                <div
                  className={`mt-6 rounded-2xl border px-5 py-4 ${
                    donorFeatureAccess?.hasAccess
                      ? 'border-emerald-200 bg-emerald-50/70'
                      : 'border-sky-200 bg-sky-50/80'
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-landing-accent">
                    Donor narration
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-landing-text-muted">
                    {donorNarrationMessage}
                  </p>

                  {!donorFeatureAccess?.hasAccess ? (
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <a href="#support-this-book" className="ghost-button px-5 py-3 text-center">
                        Unlock donor narration
                      </a>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {bookRequiresDonation && !access.hasAccess && (
                <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/80 p-5">
                  <h3 className="text-lg font-semibold text-landing-text">This book is reserved for {lockedAudienceLabel}</h3>
                  <p className="mt-2 leading-relaxed text-landing-text-muted">
                    Access is unlocked after {donorRequirementText}.
                    {session
                      ? ' Once that donation clears, you can open this title immediately.'
                      : ' Enter your email in the support section below to unlock this title.'}
                  </p>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <a href="#support-this-book" className="brand-button px-5 py-3 text-center">
                      {supportCallToAction}
                    </a>
                    {!session && (
                      <Link href={loginHref} className="ghost-button px-5 py-3 text-center">
                        Already supported? Sign in
                      </Link>
                    )}
                    <Link href="/library" className="ghost-button px-5 py-3 text-center">
                      Browse library
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {supplementaryContents.length > 0 && (
              <div className="space-y-4">
                <h2 className="font-playfair text-3xl font-semibold text-landing-text">Explore More</h2>
                <div className="grid gap-4">
                  {supplementaryContents.map((item) => {
                    const itemAccess = getContentAccessStateForViewer(item, contentViewerAccess);
                    const accessBadgeLabel = getBookAccessBadgeLabel(itemAccess.contentDonorAccessLevel, itemAccess.hasAccess);
                    const accessBadgeClasses = itemAccess.hasAccess
                      ? 'bg-emerald-100 text-emerald-700'
                      : itemAccess.contentDonorAccessLevel === 'RECURRING_DONORS'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-violet-100 text-violet-700';
                    const posterUrl = item.coverUrl || book.coverUrl || null;

                    return (
                      <div key={item.id} className="surface-card p-4 sm:p-6 w-full">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          {itemAccess.requiresDonation ? (
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${accessBadgeClasses}`}>
                              {accessBadgeLabel}
                            </span>
                          ) : null}
                          <span className="rounded-full bg-landing-accent/10 px-2.5 py-1 text-xs font-semibold text-landing-accent">
                            {item.type}
                          </span>
                        </div>

                        {item.type === 'VIDEO' && (
                          <div>
                            <h3 className="mb-3 text-lg font-semibold text-landing-text">{item.title}</h3>
                            {item.summary || item.content ? (
                              <p className="mb-3 text-sm leading-relaxed text-landing-text-muted">
                                {item.summary || item.content}
                              </p>
                            ) : null}

                            {(() => {
                              const videoHref = getVideoWatchPath(item);

                              return (
                                <>
                                  <Link
                                    href={videoHref}
                                    className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2"
                                  >
                                    <div className="relative aspect-video overflow-hidden rounded-xl border border-landing-border bg-landing-surface-muted">
                                      {posterUrl ? (
                                        <img src={posterUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
                                      ) : (
                                        <div className="h-full w-full bg-[radial-gradient(circle_at_top,rgba(61,115,122,0.3),rgba(15,23,42,0.92)_65%)]" />
                                      )}
                                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.15),rgba(2,6,23,0.72))]" />
                                      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-4 text-white">
                                        <span className="rounded-full bg-white/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/85 ring-1 ring-white/15 backdrop-blur-md">
                                          Dedicated watch page
                                        </span>
                                        {itemAccess.requiresDonation ? (
                                          <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${accessBadgeClasses}`}>
                                            {accessBadgeLabel}
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/14 text-white shadow-[0_16px_40px_-18px_rgba(15,23,42,0.95)] backdrop-blur-md transition-transform duration-300 group-hover:scale-105">
                                          <Play className="ml-1 h-8 w-8" fill="currentColor" />
                                        </span>
                                      </div>
                                      <div className="absolute inset-x-0 bottom-0 px-5 py-4 text-center text-sm text-white/88">
                                        {itemAccess.hasAccess
                                          ? 'Open the dedicated video page to watch this screening.'
                                          : 'Open the video page for access details and donor unlock options.'}
                                      </div>
                                    </div>
                                  </Link>

                                  <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                                    <Link href={videoHref} className="inline-flex items-center gap-2 font-semibold text-landing-accent transition-colors hover:text-landing-accent-secondary">
                                      Open video page
                                      <ArrowRight className="h-4 w-4" />
                                    </Link>
                                    <span className="text-landing-text-muted">
                                      {itemAccess.hasAccess
                                        ? 'Playback now happens on its own watch page.'
                                        : 'Unlock and playback both happen from the watch page.'}
                                    </span>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        )}

                        {item.type === 'ARTICLE' && (
                          <div>
                            <h3 className="mb-2 text-lg font-semibold text-landing-text">{item.title}</h3>
                            {(item.summary || item.content) && (
                              <div className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-landing-text-muted">
                                {itemAccess.hasAccess
                                  ? truncatePreview(item.summary || item.content, 300)
                                  : truncatePreview(item.summary || item.content, 220)}
                              </div>
                            )}
                            {itemAccess.hasAccess && item.url ? (
                              <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-medium text-landing-accent hover:text-landing-accent-secondary">
                                Read Full Article ↗
                              </a>
                            ) : null}
                          </div>
                        )}

                        {item.type === 'POEM' && (
                          <div className="surface-muted p-4 sm:p-6 text-center font-serif italic">
                            <h3 className="mb-4 font-playfair text-xl sm:text-2xl font-semibold not-italic text-landing-text">{item.title}</h3>
                            <div className="mx-auto max-w-lg whitespace-pre-wrap leading-relaxed text-landing-text-muted">
                              {itemAccess.hasAccess ? item.content : truncatePreview(item.summary || item.content, 240)}
                            </div>
                            {item.author && (
                              <p className="mt-4 text-sm text-landing-text-muted not-italic">— {item.author}</p>
                            )}
                          </div>
                        )}

                        {item.type === 'QUOTE' && (
                          <div className="my-2 border-l-4 border-landing-accent pl-6 py-2">
                            <blockquote className="mb-2 text-xl font-medium italic text-landing-text">
                              &ldquo;{itemAccess.hasAccess ? item.content : truncatePreview(item.content, 120)}&rdquo;
                            </blockquote>
                            {item.author && (
                              <cite className="text-sm font-medium not-italic text-landing-text-muted">
                                — {item.author}
                              </cite>
                            )}
                            {item.title && <p className="mt-1 text-xs text-landing-text-muted">{item.title}</p>}
                          </div>
                        )}

                        {!itemAccess.hasAccess ? (
                          <DonorAccessLock
                            accessLevel={itemAccess.contentDonorAccessLevel}
                            isSignedIn={Boolean(session?.user?.id)}
                            loginHref={loginHref}
                            supportHref="#support-this-book"
                            supportLabel={getBookSupportCallToAction(itemAccess.contentDonorAccessLevel)}
                            secondaryHref="/library"
                            secondaryLabel="Browse library"
                            title={`Donor-only ${item.type.toLowerCase()}`}
                            message={item.type === 'VIDEO'
                              ? 'This video is reserved for supporters. Unlock it on your account to start playback from the dedicated watch page.'
                              : `This ${item.type.toLowerCase()} is reserved for supporters. Unlock it on your account to open the full piece here.`}
                            className="mt-4"
                          />
                        ) : item.type !== 'VIDEO' ? (
                          <ContentNarrationPlayer contentId={item.id} compact />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

      <Footer />
    </main>
  );
}
