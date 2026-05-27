import { authOptions } from "@/lib/auth";
import { getContentNarrationTranscript, hasNarratableContent } from "@/lib/content";
import {
  buildContentNarrationGenerationRequirements,
  queueContentNarrationGeneration,
} from "@/lib/content-narration-jobs";
import {
  getContentNarrationSourceHash,
  getContentNarrationSyncSummary,
  hasTrackedContentNarrationSourceHash,
  isContentNarrationCurrent,
} from "@/lib/content-narration-sync";
import {
  GEMINI_TTS_MODELS,
  GEMINI_TTS_VOICES,
  getDefaultGeminiTtsModel,
  getDefaultGeminiTtsVoice,
  getGeminiModelFromProvider,
  getGeminiVoiceOptionName,
  isGeminiTtsConfigured,
  synthesizeGeminiSpeech,
} from "@/lib/gemini-tts";
import { toNarrationObjectStorageProvider } from "@/lib/narration";
import { getNarrationStorageConfig, getNarrationStorageProvider, getNarrationStorageProviderLabel } from "@/lib/narration-storage";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

export const runtime = "nodejs";

const narrationActionSchema = z.object({
  action: z.enum(["generate", "sample", "set-default"]).default("generate"),
});

const generationRequestSchema = z.object({
  action: z.literal("generate").optional().default("generate"),
  voiceName: z.string().trim().min(1),
  model: z.string().trim().min(1).optional().nullable(),
  languageCode: z.string().trim().min(1).optional().nullable(),
  stylePrompt: z.string().trim().max(5000).optional().nullable(),
  activateAsDefault: z.boolean().optional().default(true),
});

const sampleRequestSchema = z.object({
  action: z.literal("sample"),
  voiceName: z.string().trim().min(1),
  model: z.string().trim().min(1).optional().nullable(),
  languageCode: z.string().trim().min(1).optional().nullable(),
  stylePrompt: z.string().trim().max(5000).optional().nullable(),
  sampleText: z.string().trim().min(1).max(1600),
});

const setDefaultRequestSchema = z.object({
  action: z.literal("set-default"),
  narrationId: z.string().trim().min(1),
});

const contentNarrationSelect = {
  id: true,
  status: true,
  active: true,
  storageProvider: true,
  audioObjectKey: true,
  audioMimeType: true,
  durationMs: true,
  readyAt: true,
  sourceHash: true,
  errorMessage: true,
  createdAt: true,
  updatedAt: true,
  voice: {
    select: {
      id: true,
      name: true,
      slug: true,
      provider: true,
      language: true,
    },
  },
} as const;

function isAdminSession(session: Session | null) {
  return session?.user?.role === "ADMIN";
}

function formatNarrationForAdmin(narration: {
  id: string;
  status: string;
  active: boolean;
  storageProvider: string;
  audioObjectKey: string | null;
  audioMimeType: string;
  durationMs: number | null;
  readyAt: Date | null;
  sourceHash: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  voice: {
    id: string;
    name: string;
    slug: string;
    provider: string;
    language: string;
  };
}, currentSourceHash: string, hasTrackedSourceHash: boolean) {
  const optionName = getGeminiVoiceOptionName(narration.voice.name) || narration.voice.name;
  const isCurrent = isContentNarrationCurrent(narration, {
    currentSourceHash,
    hasTrackedSourceHash,
  });

  return {
    id: narration.id,
    status: narration.status,
    active: narration.active,
    storageProvider: toNarrationObjectStorageProvider(
      narration.storageProvider as "S3" | "R2" | "B2" | "LOCAL"
    ),
    audioObjectKey: narration.audioObjectKey,
    audioMimeType: narration.audioMimeType,
    durationMs: narration.durationMs,
    readyAt: narration.readyAt?.toISOString() || null,
    isCurrent,
    isStale: !isCurrent,
    errorMessage: narration.errorMessage,
    createdAt: narration.createdAt.toISOString(),
    updatedAt: narration.updatedAt.toISOString(),
    voice: {
      ...narration.voice,
      optionName,
      model: getGeminiModelFromProvider(narration.voice.provider),
    },
  };
}

