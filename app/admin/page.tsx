import { prisma } from "@/lib/prisma";

export default async function AdminDashboard() {
  const bookCount = await prisma.book.count();
  const userCount = await prisma.user.count();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm font-medium">Total Books</h3>
          <p className="text-3xl font-bold">{bookCount}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm font-medium">Total Users</h3>
          <p className="text-3xl font-bold">{userCount}</p>
        </div>
      </div>
    </div>
  );
}
