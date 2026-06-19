import { getUserDonorProfile, isPrivilegedUser } from '@/lib/book-access';
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
      where: { status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      take: 8, // Show max 8 books on landing page
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
      <section className="page-container py-14 sm:py-20">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <h2 className="font-playfair text-4xl font-semibold text-landing-text md:text-5xl">
            The Writings
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-landing-text-muted">
            Most of these books are free—not as a promotion, not as a tactic, but because truth should travel further than any sales funnel. Some special editions are reserved for donors who keep the work independent.
          </p>
        </div>

        {books.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
              {books.map((book) => (
                <BookCard
                  key={book.id}
                  id={book.id}
                  title={book.title}
                  author={book.author}
                  description={book.description}
                  coverUrl={book.coverUrl}
                  donorAccessLevel={book.donorAccessLevel}
                  donorOnly={book.donorOnly}
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

      {/* Support Section */}
      <section
        id="support"
        className="page-container py-16"
      >
        <div className="surface-card px-8 py-12 text-center sm:px-12">
          <h2 className="font-playfair text-4xl font-semibold text-landing-text md:text-5xl">
            Support the Mission
          </h2>
          <div className="mx-auto mb-8 mt-6 max-w-3xl space-y-6 text-lg leading-relaxed text-landing-text-muted">
            <p>
              Knowledge that can help awaken, empower, and liberate human beings should not be hidden behind a paywall. That is why the majority of our library is available free of charge.
            </p>
            <p className="font-semibold text-landing-text">
              Support is not payment for information. Support is participation in the mission.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/support"
              className="brand-button min-w-[15rem] px-8 py-4 text-base shadow-md shadow-landing-accent/20 ring-1 ring-landing-accent/15 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-landing-accent/20"
            >
              Read the Funding Declaration
            </Link>
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
