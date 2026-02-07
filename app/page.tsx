import { prisma } from '@/lib/prisma';
import Header from '@/components/landing/Header';
import HeroSection from '@/components/landing/HeroSection';
import BookCard from '@/components/landing/BookCard';
import Footer from '@/components/landing/Footer';
import Link from 'next/link';

export default async function LandingPage() {
  // Fetch published books
  const books = await prisma.book.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { createdAt: 'desc' },
    take: 8, // Show max 8 books on landing page
  });

  return (
    <main className="min-h-screen bg-landing-bg">
      {/* Header */}
      <Header />
      {/* Hero Section */}
      <HeroSection />

      {/* What Is Section */}
      <section className="max-w-4xl mx-auto px-6 py-20">
        <h2 className="font-playfair text-4xl md:text-5xl font-bold text-landing-text mb-8">
          What Is the One Man Revolution?
        </h2>
        <div className="space-y-6 font-inter text-lg text-landing-text leading-relaxed">
          <p>
            The One Man Revolution is not about overthrowing governments or
            building followings.
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
          <p className="text-landing-text-muted italic">
            No leaders. No hierarchy. No permission required.
          </p>
        </div>
      </section>

      {/* Why Section */}
      <section className="max-w-4xl mx-auto px-6 py-20">
        <h2 className="font-playfair text-4xl md:text-5xl font-bold text-landing-text mb-8">
          Why This Exists
        </h2>
        <div className="space-y-6 font-inter text-lg text-landing-text leading-relaxed">
          <p>
            The world does not suffer from lack of information. It suffers from
            the suppression of inner truth.
          </p>
          <p>
            This work exists to expose spiritual warfare disguised as progress,
            reclaim human purpose beyond systems, and awaken remembrance — not
            belief.
          </p>
          <p className="text-landing-text-muted italic">
            This is not ideology.
            <br />
            It is deprogramming.
          </p>
        </div>
      </section>

      {/* Books Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="max-w-4xl mb-12">
          <h2 className="font-playfair text-4xl md:text-5xl font-bold text-landing-text mb-8">
            The Writings
          </h2>
          <div className="space-y-4 font-inter text-lg text-landing-text leading-relaxed">
            <p>These books are free.</p>
            <p>
              Not as a promotion.
              <br />
              Not as a tactic.
              <br />
              But because truth cannot be sold without being compromised.
            </p>
          </div>
        </div>

        {books.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
              {books.map((book) => (
                <BookCard
                  key={book.id}
                  id={book.id}
                  title={book.title}
                  author={book.author}
                  description={book.description}
                  coverUrl={book.coverUrl}
                />
              ))}
            </div>
            <p className="font-inter text-landing-text-muted italic text-center">
              No account. No paywall. No obligation.
            </p>
          </>
        ) : (
          <div className="text-center py-12">
            <p className="font-inter text-landing-text-muted">
              Books coming soon...
            </p>
          </div>
        )}
      </section>

      {/* Donation Section */}
      <section
        id="donate"
        className="max-w-4xl mx-auto px-6 py-20"
      >
        <div className="bg-gradient-to-br from-landing-bg-secondary to-purple-50/30 border border-landing-border rounded-2xl p-12 text-center">
          <h2 className="font-playfair text-4xl md:text-5xl font-bold text-landing-text mb-6">
            Support the Work
          </h2>
          <div className="space-y-6 font-inter text-lg text-landing-text leading-relaxed max-w-2xl mx-auto mb-8">
            <p>This work is offered freely to everyone.</p>
            <p>
              If it resonates, you may choose to support its continuation. Your
              contribution does not purchase access. It preserves independence.
            </p>
          </div>
          <Link
            href="/library"
            className="inline-block px-8 py-4 bg-landing-accent text-white font-semibold rounded-lg hover:bg-landing-accent-secondary transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-landing-accent/30"
          >
            Explore the Library
          </Link>
          <p className="font-inter text-sm text-landing-text-muted italic mt-6">
            Give only if moved. Never out of obligation.
          </p>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </main>
  );
}
