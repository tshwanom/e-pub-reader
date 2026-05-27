import { authOptions } from '@/lib/auth';
import { getContentAccessStateForViewer, getDonorAccessState } from '@/lib/book-access';
import { getBookAccessBadgeLabel } from '@/lib/book-access-config';
import { withContentFeatureFallback } from '@/lib/content';
import { prisma } from '@/lib/prisma';
import { getVideoThumbnailUrl, getVideoWatchPath } from '@/lib/video-source';
import Image from 'next/image';
import Link from 'next/link';
import { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { ArrowRight, Clapperboard, Play, Sparkles } from 'lucide-react';
import Header from '@/components/landing/Header';
import Footer from '@/components/landing/Footer';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Videos | One Man Revolution',
  description: 'Video content from our books.',
};

function getAccessBadgeClasses(hasAccess: boolean, donorAccessLevel: string) {
  if (hasAccess) {
    return 'bg-emerald-100/95 text-emerald-700 ring-1 ring-emerald-200';
  }

  if (donorAccessLevel === 'RECURRING_DONORS') {
    return 'bg-amber-100/95 text-amber-700 ring-1 ring-amber-200';
  }

  return 'bg-violet-100/95 text-violet-700 ring-1 ring-violet-200';
}

type VideoListItem = {
  id: string;
  slug: string | null;
  status: string;
  title: string;
  content: string | null;
  summary: string | null;
  url: string | null;
  coverUrl: string | null;
  donorOnly: boolean;
  donorAccessLevel: string;
  bookId: string | null;
  book: {
    title: string;
    slug: string | null;
    coverUrl: string | null;
  } | null;
  sourceThumbnailUrl?: string | null;
};

