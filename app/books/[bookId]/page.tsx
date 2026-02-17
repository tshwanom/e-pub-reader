import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Link from 'next/link';
import Image from 'next/image';
import DonationSection from '@/components/DonationSection';

export default async function BookDetailsPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  const session = await getServerSession(authOptions);

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    include: {
      epubFile: true,
      audiobook: true,
      printLinks: true,
      supplementaryContents: {
        orderBy: { order: 'asc' }
      },
      readingProgress: session?.user?.id
        ? {
            where: { userId: session.user.id },
            take: 1,
          }
        : false,
    },
  });

  if (!book) {
    notFound();
  }

  const progress = session?.user?.id && book.readingProgress?.[0];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Back button */}
        <Link
          href="/"
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-6"
        >
          ← Back to Library
        </Link>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Left column - Cover and actions */}
          <div className="md:col-span-1">
            <div className="bg-white rounded-lg shadow-lg p-6 sticky top-8">
              {/* Cover */}
              <div className="relative aspect-[2/3] mb-6 bg-gradient-to-br from-blue-100 to-purple-100 rounded-lg overflow-hidden">
                {book.coverUrl && book.coverUrl !== '/placeholder-cover.jpg' ? (
                  <Image
                    src={book.coverUrl}
                    alt={book.title}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg
                      className="w-24 h-24 text-blue-300"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Primary action */}
              <Link
                href={`/read/${book.id}`}
                className="block w-full bg-indigo-600 text-white text-center py-3 rounded-lg hover:bg-indigo-700 transition font-semibold mb-3"
              >
                {progress ? 'Continue Reading' : 'Start Reading'}
              </Link>

              {/* Progress */}
              {progress && (
                <div className="mb-4">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Progress</span>
                    <span>{Math.round(progress.progress)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-indigo-600 h-2 rounded-full transition-all"
                      style={{ width: `${progress.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Audiobook */}
              {book.audiobook && (
                <Link
                  href={`/listen/${book.id}`}
                  className="block w-full bg-green-600 text-white text-center py-3 rounded-lg hover:bg-green-700 transition font-semibold mb-3"
                >
                  🎧 Listen to Audiobook
                </Link>
              )}

              {/* Print-on-Demand Links */}
              {(book.amazonKdpUrl || book.printLinks.length > 0) && (
                <div className="border-t pt-4 mt-4">
                  <h3 className="font-semibold text-gray-900 mb-3">
                    Get Print Edition
                  </h3>
                  {book.amazonKdpUrl && (
                    <a
                      href={book.amazonKdpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full bg-yellow-400 text-gray-900 text-center py-2 rounded-lg hover:bg-yellow-500 transition font-medium mb-2"
                    >
                      📚 Amazon
                    </a>
                  )}
                  {book.printLinks.map((link) => (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full bg-gray-100 text-gray-900 text-center py-2 rounded-lg hover:bg-gray-200 transition mb-2"
                    >
                      {link.provider} ({link.format})
                    </a>
                  ))}
                </div>
              )}

              {/* Admin edit */}
              {session?.user?.role === 'ADMIN' && (
                <Link
                  href={`/admin/books/${book.id}`}
                  className="block w-full bg-gray-100 text-gray-700 text-center py-2 rounded-lg hover:bg-gray-200 transition mt-3"
                >
                  Edit (Admin)
                </Link>
              )}
            </div>
          </div>

          {/* Right column - Details */}
          <div className="md:col-span-2 space-y-6">
            {/* Book info */}
            <div className="bg-white rounded-lg shadow p-6">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {book.title}
              </h1>
              <p className="text-xl text-gray-600 mb-4">{book.author}</p>

              {/* Rich metadata */}
              <div className="flex flex-wrap gap-3 mb-6">
                <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium">
                  {book.status}
                </span>
                {book.language && book.language !== 'en' && (
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                    {book.language.toUpperCase()}
                  </span>
                )}
                {book.publisher && (
                  <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                    {book.publisher}
                  </span>
                )}
                {book.publishedAt && (
                  <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                    {new Date(book.publishedAt).getFullYear()}
                  </span>
                )}
                {book.isbn && (
                  <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-mono">
                    ISBN: {book.isbn}
                  </span>
                )}
              </div>

              {/* Subjects/Tags */}
              {book.subjects && book.subjects.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Categories</h3>
                  <div className="flex flex-wrap gap-2">
                    {book.subjects.map((subject, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs"
                      >
                        {subject}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              {book.description && (
                <div className="prose max-w-none">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">About this book</h3>
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {book.description}
                  </p>
                </div>
              )}
            </div>

            {/* Donation section */}
            {book.donationEnabled && (
              <DonationSection
                bookId={book.id}
                bookTitle={book.title}
                message={book.donationMessage}
                goal={book.donationGoal ? Number(book.donationGoal) : undefined}
              />
            )}

            {/* Supplementary Content */}
            {book.supplementaryContents && book.supplementaryContents.length > 0 && (
              <div className="border-t pt-8 mt-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Explore More</h2>
                <div className="grid gap-6">
                  {book.supplementaryContents.map((item) => (
                    <div key={item.id} className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
                      {item.type === 'VIDEO' && (
                        <div>
                          <h3 className="text-lg font-semibold mb-3">{item.title}</h3>
                          {item.url && (
                             <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                                {item.url.includes('youtube.com') || item.url.includes('youtu.be') ? (
                                   <iframe 
                                     src={item.url.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')}
                                     className="w-full h-full"
                                     allowFullScreen
                                   />
                                ) : (
                                   <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center h-full text-blue-600 hover:underline">
                                     Watch Video ↗
                                   </a>
                                )}
                             </div>
                          )}
                        </div>
                      )}
                      
                      {item.type === 'ARTICLE' && (
                        <div>
                          <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                          {item.content && (
                            <div className="prose prose-sm text-gray-600 mb-3 whitespace-pre-wrap">
                              {item.content.length > 300 ? `${item.content.slice(0, 300)}...` : item.content}
                            </div>
                          )}
                          {item.url && (
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-medium hover:underline">
                              Read Full Article ↗
                            </a>
                          )}
                        </div>
                      )}

                      {item.type === 'POEM' && (
                        <div className="text-center bg-gray-50 p-6 rounded-lg italic font-serif">
                          <h3 className="text-xl font-semibold mb-4 not-italic font-sans">{item.title}</h3>
                          <div className="whitespace-pre-wrap text-gray-800 leading-relaxed max-w-lg mx-auto">
                            {item.content}
                          </div>
                          {item.author && (
                            <p className="mt-4 text-gray-500 not-italic">— {item.author}</p>
                          )}
                        </div>
                      )}

                      {item.type === 'QUOTE' && (
                        <div className="border-l-4 border-indigo-500 pl-6 py-2 my-2">
                           <blockquote className="text-xl font-medium italic text-gray-900 mb-2">
                             "{item.content}"
                           </blockquote>
                           {item.author && (
                             <cite className="text-sm text-gray-500 font-medium not-italic">
                               — {item.author}
                             </cite>
                           )}
                           {item.title && <p className="text-xs text-gray-400 mt-1">{item.title}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
