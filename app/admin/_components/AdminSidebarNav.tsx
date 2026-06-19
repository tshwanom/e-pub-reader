"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  BookCopy,
  Newspaper,
  LayoutDashboard,
  UploadCloud,
  Settings,
} from "lucide-react";

const navigationItems = [
  {
    href: "/admin",
    label: "Dashboard",
    description: "Stats, growth, and recent reader activity",
    icon: LayoutDashboard,
  },
  {
    href: "/admin/books",
    label: "Books",
    description: "Metadata, supporter access, and narration control",
    icon: BookCopy,
  },
  {
    href: "/admin/content",
    label: "Content",
    description: "Blog, videos, poems, quotes, and content narration",
    icon: Newspaper,
  },
  {
    href: "/admin/books/upload",
    label: "Upload",
    description: "Add a new EPUB and extract its metadata",
    icon: UploadCloud,
  },
  {
    href: "/admin/settings",
    label: "Settings",
    description: "Nominate hybrid R2/local storage and encrypt keys",
    icon: Settings,
  },
] as const;

type AdminSidebarNavProps = {
  compact?: boolean;
  className?: string;
};

function isCurrentPath(pathname: string, href: string) {
  return pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
}

export default function AdminSidebarNav({
  compact = false,
  className = "",
}: AdminSidebarNavProps) {
  const pathname = usePathname();

  if (compact) {
    return (
      <div className={["grid gap-3 sm:grid-cols-2 xl:grid-cols-5", className].filter(Boolean).join(" ")}>
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const active = isCurrentPath(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "rounded-2xl p-4 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2",
                active
                  ? "bg-landing-accent text-white shadow-sm"
                  : "surface-muted text-landing-text hover:bg-white/80 hover:text-landing-accent",
              ].join(" ")}
            >
              <div className="flex items-start gap-3">
                <span
                  className={[
                    "rounded-xl p-2 transition-colors",
                    active
                      ? "bg-white/15 text-white"
                      : "bg-landing-accent/10 text-landing-accent",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className={[
                    "mt-1 block text-xs leading-5",
                    active ? "text-white/80" : "text-landing-text-muted",
                  ].join(" ")}>
                    {item.description}
                  </span>
                </span>
              </div>
            </Link>
          );
        })}

        <div className="rounded-2xl bg-landing-accent/8 p-4 ring-1 ring-landing-accent/10 sm:col-span-2 xl:col-span-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">
                Reader-facing app
              </p>
              <p className="mt-2 text-sm text-landing-text-muted">
                Jump back to the public library to verify supporter access, playback, and live book pages.
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-semibold text-landing-accent transition-colors hover:text-landing-accent-secondary"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to library
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={["flex h-full flex-col gap-6", className].filter(Boolean).join(" ")}>
      <nav className="flex flex-col gap-2">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const active = isCurrentPath(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "group rounded-2xl px-4 py-3 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2",
                active
                  ? "bg-landing-accent text-white shadow-sm"
                  : "bg-white/55 text-landing-text hover:bg-white/80 hover:text-landing-accent",
              ].join(" ")}
            >
              <div className="flex items-start gap-3">
                <span
                  className={[
                    "mt-0.5 rounded-xl p-2 transition-colors",
                    active
                      ? "bg-white/15 text-white"
                      : "bg-landing-accent/10 text-landing-accent group-hover:bg-landing-accent/15",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span
                    className={[
                      "mt-1 block text-xs leading-5",
                      active ? "text-white/80" : "text-landing-text-muted",
                    ].join(" ")}
                  >
                    {item.description}
                  </span>
                </span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-2xl bg-landing-accent/8 p-4 ring-1 ring-landing-accent/10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">
          Reader-facing app
        </p>
        <p className="mt-2 text-sm text-landing-text-muted">
          Hop back to the public library to verify supporter access, reader playback, and the polished book pages.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-landing-accent transition-colors hover:text-landing-accent-secondary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to library
        </Link>
      </div>
    </div>
  );
}