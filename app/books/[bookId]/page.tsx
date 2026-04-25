import { notFound } from 'next/navigation';
import { getBookAccessState } from '@/lib/book-access';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Link from 'next/link';
import Image from 'next/image';
import DonationSection from '@/components/DonationSection';
import Header from '@/components/landing/Header';
import Footer from '@/components/landing/Footer';

export default async function BookDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookId: string }>;
  searchParams?: Promise<{ donation?: string }>;
}) {
  const { bookId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const session = await getServerSession(authOptions);

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    include: {
      epubFile: true,
      audiobook: true,
      printLinks: true,
      supplementaryContents: {
        orderBy: { order: 'asc' }
      },
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

  const access = await getBookAccessState(book, session?.user);

  if (!access.isPublished && !access.isPrivileged) {
    notFound();
  }

  const progress = access.hasAccess && session?.user?.id ? book.readingProgress?.[0] : null;
  const donationStatus = resolvedSearchParams?.donation;
  const loginHref = `/login?callbackUrl=${encodeURIComponent(`/books/${book.id}`)}`;

  return (
    <main className="page-shell">
      <Header />

      <div className="page-container py-10 sm:py-14">
        <Link
          href="/library"
          className="ghost-button mb-8 px-4 py-2"
        >
          ← Back to Library
        </Link>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left column - Cover and actions */}
          <div className="lg:col-span-1">
            <div className="surface-card sticky top-28 p-6">
              {/* Cover */}
              <div className="relative mb-6 aspect-[2/3] overflow-hidden rounded-xl bg-gradient-to-br from-landing-accent/10 to-landing-bg">
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
                <Link
                  href={`/read/${book.id}`}
                  className="brand-button mb-4 block w-full text-center"
                >
                  {progress ? 'Continue Reading' : 'Start Reading'}
                </Link>
              ) : session ? (
                <a
                  href="#support-this-book"
                  className="brand-button mb-4 block w-full text-center"
                >
                  Donate to Unlock
                </a>
              ) : (
                <Link
                  href={loginHref}
                  className="brand-button mb-4 block w-full text-center"
                >
                  Sign in to Unlock
                </Link>
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

              {book.donorOnly && (
                <div
                  className={`mb-4 rounded-2xl border px-4 py-4 ${
                    access.hasAccess
                      ? 'border-emerald-200 bg-emerald-50/70'
                      : 'border-amber-200 bg-amber-50/80'
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-landing-accent">
                    {access.hasAccess ? 'Donor access active' : 'Donor-only title'}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-landing-text-muted">
                    {access.hasAccess
                      ? 'Thanks for supporting the work — this donor release is unlocked on your account.'
                      : session
                        ? 'Make one completed donation to unlock this book and future donor releases.'
                        : 'Sign in first, then donate to unlock this book and the donor library.'}
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
          <div className="space-y-6 lg:col-span-2">
            {donationStatus === 'success' && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-5 py-4 text-sm text-emerald-800">
                Donation received successfully. {book.donorOnly ? 'This donor-only title is now unlocked on your account.' : 'Thank you for supporting the work.'}
              </div>
            )}

            {donationStatus === 'failed' && (
              <div className="rounded-2xl border border-red-200 bg-red-50/80 px-5 py-4 text-sm text-red-700">
                We couldn’t confirm the donation. Please try again, and if PayPal already charged you, we can reconcile it from the admin side.
              </div>
            )}

            <div className="surface-card p-6 sm:p-8">
              <h1 className="font-playfair text-4xl font-semibold text-landing-text">
                {book.title}
              </h1>
              <p className="mt-2 text-xl text-landing-text-muted">{book.author}</p>

              <div className="mb-6 mt-5 flex flex-wrap gap-2">
                <span className="rounded-full bg-landing-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-landing-accent">
                  {book.status}
                </span>
                {book.donorOnly && (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                      access.hasAccess
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {access.hasAccess ? 'Donor Access' : 'Donors Only'}
                  </span>
                )}
                {book.language && book.language !== 'en' && (
                  <span className="rounded-full bg-landing-surface-muted px-3 py-1 text-xs text-landing-text-muted">
                    {book.language.toUpperCase()}
                  </span>
                )}
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

              {book.donorOnly && !access.hasAccess && (
                <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/80 p-5">
                  <h3 className="text-lg font-semibold text-landing-text">This book is part of the donor library</h3>
                  <p className="mt-2 leading-relaxed text-landing-text-muted">
                    Access is unlocked after at least one completed donation on your account.
                    {session
                      ? ' Once that donation clears, you can open this title immediately.'
                      : ' Sign in first so we can attach donor access to your library.'}
                  </p>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    {session ? (
                      <a href="#support-this-book" className="brand-button px-5 py-3 text-center">
                        Donate and unlock
                      </a>
                    ) : (
                      <Link href={loginHref} className="brand-button px-5 py-3 text-center">
                        Sign in to continue
                      </Link>
                    )}
                    <Link href="/library" className="ghost-button px-5 py-3 text-center">
                      Browse library
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {(book.donationEnabled || book.donorOnly) && (
              <section id="support-this-book">
                {book.donorOnly && !session ? (
                  <div className="surface-card p-6 sm:p-8">
                    <h2 className="font-playfair text-3xl font-semibold text-landing-text">
                      Sign in before donating
                    </h2>
                    <p className="mt-3 leading-relaxed text-landing-text-muted">
                      Donor access is tied to your account, so please sign in first. Then any completed donation will unlock this book.
                    </p>
                    <Link href={loginHref} className="brand-button mt-6 inline-flex px-6 py-3">
                      Sign in to continue
                    </Link>
                  </div>
                ) : (
                  <DonationSection
                    bookId={book.id}
                    bookTitle={book.title}
                    message={
                      book.donationMessage ||
                      (book.donorOnly
                        ? 'Make any completed donation to unlock this donor-only book and future donor releases on your account.'
                        : undefined)
                    }
                    goal={book.donationGoal ? Number(book.donationGoal) : undefined}
                  />
                )}
              </section>
            )}

            {book.supplementaryContents && book.supplementaryContents.length > 0 && (
              <div className="space-y-4">
                <h2 className="font-playfair text-3xl font-semibold text-landing-text">Explore More</h2>
                <div className="grid gap-4">
                  {book.supplementaryContents.map((item) => (
                    <div key={item.id} className="surface-card p-6">
                      {item.type === 'VIDEO' && (
                        <div>
                          <h3 className="mb-3 text-lg font-semibold text-landing-text">{item.title}</h3>
                          {item.url && (
                             <div className="aspect-video overflow-hidden rounded-xl border border-landing-border bg-landing-surface-muted">
                                {item.url.includes('youtube.com') || item.url.includes('youtu.be') ? (
                                   <iframe 
                                     src={item.url.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')}
                                     className="h-full w-full"
                                     allowFullScreen
                                   />
                                ) : (
                                   <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex h-full items-center justify-center text-landing-accent hover:underline">
                                     Watch Video ↗
                                   </a>
                                )}
                             </div>
                          )}
                        </div>
                      )}
                      
                      {item.type === 'ARTICLE' && (
                        <div>
                          <h3 className="mb-2 text-lg font-semibold text-landing-text">{item.title}</h3>
                          {item.content && (
                            <div className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-landing-text-muted">
                              {item.content.length > 300 ? `${item.content.slice(0, 300)}...` : item.content}
                            </div>
                          )}
                          {item.url && (
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-medium text-landing-accent hover:text-landing-accent-secondary">
                              Read Full Article ↗
                            </a>
                          )}
                        </div>
                      )}

                      {item.type === 'POEM' && (
                        <div className="surface-muted p-6 text-center font-serif italic">
                          <h3 className="mb-4 font-playfair text-2xl font-semibold not-italic text-landing-text">{item.title}</h3>
                          <div className="mx-auto max-w-lg whitespace-pre-wrap leading-relaxed text-landing-text-muted">
                            {item.content}
                          </div>
                          {item.author && (
                            <p className="mt-4 text-sm text-landing-text-muted not-italic">— {item.author}</p>
                          )}
                        </div>
                      )}

                      {item.type === 'QUOTE' && (
                        <div className="my-2 border-l-4 border-landing-accent pl-6 py-2">
                           <blockquote className="mb-2 text-xl font-medium italic text-landing-text">
                             "{item.content}"
                           </blockquote>
                           {item.author && (
                             <cite className="text-sm font-medium not-italic text-landing-text-muted">
                               — {item.author}
                             </cite>
                           )}
                           {item.title && <p className="mt-1 text-xs text-landing-text-muted">{item.title}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
