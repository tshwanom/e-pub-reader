import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Reader from "@/components/Reader";
import { notFound } from "next/navigation";

export default async function ReadBookPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const session = await getServerSession(authOptions);
  
  const book = await prisma.book.findUnique({
    where: { id: bookId },
    include: { epubFile: true }
  });

  if (!book || !book.epubFile) {
    notFound();
  }

  // TODO: Fetch saved progress if user is logged in
  let initialLocation = null;
  if (session) {
    const progress = await prisma.readingProgress.findUnique({
        where: {
            userId_bookId: {
                userId: session.user.id,
                bookId: book.id
            }
        }
    });
    if (progress) initialLocation = progress.cfi;
  }

  return (
    <div className="h-screen w-screen overflow-hidden">
        {/* We pass the client-side logic to the Reader component */}
        <Reader 
            url={book.epubFile.fileUrl} 
            initialLocation={initialLocation}
            bookId={book.id}
        />
    </div>
  );
}
