import { withContentFeatureFallback } from '@/lib/content';
import { prisma } from '@/lib/prisma';
import Image from 'next/image';
import Link from 'next/link';
import { Metadata } from 'next';
import Header from '@/components/landing/Header';
import Footer from '@/components/landing/Footer';
import ContentNarrationPlayer from '@/components/ContentNarrationPlayer';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Blog | One Man Revolution',
  description: 'Articles and essays from our collection.',
};

type ArticleListItem = {
  id: string;
  title: string;
  content: string | null;
  summary: string | null;
  url: string | null;
  author: string | null;
  bookId: string | null;
  createdAt: Date;
  book: {
    title: string;
    slug: string | null;
    coverUrl: string | null;
  } | null;
};

export default async function BlogPage() {
  const articles = await withContentFeatureFallback(
    async () => prisma.supplementaryContent.findMany({
      where: {
        type: 'ARTICLE',
        status: 'PUBLISHED',
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

  return (
    <main className="page-shell">
      <Header />

      <div className="page-container py-14 sm:py-16">
        <div className="mb-12 max-w-3xl">
          <h1 className="font-playfair text-4xl font-semibold text-landing-text md:text-5xl">Latest Articles</h1>
          <p className="mt-4 text-lg leading-relaxed text-landing-text-muted">
            Explore articles, essays, and supplementary readings from our book collection.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {articles.map((article) => (
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
                  </div>
                  
                  <h2 className="mb-3 font-playfair text-2xl font-semibold text-landing-text">
                    {article.url ? (
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

                  <ContentNarrationPlayer contentId={article.id} compact />
                  
                  {article.url && (
                    <a href={article.url} target="_blank" rel="noopener noreferrer" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-landing-accent hover:text-landing-accent-secondary">
                      Read full article <span aria-hidden="true">&rarr;</span>
                    </a>
                  )}
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
          ))}
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
