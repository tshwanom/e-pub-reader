import type { Metadata } from 'next';
import { getBookAccessState, getDonorFeatureAccessState } from "@/lib/book-access";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBookDonorRequirementText, getBookLockedAudienceLabel } from '@/lib/book-access-config';
import Reader from "@/components/Reader";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { normalizeReaderPreferences } from "@/lib/reader-preferences";
import { getBookPath, getBookReadPath } from '@/lib/book-paths';

type ReadBookPageParams = {
  params: Promise<{ bookId: string }>;
};

export async function generateMetadata({ params }: ReadBookPageParams): Promise<Metadata> {
  const { bookId } = await params;
  const book = await prisma.book.findFirst({
    where: {
      status: 'PUBLISHED',
      OR: [{ id: bookId }, { slug: bookId }],
    },
    select: {
      id: true,
      slug: true,
      title: true,
      author: true,
    },
  });

  if (!book) {
    return {
      title: 'Reader | One Man Revolution',
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  return {
    title: `${book.title} Reader | One Man Revolution`,
    description: `Read “${book.title}” by ${book.author} in the One Man Revolution reader.`,
    alternates: {
      canonical: getBookPath(book),
    },
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
      },
    },
  };
}

export default async function ReadBookPage({ params }: ReadBookPageParams) {
  const { bookId } = await params;
  const session = await getServerSession(authOptions);
  
  const book = await prisma.book.findFirst({
    where: {
      OR: [{ id: bookId }, { slug: bookId }],
    },
    include: { epubFile: true }
  });

  if (!book || !book.epubFile) {
    notFound();
  }

  const access = await getBookAccessState(book, session?.user);
  const donorRequirementText = getBookDonorRequirementText(access.bookDonorAccessLevel);
  const lockedAudienceLabel = getBookLockedAudienceLabel(access.bookDonorAccessLevel);
  const canonicalBookPath = getBookPath(book);
  const canonicalReadPath = getBookReadPath(book);

  if (!access.isPublished && !access.isPrivileged) {
    notFound();
  }

  if (bookId !== (book.slug?.trim() || book.id)) {
    permanentRedirect(canonicalReadPath);
  }

  if (!access.hasAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-landing-bg px-4 py-12">
        <div className="surface-card max-w-xl p-8 text-center sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">
            Supporter Library
          </p>
          <h1 className="mt-4 font-playfair text-3xl font-semibold text-landing-text sm:text-4xl">
            “{book.title}” is reserved for {lockedAudienceLabel}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-landing-text-muted">
            Access requires {donorRequirementText} on your account before this title can open.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href={canonicalBookPath} className="brand-button px-6 py-3">
              Back to book page
            </Link>
            {!session && (
              <Link
                href={`/login?callbackUrl=${encodeURIComponent(canonicalBookPath)}`}
                className="ghost-button px-6 py-3"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </main>
    );
  }

  const donorFeatureAccess = await getDonorFeatureAccessState(book, session?.user);
  const sessionUserId = typeof session?.user?.id === 'string' && session.user.id.trim().length > 0
    ? session.user.id
    : null;
  const loginHref = `/login?callbackUrl=${encodeURIComponent(canonicalBookPath)}`;
  const narrationManageHref = sessionUserId ? `${canonicalBookPath}#support-this-book` : loginHref;

  // TODO: Fetch saved progress if user is logged in
  let initialLocation = null;
  let progressSaveEndpoint: string | null = null;
  let initialNarrationPlayerExpanded: boolean | null = null;
  let canSyncNarrationPlayerPreference = false;

  if (sessionUserId) {
    const [progress, user] = await Promise.all([
      prisma.readingProgress.findUnique({
        where: {
          userId_bookId: {
            userId: sessionUserId,
            bookId: book.id
          }
        }
      }),
      prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { readerPreferences: true },
      }),
    ]);

    if (progress) initialLocation = progress.cfi;
    initialNarrationPlayerExpanded = normalizeReaderPreferences(user?.readerPreferences).narrationPlayerExpanded ?? null;

    if (user) {
      progressSaveEndpoint = '/api/progress';
      canSyncNarrationPlayerPreference = true;
    }
  }

  return (
    <div className="h-screen w-screen overflow-hidden">
        {/* We pass the client-side logic to the Reader component */}
        <Reader 
            url={`/api/books/${book.id}/file`} 
            initialLocation={initialLocation}
            bookId={book.id}
            title={book.title}
            progressSaveEndpoint={progressSaveEndpoint}
            initialNarrationPlayerExpanded={initialNarrationPlayerExpanded}
            narrationPlayerPreferenceEndpoint={canSyncNarrationPlayerPreference ? '/api/reader/preferences' : null}
            narrationAccess={{
              hasAccess: donorFeatureAccess.hasAccess,
              isSignedIn: donorFeatureAccess.isSignedIn,
              manageHref: narrationManageHref,
              statusEndpoint: `/api/books/${book.id}/narration`,
              isEnabled: book.narrationEnabled,
            }}
        />
    </div>
  );
}
