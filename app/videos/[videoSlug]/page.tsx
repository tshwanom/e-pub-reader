import { notFound, permanentRedirect } from 'next/navigation';
import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { getServerSession } from 'next-auth';
import { ArrowLeft, BookOpenText, Clock3, Clapperboard, ListVideo, Lock, Sparkles } from 'lucide-react';

import { authOptions } from '@/lib/auth';
import { getContentAccessStateForViewer, getDonorAccessState } from '@/lib/book-access';
import { getBookAccessBadgeLabel, getBookSupportCallToAction } from '@/lib/book-access-config';
import { getContentCommentAuthorInitial, getContentCommentAuthorName } from '@/lib/content-comments';
import DonorAccessLock from '@/components/DonorAccessLock';
import Footer from '@/components/landing/Footer';
import Header from '@/components/landing/Header';
import OMRVideoPlayer from '@/components/OMRVideoPlayer';
import VideoCommentsModal from '@/components/VideoCommentsModal';
import { withContentFeatureFallback } from '@/lib/content';
import { prisma } from '@/lib/prisma';
import { getAbsoluteSiteAssetUrl } from '@/lib/site';
import { extractVideoChapters } from '@/lib/video-chapters';
import { getVideoThumbnailUrl, getVideoWatchPath } from '@/lib/video-source';

export const dynamic = 'force-dynamic';

type VideoPageParams = {
  params: Promise<{ videoSlug: string }>;
};

type VideoRecord = {
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
  createdAt: Date;
  book: {
    id: string;
    title: string;
    slug: string | null;
    coverUrl: string | null;
  } | null;
  sourceThumbnailUrl?: string | null;
};

type VideoCommentRecord = {
  id: string;
  userId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  user: {
    name: string | null;
    email: string | null;
  };
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

async function getVideoBySlugOrId(videoSlug: string) {
  return withContentFeatureFallback(
    () => prisma.supplementaryContent.findFirst({
      where: {
        type: 'VIDEO',
        status: 'PUBLISHED',
        OR: [{ slug: videoSlug }, { id: videoSlug }],
      },
      include: {
        book: {
          select: {
            id: true,
            title: true,
            slug: true,
            coverUrl: true,
          },
        },
      },
    }) as Promise<VideoRecord | null>,
    null as VideoRecord | null,
    `video detail ${videoSlug}`
  );
}

async function decorateVideo(video: VideoRecord) {
  return {
    ...video,
    sourceThumbnailUrl: video.coverUrl || await getVideoThumbnailUrl(video.url) || video.book?.coverUrl || null,
  };
}

function serializeComment(comment: VideoCommentRecord, currentUserId?: string | null) {
  const authorName = getContentCommentAuthorName(comment.user);

  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    authorName,
    authorInitial: getContentCommentAuthorInitial(authorName),
    isCurrentUser: Boolean(currentUserId && currentUserId === comment.userId),
  };
}

