import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Metadata } from 'next';
import Header from '@/components/landing/Header';
import Footer from '@/components/landing/Footer';
import ContentNarrationPlayer from '@/components/ContentNarrationPlayer';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Poems | One Man Revolution',
  description: 'Poetry collection from our books.',
};

export default async function PoemsPage() {
  const poems = await prisma.supplementaryContent.findMany({
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
  });

  return (
    <main className="page-shell">
      <Header />

      <div className="mx-auto w-full max-w-4xl px-5 py-14 sm:px-8 sm:py-16">
        <div className="mb-14 text-center">
          <h1 className="font-playfair text-5xl font-semibold italic text-landing-text">Poetry Collection</h1>
          <div className="mx-auto mt-5 h-1 w-24 rounded-full bg-landing-accent/30"></div>
        </div>

        <div className="space-y-10">
          {poems.map((poem) => (
            <article key={poem.id} className="surface-card p-8 sm:p-10">
              <div className="mb-8 text-center">
                 <h2 className="font-playfair text-4xl font-semibold text-landing-text">{poem.title}</h2>
                 {poem.author && (
                   <p className="mt-2 font-serif italic text-landing-text-muted">by {poem.author}</p>
                 )}
              </div>

              <div className="mx-auto whitespace-pre-wrap text-center font-serif text-lg leading-relaxed text-landing-text">
                {poem.content}
              </div>

              <div className="mx-auto max-w-xl">
                <ContentNarrationPlayer contentId={poem.id} />
              </div>

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
          ))}
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
