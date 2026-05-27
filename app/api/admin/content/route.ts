import { authOptions } from "@/lib/auth";
import { BOOK_DONOR_ACCESS_LEVEL_VALUES } from "@/lib/book-access-config";
import {
  CONTENT_FEATURE_UNAVAILABLE_MESSAGE,
  CONTENT_STATUSES,
  CONTENT_TYPES,
  isContentFeatureUnavailableError,
  normalizeNullableText,
  slugifyContentTitle,
} from "@/lib/content";
import { buildContentNarrationSourceHash } from "@/lib/content-narration-sync";
import { prisma } from "@/lib/prisma";
import { resolveVideoCoverUrl } from "@/lib/video-source";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";

export const dynamic = "force-dynamic";

const contentPayloadSchema = z.object({
  type: z.enum(CONTENT_TYPES).default("ARTICLE"),
  status: z.enum(CONTENT_STATUSES).default("DRAFT"),
  title: z.string().trim().min(1),
  slug: z.preprocess(normalizeNullableText, z.string().nullable()).optional().default(null),
  summary: z.preprocess(normalizeNullableText, z.string().nullable()).optional().default(null),
  content: z.preprocess(normalizeNullableText, z.string().nullable()).optional().default(null),
  url: z.preprocess(normalizeNullableText, z.string().nullable()).optional().default(null),
  author: z.preprocess(normalizeNullableText, z.string().nullable()).optional().default(null),
  coverUrl: z.preprocess(normalizeNullableText, z.string().nullable()).optional().default(null),
  bookId: z.preprocess(normalizeNullableText, z.string().nullable()).optional().default(null),
  donorAccessLevel: z.enum(BOOK_DONOR_ACCESS_LEVEL_VALUES).optional().default("PUBLIC"),
  narrationEnabled: z.boolean().optional().default(false),
  order: z.coerce.number().int().optional().default(0),
});

function isAdmin(session: Session | null) {
  return session?.user?.role === "ADMIN";
}

function createContentFeatureUnavailableResponse() {
  return NextResponse.json({ error: CONTENT_FEATURE_UNAVAILABLE_MESSAGE }, { status: 503 });
}

async function buildUniqueContentSlug(title: string, requestedSlug?: string | null) {
  const baseSlug = slugifyContentTitle(requestedSlug || title);

  if (!baseSlug) {
    return null;
  }

  let candidate = baseSlug;
  let suffix = 2;

  while (await prisma.supplementaryContent.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const content = await prisma.supplementaryContent.findMany({
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
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
    });

    return NextResponse.json({ content });
  } catch (error) {
    if (isContentFeatureUnavailableError(error)) {
      console.error("List content error (content feature unavailable):", error);
      return createContentFeatureUnavailableResponse();
    }

    throw error;
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = contentPayloadSchema.parse(await req.json());
    const slug = await buildUniqueContentSlug(payload.title, payload.slug);
    const publishedAt = payload.status === "PUBLISHED" ? new Date() : null;
    const narrationEnabled = payload.type === "VIDEO" ? false : payload.narrationEnabled;
    const coverUrl = await resolveVideoCoverUrl({
      type: payload.type,
      url: payload.url,
      coverUrl: payload.coverUrl,
    });
    const narrationSourceHash = buildContentNarrationSourceHash({
      type: payload.type,
      title: payload.title,
      summary: payload.summary,
      content: payload.content,
      author: payload.author,
    });

    const created = await prisma.supplementaryContent.create({
      data: {
        type: payload.type,
        status: payload.status,
        title: payload.title,
        slug,
        summary: payload.summary,
        content: payload.content,
        url: payload.url,
        author: payload.author,
        coverUrl,
        bookId: payload.bookId,
        donorOnly: payload.donorAccessLevel !== "PUBLIC",
        donorAccessLevel: payload.donorAccessLevel,
        narrationEnabled,
        narrationSourceHash,
        order: payload.order,
        publishedAt,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid content payload", issues: error.flatten() }, { status: 400 });
    }

    if (isContentFeatureUnavailableError(error)) {
      console.error("Create content error (content feature unavailable):", error);
      return createContentFeatureUnavailableResponse();
    }

    console.error("Create content error:", error);
    return NextResponse.json(
      { error: "Failed to create content", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
