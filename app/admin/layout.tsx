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
    <div className="flex flex-col md:flex-row h-screen bg-gray-100 overflow-hidden">
      <aside className="w-full md:w-64 md:h-screen bg-white shadow-md flex-shrink-0 flex flex-col">
        <div className="p-4 md:p-6 flex items-center justify-between">
          <h2 className="text-xl md:text-2xl font-bold text-gray-800">Admin Panel</h2>
        </div>
        <nav className="flex flex-row overflow-x-auto md:flex-col border-b md:border-b-0 md:mt-6 pb-2 md:pb-0 scrollbar-hide flex-1">
          <Link
            href="/admin"
            className="block px-4 md:px-6 py-2 md:py-3 text-gray-700 hover:bg-gray-100 whitespace-nowrap text-sm md:text-base"
          >
            Dashboard
          </Link>
          <Link
            href="/admin/books"
            className="block px-4 md:px-6 py-2 md:py-3 text-gray-700 hover:bg-gray-100 whitespace-nowrap text-sm md:text-base"
          >
            Manage Books
          </Link>
          <Link
            href="/admin/books/upload"
            className="block px-4 md:px-6 py-2 md:py-3 text-gray-700 hover:bg-gray-100 whitespace-nowrap text-sm md:text-base"
          >
            Upload Book
          </Link>
          <div className="md:mt-auto">
            <Link
               href="/"
               className="block px-4 md:px-6 py-2 md:py-3 text-gray-700 hover:bg-gray-100 whitespace-nowrap text-sm md:text-base md:border-t"
            >
              Back to Library
            </Link>
          </div>
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
    </div>
  );
}
