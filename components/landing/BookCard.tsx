'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';

interface BookCardProps {
  id: string;
  title: string;
  author: string;
  description: string;
  coverUrl: string;
}

export default function BookCard({ id, title, author, description, coverUrl }: BookCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="group bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        transform: isHovered ? 'translateY(-8px)' : 'translateY(0)',
      }}
    >
      {/* Book Cover */}
      <div className="relative aspect-[2/3] bg-gradient-to-br from-landing-accent/10 to-landing-accent-secondary/10 overflow-hidden">
        {coverUrl && coverUrl !== '/placeholder-cover.jpg' ? (
          <Image
            src={coverUrl}
            alt={title}
            fill
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              className="w-20 h-20 text-landing-accent/30"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
            </svg>
          </div>
        )}
      </div>

      {/* Book Info */}
      <div className="p-6 flex-1 flex flex-col">
        <h3 className="font-inter text-xl font-semibold text-landing-text mb-2 line-clamp-2">
          {title}
        </h3>
        <p className="font-inter text-sm text-landing-text-muted mb-3">
          {author}
        </p>
        <p className="font-inter text-sm text-landing-text-muted leading-relaxed line-clamp-3 mb-4 flex-1">
          {description}
        </p>

        {/* CTA */}
        <Link
          href={`/books/${id}`}
          className="inline-flex items-center text-landing-accent hover:text-landing-accent-secondary font-semibold transition-colors duration-200"
        >
          Read Free
          <svg
            className="w-4 h-4 ml-2 transition-transform duration-200 group-hover:translate-x-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </Link>
      </div>
    </div>
  );
}
