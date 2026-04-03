import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Metadata } from 'next';
import Header from '@/components/landing/Header';
import Footer from '@/components/landing/Footer';

export const metadata: Metadata = {
  title: 'Videos | One Man Revolution',
  description: 'Video content from our books.',
};

export default async function VideosPage() {
  const videos = await prisma.supplementaryContent.findMany({
    where: {
      type: 'VIDEO',
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
          <h1 className="font-playfair text-4xl font-semibold text-landing-text md:text-5xl">Video Library</h1>
          <p className="mt-4 text-lg leading-relaxed text-landing-text-muted">
            Watch supplementary videos, interviews, and documentaries related to our books.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {videos.map((video) => (
            <div key={video.id} className="surface-card flex flex-col overflow-hidden">
               {/* Video Embed/Link */}
               <div className="relative aspect-video border-b border-landing-border bg-landing-surface-muted">
                  {video.url && (video.url.includes('youtube.com') || video.url.includes('youtu.be')) ? (
                      <iframe 
                        src={video.url.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')}
                        className="h-full w-full"
                        allowFullScreen
                        title={video.title}
                      />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                       <a href={video.url || '#'} target="_blank" rel="noopener noreferrer" className="group flex flex-col items-center gap-2 text-landing-accent transition-colors hover:text-landing-accent-secondary">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-12 w-12 transition-transform group-hover:scale-105">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 0 1 0 .656l-5.603 3.113a.375.375 0 0 1-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112Z" />
                          </svg>
                          <span className="text-sm font-medium">Watch Externally</span>
                       </a>
                    </div>
                  )}
               </div>

               <div className="flex flex-1 flex-col p-5">
                  <h2 className="line-clamp-2 font-playfair text-2xl font-semibold text-landing-text">
                    {video.title}
                  </h2>
                  
                  <div className="mt-auto border-t border-landing-border pt-4">
                    <Link href={`/books/${video.book.slug || video.bookId}`} className="group flex items-center gap-3">
                        {video.book.coverUrl && (
                          <img src={video.book.coverUrl} alt="" className="h-10 w-8 rounded object-cover shadow-sm transition-opacity group-hover:opacity-80" />
                        )}
                        <div className="flex-1 overflow-hidden">
                          <p className="text-xs font-medium uppercase tracking-wider text-landing-text-muted">Related Book</p>
                          <p className="truncate text-sm font-semibold text-landing-text transition-colors group-hover:text-landing-accent">
                            {video.book.title}
                          </p>
                        </div>
                    </Link>
                  </div>
               </div>
            </div>
          ))}
        </div>

        {videos.length === 0 && (
          <div className="surface-card py-20 text-center">
            <p className="text-lg text-landing-text-muted">No videos available yet.</p>
          </div>
        )}
      </div>

      <Footer />
    </main>
  );
}