async function getContentNarrationSummary(contentId: string) {
  return prisma.supplementaryContent.findUnique({
    where: { id: contentId },
    select: {
      id: true,
      title: true,
      slug: true,
      type: true,
      status: true,
      summary: true,
      content: true,
      author: true,
      narrationEnabled: true,
      narrationSourceHash: true,
      narrations: {
        orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
        take: 50,
        select: contentNarrationSelect,
      },
    },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ contentId: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { contentId } = await params;
  const content = await getContentNarrationSummary(contentId);

  if (!content) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  const storageProvider = getNarrationStorageProvider();
  const storageConfigured = Boolean(getNarrationStorageConfig(storageProvider));
  const geminiConfigured = isGeminiTtsConfigured();
  const transcript = getContentNarrationTranscript(content);
  const isVideoContent = content.type === "VIDEO";
  const missingRequirements = isVideoContent
    ? ["Video content uses the in-library player and does not support narration generation."]
    : buildContentNarrationGenerationRequirements({
    hasText: hasNarratableContent(content),
    geminiConfigured,
    storageConfigured,
  });
  const currentSourceHash = getContentNarrationSourceHash(content);
  const hasTrackedSourceHash = hasTrackedContentNarrationSourceHash(content);
  const syncSummary = getContentNarrationSyncSummary({
    currentSourceHash,
    hasTrackedSourceHash,
    narrations: content.narrations,
  });

  return NextResponse.json({
    content: {
      id: content.id,
      title: content.title,
      slug: content.slug,
      type: content.type,
      status: content.status,
      narrationEnabled: isVideoContent ? false : content.narrationEnabled,
      transcriptCharacterCount: transcript.length,
      narrationSyncStatus: syncSummary.syncState,
      narrationSyncMessage: syncSummary.message,
      hasTrackedSourceHash: syncSummary.hasTrackedSourceHash,
      syncedReadyVoiceCount: syncSummary.currentReadyCount,
      staleReadyVoiceCount: syncSummary.staleReadyCount,
    },
    gemini: {
      configured: geminiConfigured,
      defaultModel: getDefaultGeminiTtsModel(),
      defaultVoiceName: getDefaultGeminiTtsVoice(),
      models: GEMINI_TTS_MODELS,
      voices: GEMINI_TTS_VOICES,
    },
    storage: {
      provider: storageProvider,
      providerLabel: getNarrationStorageProviderLabel(storageProvider),
      configured: storageConfigured,
    },
    generation: {
      canGenerate: !isVideoContent && missingRequirements.length === 0,
      missingRequirements,
    },
    narrations: content.narrations.map((narration) =>
      formatNarrationForAdmin(narration, currentSourceHash, hasTrackedSourceHash)
    ),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ contentId: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { contentId } = await params;
  const storageProvider = getNarrationStorageProvider();
  const storageConfigured = Boolean(getNarrationStorageConfig(storageProvider));
  const geminiConfigured = isGeminiTtsConfigured();

  try {
    const rawPayload = await req.json();
    const { action } = narrationActionSchema.parse(rawPayload);

    const content = await prisma.supplementaryContent.findUnique({
      where: { id: contentId },
      select: {
        id: true,
        title: true,
        slug: true,
        type: true,
        status: true,
        summary: true,
        content: true,
        author: true,
        narrationSourceHash: true,
      },
    });

    if (!content) {
      return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }

    if (content.type === "VIDEO") {
      return NextResponse.json(
        { error: "Video content uses the in-library player and does not support narration generation." },
        { status: 400 }
      );
    }

    if (action === "sample") {
      const payload = sampleRequestSchema.parse(rawPayload);

      if (!geminiConfigured) {
        return NextResponse.json({ error: "Gemini TTS is not configured yet." }, { status: 400 });
      }

      const sampleAudio = await synthesizeGeminiSpeech({
        transcript: payload.sampleText,
        voiceName: payload.voiceName,
        model: payload.model,
        stylePrompt: payload.stylePrompt,
        languageCode: payload.languageCode,
      });
      const audioBase64 = sampleAudio.wavBuffer.toString("base64");

      return NextResponse.json({
        message: `Sample preview ready for ${getGeminiVoiceOptionName(payload.voiceName) || payload.voiceName}.`,
        voiceName: getGeminiVoiceOptionName(payload.voiceName) || payload.voiceName,
        model: payload.model?.trim() || getDefaultGeminiTtsModel(),
        durationMs: sampleAudio.durationMs,
        audioMimeType: sampleAudio.audioMimeType,
        audioBase64,
        audioDataUrl: `data:${sampleAudio.audioMimeType};base64,${audioBase64}`,
      });
    }

    if (action === "set-default") {
      const payload = setDefaultRequestSchema.parse(rawPayload);
      const narration = await prisma.contentNarration.findFirst({
        where: { id: payload.narrationId, contentId: content.id, status: "READY" },
        select: contentNarrationSelect,
      });

      if (!narration) {
        return NextResponse.json({ error: "Ready narration not found for this content item" }, { status: 404 });
      }

      const currentSourceHash = getContentNarrationSourceHash(content);
      const hasTrackedSourceHash = hasTrackedContentNarrationSourceHash(content);

      if (
        hasTrackedSourceHash
        && !isContentNarrationCurrent(narration, { currentSourceHash, hasTrackedSourceHash })
      ) {
        return NextResponse.json(
          { error: "This narration is outdated and must be re-synced before it can be published as default." },
          { status: 409 }
        );
      }

      const finalNarration = await prisma.$transaction(async (tx) => {
        await tx.contentNarration.updateMany({
          where: { contentId: content.id, NOT: { id: narration.id } },
          data: { active: false },
        });

        await tx.contentNarration.update({
          where: { id: narration.id },
          data: { active: true },
        });

        await tx.supplementaryContent.update({
          where: { id: content.id },
          data: { narrationEnabled: true },
        });

        return tx.contentNarration.findUniqueOrThrow({
          where: { id: narration.id },
          select: contentNarrationSelect,
        });
      });

      return NextResponse.json({
        message: `${getGeminiVoiceOptionName(finalNarration.voice.name) || finalNarration.voice.name} is now the default narration voice for “${content.title}”.`,
        narration: formatNarrationForAdmin(finalNarration, currentSourceHash, hasTrackedSourceHash),
      });
    }

    const payload = generationRequestSchema.parse(rawPayload);
    const missingRequirements = buildContentNarrationGenerationRequirements({
      hasText: hasNarratableContent(content),
      geminiConfigured,
      storageConfigured,
    });

    if (missingRequirements.length > 0) {
      return NextResponse.json({ error: "Narration generation is not ready to run", missingRequirements }, { status: 400 });
    }
    const queued = await queueContentNarrationGeneration({
      contentId: content.id,
      voiceName: payload.voiceName,
      model: payload.model,
      languageCode: payload.languageCode,
      stylePrompt: payload.stylePrompt,
      activateAsDefault: payload.activateAsDefault,
      ensureNarrationEnabled: true,
    });

    return NextResponse.json(
      {
        message: `Narration generation has started for “${content.title}”.`,
        narrationId: queued.narrationId,
        status: queued.status,
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid content narration request", issues: error.flatten() }, { status: 400 });
    }

    console.error("Admin content narration error:", error);
    return NextResponse.json(
      { error: "Failed to process content narration request", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
