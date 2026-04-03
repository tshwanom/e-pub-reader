import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Metadata } from 'next';
import Header from '@/components/landing/Header';
import Footer from '@/components/landing/Footer';

export const metadata: Metadata = {
  title: 'Blog | One Man Revolution',
  description: 'Articles and essays from our collection.',
};

export default async function BlogPage() {
  const articles = await prisma.supplementaryContent.findMany({
    where: {
      type: 'ARTICLE',
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
  });

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

                  {article.content && (
                    <p className="mb-4 line-clamp-3 text-sm leading-relaxed text-landing-text-muted">
                      {article.content}
                    </p>
                  )}
                  
                  {article.url && (
                    <a href={article.url} target="_blank" rel="noopener noreferrer" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-landing-accent hover:text-landing-accent-secondary">
                      Read full article <span aria-hidden="true">&rarr;</span>
                    </a>
                  )}
               </div>

               <div className="mt-auto border-t border-landing-border bg-landing-surface-muted px-6 py-4">
                 <Link href={`/books/${article.book.slug || article.bookId}`} className="group flex items-center gap-3">
                    {article.book.coverUrl && (
                      <img src={article.book.coverUrl} alt="" className="h-10 w-8 rounded object-cover shadow-sm transition-opacity group-hover:opacity-90" />
                    )}
                    <div className="flex-1">
                       <p className="text-xs font-medium uppercase tracking-wider text-landing-text-muted">From the book</p>
                       <p className="truncate text-sm font-semibold text-landing-text transition-colors group-hover:text-landing-accent">
                         {article.book.title}
                       </p>
                    </div>
                 </Link>
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
