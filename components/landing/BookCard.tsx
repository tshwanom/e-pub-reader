import Link from 'next/link';
import Image from 'next/image';

interface BookCardProps {
  id: string;
  title: string;
  author: string;
  description: string;
  coverUrl: string;
}

export default function BookCard({ id, title, author, description, coverUrl }: BookCardProps) {
  return (
    <article className="group surface-card flex h-full flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      {/* Book Cover */}
      <div className="relative aspect-[2/3] overflow-hidden bg-gradient-to-br from-landing-accent/10 to-landing-bg">
        {coverUrl && coverUrl !== '/placeholder-cover.jpg' ? (
          <Image
            src={coverUrl}
            alt={title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              className="h-20 w-20 text-landing-accent/30"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
            </svg>
          </div>
        )}
      </div>

      {/* Book Info */}
      <div className="flex flex-1 flex-col p-6">
        <h3 className="line-clamp-2 font-inter text-xl font-semibold text-landing-text">
          {title}
        </h3>
        <p className="mt-2 font-inter text-sm text-landing-text-muted">
          {author}
        </p>
        <p className="mb-5 mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-landing-text-muted">
          {description}
        </p>

        {/* CTA */}
        <Link
          href={`/books/${id}`}
          className="inline-flex items-center text-sm font-semibold text-landing-accent transition-colors duration-200 hover:text-landing-accent-secondary"
        >
          Read Free
          <svg
            className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </Link>
      </div>
    </article>
  );
}
