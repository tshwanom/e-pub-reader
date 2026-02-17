import { prisma } from "@/lib/prisma";
import AnalyticsStats from "./_components/AnalyticsStats";
import RevenueChart from "./_components/RevenueChart";
import ReaderGrowthChart from "./_components/ReaderGrowthChart";
import RecentActivity from "./_components/RecentActivity";
import BookPerformance from "./_components/BookPerformance";

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  // Fetch summary stats
  const [totalUsers, totalBooks, totalDonations, recentDonations, recentUsers, books, allDonations, allUsers] = await Promise.all([
    prisma.user.count({ where: { role: 'READER' } }),
    prisma.book.count(),
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
    <div>
      <h1 className="text-3xl font-bold mb-8">Dashboard Overview</h1>

      <AnalyticsStats
        totalUsers={totalUsers}
        totalBooks={totalBooks}
        totalDonations={Number(totalDonations._sum.amount || 0)}
        activeReaders={activeReaders}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
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
