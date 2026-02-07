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
    <div className="flex h-screen bg-gray-100">
      <aside className="w-64 bg-white shadow-md">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-800">Admin Panel</h2>
        </div>
        <nav className="mt-6">
          <Link
            href="/admin"
            className="block px-6 py-3 text-gray-700 hover:bg-gray-100"
          >
            Dashboard
          </Link>
          <Link
            href="/admin/books"
            className="block px-6 py-3 text-gray-700 hover:bg-gray-100"
          >
            Manage Books
          </Link>
          <Link
            href="/admin/books/upload"
            className="block px-6 py-3 text-gray-700 hover:bg-gray-100"
          >
            Upload Book
          </Link>
          <Link
             href="/"
             className="block px-6 py-3 text-gray-700 hover:bg-gray-100 mt-10 border-t"
          >
            Back to Library
          </Link>
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
