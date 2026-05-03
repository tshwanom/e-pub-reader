import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import Image from 'next/image';

export default async function Footer() {
  // Fetch social links from database
  const settings = await prisma.siteSettings.findFirst();
  const socialLinks = settings?.socialLinks as Record<string, string> | null;

  return (
    <footer className="border-t border-landing-border bg-landing-bg-secondary">
      <div className="page-container py-7 sm:py-8">
        <div className="surface-muted px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 flex items-center gap-3">
              <Image src="/logo.png" alt="OMR Logo" width={40} height={40} className="rounded-full" />
              <div>
                <p className="font-playfair text-lg font-semibold text-landing-text sm:text-xl">
                  One Man Revolution
                </p>
                <p className="mt-1 text-xs text-landing-text-muted sm:text-sm">
                  A quiet space for long-form truth.
                </p>
              </div>
            </div>

            <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm">
              <Link href="/library" className="text-landing-text-muted transition-colors hover:text-landing-accent">Library</Link>
              <Link href="/blog" className="text-landing-text-muted transition-colors hover:text-landing-accent">Blog</Link>
              <Link href="/videos" className="text-landing-text-muted transition-colors hover:text-landing-accent">Videos</Link>
              <Link href="/poems" className="text-landing-text-muted transition-colors hover:text-landing-accent">Poems</Link>
            </nav>
          </div>

          {socialLinks && Object.keys(socialLinks).length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {Object.entries(socialLinks).map(([platform, url]) => (
                <a
                  key={platform}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="capitalize text-landing-text-muted transition-colors hover:text-landing-accent"
                  aria-label={platform}
                >
                  {platform}
                </a>
              ))}
            </div>
          )}

          <p className="mt-3 text-[11px] text-landing-text-muted sm:text-xs">
            © {new Date().getFullYear()} One Man Revolution. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