export default async function VideosPage() {
  const session = await getServerSession(authOptions);
  const viewerAccess = await getDonorAccessState(session?.user);
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
  const videosWithThumbnails = await Promise.all(
    videos.map(async (video) => ({
      ...video,
      sourceThumbnailUrl: video.coverUrl || await getVideoThumbnailUrl(video.url) || video.book?.coverUrl || null,
    }))
  );
  const loginHref = `/login?callbackUrl=${encodeURIComponent('/videos')}`;
  const donorOnlyVideoCount = videosWithThumbnails.filter((video) => video.donorAccessLevel !== 'PUBLIC').length;

  return (
    <main className="page-shell">
      <Header />

      <div className="page-container py-14 sm:py-16">
        <section className="surface-card relative mb-10 overflow-hidden px-6 py-8 sm:px-8 sm:py-10 lg:px-10">
          <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(61,115,122,0.24),transparent_58%)] lg:block" />

          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-landing-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-landing-accent ring-1 ring-landing-accent/10">
                  <Clapperboard className="h-3.5 w-3.5" />
                  Private player
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-landing-text-muted ring-1 ring-white/70">
                  <Sparkles className="h-3.5 w-3.5 text-landing-accent" />
                  Curated screenings
                </span>
              </div>

              <h1 className="mt-5 font-playfair text-4xl font-semibold tracking-tight text-landing-text md:text-5xl lg:text-[3.6rem]">
                Video Library
              </h1>
              <p className="mt-4 max-w-2xl text-lg leading-relaxed text-landing-text-muted">
                Open interviews, supplementary documentaries, and book-linked video essays on dedicated watch pages built for focused viewing — no autoplay-in-a-card circus.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[320px] lg:max-w-sm lg:flex-1">
              <div className="surface-muted p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Videos ready</p>
                <p className="mt-3 text-3xl font-semibold text-landing-text">{videos.length}</p>
                <p className="mt-2 text-sm text-landing-text-muted">Curated titles with dedicated watch pages.</p>
              </div>
              <div className="surface-muted p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Supporter access</p>
                <p className="mt-3 text-3xl font-semibold text-landing-text">{donorOnlyVideoCount}</p>
                <p className="mt-2 text-sm text-landing-text-muted">Reserved for donors or recurring supporters.</p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {videosWithThumbnails.map((video) => {
            const videoAccess = getContentAccessStateForViewer(video, viewerAccess);
            const badgeLabel = getBookAccessBadgeLabel(videoAccess.contentDonorAccessLevel, videoAccess.hasAccess);
            const badgeClasses = getAccessBadgeClasses(videoAccess.hasAccess, videoAccess.contentDonorAccessLevel);
            const posterUrl = video.sourceThumbnailUrl;
            const watchHref = getVideoWatchPath(video);

            return (
              <article
                key={video.id}
                className="group relative flex h-full flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white/80 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.38)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/90 hover:shadow-[0_30px_72px_-30px_rgba(15,23,42,0.42)]"
              >
                <div className="p-3 pb-0">
                  <Link
                    href={watchHref}
                    className="block rounded-[24px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2"
                  >
                    <div className="relative overflow-hidden rounded-[24px] border border-slate-950/5 bg-slate-950 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.7)]">
                      <div className="relative aspect-video overflow-hidden">
                        {posterUrl ? (
                          <img src={posterUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                        ) : (
                          <div className="h-full w-full bg-[radial-gradient(circle_at_top,rgba(61,115,122,0.38),rgba(15,23,42,0.95)_65%)]" />
                        )}
                        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.12),rgba(2,6,23,0.78))]" />

                        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
                          <span className="inline-flex items-center gap-2 rounded-full bg-slate-950/58 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/85 ring-1 ring-white/10 backdrop-blur-md">
                            <Play className="h-3.5 w-3.5 text-landing-accent" fill="currentColor" />
                            Watch page
                          </span>
                          {videoAccess.requiresDonation ? (
                            <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] backdrop-blur-md ${badgeClasses}`}>
                              {badgeLabel}
                            </span>
                          ) : null}
                        </div>

                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/14 text-white shadow-[0_16px_40px_-18px_rgba(15,23,42,0.95)] backdrop-blur-md transition-transform duration-300 group-hover:scale-105">
                            <Play className="ml-1 h-8 w-8" fill="currentColor" />
                          </span>
                        </div>

                        <div className="absolute inset-x-0 bottom-0 p-4">
                          <div className="flex items-end justify-between gap-3 text-white">
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/65">
                                {video.book ? 'From the library' : 'Standalone release'}
                              </p>
                              <p className="mt-1 truncate text-sm font-semibold text-white/92">
                                {video.book?.title || 'One Man Revolution screening'}
                              </p>
                            </div>
                            <span className="hidden rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/75 ring-1 ring-white/10 sm:inline-flex">
                              {videoAccess.hasAccess ? 'Open to watch' : 'Details & unlock'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>

                <div className="flex flex-1 flex-col p-5 pt-4 sm:p-6 sm:pt-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-landing-accent/8 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-landing-accent ring-1 ring-landing-accent/10">
                      Video
                    </span>
                    {videoAccess.requiresDonation ? (
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${badgeClasses}`}>
                        {badgeLabel}
                      </span>
                    ) : null}
                  </div>

                  <Link
                    href={watchHref}
                    className="mt-3 block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2"
                  >
                    <h2 className="line-clamp-2 font-playfair text-[1.85rem] font-semibold leading-tight text-landing-text transition-colors group-hover:text-landing-accent">
                      {video.title}
                    </h2>
                  </Link>

                  {video.summary || video.content ? (
                    <p className="mt-3 line-clamp-3 text-sm leading-7 text-landing-text-muted">
                      {video.summary || video.content}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm leading-7 text-landing-text-muted">
                      A curated library screening presented inside the One Man Revolution player.
                    </p>
                  )}

                  <p className="mt-4 text-sm leading-6 text-landing-text-muted">
                    {videoAccess.hasAccess
                      ? 'Playback now happens on a dedicated watch page with a larger player and suggested videos alongside it.'
                      : 'Open the dedicated watch page to preview the video details and unlock supporter access there.'}
                  </p>
                  
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-landing-border/80 pt-5">
                    <Link href={watchHref} className="inline-flex items-center gap-2 font-semibold text-landing-accent transition-colors hover:text-landing-accent-secondary">
                      Open watch page
                      <ArrowRight className="h-4 w-4" />
                    </Link>

                    {video.book ? (
                      <Link href={`/books/${video.book.slug || video.bookId || video.id}`} className="group/link flex items-center gap-3 rounded-2xl bg-white/55 px-3 py-3 transition-colors duration-200 hover:bg-white/80">
                        {video.book.coverUrl && (
                          <div className="relative h-12 w-9 overflow-hidden rounded-lg shadow-sm ring-1 ring-slate-900/8">
                            <Image
                              src={video.book.coverUrl}
                              alt=""
                              fill
                              unoptimized
                              sizes="36px"
                              className="object-cover transition-opacity group-hover/link:opacity-85"
                            />
                          </div>
                        )}
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Related Book</p>
                          <p className="truncate text-sm font-semibold text-landing-text transition-colors group-hover/link:text-landing-accent">
                            {video.book.title}
                          </p>
                        </div>
                      </Link>
                    ) : (
                      <div className="rounded-2xl bg-white/55 px-3 py-3 text-sm text-landing-text-muted">
                        Standalone platform video
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {videosWithThumbnails.length === 0 && (
          <div className="surface-card overflow-hidden py-20 text-center">
            <div className="mx-auto max-w-2xl px-6">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-landing-accent/10 text-landing-accent ring-1 ring-landing-accent/10">
                <Clapperboard className="h-7 w-7" />
              </div>
              <h2 className="mt-6 font-playfair text-3xl font-semibold text-landing-text">The screening room is warming up</h2>
              <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-landing-text-muted">
                No videos are published yet, but the watch-page flow is ready for dedicated screenings, supporter-only releases, and a cleaner browse-to-watch experience as soon as the first titles land.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/library" className="brand-button min-w-[12rem]">
                  Explore the library
                </Link>
                <Link href="/#donate" className="ghost-button min-w-[12rem]">
                  Support the work
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      <Footer />
    </main>
  );
}
