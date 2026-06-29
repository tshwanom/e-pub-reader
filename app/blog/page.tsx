import { authOptions } from '@/lib/auth';
import { getContentAccessStateForViewer, getDonorAccessState } from '@/lib/book-access';
import { getBookAccessBadgeLabel, getBookSupportCallToAction } from '@/lib/book-access-config';
import { withContentFeatureFallback } from '@/lib/content';
import { prisma } from '@/lib/prisma';
import Image from 'next/image';
import Link from 'next/link';
import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import DonorAccessLock from '@/components/DonorAccessLock';
import Header from '@/components/landing/Header';
import Footer from '@/components/landing/Footer';
import ContentNarrationPlayer from '@/components/ContentNarrationPlayer';
import { getLocale, getTranslations } from '@/lib/i18n-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Blog | One Man Revolution',
  description: 'Articles and essays from our collection.',
};

type ArticleListItem = {
  id: string;
  status: string;
  title: string;
  content: string | null;
  summary: string | null;
  url: string | null;
  author: string | null;
  donorOnly: boolean;
  donorAccessLevel: string;
  bookId: string | null;
  createdAt: Date;
  book: {
    title: string;
    slug: string | null;
    coverUrl: string | null;
  } | null;
};

export default async function BlogPage() {
  const session = await getServerSession(authOptions);
  const viewerAccess = await getDonorAccessState(session?.user);
  const locale = await getLocale();
  const { t } = await getTranslations();

  const articles = await withContentFeatureFallback(
    async () => prisma.supplementaryContent.findMany({
      where: {
        type: 'ARTICLE',
        status: 'PUBLISHED',
        ...(locale === 'en'
          ? { OR: [{ language: 'en' }, { language: null }] }
          : { language: locale }),
      },
      include: {
        book: {
          select: {
            title: true,
            slug: true,
            coverUrl: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    }) as unknown as ArticleListItem[],
    [] as ArticleListItem[],
    'blog articles'
  );
  const loginHref = `/login?callbackUrl=${encodeURIComponent('/blog')}`;

  return (
    <main className="page-shell">
      <Header />

      <div className="page-container py-14 sm:py-16">
        <div className="mb-12 max-w-3xl">
          <h1 className="font-playfair text-4xl font-semibold text-landing-text md:text-5xl">{t('latestArticles')}</h1>
          <p className="mt-4 text-lg leading-relaxed text-landing-text-muted">
            {t('blogSubtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {articles.map((article) => {
            const articleAccess = getContentAccessStateForViewer(article, viewerAccess);
            const supportHref = article.book
              ? `/books/${article.book.slug || article.bookId || article.id}#support-this-book`
              : '/support';
            const badgeLabel = getBookAccessBadgeLabel(articleAccess.contentDonorAccessLevel, articleAccess.hasAccess);
            const badgeClasses = articleAccess.hasAccess
              ? 'bg-emerald-100 text-emerald-700'
              : articleAccess.contentDonorAccessLevel === 'RECURRING_DONORS'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-violet-100 text-violet-700';

            return (
              <article key={article.id} className="surface-card flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
                <div className="flex-1 p-6">
                  <div className="mb-3 flex items-center gap-2 text-xs text-landing-text-muted">
                    <span>{new Date(article.createdAt).toLocaleDateString()}</span>
                    {article.author && (
                      <>
                        <span>•</span>
                        <span>{article.author}</span>
                      </>
                    )}
                    {articleAccess.requiresDonation ? (
                      <span className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-semibold ${badgeClasses}`}>
                        {badgeLabel}
                      </span>
                    ) : null}
                  </div>
                  
                  <h2 className="mb-3 font-playfair text-2xl font-semibold text-landing-text">
                    {articleAccess.hasAccess && article.url ? (
                      <a href={article.url} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-landing-accent">
                        {article.title} ↗
                      </a>
                    ) : (
                      article.title
                    )}
                  </h2>

                  {(article.summary || article.content) && (
                    <p className="mb-4 line-clamp-3 text-sm leading-relaxed text-landing-text-muted">
                      {article.summary || article.content}
                    </p>
                  )}

                  {articleAccess.hasAccess ? <ContentNarrationPlayer contentId={article.id} compact /> : null}

                  {!articleAccess.hasAccess ? (
                    <DonorAccessLock
                      accessLevel={articleAccess.contentDonorAccessLevel}
                      isSignedIn={viewerAccess.isSignedIn}
                      loginHref={loginHref}
                      supportHref={supportHref}
                      supportLabel={article.book ? getBookSupportCallToAction(articleAccess.contentDonorAccessLevel) : 'Support the Revolution'}
                      secondaryHref={article.book ? `/books/${article.book.slug || article.bookId || article.id}` : '/library'}
                      secondaryLabel={article.book ? 'Open related book' : 'Browse library'}
                      title={t('supporterOnlyArticle')}
                      message={t('supporterOnlyArticleMsg')}
                      className="mt-4"
                    />
                  ) : null}
                  
                  {articleAccess.hasAccess && article.url ? (
                    <a href={article.url} target="_blank" rel="noopener noreferrer" className="mb-2 mt-4 inline-flex items-center gap-1 text-sm font-medium text-landing-accent hover:text-landing-accent-secondary">
                      {t('readFullArticle')} <span aria-hidden="true">&rarr;</span>
                    </a>
                  ) : null}
                </div>

                <div className="mt-auto border-t border-landing-border bg-landing-surface-muted px-6 py-4">
                  {article.book ? (
                    <Link href={`/books/${article.book.slug || article.bookId || article.id}`} className="group flex items-center gap-3">
                      {article.book.coverUrl && (
                        <div className="relative h-10 w-8 overflow-hidden rounded shadow-sm">
                          <Image
                            src={article.book.coverUrl}
                            alt=""
                            fill
                            unoptimized
                            sizes="32px"
                            className="object-cover transition-opacity group-hover:opacity-90"
                          />
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="text-xs font-medium uppercase tracking-wider text-landing-text-muted">From the book</p>
                        <p className="truncate text-sm font-semibold text-landing-text transition-colors group-hover:text-landing-accent">
                          {article.book.title}
                        </p>
                      </div>
                    </Link>
                  ) : (
                    <div className="text-sm text-landing-text-muted">
                      Standalone article from the One Man Revolution platform.
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {articles.length === 0 && (
          <div className="surface-card py-20 text-center">
            <p className="text-lg text-landing-text-muted">No articles found.</p>
          </div>
        )}
      </div>

      <Footer />
    </main>
  );
}
