import { withContentFeatureFallback } from "@/lib/content";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import ContentEditorForm from "../_components/ContentEditorForm";
import ContentNarrationStudio from "../_components/ContentNarrationStudio";

export const dynamic = "force-dynamic";

export default async function EditContentPage({ params }: { params: Promise<{ contentId: string }> }) {
  const { contentId } = await params;

  const [content, books] = await Promise.all([
    withContentFeatureFallback(
      () => prisma.supplementaryContent.findUnique({
        where: { id: contentId },
        select: {
          id: true,
          type: true,
          status: true,
          donorOnly: true,
          donorAccessLevel: true,
          title: true,
          slug: true,
          summary: true,
          content: true,
          url: true,
          author: true,
          coverUrl: true,
          bookId: true,
          narrationEnabled: true,
          order: true,
        },
      }),
      null,
      `admin content editor ${contentId}`
    ),
    prisma.book.findMany({
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        slug: true,
      },
    }),
  ]);

  if (!content) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <section className="surface-card p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-landing-accent">Content editor</p>
        <h1 className="mt-2 font-playfair text-3xl text-landing-text sm:text-4xl">{content.title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-landing-text-muted sm:text-[15px]">
          Update publishing details, donor access, page placement, and narration settings for this content item. Videos open on their own watch page, never expose narration, and can use direct uploads or hosted platforms while staying inside the OMR watch flow.
        </p>
      </section>

      <ContentNarrationStudio contentId={content.id} />
      <ContentEditorForm mode="edit" initialContent={content} books={books} />
    </div>
  );
}
