import { prisma } from '@/lib/prisma';

export default async function Footer() {
  // Fetch social links from database
  const settings = await prisma.siteSettings.findFirst();
  const socialLinks = settings?.socialLinks as Record<string, string> | null;

  return (
    <footer className="border-t border-landing-border bg-landing-bg">
      <div className="max-w-7xl mx-auto px-6 py-12 text-center">
        <p className="font-inter text-landing-text font-semibold mb-2">
          One Man Revolution
        </p>
        <p className="font-inter text-sm text-landing-text-muted mb-6">
          Truth does not need consensus.
        </p>

        {/* Social Links */}
        {socialLinks && Object.keys(socialLinks).length > 0 && (
          <div className="flex justify-center gap-6 mb-6">
            {Object.entries(socialLinks).map(([platform, url]) => (
              <a
                key={platform}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-landing-text-muted hover:text-landing-accent transition-colors duration-200"
                aria-label={platform}
              >
                <span className="text-sm capitalize">{platform}</span>
              </a>
            ))}
          </div>
        )}

        <p className="font-inter text-xs text-landing-text-muted">
          © {new Date().getFullYear()} One Man Revolution. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
