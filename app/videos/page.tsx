import { withContentFeatureFallback } from '@/lib/content';
import { prisma } from '@/lib/prisma';
import Image from 'next/image';
import Link from 'next/link';
import { Metadata } from 'next';
import Header from '@/components/landing/Header';
import Footer from '@/components/landing/Footer';
import ContentNarrationPlayer from '@/components/ContentNarrationPlayer';
import OMRVideoPlayer from '@/components/OMRVideoPlayer';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Videos | One Man Revolution',
  description: 'Video content from our books.',
};

type VideoListItem = {
  id: string;
  title: string;
  content: string | null;
  summary: string | null;
  url: string | null;
  bookId: string | null;
  book: {
    title: string;
    slug: string | null;
    coverUrl: string | null;
  } | null;
};

export default async function VideosPage() {
  const videos = await withContentFeatureFallback(
    async () => prisma.supplementaryContent.findMany({
      where: {
        type: 'VIDEO',
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
    }) as unknown as VideoListItem[],
    [] as VideoListItem[],
    'videos listing'
  );

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
                  {video.url && (video.url.includes('youtube.com') || video.url.includes('youtu.be') || video.url.includes('vimeo.com')) ? (
                      <OMRVideoPlayer 
                        url={video.url}
                        title={video.title}
                        className="absolute inset-0 h-full w-full"
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

                  {video.summary || video.content ? (
                    <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-landing-text-muted">
                      {video.summary || video.content}
                    </p>
                  ) : null}

                  <ContentNarrationPlayer contentId={video.id} compact />
                  
                  <div className="mt-auto border-t border-landing-border pt-4">
                    {video.book ? (
                    <Link href={`/books/${video.book.slug || video.bookId || video.id}`} className="group flex items-center gap-3">
                        {video.book.coverUrl && (
                          <div className="relative h-10 w-8 overflow-hidden rounded shadow-sm">
                            <Image
                              src={video.book.coverUrl}
                              alt=""
                              fill
                              unoptimized
                              sizes="32px"
                              className="object-cover transition-opacity group-hover:opacity-80"
                            />
                          </div>
                        )}
                        <div className="flex-1 overflow-hidden">
                          <p className="text-xs font-medium uppercase tracking-wider text-landing-text-muted">Related Book</p>
                          <p className="truncate text-sm font-semibold text-landing-text transition-colors group-hover:text-landing-accent">
                            {video.book.title}
                          </p>
                        </div>
                    </Link>
                    ) : (
                      <div className="text-sm text-landing-text-muted">Standalone platform video</div>
                    )}
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
