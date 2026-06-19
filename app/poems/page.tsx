import { authOptions } from '@/lib/auth';
import { getContentAccessStateForViewer, getDonorAccessState } from '@/lib/book-access';
import { getBookAccessBadgeLabel, getBookSupportCallToAction } from '@/lib/book-access-config';
import { withContentFeatureFallback } from '@/lib/content';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import DonorAccessLock from '@/components/DonorAccessLock';
import Header from '@/components/landing/Header';
import Footer from '@/components/landing/Footer';
import ContentNarrationPlayer from '@/components/ContentNarrationPlayer';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Poems | One Man Revolution',
  description: 'Poetry collection from our books.',
};

function truncatePreview(text: string | null | undefined, maxLength = 260) {
  if (!text) {
    return null;
  }

  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
}

export default async function PoemsPage() {
  const session = await getServerSession(authOptions);
  const viewerAccess = await getDonorAccessState(session?.user);
  const poems = await withContentFeatureFallback(
    () => prisma.supplementaryContent.findMany({
      where: {
        type: 'POEM',
        status: 'PUBLISHED',
      },
      include: {
        book: {
          select: {
            title: true,
            slug: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    }),
    [],
    'poems listing'
  );
  const loginHref = `/login?callbackUrl=${encodeURIComponent('/poems')}`;

  return (
    <main className="page-shell">
      <Header />

      <div className="mx-auto w-full max-w-4xl px-5 py-14 sm:px-8 sm:py-16">
        <div className="mb-14 text-center">
          <h1 className="font-playfair text-5xl font-semibold italic text-landing-text">Poetry Collection</h1>
          <div className="mx-auto mt-5 h-1 w-24 rounded-full bg-landing-accent/30"></div>
        </div>

        <div className="space-y-10">
          {poems.map((poem) => {
            const poemAccess = getContentAccessStateForViewer(poem, viewerAccess);
            const supportHref = poem.book
              ? `/books/${poem.book.slug || poem.bookId}#support-this-book`
              : '/support';
            const badgeLabel = getBookAccessBadgeLabel(poemAccess.contentDonorAccessLevel, poemAccess.hasAccess);
            const badgeClasses = poemAccess.hasAccess
              ? 'bg-emerald-100 text-emerald-700'
              : poemAccess.contentDonorAccessLevel === 'RECURRING_DONORS'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-violet-100 text-violet-700';
            const previewText = poemAccess.hasAccess ? poem.content : truncatePreview(poem.summary || poem.content);

            return (
              <article key={poem.id} className="surface-card p-8 sm:p-10">
                <div className="mb-8 text-center">
                  {poemAccess.requiresDonation ? (
                    <div className="mb-4 flex justify-center">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClasses}`}>
                        {badgeLabel}
                      </span>
                    </div>
                  ) : null}
                  <h2 className="font-playfair text-4xl font-semibold text-landing-text">{poem.title}</h2>
                  {poem.author && (
                    <p className="mt-2 font-serif italic text-landing-text-muted">by {poem.author}</p>
                  )}
                </div>

                <div className="mx-auto whitespace-pre-wrap text-center font-serif text-lg leading-relaxed text-landing-text">
                  {previewText}
                </div>

                {poemAccess.hasAccess ? (
                  <div className="mx-auto max-w-xl">
                    <ContentNarrationPlayer contentId={poem.id} />
                  </div>
                ) : (
                  <DonorAccessLock
                    accessLevel={poemAccess.contentDonorAccessLevel}
                    isSignedIn={viewerAccess.isSignedIn}
                    loginHref={loginHref}
                    supportHref={supportHref}
                    supportLabel={poem.book ? getBookSupportCallToAction(poemAccess.contentDonorAccessLevel) : 'Support the Revolution'}
                    secondaryHref={poem.book ? `/books/${poem.book.slug || poem.bookId}` : '/library'}
                    secondaryLabel={poem.book ? 'Open related book' : 'Browse library'}
                    title="Supporter-only poem"
                    message="This poem is reserved for supporters. Unlock it on your account to reveal the full piece and any supporter narration attached to it."
                    className="mx-auto mt-6 max-w-2xl"
                  />
                )}

                <div className="mt-8 text-center">
                  {poem.book ? (
                    <Link 
                      href={`/books/${poem.book.slug || poem.bookId}`}
                      className="inline-block border-b border-transparent pb-1 text-xs uppercase tracking-[0.16em] text-landing-text-muted transition-colors hover:border-landing-accent/40 hover:text-landing-accent"
                    >
                      From: {poem.book.title}
                    </Link>
                  ) : (
                    <span className="text-xs uppercase tracking-[0.16em] text-landing-text-muted">Standalone poem</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {poems.length === 0 && (
          <div className="surface-card py-20 text-center">
            <p className="font-serif text-lg italic text-landing-text-muted">Silence matches the empty page...</p>
          </div>
        )}
      </div>

      <Footer />
    </main>
  );
}
