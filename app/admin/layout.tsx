import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    redirect("/api/auth/signin");
  }

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-gray-100">
      <aside className="w-full lg:w-64 lg:min-h-screen bg-white shadow-md flex-shrink-0">
        <div className="p-4 lg:p-6 flex items-center justify-between">
          <h2 className="text-xl lg:text-2xl font-bold text-gray-800">Admin Panel</h2>
        </div>
        <nav className="flex flex-row overflow-x-auto lg:flex-col border-b lg:border-b-0 lg:mt-6 pb-2 lg:pb-0 scrollbar-hide">
          <Link
            href="/admin"
            className="block px-4 lg:px-6 py-2 lg:py-3 text-gray-700 hover:bg-gray-100 whitespace-nowrap text-sm lg:text-base"
          >
            Dashboard
          </Link>
          <Link
            href="/admin/books"
            className="block px-4 lg:px-6 py-2 lg:py-3 text-gray-700 hover:bg-gray-100 whitespace-nowrap text-sm lg:text-base"
          >
            Manage Books
          </Link>
          <Link
            href="/admin/books/upload"
            className="block px-4 lg:px-6 py-2 lg:py-3 text-gray-700 hover:bg-gray-100 whitespace-nowrap text-sm lg:text-base"
          >
            Upload Book
          </Link>
          <Link
             href="/"
             className="block px-4 lg:px-6 py-2 lg:py-3 text-gray-700 hover:bg-gray-100 whitespace-nowrap text-sm lg:text-base lg:mt-10 lg:border-t"
          >
            Back to Library
          </Link>
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-4 lg:p-8">{children}</main>
    </div>
  );
}
