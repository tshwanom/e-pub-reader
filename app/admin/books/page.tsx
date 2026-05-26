import { prisma } from "@/lib/prisma";
import { formatBookDonorAccessLevel, isDonorRestrictedBook } from '@/lib/book-access-config';
import Image from "next/image";
import Link from "next/link";
import { format } from "date-fns";

export default async function AdminBooksPage() {
  const books = await prisma.book.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      author: true,
      slug: true,
      status: true,
      donorOnly: true,
      donorAccessLevel: true,
      createdAt: true,
      coverUrl: true,
      epubFile: {
        select: {
          id: true,
        },
      },
      narrations: {
        where: {
          active: true,
        },
        take: 1,
        orderBy: {
          updatedAt: "desc",
        },
        select: {
          status: true,
          totalDurationMs: true,
          totalChapters: true,
          voice: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  const donorOnlyCount = books.filter((book) => isDonorRestrictedBook(book.donorAccessLevel)).length;
  const readyNarrationCount = books.filter((book) => book.narrations[0]?.status === "READY").length;

  return (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden p-6 sm:p-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)] xl:items-end">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">
              Catalog control
            </p>
            <h1 className="mt-2 font-playfair text-3xl text-landing-text sm:text-4xl">Manage books and donor narration</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-landing-text-muted sm:text-[15px]">
              Keep metadata tidy, verify donor access, and jump straight into narration generation from each title’s editor.
            </p>

            <div className="mt-5">
              <Link href="/admin/books/upload" className="brand-button self-start">
                Upload new book
              </Link>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
            <div className="surface-muted p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Titles</p>
              <p className="mt-3 text-3xl font-semibold text-landing-text">{books.length}</p>
              <p className="mt-2 text-sm text-landing-text-muted">Draft and published titles across the catalog.</p>
            </div>
            <div className="surface-muted p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Donor-only</p>
              <p className="mt-3 text-3xl font-semibold text-landing-text">{donorOnlyCount}</p>
              <p className="mt-2 text-sm text-landing-text-muted">Books currently reserved for supporters.</p>
            </div>
            <div className="surface-muted p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">Ready narration</p>
              <p className="mt-3 text-3xl font-semibold text-landing-text">{readyNarrationCount}</p>
              <p className="mt-2 text-sm text-landing-text-muted">Titles with an active ready-to-stream narration.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[920px] divide-y divide-landing-border/70">
            <thead className="bg-white/70">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                  Title
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                  Author
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                  Access
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                  Narration
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                  Created
                </th>
                 <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-landing-border/60 bg-white/30">
              {books.map((book) => (
                <tr key={book.id} className="transition-colors hover:bg-white/70">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="relative h-14 w-10 overflow-hidden rounded-xl bg-white ring-1 ring-landing-border/70">
                        {book.coverUrl ? (
                          <Image
                            src={book.coverUrl}
                            alt={book.title}
                            fill
                            unoptimized
                            sizes="40px"
                            className="object-cover"
                          />
                        ) : null}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-landing-text">{book.title}</div>
                        <div className="text-sm text-landing-text-muted">{book.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-landing-text">{book.author}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      book.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {book.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      book.donorAccessLevel === 'RECURRING_DONORS'
                        ? 'bg-amber-100 text-amber-700'
                        : book.donorAccessLevel === 'ALL_DONORS'
                          ? 'bg-violet-100 text-violet-700'
                          : 'bg-slate-100 text-slate-700'
                    }`}>
                      {formatBookDonorAccessLevel(book.donorAccessLevel)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-landing-text-muted">
                    {book.narrations[0] ? (
                      <div className="space-y-1">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          book.narrations[0].status === 'READY'
                            ? 'bg-emerald-100 text-emerald-700'
                            : book.narrations[0].status === 'FAILED'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-amber-100 text-amber-700'
                        }`}>
                          {book.narrations[0].status}
                        </span>
                        <div className="text-xs text-landing-text-muted">
                          {book.narrations[0].voice.name} · {book.narrations[0].totalChapters} chapters
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-landing-text-muted">Not generated</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(book.createdAt, "MMM d, yyyy")}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Link href={`/admin/books/${book.id}`} className="text-landing-accent transition-colors hover:text-landing-accent-secondary">
                      Open editor
                    </Link>
                  </td>
                </tr>
              ))}
              {books.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-sm text-landing-text-muted">
                    No books have been uploaded yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
