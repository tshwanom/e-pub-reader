import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Header from "@/components/landing/Header";
import BookCard from "@/components/landing/BookCard";
import Footer from "@/components/landing/Footer";

export default async function LibraryPage() {
  const session = await getServerSession(authOptions);
  
  // Fetch all books for library (not just published)
  const books = await prisma.book.findMany({
    orderBy: { createdAt: "desc" },
    include: { epubFile: true }
  });

  return (
    <main className="min-h-screen bg-landing-bg">
      {/* Header */}
      <Header />

      {/* Library Content */}
      <div className="max-w-7xl mx-auto px-6 py-24">
        <div className="mb-12">
          <h1 className="font-playfair text-4xl md:text-5xl font-bold text-landing-text mb-4">
            Library
          </h1>
          <p className="font-inter text-lg text-landing-text-muted">
            Browse all available books
          </p>
        </div>

        {books.length === 0 ? (
          <div className="text-center py-20">
            <h2 className="font-inter text-xl text-landing-text-muted mb-4">
              No books available yet.
            </h2>
            {session?.user.role === 'ADMIN' && (
              <Link 
                href="/admin/books/upload" 
                className="inline-block px-6 py-3 bg-landing-accent text-white rounded-lg hover:bg-landing-accent-secondary transition-colors"
              >
                Upload your first book
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {books.map((book) => (
              <BookCard
                key={book.id}
                id={book.id}
                title={book.title}
                author={book.author}
                description={book.description}
                coverUrl={book.coverUrl}
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
