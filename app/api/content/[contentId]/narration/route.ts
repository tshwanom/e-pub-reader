import { createPresignedNarrationObjectUrl, getNarrationStorageProvider, getNarrationStorageProviderLabel, isNarrationStorageConfigured } from "@/lib/narration-storage";
import {
  getContentNarrationSourceHash,
  getContentNarrationSyncSummary,
  hasTrackedContentNarrationSourceHash,
  isContentNarrationCurrent,
} from "@/lib/content-narration-sync";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function toObjectStorageProvider(provider: string) {
  switch (provider) {
    case "LOCAL":
      return "local" as const;
    case "R2":
      return "r2" as const;
    case "B2":
      return "b2" as const;
    case "S3":
    default:
      return "s3" as const;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ contentId: string }> }
) {
  const { contentId } = await params;
  const activeStorageProvider = getNarrationStorageProvider();

  const content = await prisma.supplementaryContent.findUnique({
    where: { id: contentId },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      summary: true,
      content: true,
      author: true,
      narrationEnabled: true,
      narrationSourceHash: true,
      narrations: {
        orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          status: true,
          active: true,
          storageProvider: true,
          audioObjectKey: true,
          audioMimeType: true,
          durationMs: true,
          sourceHash: true,
          updatedAt: true,
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

  if (!content || content.status !== "PUBLISHED") {
    return NextResponse.json({ available: false, reason: "not-found", message: "Content not found." }, { status: 404 });
  }

  if (!content.narrationEnabled) {
    return NextResponse.json({
      available: false,
      reason: "disabled",
      message: `Narration is not enabled for “${content.title}” yet.`,
      voices: [],
    });
  }

  const currentSourceHash = getContentNarrationSourceHash(content);
  const hasTrackedSourceHash = hasTrackedContentNarrationSourceHash(content);
  const syncSummary = getContentNarrationSyncSummary({
    currentSourceHash,
    hasTrackedSourceHash,
    narrations: content.narrations,
  });

  const readyNarrations = content.narrations.filter(
    (narration) =>
      narration.status === "READY"
      && Boolean(narration.audioObjectKey)
      && isContentNarrationCurrent(narration, { currentSourceHash, hasTrackedSourceHash })
  );

  if (readyNarrations.length === 0) {
    const reason = syncSummary.syncState === "FAILED"
      ? "failed"
      : syncSummary.syncState === "PROCESSING"
        ? "processing"
        : syncSummary.syncState === "OUT_OF_SYNC"
          ? "stale"
          : "not-generated";

    return NextResponse.json({
      available: false,
      reason,
      message: syncSummary.message,
      voices: [],
      storageProvider: activeStorageProvider,
    });
  }

  const voices = await Promise.all(
    readyNarrations.map(async (narration) => {
      const storageProvider = toObjectStorageProvider(narration.storageProvider);

      if (!isNarrationStorageConfigured(storageProvider)) {
        return null;
      }

      return {
        narrationId: narration.id,
        active: narration.active,
        durationMs: narration.durationMs,
        audioMimeType: narration.audioMimeType,
        audioUrl: await createPresignedNarrationObjectUrl(narration.audioObjectKey!, storageProvider),
        voice: narration.voice,
      };
    })
  );

  const availableVoices = voices.filter(Boolean);

  if (availableVoices.length === 0) {
    return NextResponse.json(
      {
        available: false,
        reason: "storage-not-configured",
        message: `${getNarrationStorageProviderLabel(activeStorageProvider)} narration storage is not configured yet.`,
        voices: [],
      },
      { status: 503 }
    );
  }

  const defaultVoice = availableVoices.find((voice) => voice?.active) ?? availableVoices[0];

  return NextResponse.json({
    available: true,
    reason: "ready",
    message: availableVoices.length > 1
      ? `Narration for “${content.title}” is ready in ${availableVoices.length} synced voices.`
      : `Narration for “${content.title}” is ready to play.`,
    defaultVoiceSlug: defaultVoice?.voice.slug ?? null,
    voices: availableVoices,
  });
}
