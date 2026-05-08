import { prisma } from "@/lib/prisma";
import { formatCurrencyAmount } from '@/lib/donations';
import AnalyticsStats from "./_components/AnalyticsStats";
import RevenueChart from "./_components/RevenueChart";
import ReaderGrowthChart from "./_components/ReaderGrowthChart";
import RecentActivity from "./_components/RecentActivity";
import BookPerformance from "./_components/BookPerformance";
import Link from "next/link";

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  // Fetch summary stats
  const [totalUsers, totalBooks, donorOnlyBooks, readyNarratedBooks, totalDonations, recentDonations, recentUsers, books, allDonations, allUsers] = await Promise.all([
    prisma.user.count({ where: { role: 'READER' } }),
    prisma.book.count(),
    prisma.book.count({ where: { donorOnly: true } }),
    prisma.book.count({ where: { narrations: { some: { active: true, status: 'READY' } } } }),
    prisma.donation.aggregate({ _sum: { amount: true }, where: { status: 'COMPLETED' } }),
    prisma.donation.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { user: true },
       where: { status: 'COMPLETED' }
    }),
    prisma.user.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      where: { role: 'READER' }
    }),
    prisma.book.findMany({
      include: {
        _count: {
          select: {
            readingProgress: true, // Started reading
            donations: true,
          }
        },
        donations: {
            where: { status: 'COMPLETED' }
        },
        readingProgress: {
             where: { progress: 100 } // Completed
        }
      }
    }),
    // Fetch last 30 days data for charts (could be optimized with raw SQL or group by but this is easier for now)
    prisma.donation.findMany({
        where: {
            status: 'COMPLETED',
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        },
        select: { createdAt: true, amount: true }
    }),
     prisma.user.findMany({
        where: {
            role: 'READER',
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        },
        select: { createdAt: true }
    })
  ]);

  // Calculate active readers (readers who have made progress in last 30 days)
  const activeReaders = await prisma.readingProgress.groupBy({
    by: ['userId'],
    where: {
        updatedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    },
    _count: { userId: true }
  }).then(res => res.length);

  // Process chart data
  const revenueData = Array.from({ length: 30 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const dateStr = d.toISOString().split('T')[0];
    const total = allDonations
        .filter(don => don.createdAt.toISOString().startsWith(dateStr))
        .reduce((sum, don) => sum + Number(don.amount), 0);
    return { date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric'}), total };
  });

   const readerGrowthData = Array.from({ length: 30 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const dateStr = d.toISOString().split('T')[0];
    const count = allUsers
        .filter(user => user.createdAt.toISOString().startsWith(dateStr))
        .length;
    return { date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric'}), count };
  });

  // Process book performance
  const booksPerformance = books.map(book => ({
      id: book.id,
      title: book.title,
      readers: book._count.readingProgress,
      completions: book.readingProgress.length, // approximation based on include filtering
      donations: book._count.donations,
      revenue: book.donations.reduce((sum, d) => sum + Number(d.amount), 0)
  })).sort((a, b) => b.readers - a.readers);


  return (
    <div className="space-y-8">
      <section className="surface-card overflow-hidden p-6 sm:p-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)] xl:items-end">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">
              Dashboard overview
            </p>
            <h1 className="mt-2 font-playfair text-3xl text-landing-text sm:text-4xl">
              Publishing, donors, and narration at a glance
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-landing-text-muted sm:text-[15px]">
              Track how readers are discovering the library, how donations are trending, and how much of the catalog is already upgraded with donor-ready narration.
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link href="/admin/books" className="ghost-button">
                Manage books
              </Link>
              <Link href="/admin/books/upload" className="brand-button">
                Upload a new EPUB
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="surface-muted p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                Active readers
              </p>
              <p className="mt-3 text-2xl font-semibold text-landing-text">{activeReaders}</p>
              <p className="mt-2 text-sm text-landing-text-muted">
                Accounts with fresh reading progress in the last 30 days.
              </p>
            </div>
            <div className="surface-muted p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                Ready narration
              </p>
              <p className="mt-3 text-2xl font-semibold text-landing-text">{readyNarratedBooks}</p>
              <p className="mt-2 text-sm text-landing-text-muted">
                Titles already published with donor-ready audio.
              </p>
            </div>
            <div className="surface-muted p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                Donation revenue (USD)
              </p>
              <p className="mt-3 text-2xl font-semibold text-landing-text">
                {formatCurrencyAmount(Number(totalDonations._sum.amount || 0), 'USD')}
              </p>
              <p className="mt-2 text-sm text-landing-text-muted">
                Completed contributions supporting the library so far, normalized to USD.
              </p>
            </div>
          </div>
        </div>
      </section>

      <AnalyticsStats
        totalUsers={totalUsers}
        totalBooks={totalBooks}
        totalDonations={Number(totalDonations._sum.amount || 0)}
        activeReaders={activeReaders}
        donorOnlyBooks={donorOnlyBooks}
        readyNarratedBooks={readyNarratedBooks}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RevenueChart data={revenueData} />
        <ReaderGrowthChart data={readerGrowthData} />
      </div>

      <RecentActivity
        recentDonations={recentDonations}
        recentUsers={recentUsers}
      />

      <BookPerformance books={booksPerformance} />
    </div>
  );
}
