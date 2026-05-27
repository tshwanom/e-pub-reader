import { getUserDonorProfile, isPrivilegedUser } from '@/lib/book-access';
import { BookStatus } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import {
  type DonorTier,
  hasBookAccessForDonorTier,
  resolveBookDonorAccessLevel,
} from '@/lib/book-access-config';
import { prisma } from '@/lib/prisma';
import Header from '@/components/landing/Header';
import HeroSection from '@/components/landing/HeroSection';
import BookCard from '@/components/landing/BookCard';
import DonationSection from '@/components/DonationSection';
import Footer from '@/components/landing/Footer';
import Link from 'next/link';
import { getServerSession } from 'next-auth';

export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  let session = null;
  let isPrivileged = false;
  let donorTier: DonorTier = 'NONE';
  let books: Awaited<ReturnType<typeof prisma.book.findMany>> = [];

  try {
    session = await getServerSession(authOptions);
    isPrivileged = isPrivilegedUser(session?.user);

    if (!isPrivileged) {
      donorTier = (await getUserDonorProfile(session?.user)).tier;
    }
  } catch (err) {
    console.error('[LandingPage] Failed to resolve session:', err);
  }

  try {
    // Fetch published books
    books = await prisma.book.findMany({
      where: { status: { in: [BookStatus.PUBLISHED, BookStatus.COMING_SOON, BookStatus.PRE_RELEASE] } },
      orderBy: { createdAt: 'desc' },
      take: 8, // Show max 8 books on landing page
      include: {
        printLinks: { select: { id: true } },
      },
    });
  } catch (err) {
    console.error('[LandingPage] Failed to fetch books:', err);
  }

  return (
    <main className="page-shell">
      {/* Header */}
      <Header />
      {/* Hero Section */}
      <HeroSection />

      {/* Books Section */}
      <section className="page-container scroll-mt-36 py-14 sm:scroll-mt-40 sm:py-20">
        <div className="mx-auto mb-12 max-w-4xl text-center">
          <h2 className="font-playfair text-4xl font-semibold text-landing-text md:text-5xl">
            The Books
          </h2>
          <div className="mx-auto mt-6 max-w-3xl space-y-4 text-lg leading-relaxed text-landing-text-muted">
            <p>
              Most of these books are free. Not as a promotion. Not as a tactic. But because truth should travel
              further than any sales funnel. Some special editions are reserved for donors who keep the work
              independent.
            </p>
          </div>
        </div>

        {books.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
              {books.map((book) => (
                <BookCard
                  key={book.id}
                  id={book.id}
                  slug={book.slug}
                  title={book.title}
                  author={book.author}
                  description={book.description}
                  coverUrl={book.coverUrl}
                  status={book.status}
                  donorAccessLevel={book.donorAccessLevel}
                  donorOnly={book.donorOnly}
                  hasPrintVersion={'printLinks' in book ? (book.printLinks as { id: string }[]).length > 0 : false}
                  isAccessible={
                    isPrivileged
                    || hasBookAccessForDonorTier(resolveBookDonorAccessLevel(book), donorTier)
                  }
                />
              ))}
            </div>
            <p className="mt-8 text-center italic text-landing-text-muted">
              Read freely, and support if you want deeper access to donor releases.
            </p>
          </>
        ) : (
          <div className="surface-card py-12 text-center">
            <p className="text-landing-text-muted">
              Books coming soon...
            </p>
          </div>
        )}
      </section>

      {/* Donation Section */}
      <section
        id="donate"
        className="page-container py-16"
      >
        <div className="surface-card px-8 py-12 text-center sm:px-12">
          <h2 className="font-playfair text-4xl font-semibold text-landing-text md:text-5xl">
            Support the Work
          </h2>
          <div className="mx-auto mb-8 mt-6 max-w-3xl space-y-6 text-lg leading-relaxed text-landing-text-muted">
            <p>
              We provide most of our books for free, with some reserved for our donors to keep the One Man Revolution alive.
            </p>
            <p>
              We need to convert our books to audiobooks, as well as dubbing and translating them into other languages. Furthermore, the servers that host this library cost money to maintain.
            </p>
            <p>
              If it resonates, you may choose to support its continuation. Your contribution preserves our independence and makes this expansion possible. If you cannot donate, we encourage you to at least share our work to help spread the word.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <DonationSection
              bookTitle="One Man Revolution"
              currentUserEmail={session?.user?.email ?? null}
              triggerVariant="button"
              triggerLabel="Support the Revolution"
              triggerClassName="brand-button min-w-[15rem] px-8 py-4 text-base shadow-md shadow-landing-accent/20 ring-1 ring-landing-accent/15 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-landing-accent/20"
              modalBadgeLabel="Reader-supported"
              modalTitle="Support the Work"
              modalDescription="Keep the library independent, expand narration, and help the writings travel further. Choose one-time or monthly support in the currency and checkout flow that suits you."
            />
            <Link
              href="/library"
              className="ghost-button min-w-[15rem] bg-white/80 px-8 py-4 text-base"
            >
              Explore the Library
            </Link>
          </div>
          <p className="mt-6 text-sm italic text-landing-text-muted">
            Give only if moved. Never out of obligation.
          </p>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </main>
  );
}
