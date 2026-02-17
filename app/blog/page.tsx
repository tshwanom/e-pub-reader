import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Metadata } from 'next';

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
    <div className="min-h-screen bg-gray-50 pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4 font-playfair">Latest Articles</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Explore articles, essays, and supplementary readings from our book collection.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {articles.map((article) => (
            <article key={article.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col hover:shadow-md transition-shadow duration-300">
               <div className="p-6 flex-1">
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                    <span>{new Date(article.createdAt).toLocaleDateString()}</span>
                    {article.author && (
                      <>
                        <span>•</span>
                        <span>{article.author}</span>
                      </>
                    )}
                  </div>
                  
                  <h2 className="text-xl font-bold text-gray-900 mb-3 font-playfair">
                    {article.url ? (
                      <a href={article.url} target="_blank" rel="noopener noreferrer" className="hover:text-landing-accent">
                        {article.title} ↗
                      </a>
                    ) : (
                      article.title
                    )}
                  </h2>

                  {article.content && (
                    <p className="text-gray-600 mb-4 line-clamp-3 text-sm leading-relaxed">
                      {article.content}
                    </p>
                  )}
                  
                  {article.url && (
                    <a href={article.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 mb-4">
                      Read full article <span aria-hidden="true">&rarr;</span>
                    </a>
                  )}
               </div>

               <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 mt-auto">
                 <Link href={`/books/${article.book.slug || article.bookId}`} className="flex items-center gap-3 group">
                    {article.book.coverUrl && (
                      <img src={article.book.coverUrl} alt="" className="w-8 h-10 object-cover rounded shadow-sm group-hover:opacity-90 transition-opacity" />
                    )}
                    <div className="flex-1">
                       <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">From the book</p>
                       <p className="text-sm font-semibold text-gray-900 group-hover:text-landing-accent transition-colors truncate">
                         {article.book.title}
                       </p>
                    </div>
                 </Link>
               </div>
            </article>
          ))}
        </div>

        {articles.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg">No articles found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
