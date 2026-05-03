import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Image from 'next/image';

export default async function Header() {
  const session = await getServerSession(authOptions);
  const navLinks = [
    { href: '/library', label: 'Library' },
    { href: '/blog', label: 'Blog' },
    { href: '/videos', label: 'Videos' },
    { href: '/poems', label: 'Poems' },
    ...(session?.user?.role === 'ADMIN' ? [{ href: '/admin', label: 'Admin' }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-landing-border/90 bg-white/85 backdrop-blur-xl">
      <div className="page-container flex items-center justify-between gap-4 py-4">
        <Link
          href="/"
          className="group inline-flex items-center gap-3 rounded-xl px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2"
        >
          <Image src="/logo.png" alt="OMR Logo" width={36} height={36} className="rounded-full shadow-sm" />
          <span className="font-playfair text-lg font-semibold text-landing-text transition-colors group-hover:text-landing-accent">
            One Man Revolution
          </span>
        </Link>

        <nav className="hidden items-center rounded-full border border-landing-border bg-landing-bg-secondary p-1 lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-4 py-2 text-sm text-landing-text-muted transition-colors hover:text-landing-accent"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {session ? (
            <Link
              href="/api/auth/signout"
              className="ghost-button px-4 py-2"
            >
              Sign Out
            </Link>
          ) : (
            <Link
              href="/api/auth/signin"
              className="brand-button px-4 py-2"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>

      <div className="page-container pb-3 lg:hidden">
        <nav className="flex items-center gap-2 overflow-x-auto">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="whitespace-nowrap rounded-full border border-landing-border bg-white px-4 py-2 text-sm text-landing-text-muted transition-colors hover:border-landing-accent/40 hover:text-landing-accent"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
