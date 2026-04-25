import { isPrivilegedUser, isUserDonor } from "@/lib/book-access";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Header from "@/components/landing/Header";
import BookCard from "@/components/landing/BookCard";
import Footer from "@/components/landing/Footer";

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  const session = await getServerSession(authOptions);
  const privileged = isPrivilegedUser(session?.user);
  const isDonor = privileged ? true : await isUserDonor(session?.user?.id);
  
  const books = await prisma.book.findMany({
    where: privileged ? undefined : { status: 'PUBLISHED' },
    orderBy: { createdAt: "desc" },
    include: { epubFile: true }
  });

  return (
    <main className="page-shell">
      {/* Header */}
      <Header />

      {/* Library Content */}
      <div className="page-container py-14 sm:py-16">
        <div className="mb-12 max-w-3xl">
          <h1 className="font-playfair text-4xl font-semibold text-landing-text md:text-5xl">
            Library
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-landing-text-muted">
            Browse the full catalog in one calm, distraction-free reading space.
            Some titles are marked for sustaining donors.
          </p>
        </div>

        {books.length === 0 ? (
          <div className="surface-card py-20 text-center">
            <h2 className="text-xl text-landing-text-muted mb-4">
              No books available yet.
            </h2>
            {session?.user.role === 'ADMIN' && (
              <Link 
                href="/admin/books/upload" 
                className="brand-button"
              >
                Upload your first book
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {books.map((book) => (
              <BookCard
                key={book.id}
                id={book.id}
                title={book.title}
                author={book.author}
                description={book.description}
                coverUrl={book.coverUrl}
                donorOnly={book.donorOnly}
                isAccessible={privileged || !book.donorOnly || isDonor}
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
