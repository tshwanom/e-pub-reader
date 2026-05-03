import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="page-shell">
      <section className="page-container flex min-h-[70vh] items-center justify-center py-16 sm:py-24">
        <div className="surface-card max-w-2xl p-8 text-center sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">
            404 · Page not found
          </p>
          <h1 className="mt-4 font-playfair text-4xl font-semibold text-landing-text sm:text-5xl">
            This page wandered off the path.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-landing-text-muted sm:text-lg">
            The page you were looking for doesn’t exist, was moved, or is keeping a very low profile.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/" className="brand-button px-6 py-3 text-center">
              Return home
            </Link>
            <Link href="/library" className="ghost-button px-6 py-3 text-center">
              Browse the library
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
