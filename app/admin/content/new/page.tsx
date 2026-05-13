import { prisma } from "@/lib/prisma";
import ContentEditorForm from "../_components/ContentEditorForm";

export const dynamic = "force-dynamic";

export default async function NewContentPage() {
  const books = await prisma.book.findMany({
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
    },
  });

  return (
    <div className="space-y-6">
      <section className="surface-card p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">New content</p>
        <h1 className="mt-2 font-playfair text-3xl text-landing-text sm:text-4xl">Add a platform content item</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-landing-text-muted sm:text-[15px]">
          Create blog articles, videos, poems, or quotes that can appear across the public platform and receive their own narration.
        </p>
      </section>

      <ContentEditorForm mode="create" books={books} />
    </div>
  );
}
