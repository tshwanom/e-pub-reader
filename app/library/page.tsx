import { getUserDonorProfile, isPrivilegedUser } from "@/lib/book-access";
import {
  type DonorTier,
  hasBookAccessForDonorTier,
  resolveBookDonorAccessLevel,
} from '@/lib/book-access-config';
import { getUserActivePaystackSubscription } from '@/lib/donation-subscriptions';
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Header from "@/components/landing/Header";
import BookCard from "@/components/landing/BookCard";
import Footer from "@/components/landing/Footer";
import PaystackSubscriptionManager from '@/components/PaystackSubscriptionManager';
import { getLocale, getTranslations } from "@/lib/i18n-server";

export const dynamic = 'force-dynamic';

export default async function LibraryPage({
  searchParams,
}: {
  searchParams?: Promise<{ subscription?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const privileged = isPrivilegedUser(session?.user);
  const donorTier: DonorTier = privileged
    ? 'RECURRING'
    : (await getUserDonorProfile(session?.user)).tier;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const paystackSubscription = session?.user ? await getUserActivePaystackSubscription(session.user) : null;
  
  const locale = await getLocale();
  const { t } = await getTranslations();

  const books = await prisma.book.findMany({
    where: {
      ...(privileged ? {} : { status: { in: ['PUBLISHED', 'COMING_SOON', 'PRE_RELEASE'] } }),
      ...(locale === 'en'
        ? { OR: [{ language: 'en' }, { language: null }] }
        : { language: locale }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      epubFile: true,
      printLinks: { select: { id: true } },
      readingProgress: session?.user?.id
        ? { where: { userId: session.user.id }, take: 1 }
        : false,
    },
  });

  return (
    <main className="page-shell">
      {/* Header */}
      <Header />

      {/* Library Content */}
      <div className="page-container py-14 sm:py-16">
        <div className="mb-12 max-w-3xl">
          <h1 className="font-playfair text-4xl font-semibold text-landing-text md:text-5xl">
            {t('catalogTitle')}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-landing-text-muted">
            {t('catalogSubtitle')}
          </p>
        </div>

        {paystackSubscription ? (
          <div className="mb-10">
            <PaystackSubscriptionManager
              subscription={paystackSubscription}
              returnTo="/library"
              status={resolvedSearchParams?.subscription}
            />
          </div>
        ) : null}

        {books.length === 0 ? (
          <div className="surface-card py-20 text-center">
            <h2 className="text-xl text-landing-text-muted mb-4">
              {t('noBooks')}
            </h2>
            {session?.user.role === 'ADMIN' && (
              <Link 
                href="/admin/books/upload" 
                className="brand-button"
              >
                {t('uploadFirst')}
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {books.map((book) => (
              <BookCard
                key={book.id}
                id={book.id}
                slug={book.slug}
                title={book.title}
                author={book.author}
                description={book.description}
                coverUrl={book.coverUrl}
                status={book.status}
                donorAccessLevel={book.donorAccessLevel}
                donorOnly={book.donorOnly}
                hasPrintVersion={book.printLinks.length > 0}
                isAccessible={
                  privileged
                  || hasBookAccessForDonorTier(resolveBookDonorAccessLevel(book), donorTier)
                }
                readingProgress={book.readingProgress?.[0]?.progress ?? null}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <Footer />
    </main>
  );
}
