import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Videos | One Man Revolution',
  description: 'Video content from our books.',
};

export default async function VideosPage() {
  const videos = await prisma.supplementaryContent.findMany({
    where: {
      type: 'VIDEO',
    },
    include: {
      book: {
        select: {
          title: true,
          slug: true,
          coverUrl: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return (
    <div className="min-h-screen bg-gray-900 pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4 font-playfair">Video Library</h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Watch supplementary videos, interviews, and documentaries related to our books.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {videos.map((video) => (
            <div key={video.id} className="bg-gray-800 rounded-xl overflow-hidden shadow-lg border border-gray-700 flex flex-col">
               {/* Video Embed/Link */}
               <div className="aspect-video bg-black relative">
                  {video.url && (video.url.includes('youtube.com') || video.url.includes('youtu.be')) ? (
                      <iframe 
                        src={video.url.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')}
                        className="w-full h-full"
                        allowFullScreen
                        title={video.title}
                      />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-800">
                       <a href={video.url || '#'} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2 text-landing-accent hover:text-white transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 0 1 0 .656l-5.603 3.113a.375.375 0 0 1-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112Z" />
                          </svg>
                          <span className="font-medium">Watch Externally</span>
                       </a>
                    </div>
                  )}
               </div>

               <div className="p-5 flex-1 flex flex-col">
                  <h2 className="text-lg font-bold text-white mb-2 font-playfair line-clamp-2">
                    {video.title}
                  </h2>
                  
                  <div className="mt-auto pt-4 border-t border-gray-700">
                    <Link href={`/books/${video.book.slug || video.bookId}`} className="flex items-center gap-3 group">
                        {video.book.coverUrl && (
                          <img src={video.book.coverUrl} alt="" className="w-8 h-10 object-cover rounded shadow-sm group-hover:opacity-80 transition-opacity" />
                        )}
                        <div className="flex-1 overflow-hidden">
                          <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">Related Book</p>
                          <p className="text-sm font-semibold text-gray-300 group-hover:text-white transition-colors truncate">
                            {video.book.title}
                          </p>
                        </div>
                    </Link>
                  </div>
               </div>
            </div>
          ))}
        </div>

        {videos.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg">No videos available yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