export async function generateMetadata({ params }: VideoPageParams): Promise<Metadata> {
  const { videoSlug } = await params;
  const video = await getVideoBySlugOrId(videoSlug);

  if (!video) {
    return {
      title: 'Video not found | One Man Revolution',
      description: 'The requested video could not be found.',
    };
  }

  const canonicalPath = getVideoWatchPath(video);
  const description = video.summary || video.content || 'A curated One Man Revolution screening.';
  const coverImageUrl = getAbsoluteSiteAssetUrl(video.coverUrl || video.book?.coverUrl, '/logo.png');

  return {
    title: `${video.title} | Videos | One Man Revolution`,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title: video.title,
      description,
      url: canonicalPath,
      siteName: 'One Man Revolution',
      type: 'video.other',
      images: [
        {
          url: coverImageUrl,
          alt: video.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${video.title} | Videos`,
      description,
      images: [coverImageUrl],
    },
  };
}

export default async function VideoWatchPage({ params }: VideoPageParams) {
  const { videoSlug } = await params;
  const session = await getServerSession(authOptions);
  const viewerAccess = await getDonorAccessState(session?.user);

  const videoRecord = await getVideoBySlugOrId(videoSlug);

  if (!videoRecord) {
    notFound();
  }

  if (videoSlug !== (videoRecord.slug?.trim() || videoRecord.id)) {
    permanentRedirect(getVideoWatchPath(videoRecord));
  }

  const [video, relatedRawVideos, commentsResult] = await Promise.all([
    decorateVideo(videoRecord),
    withContentFeatureFallback(
      () => prisma.supplementaryContent.findMany({
        where: {
          type: 'VIDEO',
          status: 'PUBLISHED',
          NOT: {
            id: videoRecord.id,
          },
        },
        include: {
          book: {
            select: {
              id: true,
              title: true,
              slug: true,
              coverUrl: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 12,
      }) as Promise<VideoRecord[]>,
      [] as VideoRecord[],
      `related videos ${videoRecord.id}`
    ),
    withContentFeatureFallback(
      async () => Promise.all([
        prisma.contentComment.findMany({
          where: { contentId: videoRecord.id },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            userId: true,
            body: true,
            createdAt: true,
            updatedAt: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        }),
        prisma.contentComment.count({ where: { contentId: videoRecord.id } }),
      ]),
      [[], 0] as [VideoCommentRecord[], number],
      `video comments ${videoRecord.id}`
    ),
  ]);

  const videoAccess = getContentAccessStateForViewer(video, viewerAccess);
  const badgeLabel = getBookAccessBadgeLabel(videoAccess.contentDonorAccessLevel, videoAccess.hasAccess);
  const badgeClasses = getAccessBadgeClasses(videoAccess.hasAccess, videoAccess.contentDonorAccessLevel);
  const supportHref = video.book
    ? `/books/${video.book.slug || video.book.id}#support-this-book`
    : '/support';
  const loginHref = `/login?callbackUrl=${encodeURIComponent(getVideoWatchPath(video))}`;
  const posterUrl = video.sourceThumbnailUrl;
  const publishedLabel = new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(video.createdAt);
  const chapterSource = [video.summary, video.content].filter(Boolean).join('\n\n');
  const chapters = extractVideoChapters(chapterSource);
  const canViewComments = videoAccess.hasAccess || !videoAccess.requiresDonation;
  const canPostComments = canViewComments && Boolean(session?.user?.id);
  const [rawComments, rawCommentsCount] = commentsResult;
  const initialComments = canViewComments
    ? rawComments.map((comment) => serializeComment(comment, session?.user?.id))
    : [];
  const initialCommentsCount = canViewComments ? rawCommentsCount : 0;
  const relatedVideos = (await Promise.all(relatedRawVideos.map(decorateVideo)))
    .sort((left, right) => {
      const leftSameBook = video.bookId && left.bookId === video.bookId ? 1 : 0;
      const rightSameBook = video.bookId && right.bookId === video.bookId ? 1 : 0;

      if (leftSameBook !== rightSameBook) {
        return rightSameBook - leftSameBook;
      }

      return right.createdAt.getTime() - left.createdAt.getTime();
    })
    .slice(0, 8);
  const [upNextVideo, ...queueVideos] = relatedVideos;

  return (
    <main className="page-shell">
      <Header />

      <div className="page-container py-6 sm:py-8 lg:py-10">
        <Link href="/videos" className="ghost-button mb-5 inline-flex items-center gap-2 px-4 py-2.5 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Back to videos
        </Link>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem] 2xl:grid-cols-[minmax(0,1fr)_23rem]">
          <div className="space-y-6 min-w-0">
            <section className="surface-card overflow-hidden p-3 sm:p-4">
              <div className="relative aspect-video overflow-hidden rounded-[24px] bg-black">
                {videoAccess.hasAccess && video.url ? (
                  <OMRVideoPlayer
                    url={video.url}
                    title={video.title}
                    posterUrl={posterUrl}
                    className="absolute inset-0 h-full w-full"
                  />
                ) : (
                  <div className="relative h-full w-full overflow-hidden">
                    {posterUrl ? (
                      <img src={posterUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full bg-[radial-gradient(circle_at_top,rgba(61,115,122,0.42),rgba(15,23,42,0.96)_65%)]" />
                    )}

                    <div className="absolute inset-0 bg-slate-950/45" />

                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center text-white">
                      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/12 backdrop-blur-md">
                        {videoAccess.hasAccess ? <Clapperboard className="h-8 w-8" /> : <Lock className="h-8 w-8" />}
                      </span>

                      <div className="space-y-2">
                        <p className="text-lg font-semibold text-white sm:text-xl">
                          {videoAccess.hasAccess ? 'Video source coming soon' : 'This screening is locked'}
                        </p>
                        <p className="max-w-xl text-sm leading-6 text-white/84 sm:text-base">
                          {videoAccess.hasAccess
                            ? 'The dedicated watch page is ready, but this video still needs a stream-ready source URL before playback can begin.'
                            : 'Supporter access is required before this video can play on its dedicated watch page.'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="surface-card p-5 sm:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-landing-text-muted">
                    <span className="inline-flex items-center gap-2 rounded-full bg-landing-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-landing-accent ring-1 ring-landing-accent/10">
                      <Sparkles className="h-3.5 w-3.5" />
                      Curated screening
                    </span>
                    {videoAccess.requiresDonation ? (
                      <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${badgeClasses}`}>
                        {badgeLabel}
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100/95 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 ring-1 ring-emerald-200">
                        Available to watch
                      </span>
                    )}
                    {video.book ? (
                      <Link
                        href={`/books/${video.book.slug || video.book.id}`}
                        className="inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-landing-text-muted ring-1 ring-landing-border/70 transition-colors hover:text-landing-accent"
                      >
                        <BookOpenText className="h-3.5 w-3.5 text-landing-accent" />
                        From {video.book.title}
                      </Link>
                    ) : (
                      <span className="rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-landing-text-muted ring-1 ring-landing-border/70">
                        Standalone release
                      </span>
                    )}
                  </div>

                  <h1 className="mt-4 font-playfair text-3xl font-semibold leading-tight text-landing-text sm:text-4xl lg:text-[2.9rem]">
                    {video.title}
                  </h1>

                  <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-landing-text-muted">
                    <span>Published {publishedLabel}</span>
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-landing-border" />
                    <span>{video.book ? 'Book-linked screening' : 'Standalone screening'}</span>
                    {chapters.length > 0 ? (
                      <>
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-landing-border" />
                        <span>{chapters.length} chapter markers</span>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <VideoCommentsModal
                    contentId={video.id}
                    videoTitle={video.title}
                    initialComments={initialComments}
                    initialCount={initialCommentsCount}
                    canViewComments={canViewComments}
                    canPostComments={canPostComments}
                    isSignedIn={Boolean(session?.user?.id)}
                    loginHref={loginHref}
                    supportHref={supportHref}
                    supportLabel={video.book ? getBookSupportCallToAction(videoAccess.contentDonorAccessLevel) : 'Support the Revolution'}
                  />
                </div>
              </div>

              {!videoAccess.hasAccess ? (
                <DonorAccessLock
                  accessLevel={videoAccess.contentDonorAccessLevel}
                  isSignedIn={viewerAccess.isSignedIn}
                  loginHref={loginHref}
                  supportHref={supportHref}
                  supportLabel={video.book ? getBookSupportCallToAction(videoAccess.contentDonorAccessLevel) : 'Support the Revolution'}
                  secondaryHref={video.book ? `/books/${video.book.slug || video.book.id}` : '/videos'}
                  secondaryLabel={video.book ? 'Open related book' : 'Browse videos'}
                  title="Supporter-only video"
                  message="This screening opens on its own watch page, but playback stays locked until the required support is active on your account."
                  className="mt-6"
                />
              ) : video.summary ? (
                <p className="mt-5 max-w-3xl text-base leading-7 text-landing-text-muted">
                  {video.summary}
                </p>
              ) : null}
            </section>

            {video.content ? (
              <section className="surface-muted p-5 sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Description</p>
                <div className="mt-4 whitespace-pre-wrap font-crimson text-lg leading-8 text-landing-text-muted">
                  {video.content}
                </div>
              </section>
            ) : (
              <section className="surface-muted p-4 sm:p-5 text-sm leading-7 text-landing-text-muted">
                This screening does not have a written description yet, but the watch page is ready for playback, supporter access, and suggested videos.
              </section>
            )}

            {chapters.length > 0 ? (
              <section className="surface-card p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-landing-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-landing-accent ring-1 ring-landing-accent/10">
                    <Clock3 className="h-3.5 w-3.5" />
                    Chapter timestamps
                  </span>
                  <span className="text-sm text-landing-text-muted">
                    Optional markers pulled straight from the video description.
                  </span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {chapters.map((chapter) => (
                    <div key={chapter.id} className="rounded-2xl bg-white/70 p-4 ring-1 ring-white/70 transition-colors hover:bg-white/85">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">
                        {chapter.timestamp}
                      </p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-landing-text">
                        {chapter.label}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {video.book ? (
              <Link href={`/books/${video.book.slug || video.book.id}`} className="group flex items-center gap-4 rounded-[24px] bg-white/70 p-4 ring-1 ring-white/65 transition-all duration-200 hover:bg-white/85 hover:shadow-sm">
                {video.book.coverUrl ? (
                  <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-xl shadow-sm ring-1 ring-slate-900/8">
                    <Image
                      src={video.book.coverUrl}
                      alt=""
                      fill
                      unoptimized
                      sizes="56px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-xl bg-landing-accent/10 text-landing-accent ring-1 ring-landing-accent/10">
                    <BookOpenText className="h-5 w-5" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Related book</p>
                  <p className="mt-1 truncate text-lg font-semibold text-landing-text transition-colors group-hover:text-landing-accent">
                    {video.book.title}
                  </p>
                  <p className="mt-1 text-sm text-landing-text-muted">
                    Open the book page for the broader reading context and related supporter access.
                  </p>
                </div>
              </Link>
            ) : null}
          </div>

          <aside className="self-start xl:sticky xl:top-24">
            <div className="surface-card p-4 sm:p-5 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Up next</p>
                  <h2 className="mt-2 font-playfair text-2xl font-semibold text-landing-text">Keep watching</h2>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full bg-landing-surface-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                  <ListVideo className="h-3.5 w-3.5 text-landing-accent" />
                  Queue
                </span>
              </div>

              <p className="mt-2 text-sm leading-6 text-landing-text-muted">
                A tighter watch rail: one clear next pick, then the rest stacked underneath.
              </p>

              {upNextVideo ? (() => {
                const relatedAccess = getContentAccessStateForViewer(upNextVideo, viewerAccess);
                const relatedBadgeLabel = getBookAccessBadgeLabel(relatedAccess.contentDonorAccessLevel, relatedAccess.hasAccess);
                const relatedBadgeClasses = getAccessBadgeClasses(relatedAccess.hasAccess, relatedAccess.contentDonorAccessLevel);
                const relatedPosterUrl = upNextVideo.sourceThumbnailUrl;

                return (
                  <Link
                    href={getVideoWatchPath(upNextVideo)}
                    className="group mt-5 block rounded-[24px] bg-white/70 p-3 ring-1 ring-white/65 transition-all duration-200 hover:-translate-y-px hover:bg-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2"
                  >
                    <div className="relative aspect-video overflow-hidden rounded-[20px] bg-slate-900">
                      {relatedPosterUrl ? (
                        <img src={relatedPosterUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
                      ) : (
                        <div className="h-full w-full bg-[radial-gradient(circle_at_top,rgba(61,115,122,0.35),rgba(15,23,42,0.95)_65%)]" />
                      )}
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.08),rgba(2,6,23,0.62))]" />
                      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
                        <span className="rounded-full bg-slate-950/58 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/85 ring-1 ring-white/10 backdrop-blur-md">
                          Up next
                        </span>
                        {relatedAccess.requiresDonation ? (
                          <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${relatedBadgeClasses}`}>
                            {relatedBadgeLabel}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="px-1 pb-1 pt-4">
                      <h3 className="line-clamp-2 text-base font-semibold leading-6 text-landing-text transition-colors group-hover:text-landing-accent">
                        {upNextVideo.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-landing-text-muted">
                        {upNextVideo.book?.title || upNextVideo.summary || upNextVideo.content || 'One Man Revolution screening'}
                      </p>
                    </div>
                  </Link>
                );
              })() : (
                <div className="mt-5 rounded-2xl bg-white/55 p-4 text-sm leading-6 text-landing-text-muted ring-1 ring-white/60">
                  No related screenings have been published yet.
                </div>
              )}

              {queueVideos.length > 0 ? (
                <div className="mt-5 border-t border-landing-border/70 pt-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">More from OMR</p>
                  <div className="mt-4 space-y-3">
                    {queueVideos.map((relatedVideo) => {
                  const relatedAccess = getContentAccessStateForViewer(relatedVideo, viewerAccess);
                  const relatedBadgeLabel = getBookAccessBadgeLabel(relatedAccess.contentDonorAccessLevel, relatedAccess.hasAccess);
                  const relatedBadgeClasses = getAccessBadgeClasses(relatedAccess.hasAccess, relatedAccess.contentDonorAccessLevel);
                  const relatedPosterUrl = relatedVideo.sourceThumbnailUrl;

                  return (
                    <Link
                      key={relatedVideo.id}
                      href={getVideoWatchPath(relatedVideo)}
                      className="group flex gap-3 rounded-2xl bg-white/60 p-2.5 ring-1 ring-white/55 backdrop-blur-md transition-all duration-200 hover:-translate-y-px hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2"
                    >
                      <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-xl bg-slate-900">
                        {relatedPosterUrl ? (
                          <img src={relatedPosterUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full bg-[radial-gradient(circle_at_top,rgba(61,115,122,0.35),rgba(15,23,42,0.95)_65%)]" />
                        )}
                        <div className="absolute inset-0 bg-slate-950/25" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-landing-accent/8 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-landing-accent ring-1 ring-landing-accent/10">
                            Video
                          </span>
                          {relatedAccess.requiresDonation ? (
                            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${relatedBadgeClasses}`}>
                              {relatedBadgeLabel}
                            </span>
                          ) : null}
                        </div>

                        <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-landing-text transition-colors group-hover:text-landing-accent">
                          {relatedVideo.title}
                        </h3>

                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-landing-text-muted">
                          {relatedVideo.book?.title || relatedVideo.summary || relatedVideo.content || 'One Man Revolution screening'}
                        </p>
                      </div>
                    </Link>
                  );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </main>
  );
}