import { isUserDonor } from '@/lib/book-access';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Header from '@/components/landing/Header';
import HeroSection from '@/components/landing/HeroSection';
import BookCard from '@/components/landing/BookCard';
import Footer from '@/components/landing/Footer';
import Link from 'next/link';
import { getServerSession } from 'next-auth';

export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  const isDonor = await isUserDonor(session?.user?.id);

  // Fetch published books
  const books = await prisma.book.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { createdAt: 'desc' },
    take: 8, // Show max 8 books on landing page
  });

  return (
    <main className="page-shell">
      {/* Header */}
      <Header />
      {/* Hero Section */}
      <HeroSection />

      {/* Core Narrative Section */}
      <section className="page-container py-14 sm:py-20">
        <div className="mx-auto mb-10 max-w-3xl text-center sm:mb-14">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-landing-accent">
            The Foundation
          </p>
          <h2 className="mt-4 font-playfair text-4xl font-semibold text-landing-text md:text-5xl">
            What it is. Why it exists.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-landing-text-muted sm:text-lg">
            Two truths that frame the project: inner sovereignty first, and
            deprogramming over ideology.
          </p>
        </div>

        <div className="relative grid gap-5 lg:grid-cols-2 lg:gap-6">
          <div className="pointer-events-none absolute bottom-8 left-1/2 top-8 hidden w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-landing-accent/30 to-transparent lg:block" />

          <article className="surface-card h-full p-8 sm:p-10">
            <span className="inline-flex rounded-full bg-landing-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-landing-accent">
              01 · What Is
            </span>
            <h3 className="mt-5 font-playfair text-3xl font-semibold text-landing-text sm:text-4xl">
              What Is the One Man Revolution?
            </h3>

            <div className="mt-6 space-y-5 text-base leading-relaxed text-landing-text sm:text-lg">
              <p>
                It is not about overthrowing governments or building followings.
              </p>
              <p>
                It is about dismantling the invisible systems that program
                obedience, medicalize awakening, and turn human beings into
                compliant units.
              </p>
              <p>
                This revolution begins in one place only:
                <br />
                <strong>the inner sovereignty of a single human being.</strong>
              </p>
            </div>

            <p className="mt-7 border-l-2 border-landing-accent/40 pl-4 text-sm italic text-landing-text-muted sm:text-base">
              No leaders. No hierarchy. No permission required.
            </p>
          </article>

          <article className="surface-muted h-full p-8 sm:p-10">
            <span className="inline-flex rounded-full bg-landing-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-landing-accent">
              02 · Why This Exists
            </span>
            <h3 className="mt-5 font-playfair text-3xl font-semibold text-landing-text sm:text-4xl">
              Why This Exists
            </h3>

            <div className="mt-6 space-y-5 text-base leading-relaxed text-landing-text sm:text-lg">
              <p>
                The world does not suffer from lack of information. It suffers
                from the suppression of inner truth.
              </p>
              <p>
                This work exists to expose spiritual warfare disguised as
                progress, reclaim human purpose beyond systems, and awaken
                remembrance — not belief.
              </p>
            </div>

            <p className="mt-7 border-l-2 border-landing-accent/40 pl-4 text-sm italic text-landing-text-muted sm:text-base">
              This is not ideology.
              <br />
              It is deprogramming.
            </p>
          </article>
        </div>
      </section>

      {/* Books Section */}
      <section className="page-container py-14 sm:py-20">
        <div className="mb-12 max-w-4xl">
          <h2 className="font-playfair text-4xl font-semibold text-landing-text md:text-5xl">
            The Writings
          </h2>
          <div className="mt-6 space-y-4 text-lg leading-relaxed text-landing-text-muted">
            <p>Most of these books are free.</p>
            <p>
              Not as a promotion.
              <br />
              Not as a tactic.
              <br />
              But because truth should travel further than any sales funnel.
            </p>
            <p>Some special editions are reserved for donors who keep the work independent.</p>
          </div>
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
                  donorOnly={book.donorOnly}
                  isAccessible={!book.donorOnly || isDonor}
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
          <Link
            href="/library"
            className="brand-button px-8 py-4 text-base"
          >
            Explore the Library
          </Link>
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
