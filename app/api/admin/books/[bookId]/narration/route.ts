import { authOptions } from "@/lib/auth";
import {
  buildBookNarrationGenerationRequirements,
  ensureBookNarrationBackgroundProcessing,
  queueBookNarrationGeneration,
  retryFailedNarrationChapters,
} from "@/lib/book-narration-jobs";
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
import { toNarrationObjectStorageProvider, PersistedNarrationStorageProvider } from "@/lib/narration";
import {
  createPresignedNarrationObjectUrl,
  getNarrationStorageConfig,
  getNarrationStorageProvider,
  getNarrationStorageProviderLabel,
} from "@/lib/narration-storage";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

export const runtime = "nodejs";

const narrationActionSchema = z.object({
  action: z.enum(["generate", "sample", "set-default", "retry-failed"]).default("generate"),
});

const generationRequestSchema = z.object({
  action: z.literal("generate").optional().default("generate"),
  voiceName: z.string().trim().min(1),
  model: z.string().trim().min(1).optional().nullable(),
  languageCode: z.string().trim().min(1).optional().nullable(),
  stylePrompt: z.string().trim().max(5000).optional().nullable(),
  maxChapters: z.preprocess(
    (value) => {
      if (value === "" || value == null) {
        return null;
      }

      return Number(value);
    },
    z.number().int().positive().max(200).nullable()
  ).optional().default(null),
  chapterIndexes: z.array(z.number().int().nonnegative()).optional().nullable(),
  activateAsDefault: z.boolean().optional().default(false),
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

const retryFailedRequestSchema = z.object({
  action: z.literal("retry-failed"),
  narrationId: z.string().trim().min(1),
});

const adminNarrationSelect = {
  id: true,
  status: true,
  active: true,
  storageProvider: true,
  totalDurationMs: true,
  totalChapters: true,
  readyAt: true,
  errorMessage: true,
  manifestObjectKey: true,
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
  chapters: {
    orderBy: { chapterIndex: "asc" as const },
    select: {
      id: true,
      chapterIndex: true,
      title: true,
      spineHref: true,
      status: true,
      durationMs: true,
      audioObjectKey: true,
    },
  },
} as const;

function isAdminSession(session: Session | null) {
  return Boolean(session?.user && "role" in session.user && session.user.role === "ADMIN");
}

async function formatNarrationForAdmin(
  narration: {
    id: string;
    status: string;
    active: boolean;
    storageProvider: string;
    totalDurationMs: number | null;
    totalChapters: number;
    readyAt: Date | null;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
    manifestObjectKey: string | null;
    voice: {
      id: string;
      name: string;
      slug: string;
      provider: string;
      language: string;
    };
    chapters: Array<{
      id: string;
      chapterIndex: number;
      title: string | null;
      spineHref: string;
      status: string;
      durationMs: number | null;
      audioObjectKey: string | null;
    }>;
  }
) {
  const optionName = getGeminiVoiceOptionName(narration.voice.name) || narration.voice.name;
  const resolvedProvider = toNarrationObjectStorageProvider(
    narration.storageProvider as PersistedNarrationStorageProvider
  );

  const formattedChapters = await Promise.all(
    narration.chapters.map(async (chapter) => ({
      id: chapter.id,
      chapterIndex: chapter.chapterIndex,
      title: chapter.title,
      spineHref: chapter.spineHref,
      status: chapter.status,
      durationMs: chapter.durationMs,
      audioUrl: chapter.status === "READY" && chapter.audioObjectKey
        ? await createPresignedNarrationObjectUrl(chapter.audioObjectKey, resolvedProvider)
        : null,
    }))
  );

  return {
    id: narration.id,
    status: narration.status,
    active: narration.active,
    storageProvider: resolvedProvider,
    totalDurationMs: narration.totalDurationMs,
    totalChapters: narration.totalChapters,
    readyAt: narration.readyAt?.toISOString() || null,
    errorMessage: narration.errorMessage,
    manifestObjectKey: narration.manifestObjectKey,
    createdAt: narration.createdAt.toISOString(),
    updatedAt: narration.updatedAt.toISOString(),
    voice: {
      ...narration.voice,
      optionName,
      model: getGeminiModelFromProvider(narration.voice.provider),
    },
    chapters: formattedChapters,
  };
}

async function getBookNarrationSummary(bookId: string) {
  return prisma.book.findUnique({
    where: { id: bookId },
    select: {
      id: true,
      title: true,
      slug: true,
      donorOnly: true,
      status: true,
      coverUrl: true,
      epubFile: {
        select: {
          id: true,
          fileUrl: true,
          mimeType: true,
          createdAt: true,
        },
      },
      narrations: {
        orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
        take: 50,
        select: adminNarrationSelect,
      },
    },
  });
}

async function getNarrationForAdmin(bookId: string, narrationId: string) {
  return prisma.bookNarration.findFirst({
    where: { id: narrationId, bookId },
    select: adminNarrationSelect,
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookId } = await params;
  const book = await getBookNarrationSummary(bookId);

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const storageProvider = await getNarrationStorageProvider();
  const storageConfigured = Boolean(await getNarrationStorageConfig(storageProvider));
  const geminiConfigured = isGeminiTtsConfigured();
  const missingRequirements = buildBookNarrationGenerationRequirements({
    hasEpubFile: Boolean(book.epubFile?.fileUrl),
    geminiConfigured,
    storageConfigured,
  });

  if (book.narrations.some((narration) => narration.status === "PENDING" || narration.status === "PROCESSING")) {
    ensureBookNarrationBackgroundProcessing(book.id);
  }

  return NextResponse.json({
    book: {
      id: book.id,
      title: book.title,
      slug: book.slug,
      donorOnly: book.donorOnly,
      status: book.status,
      coverUrl: book.coverUrl,
      hasEpubFile: Boolean(book.epubFile?.fileUrl),
      epubFileUploadedAt: book.epubFile?.createdAt.toISOString() || null,
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
      canGenerate: missingRequirements.length === 0,
      missingRequirements,
    },
    narrations: await Promise.all(book.narrations.map(formatNarrationForAdmin)),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookId } = await params;
  const storageProvider = await getNarrationStorageProvider();
  const storageConfigured = Boolean(await getNarrationStorageConfig(storageProvider));
  const geminiConfigured = isGeminiTtsConfigured();

  try {
    const rawPayload = await req.json();
    const { action } = narrationActionSchema.parse(rawPayload);

    if (action === "sample") {
      const payload = sampleRequestSchema.parse(rawPayload);

      if (!geminiConfigured) {
        return NextResponse.json(
          { error: "Gemini TTS is not configured yet." },
          { status: 400 }
        );
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

    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: {
        id: true,
        title: true,
        slug: true,
        epubFile: {
          select: {
            fileUrl: true,
          },
        },
      },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    if (action === "set-default") {
      const payload = setDefaultRequestSchema.parse(rawPayload);
      const narration = await getNarrationForAdmin(bookId, payload.narrationId);

      if (!narration) {
        return NextResponse.json({ error: "Narration not found for this book" }, { status: 404 });
      }

      const finalNarration = await prisma.$transaction(async (tx) => {
        await tx.bookNarration.updateMany({
          where: {
            bookId,
            NOT: { id: narration.id },
          },
          data: {
            active: false,
          },
        });

        await tx.bookNarration.update({
          where: { id: narration.id },
          data: {
            active: true,
          },
        });

        return tx.bookNarration.findUniqueOrThrow({
          where: { id: narration.id },
          select: adminNarrationSelect,
        });
      });

      return NextResponse.json({
        message: `${getGeminiVoiceOptionName(finalNarration.voice.name) || finalNarration.voice.name} is now the default narration voice for “${book.title}”.`,
        narration: await formatNarrationForAdmin(finalNarration),
      });
    }

    if (action === "retry-failed") {
      const payload = retryFailedRequestSchema.parse(rawPayload);

      const result = await retryFailedNarrationChapters({
        bookId,
        narrationId: payload.narrationId,
      });

      return NextResponse.json({
        message: `Retry queued for ${result.retriedChapterCount} failed chapter(s) of "${book.title}".`,
        narrationId: result.narrationId,
        retriedChapterCount: result.retriedChapterCount,
      });
    }

    const payload = generationRequestSchema.parse(rawPayload);
    const missingRequirements = buildBookNarrationGenerationRequirements({
      hasEpubFile: Boolean(book.epubFile?.fileUrl),
      geminiConfigured,
      storageConfigured,
    });

    if (missingRequirements.length > 0) {
      return NextResponse.json(
        {
          error: "Narration generation is not ready to run",
          missingRequirements,
        },
        { status: 400 }
      );
    }

    const currentActiveNarration = await prisma.bookNarration.findFirst({
      where: {
        bookId: book.id,
        active: true,
        status: "READY",
      },
      select: { id: true },
    });

    const queuedNarration = await queueBookNarrationGeneration({
      bookId: book.id,
      voiceName: payload.voiceName,
      model: payload.model,
      languageCode: payload.languageCode,
      stylePrompt: payload.stylePrompt,
      maxChapters: payload.maxChapters,
      chapterIndexes: payload.chapterIndexes,
      activateAsDefault: Boolean(payload.activateAsDefault || !currentActiveNarration),
    });

    return NextResponse.json(
      {
        message: `Narration chapter queue has started for "${book.title}". The studio will refresh as chapters finish in the background.`,
        narrationId: queuedNarration.narrationId,
        status: queuedNarration.status,
        queuedChapterCount: queuedNarration.queuedChapterCount,
      },
      { status: 202 }
    );

  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid narration studio request",
          issues: error.flatten(),
        },
        { status: 400 }
      );
    }

    console.error("Admin Gemini narration generation error:", error);

    return NextResponse.json(
      {
        error: "Failed to process the narration studio request",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
