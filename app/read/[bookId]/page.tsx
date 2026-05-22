import { getBookAccessState, getDonorFeatureAccessState } from "@/lib/book-access";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Reader from "@/components/Reader";
import Link from "next/link";
import { notFound } from "next/navigation";
import { normalizeReaderPreferences } from "@/lib/reader-preferences";

export default async function ReadBookPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const session = await getServerSession(authOptions);
  
  const book = await prisma.book.findUnique({
    where: { id: bookId },
    include: { epubFile: true }
  });

  if (!book || !book.epubFile) {
    notFound();
  }

  const access = await getBookAccessState(book, session?.user);

  if (!access.hasAccess) {
    if (!access.isPublished) {
      notFound();
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-landing-bg px-4 py-12">
        <div className="surface-card max-w-xl p-8 text-center sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">
            Donor Library
          </p>
          <h1 className="mt-4 font-playfair text-3xl font-semibold text-landing-text sm:text-4xl">
            “{book.title}” is reserved for donors
          </h1>
          <p className="mt-4 text-base leading-relaxed text-landing-text-muted">
            Support the work once to unlock this title and the rest of the donor collection.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href={`/books/${book.id}`} className="brand-button px-6 py-3">
              Back to book page
            </Link>
            {!session && (
              <Link
                href={`/login?callbackUrl=${encodeURIComponent(`/books/${book.id}`)}`}
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
  const loginHref = `/login?callbackUrl=${encodeURIComponent(`/books/${book.id}`)}`;
  const narrationManageHref = sessionUserId ? `/books/${book.id}#support-this-book` : loginHref;

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
