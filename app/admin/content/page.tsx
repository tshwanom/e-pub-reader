import { getContentTypeLabel, withContentFeatureFallback } from "@/lib/content";
import { formatBookDonorAccessLevel, isDonorRestrictedBook, resolveBookDonorAccessLevel } from '@/lib/book-access-config';
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { FileText, Headphones, Plus, Video } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

function getStatusClasses(status: string) {
  switch (status) {
    case "PUBLISHED":
      return "bg-emerald-100 text-emerald-700";
    case "ARCHIVED":
      return "bg-slate-100 text-slate-700";
    case "DRAFT":
    default:
      return "bg-amber-100 text-amber-700";
  }
}

export default async function AdminContentPage() {
  const content = await withContentFeatureFallback(
    () => prisma.supplementaryContent.findMany({
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: {
        book: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
        narrations: {
          where: { active: true },
          take: 1,
          select: {
            id: true,
            status: true,
            durationMs: true,
            voice: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
    [],
    'admin content dashboard'
  );

  const publishedCount = content.filter((item) => item.status === "PUBLISHED").length;
  const standaloneCount = content.filter((item) => !item.bookId).length;
  const readyNarrationCount = content.filter((item) => item.narrations[0]?.status === "READY").length;
  const videoCount = content.filter((item) => item.type === "VIDEO").length;
  const restrictedCount = content.filter((item) => isDonorRestrictedBook(resolveBookDonorAccessLevel(item))).length;

  return (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden p-6 sm:p-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)] xl:items-end">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">Platform content</p>
            <h1 className="mt-2 font-playfair text-3xl text-landing-text sm:text-4xl">Manage blog, videos, poems, quotes, and narration</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-landing-text-muted sm:text-[15px]">
              This is the full platform content desk: publish standalone articles, connect supporting media to books, and generate narration outside the EPUB reader.
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link href="/admin/content/new" className="brand-button gap-2 self-start">
                <Plus className="h-4 w-4" />
                Add content
              </Link>
              <Link href="/blog" className="ghost-button self-start">Preview blog</Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
            <div className="surface-muted p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Published</p>
              <p className="mt-3 text-3xl font-semibold text-landing-text">{publishedCount}</p>
              <p className="mt-2 text-sm text-landing-text-muted">Live public content items.</p>
            </div>
            <div className="surface-muted p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Standalone</p>
              <p className="mt-3 text-3xl font-semibold text-landing-text">{standaloneCount}</p>
              <p className="mt-2 text-sm text-landing-text-muted">Not tied to a book.</p>
            </div>
            <div className="surface-muted p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Ready narration</p>
              <p className="mt-3 text-3xl font-semibold text-landing-text">{readyNarrationCount}</p>
              <p className="mt-2 text-sm text-landing-text-muted">Content with live audio.</p>
            </div>
            <div className="surface-muted p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Videos</p>
              <p className="mt-3 text-3xl font-semibold text-landing-text">{videoCount}</p>
              <p className="mt-2 text-sm text-landing-text-muted">Media records in the library.</p>
            </div>
            <div className="surface-muted p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Donor-locked</p>
              <p className="mt-3 text-3xl font-semibold text-landing-text">{restrictedCount}</p>
              <p className="mt-2 text-sm text-landing-text-muted">Content items reserved for supporters.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {content.map((item) => {
          const narration = item.narrations[0];
          const Icon = item.type === "VIDEO" ? Video : FileText;
          const donorAccessLevel = resolveBookDonorAccessLevel(item);

          return (
            <article key={item.id} className="surface-card flex min-w-0 flex-col p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="rounded-2xl bg-landing-accent/10 p-3 text-landing-accent">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-landing-accent/10 px-2.5 py-1 text-xs font-semibold text-landing-accent">{getContentTypeLabel(item.type)}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClasses(item.status)}`}>{item.status}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        donorAccessLevel === 'RECURRING_DONORS'
                          ? 'bg-amber-100 text-amber-700'
                          : donorAccessLevel === 'ALL_DONORS'
                            ? 'bg-violet-100 text-violet-700'
                            : 'bg-slate-100 text-slate-700'
                      }`}>{formatBookDonorAccessLevel(donorAccessLevel)}</span>
                    </div>
                    <h2 className="mt-3 line-clamp-2 text-lg font-semibold text-landing-text">{item.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-landing-text-muted line-clamp-2">
                      {item.summary || item.content || item.url || "No excerpt yet."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 rounded-2xl bg-white/60 p-4 text-sm ring-1 ring-white/65 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Placement</p>
                  <p className="mt-1 font-medium text-landing-text">{item.book?.title || "Standalone"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Access</p>
                  <p className="mt-1 font-medium text-landing-text">{formatBookDonorAccessLevel(donorAccessLevel)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Narration</p>
                  <p className="mt-1 font-medium text-landing-text">
                    {item.type === 'VIDEO'
                      ? 'Not available for videos'
                      : narration
                        ? `${narration.status}${narration.voice?.name ? ` · ${narration.voice.name}` : ""}`
                        : item.narrationEnabled
                          ? "Enabled, not generated"
                          : "Disabled"}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-landing-border/70 pt-4 text-sm text-landing-text-muted">
                <span>Updated {format(item.updatedAt, "MMM d, yyyy")}</span>
                <Link href={`/admin/content/${item.id}`} className="inline-flex items-center gap-2 font-semibold text-landing-accent transition-colors hover:text-landing-accent-secondary">
                  <Headphones className="h-4 w-4" />
                  Open editor
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      {content.length === 0 ? (
        <div className="surface-card py-20 text-center">
          <p className="text-lg text-landing-text-muted">No platform content has been created yet.</p>
          <Link href="/admin/content/new" className="brand-button mt-5 gap-2">
            <Plus className="h-4 w-4" />
            Create the first item
          </Link>
        </div>
      ) : null}
    </div>
  );
}
