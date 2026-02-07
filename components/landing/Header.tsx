import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export default async function Header() {
  const session = await getServerSession(authOptions);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-landing-bg/80 backdrop-blur-sm border-b border-landing-border">
      <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
        {/* Logo/Brand */}
        <Link href="/" className="font-playfair text-xl font-bold text-landing-text hover:text-landing-accent transition-colors">
          One Man Revolution
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-6">
          <Link
            href="/library"
            className="font-inter text-sm text-landing-text hover:text-landing-accent transition-colors"
          >
            Library
          </Link>

          {session?.user?.role === 'ADMIN' && (
            <Link
              href="/admin"
              className="font-inter text-sm text-landing-text hover:text-landing-accent transition-colors"
            >
              Admin
            </Link>
          )}

          {session ? (
            <Link
              href="/api/auth/signout"
              className="font-inter text-sm text-landing-text-muted hover:text-landing-accent transition-colors"
            >
              Sign Out
            </Link>
          ) : (
            <Link
              href="/api/auth/signin"
              className="font-inter text-sm px-4 py-2 bg-landing-accent text-white rounded-lg hover:bg-landing-accent-secondary transition-colors"
            >
              Sign In
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
