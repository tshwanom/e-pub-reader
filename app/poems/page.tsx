import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Poems | One Man Revolution',
  description: 'Poetry collection from our books.',
};

export default async function PoemsPage() {
  const poems = await prisma.supplementaryContent.findMany({
    where: {
      type: 'POEM',
    },
    include: {
      book: {
        select: {
          title: true,
          slug: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return (
    <div className="min-h-screen bg-[#f8f5f2] pt-24 pb-12">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-6 font-playfair italic">Poetry Collection</h1>
          <div className="w-24 h-1 bg-gray-900 mx-auto opacity-20"></div>
        </div>

        <div className="space-y-16">
          {poems.map((poem) => (
            <div key={poem.id} className="relative">
              <div className="text-center mb-8">
                 <h2 className="text-3xl font-bold text-gray-800 mb-2 font-playfair">{poem.title}</h2>
                 {poem.author && (
                   <p className="text-gray-500 italic font-serif">by {poem.author}</p>
                 )}
              </div>

              <div className="prose prose-lg mx-auto text-center font-serif text-gray-800 leading-relaxed whitespace-pre-wrap">
                {poem.content}
              </div>

              <div className="mt-8 text-center">
                 <Link 
                   href={`/books/${poem.book.slug || poem.bookId}`}
                   className="inline-block text-xs uppercase tracking-widest text-gray-400 hover:text-gray-900 transition-colors border-b border-transparent hover:border-gray-900 pb-1"
                 >
                   From: {poem.book.title}
                 </Link>
              </div>

              {/* Decorative divider */}
              <div className="flex items-center justify-center mt-16 opacity-30 gap-2">
                 <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                 <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                 <span className="w-2 h-2 rounded-full bg-gray-400"></span>
              </div>
            </div>
          ))}
        </div>

        {poems.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-500 italic font-serif text-lg">Silence matches the empty page...</p>
          </div>
        )}
      </div>
    </div>
  );
}
