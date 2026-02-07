import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function Home() {
  const session = await getServerSession(authOptions);
  
  // Fetch only published books for public, or all for now since we are in dev
  const books = await prisma.book.findMany({
    where: { status: "PUBLISHED" }, // TODO: Enable this filter once we have publishing logic
    // For now, let's just fetch all to see them
    // where: {}, 
    orderBy: { createdAt: "desc" },
    include: { epubFile: true }
  });

  // Fallback if no books
  const allBooks = await prisma.book.findMany({
      orderBy: { createdAt: "desc" },
       include: { epubFile: true }
  });

  const displayBooks = books.length > 0 ? books : allBooks;

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Digital Library</h1>
          <div>
            {session ? (
               <div className="flex gap-4 items-center">
                  <span className="text-sm text-gray-600">Welcome, {session.user.name || session.user.email}</span>
                  {session.user.role === 'ADMIN' && (
                      <Link href="/admin" className="text-blue-600 hover:text-blue-800">Admin Dashboard</Link>
                  )}
                  <Link href="/api/auth/signout" className="text-sm text-red-600 hover:text-red-800">Sign Out</Link>
               </div>
            ) : (
              <Link href="/api/auth/signin" className="text-blue-600 hover:text-blue-800">Login</Link>
            )}
          </div>
        </div>
      </header>

      {/* Book Grid */}
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {displayBooks.length === 0 ? (
           <div className="text-center py-20">
              <h2 className="text-xl text-gray-500">No books available yet.</h2>
              {session?.user.role === 'ADMIN' && (
                  <Link href="/admin/books/upload" className="mt-4 inline-block text-blue-600">Upload your first book</Link>
              )}
           </div>
        ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {displayBooks.map((book) => (
                <div key={book.id} className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow duration-300 overflow-hidden flex flex-col">
                <div className="h-48 bg-gray-200 flex items-center justify-center">
                    {/* Placeholder for Cover */}
                    <span className="text-4xl">📖</span>
                </div>
                <div className="p-4 flex-1 flex flex-col">
                    <h3 className="text-lg font-semibold text-gray-900 line-clamp-2">{book.title}</h3>
                    <p className="text-sm text-gray-600 mb-2">{book.author}</p>
                    <div className="mt-auto">
                        <Link 
                            href={`/read/${book.id}`}
                            className="block w-full text-center bg-indigo-600 text-white py-2 rounded-md hover:bg-indigo-700 transition"
                        >
                            Read Now
                        </Link>
                        <Link 
                           href={`/books/${book.id}`}
                           className="block w-full text-center text-xs text-gray-500 mt-2 hover:underline"
                        >
                           Details
                        </Link>
                    </div>
                </div>
                </div>
            ))}
            </div>
        )}
      </div>
    </main>
  );
}
