import { authOptions } from "@/lib/auth";
import { getDonorAccessState, getDonorFeatureAccessState } from "@/lib/book-access";
import {
  normalizeNarrationObjectKey,
  resolveLocalNarrationObjectFilePath,
} from "@/lib/narration-storage";
import { prisma } from "@/lib/prisma";
import { createReadStream } from "fs";
import fs from "fs/promises";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";

export const runtime = "nodejs";

type NarrationObjectLookupResult =
  | {
      resourceType: "book";
      contentType: string;
      book: {
        id: string;
        status: string;
        donorOnly: boolean;
      };
    }
  | {
      resourceType: "content";
      contentType: string;
      content: {
        id: string;
        status: string;
      };
    };

function inferContentTypeFromObjectKey(objectKey: string) {
  if (objectKey.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }

  if (objectKey.endsWith(".wav")) {
    return "audio/wav";
  }

  if (objectKey.endsWith(".mp3")) {
    return "audio/mpeg";
  }

  if (objectKey.endsWith(".m4a")) {
    return "audio/mp4";
  }

  if (objectKey.endsWith(".ogg")) {
    return "audio/ogg";
  }

  return "application/octet-stream";
}

async function findNarrationObject(objectKey: string): Promise<NarrationObjectLookupResult | null> {
  const chapter = await prisma.narrationChapter.findFirst({
    where: { audioObjectKey: objectKey },
    select: {
      audioMimeType: true,
      narration: {
        select: {
          book: {
            select: {
              id: true,
              status: true,
              donorOnly: true,
            },
          },
        },
      },
    },
  });

  if (chapter) {
    return {
      resourceType: "book",
      contentType: chapter.audioMimeType || inferContentTypeFromObjectKey(objectKey),
      book: chapter.narration.book,
    };
  }

  const contentNarration = await prisma.contentNarration.findFirst({
    where: { audioObjectKey: objectKey },
    select: {
      audioMimeType: true,
      content: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (contentNarration) {
    return {
      resourceType: "content",
      contentType: contentNarration.audioMimeType || inferContentTypeFromObjectKey(objectKey),
      content: contentNarration.content,
    };
  }

  const manifest = await prisma.bookNarration.findFirst({
    where: { manifestObjectKey: objectKey },
    select: {
      book: {
        select: {
          id: true,
          status: true,
          donorOnly: true,
        },
      },
    },
  });

  if (!manifest) {
    return null;
  }

  return {
    resourceType: "book",
    contentType: inferContentTypeFromObjectKey(objectKey),
    book: manifest.book,
  };
}

async function createFileResponse(
  filePath: string,
  contentType: string,
  rangeHeader: string | null
) {
  const stats = await fs.stat(filePath);
  const isRangeRequest = Boolean(rangeHeader?.startsWith("bytes="));

  if (!isRangeRequest) {
    const stream = createReadStream(filePath);

    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=300",
        "Content-Length": String(stats.size),
        "Content-Type": contentType,
      },
    });
  }

  const rangeValue = rangeHeader!.replace(/bytes=/i, "").trim();
  const [rawStart, rawEnd] = rangeValue.split("-", 2);
  const parsedStart = rawStart ? Number.parseInt(rawStart, 10) : Number.NaN;
  const parsedEnd = rawEnd ? Number.parseInt(rawEnd, 10) : Number.NaN;
  const isSuffixRange = !rawStart && rawEnd;
  const start = isSuffixRange
    ? Math.max(stats.size - parsedEnd, 0)
    : Number.isFinite(parsedStart)
      ? parsedStart
      : 0;
  const end = Number.isFinite(parsedEnd) && !isSuffixRange
    ? parsedEnd
    : stats.size - 1;

  if (
    !Number.isFinite(start)
    || !Number.isFinite(end)
    || start < 0
    || end < start
    || start >= stats.size
  ) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes */${stats.size}`,
      },
    });
  }

  const boundedEnd = Math.min(end, stats.size - 1);
  const stream = createReadStream(filePath, { start, end: boundedEnd });

  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    status: 206,
    headers: {
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=300",
      "Content-Length": String(boundedEnd - start + 1),
      "Content-Range": `bytes ${start}-${boundedEnd}/${stats.size}`,
      "Content-Type": contentType,
    },
  });
}

export async function GET(req: NextRequest) {
  const requestedProvider = req.nextUrl.searchParams.get("provider")?.trim().toLowerCase();

  if (requestedProvider && requestedProvider !== "local") {
    return new NextResponse("Unsupported narration storage provider.", { status: 400 });
  }

  const rawObjectKey = req.nextUrl.searchParams.get("key");

  if (!rawObjectKey) {
    return new NextResponse("Missing narration object key.", { status: 400 });
  }

  let objectKey: string;

  try {
    objectKey = normalizeNarrationObjectKey(rawObjectKey);
  } catch (error) {
    return new NextResponse(
      error instanceof Error ? error.message : "Invalid narration object key.",
      { status: 400 }
    );
  }

  const narrationObject = await findNarrationObject(objectKey);

  if (!narrationObject) {
    return new NextResponse("Narration object not found.", { status: 404 });
  }

  const session = await getServerSession(authOptions);
  if (narrationObject.resourceType === "book") {
    const featureAccess = await getDonorFeatureAccessState(narrationObject.book, session?.user);

    if (!featureAccess.hasBookAccess) {
      return new NextResponse("Narration object not found.", {
        status: featureAccess.isPublished ? 403 : 404,
      });
    }

    if (!featureAccess.hasAccess) {
      return new NextResponse("Narration access is restricted.", { status: 403 });
    }
  } else {
    const donorAccess = await getDonorAccessState(session?.user);
    const isPublished = narrationObject.content.status === "PUBLISHED";

    if (!isPublished && !donorAccess.isPrivileged) {
      return new NextResponse("Narration object not found.", { status: 404 });
    }

    if (!donorAccess.hasAccess) {
      return new NextResponse("Narration access is restricted.", { status: 403 });
    }
  }

  try {
    const filePath = resolveLocalNarrationObjectFilePath(objectKey, "local");
    return await createFileResponse(filePath, narrationObject.contentType, req.headers.get("range"));
  } catch (error) {
    const errorCode = typeof error === "object" && error && "code" in error
      ? String(error.code)
      : null;

    if (errorCode === "ENOENT") {
      return new NextResponse("Narration file not found.", { status: 404 });
    }

    console.error("Local narration object route error:", error);

    return new NextResponse("Failed to stream narration object.", { status: 500 });
  }
}
