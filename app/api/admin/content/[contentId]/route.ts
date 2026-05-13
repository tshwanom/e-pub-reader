import { authOptions } from "@/lib/auth";
import { CONTENT_STATUSES, CONTENT_TYPES, normalizeNullableText, slugifyContentTitle } from "@/lib/content";
import {
  backfillContentNarrationSourceHashes,
  scheduleContentNarrationAutoSync,
} from "@/lib/content-narration-jobs";
import { buildContentNarrationSourceHash } from "@/lib/content-narration-sync";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";

export const dynamic = "force-dynamic";

const contentPayloadSchema = z.object({
  type: z.enum(CONTENT_TYPES),
  status: z.enum(CONTENT_STATUSES),
  title: z.string().trim().min(1),
  slug: z.preprocess(normalizeNullableText, z.string().nullable()).optional().default(null),
  summary: z.preprocess(normalizeNullableText, z.string().nullable()).optional().default(null),
  content: z.preprocess(normalizeNullableText, z.string().nullable()).optional().default(null),
  url: z.preprocess(normalizeNullableText, z.string().nullable()).optional().default(null),
  author: z.preprocess(normalizeNullableText, z.string().nullable()).optional().default(null),
  coverUrl: z.preprocess(normalizeNullableText, z.string().nullable()).optional().default(null),
  bookId: z.preprocess(normalizeNullableText, z.string().nullable()).optional().default(null),
  narrationEnabled: z.boolean().optional().default(false),
  order: z.coerce.number().int().optional().default(0),
});

function isAdmin(session: Session | null) {
  return session?.user?.role === "ADMIN";
}

async function buildUniqueContentSlug(contentId: string, title: string, requestedSlug?: string | null) {
  const baseSlug = slugifyContentTitle(requestedSlug || title);

  if (!baseSlug) {
    return null;
  }

  let candidate = baseSlug;
  let suffix = 2;

  while (true) {
    const existing = await prisma.supplementaryContent.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!existing || existing.id === contentId) {
      return candidate;
    }

    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { contentId } = await params;
  const content = await prisma.supplementaryContent.findUnique({
    where: { id: contentId },
    include: {
      book: {
        select: {
          id: true,
          title: true,
          slug: true,
          coverUrl: true,
        },
      },
      narrations: {
        orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          status: true,
          active: true,
          durationMs: true,
          readyAt: true,
          errorMessage: true,
          voice: {
            select: {
              id: true,
              name: true,
              slug: true,
              provider: true,
              language: true,
            },
          },
        },
      },
    },
  });

  if (!content) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  return NextResponse.json(content);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { contentId } = await params;
    const current = await prisma.supplementaryContent.findUnique({
      where: { id: contentId },
      select: {
        id: true,
        type: true,
        title: true,
        summary: true,
        content: true,
        author: true,
        status: true,
        publishedAt: true,
        narrationSourceHash: true,
      },
    });

    if (!current) {
      return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }

    const payload = contentPayloadSchema.parse(await req.json());
    const slug = await buildUniqueContentSlug(contentId, payload.title, payload.slug);
    const currentNarrationSourceHash = buildContentNarrationSourceHash(current);
    const nextNarrationSourceHash = buildContentNarrationSourceHash({
      type: payload.type,
      title: payload.title,
      summary: payload.summary,
      content: payload.content,
      author: payload.author,
    });
    const publishedAt = payload.status === "PUBLISHED"
      ? current.publishedAt || new Date()
      : payload.status === "ARCHIVED"
        ? current.publishedAt
        : null;

    const updated = await prisma.supplementaryContent.update({
      where: { id: contentId },
      data: {
        type: payload.type,
        status: payload.status,
        title: payload.title,
        slug,
        summary: payload.summary,
        content: payload.content,
        url: payload.url,
        author: payload.author,
        coverUrl: payload.coverUrl,
        bookId: payload.bookId,
        narrationEnabled: payload.narrationEnabled,
        narrationSourceHash: nextNarrationSourceHash,
        order: payload.order,
        publishedAt,
      },
    });

    if (!current.narrationSourceHash && currentNarrationSourceHash === nextNarrationSourceHash) {
      void backfillContentNarrationSourceHashes(contentId, nextNarrationSourceHash).catch((syncError) => {
        console.error("Legacy content narration hash backfill failed:", syncError);
      });
    } else if (currentNarrationSourceHash !== nextNarrationSourceHash) {
      void scheduleContentNarrationAutoSync(contentId).catch((syncError) => {
        console.error("Content narration auto-sync failed:", syncError);
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid content payload", issues: error.flatten() }, { status: 400 });
    }

    console.error("Update content error:", error);
    return NextResponse.json(
      { error: "Failed to update content", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { contentId } = await params;

  try {
    await prisma.supplementaryContent.delete({ where: { id: contentId } });
    return NextResponse.json({ message: "Content deleted" });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete content" }, { status: 500 });
  }
}
